export const fmtHz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${f.toFixed(f < 100 ? 2 : 1)} Hz`);
export const fmtHzShort = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(1)}k` : `${Math.round(f)}`);
export const fmtCents = (c: number, digits = 1) => `${c.toFixed(digits)}¢`;
export const fmtSigned = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
export const fmtDb = (d: number) => `${d >= 0 ? "" : "−"}${Math.abs(d).toFixed(1)} dB`;
export const fmtDuration = (s: number) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`);
export const fmtBytes = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const fmtRough = (r: number) => (r === 0 ? "0" : r < 0.001 ? r.toExponential(1) : r.toFixed(r < 0.1 ? 4 : 3));

const ROMAN: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

/** "bell-strike_01.wav" -> "Bell Strike 01" */
export function titleFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  return stem.replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled";
}
