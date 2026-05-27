import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
const MAX_MESSAGES = 60; // keep localStorage bounded

export interface ChatState {
  /** Conversation history per book. */
  sessions: Record<string, ChatMessage[]>;

  messages: (bookId: string) => ChatMessage[];
  add: (bookId: string, msg: Omit<ChatMessage, "id" | "createdAt">) => string;
  update: (bookId: string, id: string, patch: Partial<ChatMessage>) => void;
  clear: (bookId: string) => void;
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: {},

      messages: (bookId) => get().sessions[bookId] ?? [],
      add: (bookId, msg) => {
        const id = uid();
        set((s) => {
          const prev = s.sessions[bookId] ?? [];
          const next = [...prev, { ...msg, id, createdAt: Date.now() }].slice(-MAX_MESSAGES);
          return { sessions: { ...s.sessions, [bookId]: next } };
        });
        return id;
      },
      update: (bookId, id, patch) =>
        set((s) => ({
          sessions: {
            ...s.sessions,
            [bookId]: (s.sessions[bookId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
          },
        })),
      clear: (bookId) => set((s) => ({ sessions: { ...s.sessions, [bookId]: [] } })),
    }),
    { name: "bbb-chat" }
  )
);
