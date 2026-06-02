import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Block, Position } from "../lib/book/model";
import { isTextBlock } from "../lib/book/model";
import type { DictEntry } from "../lib/dictionary/types";
import type { TokenizeResult } from "../lib/tokenizer/types";
import { assetUrl } from "../lib/book/loader";
import { charIndexFromPoint, charIndexOfNode, rectForRange, rectsForRange } from "../lib/dom/caret";
import { sentenceAround } from "../lib/text";
import { stopReadAloud } from "../lib/tts/readAloud";
import { useReader } from "../state/reader";
import { useLibrary } from "../state/library";
import { useSettings } from "../state/settings";
import { DictPopup } from "./DictPopup";
import { IconChevronLeft, IconChevronRight } from "./Icons";

// Paged-mode geometry. Pages are CSS columns; the column gap and side padding
// are sized so a single page (or a two-page spread) spans exactly the container
// width — so one flip always advances by `stride === containerWidth`, which
// keeps every page cleanly centered. MAX_COL caps the text column at the same
// readable width as scroll mode (Tailwind max-w-2xl ≈ 672px); MIN_PAD is the
// minimum breathing room on narrow screens. The colW/gap clamps keep the math
// valid at any width (a flip always advances exactly one container width), so
// paged mode stays paged even when squeezed — e.g. a side panel is open.
const MAX_COL = 672;
const MIN_PAD = 24;

interface PageGeo {
  colW: number;
  gap: number;
  pad: number;
  stride: number;
}

function pageGeometry(containerW: number, mode: "scroll" | "page" | "double"): PageGeo | null {
  if (mode === "scroll" || !containerW) return null;
  if (mode === "double") {
    // Two columns + one spine gap span the width; gap = C/2 − colW keeps the
    // pair centered and makes two columns advance exactly one container width.
    const colW = Math.max(1, Math.min(MAX_COL, (containerW - 2 * MIN_PAD) / 2));
    const gap = Math.max(0, containerW / 2 - colW);
    return { colW, gap, pad: gap / 2, stride: containerW };
  }
  // One centered column; the gap is the surrounding whitespace.
  const colW = Math.max(1, Math.min(MAX_COL, containerW - 2 * MIN_PAD));
  const gap = Math.max(0, containerW - colW);
  return { colW, gap, pad: gap / 2, stride: containerW };
}

export function Reader() {
  // Subscribe to fields individually so panel/selection changes (e.g. opening a
  // sidebar) don't re-render the reader and rebuild every block in the section.
  const book = useReader((s) => s.book);
  const sectionIndex = useReader((s) => s.sectionIndex);
  const services = useReader((s) => s.services);
  const active = useReader((s) => s.active);
  const ttsBlockId = useReader((s) => s.ttsBlockId);
  const pendingScrollBlock = useReader((s) => s.pendingScrollBlock);
  const setActive = useReader((s) => s.setActive);
  const setSection = useReader((s) => s.setSection);
  const consumeScroll = useReader((s) => s.consumeScroll);
  // Select only the settings fields the reader uses, so unrelated settings
  // changes (typing the system prompt, theme, provider keys…) don't re-render
  // the reader and rebuild every block.
  const fontScale = useSettings((s) => s.fontScale);
  const hoverTranslate = useSettings((s) => s.hoverTranslate);
  const mode = useSettings((s) => s.readingMode);
  const paged = mode !== "scroll";
  const setProgress = useLibrary((s) => s.setProgress);

  const scrollRef = useRef<HTMLDivElement>(null);
  const blockEls = useRef<Map<string, HTMLElement>>(new Map());
  // Gates progress saving so the IntersectionObserver can't overwrite the saved
  // resume position with block 0 before the resume scroll has been applied.
  const trackingRef = useRef(false);
  // Pending scroll target read once per section (see resume effect below).
  const resumeRef = useRef<{ section: number; target: number | null }>({ section: -1, target: null });
  // Block index currently at the start of the visible page — kept up to date by
  // the progress tracker, so a reflow (resize / font change) can re-anchor the
  // page to the same block rather than the same (now-shifted) page index.
  const anchorRef = useRef(0);

  const section = book?.sections[sectionIndex];

  // --- Paged mode ----------------------------------------------------------
  // geo holds the page column geometry (null in scroll mode); pg tracks the
  // current page and the last page index for the flip controls.
  const [geo, setGeo] = useState<PageGeo | null>(null);
  const [pg, setPg] = useState({ page: 0, max: 0 });

  // Recompute the geometry from the container width (and on resize / mode).
  useLayoutEffect(() => {
    const c = scrollRef.current;
    if (!c) return;
    const measure = () => setGeo(pageGeometry(c.clientWidth, mode));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    return () => ro.disconnect();
  }, [mode]);

  // Once columns are laid out (after geo / section / font settle), the total
  // scrollable width tells us how many pages this section spans. A reflow —
  // opening a side panel (e.g. Settings) or resizing the window — moves the page
  // boundaries and shifts which text lands where, so re-anchor to the block that
  // was at the start of the page (keeping the reader's place) rather than to the
  // raw page index. On a section change the resume effect runs afterward and
  // takes over the scroll position.
  useLayoutEffect(() => {
    const c = scrollRef.current;
    if (!c || !geo) return;
    const max = Math.max(0, Math.round((c.scrollWidth - c.clientWidth) / geo.stride));
    const anchor = blockEls.current.get(section?.blocks[anchorRef.current]?.id ?? "");
    const page = Math.min(anchor ? pageOfEl(anchor) : pg.page, max);
    c.scrollLeft = page * geo.stride;
    setPg((p) => (p.page === page && p.max === max ? p : { page, max }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, section, fontScale]);

  // Flip a page; at a section edge, cross into the adjacent section.
  const flip = useCallback(
    (dir: -1 | 1) => {
      const c = scrollRef.current;
      if (!geo) return;
      const next = pg.page + dir;
      if (next < 0) {
        if (sectionIndex > 0) setSection(sectionIndex - 1);
        return;
      }
      if (next > pg.max) {
        if (book && sectionIndex < book.sections.length - 1) setSection(sectionIndex + 1);
        return;
      }
      setPg((p) => ({ ...p, page: next }));
      if (geo) c?.scrollTo({ left: next * geo.stride, behavior: "smooth" });
    },
    [pg, geo, sectionIndex, setSection, book]
  );

  // Which page a block element currently sits on (a flip is one container width).
  const pageOfEl = useCallback(
    (el: HTMLElement) => {
      const c = scrollRef.current;
      if (!c || !geo) return 0;
      const left = el.getBoundingClientRect().left - c.getBoundingClientRect().left + c.scrollLeft;
      return Math.max(0, Math.floor(left / geo.stride));
    },
    [geo]
  );

  // Index of the block that *starts* at (or just after) a given scroll offset —
  // the block at the top of that page. A block's content-x is invariant of the
  // current scroll, so this is safe to call mid-snap. Used to remember the page
  // start for re-anchoring across reflows; a paragraph spilling in from the
  // previous page starts earlier, so it's correctly skipped.
  const pageStartBlock = useCallback((atLeft: number) => {
    const c = scrollRef.current;
    if (!c) return anchorRef.current;
    const cl = c.getBoundingClientRect().left;
    let best = Infinity;
    let idx = anchorRef.current;
    blockEls.current.forEach((el) => {
      const left = el.getBoundingClientRect().left - cl + c.scrollLeft;
      if (left >= atLeft - 4 && left < best) {
        best = left;
        idx = Number(el.dataset.blockIndex);
      }
    });
    return idx;
  }, []);

  // Arrow / Page keys flip pages (ignored while typing in an input).
  useEffect(() => {
    if (!paged) return;
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") (e.preventDefault(), flip(1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") (e.preventDefault(), flip(-1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paged, flip]);

  // Swipe / trackpad scrolling: snap to the nearest page once it settles.
  useEffect(() => {
    const c = scrollRef.current;
    if (!c || !geo) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const page = Math.max(0, Math.min(pg.max, Math.round(c.scrollLeft / geo.stride)));
        if (Math.abs(c.scrollLeft - page * geo.stride) > 1) c.scrollTo({ left: page * geo.stride, behavior: "smooth" });
        setPg((p) => (p.page === page ? p : { ...p, page }));
        // Remember the start-of-page block (now settled) so a later reflow can
        // re-anchor to it. Keyed off the target page, not the live scroll, in
        // case the snap-back above is still animating.
        anchorRef.current = pageStartBlock(page * geo.stride);
      }, 120);
    };
    c.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      c.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [geo, pg.max]);

  // --- Hover to translate (optional) ---------------------------------------
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hoverKey = useRef("");
  const lastPt = useRef({ x: -1, y: -1 });

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!hoverTranslate || !services || useReader.getState().active) return;
      // Throttle: ignore tiny jitters between word-sized movements.
      const x = e.clientX, y = e.clientY;
      if (Math.abs(x - lastPt.current.x) < 4 && Math.abs(y - lastPt.current.y) < 4) return;
      lastPt.current = { x, y };

      const clear = () => { setHover(null); hoverKey.current = ""; };

      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return clear();

      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-block-index]");
      if (!target) return clear();
      const block = section?.blocks[Number(target.dataset.blockIndex)];
      if (!block || !isTextBlock(block)) return clear();

      const idx = charIndexFromPoint(target, x, y);
      if (idx === null) return clear();
      const token = services.tokenizer.tokenizeAt(block.text!, idx);
      if (!token) return clear();

      const key = `${block.id}:${token.start}:${token.end}`;
      if (key === hoverKey.current) return; // same word — keep the current tooltip
      hoverKey.current = key;

      const entries = services.dictionary?.lookup(token.word) ?? [];
      const rect = rectForRange(target, token.start, token.end);
      if (entries.length === 0 || !rect) return setHover(null);
      setHover({ word: token.word, entries, rect });
    },
    [hoverTranslate, services, section]
  );

  const clearHover = useCallback(() => { setHover(null); hoverKey.current = ""; }, []);

  // The click popup takes over from the hover tooltip; drop any stale hover.
  useEffect(() => { if (active) clearHover(); }, [active, clearHover]);

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
      // A selection takes precedence over tap-to-define. Check both the live
      // browser selection and our stored one: when a drag ends on a word the
      // browser may have already collapsed its selection by the time this click
      // fires, but the highlight we just captured is still active — defining the
      // word here would wipe it out.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      if (useReader.getState().selection) return;

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
    const raw = sel?.toString() ?? "";
    const text = raw.trim();
    if (text.length > 1 && sel && scrollRef.current?.contains(sel.anchorNode)) {
      // A highlight supersedes any open word popup — clear it for good so it
      // doesn't reappear when the highlight is later dismissed.
      useReader.getState().setActive(null);
      // Record where the selection starts so read-aloud can anchor its cursor.
      const range = sel.getRangeAt(0);
      const startNode = range.startContainer;
      const startEl = (startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : (startNode as HTMLElement))
        ?.closest<HTMLElement>("[data-block-index]");
      const blockIndex = startEl ? Number(startEl.dataset.blockIndex) : 0;
      const offset = startEl ? charIndexOfNode(startEl, range.startContainer, range.startOffset) ?? 0 : 0;
      const start = offset + (raw.length - raw.trimStart().length); // skip trimmed leading space
      useReader.getState().setSelection({ text, sectionIndex, blockIndex, start });
    } else {
      useReader.getState().setSelection(null);
    }
  }, [sectionIndex]);

  // Stop reading when leaving the section/book.
  useEffect(() => () => stopReadAloud(), [sectionIndex]);

  // Keep the block being read aloud in view.
  useEffect(() => {
    if (!ttsBlockId) return;
    const el = blockEls.current.get(ttsBlockId);
    const c = scrollRef.current;
    if (!el || !c) return;
    if (geo) {
      // Flip to the page the spoken block is on.
      const page = pageOfEl(el);
      setPg((p) => (p.page === page ? p : { ...p, page }));
      c.scrollTo({ left: page * geo.stride, behavior: "smooth" });
      return;
    }
    const er = el.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    if (er.top < cr.top + 48 || er.bottom > cr.bottom - 48) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [ttsBlockId, geo, pageOfEl]);

  // --- Resume / jump scrolling --------------------------------------------
  useLayoutEffect(() => {
    // Three triggers: new section opened, same-section jump (e.g. bookmark
    // click), and StrictMode's double-mount. On a section change we consume
    // the pending target once and remember it in resumeRef so re-fires reuse
    // it instead of resetting to top. On a same-section jump, pendingScrollBlock
    // flips non-null → we consume it and update the remembered target.
    if (resumeRef.current.section !== sectionIndex) {
      resumeRef.current = { section: sectionIndex, target: consumeScroll() };
    } else if (pendingScrollBlock !== null) {
      resumeRef.current.target = pendingScrollBlock;
      consumeScroll();
    }
    const target = resumeRef.current.target;
    trackingRef.current = false; // pause progress saving until we've anchored
    const apply = () => {
      const c = scrollRef.current;
      const el = target != null ? blockEls.current.get(section?.blocks[target]?.id ?? "") : null;
      if (geo) {
        const page = el ? pageOfEl(el) : 0;
        anchorRef.current = target ?? 0; // anchor for any reflow before tracking resumes
        setPg((p) => ({ ...p, page }));
        c?.scrollTo({ left: page * geo.stride });
        return;
      }
      if (el) el.scrollIntoView({ block: "start" });
      else c?.scrollTo({ top: 0 });
    };
    apply();
    // Re-apply after layout settles, then start tracking. Without this the
    // position can land slightly off (and the observer below would then save
    // that wrong spot, corrupting the saved position for the next refresh).
    const raf = requestAnimationFrame(() => {
      apply();
      trackingRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [sectionIndex, pendingScrollBlock, section, consumeScroll]);

  // --- Progress tracking (topmost visible block) --------------------------
  useEffect(() => {
    if (!book || !section) return;
    const root = scrollRef.current;
    const tops = new Map<number, number>();
    let raf = 0;
    const save = () => {
      raf = 0;
      if (!trackingRef.current) return; // don't clobber the resume target before anchoring
      let bestIdx = 0;
      if (paged) {
        // Columns share a top edge, so "topmost" is meaningless — the earliest
        // block still on screen is the start of the current page. (The reflow
        // anchor is tracked in the snap handler, only when the page is settled —
        // updating it here would corrupt it mid-resize.)
        if (!tops.size) return;
        bestIdx = Math.min(...tops.keys());
      } else {
        let bestTop = Infinity;
        for (const [idx, top] of tops) {
          if (top >= -4 && top < bestTop) {
            bestTop = top;
            bestIdx = idx;
          }
        }
        anchorRef.current = bestIdx; // anchor for a later switch back into paged mode
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
  }, [book, section, sectionIndex, setProgress, paged]);

  // Close the dict popup on scroll (its anchor rect goes stale).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => { if (useReader.getState().active) setActive(null); clearHover(); };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [setActive, clearHover]);

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
        className={`relative flex-1 overscroll-contain ${
          geo ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto"
        }`}
        onClick={onClick}
        onMouseUp={onSelectionEnd}
        onTouchEnd={onSelectionEnd}
        onMouseMove={onMouseMove}
        onMouseLeave={clearHover}
      >
        <TtsCursor blockEls={blockEls} scrollRef={scrollRef} />
        <ActiveWordHighlight blockEls={blockEls} scrollRef={scrollRef} />
        <article
          data-testid="reader"
          className={`font-reading text-slate-800 dark:text-slate-200 ${
            geo ? "h-full" : "mx-auto max-w-2xl px-5 py-6"
          }`}
          style={
            geo
              ? {
                  ...fontStyle,
                  height: "100%",
                  boxSizing: "border-box",
                  padding: `24px ${geo.pad}px`,
                  columnWidth: geo.colW || undefined,
                  columnGap: geo.gap,
                  columnFill: "auto",
                }
              : fontStyle
          }
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
              registerRef={registerBlock(block.id)}
            />
          ))}

          {!geo && (
            <SectionNav
              hasPrev={sectionIndex > 0}
              hasNext={sectionIndex < book.sections.length - 1}
              onPrev={() => setSection(sectionIndex - 1)}
              onNext={() => setSection(sectionIndex + 1)}
            />
          )}
        </article>
      </div>

      {geo && (
        <PageControls
          page={pg.page}
          max={pg.max}
          canPrev={pg.page > 0 || sectionIndex > 0}
          canNext={pg.page < pg.max || sectionIndex < book.sections.length - 1}
          onPrev={() => flip(-1)}
          onNext={() => flip(1)}
        />
      )}

      {(() => {
        // Render exactly one popup instance — when the user clicks a hovered
        // word, the same DOM node persists so its position is stable.
        const props = active
          ? {
              word: active.token.word,
              entries: active.entries,
              alternatives: active.token.alternatives,
              rect: active.rect,
              persistent: true as const,
              onPickToken,
              sentence: active.sentence,
              position: active.position,
            }
          : hover && hoverTranslate
            ? {
                word: hover.word,
                entries: hover.entries,
                alternatives: [],
                rect: hover.rect,
                persistent: false as const,
              }
            : null;
        return props && <DictPopup {...props} />;
      })()}
    </div>
  );
}

function BlockView({
  block,
  bookId,
  index,
  isTts,
  registerRef,
}: {
  block: Block;
  bookId: string;
  index: number;
  isTts: boolean;
  registerRef: (el: HTMLElement | null) => void;
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

  // Plain text only — the active-word and TTS highlights are drawn as overlays
  // (ActiveWordHighlight / TtsCursor) so tapping a word never mutates this text
  // node and can't collapse an in-progress selection.
  const content = block.text;

  const common = {
    ref: registerRef as never,
    "data-block-index": index,
    title: "Tap a word to define",
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

/** Translucent highlight over the word currently being read aloud. Positioned
 *  in the scroll container's content space so it scrolls along with the text,
 *  and isolated in its own component so per-word updates don't re-render the
 *  whole section. */
function TtsCursor({
  blockEls,
  scrollRef,
}: {
  blockEls: React.MutableRefObject<Map<string, HTMLElement>>;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const word = useReader((s) => s.ttsWord);
  const [boxes, setBoxes] = useState<{ top: number; left: number; width: number; height: number }[]>([]);

  useLayoutEffect(() => {
    const el = word ? blockEls.current.get(word.blockId) : null;
    const c = scrollRef.current;
    if (!word || !el || !c) return setBoxes([]);
    // One box per visual line, so a sentence-length highlight (OpenAI engine)
    // wraps cleanly instead of drawing one overshooting rectangle.
    const rects = rectsForRange(el, word.start, word.end).filter((r) => r.width > 0);
    const cr = c.getBoundingClientRect();
    setBoxes(rects.map((r) => ({ top: r.top - cr.top + c.scrollTop, left: r.left - cr.left + c.scrollLeft, width: r.width, height: r.height })));
  }, [word, blockEls, scrollRef]);

  if (!boxes.length) return null;
  return (
    <>
      {boxes.map((box, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute rounded bg-amber-300/40 transition-all duration-100 ease-out dark:bg-amber-400/30"
          style={box}
        />
      ))}
    </>
  );
}

/** Highlight box over the tapped (active) word. Like TtsCursor, it's an overlay
 *  rather than an inline span, so defining a word never splits the paragraph's
 *  text node — which would otherwise collapse a double-click / drag selection. */
function ActiveWordHighlight({
  blockEls,
  scrollRef,
}: {
  blockEls: React.MutableRefObject<Map<string, HTMLElement>>;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const active = useReader((s) => s.active);
  const book = useReader((s) => s.book);
  const sectionIndex = useReader((s) => s.sectionIndex);
  const [boxes, setBoxes] = useState<{ top: number; left: number; width: number; height: number }[]>([]);

  useLayoutEffect(() => {
    const block = active ? book?.sections[sectionIndex]?.blocks[active.position.blockIndex] : null;
    const el = block ? blockEls.current.get(block.id) : null;
    const c = scrollRef.current;
    if (!active || !el || !c) return setBoxes([]);
    const rects = rectsForRange(el, active.token.start, active.token.end).filter((r) => r.width > 0);
    const cr = c.getBoundingClientRect();
    setBoxes(rects.map((r) => ({ top: r.top - cr.top + c.scrollTop, left: r.left - cr.left + c.scrollLeft, width: r.width, height: r.height })));
  }, [active, book, sectionIndex, blockEls, scrollRef]);

  if (!boxes.length) return null;
  return (
    <>
      {boxes.map((box, i) => (
        <div key={i} aria-hidden className="pointer-events-none absolute rounded bg-amber-200/70 dark:bg-amber-500/40" style={box} />
      ))}
    </>
  );
}

interface HoverInfo {
  word: string;
  entries: DictEntry[];
  /** Anchor rect (viewport coords) of the hovered word. */
  rect: DOMRect;
}

/** Flip-through controls for paged mode: tappable edge zones (left/right) and a
 *  small page indicator. Rendered outside the scroller so they stay put. */
function PageControls({
  page,
  max,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  page: number;
  max: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <button
        aria-label="Previous page"
        disabled={!canPrev}
        onClick={onPrev}
        className="group absolute inset-y-0 left-0 flex w-12 items-center justify-center text-slate-400 disabled:opacity-0 sm:w-14"
      >
        <IconChevronLeft className="h-6 w-6 opacity-40 transition-opacity group-hover:opacity-100" />
      </button>
      <button
        aria-label="Next page"
        disabled={!canNext}
        onClick={onNext}
        className="group absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 disabled:opacity-0 sm:w-14"
      >
        <IconChevronRight className="h-6 w-6 opacity-40 transition-opacity group-hover:opacity-100" />
      </button>
      <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-xs tabular-nums text-slate-400 dark:text-slate-500">
        {page + 1} / {max + 1}
      </div>
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
