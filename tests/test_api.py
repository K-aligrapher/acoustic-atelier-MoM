import numpy as np
from fastapi.testclient import TestClient

from server.main import app

from .synth import bell, wav_bytes

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_analyze_ok():
    r = client.post(
        "/api/analyze",
        files={"file": ("bell.wav", wav_bytes(bell()), "audio/wav")},
        data={"notes": "7", "period": "octave"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) >= {"meta", "partials", "curve", "scale", "exports", "spectrum"}
    assert len(body["scale"]["degrees"]) == 8
    assert body["exports"]["scl"].startswith("! bell_scale.scl")
    assert len(body["curve"]["cents"]) == 1201


def test_analyze_error_shape():
    r = client.post("/api/analyze", files={"file": ("x.wav", wav_bytes(np.zeros(44100)), "audio/wav")})
    assert r.status_code == 422
    assert r.json()["code"] == "SIGNAL_TOO_QUIET"


def test_analyze_invalid_param():
    r = client.post(
        "/api/analyze",
        files={"file": ("bell.wav", wav_bytes(bell()), "audio/wav")},
        data={"notes": "99"},
    )
    assert r.status_code == 400 and r.json()["code"] == "INVALID_PARAMETER"


def test_analyze_bad_type():
    r = client.post("/api/analyze", data={"notes": "abc"}, files={"file": ("a.wav", b"RIFF", "audio/wav")})
    assert r.status_code == 400 and r.json()["code"] == "INVALID_PARAMETER"


def test_export():
    r = client.post("/api/export", json={"name": "My Bell", "cents": [200.5, 700.25, 1200.0], "reference_freq": 440})
    assert r.status_code == 200
    body = r.json()
    assert body["filename_base"] == "My_Bell"
    assert " 700.25000" in body["scl"]
    assert "440.000000" in body["kbm"]


def test_export_rejects_unsorted():
    r = client.post("/api/export", json={"name": "x", "cents": [700, 200, 1200]})
    assert r.status_code == 400 and r.json()["code"] == "INVALID_PARAMETER"
