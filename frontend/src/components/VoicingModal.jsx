import { useEffect } from 'react'
import ChordName from './ChordName'
import ChordTonePanel from './ChordTonePanel'
import FretboardDiagram from './FretboardDiagram'
import IntervalLegend from './IntervalLegend'
import { omittedTones, presentToneLabels } from '../lib/chordTones'
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
// `formulaTones`/`omittedTones`/`presentToneLabels` moved to
// lib/chordTones.js (Phase 5 Part 4/7) -- the new ChordTonePanel needs
// the exact same "what slots does this chord's formula have" logic, so
// it was pulled out into a shared module rather than reimplemented a
// second time. Nothing about this file's own behavior changed.

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
  const noteNames = uniqueNotes(voicing.notes).join(', ')
  const showCapo = voicing.type === 'Capo' && voicing.capo > 0
  // Phase 5 Part 4/7: the tone panel needs a real `formula` to know what
  // slots this chord even has -- without one (shouldn't happen in
  // practice, `formula` is always attached by /voicings/{chord}, but not
  // assumed here) the modal falls back to its plain single-column
  // layout rather than reserving an empty right-hand column.
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
        {/* TOP-LEVEL TITLE REMOVED ENTIRELY (12th follow-up) -- a
            deliberate removal, not a re-placement: "Must Know Voicing" /
            "Other Voicing" no longer renders anywhere in the top row.
            The voicing-type information moves to the new 3-column
            Notes/Base fret/Voicing type row below instead (see
            .voicing-modal__row-3col). The top row now holds only Close,
            pushed to the far top-right corner (justify-content: flex-end,
            see VoicingModal.css) with real breathing room below it now
            that nothing else shares this row. `aria-label` on the outer
            dialog div (unchanged, below) still carries the voicing-type
            text for accessibility even though it's no longer visible
            here. */}
        {/* CHORD NAME (13th follow-up) -- added back into the top row
            alongside Close, since page context (behind the overlay) is
            no longer visible once the modal is open. This does NOT
            reintroduce the removed "Must Know Voicing"/"Other Voicing"
            title -- that stayed removed, per the prior round's explicit
            decision; voicing TYPE still lives only in the 3-column row
            below. Reuses `.readout` verbatim -- the SAME class Results.jsx's
            own page-level `<h1>` chord name already uses (monospace,
            `--scan` cyan, subtle glow) -- rather than inventing new
            typography for a chord name here. Uses the shared
            `ChordName` component (the one place `.readout` is applied
            to a standalone chord name, per its own header comment) not
            a raw span, matching every other chord-name mention in the
            app. Conditionally rendered (`chordName &&`) since
            VoicingModal is a generic voicing-detail view -- if a caller
            genuinely has no chord name to give it (shouldn't happen
            from Results.jsx, but not assumed), the row gracefully falls
            back to Close-only. */}
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
              {/* "Chord Diagram" SUBTITLE (11th follow-up), REVERSED from
                  last round's placement -- last round put this INSIDE an
                  unstyled area as a tiny eyebrow label; that was a real
                  misinterpretation of the original ask (a bordered box
                  never actually existed for the diagram side to put a
                  label inside). This round builds that real bordered box
                  below (.voicing-modal__diagram-box) and moves the label
                  OUTSIDE/ABOVE it as a genuine subtitle -- reuses this
                  app's existing h3 sub-header convention verbatim (14px
                  mono uppercase muted, same class ChordOverview.jsx's
                  own "What is this chord?"/"Notes in this chord" kickers
                  and Results.jsx's voicing-list section headers already
                  use -- see index.css's base h3 rule), not a new
                  font-size tier and not the tiny group-divider eyebrow
                  style borrowed last round. Matches "Chord Tones"
                  below/right exactly (same shared
                  .voicing-modal__section-title class) so the two read as
                  a deliberate matched pair. */}
              <h3 className="voicing-modal__section-title">Chord Diagram</h3>

              {/* Real bordered box (11th follow-up) -- NEW wrapper
                  element around both the legend AND the diagram
                  together, same panel/panel--recessed treatment
                  ChordTonePanel's own box already uses, so the two
                  columns visually match. The legend renders at the top
                  of this box, diagram below it -- both now genuinely
                  INSIDE one shared border, not the legend floating in an
                  unstyled area above the diagram's own separate box the
                  way it did before this round. `flex: 1` (not
                  height: 100%) since this box is now one of two flex
                  children in this column (subtitle above it) -- see
                  VoicingModal.css for how this and
                  ChordTonePanel.css's own `.chord-tone-panel.panel`
                  cooperate to keep both boxes' heights equal via the
                  shared row's `align-items: stretch`. */}
              <div className="voicing-modal__diagram-box panel panel--recessed">
                {/* Same shared legend component as the compact card's
                    pinned version above the Voicings panel -- swatches
                    always resolve to the same real dot colors, one
                    implementation. Same `formula` prop too, so a bucket
                    this chord doesn't structurally have (e.g. no 3rd for
                    a sus chord) is hidden here exactly like it is up
                    there. */}
                <IntervalLegend formula={formula} className="voicing-modal__legend" />

                {/* Same interval-colored diagram implementation as the
                    compact card (voicingToChord in fretParser.js) -- no
                    onExpand prop here, so it renders as a plain,
                    non-clickable diagram. Same `formula` too, so a sus
                    chord's characteristic tone gets the same third-bucket
                    color here as it does on the compact card. `expanded`
                    (8th follow-up): for a wide-gap Capo voicing that
                    renders as the compact/attached view on the card, the
                    modal instead shows the real, full-width continuous
                    window (real feedback: once there's room, show the
                    actual voicing, not the space-saving version) -- with
                    its own dynamic aspect ratio, so a wide voicing doesn't
                    leave empty space below a letterboxed diagram inside a
                    fixed-ratio box. Diagram sizing/styling is UNCHANGED by
                    this round -- FretboardDiagram fills 100% of whatever
                    width this new box gives it, same as always; the box
                    itself is exactly the diagram-col's own established
                    432px width, so nothing about the diagram's own render
                    size changes, only a border/background now wraps it
                    plus the legend together. */}
                <FretboardDiagram voicing={voicing} formula={formula} expanded />
              </div>
            </div>

            {/* Chord Tones panel (Phase 5 Part 4/7), REDESIGNED this
                round from "full width below the diagram" (previous
                round) back to a right-hand column BESIDE it -- real
                feedback was that stacking diagram + chip row + Notes
                block vertically pushed content out of view even for a
                modest chord (Cmaj9). A column competes with the
                diagram's own height instead of adding to it, which is
                what fixes that. Additive -- the Notes/Base fret/Capo
                block and the "Omitted from this voicing" sentence below
                are unchanged and stay redundant with this by design, see
                ChordTonePanel.jsx's own header comment for why. */}
            {showTonePanel && (
              <div className="voicing-modal__tones-col">
                {/* "Chord Tones" SUBTITLE (11th follow-up) -- moved out
                    of ChordTonePanel.jsx's own box entirely, rendered
                    here instead so it's a true sibling of "Chord
                    Diagram" above (same shared h3-based
                    .voicing-modal__section-title class), matching it in
                    size/weight/spacing rather than borrowing the tiny
                    group-divider eyebrow style. */}
                <h3 className="voicing-modal__section-title">Chord Tones</h3>
                <ChordTonePanel voicing={voicing} formula={formula} bass={bass} />
              </div>
            )}
          </div>

          <div className="voicing-modal__details">
            {/* THREE/FOUR-FIELD ROW (12th follow-up, REBALANCED 13th
                follow-up, LEFT-ALIGNED CLUSTER as of the 14th follow-up,
                Capo folded IN as of Phase 5 Part 7's own follow-up round)
                -- Notes/Base fret/Voicing type/[Capo], one flowing line.
                The 13th follow-up's `justify-content: space-between`
                (Notes anchored left, Voicing type anchored right, Base
                fret floating wherever the flex math put it) read as
                "spread across the whole modal," which real feedback said
                wasn't the right look -- reverted to a single left-aligned
                cluster instead, all fields starting from the row's own
                left edge like one continuous line of text. A visible
                middle-dot separator (this app's existing inline-separator
                convention -- see ChordTonePanel.jsx's `ReferenceLine`/
                `chord-tone-panel__ref` and ChordOverview.jsx's
                interval-formula line, both already use ' · ' between
                same-line items) sits between each field -- reused
                verbatim rather than inventing a new divider style.
                Wrapped in its own `<span>` (not bare text) so it can be
                styled/muted independently of the surrounding label:value
                text -- see VoicingModal.css.

                Capo MOVED into this row (was its own separate `<p>` line
                below, real, confirmed cost: a full extra text row's
                worth of vertical space on EVERY Capo-type voicing's
                modal -- exactly the category driving the remaining
                ResizeObserver-correction cases from last round's own
                investigation). `showCapo` unchanged (`voicing.type ===
                'Capo' && voicing.capo > 0`), conditionally rendered as a
                4th cluster item + separator, same pattern as the other
                three -- when false, the row simply ends after "Voicing
                type" exactly as before, no dangling separator. `flex-wrap:
                wrap` (already on `.voicing-modal__row-3col`, a safety net
                even before this change) is what a long Notes list wraps
                onto if the row ever runs out of width -- unchanged
                mechanism, now also covering the Capo segment when
                present. */}
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
              {showCapo && (
                <>
                  <span className="voicing-modal__row-3col-sep" aria-hidden="true">·</span>
                  <p className="voicing-modal__row-3col-item">
                    <strong>Capo:</strong> {voicing.capo}
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
