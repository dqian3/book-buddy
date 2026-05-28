---
name: add-language
description: Add support for a new reading language to Babel Book Buddy — a tokenizer (word segmentation for tap-to-define) and optionally an offline dictionary. Use when the user wants tap-to-define / segmentation / a dictionary for a language other than Chinese, or asks how to support a new language.
---

# Add a language to Babel Book Buddy

A book's `language` code selects a `LanguageServices` bundle
(`{ tokenizer, dictionary, spaced }`). The dispatch lives in **one file**:
`src/lib/language.ts`. Today `zh` gets CC-CEDICT + longest-match segmentation; every
other code falls back to whitespace tokenizing with no offline dictionary (the AI
still provides definitions). Adding a language means improving that fallback for a
specific code.

Decide first **what the language actually needs**:

- **Whitespace-delimited, AI handles definitions** (most European languages): often
  *nothing to do* — ingest a book with that `--lang` code and the `WhitespaceTokenizer`
  already works. Only add code if you need custom segmentation or an offline dictionary.
- **No word spacing** (Japanese, Thai, …) or **morphologically rich**: needs a custom
  tokenizer.
- **Offline dictionary wanted**: needs a `Dictionary` implementation + a build step.

## Add a custom tokenizer

1. Implement the `Tokenizer` interface (`src/lib/tokenizer/types.ts`):

   ```ts
   tokenizeAt(text: string, index: number): TokenizeResult | null
   ```

   Return the word at `index` as `{ word, start, end, alternatives }` where `start`/`end`
   are character offsets into `text`, or `null` if there's nothing word-like there.
   `alternatives` are narrower segmentations the user can pick in the dict popup
   (longest-first). Model it on `src/lib/tokenizer/chinese.ts` (dictionary-driven
   longest-match) or `whitespace.ts` (the simple default).

2. Wire it into `getLanguageServices` in `src/lib/language.ts` — add a branch for the
   language code returning your tokenizer, and set `spaced` (true if the language uses
   word spacing; it affects how taps/selection feel).

## Add an offline dictionary (optional)

1. Implement the `Dictionary` interface (`src/lib/dictionary/types.ts`):
   `lookup(word) → DictEntry[]`, `has(word)`, plus `maxLen` (used by longest-match
   tokenizers). See `src/lib/dictionary/cedict.ts` for the pattern: it loads a static
   JSON index from `public/data/dict/`, caches the parsed result in IndexedDB
   (`lib/storage/db.ts`), and renders display fields lazily.

2. Add a **build script** under `scripts/lang/<code>/` (language-specific build steps
   are organized per language; see `scripts/lang/zh/build-dict.mjs` as the model) that
   downloads/transforms the source lexicon into a compact static JSON, output to
   `public/data/dict/`. Add a matching `build:dict:<code>` npm script and fold it into
   `seed` if it should ship by default. Keep large/licensed data out of git (gitignored).

3. Return the dictionary (and a dictionary-driven tokenizer, if applicable) from the
   new branch in `language.ts`.

## Verify

There is no automated test harness; check by hand:

```bash
npm run dev
node scripts/ingest.mjs <a book in the new language> --lang <code> ...
# open the book, tap a word → the dict popup should segment and (if added) define it
# confirm the bundled zh book still segments/defines correctly (no regression)
```

## Notes

- `DictEntry.pinyin`/`pinyinNumeric` are Chinese-specific display fields; reuse `defs`
  (and the optional fields) sensibly for other scripts rather than inventing parallel
  state.
- Nothing downstream (reader, TTS, retrieval, citations) needs to change — they all
  operate on the format-agnostic document model and the `LanguageServices` seam.
