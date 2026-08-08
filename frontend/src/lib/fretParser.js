import { Shape } from 'svguitar'
import { getIntervalStyle } from './intervalColors'

// Converts one voicing object from /voicings/{chord} (e.g.
// { frets: "8-10-10-9-8-8", base_fret: 8, barres: [1] }) into the `Chord`
// shape svguitar's .chord() expects, plus the fret-window size the caller
// should pass to .configure({ frets }).
//
// Our frets string is ordered low E -> high e (index 0..5). svguitar numbers
// strings 1..6 purely by array index (confirmed by reading svguitar's own
// source during the Phase 3 Part 2 follow-up spike -- string x-position
// comes from stringXPos()/toArrayIndex(), nothing else), so right-handed
// puts string 1 = high e (stringNumber = 6 - index) and left-handed simply
// reverses that mapping (stringNumber = index + 1) -- no SVG transforms or
// library changes needed for the mirror. barres[] values are already
// position-relative local fret numbers (base_fret=8, barres=[1] means
// actual fret 8) so they pass through unchanged in the non-open path.
const MIN_FRET_WINDOW = 5

// Shared by voicingToChord (the simple single-window renderer) AND
// needsCapoAttachment (below) -- both need the same "how many frets would
// a plain, non-attached window need to show every note" number, and having
// two separate copies of this calc is exactly how the 8th-follow-up bug
// happened (see needsCapoAttachment's comment). One implementation.
function computeHighestLocalFret(voicing) {
  const { frets, base_fret: baseFret } = voicing
  const positions = frets.split('-')
  return Math.max(
    MIN_FRET_WINDOW,
    ...positions
      .filter((p) => p !== 'X' && p !== 'x' && p !== '0')
      .map((p) => {
        const fretNum = parseInt(p, 10)
        return baseFret > 1 ? fretNum - baseFret + 1 : fretNum
      })
  )
}

export function voicingToChord(voicing, { leftHanded = false, formula = null } = {}) {
  const { frets, base_fret: baseFret, barres, intervals, notes } = voicing
  const positions = frets.split('-')

  // Window sizing (Phase 3 Part 5/6, 4th follow-up -- real bug found while
  // testing Part 4, not what the task's own bug report hypothesized).
  // REVERTED (Phase 3 Part 2, second follow-up) then RE-INTRODUCED here in
  // a narrower form: the Part 2 revert was specifically about NOT widening
  // the window to include the nut just because a string happens to be
  // open (that reasoning still holds, unchanged -- open strings are still
  // marked via the "O" marker regardless of window position, see below).
  // This is a DIFFERENT problem: a fixed 5-fret window is too narrow for
  // the voicing's own FRETTED notes on their own terms, independent of any
  // open string. Measured directly against the real db, not assumed: 1068
  // of 1596 real Capo-type rows (67%) and 107 of 41918 Other rows span
  // MORE than 5 frets from their own base_fret -- e.g. real row
  // frets="8-X-14-12-13-8", base_fret=8 needs local frets up to 7, but the
  // fixed window only showed 1-5, silently clipping 2 of the voicing's 5
  // notes off the visible diagram entirely (confirmed via real DOM
  // inspection: only 3 of 5 expected <circle> elements rendered on-screen
  // for that exact row). This is what Part 4's "modal says the 5th is
  // included but no dot shows it" symptom actually traces back to in the
  // cases checked -- not literally about capo-BAR-sounded notes
  // specifically (those, at local fret 1, were already always inside any
  // window >=1 wide) -- see CLAUDE.md for the full trace.
  // Fix: window grows to fit the voicing's own highest LOCAL fret when it
  // exceeds 5, never shrinks below 5 (keeps every existing voicing's
  // rendering pixel-identical to before). This does NOT reintroduce the
  // Part 2 stretch-distortion bug -- that bug came from forcing every
  // card to the SAME fixed pixel size via `preserveAspectRatio="none"`
  // regardless of the SVG's real proportions; here, FretboardDiagram.jsx
  // instead reads each voicing's own real rendered aspect ratio after
  // draw() and sizes its container to match, so "meet" scaling (already
  // in use, never "none") fills the container correctly at whatever
  // window size this specific voicing actually needs, no stretch either way.
  const position = baseFret > 1 ? baseFret : 1
  const highestLocalFret = computeHighestLocalFret(voicing)

  const fingers = []
  const unmutedIndexes = []

  // `intervals` (and `notes`) arrive ordered per-unmuted-string, in the
  // same left-to-right order as `frets` itself (confirmed against real
  // live /voicings responses, not just the sample CSV -- Phase 3 Part 5/6
  // task instructions required this be re-checked against real data, not
  // assumed to still hold). So the Nth non-muted position here lines up
  // with intervals[N] -- tracked via a running counter, not `index`
  // (which also counts muted strings that intervals[] skips entirely).
  let unmutedCount = 0

  positions.forEach((pos, index) => {
    const stringNumber = leftHanded ? index + 1 : 6 - index
    if (pos === 'X' || pos === 'x') {
      fingers.push([stringNumber, 'x'])
      return
    }
    unmutedIndexes.push(index)
    const interval = intervals && intervals[unmutedCount]
    // Dot TEXT is the note name (Phase 3 Part 5/6 follow-up) -- always
    // <=2 characters ("C", "F#", "Bb", ...), which is what actually fixes
    // the overflow bug (some interval labels, e.g. "maj7"/"dim7", didn't
    // fit the dot at all). Dot COLOR still encodes the interval bucket
    // via `interval`/getIntervalStyle -- only the label changed, not the
    // color logic.
    const noteName = notes && notes[unmutedCount]
    unmutedCount += 1
    const fretNum = parseInt(pos, 10)
    const style = interval ? getIntervalStyle(interval, formula) : null

    if (fretNum === 0) {
      // Open strings (Phase 3 Part 5/6, 4th follow-up): now get the SAME
      // interval-bucket color and note-letter text as fretted notes,
      // rendered as a hollow ring rather than a solid dot -- svguitar's
      // drawEmptyStringIndicators() already draws the "O" with `fill:
      // undefined` (hollow by construction, confirmed in its source) and
      // independently respects fingerOptions.strokeColor/textColor/text
      // the exact same way drawFinger does for fretted dots -- no new
      // rendering path needed, just supplying the same options object.
      // Text renders ABOVE the ring (svguitar's own fixed layout for
      // empty-string indicators), not inside it -- distinct from a
      // fretted dot's centered text, which is itself part of what makes
      // an open note read as "open" rather than "fretted."
      // BUGFIX (5th follow-up): textColor here used to reuse `style.text`
      // (the SOLID-fill-paired color, dark for most buckets) -- wrong for
      // a hollow ring whose real background is the dark diagram well, not
      // the (transparent) fill. Uses `style.openText` (always light)
      // instead -- see intervalColors.js for why this can't just be the
      // per-bucket `text` value.
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
      const localFret = baseFret > 1 ? fretNum - baseFret + 1 : fretNum
      // Capo-sounded notes (Phase 3 Part 5/6, 4th follow-up; repositioning
      // logic removed in the 5th follow-up's mini pass, see below): for
      // Capo-type voicings specifically, a string at local fret 1 sounds
      // because the capo bars across it, not an individual finger --
      // confirmed structurally (never contradicted in real data: the
      // established capo===base_fret invariant, see CLAUDE.md Part 2,
      // means local fret 1 IS the capo's own fret for every real
      // Capo-type row). Rendered with the same color/text as any other
      // fretted note (still fully legible as "this note, this interval"),
      // but as a SQUARE instead of a circle -- svguitar's native
      // FingerOptions.shape, not a hand-rolled SVG shape -- so it can't be
      // confused for either an individually-fretted note (circle) or a
      // true open string (hollow ring). Must Know/Other voicings are
      // completely unaffected -- this only ever fires on
      // voicing.type === 'Capo', the same authoritative gate
      // FretboardDiagram.jsx's capo-bar drawing already uses.
      // These squares stay at their natural, un-repositioned mid-cell
      // position -- FretboardDiagram.jsx's capo indicator is now a full
      // BAR spanning the entire fret-1 column (not a thin boundary line),
      // so a square sitting at that column's normal center already reads
      // correctly as "inside the capo bar," no relocation needed.
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
        // No interval data for this string (shouldn't happen against real
        // data, but don't let a gap crash the render) -- falls back to
        // the plain, uncolored dot from before this change.
        fingers.push([stringNumber, localFret])
      }
    }
  })

  // Barre endpoints -- root-caused during the Phase 3 Part 2 follow-up
  // review (real bug: left-handed barres rendered floating in the wrong
  // place, not tracking the mirrored strings). svguitar's barre renderer
  // does NOT sort fromString/toString itself -- it draws a rectangle
  // starting at fromString's position and extending by
  // |toString - fromString| in a fixed direction, trusting the caller's
  // order. Confirmed by reading its source (drawBarre in svguitar.es5.js):
  // it computes `fromStringX = stringXPositions[toArrayIndex(fromString)]`
  // and extends from there, no swap/sort. Right-handed's mapping
  // (stringNumber = 6 - index) happens to always produce
  // fromString > toString for our low-to-high-index span, which satisfies
  // the renderer's implicit assumption -- that's why right-handed barres
  // were already correct. Left-handed's mapping (stringNumber = index + 1)
  // reverses the direction, producing fromString < toString instead --
  // same physical span, but now on the wrong side of that assumption, so
  // the rectangle started from the wrong endpoint. Fix: always assign
  // fromString/toString by numeric value (max/min), not by which data
  // index (min or max) they came from -- this preserves the already-
  // correct right-handed order and corrects left-handed's without a
  // handedness-specific branch.
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
        // Refined barre styling: brass-tinted at partial opacity instead of
        // svguitar's hardcoded solid-black rectangle fill (confirmed in
        // source -- the RECTANGLE barre style's fill color is hardcoded to
        // the literal string 'black', ignoring fingerColor/any config
        // entirely; only the ARC style respects a themeable color, which is
        // why FretboardDiagram switches barreChordStyle to ARC). Same hue
        // as the finger dots (brass), lower opacity so it reads as part of
        // the theme rather than a flat block.
        color: 'rgba(200, 155, 92, 0.55)',
      }
    })
    .filter((barre) => {
      // Capo/barre coincidence suppression: within Capo-type voicings
      // only (never Must Know/Other -- those keep every real barre
      // exactly as before), drop a barre whose ABSOLUTE fret is the same
      // as the capo's fret. Real example: chord C, base_fret=5,
      // barres=[1], capo=5, type="Capo" -- barre.fret is a LOCAL fret
      // (relative to `position`, same convention as fingers' localFret
      // above), so its absolute fret is `position + barre.fret - 1` =
      // 5 + 1 - 1 = 5, matching capo=5 exactly. The capo bar drawn in
      // FretboardDiagram already stands in for a barre at that fret, so
      // drawing the barre arc on top of/next to it would be redundant --
      // the capo line alone is the correct representation. A barre at a
      // DIFFERENT absolute fret than the capo is left untouched (both
      // render independently), and only the specific coinciding barre(s)
      // are dropped if a voicing ever has more than one.
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
// Wide-gap capo attachment -- for a Capo-type voicing whose individually-
// fretted notes sit far above the capo, a single continuous window
// technically shows every note correctly, but stretches to unrealistic
// proportions with a huge empty middle -- real example, chord E:
// frets="12-X-14-13-12-4", base_fret=4, capo=4 needs an 11-fret window to
// show one note at local fret 1 and a cluster at local frets 9-11, with 7
// entirely empty columns between them (confirmed via a real screenshot).
//
// HISTORY (this went through a few iterations): first fix was rendering
// TWO separate <svg> elements side by side (a narrow capo box + a
// cluster box). Real feedback on that: it looked like a detached
// sub-widget, caused floating "X" markers, inconsistent scaling between
// the two independent svguitar instances, and label collisions. This
// version renders exactly ONE <svg>/grid -- the cluster window only, with
// off-cluster strings OMITTED from svguitar's own fingers array entirely
// (confirmed via direct testing that an omitted string still draws its
// own string LINE but gets no auto X-mark from svguitar -- so the grid
// still reads as a real 6-string fretboard, just with blank rows for
// off-cluster strings) so FretboardDiagram.jsx can draw its own X/O
// markers and the capo bar in a hand-extended left margin, fully
// controlling spacing so nothing ever collides.
// ---------------------------------------------------------------------------

// BUGFIX (8th follow-up): this used to trigger only off the gap between
// the capo and its NEAREST individually-fretted note (`WIDE_GAP_THRESHOLD`,
// 5) -- real, confirmed-inconsistent bug, not a hypothetical. Real
// example that exposed it: Emaj9's Capo-4 row `frets="X-7-9-11-4-4"` has
// its nearest cluster note only 2 frets above the capo (gap=2, well under
// the old threshold, so it rendered as one plain continuous window) --
// but the CLUSTER ITSELF spans local frets 4 through 8, so that "plain"
// window still had to stretch to 8 frets wide, looking exactly as
// zoomed-out/unrealistic as the cases the gap check WAS catching (real
// screenshot comparison: this row and Emaj9's Capo-7 row
// `frets="X-7-13-13-12-14"`, also gap<=5 but a 6-8 local-fret span, both
// rendered as an oversized plain window sitting right next to OTHER
// Capo rows on the very same chord that correctly got the attached
// treatment). The gap-only check assumed a cluster is always compact
// once you're past the nearest note -- true for most rows, but false
// often enough (measured directly against the real db, not guessed: of
// 1596 real Capo-type rows, spans of 7+ frets are 42% of all rows, not
// the ~9% the old gap-based measurement implied) that leaving it
// unfixed meant near-identical-looking voicings on the same chord
// rendered by two visibly different rules with no way to predict which.
// Fixed by triggering off the SAME "how wide would a plain window need
// to be" number voicingToChord itself already computes
// (computeHighestLocalFret, shared above so the two can't drift again),
// not the gap to the nearest note. MAX_SPAN_BEFORE_ATTACH=6 (attach when
// the plain window would need to exceed 6 frets) was picked directly
// against the real per-chord test case that prompted this fix: Emaj9's
// span-7 Capo-7 row and span-9 Capo-4 row both needed to newly attach
// (confirmed correct after this fix), while its span-5/span-6 Capo rows
// -- already rendering compactly and correctly -- needed to stay
// unattached, and did.
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
  return computeHighestLocalFret(voicing) > MAX_SPAN_BEFORE_ATTACH
}

// Builds the ONE Chord config for the cluster window, plus a list of
// every off-cluster string FretboardDiagram.jsx needs to draw itself (as
// an X or square marker in the hand-extended left margin, next to the
// capo bar). A string is off-cluster for one of two reasons: it's
// genuinely muted (never played in this voicing at all -- kind: 'muted',
// drawn as X), or it's capo-sounded (sounds because the capo bars it, no
// individual finger needed -- kind: 'capo', drawn as a solid colored
// SQUARE -- matching the SAME square convention the normal/small-gap
// path already uses for capo-sounded notes inside its own grid, per real
// feedback that the two capo treatments should look consistent with each
// other rather than each inventing its own visual language).
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

    // Capo-type rows never have a literal open string in real data
    // (confirmed via a direct query, zero exceptions -- see CLAUDE.md),
    // but handled defensively rather than assumed: treated the same as
    // a genuine mute for this purpose (neither the cluster nor the capo
    // bar is where an actual open string would belong).
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

  // Barres -- same fromString/toString logic as voicingToChord's (see its
  // own comment above for why max/min, not data-index order), recomputed
  // relative to the cluster's own new position and only kept if they
  // actually fall within the cluster's window. Checked against real data
  // first: every real wide-gap voicing's barre sits exactly AT the capo's
  // own fret (dropped here since it's outside the cluster window by
  // construction, same effective outcome as the single-window renderer's
  // explicit capo-coincidence suppression), so in practice this ends up
  // empty, but implemented for real rather than left silently broken if a
  // genuine cluster barre ever appears in future data.
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
