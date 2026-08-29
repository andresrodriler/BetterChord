// Maps a voicing's per-string interval string (e.g. "1", "b7", "9") to
// the themed fill/text/stroke/glow for that fretboard finger dot. One
// shared implementation, so the compact-card and expand-modal diagrams
// can't drift into different color logic.
//
// Colors are read live from index.css's custom properties via
// getComputedStyle, not hardcoded here -- the palette and its documented
// WCAG contrast ratios live only in index.css.
const SUFFIX_BY_BUCKET = {
  root: 'root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
  sixth: '6th',
  ext: 'ext',
  ext9: 'ext-9',
  ext11: 'ext-11',
  ext13: 'ext-13',
}

// voicings.db's `intervals` uses quality-qualified labels for scale
// degrees on non-major/non-dominant chords. Full real vocabulary: #11,
// #5, #9, 1, 11, 13, 3, 4, 5, 6, 9, b13, b5, b7, b9, dim7, m3, maj7.
// Bucketed below:
//   root:    "1"
//   third:   "3" (major), "m3" (minor); "b3"/"#3" kept defensively
//   fifth:   "5", "b5" (dim), "#5" (aug) -- an altered 5th is still the
//            chord's 5th-degree tone, same color bucket as a plain 5th
//   seventh: "7"/"b7" (dom/minor), "maj7", "dim7"; "#7"/"bb7" defensive
//   ext:     everything else -- 9/11/13/#9/b9/#11/b13, plain "6", "4"
//            (sus4), "2" (sus2)
// Matched via explicit sets, not a suffix regex, because "13" also ends
// in "3" and would misclassify as a 3rd.
const THIRD_INTERVALS = new Set(['3', 'm3', 'b3', '#3'])
const FIFTH_INTERVALS = new Set(['5', 'b5', '#5'])
const SEVENTH_INTERVALS = new Set(['7', 'b7', 'maj7', 'dim7', '#7', 'bb7'])

// A sus chord's characteristic tone occupies the same structural slot as
// a 3rd and reuses the third bucket's color. Its real per-voicing
// `intervals` string is NOT "sus2"/"sus4" (those are the formula's
// display labels) -- a sus4 tone is logged as "4", a sus2 tone as "9",
// the SAME tokens an unrelated 11th/9th-extension chord uses for its own
// differently-colored tones. So "4"/"9" can't be classified from the
// bare string alone; it depends on whether this chord's `formula.sus`
// marks it a sus chord. `formula` is optional -- omitting it just leaves
// "4"/"9" in the ext bucket, so non-sus callers are unaffected.
export function susRealToken(susLabel) {
  if (susLabel === 'sus2') return '9'
  if (susLabel === 'sus4') return '4'
  return susLabel
}

export function classifyInterval(interval, formula) {
  if (interval === '1') return 'root'
  if (formula?.sus?.includes('sus4') && interval === '4') return 'third'
  // Accepts both tokens for the sus2 tone: voicings.db uses "9",
  // chord_info.py's theoretical labels use bare "2". Without "2" here, a
  // genuine Csus2's characteristic tone (correct everywhere fed by
  // voicing data) fell through to the "ext"/--muted bucket in
  // ChordOverview, which classifies chord_info's labels. Safe within this
  // branch: it's only reached once formula.sus confirms a sus2 chord, and
  // "2" never appears in real per-voicing data for anything else.
  if (formula?.sus?.includes('sus2') && (interval === '9' || interval === '2')) return 'third'
  if (FIFTH_INTERVALS.has(interval)) return 'fifth'
  if (THIRD_INTERVALS.has(interval)) return 'third'
  if (SEVENTH_INTERVALS.has(interval)) return 'seventh'
  // "4" and "6" can each be this chord's real 11th/13th. voicings.db
  // logs an unaltered natural 11th as "4" (never verbatim "11" -- only
  // the altered "#11" appears literally), and logs a natural 13th
  // inconsistently as "13" or "6" for the same pitch across rows of one
  // chord. Both were falling into the generic "ext" bucket instead of
  // the ext11/ext13 tint the chord's declared extension should get,
  // which mismatched the legend swatch and (see chordTones.js's
  // realTokenAliases) made the Chord Tones panel miss the note entirely.
  // Recognized as 11th/13th ONLY when `formula.extensions` declares that
  // degree, so an unrelated chord's genuine sus4 "4" or plain 6th "6"
  // are unaffected. Known limitation: the sus4+11-extension combo (e.g.
  // C11sus4) -- "4" is already the sus4 tone (the sus-check above wins)
  // and real data has no separate token for an additional 11th.
  if (interval === '4' && formula?.extensions?.includes('11') && !formula?.sus?.includes('sus4')) return 'ext11'
  if (interval === '6' && formula?.extensions?.includes('13')) return 'ext13'
  // Bare "9"/"11"/"13" each get their own tint of the ext family (see
  // index.css's --interval-ext-9/-11/-13) so 9th/11th/13th aren't
  // visually indistinguishable. Only the bare token gets its own tint;
  // altered variants (b9/#9/#11/b13/#13) and a non-sus "4" stay in the
  // generic "ext" bucket.
  if (interval === '9') return 'ext9'
  if (interval === '11') return 'ext11'
  if (interval === '13') return 'ext13'
  // A genuine 6th gets its own tint (--interval-6th). Distinct from the
  // `formula.extensions.includes('13')` branch above -- that handles a
  // natural 13th spelled "6" in the data; this branch only runs when the
  // formula has no 13th, so "6" here is the actual 6th degree (an
  // add6/6-chord's token). --interval-6th is the lightest step of the
  // same hue family as ext-9/-11/-13 (a 6th and a 13th are the same
  // pitch class), but NOT the exact hex of ext-13: a chord never shows
  // both at once, but other UI (filter chips, cross-chord lists) can
  // show them near each other, where an exact match would look like a
  // bug.
  if (interval === '6') return 'sixth'
  return 'ext'
}

// Exported so callers needing a plain, non-interval CSS token resolved
// (e.g. chordTones.js's bass-slot placeholder styling, when there's no
// interval to classify) can read it the same way this file does, rather
// than hardcoding a duplicate hex.
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Cached per-bucket -- avoids re-reading getComputedStyle for every
// finger dot on every render. Bucket identity alone determines the color
// (never the raw interval/formula), so `formula` as a classification
// input doesn't affect the cache key.
//
// The cached values are NOT permanently static: index.css's
// `:root[data-colorblind="true"]` override changes these custom
// properties at runtime. AccessibilityPrefsContext.jsx calls
// resetIntervalStyleCache() on every colorblind toggle, so the next
// getIntervalStyle() call re-reads the current value. Consumers still
// need to re-render/redraw to make that "next call" happen (see
// FretboardDiagram.jsx's draw effect, which depends on `colorblindMode`).
let _cache = null

export function resetIntervalStyleCache() {
  _cache = null
}

export function getIntervalStyle(interval, formula) {
  const bucket = classifyInterval(interval, formula)
  if (!_cache) _cache = {}
  if (_cache[bucket]) return _cache[bucket]

  const suffix = SUFFIX_BY_BUCKET[bucket]
  const style = {
    bucket,
    fill: cssVar(`--interval-${suffix}`),
    text: cssVar(`--interval-${suffix}-text`),
    // Open-note text: the per-bucket `text` color is paired against the
    // bucket's SOLID fill -- correct for a fretted dot, wrong for an open
    // string's hollow ring, whose background is always the dark diagram
    // well (--brown-800) regardless of bucket. One fixed light color for
    // every open note, since that background doesn't vary by bucket the
    // way a solid fill does.
    openText: cssVar('--parchment'),
    stroke: cssVar(`--interval-${suffix}-border`),
    glow: cssVar(`--interval-${suffix}-glow`),
    className: `interval-dot--${bucket}`,
  }
  _cache[bucket] = style
  return style
}
