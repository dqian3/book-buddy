import type { Chunk } from "../book/model";

/** The reader's native language. Hardcoded for now; could become a setting if
 *  non-English speakers want to use the app. The book's language is per-book. */
export const USER_LANGUAGE = "English";

/** Which of the two language slots the AI should explain in. */
export type ExplainIn = "user" | "book";

// The user-editable persona/instructions. Placeholders {book} {author}
// {language} are filled in; the explain-in directive, spoiler rules,
// selection, and retrieved context are appended by the builder from live
// settings so the toggles always win.
export const DEFAULT_SYSTEM_TEMPLATE = `You are a warm, patient reading companion helping me read "{book}"{author}, which is written in {language}.

Your job is to help me understand the text and language, not to do the reading for me.

Guidelines:
- Explain meanings clearly and concisely. For a word or phrase, give the meaning first, then nuance: tone, register, and any classical/archaic, idiomatic, or wordplay usage.
- Where helpful, include a pronunciation aid for the original language (e.g. pinyin for Chinese, romaji for Japanese).
- Ground your answers in the passage and the provided context. Don't invent plot details.
- When I've selected text, focus on that selection.`;

export interface BuildSystemArgs {
  template: string;
  book: { title: string; author?: string; language: string };
  explainIn: ExplainIn;
  tone?: string;
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
 *  source term kept inline so they learn it) or in the book's language (full
 *  immersion). */
export function explanationDirective(explainIn: ExplainIn, bookLanguage: string): string {
  const src = languageName(bookLanguage);
  if (explainIn === "book") {
    return `Always write your explanations in ${src}. Use plain, clear ${src} with short sentences — I'm learning ${src} by reading this book.`;
  }
  return `Always write your explanations in ${USER_LANGUAGE}. When you discuss a word or phrase, keep the original ${src} term inline (with a pronunciation aid where the script isn't Latin) so I learn the source wording.`;
}

/** Fill the editable template and append the explain-in + tone rules. */
export function buildSystemPrompt({ template, book, explainIn, tone }: BuildSystemArgs): string {
  const lang = languageName(book.language);
  const filled = template
    .replaceAll("{book}", book.title)
    .replaceAll("{author}", book.author ? ` by ${book.author}` : "")
    .replaceAll("{language}", lang);

  const directive = explanationDirective(explainIn, book.language);
  const parts = [filled, "", directive];
  if (tone?.trim()) parts.push("", `Style/level preference: ${tone.trim()}`);
  return parts.join("\n");
}

export interface ContextArgs {
  chunks: Chunk[];
  spoilerFree: boolean;
  /** Human-readable current location, e.g. "第一回 风雪惊变". */
  locationLabel?: string;
}

/**
 * Build the retrieved-context block injected before the user's question. With
 * spoiler-free on, only passages up to the reader's position are included and
 * the model is told not to look ahead.
 */
export function buildContextMessage({ chunks, spoilerFree, locationLabel }: ContextArgs): string {
  const header = spoilerFree
    ? `The reader is currently at: ${locationLabel || "the beginning"}.
IMPORTANT: Avoid spoilers. Only use the passages below (everything the reader has read so far). Do not reveal or hint at anything that happens later in the book. If asked about something not yet read, say it hasn't happened yet.`
    : `Relevant passages from the book (full text available):`;

  if (chunks.length === 0) {
    return `${header}\n\n(No specific passage retrieved.)`;
  }
  const body = chunks
    .map((c) => `[${c.sectionTitle}]\n${c.text}`)
    .join("\n\n---\n\n");
  return `${header}\n\n<context>\n${body}\n</context>`;
}
