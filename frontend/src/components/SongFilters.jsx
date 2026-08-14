import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getDefaultSongFilters, isFiltersActive } from '../lib/songFilters'
import './SongFilters.css'

const CAPO_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'has', label: 'Has capo' },
  { value: 'none', label: 'No capo' },
]

// Phase 5 Part 5/7 follow-up (Step 3): a real chord like "C" has 5,883
// distinct artists in its own results -- rendering all of them into the DOM
// on every keystroke would be wasteful and slow. Matches are already
// sorted by song count descending (computeSongFilterOptions), so capping
// at this many keeps the most-relevant results visible without scanning
// thousands of DOM nodes.
const MAX_ARTIST_SUGGESTIONS = 40

// Custom-built combobox (Phase 5 Part 5/7 follow-up, Step 3) -- replaces the
// prior round's native <datalist>, whose browser-native popup can't be
// meaningfully styled cross-browser (confirmed via screenshot: a jarring
// unstyled white list, a real implementation limitation, not a CSS miss).
// Single-select, per the original scope call (still the right one at this
// scale) -- this only changes HOW the picker is built, not what it does.
//
// 3rd follow-up round (Step 3 bugfix): this component's `query` is LOCAL
// state (the literal characters typed), only synced from the real `value`
// prop (the committed selection) via the effect below -- and that effect
// only re-fires when `value` itself actually CHANGES. If a user types
// something WITHOUT ever selecting a suggestion, `value` stays '' the
// whole time (never becomes truthy), so the effect never re-runs and the
// typed text sits in `query` untouched by anything the PARENT does --
// including "Clear filters", which only ever resets committed filter
// state, not this local text. Real, confirmed bug (see SongFiltersPanel's
// `resetToken` below for the fix -- this component itself is unchanged
// aside from that consumer-side key).
function ArtistCombobox({ id, artists, value, onChange }) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef(null)

  // Keep the displayed text in sync with the real selection when it changes
  // from OUTSIDE this component (e.g. a fresh chord navigation resetting
  // filters.artist back to ''). Does NOT cover the "typed but never
  // selected" case above -- that's handled by remounting this component
  // entirely (SongFiltersPanel's `key={resetToken}`), not by this effect.
  useEffect(() => {
    setQuery(value)
  }, [value])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Already sorted by song count descending (computeSongFilterOptions) --
    // filtering preserves that relevance order, no re-sort needed.
    const filtered = q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : artists
    return filtered.slice(0, MAX_ARTIST_SUGGESTIONS)
  }, [artists, query])

  // Click-outside closes the dropdown -- standard combobox behavior.
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  const selectArtist = (name) => {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  const clearArtist = () => {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlighted((h) => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && matches[highlighted]) selectArtist(matches[highlighted].name)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="song-filters__combobox" ref={rootRef}>
      <div className="song-filters__combobox-input-row">
        <input
          id={id}
          className="text-input song-filters__artist-input"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder="Any artist"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setHighlighted(0)
            // Typing invalidates a prior real selection until a suggestion
            // is actually picked again -- otherwise the filter would keep
            // matching the OLD artist while the box shows different text.
            if (value) onChange('')
          }}
          onKeyDown={handleKeyDown}
        />
        {/* Step 4 (3rd follow-up round): re-checked, already correct --
            this clear affordance is shown whenever a real selection
            exists, and the input's own value already displays the
            selected artist's full name (not a closed/blank-looking
            state) via the synced `query` above. No change made here. */}
        {value && (
          <button
            type="button"
            className="song-filters__combobox-clear"
            onClick={clearArtist}
            aria-label="Clear artist filter"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <ul className="song-filters__combobox-list" role="listbox">
          {matches.length === 0 && (
            <li className="song-filters__combobox-empty">No matching artists.</li>
          )}
          {matches.map((a, i) => (
            <li key={a.name} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                className={`song-filters__combobox-option${i === highlighted ? ' song-filters__combobox-option--highlighted' : ''}`}
                // onMouseDown (not onClick) so this fires BEFORE the input's
                // onBlur -- lets a real click land before the dropdown's
                // click-outside handler (or a blur) could close it first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectArtist(a.name)
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                <span>{a.name}</span>
                <span className="song-filters__combobox-count">{a.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Phase 5 Part 5/7 follow-up (Step 2, 3rd round): the currently-selected
// genres, always visible regardless of the chip grid's own scroll position
// or whatever the text filter below currently narrows the grid to --
// `selected` is the real committed filter state (filters.genres), read
// directly, never derived from the grid's own local `query`/scroll, so it
// can never silently disagree with what's actually filtering the song
// list. Each tag is independently removable.
//
// 4th follow-up round (Step 3, vertical-space pass): no longer wraps its
// own chips in a dedicated flex container -- returns the tag BUTTONS
// directly (a Fragment, not a <div>) so the caller (SongFiltersPanel) can
// render them as direct siblings of the "ARTIST GENRE" label inside ONE
// shared flex-wrap row (`.song-filters__genre-header`). That's what makes
// "inline next to the label, overflow wraps to a new line below the
// label" a single, natural flex-wrap behavior instead of two separately-
// laid-out blocks that would need to be kept in visual sync by hand.
function SelectedGenres({ selected, onToggle }) {
  return selected.map((g) => (
    <button
      key={g}
      type="button"
      className="song-filters__selected-chip"
      onClick={() => onToggle(g)}
      aria-label={`Remove ${g} genre filter`}
    >
      {g} <span aria-hidden="true">×</span>
    </button>
  ))
}

// Phase 5 Part 5/7 follow-up (Step 2): genre chips sorted by how many of
// THIS chord's own songs have that genre (descending, computeSongFilterOptions),
// not alphabetically -- the most-relevant genres are visible without
// scrolling. A small text filter narrows the visible chip list further for
// anyone hunting for something less common; it only affects which chips are
// SHOWN, not the underlying multi-select/ANY-match filter logic -- a
// selected genre whose chip gets hidden by the text filter stays selected
// underneath (confirmed: `selected`/`onToggle` operate on real genre name
// strings from `filters.genres`, completely independent of this
// component's own local `query`/`visible` narrowing).
//
// 4th follow-up round: no longer renders the selected-genre summary itself
// (moved up next to the label, see SongFiltersPanel) -- just the search
// input + the chip grid now.
function GenreChips({ genres, selected, onToggle }) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? genres.filter((g) => g.name.toLowerCase().includes(q)) : genres
  }, [genres, query])

  return (
    <>
      <input
        type="text"
        className="text-input song-filters__genre-search"
        placeholder="Filter artist genres..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="song-filters__chip-group">
        {visible.length === 0 && <span className="song-filters__combobox-empty">No matching artist genres.</span>}
        {visible.map((g) => (
          <button
            key={g.name}
            type="button"
            className="song-filters__chip"
            aria-pressed={selected.includes(g.name)}
            onClick={() => onToggle(g.name)}
          >
            {g.name} <span className="song-filters__chip-count">{g.count}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// Phase 5 Part 5/7 follow-up (5th round, user request): tap-or-hold
// increment/decrement, restoring the affordance the native number-input
// spinner used to provide before the 4th round suppressed it (that
// suppression fixed a real clipping bug -- see the year-input CSS comment
// -- but also silently dropped this). Rebuilt as themed buttons instead of
// un-suppressing the raw native spinner: a browser's own spin-button
// widget is exactly the kind of generic, unstyled, cross-browser-
// inconsistent control betterchord-design steers away from when an
// equivalent device-face pattern can be built instead, and it's also the
// same control that caused the clipping bug in the first place. First tap
// steps immediately (no waiting for the hold-repeat to kick in); holding
// past `HOLD_REPEAT_DELAY_MS` starts a steady repeat every
// `HOLD_REPEAT_INTERVAL_MS` until released -- standard press-and-hold
// numeric-stepper behavior. Real timers, cleaned up on
// mouseup/mouseleave/touchend AND on unmount (a real, easy-to-miss leak
// otherwise: releasing outside the button, or the component unmounting
// mid-hold via chord navigation, would otherwise leave an interval
// running forever).
const HOLD_REPEAT_DELAY_MS = 400
const HOLD_REPEAT_INTERVAL_MS = 90

function useHoldRepeat(onStep) {
  const timeoutRef = useRef(null)
  const intervalRef = useRef(null)

  const stop = () => {
    clearTimeout(timeoutRef.current)
    clearInterval(intervalRef.current)
  }

  const start = (e) => {
    e.preventDefault() // stop a touch from also firing a synthetic mousedown/click
    onStep()
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(onStep, HOLD_REPEAT_INTERVAL_MS)
    }, HOLD_REPEAT_DELAY_MS)
  }

  useEffect(() => stop, [])

  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: start, onTouchEnd: stop }
}

function YearStepper({ value, min, max, onChange }) {
  // Real bug, found via testing (not assumed working from the code
  // reading correctly): `useHoldRepeat`'s interval is created ONCE, at
  // mousedown time, and keeps calling that same `onStep` closure on every
  // tick for as long as the hold lasts -- it is NOT recreated on each
  // re-render. If `step` below read `value` directly (a plain prop, fresh
  // only as of the render that created the closure), every repeat tick
  // during one hold would recompute from that SAME original value instead
  // of the value the previous tick just set -- confirmed live: holding
  // for 700ms only ever produced a net +1, not the expected +4/+5.
  // Fixed by having `step` read from a ref that a `useEffect` keeps in
  // sync with the latest `value` prop on every render -- the interval's
  // old closure still calls the same `step` function object, but that
  // function's BODY now reads live data on every tick regardless of which
  // render created it, so repeated ticks correctly compound.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const clamp = (n) => Math.min(max, Math.max(min, n))
  const step = (delta) => {
    const current = valueRef.current !== '' ? parseInt(valueRef.current, 10) : min
    onChange(String(clamp((Number.isNaN(current) ? min : current) + delta)))
  }
  const up = useHoldRepeat(() => step(1))
  const down = useHoldRepeat(() => step(-1))

  return (
    <div className="song-filters__year-steppers">
      <button type="button" className="song-filters__year-stepper" aria-label="Increase year" tabIndex={-1} {...up}>
        <span aria-hidden="true">▲</span>
      </button>
      <button type="button" className="song-filters__year-stepper" aria-label="Decrease year" tabIndex={-1} {...down}>
        <span aria-hidden="true">▼</span>
      </button>
    </div>
  )
}

// Phase 5 Part 5/7 follow-up (Step 1, 3rd round): the toggle button ALONE,
// meant to sit in the Songs panel's header (top-right, next to the "Songs"
// heading), exactly mirroring HandednessToggle's placement in the Voicings
// panel's own header -- both now share `.panel-header` (Results.css).
// Split out from the collapsible panel content (SongFiltersPanel, below)
// specifically so the button's position no longer depends on how many
// structural fallback banners happen to render above the song list on a
// given chord (real bug, confirmed via screenshot: a chord triggering BOTH
// the inversion-fallback and quality-fallback banners rendered Filters
// sandwiched between them). The button and the panel share the same
// `open`/`filters` state, lifted in Results.jsx -- this component and
// SongFiltersPanel are just two views onto it, not two sources of truth.
export function SongFiltersToggle({ open, onToggleOpen, options, filters, matchCount, totalCount }) {
  const active = isFiltersActive(filters, options)
  return (
    <button
      type="button"
      className="song-filters__toggle"
      onClick={onToggleOpen}
      aria-expanded={open}
    >
      Filters
      {active && <span className="tag song-filters__count">{matchCount}/{totalCount}</span>}
      <span className="song-filters__chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
    </button>
  )
}

// Phase 5 Part 5/7 follow-up (Step 1, 3rd round): the collapsible content
// panel only (artist/genre/capo/year fields + Clear filters) -- no toggle
// button of its own anymore (see SongFiltersToggle above). Renders
// directly below the Songs panel's header, ABOVE any structural fallback
// banners, so opening it never looks like it's being inserted between
// banner text either -- same "always in one consistent place" goal Step 1
// asked for, applied to the panel's own expansion too, not just the
// button's resting position.
export function SongFiltersPanel({ open, options, filters, onChange }) {
  const artistId = useId()
  const active = isFiltersActive(filters, options)
  // Step 3 bugfix (3rd round): ArtistCombobox and GenreChips both hold
  // local, UI-only text state (what's currently TYPED, as opposed to what's
  // actually been SELECTED/committed) that nothing else in the app has a
  // handle on. "Clear filters" resetting the COMMITTED filter state
  // (`onChange(getDefaultSongFilters(options))`) doesn't touch that local
  // text at all if it was never committed in the first place -- confirmed
  // as a real bug: type into either input without selecting/toggling
  // anything, click Clear filters, the typed text stays sitting in the
  // box. Fixed the same way this exact codebase already fixes this exact
  // class of bug elsewhere (Results.jsx's `CapturePanel key={chordName}`,
  // "the standard React way to reset a component's own internal state
  // when there's no external prop for that state to begin with"): bump a
  // token on Clear and use it as both children's `key`, forcing a full,
  // clean remount rather than trying to reach into their local state from
  // outside.
  const [resetToken, setResetToken] = useState(0)

  if (!open) return null

  const handleClear = () => {
    onChange(getDefaultSongFilters(options))
    setResetToken((t) => t + 1)
  }

  const toggleGenre = (genre) => {
    onChange({
      ...filters,
      genres: filters.genres.includes(genre)
        ? filters.genres.filter((g) => g !== genre)
        : [...filters.genres, genre],
    })
  }

  return (
    <div className="song-filters__panel panel--recessed">
      <div className="song-filters__row">
        <label className="field-label" htmlFor={artistId}>Artist</label>
        <ArtistCombobox
          key={resetToken}
          id={artistId}
          artists={options.artists}
          value={filters.artist}
          onChange={(artist) => onChange({ ...filters, artist })}
        />
      </div>

      {options.genres.length > 0 && (
        <div className="song-filters__row">
          {/* 4th follow-up round (Step 3): label + selected-genre summary
              share one flex-wrap row -- the summary (SelectedGenres, now a
              Fragment of bare buttons, see above) sits inline right after
              the label as long as there's room, and wraps to a new line
              directly below the label once it doesn't fit, all as one
              natural flex-wrap flow rather than two separately-positioned
              blocks. Still strictly ABOVE the search input/chip grid --
              never wraps into either of those. Placement-only change: the
              selection itself is still `filters.genres` (independent of
              whatever the text filter below narrows the chip grid to),
              and each chip's × still calls the same `toggleGenre`. */}
          <div className="song-filters__genre-header">
            <span className="field-label">Artist Genre</span>
            <SelectedGenres selected={filters.genres} onToggle={toggleGenre} />
          </div>
          <GenreChips key={resetToken} genres={options.genres} selected={filters.genres} onToggle={toggleGenre} />
        </div>
      )}

      {/* 4th follow-up round (Step 1): Capo and Album Release Year now
          share one row (`.song-filters__row--split`, flex-wrap) instead of
          each taking a full-width row on its own -- Capo on the left,
          Year on the right. Falls back to stacking (Capo above Year)
          purely via flex-wrap once the row's own rendered width can't fit
          both `.song-filters__subfield`s comfortably (each has a real
          `min-width`, see SongFilters.css) -- driven by the row's actual
          width, not a guessed global viewport breakpoint, so it holds
          correctly regardless of how narrow the Songs panel's own column
          happens to be. */}
      <div className="song-filters__row song-filters__row--split">
        <div className="song-filters__subfield">
          <span className="field-label">Capo</span>
          <div className="song-filters__segmented">
            {CAPO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="song-filters__segment"
                aria-pressed={filters.capo === opt.value}
                onClick={() => onChange({ ...filters, capo: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {options.yearMin !== null && (
          <div className="song-filters__subfield">
            <span className="field-label">Album release year</span>
            <div className="song-filters__year-range">
              <div className="song-filters__year-field">
                <input
                  type="number"
                  className="text-input song-filters__year-input"
                  min={options.yearMin}
                  max={options.yearMax}
                  value={filters.yearMin}
                  onChange={(e) => onChange({ ...filters, yearMin: e.target.value })}
                />
                <YearStepper
                  value={filters.yearMin}
                  min={options.yearMin}
                  max={options.yearMax}
                  onChange={(v) => onChange({ ...filters, yearMin: v })}
                />
              </div>
              <span className="song-filters__year-sep" aria-hidden="true">-</span>
              <div className="song-filters__year-field">
                <input
                  type="number"
                  className="text-input song-filters__year-input"
                  min={options.yearMin}
                  max={options.yearMax}
                  value={filters.yearMax}
                  onChange={(e) => onChange({ ...filters, yearMax: e.target.value })}
                />
                <YearStepper
                  value={filters.yearMax}
                  min={options.yearMin}
                  max={options.yearMax}
                  onChange={(v) => onChange({ ...filters, yearMax: v })}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4th follow-up round (Step 2): moved up into the vertical space
          freed by merging Capo+Year into one row above -- same "only when
          a filter is active" gating and the same handleClear behavior
          (including the resetToken remount fix from the prior round),
          just repositioned. */}
      {active && (
        <button
          type="button"
          className="song-filters__clear"
          onClick={handleClear}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
