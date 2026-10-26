// Mirrors the JSON returned by POST /api/analyze (engine/pipeline.py).

export type Classification = "harmonic" | "near-harmonic" | "inharmonic";
export type PeriodType = "octave" | "stretched" | "auto";

export interface Partial {
  freq_hz: number;
  amp: number;
  amp_db: number;
}

export interface Minimum {
  cents: number;
  roughness: number;
  prominence: number;
}

export interface Degree {
  index: number;
  cents: number;
  seed_cents: number | null;
  source: "root" | "minimum" | "fill" | "period";
  nearest_12tet_semitones: number;
  nearest_12tet: string;
  deviation_cents: number;
  nearest_ratio: string | null;
  ratio_error_cents: number | null;
  roughness: number;
  curve_roughness: number;
}

export interface AnalysisMeta {
  filename: string;
  duration_s: number;
  sample_rate: number;
  channels: number;
  analysis_sample_rate: number;
  classification: Classification;
  fundamental_hz: number | null;
  harmonic_deviation_cents: number | null;
  reference_hz: number;
  reference_kind: "fundamental" | "lowest_strong_partial";
  region_start_ms: number;
  region_end_ms: number;
  region_mode: "percussive" | "sustained" | "manual";
  trim_start_ms: number;
  trim_end_ms: number;
  frames_averaged: number;
  fft_size: number;
  peak_to_floor_db: number;
  self_roughness: number;
  timings_ms: Record<string, number>;
}

export interface AnalysisParams {
  notes: number;
  period: PeriodType;
  period_cents: number;
  max_partials: number;
  min_spacing_cents: number;
  peak_threshold_db: number;
  window_length: number;
  region_start_ms: number | null;
  region_end_ms: number | null;
}

export interface AnalysisResponse {
  meta: AnalysisMeta;
  params: AnalysisParams;
  partials: Partial[];
  spectrum: { freq_hz: number[]; db: number[] };
  curve: { cents: number[]; roughness: number[]; minima: Minimum[] };
  scale: {
    name: string;
    period_cents: number;
    period_source: "octave" | "stretched" | "detected" | "fallback_octave";
    notes: number;
    min_spacing_cents: number;
    optimizer: string;
    degrees: Degree[];
    total_roughness: number;
    twelve_tet_cents: number[];
    twelve_tet_total_roughness: number;
    roughness_vs_12tet: number | null;
  };
  exports: { scl: string; kbm: string };
  warnings: string[];
}

/** Parameters as edited in the UI (region is on the full-file timeline, in ms). */
export interface ParamsForm {
  notes: number;
  period: PeriodType;
  period_cents: number;
  max_partials: number;
  min_spacing_cents: number;
  peak_threshold_db: number;
  window_length: number;
  region: { start_ms: number; end_ms: number } | null;
}

export const DEFAULT_PARAMS: ParamsForm = {
  notes: 7,
  period: "octave",
  period_cents: 1200,
  max_partials: 12,
  min_spacing_cents: 40,
  peak_threshold_db: -60,
  window_length: 8192,
  region: null,
};

export type SourceKind = "upload" | "reference-bell" | "reference-harmonic";

/** A sound loaded in the browser, ready to analyse and play. */
export interface SoundSource {
  kind: SourceKind;
  name: string; // display filename
  sizeBytes: number | null;
  buffer: AudioBuffer; // decoded at 44.1 kHz
  durationS: number;
  sourceSampleRate: number | null; // from the file header when it can be read
  channels: number;
}

export interface Analysis {
  response: AnalysisResponse;
  /** Offset (ms) of the uploaded segment within the full file. */
  segmentOffsetMs: number;
  params: ParamsForm;
}
