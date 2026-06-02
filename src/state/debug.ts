import { create } from "zustand";
import type { ChatTurn } from "../lib/ai";

// In-memory (not persisted) log of the raw requests sent to the AI provider, so
// the Advanced settings can show exactly what the assistant received — system
// prompt, message turns, and tool list. Capped and session-scoped.

export interface DebugRequest {
  id: string;
  at: number;
  provider: string;
  model: string;
  /** Agent step within a single send (0-based), since one send may loop. */
  step: number;
  system: string;
  messages: ChatTurn[];
  tools: string[];
}

interface DebugState {
  requests: DebugRequest[];
  record: (r: Omit<DebugRequest, "id" | "at">) => void;
  clear: () => void;
}

const MAX = 20;
const uid = () => Math.random().toString(36).slice(2, 10);

export const useDebug = create<DebugState>((set) => ({
  requests: [],
  record: (r) => set((s) => ({ requests: [{ ...r, id: uid(), at: Date.now() }, ...s.requests].slice(0, MAX) })),
  clear: () => set({ requests: [] }),
}));
