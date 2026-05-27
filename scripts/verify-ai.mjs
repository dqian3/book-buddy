// Verifies the end-to-end AI chat pipeline against a local mock OpenAI-style
// server: prompt assembly, spoiler-aware retrieval/context injection, SSE
// streaming parse, and the streamed reply rendering into the chat UI.
import { createServer } from "node:http";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
let captured = null;

// Mock provider: capture the request, stream back a couple of SSE deltas.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};
const mock = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      captured = JSON.parse(body);
    } catch {
      captured = null;
    }
    res.writeHead(200, { "content-type": "text/event-stream", ...CORS });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "MOCK_REPLY: " } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "understood." } }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
});
await new Promise((r) => mock.listen(0, r));
const port = mock.address().port;

const results = [];
const ok = (name, cond, detail = "") => {
  results.push(!!cond);
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const persisted = {
  state: {
    provider: "openai",
    providerConfig: {
      claude: { apiKey: "", model: "claude-sonnet-4-6" },
      openai: { apiKey: "test-key", model: "mock", baseUrl: `http://localhost:${port}/v1` },
      ollama: { baseUrl: "http://localhost:11434", model: "qwen2.5" },
    },
    spoilerFree: true,
    explanationLanguage: "en",
  },
  version: 0,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 414, height: 820 } });
await page.addInitScript((data) => localStorage.setItem("bbb-settings", data), JSON.stringify(persisted));

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByText("射雕英雄传").first().click();
  await page.getByTestId("reader").waitFor({ timeout: 20000 });

  await page.getByRole("button", { name: "AI assistant" }).click();
  await page.getByPlaceholder(/Ask about/).fill("What does the storyteller talk about?");
  await page.keyboard.press("Enter");

  await page.getByText(/MOCK_REPLY/).waitFor({ timeout: 8000 });
  ok("Streamed reply renders in chat", true);

  ok("Request sent system prompt with book title", /射雕英雄传/.test(captured?.messages?.[0]?.content || ""), "system");
  ok("System prompt honors explanation language (English)", /English/.test(captured?.messages?.[0]?.content || ""));
  const lastUser = captured?.messages?.at(-1)?.content || "";
  ok("Context block injected before question", /<context>/.test(lastUser));
  ok("Spoiler-free instruction present", /Avoid spoilers/i.test(lastUser));
  ok("User question included", /storyteller/.test(lastUser));
  ok("Retrieved real book text as context", /\p{Script=Han}/u.test(lastUser.split("<context>")[1] || ""));
} catch (e) {
  ok("AI test completed without throwing", false, String(e).slice(0, 200));
} finally {
  await browser.close();
  mock.close();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
