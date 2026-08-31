import { useEffect, useState } from 'react'
import { useAccessibilityPrefs } from '../context/AccessibilityPrefsContext'
import { getIntervalStyle } from '../lib/intervalColors'
import { stringX, fretCellY, resolveBaseline } from '../lib/miniFretMath'
import './AmbientFretboards.css'

// Below this width the scatter system (HORIZONTAL_RANGE etc. below) has no
// edge margin outside the hero column to work with and shapes land on real
// text -- see the hook in AmbientFretboards() for why this is a JS check
// rather than a CSS `@media { display: none }`.
const HIDE_BELOW = '(max-width: 900px)'

// Purely decorative, aria-hidden scattered fretboard-shaped sketches
// behind Home's hero.
//
// The voicings are a curated, baked-in sample from voicings.db (a one-off
// query, no live API call on Home's page load): `type='Must Know'`,
// `capo=0`, `base_fret<=3`, no slash/bass. All 14 have a fret span of 0-1
// so they stay legible rendered tiny and rotated, spanning 6 roots
// (A/C/D/E/F/G) and 5 qualities. `frets`/`intervals` are the db values,
// with `null` for muted strings.
//
// Dot colors come from intervalColors.js's real interval tokens
// (whichever a voicing's own strings use), never a second palette. Only
// FRETTED notes render as dots -- open strings/mutes are skipped, since a
// hollow-ring open marker doesn't fit this simpler decorative treatment
// (unlike MiniFretDiagram's full diagram).
const AMBIENT_VOICINGS = [
  { name: 'A', frets: ['X', '0', '2', '2', '2', '0'], intervals: [null, '1', '5', '1', '3', '5'] },
  { name: 'Em', frets: ['0', '2', '2', '0', '0', '0'], intervals: ['1', '5', '1', 'm3', '5', '1'] },
  { name: 'A7', frets: ['X', '0', '2', '0', '2', '0'], intervals: [null, '1', '5', 'b7', '3', '5'] },
  { name: 'Am', frets: ['X', '0', '2', '2', '1', '0'], intervals: [null, '1', '5', '1', 'm3', '5'] },
  { name: 'D', frets: ['X', 'X', '0', '2', '3', '2'], intervals: [null, null, '1', '5', '1', '3'] },
  { name: 'E', frets: ['0', '2', '2', '1', '0', '0'], intervals: ['1', '5', '1', '3', '5', '1'] },
  { name: 'G', frets: ['3', '2', '0', '0', '0', '3'], intervals: ['1', '3', '5', '1', '3', '1'] },
  { name: 'Cmaj7', frets: ['X', '3', '2', '0', '0', '0'], intervals: [null, '1', '3', '5', 'maj7', '3'] },
  { name: 'D7', frets: ['X', 'X', '0', '2', '1', '2'], intervals: [null, null, '1', '5', 'b7', '3'] },
  { name: 'Dm7', frets: ['X', 'X', '0', '2', '1', '1'], intervals: [null, null, '1', '5', 'b7', 'm3'] },
  { name: 'Em7', frets: ['0', '2', 'X', '0', '3', '0'], intervals: ['1', '5', null, 'm3', 'b7', '1'] },
  { name: 'E7', frets: ['0', '2', '0', '1', '0', '0'], intervals: ['1', '5', 'b7', '3', '5', '1'] },
  { name: 'Am7', frets: ['X', '0', '2', '0', '1', '0'], intervals: [null, '1', '5', 'b7', 'm3', '5'] },
  { name: 'Fmaj7', frets: ['1', 'X', '2', '2', '1', 'X'], intervals: ['1', null, 'maj7', '3', '5', null] },
]

// Fixed 5-row window, matching MiniFretDiagram's own -- every real
// voicing here has a span of 0-1 frets (see the selection note above),
// well within 5 rows regardless of which fret it's anchored at.
const ROWS = 5

const SHAPE_COUNT = 17

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function randomInt(min, max) {
  return Math.round(randomBetween(min, max))
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Raising a uniform [0,1] draw to a power > 1 skews the result toward 0
// (bigger `bias` = more clustering near the low end). Used below to make
// shapes land near-edge most of the time, with a shrinking chance of
// landing further toward the page center -- a density gradient, not a
// uniform band.
function skewedRandom(min, max, bias) {
  const r = Math.pow(Math.random(), bias)
  return min + r * (max - min)
}

// Shape placement is generated ONCE at module scope, not per render --
// running it on every render would re-shuffle the whole background on any
// unrelated state change, a real jitter bug. Navigating to Home fresh
// gets a new random layout; it stays put during a visit.
//
// `left`/`right` are pixel offsets, not percentages -- a percentage of
// this variable-width container doesn't map to a predictable screen
// position. HORIZONTAL_RANGE = [-10, 380]: the +380 end is the measured
// safe reach at the narrowest breakpoint (1280px) before a shape starts
// overlapping the hero column (.home-hero__description sits ~410px from
// the edge, the container ~19px in, leaving ~391px); reused across all
// breakpoints since wider ones have more room. The -10 end stays close
// to 0 so a right-edge shape can't land past the true viewport edge and
// fail the strict `scrollWidth === clientWidth` check (`:root
// overflow-x: hidden` hides the scrollbar but doesn't fix that check).
// skewedRandom turns this into a density gradient, not a flat spread.
const HORIZONTAL_RANGE = [-10, 380]
// Bias favors the edge but is soft enough (1.7) that the distribution
// still spreads across most of the range -- a stronger bias piled most
// shapes into the first sixth of the range, so vertically-separated
// shapes still stacked at nearly the same horizontal offset. The
// minimum-spacing check below is the belt-and-suspenders for any single
// unlucky run.
const HORIZONTAL_BIAS = 1.7
// Full-page vertical range. The 70 floor keeps shapes off the hero
// heading; the 900 ceiling keeps every shape inside `.home-page`'s real
// content height (~1001px). A shape landing below real content stretches
// the page's scrollable height into empty space and creates a visible
// seam where the shared `:root` vignette/grain background (sized to real
// content) stops. 900 is a known fragile value -- it needs re-tuning if
// Home's content height changes; measuring `.home-page`'s real height at
// runtime would be more robust if this recurs.
const VERTICAL_RANGE = [70, 900]

// Two same-side shapes only read as crowded when close in BOTH
// directions at once (similar height AND similar edge distance); a real
// vertical gap with a similar offset still looks like variety.
// MIN_VERTICAL_GAP is smaller than the ~128px gap typical between
// stratified same-side bins -- this check only catches the genuinely-
// close cases a bad roll produces, not the normal spacing.
const MIN_VERTICAL_GAP = 150
const MIN_HORIZONTAL_GAP = 70
const MAX_PLACEMENT_RETRIES = 6

function tooCloseToSameSide(top, offset, placedOnSide) {
  return placedOnSide.some(
    (p) => Math.abs(p.top - top) < MIN_VERTICAL_GAP && Math.abs(p.offset - offset) < MIN_HORIZONTAL_GAP
  )
}

// Real fretted-note dots for one voicing, positioned via the same shared
// grid math MiniFretDiagram uses (lib/miniFretMath.js) rather than a
// re-derived copy. `width`/`height` are this shape's own random box size
// (see generateShapes()); string/fret percentages are scaled into pixel
// coords within it.
function realDotsFor(voicing, width, height) {
  const baseline = resolveBaseline(voicing.frets)
  const fretted = voicing.frets
    .map((f, i) => ({ fret: f, interval: voicing.intervals[i], stringIndex: i }))
    .filter((s) => s.fret !== 'X' && s.fret !== '0')
  // Cap at 2 dots (the sparse decorative density this component uses),
  // but never below 2 when the voicing has 2+ fretted notes -- always
  // true here (the pool's minimum fretted-note count is 2). A single
  // isolated dot doesn't read as a chord shape.
  const dotCount = Math.min(fretted.length, 2)
  const shuffled = [...fretted].sort(() => Math.random() - 0.5).slice(0, dotCount)
  return shuffled.map((s) => {
    const row = Number(s.fret) - baseline
    return {
      x: Math.round((stringX(s.stringIndex) / 100) * width),
      y: Math.round((fretCellY(row, ROWS) / 100) * height),
      interval: s.interval,
    }
  })
}

function generateShapes() {
  const usedVoicings = [...AMBIENT_VOICINGS]
  const shapes = []
  const placedBySide = { left: [], right: [] }
  // Stratified sampling, not pure random top values: pure randomness
  // clumps far more than expected. Split the vertical range into
  // SHAPE_COUNT even bins, one random point per bin. Bins alternate which
  // side they favor so both edges stay covered top-to-bottom without a
  // rigid left/right pattern -- same-side shapes end up ~2 bins (~128px)
  // apart vertically.
  const binSize = (VERTICAL_RANGE[1] - VERTICAL_RANGE[0]) / SHAPE_COUNT
  for (let i = 0; i < SHAPE_COUNT; i++) {
    const binStart = VERTICAL_RANGE[0] + i * binSize
    const top = Math.round(randomBetween(binStart, binStart + binSize))
    const side = i % 2 === 0 ? 'left' : 'right'
    // Real min-spacing enforcement: resample the offset (never the
    // vertical bin, which is already stratified) up to
    // MAX_PLACEMENT_RETRIES times if it lands too close to an
    // already-placed shape on the same side. Accepts the last attempt
    // even if still close, rather than looping forever -- a rare
    // leftover near-miss is a much smaller problem than an infinite
    // loop or a visibly forced, unnaturally even grid.
    let offset = skewedRandom(HORIZONTAL_RANGE[0], HORIZONTAL_RANGE[1], HORIZONTAL_BIAS)
    let attempts = 0
    while (tooCloseToSameSide(top, offset, placedBySide[side]) && attempts < MAX_PLACEMENT_RETRIES) {
      offset = skewedRandom(HORIZONTAL_RANGE[0], HORIZONTAL_RANGE[1], HORIZONTAL_BIAS)
      attempts += 1
    }
    placedBySide[side].push({ top, offset })
    const scale = Math.round(randomBetween(0.82, 1.12) * 100) / 100
    const blurred = Math.random() < 0.4
    const width = randomInt(50, 66)
    const height = randomInt(64, 80)
    const voicingIndex = usedVoicings.length ? randomInt(0, usedVoicings.length - 1) : 0
    const voicing = usedVoicings.length ? usedVoicings.splice(voicingIndex, 1)[0] : pick(AMBIENT_VOICINGS)
    const dots = realDotsFor(voicing, width, height)

    shapes.push({
      label: voicing.name,
      top,
      [side]: Math.round(offset),
      rotate: randomInt(-8, 8),
      scale,
      opacity: Math.round(randomBetween(0.28, 0.6) * 100) / 100,
      blurred,
      size: [width, height],
      dots,
    })
  }
  return shapes
}

const SHAPES = generateShapes()

// The "scanning" treatment applies to FEATURED_COUNT (4) shapes:
// corner-bracket framing, a translating scanline, a feeding waveform
// from above, dots recolored to --scan.
//
// Featured indices are picked randomly from each side's own index pool
// SEPARATELY (EVEN_INDICES / ODD_INDICES) rather than as one arithmetic
// spread across 0..SHAPE_COUNT-1: generateShapes() assigns side by index
// parity (`i % 2`), so an evenly-spaced index set (0, 4, 8, 12) would all
// land on 'left'. Splitting the pick by parity guarantees both sides are
// represented every load.
const FEATURED_COUNT = 4
const EVEN_INDICES = []
const ODD_INDICES = []
for (let i = 0; i < SHAPE_COUNT; i++) {
  ;(i % 2 === 0 ? EVEN_INDICES : ODD_INDICES).push(i)
}

function pickRandomDistinct(pool, count) {
  const remaining = [...pool]
  const picked = []
  for (let k = 0; k < count && remaining.length; k++) {
    const idx = randomInt(0, remaining.length - 1)
    picked.push(remaining.splice(idx, 1)[0])
  }
  return picked
}

const FEATURED_INDICES = new Set([
  ...pickRandomDistinct(EVEN_INDICES, Math.ceil(FEATURED_COUNT / 2)),
  ...pickRandomDistinct(ODD_INDICES, Math.floor(FEATURED_COUNT / 2)),
])

// Per-shape waveform bar heights/delays, from the design reference's
// `makeWaveform(seed)` algorithm (docs/design-refs/scan-reference.html)
// -- a seeded generator so each featured shape's waveform differs rather
// than repeating one pattern.
function waveformBars(seed) {
  return Array.from({ length: 7 }, (_, i) => ({
    height: 30 + ((seed * (i + 3)) % 55), // 30-85%, keeps every bar visible at this component's small scale
    delay: (((seed + i) % 8) * 0.08).toFixed(2),
  }))
}

function AmbientFretboards() {
  // See IntervalLegend.jsx's identical comment. This component is purely
  // decorative (aria-hidden="true", never a real information source), but
  // still reads real interval-color tokens for its dots -- subscribed for
  // the same overall-visual-consistency reason, so it doesn't silently
  // keep showing the standard palette after a toggle while everything
  // else on the page has switched.
  useAccessibilityPrefs()

  // Hidden below HIDE_BELOW. Done here, not as a CSS `@media { .ambient-
  // fretboards { display: none } }`: adding that rule -- even though it
  // never matches at a desktop width -- measurably shifted sub-pixel text
  // antialiasing across the whole Home page (~0.18% of pixels, no layout
  // change), a Chromium style-recalc / compositing quirk around this
  // z-index:-1 filtered decorative layer. Returning null from JS produces
  // no such shift (verified: identical desktop render). The lazy
  // initializer reads matchMedia on the first client render, so there's
  // no desktop->hidden flash.
  const [hidden, setHidden] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(HIDE_BELOW).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(HIDE_BELOW)
    const onChange = () => setHidden(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  if (hidden) return null

  return (
    <div className="ambient-fretboards" aria-hidden="true">
      {SHAPES.map((shape, i) => {
        const [w, h] = shape.size
        const featured = FEATURED_INDICES.has(i)
        // Seeded-but-plausible values, per shape -- never wired to any
        // real inference.
        const guessPct = featured ? (70 + Math.random() * 25).toFixed(1) : null
        const bars = featured ? waveformBars(i * 7 + 3) : null
        const itemStyle = {
          top: shape.top,
          bottom: shape.bottom,
          left: shape.left,
          right: shape.right,
          // More subdued than the reference's hero treatment -- here
          // these are background decoration behind the capture UI, so
          // opacity/scale stay near this component's plain-shape range.
          opacity: featured ? Math.min(shape.opacity + 0.15, 0.65) : shape.opacity,
          transform: `rotate(${shape.rotate}deg)${shape.scale ? ` scale(${shape.scale})` : ''}`,
        }
        return (
          <div
            key={shape.label + i}
            className={`ambient-fretboards__item${shape.blurred && !featured ? ' ambient-fretboards__item--blurred' : ''}${featured ? ' ambient-fretboards__item--scanning' : ''}`}
            style={itemStyle}
          >
            {featured && (
              <div className="ambient-fretboards__mini-wave" aria-hidden="true">
                {bars.map((bar, j) => (
                  <span
                    key={j}
                    className="ambient-fretboards__mini-wave-bar"
                    style={{ '--mini-wave-h': `${bar.height}%`, animationDelay: `${bar.delay}s` }}
                  />
                ))}
              </div>
            )}
            {featured && <span className="ambient-fretboards__connector" aria-hidden="true" />}
            <div className="ambient-fretboards__grid" style={{ width: w, height: h }}>
              {featured && (
                <>
                  {/* Corner-bracket framing (reference's `.bracket` paths)
                      -- four small L-shaped marks, not a full border, so
                      the "actively being read" box reads as a scan
                      target/viewfinder rather than a plain rectangle. */}
                  <span className="ambient-fretboards__bracket ambient-fretboards__bracket--tl" aria-hidden="true" />
                  <span className="ambient-fretboards__bracket ambient-fretboards__bracket--tr" aria-hidden="true" />
                  <span className="ambient-fretboards__bracket ambient-fretboards__bracket--bl" aria-hidden="true" />
                  <span className="ambient-fretboards__bracket ambient-fretboards__bracket--br" aria-hidden="true" />
                  {/* Reference's `.scanline` + `@keyframes sweep`: a thin
                      line translating top-to-bottom across the grid's own
                      real height, fading in/out at each end of its
                      travel -- `--scan-travel` is this shape's own real
                      pixel height (h), so the sweep always travels exactly
                      the grid's own extent regardless of which randomly-
                      sized shape it's on. */}
                  <span
                    className="ambient-fretboards__scanline"
                    style={{ '--scan-travel': `${h}px` }}
                    aria-hidden="true"
                  />
                </>
              )}
              {shape.dots.map((dot, j) => {
                // Featured shapes' dots are recolored to --scan (cyan)
                // regardless of interval; every other shape keeps its
                // real interval-token coloring.
                const style = getIntervalStyle(dot.interval)
                const fill = featured ? 'var(--scan)' : style.fill
                const glow = featured ? 'var(--scan-border)' : style.glow
                return (
                  <span
                    key={j}
                    className="ambient-fretboards__dot"
                    style={{ left: dot.x, top: dot.y, background: fill, boxShadow: `0 0 4px ${glow}` }}
                  />
                )
              })}
            </div>
            {featured ? (
              <div className="ambient-fretboards__guess">
                {shape.label} &middot; best guess ({guessPct}%)
              </div>
            ) : (
              <div className="ambient-fretboards__label">{shape.label}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default AmbientFretboards
