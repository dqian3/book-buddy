import { useReader, type Panel } from "../state/reader";
import { useSettings } from "../state/settings";
import { tts } from "../lib/tts/speech";
import { IconButton } from "./common/ui";
import { IconBook, IconList, IconBookmark, IconSparkles, IconGear, IconStop, IconBookOpen } from "./Icons";

export function TopBar() {
  const { book, sectionIndex, setPanel, close, panel } = useReader();
  const ttsPlaying = useReader((s) => s.ttsPlaying);
  const setTts = useReader((s) => s.setTts);
  const spoilerFree = useSettings((s) => s.spoilerFree);
  const section = book?.sections[sectionIndex];
  // Every toolbar button toggles its panel: clicking it again collapses it.
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  return (
    <header className="safe-top z-20 flex items-center gap-1 border-b border-slate-200 bg-white/90 px-2 py-1.5 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <IconButton onClick={close} label="Library">
        <IconBook className="h-5 w-5" />
      </IconButton>

      <button
        onClick={() => toggle("toc")}
        className="flex min-w-0 flex-1 flex-col items-start px-2 text-left"
        title="Table of contents"
      >
        <span className="w-full truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {book?.title}
        </span>
        <span className="w-full truncate text-xs text-slate-500 dark:text-slate-400">
          {section?.title}
          {spoilerFree && <span className="ml-2 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">spoiler-free</span>}
        </span>
      </button>

      {ttsPlaying && (
        <IconButton onClick={() => { tts.stop(); setTts(null, false); }} label="Stop reading" active>
          <IconStop className="h-5 w-5" />
        </IconButton>
      )}
      <IconButton onClick={() => toggle("toc")} label="Contents" active={panel === "toc"}>
        <IconList className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => toggle("bookmarks")} label="Bookmarks" active={panel === "bookmarks"}>
        <IconBookmark className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => toggle("vocab")} label="Saved words" active={panel === "vocab"}>
        <IconBookOpen className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => toggle("chat")} label="AI assistant" active={panel === "chat"}>
        <IconSparkles className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => toggle("settings")} label="Settings" active={panel === "settings"}>
        <IconGear className="h-5 w-5" />
      </IconButton>
    </header>
  );
}
