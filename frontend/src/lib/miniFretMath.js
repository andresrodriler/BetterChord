// Shared coordinate math for BetterChord's small, bespoke (non-svguitar)
// vertical fretboard sketches -- How It Works' MiniFretDiagram
// (EXAMPLE_VOICINGS) and Home's AmbientFretboards. One implementation so
// the two can't drift.
//
// Both consumers reserve an inset around the playable fret area in their
// own CSS (a top margin for the mute/open-string marker row, side margins
// for breathing room). These functions rescale a string index / fret row
// into that SAME inset sub-rectangle, not the raw 0-100% box -- so dots
// and the vlines/hlines they sit on span one consistent rectangle
// relative to each other, and an outer-string or baseline-fret dot can't
// land past where the shorter perpendicular lines reach.
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
// moveable shape higher up the neck (baseline = its own lowest fretted
// note, an "Nfr" label instead)? True only if there's a genuine open
// string or the lowest fretted note IS fret 1 -- NOT a comparison against
// the window size, which wrongly reads a compact moveable shape (e.g. a
// fret-3 Gm barre that fits in a 5-row window) as open-position.
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
