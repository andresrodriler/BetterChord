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

// Shared by every note rendered in the Songs panel (related_notes,
// searched_quality_note, the inversion/quality fallback notes) -- splits on
// backtick pairs and gives odd-indexed (chord-name) segments the existing
// `.readout` treatment, same convention already used for related_notes.
function renderBacktickedText(text) {
  return text.split('`').map((part, j) =>
    j % 2 === 1 ? (
      <span className="readout" key={j}>{part}</span>
    ) : (
      part
    )
  )
}

// Phase 5 Part 1/6 follow-up (real screenshot review): the Songs panel can
// show up to 2 kinds of note --
//   STRUCTURAL (inversion_fallback_used, quality_fallback_used) -- tell the
//     user what they're actually looking at, stay as visible banners.
//   EDUCATIONAL (searched_quality_note, related_notes) -- explain WHY, not
//     WHAT -- moved behind a single collapsed-by-default toggle so they
//     don't stack as 2-3 bordered boxes above every result that has either.
// Built once per songs.data response, not inline in JSX, since both the
// toggle label and the expanded content need the same derived list.
function buildEducationalNotes(songsData) {
  const notes = []
  if (songsData.searched_quality_note) {
    notes.push({
      kind: 'equivalence',
      labelChord: songsData.primary_chord,
      full: songsData.searched_quality_note,
      short: `\`${songsData.query}\` = \`${songsData.primary_chord}\` (same notes, different name)`,
    })
  }
  for (const note of songsData.related_notes || []) {
    notes.push({
      kind: 'related',
      labelChord: note.chord,
      full: note.text,
      // Phase 5 Part 1/6 stale-chord-reference audit: this claims a note
      // is "also shown here" alongside the chord actually below -- must
      // reference resolved_primary_chord (post any inversion fallback),
      // not primary_chord (frozen bass-inclusive, can go stale the same
      // way songs.py's searched_quality_note did -- see that fix).
      short: `\`${note.chord}\` also shown here -- same notes as \`${songsData.resolved_primary_chord}\`, just missing a tone or two`,
    })
  }
  return notes
}

// "Why Eaug7?" (equivalence only) / "Why E7b13 songs too?" (related only) /
// a combined form when both kinds are present -- always names the actual
// chord/quality involved rather than a generic "why these results?".
function educationalToggleLabel(educationalNotes) {
  const equiv = educationalNotes.find((n) => n.kind === 'equivalence')
  const related = educationalNotes.filter((n) => n.kind === 'related')

  const relatedPhrase = related.length > 0 ? `${related.map((n) => n.labelChord).join(' & ')} songs too` : null

  if (equiv && relatedPhrase) return `Why ${equiv.labelChord} & ${relatedPhrase}?`
  if (equiv) return `Why ${equiv.labelChord}?`
  if (relatedPhrase) return `Why ${relatedPhrase}?`
  return null
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
  const { fromAudio, confidence, searchedAs } = location.state || {}

  const [voicings, setVoicings] = useState(null) // { ok, status, data } | null (loading)
  const [songs, setSongs] = useState(null)
  const [rootAliases, setRootAliases] = useState(null) // null = not loaded yet
  const [expandedVoicing, setExpandedVoicing] = useState(null) // Phase 3 Part 5/6 click-to-expand
  const [visibleSongCount, setVisibleSongCount] = useState(SONG_BATCH_SIZE) // Phase 4 follow-up: incremental song-list render
  const [showEducationalNotes, setShowEducationalNotes] = useState(false) // Phase 5 Part 1/6 follow-up: collapsed by default

  useEffect(() => {
    setVoicings(null)
    setSongs(null)
    setVisibleSongCount(SONG_BATCH_SIZE)
    setShowEducationalNotes(false)
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
          {/* Phase 5 Part 1/6 follow-up: makes an inversion fallback
              explicit instead of silently showing root-position songs as
              if they matched the searched inversion (Dump Notes: "Fall
              back clearness") -- STRUCTURAL, stays a visible banner. */}
          {songs && songs.ok && songs.data.inversion_fallback_used && (
            <div className="related-notes">
              <p className="related-note">
                {renderBacktickedText(
                  `No songs are tagged with the exact inversion \`${songs.data.primary_chord}\`. ` +
                    `Showing songs for the root-position chord \`${songs.data.root_position_chord}\` instead.`
                )}
              </p>
            </div>
          )}
          {songs && songs.ok && (() => {
            // EDUCATIONAL notes (searched_quality_note + related_notes) --
            // explain WHY these results look the way they do, not WHAT the
            // user is looking at, so they sit behind a collapsed-by-default
            // toggle rather than stacking as more banners (real screenshot
            // feedback: up to 3 bordered boxes above the song list at once).
            const educationalNotes = buildEducationalNotes(songs.data)
            if (educationalNotes.length === 0) return null
            const label = educationalToggleLabel(educationalNotes)
            return (
              <div className="educational-notes-wrap">
                <button
                  type="button"
                  className="educational-notes__toggle"
                  aria-expanded={showEducationalNotes}
                  onClick={() => setShowEducationalNotes((v) => !v)}
                >
                  <span className="educational-notes__caret">{showEducationalNotes ? '▾' : '▸'}</span> {label}
                </button>
                {showEducationalNotes && (
                  <div className="related-notes educational-notes">
                    {educationalNotes.length === 1 ? (
                      <p className="related-note">{renderBacktickedText(educationalNotes[0].full)}</p>
                    ) : (
                      <ul className="educational-notes__list">
                        {educationalNotes.map((note, i) => (
                          <li className="educational-notes__item" key={i}>
                            {renderBacktickedText(note.short)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
          {songs && songs.ok && songs.data.total_songs > 0 && (
            <ul className="song-list" ref={songListRef}>
              {visibleSongs.map(({ key, song, spelling }) => (
                <SongCard key={key} song={song} spelling={spelling} />
              ))}
              {hasMoreSongs && <li ref={songSentinelRef} className="song-list__sentinel" aria-hidden="true" />}
            </ul>
          )}
          {/* Phase 5 Part 1/6: genuine-no-songs fallback (Dump Notes: "If
              genuine no songs exist") -- kept visually/structurally
              separate from the real song list above, since these songs are
              for a DIFFERENT root, only sharing the same chord quality
              (same fretted shape, different position). */}
          {songs && songs.ok && songs.data.quality_fallback_used && (
            <div className="related-notes">
              <p className="related-note">
                {renderBacktickedText(
                  // Phase 5 Part 1/6 stale-chord-reference audit: by the
                  // time this fires, an inversion fallback may have ALREADY
                  // tried root-position and also found zero -- naming
                  // primary_chord (frozen, bass-inclusive) here would claim
                  // "exactly X" for a spelling the inversion banner above
                  // already said wasn't searched anymore. resolved_primary_chord
                  // is whatever was actually, finally searched.
                  `No songs found tagged exactly \`${songs.data.resolved_primary_chord}\`. Since a ` +
                    `\`${songs.data.resolved_quality}\`-quality chord is the same shape ` +
                    `wherever it's played, here are songs using that same quality on other roots:`
                )}
              </p>
              {songs.data.quality_fallback_songs.map((entry) => (
                <div key={entry.chord} className="quality-fallback-group">
                  <h3 className="voicing-list__section">{entry.chord}</h3>
                  <ul className="song-list">
                    {entry.songs.slice(0, 5).map((song, i) => (
                      <SongCard key={`${entry.chord}-${i}`} song={song} spelling={entry.chord} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {songs && songs.ok && songs.data.total_songs === 0 && !songs.data.quality_fallback_used && (
            <p className="status-text">No songs found for this chord.</p>
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
