// Shared coordinate math for BetterChord's small, bespoke, non-svguitar
// vertical fretboard sketches -- How It Works' MiniFretDiagram
// (EXAMPLE_VOICINGS) and, as of Phase 5 Part 7's Item 3, Home's
// AmbientFretboards. Extracted from HowItWorks.jsx (where this logic was
// first built and debugged, across 2 real sessions of alignment bugfixes)
// specifically so a second independent implementation never has to
// re-derive it -- and never has a chance to reintroduce the same class of
// bug the first implementation shipped with.
//
// Both consumers already reserve a real inset around the playable fret
// area in their own CSS (a top margin for a mute/open-string marker row,
// side margins for visual breathing room) -- these functions rescale a
// string index / fret row into that SAME inset sub-rectangle, rather than
// the raw, un-inset 0-100% box. See HowItWorks.jsx's own git history
// (Phase 5 Part 7, the 2 sessions immediately preceding this one) for the
// full real-bug writeup this design fixes: dots correctly targeted their
// own line's position even before that fix, but the lines themselves
// (vlines/hlines) didn't span a consistent rectangle relative to each
// other, so an outer-string or baseline-fret dot could land outside
// where the shorter perpendicular lines actually reached.
export const GRID_LEFT = 7
export const GRID_WIDTH = 86
export const GRID_TOP = 15
export const GRID_HEIGHT = 78

// Horizontal position (percent) of string index `i` (0-5, 6 strings).
export function stringX(i) {
  return GRID_LEFT + (i / 5) * GRID_WIDTH
}

// Vertical position (percent) of fret-line `row` (0 = the nut/baseline
// boundary, `rows` = the bottom boundary) -- this is where the LINE
// itself is drawn, not where a fretted dot should sit (see fretCellY).
export function fretY(row, rows) {
  return GRID_TOP + (row / rows) * GRID_HEIGHT
}

// Fretted-dot cell center -- a real chord-diagram convention draws a
// fretted note in the GAP between two fret wires (where the finger
// actually presses), never on the wire itself. `row` is zero-indexed at
// the fret closest to the nut/baseline (row=0 for `fret===baseline`), so
// `fretY(row)` is the boundary ABOVE that fret's own cell and
// `fretY(row+1)` the boundary below it -- for a fret-1 note (row=0) this
// is exactly the midpoint between the nut and the next line down. Only
// ever called for real fretted dots -- open-string/mute markers use
// their own fixed header-band position, never this.
export function fretCellY(row, rows) {
  return (fretY(row, rows) + fretY(row + 1, rows)) / 2
}

// Is this voicing anchored at the nut (baseline=1, real nut drawn), or a
// moveable shape positioned higher up the neck (baseline=its own lowest
// fretted note, a "Nfr" label drawn instead)? True only if the voicing
// has a genuine open string, or its lowest fretted note IS fret 1 --
// NOT a comparison against the visible window size, which is wrong
// whenever a moveable shape's own span happens to fit within that window
// without actually starting at fret 1 (the real bug this fixed: a real
// fret-3 Gm barre shape was drawn as if open-position, since its span
// happened to fit within the fixed 5-row window).
export function isAnchoredAtNut(frets) {
  const hasOpenString = frets.includes('0')
  const numeric = frets.filter((f) => f !== 'X' && f !== '0').map(Number)
  const minFret = numeric.length ? Math.min(...numeric) : 0
  return hasOpenString || minFret === 1 || !numeric.length
}

// The real baseline fret this voicing's window should start at, given
// isAnchoredAtNut's own answer -- 1 (the real nut) if anchored, else the
// voicing's own lowest fretted note (a moveable shape positioned higher
// up the neck).
export function resolveBaseline(frets) {
  if (isAnchoredAtNut(frets)) return 1
  const numeric = frets.filter((f) => f !== 'X' && f !== '0').map(Number)
  return Math.min(...numeric)
}
