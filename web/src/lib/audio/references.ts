import type { SoundSource } from "../types";
import { ANALYSIS_SR } from "./decode";

/**
 * Reference sounds synthesised in the browser. They are real audio and go
 * through exactly the same analysis as an upload — nothing is precomputed.
 */

function makeBuffer(data: Float32Array): AudioBuffer {
  const buf = new AudioBuffer({ length: data.length, numberOfChannels: 1, sampleRate: ANALYSIS_SR });
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return buf;
}

function normalise(x: Float32Array, peak = 0.85) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * peak;
}

/** A deterministic pseudo-random generator for the strike transient. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff) * 2 - 1;
}

/**
 * Additive model of a tuned church bell. Partial ratios follow the classic
 * hum / prime / tierce / quint / nominal structure reported for bells
 * (e.g. Rossing, "The Science of Sound"), each with its own decay rate.
 */
export function referenceBell(): SoundSource {
  const prime = 293.66; // D4
  const partials: [number, number, number][] = [
    // ratio, amplitude, decay (1/s)
    [0.5, 0.55, 0.45],
    [1.0, 0.7, 0.8],
    [1.183, 0.65, 1.1],
    [1.506, 0.35, 1.6],
    [2.0, 1.0, 1.0],
    [2.514, 0.45, 2.0],
    [2.662, 0.3, 2.4],
    [3.011, 0.28, 2.9],
    [4.166, 0.18, 3.6],
    [5.433, 0.1, 4.5],
  ];
  const dur = 4.0;
  const n = Math.floor(dur * ANALYSIS_SR);
  const x = new Float32Array(n);
  for (const [r, a, d] of partials) {
    const f = prime * r;
    const w = (2 * Math.PI * f) / ANALYSIS_SR;
    // Slight beating from an asymmetric bell: a weak doublet 0.4 Hz away.
    const w2 = (2 * Math.PI * (f + 0.4)) / ANALYSIS_SR;
    const decay = Math.exp(-d / ANALYSIS_SR);
    let env = a;
    for (let i = 0; i < n; i++) {
      x[i] += env * (0.85 * Math.sin(w * i) + 0.15 * Math.sin(w2 * i));
      env *= decay;
    }
  }
  // Short, quiet strike transient (filtered noise, ~15 ms).
  const rand = rng(7);
  let lp = 0;
  const tn = Math.floor(0.015 * ANALYSIS_SR);
  for (let i = 0; i < tn; i++) {
    lp = 0.7 * lp + 0.3 * rand();
    x[i] += lp * 0.25 * (1 - i / tn);
  }
  // 2 ms attack to avoid a click.
  const att = Math.floor(0.002 * ANALYSIS_SR);
  for (let i = 0; i < att; i++) x[i] *= i / att;
  normalise(x);
  const buffer = makeBuffer(x);
  return {
    kind: "reference-bell",
    name: "reference-bell.wav",
    sizeBytes: null,
    buffer,
    durationS: buffer.duration,
    sourceSampleRate: ANALYSIS_SR,
    channels: 1,
  };
}

/** Harmonic reference: 10 harmonics with 1/k amplitudes (a soft sawtooth-like tone). */
export function referenceHarmonic(): SoundSource {
  const f0 = 220;
  const dur = 3.0;
  const n = Math.floor(dur * ANALYSIS_SR);
  const x = new Float32Array(n);
  for (let k = 1; k <= 10; k++) {
    const w = (2 * Math.PI * f0 * k) / ANALYSIS_SR;
    const decay = Math.exp(-(0.35 + 0.08 * k) / ANALYSIS_SR);
    let env = 1 / k;
    for (let i = 0; i < n; i++) {
      x[i] += env * Math.sin(w * i);
      env *= decay;
    }
  }
  const att = Math.floor(0.02 * ANALYSIS_SR);
  for (let i = 0; i < att; i++) x[i] *= i / att;
  const rel = Math.floor(0.05 * ANALYSIS_SR);
  for (let i = 0; i < rel; i++) x[n - 1 - i] *= i / rel;
  normalise(x);
  const buffer = makeBuffer(x);
  return {
    kind: "reference-harmonic",
    name: "harmonic-reference.wav",
    sizeBytes: null,
    buffer,
    durationS: buffer.duration,
    sourceSampleRate: ANALYSIS_SR,
    channels: 1,
  };
}
