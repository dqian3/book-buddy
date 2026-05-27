// Convert CC-CEDICT numeric pinyin (e.g. "ni3 hao3", "lu:4") into tone-marked
// pinyin ("nǐ hǎo", "lǜ"). Kept in the app so the dictionary file stays small.

const TONE_MARKS: Record<string, string[]> = {
  a: ["a", "ā", "á", "ǎ", "à", "a"],
  e: ["e", "ē", "é", "ě", "è", "e"],
  i: ["i", "ī", "í", "ǐ", "ì", "i"],
  o: ["o", "ō", "ó", "ǒ", "ò", "o"],
  u: ["u", "ū", "ú", "ǔ", "ù", "u"],
  "ü": ["ü", "ǖ", "ǘ", "ǚ", "ǜ", "ü"],
};

function markSyllable(syl: string): string {
  const m = syl.match(/^([a-zü:]+?)([1-5])?$/i);
  if (!m) return syl;
  let body = m[1].replace(/u:/gi, "ü").replace(/v/gi, "ü");
  const tone = m[2] ? Number(m[2]) : 5;
  if (tone === 5) return body;

  const lower = body.toLowerCase();
  // Placement: a/e win; in "ou" the o takes it; else the last vowel.
  let idx = -1;
  if (lower.includes("a")) idx = lower.indexOf("a");
  else if (lower.includes("e")) idx = lower.indexOf("e");
  else if (lower.includes("ou")) idx = lower.indexOf("o");
  else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ("aeiouü".includes(lower[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) return body;
  const vowel = lower[idx];
  const marked = TONE_MARKS[vowel]?.[tone];
  if (!marked) return body;
  return body.slice(0, idx) + marked + body.slice(idx + 1);
}

/** "ni3 hao3" -> "nǐ hǎo". Non-syllable tokens (·, commas) pass through. */
export function toToneMarks(numeric: string): string {
  return numeric
    .split(/(\s+)/)
    .map((part) => (/\s+/.test(part) || !part ? part : markSyllable(part)))
    .join("");
}
