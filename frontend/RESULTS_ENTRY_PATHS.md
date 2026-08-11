# How Results is reached, and what's already resolved by the time it renders

Written during a Phase 5 Part 2/7 follow-up (post-close review) that found
real gaps in how the "extra note" mechanisms behaved across different
arrival paths -- this doc maps the 4 real ways to land on `/chord/:chordName`
against real code (not assumed), so those gaps don't need re-deriving from
scratch next time this comes up. See CLAUDE.md's Phase 5 Part 2/7 entry for
the fixes this investigation led to (bass-alias bug, quality-equivalence
title unification, the combined substitution note).

**Superseded by two later follow-ups, updated in place rather than left
stale**: the "combined substitution note" (title-level `Why X?`
disclosure, `buildSubstitutionNote`) described throughout this doc's
per-path sections below **no longer exists** -- it was replaced by (1) a
small always-present parenthetical next to the title (no disclosure
widget) and (2) a "Why this spelling" prose sentence inside a new "Chord
Overview" card (renamed from "Overall Chord Info" -- see
`ChordOverview.jsx`, `CHORD_INFO_AUDIT.md`, `NOTE_STYLE_GUIDE.md`). A
second follow-up added a THIRD, genuinely new element on top of those
two: a conditional "why" teaser near the title, narrower than the
parenthetical -- see "The conditional 'why' teaser" section below, added
this round, not part of the original path investigation. The per-path
*reasoning* below (what's knowable on which path, and why) is still
accurate and left as historical detail -- only the specific mechanism
name/shape changed, and one path's real
behavior actually improved as a result (path C, see its section below,
updated in place with what changed and why).

## The two genuinely different note categories

Easy to conflate, so stated plainly up front:

- **SUBSTITUTION notes** -- root/bass/quality spelling normalized from
  as-typed input to canonical. These explain a pure **naming** fact ("what
  you typed and what's shown are the identical chord, just spelled/named
  differently") and are only ever relevant on a path where the arriving
  value could plausibly be non-canonical in the first place.
- **FALLBACK/EQUIVALENCE notes** -- inversion fallback, quality fallback,
  guide-tone equivalence. These are driven purely by whether the
  *already-resolved* canonical chord has song/data coverage, and are
  **completely independent of which path was used to arrive there**. A
  chord reached via any of the 4 paths below can trigger these identically,
  because they're computed from `chordName` itself (whatever it ends up
  being), not from anything about the journey to get there.

The practical consequence: substitution notes need to know *what was
originally typed* (only available on some paths); fallback/equivalence
notes never do (they only need the final chord name, always available).

## The 4 real paths

### A. Dropdown click in ManualSearch

`ManualSearch.jsx`'s suggestion `<li>` `onMouseDown` calls
`goToChord(s.chord, value)`, where `s.chord` comes directly from the
`/chords` endpoint's precomputed list -- built server-side via
`chord_parser.format_chord()` over the registry (`api.py`'s `GET /chords`).
**Arrives already fully canonical, root+quality.** No bass/slash variants
are ever in this list (Phase 3 Part 4/6's explicit scoping: "Root+quality
only -- no slash/bass variants generated").

- SUBSTITUTION notes: **structurally cannot fire.** The value was never
  anything but canonical.
- FALLBACK/EQUIVALENCE notes: can still fire, same as any path -- e.g. a
  dropdown-picked chord can still have zero songs for its exact quality,
  triggering the quality-fallback banal.
- Confirmed live: picking "Cmaj7" from the dropdown -> title "Cmaj7", zero
  substitution-note disclosures rendered.

### B. Custom typed input + submit in ManualSearch

`handleSubmit`'s no-dropdown-selection branch: `const { normalized } =
normalizeAliases(chord, rootAliases); goToChord(normalized, value)`. Two
values matter here, and they diverge on purpose:
- `normalized` (what gets used to build the URL) -- root AND bass
  canonicalized (this follow-up's Task 1 fix; used to be root-only, see
  CLAUDE.md), but the **quality portion of the string is left untouched**.
  E.g. typing "D#7#5/G#" navigates to `/chord/Eb7%235/Ab` -- root and bass
  fixed, "7#5" still literally "7#5".
- `value` (passed as route state `searchedAs`) -- the **fully raw, as-typed
  string**, no normalization at all. This is the one and only source of
  "what did the user literally type" available anywhere in the app.

- SUBSTITUTION notes: **root and bass are only detectable on this path**,
  by comparing `searchedAs` (raw) against the canonical root/bass via
  `normalizeAliases` again on the Results side. Quality is detectable here
  too, but through a completely different mechanism (see path C) that
  doesn't actually need `searchedAs` at all.
- FALLBACK/EQUIVALENCE notes: fire identically to any other path.
- Confirmed live: typing "Ebmaj7add11/A#" and submitting -> URL becomes
  `/chord/Ebmaj7add11%2FBb`, title "Ebmaj7add11/Bb" (Task 1's fix).
  Typing "D#7#5" -> title "Ebaug7" with ONE combined note naming both the
  root alias and the quality equivalence (Task 3).

### C. Direct URL visit to `/chord/:chordName`

No `ManualSearch` involved at all -- a bookmarked link, a pasted URL, a
back-button arrival after the SPA state was lost, or literally typing a
URL into the address bar with any spelling at all, canonical or not.
`location.state` is `{}` (React Router's default for a fresh navigation
with no state), so **`searchedAs` is always `undefined` here.**

- **Title always self-corrects to canonical, regardless of path.** Because
  the page title is `songs.data.primary_chord` (fully root+bass+quality
  canonical, computed server-side from `chordName` alone) rather than the
  raw URL param, a non-canonical direct URL visit renders the CORRECT
  canonical title with zero extra plumbing -- confirmed live: `/chord/D%23m7`
  (an intentionally "wrong"/uncanonical direct URL) renders the title as
  "Ebm7".
- **Superseded finding, corrected**: an earlier version of this doc claimed
  root/bass differences "structurally cannot" be explained at all on this
  path, only quality could. **That's no longer true**, and re-verifying it
  live is what caught the change: since the title's small parenthetical
  (Task 3's redesign) compares the raw `chordName` directly against the
  canonical `title` -- not `searchedAs` -- it works for root/bass
  differences on path C too, not just quality. Confirmed live: `/chord/D%23m7`
  renders `"Ebm7 (searched: D#m7)"`, not a bare "Ebm7" -- the earlier claim
  was written for the OLD mechanism (which really did require `searchedAs`
  for root/bass) and stayed true right up until this redesign changed the
  comparison it's based on. The one genuine remaining limitation: this
  still can't distinguish "the user pasted a weird spelling into the URL
  bar" from "the user typed it into ManualSearch and it wasn't
  pre-normalized for some reason" -- it only ever knows the two strings
  being compared (raw URL vs. canonical), never a richer "history" of how
  the user got there. That's an acceptable loss of nuance, not a bug.
- The "Why this spelling" bar (root/bass/quality alternate spellings) is
  **also fully path-independent** -- it comes from `/chord-info`, driven entirely by
  the resolved canonical chord, never route state. Confirmed live:
  identical `ChordOverview` content (byte-for-byte, not just
  "similar") for the same chord reached via path A (dropdown), path B
  (typed+submit), and path C (direct URL) -- see the "combined-
  substitution example" section below for the specific chord tested.
- FALLBACK/EQUIVALENCE notes: fire identically to any other path.

### D. Audio-ID path (Preview -> Continue -> `/identify` -> Results)

`CaptureContext.jsx`'s `handleContinue()` navigates with route state
`{ fromAudio: true, confidence, identified }` -- **no `searchedAs` field
at all**, confirmed by reading the object literal directly. The chord name
itself comes from `main.py`'s `identify_from_audio()`:
`chord_name = cp.format_chord(identified["root"], identified["quality"], bass)`,
where `root`/`quality`/`bass` are produced entirely by the CNN + rule-based
scoring engine (`music_theory.py`), never by parsing user-typed text.

- SUBSTITUTION notes: **structurally cannot fire, for two independent
  reasons.** (1) No `searchedAs` route state exists on this path at all, so
  root/bass substitution notes have nothing to compare against, same
  blind spot as path C. (2) There is no user-typed string anywhere in this
  path's data flow to BE non-canonical in the first place -- the naming
  engine builds the chord name from internal canonical note/quality
  identifiers, not from parsing free text, so root/bass/quality are
  effectively "born canonical" here. (Not exhaustively re-verified beyond
  reading `main.py`/this call site -- if a future session finds a real
  audio-ID chord whose name isn't canonical, that would be a `music_theory.py`
  naming bug worth its own investigation, not evidence against this
  reasoning.)
- FALLBACK/EQUIVALENCE notes: fire identically to any other path -- an
  audio-identified chord can still have zero songs for its exact quality
  or inversion.

## Path × note-family matrix (updated for the title-redesign follow-up)

Split into the two mechanisms that replaced the old combined note, since
they now have genuinely different path behavior (they didn't before, when
they were one mechanism):

| Family | A (dropdown) | B (typed+submit) | C (direct URL) | D (audio ID) |
|---|---|---|---|---|
| Title parenthetical (root/bass) | **fires if the typed prefix differs from the picked suggestion** (real, confirmed live -- see below; NOT "cannot fire" as an earlier version of this doc claimed) | fires (raw `searchedAs` vs. canonical title) | **fires if the raw URL itself is non-canonical** (real behavior change -- see path C's own section above) | cannot fire (no route state, and the chord name is already canonical) |
| Title parenthetical (quality) | fires if the typed/picked spelling differs (rare -- dropdown values are usually already canonical) | fires if applicable | fires if applicable (server-side, from `chordName` alone) | cannot fire in practice (naming engine emits canonical qualities) |
| "Why this spelling" bar (ChordOverview) | fires if applicable -- **identical on every path**, confirmed live via byte-for-byte comparison (see below) | fires if applicable | fires if applicable | fires if applicable |
| Inversion fallback | fires if applicable | fires if applicable | fires if applicable | fires if applicable |
| Quality fallback | fires if applicable | fires if applicable | fires if applicable | fires if applicable |
| Guide-tone related (Overlapping chords, ChordOverview) | fires if applicable | fires if applicable | fires if applicable | fires if applicable |

**Real correction to the previous version of this table, found by
re-testing rather than assumed unchanged**: path A's title parenthetical
was previously written off as impossible ("already canonical"). That's
true of the SUGGESTION VALUE, but not of what's compared -- `searchedAs`
is whatever text was literally in the input box at click time, which can
be a partial prefix of the picked suggestion, not necessarily equal to
it. Confirmed live: typing `"Cmaj"` and clicking the `Cmaj7` suggestion
renders the title `"Cmaj7 (searched: Cmaj)"`, not a bare `"Cmaj7"`. Not a
bug -- it's an accurate statement (you searched a prefix, this is the
specific match shown) -- but a real behavior worth knowing about rather
than assuming path A never shows this.

**The "Why this spelling" bar is fully path-independent**, unlike
the title parenthetical -- confirmed live for the identical chord
(`Cmaj7`) reached via path A (dropdown), path B (typed+submit), and path
C (direct URL): the entire `ChordOverview` card's rendered text
matched byte-for-byte across all three. This makes sense structurally:
it's driven entirely by `/chord-info`, itself driven entirely by the
resolved canonical chord name, with zero dependency on route state.

## A real combined-substitution example, for reference

Constructed (not found by chance) by picking a root that's a recognized
alias (`D#` -> `Eb`) together with a quality spelling that resolves via
equivalence (`7#5` -> `aug7`), confirmed live end-to-end via path B:

- **`D#7#5`** (root + quality, no bass) -> title `Ebaug7 (searched: D#7#5)`.
- **`D#7#5/G#`** (root + bass + quality, all three at once) -> title
  `Ebaug7/Ab (searched: D#7#5/G#)` (the full, real-inversion-preserving
  canonical form -- NOT silently dropped to root position, see the
  substitution-vs-fallback split below), with `ChordOverview`'s
  "Why this spelling" bar naming all three causes
  individually ("Root: `Eb` can also be spelled `D#`", "Bass: `Ab` can
  also be spelled `G#`", "Quality: `aug7` is also written `7#5`"), **and**,
  separately and without conflict, the existing inversion-fallback banner
  ("no songs are tagged with the exact inversion `Ebaug7/Ab` -- songs for
  the root-position chord `Ebaug7` are shown here instead") -- confirmed
  live that both render correctly at once, the title/alt-spellings list
  never gets corrupted by the fallback also being in play.

That last point is the reason the title is built from `songs.data.primary_chord`
specifically, and never `songs.data.resolved_primary_chord`:
`primary_chord` is a pure **naming** fact (root+bass+quality, all
canonical, computed before any availability/fallback logic runs) while
`resolved_primary_chord` is a **data-availability** fact (what actually has
matching songs, post any inversion fallback, silently bass-less when that
fallback fires). Using the wrong one for the title would either wrongly
retitle a page whose title is supposed to stay honest about what was
searched (if using `resolved_primary_chord`), or fail to reflect canonical
quality naming (if using the raw URL param). This is the concrete
instance of the substitution/fallback split from the top of this doc
actually mattering for an implementation decision, not just a conceptual
distinction.

## The conditional "why" teaser (added this round -- a THIRD, narrower
   mechanism, not a replacement for the parenthetical)

The title now has TWO separate mechanisms that can both reference "what
was searched," with genuinely different gating -- worth keeping straight,
since they're easy to conflate:

- **The parenthetical** (`(searched: X)`, Task 3, previous round) fires
  for ANY text difference between what was searched and the canonical
  title -- including a harmless dropdown-prefix completion on path A
  (e.g. typing "Cmaj" and clicking the "Cmaj7" suggestion). Always
  visible when it fires, no conditions beyond "the two strings differ."
- **The teaser** (`Why this spelling? ↓`, this round) is narrower on
  purpose: it should only appear when a REAL root/bass/quality
  substitution happened, and only on a path where that's a meaningful
  thing to point out. Reusing the parenthetical's own "did the strings
  differ" check isn't enough on its own -- confirmed live in the prior
  round that path A's parenthetical fires for prefix completions too,
  which are not a substitution.

**The real problem this surfaced**: `searchedAs` alone can't distinguish
"path A, dropdown pick" from "path B, typed+submit" -- both produce a
`searchedAs` that can legitimately differ from the final chord. Fixed by
adding an explicit `fromSuggestion` boolean to route state, set at
`ManualSearch.jsx`'s `goToChord()` call sites: `true` for a mouse click OR
an arrow-key-select-then-Enter (both guarantee the chosen chord is
already canonical, from the `/chords` list), `false` only for a raw
typed-then-submit value with nothing selected. This is the first time
route state has needed to record *which kind* of ManualSearch action
produced a navigation, not just what was typed -- previously `searchedAs`
alone was assumed sufficient because nothing needed to tell path A and
path B apart this precisely.

**Final gate**, all four conditions required:
```
showWhyTeaser = showSearchedParenthetical && !fromSuggestion && !fromAudio && hasAltSpellingData
```

| Path | `fromSuggestion` | `fromAudio` | Teaser can fire? |
|---|---|---|---|
| A (dropdown pick, click or arrow+Enter) | `true` | `false` | **No** -- excluded explicitly, even though the parenthetical can still fire here for a prefix completion |
| B (typed+submit) | `false` | `false` | **Yes**, if a real substitution occurred (`hasAltSpellingData` true) |
| C (direct URL) | `undefined` (falsy, no route state at all) | `undefined` (falsy) | **Yes**, if a real substitution occurred |
| D (audio-ID) | `undefined` (falsy) | `true` | **No** -- excluded explicitly, and `hasAltSpellingData` would almost never be true here anyway (see path D's own section above: the naming engine emits canonical chords, so there's rarely a real substitution to tease in the first place) |

Confirmed live for both required cases: a real typed-substitution search
(path B) shows the teaser; the identical chord reached via a dropdown
pick (path A) does not, even though both can show the parenthetical.
