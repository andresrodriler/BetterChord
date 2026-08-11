# BetterChord "extra note" style guide

Governs the wording/formatting/placement of every explanatory note, caption,
or aside the app shows beyond the raw voicing/song data itself. Written
after auditing the actual text of all 9 real families currently in the app
(see CLAUDE.md's Phase 5 Part 2/7 entry for how they were found/catalogued)
-- this documents what was actually inconsistent, not a generic style guide
imposed from outside. Scope: wording and placement only. Visual design
(colors, borders, box styling) is untouched -- that's Phase 5 Part 6/7.

## The 9 families, for reference

1. Root-alias caption while typing (`ManualSearch` dropdown)
2. Root-alias caption on the Results header
3. Songs panel inversion-fallback banner
4. Songs panel quality-fallback banner
5. Songs panel equivalence/searched-quality note
6. Songs panel guide-tone related note
7. SongCard capo-shape/raw-chord note
8. VoicingModal omitted/included-tones sentence
9. Capture-quality warning (CaptureModal)

Families 8 and 9 don't mention chord names or substitution/fallback logic
at all (8 lists interval tokens about a voicing already on screen; 9 is
audio-quality feedback with no chord content) -- most of this guide doesn't
apply to them, and that's noted explicitly below rather than silently
skipped.

## 1. Inconsistencies found (before this pass)

- **Chord-name formatting was inconsistent.** Families 3-6 (all backend-
  generated) wrapped chord names in backticks, rendered via a
  `renderBacktickedText` helper into `.readout`-styled spans. Family 7
  (frontend-generated) hand-wrapped chord names in `<span
  className="readout">` directly -- same visual result, different
  mechanism. Families 1 and 2 (both frontend, both about root-alias
  spelling) rendered their chord names as **plain, unstyled text** --
  the exact same kind of token every other family gives the readout
  treatment, just missing it. Fixed: every family that names a chord in
  prose now uses the readout treatment, via one of two mechanisms (see
  "Shared helpers" below), never plain text.
- **"Same note" / "same chord" / "same notes" / "identical notes" were used
  almost interchangeably** even though they describe three genuinely
  different relationships:
  - **root-spelling equivalence** (one pitch, two spellings -- families 1, 2)
  - **full-chord-quality equivalence** (identical interval set, two quality
    names -- family 5)
  - **guide-tone subset equivalence** (one chord's notes minus a tone equal
    another's -- family 6)
  Fixed by reserving one term per relationship, applied consistently:
  **"same note"** (singular) only for root-spelling equivalence, **"same
  chord"** only for full equivalence, **"same notes"** (plural, with an
  explicit "minus a tone" qualifier) only for the guide-tone subset case.
- **"enharmonic" was introduced in family 1 (with a plain-language gloss)
  but never used in family 2**, even though both describe the identical
  phenomenon (root-alias spelling) and a user can land on Results directly
  without ever seeing family 1's caption. Fixed: both now use the term,
  both with the same gloss, so neither assumes the other was seen first.
- **The "what's actually shown" clause used at least four different
  phrasings** across families: "showing X chords", "shown here as X",
  "Showing songs for X instead", "so it's shown as X below". Fixed: one
  fixed idiom, **"shown here as `X`"** (or "...shown here instead" /
  "...shown here too" when the note is adding to a list rather than
  renaming a single result -- see the idiom table below), used everywhere
  a note states what's actually displayed as the result of a substitution.
- **Cause-before-effect vs. effect-before-cause ordering had no stated
  rule** and the 9 families split roughly down the middle. Fixed by tying
  ordering to the family's own job (see "Ordering rule" below), which also
  meant genuinely reordering family 6's sentence, not just relabeling it.
- **Sentence count varied widely** for no principled reason -- family 6's
  full form ran 4 sentences for what's structurally one idea (a tone is
  usually omitted, so the two chords are interchangeable). Tightened to
  1-2 sentences per full-form note as a guideline (see below); short-form
  bullets (used only when 2+ educational notes co-occur) stay a single
  clause, always.
- **"omitted" (family 8) vs. "left out" (family 6)** describe the same
  underlying idea in different registers. **Deliberately left
  un-unified** -- family 6 is a colloquial, general music-theory
  explanation ("guitarists commonly leave this out"), family 8 is a plain
  factual readout of one specific voicing's own data ("this voicing is
  missing X"). Forcing one verb across both would make one of them read
  oddly for its actual register; noted here so it isn't mistaken for an
  oversight later.

## 2. Fixed conventions going forward

**Terminology**
| Relationship | Term to use |
|---|---|
| One pitch, two spellings (root alias) | "same note" |
| Identical interval set, two quality names | "same chord" |
| One chord's notes minus a tone equal another's | "same notes" (+ "missing a tone or two" or similarly explicit) |
| The jargon word itself | "enharmonic", always in quotes, always paired with a plain-language gloss the first time it appears in that note (not assumed carried over from elsewhere on the page) |

**The "what's shown" idiom** -- pick the one that matches what actually
happened, never invent a new phrasing:
| Situation | Idiom |
|---|---|
| A single result was renamed/resolved to a different spelling | "shown here as `X`" |
| A single result was substituted for a different one entirely (fallback) | "`X` is shown here instead" |
| Extra results were added alongside the existing ones | "...are shown here too" |

**Chord names**: always backticked in any string built as prose (Python or
JS), rendered via the shared parser below -- never string-concatenated
into a sentence unstyled, and never wrapped by a second, differently-named
mechanism per family.

**Punctuation**: use `" -- "` (space, double hyphen, space), matching the
rest of the codebase's ASCII-only convention (CLAUDE.md, every code
comment) -- never a Unicode em dash.

**Sentence length**: full-form notes aim for 1-2 sentences. If a note
needs a third clause to stay factually complete, prefer an em-dash-joined
clause over a new sentence. Short-form bullets (see "Visibility" below)
are always a single clause and are exempt from the cause/effect ordering
rule below -- they're headline-style summaries for fast scanning, always
shaped `subject -- reason`, regardless of what order the full form uses.

## 3. Ordering rule: cause-before-effect vs. effect-before-cause

Tied to what kind of note it is, not decided per-family by feel:

- **STRUCTURAL banners** (they tell you what happened to your search --
  families 3, 4): **effect-before-cause**. Lead with the actionable status
  ("no songs are tagged with exactly X"), then the resolution/reason. A
  banner's job is to be skimmed for "what am I looking at," so the most
  important fact goes first.
- **EDUCATIONAL notes** (they explain *why* something reads the way it
  does, without being the primary fact of the page -- families 1, 2, 5, 6):
  **cause-before-effect**. Lead with the underlying fact ("X and Y are the
  same note"), end with what that fact caused ("...shown here as Y"). An
  explanation reads more naturally starting from the reason.

Applying this actually changed family 6's sentence, not just its label --
see "Text changes" below; families 1, 2, 3, 4, 5 already matched (or were
adjusted for terminology, not order).

## 4. Visibility/placement rule

**A note that changes which specific results (songs/voicings) are listed
on the page -- i.e., without it, a genuinely different set of rows would
be showing -- is STRUCTURAL: always visible, never collapsed.**

**A note that only explains spelling/terminology/why something reads a
certain way, without altering which rows appear, is EDUCATIONAL.**
Educational notes are gated behind a collapsed disclosure specifically in
places where **more than one such note can co-occur and stack into
multiple boxes at once** -- the disclosure's job is preventing stacking
clutter, not hiding information by default everywhere. An educational
note that is inherently standalone at its location (nothing else can ever
stack next to it there) stays inline, ungated -- gating a single short
line behind a click adds friction with no clutter to prevent.

Sorted:

| # | Family | Kind | Can stack with another note at that location? | Placement |
|---|---|---|---|---|
| 1 | Typing-time root-alias caption | N/A -- live input feedback, not a results note | -- | Inline (exempt from this rule entirely) |
| 2 | Results-header root-alias caption | Educational | No (only one header, only one possible alias note) | **Moved behind a disclosure this pass** -- see below |
| 3 | Inversion-fallback banner | Structural | -- | Always visible |
| 4 | Quality-fallback banner | Structural | -- | Always visible |
| 5 | Equivalence/searched-quality note | Educational | Yes -- can co-occur with 6 | Behind the Songs-panel disclosure |
| 6 | Guide-tone related note | Educational | Yes -- can co-occur with 5 | Behind the Songs-panel disclosure |
| 7 | SongCard capo/raw-chord note | Educational | No (one per song card, nothing else stacks there) | Inline once the card is expanded (the card's own chevron is already a disclosure) |
| 8 | VoicingModal omitted-tones sentence | Neither -- states a fact about the voicing already on screen, not a substitution | -- | Inline (out of this rule's domain) |
| 9 | Capture-quality warning | Neither -- audio-quality feedback, not chord/result substitution | -- | Inline (out of this rule's domain) |

**Family 2 is the one mover.** Under a literal reading of the rule it's a
purely explanatory aside (root-alias substitution happens before the
backend search even runs -- the songs/voicings shown are exactly what
they'd be for the canonical chord regardless, nothing about the result
set depends on this note existing), so it shouldn't be a permanent
always-visible banner just because it happens to live at the page header
rather than the Songs panel. It previously had no disclosure mechanism
available to it at all (the existing one is Songs-panel-specific and
covers a different pair of notes) -- rather than leaving it as the one
un-gated educational aside, it now renders behind a small `Why {chordName}?`
disclosure, reusing the same `NoteDisclosure` component the Songs panel
already uses (see "Shared helpers"). Family 7 was *not* moved -- it
already lives inside `SongCard`'s own per-song expand/collapse, which
already functions as its disclosure; adding a second nested toggle inside
an already-collapsed panel would be extra friction with no clutter being
prevented.

## 5. Shared helpers (see CLAUDE.md for file paths)

Targeted, not a single monolith -- each helper exists because multiple
families share one *specific* formatting need, not because "notes should
share code" in the abstract:

- **`ChordName`** (`components/ChordName.jsx`) -- the one place `.readout`
  is applied to a chord name. Used directly by family 7 (built from
  discrete JS variables in JSX, no prose string to parse) and indirectly
  by families 1, 2, 3, 4, 5, 6 via `renderChordNote` below. If the visual
  treatment for an inline chord name ever needs to change, there is now
  exactly one place to change it, not seven.
- **`renderChordNote`** (`lib/renderChordNote.jsx`) -- turns a backtick-
  delimited prose string (as built by `chordAlias.js` or `songs.py`) into
  real JSX, rendering odd-indexed segments as `<ChordName>`. Used by
  families 1, 2, 3, 4, 5, 6 -- every family whose text is authored as one
  interpolated string. (Previously private to `Results.jsx` as
  `renderBacktickedText`, covering only families 3-6; relocated to `lib/`
  and adopted by `ManualSearch.jsx`/family 1-2's captions too, closing the
  gap that left those two without the readout treatment at all.) Family 7
  doesn't use this parser -- its note is composed directly from separate
  JSX pieces, not one free-text string, so there's nothing to parse.
- **`normalizeAliases`** (`lib/chordAlias.js`, renamed from `normalizeRoot`
  by a later Phase 5 Part 2/7 follow-up -- see `RESULTS_ENTRY_PATHS.md`)
  -- detects and canonicalizes an alias spelling at the ROOT position, the
  BASS position (a slash chord's `/X`), or both, against the same 12-pitch
  alias table either way. Used for both ManualSearch's pre-navigation
  normalization and the Results header's substitution-note derivation.
- **`sameNoteClause`** (`lib/chordAlias.js`, renamed from
  `enharmonicRootClause` by the same follow-up, generalized to name either
  position) -- families 1 and 2 shared not just a formatting need but the
  literal opening clause of their sentence ("`X` and `Y` are the same
  note, spelled differently (\"enharmonic\")"); generalizing
  `normalizeAliases` to also cover bass meant this clause-builder needed
  to say *which* position it's about (root gets no suffix, matching the
  original wording exactly; bass gets a `(the bass note)` parenthetical).
- **`buildSubstitutionNote`** (`lib/chordAlias.js`, new in the same
  follow-up, replacing the old root-only `resultsEnharmonicCaption`) --
  combines however many of root/bass/quality substitutions actually
  happened into ONE prose note, since a search can trigger more than one
  simultaneously (e.g. `D#7#5` is both a root alias and a quality
  equivalence) and stacking two independent sentences for one underlying
  "here's why the title differs from what you searched" event would
  violate this guide's own rules. This is also where family 5's old
  quality-equivalence text now lives -- it used to render separately in
  the Songs panel; see `RESULTS_ENTRY_PATHS.md` for why it moved to the
  header instead (in short: it's a naming fact about the TITLE, not about
  why extra songs appear in the Songs panel, and family 6's guide-tone
  note is the only thing that's actually about that).
- **`NoteDisclosure`** (`components/NoteDisclosure.jsx`) -- the
  collapsed-toggle-plus-caret interaction, generalized from what was a
  Songs-panel-only inline implementation (`educational-notes__toggle`).
  Used by the Songs panel (family 6 only, as of the follow-up above) and
  the Results header (the combined substitution note). Same markup/CSS as
  before, renamed from `educational-notes__*` to `note-disclosure__*`
  since it's no longer Songs-panel-specific -- no visual change, confirmed
  by keeping every CSS rule's declarations identical, only the selector
  names generalized.

Not shared, and deliberately so: family 8 (no chord names, no
substitution logic -- nothing in common with the others to factor) and
family 9 (different domain entirely -- audio quality, not chord naming).
Forcing either through `ChordName`/`renderChordNote` would mean inventing
backtick markup for text that was never chord-name prose in the first
place.

**Note on a later architectural replacement (not a wording pass -- flagged
here so this guide doesn't silently go stale)**: a further follow-up
replaced the entire title-level substitution mechanism this guide
documents above (families 1/2's captions feeding into `buildSubstitutionNote`,
the "Why X?" header disclosure) with a different design: the title is now
just the canonical chord name plus a small parenthetical (no disclosure
widget), and the full explanation moved into a new, permanently-visible
"Overall Chord Info" section on Results (`OverallChordInfo.jsx`) as an
"Other ways to write this chord" list -- a standing fact about the chord,
not a note explaining one specific search. `buildSubstitutionNote`,
`enharmonicRootClause`/`sameNoteClause`'s use for the header, and the
`NoteDisclosure` component itself (no longer used anywhere) were all
removed as part of this, not left running alongside the new section. The
STYLE rules above (terminology, ordering, chord-name formatting) still
apply to whatever text remains (family 1's typing caption is explicitly
unchanged; the fallback banners are unchanged) -- only the
title-explanation mechanism specifically was replaced. Full detail:
`RESULTS_ENTRY_PATHS.md` and `CHORD_INFO_AUDIT.md`.

**Note on family 5's relocation and Task 4's bullet-list removal**: this
guide's original "Visibility/placement rule" table (above) listed family 5
(equivalence/searched-quality note) as living in the Songs panel,
co-occurring with family 6. A later Phase 5 Part 2/7 follow-up (see
`RESULTS_ENTRY_PATHS.md`) moved it to the header instead, merged with
root/bass substitution into one note. That table is left as-is above since
it accurately describes the original pass's reasoning at the time -- this
note flags the one place reality has since diverged, rather than silently
rewriting history. One consequence: the Songs-panel toggle's old
"2+ items render as a condensed bullet list" behavior (built specifically
to fit an equivalence note *and* a related note into one small space) was
removed once that bucket could only ever hold guide-tone related notes --
multiple related notes now render as stacked full-prose paragraphs
instead, matching this guide's sentence-length/prose-voice rules exactly
rather than needing its own exception.

**Note on the Chord Overview redesign (renames `OverallChordInfo.jsx` ->
`ChordOverview.jsx`, repositions above Voicings/Songs, and reframes the
alt-spelling text)**: a further follow-up rebuilt the "Overall Chord
Info" section referenced above into a "Chord Overview" card, following a
real HTML/CSS mockup for layout/structure (not palette -- see
`RESULTS_ENTRY_PATHS.md`). Two wording changes worth recording here:

- **The "Other ways to write this chord" bulleted list became "Why this
  spelling" -- one flowing prose sentence**, via a new
  `buildAltSpellingSentence()` (`chordAlias.js`), replacing the earlier
  `<ul>` rendering. Same underlying data (root/bass/quality alternates
  from `/chord-info`), same chord-fact framing ("`Eb` can also be spelled
  `D#`", never "you searched..."), just joined into one sentence with the
  guide's existing multi-clause pattern (", and " before the last clause)
  instead of separate `<li>` lines -- a presentation change, not a new
  fact category.
- **New named pattern: "theory-first, songs-impact-as-a-short-trailing-
  clause."** Confirmed the existing family-6 text (`build_related_note()`
  in `songs.py`) already matched this shape from an earlier rewording
  pass (cause-before-effect, see the Ordering rule above) -- no wording
  change was needed there, just formalizing the pattern as its own named
  rule so it's recognized as deliberate, not coincidental, next time this
  family is touched: the sentence should spend the MAJORITY of its length
  on the actual music-theory reason (which tones overlap and why), with
  the "so songs tagged X are shown here too" clause kept short and
  trailing, never the sentence's main clause or its opening. Example
  (unchanged, still live): "A `C13` chord's 9th and 11th are commonly
  left out by guitarists, leaving the same notes as `C7add13` -- so songs
  tagged `C7add13` are shown here too." -- confirmed the theory clause
  (17 words) outweighs the trailing clause (7 words) by design, not by
  accident.

Also, per this round's explicit scope: `get_chord_info()`'s own `related`
dict (relative minor/parallel/tritone-sub/"resolves from (V7)"/simpler-
version -- a DIFFERENT relationship than family 6's guide-tone overlap,
see `CHORD_INFO_AUDIT.md`) is confirmed NOT wired into this card. Not a
gap -- a deliberate exclusion, re-affirmed this round after being
tentatively surfaced in the prior one.

## Similar Chords: two entry templates, one list (this follow-up's Task 3)

A further follow-up replaced "Overlapping chords" with a "Similar
Chords" list combining TWO genuinely different relationships that were
previously scattered across different mechanisms -- formalized here
since they're now real, reusable templates, not one-off wording:

- **Synonym template** (true equivalence -- identical notes, different
  quality name, e.g. `aug7` <-> `7#5`), **finalized this way in a later
  follow-up, superseding the version described just below**:
  `` {reason}, so `{synonym}` and `{thisChord}` are the same chord, and
  any songs tagged with either are shown here too. `` Cause-before-
  effect (the theory reason leads, the identity claim follows) -- e.g.
  for `aug7`/`7#5`: "`aug` means a raised 5th, exactly what `#5`
  specifies, so `Ab7#5` and `Abaug7` are the same chord, and any songs
  tagged with either are shown here too." Two real, load-bearing
  pieces, both worth keeping straight:
  - **The songs clause is now INTEGRATED into the sentence (not a
    separate one) and UNCONDITIONAL** -- a quality synonym canonicalizes
    into the exact same `results_by_spelling` bucket already shown on
    the page (confirmed via how `songs.py` computes it: alt spellings
    are scrape-time variants of the SAME canonical quality, not a
    separate query), so "any songs tagged with either are shown here
    too" is always true by construction for every synonym entry that
    exists at all -- never a conditional check, unlike the overlap
    template below.
  - **`{reason}` is real, per-pair structured data**, not a hardcoded
    frontend string -- `chord_info.explain_quality_synonym()` was built
    only after enumerating EVERY real quality-alt-spelling pair the
    registry actually produces (36 total, checked directly, not
    estimated): 28 have a clean, honest one-line reason (grouped into a
    handful of real, recurring patterns -- symbol conventions like `+`/
    `#`, octave-equivalent extension numbers like `9`/`2`, "aug means
    raised 5th," shorthand pairs like `6`/`add6`, etc. -- not one
    reason memorized per pair), and 8 do NOT get a reason and are
    EXCLUDED from Similar Chords entirely rather than forced: 4 are
    confirmed parser artifacts (an unrecognized alteration token
    silently no-ops instead of being applied, so the "alt spelling"
    isn't real intentional notation at all), 2 duplicate Task 4's own
    ambiguous-`sus` note (would contradict that mechanism's framing if
    restated here as a symmetric chord fact), and 1 is a genuine
    music-theory edge case (`m7`/`m7+9` -- the alteration collapses onto
    a semitone the base chord's own 3rd already occupies, so the raw
    interval SET is technically unchanged, but the two are still
    understood as different chord choices in practice, not "the same
    chord, different name"). A separate, earlier finding folded into the
    same fix: 4 of the 36 raw candidate pairs were never real alternate
    spellings at all -- purely parenthesization differences (e.g. `b9`
    vs `(b9)`), already filtered out at the `_quality_alt_spellings()`
    source rather than reaching the reason-explanation step. Built by
    `buildSynonymText()` in `chordAlias.js`, consuming
    `/chord-info`'s `quality_synonyms: [{chord, reason}]`.

  **Previous version, superseded above (kept for history only)**:
  `` `{synonym}` is the same chord as `{thisChord}` -- identical notes,
  just a different name. `` -- no reason, no songs clause at all. Reused
  family 5's original terminology ("same chord", "identical notes, just
  a different name") -- that PHRASE survives in the new template too
  ("are the same chord"), just no longer as the entire sentence.
- **Overlap template** (subset/superset -- shares required notes, one
  commonly omits a tone the other has, e.g. `7add13` <-> `13`):
  reuses `songs.py`'s `build_related_note()` text verbatim, unchanged --
  see the "theory-first" pattern documented above. **Always has a
  trailing songs clause when it appears at all** -- `songs.py` already
  filters `related_notes` to only qualities with real (`>0`) song
  counts before returning them (a real bug fix from an earlier phase,
  see CLAUDE.md's Phase 5 Part 1/6 stale-chord-reference audit), so
  every overlap entry that reaches the frontend is guaranteed to have
  real songs to name.

**A chord can have both kinds at once** -- confirmed via real data
(`Ab7#5`/`Abaug7` has both a real `7#5` synonym and a real `7b13`
overlap) -- `buildSimilarChords()` (`ChordOverview.jsx`) returns them as
one combined list, synonyms first, never assuming only one type applies
to a given chord.

**Visually**: a plain list (`.chord-overview__similar-list`), explicitly
NOT the bordered `.related-note` banner treatment the old "Overlapping
chords"/Songs-panel fallback banners use -- matches the Chord Overview
card's OTHER facts ("Notes in this chord", "Interval formula"), since
this is now a standing fact about the chord's identity, not a
banner-worthy status update.

## The ambiguity note (this follow-up's Task 4) -- a fourth, distinct
   note family, not folded into any of the above

When a search uses genuinely AMBIGUOUS shorthand that `chord_parser.py`
had to default (currently the only real case: bare `sus`, with no
explicit `2`/`4`, always resolves to `sus4`), a small standalone note
states that plainly: `` `sus` was interpreted as `sus4`. `` Deliberately
its own family, not merged into Similar Chords or the "Why this
spelling" bar, for a real structural reason: there's no symmetric
chord-level fact here (unlike a true synonym, "sus4 is also called sus"
isn't a real reciprocal statement -- "sus" is shorthand that only ever
meant one thing once resolved, not an alternate name for the resolved
quality). Placed near the title, same tier as the title parenthetical/
teaser, but rendered as a third, independent element -- it can appear
alongside either, neither, or both of them depending on what the search
actually needed resolving.

**Computed from the RAW search string specifically** (`songs.py`'s
`_ambiguity_note()`, reading `quality_blob` from `resolve_query()`) --
this is the one member of this whole family that structurally CANNOT be
computed from the resolved chord alone the way the alt-spelling/Similar
Chords facts are: by the time a chord reaches `/chord-info`, "sus" has
already become "sus4", so there's nothing left to detect. Confirmed via
tracing the real regex mechanism before wiring this up (not assumed):
the WORD_ALIASES table's own `sus` entry only fires for a bare
standalone search like "Csus" (needs a true word boundary before "sus",
which a compound blob like "maj7sus" never has) -- the actual resolution
for compound cases happens via a completely different regex inside
`parse_quality()`'s alteration-scanning loop, hoisted to a module-level
`chord_parser.ALT_PATTERN` specifically so this detection reuses the
real mechanism rather than a second, easily-drifting guess at it.

**No `fromSuggestion`/`fromAudio` gating needed**, unlike the teaser --
a dropdown suggestion or an audio-identified chord name is never
ambiguous shorthand in the first place (both are always already-
canonical strings by construction), so this note is naturally
path-independent without extra logic, verified live across all 4 paths.
