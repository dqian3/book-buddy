import type { Tokenizer, TokenizeResult } from "./types";

const WORD_CHAR = /[\p{L}\p{M}\p{N}'’-]/u;

/** For space-delimited languages (English, etc.): a word is the run of
 *  letter/number/apostrophe/hyphen characters around the tapped index. */
export class WhitespaceTokenizer implements Tokenizer {
  tokenizeAt(text: string, index: number): TokenizeResult | null {
    if (index < 0 || index >= text.length) return null;
    if (!WORD_CHAR.test(text[index])) return null;

    let start = index;
    let end = index + 1;
    while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
    while (end < text.length && WORD_CHAR.test(text[end])) end++;

    // Trim leading/trailing hyphens/apostrophes.
    const raw = text.slice(start, end);
    const trimmed = raw.replace(/^['’-]+|['’-]+$/g, "");
    if (!trimmed) return null;
    return { word: trimmed, start, end, alternatives: [] };
  }
}
