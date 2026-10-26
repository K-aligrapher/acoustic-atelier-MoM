"""FastAPI application: POST /api/analyze, POST /api/export, GET /api/health.

Stateless. Uploaded audio is processed in memory and discarded after the
response; nothing is written to disk and audio content is never logged.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from engine import AnalysisParams, EngineError, __version__, analyze
from engine.export import safe_name, write_kbm, write_scl
from engine.ingest import MAX_FILE_BYTES

from .schemas import ErrorResponse, ExportRequest, ExportResponse, HealthResponse

ANALYSIS_TIMEOUT_S = float(os.environ.get("ANALYSIS_TIMEOUT_S", "30"))
RATE_LIMIT_PER_MIN = int(os.environ.get("RATE_LIMIT_PER_MIN", "20"))

log = logging.getLogger("acoustic.api")
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(h)
    log.setLevel(logging.INFO)


def _log(event: str, **fields) -> None:
    log.info(json.dumps({"event": event, **fields}, default=str))


app = FastAPI(
    title="Acoustic Scale Generator API",
    version=__version__,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["GET", "POST"], allow_headers=["*"])


# --- rate limiting (per instance, sliding 60 s window) -----------------------
_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MIN:
        return True
    q.append(now)
    if len(_hits) > 10000:  # bound memory
        _hits.clear()
    return False


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message})


_STATUS = {
    "FILE_TOO_LARGE": 413,
    "FILE_TOO_LONG": 422,
    "FILE_TOO_SHORT": 422,
    "UNSUPPORTED_FORMAT": 415,
    "SIGNAL_TOO_QUIET": 422,
    "NO_PARTIALS_FOUND": 422,
    "INVALID_PARAMETER": 400,
}


@app.exception_handler(RequestValidationError)
async def _validation_handler(_request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query"))
    msg = first.get("msg", "Invalid request.")
    return _error(400, "INVALID_PARAMETER", f"{field}: {msg}" if field else msg)


def _clean(obj):
    """Replace NaN/inf with None so the JSON is standards-compliant."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


@app.get("/api/health", response_model=HealthResponse)
async def health():
    return {"status": "ok", "version": __version__}


@app.post(
    "/api/analyze",
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 415: {"model": ErrorResponse},
               422: {"model": ErrorResponse}, 429: {"model": ErrorResponse}, 504: {"model": ErrorResponse}},
)
async def analyze_endpoint(
    request: Request,
    file: UploadFile = File(...),
    notes: int = Form(7),
    period: str = Form("octave"),
    period_cents: float = Form(1200.0),
    max_partials: int = Form(12),
    min_spacing_cents: float = Form(40.0),
    peak_threshold_db: float = Form(-60.0),
    window_length: int = Form(8192),
    region_start_ms: Optional[int] = Form(None),
    region_end_ms: Optional[int] = Form(None),
    display_name: Optional[str] = Form(None),
):
    started = time.perf_counter()
    ip = _client_ip(request)
    if _rate_limited(ip):
        return _error(429, "RATE_LIMITED", "Too many analyses in a short time. Please wait a minute and try again.")

    data = await file.read(MAX_FILE_BYTES + 1)
    await file.close()
    if len(data) > MAX_FILE_BYTES:
        return _error(413, "FILE_TOO_LARGE", "That file is larger than 20 MB. Trim it to a single note or strike and try again.")

    # Never trust the client filename for anything but display.
    filename = os.path.basename((display_name or file.filename or "sound").replace("\\", "/"))[:120] or "sound"

    params = AnalysisParams(
        notes=notes,
        period=period,
        period_cents=period_cents,
        max_partials=max_partials,
        min_spacing_cents=min_spacing_cents,
        peak_threshold_db=peak_threshold_db,
        window_length=window_length,
        region_start_ms=region_start_ms,
        region_end_ms=region_end_ms,
    )

    try:
        result = await asyncio.wait_for(run_in_threadpool(analyze, data, params, filename), ANALYSIS_TIMEOUT_S)
    except EngineError as e:
        _log("analyze_rejected", code=e.code, bytes=len(data), ms=round((time.perf_counter() - started) * 1000, 1))
        return _error(_STATUS.get(e.code, 400), e.code, e.message)
    except asyncio.TimeoutError:
        _log("analyze_timeout", bytes=len(data))
        return _error(504, "ANALYSIS_TIMEOUT", "The analysis took too long. Try a shorter sample or fewer partials.")
    except Exception as e:  # noqa: BLE001
        _log("analyze_error", error=type(e).__name__, bytes=len(data))
        return _error(500, "ANALYSIS_FAILED", "Something went wrong while analysing the sound. Please try another file.")
    finally:
        del data

    _log(
        "analyze_ok",
        ms=round((time.perf_counter() - started) * 1000, 1),
        classification=result["meta"]["classification"],
        partials=len(result["partials"]),
        notes=params.notes,
        period=params.period,
    )
    return JSONResponse(_clean(result))


@app.post("/api/export", response_model=ExportResponse, responses={400: {"model": ErrorResponse}})
async def export_endpoint(req: ExportRequest):
    cents = req.cents
    if any(not math.isfinite(c) for c in cents):
        return _error(400, "INVALID_PARAMETER", "All pitches must be finite numbers.")
    if any(b <= a for a, b in zip([0.0] + cents[:-1], cents)):
        return _error(400, "INVALID_PARAMETER", "Pitches must be strictly ascending and above the unison.")
    base = safe_name(req.name)
    description = req.description or f"Timbre-derived scale: {req.name}"
    return {
        "filename_base": base,
        "scl": write_scl(base, description, cents),
        "kbm": write_kbm(base, len(cents), root_note=req.root_note, reference_freq=req.reference_freq),
    }
