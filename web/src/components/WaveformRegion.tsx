import { useEffect, useMemo, useRef, useState } from "react";
import { useSize } from "../hooks/useSize";
import { fmtDuration } from "../lib/format";

const MIN_MS = 150;
const MAX_MS = 30000;

/** Waveform with the automatic analysis region and an optional custom selection (FR-6, FR-43). */
export function WaveformRegion({
  buffer,
  autoRegion,
  region,
  onRegion,
}: {
  buffer: AudioBuffer;
  autoRegion: { start_ms: number; end_ms: number } | null;
  region: { start_ms: number; end_ms: number } | null;
  onRegion: (r: { start_ms: number; end_ms: number } | null) => void;
}) {
  const [wrap, { width }] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const height = 96;
  const durMs = buffer.duration * 1000;
  const [drag, setDrag] = useState<null | { mode: "new" | "start" | "end"; anchor: number }>(null);

  const peaks = useMemo(() => {
    const bins = 1200;
    const n = buffer.length;
    const out = new Float32Array(bins);
    const chs = buffer.numberOfChannels;
    const data = Array.from({ length: chs }, (_, c) => buffer.getChannelData(c));
    for (let b = 0; b < bins; b++) {
      const s = Math.floor((b / bins) * n);
      const e = Math.max(s + 1, Math.floor(((b + 1) / bins) * n));
      let m = 0;
      for (let i = s; i < e; i += 4) for (let c = 0; c < chs; c++) m = Math.max(m, Math.abs(data[c][i]));
      out[b] = m;
    }
    const mx = Math.max(...out) || 1;
    return out.map((v) => v / mx);
  }, [buffer]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, height);
    g.strokeStyle = "rgba(242,235,221,0.08)";
    g.beginPath();
    g.moveTo(0, height / 2);
    g.lineTo(width, height / 2);
    g.stroke();
    g.fillStyle = "rgba(242,235,221,0.55)";
    for (let px = 0; px < width; px++) {
      const b = Math.floor((px / width) * peaks.length);
      const h = Math.max(0.5, peaks[b] * (height / 2 - 6));
      g.fillRect(px, height / 2 - h, 1, h * 2);
    }
  }, [peaks, width]);

  const toMs = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.max(0, Math.min(durMs, ((clientX - r.left) / r.width) * durMs));
  };
  const px = (ms: number) => (ms / durMs) * width;

  const clamp = (a: number, b: number) => {
    let s = Math.min(a, b);
    let e = Math.max(a, b);
    if (e - s > MAX_MS) e = s + MAX_MS;
    if (e - s < MIN_MS) {
      e = Math.min(durMs, s + MIN_MS);
      s = Math.max(0, e - MIN_MS);
    }
    return { start_ms: Math.round(s), end_ms: Math.round(e) };
  };

  const nudge = (which: "start" | "end", delta: number) => {
    const r = region ?? autoRegion ?? { start_ms: 0, end_ms: Math.min(durMs, 1000) };
    onRegion(which === "start" ? clamp(r.start_ms + delta, r.end_ms) : clamp(r.start_ms, r.end_ms + delta));
  };

  return (
    <div className="waveform">
      <div
        ref={wrap}
        className="waveform-surface"
        style={{ height }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.handle) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ms = toMs(e.clientX);
          setDrag({ mode: "new", anchor: ms });
          onRegion(clamp(ms, ms + MIN_MS));
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const ms = toMs(e.clientX);
          if (drag.mode === "new") onRegion(clamp(drag.anchor, ms));
          else if (region) onRegion(drag.mode === "start" ? clamp(ms, region.end_ms) : clamp(region.start_ms, ms));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <canvas ref={canvas} style={{ width, height }} aria-hidden="true" />
        {autoRegion && (
          <div className={`wf-auto${region ? " is-dim" : ""}`} style={{ left: px(autoRegion.start_ms), width: Math.max(2, px(autoRegion.end_ms) - px(autoRegion.start_ms)) }}>
            <span>{region ? "previous" : "analysed"}</span>
          </div>
        )}
        {region && (
          <div className="wf-sel" style={{ left: px(region.start_ms), width: Math.max(2, px(region.end_ms) - px(region.start_ms)) }}>
            {(["start", "end"] as const).map((h) => (
              <span
                key={h}
                data-handle={h}
                className={`wf-handle wf-handle--${h}`}
                role="slider"
                tabIndex={0}
                aria-label={`Region ${h}`}
                aria-valuemin={0}
                aria-valuemax={Math.round(durMs)}
                aria-valuenow={Math.round(h === "start" ? region.start_ms : region.end_ms)}
                aria-valuetext={fmtDuration((h === "start" ? region.start_ms : region.end_ms) / 1000)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget.parentElement!.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag({ mode: h, anchor: 0 });
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 100 : 10;
                  if (e.key === "ArrowLeft") { e.preventDefault(); nudge(h, -step); }
                  if (e.key === "ArrowRight") { e.preventDefault(); nudge(h, step); }
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="waveform-foot">
        <span className="mono-sm">0 s</span>
        <span className="waveform-readout">
          {region
            ? `Custom region ${fmtDuration(region.start_ms / 1000)} – ${fmtDuration(region.end_ms / 1000)} (${fmtDuration((region.end_ms - region.start_ms) / 1000)})`
            : autoRegion
              ? `Automatic region ${fmtDuration(autoRegion.start_ms / 1000)} – ${fmtDuration(autoRegion.end_ms / 1000)}`
              : "Automatic region"}
        </span>
        <span className="mono-sm">{fmtDuration(buffer.duration)}</span>
      </div>
    </div>
  );
}
