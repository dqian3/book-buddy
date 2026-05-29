/** The reader's native language. Hardcoded for now; could become a setting if
 *  non-English speakers want to use the app. The book's language is per-book. */
export const USER_LANGUAGE = "English";

/** Which language(s) the AI should explain in. */
export type ExplainIn = "user" | "book" | "both";

// The user-editable persona/instructions. Placeholders {book} {author}
// {language} are filled in; the explain-in directive, tone, location, and
// tool-use note are appended by the builder from live settings so the toggles
// always win.
export const DEFAULT_SYSTEM_TEMPLATE = `You are a warm, patient reading companion helping me read "{book}"{author}, which is written in {language}.

Your job is to help me understand the text and language, not to do the reading for me.

Guidelines:
- Explain meanings clearly and concisely. For a word or phrase, give the meaning first, then nuance: tone, register, and any classical/archaic, idiomatic, or wordplay usage.
- Where helpful, include a pronunciation aid for the original language (e.g. pinyin for Chinese, romaji for Japanese).
- Ground your answers in the passage. Don't invent plot details.
- When I've selected text, focus on that selection.`;

export interface BuildSystemArgs {
  template: string;
  book: { title: string; author?: string; language: string };
  explainIn: ExplainIn;
  tone?: string;
  /** Human-readable current location, e.g. "第一回 风雪惊变". */
  locationLabel?: string;
  /** When true, restrict the agent to what the reader has already read. */
  spoilerFree: boolean;
}

const LANGUAGE_NAMES: Record<string, string> = {
  zh: "Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  es: "Spanish",
  de: "German",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code?.toLowerCase()] || code || "the original language";
}

/** Build the "explain in" directive: explain in the user's language (with the
 *  source term kept inline so they learn it), in the book's language (full
 *  immersion), or both side by side. */
export function explanationDirective(explainIn: ExplainIn, bookLanguage: string): string {
  const src = languageName(bookLanguage);
  if (explainIn === "book") {
    return `Always write your explanations in ${src}. Use plain, clear ${src} with short sentences — I'm learning ${src} by reading this book.`;
  }
  if (explainIn === "both") {
    return `Give every explanation in both ${src} and ${USER_LANGUAGE}: the ${src} version first (so I get immersion practice), then the ${USER_LANGUAGE} version below it so I can check my understanding. Keep each side concise.`;
  }
  return `Always write your explanations in ${USER_LANGUAGE}. When you discuss a word or phrase, keep the original ${src} term inline (with a pronunciation aid where the script isn't Latin) so I learn the source wording.`;
}

/** Fill the editable template and append live-settings directives + the tool
 *  instructions. */
export function buildSystemPrompt({
  template,
  book,
  explainIn,
  tone,
  locationLabel,
  spoilerFree,
}: BuildSystemArgs): string {
  const lang = languageName(book.language);
  const filled = template
    .replaceAll("{book}", book.title)
    .replaceAll("{author}", book.author ? ` by ${book.author}` : "")
    .replaceAll("{language}", lang);

  const parts: string[] = [filled, "", explanationDirective(explainIn, book.language)];
  if (tone?.trim()) parts.push("", `Style/level preference: ${tone.trim()}`);

  parts.push(
    "",
    `Reader's current location: ${locationLabel || "the beginning"}.`,
    "",
    "You have a `search_book` tool that returns passages from the book. Use it whenever your answer depends on the text — to find a scene, look up a word in context, check a name, recall what just happened, etc. Prefer queries written in the book's original language. You can call it multiple times if the first results aren't enough. If a question doesn't need the book (e.g. a general grammar question), just answer."
  );

  if (spoilerFree) {
    parts.push(
      "",
      "SPOILER-FREE MODE: `search_book` only returns passages up to the reader's current location. Do not reveal or hint at anything that happens later in the book. If asked about something not yet read, say it hasn't happened yet."
    );
  }

  return parts.join("\n");
}
