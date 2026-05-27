import type { Tokenizer, TokenizeResult, Token } from "./types";
import type { Dictionary } from "../dictionary/types";

const HAN = /\p{Script=Han}/u;

/**
 * Chinese has no spaces, so we segment by greedy longest-match: from the tapped
 * character, try the longest dictionary word and fall back to shorter ones.
 * (Same idea as popup-dictionary browser extensions like Zhongwen; reimplemented
 * here clean-room — see README credits.)
 */
export class ChineseTokenizer implements Tokenizer {
  private cap: number;
  constructor(private dict: Dictionary) {
    // Cap the forward scan so a tap doesn't grab an unwieldy long phrase.
    this.cap = Math.min(dict.maxLen, 12);
  }

  tokenizeAt(text: string, index: number): TokenizeResult | null {
    if (index < 0 || index >= text.length) return null;
    if (!HAN.test(text[index])) return null;

    const matches: Token[] = [];
    for (let len = this.cap; len >= 1; len--) {
      const end = index + len;
      if (end > text.length) continue;
      const cand = text.slice(index, end);
      if (this.dict.has(cand)) matches.push({ word: cand, start: index, end });
    }

    if (matches.length === 0) {
      // Unknown single character — still surface it (the AI can explain it).
      return { word: text[index], start: index, end: index + 1, alternatives: [] };
    }
    const [best, ...rest] = matches; // longest match first
    return { ...best, alternatives: rest };
  }
}
