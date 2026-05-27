#!/usr/bin/env node
// Downloads CC-CEDICT (MDBG) and builds a compact lookup index for the app.
//
// Output: public/data/dict/cc-cedict.json
//   {
//     maxLen: <longest headword length, in chars>,
//     entries: { "<simplified>": [ { t?, p, d } ... ] },  // t=traditional (if differs)
//     trad:    { "<traditional>": "<simplified>" }          // redirect for trad-script
//   }
// Pinyin (`p`) is kept in CC-CEDICT's numeric form (e.g. "hao3"); tone marks are
// rendered in the app (src/lib/dictionary/pinyin.ts). CC-CEDICT is CC-BY-SA.
import { gunzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz";
const OUT_DIR = fileURLToPath(new URL("../public/data/dict", import.meta.url));

async function main() {
  console.log(`Downloading CC-CEDICT…\n  ${CEDICT_URL}`);
  const res = await fetch(CEDICT_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const text = gunzipSync(gz).toString("utf8");
  console.log(`Downloaded ${(gz.length / 1e6).toFixed(1)}MB, parsing…`);

  // Line format:  TRAD SIMP [pin1 yin1] /def 1/def 2/.../
  const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;
  const entries = Object.create(null);
  const trad = Object.create(null);
  let maxLen = 1;
  let count = 0;

  for (const line of text.split("\n")) {
    if (!line || line[0] === "#") continue;
    const m = line.match(LINE);
    if (!m) continue;
    const [, tr, simp, pinyin, defsRaw] = m;
    const defs = defsRaw.split("/").filter(Boolean).join("/");
    const entry = { p: pinyin, d: defs };
    if (tr !== simp) {
      entry.t = tr;
      if (!trad[tr]) trad[tr] = simp;
    }
    (entries[simp] ||= []).push(entry);
    maxLen = Math.max(maxLen, [...simp].length, [...tr].length);
    count++;
  }

  const payload = { maxLen, entries, trad };
  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "cc-cedict.json");
  const json = JSON.stringify(payload);
  await writeFile(outPath, json);

  console.log(
    `✓ ${count} entries, ${Object.keys(entries).length} headwords, maxLen=${maxLen}`
  );
  console.log(`  → public/data/dict/cc-cedict.json (${(json.length / 1e6).toFixed(1)}MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
