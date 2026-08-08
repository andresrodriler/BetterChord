import { createContext, useContext, useEffect, useState } from 'react'

const FretboardPrefsContext = createContext(null)

// Nice-to-have, not required (per Phase 3 Part 2 follow-up scope): persist
// across a full page reload via localStorage, on top of the Context
// already handling persistence across in-session navigation.
const STORAGE_KEY = 'betterchord:left-handed'

// Site-wide fretboard rendering preference (currently just handedness) --
// lives at the App level, same pattern as CaptureContext, so any
// FretboardDiagram anywhere in the app (Home, Results, capture modal
// previews if added later) reads the same global value instead of each
// page/component tracking its own toggle.
export function FretboardPrefsProvider({ children }) {
  const [leftHanded, setLeftHanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      // localStorage unavailable (private browsing, etc.) -- fall back to
      // the default; the toggle still works for the session via Context.
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(leftHanded))
    } catch {
      // Same as above -- toggle still works this session, just doesn't
      // survive a reload.
    }
  }, [leftHanded])

  function toggleHandedness() {
    setLeftHanded((prev) => !prev)
  }

  const value = { leftHanded, toggleHandedness }

  return <FretboardPrefsContext.Provider value={value}>{children}</FretboardPrefsContext.Provider>
}

export function useFretboardPrefs() {
  const ctx = useContext(FretboardPrefsContext)
  if (!ctx) throw new Error('useFretboardPrefs must be used within a FretboardPrefsProvider')
  return ctx
}
