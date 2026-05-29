import type { AIProvider, ChatRequest, ChatResult, ChatTurn, MessagePart, ToolCall } from "./provider";
import { readLines, ensureOk } from "./stream";

// Translate a normalized turn into the OpenAI chat-completions format. A user
// turn containing tool_result parts is expanded into one OpenAI "tool" message
// per result; an assistant turn with tool_use parts becomes an assistant
// message with `tool_calls`.
function toOpenAIMessages(turn: ChatTurn): Array<Record<string, unknown>> {
  if (typeof turn.content === "string") {
    return [{ role: turn.role, content: turn.content }];
  }
  const parts: MessagePart[] = turn.content;

  if (turn.role === "user") {
    const out: Array<Record<string, unknown>> = [];
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (text) out.push({ role: "user", content: text });
    for (const p of parts) {
      if (p.type === "tool_result")
        out.push({ role: "tool", tool_call_id: p.tool_use_id, content: p.content });
    }
    return out;
  }

  // assistant
  const text = parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
  const toolCalls = parts
    .filter((p): p is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => p.type === "tool_use")
    .map((p) => ({
      id: p.id,
      type: "function",
      function: { name: p.name, arguments: JSON.stringify(p.input) },
    }));
  const msg: Record<string, unknown> = { role: "assistant", content: text || null };
  if (toolCalls.length) msg.tool_calls = toolCalls;
  return [msg];
}

export function createOpenAIProvider(cfg: { apiKey: string; model: string; baseUrl: string }): AIProvider {
  const base = cfg.baseUrl.replace(/\/$/, "");
  return {
    id: "openai",
    label: "OpenAI",
    async chat({ system, messages, tools, signal, onToken }: ChatRequest): Promise<ChatResult> {
      const apiMessages: Array<Record<string, unknown>> = [{ role: "system", content: system }];
      for (const t of messages) apiMessages.push(...toOpenAIMessages(t));

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
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
      await ensureOk(res, "OpenAI");

      // Tool-call deltas arrive piecewise indexed by `index` — accumulate name/
      // arguments per slot, finalize when the stream ends.
      const pending = new Map<number, { id: string; name: string; argBuf: string }>();
      let text = "";
      let finish: string | null = null;

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
        const choice = evt.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === "string" && delta.content) {
          text += delta.content;
          onToken?.(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
            const slot = pending.get(idx) ?? { id: "", name: "", argBuf: "" };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (typeof tc.function?.arguments === "string") slot.argBuf += tc.function.arguments;
            pending.set(idx, slot);
          }
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }

      const toolCalls: ToolCall[] = Array.from(pending.values())
        .filter((s) => s.name)
        .map((s) => {
          let input: Record<string, unknown> = {};
          try {
            input = s.argBuf ? JSON.parse(s.argBuf) : {};
          } catch {
            /* malformed JSON — leave empty */
          }
          return { id: s.id || `call_${s.name}_${Math.random().toString(36).slice(2, 8)}`, name: s.name, input };
        });

      return { text, toolCalls, needsTools: finish === "tool_calls" && toolCalls.length > 0 };
    },
  };
}
