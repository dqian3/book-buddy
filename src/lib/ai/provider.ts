export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
  /** Called with each streamed text delta. */
  onToken?: (delta: string) => void;
}

export interface AIProvider {
  id: string;
  label: string;
  /** Stream a completion; resolves with the full text. */
  chat(req: ChatRequest): Promise<string>;
}
