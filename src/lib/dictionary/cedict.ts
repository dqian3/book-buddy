import type { Dictionary, DictEntry } from "./types";
import { toToneMarks } from "./pinyin";
import { kvGet, kvSet } from "../storage/db";

// Shape of public/data/dict/cc-cedict.json (produced by scripts/lang/zh/build-dict.mjs).
interface RawEntry {
  t?: string; // traditional, if different from the simplified headword
  p: string; // numeric pinyin
  d: string; // "/"-joined definitions
}
interface RawDict {
  maxLen: number;
  entries: Record<string, RawEntry[]>;
  trad: Record<string, string>; // traditional headword -> simplified key
}

const DICT_URL = "/data/dict/cc-cedict.json";
const CACHE_KEY = "cc-cedict-v1";

class CedictDictionary implements Dictionary {
  language = "zh";
  maxLen: number;
  private raw: RawDict;

  constructor(raw: RawDict) {
    this.raw = raw;
    this.maxLen = raw.maxLen;
  }

  has(word: string): boolean {
    return word in this.raw.entries || word in this.raw.trad;
  }

  lookup(word: string): DictEntry[] {
    let key = word;
    if (!(key in this.raw.entries) && key in this.raw.trad) {
      key = this.raw.trad[key];
    }
    const rows = this.raw.entries[key];
    if (!rows) return [];
    return rows.map((r) => ({
      word: key,
      traditional: r.t,
      pinyinNumeric: r.p,
      pinyin: toToneMarks(r.p),
      defs: r.d.split("/").filter(Boolean),
    }));
  }
}

let loading: Promise<Dictionary> | null = null;

/** Load CC-CEDICT once: from the IndexedDB cache if present, else fetch + cache. */
export function loadCedict(): Promise<Dictionary> {
  if (loading) return loading;
  loading = (async () => {
    const cached = await kvGet<RawDict>(CACHE_KEY);
    if (cached?.entries) return new CedictDictionary(cached);

    const res = await fetch(DICT_URL);
    if (!res.ok) throw new Error(`Failed to load dictionary (HTTP ${res.status})`);
    const raw = (await res.json()) as RawDict;
    void kvSet(CACHE_KEY, raw); // cache for next time (best-effort)
    return new CedictDictionary(raw);
  })();
  return loading;
}
