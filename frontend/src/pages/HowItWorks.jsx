import { useRef, useState } from 'react'
import { stringX, fretY, fretCellY, isAnchoredAtNut, resolveBaseline } from '../lib/miniFretMath'
import './HowItWorks.css'

// Phase 5 Part 6/7, 16th follow-up: real 6-stage pipeline ported from the
// How It Works mockup (frontend/design-reference/How_It_Works_dc.html) --
// raw source, no bundler decoding needed. Illustrations are reproduced as
// real CSS grid/flow layouts, NOT the mockup's own literal technique in two
// places (both confirmed landmines, not copied):
//   1. The mockup hardcodes several architecture-diagram labels ("Pool 1",
//      "Pool 2", "Flatten") at absolute pixel offsets, which only lines up
//      at the exact width the mockup was built at. This page lays the same
//      stages out with real CSS grid columns instead, so it reflows
//      correctly at every tested viewport width.
//   2. Two copy fixes while porting: a stray `&nbsp;` mid-sentence in stage
//      1 ("A single guitar strum", not "guitar&nbsp; strum"), and a
//      subject-verb mismatch in stage 2 ("some known difficulties include
//      complicated or niche chord qualities...", not "...difficulties the
//      model has is complicated...").
// The stage 2 CNN architecture (conv1 32ch -> pool1 -> conv2 64ch -> pool2
// -> flatten 38,976 -> 3 parallel heads, NOTES sigmoid / ROOT softmax /
// BASS softmax) is real, confirmed directly against
// betterchord/training_scripts/cnn_model.py before porting, not assumed.

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
// Illustrative example values (Gm: G-Bb-D), matching the mockup's own
// hardcoded example -- not live-computed, same as the mockup itself.
const NOTE_PROBS = [0.06, 0.04, 0.55, 0.09, 0.05, 0.07, 0.03, 0.97, 0.06, 0.1, 0.89, 0.04]
const ACTIVE_NOTES = new Set(['G', 'Bb', 'D'])

const CHROMATIC_C13 = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'Bb'])
const CHROMATIC_C13_LABELS = { C: 'R', D: '9th', E: '3rd', F: '11th', G: '5th', A: '13th', Bb: 'b7' }
const CHROMATIC_C7ADD13 = new Set(['C', 'E', 'G', 'A', 'Bb'])
const CHROMATIC_C7ADD13_LABELS = { C: 'R', E: '3rd', G: '5th', A: '13th', Bb: 'b7' }
const GUIDE_TONES = new Set(['E', 'Bb'])

// 19th follow-up: real, confirmed gap -- the mockup's own embedded
// component (the real How_It_Works_dc.html, not the stale stub an
// earlier round mistakenly diffed against) has 8 example voicing cards
// in its real chordDefs array, filling its 4-column grid as 2 full
// rows; this list only ever had 4 (C/Gm/F/Gm), silently dropping D, Em,
// G, and Am. Restored to all 8, same order, same frets/roles -- byte-
// for-byte matching the mockup's own real chordDefs (verified by
// extracting and running that file's own JS logic directly via Node,
// not eyeballed).
const EXAMPLE_VOICINGS = [
  { name: 'C', frets: ['X', '3', '2', '0', '1', '0'], roles: [null, 'R', '3', '5', 'R', '3'] },
  { name: 'D', frets: ['X', 'X', '0', '2', '3', '2'], roles: [null, null, 'R', '5', 'R', '3'] },
  { name: 'Em', frets: ['0', '2', '2', '0', '0', '0'], roles: ['R', '5', 'R', 'b3', '5', 'R'] },
  { name: 'Gm', frets: ['3', '5', '5', '3', '3', '3'], roles: ['R', '5', 'R', 'b3', '5', 'R'], featured: true },
  { name: 'G', frets: ['3', '2', '0', '0', '3', '3'], roles: ['R', '3', '5', 'R', '5', 'R'] },
  { name: 'Am', frets: ['X', '0', '2', '2', '1', '0'], roles: [null, 'R', '5', 'R', 'b3', '5'] },
  { name: 'F', frets: ['1', '3', '3', '2', '1', '1'], roles: ['R', '5', 'R', '3', '5', 'R'] },
  { name: 'Gm', frets: ['X', '10', '12', '12', '11', '10'], roles: [null, 'R', '5', 'R', 'b3', '5'], featured: true },
]

const ROLE_COLOR = { R: 'var(--interval-root)', 3: 'var(--interval-3rd)', b3: 'var(--interval-3rd)', 5: 'var(--interval-5th)', b7: 'var(--interval-7th)' }
const ROLE_BORDER = { R: 'var(--interval-root-border)', 3: 'var(--interval-3rd-border)', b3: 'var(--interval-3rd-border)', 5: 'var(--interval-5th-border)', b7: 'var(--interval-7th-border)' }

const EXAMPLE_SONGS = [
  { title: 'Creep', artist: 'Radiohead', chords: 'G · B · C · Cm' },
  { title: 'Hallelujah', artist: 'Jeff Buckley', chords: "C# · Bbm · F# · Ab · F7" },
  { title: 'Riptide', artist: 'Vance Joy', chords: "Bbm · Ab · C# · F#maj7" },
]

// Grid coordinate math (nut-anchoring, string/fret-line positions, and
// fretted-dot cell-centering) moved to `lib/miniFretMath.js` (Phase 5
// Part 7, Item 3 session) -- extracted from here so Home's
// AmbientFretboards could reuse this exact, already-debugged
// implementation instead of a second independent one. See that file's
// own comments for the full real-bug history (2 real alignment-bug
// sessions' worth) this design fixes.
const rows = 5

function MiniFretDiagram({ voicing }) {
  const baseline = resolveBaseline(voicing.frets)
  const showFretLabel = !isAnchoredAtNut(voicing.frets)

  return (
    <div className={`hiw-voicing-card${voicing.featured ? ' hiw-voicing-card--featured' : ''}`}>
      <span className="hiw-voicing-card__name">{voicing.name}</span>
      <div className="hiw-voicing-card__grid">
        {showFretLabel && <div className="hiw-voicing-card__fret-label">{baseline}fr</div>}
        {baseline === 1 && <div className="hiw-voicing-card__nut" />}
        {voicing.frets.map((f, i) => {
          const leftPct = stringX(i)
          if (f === 'X') return <div key={i} className="hiw-voicing-card__mute" style={{ left: `${leftPct}%` }}>&times;</div>
          if (f === '0') return <div key={i} className="hiw-voicing-card__mute hiw-voicing-card__mute--open" style={{ left: `${leftPct}%` }}>o</div>
          const row = Number(f) - baseline
          const role = voicing.roles[i]
          return (
            <div
              key={i}
              className="hiw-voicing-card__dot"
              style={{
                left: `${leftPct}%`,
                top: `${fretCellY(row, rows)}%`,
                background: ROLE_COLOR[role] || 'var(--brass)',
                borderColor: ROLE_BORDER[role] || 'var(--brass-border)',
              }}
            >
              {role}
            </div>
          )
        })}
        <div className="hiw-voicing-card__lines" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={`v${i}`} className="hiw-voicing-card__vline" style={{ left: `${stringX(i)}%` }} />)}
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={`h${i}`} className="hiw-voicing-card__hline" style={{ top: `${fretY(i, rows)}%` }} />)}
        </div>
      </div>
    </div>
  )
}

// 27th follow-up: real mockup values -- the mockup's audio player is a
// fully bespoke component (32px circular brass button with hand-drawn
// play/pause shapes, a real 36-bar waveform whose per-bar height comes
// from this exact seed array, a plain time-label span, and a HIDDEN
// native <audio> used purely as the playback engine) -- not the browser's
// generic `<audio controls>` bar this page was using before (confirmed
// via direct source inspection: the mockup's own real <audio> element is
// `style="display:none"`). Real waveform seed + played/unplayed color
// logic, ported verbatim from the mockup's own embedded component logic
// (`waveSeed`/`progressIdx`/`waveform`), not approximated.
const WAVEFORM_SEED = [30, 55, 80, 45, 60, 90, 40, 70, 50, 85, 35, 65, 95, 55, 40, 75, 60, 30, 50, 80, 45, 65, 90, 55, 35, 70, 60, 40, 85, 50, 75, 45, 65, 30, 55, 80]

function formatAudioTime(t) {
  if (!Number.isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function AudioCaptureIllustration() {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) { el.play(); setIsPlaying(true) } else { el.pause(); setIsPlaying(false) }
  }

  const progressIdx = duration ? Math.floor((currentTime / duration) * WAVEFORM_SEED.length) : 0

  return (
    <div className="panel hiw-illustration">
      <div className="hiw-illustration__tag">Audio Capture Example: G Minor Voicing 3-5-5-3-3-3</div>
      <div className="hiw-spectrogram">
        <div className="hiw-spectrogram__labels">
          {['E8', 'E7', 'E6', 'E5', 'E4', 'E3', 'E2'].map((n) => <span key={n}>{n}</span>)}
        </div>
        <div className="hiw-spectrogram__image-wrap">
          <img src="/assets/Gminor_heatmap_only.png" alt="CQT spectrogram heatmap of the real Gm clip" className="hiw-spectrogram__image" />
          <div className="hiw-spectrogram__times">
            <span>0</span><span>0.5</span><span>1.0</span><span>1.5</span><span>2.0</span><span>2.5s</span>
          </div>
        </div>
        <div className="hiw-spectrogram__colorbar-wrap">
          <div className="hiw-spectrogram__colorbar" aria-hidden="true" />
          <div className="hiw-spectrogram__times hiw-spectrogram__times--spacer" aria-hidden="true">
            <span>0</span>
          </div>
        </div>
        <div className="hiw-spectrogram__colorbar-ticks">
          <span>+3</span><span>0</span><span>−3</span>
        </div>
      </div>
      <div className="hiw-audio-player">
        <button className="hiw-audio-player__toggle" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying
            ? <span className="hiw-audio-player__icon-pause"><span /><span /></span>
            : <span className="hiw-audio-player__icon-play" />}
        </button>
        <div className="hiw-audio-player__waveform">
          {WAVEFORM_SEED.map((h, i) => (
            <div
              key={i}
              className="hiw-audio-player__bar"
              style={{ height: `${h}%`, background: i < progressIdx ? 'var(--scan)' : 'var(--hiw-tag-border)' }}
            />
          ))}
        </div>
        <span className="hiw-audio-player__time">{formatAudioTime(currentTime)} / {formatAudioTime(duration)}</span>
        <audio
          ref={audioRef}
          src="/assets/Gminor_3_5_5_3_3_3.wav"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
          className="hiw-audio-player__native"
        />
      </div>
      <p className="hiw-illustration__caption">This is literally what the next step, the CNN model, sees!</p>
    </div>
  )
}

// 20th follow-up: real mockup values (extracted via the real convergence
// loop against a properly-rendered mockup -- see CLAUDE.md) -- each
// conv/pool step is a real layered, angled "card stack" (multiple
// offset divs, rotateY(18deg), each layer a step lighter), not one flat
// block. Conv layers use 4 steps (brass family for Conv1, moss family
// for Conv2), pool layers use 3 smaller steps in the same two families
// -- literal hex values from the mockup's own real CSS, kept literal
// here (not tokenized) since they're a one-off illustration effect, the
// same precedent already used for DetectionBadge's ripple colors.
const CNN_LAYER_COLORS = {
  conv1: ['#3a2318', '#6b3a26', '#a5573a', '#d9895c'],
  pool1: ['#6b3a26', '#a5573a', '#e5a583'],
  conv2: ['#253026', '#3f5745', '#6b8a76', '#8faf9b'],
  pool2: ['#3f5745', '#6b8a76', '#a8c2b1'],
}
const CNN_LAYER_TOP_BORDER = { conv1: '#eaa87f', pool1: '#f2c4ab', conv2: '#b3c9bc', pool2: '#c8dbd0' }

// 31st follow-up: FULL REBUILD, not another position patch. 4+ rounds of
// targeted alignment/label fixes left `converge.py`'s mismatch flat at
// 47-48% -- a strong signal the old flex-column/`CnnLayerStack`
// abstraction was a fundamentally different CONSTRUCTION from the
// mockup, not a close recreation with a few wrong values. Re-extracted
// the mockup's real, literal markup for this exact panel (raw source,
// `frontend/design-reference/How It Works.dc.html`, the same real
// support.js-rendered source already established as trustworthy for
// this page since the 21st follow-up) before writing any code -- full
// findings recorded in this session's own report, condensed here:
//
// The mockup is NOT a reusable "Conv/Pool column" component repeated 4
// times. It's ONE single CSS grid for the WHOLE diagram
// (`display:grid; grid-template-rows:36px 46px 34px; grid-auto-flow:
// column`) -- every element (labels, boxes, dims, even empty spacer
// columns reserved for arrow gaps) is a direct child placed into an
// auto-generated column via its own explicit `grid-row`. Conv and Pool
// boxes align because they share the SAME fixed-height row 2, not
// because of any Conv/Pool-specific logic. Pool's own label+dims are
// individually POSITION:ABSOLUTE (real literal px, e.g. `left:128px;
// top:104px` for Pool 1), not flowed into a shared "caption" element.
// The Flatten label and its bars are ALSO individually position:absolute
// (`left:285px` / `left:290px`). The 5 inter-stage connector arrows are
// SEPARATE absolutely-positioned `<svg>` overlays at fixed `left`
// offsets (51/120/157/226/264px, all `top:77px`, `z-index:2`) painted
// ON TOP of the grid, not flex-row siblings between columns -- 3 of the
// 5 have a real triangular arrowhead marker (stage transitions: INPUT->
// Conv1, Pool1->Conv2, Pool2->Flatten), 2 are plain lines with no head
// (bridging Conv->Pool within one stage).
// This whole panel has a real FIXED outer width (measured live and in
// the mockup: 442px, unaffected by viewport -- confirmed at all 4
// tested breakpoints) sitting inside a max-width:980px page column with
// comfortable margin at every tested width, so literal absolute-px
// positioning here carries none of the real page-level reflow risk the
// 16th follow-up's own landmine warning was about (that warning was
// about the whole PAGE's stage grid, a genuinely fluid layout -- this
// one static, fixed-size illustration was never in that category).
// Reproduced with real values throughout, not re-derived through a
// generic abstraction -- `cnnStack()` below is pure visual repetition
// (the layered-card divs), not a layout/positioning abstraction; every
// grid-row/absolute-position/px value is copied straight from the real
// mockup source.

// Real mockup values, `CNN_LAYER_COLORS`/`CNN_LAYER_TOP_BORDER` already
// confirmed correct (20th/21st follow-ups) -- kept as-is, only their
// CONSUMPTION (layout) changes this round.
function cnnStack(variant) {
  const colors = CNN_LAYER_COLORS[variant]
  const isConv = variant.startsWith('conv')
  const size = isConv ? 36 : 22
  return colors.map((color, i) => (
    <div
      key={i}
      style={{
        position: 'absolute',
        left: i * 2,
        top: i * 2 + (isConv ? 1 : 0),
        width: size,
        height: isConv ? size + 2 : size,
        borderRadius: 3,
        background: color,
        border: `1px solid ${i === colors.length - 1 ? CNN_LAYER_TOP_BORDER[variant] : 'transparent'}`,
        transform: 'rotateY(18deg)',
        transformOrigin: 'center center',
      }}
    />
  ))
}

const FLATTEN_BAR_COLORS = ['#c89b5c', '#8a6b42', '#c89b5c', '#6b5236', '#8a6b42', '#c89b5c', '#8a6b42', '#c89b5c']

// Real mockup arrow geometry, all 5 real segments (left/width/hasHead),
// all at the mockup's own literal `top:77px`.
const CNN_ARROWS = [
  { left: 51, width: 27, hasHead: true },
  { left: 120, width: 11, hasHead: false },
  { left: 157, width: 27, hasHead: true },
  { left: 226, width: 11, hasHead: false },
  { left: 264, width: 27, hasHead: true },
]

function CnnConnectorArrows() {
  return CNN_ARROWS.map((a, i) => (
    <svg
      key={i}
      className="hiw-cnn-diagram__connector"
      width={a.width}
      height="12"
      viewBox={`0 0 ${a.width} 12`}
      style={{ left: a.left }}
      aria-hidden="true"
    >
      {a.hasHead && (
        <defs>
          <marker id={`hiw-cnn-arrow-${i}`} markerWidth="5" markerHeight="5" refX="3.5" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--brass)" />
          </marker>
        </defs>
      )}
      <path
        d={`M0,6 L${a.width - (a.hasHead ? 5 : 0)},6`}
        stroke="var(--brass)"
        strokeWidth="2.2"
        fill="none"
        markerEnd={a.hasHead ? `url(#hiw-cnn-arrow-${i})` : undefined}
      />
    </svg>
  ))
}

function CnnDiagramIllustration() {
  // 21st follow-up: real ground truth this time (support.js/image-slot.js
  // actually executing, not the resolver workaround) confirmed BASS's real
  // color is a one-off mauve (#b6788a) that doesn't match any existing
  // interval token -- --interval-7th/--moss-deep (#5c7a63) was a real,
  // wrong substitution from the prior round's approximation-based build.
  // NOTES (#8faf9b) and ROOT (#d9895c) DID already exactly match
  // --interval-3rd/--moss and --interval-root, kept as tokens.
  const heads = [
    { label: 'NOTES', sub: 'sigmoid', color: 'var(--interval-3rd)' },
    { label: 'ROOT', sub: 'softmax', color: 'var(--interval-root)' },
    { label: 'BASS', sub: 'softmax', color: '#b6788a' },
  ]
  return (
    <div className="panel hiw-illustration hiw-illustration--cnn">
      <div className="hiw-illustration__tag">CNN Classification Example: G Minor → Notes, Root, Bass</div>
      <div className="hiw-cnn-diagram">
        {/* INPUT */}
        <span className="hiw-cnn-diagram__label" style={{ gridRow: 1, gridColumn: 1, width: 46, letterSpacing: '0.04em' }}>INPUT</span>
        <div style={{ gridRow: 2, gridColumn: 1, width: 46, justifySelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 160 }}>
          <img src="/assets/Gminor_heatmap_only.png" alt="input spectrogram" className="hiw-cnn-diagram__thumb" />
        </div>
        <span className="hiw-cnn-diagram__dims" style={{ gridRow: 3, gridColumn: 1, width: 46 }}>spectrogram<br />1×84×119</span>

        {/* gap reserved for the INPUT->Conv1 arrow */}
        <div style={{ gridRow: '2 / 4', gridColumn: 2, width: 14 }} />

        {/* Conv 1 / Pool 1 */}
        <span className="hiw-cnn-diagram__label" style={{ gridRow: 1, gridColumn: 3, width: 44 }}>
          Conv 1<br /><span className="hiw-cnn-diagram__label-dims">32×84×119</span>
        </span>
        <div style={{ gridRow: 2, gridColumn: 3, justifySelf: 'center', position: 'relative', width: 46, height: 46, perspective: 160 }}>
          {cnnStack('conv1')}
        </div>
        <div style={{ gridRow: 2, gridColumn: 4, width: 32, justifySelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 160 }}>
          <div style={{ position: 'relative', width: 29, height: 29 }}>{cnnStack('pool1')}</div>
        </div>
        <div style={{ gridRow: 3, gridColumn: 4, width: 32 }}>
          <span className="hiw-cnn-diagram__label" style={{ position: 'absolute', left: 128, top: 104 }}>
            Pool 1<br /><span className="hiw-cnn-diagram__label-dims">32×42×59</span>
          </span>
        </div>

        {/* gap reserved for the Pool1->Conv2 arrow */}
        <div style={{ gridRow: '1 / 3', gridColumn: 5, width: 14 }} />

        {/* Conv 2 / Pool 2 */}
        <span className="hiw-cnn-diagram__label" style={{ gridRow: 1, gridColumn: 6, width: 44 }}>
          Conv 2<br /><span className="hiw-cnn-diagram__label-dims">64×42×59</span>
        </span>
        <div style={{ gridRow: 2, gridColumn: 6, justifySelf: 'center', position: 'relative', width: 46, height: 46, perspective: 160 }}>
          {cnnStack('conv2')}
        </div>
        <div style={{ gridRow: 2, gridColumn: 7, width: 32, justifySelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 160 }}>
          <div style={{ position: 'relative', width: 29, height: 29 }}>{cnnStack('pool2')}</div>
        </div>
        <div style={{ gridRow: 3, gridColumn: 7, width: 32 }}>
          <span className="hiw-cnn-diagram__label" style={{ position: 'absolute', left: 235, top: 104 }}>
            Pool 2<br /><span className="hiw-cnn-diagram__label-dims">64×21×29</span>
          </span>
        </div>

        {/* gap reserved for the Pool2->Flatten arrow */}
        <div style={{ gridRow: '2 / 4', gridColumn: 8, width: 0 }} />

        {/* Flatten */}
        <div style={{ gridRow: 1, gridColumn: 9, width: 44 }}>
          <span className="hiw-cnn-diagram__label" style={{ position: 'absolute', left: 285 }}>
            Flatten<br /><span className="hiw-cnn-diagram__label-dims" style={{ color: '#a98866' }}>38,976</span>
          </span>
        </div>
        <div className="hiw-cnn-diagram__flatten-bars" style={{ gridRow: 2, position: 'absolute', left: 290, marginLeft: 8 }}>
          {FLATTEN_BAR_COLORS.map((c, i) => (
            <div key={i} className="hiw-cnn-diagram__flatten-bar" style={{ background: c }} />
          ))}
        </div>

        {/* arrow fan into the 3 heads */}
        <div style={{ gridRow: '1 / 4', gridColumn: 10, width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CnnHeadsFan />
        </div>

        {/* NOTES / ROOT / BASS */}
        <div className="hiw-cnn-diagram__heads" style={{ gridRow: '1 / 4', gridColumn: 11, width: 58 }}>
          {heads.map((h) => (
            <div className="hiw-cnn-diagram__head" key={h.label}>
              <span className="hiw-cnn-diagram__head-dot" style={{ background: h.color, boxShadow: `0 0 6px -1px ${h.color}` }} />
              <span className="hiw-cnn-diagram__head-label" style={{ color: h.color }}>{h.label}<br /><span className="hiw-cnn-diagram__head-sub">{h.sub}</span></span>
            </div>
          ))}
        </div>

        <CnnConnectorArrows />
      </div>
    </div>
  )
}

// 21st follow-up: real mockup arrows are a thin brass SVG line + a
// triangular arrowhead marker (stroke #c89b5c/--brass, stroke-width 2.2),
// not a monospace "→" glyph -- confirmed via the real support.js-rendered
// DOM (`<path ... stroke="#c89b5c" stroke-width="2.2" marker-end=...>`).
// One shared-origin fan of 3 diverging colored SVG paths into NOTES/
// ROOT/BASS, replacing 3 independent same-color CnnArrow calls -- real
// mockup geometry (How_It_Works_dc.html, viewBox 0 0 26 122, all 3 paths
// starting at (1,61), fanning to (20,15)/(20,61)/(20,107)), each with its
// own colored 6x6 arrowhead marker, stroke-width 1.3. Colors match each
// head's own dot color exactly (NOTES/ROOT reuse the same interval
// tokens the dots use; BASS is the same one-off mauve literal).
function CnnHeadsFan() {
  return (
    <svg className="hiw-cnn-diagram__heads-fan-svg" width="26" height="122" viewBox="0 0 26 122" aria-hidden="true">
      <defs>
        <marker id="hiw-fan-notes" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--interval-3rd)" />
        </marker>
        <marker id="hiw-fan-root" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--interval-root)" />
        </marker>
        <marker id="hiw-fan-bass" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#b6788a" />
        </marker>
      </defs>
      <path d="M1,61 L20,15" stroke="var(--interval-3rd)" strokeWidth="1.3" fill="none" markerEnd="url(#hiw-fan-notes)" />
      <path d="M1,61 L20,61" stroke="var(--interval-root)" strokeWidth="1.3" fill="none" markerEnd="url(#hiw-fan-root)" />
      <path d="M1,61 L20,107" stroke="#b6788a" strokeWidth="1.3" fill="none" markerEnd="url(#hiw-fan-bass)" />
    </svg>
  )
}

function ChordIdIllustration() {
  return (
    <div className="panel hiw-illustration">
      <div className="hiw-illustration__tag">Chord Identification Example: G Minor Data</div>
      <div className="hiw-note-bars">
        <div className="hiw-note-bars__bars">
          {NOTE_NAMES.map((note, i) => (
            <div key={note} className="hiw-note-bars__col">
              <div
                className="hiw-note-bars__bar"
                style={{
                  height: `${Math.max(6, NOTE_PROBS[i] * 100)}%`,
                  // 26th follow-up: real mockup values -- active bar
                  // color was already correct (--scan, confirmed exact
                  // match to the mockup's own literal #6fe3d6), but the
                  // inactive bar was using --brown-700 (#7d5b37) where
                  // the mockup's real value is #4a3826 -- which already
                  // exists in this page's own token set as
                  // --hiw-tag-border, reused here rather than adding a
                  // new literal.
                  background: ACTIVE_NOTES.has(note) ? 'var(--scan)' : 'var(--hiw-tag-border)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="hiw-note-bars__labels">
          {NOTE_NAMES.map((note) => (
            // 26th follow-up: real mockup label colors -- active is
            // --muted (#a99c87, confirmed exact), inactive is a real
            // one-off #5a4632 that doesn't match any existing token
            // (darker than --placeholder, which live was using).
            <span key={note} style={{ color: ACTIVE_NOTES.has(note) ? 'var(--muted)' : '#5a4632' }}>{note}</span>
          ))}
        </div>
      </div>
      <div className="hiw-chord-summary">
        <span className="hiw-chord-summary__label">root G</span><span className="hiw-chord-summary__plus">+</span>
        <span className="hiw-chord-summary__label">bass G</span><span className="hiw-chord-summary__plus">+</span>
        <span className="hiw-chord-summary__label">notes: D + G + Bb</span><span className="hiw-chord-summary__eq">=</span>
        <span className="readout hiw-chord-summary__result">Gm</span>
      </div>
    </div>
  )
}

function VoicingLookupIllustration() {
  return (
    <div className="panel hiw-illustration">
      <div className="hiw-illustration__tag">Voicing Lookup Example: Sample of Two Gm voicings</div>
      <div className="hiw-voicing-grid">
        {EXAMPLE_VOICINGS.map((v, i) => <MiniFretDiagram voicing={v} key={v.name + i} />)}
      </div>
    </div>
  )
}

function SongLookupIllustration() {
  return (
    <div className="panel hiw-illustration">
      <div className="hiw-illustration__tag">Song Lookup Example: Sample Song Using Gm chord</div>
      <div className="hiw-song-list">
        {EXAMPLE_SONGS.map((s) => (
          <div className="hiw-song-row" key={s.title}>
            <div className="hiw-song-row__cover" aria-hidden="true" />
            <div className="hiw-song-row__info">
              <div className="hiw-song-row__title">{s.title}</div>
              <div className="hiw-song-row__artist">{s.artist}</div>
            </div>
            <div className="hiw-song-row__chords">{s.chords}</div>
          </div>
        ))}
        <div className="hiw-song-row hiw-song-row--live">
          <div className="hiw-song-row__cover" aria-hidden="true" />
          <div className="hiw-song-row__info">
            <div className="hiw-song-row__title hiw-song-row__title--live">Live Gm lookup result</div>
            <div className="hiw-song-row__artist">ArtistX</div>
          </div>
          <div className="hiw-song-row__chords">Eb · Bb · <span className="readout hiw-song-row__chords-match">Gm</span> · F</div>
        </div>
      </div>
    </div>
  )
}

function GuideToneIllustration() {
  return (
    <div className="panel hiw-illustration">
      <div className="hiw-illustration__tag">Guide Tone Connection Example: C13 and C7add13</div>
      <div className="hiw-chromatic-cols">
        {NOTE_NAMES.map((n) => (
          // 26th follow-up: real mockup value -- a real 3rd tier, not
          // just guide-tone-vs-everything-else. Real guide tones (E, Bb)
          // are scan; D and F (present as extension tones -- 9th/11th --
          // in the C13 formula shown below, but not themselves guide
          // tones) get a dimmer --border highlight; everything else
          // falls to a real one-off #5a4632 literal (NOT --placeholder --
          // a real bug in the first version of this fix, caught by
          // re-running the sweep after the initial fix rather than
          // assuming it landed correctly). Confirmed via the mockup's
          // own real noteColorMap, not guessed.
          <span key={n} className="hiw-chromatic-cols__note" style={{ color: GUIDE_TONES.has(n) ? 'var(--scan)' : (n === 'D' || n === 'F') ? 'var(--border)' : '#5a4632' }}>{n}</span>
        ))}
      </div>
      <div className="hiw-chromatic-row">
        {NOTE_NAMES.map((n) => {
          const on = CHROMATIC_C13.has(n)
          const gt = GUIDE_TONES.has(n)
          return (
            <div
              key={n}
              className="hiw-chromatic-row__cell"
              style={{ background: on ? (gt ? 'var(--scan)' : 'var(--brass)') : 'var(--brown-800)', borderColor: on ? 'var(--brass)' : 'var(--border)' }}
            >
              {on ? CHROMATIC_C13_LABELS[n] : ''}
            </div>
          )
        })}
      </div>
      <div className="hiw-chromatic-formula">C13 -- R·9·3·11·5·13·b7</div>
      <div className="hiw-chromatic-row">
        {NOTE_NAMES.map((n) => {
          const on = CHROMATIC_C7ADD13.has(n)
          const gt = GUIDE_TONES.has(n)
          return (
            <div
              key={n}
              className="hiw-chromatic-row__cell"
              style={{ background: on ? (gt ? 'var(--scan)' : 'var(--brass)') : 'var(--brown-800)', borderColor: on ? 'var(--brass)' : 'var(--border)' }}
            >
              {on ? CHROMATIC_C7ADD13_LABELS[n] : ''}
            </div>
          )
        })}
      </div>
      <div className="hiw-chromatic-formula">C7add13 -- R·3·5·13·b7</div>
      <p className="hiw-illustration__caption">
        Since C13 and C7add13 share the same guide tones, and the 5th, 9th, and 11th intervals are all
        commonly omitted, both chords represent the same formula: R, 3rd, 7th, 13th.
      </p>
    </div>
  )
}

const STAGES = [
  {
    title: '1 · Audio capture',
    body: (
      <>
        This is the very first step of the pipeline. A single guitar strum of any voicing is recorded
        through the browser's microphone, or uploaded. Common mic constraints normally on for voice
        calls such as echo cancellation, noise suppression, auto gain, are explicitly disabled,
        since they distort a guitar chord's actual harmonic content. After the audio is gathered, it is
        run through precomputation steps to get a CQT spectrogram ready for detection, which includes
        onset trimming, clip compression, RMS normalization, transient suppression, dataset z-scoring,
        and winsorizing.
      </>
    ),
    illustration: <AudioCaptureIllustration />,
  },
  {
    title: '2 · CNN classification',
    body: (
      <>
        Once the audio becomes a spectrogram, it's fed to a multi-task CNN. This CNN doesn't predict a
        fixed list of chord names. Instead, it predicts three things directly: which notes are sounding,
        the root, and the bass. Since it's trained on the foundation of music theory, rather than the
        output of it, this CNN can be used to find any combination of root, quality, and inversion, even
        if it hasn't been trained on all possible combinations. This is the bulk of BetterChord's work.
        That said, some known difficulties include complicated or niche chord qualities, inversions, and
        higher fret (12+) voicings.
      </>
    ),
    illustration: <CnnDiagramIllustration />,
  },
  {
    title: '3 · Chord Identification & parsing',
    body: (
      <>
        The model's raw notes/root/bass data become an actual chord name via a rule-based engine. Every
        chord string in the app flows through one shared parser. This step alone reaches{' '}
        <span className="readout">98%+</span> root accuracy on the test set, with no AI involved, just
        pure deep learning.
      </>
    ),
    illustration: <ChordIdIllustration />,
  },
  {
    title: '4 · Voicing lookup',
    body: (
      <>
        The chord is looked up in a dedicated voicings database, that contains real fretboard shapes,
        grouped into Must Know, Other, and Capo sections, along with each note tagged with the interval
        it plays. That's what drives the color-coded, interval-labeled fretboard diagrams. This allows
        any user to practice and try out other voicings along the fretboard they can play.
      </>
    ),
    illustration: <VoicingLookupIllustration />,
  },
  {
    title: '5 · Song lookup',
    body: (
      <>
        In parallel, the chord is looked up in a separate songs database, returning real songs that use
        it. It contains information such as the title, artist, and links out to Ultimate Guitar to learn
        the full song. This allows the user to find songs that they may like to practice the chord
        BetterChord outputted.
      </>
    ),
    illustration: <SongLookupIllustration />,
  },
  {
    title: '6 · Guide-tone connections',
    body: (
      <>
        Where relevant, the results page surfaces guide-tone relationships. These are chord groups that
        share the same essential 3rd/7th "guide tones" as the one you looked up, with a plain-language
        explanation of the connection.
      </>
    ),
    illustration: <GuideToneIllustration />,
  },
]

function HowItWorks() {
  return (
    <div className="section how-it-works-page">
      <h1>How BetterChord Works</h1>
      <p className="how-it-works-intro">
        From a recorded strum (or a typed chord name) to voicings and songs. Here's the real pipeline
        behind the app.
      </p>

      <div className="hiw-pipeline">
        <div className="hiw-pipeline__spine" aria-hidden="true" />
        <div className="hiw-pipeline__spine-dot hiw-pipeline__spine-dot--top" aria-hidden="true" />
        <div className="hiw-pipeline__spine-dot hiw-pipeline__spine-dot--bottom" aria-hidden="true" />
        {STAGES.map((stage, i) => (
          <div className={`hiw-stage${i % 2 === 1 ? ' hiw-stage--reverse' : ''}`} key={stage.title}>
            <div className="hiw-stage__illustration">{stage.illustration}</div>
            <div className="hiw-stage__number">{i + 1}</div>
            <div className="panel hiw-stage__text">
              <h3>{stage.title}</h3>
              <p>{stage.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HowItWorks
