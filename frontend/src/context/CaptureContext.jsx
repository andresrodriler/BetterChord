import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { identifyAudio } from '../lib/api'
import { decodeContainerAudio, isIsoBmff } from '../lib/decodeContainerAudio'

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

// Reset a persistent tap element for a fresh load WITHOUT tearing down its
// AudioContext / MediaElementSourceNode -- createMediaElementSource can be
// called only once per element for the life of the document, so the graph
// (built lazily on first use, see tapMediaElement) has to outlive any one
// call.
function resetTapEl(el) {
  try {
    el.pause()
  } catch {
    // pausing an element that never started is a no-op / harmless throw
  }
  el.onloadedmetadata = el.oncanplay = el.onerror = el.onended = null
  while (el.firstChild) el.removeChild(el.firstChild)
  el.removeAttribute('src')
  try {
    el.load() // back to NETWORK_EMPTY
  } catch {
    // ignore
  }
}

// One media-element tap attempt against a single persistent element
// (holder.audioEl or holder.videoEl). Loads the blob (re-typed to
// `mimeType`), unmutes right before the graph tap, plays it through at 2x
// and captures channel 0 into PCM. Throws on any failure so
// decodeViaMediaElement can move on to the next element.
async function tapMediaElement(holder, kind, mimeType, blob, signal) {
  const el = holder[`${kind}El`]
  const source = mimeType === blob.type ? blob : new Blob([blob], { type: mimeType })
  const url = URL.createObjectURL(source)

  resetTapEl(el)
  el.muted = true
  el.preload = 'auto'
  const sourceEl = document.createElement('source')
  sourceEl.type = mimeType
  sourceEl.src = url
  el.appendChild(sourceEl)

  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        el.onloadedmetadata = resolve
        el.oncanplay = resolve
        el.onerror = () => reject(new Error('could not load the file'))
        el.load() // handlers set first, then load -- no missed early error
      }),
      abortRace(signal),
    ])

    // Build this element's AudioContext + source node once, then reuse it
    // on every later call (createMediaElementSource is one-shot per
    // element -- a second call, even in a fresh context, throws).
    let graph = holder[`${kind}Graph`]
    if (!graph) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioContextClass()
      graph = { ctx, srcNode: ctx.createMediaElementSource(el) }
      holder[`${kind}Graph`] = graph
    }
    const { ctx, srcNode } = graph
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

    el.muted = false // right before the tap -- a muted element feeds silence into the graph
    const silent = ctx.createGain()
    silent.gain.value = 0
    const chunks = []
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      chunks.push(e.inputBuffer.getChannelData(0).slice())
    }
    srcNode.connect(processor)
    processor.connect(silent)
    silent.connect(ctx.destination)

    try {
      el.playbackRate = 2 // halve the real-time cost; set after load so it isn't reset
      await Promise.race([el.play(), abortRace(signal)])
      await Promise.race([
        new Promise((resolve, reject) => {
          el.onended = resolve
          el.onerror = () => reject(new Error('errored during playback'))
        }),
        abortRace(signal),
      ])
    } finally {
      // Drop only this call's nodes; keep srcNode + ctx alive for reuse.
      try {
        srcNode.disconnect(processor)
      } catch {
        // not connected (loadedmetadata resolved but play() threw before connect)
      }
      try {
        processor.disconnect()
      } catch {
        // ignore
      }
      try {
        silent.disconnect()
      } catch {
        // ignore
      }
    }

    let total = 0
    for (const c of chunks) total += c.length
    if (total === 0) throw new Error('produced no audio samples')
    const channel = new Float32Array(total)
    let offset = 0
    for (const c of chunks) {
      channel.set(c, offset)
      offset += c.length
    }
    return { channel, sampleRate: ctx.sampleRate }
  } finally {
    resetTapEl(el)
    URL.revokeObjectURL(url)
  }
}

// Last-resort container decode: play the blob through a real media element
// (which CAN demux formats decodeAudioData rejects) and tap its output into
// PCM via MediaElementAudioSourceNode. Real-time and gesture-gated on iOS
// -- only reached after decodeContainerAudio() declines. Every await races
// the abort signal, but the caller's blunt wall-clock timer is what
// actually guarantees no hang.
//
// Two structural choices here, both aimed at iOS Safari (verified only in
// Chromium locally -- real-device confirmation still owed):
//
//   1. Persistent elements. `holder` carries one <audio> and one <video>
//      created once at provider mount (see CaptureProvider), not built ad
//      hoc inside this function each call. iOS media gating tends to be
//      stricter on elements a script synthesizes mid-flow than on ones
//      that are part of the page from load.
//
//   2. <audio> first for mp4/mov. An ISOBMFF container's audio track is
//      AAC-in-mp4, structurally identical to an .m4a -- so it's tried
//      through a frameless <audio> element (presented as audio/mp4), with
//      <video> as the fallback. WebKit's "elements only begin playing
//      when visible on-screen" restriction is about video FRAME
//      rendering; an <audio> element has no frame, so it may load a
//      video-container blob on iOS where <video> won't. Non-ISOBMFF video
//      (webm/ogg with a real video track) still goes straight to <video>,
//      presented exactly as before.
//
// iOS media-loading requirements this still follows (webkit.org/blog/6784):
// playsinline + preload set before the source, muted through load then
// unmuted right before the tap, element in the DOM and not display:none.
async function decodeViaMediaElement(blob, signal, holder) {
  if (!holder) throw new Error('persistent media elements not ready')

  let head
  try {
    head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  } catch {
    head = new Uint8Array()
  }

  // Preserve the pre-existing normalization exactly for the <video>
  // fallback: only audio/* and an exact video/mp4 pass through; anything
  // else (video/webm, video/ogg, ...) is presented as video/mp4, which is
  // what shipped and what Chromium testing covered.
  const videoFallbackType =
    /^audio\//.test(blob.type) || blob.type === 'video/mp4' ? blob.type : 'video/mp4'

  const plan = /^audio\//.test(blob.type)
    ? [['audio', blob.type]]
    : isIsoBmff(head)
      ? [
          ['audio', 'audio/mp4'],
          ['video', 'video/mp4'],
        ]
      : [['video', videoFallbackType]]

  let lastErr
  for (let i = 0; i < plan.length; i++) {
    if (signal?.aborted) throw new Error('aborted')
    const [kind, mimeType] = plan[i]
    try {
      return await tapMediaElement(holder, kind, mimeType, blob, signal)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('media-element tap failed')
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

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  // Captured from the live MediaStream's audio track while it still exists
  // (recording stops its tracks in onstop) -- record path only. Cleared on
  // selectFile/close so a stale label from a previous recording session
  // never leaks into an unrelated upload.
  const deviceLabelRef = useRef(null)

  // Page-lifetime hidden media elements for the last-resort media-element
  // tap (decodeViaMediaElement). Created once here at mount, not ad hoc
  // per call -- iOS media gating is often stricter on elements a script
  // synthesizes mid-flow. One frameless <audio> (tried first for mp4/mov
  // containers) and one <video> fallback; each element's AudioContext +
  // source node are attached lazily on first use (createMediaElementSource
  // is one-shot per element) and reused thereafter.
  const tapMediaRef = useRef(null)

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

  // Build the persistent tap elements once, on mount. Off-screen + invisible
  // but NOT display:none -- that suppresses media loading on iOS, and
  // <audio> is display:none in the UA sheet by default, so force a rendered
  // (still invisible) box.
  useEffect(() => {
    const make = (tag) => {
      const el = document.createElement(tag)
      el.setAttribute('playsinline', '')
      el.setAttribute('webkit-playsinline', '')
      el.playsInline = true
      el.preload = 'auto'
      el.muted = true
      el.style.cssText =
        'display:block;position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.appendChild(el)
      return el
    }
    const holder = { audioEl: make('audio'), videoEl: make('video'), audioGraph: null, videoGraph: null }
    tapMediaRef.current = holder
    return () => {
      holder.audioEl.remove()
      holder.videoEl.remove()
      holder.audioGraph?.ctx.close().catch(() => {})
      holder.videoGraph?.ctx.close().catch(() => {})
      if (tapMediaRef.current === holder) tapMediaRef.current = null
    }
  }, [])

  // Single decode per blob, shared by both the quality check (peak/RMS) and
  // the waveform display -- decodeAudioData is not cheap, and there's no
  // reason to run it twice for the same blob. `waveformData` is a plain
  // copy (via .slice()) of the decoded channel, not a live view into
  // `decoded`/`ctx`, so it stays valid after this effect's scope ends.
  useEffect(() => {
    if (!blob) {
      setQuality(null)
      setWaveformData(null)
      return
    }
    let cancelled = false
    let settled = false
    setQuality(null)
    setWaveformData(null)

    // Best-effort inner-unwind signal for the fallback chain. The blunt
    // timer below calls .abort() too, but the UI outcome never depends
    // on this propagating.
    const fallbackAbort = new AbortController()

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
      finish(() => setQuality('error'))
    }, QUALITY_CHECK_HARD_TIMEOUT_MS)

    // -> { channel, sampleRate, channelCount, format } | throws
    async function analyze() {
      const format = blob.type
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
        // fast decode rejected -- fall through to the container fallbacks
      }

      // Fast, gesture-free WebCodecs path first (mp4box + AudioDecoder);
      // the real-time media-element tap only if that declines. Both
      // channel-0 only, same as the fast path's analysis.
      let via = await decodeContainerAudio(blob, fallbackAbort.signal)
      if (!via && !fallbackAbort.signal.aborted) {
        via = await decodeViaMediaElement(blob, fallbackAbort.signal, tapMediaRef.current)
      }
      if (!via) throw new Error('all container fallbacks failed')
      return { channel: via.channel, sampleRate: via.sampleRate, channelCount: 1, format }
    }

    analyze()
      .then((result) =>
        finish(() => {
          setQuality(
            summarizeChannel(result.channel, {
              sampleRate: result.sampleRate,
              channelCount: result.channelCount,
              format: result.format,
              deviceLabel: deviceLabelRef.current,
            })
          )
          setWaveformData(result.channel.slice())
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
