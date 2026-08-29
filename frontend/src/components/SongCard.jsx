import { useRef } from 'react'
import ChordName from './ChordName'
import { enharmonicRootNote } from '../lib/chordAlias'
import { useAlbumThumb } from '../lib/useAlbumThumb'
import './SongCard.css'

// Rich media + UG metadata on the Songs panel. Collapsed by default
// (album-art thumbnail + title + artist + spelling tag), click to expand
// into artist image, Spotify/YouTube embeds, and UG info. One card per
// song per spelling.
//
// Data-source note (see CLAUDE.md Phase 4 entry): album_image_url/
// artist_image_url are Deezer-sourced, display only. preview_url is not
// used -- real playback is the Spotify embed iframe.
// `expanded`/`onToggleExpanded` are lifted to Results.jsx so only one
// card is expanded at a time across the panel. `rootAliases` (the
// raw->canonical root map from /chords) is threaded down so the "UG tags
// X as Y" note can explain a plain root respelling.
function SongCard({ song, spelling, rootAliases, expanded, onToggleExpanded }) {
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

  // Only "high" confidence renders a YouTube embed -- any other value
  // ("low", null, anything) hides it entirely, no fallback link.
  const showYoutube = youtubeConfidence === 'high' && !!youtubeId
  const showTuning = ugTuning && ugTuning !== 'Standard'

  // artist_genres is a comma-separated string (e.g. "Pop, Rock"), not a
  // JSON array -- one chip showing just the primary (first) genre, so
  // this stays a single small tag like the key/capo chips.
  const primaryGenre = artistGenres ? artistGenres.split(',')[0].trim() : null
  const hasArtistInfo = !!(artistImage || primaryGenre || ugKey || ugCapo > 0)

  // Replaces a plain <img src={albumImage}> with a fetch+retry+fallback
  // chain -- see useAlbumThumb.js for why <img onError> can't catch
  // Deezer's CDN placeholder redirect. Scoped to the album thumbnail
  // only (artist images aren't affected).
  const thumbContainerRef = useRef(null)
  const { src: thumbSrc } = useAlbumThumb(albumImage, artistImage, thumbContainerRef)

  // Null when there's nothing to explain (roots identical, or a
  // quality/bass difference rather than a root respelling).
  const enharmonicNote = rawChord ? enharmonicRootNote(spelling, rawChord, rootAliases) : null

  return (
    <li className={`song-card${expanded ? ' song-card--expanded' : ''}`}>
      <button
        type="button"
        className="song-card__summary"
        onClick={onToggleExpanded}
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
          {/* Title/artist stacked with no separator, distinguished by
              weight/size/color alone (matching the artist-image row
              below). */}
          <span className="song-card__artist">{artist}</span>
        </span>
        <span className="tag">{spelling}</span>
        <span className="song-card__chevron" aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="song-card__detail">
          {/* Genre/key/capo chips beside the artist image, reusing the
              .tag treatment. Each renders only if that song has it -- no
              placeholder chips. */}
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

          {/* Explains why the chord name shown here (`spelling`) can
              differ from what's on the UG tab -- two reasons, computed in
              songs.py. Only rendered when there's something to explain. */}
          {(capoShape || rawChord) && (
            <p className="song-card__why-differs">
              {/* Cause-before-effect (NOTE_STYLE_GUIDE.md): the capo fact
                  leads, "shown here as X" follows. Uses the shared
                  ChordName atom rather than a hand-rolled span. */}
              {capoShape && (
                <>Capo on fret {ugCapo} -- shown here as <ChordName>{spelling}</ChordName>, played as the <ChordName>{capoShape}</ChordName> shape. </>
              )}
              {rawChord && (
                <>
                  UG tags <ChordName>{spelling}</ChordName> as <ChordName>{rawChord}</ChordName>
                  {enharmonicNote ? ` (${enharmonicNote}).` : '.'}
                </>
              )}
            </p>
          )}

          {spotifyId && (
            <iframe
              className="song-card__spotify"
              title={`Spotify player - ${title}`}
              // theme=0 switches Spotify's embed chrome from its
              // light-theme default (white page background) to dark.
              //
              // height=84, not Spotify's documented 152: even with
              // theme=0, the space below the widget stays a hard white
              // block (the iframe's own <body> is transparent, painting
              // as browser-default white, which theme params can't
              // touch). In this app Spotify consistently renders its
              // ~80px compact track layout rather than the documented
              // 152px one, so 84 matches what actually renders rather
              // than reserving space nothing fills. No postMessage
              // resize API is available (the iframe only posts
              // `{type:"ready"}`).
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
            <a className="song-card__ug-link" href={ugUrl} target="_blank" rel="noopener noreferrer">
              View tab on Ultimate Guitar
              <span className="song-card__ug-ext" aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}
    </li>
  )
}

export default SongCard
