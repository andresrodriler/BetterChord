import { useEffect, useRef, useState } from 'react'
import { IDENTIFY_FACTS } from '../lib/identifyFacts'
import './IdentifyingStatus.css'

// A comfortable reading pace for a ~15-25 word sentence.
const ROTATE_MS = 6000
// Crossfade duration -- the fact fades out, the text swaps, then it fades
// back in. Applies whether advance() is called by the interval or the
// manual arrow, since both go through the same function.
const FADE_MS = 250

// Rendered by CaptureModal.jsx as the entire body while `identifying` is
// true -- a centered replacement of the preview content, same pattern as
// the armed/recording states. CaptureModal renders its own
// "Identifying..." <h2>, so this component owns only the dots + rotating
// fact. Mounted fresh each time `identifying` goes true, so the random
// fact and the interval restart cleanly per attempt.
function IdentifyingStatus() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * IDENTIFY_FACTS.length))
  // A soft crossfade -- `fading` is true only during the fade-out; the
  // text swaps when it flips back to false (fully invisible), so the
  // swap itself is never seen.
  const [fading, setFading] = useState(false)
  const fadeTimeoutRef = useRef(null)

  function advance() {
    setFading(true)
    clearTimeout(fadeTimeoutRef.current)
    fadeTimeoutRef.current = setTimeout(() => {
      setIndex((i) => (i + 1) % IDENTIFY_FACTS.length)
      setFading(false)
    }, FADE_MS)
  }

  useEffect(() => {
    const id = setInterval(advance, ROTATE_MS)
    return () => {
      clearInterval(id)
      clearTimeout(fadeTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    // display: contents (see CSS) -- this div exists only to group the
    // dots+fact under one aria-live region; it doesn't participate in
    // the parent .capture-modal__body's own flex/gap layout, so the
    // dots and fact space themselves exactly like direct children would.
    <div className="identifying-status" role="status" aria-live="polite">
      <span className="identifying-status__dots" aria-hidden="true">
        <span className="identifying-status__dot" />
        <span className="identifying-status__dot" />
        <span className="identifying-status__dot" />
      </span>
      <div className="identifying-status__fact-row">
        <p className={`identifying-status__fact${fading ? ' identifying-status__fact--fading' : ''}`}>
          {IDENTIFY_FACTS[index]}
        </p>
        {/* Manual advance -- doesn't reset the interval; routes through
            the same advance() so it gets the identical crossfade. */}
        <button
          type="button"
          className="identifying-status__next"
          onClick={advance}
          aria-label="Next fact"
        >
          &rarr;
        </button>
      </div>
    </div>
  )
}

export default IdentifyingStatus
