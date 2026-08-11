// Shared root/bass-alias normalization + chord-fact alt-spelling prose
// builder. Used by ManualSearch (typing caption + pre-navigation
// normalization) and ChordOverview (the "Why this spelling" explain bar)
// so the "is this an alias spelling?" logic and its resulting text live
// in exactly one place -- see CLAUDE.md Phase 3 Part 4/6 (original),
// Phase 5 Part 2/7 (readout styling + terminology pass, then bass
// canonicalization + quality-equivalence title unification, then the
// Chord Overview redesign -- see frontend/RESULTS_ENTRY_PATHS.md for the
// path-by-path investigation these follow-ups were based on).

// Matches the leading root spelling of a chord query/string: one letter
// A-H (covers German "H" too, same as chord_parser.py's NOTE_RE) plus an
// optional trailing #/b accidental.
const ROOT_PREFIX_RE = /^[A-Ha-h](#|b)?/

// Matches a trailing bass spelling (the /X at the very end of a slash
// chord) -- same letter/accidental grammar as the root, just anchored to
// the opposite end of the string.
const BASS_SUFFIX_RE = /\/([A-Ha-h](#|b)?)$/

// Given a typed query/chord string and the root_aliases map fetched from
// /chords, substitutes any recognized alias spelling -- at the ROOT
// position, the BASS position (if it's a slash chord), or both -- with
// its canonical spelling, leaving the rest of the string untouched.
// Renamed from `normalizeRoot` (this follow-up): a real bug was found
// where searching an enharmonic BASS note (e.g. "Ebmaj7add11/A#") left
// the bass un-canonicalized in the title/URL while the backend
// underneath was already treating it as "Bb" -- the root's own alias
// table already covers every note name (bass and root are the same 12
// pitch classes), so extending this ONE function to also check the bass
// position was the fix, not a second bass-only mechanism.
// Returns { normalized, changed, root, bass }, where `root`/`bass` are
// each either `{ original, canonical }` or `null` when that position
// wasn't a recognized alias (including when it's already canonical, or
// there's no bass at all).
export function normalizeAliases(query, rootAliases) {
  if (!query || !rootAliases) {
    return { normalized: query, changed: false, root: null, bass: null }
  }

  let normalized = query
  let root = null
  let bass = null

  const rootMatch = query.match(ROOT_PREFIX_RE)
  if (rootMatch) {
    const rawRoot = rootMatch[0]
    const canonicalRoot = rootAliases[rawRoot]
    if (canonicalRoot && canonicalRoot !== rawRoot) {
      root = { original: rawRoot, canonical: canonicalRoot }
      normalized = canonicalRoot + normalized.slice(rawRoot.length)
    }
  }

  // Matched against `normalized` (post any root swap), not the original
  // `query` -- root and bass never overlap in a real chord string (bass
  // is always after a "/", root is always before the quality blob), but
  // matching the already-updated string keeps the slice math correct by
  // construction rather than by coincidence of the two spellings having
  // equal length.
  const bassMatch = normalized.match(BASS_SUFFIX_RE)
  if (bassMatch) {
    const rawBass = bassMatch[1]
    const canonicalBass = rootAliases[rawBass]
    if (canonicalBass && canonicalBass !== rawBass) {
      bass = { original: rawBass, canonical: canonicalBass }
      normalized = normalized.slice(0, normalized.length - rawBass.length) + canonicalBass
    }
  }

  return { normalized, changed: !!(root || bass), root, bass }
}

// One "X and Y are the same note..." clause, generalized to name WHICH
// position it's about -- root gets no suffix (matches the original
// family-1 wording exactly, unchanged), bass gets a parenthetical so it
// can't be misread as another root-alias mention if it ever needs to
// appear alongside one.
function sameNoteClause(original, canonical, positionLabel) {
  const suffix = positionLabel ? ` (${positionLabel})` : ''
  return `\`${original}\` and \`${canonical}\`${suffix} are the same note, spelled differently ("enharmonic")`
}

// One-line, plain-language enharmonic caption shown in ManualSearch while
// typing (Part B.1). Root-only by design, unchanged by this follow-up --
// the suggestion list itself never includes bass/slash variants (Phase 3
// Part 4/6's scoping), so there's nothing here for a bass mention to
// attach to; the bass fix below is about the Results title/note, not
// this live typing caption.
export function enharmonicCaption(originalRoot, canonicalRoot) {
  return `${sameNoteClause(originalRoot, canonicalRoot, null)} -- shown here as \`${canonicalRoot}\` chords.`
}

// One "X (position) and Y are the same note, spelled differently
// ('enharmonic')" clause -- the position label always attaches to the
// CANONICAL spelling (never the alternate), so "Why this spelling"
// reads naturally as "here's the note we show, here's its other name."
// `alts` can have more than one real spelling (root/bass letters with
// TWO recognized aliases, e.g. "B" via both "Cb" and German "H") --
// joined with "or" rather than emitting a separate clause per alt, so
// two alternates for the same position don't read as two different
// facts.
function rootBassEnharmonicClause(canonical, alts, positionLabel) {
  const altList =
    alts.length === 1
      ? `\`${alts[0]}\``
      : `${alts.slice(0, -1).map((a) => `\`${a}\``).join(', ')} or \`${alts[alts.length - 1]}\``
  return `\`${canonical}\` (${positionLabel}) and ${altList} are the same note, spelled differently ("enharmonic")`
}

// "Why this spelling" -- ONE flowing sentence combining however many of
// root/bass alternates the resolved chord actually has, from
// /chord-info's enrichment fields (root_alt_spellings/bass_alt_spellings
// -- see api.py). ROOT/BASS ONLY (this follow-up, Task 1) -- quality
// synonyms moved to the new "Similar Chords" list instead (see
// buildSynonymText below and ChordOverview.jsx), since a quality synonym
// (e.g. aug7 <-> 7#5) is a fact about the whole CHORD's identity, not a
// single note's spelling, and reads better alongside the guide-tone
// overlap relationships it's conceptually closest to.
// Restored (this follow-up) the full "X and Y are the same note, spelled
// differently ('enharmonic')" explanation NOTE_STYLE_GUIDE.md documents
// for families 1/2 -- a previous round's rewrite had shortened this to a
// bare "X can also be spelled Y" with no explanation of WHY, and dropped
// the explicit "(the root)"/"(the bass)" labeling entirely; both are
// restored here. Chord-FACT framing throughout, deliberately never "you
// searched X" -- this is a standing fact about the CHORD, always
// available regardless of arrival path (see ChordOverview.jsx and
// RESULTS_ENTRY_PATHS.md). `info` is a `/chord-info` response's `data`
// object.
export function buildAltSpellingSentence(info) {
  if (!info) return null
  const clauses = []
  if (info.root_alt_spellings?.length) {
    clauses.push(rootBassEnharmonicClause(info.root, info.root_alt_spellings, 'the root'))
  }
  if (info.slash_bass && info.bass_alt_spellings?.length) {
    clauses.push(rootBassEnharmonicClause(info.slash_bass, info.bass_alt_spellings, 'the bass'))
  }
  if (clauses.length === 0) return null

  const sentence =
    clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`
  return `${sentence}.`
}

// "Similar Chords" -- true-synonym entry. `synonymChord` and `thisChord`
// have IDENTICAL notes, just a different quality name (e.g. `Ab7#5` /
// `Abaug7`). `reason` is the real, quality-pair-specific "why" from
// chord_info.explain_quality_synonym() (Phase 5 Part 2/7 follow-up, Task
// 3b) -- already backtick-marked for `renderChordNote`, structured data
// computed server-side, never a hardcoded per-instance string here.
// Cause-before-effect (NOTE_STYLE_GUIDE.md's EDUCATIONAL-note ordering
// rule): the theory reason leads, the identity claim + songs clause
// follow. The songs clause is UNCONDITIONAL (this follow-up's Task 3a) --
// unlike the overlap entries' conditional clause (only present when real,
// distinct song counts exist), a quality synonym canonicalizes into the
// EXACT SAME `results_by_spelling` bucket already on the page, so "any
// song tagged either spelling already appears above" is always true by
// construction, never something to check per-entry.
export function buildSynonymText(synonymChord, thisChord, reason) {
  return (
    `${reason}, so \`${synonymChord}\` and \`${thisChord}\` are the same chord, ` +
    `and any songs tagged with either are shown here too.`
  )
}
