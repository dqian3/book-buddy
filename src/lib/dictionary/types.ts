export interface DictEntry {
  /** The headword as looked up. */
  word: string;
  /** Traditional form, if it differs from the headword. */
  traditional?: string;
  /** Numeric pinyin from CC-CEDICT, e.g. "hao3" (Chinese only). */
  pinyinNumeric?: string;
  /** Tone-marked pinyin for display, e.g. "hǎo" (Chinese only). */
  pinyin?: string;
  /** Definition glosses. */
  defs: string[];
}

export interface Dictionary {
  /** Language this dictionary serves. */
  language: string;
  /** Longest headword length in characters (for longest-match tokenizing). */
  maxLen: number;
  /** Return all entries for an exact headword (empty if none). */
  lookup(word: string): DictEntry[];
  /** Fast membership test used by the longest-match tokenizer. */
  has(word: string): boolean;
}
