// Read an HTTP streaming body line by line (works for both SSE "data:" streams
// and Ollama's newline-delimited JSON).
export async function* readLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      yield buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

export async function ensureOk(res: Response, provider: string): Promise<void> {
  if (res.ok) return;
  let detail = "";
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }
  throw new Error(`${provider} error (HTTP ${res.status}): ${detail.slice(0, 300)}`);
}
