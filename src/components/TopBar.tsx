import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReader, type Panel } from "../state/reader";
import { startReadThrough } from "../lib/tts/readAloud";
import { IconButton } from "./common/ui";
import { IconBook, IconBookmark, IconSparkles, IconGear, IconBookOpen, IconSpeaker, IconMore } from "./Icons";

export function TopBar() {
  const { book, sectionIndex, setPanel, close, panel } = useReader();
  const ttsPlaying = useReader((s) => s.ttsPlaying);
  const section = book?.sections[sectionIndex];
  // Every toolbar button toggles its panel: clicking it again collapses it.
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  // Phone overflow menu (close on outside tap / Escape).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Secondary actions: shown inline on wider screens, folded into the overflow
  // menu on phones so the bar isn't a cramped row of icons.
  const actions = (
    [
      ttsPlaying ? null : { key: "tts", label: "Read aloud", icon: <IconSpeaker className="h-5 w-5" />, run: () => startReadThrough() },
      { key: "bookmarks", label: "Bookmarks", icon: <IconBookmark className="h-5 w-5" />, run: () => toggle("bookmarks"), panel: "bookmarks" as Panel },
      { key: "vocab", label: "Saved words", icon: <IconBookOpen className="h-5 w-5" />, run: () => toggle("vocab"), panel: "vocab" as Panel },
      { key: "settings", label: "Settings", icon: <IconGear className="h-5 w-5" />, run: () => toggle("settings"), panel: "settings" as Panel },
    ].filter(Boolean) as { key: string; label: string; icon: ReactNode; run: () => void; panel?: Panel }[]
  );

  return (
    <header className="safe-top relative z-30 flex items-center gap-1 border-b border-slate-200 bg-white/90 px-2 py-1.5 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <IconButton onClick={close} label="Library">
        <IconBook className="h-5 w-5" />
      </IconButton>

      <button
        onClick={() => toggle("toc")}
        className="flex min-w-0 flex-1 flex-col items-start px-2 text-left"
        title="Table of contents"
        aria-label="Table of contents"
      >
        <span className="w-full truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {book?.title}
        </span>
        <span className="w-full truncate text-xs text-slate-500 dark:text-slate-400">
          {section?.title}
        </span>
      </button>

      {/* AI assistant stays one tap away on every screen size. */}
      <IconButton onClick={() => toggle("chat")} label="AI assistant" active={panel === "chat"}>
        <IconSparkles className="h-5 w-5" />
      </IconButton>

      {/* Inline secondary actions (wider screens only). */}
      <div className="hidden items-center gap-1 sm:flex">
        {actions.map((a) => (
          <IconButton key={a.key} onClick={a.run} label={a.label} active={a.panel ? panel === a.panel : undefined}>
            {a.icon}
          </IconButton>
        ))}
      </div>

      {/* Overflow menu (phones only). */}
      <div ref={menuRef} className="relative sm:hidden">
        <IconButton onClick={() => setMenuOpen((o) => !o)} label="More" active={menuOpen}>
          <IconMore className="h-5 w-5" />
        </IconButton>
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {actions.map((a) => (
              <button
                key={a.key}
                onClick={() => {
                  setMenuOpen(false);
                  a.run();
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  a.panel && panel === a.panel
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="text-slate-500 dark:text-slate-400">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
