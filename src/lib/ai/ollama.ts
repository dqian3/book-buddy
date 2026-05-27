import type { AIProvider, ChatRequest } from "./provider";
import { readLines, ensureOk } from "./stream";

// Local Ollama (http://localhost:11434). Free + private. Streams newline-
// delimited JSON rather than SSE.
export function createOllamaProvider(cfg: { baseUrl: string; model: string }): AIProvider {
  const base = cfg.baseUrl.replace(/\/$/, "");
  return {
    id: "ollama",
    label: "Ollama",
    async chat({ system, messages, signal, onToken }: ChatRequest) {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          model: cfg.model,
          stream: true,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      await ensureOk(res, "Ollama");

      let full = "";
      for await (const line of readLines(res)) {
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          const delta = evt.message?.content;
          if (delta) {
            full += delta;
            onToken?.(delta);
          }
        } catch {
          /* ignore */
        }
      }
      return full;
    },
  };
}
