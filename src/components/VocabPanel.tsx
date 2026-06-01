import { useState } from "react";
import { useReader } from "../state/reader";
import { useLibrary } from "../state/library";
import { useSettings } from "../state/settings";
import { tts, speakOptionsFor } from "../lib/tts/speech";
import { Panel } from "./common/ui";
import { IconSpeaker, IconTrash } from "./Icons";

export function VocabPanel() {
  const { book, panel, setPanel } = useReader();
  const { vocab, removeVocab } = useLibrary();
  const [scope, setScope] = useState<"book" | "all">("book");
  if (!book) return null;

  const items = scope === "book" ? vocab.filter((v) => v.bookId === book.id) : vocab;

  return (
    <Panel open={panel === "vocab"} onClose={() => setPanel(null)} title="Saved words">
      <div className="mb-3 flex gap-2 text-xs">
        {(["book", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded-full px-3 py-1 ${scope === s ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {s === "book" ? "This book" : "All books"}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No saved words yet. Tap a word while reading, then press <span className="font-medium">+</span> in the popup to save it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((v) => (
            <li key={v.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-reading text-lg text-slate-900 dark:text-slate-100">{v.word}</span>
                  {v.reading && <span className="ml-2 text-sm text-sky-700 dark:text-sky-300">{v.reading}</span>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => tts.speak([{ id: "w", text: v.word }], { ...speakOptionsFor(book.language, useSettings.getState()), rate: 0.9 })}
                    aria-label="Read aloud"
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <IconSpeaker className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeVocab(v.id)} aria-label="Delete" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-700">
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {v.defs.length > 0 && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{v.defs.join("; ")}</p>}
              {v.context && <p className="mt-1 font-reading text-xs text-slate-400">“{v.context}”</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
