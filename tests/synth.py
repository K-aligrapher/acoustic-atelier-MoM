"""Synthetic test tones (deterministic)."""
from __future__ import annotations

import io

import numpy as np
import soundfile as sf

SR = 44100


def tone(partials, dur=2.0, sr=SR, decay=None, noise=0.0, seed=0):
    t = np.arange(int(dur * sr)) / sr
    x = np.zeros_like(t)
    for i, (f, a) in enumerate(partials):
        env = np.exp(-t * decay[i]) if decay is not None else 1.0
        x += a * env * np.sin(2 * np.pi * f * t)
    if noise:
        x += noise * np.random.default_rng(seed).standard_normal(len(t))
    # 5 ms fade in/out
    n = int(0.005 * sr)
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x / np.max(np.abs(x)) * 0.8


def harmonic(f0=220.0, n=6, **kw):
    return tone([(f0 * k, 1.0 / k) for k in range(1, n + 1)], **kw)


def bell(f0=440.0, **kw):
    ratios = [0.5, 1.0, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 4.166]
    amps = [0.6, 0.8, 0.7, 0.4, 1.0, 0.5, 0.35, 0.3, 0.2]
    decay = np.array([0.6, 1.0, 1.4, 1.8, 1.2, 2.5, 3.0, 3.5, 4.5])
    return tone([(f0 * r, a) for r, a in zip(ratios, amps)], decay=decay, **kw)


def stretched(f0=200.0, n=6, stretch=2.1, **kw):
    return tone([(f0 * stretch ** np.log2(k), 1.0 / k) for k in range(1, n + 1)], **kw)


def wav_bytes(x, sr=SR, fmt="WAV", subtype="PCM_16"):
    buf = io.BytesIO()
    sf.write(buf, x, sr, format=fmt, subtype=subtype)
    return buf.getvalue()
