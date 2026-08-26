import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BarreChordStyle, Orientation, SVGuitarChord } from 'svguitar'
import { useFretboardPrefs } from '../context/FretboardPrefsContext'
import { needsCapoAttachment, voicingToChord, voicingToClusterChord } from '../lib/fretParser'
import './FretboardDiagram.css'

// Compact-card (Results grid) aspect ratio, vertical orientation --
// Phase 5 Part 7. Also reused as the MODAL's pre-measurement fallback
// (before its own dynamic per-voicing ratio -- see the `expanded && svg`
// block below -- is measured on first render), since vertical is now the
// only orientation either context ever renders (follow-up 5: horizontal
// fully retired app-wide, no toggle, no fallback anywhere -- see that
// entry). A FIXED constant for the compact card specifically, not a
// per-voicing dynamic one -- a genuinely per-voicing dynamic ratio on
// cards sitting inside a CSS grid (`.voicing-list`, `grid-template-
// columns: minmax(0,1fr) minmax(0,1fr)`) risks a "one wide/tall card
// squashes or stretches its row-mate" bug (Phase 3 Part 2, 5th
// follow-up -- CSS grid's default `align-items: stretch` would force
// every item in a row to the row's own tallest member's height, and
// grid item reuse across different voicings at the same list index --
// no per-item `key`, only the wrapping `<Fragment key={i}>` in
// Results.jsx -- makes dynamic-ratio state genuinely riskier to keep in
// sync across re-renders too). "meet" letterboxing absorbs any voicing
// whose fret-window needs more height than this fixed ratio reserves --
// it renders smaller/centered within the fixed box, not distorted.
// Value measured directly against a real baseline (5-fret, no-capo)
// voicing's actual rendered viewBox, not derived on paper.
const DIAGRAM_ASPECT_RATIO_VERTICAL = '400 / 434.55'

// Phase 5 Part 7, follow-up 6: the single reference every hand-drawn
// label in this file sizes itself against, instead of each guessing its
// own number. This is the exact same value svguitar's own interval-dot
// note-name text renders at (`fingerTextSize` below) -- read here as one
// named constant and reused both places so the two can't drift apart
// again. Real review of the previous follow-up's own 18px bump (up from
// 15px) found it still read small/inconsistent next to the interval
// dots at both compact-card and modal scale; matching the dot label
// size outright reads as intentional -- these hand-drawn labels
// (capo bar "Nfr"/"Capo N", off-nut position labels) are the same kind
// of "device readout" text as the dot labels, so there's no real reason
// for them to be a different size.
const INTERVAL_DOT_LABEL_SIZE = 19

// Phase 5 Part 7, follow-up 7: `drawPositionLabel`'s own "Nfr" text
// (the off-nut fret-position label) matched INTERVAL_DOT_LABEL_SIZE
// exactly 1:1 as of the previous follow-up -- real screenshot review
// this round found it still reads a bit small next to the dots it sits
// beside. Rather than pick a fourth standalone number, this stays
// anchored to the same reference (INTERVAL_DOT_LABEL_SIZE) but applies
// an explicit multiplier on top, so the fret label can read slightly
// larger WITHOUT also pulling dot size up with it (the two have
// different jobs -- the dots need to stay small enough to fit inside a
// ~37-unit circle alongside a note letter; this label has no such
// constraint). One named constant, not a hardcoded 22.8 buried in
// `drawPositionLabel` itself, so a further nudge later is a one-line
// change, not a re-derivation.
const FRET_LABEL_SIZE_MULTIPLIER = 1.2

// Phase 5 Part 7, follow-up 7: REPLACES the old fixed MAX_DIAGRAM_HEIGHT
// constant (`calc(90vh - 350px)`) entirely -- a real, confirmed design
// flaw in that approach, not just a wrong number: a single fixed
// overhead estimate can't correctly serve both ends of the real range.
// The modal's non-diagram overhead genuinely VARIES per voicing (a
// Capo-type voicing's footer carries one more real line -- "Capo: N" --
// than a non-Capo voicing's does; the "Notes:" line's own height can
// vary too, e.g. wrapping to a 2nd line for a long note list) -- tuning
// the constant tight enough for the worst real case (a deep Capo
// voicing) left it looser than necessary for a typical voicing (real,
// visible unused space below the diagram, confirmed via screenshot),
// while a looser constant tuned for typical voicings let a deep Capo
// voicing overflow again. No single constant can be simultaneously
// tight and loose enough -- the fix is to stop guessing a budget and
// measure the REAL one this specific voicing actually leaves, live,
// each time the modal opens. See the component's own layout-measurement
// effect below for the mechanism (a real two-pass measure-then-clamp,
// the same "measure post-layout, setState, let the real value take
// over" pattern this file already uses for `dynamicRatio` -- not a new
// architecture, just applied to a second, height-specific value).

// Shared svguitar config -- factored into its own function so it can't
// drift between call sites. `frets` is the one thing that varies per
// call; `extra` merges in per-call overrides (used to pass `noPosition:
// true` -- see drawCapoBar's own label for why svguitar's built-in
// position label is always suppressed wherever a capo bar is drawn).
// Orientation is hardcoded vertical (Phase 5 Part 7, follow-up 5) -- the
// compact Results card and the expand modal both render vertical now,
// horizontal fully retired app-wide (see the component's own comment
// for the full history and the removed toggle discussion).
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
    // Phase 5 Part 7, follow-up 3: real, confirmed bug -- this was a
    // hardcoded '#2d2419' literal, the pre-6th-follow-up value of
    // --brown-800 (index.css). A later color-audit round corrected the
    // real token to #33241a, but this one hardcoded copy was never
    // updated, so it silently drifted out of sync. Invisible on a card
    // whose real content viewBox exactly matches the fixed
    // DIAGRAM_ASPECT_RATIO_VERTICAL box (no letterbox margin, nothing to
    // contrast against) -- visible on any card whose content doesn't
    // (e.g. the barre-arc voicing that surfaced this: its arc extends
    // above the grid, changing its real content aspect ratio enough that
    // "meet" letterboxing shows a sliver of the CONTAINER's own
    // background -- the correctly-current --brown-800 via
    // .panel--recessed -- around the SVG's own internally-filled rect,
    // still painted in the stale value). Read live via getComputedStyle,
    // matching this same function's own established pattern for
    // fontFamily below, so it can't drift out of sync again.
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--brown-800').trim() || '#33241a',
    fingerColor: '#c89b5c', // brass -- fallback only; real per-finger fills come from
                             // fretParser.js's interval-colored FingerOptions (Phase 3
                             // Part 5/6), this just covers the no-interval-data edge case.
    fingerTextColor: '#1c1712', // brown-950 fallback, same reasoning as fingerColor above
    strokeColor: '#f2ead9',
    fretLabelColor: '#8faf9b', // moss
    fretMarkerColor: 'rgba(242, 234, 217, 0.25)',
    // 24th follow-up: real mockup value -- regular fret-divider and
    // string lines are a thin, dim `1px #7d5b37`, distinctly different
    // from the nut (see below), not the uniform bold parchment this app
    // drew everywhere before. `fretColor` (svguitar's own config key,
    // falls back to `color`) governs BOTH the top-fret/nut line AND
    // every regular fret/string line internally -- setting it here makes
    // #7d5b37 the default for all of them; the true nut is then patched
    // brighter after draw() (see patchNutLine below), since svguitar has
    // no separate "nut color" config, only a separate nut WIDTH one.
    fretColor: '#7d5b37',
    strokeWidth: 1,
    // Real mockup nut width is 2px -- svguitar's own default (10) is
    // tuned for its own default visual scale, not this app's. Only
    // takes effect when this voicing's own base_fret is truly 1 --
    // svguitar's native `position > 1 ? strokeWidth : nutWidth` check
    // (already confirmed correct/deliberate for non-nut positions, see
    // Phase 3 Part 5/6's "Cm11" entry -- not touched by this fix).
    nutWidth: 2,
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

// 24th follow-up: real mockup nut/grid hierarchy -- the nut renders
// bold parchment (#f2ead9), every other fret/string line renders thin
// and dim (#7d5b37, set via buildSvguitarConfig's fretColor above).
// svguitar has no separate "nut color" config (fretColor governs the
// nut line AND every regular fret/string line together -- confirmed by
// reading its own source, drawTopFret/drawFrets both resolve color from
// the same settings.fretColor), only a separate nut WIDTH one
// (nutWidth, set to 2 above, vs strokeWidth 1 for everything else) --
// so the nut is found post-render by that width, the same "query the
// real rendered lines" pattern this file already uses for capo bars
// (drawSimpleCapoBar/drawCapoAttachment). A voicing whose own base_fret
// isn't truly 1 has NO line at nutWidth (svguitar's own
// `position > 1 ? strokeWidth : nutWidth` -- confirmed correct,
// deliberate behavior, not touched here), so this is a genuine no-op
// there, not a forced bold line on every card's own window edge.
//
// Phase 5 Part 7, follow-up 5: was orientation-dependent (which raw
// <line> attribute pair identifies "a fret line" flips between
// orientations -- confirmed by reading svguitar's own coordinates()/x()/
// y() swap in svguitar.js) back when the modal still rendered
// horizontal. Now hardcoded to the vertical case only -- under vertical
// orientation there's no coordinate swap, so fret/nut lines render as
// actual HORIZONTAL lines (y1 === y2) -- horizontal's own branch (fret/
// nut lines as x1 === x2 vertical lines) is dead now that both contexts
// render vertical, and was removed rather than left unreachable.
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

// Finds the real rendered fret-boundary lines (sorted top-to-bottom) and
// string lines (sorted implicitly by DOM order -- callers that need them
// sorted do it themselves) for a just-drawn <svg>. Vertical-only now
// (Phase 5 Part 7, follow-up 5 -- see patchNutLine's own comment for why
// the horizontal branch was removed rather than kept unreachable).
// Shared by drawSimpleCapoBar and drawCapoAttachment so the lookup can't
// duplicate/drift between them.
function getGridLines(svg) {
  const allLines = Array.from(svg.querySelectorAll('line'))
  const fretLines = allLines
    .filter((line) => line.getAttribute('y1') === line.getAttribute('y2'))
    .sort((a, b) => parseFloat(a.getAttribute('y1')) - parseFloat(b.getAttribute('y1')))
  const stringLines = allLines.filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
  return { fretLines, stringLines }
}

// Simple capo bar -- used by the NORMAL (small-gap) rendering path only,
// where the capo's own fret is already the grid's first column. Draws a
// rounded rect spanning that column's full width and the full string
// height, moss-themed, with the fret-number label placed BELOW the bar
// (not svguitar's own built-in label -- that one is suppressed via
// `noPosition: true` at the call site, since its own label-padding math
// is built for a plain finger dot and doesn't account for this bar,
// which sat close enough to visibly collide with it in real testing).
// Phase 5 Part 7, follow-up 5: was orientation-branching (horizontal --
// the modal's own original bar-spans-a-column/label-below layout --
// vs. vertical -- the compact card's bar-spans-a-row/label-to-the-right
// layout). Horizontal's branch removed now that the modal renders
// vertical too (see the component's own comment for the full retirement
// history) -- only the vertical geometry remains: the bar spans a fret
// ROW (full string width, one row tall) and the label sits to its RIGHT
// rather than below it, since "below" would sit inside the very next
// fret row's own content (the exact label/content collision this app
// already hit and fixed once for the horizontal capo bar, back when
// that orientation still existed -- see the "Capo bar vs. barre arc
// visual conflict" and "12fr floating over string lines" entries in
// CLAUDE.md). The right margin is genuinely empty space reserved by
// svguitar's own default sidePadding.
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

// Phase 5 Part 7, follow-up 4 (originally compact-card only), extended
// in follow-up 5 to the modal too: replaces svguitar's own NATIVE off-nut
// position label ("3fr", "8fr", ...) for non-Capo cards. Real, confirmed
// bug in the native label, not invented: svguitar's own vertical-mode
// `drawPosition` only auto-shrinks its font to fit the SVG's overall
// width -- it has no idea a finger dot sits right where it wants to
// draw, so on a card whose top row has a note near the right edge (e.g.
// chord C's real "3fr"/"8fr" Must Know rows), the label's default 38px
// (or a barely-shrunk ~30.78px) text visibly overlaps that dot.
// Follow-up 4 found the identical overlap in the modal (then still
// horizontal) but left it unfixed since the modal was out of scope that
// round; follow-up 5 (the modal's own move to vertical) is what brought
// it in scope -- fixed here for both contexts at once now that they
// share one orientation, via the same "suppress svguitar's native
// label, hand-draw a small one with real clearance" approach this file
// already uses for the capo bar's own "Nfr"/"Capo N" labels
// (drawSimpleCapoBar/drawCapoAttachment): same weight (600), same moss
// color, same "to the right of row 1, vertically centered, never
// competing with a dot" placement, so a nut-anchored card (no label at
// all) and an off-nut card (this label) read as one consistent family.
// Font size history: the previous follow-up matched this label to
// `INTERVAL_DOT_LABEL_SIZE` (19px) outright, stopping a run of guessed
// numbers (15px, then 18px) by anchoring to an already-tuned reference.
// This follow-up (the 7th) found that exact 1:1 match still read a
// touch small in real screenshots next to the dots -- fixed by applying
// `FRET_LABEL_SIZE_MULTIPLIER` on top of the same reference (see that
// constant's own comment for why a multiplier, not a fifth standalone
// number). An absolute SVG-viewBox-unit value either way, so it scales
// identically with the container regardless of whether that's a small
// grid cell or the much larger modal.
function drawPositionLabel(svg, position) {
  if (!svg || position <= 1) return
  const { fretLines, stringLines } = getGridLines(svg)
  if (fretLines.length < 1 || stringLines.length === 0) return

  const overhang = 10
  const rowTopY = parseFloat(fretLines[0].getAttribute('y1'))
  // Row 1's own bottom boundary, when it exists (a >=1-fret window
  // always has at least fretLines[1] -- MIN_FRET_WINDOW is 5 -- but
  // defended anyway rather than assumed). Falls back to the fret
  // spacing implied by the SVG's own real strokeWidth-2 nut line, which
  // doesn't apply here (no nut on an off-nut card) -- so this fallback
  // only matters if fretLines is ever unexpectedly short, not a normal
  // real-data path.
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

// Wide-gap capo attachment -- the ONE-grid replacement for the old
// two-<svg> split renderer (see fretParser.js's needsCapoAttachment/
// voicingToClusterChord for the fuller history). `svg` is the cluster
// window's own chart, already drawn with off-cluster strings omitted
// (so their string LINE shows but no marker) and `noPosition: true`
// (svguitar's own label suppressed).
//
// This function is called exclusively from the `!expanded &&
// needsCapoAttachment(voicing)` branch below -- the modal (`expanded`)
// always takes the plain, non-attached path regardless of span (see
// that branch's own long-standing comment: the modal has room to just
// show the real, continuous voicing via its own dynamic aspect ratio,
// so it never needs the compact card's space-saving attachment view).
// This is STILL true now that both contexts render vertical (Phase 5
// Part 7, follow-up 5) -- the `!expanded` gate was never actually about
// orientation, only about which container can afford a wide/tall plain
// window, so it didn't need to change when the modal did. Confirmed via
// direct testing this round: a real wide-gap Capo voicing opened in the
// modal still renders as one plain, continuous vertical window (grown
// tall via the modal's own dynamic ratio), not the attachment view.
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
//      matching the same square-inside-the-bar convention the normal/
//      small-gap path already uses, 8th follow-up).
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

  // 2. Capo bar -- attached directly to the grid's own top edge (no gap
  // between the bar and fret row 1), spanning the full string width.
  // Drawn BEFORE the off-cluster markers below (real bugfix carried over
  // from the horizontal version's 8th follow-up -- see step 3's comment
  // for why the paint order matters).
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
  // real rendered string X-positions -- and here is where "don't assume
  // it just works rotated" bit for real: the horizontal version's own
  // 7th-follow-up formula (`arrayIndex = stringNumber - 1`) does NOT
  // carry over to vertical, confirmed by directly cross-referencing real
  // rendered <circle> centers against their known note names on the
  // wide-gap E voicing (12-X-14-13-12-4) -- the cluster fingers svguitar
  // draws natively landed at arrayIndex = 6 - stringNumber (equivalently
  // svguitar's own internal `toArrayIndex(s) = |s - 6|`), NOT
  // stringNumber - 1. The horizontal formula was only ever correct
  // because horizontal orientation's own coordinate swap-and-reflect
  // (`y(x,y) = Math.abs(x - constants.width)`, see svguitar.js) happens
  // to cancel back out to a simple linear mapping; vertical orientation
  // has no such swap (coordinates() is the identity), so svguitar's own
  // internal toArrayIndex formula applies directly, unreflected. A first
  // version of this function shipped with the horizontal formula carried
  // over unchanged and looked visually plausible in a screenshot (the
  // capo-sounded square landed on SOME string, just the wrong one) --
  // caught only by cross-checking exact rendered X-coordinates against
  // known note labels, not by eyeballing the render.
  //
  // POSITION + PAINT ORDER: capo-sounded squares sit at `capoBarCenterY`
  // -- INSIDE the bar's own row, matching the normal/small-gap path's
  // own "square inside the bar" convention. Since these markers are
  // hand-drawn (not part of svguitar's own fingers array), the capo bar
  // itself has to be appended to the SVG *before* this loop runs (step 2
  // above) so the squares paint ON TOP of the bar rather than getting
  // hidden underneath it. Genuinely-muted X's are unaffected -- they
  // still draw in the separate margin area above the bar, since "muted"
  // has no bar to sit inside of.
  const dotSize = 37 // matches the real rendered fretted-dot diameter (fingerSize 0.78 * stringSpacing), measured directly
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

// svguitar is a vanilla-JS/SVG library (not a React component), so it's
// mounted imperatively into a ref'd div. Chosen over @tombatossals/react-chords
// (last published 2022, effectively unmaintained) -- svguitar is actively
// maintained (59 published versions, most recent release within a day of
// this build) and its Chord format (fingers/barres/position) maps directly
// onto our voicing rows, no reshaping beyond string-order/local-fret math.
//
// Orientation (Phase 5 Part 7): VERTICAL everywhere (nut at top, frets
// descending) -- both the compact Results-grid card and the expand
// modal. This superseded the original Phase 3 Part 2 "horizontal
// everywhere" decision in two steps, not one: follow-up round 1 moved
// the compact card to vertical while the modal stayed horizontal
// (`expanded ? horizontal : vertical`); follow-up round 5 (this one)
// retired horizontal entirely -- the modal now renders vertical too,
// with no toggle and no horizontal fallback anywhere in the app. Every
// hand-drawn overlay this file adds on top of svguitar's own rendering
// (the nut-line patch, `getGridLines`, the capo bar/attachment, the
// off-nut position label) used to branch on orientation for exactly
// this reason -- svguitar's own coordinate swap for horizontal vs.
// vertical changes which raw <line> attribute pair (x1===x2 vs.
// y1===y2) identifies "a fret line" vs. "a string line" -- those
// branches were removed rather than left dead once horizontal became
// unreachable; see each function's own comment for what was removed.
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
// cell -- and per Phase 5 Part 7's own follow-up 6, it's ALSO the right
// fit for the modal now, superseding the reasoning that used to live
// here (`expanded` unconditionally took the plain path -- kept as
// history in the paragraph below, not current behavior).
//
// **Follow-up 6 real finding**: the modal's own dynamic aspect ratio
// (below) does keep a wide-gap voicing from ever CLIPPING, but doesn't
// keep it from looking bad -- a real wide-gap voicing (E,
// `12-X-14-13-12-4`) opened in the modal, capped by follow-up 6's own
// height budget (a fixed constant at the time -- since replaced by
// follow-up 7's live measurement, same underlying cap concept), rendered
// as a REAL, CONFIRMED sparse,
// letterboxed-down diagram (most of the window empty between the
// capo-sounded note and the fretted cluster) -- exactly the "unrealistic
// proportions, huge empty middle" problem `drawCapoAttachment` was
// already built to solve for the compact card. Rather than build a
// second fix, this follow-up extends the SAME treatment to the modal --
// `needsCapoAttachment(voicing)` is no longer gated on `!expanded`.
// Verified this ISN'T a trivial flag flip before shipping it (per the
// task's own explicit warning): drawCapoAttachment's own geometry is
// expressed entirely in svguitar's fixed 400-unit-wide viewBox
// coordinate space, identical regardless of the CSS pixel size its
// container ends up rendered at, so the SHAPE was never actually at
// risk -- but the modal's `dynamicRatio` (state, only ever set by the
// plain/`voicingToChord` path before this round) needed to ALSO be set
// after `drawCapoAttachment` runs, or the modal would fall back to the
// compact card's own fixed `DIAGRAM_ASPECT_RATIO_VERTICAL` for an
// attachment-view diagram whose real (viewBox-extended) proportions
// don't match it -- confirmed via real testing this fix was in fact
// needed, not assumed.
//
// History, for context: `expanded` used to unconditionally skip
// `needsCapoAttachment`, reasoning that the modal has room to just show
// the plain, continuous voicing -- true as far as clipping goes, but
// this follow-up found "doesn't clip" isn't the same as "looks good,"
// and the compact card's own attachment view already solves the actual
// visual problem. The modal isn't part of any CSS grid (unaffected by
// the original 5th follow-up's row-squashing concern either way), so
// there was no remaining reason to keep the two paths different.
function FretboardDiagram({ voicing, formula, onExpand, expanded = false }) {
  const containerRef = useRef(null)
  const { leftHanded } = useFretboardPrefs()
  const [dynamicRatio, setDynamicRatio] = useState(null)
  // Phase 5 Part 7, follow-up 7: the MODAL's own live-measured height
  // cap in real px, null whenever this specific voicing doesn't need
  // one (the common case) -- see the layout-measurement effect below
  // for how this gets set. Always null for the compact card (that path
  // never touches this state).
  const [cappedHeight, setCappedHeight] = useState(null)

  useEffect(() => {
    if (!containerRef.current || !voicing) return

    // Reset before every fresh draw -- lets this voicing (or this
    // voicing redrawn for a handedness change) start from its own real,
    // uncapped natural height each time rather than inheriting a cap
    // computed for whatever was open before. Paired with useLayoutEffect
    // below (runs synchronously before paint), so this reset is never
    // actually visible as a flash -- by the time the browser paints, the
    // real cap (if any) for THIS voicing is already applied.
    setCappedHeight(null)

    // Orientation is always vertical now (Phase 5 Part 7, follow-up 5) --
    // see the file-level comment above for the two-step retirement
    // history. `expanded` no longer decides which capo treatment to use
    // either, as of follow-up 6 -- see needsCapoAttachment's own call
    // below and this function's own leading comment for why.

    // Real, needed fix (follow-up 6): the modal's own dynamicRatio state
    // used to only ever be set by the plain-window branch below (the
    // ONLY branch `expanded` could reach before this round). Now that
    // the attachment branch can run in the modal too, it needs to set
    // dynamicRatio from ITS OWN real (viewBox-extended) proportions just
    // the same, or the modal would silently fall back to the compact
    // card's fixed DIAGRAM_ASPECT_RATIO_VERTICAL for a diagram whose
    // real shape doesn't match it. One small shared helper so both
    // branches read the post-draw viewBox the same way.
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
      // Gate: voicing.type === 'Capo', NOT voicing.capo > 0 alone (real
      // bug, root-caused against the actual db rather than re-guessed) --
      // the `capo` column is NOT exclusive to Capo-type rows (e.g.
      // Fmaj7#11's Must Know row has capo=5 as a "commonly played with a
      // capo" annotation, unrelated to section membership). `type ===
      // 'Capo'` is the authoritative field -- confirmed via a direct
      // query that zero real Capo-type rows ever have capo=0.
      const hasCapoBar = voicing.type === 'Capo' && voicing.capo > 0
      // Off-nut label (Phase 5 Part 7, follow-up 4, extended to the
      // modal in follow-up 5): suppress svguitar's own native position
      // label whenever this card would otherwise show one AND
      // drawPositionLabel is actually going to hand-draw a real
      // replacement for it -- no capo bar (that already suppresses+
      // replaces it), position > 1. Now applies identically to the
      // compact card and the modal, both vertical.
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
  }, [voicing, leftHanded, formula, expanded])

  // Phase 5 Part 7, follow-up 9: live per-voicing height budget for the
  // MODAL only -- see the retired MAX_DIAGRAM_HEIGHT constant's own
  // comment (above) for why a fixed estimate couldn't work, and this
  // round's own CLAUDE.md entry for the two earlier, real, confirmed
  // bugs this replaces: follow-up 7 measured only once (missed a later
  // reflow, e.g. a webfont swap); follow-up 8 tried keeping the
  // measurement alive via a `ResizeObserver`, but scoped that
  // observer's whole LIFECYCLE to `[voicing, leftHanded, formula,
  // expanded, dynamicRatio]` -- matched to the DRAW effect's own deps on
  // the theory that "re-run whenever draw does" would keep the two in
  // sync. Confirmed directly this doesn't actually hold: `formula`
  // (passed down from Results.jsx's fetched voicings data) can change
  // reference MORE THAN ONCE while the same voicing's modal stays open
  // (a real StrictMode-dev double-fetch artifact in testing, but nothing
  // here should depend on that being dev-only) -- and each time it does,
  // the OLD observer instance's cleanup/re-setup can race against the
  // NEW draw pass in a way that leaves a STALE closure's `lastScrollHeight`
  // in play, incorrectly blocking a real, still-needed correction.
  // Matching two SEPARATE effects' dependency arrays is exactly this
  // fragile -- confirmed it can drift even once explicitly synced.
  //
  // Fixed by not depending on any of those values for the observer's
  // OWN lifecycle at all: this effect now depends only on `[expanded]`
  // -- it sets up ONCE when the modal opens and tears down ONCE when it
  // closes, for the FULL lifetime of one open-modal session, regardless
  // of how many times `voicing`/`formula`/`leftHanded`/`dynamicRatio`
  // change or how many times the draw effect redraws in between. There
  // is therefore only ever ONE `recheck`/`lastScrollHeight` closure per
  // modal-open session, not a new one per redraw -- eliminating the
  // whole class of bug where an old and a new instance can disagree
  // about what "last" means. `recheck()` reacts to the DOM directly (via
  // the `ResizeObserver` on both `modalEl` and `containerRef.current`,
  // catching a redraw's real, settled size change regardless of what
  // triggered it -- this component's own props changing, a webfont
  // swapping in, or anything else) rather than to React's own
  // render/effect scheduling, so it doesn't need to know about every
  // possible cause of a redraw to stay correct.
  //
  // Real, confirmed structural constraint this also has to respect
  // (found via direct measurement, not assumed, after an earlier version
  // of this fix that subtracted overflow from the diagram alone still
  // left a real case scrolling no matter how far the cap was pushed):
  // `.voicing-modal__row` (VoicingModal.css) uses `align-items: stretch`,
  // and `.voicing-modal__diagram-box` is `flex: 1` INSIDE the (also
  // stretched) diagram column -- so once the Chord Tones column becomes
  // the row's taller sibling, the diagram BOX keeps filling whatever
  // height the stretched row gives it regardless of how small the SVG
  // inside it has been capped; the extra space just becomes empty margin
  // around a smaller, letterboxed diagram, and the row (and therefore
  // the modal) never gets any shorter past that point. Modeling this
  // floor by directly measuring the Chord Tones column's own height
  // doesn't work either -- that column is ALSO `flex: 1` inside its own
  // stretched parent, so reading its height while the diagram is still
  // the taller sibling just reads back the SAME stretch-inflated number,
  // not its true unstretched minimum. Rather than keep trying to predict
  // this flex chain's behavior from outside it, the correction stays
  // empirical: apply a cap, then on the next `recheck()` compare the
  // modal's real `scrollHeight` against what it was before the last
  // correction -- if a correction didn't actually make the modal any
  // shorter, no amount of further shrinking will either, so this stops
  // rather than chasing the diagram toward zero for no benefit. This
  // works regardless of WHY a floor exists (this flex chain today, or
  // anything else in the future). Once stopped, the outer
  // `.capture-modal`'s own `overflow-y: auto` -- already an accepted,
  // established fallback for genuinely short viewports throughout this
  // file's history -- correctly takes over for whatever residual
  // overflow the diagram alone can't close.
  // REAL BUG FOUND AND FIXED (Phase 5 Part 7, Item 4 session): this whole
  // mechanism's own design (see the comment above -- "once the Chord
  // Tones column becomes the row's taller SIBLING") implicitly assumes
  // the wide, ROW-direction layout throughout -- diagram-col and
  // tones-col sitting SIDE BY SIDE, where shrinking the diagram is a
  // real, meaningful response to the row's own shared height. At the
  // <760px breakpoint (VoicingModal.css), `.voicing-modal__row` switches
  // to `flex-direction: column` -- diagram-col and tones-col now STACK
  // vertically instead, so the modal's real overflow there is very often
  // caused by the ChordTonePanel (or the footer text) taking its own
  // real space BELOW the diagram, not by the diagram itself. Confirmed
  // directly, not assumed: with the diagram already fully collapsed to
  // 0px height, the modal's own `scrollHeight` still exceeded
  // `clientHeight` by a real 157px -- proving the diagram was NEVER the
  // overflow source in this case, so this effect's own iterative
  // shrink-and-recheck loop had nothing to succeed at and kept shrinking
  // toward zero anyway (each cap iteration reduces total height by a
  // small, real amount from the diagram's own margin/padding
  // contribution, just never enough to clear the REAL, unrelated
  // overflow, so the "did this correction actually help" floor check
  // never triggered cleanly before bottoming out at 0 and getting stuck
  // there). Fixed by skipping this whole mechanism in the narrow/column
  // layout -- checked via `window.matchMedia`, the same 760px breakpoint
  // VoicingModal.css already uses, so this can never silently drift out
  // of sync with the CSS that actually decides row-vs-column -- and
  // relying on the outer `.capture-modal`'s own `overflow-y: auto`
  // instead, exactly the same already-established fallback this file's
  // own comment already names for "whatever residual overflow the
  // diagram alone can't close." The wide (row) layout's own behavior --
  // including the empirical floor-detection logic -- is completely
  // unchanged; this only adds a narrower condition for when the
  // mechanism engages at all.
  useLayoutEffect(() => {
    if (!expanded || !containerRef.current) return
    if (window.matchMedia('(max-width: 760px)').matches) return
    const modalEl = containerRef.current.closest('.capture-modal')
    if (!modalEl) return

    // Floor detection, keyed on the DIAGRAM's own height, not raw
    // `scrollHeight` -- a real, confirmed bug in an earlier version of
    // this same fix: comparing successive `modalEl.scrollHeight` values
    // to decide "did the last correction help" also fires on completely
    // unrelated GROWTH (e.g. `dynamicRatio` settling into its real,
    // bigger size once the draw effect actually runs -- itself preceded
    // by that same effect's own unconditional `setCappedHeight(null)`
    // reset, since this effect's initial synchronous pass runs BEFORE
    // any passive effect on mount and can't see that reset coming) --
    // confirmed directly: that version permanently blocked the one
    // correction that mattered, mistaking legitimate content growth for
    // "shrinking isn't working." Tracking the diagram's own rendered
    // height instead sidesteps this: it only reflects OUR OWN cap
    // requests (or the draw effect resetting it back to natural, which
    // reads as growth, never as an unhelpful shrink) -- so "the diagram
    // got smaller since we last checked, but overflow didn't meaningfully
    // improve" is a real, specific, non-conflatable floor signal.
    let lastDiagramHeight = null
    let lastOverflow = null

    function recheck() {
      if (!containerRef.current) return
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
      setCappedHeight(Math.max(0, currentHeight - overflow - margin))
    }

    // Initial, synchronous pass -- catches the common case (this
    // voicing's own draw growing into its real settled size) before
    // first paint.
    recheck()

    // Ongoing watch -- one single observer for the modal's ENTIRE open
    // lifecycle (see this effect's own `[expanded]`-only deps above),
    // catching every later redraw/reflow, from any cause, without
    // needing to know what caused it.
    const observer = new ResizeObserver(recheck)
    observer.observe(modalEl)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
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
          // Phase 5 Part 7, follow-up 7: modal-only height cap, LIVE-
          // MEASURED per voicing (see the useLayoutEffect above) rather
          // than a fixed budget. `cappedHeight` stays null -- no cap
          // applied at all -- for the common case where this specific
          // voicing's own natural height doesn't actually overflow the
          // modal; only voicings that genuinely need it get one, sized
          // to exactly what's left. Width stays 100% of the column
          // regardless -- when a real cap does clamp height below what
          // the aspect-ratio alone would want, the box becomes visually
          // WIDER than the real content's own ratio; the SVG's own
          // `width:100%;height:100%` + `preserveAspectRatio="xMidYMid
          // meet"` (FretboardDiagram.css, and svguitar's own default)
          // is what turns that mismatch into letterboxing (empty margin
          // on the sides, content scaled down but never distorted) --
          // the exact same "meet, never stretch" rule already governing
          // every other case in this file, just now also engaging on
          // the HEIGHT-constrained axis, not only the width one.
          maxHeight: expanded && cappedHeight != null ? `${cappedHeight}px` : undefined,
        }}
      />
    </div>
  )
}

export default FretboardDiagram
