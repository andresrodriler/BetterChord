import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getChords } from '../lib/api'
import { enharmonicCaption, normalizeAliases } from '../lib/chordAlias'
import { renderChordNote } from '../lib/renderChordNote'
import './ManualSearch.css'

const MAX_SUGGESTIONS = 8

// Two-pass matching against the full chord list (see CLAUDE.md Phase 3
// Part 4/6 for the full rationale). Order matters -- pass 1 always runs
// first and, if it finds anything, pass 2 never runs.
//
// `query` is expected to already be root-alias-normalized (see
// normalizeAliases in chordAlias.js) -- the matcher itself has no alias
// awareness, so an alias spelling like "D#" would otherwise silently
// match nothing (the suggestion list only contains canonical spellings).
function getSuggestions(query, chordList) {
  if (!query || !chordList.length) return []

  // Pass 1: case-insensitive prefix match of the raw query as a complete
  // string. Handles compound-quality chords like "A6/9" directly -- since
  // "A6/9" is a genuine list entry, its own slash never needs special-casing.
  const lowerQuery = query.toLowerCase()
  const prefixMatches = chordList.filter((c) => c.chord.toLowerCase().startsWith(lowerQuery))
  if (prefixMatches.length > 0) return prefixMatches.slice(0, MAX_SUGGESTIONS)

  // Pass 2 (fallback, only when pass 1 is empty):
  if (query.includes('/')) {
    // Inversion typed (e.g. "Cmaj7/E") -- prefix-match only the part before
    // the slash, so the base chord still surfaces even though bass notes
    // aren't in the suggestion list.
    const base = query.slice(0, query.indexOf('/')).toLowerCase()
    if (!base) return []
    return chordList.filter((c) => c.chord.toLowerCase().startsWith(base)).slice(0, MAX_SUGGESTIONS)
  }

  if (query.length >= 2) {
    // Quality-only query with no root (e.g. "sus4") -- substring match.
    return chordList.filter((c) => c.chord.toLowerCase().includes(lowerQuery)).slice(0, MAX_SUGGESTIONS)
  }

  // Under 2 chars and pass 1 empty -- no suggestions, avoids a noisy dump.
  return []
}

// Autocomplete text input + submit, reused on Home, Results, and inside the
// capture modal's "search manually instead" path. The full chord suggestion
// list (and the root-alias map alongside it) is fetched once (via
// getChords()'s module-level cache) regardless of how many times this
// component mounts.
function ManualSearch({ onSubmit }) {
  const [value, setValue] = useState('')
  const [chordList, setChordList] = useState([])
  const [rootAliases, setRootAliases] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [rootNorm, setRootNorm] = useState({ changed: false })
  const navigate = useNavigate()
  const wrapRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getChords()
      .then(({ chords, rootAliases: aliases }) => {
        if (!cancelled) {
          setChordList(chords)
          setRootAliases(aliases)
        }
      })
      .catch(() => {
        // Autocomplete is a progressive enhancement -- if /chords fails,
        // fall back silently to plain submit-only search.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(e) {
    const next = e.target.value
    setValue(next)
    const trimmed = next.trim()
    // Normalize an alias root spelling (e.g. "D#" -> "Eb") BEFORE matching --
    // the suggestion list only ever contains canonical spellings. (Bass
    // aliases are also detected by normalizeAliases now, but the typing
    // caption below intentionally only ever surfaces the root one -- see
    // enharmonicCaption's comment.)
    const norm = normalizeAliases(trimmed, rootAliases)
    setRootNorm(norm)
    const nextSuggestions = getSuggestions(norm.normalized, chordList)
    setSuggestions(nextSuggestions)
    setIsOpen(nextSuggestions.length > 0)
    setHighlightedIndex(-1)
  }

  // `fromSuggestion` (Phase 5 Part 2/7 follow-up, Task 2): true whenever
  // `chordName` came from a canonical suggestion (mouse click or
  // arrow-key-select + Enter), false for a raw typed-then-submit value.
  // Threaded into route state so Results.jsx's conditional "why" teaser
  // can tell "the URL differs because of a genuine spelling substitution"
  // (typed+submit) apart from "the URL differs because a dropdown pick
  // completed a partial prefix" (e.g. typing "Cmaj" and clicking
  // "Cmaj7") -- both leave `searchedAs` != the final chord, but only the
  // former is a real substitution worth teasing.
  function goToChord(chordName, searchedAs, fromSuggestion) {
    onSubmit?.()
    setIsOpen(false)
    navigate(`/chord/${encodeURIComponent(chordName)}`, { state: { searchedAs, fromSuggestion } })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      goToChord(suggestions[highlightedIndex].chord, value, true)
      return
    }
    const chord = value.trim()
    if (!chord) return
    // Typing a full chord and hitting Search without ever opening/selecting
    // the dropdown must still land on the same canonical chord as a
    // suggestion click would -- normalize root AND bass here (this
    // follow-up: a real bug had this only normalizing the root, so a
    // slash chord's bass note reached Results un-canonicalized).
    const { normalized } = normalizeAliases(chord, rootAliases)
    goToChord(normalized, value, false)
  }

  function handleKeyDown(e) {
    if (!isOpen || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setHighlightedIndex(-1)
    }
    // Enter is handled by form onSubmit above.
  }

  return (
    <form className="manual-search" onSubmit={handleSubmit} ref={wrapRef}>
      <div className="manual-search__row">
        <div className="manual-search__field-wrap">
          <span className="manual-search__icon" aria-hidden="true">🔍</span>
          <label className="visually-hidden" htmlFor="manual-search-input">
            Search a chord by name
          </label>
          <input
            id="manual-search-input"
            className="text-input manual-search__input"
            type="text"
            autoComplete="off"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setIsOpen(true)}
            placeholder="Search a chord... e.g. Cmaj7/E for inversions"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls="manual-search-listbox"
            aria-autocomplete="list"
          />
          {isOpen && (
            <div className="manual-search__suggestions-panel">
              {rootNorm.root && (
                // Pinned header row inside the same floating panel as the
                // suggestions -- not a list option: no role="option", not
                // part of arrow-key navigation (that only ever indexes into
                // `suggestions`, never this row), and its mousedown does
                // nothing beyond staying inside the panel (no navigation).
                // Only ever rendered attached to an open, non-empty
                // dropdown -- never floats on its own. See CLAUDE.md Phase
                // 3 Part 4/6 follow-up notes: a zero-match alias query
                // (e.g. "D#zzz") is a real, reachable case, and by this
                // same gating (isOpen implies suggestions.length > 0) the
                // caption is deliberately suppressed then too, not just
                // when non-alias.
                // Gated on `rootNorm.root` specifically, not the broader
                // `rootNorm.changed` (this follow-up: normalizeAliases now
                // also flags a bass-only change) -- this typing caption is
                // deliberately root-only, see enharmonicCaption's comment.
                <div
                  className="manual-search__enharmonic-note"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {renderChordNote(enharmonicCaption(rootNorm.root.original, rootNorm.root.canonical))}
                </div>
              )}
              <ul className="manual-search__suggestions" id="manual-search-listbox" role="listbox">
                {suggestions.map((s, i) => (
                  <li
                    key={s.chord}
                    role="option"
                    aria-selected={i === highlightedIndex}
                    className={
                      'manual-search__suggestion' +
                      (i === highlightedIndex ? ' manual-search__suggestion--active' : '')
                    }
                    onMouseDown={(e) => {
                      // mousedown (not click) fires before the input's blur, so
                      // the click-outside handler above doesn't close this first.
                      e.preventDefault()
                      goToChord(s.chord, value, true)
                    }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    {s.chord}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button className="btn btn-primary" type="submit">Search</button>
      </div>
    </form>
  )
}

export default ManualSearch
