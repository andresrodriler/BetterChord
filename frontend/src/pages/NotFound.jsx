import { Link } from 'react-router-dom'

// Catch-all 404, wired to `path="*"` in App.jsx. Deliberately minimal: a
// single recessed "device face" panel (the pressed-in surface for a
// dead end), the intentional playful line, and an arrow pointing at the
// button home. No search box / chord lookup here on purpose. Styled with
// existing shared classes + tokens (per betterchord-design/SKILL.md) so
// it needs no CSS file of its own -- only the few structural bits below
// are inline.
function NotFound() {
  return (
    <div className="section" style={{ alignItems: 'center', textAlign: 'center', paddingBlock: 32 }}>
      <div className="panel panel--recessed" style={{ maxWidth: 520, width: '100%', padding: 32 }}>
        {/* Global h2 = the app's small uppercase mono "silkscreen" label. */}
        <h2 style={{ margin: '0 0 16px' }}>Page not found</h2>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--parchment)', maxWidth: '34ch', margin: '0 auto 24px' }}>
          Nothing over here! Get back to learning about music theory with BetterChord.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* Shared `.btn` doesn't null text-decoration; anchor use sites patch it
              locally (cf. About.css's a.about-github-link). */}
          <Link
            to="/"
            className="btn btn-primary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <span aria-hidden="true">&rarr;</span>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default NotFound
