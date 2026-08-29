// Shared root/bass-alias normalization + chord-fact alt-spelling prose
// builder. Used by ManualSearch (typing caption + pre-navigation
// normalization) and ChordOverview (the "Why this spelling?" bar) so the
// "is this an alias spelling?" test and its resulting text live in one
// place. See frontend/RESULTS_ENTRY_PATHS.md for how the four Results
// entry paths differ in which of these notes should fire.

// Matches the leading root spelling of a chord query/string: one letter
// A-H (covers German "H" too, same as chord_parser.py's NOTE_RE) plus an
// optional trailing #/b accidental.
const ROOT_PREFIX_RE = /^[A-Ha-h](#|b)?/

// Matches a trailing bass spelling (the /X at the very end of a slash
// chord) -- same letter/accidental grammar as the root, just anchored to
// the opposite end of the string.
const BASS_SUFFIX_RE = /\/([A-Ha-h](#|b)?)$/

// Given a typed query/chord string and the root_aliases map from /chords,
// substitutes any recognized alias spelling -- at the ROOT position, the
// BASS position of a slash chord, or both -- with its canonical spelling,
// leaving the rest of the string untouched. Both positions use the one
// root_aliases table (bass and root are the same 12 pitch classes), so an
// enharmonic bass like "Ebmaj7add11/A#" canonicalizes the same way the
// root does rather than needing a separate mechanism.
// Returns { normalized, changed, root, bass }; `root`/`bass` are each
// `{ original, canonical }`, or `null` when that position isn't a
// recognized alias (already canonical, or no bass at all).
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

  // Matched against `normalized` (post any root swap), not `query` -- root
  // and bass never overlap in a chord string, but matching the updated
  // string keeps the slice math correct even when an alias and its
  // canonical form differ in length.
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

// A short "(X/Y are enharmonic)" parenthetical for SongCard's "UG tags
// `spelling` as `rawChord`" note (backed by songs.py's find_raw_chord()).
// Compares only the ROOT spelling, against the full rootAliases map (every
// NOTE_ALIASES entry, not just the 5 conventionally dual-spelled roots the
// "Why this spelling?" bar restricts itself to) so it works for any pair
// like B#/C or Cb/B. Returns null when there's nothing to explain -- roots
// identical, or genuinely different but not the same pitch class (a
// quality/bass difference, not a respelling) -- so the plain sentence
// stands alone without a false claim.
export function enharmonicRootNote(chordA, chordB, rootAliases) {
  if (!chordA || !chordB || !rootAliases) return null
  const rootA = chordA.match(ROOT_PREFIX_RE)?.[0]
  const rootB = chordB.match(ROOT_PREFIX_RE)?.[0]
  if (!rootA || !rootB || rootA === rootB) return null
  const canonA = rootAliases[rootA] || rootA
  const canonB = rootAliases[rootB] || rootB
  if (canonA !== canonB) return null
  return `${rootA}/${rootB} are enharmonic`
}

// One "X and Y are the same note..." clause. Root gets no position
// suffix; bass gets a parenthetical so it can't be misread as another
// root-alias mention when both appear in the same sentence.
function sameNoteClause(original, canonical, positionLabel) {
  const suffix = positionLabel ? ` (${positionLabel})` : ''
  return `\`${original}\` and \`${canonical}\`${suffix} are the same note, spelled differently ("enharmonic")`
}

// One-line enharmonic caption shown in ManualSearch while typing.
// Root-only by design -- the suggestion list never includes bass/slash
// variants, so there's nothing here for a bass mention to attach to.
export function enharmonicCaption(originalRoot, canonicalRoot) {
  return `${sameNoteClause(originalRoot, canonicalRoot, null)} -- shown here as \`${canonicalRoot}\` chords.`
}

// One "X (position) and Y are the same note, spelled differently
// ('enharmonic')" clause. The position label attaches to the CANONICAL
// spelling so it reads as "here's the note we show, here's its other
// name." `alts` can hold more than one spelling (e.g. "B" via both "Cb"
// and German "H") -- joined with "or" into one clause so two alternates
// for one position don't read as two separate facts.
function rootBassEnharmonicClause(canonical, alts, positionLabel) {
  const altList =
    alts.length === 1
      ? `\`${alts[0]}\``
      : `${alts.slice(0, -1).map((a) => `\`${a}\``).join(', ')} or \`${alts[alts.length - 1]}\``
  return `\`${canonical}\` (${positionLabel}) and ${altList} are the same note, spelled differently ("enharmonic")`
}

// "Why this spelling?" -- ONE flowing sentence covering whichever
// root/bass alternates the resolved chord has, from /chord-info's
// root_alt_spellings/bass_alt_spellings fields. Root/bass only; quality
// synonyms (e.g. aug7 <-> 7#5) go through buildSynonymText into the
// "Similar Chords" list instead, since a synonym is a fact about the
// whole chord's identity, not one note's spelling. Wording follows
// NOTE_STYLE_GUIDE.md's family 1/2 template ("X and Y are the same note,
// spelled differently ('enharmonic')", with "(the root)"/"(the bass)"
// labels). Chord-fact framing, never "you searched X" -- this is a
// standing fact about the chord, shown on every arrival path. `info` is a
// `/chord-info` response's `data` object.
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
// `Abaug7`). `reason` is the quality-pair-specific "why" from
// chord_info.explain_quality_synonym(), already backtick-marked for
// `renderChordNote`. Theory reason leads, identity + songs clause follow
// (NOTE_STYLE_GUIDE.md's EDUCATIONAL-note ordering). The songs clause is
// unconditional: a synonym canonicalizes into the same
// `results_by_spelling` bucket already on the page, so "any song tagged
// either spelling appears above" is always true -- unlike the overlap
// entries, whose songs clause is gated on real distinct counts.
export function buildSynonymText(synonymChord, thisChord, reason) {
  return (
    `${reason}, so \`${synonymChord}\` and \`${thisChord}\` are the same chord, ` +
    `and any songs tagged with either are shown here too.`
  )
}
