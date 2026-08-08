import { useEffect } from 'react'
import FretboardDiagram from './FretboardDiagram'
import IntervalLegend from './IntervalLegend'
import { susRealToken } from '../lib/intervalColors'
// Reuses the exact overlay/panel/close-button classes CaptureModal.jsx
// already defines (.capture-overlay/.capture-modal/.capture-modal__top/
// .btn-close) -- per the task's "reuse the existing modal pattern/styling
// ... rather than inventing a new modal system." Plain CSS (no modules),
// so importing this stylesheet a second time here is harmless -- it's
// the same rules, not a copy.
import './CaptureModal.css'
import './VoicingModal.css'

// BUGFIX (Phase 3 Part 5/6, 3rd follow-up), EXPANDED (4th follow-up):
// this used to assume every chord has exactly four guide-tone slots
// (root/3rd/5th/7th) and label them generically. Real problems that
// caused: a Cm7 voicing that DID play its minor 3rd still had the bucket
// generically called "3rd" (misleadingly implies major); a Csus4/Csus2
// voicing -- whose formula structurally has NO 3rd or 7th slot at all,
// the 4th/2nd REPLACES the 3rd, it's not a voicing choice -- was
// reported as "omitting" tones that were never part of the chord to
// begin with; and (4th follow-up) a Cm13 voicing's 9th/11th/13th had no
// way to be individually tracked at all, collapsed into one anonymous
// "other" notion the omitted-check couldn't reference by name.
// Fixed by driving this off the real per-chord `formula` (from
// /voicings/{chord}'s `formula` field, computed backend-side by
// interval_calculator.guide_tone_formula -- the app's own existing theory
// engine, not a second hand-rolled notion of "what tones this chord has").
// A tone this chord's formula doesn't have is skipped entirely -- can
// never appear in the omitted list, matching the legend's identical
// null/empty-hides-the-entry rule.
//
// `formula`'s labels already use voicings.db's real per-voicing
// vocabulary throughout (established from the 3rd follow-up on), with
// exactly one exception -- `sus` entries ("sus2"/"sus4") are DISPLAY
// labels only; `susRealToken` resolves them to the literal token
// ("9"/"4") a real voicing's `intervals` array actually contains, so
// presence can be checked by plain Set membership, no bucket
// classification needed here at all (that indirection is only needed for
// per-string DOT coloring in fretParser.js, which has to disambiguate a
// raw "4"/"9" without already knowing which formula slot it came from --
// this function starts FROM the formula, so there's nothing to
// disambiguate).
function formulaTones(formula) {
  if (!formula) return []
  const tones = [{ label: formula.root, realToken: formula.root }]
  if (formula.sus?.length) {
    formula.sus.forEach((susLabel) => tones.push({ label: susLabel, realToken: susRealToken(susLabel) }))
  } else if (formula.third) {
    tones.push({ label: formula.third, realToken: formula.third })
  }
  if (formula.fifth) tones.push({ label: formula.fifth, realToken: formula.fifth })
  if (formula.seventh) tones.push({ label: formula.seventh, realToken: formula.seventh })
  ;(formula.extensions || []).forEach((token) => tones.push({ label: token, realToken: token }))
  return tones
}

function omittedTones(intervals, formula) {
  const present = new Set(intervals || [])
  return formulaTones(formula)
    .filter((t) => !present.has(t.realToken))
    .map((t) => t.label)
}

// Every tone THIS chord's formula actually has, in formula order -- used
// for the "includes all of ..." fallback sentence so it never names a
// slot the chord doesn't structurally have (e.g. never says "... 3rd ..."
// for a sus chord, never invents a "9th" for a plain triad).
function presentToneLabels(formula) {
  return formulaTones(formula).map((t) => t.label)
}

// Dedupe for display, preserving first-seen order -- a voicing commonly
// repeats a pitch across two strings (e.g. Fm7's real X-1-1-1-1-X shape:
// F/Eb/Ab/C/F, F played on two different strings), and the "Notes:" line
// should read as the chord's actual pitch set, not a per-string list.
function uniqueNotes(notes) {
  const seen = new Set()
  const out = []
  for (const n of notes || []) {
    if (!seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

function VoicingModal({ voicing, formula, onClose }) {
  // Standard close behavior: Esc closes, same as CaptureModal's Close
  // button/click-outside (added below on the overlay itself).
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!voicing) return null

  const omitted = omittedTones(voicing.intervals, formula)
  const present = presentToneLabels(formula)
  const noteNames = uniqueNotes(voicing.notes).join(', ')
  const showCapo = voicing.type === 'Capo' && voicing.capo > 0

  return (
    <div className="capture-overlay" onClick={onClose}>
      <div
        className="capture-modal voicing-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${voicing.type} voicing detail`}
      >
        <div className="capture-modal__top">
          <button className="btn-close" onClick={onClose}>Close</button>
        </div>

        <div className="capture-modal__body">
          <h2>{voicing.type} voicing</h2>

          {/* Same shared legend component as the compact card's pinned
              version above the Voicings panel -- swatches always resolve
              to the same real dot colors, one implementation. Same
              `formula` prop too, so a bucket this chord doesn't
              structurally have (e.g. no 3rd for a sus chord) is hidden
              here exactly like it is up there. */}
          <IntervalLegend formula={formula} className="voicing-modal__legend" />

          {/* Same interval-colored diagram implementation as the compact
              card (voicingToChord in fretParser.js) -- no onExpand prop
              here, so it renders as a plain, non-clickable diagram. Same
              `formula` too, so a sus chord's characteristic tone gets the
              same third-bucket color here as it does on the compact card.
              `expanded` (8th follow-up): for a wide-gap Capo voicing that
              renders as the compact/attached view on the card, the modal
              instead shows the real, full-width continuous window (real
              feedback: once there's room, show the actual voicing, not
              the space-saving version) -- with its own dynamic aspect
              ratio, so a wide voicing doesn't leave empty space below a
              letterboxed diagram inside a fixed-ratio box. */}
          <FretboardDiagram voicing={voicing} formula={formula} expanded />

          <div className="voicing-modal__details">
            <p><strong>Notes:</strong> {noteNames || '—'}</p>
            <p><strong>Base fret:</strong> {voicing.base_fret}</p>
            {showCapo && <p><strong>Capo:</strong> {voicing.capo}</p>}
            <p className="status-text voicing-modal__omitted">
              {omitted.length > 0
                ? `Omitted from this voicing: ${omitted.join(', ')}.`
                : `This voicing includes every tone in this chord's formula (${present.join(', ')}).`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VoicingModal
