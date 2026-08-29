import { Shape } from 'svguitar'
import { getIntervalStyle } from './intervalColors'

// Converts one voicing object from /voicings/{chord} (e.g.
// { frets: "8-10-10-9-8-8", base_fret: 8, barres: [1] }) into the `Chord`
// shape svguitar's .chord() expects, plus the fret-window size the caller
// passes to .configure({ frets }).
//
// Our frets string is ordered low E -> high e (index 0..5). svguitar
// numbers strings 1..6 purely by array index, so right-handed puts
// string 1 = high e (stringNumber = 6 - index) and left-handed reverses
// that (stringNumber = index + 1) -- no SVG transforms needed for the
// mirror. barres[] values are position-relative local fret numbers, so
// they pass through unchanged.
const MIN_FRET_WINDOW = 5

// computeHighestLocalFret (defined below) is shared by voicingToChord and
// needsCapoAttachment -- both need the same "how many frets would a plain
// window need to show every note" number, and keeping one copy prevents
// the two from drifting.
//
// It takes an explicit `position` rather than deriving it from `base_fret`,
// since `position` can legitimately differ from `base_fret` under nut-
// anchoring (see voicingToChord's `nutAnchor`). Capo-only callers just
// pass `baseFret > 1 ? baseFret : 1`.

// The fret-distance from an open string to the nearest fretted note past
// which openStringGap() is worth showing -- an informational mirror of
// the "Capo: N" field for the analogous "far from the fretted cluster"
// case. Open strings are never windowed the way a capo is, so nothing
// clips; this is display text only, not a rendering change. Threshold
// picked against voicings.db: a small minority of open-string rows exceed
// a 6-fret gap, matching the same "far" bar used for capo.
const OPEN_STRING_GAP_THRESHOLD = 6

// Fret-distance between an open string and the nearest edge of this
// voicing's fretted cluster, or null when there's no open string, no
// fretted cluster (all-open chord), or the gap doesn't clear
// OPEN_STRING_GAP_THRESHOLD. The value is the cluster's lowest absolute
// fret -- how far a player reaches past the nut, the same single-number
// idea the capo field conveys.
export function openStringGap(voicing) {
  const positions = voicing.frets.split('-')
  if (!positions.includes('0')) return null
  const fretted = positions.filter((p) => p !== 'X' && p !== 'x' && p !== '0').map((p) => parseInt(p, 10))
  if (fretted.length === 0) return null
  const gap = Math.min(...fretted)
  return gap > OPEN_STRING_GAP_THRESHOLD ? gap : null
}

function computeHighestLocalFret(voicing, position) {
  const { frets } = voicing
  const positions = frets.split('-')
  return Math.max(
    MIN_FRET_WINDOW,
    ...positions
      .filter((p) => p !== 'X' && p !== 'x' && p !== '0')
      .map((p) => parseInt(p, 10) - position + 1)
  )
}

export function voicingToChord(voicing, { leftHanded = false, formula = null } = {}) {
  const { frets, base_fret: baseFret, barres, intervals, notes } = voicing
  const positions = frets.split('-')

  // Window sizing. A fixed 5-fret window is too narrow for many voicings'
  // own FRETTED span (independent of any open string): plenty of real
  // Capo-type and Other rows span more than 5 frets from their base_fret --
  // e.g. frets="8-X-14-12-13-8", base_fret=8 needs local frets up to 7,
  // and a fixed 1-5 window silently clips notes off the diagram. The
  // window grows to fit the voicing's own highest LOCAL fret when it
  // exceeds 5, never shrinks below 5. This does not stretch/distort cards:
  // FretboardDiagram.jsx reads each voicing's real rendered aspect ratio
  // after draw() and sizes its container to match, so "meet" scaling fills
  // the container at whatever window size this voicing needs.
  //
  // The window is NOT widened just to reach an open string -- open strings
  // are marked with the "O" marker regardless of where the window starts
  // (see the fretNum === 0 branch below).
  //
  // Nut-anchoring: a non-Capo voicing with base_fret 1 or 2 anchors its
  // window to the real nut (position 1) instead of its own base_fret --
  // a base_fret=2 shape like D's X-X-0-2-3-2 otherwise renders a "2fr"
  // window starting one fret below the nut, reading as an arbitrary offset
  // rather than "basically a nut chord." Excludes Capo-type voicings:
  // base_fret === capo is a structural invariant there (local fret 1 IS
  // the capo's fret), so nut-anchoring a Capo row would show fret space
  // behind the capo. base_fret===1 rows are already nut-anchored by the
  // `baseFret > 1 ? baseFret : 1` fallback below.
  // Threshold is 2 because almost no non-Capo base_fret===2 row has a note
  // past fret 6; the rare ones still grow the window via
  // computeHighestLocalFret (letterboxed, never clipped).
  const nutAnchor = voicing.type !== 'Capo' && baseFret <= 2
  const position = nutAnchor ? 1 : baseFret > 1 ? baseFret : 1
  const highestLocalFret = computeHighestLocalFret(voicing, position)

  const fingers = []
  const unmutedIndexes = []

  // `intervals` (and `notes`) arrive ordered per-unmuted-string, in the
  // same left-to-right order as `frets`. So the Nth non-muted position
  // here lines up with intervals[N] -- tracked via a running counter, not
  // `index` (which also counts muted strings that intervals[] skips).
  let unmutedCount = 0

  positions.forEach((pos, index) => {
    const stringNumber = leftHanded ? index + 1 : 6 - index
    if (pos === 'X' || pos === 'x') {
      // Explicit strokeWidth so the mute marker's X keeps 2px weight --
      // it otherwise reads from svguitar's general `strokeWidth`, which
      // FretboardDiagram.jsx sets to 1px for regular fret/string lines.
      fingers.push([stringNumber, 'x', { strokeWidth: 2 }])
      return
    }
    unmutedIndexes.push(index)
    const interval = intervals && intervals[unmutedCount]
    // Dot TEXT is the note name -- always <=2 chars ("C", "F#", "Bb"),
    // unlike some interval labels ("maj7"/"dim7") that don't fit the dot.
    // Dot COLOR still encodes the interval bucket via getIntervalStyle.
    const noteName = notes && notes[unmutedCount]
    unmutedCount += 1
    const fretNum = parseInt(pos, 10)
    const style = interval ? getIntervalStyle(interval, formula) : null

    if (fretNum === 0) {
      // Open strings get the same interval-bucket color and note-letter
      // text as fretted notes, but as a hollow ring: svguitar's
      // drawEmptyStringIndicators() draws the "O" with no fill and
      // respects fingerOptions.strokeColor/textColor/text the same way
      // drawFinger does, so no new rendering path is needed. Text renders
      // ABOVE the ring (svguitar's fixed layout for empty strings), which
      // is part of what makes an open note read as "open" not "fretted".
      // textColor uses style.openText (always light), not style.text: the
      // ring's real background is the dark diagram well, not the
      // transparent fill -- see intervalColors.js.
      if (style) {
        fingers.push([
          stringNumber,
          0,
          {
            text: noteName || interval,
            textColor: style.openText,
            strokeColor: style.stroke,
            strokeWidth: 3,
          },
        ])
      } else {
        fingers.push([stringNumber, 0])
      }
    } else {
      // Derived from `position`, not `baseFret` -- see `position`'s
      // comment for why they differ under nut-anchoring. Identical to
      // `fretNum - baseFret + 1` for any non-nut-anchored row.
      const localFret = fretNum - position + 1
      // Capo-sounded notes: for Capo-type voicings, a string at local
      // fret 1 sounds because the capo bars it, not a finger (the
      // capo === base_fret invariant means local fret 1 IS the capo's
      // fret). Rendered same color/text as any fretted note but as a
      // SQUARE (svguitar's FingerOptions.shape), so it reads as neither an
      // individually-fretted note (circle) nor an open string (hollow
      // ring). Only fires on voicing.type === 'Capo'. The square sits at
      // its natural mid-cell position; FretboardDiagram.jsx's capo
      // indicator is a full bar spanning the fret-1 column, so it already
      // reads as "inside the capo bar."
      const isCapoSoundedNote = voicing.type === 'Capo' && localFret === 1
      if (style) {
        fingers.push([
          stringNumber,
          localFret,
          {
            text: noteName || interval,
            color: style.fill,
            textColor: style.text,
            strokeColor: style.stroke,
            strokeWidth: 3,
            className: style.className,
            shape: isCapoSoundedNote ? Shape.SQUARE : Shape.CIRCLE,
          },
        ])
      } else {
        // No interval data for this string (not expected in real data) --
        // fall back to a plain uncolored dot rather than crashing.
        fingers.push([stringNumber, localFret])
      }
    }
  })

  // Barre endpoints. svguitar's barre renderer does NOT sort
  // fromString/toString -- it draws a rectangle from fromString's
  // position extending by |toString - fromString| in a fixed direction,
  // trusting caller order. Right-handed's mapping (6 - index) happens to
  // produce fromString > toString; left-handed's (index + 1) reverses
  // that, which anchored the rectangle to the wrong endpoint. Assigning
  // fromString/toString by numeric value (max/min) rather than by data
  // index keeps right-handed correct and fixes left-handed, with no
  // handedness branch.
  const chordBarres = (barres || [])
    .map((fret) => {
      const fromDataIndex = Math.min(...unmutedIndexes)
      const toDataIndex = Math.max(...unmutedIndexes)
      const stringNumber = (index) => (leftHanded ? index + 1 : 6 - index)
      const a = stringNumber(fromDataIndex)
      const b = stringNumber(toDataIndex)
      return {
        fromString: Math.max(a, b),
        toString: Math.min(a, b),
        fret,
        // Brass-tinted at partial opacity. svguitar's RECTANGLE barre
        // fill is hardcoded to 'black' (ignores all config); only the ARC
        // style respects a themeable color, which is why FretboardDiagram
        // sets barreChordStyle to ARC. Same brass hue as the finger dots,
        // lower opacity so it reads as theme, not a flat block.
        color: 'rgba(200, 155, 92, 0.55)',
      }
    })
    .filter((barre) => {
      // Capo/barre coincidence suppression: for Capo-type voicings only,
      // drop a barre whose ABSOLUTE fret equals the capo's fret (e.g.
      // base_fret=5, barres=[1], capo=5 -> absolute fret
      // position + barre.fret - 1 = 5). FretboardDiagram's capo bar
      // already stands in for a barre at that fret, so the arc would be
      // redundant. A barre at a different fret renders normally.
      if (voicing.type !== 'Capo') return true
      const absoluteFret = position + barre.fret - 1
      return absoluteFret !== voicing.capo
    })

  return {
    fingers,
    barres: chordBarres,
    position,
    frets: highestLocalFret,
  }
}

// ---------------------------------------------------------------------------
// Wide-gap capo attachment -- for a Capo-type voicing whose fretted notes
// sit far above the capo, a single continuous window shows every note but
// stretches to unrealistic proportions with a huge empty middle (e.g.
// chord E frets="12-X-14-13-12-4", base_fret=4, capo=4 needs an 11-fret
// window for one note at local fret 1 and a cluster at 9-11).
//
// Rendered as exactly ONE <svg>/grid -- the cluster window only -- with
// off-cluster strings omitted from svguitar's fingers array entirely. An
// omitted string still draws its string LINE but gets no auto X-mark, so
// the grid still reads as a 6-string fretboard, and FretboardDiagram.jsx
// draws its own X/O markers and the capo bar in a hand-extended left
// margin where it fully controls spacing.
// ---------------------------------------------------------------------------

// Attachment triggers off "how wide would a plain window need to be"
// (computeHighestLocalFret, shared above), NOT the gap to the nearest
// fretted note. Gap alone is wrong: a cluster whose nearest note is close
// to the capo can still span wide on its own (e.g. Emaj9's
// frets="X-7-9-11-4-4" has gap 2 but the cluster spans local frets 4-8),
// so a gap-based check left near-identical voicings on one chord
// rendering by two different rules. Roughly 40% of real Capo-type rows
// span 7+ frets. MAX_SPAN_BEFORE_ATTACH=6: attach when the plain window
// would exceed 6 frets.
const MAX_SPAN_BEFORE_ATTACH = 6

// True when this voicing's diagram would otherwise render as a plain
// window wider than MAX_SPAN_BEFORE_ATTACH frets. Only ever true for
// Capo-type voicings (the concept of "the capo" doesn't apply to Must
// Know/Other) with at least one note above local fret 1 -- a voicing
// where EVERY note is capo-sounded (all local fret 1) has nothing to
// split into a cluster in the first place, regardless of span.
export function needsCapoAttachment(voicing) {
  if (voicing.type !== 'Capo' || !voicing.capo) return false
  const { frets, base_fret: baseFret } = voicing
  const localFrets = frets
    .split('-')
    .filter((p) => p !== 'X' && p !== 'x' && p !== '0')
    .map((p) => parseInt(p, 10) - baseFret + 1)
  const clusterFrets = localFrets.filter((l) => l > 1)
  if (clusterFrets.length === 0) return false
  // Capo-only by construction (early return above), so never nut-anchored
  // -- pass the plain `baseFret > 1 ? baseFret : 1` position.
  return computeHighestLocalFret(voicing, baseFret > 1 ? baseFret : 1) > MAX_SPAN_BEFORE_ATTACH
}

// Builds the ONE Chord config for the cluster window, plus a list of
// off-cluster strings FretboardDiagram.jsx draws itself (X or square
// marker in the hand-extended left margin, next to the capo bar). A
// string is off-cluster if it's genuinely muted (kind: 'muted', drawn as
// X) or capo-sounded (kind: 'capo', drawn as a solid colored SQUARE --
// the same square convention the small-gap path uses inside its own
// grid, so the two capo treatments look consistent).
export function voicingToClusterChord(voicing, { leftHanded = false, formula = null } = {}) {
  const { frets, base_fret: baseFret, barres, intervals, notes, capo } = voicing
  const positions = frets.split('-')
  const stringNumber = (index) => (leftHanded ? index + 1 : 6 - index)

  const clusterAbsoluteFrets = positions
    .filter((p) => p !== 'X' && p !== 'x' && p !== '0')
    .map((p) => parseInt(p, 10))
    .filter((fretNum) => fretNum - baseFret + 1 > 1)
  const clusterMinAbs = Math.min(...clusterAbsoluteFrets)
  const clusterMaxAbs = Math.max(...clusterAbsoluteFrets)
  // Floored at MIN_FRET_WINDOW, matching voicingToChord's own window.
  // Dropping the floor cut real content: e.g. D Capo 2 `10-X-12-11-10-2`
  // would show only fret rows 10-12 instead of the full 10-14. The
  // cluster box is made bigger by scaling to fit, not by showing fewer
  // rows.
  const clusterWindow = Math.max(MIN_FRET_WINDOW, clusterMaxAbs - clusterMinAbs + 1)

  const fingers = []
  const offClusterStrings = []
  const unmutedIndexes = []
  let unmutedCount = 0

  positions.forEach((pos, index) => {
    const str = stringNumber(index)
    if (pos === 'X' || pos === 'x') {
      // Genuinely muted -- omitted from svguitar's own fingers array
      // entirely (not given a 'x' entry) so svguitar draws no marker of
      // its own for this string; FretboardDiagram.jsx draws the X in the
      // hand-extended left margin instead.
      offClusterStrings.push({ stringNumber: str, kind: 'muted' })
      return
    }
    unmutedIndexes.push(index)
    const interval = intervals && intervals[unmutedCount]
    const noteName = notes && notes[unmutedCount]
    unmutedCount += 1
    const fretNum = parseInt(pos, 10)
    const style = interval ? getIntervalStyle(interval, formula) : null

    // Capo-type rows never have a literal open string in real data, but
    // handle it defensively -- treat it as a mute (it belongs to neither
    // the cluster nor the capo bar).
    if (fretNum === 0) {
      offClusterStrings.push({ stringNumber: str, kind: 'muted' })
      return
    }

    const localFret = fretNum - baseFret + 1
    if (localFret === 1) {
      // Capo-sounded -- drawn as a square marker in the left margin (see
      // FretboardDiagram.jsx), not inside the main grid at all.
      offClusterStrings.push({
        stringNumber: str,
        kind: 'capo',
        text: noteName || interval,
        style,
      })
    } else {
      // Individually fretted, in the cluster -- the only case that
      // actually gets a real finger entry in the main grid, positioned
      // relative to the CLUSTER's own lowest fret (not the capo), so the
      // grid's own position label shows the real fret number.
      const clusterLocalFret = fretNum - clusterMinAbs + 1
      if (style) {
        fingers.push([
          str,
          clusterLocalFret,
          {
            text: noteName || interval,
            color: style.fill,
            textColor: style.text,
            strokeColor: style.stroke,
            strokeWidth: 3,
            className: style.className,
          },
        ])
      } else {
        fingers.push([str, clusterLocalFret])
      }
    }
  })

  // Barres -- same fromString/toString logic as voicingToChord (see its
  // comment for why max/min), recomputed relative to the cluster's
  // position and kept only if they fall within the cluster window. In
  // real data every wide-gap voicing's barre sits at the capo's fret, so
  // it's dropped here (outside the cluster window) and this ends up
  // empty -- but the remap is implemented for a future genuine cluster
  // barre.
  const originalPosition = baseFret > 1 ? baseFret : 1
  const fromDataIndex = Math.min(...unmutedIndexes)
  const toDataIndex = Math.max(...unmutedIndexes)
  const a = stringNumber(fromDataIndex)
  const b = stringNumber(toDataIndex)
  const clusterBarres = (barres || [])
    .map((fret) => ({ fret, absoluteFret: originalPosition + fret - 1 }))
    .filter(({ absoluteFret }) => absoluteFret !== capo && absoluteFret >= clusterMinAbs && absoluteFret <= clusterMaxAbs)
    .map(({ absoluteFret }) => ({
      fromString: Math.max(a, b),
      toString: Math.min(a, b),
      fret: absoluteFret - clusterMinAbs + 1,
      color: 'rgba(200, 155, 92, 0.55)',
    }))

  return {
    fingers,
    barres: clusterBarres,
    position: clusterMinAbs,
    frets: clusterWindow,
    offClusterStrings,
  }
}
