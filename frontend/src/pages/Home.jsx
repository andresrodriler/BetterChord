import { Link } from 'react-router-dom'
import AmbientFretboards from '../components/AmbientFretboards'
import CapturePanel from '../components/CapturePanel'
import './Home.css'

function Home() {
  return (
    <div className="home-page">
      {/* Phase 5 Part 6/7, Home polish follow-up: moved up from inside
          `.home-hero` to be a sibling of both `.home-hero` and
          `.home-teasers` -- the ambient shapes now cover the whole page
          (AmbientFretboards.css's own container is positioned relative
          to this new `.home-page` wrapper, not just the hero), not just
          the hero section. `.home-page` is a real, new wrapping element
          (replacing the bare `<>` fragment) purely so there's something
          for that container to size itself against -- no other layout
          change. */}
      <AmbientFretboards />
      <div className="section home-hero">
        {/* Phase 5 Part 6/7, 8th follow-up: real content adoption from the
            Home mockup, not just materiality -- see CLAUDE.md for the full
            per-element reasoning (which mockup pieces map to which reused
            style, and which pieces were deliberately left out). */}
        <div className="home-hero__eyebrow">AUDIO TO CHORD, INSTANTLY</div>
        <h1>
          {/* Phase 5 Part 6/7, 9th follow-up: real, confirmed mockup
              distinction -- .brand__accent alone (color + italic, no
              glow) is what the mockup's OWN header logo "Chord" uses,
              but the mockup's much larger h1 "Chord it." span has its
              OWN additional text-shadow glow the logo doesn't (checked
              both directly: header logo textShadow: none; h1 span
              textShadow: rgba(200,155,92,0.5) 0 0 18px -- confirmed via
              computed style, not assumed). .home-hero__heading-glow adds
              just that one extra property on top of .brand__accent,
              reserved for this one large, prominent instance -- the
              tagline's own smaller "Chord it." below stays plain,
              matching the header logo's own precedent, not a third,
              in-between treatment. */}
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

        <div style={{ marginTop: 16, textAlign: 'left' }}>
          <CapturePanel />
        </div>

        {/* Phase 5 Part 6/7, Home polish follow-up (2nd round): the stat
            line and the confidence pill are now treated as ONE combined
            block, centered together in the gap between the capture box
            above and the first teaser card below -- previously each had
            its own separately-tuned margin-top (12px / 28px) that
            happened to land close by coincidence, not by a real
            calculation. `.home-hero__stats-group`'s own `margin-top`
            (Home.css) is the ONE value that positions the whole group
            within that gap; the `gap` between the two children is the
            real, unchanged internal spacing (28px, was
            `.home-hero__confidence`'s own margin-top) -- moving the
            group never touches that. See Home.css for the real
            getBoundingClientRect() measurements this was calculated
            from. */}
        <div className="home-hero__stats-group">
          {/* Real, verified counts (checked directly against the live data
              this round, not guessed): 45,058 real rows in
              data/voicing_data/voicings.db, 31,140 real rows in
              data/song_data/betterchord_songs.db (already correctly
              rounded down to "30k+" below -- unchanged). These are
              hardcoded, same as the confidence badge's own real "91%"
              below -- both are periodic snapshots of data that only
              changes when the data pipeline is rerun, not something
              worth a live API call for (none of the 3 figures on this
              line are live-queried -- confirmed by reading this file,
              not assumed). If the data pipeline is ever rerun,
              re-verify these numbers the same way (a plain
              `len()`/`COUNT(*)` against the real files) before trusting
              them again.

              "95 chord types" (the registry's own quality count) was
              REPLACED this round -- it measured something real, but the
              wrong thing for a claim about voicing coverage (a
              theoretical quality count, not what's actually backed by
              real voicing data). The real, direct query that belongs
              here is `SELECT COUNT(DISTINCT chord) FROM voicings` --
              7,922 distinct chord SYMBOLS (e.g. "C", "Dm7b5", "C/E" are
              each counted separately -- this necessarily includes real
              slash/inversion variants, not just root+quality
              combinations, since `chord` is the column that actually
              names what a person searches for). Sanity-checked before
              trusting the number: 12 roots x 93 distinct qualities
              *actually present in this table* (not the registry's own
              95 -- voicings.db's own real coverage is a few short of
              full registry coverage, expected) gives a plain
              root-position ceiling of ~1,116 -- confirmed directly that
              1,081 of the 7,922 are plain (non-slash) chords, close to
              that ceiling as expected, and the remaining 6,841 are real
              slash/inversion variants, which is why the total is much
              higher than the root x quality ceiling alone -- not a
              bug, a real reflection of this app's own inversion
              coverage. Rounded down to "7k+" -- nearest-1k, matching
              "45k+"'s own granularity (not "30k+"'s nearest-10k step,
              which would round this down to a meaningless "0k+"). */}
          <div className="home-hero__tags">
            <span>45k+ real voicings</span>
            <span className="home-hero__tags-dot">&middot;</span>
            <span>7k+ chord types</span>
            <span className="home-hero__tags-dot">&middot;</span>
            <span>30k+ songs</span>
          </div>

          {/* Real accuracy claim, not the mockup's own placeholder number --
              reuses .badge/.badge__dot verbatim (the same scan-accent "here's
              a live stat" pill already used for the audio-identify confidence
              readout on Results), no new visual language. */}
          <span className="badge home-hero__confidence">
            <span className="badge__dot" />
            <strong className="home-hero__confidence-value">91%</strong> accuracy on test data
          </span>
        </div>

        {/* Phase 5 Part 6/7, 15th follow-up: the hero-featured CNN-explainer
            card that lived here (a duplicate of the teaser row's own first
            item below) is REMOVED -- a deliberate reversal, not a bug fix.
            The dual placement was a deliberate choice from an earlier round
            (see the "Part 6 of 6" entry, "resolved as... NOT a duplicate...
            a deliberate reading of the instructions"), kept there
            intentionally through the whole decoder round. On reflection,
            after actually seeing it rendered twice on the page, the person
            decided one placement reads better than two. The teaser row
            below is untouched -- still the real, single home for this
            content. */}
      </div>

      {/* Phase 3 Part 6/6: short teaser hooks linking out to /how-it-works
          and /about -- intentionally brief, not a summary of either page. */}
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
    </div>
  )
}

export default Home
