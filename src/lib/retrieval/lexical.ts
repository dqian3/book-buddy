// Lightweight lexical search over book chunks — no embeddings, no network, no
// cost. Handles CJK (which has no word spaces) with character bigrams and
// space-delimited languages with word tokens. Good enough to pull the relevant
// passage into the AI's context; semantic embeddings are a planned upgrade.

const HAN = /[㐀-鿿豈-﫿]/;
const WORD = /[\p{L}\p{N}]+/gu;

export function tokenizeForSearch(text: string): string[] {
  const tokens: string[] = [];
  // Word tokens (works for Latin/etc. and also catches latin words in CJK text).
  const words = text.toLowerCase().match(WORD) ?? [];
  for (const w of words) {
    if (HAN.test(w)) {
      // CJK run: emit character bigrams (and singletons for length-1 runs).
      const chars = [...w];
      if (chars.length === 1) tokens.push(chars[0]);
      for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1]);
    } else if (w.length > 1) {
      tokens.push(w);
    }
  }
  return tokens;
}

export interface Scored<T> {
  item: T;
  score: number;
}

export function scoreChunks<T extends { text: string }>(query: string, chunks: T[]): Scored<T>[] {
  const qTokens = new Set(tokenizeForSearch(query));
  if (qTokens.size === 0) return [];
  const scored: Scored<T>[] = [];
  for (const chunk of chunks) {
    const counts = new Map<string, number>();
    for (const t of tokenizeForSearch(chunk.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    let score = 0;
    for (const q of qTokens) {
      const c = counts.get(q);
      if (c) score += 1 + Math.log(c); // presence + damped frequency
    }
    if (score > 0) scored.push({ item: chunk, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
