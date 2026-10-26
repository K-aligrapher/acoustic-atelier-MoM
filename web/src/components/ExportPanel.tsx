import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { requestExport } from "../lib/api";
import { describeError } from "../lib/errors";
import { midiName } from "../lib/music";
import type { Analysis, SoundSource } from "../lib/types";
import { useToast } from "./Toast";

type Kind = "scl" | "kbm" | "json";

function download(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeBase(name: string) {
  return (
    name
      .replace(/[\\/]+/g, " ")
      .replace(/[^A-Za-z0-9 _\-.()]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 64) || "scale"
  );
}

export function ExportPanel({
  analysis,
  source,
  baseFreq,
  rootMidi,
}: {
  analysis: Analysis;
  source: SoundSource;
  baseFreq: number;
  rootMidi: number;
}) {
  const data = analysis.response;
  const toast = useToast();
  const [name, setName] = useState(data.scale.name);
  const [rootKey, setRootKey] = useState(rootMidi);
  useEffect(() => setRootKey(rootMidi), [rootMidi]);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<{ kind: Kind; text: string } | null>(null);

  useEffect(() => setName(data.scale.name), [data.scale.name]);

  const cents = data.scale.degrees.slice(1).map((d) => d.cents);

  async function exportScala(kind: "scl" | "kbm") {
    setBusy(kind);
    setError(null);
    try {
      const files = await requestExport({
        name,
        description: `Timbre-derived scale from ${source.name} (${cents.length} notes, period ${data.scale.period_cents.toFixed(3)} cents)`,
        cents,
        root_note: rootKey,
        reference_freq: Number(baseFreq.toFixed(6)),
      });
      download(files[kind], `${files.filename_base}.${kind}`, "text/plain");
      toast(`Saved ${files.filename_base}.${kind}`);
    } catch (e) {
      const d = describeError(e);
      setError({ kind, text: `${d.title}. ${d.message}` });
      toast(`Couldn't export .${kind}`, "error");
    } finally {
      setBusy(null);
    }
  }

  function exportJson() {
    setError(null);
    try {
      const payload = {
        generator: "Acoustic Atelier — Acoustic Scale Generator",
        format_version: 1,
        name,
        source: { filename: source.name, kind: source.kind, segment_offset_ms: analysis.segmentOffsetMs },
        tuning: { root_midi_note: rootKey, reference_freq_hz: baseFreq },
        parameters: data.params,
        meta: data.meta,
        partials: data.partials,
        curve: data.curve,
        scale: data.scale,
        warnings: data.warnings,
      };
      const base = safeBase(name);
      download(JSON.stringify(payload, null, 2), `${base}.json`, "application/json");
      toast(`Saved ${base}.json`);
    } catch {
      setError({ kind: "json", text: "The analysis data couldn't be serialised. Nothing was downloaded." });
    }
  }

  const items: { kind: Kind; title: string; ext: string; text: string; action: () => void }[] = [
    { kind: "scl", title: "Scala Scale", ext: ".scl", text: "Export the generated interval structure for compatible tuning systems.", action: () => exportScala("scl") },
    { kind: "kbm", title: "Keyboard Mapping", ext: ".kbm", text: "Export the keyboard-to-scale mapping.", action: () => exportScala("kbm") },
    { kind: "json", title: "Analysis Data", ext: ".json", text: "Export partials, dissonance curve, scale degrees, and parameters.", action: exportJson },
  ];

  return (
    <div className="export">
      <div className="export-fields">
        <label className="field">
          <span className="field-label">Scale name</span>
          <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} spellCheck={false} />
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Root key (MIDI)</span>
            <input type="number" min={0} max={127} value={rootKey} onChange={(e) => setRootKey(Math.max(0, Math.min(127, Number(e.target.value) || 0)))} />
          </label>
          <div className="field">
            <span className="field-label">Tuned to</span>
            <span className="field-static mono">
              {midiName(rootKey)} key → {baseFreq.toFixed(3)} Hz
            </span>
          </div>
        </div>
        <p className="field-help">The mapping tunes the root key to the instrument's current root frequency.</p>
      </div>
      <ul className="export-list">
        {items.map((it) => (
          <li key={it.kind} className="export-item">
            <div>
              <p className="export-title">
                {it.title} <code>{it.ext}</code>
              </p>
              <p className="export-text">{it.text}</p>
              {error?.kind === it.kind && (
                <p className="export-error" role="alert">
                  {error.text}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn--outline btn--sm export-btn"
              onClick={it.action}
              disabled={busy !== null || !name.trim()}
              aria-label={`Download ${it.title} ${it.ext}`}
            >
              {busy === it.kind ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Download size={15} strokeWidth={1.6} aria-hidden="true" />}
              {it.ext}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
