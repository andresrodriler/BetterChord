// Maps a voicing's per-string interval string (e.g. "1", "b7", "9") to the
// themed fill/text/stroke/glow used for that fretboard finger dot --
// Phase 3 Part 5/6. One shared implementation, imported by fretParser.js
// (which builds svguitar's finger config for BOTH the compact card diagram
// and the larger expand-modal diagram) so the two never drift into two
// different color logics.
//
// Colors are read live from index.css's custom properties via
// getComputedStyle rather than hardcoded hex here -- the palette (and its
// documented WCAG contrast ratios) lives in exactly one place, index.css;
// duplicating hex values here would be a second, driftable source of
// truth for the same five colors.
const SUFFIX_BY_BUCKET = {
  root: 'root',
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
  ext: 'ext',
  ext9: 'ext-9',
  ext11: 'ext-11',
  ext13: 'ext-13',
}

// BUGFIX (Phase 3 Part 5/6 follow-up): the original set here was built
// against only 3 test chords (C, G7, A11), none of which are minor,
// major-seventh, or diminished -- so it only ever saw bare "3"/"5"/"7"/
// "b7". Real voicings.db data uses quality-qualified labels for those
// same scale degrees on non-major/non-dominant chords (confirmed via a
// direct `SELECT DISTINCT` over every real `intervals` value in the db,
// not guessed from the two bug-report screenshots alone). Full real
// vocabulary found: #11, #5, #9, 1, 11, 13, 3, 4, 5, 6, 9, b13, b5, b7,
// b9, dim7, m3, maj7. Bucketed below:
//   root:    "1"
//   third:   "3" (major), "m3" (minor) -- "b3"/"#3" kept defensively,
//            not seen in real data but the same shape as "m3" if it
//            ever appears.
//   fifth:   "5" (perfect), "b5" (diminished), "#5" (augmented) -- an
//            altered 5th is still the chord's 5th-degree tone, so it
//            stays in the same color bucket as a plain 5th rather than
//            falling through to "ext".
//   seventh: "7" (dominant/minor 7th), "b7" (same, explicit), "maj7"
//            (major 7th), "dim7" (diminished 7th) -- "#7"/"bb7" kept
//            defensively.
//   ext:     everything else -- 9/11/13/#9/b9/#11/b13, the plain "6",
//            "4" (sus4), "2" (sus2), etc.
// Matched via explicit sets (not a suffix regex) specifically because
// "13" ends in the digit 3 too -- a suffix match would have
// misclassified the 13th extension as a 3rd.
const THIRD_INTERVALS = new Set(['3', 'm3', 'b3', '#3'])
const FIFTH_INTERVALS = new Set(['5', 'b5', '#5'])
const SEVENTH_INTERVALS = new Set(['7', 'b7', 'maj7', 'dim7', '#7', 'bb7'])

// A sus chord's characteristic tone (Phase 3 Part 5/6, 4th follow-up)
// occupies the SAME structural slot as a 3rd -- reuses the third bucket's
// color per the task's explicit instruction, no new color token. But the
// real per-voicing `intervals` string for that tone is NOT "sus2"/"sus4"
// (those are the backend formula's DISPLAY labels only) -- confirmed
// against real voicings.db data: a sus4 chord's added tone is logged as
// literal "4", a sus2 chord's as literal "9" (SAME tokens an unrelated
// 11th/9th-extension chord also uses for its own, differently-colored
// tones -- e.g. A11 legitimately has a "4" that should stay "ext"
// colored). This is why classifying "4"/"9" can no longer be done from
// the bare interval string alone -- it now depends on whether THIS
// chord's formula says it's a sus chord, which is exactly the same kind
// of context-dependence the backend's guide_tone_formula() had to solve
// for b5-vs-#11/dim7-vs-13. `formula` (the /voicings/{chord} response's
// `formula.sus` array) is optional -- omitting it just means every "4"/
// "9" falls through to the ext bucket as before, so existing non-sus
// callers are unaffected.
export function susRealToken(susLabel) {
  if (susLabel === 'sus2') return '9'
  if (susLabel === 'sus4') return '4'
  return susLabel
}

export function classifyInterval(interval, formula) {
  if (interval === '1') return 'root'
  if (formula?.sus?.includes('sus4') && interval === '4') return 'third'
  if (formula?.sus?.includes('sus2') && interval === '9') return 'third'
  if (FIFTH_INTERVALS.has(interval)) return 'fifth'
  if (THIRD_INTERVALS.has(interval)) return 'third'
  if (SEVENTH_INTERVALS.has(interval)) return 'seventh'
  // REAL BUG, found + fixed this round (Phase 5 Part 4/7, 13th follow-up):
  // this comment previously said "a plain ... non-sus '4' ... falls
  // through to the single generic 'ext' bucket" as if that were always
  // correct -- it wasn't. Confirmed directly against live /voicings
  // responses across many extended qualities (C11, C13, Cmaj13, Cm13,
  // Cadd11, Cmaj11/E, ...), not assumed: an UNALTERED natural 11th is
  // declared as formula token "11", but every real voicing in the db
  // logs that exact note using literal "4" instead -- "11" never appears
  // verbatim anywhere in real per-voicing `intervals` data (only the
  // ALTERED "#11" appears literally, e.g. real C7#11 data). A natural
  // 13th is usually logged as literal "13" (matching formula) but is
  // INCONSISTENTLY logged as "6" for the identical pitch in some real
  // Cm13 rows (confirmed via direct query: real row "8-X-8-8-10-X" logs
  // its A note -- Cm13's 13th -- as "6", while row "X-3-5-3-4-5" logs the
  // same A as "13", same chord, same quality, same pitch). Both real
  // tokens were falling into the generic catch-all "ext" bucket instead
  // of the dedicated ext11/ext13 tint the chord's own declared extension
  // is supposed to get -- this is what let a genuinely-played natural
  // 11th/13th note render in a color that didn't match its own legend
  // swatch, and (see chordTones.js's realTokenAliases, the deeper half of
  // this same bug) let the Chord Tones panel miss that the note was
  // played at all, since its own presence check compared formula's
  // "11"/"13" label against the voicing's real "4"/"6" token via exact
  // string equality and never found a match.
  // Fixed by recognizing "4"/"6" as this chord's real 11th/13th ONLY when
  // `formula.extensions` actually declares that degree -- gated so an
  // UNRELATED chord's genuine sus4 tone ("4", already claimed by the
  // sus-check above) or genuine plain 6th chord ("6", C6/C6/9's real
  // token) are completely unaffected; confirmed via real Csus4/C6/C6/9
  // data (neither has "11"/"13" in `extensions`) as part of this round's
  // stress test. The sus4+11-extension combo (a real quality, e.g.
  // C11sus4/C13sus4 -- confirmed via a live query, formula.sus=["sus4"]
  // AND extensions includes "11" simultaneously) is a genuine, narrower,
  // KNOWN LIMITATION left unresolved: "4" is already unambiguously the
  // sus4 tone for that formula (the sus-check above takes priority,
  // unchanged), and the real per-voicing data has no separate token to
  // tell an actual additional 11th apart from the sus4 tone itself --
  // flagged here rather than guessed at.
  if (interval === '4' && formula?.extensions?.includes('11') && !formula?.sus?.includes('sus4')) return 'ext11'
  if (interval === '6' && formula?.extensions?.includes('13')) return 'ext13'
  // Extension-tone tints (Phase 3 Part 5/6, 5th follow-up): bare "9"/"11"/
  // "13" each get their own lightness step of the ext family (see
  // index.css's --interval-ext-9/-11/-13) instead of one shared "ext"
  // fill -- confirmed via real C11/Cm13 screenshots that 9th/11th/13th
  // were visually indistinguishable from each other before this. Only
  // the bare extension token gets its own tint; altered variants
  // (b9/#9/#11/b13/#13) and a genuine plain "6"/non-sus "4" (i.e. NOT
  // covered by the two new checks above) still fall through to the
  // single generic "ext" bucket below, unchanged -- the task scoped this
  // to 9th/11th/13th specifically, not every extension.
  if (interval === '9') return 'ext9'
  if (interval === '11') return 'ext11'
  if (interval === '13') return 'ext13'
  return 'ext'
}

// Exported (Phase 5 Part 4/7, 4th round on ChordTonePanel) so callers that
// need a plain, non-interval CSS token resolved to its real value (e.g.
// chordTones.js's bass-slot placeholder styling, when there's no real
// interval to classify) can read it the same way this file already does
// for its own five/eight interval buckets, rather than hardcoding a
// duplicate hex literal.
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Cached per-bucket -- the underlying CSS custom properties are static
// (:root, no theme-switching on these particular tokens), so there's no
// need to re-read getComputedStyle for every single finger dot on every
// render. Bucket identity alone determines the color (never the raw
// interval/formula), so the cache key is unaffected by adding `formula`
// as a classification input above.
let _cache = null

export function getIntervalStyle(interval, formula) {
  const bucket = classifyInterval(interval, formula)
  if (!_cache) _cache = {}
  if (_cache[bucket]) return _cache[bucket]

  const suffix = SUFFIX_BY_BUCKET[bucket]
  const style = {
    bucket,
    fill: cssVar(`--interval-${suffix}`),
    text: cssVar(`--interval-${suffix}-text`),
    // Open-note text (Phase 3 Part 5/6, 5th follow-up bugfix): the
    // per-bucket `text` color above is paired against that bucket's
    // SOLID fill (dark text on most fills, white on the two dark ones,
    // --interval-7th/-13) -- correct for a fretted dot, but wrong for an
    // open string's hollow ring, whose actual background is always the
    // dark recessed diagram well (--brown-800) regardless of which
    // bucket the note belongs to (confirmed via a real C11 screenshot:
    // the bucket-paired dark text was nearly invisible against that dark
    // background). One fixed light color for every open note, not a
    // per-bucket lookup -- the background it sits on doesn't vary by
    // bucket the way a solid fill does.
    openText: cssVar('--parchment'),
    stroke: cssVar(`--interval-${suffix}-border`),
    glow: cssVar(`--interval-${suffix}-glow`),
    className: `interval-dot--${bucket}`,
  }
  _cache[bucket] = style
  return style
}
