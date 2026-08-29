import { useEffect, useRef, useState } from 'react'

// Mitigates a Deezer CDN issue (see CLAUDE.md's Phase 4 entry):
// cdn-images.dzcdn.net sometimes serves a generic "no artwork"
// placeholder as a normal 200 response (after an internal redirect), not
// a network error, so a plain <img onError> can't catch it. Detection
// keys off the placeholder's stable identity -- Deezer redirects a
// "no artwork" request to this exact cover ID (the MD5 of an empty
// string, a common "no image" sentinel).
const PLACEHOLDER_URL_FRAGMENT = 'd41d8cd98f00b204e9800998ecf8427e'

// Two failure modes, and retries only help one of them. Some covers are
// permanently gone from Deezer's origin (a catalog-removal event -- the
// placeholder is returned 100% of the time, retries can't recover them).
// Others fail only transiently. The hook can't tell which in advance, so
// it retries, then falls back down the chain (artist image -> generic
// box) -- an improvement either way, replacing a misleadingly
// "successful" wrong icon with a real photo or an honest "no art" box.
const MAX_ATTEMPTS = 3

/**
 * Loads albumImageUrl for a SongCard's collapsed thumbnail, working
 * around the placeholder-redirect issue above. Returns { src, isFallback }:
 *   - src: a blob: URL for the real cover, artistImageUrl directly
 *     (artist images aren't affected by the issue), or null if neither is
 *     usable.
 *   - isFallback: true when src is the artist photo, not the real cover.
 *
 * Lazy: does nothing until `containerRef`'s element is near the viewport
 * (IntersectionObserver, same as Results.jsx's infinite-scroll sentinel),
 * so a high-volume chord's cards don't all fetch on mount.
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

    // IntersectionObserver's `root` defaults to the viewport, not
    // `.song-list`'s own internal scroll container (it has its own
    // `overflow-y: auto`). Without an explicit `root`, every card's thumb
    // counts as visible the instant the panel is on-screen even if
    // scrolled out of view inside it, so all ~150 initial cards fetch at
    // once. `closest('.song-list')` scopes visibility to the real
    // scrolling ancestor.
    const scrollRoot = el.closest('.song-list')

    // With ~150 IntersectionObservers created in one React commit, most
    // deliver an incorrect first `isIntersecting: false` for cards that
    // are genuinely visible, and never fire again (IntersectionObserver
    // only re-delivers on a subsequent change). A synchronous
    // getBoundingClientRect check has the same race -- React commits the
    // DOM before the browser finishes a layout pass. Deferring both the
    // manual check and observer creation to the next frame
    // (requestAnimationFrame) guarantees layout has settled first.
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
