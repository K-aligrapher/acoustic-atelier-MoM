"""Sensory roughness model and dissonance curve (PRD FR-15 .. FR-19).

Plomp-Levelt curve as parameterised by Sethares:

    d(f1, f2, a1, a2) = min(a1, a2) * (exp(-b1 * s * |f2 - f1|) - exp(-b2 * s * |f2 - f1|))
    s = 0.24 / (0.0207 * f_min + 18.96),  b1 = 3.5,  b2 = 5.75
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import find_peaks

B1 = 3.5
B2 = 5.75
S_NUM = 0.24
S_A = 0.0207
S_B = 18.96
LN2_1200 = np.log(2) / 1200


def pair_roughness(f1, f2, a1, a2):
    """Element-wise roughness between partials (broadcasting)."""
    fmin = np.minimum(f1, f2)
    s = S_NUM / (S_A * fmin + S_B)
    x = s * np.abs(f2 - f1)
    return np.minimum(a1, a2) * (np.exp(-B1 * x) - np.exp(-B2 * x))


def self_roughness(freqs, amps) -> float:
    """Roughness of a spectrum against itself (all distinct pairs)."""
    f = np.asarray(freqs, float)
    a = np.asarray(amps, float)
    i, j = np.triu_indices(len(f), 1)
    return float(np.sum(pair_roughness(f[i], f[j], a[i], a[j])))


def dissonance_curve(freqs, amps, max_cents: float, step_cents: float = 1.0):
    """Total roughness of the sound plus a copy transposed by each interval.

    R(alpha) sums pairwise roughness over the union of the partials and the
    partials scaled by alpha = 2^(c/1200), for c in [0, max_cents].
    """
    f = np.asarray(freqs, float)
    a = np.asarray(amps, float)
    n = len(f)
    cents = np.arange(0.0, max_cents + 1e-9, step_cents)
    alpha = 2.0 ** (cents / 1200.0)

    # Union spectrum for every alpha: shape (n_alpha, 2n).
    F = np.concatenate([np.broadcast_to(f, (len(alpha), n)), alpha[:, None] * f[None, :]], axis=1)
    A = np.concatenate([a, a])
    i, j = np.triu_indices(2 * n, 1)
    R = np.empty(len(alpha))
    # Chunk over alpha to bound memory for large partial counts.
    chunk = 256
    for c0 in range(0, len(alpha), chunk):
        Fc = F[c0 : c0 + chunk]
        R[c0 : c0 + chunk] = pair_roughness(Fc[:, i], Fc[:, j], A[i], A[j]).sum(axis=1)
    return cents, R


@dataclass
class Minimum:
    cents: float
    roughness: float
    prominence: float


def find_minima(cents: np.ndarray, R: np.ndarray) -> list[Minimum]:
    """Local minima of the curve ranked by prominence (FR-17)."""
    span = float(np.max(R) - np.min(R)) or 1.0
    idx, props = find_peaks(-R, prominence=span * 1e-4)
    out = [
        Minimum(cents=float(cents[k]), roughness=float(R[k]), prominence=float(p))
        for k, p in zip(idx, props["prominences"])
    ]
    out.sort(key=lambda m: m.prominence, reverse=True)
    return out


def tone_set_roughness(tones_cents, freqs, amps) -> np.ndarray:
    """Cross roughness for every pair of scale tones.

    Returns an array (T, T) where entry [i, j] is the roughness between the
    sound transposed to tone i and the sound transposed to tone j.
    """
    t = np.asarray(tones_cents, float)
    f = np.asarray(freqs, float)
    a = np.asarray(amps, float)
    r = 2.0 ** (t / 1200.0)
    T = len(t)
    I, J = np.triu_indices(T, 1)
    f1 = (r[I][:, None, None] * f[None, :, None])
    f2 = (r[J][:, None, None] * f[None, None, :])
    d = pair_roughness(f1, f2, a[None, :, None], a[None, None, :]).sum(axis=(1, 2))
    M = np.zeros((T, T))
    M[I, J] = d
    M[J, I] = d
    return M


def total_roughness_and_grad(tones_cents, freqs, amps):
    """Sum of pairwise cross roughness over all tones and its gradient (d/d cents)."""
    t = np.asarray(tones_cents, float)
    f = np.asarray(freqs, float)
    a = np.asarray(amps, float)
    r = 2.0 ** (t / 1200.0)
    T = len(t)
    I, J = np.triu_indices(T, 1)

    f1 = r[I][:, None, None] * f[None, :, None]  # (P, n, 1)
    f2 = r[J][:, None, None] * f[None, None, :]  # (P, 1, n)
    f1, f2 = np.broadcast_arrays(f1, f2)
    A = np.minimum(a[:, None], a[None, :])[None, :, :]

    lower1 = f1 < f2
    fmin = np.where(lower1, f1, f2)
    denom = S_A * fmin + S_B
    s = S_NUM / denom
    diff = f1 - f2
    delta = np.abs(diff)
    x = s * delta
    e1 = np.exp(-B1 * x)
    e2 = np.exp(-B2 * x)
    total = float(np.sum(A * (e1 - e2)))

    dd_dx = A * (-B1 * e1 + B2 * e2)
    ds_dfmin = -S_NUM * S_A / denom**2
    sign = np.sign(diff)
    # d f1 / d t_i = f1 * ln2/1200 ; d f2 / d t_j = f2 * ln2/1200
    df1 = f1 * LN2_1200
    df2 = f2 * LN2_1200
    dx_dti = ds_dfmin * np.where(lower1, df1, 0.0) * delta + s * sign * df1
    dx_dtj = ds_dfmin * np.where(lower1, 0.0, df2) * delta - s * sign * df2

    gi = np.sum(dd_dx * dx_dti, axis=(1, 2))
    gj = np.sum(dd_dx * dx_dtj, axis=(1, 2))
    grad = np.zeros(T)
    np.add.at(grad, I, gi)
    np.add.at(grad, J, gj)
    return total, grad
