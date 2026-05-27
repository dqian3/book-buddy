import { useEffect, useState } from "react";
import type { BookMeta } from "../lib/book/model";
import { loadLibrary } from "../lib/book/loader";
import { useReader } from "../state/reader";
import { useLibrary } from "../state/library";
import { languageName } from "../lib/ai/prompts";
import { Spinner } from "./common/ui";
import { IconBook, IconBookOpen } from "./Icons";

export function Library() {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const open = useReader((s) => s.open);
  const progress = useLibrary((s) => s.progress);

  useEffect(() => {
    loadLibrary().then(setBooks).catch(() => setBooks([]));
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-5 py-10 safe-top safe-bottom">
      <div className="mb-8 flex items-center gap-3">
        <IconBook className="h-8 w-8 text-sky-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Babel Book Buddy</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Read foreign &amp; classic books with a dictionary and AI by your side.</p>
        </div>
      </div>

      {books === null ? (
        <Spinner label="Loading library…" />
      ) : books.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {books.map((b) => {
            const p = progress[b.id];
            return (
              <li key={b.id}>
                <button
                  onClick={() => open(b.id)}
                  className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-300 hover:shadow dark:border-slate-700 dark:bg-slate-800 dark:hover:border-sky-500"
                >
                  <IconBookOpen className="h-7 w-7 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <div className="truncate font-reading text-lg font-semibold text-slate-900 dark:text-slate-100">{b.title}</div>
                    <div className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {b.author && `${b.author} · `}
                      {languageName(b.language)}
                      {p && <span className="ml-1 text-sky-600 dark:text-sky-400">· resume ch.{p.sectionIndex + 1}</span>}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
      <p className="mb-2 font-medium text-slate-700 dark:text-slate-200">No books yet.</p>
      <p>Add one from the command line, then refresh:</p>
      <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
{`node scripts/ingest.mjs path/to/book.epub \\
  --lang en --title "Title" --author "Author"`}
      </pre>
      <p className="mt-2">Supported: <code>.html .epub .pdf .txt</code></p>
    </div>
  );
}
