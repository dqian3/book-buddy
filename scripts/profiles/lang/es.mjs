// Spanish extraction profile. Heading-less EPUBs label chapters with a plain
// "Capítulo primero" / "Capítulo IV" paragraph (e.g. the bundled Don Quijote);
// "Canto" covers verse divisions.
import base from "../base.mjs";

const CHAPTER_RE = /^(cap[íi]tulo|canto)\b/i;

export default {
  ...base,
  isChapterHeading: (text) => !!text && text.length <= 50 && CHAPTER_RE.test(text),
};
