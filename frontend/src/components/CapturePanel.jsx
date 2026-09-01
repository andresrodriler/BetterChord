import { useRef, useState } from 'react'
import { useCapture } from '../context/CaptureContext'
import ManualSearch from './ManualSearch'
import './CapturePanel.css'

const SUPPORTED_FORMATS = ['MP3', 'WAV', 'WEBM', 'OGG', 'M4A']

// `accept` for the file <input>, kept free of any `*/*` wildcard. iOS
// Safari decides whether to offer the "Photo Library / Take Photo or
// Video" capture sheet from a media wildcard in `accept` -- `audio/*`
// triggers it even with concrete extensions listed alongside -- so this
// lists only concrete extensions and specific MIME types. selectFile()
// does no type check, so narrowing this never rejects a supported
// upload; it only tightens the picker's filter hint. No `capture`
// attribute -- that opens the camera/mic directly, and recording has
// its own Record button.
const FILE_ACCEPT = [
  ...SUPPORTED_FORMATS.map((f) => `.${f.toLowerCase()}`),
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
].join(',')

// Purely decorative -- a small static waveform-shaped flourish inside the
// dropzone, animated with the shared copper-bar keyframe and colored with
// the loudness-ramp tokens (Waveform.jsx's audio-level palette) so it
// reads as "this widget listens to audio" before any file is chosen.
const MINI_WAVE_BAR_HEIGHTS = [40, 90, 60, 100, 55, 80, 35]

// The unified "how do I get a chord in front of BetterChord" component --
// upload/drag-and-drop, manual search, and record in one continuous box
// (dropzone, "OR" rule, search, "OR" rule, full-width record button)
// rather than three separate cards. Recording and uploading both feed
// CaptureContext (armRecording / selectFile); this component holds no
// capture state, so every path lands on the same CaptureModal preview.
//
// `size` controls proportions only -- same structure everywhere -- with
// ONE exception:
//   'default' -- Home: the full, most prominent presentation.
//   'compact' -- inside CaptureModal's "choose a different source" panel.
//   'mini'    -- de-emphasized, nestled below other page content.
//   'header'  -- Results, beside the page title: a genuinely different
//                LAYOUT (dropzone left, search + record stacked to its
//                right, no "OR" dividers), matched from the mockup. The
//                two JSX branches below share the upload/record/search
//                pieces (dropzoneNode/searchNode/recordNode), differing
//                only in how they're arranged.
function CapturePanel({ size = 'default', onSearchSubmit }) {
  const { armRecording, selectFile } = useCapture()
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0) // dragenter/dragleave fire on child elements too; count instead of toggling on every event

  function openFileDialog() {
    fileInputRef.current?.click()
  }

  function handleDropzoneKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openFileDialog()
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    selectFile(file)
    e.target.value = '' // allow reselecting the same file later
  }

  function handleDragEnter(e) {
    e.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }

  function handleDragOver(e) {
    e.preventDefault() // required to allow dropping at all
  }

  function handleDragLeave(e) {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setIsDragging(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) selectFile(file)
  }

  const dropzoneNode = (
    <div
      className={`capture-panel__dropzone${isDragging ? ' capture-panel__dropzone--dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Upload an audio file: drag and drop, or click to browse"
      onClick={openFileDialog}
      onKeyDown={handleDropzoneKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept={FILE_ACCEPT}
        tabIndex={-1}
        onChange={handleFileChange}
      />
      {/* Line-art SVG icon (a thin arrow in a ring) rather than a
          system emoji whose look varies by OS/browser. Stroke color/
          width live in CapturePanel.css (var(--brass)), not inline;
          icon-glow targets this class. */}
      <svg
        className="capture-panel__dropzone-icon"
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <circle className="capture-panel__icon-ring" cx="16" cy="16" r="13.25" />
        <path className="capture-panel__icon-arrow" d="M16 21V11M16 11L11 16M16 11L21 16" />
      </svg>
      <p className="capture-panel__headline">Analyze Your Chord</p>
      {/* One paragraph with an inline "or click to browse" span, matching
          the mockup. The span is decorative-only text, not a second
          click target -- the whole dropzone is already role="button"
          with its own onClick, so a nested interactive element here
          would be an a11y problem. */}
      <p className="capture-panel__primary-text">
        Drag &amp; drop your audio here <span className="capture-panel__browse-link">or click to browse</span>
      </p>
      <div className="capture-panel__mini-wave" aria-hidden="true">
        {MINI_WAVE_BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="capture-panel__mini-wave-bar"
            style={{ '--mini-wave-h': `${h}%`, animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <p className="capture-panel__formats">Supports {SUPPORTED_FORMATS.join(' · ')}</p>
    </div>
  )

  const searchNode = <ManualSearch onSubmit={onSearchSubmit} />

  const recordNode = (
    <button className="record-btn record-btn--block" onClick={armRecording}>
      {/* Reuses .record-btn__dot (App.css), the same dot the armed/
          recording states use, not a mic emoji. */}
      <span className="record-btn__dot" aria-hidden="true" />
      {/* 'header' is real-estate-tight (beside the page title), so it
          uses the short "Record" label. */}
      {size === 'header' ? 'Record' : 'Record Your Own Piece'}
    </button>
  )

  if (size === 'header') {
    // 2-column layout (from the mockup): dropzone left, search input +
    // record button stacked right, no "OR" dividers -- so this branch
    // composes the shared pieces differently rather than reusing the
    // flat dropzone/OR/search/OR/record structure below.
    return (
      <div className={`capture-panel capture-panel--${size}`}>
        {dropzoneNode}
        <div className="capture-panel__header-actions">
          {searchNode}
          {recordNode}
        </div>
      </div>
    )
  }

  return (
    <div className={`capture-panel capture-panel--${size}`}>
      {dropzoneNode}
      <div className="capture-panel__or" role="presentation"><span>OR</span></div>
      {searchNode}
      <div className="capture-panel__or" role="presentation"><span>OR</span></div>
      {recordNode}
    </div>
  )
}

export default CapturePanel
