// Hierarchical extraction profiles: base ← language ← book.
//
// A profile is a plain object of hook functions that the format adapters
// (extract/epub.mjs, extract/html.mjs) consult where extraction would otherwise
// need language- or book-specific knowledge (chapter conventions, export quirks).
// resolveProfile merges layers so later ones override earlier ones:
//   - base        — generic defaults (./base.mjs)
//   - lang/<code> — selected by the book's --lang (chapter detection, etc.)
//   - book/<name> — selected by an optional --profile (one book's quirks)
//
// `book/` is gitignored: those profiles cover specific, often non-public-domain
// books (e.g. shediao) and live only on the machine that has the source. So book
// profiles are imported dynamically and only when --profile is given — a clone
// without a `book/` dir still ingests everything else fine. To add a language's
// chapter conventions, add lang/<code>.mjs + a LANGS entry; for one book's quirk,
// drop in book/<name>.mjs and pass --profile <name> at ingest time.
import base from "./base.mjs";
import zh from "./lang/zh.mjs";
import es from "./lang/es.mjs";
import en from "./lang/en.mjs";

const LANGS = { zh, es, en };

export async function resolveProfile({ lang, profile } = {}) {
  const layers = [base, LANGS[lang]].filter(Boolean);
  if (profile) {
    if (!/^[a-z0-9-]+$/i.test(profile)) {
      throw new Error(`Invalid --profile "${profile}" (use letters, digits, dashes)`);
    }
    let mod;
    try {
      mod = await import(`./book/${profile}.mjs`);
    } catch {
      throw new Error(`Unknown --profile "${profile}" (expected scripts/profiles/book/${profile}.mjs)`);
    }
    layers.push(mod.default);
  }
  return Object.assign({}, ...layers);
}
