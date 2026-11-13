const TOC = [
  ["start", "Getting started"],
  ["play", "Playing the instrument"],
  ["read", "Reading the analysis"],
  ["params", "Analysis parameters"],
  ["export", "Exports"],
  ["api", "API"],
  ["method", "Method & references"],
  ["privacy", "Privacy"],
] as const;

export function Documentation() {
  return (
    <main id="main" className="docs">
      <header className="docs-head">
        <p className="eyebrow">Documentation</p>
        <h1 className="docs-title">The Atelier Handbook</h1>
        <p className="section-lede">Everything you need to turn a recording into a tuning — and to know what the numbers mean.</p>
      </header>
      <div className="docs-layout">
        <nav className="docs-toc" aria-label="Contents">
          <ol>
            {TOC.map(([id, l]) => (
              <li key={id}>
                <a
                  href={`#/docs/${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {l}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="docs-body">
          <section id="doc-start">
            <h2>Getting started</h2>
            <p>
              Drop a short recording of a single resonant sound onto the upload sheet — a bell, a gong, a struck pipe, a
              piano note, a prepared string. WAV, MP3, FLAC and OGG files up to 20 MB and 60 seconds are accepted; up to 30
              seconds are analysed.
            </p>
            <p>
              Good samples are <strong>clean and isolated</strong>: one note, little reverb or background noise, and enough
              ring to measure (at least 150 ms). Chords, full mixes and noisy recordings produce cluttered spectra and less
              useful scales.
            </p>
          </section>

          <section id="doc-play">
            <h2>Playing the instrument</h2>
            <p>
              Every pad is one degree of the generated scale. Rows are offset by a fixed number of degrees, so any interval
              shape looks the same wherever you play it (an <em>isomorphic</em> layout). Root pads are marked <b>R</b>; the
              small <b>P</b> number shows which period (octave or pseudo-octave) they belong to.
            </p>
            <ul>
              <li>Click, tap, or use your computer keyboard: the four rows map to <kbd>Z</kbd>–<kbd>/</kbd>, <kbd>A</kbd>–<kbd>'</kbd>, <kbd>Q</kbd>–<kbd>]</kbd> and <kbd>1</kbd>–<kbd>=</kbd>.</li>
              <li>Up to 16 voices sound at once; the oldest is released when you exceed that.</li>
              <li><b>Root</b> sets which pitch the root pad plays. <b>Native</b> plays the sample at its own pitch.</li>
              <li><b>12-TET</b> plays the same scale with every degree moved to its own nearest semitone — the fairest comparison with standard tuning.</li>
              <li><b>Pads / Keys</b> switches between the isomorphic pad grid and a piano-style keyboard (two periods, one key per scale step). Your choice is remembered.</li>
              <li>The <b>ADSR</b> sliders shape every note: attack, decay, sustain level and release. With sustain above 0% the analysed part of the sample loops smoothly while a key is held; at 0% the sample plays once and dies away. Presets: Bell (natural), Pluck, Pad, Organ.</li>
              <li>Extra details — the sound summary, analysis parameters and exports — open as pop-ups from <b>About</b>, <b>Refine</b> and <b>Export</b>.</li>
            </ul>
            <p>Audio starts after your first interaction with the page, as browsers require.</p>
          </section>

          <section id="doc-read">
            <h2>Reading the analysis</h2>
            <h3>Spectrum</h3>
            <p>
              The averaged magnitude spectrum of the analysis region, on a logarithmic frequency axis. Brass markers are the
              detected partials, refined to sub-bin accuracy. The dashed line is the peak threshold.
            </p>
            <h3>Dissonance curve</h3>
            <p>
              For every interval from the unison to the period (in 1-cent steps), the total sensory roughness of the sound
              played together with a copy of itself transposed by that interval. Valleys are intervals where the partials
              of the two copies line up or stay clear of each other's critical bands — <em>low-roughness intervals</em>.
              Vertical brass lines are the chosen scale degrees.
            </p>
            <h3>Scale table</h3>
            <p>
              Each degree's size in cents, its nearest 12-TET note (named relative to the instrument's root) and deviation,
              the simplest whole-number ratio within 15 cents, and its roughness against all other degrees. Notes marked{" "}
              <em>fill</em> were not at a curve minimum and were placed at the smoothest remaining position.
            </p>
          </section>

          <section id="doc-params">
            <h2>Analysis parameters</h2>
            <dl className="docs-dl">
              <dt>Target notes (3–24, default 7)</dt>
              <dd>Notes per period, counting the period but not the unison — the number written on line 3 of the .scl file.</dd>
              <dt>Period</dt>
              <dd>Octave (1200¢), a stretched period of your choice (600–2400¢), or Automatic: the deepest curve minimum between 1100¢ and 1300¢, falling back to the octave if none exists.</dd>
              <dt>Maximum partials (4–24, default 12)</dt>
              <dd>The strongest partials used in the model. Too many can flatten the curve.</dd>
              <dt>Peak threshold (default −60 dB)</dt>
              <dd>Peaks quieter than this, relative to the strongest, are ignored.</dd>
              <dt>Minimum spacing (15–100¢, default 40¢)</dt>
              <dd>Prevents generated notes from clustering. It is reduced automatically, with a note, if the requested number of notes cannot fit.</dd>
              <dt>Analysis window</dt>
              <dd>FFT frame length. Frames overlap by 50%, use a Blackman–Harris window and are zero-padded at least 8×.</dd>
              <dt>Analysis region</dt>
              <dd>Automatic: 100–500 ms after the attack for struck sounds, the steady middle half for sustained ones. You can drag a custom region on the waveform.</dd>
            </dl>
          </section>

          <section id="doc-export">
            <h2>Exports</h2>
            <p>
              <code>.scl</code> follows the Scala specification: a comment line, a description, the note count, then one
              pitch per line in cents with five decimals, ending with the period. <code>.kbm</code> is a linear keyboard
              mapping that tunes the chosen root key to the instrument's current root frequency. <code>.json</code> contains
              the partials, the full curve, the scale and every parameter, for reproducibility.
            </p>
            <p>
              Load both Scala files in Surge XT (<em>Menu → Tuning</em>), Vital (<em>Advanced → Tuning</em>), Pianoteq or
              any MTS-ESP/Scala-aware tool. The same file and parameters always produce byte-identical <code>.scl</code>{" "}
              output.
            </p>
          </section>

          <section id="doc-api">
            <h2>API</h2>
            <p>
              <code>POST /api/analyze</code> takes <code>multipart/form-data</code> with <code>file</code> and optional{" "}
              <code>notes</code>, <code>period</code> (<code>octave</code> | <code>stretched</code> | <code>auto</code>),{" "}
              <code>period_cents</code>, <code>max_partials</code>, <code>min_spacing_cents</code>,{" "}
              <code>peak_threshold_db</code>, <code>window_length</code>, <code>region_start_ms</code>,{" "}
              <code>region_end_ms</code>. It returns partials, spectrum, curve, scale and export text. Errors return{" "}
              <code>{"{ code, message }"}</code> with codes such as <code>SIGNAL_TOO_QUIET</code> or{" "}
              <code>NO_PARTIALS_FOUND</code>.
            </p>
            <p>
              <code>POST /api/export</code> renders <code>.scl</code>/<code>.kbm</code> for a list of cents.{" "}
              <code>GET /api/health</code> reports status. Interactive schema: <a href="/api/docs">/api/docs</a>.
            </p>
          </section>

          <section id="doc-method">
            <h2>Method &amp; references</h2>
            <p>
              Roughness between two partials uses the Plomp–Levelt curve as parameterised by Sethares:{" "}
              <code>d = min(a₁,a₂)·(e^(−3.5·s·Δf) − e^(−5.75·s·Δf))</code>, with{" "}
              <code>s = 0.24 / (0.0207·f_min + 18.96)</code>. Candidate notes come from the most prominent curve minima;
              an L-BFGS-B optimiser then moves each note by at most ±25¢ to lower the total pairwise roughness of the whole
              scale, with a penalty that keeps notes apart.
            </p>
            <ul className="refs">
              <li>W. A. Sethares, <em>Tuning, Timbre, Spectrum, Scale</em>, 2nd ed., Springer, 2005.</li>
              <li>R. Plomp &amp; W. J. M. Levelt, “Tonal Consonance and Critical Bandwidth,” <em>JASA</em> 38, 1965.</li>
              <li>Scala scale (.scl) and keyboard mapping (.kbm) formats, Huygens-Fokker Foundation.</li>
            </ul>
          </section>

          <section id="doc-privacy">
            <h2>Privacy</h2>
            <p>
              Your browser decodes the file and sends a mono copy of at most 30 seconds to the analysis server, where it is
              processed in memory and discarded after the response. Nothing is stored, logged or used for training.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
