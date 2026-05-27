import type { Position } from "../lib/book/model";

export interface Bookmark {
  id: string;
  bookId: string;
  position: Position;
  label: string;
  note?: string;
  createdAt: number;
}

export interface VocabItem {
  id: string;
  bookId: string;
  word: string;
  reading?: string; // pinyin / phonetic
  defs: string[];
  context: string; // the sentence/snippet it came from
  position: Position;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  /** True while the assistant message is still streaming in. */
  pending?: boolean;
  error?: boolean;
}
