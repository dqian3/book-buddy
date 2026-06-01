import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DictEntry, Dictionary } from "../lib/dictionary/types";
import type { Token, TokenizeResult } from "../lib/tokenizer/types";
import type { Position } from "../lib/book/model";
import { useReader } from "../state/reader";
import { useLibrary } from "../state/library";
import { useSettings } from "../state/settings";
import { tts, speakOptionsFor } from "../lib/tts/speech";
import { startReadThrough } from "../lib/tts/readAloud";
import { IconPlus, IconSpeaker, IconPlay } from "./Icons";

const HAN = /\p{Script=Han}/u;

/**
 * Single popup used for both hover-preview and click-to-pin. Renders the tapped
 * word's dictionary entries plus a Zhongwen-style per-character breakdown so
 * the reader can see component characters at a glance. In persistent mode it
 * also surfaces alternative segmentations and a save-to-vocab button.
 */
export function DictPopup({
  word,
  entries,
  alternatives,
  rect,
  persistent,
  onPickToken,
  sentence,
  position,
}: {
  word: string;
  entries: DictEntry[];
  alternatives: Token[];
  rect: DOMRect;
  persistent: boolean;
  onPickToken?: (t: TokenizeResult) => void;
  sentence?: string;
  position?: Position;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const showPinyin = useSettings((s) => s.showPinyin);
  const dictionary = useReader((s) => s.services?.dictionary ?? null);
  const book = useReader((s) => s.book);
  const setActive = useReader((s) => s.setActive);
  const addVocab = useLibrary((s) => s.addVocab);
  const vocab = useLibrary((s) => s.vocab);

  const primary = entries[0];
  const chars = useMemo(() => characterBreakdown(word, dictionary), [word, dictionary]);
  const alreadySaved = book ? vocab.some((v) => v.bookId === book.id && v.word === word) : false;

  const speak = () => {
    if (!book) return;
    tts.speak([{ id: "word", text: word }], {
      ...speakOptionsFor(book.language, useSettings.getState()),
      rate: 0.9, // a touch slower for single words
    });
  };

  // Side (above/below) is decided from the word's viewport position alone, so
  // it doesn't flip when the popup grows on click (hover → active adds
  // alternatives / save). Whichever edge is closest to the word stays anchored;
  // the popup only extends away from the word.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), vw - w - 8);
    const placeBelow = vh - rect.bottom >= rect.top;
    const top = placeBelow
      ? Math.min(rect.bottom + 8, vh - h - 8)
      : Math.max(8, rect.top - h - 8);
    setPos({ left, top });
  }, [rect, entries.length, chars.length, alternatives.length, persistent]);

  const save = () => {
    if (!book || !position) return;
    addVocab({
      bookId: book.id,
      word,
      reading: primary?.pinyin,
      defs: primary?.defs ?? [],
      context: sentence ?? "",
      position,
    });
  };

  return (
    <div
      ref={ref}
      data-testid="dict-popup"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
      className={`fixed z-30 w-max min-w-[14rem] max-w-[20rem] rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 ${
        persistent ? "" : "pointer-events-none"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`flex items-baseline gap-2 ${persistent ? "pr-14" : ""}`}>
        <span className="font-reading text-base leading-tight text-slate-900 dark:text-slate-100">{word}</span>
        {showPinyin && primary?.pinyin && (
          <span className="text-xs text-sky-700 dark:text-sky-300">{primary.pinyin}</span>
        )}
      </div>
      {primary ? (
        <div className="mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-300">
          {primary.defs.join("; ")}
        </div>
      ) : (
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">No dictionary entry.</div>
      )}

      {chars.length > 0 && (
        <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 dark:border-slate-700">
          {chars.map(({ char, entry }) => (
            <div key={char} className="flex items-baseline gap-2 text-xs">
              <span className="font-reading text-sm leading-tight text-slate-900 dark:text-slate-100">{char}</span>
              {showPinyin && entry?.pinyin && (
                <span className="text-sky-700 dark:text-sky-300">{entry.pinyin}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                {entry ? entry.defs.join("; ") : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {persistent && alternatives.length > 0 && onPickToken && (
        <div className="mt-1.5 flex flex-wrap gap-1 border-t border-slate-100 pt-1.5 dark:border-slate-700">
          <span className="self-center text-[10px] uppercase tracking-wide text-slate-400">also</span>
          {alternatives.map((alt, i) => (
            <button
              key={i}
              onClick={() => onPickToken({ ...alt, alternatives: [] })}
              className="rounded bg-slate-100 px-1.5 py-0.5 font-reading text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
            >
              {alt.word}
            </button>
          ))}
        </div>
      )}

      {persistent && book && (
        <div className="absolute right-1 top-1 flex gap-0.5">
          <PopupAction onClick={speak} label="Read aloud">
            <IconSpeaker className="h-4 w-4" />
          </PopupAction>
          {position && (
            <PopupAction onClick={() => { setActive(null); startReadThrough(position.blockIndex); }} label="Read from here">
              <IconPlay className="h-4 w-4" />
            </PopupAction>
          )}
          {position && (
            <PopupAction
              onClick={save}
              label={alreadySaved ? "Saved" : "Save word"}
              disabled={alreadySaved}
              tone={alreadySaved ? "saved" : "default"}
            >
              <IconPlus className="h-4 w-4" />
            </PopupAction>
          )}
        </div>
      )}
    </div>
  );
}

function PopupAction({
  onClick,
  label,
  disabled,
  tone = "default",
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  tone?: "default" | "accent" | "saved";
  children: React.ReactNode;
}) {
  const palette =
    tone === "accent"
      ? "text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/20"
      : tone === "saved"
        ? "text-emerald-600"
        : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded p-1 ${palette} disabled:cursor-default`}
    >
      {children}
    </button>
  );
}

/** For multi-character Han words, look up each component character. */
function characterBreakdown(word: string, dict: Dictionary | null): { char: string; entry: DictEntry | null }[] {
  if (!dict) return [];
  const chars = [...word];
  if (chars.length <= 1) return [];
  const out: { char: string; entry: DictEntry | null }[] = [];
  const seen = new Set<string>();
  for (const ch of chars) {
    if (!HAN.test(ch) || seen.has(ch)) continue;
    seen.add(ch);
    const entries = dict.lookup(ch);
    out.push({ char: ch, entry: entries[0] ?? null });
  }
  return out;
}
