/**
 * Synthesized WebAudio tones (no audio assets to license). Must be unlocked by a user gesture
 * (the Start button / first tap), per browser autoplay rules (PRD §5.3).
 */
export type Tone = "tap" | "warn" | "timeout" | "pass" | "start";

interface ToneSpec {
  freq: number;
  ms: number;
  type: OscillatorType;
  repeat?: number;
  gapMs?: number;
}

export const TONES: Record<Tone, ToneSpec> = {
  tap: { freq: 1200, ms: 25, type: "square" },
  pass: { freq: 660, ms: 90, type: "sine" },
  start: { freq: 880, ms: 160, type: "sine" },
  warn: { freq: 740, ms: 140, type: "triangle", repeat: 2, gapMs: 90 },
  timeout: { freq: 440, ms: 380, type: "sawtooth", repeat: 3, gapMs: 120 },
};

type Ctx = Pick<
  AudioContext,
  "currentTime" | "state" | "resume" | "createOscillator" | "createGain" | "destination"
>;

export interface AudioPlayer {
  unlock: () => Promise<boolean>;
  play: (tone: Tone, volume: number) => boolean;
  readonly unlocked: boolean;
}

export function createAudioPlayer(makeContext: () => Ctx | null): AudioPlayer {
  let ctx: Ctx | null = null;
  return {
    get unlocked() {
      return !!ctx && ctx.state === "running";
    },
    async unlock() {
      if (!ctx) ctx = makeContext();
      if (!ctx) return false;
      if (ctx.state !== "running") {
        try {
          await ctx.resume();
        } catch {
          return false;
        }
      }
      return ctx.state === "running";
    },
    play(tone, volume) {
      if (!ctx || ctx.state !== "running" || volume <= 0) return false;
      const spec = TONES[tone];
      const n = spec.repeat ?? 1;
      for (let i = 0; i < n; i++) {
        const start = ctx.currentTime + (i * (spec.ms + (spec.gapMs ?? 0))) / 1000;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = spec.type;
        osc.frequency.value = spec.freq;
        gain.gain.setValueAtTime(Math.min(1, volume) * 0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.ms / 1000);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + spec.ms / 1000 + 0.02);
      }
      return true;
    },
  };
}

let shared: AudioPlayer | null = null;
export function browserAudio(): AudioPlayer {
  if (!shared) {
    shared = createAudioPlayer(() => {
      if (typeof window === "undefined") return null;
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return AC ? new AC() : null;
    });
  }
  return shared;
}
