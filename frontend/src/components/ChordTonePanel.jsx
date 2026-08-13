// Chord tones/intervals panel (Phase 5 Part 4/7) -- an Oolimo-influenced
// view of a chord's full structural interval framework, rendered as a
// vertical list of bounded CELLS in a right-hand column beside the
// fretboard diagram inside VoicingModal. Additive -- it does not replace
// the existing "Notes:"/"Base fret:"/"Capo:" block or the "Omitted from
// this voicing" sentence in VoicingModal.jsx, both of which stay exactly
// as they were.
//
// THIS ROUND'S REDESIGN (4th on this panel), per real feedback on the
// previous (bare chip + loose text) version:
//   1. "Jumbled" complaint -- a chip sitting loosely beside text with no
//      shared container, and inconsistent row heights (a 1-line title
//      next to a 3-line-wrapping reference block). Fixed by wrapping
//      each slot in its own bounded CELL (rounded-rect container,
//      background tinted with that slot's own interval color) -- each
//      cell now contains its own content cleanly regardless of how many
//      lines its reference text needs, without affecting sibling rows.
//   2. Muted-tier chips no longer shrink -- full 30px, same as primary --
//      differentiated instead by tint intensity, no fill/glow, missing
//      reference text, and reduced opacity on the chip+text (NOT the
//      cell's own background tint -- see the opacity-scoping note on
//      .chord-tone-panel__cell-inner below for why those are split).
//   3. Category dividers (Triad / 7th / Extensions / Bass) using the
//      app's existing eyebrow-label treatment, inserted whenever a row's
//      `group` (from lib/chordTones.js) changes from the previous row.
//   4. Bass is now ALWAYS a row (lib/chordTones.js's buildBassSlot never
//      returns null anymore) -- muted/dashed when not a slash chord,
//      primary/filled when it is, consistent with how every other
//      formula-outside degree already renders.
//
// 7th follow-up on this panel, three more changes (see this round's
// report for the full measured before/after):
//   5. SINGLE-LINE ROWS -- chip/label/reference text are now direct
//      flex siblings in one row (ToneCell's cell-inner), not a two-line
//      stack. Confirmed via real measurement the existing cell width
//      already fit the longest real title+reference combination on one
//      line -- no column widening was needed.
//   6. Reference text now shown on EVERY row, muted or primary --
//      previously one of the tier-differentiation signals; tier is
//      still clearly readable via the OTHER three signals (background
//      tint intensity, chip fill/glow vs. flat/dashed, row opacity).
//   7. "6" promoted to a permanent canonical degree (lib/chordTones.js)
//      -- every chord's panel now always has a 6th-degree cell (muted
//      when the chord has none, primary/filled when it does), grouped
//      under a now-always-static "7th / 6th" divider.
//
// Data contract -- unchanged in spirit from earlier rounds, per
// CLAUDE.md's core rule against parallel theory logic: lib/chordTones.js's
// `buildAllToneSlots()`/`buildBassSlot()` are the ONE place that decides
// what to show, how to tier/group it, and which color family a row
// belongs to; this file is pure rendering.
import { buildAllToneSlots, buildBassSlot, GROUP_LABELS } from '../lib/chordTones'
// Reuses FretboardDiagram.css's `.interval-dot--<bucket>` glow classes
// directly on primary-tier filled chips below (see ToneCell) -- imported
// explicitly here too (plain global CSS, no modules, so a second import
// is harmless, same established pattern as VoicingModal.jsx re-importing
// CaptureModal.css) rather than relying on FretboardDiagram.jsx having
// already been rendered first on the page.
import './FretboardDiagram.css'
import './ChordTonePanel.css'

// Converts an already-resolved color (a literal "#rrggbb" hex string, the
// real return shape of getIntervalStyle()/cssVar() -- confirmed in
// earlier rounds, CSS custom properties return their authored token text
// verbatim via getComputedStyle, not a computed rgb()) into an rgba()
// string at the given alpha, for the cell background/border tints below.
// A defensive rgb()/rgba() branch is kept in case a future style source
// ever returns that shape instead, so this never silently renders a
// broken color. This is pure presentation (turning an already-decided
// color translucent for a container fill) -- lib/chordTones.js still
// owns which color a slot uses at all, this file never invents one.
function toRgba(color, alpha) {
  if (!color) return `rgba(0, 0, 0, ${alpha})`
  if (color.startsWith('#')) {
    const hex = color.length === 4
      ? color.slice(1).split('').map((c) => c + c).join('')
      : color.slice(1)
    const num = parseInt(hex, 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const match = color.match(/rgba?\(([^)]+)\)/)
  if (match) {
    const [r, g, b] = match[1].split(',').map((s) => s.trim())
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

// Primary cells get a clearly visible tint; muted cells a "very faint/
// near-invisible" one -- real, deliberately different alpha values per
// the task's explicit instruction, not the same value reused. Border
// alpha stays a bit stronger than the fill in both tiers so a cell reads
// as a bounded region even against the panel's own recessed background.
const TINT_ALPHA = { primary: { bg: 0.16, border: 0.4 }, muted: { bg: 0.045, border: 0.14 } }

// 3-TIER REFERENCE EMPHASIS (10th follow-up on this panel), replacing
// the old binary "active-or-not" bold logic entirely -- real feedback
// was that a formula-included-but-not-actually-played tone (dashed/
// hollow chip) still got the exact same bold+color+underline treatment
// as a tone the voicing genuinely sounds, which read as "this is being
// played" when it wasn't. Three real levels now, computed once per cell
// in ToneCell (below) and passed down as `emphasis`:
//   'played'  -- the chip is filled/colored (this voicing actually
//                sounds this tone) -> full treatment: bold + brass
//                color + underline. Exactly the old `.chord-tone-panel
//                __ref-active` styling, just renamed/scoped so it's
//                clear this is ONE of three levels now, not the only
//                "highlighted" state.
//   'omitted' -- primary tier, but this specific voicing doesn't play
//                it (dashed/hollow chip) -> underline ONLY, plain text
//                color, no bold -- names which interval matters without
//                implying it's sounding.
//   'none'    -- muted tier (fully outside this chord's formula) -> no
//                underline, no bold, no color change. Also happens to
//                be correct-by-construction for every muted row anyway,
//                since `active` is always null there (see
//                lib/chordTones.js's mutedRow()) -- this option's own
//                token can never match `active` regardless, so passing
//                'none' here is defensive, not load-bearing.
function ReferenceLine({ options, active, emphasis }) {
  if (!options.length) return null
  return (
    <span className="chord-tone-panel__ref">
      {/* Label/reference separator, applied consistently across every
          cell that has a reference line at all -- "Root 1" read
          ambiguously (is "1" part of the label or the reference?).
          Lives inside this same span so it disappears for free wherever
          ReferenceLine itself self-hides (an empty `options` array --
          Bass). */}
      <span className="chord-tone-panel__ref-sep">: </span>
      {options.map((opt, i) => {
        const isActive = opt === active
        return (
          <span key={opt}>
            <span className={isActive ? `chord-tone-panel__ref-active chord-tone-panel__ref-active--${emphasis}` : undefined}>
              {opt}
            </span>
            {i < options.length - 1 ? ' · ' : ''}
          </span>
        )
      })}
    </span>
  )
}

function ToneCell({ slot }) {
  const { tier, title, active, options, noteName, filled, style } = slot
  const isPrimary = tier === 'primary'
  const alpha = TINT_ALPHA[tier]
  // 3-tier reference emphasis (10th follow-up) -- see ReferenceLine's own
  // header comment for what each level means. Computed once here from
  // the same tier/filled facts the chip rendering below already uses,
  // not a second classification.
  const emphasis = isPrimary ? (filled ? 'played' : 'omitted') : 'none'

  let chipClass = 'chord-tone-panel__chip'
  let chipStyle
  if (isPrimary && filled) {
    chipClass += ` ${style.className}`
    chipStyle = { background: style.fill, borderColor: style.stroke }
  } else if (isPrimary) {
    // In this chord's formula, but this voicing doesn't play it --
    // hollow/dashed in the slot's own real color, unchanged from earlier
    // rounds.
    chipClass += ' chord-tone-panel__chip--empty'
    chipStyle = { borderColor: style.stroke }
  } else {
    // Muted (formula-outside, or Bass on a non-slash-chord voicing) --
    // hollow/dashed too (unified with the omitted state's visual grammar
    // rather than a second "not present" convention), full size, no
    // fill, no glow class ever. Its color is the degree's own faint
    // representative family (or, for an empty Bass, this app's existing
    // neutral surface tokens -- see buildBassSlot's own comment) at full
    // hex value here; the actual de-emphasis comes from
    // .chord-tone-panel__cell-inner's opacity below, not a second alpha
    // on the chip itself.
    chipClass += ' chord-tone-panel__chip--muted'
    chipStyle = { borderColor: style.stroke }
  }

  return (
    <div
      className={`chord-tone-panel__cell${isPrimary ? '' : ' chord-tone-panel__cell--muted'}`}
      style={{ background: toRgba(style.fill, alpha.bg), borderColor: toRgba(style.stroke, alpha.border) }}
    >
      {/* Opacity scoped to chip+text only, NOT the cell wrapper above --
          the cell's own background/border tint is already a deliberately
          chosen low alpha (see TINT_ALPHA); if opacity lived on the cell
          itself instead, it would silently re-multiply that already-low
          tint into something even fainter than intended, coupling two
          things that should be independently tunable. */}
      {/* SINGLE-LINE ROW (7th follow-up on this panel): chip, degree
          label, and reference text are now direct siblings in ONE flex
          row (cell-inner itself), not a two-line stack (label above,
          reference below in a separate column wrapper) -- real feedback
          was that the stacked version reserved dead vertical space for
          any cell with no reference text, and the 3rd-degree cell (the
          widest reference string) showed visible slack on its right in
          the stacked layout. Confirmed via real measurement (see this
          round's report) that the existing cell width already fits the
          longest real title+reference combination on one line without
          needing to widen the column. */}
      <div className={`chord-tone-panel__cell-inner${isPrimary ? '' : ' chord-tone-panel__cell-inner--muted'}`}>
        <div className={chipClass} style={chipStyle}>
          {isPrimary && filled && (
            <span className="chord-tone-panel__chip-note" style={{ color: style.text }}>{noteName}</span>
          )}
        </div>
        <span className="chord-tone-panel__row-title">{title}</span>
        {/* Reference text now shown for EVERY row regardless of tier
            (7th follow-up -- previously gated to primary-tier only, one
            of the tier-differentiation signals). `active` is null for a
            muted row (see lib/chordTones.js's mutedRow()), so
            ReferenceLine's own bold-the-active-token logic naturally
            never highlights anything there -- correct, since nothing IS
            active for a degree this chord's formula doesn't have.
            ReferenceLine still self-hides for Root/6th/Bass (empty
            `options` -- no real alternate names exist for those slots),
            so no isBass special-case is needed here anymore either. */}
        <ReferenceLine options={options} active={active} emphasis={emphasis} />
      </div>
    </div>
  )
}

function ChordTonePanel({ voicing, formula, bass }) {
  const slots = buildAllToneSlots(voicing, formula)
  const bassSlot = buildBassSlot(voicing, formula, bass)
  const allSlots = [...slots, bassSlot]

  // REGROUP (5th follow-up on this panel): the 6th-degree cell shares the
  // 7th-degree cell's own group/divider instead of Extensions (see
  // lib/chordTones.js's own comment on why -- a 6 is the 5th's peer
  // color-tone alternative to a 7th, not stacked on top of one the way a
  // real extension is). The divider wording ("7th / 6th") is now a plain
  // static lookup (7th follow-up: since "6" was promoted to a permanent
  // canonical slot, that cluster's two cells are always both physically
  // there for every chord, so the label no longer needs to depend on
  // whether this specific chord happens to have a 6 -- see GROUP_LABELS'
  // own comment in lib/chordTones.js for the full reasoning).
  let prevGroup = null

  return (
    <div className="chord-tone-panel panel panel--recessed">
      {/* "Chord Tones" own on-box label -- moved OUTSIDE this box this
          round (11th follow-up), rendered by VoicingModal.jsx as a real
          subtitle sibling above this whole component instead (matching
          "Chord Diagram"'s own subtitle on the diagram side) -- a prior
          round's attempt to put it INSIDE this box using the tiny
          group-divider eyebrow style was a real misread of the original
          ask, corrected here. See VoicingModal.jsx for the actual
          rendering. */}
      <div className="chord-tone-panel__list">
        {allSlots.map((slot) => {
          const showDivider = slot.group !== prevGroup
          prevGroup = slot.group
          return (
            <div key={slot.key} className="chord-tone-panel__group-item">
              {showDivider && (
                <span className="chord-tone-panel__group-label">{GROUP_LABELS[slot.group]}</span>
              )}
              <ToneCell slot={slot} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ChordTonePanel
