// Read-aloud controller: ties the reader store + settings to the TTS engine.
// Two entry points — startReadThrough (continuous, from the current position)
// and speakSelection (a highlighted passage) — both drive the block highlight
// and word cursor and can be paused/stopped from the toolbar.

import { isTextBlock } from "../book/model";
import type { ActiveSelection } from "../../state/reader";
import { useReader } from "../../state/reader";
import { useLibrary } from "../../state/library";
import { useSettings } from "../../state/settings";
import { useUsage } from "../../state/usage";
import { tts, speakOptionsFor, type Segment, type SpeakOptions } from "./speech";

// Every start bumps this; in-flight engine callbacks captured with an older
// token become no-ops, so a stopped/restarted read can't keep advancing.
let gen = 0;
let queue: Segment[] = [];
let index = 0;
let rate: number | undefined;

function options(): SpeakOptions {
  const s = useSettings.getState();
  const language = useReader.getState().book?.language ?? "";
  const base = speakOptionsFor(language, s);
  return rate ? { ...base, rate } : base;
}

function clearState() {
  const r = useReader.getState();
  r.setTts(null, false);
  r.setTtsPaused(false);
  r.setTtsWord(null);
}

/** Read the current section aloud from `fromBlock` (default: reading position). */
export function startReadThrough(fromBlock?: number) {
  const r = useReader.getState();
  const { book, sectionIndex } = r;
  if (!book) return;
  const section = book.sections[sectionIndex];
  if (!section) return;

  const saved = useLibrary.getState().progress[book.id];
  const start = fromBlock ?? (saved?.sectionIndex === sectionIndex ? saved.blockIndex : 0);

  queue = [];
  for (let i = Math.max(0, start); i < section.blocks.length; i++) {
    const b = section.blocks[i];
    if (isTextBlock(b) && b.text?.trim()) queue.push({ id: b.id, text: b.text });
  }
  if (!queue.length) return;

  rate = undefined;
  index = 0;
  const myGen = ++gen;
  useReader.getState().setTts(queue[0].id, true);
  playCurrent(myGen);
}

// Speak one block at a time, advancing on its end. Block-by-block (rather than
// queueing the whole section) keeps the OpenAI engine to one request per block
// so its highlight tracks too, and makes stop/pause boundaries clean.
function playCurrent(myGen: number) {
  if (myGen !== gen) return;
  if (index >= queue.length) {
    stopReadAloud();
    return;
  }
  const seg = queue[index];
  speak([seg], myGen, () => {
    if (myGen !== gen) return;
    index += 1;
    playCurrent(myGen);
  });
}

/** Read a highlighted passage aloud, with the cursor anchored to its block. */
export function speakSelection(sel: ActiveSelection) {
  const book = useReader.getState().book;
  const block = book?.sections[sel.sectionIndex]?.blocks[sel.blockIndex];
  queue = [];
  rate = undefined;
  const myGen = ++gen;
  const seg: Segment = { id: block?.id ?? "selection", text: sel.text, offset: sel.start };
  if (block) useReader.getState().setTts(block.id, true);
  else useReader.getState().setTts(null, true);
  speak([seg], myGen, () => myGen === gen && stopReadAloud());
}

function speak(segments: Segment[], myGen: number, onDone: () => void) {
  tts.speak(segments, options(), {
    onSegmentStart: (id) => {
      if (myGen === gen) useReader.getState().setTts(id, true);
    },
    onBoundary: (id, start, end) => {
      if (myGen === gen) useReader.getState().setTtsWord({ blockId: id, start, end });
    },
    onUsage: (chars) =>
      useUsage.getState().record({
        provider: "openai-tts",
        model: useSettings.getState().ttsOpenAIModel,
        kind: "tts",
        calls: 1,
        chars,
      }),
    onEnd: onDone,
    onError: () => {
      if (myGen === gen) stopReadAloud();
    },
  });
}

export function pauseReadAloud() {
  tts.pause();
  useReader.getState().setTtsPaused(true);
}

export function resumeReadAloud() {
  tts.resume();
  useReader.getState().setTtsPaused(false);
}

export function stopReadAloud() {
  gen += 1; // invalidate any in-flight callbacks
  queue = [];
  index = 0;
  tts.stop();
  clearState();
}
