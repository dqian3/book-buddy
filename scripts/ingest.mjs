#!/usr/bin/env node
// General-purpose book ingestion CLI.
//
//   node scripts/ingest.mjs <file> --lang zh [--id slug] [--title T] [--author A]
//
// Dispatches by file extension to an adapter, normalizes to the document model,
// builds retrieval chunks, copies any image assets, and writes:
//   public/data/books/<id>/{book.json, chunks.json, assets/...}
// and updates public/data/books/index.json (the library list).
import { basename, extname, join } from "node:path";
import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildChunks, writeBook, summarize } from "./extract/common.mjs";
import { extractHtml } from "./extract/html.mjs";
import { extractEpub } from "./extract/epub.mjs";
import { extractPdf } from "./extract/pdf.mjs";
import { extractTxt } from "./extract/txt.mjs";
import { resolveProfile } from "./profiles/index.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BOOKS_DIR = join(ROOT, "public/data/books");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function slugify(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "book"
  );
}

async function updateIndex(meta) {
  const indexPath = join(BOOKS_DIR, "index.json");
  let list = [];
  if (existsSync(indexPath)) {
    try {
      list = JSON.parse(await readFile(indexPath, "utf8"));
    } catch {
      list = [];
    }
  }
  list = list.filter((m) => m.id !== meta.id);
  list.push(meta);
  list.sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(indexPath, JSON.stringify(list, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file) {
    console.error("Usage: node scripts/ingest.mjs <file> --lang <code> [--id slug] [--title T] [--author A] [--profile name]");
    process.exit(1);
  }
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const ext = extname(file).toLowerCase().slice(1);
  const language = args.lang || "en";
  const title = args.title || basename(file, extname(file));
  const author = args.author || "";
  const id = args.id || slugify(title);
  // base ← lang/<code> ← book/<profile>; supplies language- and book-specific
  // extraction hooks (chapter detection, heading cleanup) to the format adapters.
  const profile = await resolveProfile({ lang: language, profile: args.profile });
  const outDir = join(BOOKS_DIR, id);
  const assetsDir = join(outDir, "assets");

  // Asset copiers passed to adapters; both return the public-relative path.
  let assetN = 0;
  const ensureAssets = async () => mkdir(assetsDir, { recursive: true });
  const copyAsset = (srcPath) => {
    // For HTML: src may be a path relative to the source file's dir.
    const name = `${assetN++}-${basename(srcPath)}`;
    const abs = join(file, "..", srcPath);
    if (!existsSync(abs)) return null;
    ensureAssets().then(() => copyFile(abs, join(assetsDir, name)));
    return `assets/${name}`;
  };
  const copyAssetBytes = (name, bytes) => {
    const fname = `${assetN++}-${name}`;
    ensureAssets().then(() => writeFile(join(assetsDir, fname), Buffer.from(bytes)));
    return `assets/${fname}`;
  };

  console.log(
    `Ingesting ${file} (format=${ext}, lang=${language}, id=${id}${args.profile ? `, profile=${args.profile}` : ""})…`,
  );

  let sections;
  switch (ext) {
    case "html":
    case "htm":
    case "xhtml":
      sections = await extractHtml(file, { copyAsset, profile });
      break;
    case "epub":
      sections = await extractEpub(file, { copyAssetBytes, profile });
      break;
    case "pdf":
      sections = await extractPdf(file);
      break;
    case "txt":
    case "text":
    case "md":
      sections = await extractTxt(file);
      break;
    default:
      console.error(`Unsupported format: .${ext} (try html, epub, pdf, txt)`);
      process.exit(1);
  }

  if (!sections.length) {
    console.error("No content extracted. For scanned PDFs, OCR is required (not supported).");
    process.exit(1);
  }

  const book = {
    id,
    title,
    author,
    language,
    source: { format: ext, file: basename(file) },
    sections,
  };
  const chunks = buildChunks(sections);

  await writeBook(outDir, book, chunks);
  await updateIndex({ id, title, author, language });

  console.log(`✓ ${summarize(book, chunks)}`);
  console.log(`  → ${join("public/data/books", id)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
