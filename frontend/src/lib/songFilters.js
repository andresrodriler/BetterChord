// Phase 5 Part 5/7: client-side song filtering for the Results Songs panel.
// No new API calls/params -- /songs/{chord} already returns every song for
// the chord in one response (results_by_spelling, or quality_fallback_songs
// on the fallback path -- see Results.jsx's `songsForFilters`); this module
// filters whichever already-flattened song list Results.jsx is currently
// showing. Kept as its own module (rather than inlined in Results.jsx) so
// the pure filter/options logic is easy to reason about separately from the
// disclosure UI that drives it.

// `artist` is single-select (deliberate: a real chord like "C" has 5,883
// distinct artists in its own result set -- a chip/multi-select UI doesn't
// scale to that, a searchable single combobox does -- see SongFilters.jsx's
// custom combobox, Phase 5 Part 5/7 follow-up). `genres` is multi-select (a
// chord's genre vocabulary is small, ~65 for "C" -- chips read cleanly at
// that size) with ANY-match semantics, per the task's spec.
//
// `yearMin`/`yearMax` are plain strings (controlled-input friendly). Two
// distinct empty-ish states exist on purpose: `EMPTY_SONG_FILTERS` (both
// `''`) is the pre-data-loaded sentinel, used only before this chord's real
// year bounds are known; `getDefaultSongFilters(options)` (below) is what
// the year fields actually reset/initialize to once real data has loaded --
// the true observed min/max for THIS chord's results, not a blank
// placeholder. Phase 5 Part 5/7 follow-up (Step 4): the year inputs used to
// stay `''` forever unless the user typed into them, which LOOKED bound
// (grey placeholder text showing real numbers) but wasn't -- a genuinely
// blank input reads differently from a real, editable, already-filled-in
// value, and the placeholder text doesn't behave like real state (e.g.
// can't be selected/copied, doesn't survive a "read what's currently
// filtered to" glance). Fixed by seeding the real state once data loads
// (see Results.jsx) rather than leaving the fields permanently placeholder-
// only.
export const EMPTY_SONG_FILTERS = {
  artist: '',
  genres: [],
  capo: 'any', // 'any' | 'has' | 'none'
  yearMin: '',
  yearMax: '',
}

// The real "nothing has been narrowed" state once this chord's actual data
// has loaded -- year fields default to the FULL real range (not blank), so
// the UI always shows genuine bound values rather than a placeholder.
export function getDefaultSongFilters(options) {
  return {
    artist: '',
    genres: [],
    capo: 'any',
    yearMin: options.yearMin !== null ? String(options.yearMin) : '',
    yearMax: options.yearMax !== null ? String(options.yearMax) : '',
  }
}

// Whether `filters` differs from the real default for `options` -- used for
// the "Filters (N/M)" badge and the "Clear filters" button's visibility.
// Deliberately NOT the same check as a plain "is anything non-blank" test
// (that's `hasActiveSongFilters` below, kept for filterSongs()'s own cheap
// early-return) -- once year fields are seeded to the real full range by
// default, a plain non-blank check would permanently report "active" even
// when nothing has actually been narrowed.
export function isFiltersActive(filters, options) {
  const defaults = getDefaultSongFilters(options)
  return (
    !!filters.artist ||
    filters.genres.length > 0 ||
    filters.capo !== 'any' ||
    filters.yearMin !== defaults.yearMin ||
    filters.yearMax !== defaults.yearMax
  )
}

// Cheap early-return check for filterSongs() itself -- a plain "is anything
// non-blank" test is fine here regardless of whether year fields hold the
// real default or a blank sentinel: at worst it skips a trivial no-op early
// return and runs the full (still-correct) per-song pass instead.
export function hasActiveSongFilters(filters) {
  return !!(
    filters.artist ||
    filters.genres.length ||
    filters.capo !== 'any' ||
    filters.yearMin !== '' ||
    filters.yearMax !== ''
  )
}

function releaseYear(song) {
  // album_release_date is real ISO "YYYY-MM-DD" (confirmed against
  // betterchord_songs.db directly -- 31,138 of 31,140 rows, only 2
  // genuinely NULL/empty) -- year-only granularity, per the task's spec,
  // matching how a user would actually think about "songs from the 90s".
  if (!song.album_release_date) return null
  const year = parseInt(song.album_release_date.slice(0, 4), 10)
  return Number.isNaN(year) ? null : year
}

function songGenres(song) {
  // artist_genres is a real comma-separated string (e.g. "Pop, Rock"), not
  // a JSON array -- same field/format SongCard.jsx already parses this way
  // for its own primary-genre chip.
  if (!song.artist_genres) return []
  return song.artist_genres
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
}

function sortByCountDesc(entries) {
  return entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// Distinct option lists (each with a real per-chord song COUNT, so callers
// can sort by relevance rather than alphabetically -- Phase 5 Part 5/7
// follow-up, Step 2/Step 3) + real year bounds, built from THIS chord's own
// results (flatSongs) -- not any global/site-wide artist or genre list, per
// the task's explicit scope.
export function computeSongFilterOptions(flatSongs) {
  const artistCounts = new Map()
  const genreCounts = new Map()
  let yearMin = null
  let yearMax = null

  flatSongs.forEach(({ song }) => {
    if (song.artist) {
      artistCounts.set(song.artist, (artistCounts.get(song.artist) || 0) + 1)
    }
    songGenres(song).forEach((g) => {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1)
    })
    const year = releaseYear(song)
    if (year !== null) {
      if (yearMin === null || year < yearMin) yearMin = year
      if (yearMax === null || year > yearMax) yearMax = year
    }
  })

  return {
    artists: sortByCountDesc([...artistCounts.entries()].map(([name, count]) => ({ name, count }))),
    genres: sortByCountDesc([...genreCounts.entries()].map(([name, count]) => ({ name, count }))),
    yearMin,
    yearMax,
  }
}

// All filter types combine with AND; multiple selected genres combine with
// ANY (a song matches if it has at least one selected genre) -- both per
// the task's explicit spec.
export function filterSongs(flatSongs, filters) {
  if (!hasActiveSongFilters(filters)) return flatSongs

  const yearMin = filters.yearMin !== '' ? parseInt(filters.yearMin, 10) : null
  const yearMax = filters.yearMax !== '' ? parseInt(filters.yearMax, 10) : null

  return flatSongs.filter(({ song }) => {
    if (filters.artist && song.artist !== filters.artist) return false

    if (filters.genres.length) {
      const genres = songGenres(song)
      if (!genres.some((g) => filters.genres.includes(g))) return false
    }

    if (filters.capo === 'has' && !(song.ug_capo > 0)) return false
    if (filters.capo === 'none' && !(song.ug_capo === 0)) return false

    if (yearMin !== null || yearMax !== null) {
      const year = releaseYear(song)
      if (year === null) return false
      if (yearMin !== null && year < yearMin) return false
      if (yearMax !== null && year > yearMax) return false
    }

    return true
  })
}
