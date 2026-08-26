import './DetectionBadge.css'

// The bars are a purely decorative "device scanner reading" flourish, not
// a real visualization of the audio -- same spirit as the mini waveform in
// CapturePanel's dropzone (Phase 5 Part 6/7), just in the scan/cyan accent
// since this badge IS a detection, not a control. Fixed heights + staggered
// animation delays read as one continuous "scanning" motion.
const BAR_HEIGHTS = [45, 85, 100, 60, 75]

// 18th follow-up: real, previously-missing mockup detail -- 3 small
// staggered "sonar ping" ripples emanating from the pulsing dot and
// fading out (sig-ripple, index.css). Colors are literal, matching the
// mockup's own real values exactly (not app tokens) -- purely decorative
// and disconnected from any specific interval of the current chord, so
// hardcoding is the same pragmatic call already made for other one-off
// decorative mockup values elsewhere (e.g. About's GitHub pill).
const RIPPLE_COLORS = ['#8faf9b', '#8a7550', '#b6788a']

// Phase 5 Part 6/7 -- "the one bright moment on this page," per the design
// mockup's own comment: a live-reading detection badge, shown only when a
// chord was reached via audio identification (Results.jsx already gates
// this on `fromAudio`, unchanged). Built as its own reusable component
// since a future phase will likely wire the bars to live confidence data
// -- this pass only needs it to render and animate correctly against the
// existing static confidence value; how that value flows in is untouched.
function DetectionBadge({ chord, confidence }) {
  return (
    <span className="detection-badge">
      <span className="detection-badge__dot-wrap">
        {RIPPLE_COLORS.map((color, i) => (
          <span
            key={i}
            className="detection-badge__ripple"
            aria-hidden="true"
            style={{ background: color, animationDelay: `${0.1 + i * 0.15}s` }}
          />
        ))}
        <span className="detection-badge__dot" aria-hidden="true" />
      </span>
      <span className="detection-badge__bars" aria-hidden="true">
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="detection-badge__bar"
            style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </span>
      <span className="detection-badge__text">
        BetterChord detected {chord}!
        {confidence != null && (
          <span className="detection-badge__confidence"> (confidence: {(confidence * 100).toFixed(1)}%)</span>
        )}
      </span>
    </span>
  )
}

export default DetectionBadge
