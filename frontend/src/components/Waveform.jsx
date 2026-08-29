import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { amplitudeToDbClamped, METER_MIN_DB } from '../lib/audioUnits'
import { QUIET_PEAK_THRESHOLD, CLIPPING_PEAK_THRESHOLD } from '../context/CaptureContext'
import './Waveform.css'

const BAR_COUNT = 96
// Total canvas height; TOP_MARGIN + BOTTOM_AXIS_HEIGHT are reserved, the
// rest is the bar plot.
const CANVAS_HEIGHT = 160
// Room at the very top for the playhead's triangular "grab" handle.
const TOP_MARGIN = 14
// Room at the bottom for the tick marks only -- the timestamp text is a
// real DOM row below the canvas (.waveform__time-axis in Waveform.css).
const BOTTOM_AXIS_HEIGHT = 8
const BAR_AREA_BOTTOM = CANVAS_HEIGHT - BOTTOM_AXIS_HEIGHT
const BAR_AREA_HEIGHT = BAR_AREA_BOTTOM - TOP_MARGIN
const HALF_BAR_AREA = BAR_AREA_HEIGHT / 2
// The vertical center of the bar-plot area represents true silence (the
// domain's own bottom, see dbToHalfExtent()); its top/bottom edges
// represent the domain's own top. Bars are drawn as a symmetric envelope
// around this line.
const CENTER_Y = TOP_MARGIN + HALF_BAR_AREA

// Playhead handle geometry -- also used to make the vertical playhead
// line start exactly where the handle's point ends, so the two read as
// one continuous mark instead of a triangle floating above a gap.
const HANDLE_W = 9
const HANDLE_H = 7
// The playhead line's bottom -- the canvas's bottom edge, the same
// endpoint the tick marks reach, so line/ticks/timestamp read as one
// connected column.
const PLAYHEAD_BOTTOM = CANVAS_HEIGHT

const MIN_BAR_HEIGHT = 4
const BASELINE_HEIGHT = 2

// dB headroom added above THIS clip's own peak when picking the height-
// mapping domain's top (see the component's own top comment) -- a small
// buffer so the peak bar doesn't literally touch the top edge, matching
// real meter convention.
const HEADROOM_DB = 3

// Bars at/above this fraction of THIS clip's own loudest moment are the
// signature "strum" bars -- relative to the recording's own dynamics,
// unrelated to any of the dB domains below. --scan stays exclusively
// this signature moment.
const SIGNATURE_THRESHOLD = 0.86
// A bar not yet reached by the playhead dims to this fraction, showing
// playback progress. This is the only alpha modulation on ramp/error
// bars -- a different concept from "how loud is this bar", which the
// loudness ramp's own hue/lightness encodes.
const UNPLAYED_ALPHA_MULT = 0.72

const QUIET_DB = amplitudeToDbClamped(QUIET_PEAK_THRESHOLD)
const CLIP_DB = amplitudeToDbClamped(CLIPPING_PEAK_THRESHOLD)

// Clean, round dB values a y-axis label is allowed to snap to -- METER_MIN_DB
// (-60) is always one of these by construction, so the domain's fixed
// floor always gets a real label regardless of what the adaptive top is
// doing.
const NICE_DB_STEPS = [0, -10, -20, -30, -40, -50, -60]

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const int = parseInt(full, 16)
  if (isNaN(int)) return { r: 200, g: 155, b: 92 }
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function lerpRgb(c1, c2, t) {
  return {
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t,
  }
}

// 5-stop copper/rust "how loud is this moment" ramp (--loudness-quiet..
// --loudness-peak, index.css) -- a neutral intensity signal, distinct
// from --brass (control accent) and --error (the over-threshold state,
// handled separately in draw() before this is called). `stops` is the
// 5-color array resolved from those CSS custom properties. loDb/hiDb are
// THIS clip's own measured dB range (colorDomainRef), so every recording
// uses the full ramp across its own content.
function loudnessColorRgb(db, stops, loDb, hiDb) {
  const span = Math.max(hiDb - loDb, 0.001)
  const t = Math.min(1, Math.max(0, (db - loDb) / span))
  const segments = stops.length - 1
  const scaled = t * segments
  const idx = Math.min(segments - 1, Math.floor(scaled))
  const localT = scaled - idx
  return lerpRgb(stops[idx], stops[idx + 1], localT)
}

// Distance from CENTER_Y (in px) that a given dB value should sit at,
// within the bar-plot half-height. `domainTopDb` is the CEILING of the
// height-mapping domain -- see the component's own top comment for why
// this is a scale independent of both the fixed reference-line
// thresholds and the clip-relative color domain above. The domain's
// floor is always METER_MIN_DB (fixed) -- only the top adapts, per clip.
function dbToHalfExtent(db, domainTopDb) {
  const top = Math.min(0, domainTopDb)
  const span = top - METER_MIN_DB
  if (span <= 0) return 0
  const clamped = Math.max(METER_MIN_DB, Math.min(top, db))
  const frac = (clamped - METER_MIN_DB) / span
  return frac * HALF_BAR_AREA
}

function pickTickInterval(duration) {
  if (!duration || duration <= 0) return 1
  if (duration <= 4) return 1
  if (duration <= 12) return 2
  if (duration <= 30) return 5
  if (duration <= 90) return 15
  return 30
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Standard canvas-HiDPI setup: size the buffer at cssSize *
// devicePixelRatio, keep the CSS box in CSS px, and pre-scale the
// context so draw calls stay in CSS-px coordinates.
function configureCanvasForDpr(canvas, cssWidth, cssHeight) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssWidth * dpr))
  canvas.height = Math.max(1, Math.round(cssHeight * dpr))
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

// Canvas waveform + custom minimal transport (play/pause + time),
// paired with an <audio> element the caller owns (passed via `audioRef`,
// hidden -- see CaptureModal.jsx). The only seek surface -- the native
// <audio controls> scrub bar is not shown.
//
// Three independent scales, each answering a different question:
//   1. Reference lines (QUIET_DB/CLIP_DB) -- fixed absolute dB values,
//      identical across recordings, so a line always means the same
//      loudness.
//   2. Bar HEIGHT -- dB-based, through a domain whose FLOOR is fixed
//      (METER_MIN_DB, so a quiet clip still reads quiet against the
//      reference lines) and whose CEILING adapts to
//      `min(0, thisClipsPeakDb + HEADROOM_DB)`, so a normal recording's
//      peak reaches near the top of the box.
//   3. Bar COLOR -- the copper loudness ramp, relative to THIS clip's
//      own measured range (`colorDomainRef`), so every recording uses
//      the full ramp. --error is carved out SEPARATELY, before the ramp
//      applies: a bar whose absolute dB crosses CLIP_DB gets --error
//      directly, so --error stays a sparse absolute-threshold signal.
// --scan is spent in exactly one place: bars at/above
// SIGNATURE_THRESHOLD of the clip's own loudest moment.
//
// Bar alpha is only `played ? 1 : UNPLAYED_ALPHA_MULT` -- not a second
// loudness signal (that's the ramp's hue/lightness).
function Waveform({ channelData, audioRef }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const peaksRef = useRef([])
  const overallMaxRef = useRef(0.0001)
  const domainTopDbRef = useRef(0)
  const colorDomainRef = useRef({ min: METER_MIN_DB, max: 0 })
  const sizeRef = useRef({ width: 0, height: CANVAS_HEIGHT })
  const rafRef = useRef(null)
  const isDraggingRef = useRef(false)
  const colorsRef = useRef({
    loudnessStops: [
      { r: 129, g: 73, b: 50 },
      { r: 157, g: 83, b: 52 },
      { r: 168, g: 87, b: 54 },
      { r: 217, g: 123, b: 79 },
      { r: 242, g: 162, b: 104 },
    ],
    errorRgb: { r: 226, g: 104, b: 91 },
    peak: '#6fe3d6',
    peakGlow: 'rgba(111, 227, 214, 0.6)',
    baseline: 'rgba(200, 155, 92, 0.35)',
    playhead: '#f2ead9',
    handle: '#c89b5c',
    quietLine: '#a99c87',
    clipLine: '#e2685b',
    axisText: '#a99c87',
    monoFont: "'JetBrains Mono', ui-monospace, monospace",
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [domainTopDb, setDomainTopDb] = useState(0) // mirrors domainTopDbRef, for the reactive y-axis JSX below
  const [plotWidth, setPlotWidth] = useState(0) // mirrors sizeRef.current.width, for the reactive time-axis JSX below

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback
    colorsRef.current = {
      loudnessStops: [
        hexToRgb(read('--loudness-quiet', '#814932')),
        hexToRgb(read('--loudness-low', '#9d5334')),
        hexToRgb(read('--loudness-mid', '#a85736')),
        hexToRgb(read('--loudness-high', '#d97b4f')),
        hexToRgb(read('--loudness-peak', '#f2a268')),
      ],
      errorRgb: hexToRgb(read('--error', '#e2685b')),
      peak: read('--scan', '#6fe3d6'),
      peakGlow: read('--scan-border', 'rgba(111, 227, 214, 0.6)'),
      baseline: read('--brass-border', 'rgba(200, 155, 92, 0.45)'),
      playhead: read('--parchment', '#f2ead9'),
      handle: read('--brass', '#c89b5c'),
      quietLine: read('--muted', '#a99c87'),
      clipLine: read('--error', '#e2685b'),
      axisText: read('--muted', '#a99c87'),
      monoFont: read('--mono', "'JetBrains Mono', ui-monospace, monospace"),
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // Logical CSS-pixel size, NOT canvas.width/height (which are
    // devicePixelRatio-multiplied real buffer dimensions) -- every draw
    // call below stays in plain CSS-pixel coordinates thanks to the ctx
    // transform already applied in configureCanvasForDpr.
    const { width, height } = sizeRef.current
    ctx.clearRect(0, 0, width, height)

    const peaks = peaksRef.current
    if (!peaks.length || !width) return

    const { loudnessStops, errorRgb, peak, peakGlow, baseline, playhead, handle, quietLine, clipLine, axisText, monoFont } =
      colorsRef.current

    const domainTop = domainTopDbRef.current
    const { min: colorLo, max: colorHi } = colorDomainRef.current

    // Baseline -- the real "0 amplitude" / silence reference line: a
    // truly quiet stretch legitimately sits right at this line.
    ctx.fillStyle = baseline
    ctx.fillRect(0, CENTER_Y - BASELINE_HEIGHT / 2, width, BASELINE_HEIGHT)

    // Quiet / clipping reference lines -- fixed absolute dB values,
    // deliberately unaffected by either the height domain's adaptive top
    // or the color domain's per-clip range, so they stay comparable
    // across different recordings. Dashed so they read as guides, not
    // part of the data itself.
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1
    ctx.font = `600 9px ${monoFont}`
    ctx.textBaseline = 'alphabetic'

    const quietY = CENTER_Y - dbToHalfExtent(QUIET_DB, domainTop)
    ctx.strokeStyle = quietLine
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(0, quietY)
    ctx.lineTo(width, quietY)
    ctx.stroke()
    ctx.globalAlpha = 0.9
    ctx.fillStyle = quietLine
    ctx.textAlign = 'right'
    ctx.fillText('QUIET', width - 4, quietY - 3)

    const clipY = CENTER_Y - dbToHalfExtent(CLIP_DB, domainTop)
    ctx.strokeStyle = clipLine
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.moveTo(0, clipY)
    ctx.lineTo(width, clipY)
    ctx.stroke()
    ctx.globalAlpha = 0.95
    ctx.fillStyle = clipLine
    ctx.fillText('CLIP', width - 4, clipY - 3)
    ctx.restore()

    const audio = audioRef.current
    const audioDuration = audio?.duration || 0
    const audioCurrentTime = audio?.currentTime || 0
    const progress = audioDuration > 0 ? audioCurrentTime / audioDuration : 0
    const progressX = progress * width

    const gap = 1
    const barWidth = Math.max(1.5, width / peaks.length - gap)
    const overallMax = overallMaxRef.current

    peaks.forEach((amp, i) => {
      const db = amplitudeToDbClamped(amp)
      const halfExtent = dbToHalfExtent(db, domainTop)
      const barHeight = Math.max(MIN_BAR_HEIGHT, halfExtent * 2)
      const x = i * (barWidth + gap)
      const y = CENTER_Y - barHeight / 2
      const played = x + barWidth / 2 < progressX

      // isPeak is relative to THIS clip's own loudest moment (rel).
      // Checked AFTER the absolute clip-line test below: SIGNATURE_THRESHOLD
      // (0.86) and CLIPPING_PEAK_THRESHOLD (0.97 amplitude) are related
      // such that any bar over the clip line also passes the relative
      // peak test (0.97 / anyMaxUpTo1.0 >= 0.97 > 0.86), so checking
      // isPeak first would make the --error branch unreachable. Checking
      // the absolute threshold first makes --error the higher-priority
      // signal (a clipping problem matters more than "loudest moment");
      // --scan still fires for a clip whose own peak stays under the
      // clip line.
      const rel = overallMax > 0 ? amp / overallMax : 0
      const isPeak = rel >= SIGNATURE_THRESHOLD

      if (db >= CLIP_DB) {
        // Genuinely over the real, absolute clip threshold -- --error,
        // regardless of where this sits in the clip's own relative
        // range. Sparse by construction: most bars on most clips never
        // reach this branch at all.
        const alpha = played ? 1 : UNPLAYED_ALPHA_MULT
        ctx.fillStyle = `rgba(${errorRgb.r.toFixed(0)}, ${errorRgb.g.toFixed(0)}, ${errorRgb.b.toFixed(0)}, ${alpha.toFixed(3)})`
        ctx.fillRect(x, y, barWidth, barHeight)
      } else if (isPeak) {
        ctx.save()
        ctx.shadowColor = peakGlow
        ctx.shadowBlur = 10
        ctx.fillStyle = peak
        ctx.fillRect(x, y, barWidth, barHeight)
        ctx.restore()
      } else {
        // The neutral copper "how loud is this moment" ramp -- relative
        // to this clip's own quietest-to-loudest range, zero warning
        // connotation.
        const rampRgb = loudnessColorRgb(db, loudnessStops, colorLo, colorHi)
        const alpha = played ? 1 : UNPLAYED_ALPHA_MULT
        ctx.fillStyle = `rgba(${rampRgb.r.toFixed(0)}, ${rampRgb.g.toFixed(0)}, ${rampRgb.b.toFixed(0)}, ${alpha.toFixed(3)})`
        ctx.fillRect(x, y, barWidth, barHeight)
      }
    })

    // Time-axis tick MARKS only (the timestamp text is a DOM row below
    // the canvas) -- top edge at BAR_AREA_BOTTOM, bottom edge at the
    // canvas's own bottom border, so the ticks touch both boundaries.
    if (audioDuration > 0) {
      const interval = pickTickInterval(audioDuration)
      ctx.save()
      ctx.strokeStyle = axisText
      ctx.globalAlpha = 0.75
      for (let t = interval; t < audioDuration - interval * 0.25; t += interval) {
        const x = (t / audioDuration) * width
        ctx.beginPath()
        ctx.moveTo(x, BAR_AREA_BOTTOM)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      ctx.restore()
    }

    // Playhead -- ONE continuous mark: the triangular "grab" handle sits
    // flush on the canvas's own top border (y=0), the line starts exactly
    // where the handle's point ends (HANDLE_H, no gap), then runs the
    // full height through the amplitude bars AND the tick strip, ending
    // at PLAYHEAD_BOTTOM -- the SAME y the tick marks themselves reach,
    // so line/ticks/timestamp read as one connected column.
    if (audioDuration > 0) {
      ctx.save()
      ctx.strokeStyle = playhead
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(progressX, HANDLE_H)
      ctx.lineTo(progressX, PLAYHEAD_BOTTOM)
      ctx.stroke()

      ctx.fillStyle = handle
      ctx.beginPath()
      ctx.moveTo(progressX - HANDLE_W / 2, 0)
      ctx.lineTo(progressX + HANDLE_W / 2, 0)
      ctx.lineTo(progressX, HANDLE_H)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }, [audioRef])

  // Rebuild the downsampled (raw, unnormalized) peaks whenever the decoded
  // channel data changes -- also where both the height domain's adaptive
  // top and the color domain's clip-relative range get recomputed, since
  // both depend on this specific clip's own content.
  useEffect(() => {
    if (channelData && channelData.length) {
      const bucketSize = Math.max(1, Math.floor(channelData.length / BAR_COUNT))
      const peaks = new Array(BAR_COUNT).fill(0)
      for (let i = 0; i < BAR_COUNT; i++) {
        const start = i * bucketSize
        const end = i === BAR_COUNT - 1 ? channelData.length : start + bucketSize
        let max = 0
        for (let j = start; j < end; j++) {
          const abs = Math.abs(channelData[j])
          if (abs > max) max = abs
        }
        peaks[i] = max
      }
      peaksRef.current = peaks
      const peakAmp = Math.max(...peaks, 0.0001)
      overallMaxRef.current = peakAmp

      const newDomainTop = Math.min(0, amplitudeToDbClamped(peakAmp) + HEADROOM_DB)
      domainTopDbRef.current = newDomainTop
      setDomainTopDb(newDomainTop)

      const dbValues = peaks.map(amplitudeToDbClamped)
      colorDomainRef.current = { min: Math.min(...dbValues), max: Math.max(...dbValues) }
    } else {
      peaksRef.current = []
      overallMaxRef.current = 0.0001
      domainTopDbRef.current = 0
      setDomainTopDb(0)
      colorDomainRef.current = { min: METER_MIN_DB, max: 0 }
    }

    const canvas = canvasRef.current
    const container = containerRef.current
    if (canvas && container) {
      const cssWidth = container.clientWidth
      configureCanvasForDpr(canvas, cssWidth, CANVAS_HEIGHT)
      sizeRef.current = { width: cssWidth, height: CANVAS_HEIGHT }
      setPlotWidth(cssWidth)
    }
    draw()
  }, [channelData, draw])

  // Keep the canvas sized to its container (the modal widens in steps, see
  // CaptureModal.css) and redraw on resize so bars never look squashed.
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current
      if (canvas && container && sizeRef.current.width !== container.clientWidth) {
        const cssWidth = container.clientWidth
        configureCanvasForDpr(canvas, cssWidth, CANVAS_HEIGHT)
        sizeRef.current = { width: cssWidth, height: CANVAS_HEIGHT }
        setPlotWidth(cssWidth)
        draw()
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  // Drive both the canvas progress overlay/playhead and the custom
  // transport's play/pause + time readout off the same <audio> element
  // events -- one source of truth, no duplicated playback state.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    function loop() {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    function handlePlay() {
      setIsPlaying(true)
      rafRef.current = requestAnimationFrame(loop)
    }
    function handleStop() {
      setIsPlaying(false)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      draw()
    }
    function handleTimeUpdate() {
      setCurrentTime(audio.currentTime)
    }
    function handleLoaded() {
      setDuration(audio.duration || 0)
      draw()
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handleStop)
    audio.addEventListener('ended', handleStop)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('seeked', draw)
    audio.addEventListener('loadedmetadata', handleLoaded)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handleStop)
      audio.removeEventListener('ended', handleStop)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('seeked', draw)
      audio.removeEventListener('loadedmetadata', handleLoaded)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [audioRef, draw])

  function handleSeek(clientX) {
    const audio = audioRef.current
    const canvas = canvasRef.current
    if (!audio || !canvas || !audio.duration) return
    const rect = canvas.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    audio.currentTime = fraction * audio.duration
    draw()
  }

  // Pointer (not plain click) events -- covers both a simple click AND a
  // real click-and-drag scrub across the waveform, matching the visual
  // "grab the handle" affordance with actual draggable behavior.
  function handlePointerDown(e) {
    const canvas = canvasRef.current
    canvas?.setPointerCapture?.(e.pointerId)
    isDraggingRef.current = true
    setIsDragging(true)
    handleSeek(e.clientX)
  }
  function handlePointerMove(e) {
    if (!isDraggingRef.current) return
    handleSeek(e.clientX)
  }
  function handlePointerUp(e) {
    isDraggingRef.current = false
    setIsDragging(false)
    try {
      canvasRef.current?.releasePointerCapture?.(e.pointerId)
    } catch {
      /* pointer capture already released -- safe to ignore */
    }
  }

  function handleKeyDown(e) {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    if (e.key === 'ArrowRight') {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 1)
      draw()
    } else if (e.key === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 1)
      draw()
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      togglePlay()
    }
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
  }

  const progressPct = duration > 0 ? Math.round((currentTime / duration) * 100) : 0

  // Y-axis tick labels, outside the canvas -- reactive to domainTopDb
  // since the height-mapping domain's top adapts per clip. Labels snap
  // to clean round dB values (NICE_DB_STEPS) within the current domain
  // rather than a mechanical thirds split; the domain still drives where
  // bars/lines sit, only the labels are rounded.
  const axisTicks = useMemo(() => {
    const top = Math.min(0, domainTopDb)
    const bottom = METER_MIN_DB
    const candidates = NICE_DB_STEPS.filter((db) => db <= top && db >= bottom)
    let picks = candidates
    if (candidates.length > 3) {
      const lastIdx = candidates.length - 1
      const midIdx = Math.round(lastIdx / 2)
      picks = [candidates[0], candidates[midIdx], candidates[lastIdx]]
    }
    return picks.map((db) => ({
      key: db,
      label: `${db} dB`,
      y: CENTER_Y - dbToHalfExtent(db, top),
    }))
  }, [domainTopDb])

  // Timestamp labels, real DOM elements in a row beneath the canvas --
  // reactive to plotWidth so they reposition across the modal's width
  // steps.
  const timeTicks = useMemo(() => {
    if (!duration || !plotWidth) return []
    const interval = pickTickInterval(duration)
    const ticks = []
    for (let t = interval; t < duration - interval * 0.25; t += interval) {
      ticks.push({ key: t, label: formatTime(t), x: (t / duration) * plotWidth })
    }
    return ticks
  }, [duration, plotWidth])

  return (
    <div className="waveform-group">
      <div className="waveform">
        <div className="waveform__axis" style={{ height: CANVAS_HEIGHT }}>
          {axisTicks.map(({ key, label, y }) => (
            <span key={key} className="waveform__axis-tick" style={{ top: y }}>
              {label}
            </span>
          ))}
        </div>
        <div className="waveform__plot" ref={containerRef}>
          <canvas
            ref={canvasRef}
            className={`waveform__canvas${isDragging ? ' waveform__canvas--dragging' : ''}`}
            height={CANVAS_HEIGHT}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            role="slider"
            aria-label="Seek audio playback"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            tabIndex={0}
          />
          {/* Timestamp text -- immediately adjacent to the canvas's own
              bottom edge (no margin-top, see Waveform.css), directly
              beneath the tick marks drawn on the canvas itself. */}
          <div className="waveform__time-axis">
            {timeTicks.map(({ key, label, x }) => (
              <span key={key} className="waveform__time-tick" style={{ left: x }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="waveform__transport">
        <button
          type="button"
          className="waveform__play"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <span aria-hidden="true">{isPlaying ? '❙❙' : '▶'}</span>
        </button>
        <span className="waveform__time mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}

export default Waveform
