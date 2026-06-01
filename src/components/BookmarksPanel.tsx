import type { Book, Position } from "../lib/book/model";
import { useReader } from "../state/reader";
import { useLibrary } from "../state/library";
import { Panel } from "./common/ui";
import { IconBookmark, IconTrash } from "./Icons";

function labelFor(book: Book, pos: Position): string {
  const section = book.sections[pos.sectionIndex];
  const sectionTitle = section?.title || `Section ${pos.sectionIndex + 1}`;
  let n = 0;
  for (let i = 0; i <= pos.blockIndex && i < (section?.blocks.length ?? 0); i++) {
    if (section!.blocks[i].type === "paragraph") n++;
  }
  return n > 0 ? `${sectionTitle} · ¶${n}` : sectionTitle;
}

export function BookmarksPanel() {
  const { book, sectionIndex, panel, setPanel, setSection } = useReader();
  const { bookmarks, addBookmark, removeBookmark, progress } = useLibrary();
  if (!book) return null;

  const mine = bookmarks.filter((b) => b.bookId === book.id);
  const here = progress[book.id] ?? { sectionIndex, blockIndex: 0 };

  const addHere = () => {
    addBookmark({ bookId: book.id, position: here, label: labelFor(book, here) });
  };

  return (
    <Panel
      open={panel === "bookmarks"}
      onClose={() => setPanel(null)}
      title="Bookmarks"
      footer={
        <button
          onClick={addHere}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          <IconBookmark className="h-4 w-4" /> Bookmark current spot
        </button>
      }
    >
      {mine.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No bookmarks yet. Your reading position is always saved automatically — bookmarks are for spots you want to jump back to.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              <button
                onClick={() => setSection(b.position.sectionIndex, b.position.blockIndex)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{b.label}</div>
                <div className="text-xs text-slate-500">
                  {book.sections[b.position.sectionIndex]?.title} · {new Date(b.createdAt).toLocaleDateString()}
                </div>
              </button>
              <button onClick={() => removeBookmark(b.id)} aria-label="Delete" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-700">
                <IconTrash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
