"""Command-line interface.

    python -m engine.cli input.wav --notes 7 --out ./out
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .errors import EngineError
from .export import write_json
from .pipeline import AnalysisParams, analyze


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Derive a timbre-matched scale from an audio sample.")
    ap.add_argument("input", type=Path)
    ap.add_argument("--notes", type=int, default=7)
    ap.add_argument("--period", choices=["octave", "stretched", "auto"], default="octave")
    ap.add_argument("--period-cents", type=float, default=1200.0)
    ap.add_argument("--max-partials", type=int, default=12)
    ap.add_argument("--min-spacing", type=float, default=40.0)
    ap.add_argument("--peak-threshold", type=float, default=-60.0)
    ap.add_argument("--window", type=int, default=8192)
    ap.add_argument("--out", type=Path, default=None, help="directory for .scl/.kbm/.json")
    args = ap.parse_args(argv)

    params = AnalysisParams(
        notes=args.notes,
        period=args.period,
        period_cents=args.period_cents,
        max_partials=args.max_partials,
        min_spacing_cents=args.min_spacing,
        peak_threshold_db=args.peak_threshold,
        window_length=args.window,
    )
    try:
        result = analyze(args.input.read_bytes(), params, filename=args.input.name)
    except EngineError as e:
        print(json.dumps(e.to_dict()), file=sys.stderr)
        return 2

    meta, scale = result["meta"], result["scale"]
    print(f"{args.input.name}: {meta['classification']}, {len(result['partials'])} partials")
    for d in scale["degrees"]:
        ratio = d["nearest_ratio"] or "-"
        print(f"  {d['index']:>2}  {d['cents']:10.3f}c  {d['nearest_12tet']:<4} {d['deviation_cents']:+7.2f}  {ratio}")
    if scale["roughness_vs_12tet"] is not None:
        print(f"  roughness vs 12-TET: {scale['roughness_vs_12tet']:.3f}")
    for w in result["warnings"]:
        print(f"  note: {w}")

    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        name = scale["name"]
        (args.out / f"{name}.scl").write_text(result["exports"]["scl"], encoding="ascii")
        (args.out / f"{name}.kbm").write_text(result["exports"]["kbm"], encoding="ascii")
        (args.out / f"{name}.json").write_text(write_json(result), encoding="utf-8")
        print(f"wrote {name}.scl / .kbm / .json to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
