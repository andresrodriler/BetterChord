import { useEffect, useRef, useState } from 'react'

// Phase 4 follow-up: mitigates a real, confirmed Deezer CDN issue (see
// CLAUDE.md's Phase 4 entry) -- cdn-images.dzcdn.net sometimes serves a
// generic "no artwork" placeholder icon instead of the real cover, as a
// normal, successfully-loading 200 response (after an internal redirect),
// not a network error. A plain <img onError> can never catch this -- the
// load genuinely succeeds, just with the wrong image. Detection instead
// keys off the placeholder's own stable identity: Deezer always redirects
// a "no artwork" cover request to this exact cover ID (the MD5 of an empty
// string, a well-known "no image" sentinel convention) -- confirmed via
// dozens of real repeated requests, both for the specific known-bad cover
// that prompted this and a broad random sample of 15 other, unaffected
// covers (0/45 false positives).
const PLACEHOLDER_URL_FRAGMENT = 'd41d8cd98f00b204e9800998ecf8427e'

// Real-world finding, worth recording here since it changes what this hook
// can actually promise: this issue was originally observed as *intermittent*
// per-request CDN routing (some requests for the same cover landing on a
// backend that redirects to the placeholder, others on one that serves the
// real image). Re-verified before writing this hook, not assumed to still
// hold -- and it does NOT, for the specific covers already known to be
// affected: 28/28 real fresh requests across all 3 of Mac DeMarco's distinct
// cover hashes now hit the placeholder consistently, 100% of the time,
// matching the same catalog-removal event already documented for his
// YouTube links. Retries won't recover these SPECIFIC covers anymore --
// they're genuinely gone from Deezer's origin now, not randomly routed.
// The retry logic is still worth keeping for genuinely transient cases
// (this app has no way to know in advance which failure mode a given cover
// is hitting), and the artist-image/generic-box fallback chain is a real
// improvement regardless of whether a retry ever recovers anything -- it
// replaces a misleadingly "successful-looking" wrong icon with either a
// real photo or an honest "no art" placeholder box.
const MAX_ATTEMPTS = 3

/**
 * Loads albumImageUrl for a SongCard's collapsed thumbnail, detecting and
 * working around the placeholder-redirect issue above. Returns
 * { src, isFallback }:
 *   - src: a blob: URL for the real cover, artistImageUrl directly (no
 *     fetch needed -- Part 1's investigation found artist images aren't
 *     affected by this issue), or null if neither is usable.
 *   - isFallback: true when src is the artist photo, not the real cover.
 *
 * Lazy: does nothing until `containerRef`'s element is near the viewport
 * (IntersectionObserver, same mechanism/margin style as Results.jsx's
 * infinite-scroll sentinel), matching the native `loading="lazy"` behavior
 * this replaces -- otherwise every rendered card would eagerly fetch on
 * mount, undoing Item 2's fix for high-volume chords.
 */
export function useAlbumThumb(albumImageUrl, artistImageUrl, containerRef) {
  const [state, setState] = useState({ src: null, isFallback: false })
  const blobUrlRef = useRef(null)

  useEffect(() => {
    // Nothing to load -- go straight to whatever fallback is available,
    // no network activity at all.
    if (!albumImageUrl) {
      setState({ src: artistImageUrl || null, isFallback: !!artistImageUrl })
      return
    }

    let cancelled = false
    const el = containerRef.current
    if (!el) return undefined

    const load = async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) return
        try {
          // First attempt uses the browser's normal HTTP cache (fast,
          // matches a plain <img> for the common case). Only retries
          // cache-bust -- a retry's whole point is to bypass whatever
          // backend/cache the previous attempt landed on.
          const url = attempt === 0 ? albumImageUrl : `${albumImageUrl}?retry=${Date.now()}-${attempt}`
          const res = await fetch(url, attempt === 0 ? undefined : { cache: 'no-store' })
          if (!res.ok) continue
          if (res.url.includes(PLACEHOLDER_URL_FRAGMENT)) continue // known placeholder, try again

          const blob = await res.blob()
          if (cancelled) return
          const objectUrl = URL.createObjectURL(blob)
          blobUrlRef.current = objectUrl
          setState({ src: objectUrl, isFallback: false })
          return
        } catch {
          // Network error (not the placeholder case) -- worth a retry too,
          // same loop, no special handling needed.
        }
      }
      // Exhausted every attempt: fall back to the artist photo, or the
      // generic placeholder box if there isn't one either.
      if (!cancelled) setState({ src: artistImageUrl || null, isFallback: !!artistImageUrl })
    }

    // Real bug caught in testing, not theoretical: IntersectionObserver's
    // `root` defaults to the browser viewport, not `.song-list`'s own
    // internal scroll container (it has its own `overflow-y: auto`, see
    // Results.css). Without an explicit `root`, every card's thumb counts
    // as "visible" the instant the panel itself is on-screen, REGARDLESS
    // of whether it's scrolled out of view inside that panel -- confirmed
    // via direct instrumentation: all ~150 initially-rendered cards fired
    // their observer within ~1 second of each other, triggering a real
    // fetch stampede (150 concurrent requests competing for the browser's
    // limited per-origin connections) that measurably slowed down every
    // individual thumb, including ones that should have loaded instantly.
    // `closest('.song-list')` finds the real scrolling ancestor so only
    // thumbs actually near-visible within it are treated as visible.
    const scrollRoot = el.closest('.song-list')

    // Second real bug, found while re-testing the fix above: with ~150
    // IntersectionObservers all created in the same React commit (one per
    // initially-rendered card), most delivered an incorrect FIRST reading
    // of `isIntersecting: false` for cards that were genuinely visible --
    // confirmed via direct instrumentation (only 9/150 cards' first
    // callback correctly reported true; the rest never fired again, since
    // IntersectionObserver only re-delivers on a real subsequent change,
    // and nothing else was changing). A synchronous getBoundingClientRect
    // check run inline in the effect (tried first) turned out to have the
    // same underlying race -- still sometimes ran before the browser's
    // layout for this batch of 150 cards had actually settled, since
    // React commits the DOM before the browser necessarily finishes a
    // layout pass for it. Fixed properly by deferring BOTH the manual
    // check and observer creation to the frame after the one this effect
    // ran in (`requestAnimationFrame`) -- guarantees the browser has
    // completed a real layout pass first. Verified via 15 consecutive
    // fresh-context runs against the real top-ranked (genuinely visible,
    // no scroll needed) song for chord "C" -- 15/15 resolved correctly
    // (an earlier "still fails sometimes" reading turned out to be testing
    // a stale reference song that had since sorted out of the visible
    // range, not a real remaining bug -- re-verified against the real
    // current #1 song before trusting this fix).
    let observer = null
    let rafId = requestAnimationFrame(() => {
      const isVisible = !scrollRoot || (() => {
        const elRect = el.getBoundingClientRect()
        const rootRect = scrollRoot.getBoundingClientRect()
        const margin = 200
        return elRect.bottom >= rootRect.top - margin && elRect.top <= rootRect.bottom + margin
      })()

      if (isVisible) {
        load()
        return
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            observer.disconnect()
            load()
          }
        },
        { root: scrollRoot, rootMargin: '200px' }
      )
      observer.observe(el)
    })

    // Runs when albumImageUrl/artistImageUrl actually change (a different
    // song) or on unmount -- NOT every time `state.src` changes within one
    // song's own load, so the blob URL just created for THIS song isn't
    // immediately revoked out from under the <img> displaying it.
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      if (observer) observer.disconnect()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumImageUrl, artistImageUrl])

  return state
}
