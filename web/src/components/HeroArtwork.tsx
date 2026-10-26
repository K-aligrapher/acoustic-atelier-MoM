import { useMemo } from "react";

/**
 * Engraved "plate" for the hero: a cents dial, resonance rings spaced by bell
 * partial ratios, and the true Sethares roughness curve of a six-partial
 * harmonic tone drawn across a manuscript staff.
 */

function roughnessCurve(): [number, number][] {
  const f = [1, 2, 3, 4, 5, 6].map((k) => 261.6 * k);
  const a = [1, 0.88, 0.77, 0.68, 0.6, 0.53];
  const d = (f1: number, f2: number, a1: number, a2: number) => {
    const s = 0.24 / (0.0207 * Math.min(f1, f2) + 18.96);
    const x = s * Math.abs(f2 - f1);
    return Math.min(a1, a2) * (Math.exp(-3.5 * x) - Math.exp(-5.75 * x));
  };
  const pts: [number, number][] = [];
  for (let c = 0; c <= 1200; c += 4) {
    const r = Math.pow(2, c / 1200);
    const F = [...f, ...f.map((x) => x * r)];
    const A = [...a, ...a];
    let R = 0;
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) R += d(F[i], F[j], A[i], A[j]);
    pts.push([c, R]);
  }
  return pts;
}

const BELL_RATIOS = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011];
const JUST = [
  { c: 0, l: "1/1" },
  { c: 386.3, l: "5/4" },
  { c: 498.0, l: "4/3" },
  { c: 702.0, l: "3/2" },
  { c: 884.4, l: "5/3" },
];

export function HeroArtwork() {
  const curve = useMemo(roughnessCurve, []);
  const cx = 300;
  const cy = 262;
  const R = 214;

  const ticks = [];
  for (let i = 0; i < 120; i++) {
    const ang = (i / 120) * Math.PI * 2 - Math.PI / 2;
    const major = i % 10 === 0;
    const r0 = R - (major ? 12 : i % 5 === 0 ? 7 : 4);
    ticks.push(
      <line
        key={i}
        x1={cx + Math.cos(ang) * r0}
        y1={cy + Math.sin(ang) * r0}
        x2={cx + Math.cos(ang) * R}
        y2={cy + Math.sin(ang) * R}
        strokeWidth={major ? 1 : 0.55}
        opacity={major ? 0.85 : 0.45}
      />,
    );
  }
  const labels = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    labels.push(
      <text key={i} x={cx + Math.cos(ang) * (R + 14)} y={cy + Math.sin(ang) * (R + 14) + 3} textAnchor="middle" className="art-mono">
        {i * 100}
      </text>,
    );
  }

  // Curve plotted on a staff below the dial.
  const x0 = 70;
  const x1 = 530;
  const yBase = 548;
  const h = 70;
  const maxR = Math.max(...curve.map((p) => p[1]));
  const minR = Math.min(...curve.map((p) => p[1]));
  const px = (c: number) => x0 + (c / 1200) * (x1 - x0);
  const py = (r: number) => yBase - ((r - minR) / (maxR - minR)) * h;
  const path = curve.map(([c, r], i) => `${i ? "L" : "M"}${px(c).toFixed(1)},${py(r).toFixed(1)}`).join("");

  return (
    <svg className="hero-art" viewBox="0 0 600 620" role="img" aria-labelledby="hero-art-title">
      <title id="hero-art-title">
        An engraved cents dial with resonance rings, above the roughness curve of a harmonic tone
      </title>
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#b69a61" stopOpacity="0.14" />
          <stop offset="1" stopColor="#b69a61" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R - 20} fill="url(#glow)" />

      <g className="art-dial" stroke="#b69a61" fill="none" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy} r={R + 26} strokeWidth="0.6" opacity="0.4" strokeDasharray="1 5" />
      </g>
      <g stroke="#b69a61" fill="none">
        <circle cx={cx} cy={cy} r={R} strokeWidth="0.8" opacity="0.7" />
        {ticks}
      </g>
      <g fill="#b69a61" opacity="0.7">{labels}</g>

      {/* Resonance rings at bell partial ratios */}
      <g className="art-rings" fill="none" stroke="#f2ebdd">
        {BELL_RATIOS.map((r, i) => (
          <circle key={r} cx={cx} cy={cy} r={34 + Math.pow(r, 0.85) * 52} strokeWidth={i === 4 ? 1 : 0.5} opacity={i === 4 ? 0.55 : 0.22} />
        ))}
      </g>

      {/* Just intervals marked on the dial */}
      <g>
        {JUST.map(({ c, l }) => {
          const ang = (c / 1200) * Math.PI * 2 - Math.PI / 2;
          const xr = cx + Math.cos(ang) * (R - 26);
          const yr = cy + Math.sin(ang) * (R - 26);
          return (
            <g key={l}>
              <line x1={cx} y1={cy} x2={xr} y2={yr} stroke="#b69a61" strokeWidth="0.5" opacity="0.35" />
              <circle cx={xr} cy={yr} r="3" fill="#171a18" stroke="#b69a61" strokeWidth="1" />
              <text x={cx + Math.cos(ang) * (R - 44)} y={cy + Math.sin(ang) * (R - 44) + 4} textAnchor="middle" className="art-serif">
                {l}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="2.5" fill="#b69a61" />
      </g>

      {/* Staff + curve */}
      <g stroke="#f2ebdd" opacity="0.13">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={x0} x2={x1} y1={yBase - h + i * (h / 4)} y2={yBase - h + i * (h / 4)} strokeWidth="0.6" />
        ))}
      </g>
      <path d={path} fill="none" stroke="#89998a" strokeWidth="1.2" className="art-curve" pathLength={1} />
      {JUST.slice(1).map(({ c, l }) => {
        const r = curve[Math.round(c / 4)][1];
        return (
          <g key={l}>
            <line x1={px(c)} x2={px(c)} y1={py(r)} y2={yBase + 8} stroke="#b69a61" strokeWidth="0.7" />
            <circle cx={px(c)} cy={py(r)} r="2.4" fill="#b69a61" />
          </g>
        );
      })}
      <line x1={x0} x2={x1} y1={yBase + 8} y2={yBase + 8} stroke="#b69a61" strokeWidth="0.6" opacity="0.6" />
      <text x={x0} y={yBase + 30} className="art-caption">
        Fig. 1 — Sensory roughness of a six-partial tone, 0–1200 cents
      </text>
      <text x={x1} y={yBase + 30} textAnchor="end" className="art-mono">
        R(α)
      </text>
    </svg>
  );
}
