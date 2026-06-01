import { useReader } from "../state/reader";
import { pauseReadAloud, resumeReadAloud, stopReadAloud } from "../lib/tts/readAloud";
import { IconPlay, IconPause, IconStop, IconSpeaker } from "./Icons";

// Floating transport controls shown while the book is being read aloud. Kept
// separate from the TopBar so the reading state has its own piece of UI.
export function PlaybackBar() {
  const ttsPlaying = useReader((s) => s.ttsPlaying);
  const ttsPaused = useReader((s) => s.ttsPaused);
  if (!ttsPlaying) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 safe-bottom">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
        <span className="flex items-center gap-1.5 px-2 text-xs text-slate-500 dark:text-slate-400">
          <IconSpeaker className="h-4 w-4" /> {ttsPaused ? "Paused" : "Reading aloud…"}
        </span>
        <button
          onClick={() => (ttsPaused ? resumeReadAloud() : pauseReadAloud())}
          aria-label={ttsPaused ? "Resume" : "Pause"}
          className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {ttsPaused ? <IconPlay className="h-5 w-5" /> : <IconPause className="h-5 w-5" />}
        </button>
        <button
          onClick={stopReadAloud}
          aria-label="Stop"
          className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <IconStop className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
