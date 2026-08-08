import { useRef, useState } from 'react'
import { useCapture } from '../context/CaptureContext'
import ManualSearch from './ManualSearch'
import './CapturePanel.css'

const SUPPORTED_FORMATS = ['MP3', 'WAV', 'WEBM', 'OGG', 'M4A']

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
//   'mini'    -- Results: nestled below voicings/songs, present but not
//                competing with the chord/voicings/songs as the page's focus.
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

  return (
    <div className={`capture-panel capture-panel--${size}`}>
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
        <div className="capture-panel__dropzone-icon" aria-hidden="true">📤</div>
        <p className="capture-panel__headline">Analyze Your Chord</p>
        <p className="capture-panel__primary-text">Drag &amp; drop your audio here</p>
        <p className="capture-panel__secondary-text">or click to browse</p>
        <p className="capture-panel__formats">Supports {SUPPORTED_FORMATS.join(' · ')}</p>
      </div>

      <div className="capture-panel__or" role="presentation"><span>OR</span></div>

      <ManualSearch onSubmit={onSearchSubmit} />

      <div className="capture-panel__or" role="presentation"><span>OR</span></div>

      <button className="record-btn record-btn--block" onClick={armRecording}>
        <span aria-hidden="true">🎙</span>
        Record Your Own Piece
      </button>
    </div>
  )
}

export default CapturePanel
