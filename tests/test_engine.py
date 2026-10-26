import numpy as np
import pytest

from engine import AnalysisParams, EngineError, analyze
from engine.dissonance import dissonance_curve, find_minima, total_roughness_and_grad
from engine.export import safe_name, write_kbm, write_scl
from engine.ingest import TARGET_SR
from engine.partials import extract_partials

from .synth import bell, harmonic, stretched, tone, wav_bytes


# --- partials -----------------------------------------------------------------
def test_partials_within_half_hz():
    freqs = [261.0, 523.5, 811.0, 1340.0]
    x = tone([(f, a) for f, a in zip(freqs, [1.0, 0.6, 0.4, 0.2])], dur=1.0)
    res = extract_partials(x, TARGET_SR, max_partials=12)
    found = sorted(p.freq_hz for p in res.partials)
    assert len(found) == 4
    for f, g in zip(freqs, found):
        assert abs(f - g) < 0.5
    # Strongest is 1.0 / 0 dB and amplitudes follow the input order.
    by_amp = sorted(res.partials, key=lambda p: -p.amp)
    assert np.allclose([p.freq_hz for p in by_amp], freqs, atol=0.5)
    assert by_amp[0].amp == pytest.approx(1.0)


def test_partials_respect_max_count():
    x = harmonic(n=20, dur=1.0)
    res = extract_partials(x, TARGET_SR, max_partials=8)
    assert len(res.partials) == 8


# --- dissonance -----------------------------------------------------------------
def test_curve_minima_at_just_intervals_for_harmonic_spectrum():
    f0 = 261.6
    freqs = [f0 * k for k in range(1, 7)]
    amps = [0.88**k for k in range(6)]
    cents, R = dissonance_curve(freqs, amps, 1200)
    minima = [m.cents for m in find_minima(cents, R)]
    for target in (1200 * np.log2(3 / 2), 1200 * np.log2(5 / 4), 1200 * np.log2(4 / 3)):
        assert min(abs(m - target) for m in minima) < 3


def test_curve_speed_16_partials():
    import time

    freqs = list(np.geomspace(100, 5000, 16))
    amps = list(np.linspace(1, 0.2, 16))
    t = time.perf_counter()
    dissonance_curve(freqs, amps, 1200)
    assert time.perf_counter() - t < 1.0


def test_analytic_gradient_matches_numeric():
    freqs = [220, 440, 660, 905]
    amps = [1, 0.5, 0.3, 0.2]
    tones = np.array([0.0, 190.0, 410.0, 700.0, 1200.0])
    _, g = total_roughness_and_grad(tones, freqs, amps)
    eps = 1e-4
    for i in range(1, 4):
        tp, tm = tones.copy(), tones.copy()
        tp[i] += eps
        tm[i] -= eps
        num = (total_roughness_and_grad(tp, freqs, amps)[0] - total_roughness_and_grad(tm, freqs, amps)[0]) / (2 * eps)
        assert g[i] == pytest.approx(num, rel=1e-4, abs=1e-9)


# --- scale --------------------------------------------------------------------
@pytest.mark.parametrize("notes,spacing", [(5, 40), (7, 40), (12, 60), (3, 100)])
def test_scale_respects_rules(notes, spacing):
    r = analyze(wav_bytes(bell()), AnalysisParams(notes=notes, min_spacing_cents=spacing))
    degs = r["scale"]["degrees"]
    cents = [d["cents"] for d in degs]
    assert len(degs) == notes + 1
    assert cents[0] == 0.0 and cents[-1] == r["scale"]["period_cents"] == 1200.0
    assert np.all(np.diff(cents) >= r["scale"]["min_spacing_cents"] - 0.01)


def test_harmonic_gives_just_like_intervals():
    r = analyze(wav_bytes(harmonic()), AnalysisParams(notes=7))
    cents = [d["cents"] for d in r["scale"]["degrees"]]
    assert r["meta"]["classification"] == "harmonic"
    assert min(abs(c - 701.955) for c in cents) < 3
    assert min(abs(c - 386.31) for c in cents) < 3


def test_stretched_auto_period_detected():
    r = analyze(wav_bytes(stretched(stretch=2.1)), AnalysisParams(period="auto"))
    assert r["scale"]["period_cents"] == pytest.approx(1200 * np.log2(2.1), abs=3)
    assert r["scale"]["period_source"] == "detected"


def test_bell_is_inharmonic():
    r = analyze(wav_bytes(bell()), AnalysisParams())
    assert r["meta"]["classification"] == "inharmonic"
    assert r["meta"]["region_mode"] == "percussive"


def test_deterministic_scl():
    data = wav_bytes(bell())
    a = analyze(data, AnalysisParams(notes=9))["exports"]["scl"]
    b = analyze(data, AnalysisParams(notes=9))["exports"]["scl"]
    assert a == b


# --- errors -------------------------------------------------------------------
def test_silent_file_rejected():
    with pytest.raises(EngineError) as e:
        analyze(wav_bytes(np.zeros(44100)))
    assert e.value.code == "SIGNAL_TOO_QUIET"


def test_noise_rejected():
    x = np.random.default_rng(1).standard_normal(44100) * 0.5
    with pytest.raises(EngineError) as e:
        analyze(wav_bytes(x))
    assert e.value.code == "NO_PARTIALS_FOUND"


def test_too_short_rejected():
    x = np.zeros(44100)
    x[1000:1000 + 2000] = tone([(440, 1)], dur=2000 / 44100)
    with pytest.raises(EngineError) as e:
        analyze(wav_bytes(x))
    assert e.value.code == "FILE_TOO_SHORT"


def test_unsupported_format():
    with pytest.raises(EngineError) as e:
        analyze(b"this is not audio at all" * 10)
    assert e.value.code == "UNSUPPORTED_FORMAT"


def test_invalid_params():
    with pytest.raises(EngineError) as e:
        analyze(wav_bytes(bell()), AnalysisParams(notes=30))
    assert e.value.code == "INVALID_PARAMETER"


def test_flac_and_ogg_decode():
    x = bell(dur=1.5)
    for fmt, sub in (("FLAC", "PCM_16"), ("OGG", "VORBIS")):
        r = analyze(wav_bytes(x, fmt=fmt, subtype=sub), AnalysisParams())
        assert len(r["partials"]) >= 4


# --- exporters ----------------------------------------------------------------
def _parse_scl(text):
    lines = [ln for ln in text.splitlines() if not ln.startswith("!")]
    desc, count, pitches = lines[0], int(lines[1]), lines[2:]
    return desc, count, [float(p.split()[0]) for p in pitches if p.strip()]


def test_scl_roundtrip():
    cents = [143.2, 312.75, 498.1, 701.5, 886.3, 1043.9, 1200.0]
    text = write_scl("my bell", "Scale derived from bell.wav", cents)
    assert text.startswith("! my_bell.scl\n")
    desc, count, pitches = _parse_scl(text)
    assert count == 7 and pitches == cents and pitches[-1] == 1200.0
    for ln in text.splitlines()[3:]:
        assert "." in ln and len(ln.split(".")[1]) >= 5


def test_kbm_structure():
    text = write_kbm("x", 7, root_note=60, reference_freq=261.6256)
    vals = [ln for ln in text.splitlines() if not ln.startswith("!")]
    assert vals[:8] == ["7", "0", "127", "60", "60", "261.625600", "7", "0"]
    assert vals[7:] == [str(i) for i in range(7)]


def test_safe_name_blocks_traversal():
    assert "/" not in safe_name("../../etc/passwd")
    assert safe_name("") == "scale"
