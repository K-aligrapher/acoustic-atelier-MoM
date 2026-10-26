# Acoustic Atelier — Acoustic Scale Generator

Upload a bell, gong or any resonant sound. The app extracts its partials, computes a
Plomp–Levelt/Sethares dissonance curve, and builds a microtonal scale with low sensory
roughness for that timbre. Play it on a browser keyboard using your own sample, compare
with 12-TET, and export `.scl`, `.kbm` and `.json`. See `PRD_Acoustic_Scale_Generator.md`.

## Layout

```
engine/   Python analysis engine (no web deps): ingest, partials, dissonance, optimize, export, cli
server/   FastAPI app: POST /api/analyze, POST /api/export, GET /api/health
api/      Vercel entrypoint (index.py imports server.main:app)
web/      React + Vite + TypeScript frontend
tests/    pytest suite with synthetic fixtures
```

## Run locally

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m uvicorn server.main:app --port 8000

cd web
npm install
npm run dev          # http://localhost:5173, proxies /api to :8000
```

Tests: `.venv/Scripts/python -m pytest -q`

CLI: `python -m engine.cli bell.wav --notes 7 --period auto --out ./out`

## Deploy to Vercel

The repo is a single Vercel project: the static frontend is built from `web/` and the
FastAPI app runs as a Python serverless function (`api/index.py`). `vercel.json` rewrites
`/api/*` to it.

```bash
vercel            # preview deployment
vercel --prod     # production
```

Or import the Git repository in the Vercel dashboard. No settings are needed beyond
`vercel.json`; leave the root directory as the repository root.

Notes:

- Vercel limits request bodies to 4.5 MB. The browser therefore decodes the upload and
  sends a mono 16-bit WAV of at most 30 s (≈2.6 MB). The API itself accepts files up to 20 MB
  when self-hosted.
- Optional environment variables: `ANALYSIS_TIMEOUT_S` (default 30), `RATE_LIMIT_PER_MIN`
  (default 20, per function instance), `CORS_ORIGINS` (comma-separated, only needed if the
  frontend is hosted elsewhere), and `VITE_API_BASE` at build time for the same case.

## Privacy

Audio is processed in memory and discarded after the response. Nothing is stored or logged.

## References

W. Sethares, *Tuning, Timbre, Spectrum, Scale* (2005); R. Plomp & W. Levelt, “Tonal
Consonance and Critical Bandwidth”, JASA (1965); Scala `.scl`/`.kbm` specifications.
