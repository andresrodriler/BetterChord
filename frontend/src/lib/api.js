// Deferred to Phase 3 per CLAUDE.md Phase 1 notes: hardcoded to the local
// dev backend, needs to become configurable before deployment.
export const API_BASE = 'http://127.0.0.1:8000'

export async function identifyAudio(blob, filename) {
  const formData = new FormData()
  formData.append('file', blob, filename)
  const res = await fetch(`${API_BASE}/identify`, { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `identify failed (${res.status})`)
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

// Phase 5 Part 2/7 follow-up: chord_info.py's interval breakdown/quality
// description/related-chords data, for the new "Overall Chord Info"
// section -- works for ANY resolved canonical chord, not just the
// audio-ID path (see CHORD_INFO_AUDIT.md). A 404 here (an unregistered
// quality, or one of the small number chord_info.py can't process yet --
// see the audit doc) is a normal, expected response, not an error state:
// callers should just omit the theory subsection, same pattern as
// getVoicings/getSongs's own ok/data shape.
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
