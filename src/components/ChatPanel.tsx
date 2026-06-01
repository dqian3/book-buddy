import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReader } from "../state/reader";
import { useChat } from "../state/chat";
import { useLibrary } from "../state/library";
import { useSettings } from "../state/settings";
import { useUsage } from "../state/usage";
import { createProvider, type ChatTurn, type MessagePart } from "../lib/ai";
import { buildSystemPrompt } from "../lib/ai/prompts";
import { ALL_TOOLS, executeTool, type ToolContext } from "../lib/ai/tools";
import { isTextBlock } from "../lib/book/model";
import { Panel } from "./common/ui";
import { IconSend, IconStop, IconTrash, IconPlus } from "./Icons";

const QUICK_ACTIONS = [
  { label: "Explain selection", build: (sel: string) => sel && `Explain this passage and its tricky words:\n「${sel}」` },
  { label: "Summary so far", build: () => "Give me a spoiler-free recap of what has happened up to where I am now." },
  { label: "Key vocabulary", build: (sel: string) => `List and explain the key vocabulary I should know${sel ? ` in:\n「${sel}」` : " around where I'm reading"}.` },
  { label: "Grammar / usage", build: (sel: string) => `Explain the grammar and sentence structure${sel ? ` of:\n「${sel}」` : " of the passage I'm reading"}.` },
];

// Cap so a runaway model can't loop forever.
const MAX_AGENT_STEPS = 5;

export function ChatPanel() {
  const { book, chunks, sectionIndex, panel, setPanel, selection, consumeChatPrefill } = useReader();
  const newChat = useChat((s) => s.newChat);
  const setActiveChat = useChat((s) => s.setActive);
  const addMessage = useChat((s) => s.addMessage);
  const updateMessage = useChat((s) => s.updateMessage);
  const deleteChat = useChat((s) => s.deleteChat);
  const conversations = useChat((s) => (book ? s.conversations[book.id] : undefined));
  const activeChatId = useChat((s) => (book ? s.activeId[book.id] : undefined));
  const progress = useLibrary((s) => s.progress);
  const settings = useSettings();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = panel === "chat";
  const convList = useMemo(() => [...(conversations ?? [])].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);
  const activeConv = (conversations ?? []).find((c) => c.id === activeChatId) ?? null;
  const msgs = activeConv?.messages ?? [];

  // Pull in a prefilled question from a tap/selection action. If the caller
  // asked for auto-submit (e.g. the highlight bar's "Explain"), skip the
  // composer and fire the request straight away.
  useEffect(() => {
    if (!open || !book) return;
    const pre = consumeChatPrefill();
    if (!pre) return;
    if (pre.newChat) newChat(book.id); // highlight actions start a fresh conversation
    if (pre.autoSubmit) send(pre.text);
    else setInput(pre.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book, consumeChatPrefill]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs.length, open]);

  if (!book) return null;

  const send = async (text: string) => {
    const userText = text.trim();
    if (!userText || busy) return;
    setInput("");

    // Conversation history we send to the model — only finalized text turns.
    // Within-turn tool traffic is ephemeral and not persisted.
    const prior: ChatTurn[] = (useChat.getState().active(book.id)?.messages ?? [])
      .filter((m) => !m.pending && !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    addMessage(book.id, { role: "user", content: userText });
    const asstId = addMessage(book.id, { role: "assistant", content: "", pending: true });

    const { provider, error } = createProvider(settings.provider, settings.providerConfig);
    if (error || !provider) {
      updateMessage(book.id, asstId, { content: error ?? "No AI provider configured.", pending: false, error: true });
      return;
    }

    const chatModel = settings.providerConfig[provider.id as keyof typeof settings.providerConfig]?.model ?? provider.id;

    const position = progress[book.id] ?? { sectionIndex, blockIndex: 0 };
    const locationLabel = book.sections[position.sectionIndex]?.title;
    const currentBlock = book.sections[position.sectionIndex]?.blocks[position.blockIndex];
    const currentParagraph = currentBlock && isTextBlock(currentBlock) ? currentBlock.text : undefined;
    const toolCtx: ToolContext = { chunks, spoilerFree: settings.spoilerFree, position };

    const system = buildSystemPrompt({
      template: settings.systemTemplate,
      book: { title: book.title, author: book.author, language: book.language },
      explainIn: settings.explainIn,
      tone: settings.tone,
      locationLabel,
      currentParagraph,
      spoilerFree: settings.spoilerFree,
    });

    const agentMessages: ChatTurn[] = [...prior, { role: "user", content: userText }];

    setBusy(true);
    abortRef.current = new AbortController();
    let visible = ""; // what the user sees in the assistant bubble

    try {
      for (let step = 0; step < MAX_AGENT_STEPS; step++) {
        const stepStartLen = visible.length;
        const result = await provider.chat({
          system,
          messages: agentMessages,
          tools: ALL_TOOLS,
          signal: abortRef.current.signal,
          onToken: (delta) => {
            visible += delta;
            updateMessage(book.id, asstId, { content: visible, pending: true });
          },
        });

        // If the provider didn't stream (e.g. text arrived only in the final
        // result), surface it now.
        if (visible.length === stepStartLen && result.text) {
          visible += result.text;
          updateMessage(book.id, asstId, { content: visible, pending: true });
        }

        if (result.usage) {
          useUsage.getState().record({
            provider: provider.id,
            model: chatModel,
            kind: "chat",
            calls: 1,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          });
        }

        if (!result.needsTools) break;

        // Record the assistant turn (text + tool_use parts) so the model can
        // see its own request when we feed back results.
        const assistantParts: MessagePart[] = [];
        if (result.text) assistantParts.push({ type: "text", text: result.text });
        for (const c of result.toolCalls)
          assistantParts.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
        agentMessages.push({ role: "assistant", content: assistantParts });

        // Run each tool and show the user what was searched.
        const resultParts: MessagePart[] = [];
        for (const call of result.toolCalls) {
          const hint = formatToolHint(call.name, call.input);
          if (hint) {
            visible += (visible.endsWith("\n\n") || visible === "" ? "" : "\n\n") + hint + "\n\n";
            updateMessage(book.id, asstId, { content: visible, pending: true });
          }
          const out = executeTool(call.name, call.input, toolCtx);
          resultParts.push({ type: "tool_result", tool_use_id: call.id, content: out });
        }
        agentMessages.push({ role: "user", content: resultParts });
      }

      updateMessage(book.id, asstId, { content: visible, pending: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const aborted = msg.includes("abort");
      updateMessage(book.id, asstId, {
        content: visible || (aborted ? "(stopped)" : `⚠️ ${msg}`),
        pending: false,
        error: !aborted && !visible,
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
                  onClick={() => send(text)}
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
      <div className="mb-3 flex items-center gap-2">
        {convList.length > 0 && (
          <select
            value={activeConv?.id ?? ""}
            onChange={(e) => setActiveChat(book.id, e.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            aria-label="Conversation history"
          >
            {convList.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => newChat(book.id)}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <IconPlus className="h-3.5 w-3.5" /> New chat
        </button>
      </div>

      <div ref={listRef} className="space-y-3">
        {msgs.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ask me to explain a word, translate a line, or recap the story. I’ll consult the book as needed
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
            {m.role === "user" ? (
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            ) : m.content ? (
              <MarkdownBubble text={m.content} />
            ) : m.pending ? (
              <ThinkingIndicator />
            ) : null}
          </div>
        ))}
      </div>
      {activeConv && msgs.length > 0 && (
        <button onClick={() => deleteChat(book.id, activeConv.id)} className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-red-500">
          <IconTrash className="h-3.5 w-3.5" /> Delete this chat
        </button>
      )}
    </Panel>
  );
}

function formatToolHint(name: string, input: Record<string, unknown>): string {
  if (name === "search_book") {
    const q = typeof input.query === "string" ? input.query : "";
    return q ? `🔎 *searching: ${q}*` : "🔎 *searching the book*";
  }
  return `⚙️ *${name}*`;
}

// Renders assistant messages with basic markdown (headings, lists, bold, code,
// tables). Spacing utilities are scoped inside the bubble.
function MarkdownBubble({ text }: { text: string }) {
  return (
    <div className="break-words text-sm leading-relaxed [&_a]:underline [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:text-[0.92em] [&_em]:italic [&_h1]:my-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:my-1 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/10 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:my-2 [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-300 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 dark:[&_code]:bg-white/10 dark:[&_pre]:bg-white/10 dark:[&_td]:border-slate-600 dark:[&_th]:border-slate-600">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

// Three bouncing dots shown before the model produces its first token.
function ThinkingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Thinking">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "300ms" }} />
    </span>
  );
}
