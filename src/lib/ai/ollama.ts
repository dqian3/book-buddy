import type { AIProvider, ChatRequest, ChatResult, ChatTurn, MessagePart, ToolCall } from "./provider";
import { readLines, ensureOk } from "./stream";

// Translate a normalized turn into Ollama's chat format (OpenAI-ish: tool
// results become `role:"tool"` messages, assistant tool calls go on the
// assistant message under `tool_calls`).
function toOllamaMessages(turn: ChatTurn): Array<Record<string, unknown>> {
  if (typeof turn.content === "string") return [{ role: turn.role, content: turn.content }];
  const parts: MessagePart[] = turn.content;

  if (turn.role === "user") {
    const out: Array<Record<string, unknown>> = [];
    const text = parts.filter((p) => p.type === "text").map((p) => (p as any).text).join("");
    if (text) out.push({ role: "user", content: text });
    for (const p of parts) {
      if (p.type === "tool_result") out.push({ role: "tool", content: p.content });
    }
    return out;
  }
  const text = parts.filter((p) => p.type === "text").map((p) => (p as any).text).join("");
  const toolCalls = parts
    .filter((p): p is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => p.type === "tool_use")
    .map((p) => ({ function: { name: p.name, arguments: p.input } }));
  const msg: Record<string, unknown> = { role: "assistant", content: text };
  if (toolCalls.length) msg.tool_calls = toolCalls;
  return [msg];
}

// Local Ollama (http://localhost:11434). Free + private. Streams newline-
// delimited JSON rather than SSE. Tool calls typically arrive whole (not
// piecewise) in the final message.
export function createOllamaProvider(cfg: { baseUrl: string; model: string }): AIProvider {
  const base = cfg.baseUrl.replace(/\/$/, "");
  return {
    id: "ollama",
    label: "Ollama",
    async chat({ system, messages, tools, signal, onToken }: ChatRequest): Promise<ChatResult> {
      const apiMessages: Array<Record<string, unknown>> = [{ role: "system", content: system }];
      for (const t of messages) apiMessages.push(...toOllamaMessages(t));

      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          model: cfg.model,
          stream: true,
          messages: apiMessages,
          ...(tools && tools.length
            ? {
                tools: tools.map((t) => ({
                  type: "function",
                  function: { name: t.name, description: t.description, parameters: t.input_schema },
                })),
              }
            : {}),
        }),
      });
      await ensureOk(res, "Ollama");

      const toolCalls: ToolCall[] = [];
      let text = "";

      for await (const line of readLines(res)) {
        if (!line) continue;
        let evt: any;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        const delta = evt.message?.content;
        if (typeof delta === "string" && delta) {
          text += delta;
          onToken?.(delta);
        }
        const calls = evt.message?.tool_calls;
        if (Array.isArray(calls)) {
          for (const c of calls) {
            const name = c.function?.name;
            if (!name) continue;
            const rawArgs = c.function?.arguments;
            let input: Record<string, unknown> = {};
            if (rawArgs && typeof rawArgs === "object") input = rawArgs as Record<string, unknown>;
            else if (typeof rawArgs === "string") {
              try {
                input = JSON.parse(rawArgs);
              } catch {
                /* leave empty */
              }
            }
            toolCalls.push({
              id: c.id ?? `call_${name}_${Math.random().toString(36).slice(2, 8)}`,
              name,
              input,
            });
          }
        }
      }

      return { text, toolCalls, needsTools: toolCalls.length > 0 };
    },
  };
}
