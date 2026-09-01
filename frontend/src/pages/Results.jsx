import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import CapturePanel from '../components/CapturePanel'
import ChordName from '../components/ChordName'
import ChordOverview from '../components/ChordOverview'
import DetectionBadge from '../components/DetectionBadge'
import Footer from '../components/Footer'
import FretboardDiagram from '../components/FretboardDiagram'
import IntervalLegend from '../components/IntervalLegend'
import SongCard from '../components/SongCard'
import { SongFiltersPanel, SongFiltersToggle } from '../components/SongFilters'
import VoicingModal from '../components/VoicingModal'
import { useFretboardPrefs } from '../context/FretboardPrefsContext'
import { getChordInfo, getChords, getSongs, getVoicings } from '../lib/api'
import { renderChordNote } from '../lib/renderChordNote'
import { computeSongFilterOptions, EMPTY_SONG_FILTERS, filterSongs } from '../lib/songFilters'
import './Results.css'

// Incremental song-list render: only the first SONG_BATCH_SIZE cards
// mount, with more batches appended on scroll (IntersectionObserver on a
// sentinel row inside .song-list's own scroll container). Chosen over a
// virtualization library to avoid the dependency; high-volume chords
// (e.g. "Dm", ~5000 songs) otherwise mount every card up front, and
// committing that many DOM trees is the real bottleneck.
const SONG_BATCH_SIZE = 150

// Collapsible wrapper for the structural fallback banners (inversion +
// quality) -- open by default, each toggled independently. Reuses
// SongFiltersToggle's chevron/aria-expanded pattern.
function FallbackBanner({ label, open, onToggle, children }) {
  return (
    <div className="related-notes">
      <div className="related-note related-note--collapsible">
        <button
          type="button"
          className="related-note__toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="related-note__toggle-label">{label}</span>
          <span className="related-note__chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {open && <p className="related-note__body">{children}</p>}
      </div>
    </div>
  )
}

// Mobile-only sticky wayfinding row (hidden on desktop via CSS). Pills
// smooth-scroll to the Overview / Voicings / Songs sections; each target
// carries a scroll-margin-top so it clears the sticky site header + this
// row. Honors prefers-reduced-motion.
function ResultsJumpNav() {
  function jumpTo(id) {
    const el = document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav className="results-jump" aria-label="Jump to section">
      <button type="button" onClick={() => jumpTo('results-overview')}>Overview</button>
      <button type="button" onClick={() => jumpTo('results-voicings')}>Voicings</button>
      <button type="button" onClick={() => jumpTo('results-songs')}>Songs</button>
    </nav>
  )
}

function HandednessToggle() {
  const { leftHanded, toggleHandedness } = useFretboardPrefs()
  return (
    <button
      type="button"
      className="handedness-toggle"
      onClick={toggleHandedness}
      aria-pressed={leftHanded}
    >
      {leftHanded ? 'Left-handed' : 'Right-handed'}
    </button>
  )
}

function Results() {
  const { chordName } = useParams()
  const location = useLocation()
  // `fromSuggestion`: true when ManualSearch navigated here from a
  // canonical dropdown suggestion (click or arrow+Enter) rather than a
  // raw typed submission. `searchedAs` alone can't tell the two apart --
  // a dropdown pick's `searchedAs` may be a genuine prefix of what was
  // picked (e.g. "Cmaj" -> "Cmaj7"). Used to suppress the "why" teaser
  // for deliberate picks.
  const { fromAudio, confidence, searchedAs, fromSuggestion } = location.state || {}

  const [voicings, setVoicings] = useState(null) // { ok, status, data } | null while loading
  const [songs, setSongs] = useState(null)
  const [chordInfo, setChordInfo] = useState(null) // { ok, status, data } | null while loading
  const [expandedVoicing, setExpandedVoicing] = useState(null)
  const [visibleSongCount, setVisibleSongCount] = useState(SONG_BATCH_SIZE)
  // Artist/genre/capo/release-year filters, applied client-side against
  // the fetched flatSongs array (see lib/songFilters.js).
  const [songFilters, setSongFilters] = useState(EMPTY_SONG_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false) // closed by default -- .song-list is space-constrained
  // Only one SongCard expanded at a time, across both the primary and
  // fallback lists (mutually exclusive, so one key suffices).
  const [expandedSongKey, setExpandedSongKey] = useState(null)
  // The two structural fallback banners' open state, independent (a
  // chord can trigger both). The quality-fallback SONG LIST below them
  // has no toggle -- it's short and always shown.
  const [inversionBannerOpen, setInversionBannerOpen] = useState(true)
  const [qualityBannerOpen, setQualityBannerOpen] = useState(true)
  // root_aliases, read from getChords()'s module-level cache (no extra
  // request) so SongCard's "UG tags X as Y" note can explain a root
  // respelling without duplicating chord_parser.py's alias table.
  const [rootAliases, setRootAliases] = useState({})

  useEffect(() => {
    let cancelled = false
    getChords()
      .then(({ rootAliases: aliases }) => {
        if (!cancelled) setRootAliases(aliases)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setVoicings(null)
    setSongs(null)
    setChordInfo(null)
    setVisibleSongCount(SONG_BATCH_SIZE)
    setSongFilters(EMPTY_SONG_FILTERS)
    setFiltersOpen(false)
    setExpandedSongKey(null)
    setInversionBannerOpen(true)
    setQualityBannerOpen(true)
    getVoicings(chordName).then(setVoicings)
    getSongs(chordName).then(setSongs)
    // Reset scroll on every chord change -- this component instance
    // persists across Results-to-Results navigation (only the route
    // param changes), so without this a re-search lands mid-page.
    window.scrollTo(0, 0)
  }, [chordName])

  // Flat list of every {spelling, song} pair across results_by_spelling.
  // That dict is keyed by matched quality (primary first, then guide-tone
  // relatives), each group already vote-sorted internally -- so a plain
  // flatMap groups by matched chord first. Re-sort the combined list by
  // ug_votes descending, chord-agnostic; each song keeps its own
  // `spelling` (which drives SongCard's matched-chord badge). Missing
  // vote counts sort last.
  const flatSongs = useMemo(() => {
    const entries = Object.entries(songs?.data?.results_by_spelling || {})
    const flat = entries.flatMap(([spelling, songList]) =>
      songList.map((s, i) => ({ key: `${spelling}-${i}`, song: s, spelling }))
    )
    flat.sort((a, b) => (b.song.ug_votes ?? -1) - (a.song.ug_votes ?? -1))
    return flat
  }, [songs])

  // The genuine-no-songs quality_fallback path -- a separate branch from
  // results_by_spelling (flatSongs above is always empty when this
  // fires). Fallback song dicts have the same shape as the primary path,
  // so the same filtering applies. `entryChord` is kept so filtered
  // results can be re-grouped under their fallback-root headers below.
  const flatFallbackSongs = useMemo(() => {
    const groups = songs?.data?.quality_fallback_songs || []
    return groups.flatMap((entry) =>
      entry.songs.map((s, i) => ({ key: `${entry.chord}-${i}`, song: s, entryChord: entry.chord }))
    )
  }, [songs])

  const isFallbackView = !!(songs?.ok && songs.data.quality_fallback_used)
  // Whichever flat list is actually shown -- exactly one is non-empty for
  // a given response -- so Filters can be built once off this.
  const songsForFilters = isFallbackView ? flatFallbackSongs : flatSongs

  // Filter options come from the full unfiltered list, so narrowing one
  // filter never removes another's available options.
  const songFilterOptions = useMemo(() => computeSongFilterOptions(songsForFilters), [songsForFilters])
  const filteredSongs = useMemo(() => filterSongs(songsForFilters, songFilters), [songsForFilters, songFilters])

  // Filtered fallback songs re-grouped under their per-root headers, with
  // the per-group 5-song display cap applied after filtering (not before
  // -- capping first would hide real matches). Empty groups dropped.
  const filteredFallbackGroups = useMemo(() => {
    if (!isFallbackView) return []
    const filteredKeys = new Set(filteredSongs.map((f) => f.key))
    const groups = songs?.data?.quality_fallback_songs || []
    return groups
      .map((entry) => ({
        ...entry,
        filteredSongs: entry.songs.filter((_, i) => filteredKeys.has(`${entry.chord}-${i}`)),
      }))
      .filter((entry) => entry.filteredSongs.length > 0)
  }, [isFallbackView, filteredSongs, songs])

  // Seed the Album Release Year fields to this chord's real min/max once
  // known, so they're real editable values rather than placeholder text.
  // Only seeds from the blank sentinel -- never overwrites a user edit.
  useEffect(() => {
    if (songFilterOptions.yearMin === null) return
    setSongFilters((prev) => {
      if (prev.yearMin !== '' || prev.yearMax !== '') return prev
      return { ...prev, yearMin: String(songFilterOptions.yearMin), yearMax: String(songFilterOptions.yearMax) }
    })
  }, [songFilterOptions])

  // Filtering narrows the list before visibleSongCount slices it for
  // infinite scroll; visibleSongCount resets on filter change (effect
  // below). Infinite scroll applies only to the primary path.
  const visibleSongs = filteredSongs.slice(0, visibleSongCount)
  const hasMoreSongs = !isFallbackView && visibleSongCount < filteredSongs.length

  useEffect(() => {
    setVisibleSongCount(SONG_BATCH_SIZE)
  }, [songFilters])

  const songListRef = useRef(null)
  const songSentinelRef = useRef(null)

  useEffect(() => {
    if (!hasMoreSongs) return
    const sentinel = songSentinelRef.current
    const root = songListRef.current
    if (!sentinel || !root) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleSongCount((c) => Math.min(c + SONG_BATCH_SIZE, filteredSongs.length))
        }
      },
      { root, rootMargin: '400px' } // start loading the next batch before the user actually hits bottom
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreSongs, filteredSongs.length])

  // chord_info.py's theory data, fetched once /songs RESOLVES (not once
  // it succeeds) -- waiting for `songs` avoids fetching for a
  // non-canonical spelling, but must NOT be gated on songs.ok: a chord
  // with real theory data but zero songs would otherwise lose its whole
  // Chord Overview panel. Uses songs.data.primary_chord (present on most
  // 404s too); falls back to the raw chordName only for a truly
  // unparseable query, where /chord-info finds nothing either.
  useEffect(() => {
    if (!songs) return
    const target = songs.data?.primary_chord || chordName
    let cancelled = false
    getChordInfo(target).then((result) => {
      if (!cancelled) setChordInfo(result)
    })
    return () => {
      cancelled = true
    }
  }, [songs, chordName])

  // Title is the fully-resolved canonical chord once /songs responds --
  // primary_chord (bass-inclusive), NOT resolved_primary_chord (which
  // drops the bass after an inversion fallback). Raw chordName while
  // loading.
  const title = songs?.ok ? songs.data.primary_chord : chordName

  // Small "(searched: X)" next to the title when the search differs from
  // the canonical title. Not shown for dropdown picks (`fromSuggestion`)
  // -- a deliberate pick, even a typed prefix of it, isn't a
  // substitution that needs explaining.
  const searchedValue = searchedAs ? searchedAs.trim() : chordName
  const showSearchedParenthetical = songs?.ok && !fromSuggestion && searchedValue !== title

  // Whether ChordOverview's "Why this spelling" bar renders -- suppressed
  // for dropdown picks, where ManualSearch's typing-time caption already
  // explained the enharmonic substitution. Shown for typed submissions
  // and direct URL visits.
  const showWhySpelling = !fromSuggestion

  // A separate note for ambiguous shorthand the parser had to default
  // (e.g. bare "sus" -> sus4). Computed server-side from the actual
  // search string, so it needs no path gating -- a suggestion or an
  // audio-identified name is never ambiguous shorthand.
  const ambiguityNote = songs?.ok ? songs.data.ambiguity_note : null

  return (
    <div className="results-page">
      {/* Places the title block and the compact header CapturePanel side
          by side (flex-row, wraps on narrow viewports). */}
      <div className="results-hero-row">
        <div className="section results-header">
          {/* Title is just the canonical chord name. When the search
              differs, a small parenthetical names it; the full
              explanation lives in ChordOverview's "Why this spelling"
              bar below. */}
          <h1 className="readout">
            {title}
            {showSearchedParenthetical && (
              <span className="results-header__searched-as"> (searched: <ChordName>{searchedValue}</ChordName>)</span>
            )}
          </h1>
          {fromAudio && <DetectionBadge chord={chordName} confidence={confidence} />}
          {/* Standalone note for ambiguous search shorthand -- distinct
              from the spelling parenthetical above and Similar Chords
              below. */}
          {ambiguityNote && <p className="results-header__ambiguity-note">{renderChordNote(ambiguityNote)}</p>}
        </div>
        {/* key={chordName} forces a full remount on chord change, the
            standard way to reset ManualSearch's own internal typed
            `value` (no external prop for it) -- this component instance
            otherwise persists across Results-to-Results navigation. */}
        <CapturePanel key={chordName} size="header" />
      </div>

      <ResultsJumpNav />

      {/* Above the Voicings/Songs grid -- facts about the resolved
          chord's identity read as context before the practical data.
          Path-independent (both data sources already are) and self-hides
          when there's nothing to show. NOT gated on songs.ok:
          ChordOverview's own check handles the empty/loading case, and
          gating here would drop the panel for a real chord with zero
          songs. `relatedNotes` via optional chaining -- `songs` may be
          null or a failed response. */}
      <ChordOverview
        id="results-overview"
        chordInfo={chordInfo}
        relatedNotes={songs?.data?.related_notes}
        showWhySpelling={showWhySpelling}
        formula={voicings?.ok ? voicings.data.formula : null}
      />

      <div className="results-grid">
        <div className="section panel" id="results-voicings">
          <div className="panel-header">
            {/* Element count next to the heading. Unlike Songs' count,
                this is the true total -- every voicing is already in the
                DOM (the scroll container just clips it). */}
            <div className="panel-header__title">
              <h2>Voicings</h2>
              {voicings?.ok && <span className="panel-header__count">{voicings.data.voicings.length}</span>}
            </div>
            <HandednessToggle />
          </div>
          {voicings === null && <p className="status-text">Loading voicings...</p>}
          {voicings && !voicings.ok && <p className="status-text status-text--error">{voicings.data.error}</p>}
          {voicings && voicings.ok && (
            <ul className="voicing-list">
              {/* Sticky legend, pinned to the top of .voicing-list's own
                  internal scroll -- the only way to read interval
                  identity now that dots show note names. Lives as the
                  list's first item so `position: sticky` is relative to
                  that scroll container. */}
              <li className="voicing-list__legend-row">
                <IntervalLegend formula={voicings.data.formula} />
              </li>
              {voicings.data.voicings.map((v, i, arr) => {
                // Pre-sorted by type then base_fret -- render a section
                // header wherever `type` changes, never re-sort here.
                const showHeader = i === 0 || arr[i - 1].type !== v.type
                return (
                  <Fragment key={i}>
                    {showHeader && (
                      <li className="voicing-list__section-row">
                        <h2 className="voicing-list__section">{v.type}</h2>
                      </li>
                    )}
                    <li className="voicing-list__item">
                      <FretboardDiagram
                        voicing={v}
                        formula={voicings.data.formula}
                        onExpand={() => setExpandedVoicing(v)}
                      />
                      {/* "base fret N" pill dropped (redundant with the
                          diagram's "Nfr" label); "capo N" is now a small
                          chip, Capo-type rows only. Full detail lives in
                          the expand modal. */}
                      {v.type === 'Capo' && v.capo > 0 && (
                        <div className="voicing-list__capo-chip">Capo {v.capo}</div>
                      )}
                    </li>
                  </Fragment>
                )
              })}
            </ul>
          )}
          {/* Every voicing is already in the DOM (no batching), so this
              names the real total and signals that scrolling reveals the
              rest. */}
          {voicings?.ok && voicings.data.voicings.length > 0 && (
            <p className="results-list-caption">{voicings.data.voicings.length} voicings &middot; scroll for more</p>
          )}
        </div>

        <div className="section panel" id="results-songs">
          {/* Filters' trigger lives in the panel header, top-right --
              mirroring HandednessToggle in the Voicings panel. Keeps it
              in one consistent spot regardless of how many fallback
              banners render below. */}
          <div className="panel-header">
            {/* Total before any filter narrows it -- the filtered count
                lives in SongFiltersToggle's own match/total pair. */}
            <div className="panel-header__title">
              <h2>Songs</h2>
              {songs?.ok && songsForFilters.length > 0 && <span className="panel-header__count">{songsForFilters.length}</span>}
            </div>
            {songs && songs.ok && songsForFilters.length > 0 && (
              <SongFiltersToggle
                open={filtersOpen}
                onToggleOpen={() => setFiltersOpen((o) => !o)}
                options={songFilterOptions}
                filters={songFilters}
                matchCount={filteredSongs.length}
                totalCount={songsForFilters.length}
              />
            )}
          </div>
          {songs === null && <p className="status-text">Loading songs...</p>}
          {songs && !songs.ok && <p className="status-text status-text--error">{songs.data.error}</p>}
          {/* Panel content renders directly below the header too, above
              every banner -- so expanding it never looks inserted
              between banner text. */}
          {songs && songs.ok && songsForFilters.length > 0 && (
            <SongFiltersPanel
              open={filtersOpen}
              options={songFilterOptions}
              filters={songFilters}
              onChange={setSongFilters}
            />
          )}
          {/* Makes an inversion fallback explicit instead of silently
              showing root-position songs as a match. Stays a visible
              banner. */}
          {songs && songs.ok && songs.data.inversion_fallback_used && (
            <FallbackBanner
              label="Inversion fallback"
              open={inversionBannerOpen}
              onToggle={() => setInversionBannerOpen((o) => !o)}
            >
              {/* Structural banner: status first (no exact-inversion
                  match), then the resolution, per NOTE_STYLE_GUIDE.md. */}
              {renderChordNote(
                `No songs are tagged with the exact inversion \`${songs.data.primary_chord}\` -- ` +
                  `songs for the root-position chord \`${songs.data.root_position_chord}\` are shown here instead.`
              )}
            </FallbackBanner>
          )}
          {songs && songs.ok && !isFallbackView && filteredSongs.length > 0 && (
            <>
              <ul className="song-list" ref={songListRef}>
                {visibleSongs.map(({ key, song, spelling }) => (
                  <SongCard
                    key={key}
                    song={song}
                    spelling={spelling}
                    rootAliases={rootAliases}
                    expanded={expandedSongKey === key}
                    onToggleExpanded={() => setExpandedSongKey((k) => (k === key ? null : key))}
                  />
                ))}
                {hasMoreSongs && <li ref={songSentinelRef} className="song-list__sentinel" aria-hidden="true" />}
              </ul>
              {/* Genuine incremental-batch count -- visibleSongs.length
                  is the number of cards actually mounted. */}
              <p className="results-list-caption">
                Showing {visibleSongs.length} of {filteredSongs.length} &middot; {hasMoreSongs ? 'scroll for more' : 'all shown'}
              </p>
            </>
          )}
          {/* "no songs match your filters" -- distinct from the
              structural banners (unaffected by filters) and the
              genuine-zero-songs text below. Primary path only; the
              fallback path has its own copy inside its block. */}
          {songs && songs.ok && !isFallbackView && songsForFilters.length > 0 && filteredSongs.length === 0 && (
            <p className="song-filters__empty">No songs match your filters.</p>
          )}
          {/* Genuine-no-songs fallback -- kept visually separate from the
              real list, since these songs are a different root sharing
              only the chord quality. */}
          {songs && songs.ok && songs.data.quality_fallback_used && (
            <>
              <FallbackBanner
                label="Quality fallback"
                open={qualityBannerOpen}
                onToggle={() => setQualityBannerOpen((o) => !o)}
              >
                {/* Structural banner, same shape/idiom as the inversion
                    banner above. resolved_primary_chord (not
                    primary_chord) -- an inversion fallback may already
                    have moved off the bass-inclusive spelling. */}
                {renderChordNote(
                  `No songs are tagged with \`${songs.data.resolved_primary_chord}\` exactly -- since a ` +
                    `\`${songs.data.resolved_quality}\` chord is the same shape wherever it's played, ` +
                    `songs using that same quality on other roots are shown here instead:`
                )}
              </FallbackBanner>
              {/* The song list below has no collapse toggle -- it's short
                  and always shown. The FallbackBanner toggle above
                  (explanatory text) is separate.
                  Renders the filtered regrouping, not the raw fallback
                  songs -- filtering happens across each full group before
                  the 5-per-group cap. If every group empties, show the
                  same empty-state message here. */}
              {filteredFallbackGroups.length === 0 ? (
                <p className="song-filters__empty">No songs match your filters.</p>
              ) : (
                filteredFallbackGroups.map((entry) => (
                  <div key={entry.chord} className="quality-fallback-group">
                    <h3 className="voicing-list__section">{entry.chord}</h3>
                    <ul className="song-list">
                      {entry.filteredSongs.slice(0, 5).map((song, i) => {
                        const key = `${entry.chord}-${i}`
                        return (
                          <SongCard
                            key={key}
                            song={song}
                            spelling={entry.chord}
                            rootAliases={rootAliases}
                            expanded={expandedSongKey === key}
                            onToggleExpanded={() => setExpandedSongKey((k) => (k === key ? null : key))}
                          />
                        )
                      })}
                    </ul>
                  </div>
                ))
              )}
            </>
          )}
          {songs && songs.ok && songs.data.total_songs === 0 && !songs.data.quality_fallback_used && (
            <p className="status-text">No songs found for this chord.</p>
          )}
        </div>
      </div>

      {expandedVoicing && (
        <VoicingModal
          voicing={expandedVoicing}
          formula={voicings?.ok ? voicings.data.formula : null}
          // /voicings/{chord}'s own `displayed` field (already the
          // canonical resolved name) -- not this page's `title`, which
          // depends on the unrelated /songs fetch.
          chordName={voicings?.ok ? voicings.data.displayed : null}
          // /voicings/{chord}'s top-level `bass` -- a fact about the
          // whole search, not per-voicing. Already null when the
          // response fell back to root-position voicings.
          bass={voicings?.ok ? voicings.data.bass : null}
          onClose={() => setExpandedVoicing(null)}
        />
      )}
      {/* Shared footer, after the Voicings/Songs grid (VoicingModal is a
          fixed overlay, so its DOM position doesn't affect this). */}
      <Footer />
    </div>
  )
}

export default Results
