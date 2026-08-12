import { useEffect, useState } from 'react'
import { IDENTIFY_FACTS } from '../lib/identifyFacts'
import './IdentifyingStatus.css'

const ROTATE_MS = 2500

// Rendered by CaptureModal.jsx as the entire body while `identifying` is
// true (item 4 of the Phase 5 Part 3/7 3rd polish pass) -- a dedicated,
// centered replacement of the preview content, same pattern as the
// armed/recording states' own bodies, not an addition appended below
// existing content. CaptureModal already renders its own "Identifying..."
// <h2> (matching "Ready to record"/"Recording..." elsewhere), so this
// component only owns the dots + rotating fact below that headline.
//
// Mounted only while `identifying` is true -- mounting fresh each time
// means the initial random fact and the rotation interval both restart
// cleanly per identify attempt, with no stale timers carried over.
function IdentifyingStatus() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * IDENTIFY_FACTS.length))

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % IDENTIFY_FACTS.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
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
      <p className="identifying-status__fact">{IDENTIFY_FACTS[index]}</p>
    </div>
  )
}

export default IdentifyingStatus
