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

/** Absolute character index within `container` for the given screen point. */
export function charIndexFromPoint(container: HTMLElement, x: number, y: number): number | null {
  const pos = caretFromPoint(x, y);
  if (!pos || !container.contains(pos.node)) return null;
  let idx = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === pos.node) return idx + pos.offset;
    idx += node.textContent?.length ?? 0;
  }
  return null;
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

/** Bounding rectangle (viewport coords) for the character range [start,end). */
export function rectForRange(container: HTMLElement, start: number, end: number): DOMRect | null {
  const a = locate(container, start);
  const b = locate(container, end);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range.getBoundingClientRect();
}
