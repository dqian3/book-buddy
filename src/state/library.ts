import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Position } from "../lib/book/model";
import type { Bookmark, VocabItem } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface LibraryState {
  currentBookId: string | null;
  /** Last-read position per book (auto-saved for Resume). */
  progress: Record<string, Position>;
  bookmarks: Bookmark[];
  vocab: VocabItem[];

  setCurrentBook: (id: string | null) => void;
  setProgress: (bookId: string, position: Position) => void;
  addBookmark: (b: Omit<Bookmark, "id" | "createdAt">) => void;
  removeBookmark: (id: string) => void;
  addVocab: (v: Omit<VocabItem, "id" | "createdAt">) => void;
  removeVocab: (id: string) => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      currentBookId: null,
      progress: {},
      bookmarks: [],
      vocab: [],

      setCurrentBook: (id) => set({ currentBookId: id }),
      setProgress: (bookId, position) =>
        set((s) => ({ progress: { ...s.progress, [bookId]: position } })),
      addBookmark: (b) =>
        set((s) => ({ bookmarks: [{ ...b, id: uid(), createdAt: Date.now() }, ...s.bookmarks] })),
      removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
      addVocab: (v) =>
        set((s) => {
          // De-dupe the same word within the same book.
          if (s.vocab.some((x) => x.bookId === v.bookId && x.word === v.word)) return s;
          return { vocab: [{ ...v, id: uid(), createdAt: Date.now() }, ...s.vocab] };
        }),
      removeVocab: (id) => set((s) => ({ vocab: s.vocab.filter((v) => v.id !== id) })),
    }),
    { name: "bbb-library" }
  )
);
