// Backend origin. Set VITE_API_URL at build time (Vercel env var) to the
// deployed backend's origin; when unset it falls back to the local dev
// backend so `npm run dev` works with no config. Trailing slash trimmed so
// `${API_BASE}/identify` never becomes `//identify`.
export const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export async function identifyAudio(blob, filename) {
  const formData = new FormData()
  formData.append('file', blob, filename)
  const res = await fetch(`${API_BASE}/identify`, { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) {
    // `data.reason` ("ffmpeg_unavailable" | "audio_decode_failed" | absent)
    // and `data.error` are server-side concerns -- log them for dev (they
    // also show in the Network response), but the visitor never touches
    // ffmpeg, so the thrown message stays a generic, friendly one.
    console.warn('[identify] failed', { status: res.status, error: data.error, reason: data.reason })
    const err = new Error("We couldn't process that recording. Please try again with a different one.")
    err.reason = data.reason
    err.rawError = data.error
    throw err
  }
  return data
}

export async function getVoicings(chordName) {
  const res = await fetch(`${API_BASE}/voicings/${encodeURIComponent(chordName)}`)
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

export async function getSongs(chordName) {
  const res = await fetch(`${API_BASE}/songs/${encodeURIComponent(chordName)}`)
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

// chord_info.py's interval breakdown / quality description / related-
// chords data for the Chord Overview section -- works for any resolved
// canonical chord, not just the audio-ID path (see CHORD_INFO_AUDIT.md).
// A 404 (unregistered quality, or one chord_info.py can't process yet) is
// a normal response, not an error: callers omit the theory subsection,
// same ok/data shape as getVoicings/getSongs.
export async function getChordInfo(chordName) {
  const res = await fetch(`${API_BASE}/chord-info/${encodeURIComponent(chordName)}`)
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

// Module-scoped cache of the in-flight/resolved /chords fetch -- ManualSearch
// is mounted repeatedly (Home, Results, capture modal), so this ensures the
// full autocomplete suggestion list (and the root-alias map alongside it) is
// fetched exactly once per page load, not once per mount. Every caller
// awaits the same promise. Resolves to { chords, rootAliases }.
let chordsPromise = null

export function getChords() {
  if (!chordsPromise) {
    chordsPromise = fetch(`${API_BASE}/chords`)
      .then((res) => {
        if (!res.ok) throw new Error(`getChords failed (${res.status})`)
        return res.json()
      })
      .then((data) => ({ chords: data.chords, rootAliases: data.root_aliases || {} }))
      .catch((err) => {
        // Let a failed fetch be retried on next call rather than caching
        // a permanent rejection.
        chordsPromise = null
        throw err
      })
  }
  return chordsPromise
}
