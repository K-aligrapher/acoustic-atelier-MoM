"""Acoustic Scale Generator engine.

A standalone package (no web dependencies) that turns a short audio sample into
a timbre-matched microtonal scale:

    ingest      -> load, mono, normalise, trim, pick an analysis region
    partials    -> averaged FFT spectrum, peak picking, parabolic refinement
    dissonance  -> Plomp-Levelt / Sethares roughness model and curve
    optimize    -> candidate pruning + scipy refinement of scale degrees
    export      -> .scl / .kbm / .json writers

See `engine.pipeline.analyze` for the full pipeline.
"""

from .errors import EngineError
from .pipeline import AnalysisParams, analyze

__all__ = ["EngineError", "AnalysisParams", "analyze"]
__version__ = "1.0.0"
