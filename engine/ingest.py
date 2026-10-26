"""Audio ingest: decode, mono, resample, normalise, trim, region selection.

Implements PRD FR-1 .. FR-7.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from math import gcd

import numpy as np
from scipy.signal import resample_poly

from .errors import EngineError

TARGET_SR = 44100
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_DURATION_S = 60.0
MAX_ANALYSIS_S = 30.0
MIN_USABLE_S = 0.150
TRIM_THRESHOLD_DBFS = -50.0
SILENCE_PEAK_DBFS = -70.0  # raw peak below this is treated as silence

# Magic numbers used to validate the format by content, not by extension.
_MAGIC = {
    "wav": [(0, b"RIFF"), (0, b"RIFX"), (0, b"RF64")],
    "flac": [(0, b"fLaC")],
    "ogg": [(0, b"OggS")],
    "mp3": [(0, b"ID3")],
}


@dataclass
class Ingested:
    samples: np.ndarray  # mono float64, peak-normalised to -1 dBFS, at TARGET_SR
    sample_rate: int  # always TARGET_SR
    source_sample_rate: int
    source_channels: int
    duration_s: float  # duration of the decoded file
    trim_start: int  # first non-silent sample (in samples at TARGET_SR)
    trim_end: int  # one past the last non-silent sample
    region_start: int
    region_end: int
    region_mode: str  # "percussive", "sustained" or "manual"
    onset: int


def sniff_format(data: bytes) -> str | None:
    """Identify the container from its leading bytes."""
    for fmt, sigs in _MAGIC.items():
        for offset, sig in sigs:
            if data[offset : offset + len(sig)] == sig:
                return fmt
    # Raw MPEG audio frame sync (no ID3 tag): 11 set bits.
    if len(data) > 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return "mp3"
    return None


def _decode(data: bytes, fmt: str) -> tuple[np.ndarray, int]:
    """Decode to a float64 array of shape (frames, channels)."""
    try:
        import soundfile as sf  # libsndfile: WAV, FLAC, OGG, MP3 (libsndfile >= 1.1)

        audio, sr = sf.read(io.BytesIO(data), dtype="float64", always_2d=True)
        return audio, int(sr)
    except ImportError:
        pass
    except Exception as exc:  # noqa: BLE001 - libsndfile raises several types
        if fmt != "wav":
            raise EngineError(
                "UNSUPPORTED_FORMAT",
                "We couldn't decode that file. Try exporting it as WAV or FLAC.",
            ) from exc

    # Fallback for WAV when libsndfile is unavailable or rejects the header.
    if fmt == "wav":
        try:
            from scipy.io import wavfile

            sr, audio = wavfile.read(io.BytesIO(data))
            audio = np.asarray(audio)
            if audio.dtype.kind in "iu":
                info = np.iinfo(audio.dtype)
                scale = max(abs(info.min), info.max)
                audio = (audio.astype(np.float64) - (0 if info.min < 0 else (info.max + 1) / 2)) / scale
            else:
                audio = audio.astype(np.float64)
            if audio.ndim == 1:
                audio = audio[:, None]
            return audio, int(sr)
        except Exception as exc:  # noqa: BLE001
            raise EngineError(
                "UNSUPPORTED_FORMAT",
                "That WAV file couldn't be read. Try re-exporting it as 16-bit PCM WAV.",
            ) from exc
    raise EngineError(
        "UNSUPPORTED_FORMAT",
        "This server can only decode WAV files right now. Try converting the sound to WAV.",
    )


def _resample(x: np.ndarray, sr: int) -> np.ndarray:
    if sr == TARGET_SR:
        return x
    g = gcd(sr, TARGET_SR)
    return resample_poly(x, TARGET_SR // g, sr // g)


def _frame_rms_db(x: np.ndarray, frame: int, hop: int) -> np.ndarray:
    if len(x) < frame:
        x = np.pad(x, (0, frame - len(x)))
    n = 1 + (len(x) - frame) // hop
    idx = np.arange(frame)[None, :] + hop * np.arange(n)[:, None]
    rms = np.sqrt(np.mean(x[idx] ** 2, axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-12))


def _trim_bounds(x: np.ndarray) -> tuple[int, int]:
    """First/last sample whose short-time level exceeds -50 dBFS (FR-4)."""
    frame, hop = 1024, 256
    db = _frame_rms_db(x, frame, hop)
    above = np.flatnonzero(db > TRIM_THRESHOLD_DBFS)
    if above.size == 0:
        return 0, 0
    start = int(above[0] * hop)
    end = int(min(len(x), above[-1] * hop + frame))
    return start, end


def _select_region(x: np.ndarray, start: int, end: int, min_len: int) -> tuple[int, int, str, int]:
    """Automatic analysis region (FR-5).

    Percussive sounds: 100-500 ms after the onset.
    Sustained sounds: the stable middle half of the trimmed signal.
    """
    seg = x[start:end]
    frame, hop = 512, 256
    db = _frame_rms_db(seg, frame, hop)
    peak_i = int(np.argmax(db))
    peak_db = db[peak_i]

    # Onset: first frame within 20 dB of the peak level.
    onset_i = int(np.flatnonzero(db > peak_db - 20)[0])
    onset = start + onset_i * hop

    # Percussive if the energy peaks early and then decays by >= 10 dB
    # within the following second (or by the end of the sound).
    frames_per_s = TARGET_SR / hop
    early_peak = (peak_i - onset_i) / frames_per_s < 0.15
    tail = db[peak_i : peak_i + int(frames_per_s)]
    decays = tail.size > 4 and (peak_db - np.min(tail[-max(1, tail.size // 5):])) >= 10
    max_len = int(MAX_ANALYSIS_S * TARGET_SR)

    if early_peak and decays:
        r0 = onset + int(0.100 * TARGET_SR)
        r1 = onset + int(0.500 * TARGET_SR)
        mode = "percussive"
    else:
        span = end - start
        r0 = start + span // 4
        r1 = start + (3 * span) // 4
        mode = "sustained"

    # Make sure the region holds at least one analysis frame and stays in bounds.
    if r1 - r0 < min_len:
        r1 = r0 + min_len
    if r1 > end:
        r1 = end
        r0 = max(start, r1 - min_len)
    if r1 - r0 > max_len:
        r1 = r0 + max_len
    return int(r0), int(r1), mode, int(onset)


def ingest(
    data: bytes,
    region_start_ms: int | None = None,
    region_end_ms: int | None = None,
    min_region_samples: int = 8192,
) -> Ingested:
    if len(data) == 0:
        raise EngineError("UNSUPPORTED_FORMAT", "The uploaded file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise EngineError("FILE_TOO_LARGE", "That file is larger than 20 MB. Trim it to a single note or strike and try again.")

    fmt = sniff_format(data)
    if fmt is None:
        raise EngineError(
            "UNSUPPORTED_FORMAT",
            "That doesn't look like a WAV, MP3, FLAC or OGG file. Please choose a supported audio format.",
        )

    audio, sr = _decode(data, fmt)
    if audio.size == 0 or sr <= 0:
        raise EngineError("FILE_TOO_SHORT", "The file contains no audio samples.")

    duration_s = audio.shape[0] / sr
    if duration_s > MAX_DURATION_S:
        raise EngineError(
            "FILE_TOO_LONG",
            f"That recording is {duration_s:.0f} seconds long. Please use a sample under 60 seconds — a single note or strike works best.",
        )

    mono = np.mean(audio, axis=1)
    mono = np.nan_to_num(mono - np.mean(mono))  # remove DC offset

    raw_peak = float(np.max(np.abs(mono))) if mono.size else 0.0
    if raw_peak <= 10 ** (SILENCE_PEAK_DBFS / 20):
        raise EngineError(
            "SIGNAL_TOO_QUIET",
            "That recording is very quiet or mostly silent. Try a louder recording of a single note or strike.",
        )

    x = _resample(mono, sr)
    # Peak-normalise to -1 dBFS (FR-3).
    x = x / np.max(np.abs(x)) * 10 ** (-1 / 20)

    t0, t1 = _trim_bounds(x)
    if t1 - t0 < int(MIN_USABLE_S * TARGET_SR):
        raise EngineError(
            "FILE_TOO_SHORT",
            "There's less than 150 ms of usable sound in that file. Try a longer recording that lets the note ring.",
        )

    if region_start_ms is not None or region_end_ms is not None:
        r0 = int((region_start_ms or 0) / 1000 * TARGET_SR)
        r1 = int((region_end_ms if region_end_ms is not None else len(x) * 1000 / TARGET_SR) / 1000 * TARGET_SR)
        r0, r1 = max(0, r0), min(len(x), r1)
        if r1 - r0 < int(MIN_USABLE_S * TARGET_SR):
            raise EngineError("INVALID_PARAMETER", "The selected analysis region must be at least 150 ms long.")
        if r1 - r0 > int(MAX_ANALYSIS_S * TARGET_SR):
            raise EngineError("INVALID_PARAMETER", "The selected analysis region must be 30 seconds or shorter.")
        seg_db = _frame_rms_db(x[r0:r1], 1024, 512)
        if np.max(seg_db) < TRIM_THRESHOLD_DBFS:
            raise EngineError(
                "SIGNAL_TOO_QUIET",
                "The selected region is almost silent. Move the selection onto the sounding part of the recording.",
            )
        mode, onset = "manual", t0
    else:
        r0, r1, mode, onset = _select_region(x, t0, t1, min_region_samples)

    return Ingested(
        samples=x,
        sample_rate=TARGET_SR,
        source_sample_rate=sr,
        source_channels=int(audio.shape[1]),
        duration_s=float(duration_s),
        trim_start=t0,
        trim_end=t1,
        region_start=r0,
        region_end=r1,
        region_mode=mode,
        onset=onset,
    )
