// Chinese extraction profile. Many Chinese EPUBs (e.g. Project Gutenberg's
// auto-generated books) carry no <h*> tags — the chapter line is a plain <p>
// like "第一回：…" and the spine splits mid-chapter, so without heading detection
// 120 chapters collapse into a few giant sections.
import base from "../base.mjs";

// A standalone "第N回/章/卷…" label. The length guard keeps it off real prose.
const CHAPTER_RE = /^第[〇○零一二三四五六七八九十百千兩两\d]+\s*[回章卷節节折齣出篇部](?:[:：、.\s]|$)/;
const isChapterHeading = (text) => !!text && text.length <= 50 && CHAPTER_RE.test(text);

// Some sources don't break the chapter label into its own <p>, gluing it onto
// the prior chapter's closing line ("…分解。第九十回：…"). This pulls it back out
// when a sentence end is immediately followed by a label.
const GLUED_RE =
  /^(.*[。！？!?]\s*)(第[〇○零一二三四五六七八九十百千兩两\d]+\s*[回章卷節节折齣出篇部][:：、.\s].*)$/;

export default {
  ...base,
  isChapterHeading,
  splitGluedHeading: (text) => {
    const m = text.match(GLUED_RE);
    return m && isChapterHeading(m[2]) ? [m[1], m[2]] : null;
  },
};
