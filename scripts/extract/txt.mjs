// Plain-text adapter. Blank lines separate blocks. Within a block:
//   - "# Title" / "## Title"          -> heading (also starts a section at level 1)
//   - "Chapter/Act/Scene N ..." line  -> section heading
//   - "N:N some text"                 -> numbered verse (ref kept, e.g. Bible)
//   - short lines with internal breaks -> poetry "line" blocks (breaks preserved)
//   - otherwise                        -> a prose paragraph
import { readFile } from "node:fs/promises";
import { makeBuilder, finalizeSections, clean } from "./common.mjs";

const SECTION_RE = /^(?:#{1,3}\s+(.*)|((?:chapter|act|scene|book|part|canto)\b.*))$/i;
const VERSE_RE = /^(\d+[:.]\d+)\s+(.+)$/;

export async function extractTxt(filePath) {
  const raw = await readFile(filePath, "utf8");
  const b = makeBuilder();
  const groups = raw.replace(/\r\n?/g, "\n").split(/\n{2,}/);

  for (const group of groups) {
    const lines = group.split("\n").map((l) => l.replace(/\s+$/g, "")).filter(Boolean);
    if (!lines.length) continue;

    // A lone line that looks like a section/heading marker.
    if (lines.length === 1) {
      const m = lines[0].match(SECTION_RE);
      if (m) {
        b.startSection(clean(m[1] || m[2] || lines[0]));
        continue;
      }
    }

    // Verse-referenced lines (e.g. scripture).
    if (lines.every((l) => VERSE_RE.test(l))) {
      for (const l of lines) {
        const [, ref, text] = l.match(VERSE_RE);
        b.addText("verse", text, { ref });
      }
      continue;
    }

    // Poetry / verse: multiple short lines (prose wraps much wider, ~70 cols,
    // so a group whose longest line stays under ~50 is almost certainly verse).
    const maxLen = Math.max(...lines.map((l) => l.length));
    if (lines.length > 1 && maxLen < 50) {
      for (const l of lines) b.addText("line", l);
      continue;
    }

    // Default: a wrapped prose paragraph.
    b.addText("paragraph", lines.join(" "));
  }

  return finalizeSections(b.sections);
}
