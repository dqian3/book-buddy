import { useLayoutEffect, useRef, useState } from "react";
import type { TokenizeResult } from "../lib/tokenizer/types";
import type { ActiveLookup } from "../state/reader";
import { useReader } from "../state/reader";
import { useLibrary } from "../state/library";
import { useSettings } from "../state/settings";
import { tts, ttsLangFor } from "../lib/tts/speech";
import { IconSpeaker, IconSparkles, IconPlus } from "./Icons";

export function DictPopup({
  active,
  onPickToken,
  onClose,
}: {
  active: ActiveLookup;
  onPickToken: (t: TokenizeResult) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const book = useReader((s) => s.book);
  const showPinyin = useSettings((s) => s.showPinyin);
  const addVocab = useLibrary((s) => s.addVocab);
  const openChatWith = useReader((s) => s.openChatWith);
  const [saved, setSaved] = useState(false);

  const { token, entries, rect, sentence } = active;
  const word = token.word;
  const primary = entries[0];

  // Position above/below the tapped word, clamped to the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), vw - w - 8);
    const below = rect.bottom + 8 + h < vh;
    const top = below ? rect.bottom + 8 : Math.max(8, rect.top - h - 8);
    setPos({ left, top });
  }, [rect, entries.length]);

  const speak = () =>
    book && tts.speak([{ id: "word", text: word }], { lang: ttsLangFor(book.language), rate: 0.9, voiceURI: useSettings.getState().ttsVoiceURI });

  const save = () => {
    if (!book) return;
    addVocab({
      bookId: book.id,
      word,
      reading: primary?.pinyin,
      defs: primary?.defs ?? [],
      context: sentence,
      position: active.position,
    });
    setSaved(true);
  };

  const ask = () => {
    const q = `Please explain "${word}" as used in this sentence:\n「${sentence}」`;
    openChatWith(q);
  };

  return (
    <div
      ref={ref}
      data-testid="dict-popup"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-30 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-reading text-2xl leading-tight text-slate-900 dark:text-slate-100">{word}</div>
          {showPinyin && primary?.pinyin && (
            <div className="text-sm text-sky-700 dark:text-sky-300">{primary.pinyin}</div>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={speak} aria-label="Read aloud" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <IconSpeaker className="h-5 w-5" />
          </button>
          <button onClick={save} aria-label="Save word" className={`rounded-lg p-2 ${saved ? "text-emerald-600" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"}`}>
            <IconPlus className="h-5 w-5" />
          </button>
          <button onClick={ask} aria-label="Ask AI" className="rounded-lg p-2 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/20">
            <IconSparkles className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-2 max-h-44 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No dictionary entry. Tap <IconSparkles className="inline h-4 w-4 text-violet-600" /> to ask the AI.
          </p>
        ) : (
          entries.map((e, i) => (
            <div key={i} className="border-t border-slate-100 py-1.5 first:border-0 dark:border-slate-700">
              {showPinyin && e.pinyin && i > 0 && (
                <span className="mr-2 text-sm text-sky-700 dark:text-sky-300">{e.pinyin}</span>
              )}
              <span className="text-sm text-slate-700 dark:text-slate-200">{e.defs.join("; ")}</span>
            </div>
          ))
        )}
      </div>

      {token.alternatives.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-700">
          <span className="self-center text-xs text-slate-400">also:</span>
          {token.alternatives.map((alt, i) => (
            <button
              key={i}
              onClick={() => onPickToken({ ...alt, alternatives: [] })}
              className="rounded-md bg-slate-100 px-2 py-0.5 font-reading text-sm text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
            >
              {alt.word}
            </button>
          ))}
        </div>
      )}
      <button onClick={onClose} className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600">
        close
      </button>
    </div>
  );
}
