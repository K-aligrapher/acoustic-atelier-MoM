import { Check } from "lucide-react";
import { ErrorNotice } from "./ErrorNotice";

export type JobPhase = "reading" | "server" | "done" | "error";

const STAGES = [
  { key: "read", label: "Reading the sound" },
  { key: "partials", label: "Extracting overtones" },
  { key: "curve", label: "Mapping the dissonance curve" },
  { key: "optimize", label: "Finding low-roughness intervals" },
  { key: "export", label: "Building the playable scale" },
] as const;

/**
 * Honest progress: the browser knows when it is reading the file and when the
 * request is in flight, but not which server stage is running. Server stages
 * are shown as one running group, then ticked off with their measured times.
 */
export function AnalysisProgress({
  name,
  phase,
  timings,
  error,
  onCancel,
  onRetry,
  onChooseAnother,
  compact = false,
}: {
  name: string;
  phase: JobPhase;
  timings?: Record<string, number>;
  error?: unknown;
  onCancel?: () => void;
  onRetry?: () => void;
  onChooseAnother?: () => void;
  compact?: boolean;
}) {
  const stateOf = (i: number): "done" | "active" | "waiting" | "server" => {
    if (phase === "done") return "done";
    if (phase === "reading") return i === 0 ? "active" : "waiting";
    if (phase === "server") return i === 0 ? "done" : "server";
    return "waiting";
  };

  return (
    <section
      className={`progress${compact ? " progress--compact" : ""}`}
      aria-labelledby="progress-title"
      aria-busy={phase === "reading" || phase === "server"}
    >
      {!compact && <p className="eyebrow">Analysis in progress</p>}
      <h2 id="progress-title" className="progress-title">
        {phase === "error" ? "The analysis stopped." : phase === "done" ? "Your instrument is ready." : compact ? "Regenerating the scale…" : "Listening closely…"}
      </h2>
      <p className="progress-file">{name}</p>

      <svg className={`resonance${phase === "done" || phase === "error" ? " is-still" : ""}`} viewBox="0 0 600 60" aria-hidden="true">
        <line x1="0" x2="600" y1="30" y2="30" className="resonance-axis" />
        <path
          className="resonance-wave"
          d={Array.from({ length: 301 }, (_, i) => {
            const x = i * 2;
            const env = Math.exp(-i / 120);
            const y = 30 + Math.sin(i * 0.32) * 22 * env * (0.6 + 0.4 * Math.sin(i * 0.031));
            return `${i ? "L" : "M"}${x},${y.toFixed(2)}`;
          }).join("")}
        />
        <line x1="0" x2="0" y1="6" y2="54" className="resonance-cursor" />
      </svg>

      {phase === "error" ? (
        <ErrorNotice
          error={error}
          actions={
            <>
              {onChooseAnother && (
                <button type="button" className="btn btn--outline btn--sm" onClick={onChooseAnother}>
                  Choose another file
                </button>
              )}
              {onRetry && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
                  Try again
                </button>
              )}
            </>
          }
        />
      ) : (
        <ol className="stages">
          {STAGES.map((s, i) => {
            const st = stateOf(i);
            const ms = timings?.[s.key];
            return (
              <li key={s.key} className={`stage stage--${st}`} style={{ transitionDelay: phase === "done" ? `${i * 110}ms` : undefined }}>
                <span className="stage-mark" aria-hidden="true">
                  {st === "done" ? <Check size={12} strokeWidth={2} /> : <span className="stage-num">{i + 1}</span>}
                </span>
                <span className="stage-label">{s.label}</span>
                <span className="stage-meta">
                  {st === "done" && ms !== undefined ? `${ms < 1 ? "<1" : Math.round(ms)} ms` : st === "active" ? "in browser" : st === "server" ? "on server" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {phase === "server" && <p className="progress-note">Stages 2–5 run together on the analysis server; their timings appear when it replies.</p>}
      {onCancel && (phase === "reading" || phase === "server") && (
        <button type="button" className="btn btn--ghost btn--sm progress-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </section>
  );
}
