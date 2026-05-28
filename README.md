# Babel Book Buddy

A mobile/tablet-friendly reading companion for books in a foreign or archaic
language. Tap a word for an instant dictionary, ask an AI to explain or translate
a passage (optionally **spoiler-free**), have it **read aloud** for free, and pick
up exactly where you left off. Ships with the Chinese novel 《射雕英雄传》(Jin Yong)
and is general enough for other languages and classics (Shakespeare, the Bible, …).

It runs as a **static front-end** — no backend. Your data (settings, reading
progress, bookmarks, saved words, chat history, API keys) stays **local** in your
browser. The dictionary, word-segmentation, text-to-speech, and spoiler-aware
retrieval all run **client-side with zero API cost**; only the AI chat calls an
external/local model, and only when you ask it something.

## Features

- **Tap-to-define.** Chinese is segmented by longest-match against CC-CEDICT; tap
  a word to see pinyin + definitions, pick a narrower segmentation, hear it, or
  save it. Other languages use whitespace tokenizing (the AI covers definitions).
- **AI assistant — pluggable.** Claude, OpenAI, or local **Ollama** (free/private),
  chosen in Settings. Explain / translate / grammar / vocabulary / "recap so far".
- **Spoiler-aware context (RAG-lite).** The AI draws on the book, but in
  spoiler-free mode only on passages you've already read.
- **Customizable prompt.** Edit the system prompt; toggle explanations in
  English / 中文 / both; set a tone/level.
- **Free text-to-speech.** Browser `SpeechSynthesis` reads a word, a selection,
  or continuously from a paragraph with highlight-follow.
- **Bookmarks & progress.** Reading position auto-saves and resumes; add named
  bookmarks; review saved vocabulary.
- **General-purpose ingestion.** HTML / EPUB / PDF / TXT → one structured
  document model (headings, paragraphs, verse lines, numbered verses, images).

## Quick start

```bash
npm install
npm run seed      # downloads CC-CEDICT + ingests the bundled 射雕英雄传
npm run dev       # open the printed URL (also reachable from a phone on your LAN)
```

Then open the app, tap the book, and start reading. To use the AI, open
**Settings → AI assistant**, pick a provider, and (for Claude/OpenAI) paste an API
key — it's stored only in your browser. For a free/offline option, install
[Ollama](https://ollama.com), `ollama pull qwen2.5`, and select **Ollama**.

## Adding your own books

```bash
node scripts/ingest.mjs path/to/book.epub --lang en --title "Hamlet" --author "Shakespeare"
node scripts/ingest.mjs path/to/bible.txt --lang en --id kjv --title "KJV Bible"
```

- Supported: `.html` `.epub` `.pdf` `.txt`/`.md`. `--lang zh` enables the Chinese
  dictionary + segmentation; other codes use whitespace tokenizing.
- EPUB/HTML extract cleanly. PDF is **best-effort** (layout is reconstructed
  heuristically; scanned/image-only PDFs need OCR, which isn't supported).
- Output lands in `public/data/books/<id>/`; refresh the app to see it in the
  library.

## How it fits together

```
public/data/books/<id>/book.json   structured document model (sections → blocks)
public/data/books/<id>/chunks.json  retrieval chunks tagged by position
public/data/dict/cc-cedict.json     compact dictionary index (gitignored; from `seed`)

src/lib/tokenizer   chinese longest-match · whitespace        (general by language)
src/lib/dictionary  CC-CEDICT loader · pinyin tone marks
src/lib/ai          provider abstraction (claude/openai/ollama) · prompt builder
src/lib/retrieval   lexical scoring · spoiler scoping
src/lib/tts         SpeechSynthesis wrapper
src/state           zustand stores (settings, library, chat, reader)
src/components       Reader · DictPopup · ChatPanel · Settings · Toc · …
```

A book's `language` selects the tokenizer + dictionary, so supporting a new
language is "add an adapter + ingest a book."

## Roadmap (not yet built)

- Semantic embeddings (transformers.js) to replace lexical retrieval.
- A Wiktionary adapter for English/other-language definitions.
- OCR for scanned PDFs; richer EPUB styling.

## License & credits

MIT (see [LICENSE](./LICENSE)). Dictionary data is **CC-CEDICT** (CC BY-SA 4.0),
fetched at build time and not redistributed here. The tap-to-define experience is
inspired by the **Zhongwen** browser extension (GPL-2.0); its behavior was
reimplemented clean-room, so this project stays MIT-licensed.
