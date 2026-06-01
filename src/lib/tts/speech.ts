import { splitSentences } from "../text";
import { ttsGet, ttsPut } from "../storage/db";
import type { SettingsState } from "../../state/settings";

// Speaks a sequence of "segments" (each tied to a block id) so the reader can
// highlight whichever block is being read. Two engines:
//   - "browser": the free SpeechSynthesis API. Long segments are split into
//     sentence-sized utterances to dodge Chrome's ~15s utterance cut-off.
//   - "openai": OpenAI's /audio/speech endpoint — much more natural, costs
//     money, plays back a single MP3 (so highlighting lands on the first block).

/** Voices OpenAI's speech API offers (all language-agnostic). */
export const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;

/** Speech models selectable for the OpenAI engine. */
export const OPENAI_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"] as const;

// djb2 — cheap stable hash for cache keys (clip text can be long).
function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36) + ":" + text.length;
}

export interface Segment {
  id: string;
  text: string;
  /** Char offset of `text` within its owning block, so boundary events can be
   *  mapped back to a position in the rendered block (default 0). */
  offset?: number;
}

export interface SpeakHandlers {
  onSegmentStart?: (id: string) => void;
  /** Fires per spoken word (browser engine only). start/end are char offsets
   *  within the segment's owning block. */
  onBoundary?: (id: string, start: number, end: number) => void;
  /** Characters actually sent to the paid API (cache misses only). */
  onUsage?: (chars: number) => void;
  onEnd?: () => void;
  onError?: (e: string) => void;
}

/** Length of the word starting at `index`; uses charLength when the engine
 *  provides it, else scans to the next whitespace. */
function wordLengthAt(text: string, index: number, charLength?: number): number {
  if (typeof charLength === "number" && charLength > 0) return charLength;
  const m = /\S+/.exec(text.slice(index));
  return m ? m[0].length : 1;
}

export interface OpenAITtsConfig {
  apiKey: string;
  baseUrl: string;
  voice: string;
  model: string;
}

export interface SpeakOptions {
  lang: string;
  rate: number;
  engine?: "browser" | "openai";
  voiceURI?: string | null; // browser engine
  openai?: OpenAITtsConfig; // openai engine
}

// Higher = less robotic. Modern OSes/browsers ship neural voices alongside the
// old local ones; the default pick should prefer them. Ranked by name because
// that's the only reliable signal the Web Speech API exposes.
function voiceRank(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  if (/\b(neural|natural)\b/.test(name)) return 4; // Microsoft "… Natural", neural
  if (name.includes("google")) return 3; //           Chrome's network voices
  if (/\b(enhanced|premium)\b/.test(name)) return 2; // Apple enhanced/premium Siri
  if (!v.localService) return 1; //                    any other network voice
  return 0; //                                         default local voice
}

class Tts {
  private supported = typeof window !== "undefined" && "speechSynthesis" in window;
  private keepAlive: number | null = null;
  private audio: HTMLAudioElement | null = null; // active openai playback
  private audioUrl: string | null = null;
  private fetchAbort: AbortController | null = null;

  isSupported() {
    return this.supported;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.supported ? window.speechSynthesis.getVoices() : [];
  }

  /** Resolve once the voice list is populated (it loads asynchronously). */
  async ready(): Promise<SpeechSynthesisVoice[]> {
    if (!this.supported) return [];
    const have = this.getVoices();
    if (have.length) return have;
    return new Promise((resolve) => {
      const done = () => resolve(this.getVoices());
      window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1000); // fallback if the event never fires
    });
  }

  private pickVoice(opts: SpeakOptions): SpeechSynthesisVoice | undefined {
    const voices = this.getVoices();
    if (opts.voiceURI) {
      const chosen = voices.find((v) => v.voiceURI === opts.voiceURI);
      if (chosen) return chosen;
    }
    const base = opts.lang.toLowerCase().split("-")[0];
    const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
    if (!matches.length) return undefined;
    // Highest rank wins; reduce keeps the first voice on ties.
    return matches.reduce((best, v) => (voiceRank(v) > voiceRank(best) ? v : best));
  }

  speak(segments: Segment[], opts: SpeakOptions, handlers: SpeakHandlers = {}) {
    this.stop();
    if (opts.engine === "openai") {
      void this.speakOpenAI(segments, opts, handlers);
      return;
    }
    if (!this.supported) {
      handlers.onError?.("Text-to-speech isn't supported in this browser.");
      return;
    }
    const voice = this.pickVoice(opts);

    // Flatten into sentence-sized utterances, each tagged with its block id and
    // the char offset of its text within that block (so word-boundary events map
    // back to a position in the rendered block).
    const plan: { text: string; blockId: string; base: number; isStart: boolean }[] = [];
    for (const seg of segments) {
      const sentences = splitSentences(seg.text);
      const parts = sentences.length ? sentences : [seg.text];
      let cursor = 0;
      parts.forEach((text, i) => {
        const at = seg.text.indexOf(text, cursor); // sentences are trimmed; relocate them
        const within = at >= 0 ? at : cursor;
        if (at >= 0) cursor = at + text.length;
        plan.push({ text, blockId: seg.id, base: (seg.offset ?? 0) + within, isStart: i === 0 });
      });
    }
    if (!plan.length) return;

    plan.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.text);
      u.lang = opts.lang;
      u.rate = opts.rate;
      if (voice) u.voice = voice;
      if (p.isStart) u.onstart = () => handlers.onSegmentStart?.(p.blockId);
      if (handlers.onBoundary) {
        u.onboundary = (e) => {
          if (e.name && e.name !== "word") return; // ignore sentence boundaries
          const start = p.base + e.charIndex;
          handlers.onBoundary!(p.blockId, start, start + wordLengthAt(p.text, e.charIndex, e.charLength));
        };
      }
      if (i === plan.length - 1) {
        u.onend = () => {
          this.stopKeepAlive();
          handlers.onEnd?.();
        };
      }
      u.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          this.stopKeepAlive();
          handlers.onError?.(e.error);
        }
      };
      window.speechSynthesis.speak(u);
    });

    this.startKeepAlive();
  }

  // The audio API returns opaque MP3 with no timing, so to track progress we
  // request one clip per sentence and play them in order — firing onBoundary as
  // each starts, which lights up that sentence. Clips are prefetched one ahead
  // to keep the gap between sentences small.
  private async speakOpenAI(segments: Segment[], opts: SpeakOptions, handlers: SpeakHandlers) {
    const cfg = opts.openai;
    if (!cfg?.apiKey) {
      handlers.onError?.("Add your OpenAI API key in Settings to use natural speech.");
      return;
    }

    const clips: { text: string; blockId: string; start: number; isStart: boolean }[] = [];
    for (const seg of segments) {
      const sentences = splitSentences(seg.text);
      const parts = sentences.length ? sentences : [seg.text];
      let cursor = 0;
      parts.forEach((text, i) => {
        const at = seg.text.indexOf(text, cursor);
        const within = at >= 0 ? at : cursor;
        if (at >= 0) cursor = at + text.length;
        clips.push({ text, blockId: seg.id, start: (seg.offset ?? 0) + within, isStart: i === 0 });
      });
    }
    if (!clips.length) return;

    const abort = new AbortController();
    this.fetchAbort = abort;

    const fetchClip = async (text: string): Promise<Blob> => {
      // Cache by model+voice+text so re-reading a passage doesn't bill again.
      const key = `${cfg.model}:${cfg.voice}:${hashText(text)}`;
      const cached = await ttsGet(key);
      if (cached) return cached;
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/audio/speech`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        signal: abort.signal,
        body: JSON.stringify({ model: cfg.model, voice: cfg.voice, input: text, response_format: "mp3" }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI TTS ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }
      const blob = await res.blob();
      handlers.onUsage?.(text.length); // only billed on a cache miss
      void ttsPut(key, blob);
      return blob;
    };

    try {
      let next = fetchClip(clips[0].text);
      for (let i = 0; i < clips.length; i++) {
        const blob = await next;
        if (abort.signal.aborted) return;
        if (i + 1 < clips.length) next = fetchClip(clips[i + 1].text);

        const clip = clips[i];
        if (clip.isStart) handlers.onSegmentStart?.(clip.blockId);
        handlers.onBoundary?.(clip.blockId, clip.start, clip.start + clip.text.length);
        await this.playClip(blob, opts.rate || 1, abort);
        if (abort.signal.aborted) return;
      }
      this.cleanupAudio();
      handlers.onEnd?.();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // stopped by user
      this.cleanupAudio();
      handlers.onError?.(e instanceof Error ? e.message : "Text-to-speech failed.");
    }
  }

  /** Play one MP3 blob to completion (or until stopped). */
  private playClip(blob: Blob, rate: number, abort: AbortController): Promise<void> {
    return new Promise((resolve, reject) => {
      if (abort.signal.aborted) return resolve();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = rate;
      this.audio = audio;
      this.audioUrl = url;
      const onAbort = () => finish(resolve);
      const finish = (cb: () => void) => {
        abort.signal.removeEventListener("abort", onAbort);
        this.cleanupAudio();
        cb();
      };
      abort.signal.addEventListener("abort", onAbort, { once: true });
      audio.onended = () => finish(resolve);
      audio.onerror = () => finish(() => reject(new Error("Couldn't play the generated audio.")));
      void audio.play().catch((e) => finish(() => reject(e)));
    });
  }

  pause() {
    if (this.audio) this.audio.pause();
    else if (this.supported) window.speechSynthesis.pause();
  }
  resume() {
    if (this.audio) void this.audio.play();
    else if (this.supported) window.speechSynthesis.resume();
  }
  stop() {
    this.fetchAbort?.abort();
    this.fetchAbort = null;
    this.cleanupAudio();
    if (this.supported) window.speechSynthesis.cancel();
    this.stopKeepAlive();
  }
  get speaking() {
    if (this.audio) return !this.audio.paused;
    return this.supported && window.speechSynthesis.speaking;
  }

  private cleanupAudio() {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }
  }

  // Chrome pauses long synthesis after ~15s; nudging resume() keeps it going.
  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAlive = window.setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 8000);
  }
  private stopKeepAlive() {
    if (this.keepAlive !== null) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
  }
}

export const tts = new Tts();

/** Map a book language to a TTS BCP-47 hint. */
export function ttsLangFor(language: string): string {
  const l = language.toLowerCase();
  if (l === "zh" || l.startsWith("zh-")) return "zh-CN";
  return l;
}

/** Assemble speak options for a book from the current settings snapshot. */
export function speakOptionsFor(language: string, s: SettingsState): SpeakOptions {
  return {
    lang: ttsLangFor(language),
    rate: s.ttsRate,
    engine: s.ttsEngine,
    voiceURI: s.ttsVoiceURI,
    openai: {
      apiKey: s.providerConfig.openai.apiKey,
      baseUrl: s.providerConfig.openai.baseUrl,
      voice: s.ttsOpenAIVoice,
      model: s.ttsOpenAIModel,
    },
  };
}
