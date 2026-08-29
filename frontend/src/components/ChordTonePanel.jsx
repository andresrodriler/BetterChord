// Chord tones/intervals panel -- an Oolimo-influenced view of a chord's
// full structural interval framework, rendered as a vertical list of
// bounded CELLS in a right-hand column beside the fretboard diagram in
// VoicingModal. Additive -- it does not replace the "Notes:"/"Base
// fret:"/"Capo:" block or the "Omitted from this voicing" sentence.
//
// Each slot is a bounded cell (rounded-rect, background tinted with the
// slot's interval color) with chip/label/reference text on one flex
// row. Category dividers (Triad / 7th·6th / Extensions / Bass) are
// inserted whenever a row's `group` changes. Every canonical degree
// (root, 3rd, 5th, 6th, 7th, 9th, 11th, 13th, bass) always renders --
// a degree the chord's formula lacks shows as a visually secondary
// "muted" tier (dashed chip, faint tint, no reference emphasis) rather
// than being hidden.
//
// Data contract: lib/chordTones.js's `buildAllToneSlots()`/
// `buildBassSlot()` are the ONE place that decides what to show, how to
// tier/group it, and which color family a row belongs to (per CLAUDE.md's
// rule against parallel theory logic); this file is pure rendering.
import { useAccessibilityPrefs } from '../context/AccessibilityPrefsContext'
import { buildAllToneSlots, buildBassSlot, GROUP_LABELS } from '../lib/chordTones'
// Reuses FretboardDiagram.css's `.interval-dot--<bucket>` glow classes on
// primary-tier filled chips (see ToneCell) -- imported explicitly (plain
// global CSS, a second import is harmless) rather than relying on
// FretboardDiagram.jsx having rendered first.
import './FretboardDiagram.css'
import './ChordTonePanel.css'

// Converts an already-resolved color (a "#rrggbb" hex string, what
// getIntervalStyle()/cssVar() return) into an rgba() string at the given
// alpha, for the cell background/border tints. A defensive rgb()/rgba()
// branch covers a future style source that returns that shape instead.
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

// Primary cells get a clearly visible tint; muted cells a near-invisible
// one. Border alpha is stronger than the fill in both tiers so a cell
// reads as a bounded region against the panel's recessed background.
const TINT_ALPHA = { primary: { bg: 0.16, border: 0.4 }, muted: { bg: 0.045, border: 0.14 } }

// 3-tier reference emphasis, computed per cell in ToneCell and passed as
// `emphasis`:
//   'played'  -- filled/colored chip (this voicing sounds this tone) ->
//                bold + brass color + underline.
//   'omitted' -- primary tier but not played (dashed chip) -> underline
//                only, no bold/color -- names which interval matters
//                without implying it's sounding.
//   'none'    -- muted tier (outside this chord's formula) -> no
//                underline/bold/color. `active` is always null for a
//                muted row anyway, so this is defensive.
function ReferenceLine({ options, active, emphasis }) {
  if (!options.length) return null
  return (
    <span className="chord-tone-panel__ref">
      {/* Label/reference separator -- without it "Root 1" reads
          ambiguously. Inside this span so it disappears wherever
          ReferenceLine self-hides (an empty `options` array -- Bass). */}
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
  // 3-tier reference emphasis (see ReferenceLine's header) -- computed
  // from the same tier/filled facts the chip rendering below uses.
  const emphasis = isPrimary ? (filled ? 'played' : 'omitted') : 'none'

  let chipClass = 'chord-tone-panel__chip'
  let chipStyle
  if (isPrimary && filled) {
    chipClass += ` ${style.className}`
    chipStyle = { background: style.fill, borderColor: style.stroke }
  } else if (isPrimary) {
    // In this chord's formula, but this voicing doesn't play it --
    // hollow/dashed in the slot's own color.
    chipClass += ' chord-tone-panel__chip--empty'
    chipStyle = { borderColor: style.stroke }
  } else {
    // Muted (formula-outside, or Bass on a non-slash chord) -- also
    // hollow/dashed (unified with the omitted state's grammar, not a
    // second "not present" convention), no fill or glow. Its color is
    // the degree's faint representative family (or, for an empty Bass,
    // the app's neutral surface tokens); the de-emphasis comes from
    // .chord-tone-panel__cell-inner's opacity, not a second alpha here.
    chipClass += ' chord-tone-panel__chip--muted'
    chipStyle = { borderColor: style.stroke }
  }

  return (
    <div
      className={`chord-tone-panel__cell${isPrimary ? '' : ' chord-tone-panel__cell--muted'}`}
      style={{ background: toRgba(style.fill, alpha.bg), borderColor: toRgba(style.stroke, alpha.border) }}
    >
      {/* Opacity is on chip+text only, not the cell wrapper -- the
          cell's tint is already a low alpha (TINT_ALPHA), and opacity on
          the cell would re-multiply it. Chip, degree label, and
          reference text are direct siblings in one flex row (cell-inner),
          not a two-line stack. */}
      <div className={`chord-tone-panel__cell-inner${isPrimary ? '' : ' chord-tone-panel__cell-inner--muted'}`}>
        <div className={chipClass} style={chipStyle}>
          {isPrimary && filled && (
            <span className="chord-tone-panel__chip-note" style={{ color: style.text }}>{noteName}</span>
          )}
        </div>
        <span className="chord-tone-panel__row-title">{title}</span>
        {/* Reference text is shown for every row. `active` is null for a
            muted row (lib/chordTones.js's mutedRow()), so nothing
            highlights there. ReferenceLine self-hides for Root/6th/Bass
            (empty `options` -- no alternate names for those slots). */}
        <ReferenceLine options={options} active={active} emphasis={emphasis} />
      </div>
    </div>
  )
}

function ChordTonePanel({ voicing, formula, bass }) {
  // See IntervalLegend.jsx's identical comment.
  useAccessibilityPrefs()
  const slots = buildAllToneSlots(voicing, formula)
  const bassSlot = buildBassSlot(voicing, formula, bass)
  const allSlots = [...slots, bassSlot]

  // The 6th-degree cell shares the 7th's group/divider (a 6 is the 5th's
  // peer alternative to a 7th, not an extension stacked on one -- see
  // lib/chordTones.js). The "7th / 6th" divider text is a static lookup.
  let prevGroup = null

  return (
    <div className="chord-tone-panel panel panel--recessed">
      {/* The "Chord Tones" subtitle is rendered by VoicingModal.jsx
          above this component (sibling of "Chord Diagram"), not here. */}
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
