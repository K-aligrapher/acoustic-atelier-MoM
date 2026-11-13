import { ChevronDown, ChevronUp, Grid3x3, Keyboard, Piano, Play, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ADSR, AudioEngine } from "../lib/audio/engine";
import { fmtHz } from "../lib/format";
import { useMediaQuery } from "../hooks/useSize";
import {
  KEY_ROWS,
  buildGrid,
  freqToMidi,
  isNaturalStep,
  keyLabel,
  midiName,
  midiToFreq,
  relativeNoteName,
  type PadSpec,
} from "../lib/music";
import type { Degree } from "../lib/types";

export type Tuning = "generated" | "12tet";

export interface InstrumentState {
  tuning: Tuning;
  rootMidi: number;
  baseFreq: number;
  volume: number;
  view: "pads" | "keys";
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
  adsr,
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
  adsr: ADSR;
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
  // Piano view: a standard three-octave keyboard (C to C, 7 white + 5 black keys per octave).
  // Linear mapping, as in the exported .kbm: the root key plays degree 0 and every key
  // above it steps one scale degree higher. `col` holds the MIDI note of the key.
  const pianoPads = useMemo(() => {
    const out: PadSpec[] = [];
    const start = Math.floor(state.rootMidi / 12) * 12 + shift * 12;
    for (let midi = start; midi < start + 36; midi++) {
      const index = midi - state.rootMidi;
      out.push({ id: `k${midi}`, index, degree: ((index % K) + K) % K, periodIndex: Math.floor(index / K), row: 0, col: midi });
    }
    return out;
  }, [K, shift, state.rootMidi]);
  const isKeys = state.view === "keys";
  const padById = useMemo(() => {
    const m = new Map<string, PadSpec>();
    (isKeys ? pianoPads : grid.flat()).forEach((p) => m.set(p.id, p));
    return m;
  }, [grid, pianoPads, isKeys]);

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
      engine.noteOn(pad.id, f / referenceHz, adsr).then(() => setAudioReady(engine.ready));
      setActive((s) => new Set(s).add(pad.id));
      onSelect({ degree: pad.degree, periodIndex: pad.periodIndex });
    },
    [engine, centsOf, state.baseFreq, adsr, referenceHz, onSelect],
  );
  const release = useCallback(
    (padId: string) => {
      engine.noteOff(padId);
      setActive((s) => {
        const n = new Set(s);
        n.delete(padId);
        return n;
      });
    },
    [engine],
  );

  // Computer keyboard: physical key rows map onto grid rows (bottom row = Z…/).
  const keyMap = useMemo(() => {
    const m = new Map<string, string>();
    if (isKeys) {
      // Piano view: the usual DAW "musical typing" layout from the first C.
      // Virtual-piano layout: white keys q w e … / , black keys on the row above them.
      const whites = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"];
      const blacks = ["Digit2", "Digit3", "Digit5", "Digit6", "Digit7", "Digit9", "Digit0", "KeyS", "KeyD", "KeyF", "KeyH", "KeyJ", "KeyL", "Semicolon", "Quote"];
      let wi = 0;
      let bi = 0;
      pianoPads.forEach((pad) => {
        const code = [1, 3, 6, 8, 10].includes(pad.col % 12) ? blacks[bi++] : whites[wi++];
        if (code) m.set(code, pad.id);
      });
      return m;
    }
    const bottomUp = [...grid].reverse();
    bottomUp.forEach((row, r) => row.forEach((pad, c) => KEY_ROWS[r]?.[c] && m.set(KEY_ROWS[r][c], pad.id)));
    return m;
  }, [grid, pianoPads, isKeys]);
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
    engine.trigger(id, f / referenceHz, adsr).then(() => setAudioReady(engine.ready));
    onSelect(s);
  };

  const rootOptions = [];
  for (let m = 24; m <= 96; m++) rootOptions.push(m);
  const nativeMidi = Math.round(freqToMidi(referenceHz));
  const rootIsNative = Math.abs(state.baseFreq - referenceHz) < 0.005;

  return (
    <div className="instrument">
      <div className="toolbar" role="toolbar" aria-label="Playback controls">
        <div className="tool-group">
          <div className="segmented segmented--view" role="radiogroup" aria-label="Instrument view">
            <button type="button" role="radio" aria-checked={!isKeys} onClick={() => setState({ view: "pads" })}>
              <Grid3x3 size={14} strokeWidth={1.6} aria-hidden="true" /> Pads
            </button>
            <button type="button" role="radio" aria-checked={isKeys} onClick={() => setState({ view: "keys" })}>
              <Piano size={14} strokeWidth={1.6} aria-hidden="true" /> Keys
            </button>
          </div>
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

          {isKeys ? (
            <PianoKeys
              pads={pianoPads}
              centsLabel={(p) => (state.showCents ? (state.tuning === "12tet" ? tetCents[p.degree] : degrees[p.degree].cents).toFixed(1) : null)}
              keyLabel={(p) => labelFor.get(p.id)}
              active={active}
              selected={selected}
              highlight={highlight}
              onDown={(e, p) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                pointerPads.current.set(e.pointerId, p.id);
                press(p);
              }}
              onUp={(e) => {
                const id = pointerPads.current.get(e.pointerId);
                pointerPads.current.delete(e.pointerId);
                if (id) release(id);
              }}
              onKey={(e, p, down) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (down && !e.repeat) press(p);
                if (!down) release(p.id);
              }}
            />
          ) : (
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
          )}

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
            {!isKeys && (
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
            )}
            <p className="pads-hint">
              <Keyboard size={14} strokeWidth={1.5} aria-hidden="true" />
              {isKeys ? <>White keys <kbd>Q</kbd>–<kbd>P</kbd>, <kbd>Z</kbd>–<kbd>/</kbd> · black keys <kbd>2</kbd> <kbd>3</kbd> <kbd>5</kbd> <kbd>6</kbd> <kbd>7</kbd> <kbd>9</kbd> <kbd>0</kbd> <kbd>S</kbd>… · each key is one scale degree</> : <>Rows map to <kbd>Z</kbd>–<kbd>/</kbd>, <kbd>A</kbd>–<kbd>'</kbd>, <kbd>Q</kbd>–<kbd>]</kbd>, <kbd>1</kbd>–<kbd>=</kbd></>}
            </p>
          </div>
          {!audioReady && <p className="audio-hint">Audio wakes on your first touch — press any pad or key to begin.</p>}
        </div>

      </div>
    </div>
  );
}

/** Standard piano: 7 white and 5 black keys per octave. `p.col` is the key's MIDI note. */
const BLACK = new Set([1, 3, 6, 8, 10]);
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const keyName = (midi: number) => `${SHARP_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
// Horizontal centre of each black key, in white-key widths from the octave's C.
const BLACK_POS: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };

function PianoKeys({
  pads,
  centsLabel,
  keyLabel: keyOf,
  active,
  selected,
  highlight,
  onDown,
  onUp,
  onKey,
}: {
  pads: PadSpec[];
  centsLabel: (p: PadSpec) => string | null;
  keyLabel: (p: PadSpec) => string | undefined;
  active: Set<string>;
  selected: { degree: number; periodIndex: number } | null;
  highlight: number | null;
  onDown: (e: React.PointerEvent<HTMLButtonElement>, p: PadSpec) => void;
  onUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onKey: (e: React.KeyboardEvent<HTMLButtonElement>, p: PadSpec, down: boolean) => void;
}) {
  const start = pads[0].col;
  const whites = pads.filter((p) => !BLACK.has(p.col % 12)).length;
  const w = 100 / whites;
  const bw = w * 0.6;
  const pos = (midi: number) => {
    const oct = Math.floor((midi - start) / 12);
    const pc = midi % 12;
    if (BLACK.has(pc)) return { left: (oct * 7 + BLACK_POS[pc]) * w - bw / 2, width: bw, black: true };
    const wi = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc];
    return { left: (oct * 7 + wi) * w, width: w, black: false };
  };
  const ordered = [...pads.filter((p) => !BLACK.has(p.col % 12)), ...pads.filter((p) => BLACK.has(p.col % 12))];

  return (
    <div className="piano" role="group" aria-label="Piano keyboard, three octaves. Each key plays the next scale degree.">
      {ordered.map((p) => {
        const { left, width, black } = pos(p.col);
        const isRoot = p.degree === 0;
        const kl = keyOf(p);
        const cl = centsLabel(p);
        return (
          <button
            key={p.id}
            type="button"
            className={[
              "pkey",
              black ? "pkey--ebony" : "pkey--ivory",
              isRoot ? "is-root" : "",
              active.has(p.id) ? "is-active" : "",
              selected?.degree === p.degree && selected.periodIndex === p.periodIndex ? "is-selected" : "",
              highlight === p.degree ? "is-highlight" : "",
            ].join(" ")}
            style={{ left: `${left}%`, width: `${width}%` }}
            aria-label={`${keyName(p.col)} key: ${isRoot ? "root" : `degree ${p.degree}`}, period ${p.periodIndex}${kl ? `, computer key ${kl}` : ""}`}
            aria-pressed={active.has(p.id)}
            onPointerDown={(e) => onDown(e, p)}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={(e) => onKey(e, p, true)}
            onKeyUp={(e) => onKey(e, p, false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {black && <span className="pkey-name">{keyName(p.col)}</span>}
            {kl && <span className="pkey-key">{kl}</span>}
            <span className="pkey-deg" title={cl ? `${cl}¢` : undefined}>{isRoot ? "R" : p.degree}</span>
            {!black && <span className="pkey-name">{keyName(p.col)}</span>}
          </button>
        );
      })}
    </div>
  );
}
