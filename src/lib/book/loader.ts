import type { Book, BookMeta, Chunk } from "./model";

// Books are static JSON produced by the ingestion scripts, served from /public.
const base = (id: string) => `/data/books/${encodeURIComponent(id)}`;

export async function loadLibrary(): Promise<BookMeta[]> {
  const res = await fetch("/data/books/index.json");
  if (!res.ok) return [];
  return (await res.json()) as BookMeta[];
}

export async function loadBook(id: string): Promise<Book> {
  const res = await fetch(`${base(id)}/book.json`);
  if (!res.ok) throw new Error(`Failed to load book "${id}" (HTTP ${res.status})`);
  return (await res.json()) as Book;
}

export async function loadChunks(id: string): Promise<Chunk[]> {
  const res = await fetch(`${base(id)}/chunks.json`);
  if (!res.ok) return [];
  return (await res.json()) as Chunk[];
}

/** Resolve an asset path (e.g. "assets/3-foo.png") to a servable URL. */
export function assetUrl(bookId: string, src: string): string {
  return `${base(bookId)}/${src}`;
}
