export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Normalized message part. Providers translate to/from their wire format. */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ChatTurn {
  role: "user" | "assistant";
  /** Plain string is sugar for `[{ type: "text", text }]`. */
  content: string | MessagePart[];
}

export interface ChatRequest {
  system: string;
  messages: ChatTurn[];
  tools?: ToolDefinition[];
  signal?: AbortSignal;
  /** Called with each streamed text delta. */
  onToken?: (delta: string) => void;
}

export interface ChatResult {
  /** Full assistant text emitted in this turn (concatenated text parts). */
  text: string;
  /** Tool calls the model wants run before continuing. */
  toolCalls: ToolCall[];
  /** True if the model stopped to wait for tool results. */
  needsTools: boolean;
}

export interface AIProvider {
  id: string;
  label: string;
  /** Stream one assistant turn. May return text, tool calls, or both. */
  chat(req: ChatRequest): Promise<ChatResult>;
}
