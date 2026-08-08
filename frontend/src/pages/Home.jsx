import { Link } from 'react-router-dom'
import CapturePanel from '../components/CapturePanel'
import './Home.css'

function Home() {
  return (
    <>
      <div className="section home-hero">
        <h1>BetterChord</h1>
        <p>
          Record or upload a guitar chord and BetterChord will identify it,
          then show you fretboard voicings and songs that use it. Or just
          search for a chord by name below.
        </p>

        <div style={{ marginTop: 24, textAlign: 'left' }}>
          <CapturePanel />
        </div>
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
    </>
  )
}

export default Home
