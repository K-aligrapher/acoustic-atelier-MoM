/**
 * Sample-based playback (PRD FR-35 .. FR-40).
 *
 * Each note is an AudioBufferSourceNode playing the uploaded sample with
 * playbackRate = target frequency / sample reference frequency. Because the
 * rate scales every partial by the same ratio, the transposed sound matches
 * the dissonance model's assumption.
 */

/** Amplitude envelope. Times in seconds, sustain is a level from 0 to 1. */
export interface ADSR {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export const ADSR_PRESETS: Record<string, ADSR> = {
  "Bell (natural)": { attack: 0.002, decay: 6, sustain: 0, release: 2.5 },
  Pluck: { attack: 0.002, decay: 0.45, sustain: 0, release: 0.25 },
  Pad: { attack: 0.6, decay: 0.8, sustain: 0.75, release: 1.6 },
  Organ: { attack: 0.01, decay: 0.05, sustain: 1, release: 0.08 },
};
export const DEFAULT_ADSR: ADSR = ADSR_PRESETS["Bell (natural)"];

interface Voice {
  padId: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  started: number;
  releasing: boolean;
  release: number;
}

const MAX_VOICES = 16;
const ATTACK_S = 0.004;
const RELEASE_TC = 0.045; // time constant for release (~5 tc to silence)
const STEAL_TC = 0.012;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sample: AudioBuffer | null = null;
  private loopBuffer: AudioBuffer | null = null;
  private loop: { start: number; end: number } | null = null;
  private voices: Voice[] = [];
  private volume = 0.8;
  private listeners = new Set<(active: number) => void>();

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  get hasSample(): boolean {
    return !!this.sample;
  }

  /** Must be called from a user gesture the first time (autoplay policy). */
  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  onActivity(fn: (active: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const n = this.voices.filter((v) => !v.releasing).length;
    this.listeners.forEach((fn) => fn(n));
  }

  /**
   * Set the sample. `loop` (seconds) is the region used in hold mode; a
   * crossfaded copy of the buffer is prepared so the loop point is seamless.
   */
  setSample(buffer: AudioBuffer, loop: { start: number; end: number } | null) {
    this.stopAll(true);
    this.sample = buffer;
    this.loop = null;
    this.loopBuffer = null;
    if (!loop) return;
    const sr = buffer.sampleRate;
    const a = Math.floor(loop.start * sr);
    const b = Math.floor(loop.end * sr);
    if (b - a < 0.08 * sr) return;
    const xf = Math.min(Math.floor(0.06 * sr), Math.floor((b - a) / 3), a);
    if (xf < 64) return;
    const out = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: sr });
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = new Float32Array(src);
      // Equal-power crossfade: the end of the loop blends into the audio just
      // before the loop start, so jumping from b back to a is continuous.
      for (let i = 0; i < xf; i++) {
        const t = i / xf;
        dst[b - xf + i] = src[b - xf + i] * Math.cos((t * Math.PI) / 2) + src[a - xf + i] * Math.sin((t * Math.PI) / 2);
      }
      out.copyToChannel(dst, c);
    }
    this.loopBuffer = out;
    this.loop = { start: a / sr, end: b / sr };
  }

  get canHold(): boolean {
    return !!this.loopBuffer;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  async noteOn(padId: string, rate: number, env: ADSR) {
    if (!this.sample) return;
    const ctx = await this.ensure();
    if (!this.master) return;
    for (const v of this.voices) if (v.padId === padId && !v.releasing) this.release(v, STEAL_TC);

    // Voice stealing: release the oldest voices when polyphony is exhausted.
    const live = this.voices.filter((v) => !v.releasing);
    while (live.length >= MAX_VOICES) this.release(live.shift()!, STEAL_TC);

    const t = ctx.currentTime;
    // A sustaining envelope needs the sample to keep sounding: loop the analysed region.
    const loop = env.sustain > 0 && this.loopBuffer && this.loop;
    const src = ctx.createBufferSource();
    src.buffer = loop ? this.loopBuffer : this.sample;
    src.playbackRate.value = Math.max(0.01, Math.min(rate, 32));
    if (loop && this.loop) {
      src.loop = true;
      src.loopStart = this.loop.start;
      src.loopEnd = this.loop.end;
    }
    const peak = 0.9;
    const a = Math.max(ATTACK_S, env.attack);
    const gain = ctx.createGain();
    const g = gain.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    // Exponential-style decay towards the sustain level (time constant = decay / 4).
    g.setTargetAtTime(peak * env.sustain, t + a, Math.max(0.005, env.decay / 4));
    src.connect(gain).connect(this.master);
    src.start(t);

    const voice: Voice = { padId, src, gain, started: t, releasing: false, release: env.release };
    src.onended = () => {
      gain.disconnect();
      this.voices = this.voices.filter((v) => v !== voice);
      this.emit();
    };
    this.voices.push(voice);
    this.emit();
  }

  /** Key released: fade out over the envelope's release time. */
  noteOff(padId: string) {
    for (const v of this.voices) if (v.padId === padId && !v.releasing) this.release(v, Math.max(0.005, v.release / 5));
  }

  /** Play a note and release it automatically (for clicks on rows, curve points, Play). */
  async trigger(padId: string, rate: number, env: ADSR, holdS = 0.35) {
    await this.noteOn(padId, rate, env);
    setTimeout(() => this.noteOff(padId), holdS * 1000);
  }

  private release(v: Voice, tc: number) {
    if (!this.ctx || v.releasing) return;
    v.releasing = true;
    const t = this.ctx.currentTime;
    const g = v.gain.gain;
    const held = g.value;
    if (typeof g.cancelAndHoldAtTime === "function") g.cancelAndHoldAtTime(t);
    else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(held, t);
    }
    g.setTargetAtTime(0, t, tc);
    try {
      v.src.stop(t + tc * 7);
    } catch {
      /* already stopped */
    }
    this.emit();
  }

  stopAll(immediate = false) {
    for (const v of this.voices) this.release(v, immediate ? 0.005 : RELEASE_TC);
    this.emit();
  }

  dispose() {
    this.stopAll(true);
    this.ctx?.close();
    this.ctx = null;
  }
}
