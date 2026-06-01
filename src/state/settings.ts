import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SYSTEM_TEMPLATE, type ExplainIn } from "../lib/ai/prompts";

export type ProviderId = "claude" | "openai" | "ollama";
export type ThemePref = "light" | "dark" | "system";
export type TtsEngine = "browser" | "openai";

export interface ProviderConfig {
  claude: { apiKey: string; model: string };
  openai: { apiKey: string; model: string; baseUrl: string };
  ollama: { baseUrl: string; model: string };
}

export const DEFAULT_MODELS = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-4o",
  ollama: "qwen2.5",
} as const;

export interface SettingsState {
  // Reading
  theme: ThemePref;
  fontScale: number;
  showPinyin: boolean;
  hoverTranslate: boolean;

  // TTS
  ttsEngine: TtsEngine;
  ttsRate: number;
  ttsVoiceURI: string | null;
  ttsOpenAIVoice: string;
  ttsOpenAIModel: string;

  // AI
  spoilerFree: boolean;
  provider: ProviderId | "";
  providerConfig: ProviderConfig;
  explainIn: ExplainIn;
  tone: string;
  systemTemplate: string;

  // actions
  update: (partial: Partial<SettingsState>) => void;
  setProviderConfig: <K extends ProviderId>(id: K, partial: Partial<ProviderConfig[K]>) => void;
  resetPrompt: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      fontScale: 1.1,
      showPinyin: true,
      hoverTranslate: false,

      ttsEngine: "browser",
      ttsRate: 1,
      ttsVoiceURI: null,
      ttsOpenAIVoice: "alloy",
      ttsOpenAIModel: "gpt-4o-mini-tts",

      spoilerFree: true,
      provider: "",
      providerConfig: {
        claude: { apiKey: "", model: DEFAULT_MODELS.claude },
        openai: { apiKey: "", model: DEFAULT_MODELS.openai, baseUrl: "https://api.openai.com/v1" },
        ollama: { baseUrl: "http://localhost:11434", model: DEFAULT_MODELS.ollama },
      },
      explainIn: "user",
      tone: "",
      systemTemplate: DEFAULT_SYSTEM_TEMPLATE,

      update: (partial) => set(partial),
      setProviderConfig: (id, partial) =>
        set((s) => ({
          providerConfig: { ...s.providerConfig, [id]: { ...s.providerConfig[id], ...partial } },
        })),
      resetPrompt: () => set({ systemTemplate: DEFAULT_SYSTEM_TEMPLATE }),
    }),
    { name: "bbb-settings" }
  )
);
