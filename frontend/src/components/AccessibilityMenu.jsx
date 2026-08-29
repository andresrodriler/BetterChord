import { useEffect, useRef, useState } from 'react'
import { useAccessibilityPrefs } from '../context/AccessibilityPrefsContext'
import './AccessibilityMenu.css'

// One shared settings dropdown for both accessibility preferences
// (colorblind-safe palette, reduced motion), site-wide in the header nav
// (same tier as How It Works/About/GitHub) rather than a chord-page
// control like HandednessToggle -- both preferences apply everywhere
// (Home's ambient shapes, How It Works' CNN diagram, every fretboard
// diagram). Combined into one dropdown since both are small independent
// booleans with the same persistence shape.
function AccessibilityMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const {
    colorblindMode,
    toggleColorblindMode,
    reducedMotion,
    reducedMotionManual,
    toggleReducedMotionManual,
    osReducedMotion,
  } = useAccessibilityPrefs()

  // Same "real click-outside via mousedown + a root ref" pattern already
  // established for ManualSearch's own suggestion dropdown and
  // SongFilters' artist combobox -- closes the panel without disturbing
  // the rest of the page.
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="accessibility-menu" ref={rootRef}>
      <button
        type="button"
        className="accessibility-menu__trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        title="Accessibility settings"
      >
        <span aria-hidden="true">&#9881;</span> Accessibility
      </button>

      {open && (
        <div className="accessibility-menu__panel panel" role="menu">
          <button
            type="button"
            className="accessibility-menu__option"
            role="menuitemcheckbox"
            aria-pressed={colorblindMode}
            aria-checked={colorblindMode}
            onClick={toggleColorblindMode}
          >
            <span className="accessibility-menu__option-label">Colorblind-safe colors</span>
            <span className={`accessibility-menu__switch${colorblindMode ? ' accessibility-menu__switch--on' : ''}`} aria-hidden="true" />
          </button>
          <p className="accessibility-menu__hint">
            Swaps the interval color palette (fretboard dots, chord tones, notes) for one
            distinguishable under red-green color blindness. Every colored element already shows a
            text label too, so color is never the only signal.
          </p>

          <button
            type="button"
            className="accessibility-menu__option"
            role="menuitemcheckbox"
            aria-pressed={reducedMotionManual}
            aria-checked={reducedMotionManual}
            onClick={toggleReducedMotionManual}
          >
            <span className="accessibility-menu__option-label">Reduce motion</span>
            <span className={`accessibility-menu__switch${reducedMotionManual ? ' accessibility-menu__switch--on' : ''}`} aria-hidden="true" />
          </button>
          <p className="accessibility-menu__hint">
            {osReducedMotion
              ? 'Already on -- your system is set to reduce motion, so animations are off regardless of this toggle.'
              : 'Turns off pulsing, scanning, and bounce animations app-wide. BetterChord also follows your system’s reduce-motion setting automatically.'}
          </p>
          {reducedMotion && (
            <p className="accessibility-menu__status">Motion is currently reduced.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default AccessibilityMenu
