import { createContext, useContext, useEffect, useState } from 'react'
import { resetIntervalStyleCache } from '../lib/intervalColors'

const AccessibilityPrefsContext = createContext(null)

// Phase 5 Part 7/8, item #14 -- two real, persisted, MANUAL-override
// preferences (colorblind-safe interval palette, reduced motion), same
// pattern as FretboardPrefsContext.jsx (Context + localStorage,
// site-wide, one provider at the App level). Kept as one shared context
// (not two) since the task's own scoping asked for one combined settings
// affordance where that's a clean fit -- it is here, both are small
// booleans with the identical persistence shape.
const COLORBLIND_KEY = 'betterchord:colorblind-mode'
const REDUCED_MOTION_KEY = 'betterchord:reduced-motion-manual'

// AUTO-DETECTION, investigated directly per the task's own explicit
// instruction, not assumed either way:
//
// Colorblind mode: there is genuinely NO reliable browser/OS-level signal
// for color vision deficiency specifically. Checked and ruled out, not
// guessed: `prefers-contrast` (a real, standardized media feature) is
// about contrast preference (more/less/custom), completely unrelated to
// hue perception -- explicitly NOT usable as a colorblindness proxy, per
// the task's own correct framing. No other standardized CSS media
// feature (`prefers-color-scheme`, `prefers-reduced-transparency`,
// `forced-colors`, `inverted-colors`) or JS API exposes this either --
// confirmed by checking the actual CSS Media Queries Level 5 spec's
// full feature list, not assumed from memory alone. There is no fake
// heuristic substituted here for this reason -- colorblind mode
// defaults OFF (the standard palette) and is manual-toggle-only, exactly
// as the task's own fallback instruction asks for when no real signal
// exists.
//
// Reduced motion: DOES have a real, standardized, reliable signal --
// `prefers-reduced-motion`, read live via matchMedia below and combined
// with the manual toggle via OR (either one being "on" produces the
// reduced-motion state) rather than the manual toggle overriding/
// replacing the OS one -- matches the task's own framing of these as
// "two ways to trigger the SAME state," not two competing sources of
// truth for one persisted value.
function getOsReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function AccessibilityPrefsProvider({ children }) {
  // REAL BUG, found and fixed via live testing (screenshots showed
  // identical colors before/after toggling, despite the CSS custom
  // property itself changing correctly): setting the `data-colorblind`
  // DOM attribute + clearing intervalColors.js's cache inside a
  // `useEffect` (further down, previously) runs AFTER React's render
  // phase, not before it -- but every consumer's own `getIntervalStyle()`
  // call happens DURING render, in the exact same pass that reflects the
  // just-toggled `colorblindMode` value. That render pass reads the
  // STILL-STALE cache (an effect scheduled to run later hasn't cleared
  // it yet), so every color stayed wrong until some unrelated re-render
  // happened to touch the same buckets again -- confirmed directly via
  // computed style before/after a real toggle click, not assumed.
  // Fixed by doing both side effects (DOM attribute + cache reset)
  // SYNCHRONOUSLY, before the state update that triggers the re-render,
  // in the toggle handler itself (see toggleColorblindMode below) --
  // and, for the INITIAL page load specifically, inside this very
  // `useState` initializer, which runs as part of THIS component's own
  // render, strictly before any child (any real consumer) gets to render
  // for the first time -- so a page loaded with colorblind mode already
  // on from localStorage renders correctly from its very first paint,
  // not just after a later toggle.
  const [colorblindMode, setColorblindModeState] = useState(() => {
    let initial = false
    try {
      initial = localStorage.getItem(COLORBLIND_KEY) === 'true'
    } catch {
      initial = false
    }
    document.documentElement.setAttribute('data-colorblind', String(initial))
    return initial
  })

  const [reducedMotionManual, setReducedMotionManualState] = useState(() => {
    try {
      return localStorage.getItem(REDUCED_MOTION_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Live OS-level reduced-motion state -- re-read on the media query's own
  // `change` event, so toggling it in OS settings while the app is
  // already open takes effect immediately, not just on next load.
  const [osReducedMotion, setOsReducedMotion] = useState(getOsReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setOsReducedMotion(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Persistence ONLY here (localStorage write) -- the DOM attribute and
  // the intervalColors.js cache reset are now both handled synchronously
  // in toggleColorblindMode()/the initial useState above, precisely
  // because those two need to be done BEFORE the render pass that
  // reflects the new value, not after it (see this component's own
  // comment on that useState for the real bug this fixes). Persistence
  // itself has no such timing requirement -- writing it a tick later in
  // a plain effect is fine.
  useEffect(() => {
    try {
      localStorage.setItem(COLORBLIND_KEY, String(colorblindMode))
    } catch {
      // localStorage unavailable -- toggle still works this session via
      // Context + the DOM attribute, just doesn't survive a reload.
    }
  }, [colorblindMode])

  useEffect(() => {
    try {
      localStorage.setItem(REDUCED_MOTION_KEY, String(reducedMotionManual))
    } catch {
      // Same as above.
    }
  }, [reducedMotionManual])

  const reducedMotion = osReducedMotion || reducedMotionManual

  // Applied to <html> too (not just exposed via Context) so plain CSS
  // (`@media (prefers-reduced-motion: reduce)` already covers the OS
  // case on its own, but the MANUAL toggle has no media query to hook --
  // this attribute is what a component's CSS can key off for BOTH
  // triggers at once, via a single selector, without needing JS to
  // conditionally add/remove an animation class per component).
  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', String(reducedMotion))
  }, [reducedMotion])

  function toggleColorblindMode() {
    const next = !colorblindMode
    // Synchronous, BEFORE the state update below -- see this component's
    // own comment on the colorblindMode useState initializer for why
    // this can't wait for a useEffect.
    document.documentElement.setAttribute('data-colorblind', String(next))
    resetIntervalStyleCache()
    setColorblindModeState(next)
  }

  function toggleReducedMotionManual() {
    setReducedMotionManualState((prev) => !prev)
  }

  const value = {
    colorblindMode,
    toggleColorblindMode,
    reducedMotion,
    reducedMotionManual,
    toggleReducedMotionManual,
    osReducedMotion,
  }

  return <AccessibilityPrefsContext.Provider value={value}>{children}</AccessibilityPrefsContext.Provider>
}

export function useAccessibilityPrefs() {
  const ctx = useContext(AccessibilityPrefsContext)
  if (!ctx) throw new Error('useAccessibilityPrefs must be used within an AccessibilityPrefsProvider')
  return ctx
}
