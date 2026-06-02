import { create } from "zustand";
import type { Book, Chunk, Position } from "../lib/book/model";
import type { DictEntry } from "../lib/dictionary/types";
import type { TokenizeResult } from "../lib/tokenizer/types";
import { loadBook, loadChunks } from "../lib/book/loader";
import { getLanguageServices, type LanguageServices } from "../lib/language";
import { useLibrary } from "./library";

export interface ActiveLookup {
  token: TokenizeResult;
  entries: DictEntry[];
  sentence: string;
  position: Position;
  /** Anchor rect (viewport coords) of the tapped word. */
  rect: DOMRect;
}

export interface ActiveSelection {
  text: string;
  sectionIndex: number;
  /** Where the selection starts, so read-aloud can place the word cursor. */
  blockIndex: number;
  start: number;
}

/** The word currently being spoken, as a char range within its block. */
export interface TtsWord {
  blockId: string;
  start: number;
  end: number;
}

export type Panel = "toc" | "settings" | "bookmarks" | "vocab" | "chat" | "library";

interface ReaderState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  book: Book | null;
  chunks: Chunk[];
  services: LanguageServices | null;
  sectionIndex: number;
  /** When set, the reader should scroll to this block once (resume/jump). */
  pendingScrollBlock: number | null;

  active: ActiveLookup | null;
  selection: ActiveSelection | null;
  ttsBlockId: string | null;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  ttsWord: TtsWord | null;
  panel: Panel | null;
  /** Prefill (or auto-submit) for the chat composer from a quick action. */
  chatPrefill: { text: string; autoSubmit?: boolean; newChat?: boolean; passage?: string } | null;

  open: (bookId: string) => Promise<void>;
  close: () => void;
  setSection: (i: number, scrollToBlock?: number) => void;
  consumeScroll: () => number | null;
  setActive: (a: ActiveLookup | null) => void;
  setSelection: (s: ActiveSelection | null) => void;
  setTts: (blockId: string | null, playing: boolean) => void;
  setTtsPaused: (paused: boolean) => void;
  setTtsWord: (word: TtsWord | null) => void;
  setPanel: (p: Panel | null) => void;
  openChatWith: (text: string, options?: { autoSubmit?: boolean; newChat?: boolean; passage?: string }) => void;
  consumeChatPrefill: () => { text: string; autoSubmit?: boolean; newChat?: boolean; passage?: string } | null;
}

export const useReader = create<ReaderState>((set, get) => ({
  status: "idle",
  book: null,
  chunks: [],
  services: null,
  sectionIndex: 0,
  pendingScrollBlock: null,
  active: null,
  selection: null,
  ttsBlockId: null,
  ttsPlaying: false,
  ttsPaused: false,
  ttsWord: null,
  panel: null,
  chatPrefill: null,

  open: async (bookId) => {
    set({ status: "loading", error: undefined, active: null, selection: null, panel: null });
    try {
      const [book, chunks] = await Promise.all([loadBook(bookId), loadChunks(bookId)]);
      const services = await getLanguageServices(book.language);
      const resume = useLibrary.getState().progress[bookId];
      useLibrary.getState().setCurrentBook(bookId);
      set({
        status: "ready",
        book,
        chunks,
        services,
        sectionIndex: resume?.sectionIndex ?? 0,
        pendingScrollBlock: resume?.blockIndex ?? null,
      });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  close: () => {
    useLibrary.getState().setCurrentBook(null);
    set({ status: "idle", book: null, chunks: [], services: null, active: null, selection: null, panel: null });
  },

  setSection: (i, scrollToBlock) =>
    set({ sectionIndex: i, pendingScrollBlock: scrollToBlock ?? 0, active: null, selection: null, panel: null }),

  consumeScroll: () => {
    const v = get().pendingScrollBlock;
    if (v !== null) set({ pendingScrollBlock: null });
    return v;
  },

  setActive: (a) => set({ active: a }),
  setSelection: (s) => set({ selection: s }),
  setTts: (blockId, playing) => set({ ttsBlockId: blockId, ttsPlaying: playing }),
  setTtsPaused: (paused) => set({ ttsPaused: paused }),
  setTtsWord: (word) => set({ ttsWord: word }),
  setPanel: (p) => set({ panel: p }),
  openChatWith: (text, options) =>
    set({ chatPrefill: { text, autoSubmit: options?.autoSubmit, newChat: options?.newChat, passage: options?.passage }, panel: "chat", active: null }),
  consumeChatPrefill: () => {
    const v = get().chatPrefill;
    if (v !== null) set({ chatPrefill: null });
    return v;
  },
}));
