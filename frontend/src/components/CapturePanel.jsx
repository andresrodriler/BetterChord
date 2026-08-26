import { useRef, useState } from 'react'
import { useCapture } from '../context/CaptureContext'
import ManualSearch from './ManualSearch'
import './CapturePanel.css'

const SUPPORTED_FORMATS = ['MP3', 'WAV', 'WEBM', 'OGG', 'M4A']

// Purely decorative -- a small static waveform-shaped flourish inside the
// dropzone, animated with the shared copper-bar keyframe and colored with
// the existing loudness-ramp tokens (Waveform.jsx's own real audio-level
// palette, not a second hardcoded color set) so it reads as "this widget
// listens to audio" without needing any real audio data before a file is
// ever chosen.
const MINI_WAVE_BAR_HEIGHTS = [40, 90, 60, 100, 55, 80, 35]

// The single, unified "how do I get a chord in front of BetterChord"
// component -- upload/drag-and-drop, manual search, and record all live
// in one continuous box (dropzone, then an "OR" rule, then search, then
// another "OR" rule, then a full-width record button) rather than three
// separate cards, so it reads as one tool with three ways in rather than
// three different features. Recording and uploading both just feed
// CaptureContext (armRecording / selectFile); this component holds no
// capture state of its own, so whichever path the user takes lands on
// the exact same CaptureModal preview.
//
// `size` controls proportions only -- same structure everywhere it's
// used, per CLAUDE.md Phase 3: the popup/embedded versions should be
// instantly recognizable as the same component, differing only in size.
//   'default' -- Home: the full, most prominent presentation.
//   'compact' -- inside CaptureModal's "choose a different source" panel.
//   'mini'    -- de-emphasized, nestled below other page content.
//   'header'  -- Results: a real, previously-missing feature (Phase 5
//                Part 6/7 Results convergence follow-up -- the mockup's
//                own top-right "Analyze Your Chord" widget, sized to sit
//                beside the page title, was missed by an earlier
//                inventory pass and only caught on a second look; see
//                RESULTS_VISUAL_FIDELITY_OPEN_ITEMS.md for the note on
//                why this is worth extra care going forward). Unlike
//                every other size, this one is a genuinely different
//                LAYOUT (dropzone on the left, search + record stacked
//                to its right, no "OR" dividers at all -- confirmed
//                directly from the mockup's own real markup, not
//                guessed), not just smaller proportions of the same
//                vertical flow -- so the two JSX branches below share
//                every piece of actual upload/record/search logic and
//                markup (dropzoneNode/searchNode/recordNode), differing
//                only in how those three pieces are arranged.
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
        accept="audio/*"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      {/* Phase 5 Part 6/7 follow-up: real line-art icon (a thin arrow in
          a ring), replacing a plain upload-tray emoji -- matches the
          mockups' own drawn icon instead of a system glyph whose look
          varies by OS/browser. Stroke color/width live in
          CapturePanel.css (var(--brass)), not set inline, so it stays
          consistent with every other token-driven color in this file.
          icon-glow (unchanged) still targets this same class. */}
      <svg
        className="capture-panel__dropzone-icon"
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <circle className="capture-panel__icon-ring" cx="16" cy="16" r="13.25" />
        <path className="capture-panel__icon-arrow" d="M16 21V11M16 11L11 16M16 11L21 16" />
      </svg>
      <p className="capture-panel__headline">Analyze Your Chord</p>
      {/* Phase 5 Part 6/7, 13th follow-up: real, confirmed content/DOM
          structure fix -- this used to be two separate <p> elements
          (primary-text + secondary-text), a real structural difference
          from the mockup's own single sentence with "or click to
          browse" as an inline brass-colored span, flagged and
          deliberately left unfixed for several rounds while chasing
          spacing complaints via CSS-only patches on the old structure.
          Merged into the mockup's real structure: one paragraph, one
          inline span, matching its real measured styling (paragraph
          color/size = --muted/12px; span color rgb(179,151,112), the
          same real brass-tan literal already used for
          .home-hero__tags -- confirmed via direct computed-style
          extraction, not guessed). The span is decorative-only text,
          not a second click target -- the whole dropzone is already
          role="button" with its own onClick, so a nested interactive
          element here would be a real, separate a11y problem (nested
          interactive controls), which the mockup's own plain
          (non-anchor) <span> doesn't have either. */}
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
      {/* Phase 5 Part 6/7 follow-up: reuses the same .record-btn__dot
          already used by the armed/recording states elsewhere (App.css)
          instead of a microphone emoji -- the mockups' own record
          button uses this exact plain dot, not a mic icon. */}
      <span className="record-btn__dot" aria-hidden="true" />
      {/* 'header' is real-estate-tight (mounted beside the page title,
          not given its own row) -- the mockup's own header widget uses
          the short "Record" label, not "Record Your Own Piece". Every
          other size keeps the full label, unchanged. */}
      {size === 'header' ? 'Record' : 'Record Your Own Piece'}
    </button>
  )

  if (size === 'header') {
    // Real, distinct 2-column layout confirmed directly from the mockup's
    // own markup: dropzone on the left, search input + record button
    // stacked to its right, with NO "OR" dividers anywhere (unlike every
    // other size's single vertical flow) -- so this branch composes the
    // same three shared pieces differently rather than reusing the flat
    // dropzone/OR/search/OR/record structure below.
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
