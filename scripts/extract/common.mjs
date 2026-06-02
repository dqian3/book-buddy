// Shared helpers for ingestion adapters. These build and serialize the same
// document model declared in src/lib/book/model.ts.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TEXT_TYPES = new Set(["heading", "paragraph", "line", "verse"]);

/** Collapse whitespace; returns "" for blank input. */
export function clean(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Build a section accumulator with helpers for appending blocks. */
export function makeBuilder() {
  const sections = [];
  let current = null;

  function startSection(title) {
    current = { index: sections.length, title: clean(title), blocks: [] };
    sections.push(current);
    return current;
  }
  function ensureSection() {
    if (!current) startSection("");
    return current;
  }
  function addText(type, text, extra = {}) {
    const t = clean(text);
    if (!t) return;
    ensureSection().blocks.push({ type, text: t, ...extra });
  }
  function addImage(src, alt = "") {
    ensureSection().blocks.push({ type: "image", src, alt: clean(alt) });
  }

  return {
    sections,
    startSection,
    ensureSection,
    addText,
    addImage,
    addBlock: (block) => ensureSection().blocks.push(block),
  };
}

/** First non-empty block's text, truncated — a fallback title for sections
 *  that carry no heading (e.g. EPUB documents whose chapter line is a plain
 *  <p>), so the table of contents shows something meaningful instead of blank. */
function fallbackTitle(blocks) {
  const first = blocks.find((b) => b.text)?.text ?? "";
  return first.length > 60 ? first.slice(0, 60) + "…" : first;
}

/** Assign stable ids and drop empty sections. */
export function finalizeSections(sections) {
  return sections
    .filter((s) => s.blocks.length > 0)
    .map((s, si) => ({
      index: si,
      title: s.title || fallbackTitle(s.blocks),
      blocks: s.blocks.map((b, bi) => ({ id: `s${si}b${bi}`, ...b })),
    }));
}

/**
 * Group consecutive text blocks within each section into retrieval chunks of
 * roughly `budget` characters. Images are skipped. Each chunk records the
 * (section, block range) it covers so retrieval can be scoped for spoilers.
 */
export function buildChunks(sections, budget = 450) {
  const chunks = [];
  for (const sec of sections) {
    let buf = [];
    let start = -1;
    let last = -1;
    let len = 0;
    const flush = () => {
      if (!buf.length) return;
      chunks.push({
        id: `c${chunks.length}`,
        sectionIndex: sec.index,
        sectionTitle: sec.title,
        startBlock: start,
        endBlock: last,
        text: buf.join("\n"),
      });
      buf = [];
      start = -1;
      len = 0;
    };
    sec.blocks.forEach((b, bi) => {
      if (!TEXT_TYPES.has(b.type) || !b.text) return;
      if (start === -1) start = bi;
      buf.push(b.text);
      last = bi;
      len += b.text.length;
      if (len >= budget) flush();
    });
    flush();
  }
  return chunks;
}

/** Write book.json + chunks.json (+ assets handled by the adapter) into outDir. */
export async function writeBook(outDir, book, chunks) {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "book.json"), JSON.stringify(book));
  await writeFile(join(outDir, "chunks.json"), JSON.stringify(chunks));
}

const counts = (sections) => ({
  sections: sections.length,
  blocks: sections.reduce((n, s) => n + s.blocks.length, 0),
});

export function summarize(book, chunks) {
  const { sections, blocks } = counts(book.sections);
  return `${book.title} — ${sections} sections, ${blocks} blocks, ${chunks.length} chunks`;
}
