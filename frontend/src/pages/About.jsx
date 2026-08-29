import Footer from '../components/Footer'
import './About.css'

const GITHUB_URL = 'https://github.com/andresrodriler/BetterChord'

// Static content page: hero copy, a 4-item stat strip, and prose
// sections. The stat numbers (92.96% / 696 / ~50K / 98%+) are real
// pipeline figures, hardcoded here.
function About() {
  return (
    <div className="section about-page">
      <h1>About BetterChord</h1>
      <p className="about-hero-copy">
        A tool for the moment you hear a chord and don't know its name -- identify it from real audio,
        then see how to actually play it: fretboard voicings organized by how commonly you'd use them,
        and real songs that use it.
      </p>

      <div className="panel about-stats">
        <div className="about-stats__item">
          <div className="about-stats__value readout">92.96%</div>
          <div className="about-stats__label">CNN test accuracy</div>
        </div>
        <div className="about-stats__item">
          <div className="about-stats__value readout">696</div>
          <div className="about-stats__label">Root-position chord classes</div>
        </div>
        <div className="about-stats__item">
          <div className="about-stats__value readout">~50K</div>
          <div className="about-stats__label">Training audio samples</div>
        </div>
        <div className="about-stats__item">
          <div className="about-stats__value readout">98%+</div>
          <div className="about-stats__label">Rule-based root accuracy</div>
        </div>
      </div>

      <section className="about-section">
        <h2>Why this exists</h2>
        <p>
          BetterChord started from a simple, recurring annoyance when I first picked up a guitar: seeing a
          chord on a recording or in a lesson, knowing roughly what it looked like, but not knowing its
          name, how it worked, how to voice it on the neck, or where else it shows up in songs worth
          learning.
        </p>
        <p>
          BetterChord is built to go the rest of the way. It will identify the chord from real audio, then
          hand you something useful. This is a personal project, built in my spare time, and by all means
          not perfect, but I hope it helps you learn guitar as much as it helped me. The ultimate goal,
          although very ambitious, is for BetterChord's pipeline to be able to understand whole songs,
          being able to give guitar tabs for any song based on the audio of the song.
        </p>
      </section>

      <section className="about-section">
        <h2>What's under the hood</h2>
        <div className="about-hood-grid">
          <div className="panel about-hood-card">
            <h3>Audio identification</h3>
            <p>
              A multi-task CNN, trained on ~50k samples across 696 chord classes, predicts notes, root,
              and bass directly from a recorded strum. Naming happens downstream, rule-based, so a new
              chord quality never requires retraining.
            </p>
          </div>
          <div className="panel about-hood-card">
            <h3>Backend</h3>
            <p>
              A FastAPI service wraps the inference pipeline plus two SQLite databases -- fretboard
              voicings (Must Know / Other / Capo, interval-labeled) and real songs indexed by chord --
              over clean, chord-string-aware REST endpoints.
            </p>
          </div>
          <div className="panel about-hood-card">
            <h3>Frontend</h3>
            <p>
              A React app handles recording/upload, manual search with live autocomplete, and renders
              every voicing as a real, interval-colored fretboard diagram -- generated live from the
              actual data, not a static image.
            </p>
          </div>
        </div>
      </section>

      <div className="panel about-section-card">
        <h2>Who's behind this</h2>
        <p>
          BetterChord is a one-person project, built, designed, and maintained entirely by me -- Andres
          Leroux, an incoming sophomore at UC Merced studying data science. I got hooked on tech after
          building my own video game in high school, which pulled me toward data science. I started
          guitar recently, and wanted a project that combined the two: putting the data-science
          experience I've been building toward something I actually care about.
        </p>
        <p>
          I hope it's the kind of tool that helps beginners the way I wish I'd had something like it when
          I was starting out -- and that it pushes me to keep building more tools like it.
        </p>
      </div>

      <div className="panel about-section-card">
        <h2>Source</h2>
        <p>BetterChord is open source. The data isn't public yet -- I hope to change that eventually.</p>
        <div className="about-source-grid">
          <div>
            <div className="about-source-grid__label">Public -- code</div>
            <ul className="about-source-list">
              <li><span className="about-source-list__mark about-source-list__mark--yes">✓</span> Training pipeline</li>
              <li><span className="about-source-list__mark about-source-list__mark--yes">✓</span> Chord theory engine</li>
              <li><span className="about-source-list__mark about-source-list__mark--yes">✓</span> Backend</li>
              <li><span className="about-source-list__mark about-source-list__mark--yes">✓</span> Frontend</li>
            </ul>
          </div>
          <div>
            <div className="about-source-grid__label">Not yet public -- data</div>
            <ul className="about-source-list">
              <li><span className="about-source-list__mark about-source-list__mark--no">✗</span> Audio samples</li>
              <li><span className="about-source-list__mark about-source-list__mark--no">✗</span> Song database</li>
              <li><span className="about-source-list__mark about-source-list__mark--no">✗</span> Fretboard voicings</li>
              <li><span className="about-source-list__mark about-source-list__mark--no">✗</span> Trained CNN model</li>
            </ul>
          </div>
        </div>
        <a className="btn btn-primary about-github-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          View on GitHub
        </a>
      </div>

      <Footer />
    </div>
  )
}

export default About
