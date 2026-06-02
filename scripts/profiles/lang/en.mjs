// English extraction profile. Heading-less EPUBs label chapters with a plain
// "Chapter IV" paragraph.
import base from "../base.mjs";

const CHAPTER_RE = /^chapter\b/i;

export default {
  ...base,
  isChapterHeading: (text) => !!text && text.length <= 50 && CHAPTER_RE.test(text),
};
