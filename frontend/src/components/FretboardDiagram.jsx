import { useEffect, useRef, useState } from 'react'
import { BarreChordStyle, Orientation, SVGuitarChord } from 'svguitar'
import { useFretboardPrefs } from '../context/FretboardPrefsContext'
import { needsCapoAttachment, voicingToChord, voicingToClusterChord } from '../lib/fretParser'
import './FretboardDiagram.css'

// Aspect ratio every card renders at -- a fixed constant, not read
// per-voicing. "meet" letterboxing (never a distorting stretch) keeps
// every card the same height regardless of how wide a given voicing's
// window needs to be -- see fretParser.js's MIN_FRET_WINDOW/
// WIDE_GAP_THRESHOLD comments for the fuller history of the wide-window
// problem this constant is one half of the fix for.
const DIAGRAM_ASPECT_RATIO = '417.2 / 400'

// Shared svguitar config -- factored into its own function so it can't
// drift between call sites. `frets` is the one thing that varies per
// call; `extra` merges in per-call overrides (used to pass `noPosition:
// true` -- see drawCapoBar's own label for why svguitar's built-in
// position label is always suppressed wherever a capo bar is drawn).
function buildSvguitarConfig(frets, extra = {}) {
  return {
    orientation: Orientation.horizontal,
    frets,
    // No title -- the chord name/base fret/capo detail is already
    // shown elsewhere (the compact card's capo chip, or the expand
    // modal's plain-text detail block) -- a second copy inside the
    // SVG just reserved dead vertical space.
    // Match the app's rustic brown / brass device theme instead of
    // svguitar's black-on-transparent default.
    color: '#f2ead9', // strings/frets/nut base color (parchment)
    backgroundColor: '#2d2419', // brown-800, same "recessed well" surface as inputs
    fingerColor: '#c89b5c', // brass -- fallback only; real per-finger fills come from
                             // fretParser.js's interval-colored FingerOptions (Phase 3
                             // Part 5/6), this just covers the no-interval-data edge case.
    fingerTextColor: '#1c1712', // brown-950 fallback, same reasoning as fingerColor above
    strokeColor: '#f2ead9',
    fretLabelColor: '#8faf9b', // moss
    fretMarkerColor: 'rgba(242, 234, 217, 0.25)',
    // Dot typography (Phase 3 Part 5/6 follow-up): match the app's
    // "device readout" mono font instead of svguitar's Arial default,
    // so the note-name label reads as an intentional instrument
    // label rather than a plain unstyled number. Read live via
    // getComputedStyle (same approach as intervalColors.js) rather
    // than hardcoding the font stack a second time. fingerSize bumped
    // up from svguitar's 0.65 default and fingerTextSize down from
    // 24 specifically so 2-character note names ("F#", "Bb") fit
    // comfortably without shrinking the text to illegibility.
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace',
    fingerSize: 0.78,
    fingerTextSize: 19,
    // Open-note sizing: svguitar sizes open-string "O" rings via a
    // COMPLETELY SEPARATE setting (emptyStringIndicatorSize, default 0.6)
    // from fretted dots' fingerSize (0.78 above) -- both multiply the
    // same stringSpacing() base unit (confirmed in source), so this
    // keeps them the same rendered diameter.
    emptyStringIndicatorSize: 0.78,
    // Barre styling: RECTANGLE's fill color is hardcoded to solid
    // black inside svguitar itself (confirmed in source -- it ignores
    // fingerColor/any config for the fill), so a themed barre requires
    // the ARC style instead, which does respect a themeable color and
    // renders with rounded ends by construction. Its thickness
    // (arcBarHeight = fingerSize / 1.5) is already proportional to
    // the finger dot size. Per-barre fill color (translucent brass)
    // is set in fretParser.js.
    barreChordStyle: BarreChordStyle.ARC,
    barreChordStrokeColor: '#c89b5c',
    ...extra,
  }
}

function svgText(x, y, content, { anchor = 'middle', fill, fontSize = 19, weight = 500 } = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  el.setAttribute('x', x)
  el.setAttribute('y', y)
  el.setAttribute('text-anchor', anchor)
  el.setAttribute('fill', fill)
  el.setAttribute('font-family', getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace')
  el.setAttribute('font-size', fontSize)
  el.setAttribute('font-weight', weight)
  el.textContent = content
  return el
}

// Draws one svguitar chord into `container`, returns its <svg> element.
function drawChart(container, { fingers, barres, position, frets }, configExtra) {
  container.innerHTML = ''
  new SVGuitarChord(container)
    .configure(buildSvguitarConfig(frets, configExtra))
    .chord({ fingers, barres, position })
    .draw()
  return container.querySelector('svg')
}

// Simple capo bar -- used by the NORMAL (small-gap) rendering path only,
// where the capo's own fret is already the grid's first column. Draws a
// rounded rect spanning that column's full width and the full string
// height, moss-themed, with the fret-number label placed BELOW the bar
// (not svguitar's own built-in label -- that one is suppressed via
// `noPosition: true` at the call site, since its own label-padding math
// is built for a plain finger dot and doesn't account for this bar,
// which sat close enough to visibly collide with it in real testing).
function drawSimpleCapoBar(svg, labelText) {
  if (!svg) return
  const allLines = Array.from(svg.querySelectorAll('line'))
  const fretLines = allLines
    .filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
    .sort((a, b) => parseFloat(a.getAttribute('x1')) - parseFloat(b.getAttribute('x1')))
  const stringLines = allLines.filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
  if (fretLines.length < 2 || stringLines.length === 0) return

  const leftX = parseFloat(fretLines[0].getAttribute('x1'))
  const rightX = parseFloat(fretLines[1].getAttribute('x1'))
  const stringYs = stringLines.map((l) => parseFloat(l.getAttribute('y1')))
  const topY = Math.min(...stringYs)
  const bottomY = Math.max(...stringYs)
  const overhang = 10
  const barTop = topY - overhang
  const barBottom = bottomY + overhang

  const capoBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  capoBar.setAttribute('x', leftX)
  capoBar.setAttribute('y', barTop)
  capoBar.setAttribute('width', rightX - leftX)
  capoBar.setAttribute('height', barBottom - barTop)
  capoBar.setAttribute('rx', 10)
  capoBar.setAttribute('fill', 'rgba(143, 175, 155, 0.32)')
  capoBar.setAttribute('stroke', '#8faf9b')
  capoBar.setAttribute('stroke-width', '2.5')
  const bgRect = svg.firstElementChild
  svg.insertBefore(capoBar, bgRect ? bgRect.nextSibling : svg.firstChild)

  if (labelText) {
    svg.appendChild(svgText((leftX + rightX) / 2, barBottom + 22, labelText, { fill: '#8faf9b', weight: 600 }))
  }
}

// Wide-gap capo attachment -- the ONE-grid replacement for the old
// two-<svg> split renderer (see fretParser.js's needsCapoAttachment/
// voicingToClusterChord for the fuller history). `svg` is the cluster
// window's own chart, already drawn with off-cluster strings omitted
// (so their string LINE shows but no marker) and `noPosition: true`
// (svguitar's own label suppressed). This function:
//   1. Extends the SVG's viewBox to the LEFT to make room.
//   2. Draws the capo bar attached directly to the grid's own left edge
//      (BEFORE the markers below, so capo-sounded squares paint on top
//      of it rather than underneath -- see step 3's comment).
//   3. Draws each off-cluster string's marker: X for genuinely muted
//      (in the reserved margin left of the bar), or a solid colored
//      SQUARE for capo-sounded (centered INSIDE the bar itself --
//      matching the same square-inside-the-bar convention the normal/
//      small-gap path already uses, 8th follow-up).
//   4. Draws real ABSOLUTE fret numbers under each column (replacing
//      svguitar's single "Nfr" label), highlighting the first (base
//      fret) column in the accent color.
function drawCapoAttachment(svg, { offClusterStrings, capoFret, clusterMinAbs, clusterWindow }) {
  if (!svg) return
  const allLines = Array.from(svg.querySelectorAll('line'))
  const fretLines = allLines
    .filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
    .sort((a, b) => parseFloat(a.getAttribute('x1')) - parseFloat(b.getAttribute('x1')))
  const stringLines = allLines
    .filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
    .sort((a, b) => parseFloat(a.getAttribute('y1')) - parseFloat(b.getAttribute('y1')))
  if (fretLines.length < 2 || stringLines.length === 0) return

  const gridLeftX = parseFloat(fretLines[0].getAttribute('x1'))
  const stringYs = stringLines.map((l) => parseFloat(l.getAttribute('y1')))
  const topY = Math.min(...stringYs)
  const bottomY = Math.max(...stringYs)
  const overhang = 10

  // Reserved regions, left to right: [X/O markers][gap][capo bar], all
  // ending flush at the grid's own left edge -- this is what makes the
  // capo bar read as "attached directly to the grid," per the explicit
  // requirement, rather than floating separately from it.
  const markerAreaWidth = 46
  const barToMarkerGap = 14
  const capoBarWidth = 66
  const extension = markerAreaWidth + barToMarkerGap + capoBarWidth
  const viewBoxPadding = 6

  const capoBarRightX = gridLeftX
  const capoBarLeftX = capoBarRightX - capoBarWidth
  const capoBarCenterX = (capoBarLeftX + capoBarRightX) / 2
  const markerAreaRightX = capoBarLeftX - barToMarkerGap
  const markerCenterX = markerAreaRightX - markerAreaWidth / 2

  // 1. Extend the viewBox leftward. The original content's coordinates
  // are untouched -- only the viewBox's own min-x/width change, so
  // everything drawn below at negative-ish x lands in genuinely new
  // canvas space, not overlapping the grid.
  const oldViewBox = (svg.getAttribute('viewBox') || '0 0 0 400').split(' ').map(Number)
  const [, oldMinY, oldWidth, oldHeight] = oldViewBox
  const newMinX = gridLeftX - extension - viewBoxPadding
  svg.setAttribute('viewBox', `${newMinX} ${oldMinY} ${oldWidth - newMinX} ${oldHeight}`)

  // 2. Capo bar -- attached directly to the grid's own left edge (no gap
  // between the bar and fret column 1), spanning the full string height.
  // Drawn BEFORE the off-cluster markers below (real bugfix, 8th
  // follow-up -- see step 3's comment for why the paint order matters).
  const barTop = topY - overhang
  const barBottom = bottomY + overhang
  const capoBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  capoBar.setAttribute('x', capoBarLeftX)
  capoBar.setAttribute('y', barTop)
  capoBar.setAttribute('width', capoBarWidth)
  capoBar.setAttribute('height', barBottom - barTop)
  capoBar.setAttribute('rx', 10)
  capoBar.setAttribute('fill', 'rgba(143, 175, 155, 0.32)')
  capoBar.setAttribute('stroke', '#8faf9b')
  capoBar.setAttribute('stroke-width', '2.5')
  svg.appendChild(capoBar)
  svg.appendChild(
    svgText((capoBarLeftX + capoBarRightX) / 2, barBottom + 22, `Capo ${capoFret}`, { fill: '#8faf9b', fontSize: 15, weight: 600 })
  )

  // 3. Off-cluster string markers (X / square), positioned by the SAME
  // string-number-to-row mapping svguitar itself uses internally for
  // finger dots.
  //
  // BUGFIX (7th follow-up): this used `arrayIndex = Math.abs(stringNumber
  // - 6)`, based on reading svguitar's `toArrayIndex()` helper (used
  // elsewhere for barre endpoints) and assuming it also governed finger-
  // row position. Confirmed wrong via direct measurement on a real
  // voicing (chord E, frets="12-X-14-13-12-4"): real finger dots showed
  // string6(low E) at y=320 (the LARGEST/bottom-most Y) and string2 at
  // y=128, which only matches `arrayIndex = stringNumber - 1` indexed
  // into Y-positions sorted ascending -- the OLD formula put string5
  // (genuinely muted) at y=128, exactly the SAME row as string2's real
  // "B" note, i.e. the X mark visually landed on top of/next to an
  // unrelated fretted note's row -- confirmed as the real cause of the
  // reported "X on the B string that's also shown fretted" symptom
  // (they're different strings that happened to render on the same row
  // due to this bug, not one string genuinely double-marked).
  //
  // POSITION + PAINT ORDER (8th follow-up): capo-sounded squares moved
  // from the shared "marker area" (used for genuinely-muted X's) to
  // `capoBarCenterX` -- INSIDE the bar's own column, matching the real
  // feedback that the normal/small-gap path already draws its capo
  // squares inside the bar, not off to the side in a separate margin.
  // Since these markers are hand-drawn (not part of svguitar's own
  // fingers array, unlike the normal path), the capo bar itself has to
  // be appended to the SVG *before* this loop runs (moved up to step 2
  // above) so the squares paint ON TOP of the bar rather than getting
  // hidden underneath it -- confirmed via a real screenshot that squares
  // were invisible (painted-over) before this reorder. Genuinely-muted
  // X's are unaffected by this -- they still draw in the separate
  // margin area to the left of the bar, since "muted" has no bar to sit
  // inside of.
  const dotSize = 37 // matches the real rendered fretted-dot diameter (fingerSize 0.78 * stringSpacing), measured directly
  offClusterStrings.forEach(({ stringNumber, kind, text, style }) => {
    const arrayIndex = stringNumber - 1
    const y = stringYs[arrayIndex]
    if (kind === 'muted') {
      const half = dotSize * 0.28
      for (const flip of [1, -1]) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', markerCenterX - half)
        line.setAttribute('y1', y - half * flip)
        line.setAttribute('x2', markerCenterX + half)
        line.setAttribute('y2', y + half * flip)
        line.setAttribute('stroke', '#f2ead9')
        line.setAttribute('stroke-width', '2.5')
        line.setAttribute('stroke-linecap', 'round')
        svg.appendChild(line)
      }
    } else {
      // Capo-sounded -- a solid SQUARE, same fill/border/text pairing as
      // a normal fretted dot (color: style.fill, textColor: style.text --
      // the SOLID-fill-paired text color, not the hollow-ring `openText`
      // one, since this is a filled shape now, not a ring) -- centered
      // on the bar itself, not the separate marker margin.
      const square = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      square.setAttribute('x', capoBarCenterX - dotSize / 2)
      square.setAttribute('y', y - dotSize / 2)
      square.setAttribute('width', dotSize)
      square.setAttribute('height', dotSize)
      square.setAttribute('fill', style?.fill || '#c89b5c')
      square.setAttribute('stroke', style?.stroke || '#8faf9b')
      square.setAttribute('stroke-width', '3')
      svg.appendChild(square)
      if (text) {
        svg.appendChild(
          svgText(capoBarCenterX, y, text, { fill: style?.text || '#1c1712', fontSize: 15, anchor: 'middle' })
        )
        // svgText's y is the SVG text baseline, not a true vertical
        // center -- nudge down slightly so the label reads centered
        // inside the square rather than sitting high, matching how
        // svguitar's own finger-dot text is vertically centered.
        svg.lastChild.setAttribute('y', y + 5)
      }
    }
  })

  // 4. Real absolute fret numbers, one per column, along the bottom of
  // the grid -- replaces svguitar's own single "Nfr" label (already
  // suppressed via noPosition: true at the call site). The base fret
  // (this window's first column) is highlighted in the brass accent so
  // it reads as the anchor point; the rest use the app's muted body-text
  // color.
  for (let col = 0; col < clusterWindow; col++) {
    const colLeftX = parseFloat(fretLines[col].getAttribute('x1'))
    const colRightX = parseFloat(fretLines[col + 1].getAttribute('x1'))
    const isBase = col === 0
    svg.appendChild(
      svgText(
        (colLeftX + colRightX) / 2,
        bottomY + overhang + 24,
        String(clusterMinAbs + col),
        { fill: isBase ? '#c89b5c' : '#a99c87', fontSize: isBase ? 18 : 15, weight: isBase ? 700 : 500 }
      )
    )
  }
}

// svguitar is a vanilla-JS/SVG library (not a React component), so it's
// mounted imperatively into a ref'd div. Chosen over @tombatossals/react-chords
// (last published 2022, effectively unmaintained) -- svguitar is actively
// maintained (59 published versions, most recent release within a day of
// this build) and its Chord format (fingers/barres/position) maps directly
// onto our voicing rows, no reshaping beyond string-order/local-fret math.
//
// Orientation is fixed to horizontal (Phase 3 Part 2 follow-up) -- vertical
// is retired, not kept as a togglable option. svguitar supports this
// natively via ChordSettings.orientation (confirmed in the prior spike),
// no workaround needed.
// `onExpand`, when passed, makes the whole diagram panel a clickable/
// keyboard-activatable trigger (Phase 3 Part 5/6's click-to-expand) --
// omit it (as the expand modal's own larger render does, see VoicingModal)
// to get a plain, non-interactive diagram, avoiding a modal-inside-modal
// trigger. `formula` (the /voicings/{chord} response's `formula` field,
// 4th follow-up) is optional -- passed through to voicingToChord so a
// sus chord's characteristic tone can be colored with the third bucket
// instead of falling through to the generic ext bucket; omitting it just
// means every voicing renders as if it weren't a sus chord (safe default,
// matches pre-4th-follow-up behavior).
//
// Wide-gap capo attachment: when a Capo-type voicing's individually-
// fretted notes sit far above the capo itself, `needsCapoAttachment()`
// (fretParser.js) is true and this renders ONE grid -- the cluster
// window only, with the capo attached as a bar in a hand-extended left
// margin (see drawCapoAttachment above) -- instead of one continuous
// window stretched wide enough to include the capo's own fret too. This
// replaced an earlier TWO-<svg> design after real feedback that it read
// as a detached sub-widget with inconsistent scaling and label collisions.
//
// `expanded` (8th follow-up, only ever passed by VoicingModal's own
// larger render of this component): per real feedback, the compact
// card's space-saving attachment view is a good fit for a small grid
// cell, but once someone has already clicked through to the dedicated
// expand modal there's room to just show the REAL voicing -- one plain,
// continuous window from the capo through the highest fretted note, the
// same rendering the attachment view was built to avoid on the compact
// card specifically because of its width. So `expanded` unconditionally
// takes the plain `voicingToChord`/`drawSimpleCapoBar` path, skipping
// `needsCapoAttachment` entirely, regardless of how wide that plain
// window ends up being. Pairs with a dynamic container aspect ratio
// (below) so a wide voicing's modal card doesn't reserve a fixed-height
// block of empty space beneath a letterboxed diagram -- safe to do only
// here, not on the compact card: the 5th follow-up's aspect-ratio revert
// was specifically about the compact card's shared CSS-grid row heights
// (a wide card would squash its own row), and the modal isn't part of
// that grid at all, so there's no row to squash.
function FretboardDiagram({ voicing, formula, onExpand, expanded = false }) {
  const containerRef = useRef(null)
  const { leftHanded } = useFretboardPrefs()
  const [dynamicRatio, setDynamicRatio] = useState(null)

  useEffect(() => {
    if (!containerRef.current || !voicing) return

    if (!expanded && needsCapoAttachment(voicing)) {
      const { fingers, barres, position, frets, offClusterStrings } = voicingToClusterChord(voicing, { leftHanded, formula })
      const svg = drawChart(containerRef.current, { fingers, barres, position, frets }, { noPosition: true })
      drawCapoAttachment(svg, { offClusterStrings, capoFret: voicing.capo, clusterMinAbs: position, clusterWindow: frets })
    } else {
      const chordData = voicingToChord(voicing, { leftHanded, formula })
      // Gate: voicing.type === 'Capo', NOT voicing.capo > 0 alone (real
      // bug, root-caused against the actual db rather than re-guessed) --
      // the `capo` column is NOT exclusive to Capo-type rows (e.g.
      // Fmaj7#11's Must Know row has capo=5 as a "commonly played with a
      // capo" annotation, unrelated to section membership). `type ===
      // 'Capo'` is the authoritative field -- confirmed via a direct
      // query that zero real Capo-type rows ever have capo=0.
      const hasCapoBar = voicing.type === 'Capo' && voicing.capo > 0
      const svg = drawChart(containerRef.current, chordData, hasCapoBar ? { noPosition: true } : undefined)
      if (hasCapoBar) {
        drawSimpleCapoBar(svg, `${voicing.capo}fr`)
      }
      if (expanded && svg) {
        const viewBox = svg.getAttribute('viewBox')
        if (viewBox) {
          const [, , w, h] = viewBox.split(' ').map(Number)
          if (w > 0 && h > 0) setDynamicRatio(`${w} / ${h}`)
        }
      }
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [voicing, leftHanded, formula, expanded])

  if (!voicing) return null

  const interactiveProps = onExpand
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Expand ${voicing.type} voicing at fret ${voicing.base_fret} for more detail`,
        onClick: onExpand,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onExpand()
          }
        },
      }
    : {}

  return (
    <div
      className={`panel panel--recessed fretboard-diagram${onExpand ? ' fretboard-diagram--interactive' : ''}`}
      style={{ padding: 12 }}
      {...interactiveProps}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', aspectRatio: expanded && dynamicRatio ? dynamicRatio : DIAGRAM_ASPECT_RATIO }}
      />
    </div>
  )
}

export default FretboardDiagram
