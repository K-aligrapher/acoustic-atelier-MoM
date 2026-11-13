import { useId } from "react";
import { ADSR_PRESETS, type ADSR } from "../lib/audio/engine";
import { InfoTip } from "./InfoTip";

const fmtTime = (s: number) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`);

// Times use a squared slider curve so short values get more resolution.
const T_MAX = { attack: 4, decay: 8, release: 8 };
const toSlider = (s: number, max: number) => Math.sqrt(s / max);
const fromSlider = (v: number, max: number) => Math.round(v * v * max * 1000) / 1000;

function EnvelopeGraph({ adsr }: { adsr: ADSR }) {
  // Drawn proportionally with a fixed-width "hold" segment between decay and release.
  const hold = 0.6;
  const total = adsr.attack + adsr.decay + hold + adsr.release || 1;
  const W = 160;
  const H = 46;
  const x = (t: number) => (t / total) * W;
  const y = (v: number) => H - 3 - v * (H - 8);
  const xa = x(adsr.attack);
  const xd = x(adsr.attack + adsr.decay);
  const xh = x(adsr.attack + adsr.decay + hold);
  const d = `M0,${y(0)} L${xa},${y(1)} L${xd},${y(adsr.sustain)} L${xh},${y(adsr.sustain)} L${W},${y(0)}`;
  return (
    <svg className="adsr-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Envelope shape">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="adsr-axis" />
      <line x1={xh} x2={xh} y1={4} y2={H - 3} className="adsr-off" />
      <path d={`${d} L0,${y(0)}Z`} className="adsr-fill" />
      <path d={d} className="adsr-line" />
    </svg>
  );
}

export function AdsrPanel({ adsr, onChange }: { adsr: ADSR; onChange: (a: ADSR) => void }) {
  const id = useId();
  const preset = Object.entries(ADSR_PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify(adsr))?.[0] ?? "custom";

  const slider = (key: keyof ADSR, label: string, tip: string) => {
    const isLevel = key === "sustain";
    const max = isLevel ? 1 : T_MAX[key as keyof typeof T_MAX];
    const v = isLevel ? adsr[key] : toSlider(adsr[key], max);
    return (
      <div className="adsr-slider">
        <div className="adsr-head">
          <label htmlFor={`${id}-${key}`}>{label}</label>
          <InfoTip label={label}>{tip}</InfoTip>
          <output htmlFor={`${id}-${key}`}>{isLevel ? `${Math.round(adsr.sustain * 100)}%` : fmtTime(adsr[key])}</output>
        </div>
        <input
          id={`${id}-${key}`}
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={v}
          style={{ ["--fill" as string]: `${v * 100}%` }}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ ...adsr, [key]: isLevel ? Math.round(n * 100) / 100 : fromSlider(n, max) });
          }}
        />
      </div>
    );
  };

  return (
    <div className="adsr" role="group" aria-label="ADSR envelope">
      <div className="adsr-title">
        <span className="tool-label">Envelope</span>
        <select value={preset} onChange={(e) => ADSR_PRESETS[e.target.value] && onChange(ADSR_PRESETS[e.target.value])} aria-label="Envelope preset">
          {Object.keys(ADSR_PRESETS).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          {preset === "custom" && <option value="custom">Custom</option>}
        </select>
        <EnvelopeGraph adsr={adsr} />
      </div>
      {slider("attack", "Attack", "How long the note takes to reach full level after you press it.")}
      {slider("decay", "Decay", "How long it then takes to fall to the sustain level.")}
      {slider(
        "sustain",
        "Sustain",
        "The level held while the key is down. Above 0%, the analysed part of the sample loops smoothly so the note can be held. At 0% the sample plays once and dies away.",
      )}
      {slider("release", "Release", "How long the note takes to fade out after you let go.")}
    </div>
  );
}
