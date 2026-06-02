// EPUB adapter. An EPUB is a zip of XHTML documents plus a manifest (OPF) that
// declares the reading order (spine). We unzip, follow the spine, parse each
// XHTML doc for headings/paragraphs/images, and copy referenced images to the
// book's assets dir.
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import * as cheerio from "cheerio";
import { makeBuilder, finalizeSections } from "./common.mjs";

const posix = (p) => p.replace(/\\/g, "/");
const dirname = (p) => posix(p).split("/").slice(0, -1).join("/");
const resolve = (base, rel) => {
  if (/^[a-z]+:\/\//i.test(rel)) return null; // external URL
  const parts = (base ? base + "/" : "").split("/").concat(rel.split("/"));
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
};

// A short, standalone paragraph that labels a chapter — "第一回：…", "Chapter IV",
// "Capítulo primero" — acts as a section break for EPUBs that carry no <h*> tags.
// Project Gutenberg's auto-generated books are like this: the chapter line is a
// plain <p> and the spine splits mid-chapter, so without this 120 chapters
// collapse into a few giant sections. The length guard keeps it off real prose.
const CHAPTER_RE =
  /^(第[〇○零一二三四五六七八九十百千兩两\d]+\s*[回章卷節节折齣出篇部](?:[:：、.\s]|$)|(chapter|cap[íi]tulo|canto)\b)/i;
const isChapterHeading = (text) => !!text && text.length <= 50 && CHAPTER_RE.test(text);

export async function extractEpub(filePath, { copyAssetBytes } = {}) {
  const bytes = new Uint8Array(await readFile(filePath));
  const files = unzipSync(bytes);
  const get = (p) => files[p] && strFromU8(files[p]);

  // 1. container.xml -> path to the OPF package document.
  const container = get("META-INF/container.xml");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("EPUB: cannot find OPF package document");
  const opfDir = dirname(opfPath);
  const $opf = cheerio.load(get(opfPath), { xmlMode: true });

  // 2. manifest: id -> { href (zip path), type }
  const manifest = {};
  $opf("manifest > item").each((_, el) => {
    const id = $opf(el).attr("id");
    const href = $opf(el).attr("href");
    if (id && href)
      manifest[id] = { href: resolve(opfDir, href), type: $opf(el).attr("media-type") || "" };
  });

  // 3. spine: ordered list of manifest ids to read.
  const spine = [];
  $opf("spine > itemref").each((_, el) => {
    const item = manifest[$opf(el).attr("idref")];
    if (item && /html/.test(item.type)) spine.push(item.href);
  });

  const b = makeBuilder();
  for (const docPath of spine) {
    const html = get(docPath);
    if (!html) continue;
    const docDir = dirname(docPath);
    const $ = cheerio.load(html);
    const root = $("body").length ? $("body") : $.root();

    root.find("h1,h2,h3,h4,p,li,blockquote,img").each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      const $el = $(el);
      if (/^h[1-4]$/.test(tag)) {
        b.startSection($el.text());
      } else if (tag === "p" || tag === "li" || tag === "blockquote") {
        // Containers that wrap other block elements (e.g. <blockquote><p>…)
        // are visited again via their children; emitting here would duplicate
        // the text, so skip them and let the inner blocks carry the content.
        if ($el.children("p,li,blockquote,div,ul,ol,table").length) return;
        if ($el.find("br").length) {
          // Verse/poetry: keep each <br>-separated visual line as its own
          // `line` block so the line breaks survive (clean() would otherwise
          // collapse them into one run-on paragraph).
          $el.find("br").replaceWith("\n");
          for (const line of $el.text().split("\n")) b.addText("line", line);
          return;
        }
        const text = $el.text().replace(/\s+/g, " ").trim();
        // A chapter-label paragraph starts a new section (titled by the label);
        // otherwise it's body text. Books with real <h*> tags never reach here
        // for their titles, so this only kicks in for heading-less EPUBs.
        if (isChapterHeading(text)) {
          b.startSection(text);
        } else {
          // Some sources don't break the chapter label into its own <p>, gluing
          // it onto the prior chapter's closing line ("…分解。第九十回：…"). Split
          // it back out when a sentence end is immediately followed by a label.
          const split = text.match(
            /^(.*[。！？!?]\s*)(第[〇○零一二三四五六七八九十百千兩两\d]+\s*[回章卷節节折齣出篇部][:：、.\s].*)$/,
          );
          if (split && isChapterHeading(split[2])) {
            b.addText("paragraph", split[1]);
            b.startSection(split[2]);
          } else {
            b.addText("paragraph", text);
          }
        }
      } else if (tag === "img" && copyAssetBytes) {
        const src = $el.attr("src");
        const zipPath = src && resolve(docDir, src);
        if (zipPath && files[zipPath]) {
          const rel = copyAssetBytes(zipPath.split("/").pop(), files[zipPath]);
          if (rel) b.addImage(rel, $el.attr("alt") || "");
        }
      }
    });
  }

  return finalizeSections(b.sections);
}
