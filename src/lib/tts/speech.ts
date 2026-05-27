import { splitSentences } from "../text";

// Thin wrapper over the browser's free SpeechSynthesis API. Speaks a sequence
// of "segments" (each tied to a block id) so the reader can highlight whichever
// block is being read. Long segments are split into sentence-sized utterances
// to dodge Chrome's ~15s utterance cut-off.

export interface Segment {
  id: string;
  text: string;
}

export interface SpeakHandlers {
  onSegmentStart?: (id: string) => void;
  onEnd?: () => void;
  onError?: (e: string) => void;
}

export interface SpeakOptions {
  lang: string;
  rate: number;
  voiceURI?: string | null;
}

class Tts {
  private supported = typeof window !== "undefined" && "speechSynthesis" in window;
  private keepAlive: number | null = null;

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
    const lang = opts.lang.toLowerCase();
    return (
      voices.find((v) => v.lang.toLowerCase() === lang) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(lang.split("-")[0]))
    );
  }

  speak(segments: Segment[], opts: SpeakOptions, handlers: SpeakHandlers = {}) {
    if (!this.supported) {
      handlers.onError?.("Text-to-speech isn't supported in this browser.");
      return;
    }
    this.stop();
    const voice = this.pickVoice(opts);

    // Flatten into utterances, tagging the first utterance of each segment.
    const plan: { text: string; segId?: string }[] = [];
    for (const seg of segments) {
      const sentences = splitSentences(seg.text);
      const parts = sentences.length ? sentences : [seg.text];
      parts.forEach((text, i) => plan.push({ text, segId: i === 0 ? seg.id : undefined }));
    }
    if (!plan.length) return;

    plan.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.text);
      u.lang = opts.lang;
      u.rate = opts.rate;
      if (voice) u.voice = voice;
      if (p.segId) u.onstart = () => handlers.onSegmentStart?.(p.segId!);
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

  pause() {
    if (this.supported) window.speechSynthesis.pause();
  }
  resume() {
    if (this.supported) window.speechSynthesis.resume();
  }
  stop() {
    if (this.supported) window.speechSynthesis.cancel();
    this.stopKeepAlive();
  }
  get speaking() {
    return this.supported && window.speechSynthesis.speaking;
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
