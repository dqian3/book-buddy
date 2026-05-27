// PDF adapter (best-effort, lossy). PDFs store positioned glyph runs, not
// paragraphs, so we reconstruct structure heuristically:
//   - group text items into lines by vertical position
//   - start a new paragraph on a large vertical gap
//   - treat lines noticeably larger than the body font as headings
// Layout-heavy or scanned (image-only) PDFs won't extract well; those need OCR,
// which is out of scope. EPUB/HTML give far cleaner results.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { makeBuilder, finalizeSections, clean } from "./common.mjs";

const require = createRequire(import.meta.url);

async function loadPdfjs() {
  // The legacy build runs under Node without a DOM/canvas.
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export async function extractPdf(filePath) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await readFile(filePath));
  const pkg = require.resolve("pdfjs-dist/package.json");
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    standardFontDataUrl: pkg.replace("package.json", "standard_fonts/"),
    // CJK PDFs need character maps to decode glyphs to Unicode text.
    cMapUrl: pkg.replace("package.json", "cmaps/"),
    cMapPacked: true,
  }).promise;

  // First pass: collect lines across all pages, with their font height.
  const lines = []; // { text, size, gap } gap = vertical gap above this line
  const heights = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it.str !== undefined)
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        h: it.height || Math.abs(it.transform[3]),
      }));

    // Bucket items into lines by y (within half a line height).
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let lineItems = [];
    let lastY = null;
    const pushLine = (gap) => {
      if (!lineItems.length) return;
      const text = clean(lineItems.map((i) => i.str).join(""));
      const size = median(lineItems.map((i) => i.h));
      if (text) {
        lines.push({ text, size, gap });
        heights.push(size);
      }
      lineItems = [];
    };
    for (const it of items) {
      if (lastY === null || Math.abs(it.y - lastY) <= it.h * 0.6) {
        lineItems.push(it);
      } else {
        const gap = lastY - it.y;
        pushLine(gap);
        lineItems.push(it);
      }
      lastY = it.y;
    }
    pushLine(9999); // page break = big gap
  }

  // Second pass: assemble blocks.
  const body = median(heights) || 12;
  const b = makeBuilder();
  let para = [];
  const flush = () => {
    if (para.length) b.addText("paragraph", para.join(" "));
    para = [];
  };

  for (const ln of lines) {
    const isHeading = ln.size > body * 1.25 && ln.text.length < 80;
    const bigGap = ln.gap > body * 1.8;
    if (isHeading) {
      flush();
      b.startSection(ln.text);
    } else {
      if (bigGap) flush();
      para.push(ln.text);
    }
  }
  flush();

  return finalizeSections(b.sections);
}
