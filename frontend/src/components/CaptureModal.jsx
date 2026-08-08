import { useEffect, useState } from 'react'
import { useCapture } from '../context/CaptureContext'
import CapturePanel from './CapturePanel'
import './CaptureModal.css'

// Renders as a fixed overlay on top of whatever page is mounted underneath
// (Home or Results) -- no route change happens while this is open. Internal
// views driven by CaptureContext state: "recording" (mic is live, just a
// Stop button) and "preview" (blob ready -- playback, quality check,
// Continue / choose-a-different-source). Continue is the only thing that
// navigates, via CaptureContext.handleContinue, and it closes the modal
// first.
//
// The preview view's "choose a different source" toggle reveals the exact
// same CapturePanel used on Home/Results (just `size="compact"`) -- per
// CLAUDE.md Phase 3 follow-up, the popup should be instantly recognizable
// as the same upload/record/search component, differing only in size.
//
// The modal widens in two steps rather than growing taller: a touch wider
// once a recording/upload is ready to preview (room for the eventual
// noise-level graph), and wider still -- switching to a two-column layout
// -- when the chooser is open, so the compact CapturePanel sits beside the
// preview instead of stacking below it. Kept deliberately scroll-free at
// normal viewport sizes; `overflow-y: auto` stays as a safety net only for
// very short viewports.
function CaptureModal() {
  const {
    open,
    armed,
    recording,
    blob,
    audioUrl,
    quality,
    identifying,
    error,
    beginRecording,
    stopRecording,
    handleContinue,
    close,
  } = useCapture()
  const [showChooser, setShowChooser] = useState(false)

  // The component stays mounted (rendering null) while closed rather than
  // unmounting, since it lives at the App level -- reset the local toggle
  // on close so a stale "choose a different source" panel doesn't carry
  // over into the next time the modal opens.
  useEffect(() => {
    if (!open) {
      setShowChooser(false)
    }
  }, [open])

  if (!open) return null

  const previewing = !recording && !!blob
  const modalClass = [
    'capture-modal',
    previewing && 'capture-modal--preview',
    previewing && showChooser && 'capture-modal--wide',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="capture-overlay">
      <div className={modalClass}>
        <div className="capture-modal__top">
          <button className="btn-close" onClick={close} disabled={identifying}>Close</button>
        </div>

        {!armed && !recording && !blob && (
          <div className="capture-modal__body capture-modal__body--centered">
            <h2>Requesting microphone access...</h2>
            {error && <p className="status-text status-text--error">Error: {error}</p>}
          </div>
        )}

        {armed && !recording && (
          <div className="capture-modal__body capture-modal__body--centered">
            <h2>Ready to record</h2>
            <p>Position your guitar, then start whenever you're ready.</p>
            <button className="record-btn record-btn--big record-btn--armed" onClick={beginRecording}>
              <span className="record-btn__dot" />
              Start Recording
            </button>
          </div>
        )}

        {recording && (
          <div className="capture-modal__body capture-modal__body--centered">
            <h2>Recording...</h2>
            <span className="record-btn record-btn--live">
              <span className="record-btn__dot" />
              Live
            </span>
            <button className="btn" onClick={stopRecording}>Stop</button>
          </div>
        )}

        {previewing && (
          <div className={`capture-modal__body${showChooser ? ' capture-modal__body--split' : ''}`}>
            <div className="capture-modal__preview">
              <h2>Preview</h2>
              <audio src={audioUrl} controls />

              {quality === null && <p className="status-text">Checking recording quality...</p>}
              {quality === 'error' && (
                <p className="status-text">
                  Could not analyze this recording's quality (playback should still work).
                </p>
              )}
              {quality && quality !== 'error' && quality.quiet && (
                <p className="status-text status-text--warn">
                  Warning: this recording looks very quiet (peak level {quality.peak.toFixed(3)}). Consider
                  rerecording closer to the guitar.
                </p>
              )}
              {quality && quality !== 'error' && !quality.quiet && (
                <p className="status-text">
                  Recording level looks OK (peak {quality.peak.toFixed(3)}, RMS {quality.rms.toFixed(3)}).
                </p>
              )}

              <div className="button-row">
                <button className="btn btn-primary" onClick={handleContinue} disabled={identifying}>
                  {identifying ? 'Identifying...' : 'Continue'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowChooser((v) => !v)} disabled={identifying}>
                  {showChooser ? 'Hide options' : 'Choose a different source'}
                </button>
              </div>

              {error && <p className="status-text status-text--error">Error: {error}</p>}
            </div>

            {showChooser && (
              <div className="capture-modal__chooser">
                <CapturePanel size="compact" onSearchSubmit={close} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CaptureModal
