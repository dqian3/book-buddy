import type { Chunk, Position } from "../book/model";
import { isAtOrBefore } from "../book/model";
import { scoreChunks } from "./lexical";

export interface RetrieveOptions {
  spoilerFree: boolean;
  /** Reader's current position; required when spoilerFree is on. */
  position?: Position;
  /** Max chunks to return. */
  k?: number;
}

/**
 * Chunks visible to the reader given the spoiler setting. A chunk counts as
 * visible if it *starts* at or before the reader's position — this includes the
 * chunk they're currently inside (so chapter starts still have context) while
 * excluding anything further ahead.
 */
export function visibleChunks(chunks: Chunk[], spoilerFree: boolean, position?: Position): Chunk[] {
  if (!spoilerFree || !position) return chunks;
  return chunks.filter((c) =>
    isAtOrBefore({ sectionIndex: c.sectionIndex, blockIndex: c.startBlock }, position)
  );
}

/**
 * Retrieve the most relevant passages for a query, scoped to what the reader is
 * allowed to see. Falls back to the chunks nearest the current position when the
 * query has no lexical overlap (e.g. a very short selection).
 */
export function retrieve(query: string, chunks: Chunk[], opts: RetrieveOptions): Chunk[] {
  const k = opts.k ?? 6;
  const pool = visibleChunks(chunks, opts.spoilerFree, opts.position);
  const scored = scoreChunks(query, pool);
  if (scored.length > 0) return scored.slice(0, k).map((s) => s.item);

  // No lexical hits: give the model the reader's immediate surroundings.
  if (opts.position) {
    const here = pool
      .map((c, i) => ({ c, i, d: Math.abs(c.sectionIndex - opts.position!.sectionIndex) }))
      .sort((a, b) => a.d - b.d || b.i - a.i)
      .slice(0, Math.min(3, k))
      .map((x) => x.c);
    return here;
  }
  return pool.slice(0, Math.min(3, k));
}
