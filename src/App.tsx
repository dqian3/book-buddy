import { useEffect } from "react";
import { useReader } from "./state/reader";
import { useLibrary } from "./state/library";
import { useSettings } from "./state/settings";
import { useThemeEffect, Spinner } from "./components/common/ui";
import { Library } from "./components/Library";
import { Reader } from "./components/Reader";
import { TopBar } from "./components/TopBar";
import { Toc } from "./components/Toc";
import { ChatPanel } from "./components/ChatPanel";
import { PlaybackBar } from "./components/PlaybackBar";
import { SelectionBar } from "./components/SelectionBar";
import { Settings } from "./components/Settings";
import { BookmarksPanel } from "./components/BookmarksPanel";
import { VocabPanel } from "./components/VocabPanel";

export default function App() {
  const theme = useSettings((s) => s.theme);
  const status = useReader((s) => s.status);
  const book = useReader((s) => s.book);
  const error = useReader((s) => s.error);
  const open = useReader((s) => s.open);
  const close = useReader((s) => s.close);
  useThemeEffect(theme);

  // Resume into the last-opened book on load.
  useEffect(() => {
    const last = useLibrary.getState().currentBookId;
    if (last) open(last);
  }, [open]);

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {status === "ready" && book ? (
        <>
          <TopBar />
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <Toc />
            <main className="min-h-0 flex-1">
              <Reader />
            </main>
            <BookmarksPanel />
            <VocabPanel />
            <ChatPanel />
            <Settings />
          </div>
          {/* Reading transport sits bottom-left, the selection bar bottom-right;
              they wrap to separate lines when there isn't room for both. */}
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-wrap items-end gap-2 px-4 safe-bottom">
            <PlaybackBar />
            <div className="ml-auto"><SelectionBar /></div>
          </div>
        </>
      ) : status === "loading" ? (
        <div className="flex h-full items-center justify-center">
          <Spinner label="Opening book…" />
        </div>
      ) : status === "error" ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-red-600 dark:text-red-400">Couldn’t open the book.</p>
          <p className="max-w-md text-sm text-slate-500">{error}</p>
          <button onClick={close} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white">Back to library</button>
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Library />
        </main>
      )}
    </div>
  );
}
