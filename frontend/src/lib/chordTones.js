// Shared functional-slot logic for a chord's guide-tone formula, used by
// both VoicingModal.jsx's "Omitted from this voicing" sentence and
// ChordTonePanel.jsx -- one implementation of "what slots does this
// chord's formula have," per CLAUDE.md's rule against parallel theory
// implementations.
//
// `formula` is the /voicings/{chord} response's `formula` field --
// `{root, third, sus, fifth, seventh, extensions}` -- computed by
// interval_calculator.guide_tone_formula() (see its docstring for why
// it's driven off the structured quality dict, not a flat semitone set).
import { classifyInterval, cssVar, getIntervalStyle, susRealToken } from './intervalColors'

// Every functional slot THIS chord's formula structurally has, in
// formula order (root, third-or-sus, fifth, seventh, each extension) --
// a slot the formula doesn't have (e.g. no third/seventh for a sus
// chord) is simply absent from the list, never present-but-empty.
// `realToken` is the literal string a real voicing's own `intervals`
// array would contain for this slot (already resolved through
// `susRealToken` for the two sus display labels, which don't appear
// verbatim in real per-voicing data -- see susRealToken's own comment).
export function formulaTones(formula) {
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

// A formula tone's own token (e.g. "11") isn't always the string a real
// voicing uses for that degree: an unaltered natural 11th is formula
// token "11" but voicings log it as "4"; a natural 13th is usually "13"
// but is inconsistently "6" for the same pitch in some real Cm13 rows.
// Comparing formula's label directly against voicing.intervals therefore
// misses genuinely-played notes (the fretboard diagram reads
// voicing.intervals and got these right; this file didn't).
// realTokenAliases() returns every token a voicing might use for a given
// formula tone. Not a blanket "match by degree" -- that would conflate a
// chord's sus2 tone with an unrelated sus4 tone (both in one color
// bucket, but "9" vs "4", mutually exclusive). Known limitation, same as
// intervalColors.js: for the sus4+11-extension combo (e.g. C11sus4) "4"
// is already the sus4 tone and real data has no separate token for an
// additional 11th.
function realTokenAliases(token, formula) {
  if (token === '11' && !formula?.sus?.includes('sus4')) return ['11', '4']
  if (token === '13') return ['13', '6']
  return [token]
}

// Every formula slot THIS SPECIFIC VOICING's own `intervals` doesn't
// include -- used for the existing "Omitted from this voicing" sentence.
export function omittedTones(intervals, formula) {
  const present = new Set(intervals || [])
  return formulaTones(formula)
    .filter((t) => !realTokenAliases(t.realToken, formula).some((tok) => present.has(tok)))
    .map((t) => t.label)
}

// Every tone the chord's formula has at all, in formula order -- used for
// the "includes all of ..." fallback sentence.
export function presentToneLabels(formula) {
  return formulaTones(formula).map((t) => t.label)
}

// Which of this voicing's played notes are optional per the chord's
// theory -- i.e. present but not required for the chord's name to apply
// (interval_calculator.guide_tone_formula's `omittable` field, from the
// required/full distinction compute_intervals() computes for
// CNN-identification scoring). The inverse of omittedTones() above, which
// reports REQUIRED tones this voicing leaves out. A missing
// `formula.omittable` is treated as "nothing omittable."
export function omittableAndPlayedTones(intervals, notes, formula) {
  const present = new Set(intervals || [])
  const omittableLabels = new Set(formula?.omittable || [])
  if (omittableLabels.size === 0) return []
  return formulaTones(formula)
    .filter((t) => omittableLabels.has(t.label))
    .map((t) => {
      const idx = realTokenAliases(t.realToken, formula).reduce((found, tok) => {
        if (found !== -1) return found
        const i = (intervals || []).indexOf(tok)
        return i
      }, -1)
      return { label: t.label, note: idx >= 0 ? notes?.[idx] : null, played: realTokenAliases(t.realToken, formula).some((tok) => present.has(tok)) }
    })
    .filter((t) => t.played)
}

// --- ChordTonePanel data model ------------------------------------------
//
// buildAllToneSlots() is the ONE place that decides, per structural
// degree: its title, its "other conventional names for this slot"
// reference list (with the chord's own choice marked), its color (the
// same getIntervalStyle tokens that color the matching fretboard dot),
// and whether this voicing plays it. Layout-agnostic (no JSX) so a
// future layout variant can reuse this data shape.
//
// The panel shows ALL canonical structural degrees for every chord, not
// just the ones this chord's formula uses -- degrees the formula lacks
// render as a visually secondary "muted" tier rather than being hidden.
// Every row carries a `group` (Triad / 7th·6th / Extensions / Bass, see
// GROUP_LABELS) for ChordTonePanel.jsx's eyebrow-label dividers, and a
// representative `style` even on muted rows so a muted cell can tint
// itself with that degree's color family at low opacity (the chip still
// renders flat/no-glow for muted rows -- drawn in the renderer).
//
// The per-degree vocabulary in DEGREE_META below was taken from live
// /voicings/{chord} responses: real data uses "m3" not "b3", "b7" not
// bare "7".
//
// CANONICAL_DEGREES is in ascending scale-degree order throughout (Triad
// Root->3rd->5th, then 6th before 7th, then Extensions 9th->11th->13th).
// 6th and 7th share `group: 'seventh'` so they sit adjacent under one
// divider -- a 6 is the 5th's peer alternative to a 7th, not an
// extension stacked on top of one.
const CANONICAL_DEGREES = ['root', 'third', 'fifth', 'sixth', 'seventh', 'ninth', 'eleventh', 'thirteenth']

const DEGREE_META = {
  // ROOT and SIXTH each have just ONE token in this app's model -- no
  // genuine alternate spelling to compare against, unlike 3rd/5th/7th/
  // 9th/11th/13th. They still get a non-empty `options` list so their
  // reference line isn't blank, but bolding follows the same rule as
  // every degree: only a PRIMARY-tier row's real formula token bolds
  // (see primaryRow()) -- a muted 6th never bolds "6", exactly like a
  // muted 9th never bolds "9".
  root:       { title: 'Root', options: ['1'], group: 'triad' },
  third:      { title: '3rd', options: ['m3', '3', 'sus2', 'sus4'], group: 'triad' }, // sus tones occupy this same structural slot
  fifth:      { title: '5th', options: ['b5', '5', '#5'], group: 'triad' },
  // No alternate-spelling options for a plain added 6th -- same
  // "unambiguous" reasoning as Root above.
  sixth:      { title: '6th', options: ['6'], group: 'seventh' },
  // Bare "7" is not in this reference list: it's redundant with "b7".
  // voicings.db's `intervals` never contains bare "7" (only "b7"), and
  // interval_calculator.py's _SEVENTH_LABEL maps the quality-dict's
  // internal "7" key to output label "b7" before `formula.seventh`
  // reaches the frontend, so "7" is never a spelling a user sees --
  // listing it would falsely imply a distinct alternate spelling.
  // classifyInterval() still accepts bare "7" defensively for COLOR
  // classification (a different, harmless case).
  seventh:    { title: '7th', options: ['b7', 'maj7', 'dim7'], group: 'seventh' },
  ninth:      { title: '9th', options: ['b9', '9', '#9'], group: 'extensions' },
  eleventh:   { title: '11th', options: ['11', '#11'], group: 'extensions' },
  thirteenth: { title: '13th', options: ['b13', '13', '#13'], group: 'extensions' },
}

// A representative BARE token per canonical degree, used ONLY to resolve
// a "what color family does this degree belong to" style for a MUTED row
// (this chord's formula doesn't actually have a real token for that
// degree, so there's nothing else to color it by). Never used for a
// primary row, which always colors by its own real formula token instead.
const REPRESENTATIVE_TOKEN = {
  root: '1', third: '3', fifth: '5', seventh: 'b7', sixth: '6',
  ninth: '9', eleventh: '11', thirteenth: '13',
}

// Eyebrow-label text for each group divider (ChordTonePanel.jsx renders
// one whenever a row's `group` changes). All 4 always render -- every
// group has at least one row under the show-all-degrees model, even if
// it's a muted placeholder.
//
// The 'seventh' divider reads a static "7th / 6th": both slots are
// always present (primary or muted), so it describes the two cells
// physically under it, not a fact about the specific chord. 'bass' reads
// "Bass (Inversion)" to make explicit it's about slash-chord inversions,
// not a generic degree.
const GROUP_LABELS = {
  triad: 'Triad',
  seventh: '7th / 6th',
  extensions: 'Extensions',
  bass: 'Bass (Inversion)',
}

const BUCKET_TO_DEGREE = {
  root: 'root',
  third: 'third',
  fifth: 'fifth',
  seventh: 'seventh',
  sixth: 'sixth',
  ext9: 'ninth',
  ext11: 'eleventh',
  ext13: 'thirteenth',
}

// classifyInterval() collapses ALTERED 9/11/13ths (#9/b9/#11/b13/#13)
// into its generic "ext" color bucket; this function only decides which
// canonical row such a token belongs under, not its color. A plain "6"
// routes to the 'sixth' degree; a non-sus "4" has no canonical degree.
function extensionDegree(token) {
  if (token === '6') return 'sixth'
  if (['b9', '9', '#9'].includes(token)) return 'ninth'
  if (['11', '#11'].includes(token)) return 'eleventh'
  if (['b13', '13', '#13'].includes(token)) return 'thirteenth'
  return null
}

// Builds one row per structural degree, in fixed canonical order, for
// every chord. A degree the formula lacks still gets a row, tagged
// `tier: 'muted'` for the renderer to de-emphasize; a degree the formula
// has gets `tier: 'primary'` with the filled/omitted/color logic.
//
// The rare sus2sus4 base (formula.sus holds both labels) produces two
// 'third'-degree rows. `extras` is a defensive path: it only catches
// tokens extensionDegree() can't place, none of which appear in real
// data today -- kept so an unknown future token renders somewhere
// (grouped with 'seventh') rather than being dropped.
export function buildAllToneSlots(voicing, formula) {
  const intervals = voicing?.intervals || []
  const notes = voicing?.notes || []
  const noteByToken = {}
  for (let i = 0; i < intervals.length; i++) {
    if (!(intervals[i] in noteByToken)) noteByToken[intervals[i]] = notes[i]
  }

  const byDegree = {}
  const extras = []
  formulaTones(formula).forEach((tone) => {
    const bucket = classifyInterval(tone.realToken, formula)
    const degree = BUCKET_TO_DEGREE[bucket] || (bucket === 'ext' ? extensionDegree(tone.realToken) : null)
    const entry = { tone, bucket }
    if (degree) {
      ;(byDegree[degree] ||= []).push(entry)
    } else {
      extras.push(entry)
    }
  })

  function primaryRow({ tone, bucket }, degree) {
    const style = getIntervalStyle(tone.realToken, formula)
    const isSus = tone.label === 'sus2' || tone.label === 'sus4'
    // An unknown formula token (see `extras`) has degree === null --
    // fall back to the 'seventh' group rather than crash or drop it.
    const meta = DEGREE_META[degree] || { title: tone.label, options: [], group: 'seventh' }
    // Alias-aware presence check (see realTokenAliases): match against
    // every token this voicing might use for this formula tone, not just
    // its literal label. Keep the matched token (not a boolean) so the
    // displayed note name comes from whichever token actually matched.
    const matchedToken = realTokenAliases(tone.realToken, formula).find((tok) => tok in noteByToken)
    return {
      key: `${bucket}-${tone.realToken}`,
      tier: 'primary',
      group: meta.group,
      isExtra: degree === null,
      // A sus tone reuses the third degree's slot and color but is not a
      // 3rd -- title must say "sus4"/"sus2", not the degree's "3rd".
      title: isSus ? tone.label : meta.title,
      active: tone.label,
      options: meta.options,
      noteName: matchedToken != null ? noteByToken[matchedToken] : null,
      filled: matchedToken != null,
      style,
    }
  }

  function mutedRow(degree) {
    const meta = DEGREE_META[degree]
    return {
      key: `muted-${degree}`,
      tier: 'muted',
      group: meta.group,
      title: meta.title,
      // Muted rows still carry their `options` list (every cell shows its
      // reference text). `active` is always null -- nothing is bolded on
      // a muted row; ReferenceLine's "which option is active" logic never
      // matches against a null `active`.
      active: null,
      options: meta.options,
      noteName: null,
      filled: false,
      // Representative degree-family color, at very low opacity in the
      // renderer -- see this file's header comment on why a muted row
      // still carries a real style instead of null.
      style: getIntervalStyle(REPRESENTATIVE_TOKEN[degree], formula),
    }
  }

  const rows = []
  CANONICAL_DEGREES.forEach((degree) => {
    const matches = byDegree[degree]
    if (matches?.length) {
      matches.forEach((entry) => rows.push(primaryRow(entry, degree)))
    } else {
      rows.push(mutedRow(degree))
    }
    // Any unknown extension token (see `extras`) is interleaved here,
    // after both the sixth- and seventh-degree rows, so the 'seventh'
    // group stays one contiguous run and ChordTonePanel.jsx renders
    // exactly one "7th / 6th" divider.
    if (degree === 'seventh') {
      extras.forEach((entry) => rows.push(primaryRow(entry, null)))
    }
  })

  return rows
}

// The Bass row -- NOT part of the chord's formula (a slash-chord's bass
// note is about which inversion is searched, not the chord's structure).
// Always returned, never null, so it's consistent with the show-all-
// degrees treatment. `tier` is 'primary'/filled only when `bass` (the
// /voicings/{chord} response's top-level field) is non-null; otherwise
// 'muted'.
//
// When present, colored via whichever structural degree the bass note's
// interval falls into (e.g. Cmaj7/E's bass is the chord's 3rd). When
// absent there's no bass note to derive a color family from -- styled
// with the app's neutral surface/border/muted tokens via cssVar, not a
// fabricated "bass color."
//
// `options`/`active` are empty: Bass has no scale-degree alternate-
// spelling concept (which degree a bass note IS varies per chord, it's
// not a fixed slot identity like Root's "1"), so it shows just its chip
// + "BASS" label. ReferenceLine self-hides on empty `options`.
export function buildBassSlot(voicing, formula, bass) {
  if (bass) {
    const bassInterval = (voicing?.intervals || [])[0] || '1'
    return {
      key: 'bass',
      tier: 'primary',
      group: 'bass',
      title: 'Bass',
      active: null,
      options: [],
      noteName: bass,
      filled: true,
      style: getIntervalStyle(bassInterval, formula),
      isBass: true,
    }
  }
  return {
    key: 'bass',
    tier: 'muted',
    group: 'bass',
    title: 'Bass',
    active: null,
    options: [],
    noteName: null,
    filled: false,
    style: { fill: cssVar('--brown-800'), stroke: cssVar('--brown-700'), text: cssVar('--muted') },
    isBass: true,
  }
}

export { GROUP_LABELS }
