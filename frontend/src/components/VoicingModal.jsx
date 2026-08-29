import { useEffect } from 'react'
import ChordName from './ChordName'
import ChordTonePanel from './ChordTonePanel'
import FretboardDiagram from './FretboardDiagram'
import IntervalLegend from './IntervalLegend'
import { omittableAndPlayedTones, omittedTones, presentToneLabels } from '../lib/chordTones'
import { openStringGap } from '../lib/fretParser'
// Reuses CaptureModal.css's overlay/panel/close-button classes
// (.capture-overlay/.capture-modal/.capture-modal__top/.btn-close)
// rather than a second modal system. Plain CSS, so a second import here
// is harmless.
import './CaptureModal.css'
import './VoicingModal.css'

// The omitted-tones / present-tones logic is driven off the real
// per-chord `formula` (from /voicings/{chord}'s `formula` field,
// interval_calculator.guide_tone_formula) rather than assuming every
// chord has root/3rd/5th/7th: a Cm7's minor 3rd isn't labeled a generic
// "3rd", a sus chord (no structural 3rd/7th) isn't reported as
// "omitting" tones it never had, and 9th/11th/13th are individually
// tracked. `formulaTones`/`omittedTones`/`presentToneLabels` live in
// lib/chordTones.js, shared with ChordTonePanel.

// Dedupe for display, preserving first-seen order -- a voicing commonly
// repeats a pitch across two strings (e.g. Fm7's X-1-1-1-1-X plays F on
// two strings), and the "Notes:" line should read as the chord's pitch
// set, not a per-string list.
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

function VoicingModal({ voicing, formula, bass, chordName, onClose }) {
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
  // The inverse of `omitted` above -- which of this voicing's PLAYED
  // notes are theoretically optional (see chordTones.js's
  // omittableAndPlayedTones).
  const omittablePlayed = omittableAndPlayedTones(voicing.intervals, voicing.notes, formula)
  const noteNames = uniqueNotes(voicing.notes).join(', ')
  const showCapo = voicing.type === 'Capo' && voicing.capo > 0
  // Same information class as "Capo: N" -- a fret-distance fact, null
  // when there's nothing worth showing, appended to the same row. See
  // fretParser.js's openStringGap for the threshold.
  const openGap = openStringGap(voicing)
  // Without a `formula` (not expected -- /voicings/{chord} always
  // attaches one) the modal falls back to a plain single-column layout
  // rather than an empty right-hand column.
  const showTonePanel = Boolean(formula)

  return (
    <div className="capture-overlay" onClick={onClose}>
      <div
        className={`capture-modal voicing-modal${showTonePanel ? ' voicing-modal--with-tones' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${voicing.type} voicing detail`}
      >
        {/* Top row holds only Close (far top-right) and an optional
            chord name. There's no voicing-type title -- that text lives
            in the 3-column Notes/Base fret/Voicing type row below and in
            the dialog's own `aria-label`. The chord name is here because
            page context isn't visible behind the overlay; it uses the
            shared `ChordName`/`.readout` treatment (same as Results'
            page title), and falls back to Close-only when `chordName`
            isn't given. */}
        <div className="capture-modal__top voicing-modal__top">
          {chordName && (
            <span className="voicing-modal__chord-name">
              <ChordName>{chordName}</ChordName>
            </span>
          )}
          <button className="btn-close" onClick={onClose}>Close</button>
        </div>

        <div className="capture-modal__body">
          <div className="voicing-modal__row">
            <div className="voicing-modal__diagram-col">
              {/* Subtitle above the bordered box, reusing the app's h3
                  sub-header convention (14px mono uppercase muted, same
                  as ChordOverview's kickers). Shares
                  .voicing-modal__section-title with "Chord Tones" so the
                  two match. */}
              <h3 className="voicing-modal__section-title">Chord Diagram</h3>

              {/* Bordered box wrapping the legend + diagram together,
                  same panel/panel--recessed as ChordTonePanel's box so
                  the two columns match. `flex: 1` (not height: 100%)
                  since it's one of two flex children in this column
                  (subtitle above it) -- see VoicingModal.css for how
                  this and ChordTonePanel's box stay equal height via the
                  row's `align-items: stretch`. */}
              <div className="voicing-modal__diagram-box panel panel--recessed">
                {/* Same shared legend component as the compact card's
                    pinned version above the Voicings panel -- swatches
                    always resolve to the same real dot colors, one
                    implementation. Same `formula` prop too, so a bucket
                    this chord doesn't structurally have (e.g. no 3rd for
                    a sus chord) is hidden here exactly like it is up
                    there. */}
                <IntervalLegend formula={formula} className="voicing-modal__legend" />

                {/* Same interval-colored diagram as the compact card
                    (voicingToChord) -- no onExpand prop, so it's plain
                    and non-clickable. Same `formula`, so a sus chord's
                    characteristic tone gets the third-bucket color.
                    `expanded` gives it its own dynamic aspect ratio (see
                    FretboardDiagram.jsx) so a wide-gap Capo voicing shows
                    the full continuous window rather than the card's
                    space-saving attached view. */}
                <FretboardDiagram voicing={voicing} formula={formula} expanded />
              </div>
            </div>

            {/* Chord Tones panel -- a right-hand column beside the
                diagram (a column competes with the diagram's height
                instead of adding to it, unlike stacking it below).
                Additive -- the Notes/Base fret/Capo block and the
                "Omitted from this voicing" sentence stay redundant with
                it by design, see ChordTonePanel.jsx. */}
            {showTonePanel && (
              <div className="voicing-modal__tones-col">
                {/* "Chord Tones" subtitle, rendered here (not inside
                    ChordTonePanel's box) so it's a sibling of "Chord
                    Diagram" above, sharing .voicing-modal__section-title. */}
                <h3 className="voicing-modal__section-title">Chord Tones</h3>
                <ChordTonePanel voicing={voicing} formula={formula} bass={bass} />
              </div>
            )}
          </div>

          <div className="voicing-modal__details">
            {/* Notes / Base fret / Voicing type / [Omittable] / [Capo] /
                [Open string], one left-aligned flowing line with a
                middle-dot separator between fields (this app's
                inline-separator convention -- see ChordTonePanel's
                ReferenceLine and ChordOverview's interval-formula line).
                Each separator is its own `<span>` so it can be muted
                independently (see VoicingModal.css). Capo is in this row
                rather than its own line to save a full text row on every
                Capo-type voicing's modal; conditional fields simply drop
                their segment + separator when absent. `flex-wrap: wrap`
                on `.voicing-modal__row-3col` handles a long Notes list. */}
            <div className="voicing-modal__row-3col">
              <p className="voicing-modal__row-3col-item voicing-modal__row-3col-item--notes">
                <strong>Notes:</strong> {noteNames || '—'}
              </p>
              <span className="voicing-modal__row-3col-sep" aria-hidden="true">·</span>
              <p className="voicing-modal__row-3col-item">
                <strong>Base fret:</strong> {voicing.base_fret}
              </p>
              <span className="voicing-modal__row-3col-sep" aria-hidden="true">·</span>
              <p className="voicing-modal__row-3col-item">
                <strong>Voicing type:</strong> {voicing.type}
              </p>
              {/* Omittable tones, inline in this row after "Voicing
                  type" -- data from chordTones.js's
                  omittableAndPlayedTones. */}
              {omittablePlayed.length > 0 && (
                <>
                  <span className="voicing-modal__row-3col-sep" aria-hidden="true">·</span>
                  <p className="voicing-modal__row-3col-item">
                    <strong>Omittable:</strong>{' '}
                    {omittablePlayed.map((t) => (t.note ? `${t.label} (${t.note})` : t.label)).join(', ')}
                  </p>
                </>
              )}
              {showCapo && (
                <>
                  <span className="voicing-modal__row-3col-sep" aria-hidden="true">·</span>
                  <p className="voicing-modal__row-3col-item">
                    <strong>Capo:</strong> {voicing.capo}
                  </p>
                </>
              )}
              {/* Mirrors the Capo field -- same row, same separator.
                  Only renders for a non-Capo voicing with an open string
                  far from its fretted cluster (openGap is null
                  otherwise). */}
              {openGap && (
                <>
                  <span className="voicing-modal__row-3col-sep" aria-hidden="true">·</span>
                  <p className="voicing-modal__row-3col-item">
                    <strong>Open string:</strong> {openGap} frets from cluster
                  </p>
                </>
              )}
            </div>
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
