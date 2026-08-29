// Persistent interval-color legend -- the only way to read interval
// identity off the compact cards, now that dots show note names not
// interval numbers. One shared component, pinned atop the Voicings panel
// (Results.jsx) and inside VoicingModal, so the two can't drift.
// Swatches read their fill via the same `getIntervalStyle` as the dots,
// so the legend color always matches the rendered dot color.
//
// Chord-quality-aware: `formula` is the `/voicings/{chord}` response's
// `formula` field -- `{root, third, sus, fifth, seventh, extensions}`.
// A bucket with no tone in this chord's formula is hidden (not grayed):
// sus2/sus4 have no `third` (use `sus` instead), an augmented triad has
// no `seventh`, and a chord with an empty `extensions` array renders
// zero ext-bucket swatches. `extensions` is an ordered list of every
// named 9th/11th/13th/6th/alteration (e.g. Cm13 -> ["9","11","13"]) --
// each gets its own swatch, all sharing the ext color. `sus` reuses the
// THIRD bucket's color (moss), since a sus tone occupies that slot --
// see intervalColors.js's `susRealToken`.
import { useAccessibilityPrefs } from '../context/AccessibilityPrefsContext'
import { getIntervalStyle, susRealToken } from '../lib/intervalColors'
import './IntervalLegend.css'

function IntervalLegend({ formula, className }) {
  // Subscribed purely so this component re-renders (and therefore
  // re-reads getIntervalStyle's now-cleared cache) the moment the
  // colorblind palette toggles -- see AccessibilityPrefsContext.jsx's own
  // comment on why a Context value change alone isn't enough without a
  // consumer actually reading it.
  useAccessibilityPrefs()
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
