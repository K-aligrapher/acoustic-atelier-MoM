"""End-to-end analysis pipeline: audio bytes -> partials, curve, scale, exports."""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass

import numpy as np

from .dissonance import dissonance_curve, find_minima, self_roughness
from .errors import EngineError
from .export import safe_name, write_kbm, write_scl
from .ingest import TARGET_SR, ingest
from .optimize import generate_scale
from .partials import classify, downsample_spectrum, extract_partials

ALLOWED_WINDOWS = (2048, 4096, 8192, 16384, 32768)


@dataclass
class AnalysisParams:
    notes: int = 7
    period: str = "octave"  # octave | stretched | auto
    period_cents: float = 1200.0
    max_partials: int = 12
    min_spacing_cents: float = 40.0
    peak_threshold_db: float = -60.0
    window_length: int = 8192
    region_start_ms: int | None = None
    region_end_ms: int | None = None

    def validate(self) -> None:
        def bad(msg: str):
            raise EngineError("INVALID_PARAMETER", msg)

        if not 3 <= int(self.notes) <= 24:
            bad("Number of notes must be between 3 and 24.")
        if self.period not in ("octave", "stretched", "auto"):
            bad("Period must be 'octave', 'stretched' or 'auto'.")
        if self.period == "stretched" and not 600 <= float(self.period_cents) <= 2400:
            bad("A stretched period must be between 600 and 2400 cents.")
        if not 4 <= int(self.max_partials) <= 24:
            bad("Maximum partials must be between 4 and 24.")
        if not 15 <= float(self.min_spacing_cents) <= 100:
            bad("Minimum spacing must be between 15 and 100 cents.")
        if not -96 <= float(self.peak_threshold_db) <= -20:
            bad("Peak threshold must be between -96 and -20 dB.")
        if int(self.window_length) not in ALLOWED_WINDOWS:
            bad(f"Analysis window must be one of {', '.join(map(str, ALLOWED_WINDOWS))} samples.")
        rs, re_ = self.region_start_ms, self.region_end_ms
        if rs is not None and rs < 0:
            bad("Region start must be zero or positive.")
        if rs is not None and re_ is not None and re_ <= rs:
            bad("Region end must be after region start.")


def _detect_period(freqs, amps) -> tuple[float, str]:
    """The sound's own pseudo-octave: deepest curve minimum between 1100 and 1300 cents."""
    cents, R = dissonance_curve(freqs, amps, 1350.0)
    window = (cents >= 1100) & (cents <= 1300)
    minima = [m for m in find_minima(cents, R) if 1100 <= m.cents <= 1300]
    if minima:
        best = max(minima, key=lambda m: m.prominence)
        return float(best.cents), "detected"
    # No local minimum: use the lowest point in the window if it is not on an edge.
    k = int(np.argmin(np.where(window, R, np.inf)))
    if 1100 < cents[k] < 1300:
        return float(cents[k]), "detected"
    return 1200.0, "fallback_octave"


def analyze(data: bytes, params: AnalysisParams | None = None, filename: str = "sound") -> dict:
    params = params or AnalysisParams()
    params.validate()
    timings: dict[str, float] = {}

    t = time.perf_counter()
    ing = ingest(
        data,
        region_start_ms=params.region_start_ms,
        region_end_ms=params.region_end_ms,
        min_region_samples=int(params.window_length),
    )
    timings["read"] = time.perf_counter() - t

    t = time.perf_counter()
    region = ing.samples[ing.region_start : ing.region_end]
    spec = extract_partials(
        region,
        TARGET_SR,
        max_partials=int(params.max_partials),
        peak_threshold_db=float(params.peak_threshold_db),
        frame_length=int(params.window_length),
    )
    freqs = np.array([p.freq_hz for p in spec.partials])
    amps = np.array([p.amp for p in spec.partials])
    classification, f0, harmonic_dev = classify(spec.partials)
    timings["partials"] = time.perf_counter() - t

    t = time.perf_counter()
    if params.period == "octave":
        period_cents, period_source = 1200.0, "octave"
    elif params.period == "stretched":
        period_cents, period_source = float(params.period_cents), "stretched"
    else:
        period_cents, period_source = _detect_period(freqs, amps)
    period_cents = round(period_cents, 5)

    curve_cents, curve_R = dissonance_curve(freqs, amps, period_cents)
    minima = find_minima(curve_cents, curve_R)
    timings["curve"] = time.perf_counter() - t

    t = time.perf_counter()
    scale = generate_scale(
        freqs,
        amps,
        curve_cents,
        curve_R,
        minima,
        notes=int(params.notes),
        period_cents=period_cents,
        min_spacing=float(params.min_spacing_cents),
    )
    timings["optimize"] = time.perf_counter() - t

    t = time.perf_counter()
    warnings = list(scale.warnings)
    if period_source == "fallback_octave":
        warnings.append("No clear pseudo-octave was found in the curve, so the scale repeats at the octave (1200 cents).")
    if spec.n_frames < 2:
        warnings.append("The analysis region is shorter than two analysis windows; low partials may be imprecise.")
    if len(spec.partials) < 3:
        warnings.append("Very few partials were found, so the dissonance curve has only a few features.")

    # Reference pitch used to play the sample at a chosen root frequency.
    if f0 is not None:
        reference_hz, reference_kind = f0, "fundamental"
    else:
        strong = [p for p in spec.partials if p.amp_db >= -20]
        reference_hz, reference_kind = (strong or spec.partials)[0].freq_hz, "lowest_strong_partial"

    stem = safe_name(filename.rsplit(".", 1)[0], "sound")
    scale_name = f"{stem}_scale"
    pitches = [d.cents for d in scale.degrees[1:]]
    description = f"Timbre-derived scale from {filename} ({len(pitches)} notes, period {period_cents:.3f} cents)"
    scl = write_scl(scale_name, description, pitches)
    kbm = write_kbm(scale_name, len(pitches))
    timings["export"] = time.perf_counter() - t

    spec_f, spec_db = downsample_spectrum(spec.freqs, spec.mag_db)
    sr = TARGET_SR

    return {
        "meta": {
            "filename": filename,
            "duration_s": round(ing.duration_s, 4),
            "sample_rate": ing.source_sample_rate,
            "channels": ing.source_channels,
            "analysis_sample_rate": sr,
            "classification": classification,
            "fundamental_hz": f0,
            "harmonic_deviation_cents": None if harmonic_dev != harmonic_dev else round(harmonic_dev, 3),
            "reference_hz": reference_hz,
            "reference_kind": reference_kind,
            "region_start_ms": round(ing.region_start / sr * 1000, 1),
            "region_end_ms": round(ing.region_end / sr * 1000, 1),
            "region_mode": ing.region_mode,
            "trim_start_ms": round(ing.trim_start / sr * 1000, 1),
            "trim_end_ms": round(ing.trim_end / sr * 1000, 1),
            "frames_averaged": spec.n_frames,
            "fft_size": spec.nfft,
            "peak_to_floor_db": round(spec.peak_to_floor_db, 2),
            "self_roughness": self_roughness(freqs, amps),
            "timings_ms": {k: round(v * 1000, 1) for k, v in timings.items()},
        },
        "params": {k: v for k, v in asdict(params).items()},
        "partials": [{"freq_hz": p.freq_hz, "amp": p.amp, "amp_db": p.amp_db} for p in spec.partials],
        "spectrum": {"freq_hz": spec_f, "db": spec_db},
        "curve": {
            "cents": [float(c) for c in curve_cents],
            "roughness": [float(r) for r in curve_R],
            "minima": [asdict(m) for m in sorted(minima, key=lambda m: m.cents)],
        },
        "scale": {
            "name": scale_name,
            "period_cents": scale.period_cents,
            "period_source": period_source,
            "notes": int(params.notes),
            "min_spacing_cents": scale.effective_min_spacing,
            "optimizer": scale.optimizer,
            "degrees": [asdict(d) for d in scale.degrees],
            "total_roughness": scale.total_roughness,
            "twelve_tet_cents": scale.twelve_tet_cents,
            "twelve_tet_total_roughness": scale.twelve_tet_total_roughness,
            "roughness_vs_12tet": scale.roughness_vs_12tet,
        },
        "exports": {"scl": scl, "kbm": kbm},
        "warnings": warnings,
    }
