// Shared amplitude <-> dB conversion, used by both the waveform's y-axis
// (Waveform.jsx) and the recording-quality readout (RecordingInfo.jsx) --
// one implementation, so the two can't drift into disagreeing numbers for
// the same underlying peak/RMS value.

// Floor used ONLY for positioning math (bar heights, reference-line y
// coordinates) -- canvas geometry needs a finite number, so true silence
// (amplitude 0, which is mathematically -Infinity dB) is clamped here.
// Real, human-facing text uses formatDb() below instead, which shows an
// honest "-inf dB" rather than a fake-precise clamped number.
export const METER_MIN_DB = -60

// amplitude is a 0.0-1.0 linear sample/peak value (this app's convention
// throughout, e.g. CaptureContext's peak/RMS). Returns a finite dB value,
// clamped to METER_MIN_DB -- safe to use directly in pixel math, never
// NaN/-Infinity.
export function amplitudeToDbClamped(amplitude) {
  if (!amplitude || amplitude <= 0 || !isFinite(amplitude)) return METER_MIN_DB
  const db = 20 * Math.log10(amplitude)
  if (!isFinite(db)) return METER_MIN_DB
  return Math.max(db, METER_MIN_DB)
}

// Human-facing dB text. True zero/near-zero amplitude reads as "-inf dB"
// (the mathematically honest answer -- log(0) is undefined/-Infinity)
// rather than silently printing a clamped placeholder number that could
// be mistaken for a real measurement.
export function formatDb(amplitude) {
  if (!amplitude || amplitude <= 0 || !isFinite(amplitude)) return '−∞ dB'
  const db = 20 * Math.log10(amplitude)
  if (!isFinite(db)) return '−∞ dB'
  return `${db.toFixed(1)} dB`
}
