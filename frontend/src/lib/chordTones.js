// Shared functional-slot logic for a chord's guide-tone formula -- Phase 5
// Part 4/7. Originally lived only inside VoicingModal.jsx (built for its
// "Omitted from this voicing" sentence, Phase 3 Part 5/6's 3rd+4th
// follow-ups); pulled out into its own module here so the new
// ChordTonePanel.jsx can reuse the EXACT same "what slots does this
// chord's formula have" logic rather than re-deriving it a second way,
// per CLAUDE.md's core rule against parallel implementations of the same
// theory decision. VoicingModal.jsx now imports from here too -- nothing
// about its own behavior changed, this is a pure extraction.
//
// `formula` is the /voicings/{chord} response's `formula` field --
// `{root, third, sus, fifth, seventh, extensions}` -- computed
// backend-side by interval_calculator.guide_tone_formula(). See that
// function's docstring (and CLAUDE.md's Phase 3 Part 5/6 "Follow-up pass
// #3" entry) for why it's driven off the structured quality dict rather
// than a flat semitone set.
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

// REAL BUG, found + fixed this round (Phase 5 Part 4/7, 13th follow-up):
// a formula tone's OWN token (e.g. "11") isn't always the literal string
// a real voicing uses for that same degree -- confirmed directly against
// live data (see intervalColors.js's classifyInterval for the full
// root-cause writeup, which this file shares). An unaltered natural 11th
// is declared as formula token "11" but every real voicing logs it as
// "4"; a natural 13th is USUALLY "13" but is inconsistently "6" in some
// real Cm13 rows for the identical pitch. This is what caused a real,
// confirmed bug: a Cmaj11/E voicing that genuinely plays its F (the
// natural 11th, real token "4") was shown as MUTED/omitted here, while
// the SAME real "4" token correctly drove the fretboard diagram's own
// dot -- the diagram reads voicing.intervals directly, this file was
// comparing against formula's own label instead.
// realTokenAliases() returns every string a voicing might legitimately
// use for a given formula tone -- almost always just the tone's own
// token, plus the two confirmed real divergences above. Deliberately
// NOT a blanket "match by degree" rewrite (tried and rejected) -- that
// would incorrectly conflate a chord's sus2 tone with an unrelated sus4
// tone, which share ONE color bucket but are two structurally different,
// mutually exclusive real tokens ("9" vs "4") that must stay
// distinguishable; a narrow alias list keeps every other degree's exact-
// match behavior completely unchanged.
// The sus4+11-extension combo (a real quality, e.g. C11sus4/C13sus4 --
// confirmed via a live query: formula.sus=["sus4"] AND extensions
// includes "11" simultaneously) is a genuine, narrower, KNOWN LIMITATION
// left unresolved here, matching the same call made in
// intervalColors.js: "4" is already unambiguously the sus4 tone for that
// formula, and the real per-voicing data has no separate token to tell
// an actual additional 11th apart from the sus4 tone itself.
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

// --- ChordTonePanel data model (Phase 5 Part 4/7) -------------------------
//
// buildAllToneSlots() is the ONE place that decides, per structural
// degree: what to title it, what the "other conventional names for this
// slot" reference list is (with the chord's own real choice marked so
// the caller can highlight it), what color it should render in (reusing
// the same getIntervalStyle tokens that color the matching fretboard
// dot), and whether THIS voicing actually plays it. Layout-agnostic (no
// JSX, no assumptions about row-vs-column arrangement) specifically so a
// future layout variant of this panel can reuse this exact data shape
// instead of re-deriving "what are this chord's slots" a third time.
//
// Real per-voicing/formula vocabulary used below was confirmed against
// live /voicings/{chord} responses, not assumed from the prose comments
// elsewhere in this codebase (which turned out to describe an older/
// imprecise version of the third-slot vocabulary -- see DEGREE_META's
// own `third` entry: real data uses "m3", never "b3"; C11 and Cm7 both
// queried live to confirm "b7"/"m3" are the actual tokens, not bare
// "7"/"b3").
//
// This round (3rd follow-up on the panel) always shows all canonical
// structural degrees for every chord, not just the ones this chord's
// formula uses -- real feedback wanted the full theory framework visible
// (Oolimo-influenced), with formula-outside degrees rendered as a
// visually secondary "muted" tier (see ChordTonePanel.jsx/.css) rather
// than hidden.
//
// 4th round on this panel adds `group` to every row (Triad / 7th·6th /
// Extensions / Bass -- see GROUP_LABELS), for ChordTonePanel.jsx to
// insert a small eyebrow-label divider whenever the group changes, and a
// representative `style` even on muted rows (see REPRESENTATIVE_TOKEN)
// so a muted cell can still tint itself with that degree's own real
// color family at very low opacity, per the task's explicit "reuse
// existing tokens, don't invent a neutral one" instruction -- the CHIP
// itself still renders flat/no-glow for muted rows regardless (that
// distinction is drawn in the renderer, not here).
//
// 7th follow-up on this panel: "sixth" PROMOTED to a permanent canonical
// degree (was previously an ad-hoc "extra" only interleaved into the
// list when a chord's formula actually contained one) -- every chord's
// panel now has 8 canonical degree slots, always, not 7-9 variably.
// Shares 'seventh's `group: 'seventh'` -- this is what keeps the two
// rows physically adjacent under one divider, same reasoning as the
// previous round's regroup (a 6 is the 5th's peer color-tone
// ALTERNATIVE to a 7th, not stacked on top of one the way a real
// extension is, so it belongs beside the 7th-degree row, not among
// 9th/11th/13th).
//
// 8th follow-up (this round): reordered to come BEFORE 'seventh', not
// after -- scale degrees ascend everywhere else in this list (Triad
// reads Root->3rd->5th, Extensions reads 9th->11th->13th); 6 < 7
// numerically, so the "7th / 6th" group's own cell order should read
// 6th-then-7th to match that same ascending convention (the divider's
// TEXT stays "7th / 6th", unchanged -- only the two cells' physical
// order flipped, see GROUP_LABELS' own comment for why the text itself
// wasn't touched).
const CANONICAL_DEGREES = ['root', 'third', 'fifth', 'sixth', 'seventh', 'ninth', 'eleventh', 'thirteenth']

const DEGREE_META = {
  // ROOT and SIXTH are the only two canonical degrees with just ONE real
  // token in this app's model -- unlike 3rd/5th/7th/9th/11th/13th,
  // there's no genuine alternate spelling to compare against. They still
  // get a real, non-empty `options` list (so their reference line isn't
  // empty), but bolding follows the SAME rule as every other degree:
  // only a PRIMARY-tier row's real formula token ever bolds (see
  // primaryRow() below, unchanged) -- a MUTED 6th never bolds "6",
  // exactly like a muted 9th never bolds "9". `alwaysActive` (the 8th
  // follow-up's mechanism for forcing a bolded token on a MUTED row
  // too) was a REAL BUG, confirmed via a real C7#11 screenshot: it made
  // the Bass/6th cells bold their token even when the chord genuinely
  // has neither, contradicting what "bolded" means everywhere else in
  // this panel (this chord's real, active choice) -- removed entirely
  // this round, see mutedRow() below.
  root:       { title: 'Root', options: ['1'], group: 'triad' },
  third:      { title: '3rd', options: ['m3', '3', 'sus2', 'sus4'], group: 'triad' }, // sus tones occupy this same structural slot
  fifth:      { title: '5th', options: ['b5', '5', '#5'], group: 'triad' },
  // No real alternate-spelling options exist for a plain added 6th
  // (confirmed against interval_calculator's own documented extensions
  // vocabulary) -- same "trivially unambiguous" reasoning as Root above.
  sixth:      { title: '6th', options: ['6'], group: 'seventh' },
  seventh:    { title: '7th', options: ['b7', '7', 'maj7', 'dim7'], group: 'seventh' },
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
// one whenever a row's `group` differs from the previous row's). Every
// group always has at least one row under the always-show-all-degrees
// model (even an empty group is represented by a muted placeholder row),
// so all 4 always render -- there's no real "empty category" case to
// conditionally skip.
//
// DECISION this round (7th follow-up on this panel, promoting "6" to a
// permanent slot): the 'seventh' group's divider now reads a STATIC
// "7th / 6th" always, not conditionally (a prior round computed this
// dynamically in ChordTonePanel.jsx, showing plain "7th" whenever a
// chord happened to have no 6). That conditional logic no longer makes
// sense now that the 6th-degree slot is ALWAYS present (primary or
// muted) for every chord, exactly like every other canonical degree --
// the divider describes the two cells that are always physically there
// underneath it, not a fact about this specific chord. Simpler and more
// honest than keeping the old per-chord conditional around.
// Renamed 'bass' -> "Bass (Inversion)" this round (9th follow-up), per
// real feedback -- makes it explicit this slot is specifically about
// slash-chord inversions, not a generic degree the way the other 3
// groups' cells are.
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
  ext9: 'ninth',
  ext11: 'eleventh',
  ext13: 'thirteenth',
}

// classifyInterval() collapses ALTERED 9/11/13ths (#9/b9/#11/b13/#13)
// into its single generic "ext" color bucket (Phase 3 Part 5/6's own
// design -- unchanged, this only affects which canonical row the token
// structurally belongs under, not its color). A plain "6" now routes to
// its own permanent 'sixth' degree (7th follow-up on this panel --
// previously fell through to null/"extra" here); a non-sus "4" still has
// no home among the canonical degrees at all.
function extensionDegree(token) {
  if (token === '6') return 'sixth'
  if (['b9', '9', '#9'].includes(token)) return 'ninth'
  if (['11', '#11'].includes(token)) return 'eleventh'
  if (['b13', '13', '#13'].includes(token)) return 'thirteenth'
  return null
}

// Builds one row per structural degree, in fixed canonical order, for
// EVERY chord -- a degree this chord's formula doesn't structurally have
// (e.g. no 9th/11th/13th on a plain triad) still gets a row, tagged
// `tier: 'muted'` so the renderer can visually de-emphasize it, rather
// than being omitted the way earlier rounds of this panel did. A degree
// the formula DOES have gets `tier: 'primary'`, with the exact same
// filled/omitted-from-this-voicing/color logic as before.
//
// The rare sus2sus4 base (formula.sus can hold BOTH labels at once --
// see interval_calculator.guide_tone_formula's own docstring) produces
// two 'third'-degree rows instead of one. `extras` below is now a purely
// defensive path -- since "6" was promoted to its own canonical degree
// (7th follow-up), the only tokens that could still land there are ones
// this app has never actually seen in real data (extensionDegree()
// returns null for them); kept so a genuinely unknown future token still
// renders SOMEWHERE (grouped with 'seventh', same contiguous-run
// reasoning as before) rather than being silently dropped, not because
// this path is expected to ever fire today.
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
    // A genuinely unknown formula token (see `extras` comment above) has
    // degree === null here -- falls back to the 'seventh' group as a
    // reasonable default rather than crashing or silently dropping it.
    const meta = DEGREE_META[degree] || { title: tone.label, options: [], group: 'seventh' }
    // ALIAS-AWARE presence check (13th follow-up, real bugfix -- see
    // realTokenAliases()'s own header comment above for the full
    // root-cause writeup): checks every real token this voicing might
    // legitimately use for this formula tone, not just the tone's own
    // literal label. `matchedToken` (not just a boolean) is kept so the
    // displayed note name comes from whichever real token actually
    // matched, not assumed to be `tone.realToken` itself.
    const matchedToken = realTokenAliases(tone.realToken, formula).find((tok) => tok in noteByToken)
    return {
      key: `${bucket}-${tone.realToken}`,
      tier: 'primary',
      group: meta.group,
      isExtra: degree === null,
      // BUGFIX (caught on a real Csus4 screenshot, this panel's first
      // round): a sus tone reuses the third DEGREE's slot and color, but
      // structurally is NOT a 3rd -- title must say "sus4"/"sus2", not
      // the degree's generic "3rd".
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
      // Muted rows carry their real `options` list (7th follow-up), per
      // the "every cell, primary or muted, always shows its reference
      // text" instruction. `active` is ALWAYS null here (9th follow-up
      // BUGFIX -- see DEGREE_META's own comment above for the real bug
      // this fixes) -- nothing is ever bolded on a muted row, full
      // stop, exactly like every other muted degree already worked;
      // ReferenceLine's own "which option is the active one" logic
      // naturally never matches anything against a null `active`.
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
    // Any genuinely unknown extension token (see `extras`'s own comment
    // above -- not expected to fire on real data today) is interleaved
    // right here, after BOTH the sixth- and seventh-degree rows have
    // been emitted (8th follow-up: 'seventh' is now the LAST degree in
    // this group, since sixth was reordered ahead of it) -- keeps the
    // 'seventh' group one CONTIGUOUS run in the flat list so
    // ChordTonePanel.jsx's group-change divider logic still renders
    // exactly one "7th / 6th" divider, not two.
    if (degree === 'seventh') {
      extras.forEach((entry) => rows.push(primaryRow(entry, null)))
    }
  })

  return rows
}

// The Bass row -- NOT part of the chord's formula (a slash-chord's bass
// note is a fact about which inversion is being searched, not the
// chord's own structure). This round (4th on this panel): ALWAYS
// returned now, never null -- real feedback wanted Bass consistent with
// the "show the full possible framework" treatment already applied to
// the other 7 degrees, rather than conditionally present. `tier` is
// 'primary'/filled only when the caller has a real, non-null `bass` (the
// /voicings/{chord} response's top-level `bass` field); otherwise
// 'muted', same visual treatment as any other formula-outside degree.
//
// When present, colored via whichever structural degree the bass note's
// own interval falls into (e.g. a first-inversion Cmaj7/E's bass is
// genuinely the chord's own 3rd) -- confirmed against real Cmaj7/E data
// during this feature's first round, unchanged. When absent, there's no
// real bass note to derive a color family from at all (unlike the 7
// canonical degrees, which always have a REPRESENTATIVE_TOKEN even when
// muted) -- styled with this app's existing neutral surface/border/muted
// tokens instead (via intervalColors.js's exported cssVar, not a
// hardcoded duplicate hex), not a fabricated "bass color."
//
// `options`/`active` REVERTED to empty this round (9th follow-up) --
// a prior round had given Bass a literal "bass" reference token (a
// judgment call, flagged at the time as a different KIND of reference
// than every other cell's, restating identity rather than a real
// alternate spelling). Real feedback: not useful, remove it entirely --
// Bass now shows just its chip + "BASS" label, no reference text at
// all, a deliberate exception to every other cell always showing one
// (Bass genuinely has no scale-degree alternate-spelling concept the
// way 3rd/5th/7th/etc. do -- which specific degree a bass note IS
// varies per chord, it's not a fixed slot identity the way Root's "1"
// or Sixth's "6" are). ReferenceLine already self-hides on an empty
// `options` array, so no extra rendering logic was needed for this.
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
