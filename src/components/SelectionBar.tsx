import { useReader } from "../state/reader";
import { useSettings } from "../state/settings";
import { tts, ttsLangFor } from "../lib/tts/speech";
import { IconSparkles, IconSpeaker, IconBookOpen, IconClose } from "./Icons";

// Floating actions for a highlighted passage: explain, translate, or read aloud.
export function SelectionBar() {
  const selection = useReader((s) => s.selection);
  const book = useReader((s) => s.book);
  const openChatWith = useReader((s) => s.openChatWith);
  const setSelection = useReader((s) => s.setSelection);

  if (!selection || !book) return null;
  const text = selection.text;
  const short = text.length > 36 ? text.slice(0, 36) + "…" : text;

  const explain = () => openChatWith(`Please explain this passage and any tricky words in it:\n「${text}」`);
  const translate = () => openChatWith(`Translate this passage and note any nuance:\n「${text}」`);
  const read = () => {
    setSelection(null);
    tts.speak([{ id: "sel", text }], {
      lang: ttsLangFor(book.language),
      rate: useSettings.getState().ttsRate,
      voiceURI: useSettings.getState().ttsVoiceURI,
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 safe-bottom">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
        <span className="max-w-[8rem] truncate px-2 text-xs text-slate-400">“{short}”</span>
        <Action onClick={explain} icon={<IconSparkles className="h-4 w-4" />} label="Explain" />
        <Action onClick={translate} icon={<IconBookOpen className="h-4 w-4" />} label="Translate" />
        <Action onClick={read} icon={<IconSpeaker className="h-4 w-4" />} label="Read" />
        <button onClick={() => setSelection(null)} aria-label="Dismiss" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Action({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {icon}
      {label}
    </button>
  );
}
