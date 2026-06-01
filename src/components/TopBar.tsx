import { useReader, type Panel } from "../state/reader";
import { startReadThrough, pauseReadAloud, resumeReadAloud, stopReadAloud } from "../lib/tts/readAloud";
import { IconButton } from "./common/ui";
import { IconBook, IconList, IconBookmark, IconSparkles, IconGear, IconStop, IconBookOpen, IconPlay, IconPause, IconSpeaker } from "./Icons";

export function TopBar() {
  const { book, sectionIndex, setPanel, close, panel } = useReader();
  const ttsPlaying = useReader((s) => s.ttsPlaying);
  const ttsPaused = useReader((s) => s.ttsPaused);
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
        </span>
      </button>

      {ttsPlaying ? (
        <>
          <IconButton
            onClick={() => (ttsPaused ? resumeReadAloud() : pauseReadAloud())}
            label={ttsPaused ? "Resume reading" : "Pause reading"}
            active
          >
            {ttsPaused ? <IconPlay className="h-5 w-5" /> : <IconPause className="h-5 w-5" />}
          </IconButton>
          <IconButton onClick={stopReadAloud} label="Stop reading">
            <IconStop className="h-5 w-5" />
          </IconButton>
        </>
      ) : (
        <IconButton onClick={() => startReadThrough()} label="Read aloud from here">
          <IconSpeaker className="h-5 w-5" />
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
