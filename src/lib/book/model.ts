// The normalized document model. Every ingestion adapter (HTML/EPUB/PDF/TXT)
// produces this exact shape, so the reader UI, TTS, retrieval, bookmarks, and
// citations are all format-agnostic. A position in a book is the pair
// (sectionIndex, blockIndex), which gives stable anchors for everything.

export type BlockType = "heading" | "paragraph" | "line" | "verse" | "image";

export interface Block {
  /** Stable DOM/citation id, e.g. "s0b3" (section 0, block 3). */
  id: string;
  type: BlockType;
  /** Present for heading | paragraph | line | verse. */
  text?: string;
  /** Heading depth (1 = section title-ish, 2+ = sub-heading). */
  level?: number;
  /** Verse reference, e.g. "1:1" for the Bible. */
  ref?: string;
  /** Image asset path, relative to the book directory. */
  src?: string;
  /** Image alt text. */
  alt?: string;
}

export interface Section {
  index: number;
  title: string;
  blocks: Block[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  /** Language code that selects the tokenizer + dictionary, e.g. "zh", "en". */
  language: string;
  source: { format: string; file: string };
  sections: Section[];
}

/** Lightweight book entry used by the library list (no block content). */
export interface BookMeta {
  id: string;
  title: string;
  author: string;
  language: string;
}

/** A retrieval chunk: a window of consecutive text blocks within one section. */
export interface Chunk {
  id: string;
  sectionIndex: number;
  sectionTitle: string;
  /** First/last block index covered (inclusive). */
  startBlock: number;
  endBlock: number;
  text: string;
}

/** A reading position. */
export interface Position {
  sectionIndex: number;
  blockIndex: number;
}

/** Block types that carry readable/definable text. */
export const TEXT_BLOCK_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "heading",
  "paragraph",
  "line",
  "verse",
]);

export function isTextBlock(b: Block): boolean {
  return TEXT_BLOCK_TYPES.has(b.type) && !!b.text;
}

/** True if `pos` is at or before `limit` in reading order (spoiler scoping). */
export function isAtOrBefore(pos: Position, limit: Position): boolean {
  if (pos.sectionIndex !== limit.sectionIndex) {
    return pos.sectionIndex < limit.sectionIndex;
  }
  return pos.blockIndex <= limit.blockIndex;
}
