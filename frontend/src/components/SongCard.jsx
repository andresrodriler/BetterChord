import { useRef, useState } from 'react'
import ChordName from './ChordName'
import { useAlbumThumb } from '../lib/useAlbumThumb'
import './SongCard.css'

// Phase 4: rich media + UG metadata on the Songs panel. Collapsed by
// default (album art thumbnail + title + artist + spelling tag -- roughly
// what the plain <li> used to show, plus the thumbnail), click to expand
// into artist image, Spotify/YouTube embeds, and UG info. One card per
// song per spelling, same key scheme the old flat <li> list used.
//
// Data-source note (see CLAUDE.md Phase 4 entry): album_image_url/
// artist_image_url are Deezer-sourced, display only. preview_url is NOT
// used anywhere here -- real playback is the Spotify embed iframe, which
// already has its own "listen in Spotify" affordance built in.
function SongCard({ song, spelling }) {
  const [expanded, setExpanded] = useState(false)

  const {
    title,
    artist,
    album_image_url: albumImage,
    artist_image_url: artistImage,
    spotify_track_id: spotifyId,
    youtube_video_id: youtubeId,
    youtube_confidence: youtubeConfidence,
    ug_url: ugUrl,
    ug_key: ugKey,
    ug_capo: ugCapo,
    ug_tuning_name: ugTuning,
    ug_tuning_value: ugTuningValue,
    artist_genres: artistGenres,
    raw_chord: rawChord,
    capo_shape: capoShape,
  } = song

  // Confidence-gated per CLAUDE.md's Phase 4 scope: only "high" renders an
  // embed. Any other value (real data only ever has "low" otherwise, but
  // null/anything-else is treated the same way) hides it entirely -- no
  // fallback link.
  const showYoutube = youtubeConfidence === 'high' && !!youtubeId
  const showTuning = ugTuning && ugTuning !== 'Standard'

  // artist_genres is a real comma-separated string (e.g. "Pop, International
  // Pop, Rock"), not a JSON array -- one chip showing just the primary
  // (first) genre, not one chip per genre, to keep this a single small tag
  // like the key/capo chips beside it, not a chip explosion for artists
  // with several tagged genres.
  const primaryGenre = artistGenres ? artistGenres.split(',')[0].trim() : null
  const hasArtistInfo = !!(artistImage || primaryGenre || ugKey || ugCapo > 0)

  // Phase 4 follow-up: replaces the plain <img src={albumImage}> with a
  // fetch+retry+fallback chain -- see useAlbumThumb.js for why a plain
  // <img onError> can't catch this (Deezer's CDN placeholder redirect is a
  // normal, successful load, not a network error). Scoped to the album
  // thumbnail only -- Part 1's investigation found artist images aren't
  // affected by this issue, so song-card__artist-img below is unchanged.
  const thumbContainerRef = useRef(null)
  const { src: thumbSrc } = useAlbumThumb(albumImage, artistImage, thumbContainerRef)

  return (
    <li className={`song-card${expanded ? ' song-card--expanded' : ''}`}>
      <button
        type="button"
        className="song-card__summary"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span ref={thumbContainerRef} className="song-card__thumb-wrapper">
          {thumbSrc ? (
            <img className="song-card__thumb" src={thumbSrc} alt="" />
          ) : (
            <div className="song-card__thumb song-card__thumb--placeholder" aria-hidden="true" />
          )}
        </span>
        <span className="song-card__summary-text">
          <span className="song-title">{title}</span>
          {/* Phase 5 Part 6/7, Results convergence pass: real, confirmed
              mismatch -- the real mockup shows title/artist stacked with
              no separator at all, relying on font-weight/size/color alone
              to distinguish them (matching the title/artist pairing
              already used the same way on the artist-image row below).
              Dropped the hardcoded "- " prefix to match. */}
          <span className="song-card__artist">{artist}</span>
        </span>
        <span className="tag">{spelling}</span>
        <span className="song-card__chevron" aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="song-card__detail">
          {/* Phase 4 follow-up: the artist image used to sit alone with
              empty space beside it -- genre/key/capo now fill that space
              as chips next to the image, reusing the existing .tag
              treatment. Key/capo moved up from the tuning block below
              (was "ug-info", now tuning-only) rather than duplicating them
              in both places. Each piece renders only if that song actually
              has it -- no empty/placeholder chips. */}
          {hasArtistInfo && (
            <div className="song-card__artist-info">
              {artistImage && (
                <img className="song-card__artist-img" src={artistImage} alt={artist} loading="lazy" />
              )}
              <div className="song-card__artist-chips">
                {primaryGenre && <span className="tag">{primaryGenre}</span>}
                {ugKey && <span className="tag">Key: {ugKey}</span>}
                {ugCapo > 0 && <span className="tag">Capo: {ugCapo}</span>}
              </div>
            </div>
          )}

          {/* Phase 4 follow-up: explains why the chord name shown here
              (`spelling`) can differ from what's literally printed on the
              UG tab -- two genuinely separate reasons, computed backend-
              side in songs.py (see that file for the real chord math).
              Only rendered when there's actually something to explain --
              a song with neither difference renders nothing here, not an
              empty note. */}
          {(capoShape || rawChord) && (
            <p className="song-card__why-differs">
              {/* Cause-before-effect (NOTE_STYLE_GUIDE.md): the capo fact
                  leads, "shown here as X" follows -- same idiom as every
                  other note family that renames a single result. Uses the
                  shared ChordName atom (Phase 5 Part 2/7) instead of a
                  hand-rolled span -- same visual result as before, one
                  fewer place the readout treatment could drift. */}
              {capoShape && (
                <>Capo on fret {ugCapo} -- shown here as <ChordName>{spelling}</ChordName>, played as the <ChordName>{capoShape}</ChordName> shape. </>
              )}
              {rawChord && (
                <>UG tags <ChordName>{spelling}</ChordName> as <ChordName>{rawChord}</ChordName>.</>
              )}
            </p>
          )}

          {spotifyId && (
            <iframe
              className="song-card__spotify"
              title={`Spotify player - ${title}`}
              // theme=0 -- Spotify's embed defaults to a light theme whose
              // page background is white; confirmed via direct screenshot
              // comparison this switches the widget's own chrome from
              // teal-on-white to dark, matching our theme.
              //
              // height=84 (not Spotify's documented 152, and not CSS) --
              // real investigation, not a guess: even with theme=0, the
              // leftover space below the widget stays a HARD white block
              // regardless of theme (the iframe's own <body> is transparent
              // -- confirmed via direct computed-style check -- and a
              // transparent iframe body paints as opaque browser-default
              // white, which theme params can't touch). Within THIS app,
              // specifically, Spotify's widget consistently (8/8 real runs,
              // 2 different tracks, after ruling out a resource-contention
              // false reading) renders its shorter ~80px "compact" track
              // layout rather than the ~152px layout their own docs assume
              // -- confirmed via the actual rendered widget height, not the
              // iframe box height (which stayed a fixed 152 regardless).
              // Isolated standalone reproductions of the same exact markup
              // never reproduced the compact layout (always rendered
              // 152px there), so the specific trigger inside this app
              // wasn't fully isolated -- but the in-app result itself was
              // 100% consistent across every clean test run. Sized to 84
              // (80 plus a small buffer) to match what actually renders
              // here rather than reserving space nothing fills. Checked
              // for a documented postMessage-based dynamic-resize API
              // (Spotify's iframe only posts `{type:"ready"}`, no resize
              // event was observed over a 9s window) -- no official hook
              // available to size this dynamically instead.
              src={`https://open.spotify.com/embed/track/${spotifyId}?theme=0`}
              width="100%"
              height="84"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          )}

          {showYoutube && (
            <iframe
              className="song-card__youtube"
              title={`YouTube video - ${title}`}
              src={`https://www.youtube.com/embed/${youtubeId}`}
              width="100%"
              height="220"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          )}

          {showTuning && (
            <div className="song-card__ug-info">
              <span className="tag">
                Tuning: {ugTuning}
                {ugTuningValue ? ` (${ugTuningValue})` : ''}
              </span>
            </div>
          )}

          {ugUrl && (
            <a className="song-card__ug-link" href={ugUrl} target="_blank" rel="noreferrer">
              View tab on Ultimate Guitar
            </a>
          )}
        </div>
      )}
    </li>
  )
}

export default SongCard
