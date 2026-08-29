// Client-side song filtering for the Results Songs panel. No new API
// calls -- /songs/{chord} already returns every song in one response
// (results_by_spelling, or quality_fallback_songs on the fallback path);
// this module filters whichever flattened list Results.jsx is showing
// (its `songsForFilters`). Kept separate from the disclosure UI that
// drives it so the pure filter/options logic stands on its own.

// `artist` is single-select: a chord like "C" has ~5,900 distinct artists
// in its result set, too many for chips -- SongFilters.jsx uses a
// searchable combobox. `genres` is multi-select with ANY-match semantics
// (a chord's genre vocabulary is small, ~65 for "C", so chips read fine).
//
// `yearMin`/`yearMax` are strings (controlled-input friendly). Two empty
// states exist on purpose: `EMPTY_SONG_FILTERS` (both `''`) is the
// pre-data-load sentinel, used only before this chord's year bounds are
// known; `getDefaultSongFilters(options)` is what the year fields reset to
// once data loads -- the real observed min/max for this chord, so the
// inputs hold genuine editable values rather than placeholder-only text.
// Results.jsx seeds the real state on data load.
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

// Whether `filters` differs from the real default for `options` -- drives
// the "Filters (N/M)" badge and "Clear filters" visibility. Not the same
// as `hasActiveSongFilters` below: once year fields are seeded to the full
// range by default, a plain non-blank check would always report "active".
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
  // album_release_date is ISO "YYYY-MM-DD" and populated for all but a
  // handful of rows in betterchord_songs.db. Year-only granularity here,
  // matching how someone thinks about "songs from the 90s".
  if (!song.album_release_date) return null
  const year = parseInt(song.album_release_date.slice(0, 4), 10)
  return Number.isNaN(year) ? null : year
}

function songGenres(song) {
  // artist_genres is a comma-separated string (e.g. "Pop, Rock"), not a
  // JSON array -- same field/format SongCard.jsx parses for its own
  // primary-genre chip.
  if (!song.artist_genres) return []
  return song.artist_genres
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
}

function sortByCountDesc(entries) {
  return entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// Distinct option lists (each with a per-chord song COUNT so callers can
// sort by relevance, not alphabetically) plus year bounds, built from
// this chord's own results -- never a global artist or genre list.
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

// All filter types combine with AND; multiple selected genres combine
// with ANY (a song matches if it has at least one selected genre).
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
