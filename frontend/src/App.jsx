import { useEffect } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { AccessibilityPrefsProvider } from './context/AccessibilityPrefsContext'
import { CaptureProvider } from './context/CaptureContext'
import { FretboardPrefsProvider } from './context/FretboardPrefsContext'
import AccessibilityMenu from './components/AccessibilityMenu'
import CaptureModal from './components/CaptureModal'
import Home from './pages/Home'
import Results from './pages/Results'
import About from './pages/About'
import HowItWorks from './pages/HowItWorks'
import './App.css'

const GITHUB_URL = 'https://github.com/andresrodriler/BetterChord'

function App() {
  // Phase 5 Part 6/7, continued round: real, confirmed horizontal-scroll
  // bug, root-caused rather than patched with a blanket overflow-hidden.
  // `.app-header`'s "break out of a centered container" technique
  // (App.css, width: 100vw + calc(50% - 50vw) margins, from the 7th
  // follow-up) was verified back then via
  // `document.documentElement.scrollWidth === clientWidth`, which held --
  // but only because that check ran in headless Chromium, which reserves
  // ZERO width for its scrollbar (confirmed directly this round:
  // window.innerWidth === document.documentElement.clientWidth even on a
  // page tall enough to need vertical scrolling). CSS's own `100vw` unit
  // is defined against `window.innerWidth` (which INCLUDES a real,
  // classic scrollbar's reserved width), while `clientWidth` EXCLUDES it
  // -- so on any real desktop browser using a classic (non-overlay)
  // scrollbar -- the normal default on Windows Chrome -- `100vw` renders
  // wider than the true visible area by exactly the scrollbar's width,
  // and the header's own centering math (worked through by hand, see
  // CLAUDE.md) puts its real right edge scrollbarWidth/2 px past the true
  // right edge -- enough to trigger a real horizontal scrollbar, on any
  // page with enough content to need a vertical one (nearly every page
  // here). A blanket `overflow-x: hidden` would only suppress the
  // resulting scrollbar without shrinking the header back to the real
  // visible width (confirmed directly: `overflow-x: hidden` does NOT
  // change `scrollWidth`'s own reported value, only whether it's exposed
  // as a scrollable/visible scrollbar) -- so it wouldn't survive the
  // literal `scrollWidth === clientWidth` check this fix is verified
  // against. Instead: measure the real scrollbar width directly
  // (`window.innerWidth - document.documentElement.clientWidth`, 0 on any
  // browser using overlay scrollbars) once on mount and again on resize,
  // and expose it as `--scrollbar-w` on `:root` -- App.css's `.app-header`
  // rule then subtracts it from `100vw` and adds half of it back into each
  // margin, which works out (proven algebraically, see CLAUDE.md) to make
  // the header's real rendered edges land at exactly x=0 and
  // x=clientWidth regardless of scrollbar width, including 0. `overflow-
  // x: hidden` was ALSO added on `:root`/`body` (index.css) as a real
  // belt-and-suspenders safety net for the brief pre-mount frame before
  // this effect runs (where `--scrollbar-w` falls back to its `0px`
  // default via `var()`) -- not a substitute for this fix, since it alone
  // doesn't clear the literal verification check, just an added guard
  // against any future viewport-unit mistake becoming a visible scrollbar.
  useEffect(() => {
    const setScrollbarWidth = () => {
      const sw = window.innerWidth - document.documentElement.clientWidth
      document.documentElement.style.setProperty('--scrollbar-w', `${sw}px`)
    }
    setScrollbarWidth()
    window.addEventListener('resize', setScrollbarWidth)
    return () => window.removeEventListener('resize', setScrollbarWidth)
  }, [])

  return (
    <AccessibilityPrefsProvider>
      <FretboardPrefsProvider>
        <CaptureProvider>
          <div className="app-shell">
            {/* Phase 3 Part 6/6: single shared header, already lived here
                (not duplicated per page) -- only needed sticky positioning
                + nav links, no consolidation was required. */}
            <header className="app-header">
              <Link to="/" className="brand">Better<span className="brand__accent">Chord</span></Link>
              <nav className="app-nav">
                <NavLink to="/how-it-works" className="app-nav__link">How It Works</NavLink>
                <NavLink to="/about" className="app-nav__link">About</NavLink>
                <a
                  className="app-nav__link"
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
                {/* Phase 5 Part 7/8, item #14: one shared settings
                    affordance for both new accessibility preferences,
                    same nav tier as the other links. */}
                <AccessibilityMenu />
              </nav>
            </header>
            <main className="app-main">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/chord/:chordName" element={<Results />} />
                <Route path="/about" element={<About />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
              </Routes>
            </main>
          </div>
          <CaptureModal />
        </CaptureProvider>
      </FretboardPrefsProvider>
    </AccessibilityPrefsProvider>
  )
}

export default App
