import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import CapturePanel from '../components/CapturePanel'
import ChordName from '../components/ChordName'
import ChordOverview from '../components/ChordOverview'
import FretboardDiagram from '../components/FretboardDiagram'
import IntervalLegend from '../components/IntervalLegend'
import SongCard from '../components/SongCard'
import { SongFiltersPanel, SongFiltersToggle } from '../components/SongFilters'
import VoicingModal from '../components/VoicingModal'
import { useFretboardPrefs } from '../context/FretboardPrefsContext'
import { getChordInfo, getSongs, getVoicings } from '../lib/api'
import { renderChordNote } from '../lib/renderChordNote'
import { computeSongFilterOptions, EMPTY_SONG_FILTERS, filterSongs } from '../lib/songFilters'
import './Results.css'

// Reads/writes the same global FretboardPrefsContext as before -- only the
// control's location moved (Phase 3 Part 2 follow-up fix #5), from the
// app-wide header into the Voicings panel where it's actually relevant, so
// behavior (flips every diagram, persists across navigation + reload) is
// unchanged.
// Phase 4 follow-up: high-volume chords (e.g. "Dm", 5269 real songs) were
// mounting every SongCard into the DOM on load even though only ~520px of
// the list is ever visible at once (see Results.css's .song-list max-height
// + overflow-y: auto). Real profiling (production build, not dev -- dev's
// React StrictMode double-fires effects and roughly doubles the real cost)
// showed the network fetch + JSON parse together took well under 500ms,
// but React creating/committing all 5269 <SongCard> DOM trees took roughly
// another 700-1100ms on top of that -- the actual bottleneck, confirmed
// via measurement, not guessed. A full virtualization library (react-window
// etc.) would be the "complete" fix but is a new dependency for what's
// meant to be a reasonable, low-risk pass -- instead, only the first
// SONG_BATCH_SIZE songs render initially, with more batches appended as the
// user scrolls near the bottom of the list (IntersectionObserver on a
// sentinel row, scoped to .song-list's own internal scroll container, not
// the page). Cuts the common case (most chords have far fewer than 150
// songs) down to zero extra behavior, and cuts the worst case (Dm) from
// mounting 5269 cards up front to ~150.
const SONG_BATCH_SIZE = 150

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
  // `fromSuggestion` (Task 2, Phase 5 Part 2/7 follow-up): true whenever
  // ManualSearch navigated here from a canonical suggestion (mouse click
  // OR arrow-key-select + Enter) rather than a raw typed-then-submit
  // value -- see ManualSearch.jsx's goToChord() call sites. Needed
  // because `searchedAs` alone can't distinguish "path A, dropdown pick"
  // from "path B, typed+submit": a dropdown pick's `searchedAs` is
  // whatever text was in the box at click time, which can be a genuine
  // PREFIX of the picked suggestion (e.g. typing "Cmaj" and clicking
  // "Cmaj7") -- a real difference worth the title's parenthetical (Task
  // 3, unchanged), but NOT a root/bass/quality substitution, so it must
  // NOT trigger Task 2's narrower "why" teaser below.
  const { fromAudio, confidence, searchedAs, fromSuggestion } = location.state || {}

  const [voicings, setVoicings] = useState(null) // { ok, status, data } | null (loading)
  const [songs, setSongs] = useState(null)
  const [chordInfo, setChordInfo] = useState(null) // { ok, status, data } | null (loading) -- Phase 5 Part 2/7 follow-up
  const [expandedVoicing, setExpandedVoicing] = useState(null) // Phase 3 Part 5/6 click-to-expand
  const [visibleSongCount, setVisibleSongCount] = useState(SONG_BATCH_SIZE) // Phase 4 follow-up: incremental song-list render
  // Phase 5 Part 5/7: artist/genre/capo/release-year filters, applied
  // entirely client-side against the already-fetched flatSongs array (see
  // lib/songFilters.js) -- no new API calls/params needed.
  const [songFilters, setSongFilters] = useState(EMPTY_SONG_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false) // closed by default -- .song-list is already space-constrained

  useEffect(() => {
    setVoicings(null)
    setSongs(null)
    setChordInfo(null)
    setVisibleSongCount(SONG_BATCH_SIZE)
    setSongFilters(EMPTY_SONG_FILTERS)
    setFiltersOpen(false)
    getVoicings(chordName).then(setVoicings)
    getSongs(chordName).then(setSongs)
    // Task 4 (Phase 5 Part 2/7 follow-up): confirmed live, not assumed --
    // React Router doesn't scroll-restore on its own, and this component
    // never unmounts between two Results pages (only `chordName`, a route
    // PARAM, changes -- the same component instance re-renders), so
    // without this a re-search from Results' own mini search box lands on
    // the new chord's page still scrolled to wherever the previous page
    // happened to be (confirmed via real measurement: scrollY stayed at
    // 1163 after a real re-search, deep in the previous chord's Songs
    // list). This one effect, keyed on [chordName], covers every
    // arrival path uniformly: it also fires on the FIRST mount (a plain
    // useEffect always runs once on mount, not just on updates), so a
    // fresh navigation from Home (either dropdown pick or typed submit)
    // gets the same reset for free, no separate handling needed. Direct
    // URL visits and the audio-ID path don't need this at all -- a fresh
    // page load already starts at scrollY 0 natively, confirmed live
    // rather than assumed.
    window.scrollTo(0, 0)
  }, [chordName])

  // Flat list of every {spelling, song} pair across results_by_spelling,
  // same order the old flatMap produced -- computed once per real API
  // response, not on every render.
  const flatSongs = useMemo(() => {
    const entries = Object.entries(songs?.data?.results_by_spelling || {})
    return entries.flatMap(([spelling, songList]) =>
      songList.map((s, i) => ({ key: `${spelling}-${i}`, song: s, spelling }))
    )
  }, [songs])

  // Phase 5 Part 5/7 follow-up (Step 1 bugfix): the genuine-no-songs
  // quality_fallback path (Dump Notes: "If genuine no songs exist") is a
  // completely separate branch from results_by_spelling -- flatSongs above
  // is always empty whenever this fires (quality_fallback_used only ever
  // gets set when total_songs === 0). Filters was never wired into this
  // branch at all last round -- confirmed via a real screenshot on a chord
  // that genuinely triggers it (e.g. `C(#9)`): the Filters section was
  // completely absent, not collapsed or empty. Verified the fallback song
  // dicts have the IDENTICAL shape _rows_to_songs() produces for the
  // primary path (same `artist`/`artist_genres`/`ug_capo`/
  // `album_release_date` fields -- checked directly against a real
  // get_songs('C(#9)') response before assuming so) -- same flattening/
  // filtering logic applies unchanged, just from a different source array.
  // `entryChord` is carried through so the filtered results can be
  // re-grouped back under their real fallback-root headers below.
  const flatFallbackSongs = useMemo(() => {
    const groups = songs?.data?.quality_fallback_songs || []
    return groups.flatMap((entry) =>
      entry.songs.map((s, i) => ({ key: `${entry.chord}-${i}`, song: s, entryChord: entry.chord }))
    )
  }, [songs])

  const isFallbackView = !!(songs?.ok && songs.data.quality_fallback_used)
  // Whichever flat song list is actually being shown right now -- exactly
  // one of these is ever non-empty for a given response (results_by_spelling
  // is empty whenever quality_fallback fires, and vice versa), so Filters
  // (and everything it drives: options, filtering, the empty state) can be
  // built once, generically, off this, rather than duplicated per branch.
  const songsForFilters = isFallbackView ? flatFallbackSongs : flatSongs

  // Phase 5 Part 5/7: filter options (artist/genre lists, real release-year
  // bounds) are always derived from the FULL unfiltered songsForFilters --
  // not the already-filtered result -- so narrowing by one filter never
  // removes another filter's own available options out from under it.
  const songFilterOptions = useMemo(() => computeSongFilterOptions(songsForFilters), [songsForFilters])
  const filteredSongs = useMemo(() => filterSongs(songsForFilters, songFilters), [songsForFilters, songFilters])

  // Phase 5 Part 5/7 follow-up (Step 1): filtered fallback songs re-grouped
  // back under their real per-root headers (quality_fallback_songs' own
  // `root`/`chord`), preserving the original group order and the existing
  // "cap each group's display to 5" behavior -- just applied AFTER
  // filtering now, not before (filtering the already-capped 5 would silently
  // hide real matches beyond the cap instead of surfacing them). A group
  // with zero surviving songs is dropped entirely rather than showing an
  // empty header.
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

  // Phase 5 Part 5/7 follow-up (Step 4): seed the Album Release Year
  // fields to this chord's REAL observed min/max once it's known, rather
  // than leaving them permanently blank-with-a-placeholder (confirmed via
  // screenshot review: looked bound but wasn't -- a real value the user can
  // select/copy and see reflected in the filter is not the same thing as
  // grey placeholder text that happens to show the same digits). Only
  // seeds when the year fields are still at the pre-load blank sentinel
  // (EMPTY_SONG_FILTERS) -- never overwrites a real user edit, and only
  // fires once options.yearMin actually becomes known (i.e. once per real
  // chord-data load, not on every keystroke).
  useEffect(() => {
    if (songFilterOptions.yearMin === null) return
    setSongFilters((prev) => {
      if (prev.yearMin !== '' || prev.yearMax !== '') return prev
      return { ...prev, yearMin: String(songFilterOptions.yearMin), yearMax: String(songFilterOptions.yearMax) }
    })
  }, [songFilterOptions])

  // Filtering narrows the list BEFORE it's sliced by visibleSongCount for
  // infinite scroll -- visibleSongCount itself resets to the initial batch
  // whenever a filter changes (separate effect below), so a narrowed
  // result set is never stuck showing a stale, larger scroll position from
  // before filtering. (Infinite scroll only ever applies to the primary
  // path's single flat list -- the fallback path stays its existing
  // per-group 5-song cap, unaffected by visibleSongCount.)
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

  // Phase 5 Part 2/7 follow-up: chord_info.py's theory data, fetched once
  // the Songs endpoint RESOLVES (succeeds or fails -- `songs` is non-null
  // either way once the fetch completes), not once it SUCCEEDS. Waiting
  // for `songs` to exist at all (rather than firing on the raw URL param
  // immediately) still avoids wasting a fetch on a possibly non-canonical
  // spelling that's about to be superseded once Songs resolves the real
  // canonical name.
  //
  // Real bug fixed here (stress-test finding #1, closing round): this used
  // to be gated on `songs?.ok` specifically, which meant a chord with
  // genuinely zero songs anywhere (Songs correctly 404s) silently lost its
  // ENTIRE Chord Overview panel too -- even though /chord-info is a fully
  // independent endpoint with real data to show (verified live: Csus2sus4/
  // Cm11b5 both return valid theory data from /chord-info despite /songs
  // 404ing for them). Chord-theory content must never be gated by song-data
  // availability -- a chord can be real and worth explaining with zero
  // tagged songs.
  //
  // `songs.data.primary_chord` is present even on MOST 404s (api.py still
  // returns the full get_songs() dict, with `error` appended, for the
  // "real chord, no song data yet" case) -- only a truly UNPARSEABLE/
  // unregistered query has no `primary_chord` at all (get_songs() failed
  // before resolving one), in which case falling back to the raw
  // `chordName` is the only option left; /chord-info will independently
  // (and correctly) find nothing for it either, and ChordOverview already
  // renders nothing when there's genuinely no data (see below).
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

  // Phase 5 Part 2/7 follow-up: the page TITLE is now always just the
  // fully-resolved canonical chord (root + bass + quality) once the Songs
  // endpoint responds, not the raw URL param -- this is `primary_chord`
  // specifically, NOT `resolved_primary_chord` (which is post any
  // inversion-fallback and would silently drop the bass note from the
  // title, conflating a pure NAMING fact with a DATA-AVAILABILITY fact --
  // see RESULTS_ENTRY_PATHS.md's substitution-vs-fallback split). Falls
  // back to the raw `chordName` while songs is still loading or on error.
  const title = songs?.ok ? songs.data.primary_chord : chordName

  // Title-level parenthetical -- a small "(searched: X)" next to the
  // title when the actual search differs from the canonical title.
  // GATED ON `!fromSuggestion` as of this follow-up's Task 2 -- a
  // dropdown pick is a deliberate choice (even when its `searchedAs` was
  // only a typed PREFIX of what got picked, e.g. typing "Cmaj" and
  // clicking "Cmaj7"), not something that needs "here's what you
  // searched" framing the way an actual typed substitution or a
  // non-canonical direct URL does. Previously this fired for dropdown
  // picks too (e.g. "Bbaug7 (searched: A#aug)") -- real, confirmed
  // inconsistency with the teaser below already excluding dropdown picks
  // via the same flag; this brings the two in line.
  const searchedValue = searchedAs ? searchedAs.trim() : chordName
  const showSearchedParenthetical = songs?.ok && !fromSuggestion && searchedValue !== title

  // Task 2 (this follow-up): whether ChordOverview's "Why this spelling"
  // bar should render at all -- SUPPRESSED for dropdown picks
  // (`fromSuggestion`). The typing-time dropdown caption (family 1,
  // `ManualSearch.jsx`) already explains root/bass enharmonic
  // substitution WHILE someone picks a suggestion; re-explaining it again
  // on Results would be redundant. Still renders normally for typed
  // submissions and direct URL visits (paths B/C), where nothing
  // explained it beforehand -- confirmed against RESULTS_ENTRY_PATHS.md's
  // matrix. (Previously this follow-up also had a title-level "Why this
  // spelling? ↓" teaser pointing down at the bar -- removed entirely,
  // Task 1: the bar already sits directly below the title, unscrolled,
  // always in view, so the teaser -- and its scroll/highlight fix from
  // the round before -- was solving a problem the current layout doesn't
  // actually have.)
  const showWhySpelling = !fromSuggestion

  // Task 4 (Phase 5 Part 2/7 follow-up): a genuinely separate note from
  // the two above -- fires when the raw search used ambiguous shorthand
  // chord_parser.py had to default (e.g. bare "sus" -> sus4). Computed
  // server-side from the ACTUAL search string (songs.py's `quality_blob`,
  // see songs.py's `_ambiguity_note()`), so -- unlike the teaser -- it
  // needs no `fromSuggestion`/`fromAudio` gating of its own: a dropdown
  // suggestion or an audio-identified chord name is never ambiguous
  // shorthand in the first place (both are always already-canonical
  // strings), so this is naturally path-independent without extra logic.
  const ambiguityNote = songs?.ok ? songs.data.ambiguity_note : null

  return (
    <div>
      <div className="section results-header">
        {/* Title is just the canonical chord name -- no disclosure
            widget, no explanation text at this level. When the actual
            search differs (typed input, or a route-state searchedAs
            value), a small parenthetical names it; the full explanation
            lives entirely in ChordOverview's "Why this spelling" bar,
            directly below (see `showWhySpelling`). */}
        <h1 className="readout">
          {title}
          {showSearchedParenthetical && (
            <span className="results-header__searched-as"> (searched: <ChordName>{searchedValue}</ChordName>)</span>
          )}
        </h1>
        {fromAudio && (
          <span className="badge">
            <span className="badge__dot" />
            BetterChord detected {chordName}!
            {confidence != null && ` (confidence: ${(confidence * 100).toFixed(1)}%)`}
          </span>
        )}
        {/* Task 4 (Phase 5 Part 2/7 follow-up): a separate, standalone
            note for ambiguous search shorthand (e.g. "sus" -> "sus4") --
            distinct from both the parenthetical/teaser above (which are
            about spelling/naming substitutions) and Similar Chords below
            (a chord-level fact; there's no symmetric "sus4 is also
            called sus" the way there is for a true synonym). */}
        {ambiguityNote && <p className="results-header__ambiguity-note">{renderChordNote(ambiguityNote)}</p>}
      </div>

      {/* Task 1 (Phase 5 Part 2/7 follow-up): now positioned ABOVE the
          Voicings/Songs grid (was below it in the prior round) -- per a
          real HTML/CSS mockup, and because these are facts about the
          resolved CHORD's identity, which reads more naturally as
          context established before the practical Voicings/Songs data,
          not an afterthought below it. Renders identically regardless of
          arrival path (see RESULTS_ENTRY_PATHS.md) since both its data
          sources (songs.data.related_notes, /chord-info) are already
          path-independent. Hides itself entirely if there's truly nothing
          to show (see ChordOverview.jsx).
          Deliberately UNGATED on `songs.ok` (closing round, stress-test
          finding #1) -- ChordOverview's own internal check (`!info &&
          similarChords.length === 0`) already decides whether there's
          anything real to render, including the "still loading" case
          (both chordInfo and relatedNotes are undefined/null then, so it
          correctly renders nothing rather than flashing an empty panel).
          Gating on `songs.ok` here was the actual bug: a chord with real
          theory data but zero songs would never even reach that internal
          check. `relatedNotes` reads safely via optional chaining since
          `songs` can be null (loading) or a failed response with no
          `data.related_notes` at all (a truly unparseable/unregistered
          query, the one case where get_songs() never resolves anything). */}
      <ChordOverview
        chordInfo={chordInfo}
        relatedNotes={songs?.data?.related_notes}
        showWhySpelling={showWhySpelling}
      />

      <div className="results-grid">
        <div className="section panel">
          <div className="panel-header">
            <h2>Voicings</h2>
            <HandednessToggle />
          </div>
          {voicings === null && <p className="status-text">Loading voicings...</p>}
          {voicings && !voicings.ok && <p className="status-text status-text--error">{voicings.data.error}</p>}
          {voicings && voicings.ok && (
            <ul className="voicing-list">
              {/* Phase 3 Part 5/6 follow-up: sticky legend, pinned to the
                  TOP of .voicing-list's own internal scroll (not the page)
                  -- now that dots show note names instead of interval
                  numbers, this is the only way to read interval identity
                  off the compact cards, so it needs to survive scrolling
                  through a long voicing list, not just sit above it. Lives
                  as the list's first item (not outside the <ul>) so its
                  `position: sticky` is relative to .voicing-list's own
                  scroll container, per the task's explicit "within the
                  internal scroll, not the page scroll" scoping. */}
              <li className="voicing-list__legend-row">
                <IntervalLegend formula={voicings.data.formula} />
              </li>
              {voicings.data.voicings.map((v, i, arr) => {
                // Voicings arrive pre-sorted by type (Must Know -> Other ->
                // Capo) then base_fret ascending -- render a section header
                // whenever `type` changes, never re-sort/re-group here.
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
                      {/* Phase 3 Part 5/6: the "base fret N" pill was dropped
                          entirely (redundant with the diagram's own "Nfr"
                          position label); the old equal-weight "capo N" pill
                          is now a smaller integrated chip, shown only for
                          Capo-type rows (same gating FretboardDiagram.jsx
                          already uses for the capo line itself) -- full
                          base-fret/capo detail now lives in the expand
                          modal instead. */}
                      {v.type === 'Capo' && v.capo > 0 && (
                        <div className="voicing-list__capo-chip">Capo {v.capo}</div>
                      )}
                    </li>
                  </Fragment>
                )
              })}
            </ul>
          )}
        </div>

        <div className="section panel">
          {/* Phase 5 Part 5/7 follow-up (Step 1, 3rd round): Filters'
              trigger button now lives in the panel header itself, top-right
              -- exactly mirroring HandednessToggle's placement in the
              Voicings panel above (both share `.panel-header`, Results.css)
              -- rather than inline above the song list. Real bug this
              fixes: a chord triggering BOTH the inversion-fallback and
              quality-fallback banners below used to render Filters
              sandwiched between them (confirmed via screenshot); the
              header position is independent of however many banners render
              on any given chord -- always the same spot, 0/1/2 banners. */}
          <div className="panel-header">
            <h2>Songs</h2>
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
          {/* The collapsible panel content itself renders directly below
              the header too (still above every banner) -- so expanding it
              never looks like it's being inserted between banner text
              either, same "one consistent place" goal as the toggle
              button's own move above. */}
          {songs && songs.ok && songsForFilters.length > 0 && (
            <SongFiltersPanel
              open={filtersOpen}
              options={songFilterOptions}
              filters={songFilters}
              onChange={setSongFilters}
            />
          )}
          {/* Phase 5 Part 1/6 follow-up: makes an inversion fallback
              explicit instead of silently showing root-position songs as
              if they matched the searched inversion (Dump Notes: "Fall
              back clearness") -- STRUCTURAL, stays a visible banner. */}
          {songs && songs.ok && songs.data.inversion_fallback_used && (
            <div className="related-notes">
              <p className="related-note">
                {/* STRUCTURAL banner (NOTE_STYLE_GUIDE.md): effect-before-cause
                    -- the actionable status (no exact-inversion match) leads,
                    the resolution follows, using the guide's fixed "shown
                    here...instead" idiom for a full substitution. */}
                {renderChordNote(
                  `No songs are tagged with the exact inversion \`${songs.data.primary_chord}\` -- ` +
                    `songs for the root-position chord \`${songs.data.root_position_chord}\` are shown here instead.`
                )}
              </p>
            </div>
          )}
          {songs && songs.ok && !isFallbackView && filteredSongs.length > 0 && (
            <ul className="song-list" ref={songListRef}>
              {visibleSongs.map(({ key, song, spelling }) => (
                <SongCard key={key} song={song} spelling={spelling} />
              ))}
              {hasMoreSongs && <li ref={songSentinelRef} className="song-list__sentinel" aria-hidden="true" />}
            </ul>
          )}
          {/* Real "no songs match your filters" empty state -- distinct
              from both the structural fallback banners above (unaffected
              by filters) and the genuine-zero-songs status text below
              (total_songs === 0, a completely different case: nothing was
              ever found for this chord at all, not narrowed away by a
              filter choice). PRIMARY path only here -- the fallback path
              gets its own copy of this message INSIDE the fallback block
              below (Step 1 follow-up), since showing this generic line
              directly above the fallback's own "...shown here instead:"
              banner read as two overlapping, confusing messages back to
              back rather than one clear one. */}
          {songs && songs.ok && !isFallbackView && songsForFilters.length > 0 && filteredSongs.length === 0 && (
            <p className="song-filters__empty">No songs match your filters.</p>
          )}
          {/* Phase 5 Part 1/6: genuine-no-songs fallback (Dump Notes: "If
              genuine no songs exist") -- kept visually/structurally
              separate from the real song list above, since these songs are
              for a DIFFERENT root, only sharing the same chord quality
              (same fretted shape, different position). */}
          {songs && songs.ok && songs.data.quality_fallback_used && (
            <div className="related-notes">
              <p className="related-note">
                {/* STRUCTURAL banner, same effect-before-cause shape and
                    "shown here instead" idiom as the inversion-fallback
                    banner above (NOTE_STYLE_GUIDE.md) -- previously used a
                    different verb ("found tagged" vs. the inversion
                    banner's "are tagged") and a different closing phrase
                    for the same kind of substitution; now unified.
                    Phase 5 Part 1/6 stale-chord-reference audit still
                    applies: by the time this fires, an inversion fallback
                    may have ALREADY tried root-position and also found
                    zero -- naming primary_chord (frozen, bass-inclusive)
                    here would claim "exactly X" for a spelling the
                    inversion banner above already said wasn't searched
                    anymore. resolved_primary_chord is whatever was
                    actually, finally searched. */}
                {renderChordNote(
                  `No songs are tagged with \`${songs.data.resolved_primary_chord}\` exactly -- since a ` +
                    `\`${songs.data.resolved_quality}\` chord is the same shape wherever it's played, ` +
                    `songs using that same quality on other roots are shown here instead:`
                )}
              </p>
              {/* Phase 5 Part 5/7 follow-up (Step 1): renders the FILTERED
                  regrouping (filteredFallbackGroups), not the raw
                  songs.data.quality_fallback_songs -- filtering happens
                  across the full per-group song list before the existing
                  5-per-group display cap, so a real match beyond the first
                  5 unfiltered songs still surfaces once other songs are
                  filtered out. A group with zero surviving songs is
                  dropped by filteredFallbackGroups itself, not rendered
                  here as an empty header. If a filter combination wipes
                  out every group, show the same empty-state message the
                  primary path uses, in place of the (now-empty) group
                  list, rather than the generic pre-banner line above. */}
              {filteredFallbackGroups.length === 0 ? (
                <p className="song-filters__empty">No songs match your filters.</p>
              ) : (
                filteredFallbackGroups.map((entry) => (
                  <div key={entry.chord} className="quality-fallback-group">
                    <h3 className="voicing-list__section">{entry.chord}</h3>
                    <ul className="song-list">
                      {entry.filteredSongs.slice(0, 5).map((song, i) => (
                        <SongCard key={`${entry.chord}-${i}`} song={song} spelling={entry.chord} />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
          {songs && songs.ok && songs.data.total_songs === 0 && !songs.data.quality_fallback_used && (
            <p className="status-text">No songs found for this chord.</p>
          )}
        </div>
      </div>

      <div className="results-capture">
        <h2>🎧 Analyze another chord</h2>
        {/* Task 4 (Phase 5 Part 2/7 follow-up): `key={chordName}` forces
            this (and its nested ManualSearch) to fully REMOUNT whenever
            the chord changes, rather than re-rendering the same instance
            -- the standard React way to reset a component's own internal
            state (ManualSearch's typed `value`) when there's no external
            prop for that state to begin with. Confirmed live this was a
            real, narrower bug than it first looked: navigating here FROM
            Home never showed stale text (Home's own ManualSearch is a
            completely separate mounted instance, unmounted on navigation
            either way) -- the actual bug only appeared when searching
            AGAIN from Results' own mini search box, landing on a new
            Results page for the same route pattern (`chordName` is just
            a route param, so this component instance never unmounts on
            its own between two chords). */}
        <CapturePanel key={chordName} size="mini" />
      </div>

      {expandedVoicing && (
        <VoicingModal
          voicing={expandedVoicing}
          formula={voicings?.ok ? voicings.data.formula : null}
          // `chordName` (13th follow-up): /voicings/{chord}'s own
          // `displayed` field (already the canonical, fully-resolved
          // chord name -- e.g. "Cmaj11/E" -- confirmed via a live
          // request) rather than this page's own `title` (which depends
          // on `/songs` succeeding, a completely unrelated fetch this
          // modal shouldn't be coupled to). Lets the modal show which
          // chord a voicing belongs to without relying on page context
          // behind it.
          chordName={voicings?.ok ? voicings.data.displayed : null}
          // `bass` (Phase 5 Part 4/7): /voicings/{chord}'s new top-level
          // `bass` field -- a fact about the whole search (which every
          // returned voicing shares), not a per-voicing field, so it's
          // read off `voicings.data` here rather than off
          // `expandedVoicing` itself. Already None/null whenever the
          // response fell back to root-position voicings (no real bass
          // backing these rows), so ChordTonePanel never shows a Bass
          // slot for a fallback result.
          bass={voicings?.ok ? voicings.data.bass : null}
          onClose={() => setExpandedVoicing(null)}
        />
      )}
    </div>
  )
}

export default Results
