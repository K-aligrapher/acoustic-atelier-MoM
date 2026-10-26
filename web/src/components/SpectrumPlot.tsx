import { scaleLinear, scaleLog } from "d3-scale";
import { area, line } from "d3-shape";
import { useMemo, useState } from "react";
import { useSize } from "../hooks/useSize";
import { fmtDb, fmtHz, fmtHzShort } from "../lib/format";
import type { AnalysisResponse } from "../lib/types";

const M = { top: 22, right: 18, bottom: 40, left: 52 };

export function SpectrumPlot({ data, threshold }: { data: AnalysisResponse; threshold: number }) {
  const [wrap, { width }] = useSize<HTMLDivElement>();
  const height = width < 560 ? 250 : 320;
  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; f: number } | null>(null);

  const partials = data.partials;
  const fMin = Math.max(20, Math.min(...partials.map((p) => p.freq_hz)) / 2.2);
  const fMax = Math.min(16000, Math.max(...partials.map((p) => p.freq_hz)) * 2.2);
  const yMin = Math.max(-110, Math.min(-60, threshold) - 12);

  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const x = useMemo(() => scaleLog().domain([fMin, fMax]).range([0, iw]).clamp(true), [fMin, fMax, iw]);
  const y = useMemo(() => scaleLinear().domain([yMin, 3]).range([ih, 0]).clamp(true), [yMin, ih]);

  const pts = useMemo(() => {
    const out: [number, number][] = [];
    const { freq_hz, db } = data.spectrum;
    for (let i = 0; i < freq_hz.length; i++) if (freq_hz[i] >= fMin && freq_hz[i] <= fMax) out.push([freq_hz[i], db[i]]);
    return out;
  }, [data.spectrum, fMin, fMax]);

  const linePath = line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]))(pts) ?? "";
  const areaPath = area<[number, number]>().x((d) => x(d[0])).y0(ih).y1((d) => y(d[1]))(pts) ?? "";

  const xTicks = [20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 16000].filter((t) => t >= fMin && t <= fMax);
  const minorTicks: number[] = [];
  for (const dec of [10, 100, 1000, 10000]) for (let k = 2; k <= 9; k++) if (dec * k >= fMin && dec * k <= fMax) minorTicks.push(dec * k);
  const yTicks: number[] = [];
  for (let v = 0; v >= yMin; v -= 10) yTicks.push(v);

  // Label the strongest partials, skipping labels that would collide.
  const labelled = useMemo(() => {
    const order = [...partials.keys()].sort((a, b) => partials[b].amp - partials[a].amp);
    const placed: number[] = [];
    const keep = new Set<number>();
    for (const i of order) {
      const px = x(partials[i].freq_hz);
      if (placed.every((p) => Math.abs(p - px) > 38) && keep.size < 9) {
        placed.push(px);
        keep.add(i);
      }
    }
    return keep;
  }, [partials, x]);

  const strongest = partials.reduce((a, b) => (b.amp > a.amp ? b : a), partials[0]);
  const summary = `${partials.length} partials detected between ${fmtHz(Math.min(...partials.map((p) => p.freq_hz)))} and ${fmtHz(
    Math.max(...partials.map((p) => p.freq_hz)),
  )}; strongest at ${fmtHz(strongest.freq_hz)}.`;

  const hp = hover !== null ? partials[hover] : null;

  return (
    <figure className="plot">
      <div className="plot-legend" aria-hidden="true">
        <span className="lg lg--spectrum">Averaged spectrum</span>
        <span className="lg lg--peak">Detected partial</span>
        <span className="lg lg--thresh">Peak threshold</span>
      </div>
      <div ref={wrap} className="plot-surface" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Frequency spectrum. ${summary}`}
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = e.clientX - r.left - M.left;
              if (px < 0 || px > iw) return setCursor(null);
              setCursor({ x: px, f: x.invert(px) });
              let best = -1;
              let bd = 14;
              partials.forEach((p, i) => {
                const d = Math.abs(x(p.freq_hz) - px);
                if (d < bd) {
                  bd = d;
                  best = i;
                }
              });
              setHover(best >= 0 ? best : null);
            }}
            onPointerLeave={() => {
              setCursor(null);
              setHover(null);
            }}
          >
            <defs>
              <linearGradient id="specFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#f2ebdd" stopOpacity="0.12" />
                <stop offset="1" stopColor="#f2ebdd" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g transform={`translate(${M.left},${M.top})`}>
              {/* grid */}
              {minorTicks.map((t) => (
                <line key={`m${t}`} x1={x(t)} x2={x(t)} y1={0} y2={ih} className="grid grid--minor" />
              ))}
              {xTicks.map((t) => (
                <g key={t}>
                  <line x1={x(t)} x2={x(t)} y1={0} y2={ih} className="grid" />
                  <text x={x(t)} y={ih + 16} textAnchor="middle" className="axis-label">
                    {fmtHzShort(t)}
                  </text>
                </g>
              ))}
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={iw} y1={y(t)} y2={y(t)} className={t % 20 === 0 ? "grid" : "grid grid--minor"} />
                  {t % 20 === 0 && (
                    <text x={-8} y={y(t) + 3} textAnchor="end" className="axis-label">
                      {t}
                    </text>
                  )}
                </g>
              ))}
              <line x1={0} x2={iw} y1={y(threshold)} y2={y(threshold)} className="threshold-line" />
              <rect x={0} y={0} width={iw} height={ih} className="plot-frame" />

              <path d={areaPath} fill="url(#specFill)" />
              <path d={linePath} className="spectrum-line" />

              {cursor && <line x1={cursor.x} x2={cursor.x} y1={0} y2={ih} className="cursor-line" />}

              {partials.map((p, i) => (
                <g
                  key={i}
                  className={`partial${hover === i ? " is-hover" : ""}`}
                  tabIndex={0}
                  role="img"
                  aria-label={`Partial at ${fmtHz(p.freq_hz)}, ${fmtDb(p.amp_db)}`}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  <line x1={x(p.freq_hz)} x2={x(p.freq_hz)} y1={ih} y2={y(p.amp_db)} className="partial-stem" />
                  <circle cx={x(p.freq_hz)} cy={y(p.amp_db)} r={hover === i ? 4.5 : 3.2} className="partial-dot" />
                  {labelled.has(i) && (
                    <text x={x(p.freq_hz)} y={y(p.amp_db) - 9} textAnchor="middle" className="partial-label">
                      {p.freq_hz < 1000 ? p.freq_hz.toFixed(0) : (p.freq_hz / 1000).toFixed(2) + "k"}
                    </text>
                  )}
                </g>
              ))}

              <text x={iw / 2} y={ih + 34} textAnchor="middle" className="axis-title">
                Frequency (Hz, logarithmic)
              </text>
              <text transform={`translate(${-38},${ih / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">
                Level (dB re. strongest)
              </text>
            </g>
          </svg>
        )}
        {hp && (
          <div
            className="plot-tip"
            style={{
              left: Math.min(width - 170, Math.max(4, M.left + x(hp.freq_hz) + 12)),
              top: Math.max(4, M.top + y(hp.amp_db) - 10),
            }}
          >
            <p className="tip-title">Partial {partials.indexOf(hp) + 1}</p>
            <p>
              <span>Frequency</span>
              <b>{hp.freq_hz.toFixed(2)} Hz</b>
            </p>
            <p>
              <span>Amplitude</span>
              <b>{hp.amp.toFixed(3)}</b>
            </p>
            <p>
              <span>Level</span>
              <b>{fmtDb(hp.amp_db)}</b>
            </p>
            <p>
              <span>× reference</span>
              <b>{(hp.freq_hz / data.meta.reference_hz).toFixed(3)}</b>
            </p>
          </div>
        )}
        {!hp && cursor && (
          <div className="plot-cursor-tag" style={{ left: M.left + cursor.x }}>
            {fmtHz(cursor.f)}
          </div>
        )}
      </div>
      <figcaption className="plot-caption">
        Each peak represents a partial contributing to the sound's timbral character. <span className="sr-summary">{summary}</span>
      </figcaption>
    </figure>
  );
}
