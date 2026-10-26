import { TriangleAlert } from "lucide-react";
import { fmtDuration, fmtHz, titleFromFilename } from "../lib/format";
import type { AnalysisResponse, SoundSource } from "../lib/types";
import { InfoTip } from "./InfoTip";

const DESCRIPTIONS = {
  harmonic: "A harmonic tone whose overtones fall close to whole-number multiples of a fundamental.",
  "near-harmonic": "A near-harmonic tone with gently displaced overtones.",
  inharmonic: "An inharmonic resonance with a distinctive overtone structure.",
} as const;

export function SoundSummary({ source, data }: { source: SoundSource; data: AnalysisResponse }) {
  const { meta, scale } = data;
  const title = source.kind === "reference-bell" ? "Reference Bell" : source.kind === "reference-harmonic" ? "Harmonic Reference" : titleFromFilename(source.name);
  const ratio = scale.roughness_vs_12tet;
  const pct = ratio !== null ? Math.round((1 - ratio) * 100) : null;

  return (
    <section className="summary" aria-labelledby="summary-title">
      <div className="summary-title-block">
        <p className="eyebrow">The {title} Study</p>
        <h1 id="summary-title" className="summary-title">
          {title}
        </h1>
        <p className="summary-desc">{DESCRIPTIONS[meta.classification]}</p>
        {source.kind !== "upload" && (
          <p className="summary-source">Synthesised in the browser, analysed by the same engine as an upload.</p>
        )}
      </div>

      <dl className="summary-meta">
        <div>
          <dt>Duration</dt>
          <dd>{fmtDuration(source.durationS)}</dd>
        </div>
        <div>
          <dt>Sample rate</dt>
          <dd>{source.sourceSampleRate ? `${(source.sourceSampleRate / 1000).toFixed(1)} kHz` : "—"}</dd>
        </div>
        <div>
          <dt>
            Character
            <InfoTip label="character">
              Judged from how far the partials sit from whole-number multiples of a fundamental (weighted mean
              {meta.harmonic_deviation_cents !== null ? ` ${meta.harmonic_deviation_cents.toFixed(1)}¢` : ""}).
            </InfoTip>
          </dt>
          <dd className={`class-tag class-tag--${meta.classification}`}>{meta.classification.replace("-", "‑")}</dd>
        </div>
        <div>
          <dt>Partials</dt>
          <dd>{data.partials.length}</dd>
        </div>
        <div>
          <dt>Scale degrees</dt>
          <dd>
            {scale.notes}
            <span className="dd-sub"> / {scale.period_cents.toFixed(scale.period_cents % 1 ? 1 : 0)}¢</span>
          </dd>
        </div>
        <div>
          <dt>
            vs. 12-TET
            <InfoTip label="roughness comparison">
              Total roughness of this scale divided by the same scale with each note moved to its own nearest 12-TET
              semitone, played with this sound. Below 1.00 means smoother.
            </InfoTip>
          </dt>
          <dd>
            {ratio !== null ? (
              <>
                {ratio.toFixed(2)}×
                <span className={`dd-sub ${pct! >= 0 ? "is-good" : "is-warn"}`}>
                  {" "}
                  {pct! >= 0 ? `${pct}% smoother` : `${-pct!}% rougher`}
                </span>
              </>
            ) : (
              <span className="dd-na">not available</span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            {meta.reference_kind === "fundamental" ? "Fundamental" : "Reference partial"}
            <InfoTip label="reference pitch">
              The pitch the sample is treated as having when it is transposed onto the keyboard.
              {meta.reference_kind === "fundamental" ? " Estimated fundamental." : " The lowest strong partial (no clear fundamental)."}
            </InfoTip>
          </dt>
          <dd>{fmtHz(meta.reference_hz)}</dd>
        </div>
        <div>
          <dt>Analysis region</dt>
          <dd>
            {fmtDuration((meta.region_end_ms - meta.region_start_ms) / 1000)}
            <span className="dd-sub"> · {meta.region_mode}</span>
          </dd>
        </div>
      </dl>

      {data.warnings.length > 0 && (
        <ul className="summary-warnings" aria-label="Analysis notes">
          {data.warnings.map((w) => (
            <li key={w}>
              <TriangleAlert size={13} strokeWidth={1.6} aria-hidden="true" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
