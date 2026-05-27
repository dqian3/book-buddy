import { useReader } from "../state/reader";
import { Panel } from "./common/ui";

export function Toc() {
  const { book, sectionIndex, panel, setPanel, setSection } = useReader();
  if (!book) return null;
  return (
    <Panel open={panel === "toc"} onClose={() => setPanel(null)} title="Contents" side="left">
      <ul className="space-y-1">
        {book.sections.map((s) => (
          <li key={s.index}>
            <button
              onClick={() => setSection(s.index)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                s.index === sectionIndex
                  ? "bg-sky-100 font-semibold text-sky-800 dark:bg-sky-500/20 dark:text-sky-200"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {s.title || `Section ${s.index + 1}`}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
