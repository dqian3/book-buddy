import type { AIProvider, ChatRequest, ChatResult, ChatTurn, MessagePart, ToolCall } from "./provider";
import { readLines, ensureOk } from "./stream";

const API = "https://api.anthropic.com/v1/messages";

// Translate a normalized turn into Claude's content-block format. Plain strings
// become a single text block; structured parts pass through.
function toClaudeMessage(turn: ChatTurn) {
  const parts: MessagePart[] =
    typeof turn.content === "string" ? [{ type: "text", text: turn.content }] : turn.content;
  return {
    role: turn.role,
    content: parts.map((p) => {
      if (p.type === "text") return { type: "text", text: p.text };
      if (p.type === "tool_use")
        return { type: "tool_use", id: p.id, name: p.name, input: p.input };
      return { type: "tool_result", tool_use_id: p.tool_use_id, content: p.content };
    }),
  };
}

// Calls Anthropic directly from the browser (anthropic-dangerous-direct-browser-
// access). The persona system prompt is marked cache_control:ephemeral so repeat
// questions in a session reuse the cached prefix and cost less.
export function createClaudeProvider(cfg: { apiKey: string; model: string }): AIProvider {
  return {
    id: "claude",
    label: "Claude",
    async chat({ system, messages, tools, signal, onToken }: ChatRequest): Promise<ChatResult> {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        signal,
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: 1024,
          stream: true,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: messages.map(toClaudeMessage),
          ...(tools && tools.length
            ? {
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.input_schema,
                })),
              }
            : {}),
        }),
      });
      await ensureOk(res, "Claude");

      // Claude streams typed events. Track each in-flight content block by its
      // index so we can route text deltas to the text accumulator and JSON
      // deltas to the matching tool_use accumulator.
      type Block =
        | { kind: "text" }
        | { kind: "tool_use"; id: string; name: string; jsonBuf: string };
      const blocks = new Map<number, Block>();
      const toolCalls: ToolCall[] = [];
      let text = "";
      let needsTools = false;
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const line of readLines(res)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let evt: any;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (evt.type === "message_start") {
          // input_tokens here count the (cached) prompt; output grows as we stream.
          inputTokens = evt.message?.usage?.input_tokens ?? 0;
        } else if (evt.type === "content_block_start") {
          const cb = evt.content_block;
          if (cb?.type === "text") blocks.set(evt.index, { kind: "text" });
          else if (cb?.type === "tool_use")
            blocks.set(evt.index, { kind: "tool_use", id: cb.id, name: cb.name, jsonBuf: "" });
        } else if (evt.type === "content_block_delta") {
          const blk = blocks.get(evt.index);
          if (!blk) continue;
          if (blk.kind === "text" && evt.delta?.type === "text_delta") {
            text += evt.delta.text;
            onToken?.(evt.delta.text);
          } else if (blk.kind === "tool_use" && evt.delta?.type === "input_json_delta") {
            blk.jsonBuf += evt.delta.partial_json ?? "";
          }
        } else if (evt.type === "content_block_stop") {
          const blk = blocks.get(evt.index);
          if (blk?.kind === "tool_use") {
            let input: Record<string, unknown> = {};
            try {
              input = blk.jsonBuf ? JSON.parse(blk.jsonBuf) : {};
            } catch {
              /* leave empty — the executor will report the bad input */
            }
            toolCalls.push({ id: blk.id, name: blk.name, input });
          }
        } else if (evt.type === "message_delta") {
          if (evt.delta?.stop_reason === "tool_use") needsTools = true;
          if (evt.usage?.output_tokens) outputTokens = evt.usage.output_tokens;
        } else if (evt.type === "error") {
          throw new Error(evt.error?.message || "Claude stream error");
        }
      }

      return {
        text,
        toolCalls,
        needsTools: needsTools && toolCalls.length > 0,
        usage: { inputTokens, outputTokens },
      };
    },
  };
}
