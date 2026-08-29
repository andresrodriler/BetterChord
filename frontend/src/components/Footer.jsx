import { Link } from 'react-router-dom'
import './Footer.css'

// Shared footer, rendered at the bottom of all four pages (Home,
// Results, About, How It Works) from one source. The repo URL is reused
// verbatim from App.jsx's nav link / About.jsx / Home's "Browse the
// source" teaser so it can't drift. `/issues/new` is GitHub's deep-link
// path to the new-issue form (a signed-in user lands directly there; an
// unauthenticated request 302s to login with `return_to`).
const GITHUB_NEW_ISSUE_URL = 'https://github.com/andresrodriler/BetterChord/issues/new'

// The second-row block: the same About/How It Works links as the top nav
// (useful on a long Results page once the top nav scrolls away), a
// GitHub link, and a one-line credit -- not a multi-column sitemap
// footer. `GITHUB_URL` is the plain repo root (not the `/issues/new`
// deep link the disclaimer row uses), reused verbatim from the same
// places as above.
const GITHUB_URL = 'https://github.com/andresrodriler/BetterChord'

function Footer() {
  return (
    <div className="app-footer">
      <div className="app-footer__row">
        Built solo by a DSC student, evenings and weekend. Not a company, no ads.{' '}
        <a
          className="app-footer__link"
          href={GITHUB_NEW_ISSUE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Wrong chord? Issues? Help me fix it &rarr;
        </a>
      </div>

      {/* Second row block -- same destinations as the top nav's
          About/How It Works/GitHub links (App.jsx), reused rather than a
          second driftable copy, plus a one-line credit. Its own top
          border so it reads as a distinct block below the disclaimer
          row. */}
      <div className="app-footer__secondary">
        <div className="app-footer__row app-footer__row--links">
          <Link className="app-footer__link" to="/about">About</Link>
          <span className="app-footer__sep" aria-hidden="true">&middot;</span>
          <Link className="app-footer__link" to="/how-it-works">How It Works</Link>
          <span className="app-footer__sep" aria-hidden="true">&middot;</span>
          <a
            className="app-footer__link"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
        <div className="app-footer__row app-footer__row--credit">&copy; 2026 BetterChord</div>
      </div>
    </div>
  )
}

export default Footer
