import type { Chunk } from "../book/model";

export type ExplanationLanguage = "en" | "zh" | "both";

// The user-editable persona/instructions. Placeholders {book} {author}
// {language} are filled in; the explanation-language directive, spoiler rules,
// selection, and retrieved context are appended by the builder from live
// settings so the toggles always win.
export const DEFAULT_SYSTEM_TEMPLATE = `You are a warm, patient reading companion helping me read "{book}"{author}, which is written in {language}.

Your job is to help me understand the text and language, not to do the reading for me.

Guidelines:
- Explain meanings clearly and concisely. For a word or phrase, give the meaning first, then nuance: tone, register, and any classical/archaic, idiomatic, or wordplay usage.
- For Chinese, include pinyin (with tone marks) for any words you discuss, and note traditional/simplified or literary usage when relevant.
- Ground your answers in the passage and the provided context. Don't invent plot details.
- When I've selected text, focus on that selection.`;

export const EXPLANATION_DIRECTIVE: Record<ExplanationLanguage, string> = {
  en: "Always write your explanations in English, even though the text is in {language}.",
  zh: "请始终用中文解释，即使我用英文提问。",
  both: "Explain in English, but keep key {language} terms inline (with pinyin for Chinese) so I learn the original wording.",
};

export interface BuildSystemArgs {
  template: string;
  book: { title: string; author?: string; language: string };
  explanationLanguage: ExplanationLanguage;
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

/** Fill the editable template and append the explanation-language + tone rules. */
export function buildSystemPrompt({ template, book, explanationLanguage, tone }: BuildSystemArgs): string {
  const lang = languageName(book.language);
  const filled = template
    .replaceAll("{book}", book.title)
    .replaceAll("{author}", book.author ? ` by ${book.author}` : "")
    .replaceAll("{language}", lang);

  const directive = EXPLANATION_DIRECTIVE[explanationLanguage].replaceAll("{language}", lang);
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
