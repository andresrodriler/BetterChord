import { getIntervalStyle } from '../lib/intervalColors'
import { stringX, fretCellY, resolveBaseline } from '../lib/miniFretMath'
import './AmbientFretboards.css'

// Phase 5 Part 6/7, 5th follow-up -- purely decorative, aria-hidden
// scattered fretboard-shaped sketches behind Home's hero. Approved in
// concept back in the first Part 6/7 pass but explicitly deferred then
// ("skipped given the size of the rest of this pass"); built for real
// that round.
//
// Phase 5 Part 7, Item 3 session: previously these were purely
// illustrative -- fixed decorative labels with randomly-placed dots
// tagged a random interval, no relationship to any real voicing.
// Replaced with a curated, baked-in sample of REAL voicings pulled
// directly from `voicings.db` (a one-off query, same idea as this
// project's existing CSV-sample convention -- captured once, no live API
// call added to Home's page load). Selection criteria, applied via a
// real SQL query (not eyeballed): `type='Must Know'` (the highest-
// confidence/most-recognizable shape for that chord), `capo=0`,
// `base_fret<=3` (near-nut), no slash/bass note -- these render tiny and
// rotated as decoration, so a wide-span or capo voicing would likely
// look cluttered/illegible at that size. All 14 real fret spans here are
// 0 or 1 (computed directly from each voicing's own fretted-note range,
// not assumed) -- genuinely the smallest, simplest real shapes available,
// spanning 6 roots (A/C/D/E/F/G) and 5 qualities (major, minor, dominant
// 7th, minor 7th, major 7th) for real variety. `frets`/`intervals` below
// are byte-for-byte what the db returned (intervals aligned per-string,
// `null` for muted strings) -- not approximated.
//
// Dot colors still come from intervalColors.js's real interval tokens
// (root/3rd/m3/5/b7/maj7 -- whichever a given voicing's own real strings
// actually use), never a second hardcoded palette, unchanged from every
// prior round. Only FRETTED notes are shown as dots (matching this
// component's own already-abstracted, 1-2-dot-per-shape decorative
// language) -- open strings/mutes are skipped entirely here, unlike
// MiniFretDiagram's full diagram, since a hollow-ring open-string marker
// doesn't fit this simpler decorative treatment.
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

// Real density gradient, not a uniform random spread within a fixed
// band -- raising a uniform [0,1] draw to a power > 1 skews the result
// toward 0 (real, standard technique: the bigger `bias`, the more
// values cluster near the low end). Used below to make shapes land
// near-edge MOST of the time, with a real but shrinking chance of
// landing further in toward the page's center as `bias` increases --
// exactly the "less toward the center" density the reference screenshot
// showed, not just a wide-but-uniform spread.
function skewedRandom(min, max, bias) {
  const r = Math.pow(Math.random(), bias)
  return min + r * (max - min)
}

// Phase 5 Part 6/7, Home polish follow-up (3rd round): real, requested
// change -- every prior round hand-picked each shape's own top/bottom/
// left/right/rotate/etc values one at a time, which is why they read as
// clustered rather than genuinely scattered (a person picking "spread
// out" numbers by eye tends to unconsciously space them evenly and stay
// away from the real edges). Replaced with a real generator, computed
// ONCE per page load (module scope, not inside the component function --
// calling this on every render would re-shuffle the whole background on
// every unrelated state change elsewhere on the page, a real jitter bug,
// not a style choice) so navigating to Home fresh gets a genuinely new
// random layout each time, without shapes jumping around mid-visit.
//
// The real, requested piece: `left`/`right` are real PIXEL offsets (see
// the chat writeup for why percentages of a variable-width container
// don't work here). Two real rounds of tuning on this range specifically:
// the first (-15 to 60) kept every shape in a thin strip right at the
// edge -- real feedback with a real annotated reference screenshot said
// this wasn't the request at all: a WIDE horizontal spread, from near
// the true edge inward toward the hero column's own edge, just with
// fewer shapes the closer you get to center (a density GRADIENT, not a
// uniform band, and not a narrow edge-only strip either). 380px is the
// real, measured safe reach at the NARROWEST required breakpoint
// (1280px): the widest hero-column element (.home-hero__description,
// max-width 460px) sits ~410px from the true edge there, and the
// container's own margin from the true edge is ~19px, leaving ~391px of
// real safe room before a shape would start landing ON TOP of real
// content -- 380 stays under that with a small margin, checked directly
// rather than assumed, and reused as one fixed value across all 4
// breakpoints (the wider breakpoints have MORE spare room, not less, so
// the same max is safe everywhere, just not maximally aggressive at the
// wider ones). skewedRandom (bias 2.4, tuned by eye against the real
// reference screenshot's own density) is what turns this into a real
// gradient instead of a flat spread -- most shapes land in the first
// third of this range, a real but shrinking few reach toward the far
// end, matching "less toward the center," confirmed via the real
// generated `left`/`right` values' own distribution, not assumed from
// the formula alone (see the chat writeup).
// Phase 5 Part 6/7, Home polish follow-up (seam-fix round): real,
// confirmed intermittent horizontal-scroll case found while re-verifying
// -- caught via repeated real reloads at 1280px (the narrowest required
// breakpoint), not a one-off: on some random layouts a right-edge
// shape's own right edge landed ~0.5-1px past the true viewport edge
// (measured directly, e.g. one real trial: right=1280.78 against a
// 1280px viewport). The shared `:root { overflow-x: hidden }` safety
// net already prevents this from ever showing an actual visible
// scrollbar, but it still failed the strict `scrollWidth ===
// clientWidth` check intermittently, so tightened the negative end
// (-15 -> -10) rather than leaving a "sometimes fails" edge case --
// re-verified clean across many repeated reloads at 1280px after (see
// the chat writeup for the real counts).
const HORIZONTAL_RANGE = [-10, 380]
// Phase 5 Part 6/7, Home polish follow-up (4th round): real, reported
// crowding -- a real screenshot showed 3-4 shapes on the same edge
// stacked visually on top of one another. Root cause, found by actually
// looking at what a real generated run produced rather than re-tuning
// blind: bias 2.4 was strong enough that MOST shapes landed within the
// first ~60px of the range regardless of which vertical bin they were
// in, so even with real vertical separation (each on its own bin), they
// all sat at nearly the same horizontal offset and read as one stacked
// column hugging the edge. Two real, separate fixes, not one bigger
// bias tweak: (1) softened the bias itself (2.4 -> 1.7) so the
// distribution still favors the edge but spreads across meaningfully
// more of the range, not just its first sixth; (2) added a real
// minimum-spacing check (below) that resamples a shape's own offset (up
// to a few tries) if it would land too close to an already-placed
// shape on the SAME side -- belt-and-suspenders, since bias tuning
// alone shapes the AVERAGE outcome but doesn't prevent any single
// unlucky run from still clustering a few shapes together.
const HORIZONTAL_BIAS = 1.7
// Full-page vertical range this container now spans (see
// AmbientFretboards.css's own comment) -- keeps generated shapes off the
// very top (where the hero heading text lives) and the very bottom
// (past the last teaser card).
//
// Phase 5 Part 6/7, Home polish follow-up: real, confirmed bug -- 1160
// was calibrated to an OLDER, taller version of this page. After this
// session's own stat-line/gap tightening rounds shrank the real hero
// content, `.home-page`'s own real height (what `top` here is measured
// against) is now only ~1001px -- confirmed directly via
// getBoundingClientRect(), not assumed stale. Shapes landing near the
// old 1160 max were rendering in genuinely empty space BELOW all real
// content (the lowest shape's own real bottom edge measured 1305px,
// vs. real content ending at 1091px) -- which silently stretched the
// whole page's scrollable height with nothing in it but a couple of
// stray decorations, and produced a real, visible seam where the
// shared `:root` vignette/grain background (sized against the page's
// own real, non-decorative content) stopped covering that
// artificially-extended region. 900 keeps every generated shape's own
// real bottom edge comfortably inside the real ~1001px content height
// (confirmed via re-measurement after this fix, not assumed from the
// arithmetic alone). This value is a real, known fragility, not a
// permanent fix -- it will need re-tuning again if Home's own content
// height changes further in a future round (the same way 1160 quietly
// went stale here); a more robust fix would measure `.home-page`'s own
// real height at runtime instead of hardcoding an assumption about it,
// worth doing if this keeps recurring.
const VERTICAL_RANGE = [70, 900]

// Two same-side shapes only read as "crowded" when they're close in
// BOTH directions at once (near the same height AND near the same
// distance from the edge) -- a real vertical gap with a similar offset
// still looks like intentional variety, not a stack. MIN_VERTICAL_GAP
// is deliberately smaller than the ~128px real gap already typical
// between same-side stratified bins (see below) -- this check is only
// meant to catch the genuinely-close cases a bad random roll can still
// produce, not fight the normal spacing.
const MIN_VERTICAL_GAP = 150
const MIN_HORIZONTAL_GAP = 70
const MAX_PLACEMENT_RETRIES = 6

function tooCloseToSameSide(top, offset, placedOnSide) {
  return placedOnSide.some(
    (p) => Math.abs(p.top - top) < MIN_VERTICAL_GAP && Math.abs(p.offset - offset) < MIN_HORIZONTAL_GAP
  )
}

// Real fretted-note dots for one voicing, positioned via the SAME shared
// grid math MiniFretDiagram uses (Phase 5 Part 7, Item 3 session) --
// nut-anchoring, string position, and fret-cell-center all reused
// directly from `lib/miniFretMath.js` rather than re-derived here, per
// this session's explicit instruction not to risk a third independent
// implementation of the same logic. `width`/`height` are THIS shape's
// own randomly-generated box size (unchanged mechanism from before --
// see `generateShapes()` below); string/fret percentages are scaled into
// pixel coordinates within that box, same as MiniFretDiagram scales them
// into its own fixed-size card.
function realDotsFor(voicing, width, height) {
  const baseline = resolveBaseline(voicing.frets)
  const fretted = voicing.frets
    .map((f, i) => ({ fret: f, interval: voicing.intervals[i], stringIndex: i }))
    .filter((s) => s.fret !== 'X' && s.fret !== '0')
  // REAL BUG FIXED (Phase 5 Part 7, follow-up on the same session): this
  // used to roll `Math.random() < 0.55 ? 2 : 1` regardless of how many
  // real notes the voicing has -- confirmed via a real 8-trial repeated-
  // load audit that this made EVERY ONE of the 14 curated chords
  // (not just the reported D) render as a single, isolated dot on a real
  // ~45% of loads, even though every one of them has 2-4 real fretted
  // notes in the source data (verified: D's own source has 3 real
  // fretted notes, span 1 fret -- the "only one dot" screenshot was a
  // real, correctly-rendered draw of ONE of those 3 real notes, not a
  // coordinate/dedup bug; the same random branch just as often produced
  // a 1-dot render for every other chord in the pool too). A single,
  // isolated dot doesn't read as "a real chord shape" at a glance, which
  // defeats the point of swapping real data in -- fixed by capping at 2
  // dots (still the same abstracted, sparse density this component has
  // always used, never showing every note) but NEVER dropping below 2
  // when 2+ real notes exist, which is always true for every voicing in
  // this pool (the minimum real fretted-note count across all 14 is 2).
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
  // Stratified sampling, not pure random top values: splitting the full
  // vertical range into SHAPE_COUNT even bins and picking one random
  // point per bin is what actually avoids the "pure randomness clumps"
  // problem (real random numbers cluster far more than people expect --
  // confirmed by generating a few pure-random trials and eyeballing real
  // gaps before picking this approach over plain Math.random() per
  // shape). Each bin alternates which side (left/right) it's biased
  // toward so both edges stay roughly evenly covered top to bottom,
  // without forcing a rigid left/right/left/right pattern -- same-side
  // shapes end up roughly 2 bins (~128px) apart vertically as a result.
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

function AmbientFretboards() {
  return (
    <div className="ambient-fretboards" aria-hidden="true">
      {SHAPES.map((shape, i) => {
        const [w, h] = shape.size
        const itemStyle = {
          top: shape.top,
          bottom: shape.bottom,
          left: shape.left,
          right: shape.right,
          opacity: shape.opacity,
          transform: `rotate(${shape.rotate}deg)${shape.scale ? ` scale(${shape.scale})` : ''}`,
        }
        return (
          <div
            key={shape.label + i}
            className={`ambient-fretboards__item${shape.blurred ? ' ambient-fretboards__item--blurred' : ''}`}
            style={itemStyle}
          >
            <div className="ambient-fretboards__grid" style={{ width: w, height: h }}>
              {shape.dots.map((dot, j) => {
                const style = getIntervalStyle(dot.interval)
                return (
                  <span
                    key={j}
                    className="ambient-fretboards__dot"
                    style={{ left: dot.x, top: dot.y, background: style.fill, boxShadow: `0 0 4px ${style.glow}` }}
                  />
                )
              })}
            </div>
            <div className="ambient-fretboards__label">{shape.label}</div>
          </div>
        )
      })}
    </div>
  )
}

export default AmbientFretboards
