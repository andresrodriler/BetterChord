import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { CaptureProvider } from './context/CaptureContext'
import { FretboardPrefsProvider } from './context/FretboardPrefsContext'
import CaptureModal from './components/CaptureModal'
import Home from './pages/Home'
import Results from './pages/Results'
import About from './pages/About'
import HowItWorks from './pages/HowItWorks'
import './App.css'

const GITHUB_URL = 'https://github.com/andresrodriler/BetterChord'

function App() {
  return (
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
  )
}

export default App
