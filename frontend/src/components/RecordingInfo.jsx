import { formatDb } from '../lib/audioUnits'
import './RecordingInfo.css'

function formatFormat(mimeType) {
  if (!mimeType) return null
  const sub = mimeType.split('/')[1]?.split(';')[0]
  return sub ? sub.toUpperCase() : mimeType
}

function formatChannels(channelCount) {
  if (!channelCount) return null
  return channelCount > 1 ? `Stereo (${channelCount}ch)` : 'Mono'
}

// A real good/warning/danger status card (item 6 of the Phase 5 Part 3/7
// 2nd polish pass) plus a secondary "device readout" meta panel (item 7)
// -- both driven entirely by CaptureContext's `quality` object. No new
// analysis happens here, this is presentation only.
function RecordingInfo({ quality }) {
  if (!quality) return null

  const state = quality.clipping ? 'clip' : quality.quiet ? 'quiet' : 'ok'
  const label =
    state === 'clip' ? 'Clipping detected' : state === 'quiet' ? 'Recording is quiet' : 'Recording level OK'
  const detail =
    state === 'clip'
      ? `Peak ${formatDb(quality.peak)} -- distortion is likely. Try lowering input gain or recording further from the source.`
      : state === 'quiet'
        ? `Peak ${formatDb(quality.peak)}, RMS ${formatDb(quality.rms)}. Consider rerecording closer to the guitar.`
        : `Peak ${formatDb(quality.peak)}, RMS ${formatDb(quality.rms)}.`

  const channels = formatChannels(quality.channelCount)
  const format = formatFormat(quality.format)

  return (
    <div className="recording-info">
      <div className={`recording-status recording-status--${state}`}>
        <span className="recording-status__dot" aria-hidden="true" />
        <div className="recording-status__body">
          <span className="recording-status__label">{label}</span>
          <p className="recording-status__detail">{detail}</p>
        </div>
      </div>

      <div className="recording-meta">
        {quality.sampleRate && (
          <div className="recording-meta__item">
            <span className="recording-meta__label">Sample rate</span>
            <span className="recording-meta__value">{quality.sampleRate.toLocaleString()} Hz</span>
          </div>
        )}
        {channels && (
          <div className="recording-meta__item">
            <span className="recording-meta__label">Channels</span>
            <span className="recording-meta__value">{channels}</span>
          </div>
        )}
        {format && (
          <div className="recording-meta__item">
            <span className="recording-meta__label">Format</span>
            <span className="recording-meta__value">{format}</span>
          </div>
        )}
        {/* Record path only -- gracefully absent (no blank/placeholder
            field) on the upload path, where there's no input device. */}
        {quality.deviceLabel && (
          <div className="recording-meta__item">
            <span className="recording-meta__label">Input</span>
            <span className="recording-meta__value">{quality.deviceLabel}</span>
          </div>
        )}
      </div>

      {quality.channelCount > 1 && (
        <p className="recording-info__disclosure">
          This file has {quality.channelCount} channels -- only the first (left) channel is analyzed above.
        </p>
      )}
    </div>
  )
}

export default RecordingInfo
