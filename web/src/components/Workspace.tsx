import { useCallback, useEffect, useMemo, useState } from "react";
import type { AudioEngine } from "../lib/audio/engine";
import { roman } from "../lib/format";
import { freqToMidi, midiToFreq } from "../lib/music";
import type { Analysis, ParamsForm, SoundSource } from "../lib/types";
import { AdvancedParameters } from "./AdvancedParameters";
import { AnalysisProgress, type JobPhase } from "./AnalysisProgress";
import { DissonanceCurve } from "./DissonanceCurve";
import { ExportPanel } from "./ExportPanel";
import { InstrumentKeyboard, type InstrumentState } from "./InstrumentKeyboard";
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

function Section({ n, id, title, kicker, children, className = "" }: { n: number; id: string; title: string; kicker?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`ws-section ${className}`} aria-labelledby={id}>
      <header className="ws-section-head">
        <span className="ws-section-num">{roman(n)}.</span>
        <h2 id={id} className="ws-section-title">
          {title}
        </h2>
        {kicker && <p className="ws-section-kicker">{kicker}</p>}
      </header>
      {children}
    </section>
  );
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
    return { tuning: "generated", rootMidi: m, baseFreq: midiToFreq(m), volume: 0.8, envelope: "ring", showCents: true };
  });
  const [selected, setSelected] = useState<{ degree: number; periodIndex: number } | null>({ degree: 0, periodIndex: 0 });
  const [hoverDegree, setHoverDegree] = useState<number | null>(null);
  const [playing, setPlaying] = useState(0);
  const [canHold, setCanHold] = useState(false);

  const patchInst = useCallback((p: Partial<InstrumentState>) => setInst((s) => ({ ...s, ...p })), []);

  useEffect(() => engine.onActivity(setPlaying), [engine]);
  useEffect(() => engine.setVolume(inst.volume), [engine, inst.volume]);
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
    setCanHold(engine.canHold);
    if (!engine.canHold && inst.envelope === "hold") patchInst({ envelope: "ring" });
  }, [engine, playback, data.meta.region_start_ms, data.meta.region_end_ms, analysis.segmentOffsetMs]);

  const centsFor = (degree: number, periodIndex: number) =>
    inst.tuning === "12tet"
      ? periodIndex * data.scale.twelve_tet_cents[K] + data.scale.twelve_tet_cents[degree]
      : periodIndex * data.scale.period_cents + data.scale.degrees[degree].cents;

  const playDegree = (degree: number, periodIndex = 0) => {
    const f = inst.baseFreq * Math.pow(2, centsFor(degree, periodIndex) / 1200);
    engine.noteOn(`row-${degree}-${periodIndex}`, f / ref, "ring");
    setSelected({ degree, periodIndex });
  };

  const rootPc = ((inst.rootMidi % 12) + 12) % 12;
  const autoRegion = {
    start_ms: analysis.segmentOffsetMs + data.meta.region_start_ms,
    end_ms: analysis.segmentOffsetMs + data.meta.region_end_ms,
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(analysis.params);
  const busy = regen?.phase === "reading" || regen?.phase === "server";

  return (
    <main id="main" className={`workspace${busy ? " is-busy" : ""}`}>
      <SoundSummary source={source} data={data} />

      <AdvancedParameters
        form={form}
        onChange={onFormChange}
        onRegenerate={onRegenerate}
        onReset={onReset}
        busy={busy}
        dirty={dirty}
        error={regen?.phase === "error" ? regen.error : null}
        source={source}
        autoRegion={autoRegion}
      />

      <Section n={1} id="sec-instrument" title="The Instrument" kicker="Your sample, transposed onto every degree of its own scale." className="ws-section--instrument">
        <InstrumentKeyboard
          degrees={data.scale.degrees}
          tetCents={data.scale.twelve_tet_cents}
          periodCents={data.scale.period_cents}
          referenceHz={ref}
          engine={engine}
          state={inst}
          setState={patchInst}
          canHold={canHold}
          selected={selected}
          onSelect={setSelected}
          highlight={hoverDegree}
          playing={playing}
          tetAvailable={tetAvailable}
        />
      </Section>

      <Section n={2} id="sec-curve" title="The Dissonance Curve" kicker="Roughness of the sound against a transposed copy of itself.">
        <DissonanceCurve
          data={data}
          selected={selected?.degree ?? null}
          onSelect={(d) => playDegree(d, 0)}
          hoverDegree={hoverDegree}
          onHoverDegree={setHoverDegree}
          showTet={inst.tuning === "12tet"}
          rootPc={rootPc}
        />
      </Section>

      <div className="ws-split">
        <Section n={3} id="sec-spectrum" title="The Spectrum" kicker={`${data.partials.length} partials · ${data.meta.frames_averaged} averaged frames`}>
          <SpectrumPlot data={data} threshold={data.params.peak_threshold_db} />
        </Section>
        <Section n={4} id="sec-scale" title="The Scale" kicker="Select a row to hear it.">
          <ScaleTable data={data} selected={selected?.degree ?? null} onSelect={playDegree} hoverDegree={hoverDegree} rootPc={rootPc} />
        </Section>
      </div>

      <Section n={5} id="sec-export" title="Export" kicker="Take the tuning into Scala, Surge XT, Vital, Pianoteq or your DAW." className="ws-section--export">
        <ExportPanel analysis={analysis} source={source} baseFreq={inst.baseFreq} rootMidi={inst.rootMidi} />
      </Section>

      {regen && regen.phase !== "error" && (
        <div className="regen-overlay" role="dialog" aria-modal="false" aria-label="Regenerating the scale">
          <AnalysisProgress name={source.name} phase={regen.phase} timings={regen.timings} compact onCancel={onCancelRegen} />
        </div>
      )}
    </main>
  );
}
