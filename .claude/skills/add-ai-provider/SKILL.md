---
name: add-ai-provider
description: Add a new AI chat provider (e.g. Gemini, a custom/OpenAI-compatible endpoint, Azure) to Babel Book Buddy's assistant. Use when the user wants the assistant to support another LLM backend, or asks how providers/streaming/the chat backend are wired.
---

# Add an AI provider to Babel Book Buddy

The assistant talks to a pluggable provider that runs **directly from the browser**
(no backend/proxy). All providers implement one interface and are selected in Settings.

## The interface (`src/lib/ai/provider.ts`)

```ts
interface AIProvider {
  id: string;
  label: string;
  chat(req: ChatRequest): Promise<string>; // resolves with full text
}
// ChatRequest: { system, messages: ChatTurn[], signal?: AbortSignal, onToken?(delta) }
```

`chat()` must **stream**: call `onToken(delta)` for each text chunk as it arrives, honor
`signal` for cancellation (abort errors are handled upstream), and resolve with the
complete text. Study `src/lib/ai/openai.ts` (SSE) and `ollama.ts`; reuse the SSE parser
in `src/lib/ai/stream.ts`. Many backends are OpenAI-compatible — if so, the openai
provider may work as-is just by changing `baseUrl`.

## Steps

1. **Create the provider** `src/lib/ai/<name>.ts` exporting
   `create<Name>Provider(cfg)` that returns an `AIProvider`. Parse the backend's
   streaming format and forward deltas via `onToken`.

2. **Register it** in `src/lib/ai/index.ts#createProvider`: add a `case` that checks
   for required config (key/URL) and returns either `{ provider }` or a user-facing
   `{ error }` string explaining what's missing (this string is shown in the chat
   panel — match the tone of the existing cases).

3. **Add config to the settings store** (`src/state/settings.ts`): extend
   `ProviderId`, `ProviderConfig`, the `DEFAULT_MODELS`/`providerConfig` defaults, and
   the persisted shape. Settings persist to `localStorage["bbb-settings"]` — adding
   fields is backward-compatible, but renaming/removing breaks existing users' saved
   config.

4. **Add UI** in `src/components/Settings.tsx`: a `PROVIDERS` entry and a config block
   (API key / model / base URL fields) shown when the provider is selected, mirroring
   the existing claude/openai/ollama blocks.

## How the provider is called (`src/components/ChatPanel.tsx`)

You usually don't change this, but know the contract your provider must satisfy: on
send, the app builds `system` via `buildSystemPrompt`, retrieves spoiler-scoped context
into the last user message via `buildContextMessage`, then calls
`provider.chat({ system, messages, signal, onToken })` and renders streamed tokens
live. Your provider just needs to deliver `system` + `messages` to the backend and
stream text back.

## Verify

There is no automated test harness. Run the app, open **Settings**, select the new
provider and fill in its config, then open the AI assistant and send a message:

```bash
npm run dev
```

Confirm the reply **streams** in token-by-token, that **Stop** cancels mid-stream
(the `signal`/abort path), and that a missing key/URL shows your `createProvider`
error string instead of crashing. To inspect the exact request without a real
backend, point an OpenAI-compatible provider's base URL at a local mock server that
logs the body and streams a canned SSE reply.
