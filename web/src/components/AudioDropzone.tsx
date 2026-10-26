import { Lock, Upload } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ACCEPT_ATTR } from "../lib/audio/decode";

export interface DropzoneHandle {
  open: () => void;
  focus: () => void;
}

export const AudioDropzone = forwardRef<DropzoneHandle, { onFile: (f: File) => void; disabled?: boolean }>(
  function AudioDropzone({ onFile, disabled }, ref) {
    const input = useRef<HTMLInputElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const [over, setOver] = useState(false);
    const depth = useRef(0);

    useImperativeHandle(ref, () => ({
      open: () => input.current?.click(),
      focus: () => button.current?.focus(),
    }));

    const take = (files: FileList | null) => {
      const f = files?.[0];
      if (f && !disabled) onFile(f);
    };

    return (
      <div
        className={`dropzone${over ? " is-over" : ""}${disabled ? " is-disabled" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current++;
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setOver(false);
          take(e.dataTransfer.files);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) input.current?.click();
        }}
      >
        <svg className="dropzone-emblem" viewBox="0 0 120 40" aria-hidden="true">
          {Array.from({ length: 31 }, (_, i) => {
            const x = 4 + i * 3.73;
            const env = Math.exp(-Math.pow((i - 9) / 9, 2)) * 0.9 + 0.08;
            const h = Math.max(1.5, Math.abs(Math.sin(i * 1.7) * 0.6 + 0.4) * env * 34);
            return <line key={i} x1={x} x2={x} y1={20 - h / 2} y2={20 + h / 2} />;
          })}
        </svg>
        <h3 className="dropzone-title">Begin with a sound.</h3>
        <p className="dropzone-text">Bring a single note, a bell strike, a gong, or another resonant sound.</p>
        <button ref={button} type="button" className="btn btn--brass" onClick={() => input.current?.click()} disabled={disabled}>
          <Upload size={16} strokeWidth={1.6} aria-hidden="true" />
          Choose an audio file
        </button>
        <p className="dropzone-or">or drop it anywhere on this sheet</p>
        <dl className="dropzone-specs">
          <div>
            <dt>Formats</dt>
            <dd>WAV · MP3 · FLAC · OGG</dd>
          </div>
          <div>
            <dt>Max size</dt>
            <dd>20 MB</dd>
          </div>
          <div>
            <dt>Analysed</dt>
            <dd>up to 30 s</dd>
          </div>
        </dl>
        <p className="dropzone-privacy">
          <Lock size={12} strokeWidth={1.6} aria-hidden="true" />
          Your audio is processed for analysis and is not stored.
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTR}
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Choose an audio file"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    );
  },
);
