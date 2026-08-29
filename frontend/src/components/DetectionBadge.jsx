import './DetectionBadge.css'

// The bars are a decorative "device scanner reading" flourish, not a
// real audio visualization -- same spirit as CapturePanel's mini
// waveform, in the scan/cyan accent since this badge is a detection, not
// a control. Fixed heights + staggered delays read as one scanning
// motion.
const BAR_HEIGHTS = [45, 85, 100, 60, 75]

// 3 staggered "sonar ping" ripples from the pulsing dot (sig-ripple,
// index.css). Colors are literal mockup values (not app tokens) --
// decorative, disconnected from any chord interval, same call as other
// one-off decorative mockup values.
const RIPPLE_COLORS = ['#8faf9b', '#8a7550', '#b6788a']

// A live-reading detection badge, shown only when a chord was reached
// via audio identification (Results.jsx gates on `fromAudio`). Its own
// reusable component since a future phase may wire the bars to live
// confidence data.
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
