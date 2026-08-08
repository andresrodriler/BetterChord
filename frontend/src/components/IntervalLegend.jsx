// Persistent interval-color legend (Phase 3 Part 5/6 follow-ups) -- now
// that dots show note names instead of interval numbers, this is the
// only way to read interval identity off the compact cards. One shared
// component, used both pinned atop the Voicings panel (Results.jsx) and
// inside VoicingModal, so the two never drift into two different swatch
// sets. Swatches read their fill color live via the same
// `getIntervalStyle` used for the actual dots -- guarantees the legend
// color always matches the real rendered dot color, not just a visually
// similar hardcoded value.
//
// Chord-quality-aware (3rd + 4th follow-up passes): `formula` is the
// `/voicings/{chord}` response's `formula` field --
// `{root, third, sus, fifth, seventh, extensions}`. A guide-tone bucket
// with no tone in THIS chord's formula is hidden entirely, not grayed
// out -- e.g. sus2/sus4 have no `third` at all (see `sus` instead), an
// augmented triad has no `seventh`, and (4th follow-up, fixing the
// "Other" swatch showing even with nothing in it -- confirmed on a plain
// F# triad and Bmaj7, neither has any extension tone at all) a chord with
// an empty `extensions` array now renders ZERO ext-bucket swatches,
// instead of always showing one generic "Other" entry regardless.
// `extensions` (4th follow-up) is an ordered list of every individually
// named 9th/11th/13th/alteration/6th this chord's formula actually has
// (e.g. Cm13 -> ["9","11","13"]) -- each gets its OWN swatch, all sharing
// the same ext/"other" color (per the task's explicit instruction: reuse
// the existing color, don't add 3 new tokens), never collapsed into one
// anonymous blob.
// `sus` (4th follow-up) reuses the THIRD bucket's color (moss) since a
// sus tone occupies that exact structural slot -- see
// intervalColors.js's `susRealToken` for how "sus2"/"sus4" (display
// labels only) resolve to the real per-voicing token ("9"/"4") for color
// lookup.
import { getIntervalStyle, susRealToken } from '../lib/intervalColors'
import './IntervalLegend.css'

function IntervalLegend({ formula, className }) {
  const entries = [{ key: 'root', sample: '1', label: 'Root' }]

  if (formula?.sus?.length) {
    formula.sus.forEach((susLabel) =>
      entries.push({ key: susLabel, sample: susRealToken(susLabel), label: susLabel })
    )
  } else if (formula?.third) {
    entries.push({ key: 'third', sample: formula.third, label: formula.third })
  }

  if (formula?.fifth) entries.push({ key: 'fifth', sample: formula.fifth, label: formula.fifth })
  if (formula?.seventh) entries.push({ key: 'seventh', sample: formula.seventh, label: formula.seventh })

  ;(formula?.extensions || []).forEach((token) =>
    entries.push({ key: `ext-${token}`, sample: token, label: token })
  )

  return (
    <div className={`interval-legend${className ? ` ${className}` : ''}`}>
      {entries.map(({ key, sample, label }) => {
        const style = getIntervalStyle(sample, formula)
        return (
          <span className="interval-legend__item" key={key}>
            <span className="interval-legend__swatch" style={{ background: style.fill, borderColor: style.stroke }} />
            {label}
          </span>
        )
      })}
    </div>
  )
}

export default IntervalLegend
