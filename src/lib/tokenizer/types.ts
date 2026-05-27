export interface Token {
  word: string;
  /** Character offsets into the source text [start, end). */
  start: number;
  end: number;
}

export interface TokenizeResult extends Token {
  /** Other plausible segmentations at the same spot (e.g. shorter matches),
   *  longest first, so the user can pick a narrower word. */
  alternatives: Token[];
}

export interface Tokenizer {
  /** Given the text and the character index the user tapped, return the word
   *  there plus alternatives, or null if there's nothing wordlike. */
  tokenizeAt(text: string, index: number): TokenizeResult | null;
}
