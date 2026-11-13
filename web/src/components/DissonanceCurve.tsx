import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useMemo, useState } from "react";
import { useSize } from "../hooks/useSize";
import { fmtRough, fmtSigned } from "../lib/format";
import { nearestSimpleRatio, relativeNoteName } from "../lib/music";
import type { AnalysisResponse } from "../lib/types";
import { InfoTip } from "./InfoTip";

const M = { top: 30, right: 18, bottom: 42, left: 62 };

export function DissonanceCurve({
  data,
  selected,
  onSelect,
  hoverDegree,
  onHoverDegree,
  showTet,
  rootPc,
  fill = false,
}: {
  data: AnalysisResponse;
  selected: number | null;
  onSelect: (degree: number) => void;
  hoverDegree: number | null;
  onHoverDegree: (d: number | null) => void;
  showTet: boolean;
  rootPc: number;
  fill?: boolean;
}) {
  const [wrap, { width, height: measured }] = useSize<HTMLDivElement>();
  const height = fill ? Math.max(150, Math.floor(measured)) : width < 560 ? 280 : 360;
  const [cursorC, setCursorC] = useState<number | null>(null);

  const { cents, roughness, minima } = data.curve;
  const P = data.scale.period_cents;
  const degrees = data.scale.degrees;
  const K = degrees.length - 1;
  const maxR = Math.max(...roughness);
  const minR = Math.min(...roughness);

  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const x = useMemo(() => scaleLinear().domain([0, P]).range([0, iw]), [P, iw]);
  const y = useMemo(() => scaleLinear().domain([Math.max(0, minR - (maxR - minR) * 0.08), maxR * 1.06]).range([ih, 0]).nice(), [minR, maxR, ih]);

  const pts = useMemo(() => cents.map((c, i) => [c, roughness[i]] as [number, number]), [cents, roughness]);
  const linePath = line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]))(pts) ?? "";
  const areaPath = area<[number, number]>().x((d) => x(d[0])).y0(ih).y1((d) => y(d[1]))(pts) ?? "";

  const rAt = (c: number) => {
    const i = Math.max(0, Math.min(cents.length - 1, Math.round(c - cents[0])));
    if (cents[i] === c || i === cents.length - 1) return roughness[i];
    // linear interpolation between 1-cent samples
    const j = Math.floor(c - cents[0]);
    const t = c - cents[0] - j;
    return roughness[j] * (1 - t) + roughness[Math.min(j + 1, roughness.length - 1)] * t;
  };

  // Emphasise the clearest minima (low-roughness intervals).
  const maxProm = Math.max(1e-12, ...minima.map((m) => m.prominence));
  const shownMinima = minima.filter((m) => m.prominence > maxProm * 0.04);

  const step = iw < 420 ? 200 : 100;
  const xTicks: number[] = [];
  for (let c = 0; c <= P + 0.01; c += step) xTicks.push(c);
  const yTicks = y.ticks(4);

  const cursorInfo = useMemo(() => {
    if (cursorC === null) return null;
    const n = Math.round(cursorC / 100);
    return {
      cents: cursorC,
      r: rAt(cursorC),
      note: relativeNoteName(rootPc, n),
      dev: cursorC - n * 100,
      ratio: nearestSimpleRatio(cursorC),
    };
  }, [cursorC, rootPc]);

  const deepest = [...minima].sort((a, b) => a.roughness - b.roughness)[0];
  const summary = `${K} notes chosen in a ${P.toFixed(1)} cent period. ${minima.length} local minima; ${
    deepest ? `lowest-roughness interval at ${deepest.cents.toFixed(0)} cents.` : ""
  }`;

  const activeDeg = hoverDegree ?? selected;

  return (
    <figure className={`plot plot--curve${fill ? " plot--fill" : ""}`}>
      <div className="plot-legend" aria-hidden="true">
        <span className="lg lg--curve">Roughness curve</span>
        <span className="lg lg--degree">Scale degree</span>
        <span className="lg lg--min">Low-roughness minimum</span>
        <span className="lg lg--grid">12-TET semitone</span>
        {showTet && <span className="lg lg--tet">12-TET comparison</span>}
        <InfoTip label="dissonance curve">The curve reveals how rough or smooth the sound becomes when transposed by different intervals. Selected notes are positioned to reduce roughness across the resulting scale. Hover to inspect; click a brass line to play that degree.</InfoTip>
      </div>
      <div ref={wrap} className="plot-surface" style={fill ? undefined : { height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Dissonance curve. ${summary}`}
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = e.clientX - r.left - M.left;
              if (px < 0 || px > iw) {
                setCursorC(null);
                onHoverDegree(null);
                return;
              }
              const c = Math.round(x.invert(px) * 10) / 10;
              setCursorC(c);
              let best: number | null = null;
              let bd = 10;
              degrees.forEach((d, i) => {
                const dd = Math.abs(x(d.cents) - px);
                if (dd < bd && i < K) {
                  bd = dd;
                  best = i;
                }
              });
              onHoverDegree(best);
            }}
            onPointerLeave={() => {
              setCursorC(null);
              onHoverDegree(null);
            }}
            onClick={() => {
              if (hoverDegree !== null) onSelect(hoverDegree);
            }}
          >
            <defs>
              <linearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#89998a" stopOpacity="0.16" />
                <stop offset="1" stopColor="#89998a" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <g transform={`translate(${M.left},${M.top})`}>
              {/* 12-TET semitone grid */}
              {Array.from({ length: Math.floor(P / 100) + 1 }, (_, i) => i * 100).map((c) => (
                <line key={c} x1={x(c)} x2={x(c)} y1={0} y2={ih} className="grid grid--tet" />
              ))}
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={iw} y1={y(t)} y2={y(t)} className="grid grid--minor" />
                  <text x={-8} y={y(t) + 3} textAnchor="end" className="axis-label">
                    {fmtRough(t)}
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <text key={t} x={x(t)} y={ih + 16} textAnchor="middle" className="axis-label">
                  {t.toFixed(0)}
                </text>
              ))}
              <rect x={0} y={0} width={iw} height={ih} className="plot-frame" />

              <path d={areaPath} fill="url(#curveFill)" />
              <path d={linePath} className="curve-line" />

              {shownMinima.map((m) => (
                <circle key={m.cents} cx={x(m.cents)} cy={y(m.roughness)} r={3.2} className="minimum-dot" />
              ))}

              {showTet &&
                data.scale.twelve_tet_cents.map((c, i) => (
                  <line key={`t${i}`} x1={x(c)} x2={x(c)} y1={y(rAt(Math.min(c, P)))} y2={ih} className="tet-marker" />
                ))}

              {degrees.map((d, i) => {
                const isActive = activeDeg === (i === K ? 0 : i);
                const yc = y(d.curve_roughness);
                return (
                  <g
                    key={i}
                    className={`degree-mark${isActive ? " is-active" : ""}${i === 0 || i === K ? " is-anchor" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${i === 0 ? "Root" : i === K ? "Period" : `Degree ${i}`}: ${d.cents.toFixed(2)} cents, roughness ${fmtRough(
                      d.curve_roughness,
                    )}`}
                    aria-pressed={selected === (i === K ? 0 : i)}
                    onFocus={() => onHoverDegree(i === K ? 0 : i)}
                    onBlur={() => onHoverDegree(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(i === K ? 0 : i);
                      }
                    }}
                  >
                    <line x1={x(d.cents)} x2={x(d.cents)} y1={-8} y2={ih} className="degree-line" />
                    <circle cx={x(d.cents)} cy={yc} r={isActive ? 5 : 3.6} className="degree-dot" />
                    <text x={x(d.cents)} y={-13} textAnchor="middle" className="degree-label">
                      {i === 0 ? "R" : i === K ? "P" : i}
                    </text>
                  </g>
                );
              })}

              {cursorInfo && (
                <g pointerEvents="none">
                  <line x1={x(cursorInfo.cents)} x2={x(cursorInfo.cents)} y1={0} y2={ih} className="cursor-line" />
                  <circle cx={x(cursorInfo.cents)} cy={y(cursorInfo.r)} r={3} className="cursor-dot" />
                </g>
              )}

              <text x={iw / 2} y={ih + 34} textAnchor="middle" className="axis-title">
                Interval above the root (cents)
              </text>
              <text transform={`translate(${-50},${ih / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">
                Sensory roughness
              </text>
            </g>
          </svg>
        )}
        {cursorInfo && (
          <div
            className="plot-tip"
            style={{
              left: Math.min(width - 190, Math.max(4, M.left + x(cursorInfo.cents) + 14)),
              top: Math.max(4, M.top + y(cursorInfo.r) - 70),
            }}
          >
            {hoverDegree !== null && <p className="tip-title">{hoverDegree === 0 ? "Root" : `Degree ${hoverDegree}`} — click to play</p>}
            <p>
              <span>Interval</span>
              <b>{cursorInfo.cents.toFixed(1)}¢</b>
            </p>
            <p>
              <span>Roughness</span>
              <b>{fmtRough(cursorInfo.r)}</b>
            </p>
            <p>
              <span>Nearest 12-TET</span>
              <b>
                {cursorInfo.note} {fmtSigned(cursorInfo.dev)}¢
              </b>
            </p>
            <p>
              <span>Simple ratio</span>
              <b>{cursorInfo.ratio ? `${cursorInfo.ratio.ratio} (${fmtSigned(cursorInfo.ratio.error)}¢)` : "—"}</b>
            </p>
          </div>
        )}
      </div>
      <figcaption className="plot-caption">
        The curve reveals how rough or smooth the sound becomes when transposed by different intervals. Selected notes are
        positioned to reduce roughness across the resulting scale. <span className="sr-summary">{summary}</span>
      </figcaption>
    </figure>
  );
}
