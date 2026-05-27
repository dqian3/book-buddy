// HTML adapter. Walks the document body in order: headings (h1-h3) open a new
// section, paragraphs become paragraph blocks, <img> becomes an image block.
// Tuned to handle the bundled 射雕英雄传 export (h1 sections, p paragraphs,
// a stray &zwnj; anchor inside each chapter title) but generic for similar HTML.
import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { makeBuilder, finalizeSections, clean } from "./common.mjs";

export async function extractHtml(filePath, { copyAsset } = {}) {
  const raw = await readFile(filePath, "utf8");
  const $ = cheerio.load(raw);
  const b = makeBuilder();

  // Zero-width non-joiner (U+200C) is used as an anchor placeholder — strip it.
  const titleText = (el) => clean($(el).text().replace(/‌/g, ""));

  const body = $("body").length ? $("body") : $.root();
  body.find("h1, h2, h3, p, img").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      b.startSection(titleText(el));
    } else if (tag === "p") {
      b.addText("paragraph", $(el).text());
    } else if (tag === "img" && copyAsset) {
      const src = $(el).attr("src");
      if (src) {
        const rel = copyAsset(src);
        if (rel) b.addImage(rel, $(el).attr("alt") || "");
      }
    }
  });

  return finalizeSections(b.sections);
}
