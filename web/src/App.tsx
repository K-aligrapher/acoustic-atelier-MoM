import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisProgress, type JobPhase } from "./components/AnalysisProgress";
import { SiteHeader, WorkspaceHeader, type NavTarget } from "./components/AppShell";
import type { DropzoneHandle } from "./components/AudioDropzone";
import { Documentation } from "./components/Documentation";
import { LandingPage } from "./components/LandingPage";
import { Workspace } from "./components/Workspace";
import { useReducedMotion } from "./hooks/useSize";
import { analyzeAudio } from "./lib/api";
import { loadFile, prepareUpload } from "./lib/audio/decode";
import { AudioEngine } from "./lib/audio/engine";
import { referenceBell, referenceHarmonic } from "./lib/audio/references";
import { AppError } from "./lib/errors";
import { DEFAULT_PARAMS, type Analysis, type ParamsForm, type SoundSource } from "./lib/types";

type View = "landing" | "docs" | "analyzing" | "workspace";

interface Job {
  name: string;
  phase: JobPhase;
  error?: unknown;
  timings?: Record<string, number>;
  /** true for a fresh sound (full-screen), false for a regeneration (overlay). */
  fresh: boolean;
  retry?: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function viewFromHash(): View {
  return location.hash.startsWith("#/docs") ? "docs" : "landing";
}

export default function App() {
  const engine = useMemo(() => new AudioEngine(), []);
  const reduced = useReducedMotion();
  const [view, setView] = useState<View>(viewFromHash);
  const [source, setSource] = useState<SoundSource | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [form, setForm] = useState<ParamsForm>(DEFAULT_PARAMS);
  const [job, setJob] = useState<Job | null>(null);
  const [landingError, setLandingError] = useState<unknown | null>(null);
  const dropzone = useRef<DropzoneHandle>(null);
  const abort = useRef<AbortController | null>(null);
  const pendingScroll = useRef<string | null>(null);

  // Hash routing for docs / landing; the workspace lives at #/instrument.
  useEffect(() => {
    const onHash = () => {
      if (location.hash.startsWith("#/docs")) setView("docs");
      else if (location.hash.startsWith("#/instrument") && analysis) setView("workspace");
      else if (!location.hash || location.hash === "#/") setView((v) => (v === "analyzing" ? v : "landing"));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [analysis]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (pendingScroll.current && view === "landing") {
      const id = pendingScroll.current;
      pendingScroll.current = null;
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }));
    }
  }, [view, reduced]);

  const go = (v: View, hash: string) => {
    if (location.hash !== hash) history.pushState(null, "", hash);
    setView(v);
  };

  const run = useCallback(
    async (src: SoundSource, params: ParamsForm, fresh: boolean) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const retry = () => run(src, params, fresh);
      setJob({ name: src.name, phase: "server", fresh, retry });
      if (fresh) go("analyzing", "#/instrument");
      try {
        const prep = prepareUpload(src, params.region);
        const response = await analyzeAudio({ audio: prep.audio, displayName: src.name, params, region: prep.region, signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setJob({ name: src.name, phase: "done", timings: response.meta.timings_ms, fresh });
        await sleep(reduced ? 150 : fresh ? 1100 : 650);
        if (ctrl.signal.aborted) return;
        setSource(src);
        setAnalysis({ response, segmentOffsetMs: prep.segmentOffsetMs, params });
        setForm(params);
        setJob(null);
        if (fresh) go("workspace", "#/instrument");
      } catch (e) {
        if (e instanceof AppError && e.code === "CANCELLED") return;
        if (ctrl.signal.aborted) return;
        setJob({ name: src.name, phase: "error", error: e, fresh, retry });
      }
    },
    [reduced],
  );

  const startFile = async (file: File) => {
    setLandingError(null);
    setJob({ name: file.name, phase: "reading", fresh: true });
    go("analyzing", "#/instrument");
    try {
      const src = await loadFile(file);
      await run(src, { ...DEFAULT_PARAMS }, true);
    } catch (e) {
      setJob({ name: file.name, phase: "error", error: e, fresh: true });
    }
  };

  const startReference = async (kind: "bell" | "harmonic") => {
    setLandingError(null);
    const name = kind === "bell" ? "reference-bell.wav" : "harmonic-reference.wav";
    setJob({ name, phase: "reading", fresh: true });
    go("analyzing", "#/instrument");
    await sleep(30); // let the progress view paint before synthesis
    try {
      const src = kind === "bell" ? referenceBell() : referenceHarmonic();
      await run(src, { ...DEFAULT_PARAMS }, true);
    } catch (e) {
      setJob({ name, phase: "error", error: e, fresh: true });
    }
  };

  const cancel = () => {
    abort.current?.abort();
    const wasFresh = job?.fresh;
    setJob(null);
    if (wasFresh) go(analysis ? "workspace" : "landing", analysis ? "#/instrument" : "#/");
  };

  const toUpload = () => {
    engine.stopAll();
    if (view !== "landing") {
      pendingScroll.current = "upload";
      go("landing", "#/");
    } else {
      document.getElementById("upload")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }
    setTimeout(() => dropzone.current?.focus(), reduced ? 50 : 600);
  };

  const navigate = (t: NavTarget) => {
    if (t === "docs") return go("docs", "#/docs");
    if (t === "home") {
      engine.stopAll();
      return go("landing", "#/");
    }
    if (t === "instrument" && analysis) return go("workspace", "#/instrument");
    const id = t === "how" ? "how" : "upload";
    if (view !== "landing") {
      pendingScroll.current = id;
      go("landing", "#/");
    } else document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  const showWorkspace = (view === "workspace" || (job && !job.fresh)) && source && analysis;

  return (
    <div className={`app view--${view}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {showWorkspace && view === "workspace" ? (
        <>
          <WorkspaceHeader
            filename={source!.name}
            status={
              job?.phase === "error"
                ? { tone: "error", label: "Regeneration failed" }
                : job
                  ? { tone: "busy", label: "Analysing" }
                  : { tone: "ok", label: "Analysed" }
            }
            onNewSound={toUpload}
            onHome={() => navigate("home")}
          />
          <Workspace
            key={`${source!.name}-${source!.durationS}`}
            source={source!}
            analysis={analysis!}
            engine={engine}
            form={form}
            onFormChange={(p) => setForm((f) => ({ ...f, ...p }))}
            onRegenerate={() => run(source!, form, false)}
            onReset={() => setForm({ ...DEFAULT_PARAMS })}
            regen={job && !job.fresh ? job : null}
            onCancelRegen={cancel}
          />
        </>
      ) : view === "analyzing" && job ? (
        <>
          <SiteHeader onNavigate={navigate} onCreate={toUpload} current="landing" hasSession={!!analysis} />
          <main id="main" className="analyzing">
            <AnalysisProgress
              name={job.name}
              phase={job.phase}
              timings={job.timings}
              error={job.error}
              onCancel={cancel}
              onRetry={job.retry && (!(job.error instanceof AppError) || ["NETWORK", "ANALYSIS_TIMEOUT", "RATE_LIMITED", "ANALYSIS_FAILED"].includes(job.error.code)) ? job.retry : undefined}
              onChooseAnother={() => {
                setJob(null);
                toUpload();
              }}
            />
          </main>
        </>
      ) : view === "docs" ? (
        <>
          <SiteHeader onNavigate={navigate} onCreate={toUpload} current="docs" hasSession={!!analysis} />
          <Documentation />
        </>
      ) : (
        <>
          <SiteHeader onNavigate={navigate} onCreate={toUpload} current="landing" hasSession={!!analysis} />
          <LandingPage
            onFile={startFile}
            onReference={startReference}
            onCompose={toUpload}
            error={landingError}
            onDismissError={() => setLandingError(null)}
            dropzoneRef={dropzone}
            busy={!!job && job.phase !== "error"}
          />
        </>
      )}
    </div>
  );
}
