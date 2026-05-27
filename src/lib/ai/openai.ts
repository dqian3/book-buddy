import type { AIProvider, ChatRequest } from "./provider";
import { readLines, ensureOk } from "./stream";

export function createOpenAIProvider(cfg: { apiKey: string; model: string; baseUrl: string }): AIProvider {
  const base = cfg.baseUrl.replace(/\/$/, "");
  return {
    id: "openai",
    label: "OpenAI",
    async chat({ system, messages, signal, onToken }: ChatRequest) {
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
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      await ensureOk(res, "OpenAI");

      let full = "";
      for await (const line of readLines(res)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onToken?.(delta);
          }
        } catch {
          /* ignore partial lines */
        }
      }
      return full;
    },
  };
}
