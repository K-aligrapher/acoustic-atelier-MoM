# PRD: Acoustic-Driven Scale Generator

**Version:** 1.0 | **Status:** Ready for build | **Last updated:** 2026-10-18

---

## 1. Overview

### 1.1 Summary
A web app that takes a short audio sample, extracts its partials (overtones) with an FFT, computes a sensory dissonance curve from them, and derives a microtonal scale whose intervals minimize roughness for that specific timbre. Users can play the scale instantly on a browser grid, or export it as `.scl` / `.kbm` files for DAWs and synths.

### 1.2 Problem
- 12-tone equal temperament (12-TET) assumes harmonic timbres. Inharmonic sounds (bells, gongs, metal percussion, prepared instruments) clash in 12-TET.
- Existing timbre-matched tuning tools (Sethares' Matlab code, Scala, xenharmonic utilities) need expert knowledge, and no single tool goes from audio file to playable instrument.

### 1.3 Vision
Drag in a sound, get an instrument that sounds smooth with itself, and take the tuning file into your DAW.

### 1.4 Positioning note
The product minimizes **sensory roughness**, not "perfect consonance". Consonance is partly cultural. UI copy and docs should say "smooth" or "low-roughness".

---

## 2. Goals and Non-Goals

### 2.1 Goals
1. Convert an uploaded audio file into a valid, usable scale with no manual tuning.
2. Provide a playable browser instrument using the same sample, pitched to the scale.
3. Export standard tuning files that load correctly in common synths and DAWs.
4. Give advanced users control over analysis and optimization parameters.
5. Be transparent: show the spectrum, the dissonance curve, and why each note was chosen.

### 2.2 Non-Goals (v1)
- Polyphonic or full-mix analysis (chord or stem separation).
- Pitch tracking of melodies.
- Native mobile apps or a VST/AU plugin.
- User accounts, payments, or a public scale marketplace.
- Real-time analysis of a live microphone stream.

---

## 3. Users and Use Cases

### 3.1 Personas
| Persona | Needs | Success looks like |
|---|---|---|
| **Beginner / curious player** | Zero setup, instant sound | Drops a file, plays a pleasant grid within 30 seconds |
| **Sound designer / producer** | Tuning files for Ableton, Logic, Surge XT, Vital, Pianoteq | Exports `.scl` + `.kbm`, loads without edits |
| **Xenharmonic composer / researcher** | Control over parameters, reproducibility, verifiable math | Adjusts partial count, period, note count; sees the curve; results are deterministic |
| **Educator** | Demonstrate timbre-tuning relationship | Uses the curve and spectrum views in class |

### 3.2 Core user stories
1. As a beginner, I upload a bell sample and get a playable 7-note instrument.
2. As a producer, I download `.scl` and `.kbm` and load them in my synth.
3. As a researcher, I set the number of notes, the period, and the partial count, and re-run.
4. As a user, I see why a note was chosen (its position on the dissonance curve).
5. As a user, I get a clear error when my file is unsuitable (too short, too noisy, silent).

---

## 4. Scope

### 4.1 MVP (v1.0)
- Upload (drag-and-drop) of WAV, MP3, FLAC, OGG, up to 20 MB and 30 seconds of analyzed audio.
- Analysis: partials extraction, dissonance curve, scale optimization.
- Visualizations: spectrum with detected peaks, dissonance curve with chosen notes marked.
- Playable isomorphic grid (sample-based playback) with mouse, touch, and computer-keyboard input.
- Export: `.scl`, `.kbm`, and `.json` (partials, curve, scale).
- Parameters: number of notes, period type, max partials, min spacing (advanced panel).
- Presets: "Harmonic reference" (sine harmonic series) for comparison, plus 12-TET toggle.

### 4.2 v1.1 and later
- Additive resynthesis mode from extracted partials.
- Web MIDI input and MPE output.
- `.tun` and Ableton `.ascl` export.
- Save and share scales via permalink.
- Batch analysis of multiple samples to build one combined scale.
- Browser-side engine (WASM) to remove server dependency.

---

## 5. Functional Requirements

Priority: **P0** = required for MVP, **P1** = should have, **P2** = nice to have.

### 5.1 Audio ingest
| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Accept WAV, MP3, FLAC, OGG via drag-and-drop and file picker | P0 |
| FR-2 | Reject files over 20 MB or longer than 60 seconds with a clear message | P0 |
| FR-3 | Convert to mono, normalize peak amplitude, resample to 44.1 kHz internally | P0 |
| FR-4 | Detect and trim leading/trailing silence (threshold -50 dBFS) | P0 |
| FR-5 | Auto-select analysis region: for percussive sounds the 100-500 ms after the onset; for sustained sounds the stable middle section | P0 |
| FR-6 | Let the user override the analysis region by dragging a selection on the waveform | P1 |
| FR-7 | Reject audio that is silent, shorter than 150 ms of usable signal, or has an estimated SNR below a set threshold, with an actionable message | P0 |

### 5.2 Partial extraction
| ID | Requirement | Priority |
|---|---|---|
| FR-8 | Compute a Welch-style averaged spectrum: Blackman-Harris window, zero-padding to at least 8x, 50% overlap | P0 |
| FR-9 | Detect peaks above an adaptive amplitude threshold (default -60 dB relative to the strongest peak) | P0 |
| FR-10 | Refine peak frequency and amplitude with parabolic interpolation | P0 |
| FR-11 | Keep the top N partials by amplitude (default 12, range 4-24) | P0 |
| FR-12 | Ignore partials below 20 Hz and above 16 kHz | P0 |
| FR-13 | Estimate the fundamental or "pseudo-fundamental" when one exists; flag the sound as harmonic, near-harmonic, or inharmonic (using deviation from integer ratios) | P1 |
| FR-14 | Return the partials as a list of (frequency Hz, amplitude linear, amplitude dB) | P0 |

### 5.3 Dissonance curve
| ID | Requirement | Priority |
|---|---|---|
| FR-15 | Implement the Plomp-Levelt model as parameterized by Sethares: `d = min(a1,a2) * (exp(-b1*s*|f2-f1|) - exp(-b2*s*|f2-f1|))`, `s = 0.24 / (0.0207*f_min + 18.96)`, `b1 = 3.5`, `b2 = 5.75` | P0 |
| FR-16 | Compute total roughness of the sound against a transposed copy of itself, for interval ratio α swept from 1.0 to the period (default 2.0) at 1-cent resolution | P0 |
| FR-17 | Find local minima of the curve and rank them by depth (prominence) | P0 |
| FR-18 | Allow a custom period: octave (2/1), stretched octave (user-set cents), or the sound's own detected period | P1 |
| FR-19 | Vectorize the computation (numpy); a 16-partial curve must compute in under 1 second | P0 |

### 5.4 Scale generation
| ID | Requirement | Priority |
|---|---|---|
| FR-20 | Accept target note count K (default 7, range 3-24) | P0 |
| FR-21 | Seed candidates from the curve minima; prune by prominence and enforce a minimum spacing (default 40 cents, range 15-100) | P0 |
| FR-22 | Refine selected pitches using a numerical optimizer (scipy) that minimizes total pairwise roughness across all scale tones plus a spacing penalty | P0 |
| FR-23 | If fewer than K minima exist, fill remaining slots at the lowest-roughness remaining positions subject to the spacing rule | P0 |
| FR-24 | Always include the unison (0 cents) and the period as the final degree | P0 |
| FR-25 | Output must be deterministic: same input and parameters give the same scale | P0 |
| FR-26 | Report per-note metadata: cents, nearest 12-TET note and deviation, roughness contribution, and nearest simple ratio | P1 |
| FR-27 | Report a summary score: scale roughness vs. 12-TET for the same K | P1 |

### 5.5 Export
| ID | Requirement | Priority |
|---|---|---|
| FR-28 | Export `.scl` per the Scala spec: `!` comment line, description line, note count, one pitch per line (cents with a decimal point, or ratios), final line is the period | P0 |
| FR-29 | Export `.kbm` with root key (default MIDI note 60), reference frequency (default 261.6256 Hz), and a linear mapping for the scale size | P0 |
| FR-30 | Export `.json` containing partials, curve data, chosen notes, and parameters | P0 |
| FR-31 | Cents values written with at least 5 decimal places | P0 |
| FR-32 | Export `.tun` (AnaMark) | P2 |
| FR-33 | Let the user rename the scale; default name derived from the filename | P1 |

### 5.6 Playback instrument
| ID | Requirement | Priority |
|---|---|---|
| FR-34 | Isomorphic grid where each pad is one scale degree; each row offset by a fixed number of degrees (default: one period per row, configurable) | P0 |
| FR-35 | Play the uploaded sample via Web Audio with `playbackRate` set to the pad's frequency ratio | P0 |
| FR-36 | Root note selectable; base frequency adjustable (default 261.63 Hz) | P0 |
| FR-37 | Polyphony of at least 8 simultaneous voices with a short release envelope to avoid clicks | P0 |
| FR-38 | Input via mouse, touch, and computer keyboard mapping | P0 |
| FR-39 | A/B toggle between the derived scale and 12-TET using the same sample | P1 |
| FR-40 | Sustain (loop) option for the sample with crossfaded loop points | P2 |
| FR-41 | Additive resynthesis voice from extracted partials | P1 (v1.1) |
| FR-42 | Web MIDI input mapped through the derived scale | P2 |

### 5.7 Visualization
| ID | Requirement | Priority |
|---|---|---|
| FR-43 | Waveform view with analysis-region selection | P1 |
| FR-44 | Spectrum plot (log frequency axis) with detected partials marked | P0 |
| FR-45 | Dissonance curve plot (x: cents, y: roughness) with chosen scale degrees as vertical markers | P0 |
| FR-46 | Hovering a scale degree highlights its position on the curve and shows its metadata | P1 |
| FR-47 | Plots are exportable as PNG | P2 |

### 5.8 Parameters panel (advanced)
| ID | Requirement | Priority |
|---|---|---|
| FR-49 | Controls: note count, period type and value, max partials, peak threshold, min spacing, analysis window length | P0 |
| FR-50 | "Re-generate" button re-runs analysis without re-uploading | P0 |
| FR-51 | "Reset to defaults" button | P0 |
| FR-52 | Inline help text for each parameter explaining the effect in plain language | P1 |

---

## 6. Technical Design

### 6.1 Architecture
```
[Browser UI]  --upload-->  [FastAPI backend]  -->  [Engine library]
     |                          |                        |
     |<--JSON (partials,        |                        +-- ingest
     |    curve, scale)---------|                        +-- partials (FFT)
     |                          |                        +-- dissonance
     +-- Web Audio playback     +-- .scl/.kbm/.json      +-- optimizer
         (uses local sample)        generation           +-- exporters
```

The engine is a standalone Python package with no web dependencies, so it can be unit-tested, run from the command line, and later ported or wrapped (WASM/Pyodide) for in-browser use.

### 6.2 Tech stack
| Layer | Choice | Notes |
|---|---|---|
| Engine | Python 3.11+, numpy, scipy, soundfile | librosa optional for onset detection |
| API | FastAPI + uvicorn | Single analysis endpoint, stateless |
| Frontend | React + Vite (or plain JS) | Web Audio API for playback |
| Plotting | Plotly.js or D3 | Log axes needed for spectrum |
| Packaging | Docker | One container for API, static hosting for UI |
| Testing | pytest, Playwright (UI smoke tests) | |
| CI | GitHub Actions | Lint, tests, build |

### 6.3 Repository layout
```
/engine
  ingest.py          # load, mono, normalize, trim, region select
  partials.py        # Welch FFT, peak picking, interpolation
  dissonance.py      # Plomp-Levelt / Sethares model, curve, minima
  optimize.py        # candidate pruning + scipy refinement
  export.py          # scl, kbm, json writers
  cli.py             # python -m engine.cli input.wav --notes 7
/api
  main.py            # FastAPI app
  schemas.py         # pydantic models
/web
  src/...            # UI
/tests
  fixtures/          # synthetic test tones
  test_*.py
/docs
```

### 6.4 Algorithm details

**Ingest.** Mono mix, peak-normalize to -1 dBFS, resample to 44.1 kHz. Onset detection via short-time energy rise; region selection rules in FR-5.

**Partials.** Frame length 8192 samples (adjustable), hop 4096, Blackman-Harris window, zero-pad to 65536. Average magnitude spectra across frames. Peak threshold relative to the maximum. Parabolic interpolation on log-magnitude around each peak. Keep top N.

**Dissonance curve.** For partial sets (f_i, a_i) and a transposed copy (α·f_i, a_i), total roughness R(α) is the sum of pairwise roughness over all pairs in the union (the sound against itself, plus the sound against its transposition). Sweep α in 1-cent steps (`α = 2^(c/1200)`). Local minima via `scipy.signal.find_peaks` on `-R`, using prominence.

**Optimization.** Variables are the K-1 pitches (cents) between 0 and the period. Objective:

```
J(p) = sum over all pairs (i,j) in scale tones of R_pair(p_i, p_j)   # chord-level roughness
       + lambda * sum over adjacent pairs of max(0, min_spacing - gap)^2
```

Bounds keep each pitch within ±25 cents of its seeded minimum. Use L-BFGS-B or Nelder-Mead from the seeded start; fall back to the seeded values if the optimizer fails. Fixed random seed for any stochastic step.

**Playback.** Pad pitch ratio = 2^(cents/1200) for degree within the period, times the period ratio raised to the row offset. `playbackRate` equals that ratio. Because playbackRate scales every partial by the same ratio, it matches the model's assumption.

### 6.5 API specification

**POST `/api/analyze`** (multipart/form-data)

Fields:
| Field | Type | Default |
|---|---|---|
| `file` | audio file | required |
| `notes` | int | 7 |
| `period` | enum `octave` / `stretched` / `auto` | `octave` |
| `period_cents` | float | 1200 (used if `stretched`) |
| `max_partials` | int | 12 |
| `min_spacing_cents` | float | 40 |
| `peak_threshold_db` | float | -60 |
| `region_start_ms`, `region_end_ms` | int | auto |

Response 200:
```json
{
  "meta": {"duration_s": 1.8, "sample_rate": 44100, "classification": "inharmonic"},
  "partials": [{"freq_hz": 231.4, "amp": 1.0, "amp_db": 0.0}],
  "curve": {"cents": [0, 1, 2], "roughness": [0.0, 0.0, 0.0]},
  "scale": {
    "period_cents": 1200.0,
    "degrees": [
      {"cents": 143.2, "nearest_12tet": "D3", "deviation_cents": -56.8, "nearest_ratio": "8/7", "roughness": 0.12}
    ],
    "roughness_vs_12tet": 0.62
  },
  "exports": {"scl": "...", "kbm": "...", "json_url": "..."}
}
```

Errors return 4xx with `{ "code": "...", "message": "..." }`. Codes: `FILE_TOO_LARGE`, `FILE_TOO_SHORT`, `UNSUPPORTED_FORMAT`, `SIGNAL_TOO_QUIET`, `NO_PARTIALS_FOUND`, `INVALID_PARAMETER`.

**GET `/api/health`** returns `{ "status": "ok" }`.

### 6.6 File format specs

`.scl` example:
```
! my_bell_scale.scl
Scale derived from bell.wav
 7
 143.20000
 312.75000
 498.10000
 701.50000
 886.30000
 1043.90000
 1200.00000
```
Rules: first line starts with `!`; second line is a free-text description; third is the note count (excluding the unison); each following line is a pitch, where a decimal point means cents; the last line is the period.

`.kbm` example (linear mapping):
```
! Keyboard mapping for my_bell_scale
7
0
127
60
69
440.000000
7
0
1
2
3
4
5
6
```
Fields in order: map size, first MIDI note, last MIDI note, middle (root) note, reference note, reference frequency, formal octave degree, then one scale degree per key.

### 6.7 Performance targets
| Metric | Target |
|---|---|
| End-to-end analysis for a 5 s, 44.1 kHz file | < 3 s on a 2-vCPU server |
| Dissonance curve computation (16 partials, 1200 steps) | < 1 s |
| Grid pad to sound latency (after samples are loaded) | < 50 ms |
| Frontend initial load | < 2 s on broadband |

---

## 7. UX Requirements

### 7.1 Flow
1. **Landing / upload:** large drop zone, short explainer, example sounds ("Try a bell").
2. **Analyzing:** progress indicator with plain-language steps (reading sound, finding overtones, building scale).
3. **Result screen:** three zones: (a) playable grid, (b) spectrum and curve plots, (c) scale table with export buttons.
4. **Advanced panel:** collapsed by default; changing a value and pressing Re-generate refreshes results.

### 7.2 Copy guidelines
- Use "smooth", "low-roughness", "blends well".
- Do not claim "perfect" consonance.
- Tooltip for roughness: "How harsh two tones sound when played together. Lower is smoother."

### 7.3 Error states
Every error from section 6.5 maps to a human message with a fix. Example: `SIGNAL_TOO_QUIET` becomes "That sample is very quiet or mostly silence. Try a louder recording of a single note or hit."

### 7.4 Accessibility
- Keyboard-operable grid and controls; visible focus states.
- Plots have text summaries (e.g., "7 notes chosen; deepest minimum at 702 cents").
- Respect `prefers-reduced-motion`; sufficient color contrast; ARIA labels on pads.

---

## 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Privacy** | Uploaded audio is processed in memory and deleted after the response; no storage, no training use. State this in the UI. |
| **Security** | Validate file type by content, not extension; size limits; rate limiting (e.g., 20 requests/min/IP); sandbox decoding; no path traversal in filenames. |
| **Reliability** | Stateless API; 99% availability target for hosted version; graceful timeout at 30 s. |
| **Browser support** | Latest two versions of Chrome, Edge, Firefox, Safari. Mobile Safari and Chrome for the grid. |
| **Determinism** | Same file and params yield byte-identical `.scl` output. |
| **Observability** | Structured logs (no audio content), request timing, error-rate metrics. |
| **Licensing** | Choose an open-source license for the engine; document algorithm sources. |

---

## 9. Success Metrics

| Metric | Target (first 90 days after launch) |
|---|---|
| Upload-to-playable success rate | > 90% of valid uploads |
| Median time from upload to first note played | < 20 s |
| Export rate (users who download at least one file) | > 30% |
| Exported-file validity (loads without error in Scala, Surge XT, Vital, Pianoteq) | 100% of test matrix |
| Error rate due to server faults | < 1% |
| Qualitative: users rating scale "sounds better than 12-TET with this sample" in listening test | > 60% on inharmonic samples |

---

## 10. Testing and Validation Plan

### 10.1 Unit tests
- Partial extraction: synthetic tones with known frequencies; assert detected frequencies within 0.5 Hz and ordering by amplitude.
- Dissonance model: compare with values from Sethares' published examples; assert curve minima near 3/2, 5/4, 4/3 for a 6-harmonic sawtooth-like spectrum.
- Optimizer: result respects spacing, bounds, and unison/period inclusion; reproducible with fixed seed.
- Exporters: parse back `.scl` / `.kbm` with an independent parser; verify note count, last line equals period, cents precision.

### 10.2 Integration tests
- Full pipeline on a fixture set: pure sine, harmonic saw, stretched-partial synthetic, recorded bell, noisy sample, silent file.
- Expected behaviors: harmonic input produces just-intonation-like intervals; stretched input produces a stretched scale; noise input returns `NO_PARTIALS_FOUND` or low-confidence warning; silent input returns `SIGNAL_TOO_QUIET`.

### 10.3 Compatibility testing
Load exported files into Scala, Surge XT, Vital, Pianoteq, and at least one DAW (e.g., Ableton via `.ascl` in v1.1, or Reaper with a tuning plugin). Verify the played pitches match the table within 0.1 cent.

### 10.4 Listening tests
Run A/B comparisons (derived scale vs 12-TET, same sample, same melody) with at least 10 listeners across harmonic and inharmonic samples. Record preference and perceived smoothness.

### 10.5 Performance tests
Benchmark against targets in 6.7 with files of 1, 5, and 30 seconds.

---

## 11. Milestones

| Phase | Duration | Deliverables | Exit criteria |
|---|---|---|---|
| **M1: Engine core** | Week 1-2 | Ingest, FFT partials, dissonance curve, plots in a notebook | Curve for a 6-harmonic tone shows minima near expected ratios |
| **M2: Scale + export** | Week 3 | Optimizer, `.scl`, `.kbm`, CLI | Exported scale loads correctly in a free synth |
| **M3: API** | Week 4 | FastAPI endpoint, schemas, error handling, tests | All fixtures pass; error codes verified |
| **M4: Web UI** | Week 5-6 | Upload, plots, scale table, playable grid, exports | Beginner flow works end to end on desktop and mobile |
| **M5: Polish and beta** | Week 7-8 | Advanced panel, presets, accessibility, docs, deployment | Compatibility matrix passes; 10-user beta feedback collected |
| **M6: Launch** | Week 9 | Public release, landing page, docs | Success metrics tracking live |

---

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Noisy or reverberant samples produce false partials | Poor scales | Adaptive threshold, frame averaging, partial cap, SNR check, UI guidance |
| Too many partials flatten the curve | Hidden minima | Default cap of 12; expose slider; test 8-16 range |
| Users expect "perfect consonance" | Disappointment | Positioning copy; show roughness-vs-12-TET score |
| Polyphonic or musical-mix uploads | Cluttered fingerprint | Detect and warn; recommend single notes |
| Exported files rejected by some synths | Broken workflow | Strict spec compliance, test matrix, validator tests |
| Sample playback pitched far from original sounds artificial | Weak experience | Limit pitch range per sample, recommend sample root, offer resynthesis in v1.1 |
| Server cost or abuse | Budget, downtime | Rate limits, size limits, stateless design, later move engine to browser (WASM) |
| Short or very low samples give poor frequency resolution | Inaccurate partials | Minimum duration checks; longer windows for low sounds |
| Algorithm sources and licensing | Legal ambiguity | Cite Sethares/Plomp-Levelt; implement from published equations |

---

## 13. Open Questions

1. Hosted web service only, or also a downloadable CLI/desktop tool at launch?
2. Is the sound's own "pseudo-octave" a P0 or P1 period option? (Currently P1.)
3. Is a single `playbackRate` sample voice enough for v1, or should additive resynthesis be promoted to P0?
4. Which DAW is the primary compatibility target for the first beta?
5. Open-source the engine, or keep it closed?
6. Free forever, or a free tier plus paid features (batch, saved scales)?

---

## 14. References

- W. Sethares, *Tuning, Timbre, Spectrum, Scale* (2nd ed.), Springer, 2005.
- R. Plomp and W. Levelt, "Tonal Consonance and Critical Bandwidth," *JASA*, 1965.
- Scala scale file format (`.scl`) and keyboard mapping (`.kbm`) specifications, huygens-fokker.org.
- MIDI Tuning Standard and AnaMark `.tun` format documentation.

---

## 15. Appendix: Glossary

- **Partial:** a single sinusoidal component of a sound; may or may not be an integer multiple of the fundamental.
- **Inharmonic:** partials not at integer multiples of a fundamental (bells, gongs).
- **Cent:** 1/1200 of an octave; the standard logarithmic pitch unit.
- **Roughness (sensory dissonance):** perceived harshness from partials beating within a critical band.
- **Dissonance curve:** roughness as a function of the interval between a sound and a transposed copy of itself.
- **Period:** the interval at which the scale repeats (octave for most Western music).
- **12-TET:** twelve-tone equal temperament, the standard Western tuning.
- **Isomorphic grid:** a keyboard layout where the same interval shape looks identical anywhere on the grid.
