// Client-side audio extraction for video containers that decodeAudioData
// rejects (iOS Safari on a .mov/.mp4 from "Take Video"). Demux with
// mp4box.js, decode the AAC track with WebCodecs AudioDecoder -- no
// <video> element, no user gesture, and it runs far faster than
// real-time playback. mp4box is dynamically imported so its ~42 KB gzip
// only loads for a user who actually hits this path.
//
// Requires WebCodecs AudioDecoder (Safari 16.4+ / Chrome 94+ / modern
// Android). Returns null when unavailable, when the container isn't
// ISOBMFF, or when the audio track isn't AAC -- the caller then falls
// back to the <video>-tap path.

// Sample-rate table for the synthesized AAC-LC AudioSpecificConfig used
// when mp4box can't surface the real esds descriptor.
const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
]

function synthAsc(sampleRate, channels) {
  const freqIdx = AAC_SAMPLE_RATES.indexOf(sampleRate)
  const idx = freqIdx === -1 ? 4 : freqIdx // default 44100
  const chanCfg = Math.min(channels || 1, 7)
  // 5 bits objectType (2 = AAC-LC), 4 bits freqIdx, 4 bits channelCfg
  return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (chanCfg << 3)])
}

// DecoderSpecificInfo (AudioSpecificConfig) from mp4box's parsed esds
// descriptor tree, whatever depth it sits at.
function ascFromEsds(file, trackId) {
  try {
    const entry = file.getTrackById(trackId).mdia.minf.stbl.stsd.entries[0]
    const esds = entry && entry.esds
    if (!esds || !esds.esd) return null
    const walk = (descs) => {
      for (const d of descs || []) {
        if (d.tag === 5 && d.data) return new Uint8Array(d.data)
        const nested = walk(d.descs)
        if (nested) return nested
      }
      return null
    }
    return walk(esds.esd.descs)
  } catch {
    return null
  }
}

// Exported so the <video>/<audio>-tap fallback can make the same
// "is this an mp4/mov/m4a container" call without a second copy of the
// byte check.
export function isIsoBmff(head) {
  // bytes 4..8 spell "ftyp" for mp4/mov/m4a
  return head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70
}

function rejectOnAbort(signal) {
  return new Promise((_, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
}

// -> { channel: Float32Array (channel 0), sampleRate } | null
// Never throws -- any failure returns null so the caller can try the
// next fallback. `report` is the diagnostic step reporter (no-op unless
// CAPTURE_DIAGNOSTICS).
export async function decodeContainerAudio(blob, signal, report = () => {}) {
  try {
    return await run(blob, signal, report)
  } catch (e) {
    report(`WebCodecs declined: threw ${(e && e.name) || 'error'}`)
    return null
  }
}

async function run(blob, signal, report) {
  report('WebCodecs: checking AudioDecoder support...')
  if (typeof window.AudioDecoder === 'undefined' || typeof window.EncodedAudioChunk === 'undefined') {
    // Safari added VideoDecoder in 16.4 but AudioDecoder only in Safari
    // 26 -- 16.4..18.x has no AudioDecoder at all, so this path never
    // runs there and the <video> tap is the only fallback.
    report('WebCodecs declined: no AudioDecoder (needs Safari/iOS 26+, Chrome 94+)')
    return null
  }

  report('WebCodecs: reading container header...')
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (!isIsoBmff(head)) {
    const hex = [...head.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
    report(`WebCodecs declined: not ISOBMFF (first 8 bytes ${hex})`)
    return null
  }

  report('WebCodecs: loading mp4box (~42 KB)...')
  let MP4Box
  try {
    MP4Box = await import('mp4box')
  } catch {
    report('WebCodecs declined: mp4box import/network failed')
    return null
  }
  if (signal?.aborted) {
    report('WebCodecs declined: aborted after mp4box import')
    return null
  }

  const arrayBuffer = await blob.arrayBuffer()
  const file = MP4Box.createFile()
  report('WebCodecs: demuxing container (mp4box)...')

  // mp4box delivers samples only when extraction is configured in
  // onReady, BEFORE the bytes that carry them are appended -- so set the
  // handlers up first, then feed. onReady fires synchronously mid-append
  // once the moov is in.
  let audio = null
  const collected = []
  const samplesPromise = new Promise((resolve) => {
    file.onError = () => resolve(null)
    file.onReady = (info) => {
      const track =
        info.tracks.find((t) => t.type === 'audio') || info.tracks.find((t) => t.audio && !t.video)
      if (!track || !String(track.codec || '').startsWith('mp4a')) {
        // only AAC handled here
        report(`WebCodecs declined: no AAC audio track (codec=${track ? track.codec : 'none'})`)
        return resolve(null)
      }
      audio = track
      report('WebCodecs: extracting audio samples...')
      file.onSamples = (_id, _user, list) => {
        for (const s of list) collected.push(s)
        if (collected.length >= track.nb_samples) resolve(collected)
      }
      file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples })
      file.start()
    }
    const CHUNK = 1 << 16
    for (let off = 0; off < arrayBuffer.byteLength; off += CHUNK) {
      const slice = arrayBuffer.slice(off, Math.min(off + CHUNK, arrayBuffer.byteLength))
      slice.fileStart = off
      file.appendBuffer(slice)
    }
    file.flush()
    setTimeout(() => {
      report('WebCodecs: mp4box sample extraction stalled (4s)...')
      resolve(collected.length ? collected : null)
    }, 4000)
  })

  const encodedSamples = await Promise.race([samplesPromise, rejectOnAbort(signal)]).catch(() => null)
  if (!encodedSamples || !encodedSamples.length || !audio) {
    report(`WebCodecs declined: mp4box extracted ${encodedSamples ? encodedSamples.length : 0} samples`)
    return null
  }

  const sampleRate = audio.audio.sample_rate
  const channels = audio.audio.channel_count
  const description = ascFromEsds(file, audio.id) || synthAsc(sampleRate, channels)
  const config = { codec: audio.codec, sampleRate, numberOfChannels: channels, description }

  report('WebCodecs: checking AudioDecoder config...')
  const supported = await AudioDecoder.isConfigSupported(config)
    .then((r) => r.supported)
    .catch(() => false)
  if (!supported) {
    report(`WebCodecs declined: AudioDecoder rejected config (codec=${config.codec}, ${sampleRate}Hz/${channels}ch)`)
    return null
  }

  const pcmParts = []
  let decodeError = false
  const decoder = new AudioDecoder({
    output: (frame) => {
      const frames = frame.numberOfFrames
      const nc = frame.numberOfChannels
      const mono = new Float32Array(frames)
      try {
        if ((frame.format || '').includes('planar')) {
          frame.copyTo(mono, { planeIndex: 0 })
        } else {
          const interleaved = new Float32Array(frames * nc)
          frame.copyTo(interleaved, { planeIndex: 0 })
          for (let i = 0; i < frames; i++) mono[i] = interleaved[i * nc]
        }
      } catch {
        decodeError = true
      }
      pcmParts.push(mono)
      frame.close()
    },
    error: () => {
      decodeError = true
    },
  })

  try {
    report(`WebCodecs: decoding AAC (${encodedSamples.length} chunks)...`)
    decoder.configure(config)
    for (const s of encodedSamples) {
      if (signal?.aborted) throw new Error('aborted')
      decoder.decode(
        new EncodedAudioChunk({
          type: s.is_sync ? 'key' : 'delta',
          timestamp: Math.round((s.cts / s.timescale) * 1e6),
          duration: Math.round((s.duration / s.timescale) * 1e6),
          data: s.data,
        })
      )
    }
    report('WebCodecs: waiting on AudioDecoder.flush()...')
    await Promise.race([decoder.flush(), rejectOnAbort(signal)])
  } finally {
    try {
      decoder.close()
    } catch {
      // already closed
    }
  }

  report('WebCodecs: assembling PCM...')
  let total = 0
  for (const part of pcmParts) total += part.length
  if (decodeError || total < 1) {
    report(`WebCodecs declined: decode produced no PCM${decodeError ? ' (decoder error)' : ''}`)
    return null
  }

  const channel = new Float32Array(total)
  let offset = 0
  for (const part of pcmParts) {
    channel.set(part, offset)
    offset += part.length
  }
  return { channel, sampleRate }
}
