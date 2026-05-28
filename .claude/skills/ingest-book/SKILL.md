---
name: ingest-book
description: Import a book (HTML/EPUB/PDF/TXT/MD) into Babel Book Buddy's library so it appears in the app. Use when the user wants to add, import, ingest, or convert a book/document, asks why a book isn't showing in the library, or wants to (re)build the bundled sample book.
---

# Ingest a book into Babel Book Buddy

Books are not read live by the app. A **build-time** step normalizes a source file
into the document model and writes static JSON under `public/data/books/<id>/`, which
the app then loads. Adding a book = running the ingestion CLI.

## Prerequisites

- `npm install` has been run.
- For Chinese books (`--lang zh`), the dictionary must exist: run `npm run build:dict:zh`
  (or `npm run seed`) once. Ingestion itself does not need the dictionary, but the
  reader's tap-to-define will be empty without it.

## Steps

1. **Run the ingest CLI** (note the `--` so npm forwards the flags):

   ```bash
   npm run ingest -- <path/to/file> --lang <code> [--id slug] [--title "T"] [--author "A"]
   ```

   Or call the script directly: `node scripts/ingest.mjs <file> --lang <code> ...`

   - `--lang` selects the language code. `zh` (or `zh-*`) enables CC-CEDICT +
     longest-match segmentation; any other code uses whitespace tokenizing and relies
     on the AI for definitions. Defaults to `en`.
   - `--id` is the slug / output directory and library key. Defaults to a slug of the
     title. **Re-ingesting with the same `--id` overwrites that book** (and its index
     entry) — use this to update a book.
   - `--title` / `--author` default to the filename / empty.

2. **Confirm the output.** Success prints a summary and the path. Files land in
   `public/data/books/<id>/` (`book.json`, `chunks.json`, `assets/`) and the book is
   added to `public/data/books/index.json` (the library list).

3. **Refresh the app** (`npm run dev` if not running) — the book appears in the
   library. No rebuild needed; data is static and loaded at runtime.

## Supported formats & limits

- `.html` `.htm` `.xhtml`, `.epub`, `.pdf`, `.txt` `.text` `.md`.
- EPUB/HTML extract cleanly (including images). **PDF is best-effort** — layout is
  reconstructed heuristically; scanned/image-only PDFs yield no text (OCR is not
  supported) and ingestion will error with "No content extracted."
- Output is gitignored (`public/data/books/`); books are regenerated, not committed.

## Examples

```bash
# Rebuild the bundled sample (what `npm run seed` does after build:dict:zh):
node scripts/ingest.mjs "books/射雕英雄传-金庸-converted.html" --lang zh --id shediao --title "射雕英雄传" --author "金庸"

# English EPUB:
node scripts/ingest.mjs path/to/hamlet.epub --lang en --title "Hamlet" --author "Shakespeare"

# A plain-text Bible with a custom id:
node scripts/ingest.mjs path/to/bible.txt --lang en --id kjv --title "KJV Bible"
```

## Notes

- To add a brand-new language (not just a book in an existing one), the tokenizer/
  dictionary seam may need extending first — see the `add-language` skill.
- The extension adapters live in `scripts/extract/{html,epub,pdf,txt}.mjs`; fix
  extraction problems there, not in the app.
