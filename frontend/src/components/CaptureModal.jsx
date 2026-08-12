import { useEffect, useRef, useState } from 'react'
import { useCapture } from '../context/CaptureContext'
import CapturePanel from './CapturePanel'
import Waveform from './Waveform'
import RecordingInfo from './RecordingInfo'
import IdentifyingStatus from './IdentifyingStatus'
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
    waveformData,
    identifying,
    error,
    beginRecording,
    stopRecording,
    handleContinue,
    close,
  } = useCapture()
  const [showChooser, setShowChooser] = useState(false)
  const audioRef = useRef(null)

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
    // The preview/chooser layout stays mounted (just dimmed/blurred, see
    // the loading overlay below) while identifying now, rather than being
    // replaced -- so the modal's width shouldn't change just because
    // identifying started.
    previewing && showChooser && 'capture-modal--wide',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="capture-overlay">
      <div className={modalClass}>
        <div className="capture-modal__top">
          {/* Merged onto the Close button's own row (was a separate row
              above the waveform) -- frees vertical space, spent on a
              taller waveform instead (Waveform.jsx's CANVAS_HEIGHT).
              Empty otherwise so Close stays pinned top-right consistently
              across every other modal state (armed/recording/etc), which
              have their own headline inside their own centered body. */}
          <h2 className="capture-modal__title">{previewing ? 'Preview' : ''}</h2>
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

        {/* The preview content stays mounted and visible while /identify is
            in flight (this pass's change) -- a blurred/dimmed overlay plus
            a floating loading card render on top of it instead of
            replacing it, reusing the exact same tint+blur visual language
            as .capture-overlay (the page-level backdrop this whole modal
            already sits on), just one layer further in. Still ONE modal:
            the overlay is `position: absolute` inside this body (which
            gets `position: relative` below), not a second fixed-position
            backdrop or a separate z-index stack. */}
        {previewing && (
          <div
            className={`capture-modal__body${showChooser ? ' capture-modal__body--split' : ''}`}
            style={{ position: 'relative' }}
          >
            <div className="capture-modal__preview">
              <Waveform channelData={waveformData} audioRef={audioRef} />
              {/* Playback engine only -- the waveform above is the one clear seek
                  surface (item 1 of an earlier Phase 5 Part 3/7 polish pass); native
                  controls stay off so there's no second, redundant scrub bar. */}
              <audio ref={audioRef} src={audioUrl} className="visually-hidden" />

              {quality === null && <p className="status-text">Checking recording quality...</p>}
              {quality === 'error' && (
                <p className="status-text">
                  Could not analyze this recording's quality (playback should still work).
                </p>
              )}
              {quality && quality !== 'error' && <RecordingInfo quality={quality} />}

              <div className="button-row">
                <button className="btn btn-primary" onClick={handleContinue} disabled={identifying}>
                  Continue
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowChooser((v) => !v)}
                  disabled={identifying}
                >
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

            {identifying && (
              <div className="capture-modal__loading-overlay">
                <div className="capture-modal__loading-card">
                  <h2>Identifying...</h2>
                  <IdentifyingStatus />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CaptureModal
