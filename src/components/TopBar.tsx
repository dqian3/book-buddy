import { useReader } from "../state/reader";
import { useSettings } from "../state/settings";
import { tts } from "../lib/tts/speech";
import { IconButton } from "./common/ui";
import { IconBook, IconList, IconBookmark, IconSparkles, IconGear, IconStop, IconBookOpen } from "./Icons";

export function TopBar() {
  const { book, sectionIndex, setPanel, close } = useReader();
  const ttsPlaying = useReader((s) => s.ttsPlaying);
  const setTts = useReader((s) => s.setTts);
  const spoilerFree = useSettings((s) => s.spoilerFree);
  const section = book?.sections[sectionIndex];

  return (
    <header className="safe-top z-20 flex items-center gap-1 border-b border-slate-200 bg-white/90 px-2 py-1.5 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <IconButton onClick={close} label="Library">
        <IconBook className="h-5 w-5" />
      </IconButton>

      <button
        onClick={() => setPanel("toc")}
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
      <IconButton onClick={() => setPanel("toc")} label="Contents">
        <IconList className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => setPanel("bookmarks")} label="Bookmarks">
        <IconBookmark className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => setPanel("vocab")} label="Saved words">
        <IconBookOpen className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => setPanel("chat")} label="AI assistant">
        <IconSparkles className="h-5 w-5" />
      </IconButton>
      <IconButton onClick={() => setPanel("settings")} label="Settings">
        <IconGear className="h-5 w-5" />
      </IconButton>
    </header>
  );
}
