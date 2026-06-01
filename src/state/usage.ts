import { create } from "zustand";
import { persist } from "zustand/middleware";

// Running tally of API usage so the user can see roughly what they're spending.
// We store raw counts (exact token/character totals reported by the APIs) and
// compute dollar estimates at display time, so price-table edits apply
// retroactively. Keyed by `${provider}:${model}`.

export interface UsageEntry {
  provider: string; // "claude" | "openai" | "ollama" | "openai-tts"
  model: string;
  kind: "chat" | "tts";
  calls: number;
  inputTokens: number;
  outputTokens: number;
  chars: number;
}

type UsageDelta = Partial<Pick<UsageEntry, "calls" | "inputTokens" | "outputTokens" | "chars">> &
  Pick<UsageEntry, "provider" | "model" | "kind">;

interface UsageState {
  entries: Record<string, UsageEntry>;
  record: (delta: UsageDelta) => void;
  reset: () => void;
}

export const useUsage = create<UsageState>()(
  persist(
    (set) => ({
      entries: {},
      record: (d) =>
        set((s) => {
          const key = `${d.provider}:${d.model}`;
          const prev =
            s.entries[key] ??
            { provider: d.provider, model: d.model, kind: d.kind, calls: 0, inputTokens: 0, outputTokens: 0, chars: 0 };
          return {
            entries: {
              ...s.entries,
              [key]: {
                ...prev,
                calls: prev.calls + (d.calls ?? 0),
                inputTokens: prev.inputTokens + (d.inputTokens ?? 0),
                outputTokens: prev.outputTokens + (d.outputTokens ?? 0),
                chars: prev.chars + (d.chars ?? 0),
              },
            },
          };
        }),
      reset: () => set({ entries: {} }),
    }),
    { name: "bbb-usage" }
  )
);
