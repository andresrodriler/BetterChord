import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getDefaultSongFilters, isFiltersActive } from '../lib/songFilters'
import './SongFilters.css'

const CAPO_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'has', label: 'Has capo' },
  { value: 'none', label: 'No capo' },
]

// A chord like "C" has thousands of distinct artists in its results --
// rendering all of them on every keystroke would be slow. Matches are
// sorted by song count descending (computeSongFilterOptions), so the cap
// keeps the most-relevant ones visible.
const MAX_ARTIST_SUGGESTIONS = 40

// Custom combobox replacing a native <datalist>, whose popup can't be
// styled cross-browser. Single-select.
//
// `query` is local state (the typed characters), synced from the `value`
// prop (the committed selection) via the effect below only when `value`
// changes. If a user types without selecting a suggestion, `value` stays
// '' and the typed text isn't reset by the parent's "Clear filters"
// (which only resets committed state) -- see SongFiltersPanel's
// `resetToken` for the fix.
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
        {/* Clear affordance -- shown only when a real selection exists. */}
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

// The currently-selected genres, always visible regardless of the chip
// grid's scroll position or text filter -- `selected` is the committed
// `filters.genres`, never derived from the grid's local state, so it
// can't disagree with what's actually filtering. Returns the tag BUTTONS
// directly (a Fragment, not a <div>) so the caller renders them as
// siblings of the "ARTIST GENRE" label in one flex-wrap row -- inline
// next to the label, overflow wrapping below it.
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

// Genre chips sorted by this chord's own song count per genre
// (descending, computeSongFilterOptions), not alphabetically. A text
// filter narrows which chips are SHOWN, not the ANY-match filter logic
// -- a selected genre whose chip is hidden by the text filter stays
// selected (`selected`/`onToggle` operate on `filters.genres`, not this
// component's local `query`).
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

// Tap-or-hold increment/decrement, restoring the affordance the native
// number-input spinner provided before it was suppressed (that
// suppression fixed a clipping bug -- see the year-input CSS). Rebuilt
// as themed buttons rather than un-suppressing the native spinner (a
// generic, cross-browser-inconsistent control, and the one that caused
// the clipping bug). First tap steps immediately; holding past
// `HOLD_REPEAT_DELAY_MS` repeats every `HOLD_REPEAT_INTERVAL_MS`. Timers
// are cleaned up on mouseup/mouseleave/touchend AND on unmount --
// otherwise releasing outside the button, or unmounting mid-hold via
// chord navigation, leaves an interval running.
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
  // `useHoldRepeat`'s interval is created once at mousedown and keeps
  // calling the same `onStep` closure on every tick -- it isn't
  // recreated per render. If `step` read the `value` prop directly,
  // every repeat tick would recompute from the value as of that render,
  // not the previous tick's result. `valueRef` (kept synced via
  // useEffect) makes `step` read live data so ticks compound.
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

// The toggle button alone, in the Songs panel's header (mirroring
// HandednessToggle in the Voicings panel header; both share
// `.panel-header`). Split from the collapsible content
// (SongFiltersPanel) so the button's position doesn't depend on how many
// fallback banners render above the song list. Button and panel share
// lifted `open`/`filters` state from Results.jsx.
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

// The collapsible content panel only (artist/genre/capo/year fields +
// Clear filters), no toggle button of its own. Renders below the Songs
// panel's header, above any fallback banners, so opening it isn't
// inserted between banner text.
export function SongFiltersPanel({ open, options, filters, onChange }) {
  const artistId = useId()
  const active = isFiltersActive(filters, options)
  // ArtistCombobox and GenreChips hold local, UI-only text state (what's
  // typed, not what's committed). "Clear filters" resets the committed
  // state and doesn't touch that local text if it was never committed.
  // Fixed the same way as Results.jsx's `CapturePanel key={chordName}`:
  // bump a token on Clear, use it as both children's `key`, forcing a
  // clean remount.
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
          {/* Label + selected-genre summary share one flex-wrap row --
              the summary (SelectedGenres, a Fragment of bare buttons)
              sits inline after the label and wraps below it when it
              doesn't fit. Strictly above the search input/chip grid.
              The selection is `filters.genres` (independent of the text
              filter); each chip's × calls `toggleGenre`. */}
          <div className="song-filters__genre-header">
            <span className="field-label">Artist Genre</span>
            <SelectedGenres selected={filters.genres} onToggle={toggleGenre} />
          </div>
          <GenreChips key={resetToken} genres={options.genres} selected={filters.genres} onToggle={toggleGenre} />
        </div>
      )}

      {/* Capo and Album Release Year share one row
          (`.song-filters__row--split`, flex-wrap) -- Capo left, Year
          right. Stacks (Capo above Year) via flex-wrap once the row's
          width can't fit both `.song-filters__subfield`s (each has a
          `min-width`, see SongFilters.css) -- driven by the row's actual
          width, not a viewport breakpoint. */}
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

      {/* In the space freed by merging Capo+Year into one row -- same
          "only when a filter is active" gating and handleClear (with the
          resetToken remount). */}
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
