import type { Chunk, Position } from "../book/model";
import { retrieve } from "../retrieval";
import type { ToolDefinition } from "./provider";

// The one tool we expose to the agent. The model decides when (and what) to
// search; spoiler-free scoping is enforced inside the executor.
export const SEARCH_BOOK: ToolDefinition = {
  name: "search_book",
  description:
    "Search the book for passages relevant to a query. Use whenever the answer depends on the text — to find a scene, look up a word in context, check who said what, recall what just happened, etc. Returns up to a few passages with their section heading. When spoiler-free reading is on, only passages up to where the reader currently is are searchable.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "What to search for. Best results when written in the book's original language (e.g. Chinese for a Chinese book). Can be a phrase, name, quote, or topic.",
      },
    },
    required: ["query"],
  },
};

export const ALL_TOOLS: ToolDefinition[] = [SEARCH_BOOK];

export interface ToolContext {
  chunks: Chunk[];
  spoilerFree: boolean;
  position: Position;
}

export function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): string {
  if (name === "search_book") {
    const q = typeof input.query === "string" ? input.query.trim() : "";
    if (!q) return "(Empty query — provide a non-empty search query.)";
    const hits = retrieve(q, ctx.chunks, {
      spoilerFree: ctx.spoilerFree,
      position: ctx.position,
      k: 5,
    });
    if (hits.length === 0) return "(No matching passages were found.)";
    return hits
      .map((c, i) => `[${i + 1}] ${c.sectionTitle}\n${c.text}`)
      .join("\n\n---\n\n");
  }
  return `(Unknown tool: ${name})`;
}
