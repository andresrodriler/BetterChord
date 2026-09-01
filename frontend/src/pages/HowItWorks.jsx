import { useRef, useState } from 'react'
import Footer from '../components/Footer'
import { useAccessibilityPrefs } from '../context/AccessibilityPrefsContext'
import { getIntervalStyle } from '../lib/intervalColors'
import { stringX, fretY, fretCellY, isAnchoredAtNut, resolveBaseline } from '../lib/miniFretMath'
import './HowItWorks.css'

// The 6-stage pipeline, ported from the How It Works mockup. Two
// deviations from the mockup's own technique: (1) the architecture-
// diagram labels use CSS grid columns, not the mockup's absolute pixel
// offsets, so they reflow; (2) two copy fixes while porting -- a stray
// &nbsp; in stage 1 and a subject-verb mismatch in stage 2. The stage 2
// CNN architecture (conv1 32ch -> pool1 -> conv2 64ch -> pool2 ->
// flatten 38,976 -> 3 heads) matches betterchord/training_scripts/
// cnn_model.py.

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
// Illustrative example values (Gm: G-Bb-D), matching the mockup -- not
// live-computed.
const NOTE_PROBS = [0.06, 0.04, 0.55, 0.09, 0.05, 0.07, 0.03, 0.97, 0.06, 0.1, 0.89, 0.04]
const ACTIVE_NOTES = new Set(['G', 'Bb', 'D'])

const CHROMATIC_C13 = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'Bb'])
const CHROMATIC_C13_LABELS = { C: 'R', D: '9th', E: '3rd', F: '11th', G: '5th', A: '13th', Bb: 'b7' }
const CHROMATIC_C7ADD13 = new Set(['C', 'E', 'G', 'A', 'Bb'])
const CHROMATIC_C7ADD13_LABELS = { C: 'R', E: '3rd', G: '5th', A: '13th', Bb: 'b7' }
const GUIDE_TONES = new Set(['E', 'Bb'])

// 8 example voicing cards (C/D/Em/Gm/G/Am/F/Gm), matching the mockup's
// own chordDefs -- fills the 4-column grid as 2 rows.
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

// Role token -> shared interval-color system, so this surface can't
// drift from the fretboard dots / legend / ChordOverview if
// classifyInterval gains a context-dependent bucket. No live visual
// change -- every role this data uses (R/3/b3/5/b7) mapped 1:1 in the
// old hardcoded map.
const ROLE_TOKEN = { R: '1', 3: '3', b3: 'm3', 5: '5', b7: 'b7' }

// Resolves a role token through classifyInterval/getIntervalStyle.
// These are all plain root/3rd/5th/7th tones, so no `formula` is needed
// -- the sus/extension branches are formula-gated and skip when it's
// absent.
function roleIntervalStyle(role) {
  return getIntervalStyle(ROLE_TOKEN[role] || role)
}

const EXAMPLE_SONGS = [
  { title: 'Creep', artist: 'Radiohead', chords: 'G · B · C · Cm' },
  { title: 'Hallelujah', artist: 'Jeff Buckley', chords: "C# · Bbm · F# · Ab · F7" },
  { title: 'Riptide', artist: 'Vance Joy', chords: "Bbm · Ab · C# · F#maj7" },
]

// Grid coordinate math lives in lib/miniFretMath.js -- shared with
// Home's AmbientFretboards. See that file for the alignment-bug history
// it fixes.
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
          const style = role ? roleIntervalStyle(role) : null
          return (
            <div
              key={i}
              className="hiw-voicing-card__dot"
              style={{
                left: `${leftPct}%`,
                top: `${fretCellY(row, rows)}%`,
                background: style?.fill || 'var(--brass)',
                borderColor: style?.stroke || 'var(--brass-border)',
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

// The mockup's audio player is bespoke: a 32px circular brass
// play/pause button, a 36-bar waveform (heights from this seed), a time
// label, and a hidden native <audio> as the playback engine -- not a
// browser `<audio controls>` bar. Seed + played/unplayed color logic
// ported from the mockup.
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

// Each conv/pool step is a layered, angled "card stack" (offset divs,
// rotateY(18deg), each layer a step lighter) -- literal hex from the
// mockup, kept literal (one-off illustration effect, same precedent as
// DetectionBadge's ripple colors). Conv = 4 layers, pool = 3 smaller.
const CNN_LAYER_COLORS = {
  conv1: ['#3a2318', '#6b3a26', '#a5573a', '#d9895c'],
  pool1: ['#6b3a26', '#a5573a', '#e5a583'],
  conv2: ['#253026', '#3f5745', '#6b8a76', '#8faf9b'],
  pool2: ['#3f5745', '#6b8a76', '#a8c2b1'],
}
const CNN_LAYER_TOP_BORDER = { conv1: '#eaa87f', pool1: '#f2c4ab', conv2: '#b3c9bc', pool2: '#c8dbd0' }

// The diagram is ONE CSS grid for the whole panel (grid-template-rows:
// 36px 46px 34px; grid-auto-flow: column), not a Conv/Pool column
// repeated 4 times. Conv and Pool boxes align by sharing row 2. Pool's
// label+dims and the Flatten label+bars are individually
// position:absolute at literal mockup px. The 5 connector arrows are
// separate absolute <svg> overlays at fixed left offsets (all top:77px)
// -- 3 with an arrowhead (stage transitions), 2 plain lines
// (Conv->Pool). The panel has a fixed 442px width inside the 980px page
// column, so literal px positioning here carries no page-reflow risk.
// cnnStack() below is pure visual repetition, not a layout abstraction.
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

// Arrow geometry: 5 segments (left/width/hasHead), all at the mockup's
// top:77px.
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
  // BASS's color is a one-off mauve (#b6788a), matching no interval
  // token. NOTES (#8faf9b) and ROOT (#d9895c) do match --interval-3rd
  // and --interval-root, so those stay tokens.
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

// A shared-origin fan of 3 diverging colored SVG paths into NOTES/ROOT/
// BASS -- mockup geometry (viewBox 0 0 26 122, all starting at (1,61),
// fanning to (20,15)/(20,61)/(20,107)), each with its own colored
// arrowhead. Colors match each head's dot.
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
                  // Mockup colors: active = --scan; inactive =
                  // --hiw-tag-border (#4a3826).
                  background: ACTIVE_NOTES.has(note) ? 'var(--scan)' : 'var(--hiw-tag-border)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="hiw-note-bars__labels">
          {NOTE_NAMES.map((note) => (
            // Mockup label colors: active = --muted; inactive = a
            // one-off #5a4632.
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
          // Mockup: 3 tiers -- guide tones (E, Bb) = --scan; D and F
          // (C13 extension tones, not guide tones) = --border;
          // everything else = a one-off #5a4632.
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
  // Subscribes the whole page (and un-memoized children) to the
  // colorblind toggle -- see IntervalLegend.jsx.
  useAccessibilityPrefs()
  // Drives the mobile-only accordion (<=900px, HowItWorks.css). Desktop
  // ignores this -- every stage renders expanded there. `null` = all
  // collapsed; starts with step 1 open.
  const [openStage, setOpenStage] = useState(0)
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
        {STAGES.map((stage, i) => {
          const open = openStage === i
          return (
            <div
              className={`hiw-stage${i % 2 === 1 ? ' hiw-stage--reverse' : ''} ${open ? 'hiw-stage--open' : 'hiw-stage--collapsed'}`}
              key={stage.title}
            >
              {/* Accordion header -- display:none on desktop, so it takes
                  no grid slot there and the timeline layout is unchanged.
                  On mobile it's the whole tap target; the number is
                  already in stage.title ("1 · ..."). */}
              <button
                type="button"
                className="hiw-stage__acc-header"
                aria-expanded={open}
                aria-controls={`hiw-stage-illus-${i} hiw-stage-body-${i}`}
                onClick={() => setOpenStage((c) => (c === i ? null : i))}
              >
                <span className="hiw-stage__acc-title">{stage.title}</span>
                <svg className="hiw-stage__acc-chevron" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="hiw-stage__illustration" id={`hiw-stage-illus-${i}`}>{stage.illustration}</div>
              <div className="hiw-stage__number">{i + 1}</div>
              <div className="panel hiw-stage__text" id={`hiw-stage-body-${i}`}>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </div>
            </div>
          )
        })}
      </div>

      <Footer />
    </div>
  )
}

export default HowItWorks
