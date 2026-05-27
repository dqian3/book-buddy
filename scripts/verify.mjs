// End-to-end smoke test driving the real app in headless Chromium.
// Usage: node scripts/verify.mjs   (dev server must be running on :5173)
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 414, height: 820 } }); // phone-ish
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: "networkidle" });

  // Library → open the book.
  await page.getByText("射雕英雄传").first().click();
  await page.getByTestId("reader").waitFor({ timeout: 20000 });
  ok("Book opens and reader renders", true);

  // Reader shows the first paragraph.
  const firstP = page.locator('[data-block-index]').first();
  await firstP.waitFor();
  const pText = (await firstP.innerText()).trim();
  ok("Chapter text rendered", pText.length > 20, `${pText.length} chars`);

  // Tap-to-define: click near the start of the first paragraph.
  const box = await firstP.boundingBox();
  await page.mouse.click(box.x + 12, box.y + 12);
  const popup = page.getByTestId("dict-popup");
  await popup.waitFor({ timeout: 5000 });
  const popupText = (await popup.innerText()).trim();
  ok("Dictionary popup appears on tap", popupText.length > 0);
  const headword = (await popup.locator(".font-reading").first().innerText()).trim();
  ok("Popup shows a Chinese headword", /\p{Script=Han}/u.test(headword), headword);
  ok("Popup shows pinyin or a definition", popupText.length > headword.length + 1);

  // Highlight span exists for the tapped word.
  ok("Tapped word is highlighted", (await page.locator(".word-active").count()) >= 1);

  // Close popup, test section navigation via TOC.
  await page.mouse.click(5, 400);
  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("button", { name: /第三回/ }).click();
  await page.waitForTimeout(300);
  const header = await page.locator("header").innerText();
  ok("TOC navigation switches chapter", /第三回/.test(header), header.replace(/\s+/g, " ").slice(0, 40));

  // Settings panel opens and shows provider selector.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText("AI assistant").first().waitFor();
  ok("Settings panel opens", true);
  await page.getByRole("button", { name: "Close" }).click();

  // AI panel opens with spoiler-free indicator.
  await page.getByRole("button", { name: "AI assistant" }).click();
  ok("AI chat panel opens", await page.getByText(/spoiler-free|full book/).first().isVisible());
  await page.getByRole("button", { name: "Close" }).click();

  // TTS API present in-browser (free, no API cost).
  const ttsSupported = await page.evaluate(() => "speechSynthesis" in window);
  ok("Browser text-to-speech is available", ttsSupported);

  ok("No uncaught console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  ok("Test run completed without throwing", false, String(e).slice(0, 200));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
