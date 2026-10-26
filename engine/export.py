"""Scala .scl / .kbm and JSON writers (PRD FR-28 .. FR-33, 6.6)."""

from __future__ import annotations

import json
import re
from typing import Iterable

_SAFE = re.compile(r"[^A-Za-z0-9 _\-.()]+")


def safe_name(name: str, fallback: str = "scale") -> str:
    """A filename-safe scale name (no path separators, bounded length)."""
    name = (name or "").replace("/", " ").replace("\\", " ")
    name = _SAFE.sub("", name).strip(" .")
    name = re.sub(r"\s+", "_", name)
    return name[:64] or fallback


def _ascii(text: str) -> str:
    # Scala files are plain ASCII text.
    return text.encode("ascii", "replace").decode("ascii").replace("\n", " ").replace("\r", " ")


def write_scl(name: str, description: str, cents: Iterable[float]) -> str:
    """`cents` are the scale pitches after the unison; the last must be the period."""
    pitches = [float(c) for c in cents]
    lines = [f"! {safe_name(name)}.scl", _ascii(description), f" {len(pitches)}"]
    lines += [f" {c:.5f}" for c in pitches]
    return "\n".join(lines) + "\n"


def write_kbm(
    name: str,
    scale_size: int,
    root_note: int = 60,
    reference_note: int | None = None,
    reference_freq: float = 261.6256,
) -> str:
    """Linear keyboard mapping: consecutive keys step through consecutive degrees."""
    ref_note = root_note if reference_note is None else reference_note
    lines = [
        f"! {safe_name(name)}.kbm",
        f"! Keyboard mapping for {_ascii(name)}",
        "! Map size",
        str(scale_size),
        "! First MIDI note number to retune",
        "0",
        "! Last MIDI note number to retune",
        "127",
        "! Middle note where the first entry of the mapping is mapped to",
        str(root_note),
        "! Reference note for which frequency is given",
        str(ref_note),
        "! Frequency to tune the above note to",
        f"{reference_freq:.6f}",
        "! Scale degree to consider as formal octave",
        str(scale_size),
        "! Mapping",
    ]
    lines += [str(i) for i in range(scale_size)]
    return "\n".join(lines) + "\n"


def write_json(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False)
