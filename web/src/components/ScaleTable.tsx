import { Play } from "lucide-react";
import { fmtRough, fmtSigned } from "../lib/format";
import { relativeNoteName } from "../lib/music";
import type { AnalysisResponse } from "../lib/types";
import { InfoTip } from "./InfoTip";

export function ScaleTable({
  data,
  selected,
  onSelect,
  hoverDegree,
  rootPc,
}: {
  data: AnalysisResponse;
  selected: number | null;
  onSelect: (degree: number, periodIndex: number) => void;
  hoverDegree: number | null;
  rootPc: number;
}) {
  const { scale, curve } = data;
  const K = scale.degrees.length - 1;
  const maxContrib = Math.max(...scale.degrees.map((d) => d.roughness), 1e-12);
  const lowest = [...curve.minima].sort((a, b) => a.roughness - b.roughness).slice(0, 3);
  const ratio = scale.roughness_vs_12tet;

  return (
    <div className="scale-table-block">
      <div className="table-scroll" role="region" aria-label="Generated scale" tabIndex={0}>
        <table className="scale-table">
          <thead>
            <tr>
              <th scope="col">Degree</th>
              <th scope="col" className="num">Cents</th>
              <th scope="col">Nearest 12-TET</th>
              <th scope="col" className="num">Deviation</th>
              <th scope="col">Simple ratio</th>
              <th scope="col" className="num">
                Roughness
                <InfoTip label="roughness contribution">
                  How harsh two tones sound when played together; lower is smoother. This column sums the roughness of
                  each degree against every other degree of the scale.
                </InfoTip>
              </th>
            </tr>
          </thead>
          <tbody>
            {scale.degrees.map((d, i) => {
              const isRoot = i === 0;
              const isPeriod = i === K;
              const deg = isPeriod ? 0 : i;
              const per = isPeriod ? 1 : 0;
              const isSel = selected === deg && !isPeriod;
              return (
                <tr
                  key={i}
                  className={[isRoot ? "is-root" : "", isPeriod ? "is-period" : "", isSel ? "is-selected" : "", hoverDegree === deg && !isPeriod ? "is-hover" : ""].join(" ")}
                  tabIndex={0}
                  aria-selected={isSel}
                  onClick={() => onSelect(deg, per)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(deg, per);
                    }
                  }}
                >
                  <th scope="row">
                    <span className="deg-cell">
                      <Play size={11} strokeWidth={2} className="row-play" aria-hidden="true" />
                      <span className="deg-num">{i}</span>
                      {isRoot && <span className="deg-tag">Root</span>}
                      {isPeriod && <span className="deg-tag">Period</span>}
                      {!isRoot && !isPeriod && d.source === "fill" && (
                        <span className="deg-tag deg-tag--quiet" title="Placed at the smoothest remaining position, not at a curve minimum">
                          fill
                        </span>
                      )}
                    </span>
                  </th>
                  <td className="num mono">{d.cents.toFixed(3)}</td>
                  <td className="mono">{relativeNoteName(rootPc, d.nearest_12tet_semitones)}</td>
                  <td className={`num mono dev ${Math.abs(d.deviation_cents) < 5 ? "dev--near" : ""}`}>{fmtSigned(d.deviation_cents)}¢</td>
                  <td className="mono">
                    {d.nearest_ratio ? (
                      <>
                        {d.nearest_ratio} <span className="muted">{fmtSigned(d.ratio_error_cents ?? 0)}¢</span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num mono">
                    <span className="rough-cell">
                      <span className="rough-bar" style={{ width: `${(d.roughness / maxContrib) * 100}%` }} aria-hidden="true" />
                      {fmtRough(d.roughness)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="scale-summary">
        <div>
          <dt>Scale degrees</dt>
          <dd>{K}</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>
            {scale.period_cents.toFixed(3)}¢
            <span className="dd-sub">
              {" "}
              {scale.period_source === "detected" ? "· detected pseudo-octave" : scale.period_source === "stretched" ? "· stretched" : scale.period_source === "fallback_octave" ? "· octave (none detected)" : "· octave"}
            </span>
          </dd>
        </div>
        <div>
          <dt>Lowest-roughness intervals</dt>
          <dd className="mono">{lowest.length ? lowest.map((m) => `${m.cents.toFixed(0)}¢`).join(" · ") : "—"}</dd>
        </div>
        <div>
          <dt>vs. same-size 12-TET</dt>
          <dd>
            {ratio !== null ? (
              <>
                {ratio.toFixed(3)}×
                <span className="dd-sub">
                  {" "}
                  ({fmtRough(scale.total_roughness)} vs {fmtRough(scale.twelve_tet_total_roughness)})
                </span>
              </>
            ) : (
              <span className="dd-na">not available for more than 12 notes</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
