import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
const MAX_MESSAGES = 60; // per conversation; keep localStorage bounded
const MAX_CONVERSATIONS = 30; // per book

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** A passage the chat was started from (kept in the system prompt). */
  passage?: string;
}

const DEFAULT_TITLE = "New chat";

function snippet(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 42 ? line.slice(0, 42) + "…" : line;
}

function titleFrom(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user" && m.content.trim());
  return first ? snippet(first.content) : DEFAULT_TITLE;
}

export interface ChatState {
  /** Conversations per book, in creation order. */
  conversations: Record<string, Conversation[]>;
  /** The open conversation per book. */
  activeId: Record<string, string | undefined>;

  /** Conversations for a book, most-recently-updated first. */
  list: (bookId: string) => Conversation[];
  /** The active conversation, or null if none exists yet. */
  active: (bookId: string) => Conversation | null;
  /** Start a fresh conversation and make it active; returns its id. When a
   *  passage is given, the chat is anchored to it (title + system prompt). */
  newChat: (bookId: string, passage?: string) => string;
  setActive: (bookId: string, id: string) => void;
  /** Append a message to the active conversation (creating one if needed). */
  addMessage: (bookId: string, msg: Omit<ChatMessage, "id" | "createdAt">) => string;
  updateMessage: (bookId: string, id: string, patch: Partial<ChatMessage>) => void;
  deleteChat: (bookId: string, id: string) => void;
}

function replaceConversation(list: Conversation[], id: string, fn: (c: Conversation) => Conversation): Conversation[] {
  return list.map((c) => (c.id === id ? fn(c) : c));
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      activeId: {},

      list: (bookId) => [...(get().conversations[bookId] ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),

      active: (bookId) => {
        const id = get().activeId[bookId];
        return (get().conversations[bookId] ?? []).find((c) => c.id === id) ?? null;
      },

      newChat: (bookId, passage) => {
        const id = uid();
        const now = Date.now();
        const title = passage?.trim() ? snippet(passage) : DEFAULT_TITLE;
        set((s) => {
          const prev = s.conversations[bookId] ?? [];
          const next = [...prev, { id, title, createdAt: now, updatedAt: now, messages: [], passage: passage?.trim() || undefined }].slice(-MAX_CONVERSATIONS);
          return {
            conversations: { ...s.conversations, [bookId]: next },
            activeId: { ...s.activeId, [bookId]: id },
          };
        });
        return id;
      },

      setActive: (bookId, id) => set((s) => ({ activeId: { ...s.activeId, [bookId]: id } })),

      addMessage: (bookId, msg) => {
        const msgId = uid();
        const now = Date.now();
        const message: ChatMessage = { ...msg, id: msgId, createdAt: now };
        set((s) => {
          let list = s.conversations[bookId] ?? [];
          let activeId = s.activeId[bookId];
          // Auto-create a conversation if none is active.
          if (!activeId || !list.some((c) => c.id === activeId)) {
            activeId = uid();
            list = [...list, { id: activeId, title: DEFAULT_TITLE, createdAt: now, updatedAt: now, messages: [] }].slice(-MAX_CONVERSATIONS);
          }
          const updated = replaceConversation(list, activeId, (c) => {
            const messages = [...c.messages, message].slice(-MAX_MESSAGES);
            const title = c.title === DEFAULT_TITLE ? titleFrom(messages) : c.title;
            return { ...c, messages, title, updatedAt: now };
          });
          return {
            conversations: { ...s.conversations, [bookId]: updated },
            activeId: { ...s.activeId, [bookId]: activeId },
          };
        });
        return msgId;
      },

      updateMessage: (bookId, id, patch) =>
        set((s) => {
          const list = s.conversations[bookId] ?? [];
          const activeId = s.activeId[bookId];
          if (!activeId) return {};
          return {
            conversations: {
              ...s.conversations,
              [bookId]: replaceConversation(list, activeId, (c) => ({
                ...c,
                messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
              })),
            },
          };
        }),

      deleteChat: (bookId, id) =>
        set((s) => {
          const next = (s.conversations[bookId] ?? []).filter((c) => c.id !== id);
          const wasActive = s.activeId[bookId] === id;
          const fallback = wasActive ? [...next].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id : s.activeId[bookId];
          return {
            conversations: { ...s.conversations, [bookId]: next },
            activeId: { ...s.activeId, [bookId]: fallback },
          };
        }),
    }),
    {
      name: "bbb-chat",
      version: 1,
      // Old shape stored a single message list per book under `sessions`.
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as { sessions?: Record<string, ChatMessage[]> } & Partial<ChatState>;
        if (version === 0 && state?.sessions) {
          const conversations: Record<string, Conversation[]> = {};
          const activeId: Record<string, string | undefined> = {};
          const now = Date.now();
          for (const [bookId, messages] of Object.entries(state.sessions)) {
            if (Array.isArray(messages) && messages.length) {
              const id = uid();
              conversations[bookId] = [{ id, title: titleFrom(messages), createdAt: now, updatedAt: now, messages }];
              activeId[bookId] = id;
            }
          }
          return { conversations, activeId } as Partial<ChatState>;
        }
        return state;
      },
    }
  )
);
