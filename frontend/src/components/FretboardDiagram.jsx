import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BarreChordStyle, Orientation, SVGuitarChord } from 'svguitar'
import { useAccessibilityPrefs } from '../context/AccessibilityPrefsContext'
import { useFretboardPrefs } from '../context/FretboardPrefsContext'
import { needsCapoAttachment, voicingToChord, voicingToClusterChord } from '../lib/fretParser'
import './FretboardDiagram.css'

// Compact-card (Results grid) aspect ratio, vertical orientation. Also
// the MODAL's pre-measurement fallback, before its own dynamic
// per-voicing ratio (see the `expanded` block below) is measured on
// first render. A FIXED constant for the compact card, not per-voicing:
// cards sit in a CSS grid (`.voicing-list`, two `minmax(0,1fr)`
// columns) whose default `align-items: stretch` would let one tall
// card stretch its row-mate, and grid items are reused across voicings
// at the same list index (no per-item `key`), which makes per-voicing
// dynamic-ratio state hard to keep in sync. "meet" letterboxing absorbs
// any voicing whose fret-window needs more height than this ratio
// reserves -- it renders smaller/centered, not distorted. Value
// measured from a real baseline (5-fret, no-capo) voicing's viewBox.
const DIAGRAM_ASPECT_RATIO_VERTICAL = '400 / 434.55'

// The single reference every hand-drawn label in this file sizes itself
// against, so they can't drift apart. Same value as svguitar's own
// interval-dot note-name text (`fingerTextSize` below) -- the hand-drawn
// labels (capo bar "Nfr"/"Capo N", off-nut position labels) are the
// same "device readout" text, so they match the dot label size.
const INTERVAL_DOT_LABEL_SIZE = 19

// `drawPositionLabel`'s "Nfr" text reads slightly larger than the dot
// labels via this multiplier on INTERVAL_DOT_LABEL_SIZE, so it can grow
// without also pulling dot size up (a dot has to fit inside a ~37-unit
// circle alongside a note letter; this label doesn't). One named
// constant so a further nudge is a one-line change.
const FRET_LABEL_SIZE_MULTIPLIER = 1.2

// The modal's non-diagram overhead varies per voicing (a Capo-type
// voicing's footer carries one more line than a non-Capo one; the
// "Notes:" line can wrap for a long note list), so a fixed height-cap
// constant can't be tight enough for a deep Capo voicing AND loose
// enough for a typical one. Instead the layout-measurement effect below
// measures the real overhead this voicing leaves, live, each time the
// modal opens -- the same "measure post-layout, setState, let the real
// value take over" pattern this file uses for `dynamicRatio`.

// Shared svguitar config -- factored into its own function so it can't
// drift between call sites. `frets` is the one thing that varies per
// call; `extra` merges in per-call overrides (used to pass `noPosition:
// true` -- svguitar's built-in position label is suppressed wherever a
// capo bar is drawn, see drawSimpleCapoBar). Orientation is hardcoded
// vertical -- the compact card and the expand modal both render vertical
// (see the component's own comment).
function buildSvguitarConfig(frets, extra = {}) {
  return {
    orientation: Orientation.vertical,
    frets,
    // No title -- the chord name/base fret/capo detail is already
    // shown elsewhere (the compact card's capo chip, or the expand
    // modal's plain-text detail block) -- a second copy inside the
    // SVG just reserved dead vertical space.
    // Match the app's rustic brown / brass device theme instead of
    // svguitar's black-on-transparent default.
    color: '#f2ead9', // parchment -- base fallback for anything not covered below
    // Read live via getComputedStyle (same pattern as fontFamily below)
    // rather than a hardcoded hex, so it can't drift from --brown-800.
    // Matters for cards whose content aspect ratio doesn't match the
    // fixed box (e.g. a barre-arc voicing): "meet" letterboxing then
    // shows a sliver of the SVG's own filled rect around the letterbox
    // margin, which must match the container's --brown-800 background.
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--brown-800').trim() || '#33241a',
    fingerColor: '#c89b5c', // brass -- fallback only; real per-finger fills come from
                             // fretParser.js's interval-colored FingerOptions (Phase 3
                             // Part 5/6), this just covers the no-interval-data edge case.
    fingerTextColor: '#1c1712', // brown-950 fallback, same reasoning as fingerColor above
    strokeColor: '#f2ead9',
    fretLabelColor: '#8faf9b', // moss
    fretMarkerColor: 'rgba(242, 234, 217, 0.25)',
    // Regular fret-divider and string lines are a thin, dim `1px
    // #7d5b37`, distinct from the nut. `fretColor` (svguitar's config
    // key, falls back to `color`) governs the nut line AND every regular
    // fret/string line together, so this sets the default for all of
    // them; the true nut is patched brighter after draw() (patchNutLine
    // below), since svguitar has no separate "nut color" config, only a
    // separate nut WIDTH one.
    fretColor: '#7d5b37',
    strokeWidth: 1,
    // Nut width 2px (svguitar's default 10 is tuned for its own scale).
    // Only takes effect when this voicing's base_fret is truly 1 --
    // svguitar's native `position > 1 ? strokeWidth : nutWidth` check.
    nutWidth: 2,
    // Dot typography: the app's "device readout" mono font instead of
    // svguitar's Arial default, read live via getComputedStyle (same as
    // intervalColors.js). fingerSize is bumped from svguitar's 0.65
    // default and fingerTextSize down from 24 so 2-character note names
    // ("F#", "Bb") fit without shrinking the text to illegibility.
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace',
    fingerSize: 0.78,
    fingerTextSize: INTERVAL_DOT_LABEL_SIZE,
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

// The nut renders bold parchment (#f2ead9), every other fret/string line
// thin and dim (via buildSvguitarConfig's fretColor). svguitar has no
// separate "nut color" config -- fretColor governs the nut AND every
// regular line together -- only a separate nut WIDTH (nutWidth 2 vs
// strokeWidth 1), so the nut is found post-render by that width, the
// same "query the real rendered lines" pattern used for capo bars. A
// voicing whose base_fret isn't truly 1 has no line at nutWidth
// (svguitar's own `position > 1 ? strokeWidth : nutWidth`), so this is a
// no-op there. Vertical-only: fret/nut lines render as horizontal lines
// (y1 === y2) under vertical orientation.
function patchNutLine(svg) {
  if (!svg) return
  const nutLine = Array.from(svg.querySelectorAll('line')).find(
    (line) => line.getAttribute('y1') === line.getAttribute('y2') && parseFloat(line.getAttribute('stroke-width')) === 2,
  )
  if (nutLine) nutLine.setAttribute('stroke', '#f2ead9')
}

// Draws one svguitar chord into `container`, returns its <svg> element.
function drawChart(container, { fingers, barres, position, frets }, configExtra) {
  container.innerHTML = ''
  new SVGuitarChord(container)
    .configure(buildSvguitarConfig(frets, configExtra))
    .chord({ fingers, barres, position })
    .draw()
  const svg = container.querySelector('svg')
  patchNutLine(svg)
  return svg
}

// Finds the rendered fret-boundary lines (sorted top-to-bottom) and
// string lines (in DOM order -- callers sort if needed) for a just-drawn
// <svg>. Vertical-only (fret lines are y1 === y2, string lines x1 ===
// x2). Shared by drawSimpleCapoBar and drawCapoAttachment so the lookup
// can't drift between them.
function getGridLines(svg) {
  const allLines = Array.from(svg.querySelectorAll('line'))
  const fretLines = allLines
    .filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
    .sort((a, b) => parseFloat(a.getAttribute('y1')) - parseFloat(b.getAttribute('y1')))
  const stringLines = allLines.filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
  return { fretLines, stringLines }
}

// Simple capo bar -- used by the NORMAL (small-gap) rendering path,
// where the capo's fret is already the grid's first column. Draws a
// moss-themed rounded rect spanning that fret ROW (full string width,
// one row tall). The fret-number label sits to the bar's RIGHT (in the
// empty margin svguitar's default sidePadding reserves) rather than
// below it, where it would land inside the next fret row's content.
// svguitar's own built-in label is suppressed (`noPosition: true` at
// the call site) -- its label-padding math is built for a plain finger
// dot and collides with this bar.
function drawSimpleCapoBar(svg, labelText) {
  if (!svg) return
  const { fretLines, stringLines } = getGridLines(svg)
  if (fretLines.length < 2 || stringLines.length === 0) return

  const overhang = 10
  const topY = parseFloat(fretLines[0].getAttribute('y1'))
  const bottomY = parseFloat(fretLines[1].getAttribute('y1'))
  const stringXs = stringLines.map((l) => parseFloat(l.getAttribute('x1')))
  const leftX = Math.min(...stringXs) - overhang
  const rightX = Math.max(...stringXs) + overhang

  const capoBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  capoBar.setAttribute('x', leftX)
  capoBar.setAttribute('y', topY)
  capoBar.setAttribute('width', rightX - leftX)
  capoBar.setAttribute('height', bottomY - topY)
  capoBar.setAttribute('rx', 10)
  capoBar.setAttribute('fill', 'rgba(143, 175, 155, 0.32)')
  capoBar.setAttribute('stroke', '#8faf9b')
  capoBar.setAttribute('stroke-width', '2.5')

  const bgRect = svg.firstElementChild
  svg.insertBefore(capoBar, bgRect ? bgRect.nextSibling : svg.firstChild)

  if (labelText) {
    svg.appendChild(
      svgText(rightX + 14, (topY + bottomY) / 2, labelText, { fill: '#8faf9b', weight: 600, anchor: 'start' })
    )
  }
}

// Replaces svguitar's native off-nut position label ("3fr", "8fr", ...)
// for non-Capo cards. svguitar's vertical-mode label only auto-shrinks
// its font to fit the SVG width -- it has no awareness of a finger dot
// where it wants to draw, so on a card whose top row has a note near the
// right edge the label overlaps that dot. Suppressed
// (`noPosition: true`) and hand-drawn instead, the same approach used
// for the capo bar's own labels: moss color, weight 600, placed to the
// right of row 1 and vertically centered, never competing with a dot.
// FRET_LABEL_SIZE_MULTIPLIER makes it read slightly larger than the dot
// labels (see that constant). Absolute SVG-viewBox units, so it scales
// with the container whether that's a grid cell or the modal.
function drawPositionLabel(svg, position) {
  if (!svg || position <= 1) return
  const { fretLines, stringLines } = getGridLines(svg)
  if (fretLines.length < 1 || stringLines.length === 0) return

  const overhang = 10
  const rowTopY = parseFloat(fretLines[0].getAttribute('y1'))
  // Row 1's bottom boundary. A >=1-fret window always has fretLines[1]
  // (MIN_FRET_WINDOW is 5); the +72 fallback only matters if fretLines
  // is ever unexpectedly short.
  const rowBottomY = fretLines.length > 1 ? parseFloat(fretLines[1].getAttribute('y1')) : rowTopY + 72
  const rightX = Math.max(...stringLines.map((l) => parseFloat(l.getAttribute('x1')))) + overhang

  svg.appendChild(
    svgText(rightX + 14, (rowTopY + rowBottomY) / 2, `${position}fr`, {
      fill: '#8faf9b',
      fontSize: INTERVAL_DOT_LABEL_SIZE * FRET_LABEL_SIZE_MULTIPLIER,
      weight: 700,
      anchor: 'start',
    })
  )
}

// Wide-gap capo attachment -- one grid for a Capo-type voicing whose
// fretted cluster sits far above the capo. `svg` is the cluster window's
// chart, already drawn with off-cluster strings omitted (their string
// LINE shows but no marker) and `noPosition: true`.
//
// This function:
//   1. Extends the SVG's viewBox UPWARD to make room (frets stack
//      top-to-bottom in vertical orientation, so "before the cluster"
//      is "above it," not "to its left").
//   2. Draws the capo bar attached directly to the grid's own top edge
//      (BEFORE the markers below, so capo-sounded squares paint on top
//      of it rather than underneath -- see step 3's comment).
//   3. Draws each off-cluster string's marker: X for genuinely muted
//      (in the reserved margin above the bar), or a solid colored
//      SQUARE for capo-sounded (centered INSIDE the bar itself --
//      the same square-inside-the-bar convention the small-gap path
//      uses).
//   4. Draws real ABSOLUTE fret numbers to the RIGHT of each row
//      (replacing svguitar's single "Nfr" label, and matching
//      drawSimpleCapoBar's own vertical-mode "label to the right, not
//      below/into the next row's content" convention -- see that
//      function's comment for why), highlighting the first (base fret)
//      row in the accent color.
function drawCapoAttachment(svg, { offClusterStrings, capoFret, clusterMinAbs, clusterWindow }) {
  if (!svg) return
  const { fretLines, stringLines } = getGridLines(svg)
  if (fretLines.length < 2 || stringLines.length === 0) return

  const gridTopY = parseFloat(fretLines[0].getAttribute('y1'))
  const stringXs = stringLines.map((l) => parseFloat(l.getAttribute('x1'))).sort((a, b) => a - b)
  const leftX = Math.min(...stringXs)
  const rightX = Math.max(...stringXs)
  const overhang = 10

  // Reserved regions, top to bottom: [X/O markers][gap][capo bar], all
  // ending flush at the grid's own top edge -- this is what makes the
  // capo bar read as "attached directly to the grid," per the explicit
  // requirement, rather than floating separately from it.
  const markerAreaHeight = 46
  const barToMarkerGap = 14
  const capoBarHeight = 66
  const extension = markerAreaHeight + barToMarkerGap + capoBarHeight
  const viewBoxPadding = 6

  const capoBarBottomY = gridTopY
  const capoBarTopY = capoBarBottomY - capoBarHeight
  const capoBarCenterY = (capoBarTopY + capoBarBottomY) / 2
  const markerAreaBottomY = capoBarTopY - barToMarkerGap
  const markerCenterY = markerAreaBottomY - markerAreaHeight / 2

  // 1. Extend the viewBox upward. The original content's coordinates
  // are untouched -- only the viewBox's own min-y/height change, so
  // everything drawn below at negative-ish y lands in genuinely new
  // canvas space, not overlapping the grid.
  const oldViewBox = (svg.getAttribute('viewBox') || '0 0 400 0').split(' ').map(Number)
  const [oldMinX, , oldWidth, oldHeight] = oldViewBox
  const newMinY = gridTopY - extension - viewBoxPadding
  svg.setAttribute('viewBox', `${oldMinX} ${newMinY} ${oldWidth} ${oldHeight - newMinY}`)

  // 2. Capo bar -- attached directly to the grid's top edge (no gap
  // before fret row 1), spanning the full string width. Drawn BEFORE the
  // off-cluster markers below so capo-sounded squares paint on top of it
  // (see step 3).
  const barLeft = leftX - overhang
  const barRight = rightX + overhang
  const capoBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  capoBar.setAttribute('x', barLeft)
  capoBar.setAttribute('y', capoBarTopY)
  capoBar.setAttribute('width', barRight - barLeft)
  capoBar.setAttribute('height', capoBarHeight)
  capoBar.setAttribute('rx', 10)
  capoBar.setAttribute('fill', 'rgba(143, 175, 155, 0.32)')
  capoBar.setAttribute('stroke', '#8faf9b')
  capoBar.setAttribute('stroke-width', '2.5')
  svg.appendChild(capoBar)
  svg.appendChild(
    svgText(barRight + 14, capoBarCenterY, `Capo ${capoFret}`, { fill: '#8faf9b', fontSize: 15, weight: 600, anchor: 'start' })
  )

  // 3. Off-cluster string markers (X / square), positioned to match the
  // rendered string X-positions. Under vertical orientation svguitar's
  // own string-to-column mapping is `arrayIndex = 6 - stringNumber`
  // (its internal `toArrayIndex(s) = |s - 6|`), unreflected -- unlike
  // horizontal, whose coordinate swap-and-reflect cancels out to
  // `stringNumber - 1`.
  //
  // Position + paint order: capo-sounded squares sit at `capoBarCenterY`,
  // inside the bar's own row (the same convention as the small-gap
  // path). Since these markers are hand-drawn (not part of svguitar's
  // fingers array), the capo bar must be appended before this loop (step
  // 2) so the squares paint on top of it. Genuinely-muted X's draw in
  // the margin above the bar instead -- "muted" has no bar to sit in.
  const dotSize = 37 // matches the rendered fretted-dot diameter (fingerSize 0.78 * stringSpacing)
  offClusterStrings.forEach(({ stringNumber, kind, text, style }) => {
    const arrayIndex = 6 - stringNumber
    const x = stringXs[arrayIndex]
    if (kind === 'muted') {
      const half = dotSize * 0.28
      for (const flip of [1, -1]) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', x - half * flip)
        line.setAttribute('y1', markerCenterY - half)
        line.setAttribute('x2', x + half * flip)
        line.setAttribute('y2', markerCenterY + half)
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
      square.setAttribute('x', x - dotSize / 2)
      square.setAttribute('y', capoBarCenterY - dotSize / 2)
      square.setAttribute('width', dotSize)
      square.setAttribute('height', dotSize)
      square.setAttribute('fill', style?.fill || '#c89b5c')
      square.setAttribute('stroke', style?.stroke || '#8faf9b')
      square.setAttribute('stroke-width', '3')
      svg.appendChild(square)
      if (text) {
        svg.appendChild(
          svgText(x, capoBarCenterY, text, { fill: style?.text || '#1c1712', fontSize: 15, anchor: 'middle' })
        )
        // svgText's y is the SVG text baseline, not a true vertical
        // center -- nudge down slightly so the label reads centered
        // inside the square rather than sitting high, matching how
        // svguitar's own finger-dot text is vertically centered.
        svg.lastChild.setAttribute('y', capoBarCenterY + 5)
      }
    }
  })

  // 4. Real absolute fret numbers, one per row, to the RIGHT of the
  // grid -- replaces svguitar's own single "Nfr" label (already
  // suppressed via noPosition: true at the call site). The base fret
  // (this window's first row) is highlighted in the brass accent so it
  // reads as the anchor point; the rest use the app's muted body-text
  // color.
  const labelX = barRight + 14
  for (let row = 0; row < clusterWindow; row++) {
    const rowTopY = parseFloat(fretLines[row].getAttribute('y1'))
    const rowBottomY = parseFloat(fretLines[row + 1].getAttribute('y1'))
    const isBase = row === 0
    svg.appendChild(
      svgText(
        labelX,
        (rowTopY + rowBottomY) / 2,
        String(clusterMinAbs + row),
        { fill: isBase ? '#c89b5c' : '#a99c87', fontSize: isBase ? 18 : 15, weight: isBase ? 700 : 500, anchor: 'start' }
      )
    )
  }
}

// svguitar is a vanilla-JS/SVG library (not a React component), mounted
// imperatively into a ref'd div. Its Chord format (fingers/barres/
// position) maps directly onto our voicing rows, with only string-order/
// local-fret math in between.
//
// Orientation is VERTICAL everywhere (nut at top, frets descending) --
// both the compact Results-grid card and the expand modal. The
// hand-drawn overlays this file adds (patchNutLine, getGridLines, the
// capo bar/attachment, the off-nut position label) all assume vertical
// coordinates: a fret line is y1 === y2, a string line is x1 === x2.
//
// `onExpand`, when passed, makes the whole diagram panel a clickable/
// keyboard-activatable trigger -- omit it (as VoicingModal's own larger
// render does) for a plain, non-interactive diagram, avoiding a
// modal-inside-modal trigger. `formula` (the /voicings/{chord} response's
// `formula` field) is optional -- passed to voicingToChord so a sus
// chord's characteristic tone gets the third bucket rather than the
// generic ext bucket; omitting it renders every voicing as if not sus.
//
// Wide-gap capo attachment: when a Capo-type voicing's fretted cluster
// sits far above the capo, `needsCapoAttachment()` (fretParser.js) is
// true and this renders ONE grid -- the cluster window only, with the
// capo hand-drawn as an attached bar in an extended margin (see
// drawCapoAttachment) -- rather than one continuous window stretched to
// include the capo's own fret with a large empty middle.
//
// `expanded` (passed only by VoicingModal) uses the same
// `needsCapoAttachment` path as the compact card; the modal is not in a
// CSS grid, so its attachment-view diagram gets its own dynamic aspect
// ratio (applyDynamicRatio below) rather than the fixed
// DIAGRAM_ASPECT_RATIO_VERTICAL.
function FretboardDiagram({ voicing, formula, onExpand, expanded = false }) {
  const containerRef = useRef(null)
  const { leftHanded } = useFretboardPrefs()
  // svguitar draws imperatively, baking presentation colors into the SVG
  // at draw time -- so this diagram doesn't pick up a colorblind-palette
  // toggle from a CSS custom property change alone. `colorblindMode` is
  // in the draw effect's dependency array so a toggle forces a redraw
  // with fresh colors (intervalColors.js's per-bucket cache is cleared by
  // AccessibilityPrefsContext.jsx on toggle, so the redraw reads current
  // values).
  const { colorblindMode } = useAccessibilityPrefs()
  const [dynamicRatio, setDynamicRatio] = useState(null)
  // MODAL-only live-measured height cap in px, null when this voicing
  // doesn't need one (the common case) -- set by the layout-measurement
  // effect below. Always null for the compact card.
  const [cappedHeight, setCappedHeight] = useState(null)

  useEffect(() => {
    if (!containerRef.current || !voicing) return

    // Reset before every fresh draw so this voicing starts from its own
    // uncapped natural height rather than inheriting a cap computed for
    // whatever was open before. Paired with the useLayoutEffect below
    // (synchronous, before paint), so the reset is never visible as a
    // flash.
    setCappedHeight(null)

    // Both draw branches call this so the modal gets an aspect ratio from
    // the diagram's own post-draw viewBox (including the attachment
    // branch's viewBox-extended proportions), rather than falling back to
    // the compact card's fixed DIAGRAM_ASPECT_RATIO_VERTICAL.
    function applyDynamicRatio(svg) {
      if (!expanded || !svg) return
      const viewBox = svg.getAttribute('viewBox')
      if (!viewBox) return
      const [, , w, h] = viewBox.split(' ').map(Number)
      if (w > 0 && h > 0) setDynamicRatio(`${w} / ${h}`)
    }

    if (needsCapoAttachment(voicing)) {
      const { fingers, barres, position, frets, offClusterStrings } = voicingToClusterChord(voicing, { leftHanded, formula })
      const svg = drawChart(containerRef.current, { fingers, barres, position, frets }, { noPosition: true })
      drawCapoAttachment(svg, { offClusterStrings, capoFret: voicing.capo, clusterMinAbs: position, clusterWindow: frets })
      applyDynamicRatio(svg)
    } else {
      const chordData = voicingToChord(voicing, { leftHanded, formula })
      // Gate on voicing.type === 'Capo', not voicing.capo > 0 -- the
      // `capo` column also carries "commonly played with a capo"
      // annotations on non-Capo rows (e.g. Fmaj7#11's Must Know row has
      // capo=5). No real Capo-type row has capo=0.
      const hasCapoBar = voicing.type === 'Capo' && voicing.capo > 0
      // Suppress svguitar's native position label when drawPositionLabel
      // will hand-draw a replacement: no capo bar (that already
      // suppresses + replaces it) and position > 1.
      const suppressNativeLabel = !hasCapoBar && chordData.position > 1
      const svg = drawChart(
        containerRef.current,
        chordData,
        hasCapoBar || suppressNativeLabel ? { noPosition: true } : undefined
      )
      if (hasCapoBar) {
        drawSimpleCapoBar(svg, `${voicing.capo}fr`)
      } else if (suppressNativeLabel) {
        drawPositionLabel(svg, chordData.position)
      }
      applyDynamicRatio(svg)
    }

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [voicing, leftHanded, formula, expanded, colorblindMode])

  // Live per-voicing height budget for the MODAL only. A fixed estimate
  // can't work (see the note above buildSvguitarConfig).
  //
  // This effect depends only on `[expanded]` -- it sets up once when the
  // modal opens and tears down once when it closes, so there's only ever
  // ONE `recheck`/`lastDiagramHeight` closure per modal-open session, not
  // a new one per redraw. `recheck()` reacts to the DOM directly (a
  // `ResizeObserver` on both `modalEl` and `containerRef.current`,
  // catching any redraw/reflow from any cause -- a prop change, a webfont
  // swap) rather than to React's render scheduling.
  //
  // Wide (row) layout: `.voicing-modal__row` (VoicingModal.css) uses
  // `align-items: stretch`, and `.voicing-modal__diagram-box` is `flex: 1`
  // inside the stretched diagram column -- so once the Chord Tones column
  // is the row's taller sibling, the diagram box keeps filling the
  // stretched row's height regardless of how small the SVG inside it is
  // capped, and the modal never gets shorter past that point. That floor
  // can't be modeled from outside the flex chain (the Chord Tones column
  // is also `flex: 1`, so reading its height gives the same stretched
  // number), so the correction is empirical: apply a cap, then on the
  // next `recheck()` check whether the modal actually got shorter -- if a
  // correction didn't help, further shrinking won't either, so stop and
  // let the outer `.capture-modal`'s `overflow-y: auto` handle the rest.
  //
  // Narrow (<760px) layout: `.voicing-modal__row` switches to
  // `flex-direction: column`, so diagram-col and tones-col stack and the
  // modal's overflow comes from stacked content below the diagram, not a
  // stretched sibling -- shrinking the diagram doesn't help. This whole
  // mechanism is skipped there (checked via `window.matchMedia` at the
  // same 760px breakpoint VoicingModal.css uses), clearing any stale cap
  // and leaving overflow to the outer modal's own scroll.
  //
  // MIN_DIAGRAM_HEIGHT floors the cap above 0 -- when a shrunk viewport
  // makes `overflow` exceed `currentHeight` on the first correction, the
  // diagram would otherwise clamp to fully invisible.
  //
  // Floor detection is keyed on the DIAGRAM's own height, not raw
  // `modalEl.scrollHeight` -- successive scrollHeight also grows on
  // unrelated content settling (e.g. `dynamicRatio` reaching its real
  // size), which the diagram's own height doesn't, so "the diagram
  // shrank but overflow didn't improve" is a clean, non-conflatable
  // stop signal.
  useLayoutEffect(() => {
    if (!expanded || !containerRef.current) return
    const modalEl = containerRef.current.closest('.capture-modal')
    if (!modalEl) return

    // Re-evaluated inside recheck() on every call, not once at setup:
    // real browser zoom (which shrinks window.innerWidth/innerHeight) can
    // cross the 760px breakpoint while the modal stays open, and the
    // mechanism must not keep running under wide-layout assumptions once
    // the layout has switched to column.
    const narrowQuery = window.matchMedia('(max-width: 760px)')

    let lastDiagramHeight = null
    let lastOverflow = null

    // Below this the diagram is a blank box rather than a usable
    // (letterboxed) chart, so stop shrinking and let the outer modal
    // scroll instead.
    const MIN_DIAGRAM_HEIGHT = 180

    function recheck() {
      if (!containerRef.current) return

      if (narrowQuery.matches) {
        // Narrow/column layout: clear any cap and let the outer modal's
        // overflow-y: auto handle it.
        lastDiagramHeight = null
        lastOverflow = null
        setCappedHeight(null)
        return
      }

      const overflow = modalEl.scrollHeight - modalEl.clientHeight
      if (overflow <= 0) {
        lastDiagramHeight = null
        lastOverflow = null
        return
      }

      const currentHeight = containerRef.current.getBoundingClientRect().height

      if (
        lastDiagramHeight != null &&
        currentHeight < lastDiagramHeight - 1 &&
        lastOverflow != null &&
        overflow >= lastOverflow - 1
      ) {
        // The diagram really did shrink since the last check (confirming
        // our previous correction actually rendered), but the modal's
        // real overflow didn't meaningfully improve along with it --
        // further shrinking won't help either. Stop.
        return
      }

      lastDiagramHeight = currentHeight
      lastOverflow = overflow

      const margin = 8
      setCappedHeight(Math.max(MIN_DIAGRAM_HEIGHT, currentHeight - overflow - margin))
    }

    // Synchronous first pass -- catches this voicing's own draw growing
    // into its settled size before first paint.
    recheck()

    // `narrowQuery`'s `change` event is watched directly, not just via
    // the ResizeObserver -- browser zoom can flip the breakpoint without
    // a size change on `modalEl` at the same tick.
    const observer = new ResizeObserver(recheck)
    observer.observe(modalEl)
    observer.observe(containerRef.current)
    narrowQuery.addEventListener('change', recheck)
    return () => {
      observer.disconnect()
      narrowQuery.removeEventListener('change', recheck)
    }
  }, [expanded])

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
        style={{
          width: '100%',
          aspectRatio: expanded
            ? dynamicRatio || DIAGRAM_ASPECT_RATIO_VERTICAL
            : DIAGRAM_ASPECT_RATIO_VERTICAL,
          // Modal-only height cap, live-measured per voicing (see the
          // useLayoutEffect above); null when the voicing doesn't
          // overflow. When a cap clamps height below what the aspect
          // ratio wants, the box goes wider than the content's ratio and
          // the SVG's `width:100%;height:100%` + `preserveAspectRatio=
          // "xMidYMid meet"` letterboxes it (empty side margin, scaled
          // down, never distorted) -- the same "meet, never stretch" rule
          // as everywhere else here, now on the height axis too.
          maxHeight: expanded && cappedHeight != null ? `${cappedHeight}px` : undefined,
        }}
      />
    </div>
  )
}

export default FretboardDiagram
