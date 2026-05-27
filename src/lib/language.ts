import type { Dictionary } from "./dictionary/types";
import type { Tokenizer } from "./tokenizer/types";
import { loadCedict } from "./dictionary/cedict";
import { ChineseTokenizer } from "./tokenizer/chinese";
import { WhitespaceTokenizer } from "./tokenizer/whitespace";

export interface LanguageServices {
  language: string;
  tokenizer: Tokenizer;
  /** Offline dictionary, if one exists for this language (Chinese only in MVP). */
  dictionary: Dictionary | null;
  /** Whether this language has word spacing (affects how taps/selection feel). */
  spaced: boolean;
}

const cache = new Map<string, Promise<LanguageServices>>();

/**
 * Build the tokenizer + dictionary for a book's language. Chinese gets
 * CC-CEDICT + longest-match segmentation; everything else gets whitespace
 * tokenizing and (for now) no offline dictionary — the AI still works, and a
 * Wiktionary adapter is the planned phase-2 addition for those languages.
 */
export function getLanguageServices(language: string): Promise<LanguageServices> {
  const lang = (language || "en").toLowerCase();
  if (cache.has(lang)) return cache.get(lang)!;

  const promise = (async (): Promise<LanguageServices> => {
    if (lang === "zh" || lang.startsWith("zh-")) {
      const dictionary = await loadCedict();
      return {
        language: lang,
        dictionary,
        tokenizer: new ChineseTokenizer(dictionary),
        spaced: false,
      };
    }
    return {
      language: lang,
      dictionary: null,
      tokenizer: new WhitespaceTokenizer(),
      spaced: true,
    };
  })();

  cache.set(lang, promise);
  return promise;
}
