"""Partial extraction: Welch-averaged spectrum, peak picking, refinement.

Implements PRD FR-8 .. FR-14.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import find_peaks
from scipy.signal.windows import blackmanharris

from .errors import EngineError

MIN_FREQ_HZ = 20.0
MAX_FREQ_HZ = 16000.0
ZERO_PAD_FACTOR = 8
MIN_PEAK_PROMINENCE_DB = 10.0
# The strongest peak must stand at least this far above the median spectral
# level, otherwise the sample is treated as noise (a simple SNR check, FR-7).
MIN_PEAK_TO_FLOOR_DB = 25.0


@dataclass
class Partial:
    freq_hz: float
    amp: float  # linear, strongest partial = 1.0
    amp_db: float  # relative to the strongest partial


@dataclass
class SpectrumResult:
    partials: list[Partial]
    freqs: np.ndarray  # full-resolution bin frequencies (Hz)
    mag_db: np.ndarray  # averaged magnitude (dB re. max)
    frame_length: int
    n_frames: int
    nfft: int
    peak_to_floor_db: float


def averaged_spectrum(x: np.ndarray, sr: int, frame_length: int = 8192) -> tuple[np.ndarray, np.ndarray, int, int]:
    """Welch-style magnitude average: Blackman-Harris, 50% overlap, >= 8x zero padding."""
    hop = frame_length // 2
    if len(x) < frame_length:
        x = np.pad(x, (0, frame_length - len(x)))
    n_frames = 1 + (len(x) - frame_length) // hop
    nfft = 1 << int(np.ceil(np.log2(frame_length * ZERO_PAD_FACTOR)))
    win = blackmanharris(frame_length, sym=False)
    acc = np.zeros(nfft // 2 + 1)
    # Process frames in chunks to keep memory bounded on long regions.
    chunk = 16
    for c0 in range(0, n_frames, chunk):
        idx = np.arange(frame_length)[None, :] + hop * np.arange(c0, min(n_frames, c0 + chunk))[:, None]
        frames = x[idx] * win
        acc += np.abs(np.fft.rfft(frames, n=nfft, axis=1)).sum(axis=0)
    mag = acc / n_frames
    freqs = np.fft.rfftfreq(nfft, 1 / sr)
    return freqs, mag, n_frames, nfft


def extract_partials(
    x: np.ndarray,
    sr: int,
    max_partials: int = 12,
    peak_threshold_db: float = -60.0,
    frame_length: int = 8192,
) -> SpectrumResult:
    freqs, mag, n_frames, nfft = averaged_spectrum(x, sr, frame_length)
    mag_db = 20 * np.log10(np.maximum(mag, 1e-20))

    band = (freqs >= MIN_FREQ_HZ) & (freqs <= MAX_FREQ_HZ)
    band_idx = np.flatnonzero(band)
    ref = float(np.max(mag_db[band]))
    rel_db = mag_db - ref

    floor_db = float(np.median(rel_db[band]))
    peak_to_floor = -floor_db

    # Peaks closer than about two analysis bins cannot be resolved anyway.
    pad = nfft // frame_length
    peaks, props = find_peaks(
        rel_db[band],
        height=peak_threshold_db,
        prominence=MIN_PEAK_PROMINENCE_DB,
        distance=max(1, 2 * pad),
    )
    peaks = band_idx[peaks]

    if peaks.size == 0 or peak_to_floor < MIN_PEAK_TO_FLOOR_DB:
        raise EngineError(
            "NO_PARTIALS_FOUND",
            "We couldn't find clear overtones in that sound. Noisy, reverberant or polyphonic recordings "
            "rarely work well — try a clean, isolated single note or strike.",
        )

    # Parabolic interpolation on log magnitude (FR-10).
    refined = []
    for k in peaks:
        if 0 < k < len(rel_db) - 1:
            a, b, c = rel_db[k - 1], rel_db[k], rel_db[k + 1]
            denom = a - 2 * b + c
            p = 0.5 * (a - c) / denom if denom != 0 else 0.0
            p = float(np.clip(p, -0.5, 0.5))
            peak_db = b - 0.25 * (a - c) * p
        else:
            p, peak_db = 0.0, rel_db[k]
        f = (k + p) * sr / nfft
        if MIN_FREQ_HZ <= f <= MAX_FREQ_HZ:
            refined.append((float(f), float(peak_db)))

    if not refined:
        raise EngineError("NO_PARTIALS_FOUND", "No partials were found between 20 Hz and 16 kHz.")

    # Keep the N strongest (FR-11), re-reference to the strongest, sort by frequency.
    refined.sort(key=lambda t: t[1], reverse=True)
    refined = refined[:max_partials]
    top_db = refined[0][1]
    partials = [
        Partial(freq_hz=f, amp=float(10 ** ((d - top_db) / 20)), amp_db=float(d - top_db)) for f, d in refined
    ]
    partials.sort(key=lambda p: p.freq_hz)

    return SpectrumResult(
        partials=partials,
        freqs=freqs,
        mag_db=rel_db - top_db,
        frame_length=frame_length,
        n_frames=n_frames,
        nfft=nfft,
        peak_to_floor_db=peak_to_floor,
    )


def downsample_spectrum(freqs: np.ndarray, mag_db: np.ndarray, n_points: int = 900, floor_db: float = -110.0):
    """Log-spaced max-pooling of the spectrum for plotting (keeps peaks intact)."""
    edges = np.geomspace(MIN_FREQ_HZ, MAX_FREQ_HZ, n_points + 1)
    idx = np.searchsorted(freqs, edges)
    out_f, out_db = [], []
    for i in range(n_points):
        a, b = idx[i], max(idx[i + 1], idx[i] + 1)
        if a >= len(freqs):
            break
        seg = mag_db[a:b]
        j = int(np.argmax(seg))
        out_f.append(float(freqs[a + j]))
        out_db.append(float(max(seg[j], floor_db)))
    return out_f, out_db


def classify(partials: list[Partial]) -> tuple[str, float | None, float]:
    """Estimate a (pseudo-)fundamental and classify harmonicity (FR-13).

    Returns (classification, fundamental_hz or None, weighted deviation in cents).
    For each candidate fundamental f0 every partial is compared with its nearest
    integer multiple n*f0. The deviation is normalised by half the harmonic
    spacing at that n, so a very low f0 cannot "fit" everything by accident.
    """
    if len(partials) == 1:
        return "harmonic", partials[0].freq_hz, 0.0

    f = np.array([p.freq_hz for p in partials])
    a = np.array([p.amp for p in partials])
    strong = f[a >= 10 ** (-30 / 20)]
    lowest = np.sort(strong)[:3] if strong.size else np.sort(f)[:3]

    best = None  # (cost, norm, absdev, f0)
    for base in lowest:
        # k = 2 allows for a weak or missing fundamental one octave below.
        for k in (1, 2):
            f0 = base / k
            if f0 < 20:
                break
            n = np.maximum(1, np.round(f / f0))
            if np.max(n) > 32:
                continue
            dev = np.abs(1200 * np.log2(f / (n * f0)))
            half = 1200 * np.log2((n + 0.5) / n)
            norm = float(np.sum(a * dev / half) / np.sum(a))
            absdev = float(np.sum(a * dev) / np.sum(a))
            cost = norm + 0.1 * (k - 1)
            if best is None or cost < best[0]:
                best = (cost, norm, absdev, float(f0))
    if best is None:
        return "inharmonic", None, float("nan")

    _, norm, absdev, f0 = best
    if absdev < 10 and norm < 0.2:
        return "harmonic", f0, absdev
    if absdev < 35 and norm < 0.35:
        return "near-harmonic", f0, absdev
    return "inharmonic", None, absdev
