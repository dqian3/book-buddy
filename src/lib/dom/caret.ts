// Map a pointer location to a character index inside a text container, and turn
// a character range back into a screen rectangle. This is how a tap on a word
// becomes a (start,end) offset we can segment + highlight + anchor a popup to.

interface CaretPos {
  node: Node;
  offset: number;
}

function caretFromPoint(x: number, y: number): CaretPos | null {
  // Chrome/Safari
  const anyDoc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (anyDoc.caretRangeFromPoint) {
    const r = anyDoc.caretRangeFromPoint(x, y);
    if (r) return { node: r.startContainer, offset: r.startOffset };
  }
  // Firefox
  if (anyDoc.caretPositionFromPoint) {
    const p = anyDoc.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
  }
  return null;
}

/** Whether the screen point actually falls on the glyph at this caret rather
 *  than merely near it. caretRangeFromPoint snaps to the closest caret even when
 *  the point is in empty space — e.g. the blank area below the last line of a
 *  paged column — which would otherwise resolve to a far-off "random" word. The
 *  client rect of a one-character range covers the full line box, so a tap
 *  anywhere on a line counts but a tap in the empty margin/footer is rejected. */
function pointOnGlyph(pos: CaretPos, x: number, y: number): boolean {
  if (pos.node.nodeType !== Node.TEXT_NODE) return true;
  const text = pos.node.textContent ?? "";
  if (!text.length) return false;
  const start = Math.min(pos.offset, text.length - 1); // char on either side of the caret
  const range = document.createRange();
  range.setStart(pos.node, start);
  range.setEnd(pos.node, start + 1);
  const PAD = 6;
  for (const r of range.getClientRects()) {
    if (x >= r.left - PAD && x <= r.right + PAD && y >= r.top - PAD && y <= r.bottom + PAD) return true;
  }
  return false;
}

/** Absolute character index within `container` for the given screen point. */
export function charIndexFromPoint(container: HTMLElement, x: number, y: number): number | null {
  const pos = caretFromPoint(x, y);
  if (!pos || !container.contains(pos.node)) return null;
  if (!pointOnGlyph(pos, x, y)) return null;
  let idx = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === pos.node) return idx + pos.offset;
    idx += node.textContent?.length ?? 0;
  }
  return null;
}

/** Absolute character index within `container` for a (node, offset) caret —
 *  e.g. the start of a Selection range. */
export function charIndexOfNode(container: HTMLElement, node: Node, offset: number): number | null {
  if (!container.contains(node)) return null;
  let idx = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === node) return idx + offset;
    idx += n.textContent?.length ?? 0;
  }
  return idx;
}

/** Find the text node + local offset for an absolute index within container. */
function locate(container: HTMLElement, index: number): CaretPos | null {
  let idx = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (index <= idx + len) return { node, offset: index - idx };
    idx += len;
  }
  return null;
}

function rangeFor(container: HTMLElement, start: number, end: number): Range | null {
  const a = locate(container, start);
  const b = locate(container, end);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** Bounding rectangle (viewport coords) for the character range [start,end). */
export function rectForRange(container: HTMLElement, start: number, end: number): DOMRect | null {
  return rangeFor(container, start, end)?.getBoundingClientRect() ?? null;
}

/** Per-line rectangles (viewport coords) for [start,end) — one box per visual
 *  line, so a multi-line span can be highlighted without overshooting. */
export function rectsForRange(container: HTMLElement, start: number, end: number): DOMRect[] {
  const range = rangeFor(container, start, end);
  return range ? Array.from(range.getClientRects()) : [];
}
