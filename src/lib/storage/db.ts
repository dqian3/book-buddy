import { openDB, type IDBPDatabase } from "idb";

// A tiny key/value store in IndexedDB. We use it for the one piece of data too
// big for localStorage: the parsed CC-CEDICT dictionary (~tens of MB in memory).
// Small reactive state (settings, progress, bookmarks, vocab, chat) lives in
// localStorage via the zustand stores.

const DB_NAME = "babel-book-buddy";
const STORE = "kv";
const TTS_STORE = "tts"; // cached OpenAI speech clips (Blobs), keyed by model:voice:hash

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
        if (!database.objectStoreNames.contains(TTS_STORE)) {
          database.createObjectStore(TTS_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return (await db()).get(STORE, key) as Promise<T | undefined>;
  } catch {
    return undefined;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  try {
    await (await db()).put(STORE, value, key);
  } catch {
    // Best-effort cache; ignore quota/availability errors.
  }
}

// --- TTS audio clip cache (Blobs) ----------------------------------------

export async function ttsGet(key: string): Promise<Blob | undefined> {
  try {
    return (await db()).get(TTS_STORE, key) as Promise<Blob | undefined>;
  } catch {
    return undefined;
  }
}

export async function ttsPut(key: string, blob: Blob): Promise<void> {
  try {
    await (await db()).put(TTS_STORE, blob, key);
  } catch {
    // Best-effort cache; ignore quota/availability errors.
  }
}

/** Number of cached clips and their total size in bytes. */
export async function ttsCacheStats(): Promise<{ count: number; bytes: number }> {
  try {
    const all = (await (await db()).getAll(TTS_STORE)) as Blob[];
    return { count: all.length, bytes: all.reduce((sum, b) => sum + (b?.size ?? 0), 0) };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function ttsCacheClear(): Promise<void> {
  try {
    await (await db()).clear(TTS_STORE);
  } catch {
    // ignore
  }
}
