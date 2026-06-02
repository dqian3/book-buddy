import { useReader } from "../state/reader";
import { speakSelection } from "../lib/tts/readAloud";
import { IconSparkles, IconSpeaker, IconClose } from "./Icons";

// Floating actions for a highlighted passage. Explain submits to the assistant
// immediately so the user doesn't have to confirm a second time.
export function SelectionBar() {
  const selection = useReader((s) => s.selection);
  const book = useReader((s) => s.book);
  const openChatWith = useReader((s) => s.openChatWith);
  const setSelection = useReader((s) => s.setSelection);

  if (!selection || !book) return null;
  const text = selection.text;
  const short = text.length > 36 ? text.slice(0, 36) + "…" : text;

  const dismiss = () => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const explain = () => {
    openChatWith(text, { autoSubmit: true, newChat: true, passage: text });
    dismiss();
  };
  const read = () => {
    speakSelection(selection);
    dismiss();
  };

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
      <span className="max-w-[8rem] truncate px-2 text-xs text-slate-400">“{short}”</span>
      <Action onClick={explain} icon={<IconSparkles className="h-4 w-4" />} label="Explain" />
      <Action onClick={read} icon={<IconSpeaker className="h-4 w-4" />} label="Read" />
      <button onClick={dismiss} aria-label="Dismiss" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
        <IconClose className="h-4 w-4" />
      </button>
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
