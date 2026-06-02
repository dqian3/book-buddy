// HTML adapter. Walks the document body in order: headings (h1-h3) open a new
// section, paragraphs become paragraph blocks, <img> becomes an image block.
// Heading text is passed through the profile's cleanHeading hook so any per-book
// export quirks (e.g. a stray anchor placeholder) stay out of this generic walk.
import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { makeBuilder, finalizeSections, clean } from "./common.mjs";
import base from "../profiles/base.mjs";

export async function extractHtml(filePath, { copyAsset, profile = base } = {}) {
  const raw = await readFile(filePath, "utf8");
  const $ = cheerio.load(raw);
  const b = makeBuilder();

  const body = $("body").length ? $("body") : $.root();
  body.find("h1, h2, h3, p, img").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      b.startSection(profile.cleanHeading(clean($(el).text())));
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
