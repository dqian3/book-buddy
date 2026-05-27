import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Block, Position } from "../lib/book/model";
import { isTextBlock } from "../lib/book/model";
import type { TokenizeResult } from "../lib/tokenizer/types";
import { assetUrl } from "../lib/book/loader";
import { charIndexFromPoint, rectForRange } from "../lib/dom/caret";
import { sentenceAround } from "../lib/text";
import { tts, ttsLangFor, type Segment } from "../lib/tts/speech";
import { useReader, type ActiveLookup } from "../state/reader";
import { useLibrary } from "../state/library";
import { useSettings } from "../state/settings";
import { DictPopup } from "./DictPopup";
import { SelectionBar } from "./SelectionBar";
import { IconChevronLeft, IconChevronRight } from "./Icons";

export function Reader() {
  const { book, sectionIndex, services, active, setActive, setSection, consumeScroll, setTts } = useReader();
  const ttsBlockId = useReader((s) => s.ttsBlockId);
  const { fontScale } = useSettings();
  const setProgress = useLibrary((s) => s.setProgress);

  const scrollRef = useRef<HTMLDivElement>(null);
  const blockEls = useRef<Map<string, HTMLElement>>(new Map());

  const section = book?.sections[sectionIndex];

  // --- Tap to define -------------------------------------------------------
  const lookupAt = useCallback(
    (blockEl: HTMLElement, blockIndex: number, blockText: string, charIndex: number) => {
      if (!services) return;
      const token = services.tokenizer.tokenizeAt(blockText, charIndex);
      if (!token) {
        setActive(null);
        return;
      }
      const rect = rectForRange(blockEl, token.start, token.end);
      if (!rect) return;
      const entries = services.dictionary?.lookup(token.word) ?? [];
      setActive({
        token,
        entries,
        sentence: sentenceAround(blockText, token.start),
        position: { sectionIndex, blockIndex },
        rect,
      });
    },
    [services, sectionIndex, setActive]
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // A drag-selection takes precedence over tap-to-define.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;

      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-block-index]");
      if (!target) {
        setActive(null);
        return;
      }
      const blockIndex = Number(target.dataset.blockIndex);
      const block = section?.blocks[blockIndex];
      if (!block || !isTextBlock(block)) {
        setActive(null);
        return;
      }
      const idx = charIndexFromPoint(target, e.clientX, e.clientY);
      if (idx === null) {
        setActive(null);
        return;
      }
      lookupAt(target, blockIndex, block.text!, idx);
    },
    [section, lookupAt, setActive]
  );

  // Re-lookup when the user picks a narrower segmentation in the popup.
  const onPickToken = useCallback(
    (token: TokenizeResult) => {
      if (!active) return;
      const block = section?.blocks[active.position.blockIndex];
      const el = block ? blockEls.current.get(block.id) : undefined;
      if (!el || !block?.text) return;
      const rect = rectForRange(el, token.start, token.end);
      const entries = services?.dictionary?.lookup(token.word) ?? [];
      setActive({
        ...active,
        token,
        entries,
        sentence: sentenceAround(block.text, token.start),
        rect: rect ?? active.rect,
      });
    },
    [active, section, services, setActive]
  );

  // --- Selection -----------------------------------------------------------
  const onSelectionEnd = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (text.length > 1 && scrollRef.current?.contains(sel!.anchorNode)) {
      useReader.getState().setSelection({ text, sectionIndex });
    } else {
      useReader.getState().setSelection(null);
    }
  }, [sectionIndex]);

  // --- Text to speech ------------------------------------------------------
  const speakFrom = useCallback(
    (fromIndex: number) => {
      if (!section || !book) return;
      const segments: Segment[] = section.blocks
        .map((b, i) => ({ b, i }))
        .filter(({ b, i }) => i >= fromIndex && isTextBlock(b))
        .map(({ b }) => ({ id: b.id, text: b.text! }));
      if (!segments.length) return;
      setActive(null);
      tts.speak(
        segments,
        { lang: ttsLangFor(book.language), rate: useSettings.getState().ttsRate, voiceURI: useSettings.getState().ttsVoiceURI },
        {
          onSegmentStart: (id) => {
            setTts(id, true);
            blockEls.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
          },
          onEnd: () => setTts(null, false),
          onError: () => setTts(null, false),
        }
      );
    },
    [section, book, setActive, setTts]
  );

  // Stop speech when leaving the section/book.
  useEffect(() => () => tts.stop(), [sectionIndex]);

  // --- Resume / jump scrolling --------------------------------------------
  useLayoutEffect(() => {
    const target = consumeScroll();
    if (target == null) {
      scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    const el = blockEls.current.get(section?.blocks[target]?.id ?? "");
    if (el) el.scrollIntoView({ block: "start" });
    else scrollRef.current?.scrollTo({ top: 0 });
  }, [sectionIndex, consumeScroll]);

  // --- Progress tracking (topmost visible block) --------------------------
  useEffect(() => {
    if (!book || !section) return;
    const root = scrollRef.current;
    const tops = new Map<number, number>();
    let raf = 0;
    const save = () => {
      raf = 0;
      let bestIdx = 0;
      let bestTop = Infinity;
      for (const [idx, top] of tops) {
        if (top >= -4 && top < bestTop) {
          bestTop = top;
          bestIdx = idx;
        }
      }
      setProgress(book.id, { sectionIndex, blockIndex: bestIdx } as Position);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.blockIndex);
          if (e.isIntersecting) tops.set(idx, e.boundingClientRect.top);
          else tops.delete(idx);
        }
        if (!raf) raf = requestAnimationFrame(save);
      },
      { root, threshold: 0 }
    );
    blockEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [book, section, sectionIndex, setProgress]);

  // Close the dict popup on scroll (its anchor rect goes stale).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => useReader.getState().active && setActive(null);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [setActive]);

  const registerBlock = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) blockEls.current.set(id, el);
    else blockEls.current.delete(id);
  }, []);

  const fontStyle = useMemo(() => ({ fontSize: `${(fontScale * 1.125).toFixed(3)}rem`, lineHeight: 1.95 }), [fontScale]);

  if (!book || !section) return null;

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        onClick={onClick}
        onMouseUp={onSelectionEnd}
        onTouchEnd={onSelectionEnd}
      >
        <article
          data-testid="reader"
          className="mx-auto max-w-2xl px-5 py-6 font-reading text-slate-800 dark:text-slate-200"
          style={fontStyle}
        >
          <h1 className="mb-6 text-center text-2xl font-bold text-slate-900 dark:text-slate-100">
            {section.title || book.title}
          </h1>
          {section.blocks.map((block, i) => (
            <BlockView
              key={block.id}
              block={block}
              bookId={book.id}
              index={i}
              isTts={ttsBlockId === block.id}
              active={active && active.position.blockIndex === i ? active : null}
              registerRef={registerBlock(block.id)}
              onPlay={() => speakFrom(i)}
            />
          ))}

          <SectionNav
            hasPrev={sectionIndex > 0}
            hasNext={sectionIndex < book.sections.length - 1}
            onPrev={() => setSection(sectionIndex - 1)}
            onNext={() => setSection(sectionIndex + 1)}
          />
        </article>
      </div>

      {active && <DictPopup active={active} onPickToken={onPickToken} onClose={() => setActive(null)} />}
      <SelectionBar />
    </div>
  );
}

function BlockView({
  block,
  bookId,
  index,
  active,
  isTts,
  registerRef,
  onPlay,
}: {
  block: Block;
  bookId: string;
  index: number;
  active: ActiveLookup | null;
  isTts: boolean;
  registerRef: (el: HTMLElement | null) => void;
  onPlay: () => void;
}) {
  const ttsClass = isTts ? "tts-active" : "";

  if (block.type === "image") {
    return (
      <figure ref={registerRef as never} data-block-index={index} className="my-5 text-center">
        <img src={assetUrl(bookId, block.src!)} alt={block.alt ?? ""} className="mx-auto max-h-[70vh] rounded" />
        {block.alt && <figcaption className="mt-1 text-sm text-slate-500">{block.alt}</figcaption>}
      </figure>
    );
  }

  const content = active ? highlightActive(block.text!, active) : block.text;

  const common = {
    ref: registerRef as never,
    "data-block-index": index,
    onDoubleClick: onPlay,
    title: "Tap a word to define · double-tap to read aloud from here",
  };

  if (block.type === "heading") {
    return (
      <h2 {...common} className={`mb-3 mt-6 text-xl font-bold ${ttsClass}`}>
        {content}
      </h2>
    );
  }
  if (block.type === "line") {
    return (
      <p {...common} className={`my-1 whitespace-pre-wrap ${ttsClass}`}>
        {content}
      </p>
    );
  }
  if (block.type === "verse") {
    return (
      <p {...common} className={`my-1 ${ttsClass}`}>
        {block.ref && <sup className="mr-1 select-none text-xs text-sky-600 dark:text-sky-400">{block.ref}</sup>}
        {content}
      </p>
    );
  }
  return (
    <p {...common} className={`my-3 indent-8 ${ttsClass}`}>
      {content}
    </p>
  );
}

/** Render text with the active word wrapped in a highlight span. */
function highlightActive(text: string, active: ActiveLookup) {
  const { start, end } = active.token;
  return (
    <>
      {text.slice(0, start)}
      <span className="word-active">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}

function SectionNav({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="mt-10 flex items-center justify-between border-t border-slate-200 pt-5 text-sm dark:border-slate-700">
      <button
        disabled={!hasPrev}
        onClick={onPrev}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-slate-600 enabled:hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:enabled:hover:bg-slate-800"
      >
        <IconChevronLeft className="h-4 w-4" /> Previous
      </button>
      <button
        disabled={!hasNext}
        onClick={onNext}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-slate-600 enabled:hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:enabled:hover:bg-slate-800"
      >
        Next <IconChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
