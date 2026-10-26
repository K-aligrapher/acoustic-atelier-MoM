import { ChevronDown, ChevronUp, Keyboard, Play, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioEngine, EnvelopeMode } from "../lib/audio/engine";
import { fmtHz, fmtSigned } from "../lib/format";
import { useMediaQuery } from "../hooks/useSize";
import {
  KEY_ROWS,
  buildGrid,
  freqToMidi,
  isNaturalStep,
  keyLabel,
  midiName,
  midiToFreq,
  nearestSimpleRatio,
  relativeNoteName,
  type PadSpec,
} from "../lib/music";
import type { Degree } from "../lib/types";
import { InfoTip } from "./InfoTip";

export type Tuning = "generated" | "12tet";

export interface InstrumentState {
  tuning: Tuning;
  rootMidi: number;
  baseFreq: number;
  volume: number;
  envelope: EnvelopeMode;
  showCents: boolean;
}

const ROWS = 4;

export function InstrumentKeyboard({
  degrees,
  tetCents,
  periodCents,
  referenceHz,
  engine,
  state,
  setState,
  canHold,
  selected,
  onSelect,
  highlight,
  playing,
  tetAvailable,
}: {
  degrees: Degree[];
  tetCents: number[];
  periodCents: number;
  referenceHz: number;
  engine: AudioEngine;
  state: InstrumentState;
  setState: (patch: Partial<InstrumentState>) => void;
  canHold: boolean;
  selected: { degree: number; periodIndex: number } | null;
  onSelect: (s: { degree: number; periodIndex: number }) => void;
  highlight: number | null;
  playing: number;
  tetAvailable: boolean;
}) {
  const K = degrees.length - 1;
  const narrow = useMediaQuery("(max-width: 640px)");
  const maxCols = narrow ? 8 : 13;
  const cols = Math.min(K + 1, maxCols);
  const [offset, setOffset] = useState(cols - 1);
  const [shift, setShift] = useState(0);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [audioReady, setAudioReady] = useState(engine.ready);
  const pointerPads = useRef(new Map<number, string>());
  const keyPads = useRef(new Map<string, string>());

  useEffect(() => setOffset(Math.min(cols - 1, K)), [cols, K]);

  const grid = useMemo(() => buildGrid(K, cols, ROWS, Math.max(1, offset), shift), [K, cols, offset, shift]);
  const padById = useMemo(() => {
    const m = new Map<string, PadSpec>();
    grid.flat().forEach((p) => m.set(p.id, p));
    return m;
  }, [grid]);

  const centsOf = useCallback(
    (degree: number, periodIndex: number) => {
      if (state.tuning === "12tet") return periodIndex * tetCents[K] + tetCents[degree];
      return periodIndex * periodCents + degrees[degree].cents;
    },
    [state.tuning, tetCents, K, periodCents, degrees],
  );
  const freqOf = (degree: number, periodIndex: number) => state.baseFreq * Math.pow(2, centsOf(degree, periodIndex) / 1200);
  const rootPc = ((state.rootMidi % 12) + 12) % 12;

  const press = useCallback(
    (pad: PadSpec) => {
      const f = state.baseFreq * Math.pow(2, centsOf(pad.degree, pad.periodIndex) / 1200);
      engine.noteOn(pad.id, f / referenceHz, state.envelope).then(() => setAudioReady(engine.ready));
      setActive((s) => new Set(s).add(pad.id));
      onSelect({ degree: pad.degree, periodIndex: pad.periodIndex });
    },
    [engine, centsOf, state.baseFreq, state.envelope, referenceHz, onSelect],
  );
  const release = useCallback(
    (padId: string) => {
      engine.noteOff(padId, state.envelope);
      setActive((s) => {
        const n = new Set(s);
        n.delete(padId);
        return n;
      });
    },
    [engine, state.envelope],
  );

  // Computer keyboard: physical key rows map onto grid rows (bottom row = Z…/).
  const keyMap = useMemo(() => {
    const m = new Map<string, string>();
    const bottomUp = [...grid].reverse();
    bottomUp.forEach((row, r) => row.forEach((pad, c) => KEY_ROWS[r]?.[c] && m.set(KEY_ROWS[r][c], pad.id)));
    return m;
  }, [grid]);
  const labelFor = useMemo(() => {
    const m = new Map<string, string>();
    keyMap.forEach((pad, code) => m.set(pad, keyLabel(code)));
    return m;
  }, [keyMap]);

  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isField(e.target)) return;
      const id = keyMap.get(e.code);
      if (!id) return;
      const pad = padById.get(id);
      if (!pad) return;
      e.preventDefault();
      keyPads.current.set(e.code, id);
      press(pad);
    };
    const up = (e: KeyboardEvent) => {
      const id = keyPads.current.get(e.code);
      if (!id) return;
      keyPads.current.delete(e.code);
      release(id);
    };
    const blur = () => {
      keyPads.current.forEach((id) => release(id));
      keyPads.current.clear();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [keyMap, padById, press, release]);

  const playSelected = () => {
    const s = selected ?? { degree: 0, periodIndex: 0 };
    const id = `sel-${s.degree}-${s.periodIndex}`;
    const f = freqOf(s.degree, s.periodIndex);
    engine.noteOn(id, f / referenceHz, "ring").then(() => setAudioReady(engine.ready));
    onSelect(s);
  };

  // Selected-note readout
  const sel = selected ?? { degree: 0, periodIndex: 0 };
  const selCents = centsOf(sel.degree, sel.periodIndex);
  const selFreq = freqOf(sel.degree, sel.periodIndex);
  const withinCents = state.tuning === "12tet" ? tetCents[sel.degree] : degrees[sel.degree].cents;
  const ratio = nearestSimpleRatio(withinCents);
  const n12 = Math.round(withinCents / 100);
  const dev = withinCents - 100 * n12;
  const rate = selFreq / referenceHz;

  const rootOptions = [];
  for (let m = 24; m <= 96; m++) rootOptions.push(m);
  const nativeMidi = Math.round(freqToMidi(referenceHz));
  const rootIsNative = Math.abs(state.baseFreq - referenceHz) < 0.005;

  return (
    <div className="instrument">
      <div className="toolbar" role="toolbar" aria-label="Playback controls">
        <div className="tool-group">
          <button type="button" className="tool-btn tool-btn--primary" onClick={playSelected} aria-label="Play selected note">
            <Play size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Play</span>
          </button>
          <button type="button" className="tool-btn" onClick={() => { engine.stopAll(); setActive(new Set()); }} aria-label="Stop all notes">
            <Square size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>Stop</span>
          </button>
          <span className={`playing-ind${playing > 0 ? " is-on" : ""}`} aria-label={playing > 0 ? `${playing} voices sounding` : "Silent"} role="img">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className="tool-group">
          <label className="tool-field">
            <span className="tool-label">Root</span>
            <select
              value={state.rootMidi}
              onChange={(e) => {
                const m = Number(e.target.value);
                setState({ rootMidi: m, baseFreq: midiToFreq(m) });
              }}
              aria-label="Root note"
            >
              {rootOptions.map((m) => (
                <option key={m} value={m}>
                  {midiName(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="tool-field tool-field--hz">
            <span className="visually-hidden">Root frequency in hertz</span>
            <input
              type="number"
              min={16}
              max={4000}
              step={0.01}
              value={Number(state.baseFreq.toFixed(2))}
              onChange={(e) => {
                const f = Number(e.target.value);
                if (f >= 16 && f <= 4000) setState({ baseFreq: f, rootMidi: Math.round(freqToMidi(f)) });
              }}
            />
            <span className="tool-unit">Hz</span>
          </label>
          <button
            type="button"
            className={`tool-chip${rootIsNative ? " is-on" : ""}`}
            onClick={() => setState({ baseFreq: referenceHz, rootMidi: nativeMidi })}
            title={`Use the sample's own pitch (${fmtHz(referenceHz)})`}
          >
            Native
          </button>
        </div>

        <div className="tool-group">
          <div className="segmented" role="radiogroup" aria-label="Tuning system">
            <button type="button" role="radio" aria-checked={state.tuning === "generated"} onClick={() => setState({ tuning: "generated" })}>
              Generated
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={state.tuning === "12tet"}
              onClick={() => setState({ tuning: "12tet" })}
              disabled={!tetAvailable}
              title={tetAvailable ? "Each degree moved to its nearest 12-TET semitone" : "12-TET has too few notes for a one-to-one comparison"}
            >
              12-TET
            </button>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Note envelope">
            <button type="button" role="radio" aria-checked={state.envelope === "ring"} onClick={() => setState({ envelope: "ring" })}>
              Ring
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={state.envelope === "hold"}
              onClick={() => setState({ envelope: "hold" })}
              disabled={!canHold}
              title={canHold ? "Loop the analysed region while a pad is held" : "The sample is too short to loop"}
            >
              Hold
            </button>
          </div>
          <InfoTip label="envelope">
            <strong>Ring</strong> lets each note decay naturally. <strong>Hold</strong> sustains the note with a crossfaded loop
            while you hold the pad, and releases it when you let go.
          </InfoTip>
        </div>

        <div className="tool-group tool-group--end">
          <label className="tool-field tool-field--vol">
            <Volume2 size={15} strokeWidth={1.6} aria-hidden="true" />
            <span className="visually-hidden">Volume</span>
            <input type="range" min={0} max={1} step={0.01} value={state.volume} onChange={(e) => setState({ volume: Number(e.target.value) })} />
          </label>
          <label className="tool-check">
            <input type="checkbox" checked={state.showCents} onChange={(e) => setState({ showCents: e.target.checked })} />
            <span>Cents</span>
          </label>
        </div>
      </div>

      <div className="instrument-body">
        <div className="pads-wrap">
          <div className={`tuning-banner tuning-banner--${state.tuning}`} aria-live="polite">
            <span className="tuning-dot" aria-hidden="true" />
            {state.tuning === "generated" ? "Generated tuning" : "12-TET comparison"}
            <span className="tuning-sub">
              {state.tuning === "generated"
                ? `${K} notes · period ${periodCents.toFixed(periodCents % 1 ? 2 : 0)}¢`
                : `${K} notes · nearest semitones`}
            </span>
          </div>

          <div
            className="pads"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            role="group"
            aria-label={`Isomorphic keyboard, ${ROWS} rows of ${cols} pads. Each row is ${offset} degrees above the one below.`}
          >
            {grid.flat().map((pad) => {
              const d = degrees[pad.degree];
              const cents = centsOf(pad.degree, pad.periodIndex);
              const isRoot = pad.degree === 0;
              const semis = state.tuning === "12tet" ? Math.round(tetCents[pad.degree] / 100) : d.nearest_12tet_semitones;
              const tone = isRoot ? "root" : isNaturalStep(rootPc + semis) ? "ivory" : "ebony";
              const isSel = selected?.degree === pad.degree && selected.periodIndex === pad.periodIndex;
              const isDeg = selected?.degree === pad.degree;
              const hl = highlight === pad.degree;
              const key = labelFor.get(pad.id);
              const name = relativeNoteName(rootPc, semis);
              return (
                <button
                  key={pad.id}
                  type="button"
                  className={[
                    "pad",
                    `pad--${tone}`,
                    active.has(pad.id) ? "is-active" : "",
                    isSel ? "is-selected" : isDeg ? "is-degree" : "",
                    hl ? "is-highlight" : "",
                  ].join(" ")}
                  aria-label={`${isRoot ? "Root" : `Degree ${pad.degree}`}, ${cents.toFixed(1)} cents, ${freqOf(pad.degree, pad.periodIndex).toFixed(1)} hertz${key ? `, key ${key}` : ""}`}
                  aria-pressed={active.has(pad.id)}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    pointerPads.current.set(e.pointerId, pad.id);
                    press(pad);
                  }}
                  onPointerUp={(e) => {
                    const id = pointerPads.current.get(e.pointerId);
                    pointerPads.current.delete(e.pointerId);
                    if (id) release(id);
                  }}
                  onPointerCancel={(e) => {
                    const id = pointerPads.current.get(e.pointerId);
                    pointerPads.current.delete(e.pointerId);
                    if (id) release(id);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                      e.preventDefault();
                      press(pad);
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === "Enter" || e.key === " ") release(pad.id);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="pad-deg">{isRoot ? "R" : pad.degree}</span>
                  {isRoot && <span className="pad-per">P{pad.periodIndex}</span>}
                  <span className="pad-name">{name}</span>
                  {state.showCents && <span className="pad-cents">{(cents - pad.periodIndex * (state.tuning === "12tet" ? tetCents[K] : periodCents)).toFixed(1)}</span>}
                  {key && <span className="pad-key">{key}</span>}
                </button>
              );
            })}
          </div>

          <div className="pads-foot">
            <div className="pads-ctrl">
              <span className="tool-label">Register</span>
              <button type="button" className="icon-btn" aria-label="Shift keyboard down" onClick={() => setShift((s) => Math.max(-2, s - 1))} disabled={shift <= -2}>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              <span className="mono-sm" aria-live="polite">{shift > 0 ? `+${shift}` : shift}</span>
              <button type="button" className="icon-btn" aria-label="Shift keyboard up" onClick={() => setShift((s) => Math.min(2, s + 1))} disabled={shift >= 2}>
                <ChevronUp size={15} aria-hidden="true" />
              </button>
            </div>
            <label className="pads-ctrl">
              <span className="tool-label">Row offset</span>
              <select value={offset} onChange={(e) => setOffset(Number(e.target.value))} aria-label="Degrees between rows">
                {Array.from({ length: Math.min(K, cols) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === K ? `${n} (one period)` : `${n} degrees`}
                  </option>
                ))}
              </select>
            </label>
            <p className="pads-hint">
              <Keyboard size={14} strokeWidth={1.5} aria-hidden="true" />
              Rows map to <kbd>Z</kbd>–<kbd>/</kbd>, <kbd>A</kbd>–<kbd>'</kbd>, <kbd>Q</kbd>–<kbd>]</kbd>, <kbd>1</kbd>–<kbd>=</kbd>
            </p>
          </div>
          {!audioReady && <p className="audio-hint">Audio wakes on your first touch — press any pad to begin.</p>}
        </div>

        <aside className="ledger" aria-label="Selected note" aria-live="polite">
          <p className="ledger-eyebrow">Selected note</p>
          <p className="ledger-title">
            {sel.degree === 0 ? "Root" : `Degree ${sel.degree}`}
            <span className="ledger-period">period {sel.periodIndex >= 0 ? `+${sel.periodIndex}` : sel.periodIndex}</span>
          </p>
          <p className="ledger-cents">
            {withinCents.toFixed(2)}
            <span>¢</span>
          </p>
          <dl className="ledger-list">
            <div>
              <dt>Frequency</dt>
              <dd>{fmtHz(selFreq)}</dd>
            </div>
            <div>
              <dt>Interval from root</dt>
              <dd>{selCents.toFixed(2)}¢</dd>
            </div>
            <div>
              <dt>Nearest 12-TET</dt>
              <dd>
                {relativeNoteName(rootPc, n12)} <span className="dd-sub">{fmtSigned(dev)}¢</span>
              </dd>
            </div>
            <div>
              <dt>Simple ratio</dt>
              <dd>{ratio ? <>{ratio.ratio} <span className="dd-sub">{fmtSigned(ratio.error)}¢</span></> : <span className="dd-na">none within 15¢</span>}</dd>
            </div>
            {state.tuning === "generated" && (
              <div>
                <dt>Roughness share</dt>
                <dd>{degrees[sel.degree].roughness.toFixed(4)}</dd>
              </div>
            )}
            <div>
              <dt>Playback rate</dt>
              <dd className={rate > 4 || rate < 0.25 ? "is-warn" : ""}>{rate.toFixed(3)}×</dd>
            </div>
          </dl>
          {(rate > 4 || rate < 0.25) && (
            <p className="ledger-note">This note is far from the sample's own pitch, so it may sound artificial.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
