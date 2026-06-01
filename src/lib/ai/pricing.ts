// Rough USD price list for estimating spend. Figures are per 1,000,000 units
// (tokens for chat, characters for TTS) and reflect public list prices as of
// early 2026 — treat the totals as estimates, not a bill. Unknown models return
// null so the UI can show raw usage without a dollar figure.

export interface ChatRate {
  inputPer1M: number;
  outputPer1M: number;
}

// Keyed by the model id the user configures.
const CHAT_RATES: Record<string, ChatRate> = {
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
  "claude-opus-4-8": { inputPer1M: 15, outputPer1M: 75 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
};

// Per 1,000,000 characters of input text.
const TTS_RATES: Record<string, number> = {
  "gpt-4o-mini-tts": 15, // ~$0.015/min ≈ $15/1M chars
  "tts-1": 15,
  "tts-1-hd": 30,
};

function matchRate<T>(table: Record<string, T>, model: string): T | undefined {
  if (table[model]) return table[model];
  // Loose match so e.g. "claude-sonnet-4-6-20260101" still resolves.
  const key = Object.keys(table).find((k) => model.startsWith(k) || model.includes(k));
  return key ? table[key] : undefined;
}

/** Estimated USD for a chat turn, or null if the model isn't priced. */
export function chatCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const r = matchRate(CHAT_RATES, model);
  if (!r) return null;
  return (inputTokens * r.inputPer1M + outputTokens * r.outputPer1M) / 1_000_000;
}

/** Estimated USD for TTS characters, or null if the model isn't priced. */
export function ttsCost(model: string, chars: number): number | null {
  const r = matchRate(TTS_RATES, model);
  if (r == null) return null;
  return (chars * r) / 1_000_000;
}

/** Compact USD string: "$0.0021", "$1.40", or "<$0.0001" for tiny amounts. */
export function formatUSD(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
