import './About.css'

const GITHUB_URL = 'https://github.com/andresrodriler/BetterChord'

function About() {
  return (
    <div className="section about-page">
      <h1>About BetterChord</h1>

      <div className="panel about-block">
        <h2>Why this exists</h2>
        <p>
          BetterChord started from a simple, recurring annoyance when I first picked up a guitar: seeing a chord
          on a recording or in a lesson, knowing roughly what it looked like, but
          not knowing its name, how the chord worked, how to voice it on the neck, or where else it
          shows up in songs worth learning. I wanted a fast way to bridge that gap, to learn
          about the chord and how to play it. 
             </p>
        <p>     
          BetterChord is built to go the rest of the way: identify
          the chord from real audio, then actually hand you something useful. From the chord of your choice, BetterChord will show you
          multiple fretboard voicings organized by how commonly you'd play them,
          and real songs that use it based on Ultimate Guitar. This is a personal project, built in my spare time, and by all means, not perfect. 
          With that said, I hope it helps you learn guitar as much as it helped me.
        </p>
      </div>

      <div className="panel about-block">
        <h2>What's under the hood</h2>
        <ul className="about-stack">
          <li>
            <span className="about-stack__label">Audio identification</span>
            <p>
              A multi-task convolutional neural network, trained on ~50k audio
              samples across 696 root-position chord classes, predicts raw notes,
              root, and bass directly from a recorded or uploaded strum --{' '}
              <strong className="readout">92.96%</strong> test-set accuracy.
              Worth noting, on outside source data, coming from you, I expect this accuracy 
              to vary, especially for less common chord shapes. Chord naming itself 
              happens downstream, rule-based, so the model
              never has to be retrained just to teach the app a new chord
              quality.
            </p>
          </li>
          <li>
            <span className="about-stack__label">Backend</span>
            <p>
              A FastAPI service wraps the inference pipeline plus two SQLite
              databases -- one for fretboard voicings (Must Know / Other / Capo,
              interval-labeled), one for real songs indexed by the chords they
              use -- and exposes them over a handful of clean, chord-string-aware
              REST endpoints.
            </p>
          </li>
          <li>
            <span className="about-stack__label">Frontend</span>
            <p>
              A React single-page app handles recording/upload, manual search
              with live autocomplete, and renders every voicing as a real,
              interval-colored fretboard diagram -- not a static image, generated
              live from the actual fret/interval data returned by the backend.
            </p>
          </li>
        </ul>
      </div>

      <div className="panel about-block">
        <h2>Who's behind this</h2>
        <p>
          BetterChord is a one-person project. It was built, designed, and maintained
          entirely by me, Andres Leroux. I'm an incoming sophomore at UC Merced,
          studying data science.
        </p>
        <p>
          I got hooked on tech and computer science after building my own video
          game in high school. That project is what pulled me toward data
          science in the first place. Outside of that, I started my
          guitar recently, and I wanted a project that let me combine the two. The end goal was to put the
          data science experience I've been building, through coursework,
          personal projects, and work experience, toward something I actually
          care about on the guitar side.
        </p>
        <p>
          BetterChord is one step in that direction, and in my career more
          broadly. I hope it's the kind of tool that helps beginners the way I
          wish I'd had something like it when I was starting out -- and that it
          pushes me to keep building more tools like it.
        </p>
        <p>
          The long-term goal, admittedly ambitious for one person, is a tool
          that can take any song and output real guitar tab for it.
          Companies have already taken a swing at that exact problem, without
          fully solving it. I don't know yet if it's something I can pull off
          alone, but it's the direction I'd like to keep pushing BetterChord
          toward.
        </p>
      </div>

      <div className="panel about-block">
        <h2>Source</h2>
        <p>
          BetterChord is open source. The codebase -- training pipeline,
          chord theory engine, backend, and frontend -- is published. The data -- audio samples, song database, fretboard voicings, the CNN model -- is not, for now. I hope to make the data available in the future, but for now, you can view the code and contribute on GitHub:
        </p>
        <a className="btn btn-primary about-github-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          View on GitHub
        </a>
      </div>
    </div>
  )
}

export default About
