import { ChevronDown, RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { DEFAULT_PARAMS, type ParamsForm, type SoundSource } from "../lib/types";
import { ErrorNotice } from "./ErrorNotice";
import { InfoTip } from "./InfoTip";
import { WaveformRegion } from "./WaveformRegion";

function Slider({
  label,
  tip,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  tip: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="param">
      <div className="param-head">
        <label htmlFor={id} className="param-label">
          {label}
        </label>
        <InfoTip label={label}>{tip}</InfoTip>
        <output htmlFor={id} className="param-value">
          {value}
          {unit && <span>{unit}</span>}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      <div className="param-range" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function AdvancedParameters({
  form,
  onChange,
  onRegenerate,
  onReset,
  busy,
  dirty,
  error,
  source,
  autoRegion,
}: {
  form: ParamsForm;
  onChange: (patch: Partial<ParamsForm>) => void;
  onRegenerate: () => void;
  onReset: () => void;
  busy: boolean;
  dirty: boolean;
  error: unknown | null;
  source: SoundSource;
  autoRegion: { start_ms: number; end_ms: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const isDefault = JSON.stringify(form) === JSON.stringify(DEFAULT_PARAMS);

  return (
    <section className={`refine${open ? " is-open" : ""}`} aria-labelledby={`${panelId}-h`}>
      <h2 id={`${panelId}-h`} className="refine-heading">
        <button type="button" className="refine-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="refine-title">Refine the Instrument</span>
          <span className="refine-sub">Analysis parameters</span>
          {dirty && <span className="refine-dirty">Changes not yet applied</span>}
          <ChevronDown size={17} strokeWidth={1.5} className="refine-chev" aria-hidden="true" />
        </button>
      </h2>
      <div id={panelId} className="refine-panel" hidden={!open}>
        <div className="param-grid">
          <Slider
            label="Target notes"
            tip="How many notes the scale has per period. Fewer notes leave room for only the smoothest intervals."
            value={form.notes}
            min={3}
            max={24}
            onChange={(v) => onChange({ notes: v })}
          />
          <Slider
            label="Maximum partials"
            tip="How many of the strongest overtones are used. More partials capture more detail but can flatten the curve."
            value={form.max_partials}
            min={4}
            max={24}
            onChange={(v) => onChange({ max_partials: v })}
          />
          <Slider
            label="Minimum spacing"
            tip="Prevents generated notes from clustering too closely together."
            value={form.min_spacing_cents}
            min={15}
            max={100}
            unit="¢"
            onChange={(v) => onChange({ min_spacing_cents: v })}
          />
          <Slider
            label="Peak threshold"
            tip="Ignore spectral peaks quieter than this, relative to the strongest. Raise it for noisy recordings."
            value={form.peak_threshold_db}
            min={-96}
            max={-20}
            unit=" dB"
            onChange={(v) => onChange({ peak_threshold_db: v })}
          />

          <div className="param">
            <div className="param-head">
              <span className="param-label" id={`${panelId}-period`}>
                Period
              </span>
              <InfoTip label="period">
                The interval at which the scale repeats. Octave is 1200¢. Stretched lets you set your own. Automatic looks
                for the sound's own pseudo-octave in its dissonance curve.
              </InfoTip>
            </div>
            <div className="segmented segmented--wide" role="radiogroup" aria-labelledby={`${panelId}-period`}>
              {(
                [
                  ["octave", "Octave"],
                  ["stretched", "Stretched"],
                  ["auto", "Automatic"],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={form.period === v} onClick={() => onChange({ period: v })}>
                  {l}
                </button>
              ))}
            </div>
            {form.period === "stretched" && (
              <label className="field field--inline">
                <span className="field-label">Period size</span>
                <input
                  type="number"
                  min={600}
                  max={2400}
                  step={0.1}
                  value={form.period_cents}
                  onChange={(e) => onChange({ period_cents: Number(e.target.value) })}
                />
                <span className="tool-unit">¢</span>
              </label>
            )}
          </div>

          <div className="param">
            <div className="param-head">
              <label className="param-label" htmlFor={`${panelId}-win`}>
                Analysis window
              </label>
              <InfoTip label="analysis window">
                Length of each FFT frame. Longer windows separate close or low partials better; shorter windows suit very
                short sounds.
              </InfoTip>
            </div>
            <select id={`${panelId}-win`} value={form.window_length} onChange={(e) => onChange({ window_length: Number(e.target.value) })}>
              {[2048, 4096, 8192, 16384, 32768].map((w) => (
                <option key={w} value={w}>
                  {w} samples · {((w / 44100) * 1000).toFixed(0)} ms · {(44100 / w).toFixed(1)} Hz bins
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="param param--region">
          <div className="param-head">
            <span className="param-label">Analysis region</span>
            <InfoTip label="analysis region">
              The part of the recording that is analysed. By default, 100–500 ms after the attack of a struck sound, or the
              steady middle of a sustained one. Drag across the waveform to choose your own.
            </InfoTip>
            {form.region && (
              <button type="button" className="link-btn link-btn--small" onClick={() => onChange({ region: null })}>
                Use automatic region
              </button>
            )}
          </div>
          <WaveformRegion buffer={source.buffer} autoRegion={autoRegion} region={form.region} onRegion={(r) => onChange({ region: r })} />
        </div>

        {error ? <ErrorNotice error={error} compact /> : null}

        <div className="refine-actions">
          <button type="button" className="btn btn--brass" onClick={onRegenerate} disabled={busy}>
            <RefreshCw size={15} strokeWidth={1.6} className={busy ? "spin" : ""} aria-hidden="true" />
            {busy ? "Regenerating…" : "Regenerate Scale"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReset} disabled={busy || isDefault}>
            <RotateCcw size={15} strokeWidth={1.6} aria-hidden="true" />
            Reset Parameters
          </button>
          <p className="refine-note">Changes are sent to the analysis engine only when you regenerate.</p>
        </div>
      </div>
    </section>
  );
}
