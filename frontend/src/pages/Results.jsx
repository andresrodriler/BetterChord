import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import CapturePanel from '../components/CapturePanel'
import FretboardDiagram from '../components/FretboardDiagram'
import IntervalLegend from '../components/IntervalLegend'
import SongCard from '../components/SongCard'
import VoicingModal from '../components/VoicingModal'
import { useFretboardPrefs } from '../context/FretboardPrefsContext'
import { getChords, getSongs, getVoicings } from '../lib/api'
import { normalizeRoot, resultsEnharmonicCaption } from '../lib/chordAlias'
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
  const { fromAudio, confidence, searchedAs } = location.state || {}

  const [voicings, setVoicings] = useState(null) // { ok, status, data } | null (loading)
  const [songs, setSongs] = useState(null)
  const [rootAliases, setRootAliases] = useState(null) // null = not loaded yet
  const [expandedVoicing, setExpandedVoicing] = useState(null) // Phase 3 Part 5/6 click-to-expand
  const [visibleSongCount, setVisibleSongCount] = useState(SONG_BATCH_SIZE) // Phase 4 follow-up: incremental song-list render

  useEffect(() => {
    setVoicings(null)
    setSongs(null)
    setVisibleSongCount(SONG_BATCH_SIZE)
    getVoicings(chordName).then(setVoicings)
    getSongs(chordName).then(setSongs)
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

  const visibleSongs = flatSongs.slice(0, visibleSongCount)
  const hasMoreSongs = visibleSongCount < flatSongs.length

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
          setVisibleSongCount((c) => Math.min(c + SONG_BATCH_SIZE, flatSongs.length))
        }
      },
      { root, rootMargin: '400px' } // start loading the next batch before the user actually hits bottom
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreSongs, flatSongs.length])

  // Only needed to reconstruct the enharmonic caption below -- no route
  // state (e.g. a direct URL visit/saved link/back-button arrival with no
  // prior typed input) means there's nothing to compare against, so this
  // fetch's result just goes unused in that case rather than guessing.
  useEffect(() => {
    if (!searchedAs) return
    let cancelled = false
    getChords()
      .then(({ rootAliases: aliases }) => {
        if (!cancelled) setRootAliases(aliases)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [searchedAs])

  // Reinforces the same-note note from ManualSearch (Part B.1) for anyone
  // who arrives here without having seen it typed live -- but only when
  // there IS route state to compare against; no state at all means don't
  // guess what was typed.
  let enharmonicNote = null
  if (searchedAs && rootAliases) {
    const norm = normalizeRoot(searchedAs.trim(), rootAliases)
    if (norm.changed) {
      enharmonicNote = resultsEnharmonicCaption(searchedAs.trim(), norm.canonicalRoot, chordName)
    }
  }

  return (
    <div>
      <div className="section results-header">
        <h1 className="readout">{chordName}</h1>
        {fromAudio && (
          <span className="badge">
            <span className="badge__dot" />
            BetterChord detected {chordName}!
            {confidence != null && ` (confidence: ${(confidence * 100).toFixed(1)}%)`}
          </span>
        )}
        {enharmonicNote && <p className="results-header__enharmonic-note">{enharmonicNote}</p>}
      </div>

      <div className="results-grid">
        <div className="section panel">
          <div className="voicings-panel__header">
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
          <h2>Songs</h2>
          {songs === null && <p className="status-text">Loading songs...</p>}
          {songs && !songs.ok && <p className="status-text status-text--error">{songs.data.error}</p>}
          {songs && songs.ok && songs.data.related_notes?.length > 0 && (
            <div className="related-notes">
              {songs.data.related_notes.map((note, i) => (
                <p className="related-note" key={i}>
                  {note.text.split('`').map((part, j) =>
                    j % 2 === 1 ? (
                      <span className="readout" key={j}>{part}</span>
                    ) : (
                      part
                    )
                  )}
                </p>
              ))}
            </div>
          )}
          {songs && songs.ok && (
            <ul className="song-list" ref={songListRef}>
              {visibleSongs.map(({ key, song, spelling }) => (
                <SongCard key={key} song={song} spelling={spelling} />
              ))}
              {hasMoreSongs && <li ref={songSentinelRef} className="song-list__sentinel" aria-hidden="true" />}
            </ul>
          )}
        </div>
      </div>

      <div className="results-capture">
        <h2>🎧 Analyze another chord</h2>
        <CapturePanel size="mini" />
      </div>

      {expandedVoicing && (
        <VoicingModal
          voicing={expandedVoicing}
          formula={voicings?.ok ? voicings.data.formula : null}
          onClose={() => setExpandedVoicing(null)}
        />
      )}
    </div>
  )
}

export default Results
