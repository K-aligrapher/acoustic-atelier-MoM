import { AppError } from "./errors";
import type { AnalysisResponse, ParamsForm } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
const CLIENT_TIMEOUT_MS = 45_000;

async function parseError(res: Response): Promise<AppError> {
  try {
    const body = await res.json();
    if (body && typeof body.code === "string") return new AppError(body.code, body.message);
  } catch {
    /* not JSON (e.g. a platform error page) */
  }
  if (res.status === 413) return new AppError("FILE_TOO_LARGE");
  if (res.status === 429) return new AppError("RATE_LIMITED");
  if (res.status === 504) return new AppError("ANALYSIS_TIMEOUT");
  return new AppError("ANALYSIS_FAILED");
}

export interface AnalyzeRequest {
  audio: Blob; // mono 16-bit WAV prepared in the browser
  displayName: string;
  params: ParamsForm;
  /** Region in ms relative to the uploaded segment, or null for automatic. */
  region: { start_ms: number; end_ms: number } | null;
  signal?: AbortSignal;
}

export async function analyzeAudio(req: AnalyzeRequest): Promise<AnalysisResponse> {
  const fd = new FormData();
  const base = req.displayName.replace(/\.[^.]+$/, "") || "sound";
  fd.append("file", req.audio, `${base}.wav`);
  fd.append("display_name", req.displayName);
  fd.append("notes", String(req.params.notes));
  fd.append("period", req.params.period);
  fd.append("period_cents", String(req.params.period_cents));
  fd.append("max_partials", String(req.params.max_partials));
  fd.append("min_spacing_cents", String(req.params.min_spacing_cents));
  fd.append("peak_threshold_db", String(req.params.peak_threshold_db));
  fd.append("window_length", String(req.params.window_length));
  if (req.region) {
    fd.append("region_start_ms", String(Math.round(req.region.start_ms)));
    fd.append("region_end_ms", String(Math.round(req.region.end_ms)));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), CLIENT_TIMEOUT_MS);
  req.signal?.addEventListener("abort", () => ctrl.abort("cancelled"));
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: fd, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted && ctrl.signal.reason === "timeout") throw new AppError("ANALYSIS_TIMEOUT");
    if (ctrl.signal.aborted) throw new AppError("CANCELLED");
    throw new AppError("NETWORK", e instanceof Error ? e.message : undefined);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AnalysisResponse;
}

export interface ExportFiles {
  filename_base: string;
  scl: string;
  kbm: string;
}

export async function requestExport(body: {
  name: string;
  description: string;
  cents: number[];
  root_note: number;
  reference_freq: number;
}): Promise<ExportFiles> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppError("NETWORK");
  }
  if (!res.ok) {
    const err = await parseError(res);
    throw err.code === "ANALYSIS_FAILED" ? new AppError("EXPORT_FAILED") : err;
  }
  return (await res.json()) as ExportFiles;
}
