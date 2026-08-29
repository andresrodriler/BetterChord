import { useRef } from 'react'
import { Link } from 'react-router-dom'
import AmbientFretboards from '../components/AmbientFretboards'
import CapturePanel from '../components/CapturePanel'
import Footer from '../components/Footer'
import './Home.css'

function Home() {
  // The CTA below scrolls back to this element. A ref, not a `#anchor`,
  // so the smooth-scroll call is explicit.
  const captureRef = useRef(null)

  function scrollToCapture() {
    captureRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="home-page">
      {/* Sibling of both .home-hero and .home-teasers so its shapes
          cover the whole page; .home-page exists only to give it a
          positioned container. */}
      <AmbientFretboards />
      <div className="section home-hero">
        <div className="home-hero__eyebrow">AUDIO TO CHORD, INSTANTLY</div>
        <h1>
          {/* .brand__accent (color + italic) matches the header logo;
              .home-hero__heading-glow adds a text-shadow glow reserved
              for this one large heading. The smaller tagline accent
              below stays plain. */}
          Better<span className="brand__accent home-hero__heading-glow">Chord</span>
        </h1>
        <p className="home-hero__tagline">
          Hear it. <span className="brand__accent">Chord it.</span> Find it again.
        </p>
        <p className="home-hero__description">
          Record or upload the <strong>single strum</strong> of a guitar chord and BetterChord will identify it,
          then show you fretboard voicings and songs that use it. Or just
          search for a chord by name below.
        </p>

        <div ref={captureRef} style={{ marginTop: 16, textAlign: 'left' }}>
          <CapturePanel />
        </div>

        {/* Stat line + confidence pill as one centered block. Its own
            margin-top positions the group in the gap between the capture
            box and the first teaser card; its `gap` sets the spacing
            between the two children (see Home.css). */}
        <div className="home-hero__stats-group">
          {/* Hardcoded snapshots of pipeline data, not live-queried:
              45,058 rows in voicings.db, 31,140 in betterchord_songs.db,
              and `SELECT COUNT(DISTINCT chord) FROM voicings` = 7,922
              distinct chord symbols (includes slash/inversion variants).
              Re-run those counts if the data pipeline changes. Rounded
              down for display. */}
          <div className="home-hero__tags">
            <span>45k+ real voicings</span>
            <span className="home-hero__tags-dot">&middot;</span>
            <span>7k+ chord types</span>
            <span className="home-hero__tags-dot">&middot;</span>
            <span>30k+ songs</span>
          </div>

          {/* Reuses .badge/.badge__dot -- the same scan-accent stat pill
              used for the audio-identify confidence readout on Results. */}
          <span className="badge home-hero__confidence">
            <span className="badge__dot" />
            <strong className="home-hero__confidence-value">91%</strong> accuracy on test data
          </span>
        </div>

      </div>

      {/* Brief orientation for a first-time visitor -- the two ways in
          (record/upload vs. search by name), plus a smooth-scroll link
          back up to the capture box. */}
      <div className="home-hero__directions">
        {/* Plain informational title (reuses the shared h3 base), not a
            link -- moss, like ChordOverview's kickers, not the teasers'
            brass. */}
        <h3 className="home-hero__directions-title">New here?</h3>
        <p className="home-hero__directions-body">
          Record or upload the audio of a single strum of a chosen chord in the box above, or search a chord
          by name if you already know it. Both paths land on the same results page: real fretboard voicings,
          songs that use the chord, and the theory behind it.
        </p>
        <button type="button" className="home-hero__cta" onClick={scrollToCapture}>
          Ready to record? <span aria-hidden="true">&uarr;</span>
        </button>
      </div>

      {/* Short teaser hooks out to /how-it-works and /about -- not a
          summary of either page. */}
      <div className="section home-teasers">
        <Link to="/how-it-works" className="home-teaser panel">
          <h3>See how the CNN identifies your chord &rarr;</h3>
          <p>A neural net predicts the notes straight from your recording -- here's the full pipeline from audio to chord name.</p>
        </Link>
        <Link to="/about" className="home-teaser panel">
          <h3>Why I built this &rarr;</h3>
          <p>The motivation behind BetterChord, and a quick tour of the stack running underneath it.</p>
        </Link>
        <a
          className="home-teaser panel"
          href="https://github.com/andresrodriler/BetterChord"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h3>Browse the source &rarr;</h3>
          <p>BetterChord is open source, available to see on GitHub.</p>
        </a>
      </div>

      <Footer />
    </div>
  )
}

export default Home
