import { useEffect, type ReactNode } from "react";
import { IconChevronLeft, IconChevronRight } from "../Icons";

export function IconButton({
  onClick,
  label,
  children,
  active,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A collapsible side panel. On desktop it docks beside the reader as a flex
 * sidebar (text stays interactive). On phones the flex row has no room for
 * both, so the panel absolutely overlays the reader inside the row — the
 * TopBar stays visible and the chevron collapses it. Lives inside the reader's
 * flex row; only one panel is mounted at a time.
 */
export function Panel({
  open,
  onClose,
  title,
  children,
  footer,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Only the open panel is mounted, and we don't animate width — animating a
  // flex sidebar's width forces the whole reader to re-layout every frame.
  if (!open) return null;
  const border = side === "left" ? "border-r" : "border-l";
  return (
    <aside
      className={`absolute inset-0 z-30 flex h-full w-full flex-col bg-white dark:bg-slate-900 sm:static sm:inset-auto sm:z-auto sm:w-[26rem] sm:max-w-[92vw] sm:shrink-0 ${border} border-slate-200 dark:border-slate-700`}
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        <IconButton onClick={onClose} label="Collapse panel">
          {side === "left" ? <IconChevronLeft className="h-5 w-5" /> : <IconChevronRight className="h-5 w-5" />}
        </IconButton>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      {footer && <div className="border-t border-slate-200 p-3 dark:border-slate-700">{footer}</div>}
    </aside>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

/** Apply the light/dark theme to <html> based on the user's preference. */
export function useThemeEffect(theme: "light" | "dark" | "system") {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    if (theme === "system") {
      const mq = matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);
}
