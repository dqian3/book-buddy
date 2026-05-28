import { useEffect, useRef, useState } from "react";
import type { Chunk } from "../lib/book/model";
import { useReader } from "../state/reader";
import { useChat } from "../state/chat";
import { useLibrary } from "../state/library";
import { useSettings } from "../state/settings";
import { createProvider, type ChatTurn } from "../lib/ai";
import { buildSystemPrompt, buildContextMessage } from "../lib/ai/prompts";
import { retrieve, visibleChunks } from "../lib/retrieval";
import { Panel } from "./common/ui";
import { IconSend, IconStop, IconTrash } from "./Icons";

// Evenly sample visible chunks — used for "summary so far" where no single
// passage is the target.
function sampleVisible(chunks: Chunk[], k: number): Chunk[] {
  if (chunks.length <= k) return chunks;
  const step = chunks.length / k;
  return Array.from({ length: k }, (_, i) => chunks[Math.floor(i * step)]);
}

const QUICK_ACTIONS = [
  { label: "Explain selection", build: (sel: string) => sel && `Explain this passage and its tricky words:\n「${sel}」` },
  { label: "Summary so far", mode: "summary" as const, build: () => "Give me a spoiler-free recap of what has happened up to where I am now." },
  { label: "Key vocabulary", build: (sel: string) => `List and explain the key vocabulary I should know${sel ? ` in:\n「${sel}」` : " around where I'm reading"}.` },
  { label: "Grammar / usage", build: (sel: string) => `Explain the grammar and sentence structure${sel ? ` of:\n「${sel}」` : " of the passage I'm reading"}.` },
];

export function ChatPanel() {
  const { book, chunks, sectionIndex, panel, setPanel, selection, consumeChatPrefill } = useReader();
  const { messages, add, update, clear } = useChat();
  const progress = useLibrary((s) => s.progress);
  const settings = useSettings();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = panel === "chat";
  const msgs = book ? messages(book.id) : [];

  // Pull in a prefilled question from a tap/selection action.
  useEffect(() => {
    if (!open) return;
    const pre = consumeChatPrefill();
    if (pre) setInput(pre);
  }, [open, consumeChatPrefill]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length, open]);

  if (!book) return null;

  const send = async (text: string, mode?: "summary") => {
    const userText = text.trim();
    if (!userText || busy) return;
    setInput("");

    const prior: ChatTurn[] = messages(book.id)
      .filter((m) => !m.pending && !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    add(book.id, { role: "user", content: userText });
    const asstId = add(book.id, { role: "assistant", content: "", pending: true });

    const { provider, error } = createProvider(settings.provider, settings.providerConfig);
    if (error || !provider) {
      update(book.id, asstId, { content: error ?? "No AI provider configured.", pending: false, error: true });
      return;
    }

    const position = progress[book.id] ?? { sectionIndex, blockIndex: 0 };
    const locationLabel = book.sections[position.sectionIndex]?.title;
    const ctxChunks =
      mode === "summary"
        ? sampleVisible(visibleChunks(chunks, settings.spoilerFree, position), 10)
        : retrieve(userText, chunks, { spoilerFree: settings.spoilerFree, position });

    const system = buildSystemPrompt({
      template: settings.systemTemplate,
      book: { title: book.title, author: book.author, language: book.language },
      explainIn: settings.explainIn,
      tone: settings.tone,
    });
    const contextMsg = buildContextMessage({ chunks: ctxChunks, spoilerFree: settings.spoilerFree, locationLabel });
    const apiMessages: ChatTurn[] = [...prior, { role: "user", content: `${contextMsg}\n\n${userText}` }];

    setBusy(true);
    abortRef.current = new AbortController();
    let acc = "";
    try {
      await provider.chat({
        system,
        messages: apiMessages,
        signal: abortRef.current.signal,
        onToken: (delta) => {
          acc += delta;
          update(book.id, asstId, { content: acc, pending: true });
        },
      });
      update(book.id, asstId, { content: acc, pending: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const aborted = msg.includes("abort");
      update(book.id, asstId, {
        content: acc || (aborted ? "(stopped)" : `⚠️ ${msg}`),
        pending: false,
        error: !aborted && !acc,
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  return (
    <Panel
      open={open}
      onClose={() => setPanel(null)}
      title={
        <div className="flex items-center gap-2">
          <span>AI assistant</span>
          <button
            onClick={() => settings.update({ spoilerFree: !settings.spoilerFree })}
            className={`rounded-full px-2 py-0.5 text-xs ${settings.spoilerFree ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}
            title="When on, the AI only sees what you've already read"
          >
            {settings.spoilerFree ? "spoiler-free" : "full book"}
          </button>
        </div>
      }
      footer={
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((a) => {
              const text = a.build(selection?.text ?? "");
              if (!text) return null;
              return (
                <button
                  key={a.label}
                  disabled={busy}
                  onClick={() => send(text, a.mode)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about a word, line, or the story…"
              className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            {busy ? (
              <button type="button" onClick={stop} className="rounded-xl bg-slate-200 p-2.5 text-slate-700 dark:bg-slate-700 dark:text-slate-200" aria-label="Stop">
                <IconStop className="h-5 w-5" />
              </button>
            ) : (
              <button type="submit" className="rounded-xl bg-sky-600 p-2.5 text-white hover:bg-sky-700 disabled:opacity-50" disabled={!input.trim()} aria-label="Send">
                <IconSend className="h-5 w-5" />
              </button>
            )}
          </form>
        </div>
      }
    >
      <div ref={listRef} className="space-y-3">
        {msgs.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ask me to explain a word, translate a line, or recap the story. I’ll use the book for context
            {settings.spoilerFree ? " — and stay spoiler-free, only using what you've read." : "."}
          </p>
        )}
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-sky-600 text-white"
                : m.error
                  ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                  : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{m.content || (m.pending ? "…" : "")}</p>
          </div>
        ))}
      </div>
      {msgs.length > 0 && (
        <button onClick={() => clear(book.id)} className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-red-500">
          <IconTrash className="h-3.5 w-3.5" /> Clear conversation
        </button>
      )}
    </Panel>
  );
}
