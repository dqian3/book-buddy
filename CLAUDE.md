# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Babel Book Buddy is a **static, backend-less** React reading app for foreign/archaic
books: tap-to-define dictionary, pluggable AI assistant, spoiler-aware retrieval, and
free browser text-to-speech. All user data (settings, progress, bookmarks, saved
words, chat, API keys) lives **only in the browser**. The dictionary, tokenizing,
TTS, and retrieval run **client-side at zero API cost**; only AI chat calls an
external/local model.

## Commands

```bash
npm run dev          # Vite dev server (also reachable from a phone on the LAN)
npm run build        # tsc --noEmit (typecheck) + vite build
npm run seed         # build:dict:zh + ingest the 三國演義 sample — run once after install
npm run build:dict:zh  # download CC-CEDICT → public/data/dict/cc-cedict.json (Chinese dictionary)
npm run ingest -- <file> --lang <code> [--id slug] [--title T] [--author A]
```

There is **no automated test/verify harness** — verify changes by running the app
(`npm run dev`) and exercising the reader, tap-to-define, panels, and chat by hand.

**`npm run seed` is a prerequisite for everything.** The dictionary and book data
under `public/data/` are gitignored and generated — a fresh clone has an empty
library and no dictionary until you seed.

## Architecture

Two halves: a **build-time pipeline** (`scripts/`, Node) that turns source files into
static JSON, and the **runtime app** (`src/`, React) that consumes it. They never run
together; the app only reads `public/data/`.

### The document model is the spine (`src/lib/book/model.ts`)

Every ingestion adapter normalizes to one shape: `Book → Section[] → Block[]`, where a
block is a `heading | paragraph | line | verse | image`. A location anywhere in the
system is a `Position = { sectionIndex, blockIndex }`. That pair is the universal
anchor — reading progress, bookmarks, TTS highlighting, retrieval chunks, and
spoiler scoping all key off it. `isAtOrBefore(pos, limit)` defines reading order and
is what makes spoiler-free mode possible. Because the model is format-agnostic, the
reader/TTS/retrieval code never knows whether a book came from EPUB, PDF, or TXT.

### Build-time pipeline (`scripts/`)

`scripts/` is split between **general** steps and **per-language** ones:

- `scripts/ingest.mjs` + `scripts/extract/{html,epub,pdf,txt}.mjs` — general,
  organized by source **format**. `ingest.mjs` dispatches by file extension to an
  adapter, normalizes to the document model, builds retrieval chunks
  (`extract/common.mjs`), copies image assets, and writes
  `public/data/books/<id>/{book.json,chunks.json,assets/}` plus an entry in
  `public/data/books/index.json` (the library list).
- `scripts/lang/<code>/` — **language-specific** build steps. So far only
  `scripts/lang/zh/build-dict.mjs`, which downloads CC-CEDICT and emits a compact
  `{maxLen, entries, trad}` index (pinyin stays numeric, rendered to tone marks at
  runtime). A new language's dictionary builder goes under its own `lang/<code>/`.

### Language services dispatch (`src/lib/language.ts`)

A book's `language` code selects a `{ tokenizer, dictionary, spaced }` bundle, cached
per language. `zh` → CC-CEDICT + longest-match `ChineseTokenizer`; everything else →
`WhitespaceTokenizer` with no offline dictionary (the AI still covers definitions).
**This is the seam for adding a language** — implement the `Tokenizer` (and optionally
`Dictionary`) interface and add a branch here; nothing else needs to change.

### AI chat flow (`src/components/ChatPanel.tsx` orchestrates)

On send: `retrieve(query, chunks, {spoilerFree, position})` picks relevant passages
(lexical scoring in `lib/retrieval/lexical.ts`, falling back to passages near the
reader's position) → `buildSystemPrompt` fills the user-editable template and appends
the explanation-language + tone directives → `buildContextMessage` wraps the retrieved
chunks (with the anti-spoiler header when spoiler-free) → `provider.chat()` streams the
reply token-by-token. **Spoiler scoping happens at retrieval**: `visibleChunks` drops
any chunk that starts after the reader's position, so the model literally cannot see
ahead. Live settings (explanation language, spoiler toggle, tone) are appended last so
they always override the editable template.

### Pluggable AI providers (`src/lib/ai/`)

`provider.ts` defines the `AIProvider` interface (`chat()` streams deltas via
`onToken`). `index.ts#createProvider` maps a provider id + config to an instance, or
returns a user-facing `error` string when a key/URL is missing. Each provider
(`claude.ts`, `openai.ts`, `ollama.ts`) calls its API directly from the browser and
parses SSE via `stream.ts`. Add a provider by implementing the interface and wiring
it into the `createProvider` switch + the settings UI.

### State (`src/state/`, Zustand)

- `reader.ts` — **not persisted**; the live session (open book, sections, services,
  active lookup, selection, TTS, which `panel` is open).
- `settings.ts` (`bbb-settings`), `chat.ts` (`bbb-chat`), `library.ts` — persisted to
  **localStorage** via zustand's `persist`.
- IndexedDB (`lib/storage/db.ts`) is used **only** for the one payload too big for
  localStorage: the parsed dictionary. Everything else is localStorage.

### UI

No component library. UI primitives are hand-rolled with Tailwind in
`src/components/common/ui.tsx` (notably `Panel`, the responsive drawer/bottom-sheet
used by every side panel). Tap-to-define maps a pointer location to a character offset
and back to a screen rect via `lib/dom/caret.ts`, then segments with the tokenizer.

## Conventions & gotchas

- **PDF ingestion is best-effort** (layout reconstructed heuristically). EPUB/HTML
  extract cleanly. Scanned/image-only PDFs need OCR, which isn't supported.
- API keys are sent **directly from the browser** to the provider; there is no proxy.
- Public-domain sample books ship as source in `sample-books/` (三國演義, Don
  Quijote); they are not in the app until ingested (`npm run seed` does the first).
