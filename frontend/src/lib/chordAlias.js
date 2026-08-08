// Shared root-alias normalization, used by both ManualSearch (Part A) and
// Results (Part B) so the "was this typed as an alias spelling?" logic and
// caption text live in exactly one place -- see CLAUDE.md Phase 3 Part 4/6
// follow-up round.

// Matches the leading root spelling of a chord query/string: one letter
// A-H (covers German "H" too, same as chord_parser.py's NOTE_RE) plus an
// optional trailing #/b accidental.
const ROOT_PREFIX_RE = /^[A-Ha-h](#|b)?/

// Given a typed query/chord string and the root_aliases map fetched from
// /chords, substitutes a recognized alias root spelling (e.g. "D#") with
// its canonical spelling ("Eb"), leaving the rest of the string untouched.
// Returns { normalized, changed, originalRoot, canonicalRoot }.
// `changed` is false (and originalRoot/canonicalRoot are null) whenever the
// root isn't a recognized alias -- including when it's already canonical,
// or when there's no matching root prefix at all.
export function normalizeRoot(query, rootAliases) {
  if (!query || !rootAliases) {
    return { normalized: query, changed: false, originalRoot: null, canonicalRoot: null }
  }

  const match = query.match(ROOT_PREFIX_RE)
  if (!match) {
    return { normalized: query, changed: false, originalRoot: null, canonicalRoot: null }
  }

  const rawRoot = match[0]
  const canonicalRoot = rootAliases[rawRoot]
  if (!canonicalRoot || canonicalRoot === rawRoot) {
    return { normalized: query, changed: false, originalRoot: null, canonicalRoot: null }
  }

  return {
    normalized: canonicalRoot + query.slice(rawRoot.length),
    changed: true,
    originalRoot: rawRoot,
    canonicalRoot,
  }
}

// One-line, plain-language enharmonic caption shown in ManualSearch while
// typing (Part B.1).
export function enharmonicCaption(originalRoot, canonicalRoot) {
  return `${originalRoot} and ${canonicalRoot} are the same note, just spelled differently ("enharmonic") -- showing ${canonicalRoot} chords.`
}

// Results-page reinforcement caption (Part B.2) -- reuses normalizeRoot's
// alias-comparison logic (see below) rather than re-deriving it, but reads
// differently since it references what was actually typed and where they
// landed, e.g. "Searched as D#m7 -- same note as Eb, shown here as Ebm7."
export function resultsEnharmonicCaption(searchedAs, canonicalRoot, chordName) {
  return `Searched as ${searchedAs} -- same note as ${canonicalRoot}, shown here as ${chordName}.`
}
