import { ArrowRight, Bell, Waves } from "lucide-react";
import type { RefObject } from "react";
import { AudioDropzone, type DropzoneHandle } from "./AudioDropzone";
import { ErrorNotice } from "./ErrorNotice";
import { HeroArtwork } from "./HeroArtwork";

export function LandingPage({
  onFile,
  onReference,
  onCompose,
  error,
  onDismissError,
  dropzoneRef,
  busy,
}: {
  onFile: (f: File) => void;
  onReference: (kind: "bell" | "harmonic") => void;
  onCompose: () => void;
  error: unknown | null;
  onDismissError: () => void;
  dropzoneRef: RefObject<DropzoneHandle | null>;
  busy: boolean;
}) {
  return (
    <main id="main" className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Timbre-driven tuning · Acoustic research instrument</p>
          <h1 id="hero-title" className="hero-title">
            Every sound
            <br />
            has its own
            <br />
            <em>harmony.</em>
          </h1>
          <p className="hero-lede">
            Discover the hidden intervals within a sound. Transform its overtones into a playable musical scale, tuned to
            the character of the instrument itself.
          </p>
          <div className="hero-ctas">
            <button type="button" className="btn btn--brass btn--lg" onClick={onCompose} disabled={busy}>
              Compose a Scale
              <ArrowRight size={17} strokeWidth={1.6} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => onReference("bell")} disabled={busy}>
              <Bell size={17} strokeWidth={1.5} aria-hidden="true" />
              Explore a Bell
            </button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="false">
          <HeroArtwork />
        </div>
      </section>

      <section className="principles" aria-label="Principles">
        {[
          ["I", "Analyze", "Reveal the overtones within a sound."],
          ["II", "Discover", "Find intervals with lower sensory roughness."],
          ["III", "Play", "Explore a scale shaped by the instrument."],
        ].map(([n, h, t]) => (
          <div className="principle" key={n}>
            <span className="principle-num">{n}</span>
            <div>
              <h2 className="principle-title">{h}</h2>
              <p className="principle-text">{t}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="upload-section" id="upload" aria-labelledby="upload-title">
        <div className="section-head">
          <p className="eyebrow">The Instrument</p>
          <h2 id="upload-title" className="section-title">
            Place a sound on the desk.
          </h2>
          <p className="section-lede">
            Short, clean recordings of a single note give the clearest results. The analysis takes a few seconds.
          </p>
        </div>
        <div className="upload-sheet">
          {error ? (
            <ErrorNotice
              error={error}
              actions={
                <>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => { onDismissError(); dropzoneRef.current?.open(); }}>
                    Choose another file
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={onDismissError}>
                    Dismiss
                  </button>
                </>
              }
            />
          ) : null}
          <AudioDropzone ref={dropzoneRef} onFile={onFile} disabled={busy} />
          <div className="reference-options">
            <button type="button" className="link-btn" onClick={() => onReference("bell")} disabled={busy}>
              <Bell size={15} strokeWidth={1.5} aria-hidden="true" />
              No recording? <span>Explore a reference bell.</span>
            </button>
            <button type="button" className="link-btn link-btn--quiet" onClick={() => onReference("harmonic")} disabled={busy}>
              <Waves size={15} strokeWidth={1.5} aria-hidden="true" />
              Or compare with a <span>harmonic reference tone.</span>
            </button>
          </div>
          <p className="reference-note">
            Reference sounds are synthesised in your browser (an additive bell model and a ten-harmonic tone) and analysed
            exactly like an upload.
          </p>
        </div>
      </section>

      <section className="how" id="how" aria-labelledby="how-title">
        <div className="section-head">
          <p className="eyebrow">How It Works</p>
          <h2 id="how-title" className="section-title">
            From overtones to intervals.
          </h2>
        </div>
        <ol className="how-steps">
          <li>
            <span className="how-num">01</span>
            <h3>Listen to the partials</h3>
            <p>
              An averaged, zero-padded FFT finds the sinusoidal partials of your sound — harmonic or not — and measures
              their frequencies to a fraction of a hertz.
            </p>
          </li>
          <li>
            <span className="how-num">02</span>
            <h3>Measure roughness</h3>
            <p>
              Using the Plomp–Levelt model as parameterised by Sethares, we compute how rough the sound becomes against a
              transposed copy of itself, cent by cent across the period.
            </p>
          </li>
          <li>
            <span className="how-num">03</span>
            <h3>Choose smoother intervals</h3>
            <p>
              The deepest valleys of that curve seed the scale. An optimiser then nudges every note to lower the
              roughness of the scale as a whole, while keeping notes apart.
            </p>
          </li>
          <li>
            <span className="how-num">04</span>
            <h3>Play, compare, export</h3>
            <p>
              Your own sample becomes the instrument. Switch to 12-TET to hear the difference, then export Scala
              <code>.scl</code> and <code>.kbm</code> files for your synth or DAW.
            </p>
          </li>
        </ol>
        <p className="how-note">
          A note on language: the model measures <em>sensory roughness</em> — the beating of nearby partials. Lower
          roughness often sounds smoother, but consonance is also cultural, so we never call an interval “perfect”.
        </p>
      </section>

      <footer className="site-footer">
        <div>
          <p className="footer-brand">Acoustic Atelier</p>
          <p className="footer-text">
            Built on W. Sethares, <em>Tuning, Timbre, Spectrum, Scale</em> (2005) and R. Plomp &amp; W. Levelt, “Tonal
            Consonance and Critical Bandwidth” (1965).
          </p>
        </div>
        <p className="footer-text footer-privacy">
          Audio is analysed in memory and discarded after each request. Nothing is stored or used for training.
        </p>
      </footer>
    </main>
  );
}
