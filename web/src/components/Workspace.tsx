import { Download, Info, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_ADSR, type ADSR } from "../lib/audio/engine";
import { fmtDuration, fmtHz, titleFromFilename } from "../lib/format";
import { AdsrPanel } from "./AdsrPanel";
import { InfoTip } from "./InfoTip";
import { Modal } from "./Modal";
import type { AudioEngine } from "../lib/audio/engine";
import { freqToMidi, midiToFreq } from "../lib/music";
import type { Analysis, ParamsForm, SoundSource } from "../lib/types";
import { AdvancedParameters } from "./AdvancedParameters";
import { AnalysisProgress, type JobPhase } from "./AnalysisProgress";
import { DissonanceCurve } from "./DissonanceCurve";
import { ExportPanel } from "./ExportPanel";
import { InstrumentKeyboard, type InstrumentState } from "./InstrumentKeyboard";
import { ErrorNotice } from "./ErrorNotice";
import { ScaleTable } from "./ScaleTable";
import { SoundSummary } from "./SoundSummary";
import { SpectrumPlot } from "./SpectrumPlot";

/** Index of the first sample above -50 dB re. peak (minus 2 ms), for low-latency playback. */
function leadingSilence(buf: AudioBuffer): number {
  let peak = 0;
  const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (const d of chs) for (let i = 0; i < d.length; i += 2) peak = Math.max(peak, Math.abs(d[i]));
  const thr = peak * Math.pow(10, -50 / 20);
  for (let i = 0; i < buf.length; i++) for (const d of chs) if (Math.abs(d[i]) > thr) return Math.max(0, i - Math.floor(0.002 * buf.sampleRate));
  return 0;
}

function sliceBuffer(buf: AudioBuffer, start: number): AudioBuffer {
  if (start <= 0) return buf;
  const out = new AudioBuffer({ length: buf.length - start, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(start) as Float32Array<ArrayBuffer>, c);
  return out;
}

export function Workspace({
  source,
  analysis,
  engine,
  form,
  onFormChange,
  onRegenerate,
  onReset,
  regen,
  onCancelRegen,
}: {
  source: SoundSource;
  analysis: Analysis;
  engine: AudioEngine;
  form: ParamsForm;
  onFormChange: (patch: Partial<ParamsForm>) => void;
  onRegenerate: () => void;
  onReset: () => void;
  regen: { phase: JobPhase; error?: unknown; timings?: Record<string, number> } | null;
  onCancelRegen: () => void;
}) {
  const data = analysis.response;
  const ref = data.meta.reference_hz;
  const K = data.scale.degrees.length - 1;
  const tetAvailable = data.scale.roughness_vs_12tet !== null;

  const [inst, setInst] = useState<InstrumentState>(() => {
    const m = Math.round(freqToMidi(ref));
    let view: "pads" | "keys" = "pads";
    try {
      if (localStorage.getItem("atelier.view") === "keys") view = "keys";
    } catch {
      /* storage unavailable */
    }
    return { tuning: "generated", rootMidi: m, baseFreq: midiToFreq(m), volume: 0.8, view, showCents: true };
  });
  const [selected, setSelected] = useState<{ degree: number; periodIndex: number } | null>({ degree: 0, periodIndex: 0 });
  const [hoverDegree, setHoverDegree] = useState<number | null>(null);
  const [playing, setPlaying] = useState(0);
  const [adsr, setAdsr] = useState<ADSR>(DEFAULT_ADSR);
  const [tab, setTab] = useState<"curve" | "spectrum" | "scale">("curve");
  const [modal, setModal] = useState<null | "about" | "refine" | "export">(null);

  const patchInst = useCallback((p: Partial<InstrumentState>) => setInst((s) => ({ ...s, ...p })), []);

  useEffect(() => engine.onActivity(setPlaying), [engine]);
  useEffect(() => engine.setVolume(inst.volume), [engine, inst.volume]);
  useEffect(() => {
    try {
      localStorage.setItem("atelier.view", inst.view);
    } catch {
      /* storage unavailable */
    }
  }, [inst.view]);
  useEffect(() => {
    if (!tetAvailable && inst.tuning === "12tet") patchInst({ tuning: "generated" });
  }, [tetAvailable, inst.tuning, patchInst]);
  useEffect(() => {
    setSelected((s) => (s && s.degree < K ? s : { degree: 0, periodIndex: 0 }));
  }, [K]);

  // Load the sample into the audio engine (trimmed) with the analysis region as the loop.
  const playback = useMemo(() => {
    const start = leadingSilence(source.buffer);
    return { buffer: sliceBuffer(source.buffer, start), offsetS: start / source.buffer.sampleRate };
  }, [source.buffer]);
  useEffect(() => {
    const segS = analysis.segmentOffsetMs / 1000;
    const a = segS + data.meta.region_start_ms / 1000 - playback.offsetS;
    const b = segS + data.meta.region_end_ms / 1000 - playback.offsetS;
    engine.setSample(playback.buffer, a > 0.02 && b > a ? { start: a, end: Math.min(b, playback.buffer.duration) } : null);
  }, [engine, playback, data.meta.region_start_ms, data.meta.region_end_ms, analysis.segmentOffsetMs]);

  const centsFor = (degree: number, periodIndex: number) =>
    inst.tuning === "12tet"
      ? periodIndex * data.scale.twelve_tet_cents[K] + data.scale.twelve_tet_cents[degree]
      : periodIndex * data.scale.period_cents + data.scale.degrees[degree].cents;

  const playDegree = (degree: number, periodIndex = 0) => {
    const f = inst.baseFreq * Math.pow(2, centsFor(degree, periodIndex) / 1200);
    engine.trigger(`row-${degree}-${periodIndex}`, f / ref, adsr);
    setSelected({ degree, periodIndex });
  };

  const rootPc = ((inst.rootMidi % 12) + 12) % 12;
  const autoRegion = {
    start_ms: analysis.segmentOffsetMs + data.meta.region_start_ms,
    end_ms: analysis.segmentOffsetMs + data.meta.region_end_ms,
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(analysis.params);
  const busy = regen?.phase === "reading" || regen?.phase === "server";

  const title =
    source.kind === "reference-bell" ? "Reference Bell" : source.kind === "reference-harmonic" ? "Harmonic Reference" : titleFromFilename(source.name);
  const ratio = data.scale.roughness_vs_12tet;
  const pct = ratio !== null ? Math.round((1 - ratio) * 100) : null;

  return (
    <main id="main" className={`studio${busy ? " is-busy" : ""}`}>
      <div className="studio-bar">
        <div className="studio-id">
          <p className="eyebrow">The {title} Study</p>
          <h1 className="studio-title">{title}</h1>
        </div>
        <dl className="studio-metrics">
          <div>
            <dt>Character</dt>
            <dd className={`class-tag class-tag--${data.meta.classification}`}>{data.meta.classification}</dd>
          </div>
          <div>
            <dt>Partials</dt>
            <dd>{data.partials.length}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>
              {K}
              <span className="dd-sub"> / {data.scale.period_cents.toFixed(data.scale.period_cents % 1 ? 1 : 0)}¢</span>
            </dd>
          </div>
          <div>
            <dt>
              vs 12-TET
              <InfoTip label="roughness comparison">
                Total roughness of this scale divided by the same scale with each note moved to its own nearest 12-TET semitone.
                Below 1.00 means smoother.
              </InfoTip>
            </dt>
            <dd>
              {ratio !== null ? (
                <>
                  {ratio.toFixed(2)}×<span className={`dd-sub ${pct! >= 0 ? "is-good" : "is-warn"}`}> {pct! >= 0 ? `${pct}% smoother` : `${-pct!}% rougher`}</span>
                </>
              ) : (
                <span className="dd-na">n/a</span>
              )}
            </dd>
          </div>
          <div>
            <dt>
              Reference
              <InfoTip label="reference pitch">
                {data.meta.reference_kind === "fundamental" ? "Estimated fundamental" : "Lowest strong partial"}: the pitch the sample is
                treated as having on the keyboard. Duration {fmtDuration(source.durationS)}, region {data.meta.region_mode}.
              </InfoTip>
            </dt>
            <dd>{fmtHz(ref)}</dd>
          </div>
        </dl>
        <div className="studio-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal("about")}>
            <Info size={15} strokeWidth={1.6} aria-hidden="true" />
            About{data.warnings.length > 0 && <span className="badge" aria-label={`${data.warnings.length} notes`}>{data.warnings.length}</span>}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal("refine")}>
            <SlidersHorizontal size={15} strokeWidth={1.6} aria-hidden="true" />
            Refine{dirty && <span className="badge badge--dot" aria-label="changes not applied" />}
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setModal("export")}>
            <Download size={15} strokeWidth={1.6} aria-hidden="true" />
            Export
          </button>
        </div>
      </div>

      <div className="studio-grid">
        <section className="studio-inst" aria-label="The instrument">
          <InstrumentKeyboard
            degrees={data.scale.degrees}
            tetCents={data.scale.twelve_tet_cents}
            periodCents={data.scale.period_cents}
            referenceHz={ref}
            engine={engine}
            state={inst}
            setState={patchInst}
            adsr={adsr}
            selected={selected}
            onSelect={setSelected}
            highlight={hoverDegree}
            playing={playing}
            tetAvailable={tetAvailable}
          />
        </section>

        <section className="studio-panel" aria-label="Analysis">
          <div className="tabs" role="tablist" aria-label="Analysis views">
            {(
              [
                ["curve", "Dissonance curve"],
                ["spectrum", "Spectrum"],
                ["scale", "Scale"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="tab-body" role="tabpanel">
            {tab === "curve" && (
              <DissonanceCurve
                data={data}
                selected={selected?.degree ?? null}
                onSelect={(d) => playDegree(d, 0)}
                hoverDegree={hoverDegree}
                onHoverDegree={setHoverDegree}
                showTet={inst.tuning === "12tet"}
                rootPc={rootPc}
                fill
              />
            )}
            {tab === "spectrum" && <SpectrumPlot data={data} threshold={data.params.peak_threshold_db} fill />}
            {tab === "scale" && (
              <ScaleTable data={data} selected={selected?.degree ?? null} onSelect={playDegree} hoverDegree={hoverDegree} rootPc={rootPc} />
            )}
          </div>
        </section>
      </div>

      <div className="studio-foot">
        <AdsrPanel adsr={adsr} onChange={setAdsr} />
      </div>

      {modal === "about" && (
        <Modal title="About this sound" kicker="Analysis summary" onClose={() => setModal(null)} wide>
          <SoundSummary source={source} data={data} />
        </Modal>
      )}
      {modal === "refine" && (
        <Modal title="Refine the Instrument" kicker="Analysis parameters" onClose={() => setModal(null)} wide>
          <AdvancedParameters
            form={form}
            onChange={onFormChange}
            onRegenerate={() => {
              onRegenerate();
              setModal(null);
            }}
            onReset={onReset}
            busy={busy}
            dirty={dirty}
            error={regen?.phase === "error" ? regen.error : null}
            source={source}
            autoRegion={autoRegion}
            inModal
          />
        </Modal>
      )}
      {modal === "export" && (
        <Modal title="Export" kicker="Scala · keyboard mapping · analysis data" onClose={() => setModal(null)} wide>
          <ExportPanel analysis={analysis} source={source} baseFreq={inst.baseFreq} rootMidi={inst.rootMidi} />
        </Modal>
      )}
      {regen?.phase === "error" && modal !== "refine" && (
        <div className="regen-overlay">
          <ErrorNotice error={regen.error} compact actions={<button type="button" className="btn btn--outline btn--sm" onClick={() => setModal("refine")}>Open parameters</button>} />
        </div>
      )}

      {regen && regen.phase !== "error" && (
        <div className="regen-overlay" role="dialog" aria-modal="false" aria-label="Regenerating the scale">
          <AnalysisProgress name={source.name} phase={regen.phase} timings={regen.timings} compact onCancel={onCancelRegen} />
        </div>
      )}
    </main>
  );
}
