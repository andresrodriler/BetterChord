import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { identifyAudio } from '../lib/api'

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
      return
    }
    let cancelled = false
    setQuality(null)
    setWaveformData(null)

    async function analyze() {
      try {
        const arrayBuffer = await blob.arrayBuffer()
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        const ctx = new AudioContextClass()
        const decoded = await ctx.decodeAudioData(arrayBuffer)
        const channel = decoded.getChannelData(0)

        let peak = 0
        let sumSquares = 0
        for (let i = 0; i < channel.length; i++) {
          const abs = Math.abs(channel[i])
          if (abs > peak) peak = abs
          sumSquares += channel[i] * channel[i]
        }
        const rms = Math.sqrt(sumSquares / channel.length)
        ctx.close()

        if (!cancelled) {
          setQuality({
            peak,
            rms,
            quiet: peak < QUIET_PEAK_THRESHOLD,
            clipping: peak >= CLIPPING_PEAK_THRESHOLD,
            sampleRate: decoded.sampleRate,
            channelCount: decoded.numberOfChannels,
            format: blob.type,
            deviceLabel: deviceLabelRef.current,
          })
          setWaveformData(channel.slice())
        }
      } catch {
        if (!cancelled) setQuality('error')
      }
    }

    analyze()
    return () => {
      cancelled = true
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
    setBlob(null)
    setOpen(true)
    setArmed(false)
    setRecording(false)

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
      setError(err.message || 'Could not access the microphone.')
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
