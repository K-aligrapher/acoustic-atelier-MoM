export const PITCH_CLASSES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11]);

export const centsToRatio = (c: number) => Math.pow(2, c / 1200);
export const ratioToCents = (r: number) => 1200 * Math.log2(r);

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function freqToMidi(f: number): number {
  return 69 + 12 * Math.log2(f / 440);
}

export function midiName(m: number): string {
  const pc = ((m % 12) + 12) % 12;
  return `${PITCH_CLASSES[pc]}${Math.floor(m / 12) - 1}`;
}

/** Name of the 12-TET note `semitones` above a root pitch class. */
export function relativeNoteName(rootPc: number, semitones: number): string {
  const pc = (((rootPc + semitones) % 12) + 12) % 12;
  const oct = Math.floor(semitones / 12);
  return PITCH_CLASSES[pc] + (oct > 0 ? "′".repeat(oct) : "");
}

/** True when the semitone above the root falls on a "white key" in C-relative terms. */
export function isNaturalStep(semitones: number): boolean {
  return NATURAL.has(((semitones % 12) + 12) % 12);
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

let RATIOS: { cents: number; p: number; q: number; h: number }[] | null = null;
function ratioTable() {
  if (!RATIOS) {
    RATIOS = [];
    for (let q = 1; q <= 16; q++)
      for (let p = q; p <= 64; p++)
        if (gcd(p, q) === 1) RATIOS.push({ cents: ratioToCents(p / q), p, q, h: Math.log2(p * q) });
  }
  return RATIOS;
}

/** Simplest ratio (lowest Tenney height) within `tol` cents — same rule as the engine. */
export function nearestSimpleRatio(cents: number, tol = 15): { ratio: string; error: number } | null {
  let best: { h: number; err: number; p: number; q: number } | null = null;
  for (const r of ratioTable()) {
    const err = cents - r.cents;
    if (Math.abs(err) <= tol) {
      if (!best || r.h < best.h || (r.h === best.h && Math.abs(err) < Math.abs(best.err))) best = { h: r.h, err, p: r.p, q: r.q };
    }
  }
  return best ? { ratio: `${best.p}/${best.q}`, error: best.err } : null;
}

export function nearest12(cents: number): { semitones: number; deviation: number } {
  const n = Math.round(cents / 100);
  return { semitones: n, deviation: cents - 100 * n };
}

// --- isomorphic grid ---------------------------------------------------------

export interface PadSpec {
  id: string;
  index: number; // absolute step index (0 = root)
  degree: number; // 0..K-1
  periodIndex: number;
  row: number; // 0 = bottom
  col: number;
}

export function buildGrid(K: number, cols: number, rows: number, offset: number, shift: number): PadSpec[][] {
  const out: PadSpec[][] = [];
  for (let r = rows - 1; r >= 0; r--) {
    const row: PadSpec[] = [];
    for (let c = 0; c < cols; c++) {
      const index = (r - 1 + shift) * offset + c;
      const degree = ((index % K) + K) % K;
      const periodIndex = Math.floor(index / K);
      row.push({ id: `p${index}`, index, degree, periodIndex, row: r, col: c });
    }
    out.push(row);
  }
  return out;
}

// Computer-keyboard rows (physical key codes), bottom row first.
export const KEY_ROWS: string[][] = [
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
];

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=",
  };
  if (map[code]) return map[code];
  return code.replace(/^Key|^Digit/, "");
}
