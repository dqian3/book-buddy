import type { AIProvider, ChatRequest } from "./provider";
import { readLines, ensureOk } from "./stream";

const API = "https://api.anthropic.com/v1/messages";

// Calls Anthropic directly from the browser (anthropic-dangerous-direct-browser-
// access). The persona system prompt is marked cache_control:ephemeral so repeat
// questions in a session reuse the cached prefix and cost less.
export function createClaudeProvider(cfg: { apiKey: string; model: string }): AIProvider {
  return {
    id: "claude",
    label: "Claude",
    async chat({ system, messages, signal, onToken }: ChatRequest) {
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
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      await ensureOk(res, "Claude");

      let full = "";
      for await (const line of readLines(res)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            full += evt.delta.text;
            onToken?.(evt.delta.text);
          } else if (evt.type === "error") {
            throw new Error(evt.error?.message || "Claude stream error");
          }
        } catch {
          /* ignore keep-alive / partial lines */
        }
      }
      return full;
    },
  };
}
