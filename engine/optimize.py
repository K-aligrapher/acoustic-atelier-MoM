"""Scale generation: seed from curve minima, enforce spacing, refine (FR-20 .. FR-27)."""

from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction

import numpy as np
from scipy.optimize import minimize

from .dissonance import Minimum, tone_set_roughness, total_roughness_and_grad

NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
REFINE_WINDOW_CENTS = 25.0


@dataclass
class Degree:
    index: int
    cents: float
    seed_cents: float | None
    source: str  # "root", "minimum", "fill", "period"
    nearest_12tet_semitones: int = 0
    nearest_12tet: str = ""
    deviation_cents: float = 0.0
    nearest_ratio: str | None = None
    ratio_error_cents: float | None = None
    roughness: float = 0.0
    curve_roughness: float = 0.0


@dataclass
class ScaleResult:
    period_cents: float
    degrees: list[Degree]
    total_roughness: float
    twelve_tet_cents: list[float]
    twelve_tet_total_roughness: float
    roughness_vs_12tet: float | None
    effective_min_spacing: float
    optimizer: str
    warnings: list[str] = field(default_factory=list)


def nearest_12tet(cents: float) -> tuple[int, str, float]:
    n = int(round(cents / 100.0))
    name = NOTE_NAMES[n % 12]
    octave = n // 12
    label = name if octave == 0 else f"{name}{'′' * octave}" if octave > 0 else name
    return n, label, cents - 100.0 * n


_RATIOS: list[tuple[float, Fraction]] | None = None


def _ratio_table(max_den: int = 16, max_num: int = 64) -> list[tuple[float, Fraction]]:
    global _RATIOS
    if _RATIOS is None:
        seen = {}
        for q in range(1, max_den + 1):
            for p in range(q, max_num + 1):
                fr = Fraction(p, q)
                if fr.denominator == q and fr not in seen:
                    seen[fr] = 1200 * np.log2(p / q)
        _RATIOS = sorted(((c, fr) for fr, c in seen.items()), key=lambda t: t[0])
    return _RATIOS


def nearest_simple_ratio(cents: float, tolerance: float = 15.0) -> tuple[str | None, float | None]:
    """Simplest ratio (lowest Tenney height) within `tolerance` cents."""
    best = None
    for c, fr in _ratio_table():
        err = cents - c
        if abs(err) <= tolerance:
            h = np.log2(fr.numerator * fr.denominator)
            key = (h, abs(err))
            if best is None or key < best[0]:
                best = (key, fr, err)
    if best is None:
        return None, None
    _, fr, err = best
    return f"{fr.numerator}/{fr.denominator}", float(err)


def twelve_tet_reference(tones: list[float]) -> tuple[list[float], bool]:
    """Map each degree to its own 12-TET semitone, keeping order (minimum total deviation).

    Returns (cents, distinct). When there are more degrees than semitones in the
    period the degrees are simply rounded (duplicates possible) and distinct=False.
    """
    period12 = 100 * max(1, round(tones[-1] / 100))
    interior = tones[1:-1]
    slots = period12 // 100 - 1  # semitones strictly inside the period
    m = len(interior)
    if m > slots:
        rounded = [0.0] + [100.0 * round(c / 100.0) for c in interior] + [float(period12)]
        return rounded, False
    if m == 0:
        return [0.0, float(period12)], True
    # DP over (note i, slot s): best cost with note i at slot s, slots strictly increasing.
    INF = float("inf")
    cost = [[INF] * (slots + 1) for _ in range(m)]
    back = [[-1] * (slots + 1) for _ in range(m)]
    for s_ in range(1, slots + 1):
        cost[0][s_] = abs(interior[0] - 100 * s_)
    for i in range(1, m):
        best, arg = INF, -1
        for s_ in range(1, slots + 1):
            if cost[i - 1][s_ - 1] < best:
                best, arg = cost[i - 1][s_ - 1], s_ - 1
            if best < INF:
                cost[i][s_] = best + abs(interior[i] - 100 * s_)
                back[i][s_] = arg
    s_ = min(range(1, slots + 1), key=lambda k: cost[m - 1][k])
    chosen = []
    for i in range(m - 1, -1, -1):
        chosen.append(s_)
        s_ = back[i][s_]
    chosen.reverse()
    return [0.0] + [100.0 * k for k in chosen] + [float(period12)], True


def _spacing_ok(c: float, chosen: list[float], spacing: float) -> bool:
    return all(abs(c - x) >= spacing - 1e-9 for x in chosen)


def generate_scale(
    freqs,
    amps,
    curve_cents: np.ndarray,
    curve_R: np.ndarray,
    minima: list[Minimum],
    notes: int,
    period_cents: float,
    min_spacing: float,
) -> ScaleResult:
    warnings: list[str] = []
    k_interior = notes - 1

    # Relax spacing if it cannot possibly fit (K gaps must fit in one period).
    spacing = float(min_spacing)
    max_spacing = period_cents / notes
    if spacing > max_spacing:
        spacing = float(np.floor(max_spacing * 0.98 * 100) / 100)
        warnings.append(
            f"Minimum spacing was reduced from {min_spacing:g} to {spacing:g} cents so that {notes} notes fit in the period."
        )

    fixed = [0.0, period_cents]
    chosen: list[float] = []
    sources: dict[float, str] = {}

    # 1. Seed from minima, strongest prominence first (FR-21).
    for m in minima:
        if len(chosen) >= k_interior:
            break
        if m.cents <= 0 or m.cents >= period_cents:
            continue
        if _spacing_ok(m.cents, fixed + chosen, spacing):
            chosen.append(m.cents)
            sources[m.cents] = "minimum"

    # 2. Fill remaining slots at the lowest-roughness positions (FR-23).
    if len(chosen) < k_interior:
        order = np.argsort(curve_R, kind="stable")
        for k in order:
            c = float(curve_cents[k])
            if c <= 0 or c >= period_cents:
                continue
            if _spacing_ok(c, fixed + chosen, spacing):
                chosen.append(c)
                sources[c] = "fill"
                if len(chosen) >= k_interior:
                    break
        n_fill = sum(1 for v in sources.values() if v == "fill")
        if n_fill:
            warnings.append(
                f"Only {k_interior + 1 - n_fill} notes came from curve minima; {n_fill} were placed at the "
                "smoothest remaining positions."
            )
    if len(chosen) < k_interior:
        # Last resort (should be rare): even division of the remaining gaps.
        warnings.append("Not enough room for all requested notes; some were spaced evenly.")
        while len(chosen) < k_interior:
            pts = sorted(fixed + chosen)
            gaps = np.diff(pts)
            g = int(np.argmax(gaps))
            c = pts[g] + gaps[g] / 2
            chosen.append(float(c))
            sources[float(c)] = "fill"
        spacing = float(np.min(np.diff(sorted(fixed + chosen))))

    seeds = sorted(chosen)

    # 3. Refine with L-BFGS-B (FR-22). Deterministic: no random steps.
    f = np.asarray(freqs, float)
    a = np.asarray(amps, float)
    lam = 1e4 * float(np.max(curve_R) or 1.0) / max(spacing, 1.0) ** 2

    def objective(p):
        tones = np.concatenate([[0.0], p, [period_cents]])
        J, g = total_roughness_and_grad(tones, f, a)
        gp = g[1:-1].copy()
        order = np.argsort(tones, kind="stable")
        st = tones[order]
        gaps = np.diff(st)
        viol = np.maximum(0.0, spacing - gaps)
        J += lam * float(np.sum(viol**2))
        # d/d st[k+1] of viol_k^2 = -2 viol_k ; d/d st[k] = +2 viol_k
        gs = np.zeros(len(st))
        gs[1:] += -2 * lam * viol
        gs[:-1] += 2 * lam * viol
        g_full = np.zeros(len(tones))
        g_full[order] = gs
        gp += g_full[1:-1]
        return J, gp

    x0 = np.array(seeds, float)
    bounds = [
        (max(0.5, s - REFINE_WINDOW_CENTS), min(period_cents - 0.5, s + REFINE_WINDOW_CENTS)) for s in seeds
    ]
    method = "seed"
    final = x0
    if k_interior > 0:
        J0, _ = objective(x0)
        try:
            res = minimize(objective, x0, jac=True, method="L-BFGS-B", bounds=bounds, options={"maxiter": 200})
            if res.success or res.status in (1, 2):
                J1, _ = objective(res.x)
                gaps = np.diff(np.sort(np.concatenate([[0.0], res.x, [period_cents]])))
                if np.all(np.isfinite(res.x)) and J1 <= J0 and np.min(gaps) >= spacing - 0.01:
                    final = res.x
                    method = "L-BFGS-B"
        except Exception:  # noqa: BLE001 - fall back to seeds (PRD 6.4)
            warnings.append("The optimiser did not converge; seeded positions were used.")

    order = np.argsort(final, kind="stable")
    interior = [float(final[i]) for i in order]
    interior_seeds = [seeds[i] for i in order]
    tones = [0.0] + interior + [period_cents]

    # 4. Metadata (FR-26).
    M = tone_set_roughness(tones, f, a)
    contrib = M.sum(axis=1)
    curve_lookup = lambda c: float(np.interp(c, curve_cents, curve_R))  # noqa: E731

    degrees: list[Degree] = []
    for i, c in enumerate(tones):
        if i == 0:
            src, seed = "root", 0.0
        elif i == len(tones) - 1:
            src, seed = "period", period_cents
        else:
            seed = interior_seeds[i - 1]
            src = sources.get(seed, "fill")
        n, name, dev = nearest_12tet(c)
        ratio, rerr = nearest_simple_ratio(c)
        degrees.append(
            Degree(
                index=i,
                cents=float(c),
                seed_cents=float(seed),
                source=src,
                nearest_12tet_semitones=n,
                nearest_12tet=name,
                deviation_cents=float(dev),
                nearest_ratio=ratio,
                ratio_error_cents=rerr,
                roughness=float(contrib[i]),
                curve_roughness=curve_lookup(c),
            )
        )

    total = float(M[np.triu_indices(len(tones), 1)].sum())

    # 5. Comparison: the same scale with every degree rounded to 12-TET (FR-27).
    tet, distinct = twelve_tet_reference(tones)
    M12 = tone_set_roughness(tet, f, a)
    total12 = float(M12[np.triu_indices(len(tet), 1)].sum())
    ratio_vs = total / total12 if distinct and total12 > 1e-12 else None
    if not distinct:
        warnings.append("12-TET has too few notes per period for a one-to-one comparison with this scale.")

    return ScaleResult(
        period_cents=float(period_cents),
        degrees=degrees,
        total_roughness=total,
        twelve_tet_cents=tet,
        twelve_tet_total_roughness=total12,
        roughness_vs_12tet=ratio_vs,
        effective_min_spacing=spacing,
        optimizer=method,
        warnings=warnings,
    )
