import { openDB, type IDBPDatabase } from "idb";

// A tiny key/value store in IndexedDB. We use it for the one piece of data too
// big for localStorage: the parsed CC-CEDICT dictionary (~tens of MB in memory).
// Small reactive state (settings, progress, bookmarks, vocab, chat) lives in
// localStorage via the zustand stores.

const DB_NAME = "babel-book-buddy";
const STORE = "kv";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
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
