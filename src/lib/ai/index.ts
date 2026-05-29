import type { AIProvider } from "./provider";
import { createClaudeProvider } from "./claude";
import { createOpenAIProvider } from "./openai";
import { createOllamaProvider } from "./ollama";
import type { ProviderId, ProviderConfig } from "../../state/settings";

export type { AIProvider, ChatTurn, ChatRequest, ChatResult, MessagePart, ToolCall, ToolDefinition } from "./provider";

export interface ResolvedProvider {
  provider?: AIProvider;
  /** A user-facing reason the provider can't be used yet. */
  error?: string;
}

/** Build the configured provider, or explain what's missing. */
export function createProvider(id: ProviderId | "", cfg: ProviderConfig): ResolvedProvider {
  switch (id) {
    case "claude":
      if (!cfg.claude.apiKey) return { error: "Add your Anthropic API key in Settings to use Claude." };
      return { provider: createClaudeProvider(cfg.claude) };
    case "openai":
      if (!cfg.openai.apiKey) return { error: "Add your OpenAI API key in Settings." };
      return { provider: createOpenAIProvider(cfg.openai) };
    case "ollama":
      if (!cfg.ollama.baseUrl) return { error: "Set the Ollama server URL in Settings." };
      return { provider: createOllamaProvider(cfg.ollama) };
    default:
      return { error: "Choose an AI provider in Settings (Claude, OpenAI, or Ollama)." };
  }
}
