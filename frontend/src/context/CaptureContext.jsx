import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { identifyAudio } from '../lib/api'
import { decodeContainerAudio } from '../lib/decodeContainerAudio'

// TEMPORARY on-device diagnostics. When true, the quality-check flow
// reports its current step as visible text in the Preview modal (see
// CaptureModal.jsx) so a hang on a real phone shows which step stalled,
// with no remote debugger. Flip to false (or delete every reference) to
// remove.
export const CAPTURE_DIAGNOSTICS = true

// Blunt, unconditional wall-clock ceiling on the ENTIRE quality check
// (fast decode + WebCodecs demux + <video> tap). A plain timer at the
// effect level forces the graceful failure regardless of whether any
// inner promise/AbortSignal ever settles -- a video-container upload on
// iOS was seen stuck on "checking recording quality..." for 2+ minutes
// because an inner await never resolved and never saw the abort. This
// timer does not depend on any of that machinery.
const QUALITY_CHECK_HARD_TIMEOUT_MS = 7000

const CaptureContext = createContext(null)

// Very quiet by this peak-amplitude threshold (0.0-1.0 scale) gets flagged.
// Deliberately a light heuristic, not the full spectrogram-visualization
// system (that's a separate later phase per CLAUDE.md). Exported -- both
// the waveform's y-axis reference line and the recording-status readout
// (Waveform.jsx / RecordingInfo.jsx) key off this exact same constant,
// rather than a second hardcoded copy of the number.
export const QUIET_PEAK_THRESHOLD = 0.05

// Peaks at/above this are flagged as clipping risk -- real samples don't
// literally need to hit 1.0 to already sound distorted, so the line sits
// just under full scale rather than exactly at it.
export const CLIPPING_PEAK_THRESHOLD = 0.97

// Peak/RMS over channel 0 -- the same one-channel analysis decodeAudioData
// and the media-element fallback both feed into.
function summarizeChannel(channel, { sampleRate, channelCount, format, deviceLabel }) {
  let peak = 0
  let sumSquares = 0
  for (let i = 0; i < channel.length; i++) {
    const abs = Math.abs(channel[i])
    if (abs > peak) peak = abs
    sumSquares += channel[i] * channel[i]
  }
  const rms = Math.sqrt(sumSquares / channel.length)
  return {
    peak,
    rms,
    quiet: peak < QUIET_PEAK_THRESHOLD,
    clipping: peak >= CLIPPING_PEAK_THRESHOLD,
    sampleRate,
    channelCount,
    format,
    deviceLabel,
  }
}

function abortRace(signal) {
  return new Promise((_, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
}

// Last-resort container decode: play the blob through a real <video>
// element (which CAN demux formats decodeAudioData rejects) and tap its
// output into PCM via MediaElementAudioSourceNode. Real-time and
// gesture-gated on iOS -- only reached after decodeContainerAudio()
// declines. Every await races the abort signal, but the caller's blunt
// wall-clock timer is what actually guarantees no hang. `report` is the
// diagnostic step reporter (no-op unless CAPTURE_DIAGNOSTICS).
async function decodeViaMediaElement(blob, signal, report = () => {}) {
  const url = URL.createObjectURL(blob)
  const el = document.createElement('video') // <video> accepts video MIME types that <audio> rejects outright
  el.src = url
  el.preload = 'auto'
  el.playsInline = true
  el.playbackRate = 2 // halve the real-time cost; peak/RMS are rate-invariant and the waveform is a whole-clip downsample
  // NOT muted -- a muted (or volume: 0) element outputs silence through
  // MediaElementAudioSourceNode (verified); a GainNode at 0 keeps it
  // inaudible while the graph still pulls real samples. Kept in the DOM
  // so createMediaElementSource has a connected element to read.
  el.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(el)

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  let ctx
  try {
    report('video tap: loading media element...')
    await Promise.race([
      new Promise((resolve, reject) => {
        el.onloadedmetadata = resolve
        el.onerror = () => reject(new Error('media element could not load the file'))
      }),
      abortRace(signal),
    ])
    ctx = new AudioContextClass()
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

    const source = ctx.createMediaElementSource(el)
    const silent = ctx.createGain()
    silent.gain.value = 0
    const chunks = []
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      chunks.push(e.inputBuffer.getChannelData(0).slice())
    }
    source.connect(processor)
    processor.connect(silent)
    silent.connect(ctx.destination)

    report('video tap: starting playback...')
    await Promise.race([el.play(), abortRace(signal)])
    report('video tap: capturing audio (real time)...')
    await Promise.race([
      new Promise((resolve, reject) => {
        el.onended = resolve
        el.onerror = () => reject(new Error('media element errored during playback'))
      }),
      abortRace(signal),
    ])

    source.disconnect()
    processor.disconnect()
    silent.disconnect()

    report('video tap: assembling PCM...')
    let total = 0
    for (const c of chunks) total += c.length
    if (total === 0) throw new Error('media element produced no audio samples')
    const channel = new Float32Array(total)
    let offset = 0
    for (const c of chunks) {
      channel.set(c, offset)
      offset += c.length
    }
    return { channel, sampleRate: ctx.sampleRate }
  } finally {
    el.pause()
    el.removeAttribute('src')
    el.load()
    el.remove()
    URL.revokeObjectURL(url)
    if (ctx) ctx.close().catch(() => {})
  }
}

// All capture/record/upload/quality-check/identify state lives here instead
// of on a /preview route, so the same in-progress capture can be triggered
// from (and overlay on top of) any page -- Home, Results, wherever
// CapturePanel is rendered. CaptureModal (mounted once, below) reads this
// same state and renders as a fixed overlay; navigating never happens until
// Continue succeeds.
export function CaptureProvider({ children }) {
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false) // mic granted, waiting for explicit "Start Recording"
  const [arming, setArming] = useState(false) // getUserMedia request in flight
  const [armError, setArmError] = useState(null) // failed getUserMedia's err.name (e.g. 'NotAllowedError'), or null
  const [recording, setRecording] = useState(false)
  const [blob, setBlob] = useState(null)
  const [filename, setFilename] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [quality, setQuality] = useState(null) // { peak, rms, quiet } | 'error' | null (checking)
  const [waveformData, setWaveformData] = useState(null) // decoded Float32Array (channel 0) | null
  const [identifying, setIdentifying] = useState(false)
  const [error, setError] = useState('')
  const [diag, setDiag] = useState(null) // TEMPORARY -- current quality-check step, shown when CAPTURE_DIAGNOSTICS

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  // Captured from the live MediaStream's audio track while it still exists
  // (recording stops its tracks in onstop) -- record path only. Cleared on
  // selectFile/close so a stale label from a previous recording session
  // never leaks into an unrelated upload.
  const deviceLabelRef = useRef(null)

  // Object URLs must be created as a side effect (useEffect), not during
  // render (e.g. useMemo) -- creating it in useMemo was a real bug found in
  // the old /preview page: React's dev-mode StrictMode double-invokes
  // render, so a useMemo whose factory calls URL.createObjectURL runs
  // twice per mount, minting two different URLs for the same blob, with
  // only one becoming <audio src> while cleanup could revoke either one --
  // a real create/revoke race. Doing it here ties exactly one created URL
  // to exactly one cleanup, regardless of how many times render runs.
  useEffect(() => {
    if (!blob) {
      setAudioUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  // Single decode per blob, shared by both the quality check (peak/RMS) and
  // the waveform display -- decodeAudioData is not cheap, and there's no
  // reason to run it twice for the same blob. `waveformData` is a plain
  // copy (via .slice()) of the decoded channel, not a live view into
  // `decoded`/`ctx`, so it stays valid after this effect's scope ends.
  useEffect(() => {
    if (!blob) {
      setQuality(null)
      setWaveformData(null)
      setDiag(null)
      return
    }
    let cancelled = false
    let settled = false
    setQuality(null)
    setWaveformData(null)
    setDiag(null)

    // Best-effort inner-unwind signal for the fallback chain. The blunt
    // timer below calls .abort() too, but the UI outcome never depends
    // on this propagating.
    const fallbackAbort = new AbortController()

    const report = CAPTURE_DIAGNOSTICS
      ? (msg) => {
          if (!cancelled && !settled) setDiag(msg)
        }
      : () => {}

    // The one thing that must always happen: whoever gets here first
    // (analyze resolving, analyze throwing, or the hard timer) settles
    // the state once and locks everyone else out.
    const finish = (apply) => {
      if (cancelled || settled) return
      settled = true
      clearTimeout(hardTimer)
      try {
        fallbackAbort.abort()
      } catch {
        // AbortController.abort() shouldn't throw, but never let cleanup break the finish
      }
      apply()
    }

    const hardTimer = setTimeout(() => {
      finish(() => {
        setDiag((prev) => `${prev || '(no step reported)'}  [TIMED OUT -- this step never completed]`)
        setQuality('error')
      })
    }, QUALITY_CHECK_HARD_TIMEOUT_MS)

    // -> { channel, sampleRate, channelCount, format } | throws
    async function analyze() {
      const format = blob.type
      report('trying fast decode (decodeAudioData)...')
      try {
        const arrayBuffer = await blob.arrayBuffer()
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        const ctx = new AudioContextClass()
        const decoded = await ctx.decodeAudioData(arrayBuffer)
        ctx.close()
        return {
          channel: decoded.getChannelData(0).slice(),
          sampleRate: decoded.sampleRate,
          channelCount: decoded.numberOfChannels,
          format,
        }
      } catch {
        report('fast decode rejected -- trying WebCodecs demux...')
      }

      // Fast, gesture-free WebCodecs path first (mp4box + AudioDecoder);
      // the real-time <video> tap only if that declines. Both channel-0
      // only, same as the fast path's analysis.
      let via = await decodeContainerAudio(blob, fallbackAbort.signal, report)
      if (!via && !fallbackAbort.signal.aborted) {
        report('WebCodecs path declined -- trying <video>-element tap...')
        via = await decodeViaMediaElement(blob, fallbackAbort.signal, report)
      }
      if (!via) throw new Error('all container fallbacks failed')
      return { channel: via.channel, sampleRate: via.sampleRate, channelCount: 1, format }
    }

    analyze()
      .then((result) =>
        finish(() => {
          report('analyzing levels...')
          setQuality(
            summarizeChannel(result.channel, {
              sampleRate: result.sampleRate,
              channelCount: result.channelCount,
              format: result.format,
              deviceLabel: deviceLabelRef.current,
            })
          )
          setWaveformData(result.channel.slice())
          setDiag(null)
        })
      )
      .catch(() => finish(() => setQuality('error')))

    return () => {
      cancelled = true
      clearTimeout(hardTimer)
      try {
        fallbackAbort.abort()
      } catch {
        // ignore
      }
    }
  }, [blob])

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  // Step 1 of 2: clicking "Record" arms the mic but does NOT start capturing.
  // getUserMedia is requested here (not deferred to beginRecording) so the
  // stream is already live by the time the user hits the big "Start
  // Recording" button on the ready screen -- capture then begins with
  // effectively zero latency, matching how real recording-tool UIs feel
  // (permission friction happens while the user is still getting ready,
  // not at the moment they've committed to "go").
  async function armRecording() {
    setError('')
    setArmError(null)
    setBlob(null)
    setOpen(true)
    setArmed(false)
    setRecording(false)
    setArming(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      streamRef.current = stream
      deviceLabelRef.current = stream.getAudioTracks()[0]?.label || null
      setArmed(true)
    } catch (err) {
      // Store the DOMException name so CaptureModal can show cause-specific
      // copy (NotAllowedError / NotFoundError / NotReadableError / other).
      setArmError(err.name || 'UnknownError')
    } finally {
      setArming(false)
    }
  }

  // Step 2 of 2: the explicit "Start Recording" click on the ready screen.
  // The stream already exists (from armRecording), so this only sets up
  // and starts the MediaRecorder -- no further permission/setup delay.
  function beginRecording() {
    const stream = streamRef.current
    if (!stream) return

    const mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 256000 })
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const mimeType = mediaRecorder.mimeType
      const newBlob = new Blob(chunksRef.current, { type: mimeType })
      const extension = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'wav'
      setBlob(newBlob)
      setFilename(`recording.${extension}`)
      setRecording(false)
    }

    mediaRecorderRef.current = mediaRecorder
    setArmed(false)
    setRecording(true)
    mediaRecorder.start()
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  function selectFile(file) {
    if (!file) return
    releaseStream()
    deviceLabelRef.current = null // upload path -- no input device to disclose
    setError('')
    setArmError(null)
    setArming(false)
    setArmed(false)
    setRecording(false)
    setBlob(file)
    setFilename(file.name)
    setOpen(true)
  }

  function close() {
    if (recording) {
      mediaRecorderRef.current?.stop()
    }
    releaseStream()
    deviceLabelRef.current = null
    setOpen(false)
    setArmed(false)
    setArming(false)
    setArmError(null)
    setRecording(false)
    setBlob(null)
    setFilename(null)
    setQuality(null)
    setError('')
    setIdentifying(false)
  }

  async function handleContinue() {
    setIdentifying(true)
    setError('')
    try {
      const result = await identifyAudio(blob, filename)
      close()
      navigate(`/chord/${encodeURIComponent(result.chord_name)}`, {
        state: {
          fromAudio: true,
          confidence: result.identified?.confidence,
          identified: result.identified,
        },
      })
    } catch (err) {
      setError(err.message)
      setIdentifying(false)
    }
  }

  const value = {
    open,
    armed,
    arming,
    armError,
    recording,
    blob,
    audioUrl,
    quality,
    waveformData,
    identifying,
    error,
    diag,
    armRecording,
    beginRecording,
    stopRecording,
    selectFile,
    handleContinue,
    close,
  }

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>
}

export function useCapture() {
  const ctx = useContext(CaptureContext)
  if (!ctx) throw new Error('useCapture must be used within a CaptureProvider')
  return ctx
}
