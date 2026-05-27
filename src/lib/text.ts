// Sentence helpers, sensitive to both Western (.!?) and CJK (。！？…) punctuation.

const SENTENCE_END = /[.!?。！？…；;]+["'”’」』)）]*\s*/g;

/** Split text into sentences, keeping terminal punctuation. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  SENTENCE_END.lastIndex = 0;
  while ((m = SENTENCE_END.exec(text))) {
    out.push(text.slice(last, m.index + m[0].length).trim());
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last).trim());
  return out.filter(Boolean);
}

/** The sentence containing character `index`, used as context for a tapped word. */
export function sentenceAround(text: string, index: number): string {
  let start = 0;
  let end = text.length;
  let m: RegExpExecArray | null;
  SENTENCE_END.lastIndex = 0;
  while ((m = SENTENCE_END.exec(text))) {
    const boundary = m.index + m[0].length;
    if (boundary <= index) start = boundary;
    else {
      end = boundary;
      break;
    }
  }
  return text.slice(start, end).trim();
}
