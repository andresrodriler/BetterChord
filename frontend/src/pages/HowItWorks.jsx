import './HowItWorks.css'

const STAGES = [
  {
    title: '1. Audio capture',
    body: (
      <>
        You record through the browser's microphone or upload a file. Mic
        constraints that are normally on by default for voice calls
        (echo cancellation, noise suppression, auto gain) are explicitly
        disabled -- they distort a guitar chord's actual harmonic content --
        and the recording is captured at a higher bitrate than the browser's
        default, both changes measurably improving downstream accuracy.
      </>
    ),
  },
  {
    title: '2. CNN classification',
    body: (
      <>
        The audio is resampled and turned into a spectrogram, then fed to a
        multi-task convolutional neural network. It doesn't predict a fixed
        list of chord names -- it predicts three things directly from the
        audio: which notes are sounding, the root, and the bass note. That
        split is deliberate: adding a new chord quality to the app later
        never requires retraining the model, since naming happens in the
        next stage.
      </>
    ),
  },
  {
    title: '3. Chord parsing & theory registry',
    body: (
      <>
        The model's raw notes/root/bass get turned into an actual chord name
        by a rule-based theory engine, then every chord string in the app
        flows through one shared parser (<code className="mono">chord_parser.py</code>)
        -- root, quality, and bass are never split by ad-hoc string logic,
        which has been a real, repeated source of bugs here. Ultimately, the rule-based approach reached 98%+ root accuracy on the test data set on
        its own!
      </>
    ),
  },
  {
    title: '4. Voicing lookup',
    body: (
      <>
        The identified chord is looked up in a dedicated voicings database --
        real fretboard shapes, grouped into Must Know, Other, and Capo
        sections, each voicing tagged with the actual interval each fretted
        note plays. That's what powers the color-coded, interval-labeled
        fretboard diagrams you see on the results page, generated live from
        this data rather than pulled from static images.
      </>
    ),
  },
  {
    title: '5. Song lookup',
    body: (
      <>
        In parallel, the chord is looked up in a separate songs database,
        returning real songs that use it -- title, artist, and the chord used in it. It also includes other information, such as an embedded Youtube link and Spotify link to listen to directly here. If you end up liking a song, you can click through the Ultimate Guitar link to see the full tab and learn it yourself!
      </>
    ),
  },
  {
    title: '6. Guide-tone connections',
    body: (
      <>
        Where relevant, the results page also surfaces guide-tone
        relationships -- chords that share the same essential 3rd/7th
        "guide tones" as the one you looked up, a short callout explaining
        the connection between the two.
      </>
    ),
  },
]

function HowItWorks() {
  return (
    <div className="section how-it-works-page">
      <h1>How BetterChord Works</h1>
      <p className="how-it-works-intro">
        From a recorded strum (or a typed chord name) to voicings and songs,
        here's the real pipeline behind the app -- no black box.
      </p>

      <div className="how-it-works-flow" role="list">
        {STAGES.map((stage, i) => (
          <div className="how-it-works-flow__stage" role="listitem" key={stage.title}>
            <div className="how-it-works-flow__node readout">{i + 1}</div>
            {i < STAGES.length - 1 && <div className="how-it-works-flow__connector" aria-hidden="true" />}
          </div>
        ))}
      </div>

      <div className="how-it-works-stack">
        {STAGES.map((stage) => (
          <div className="panel how-it-works-block" key={stage.title}>
            <h2>{stage.title}</h2>
            <p>{stage.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HowItWorks
