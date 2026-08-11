# chord_info.py audit (Phase 5 Part 2/7 follow-up, Task 0)

Investigation only, no code changes made while writing this -- real
findings to act on in Task 1/2, reported here first per the task's
explicit "report before proceeding" instruction.

## 1. QUALITY_DESCRIPTIONS vs. real quality usage

**The right "real use" comparison is `quality_registry.json`'s 95 canonical
quality names, not `voicings.db`'s raw `quality` column** -- checked both,
and they disagree in a way worth explaining rather than picking silently.
`voicings.db`'s `quality` column stores each row's **pre-canonicalization
scrape spelling** (e.g. literally `"7#5"`, never `"aug7"` -- confirmed via
direct query: `SELECT COUNT(*) FROM voicings WHERE quality='aug7'` returns
**0**, even though `aug7` is a real, heavily-used canonical name
throughout this app). Task 1's new endpoint calls `get_chord_info()` with
the **resolved canonical chord** (e.g. `songs.data.primary_chord`), which
is always registry-spelled (`aug7`), never the raw scrape spelling
(`7#5`) -- so the registry, not `voicings.db`'s raw column, is the
authoritative "what will `get_chord_info()` actually be asked about"
universe. (A voicings.db-only diff would have wrongly flagged `aug7` and
`13#11` as "dead" descriptions, when they're both real, frequently-used
canonical names -- caught by cross-checking both, not trusting the first
result.)

**Real gap: 40 registry qualities have no `QUALITY_DESCRIPTIONS` entry at
all** (`quality_registry.json`'s keys minus `QUALITY_DESCRIPTIONS`'s
keys -- 39 found via an initial voicings.db-column cross-check, plus one
more, `7no3`, found only once re-diffed directly against the registry
itself, since `7no3` never appears as a literal voicings.db row despite
being a real, `songs_db_occurrences`-confirmed registry quality):

```
#9, 11, 6add11, 6sus2, 6sus4, 7#5#9, 7#5b9, 7add11, 7add13, 7b13,
7b5#9, 7b5b9, 7b9b13, 7no3, 9#11, 9add13, 9b13, add#11, add4add9,
add9#11, addb13, b9, dim7b13, m7add11, m7add13, m7b13, m7no5, m9#5,
maj7#9, maj7add11, maj7add13, maj7sus2, maj7sus4, maj9add13, mb6,
mb9, mmaj13, sus2add#11, susb9
```

**All 40 now have real descriptions** (Task 1), and the registry/
`QUALITY_DESCRIPTIONS` diff is confirmed empty in both directions after
the fix (re-run live, not just claimed).

**Real dead weight: 4 `QUALITY_DESCRIPTIONS` entries can never be looked
up**, because they're keyed in a parenthesized/comma notation
(`"7(#5,#9)"`) that no real quality string is ever spelled as -- the
registry's real spelling for the identical chord uses no parens/commas at
all (`"7#5#9"`, itself one of the 39 gaps above):

```
'7(#5,#9)', '7(#5,b9)', '7(b5,#9)', '7(b5,b9)'
```

These 4 are functionally inert today (`QUALITY_DESCRIPTIONS.get(quality, ...)`
in `get_chord_info()` will never match them, since `quality` always comes
from parsing a real chord string).

## 2. A deeper gap: 7 of the 40 aren't just missing a description

`get_chord_info()` computes intervals via `music_theory.QUALITY_INTERVALS`
(an 89-key dict, apparently scoped to the CNN's detection needs), **not**
`interval_calculator.compute_intervals()` -- the complete, registry-backed
engine `songs.py`/`voicings.py` already use for everything else. Checked
directly: 7 of the 40 gap qualities aren't in `QUALITY_INTERVALS` at all:

```
7b9b13, dim7b13, m7b13, m7no5, susb9, 7no3   (real registry qualities,
                                               confirmed via songs_db_
                                               occurrences/has_voicing_
                                               entry each)
7#5                                          (NOT a registry quality either
                                               -- purely a voicings.db
                                               raw-scrape spelling that
                                               will never actually reach
                                               get_chord_info() as an input
                                               under the resolved-canonical
                                               architecture Task 1 uses)
```

For the first 6, `get_chord_info()` returns `None` **before it ever reaches
the description lookup** -- `data = QUALITY_INTERVALS.get(quality)` is
`None`, and the function bails immediately. **Adding a description alone
cannot fix these 6** -- they need `get_chord_info()`'s interval source
itself reconciled with the registry's complete interval engine, a
`music_theory.py`/`chord_info.py`-touching change with real regression
risk on a live CNN-pipeline-adjacent file, well beyond what "fill
description gaps" (Task 1's literal scope) authorizes. **Flagged here for
a deliberate decision, not silently fixed or silently ignored** -- Task
1's approach (below) is to fill all 40 genuinely-describable gaps with
real text (including these 6, so the text is ready once the deeper
interval-source gap is ever closed), and make the new endpoint degrade
gracefully (never 500) when `get_chord_info()` returns `None` for one of
these -- the "Overall Chord Info" section simply omits the
interval-breakdown/feeling/related-chords subsection for that one chord
rather than blocking the rest of the section.

## 3. `get_related_chords()` -- real finding: it does NOT compute the
   guide-tone/subset-superset relationship at all

The task's framing assumed `get_related_chords()` computes the
"7add13 vs 13"-style overlap relationship. **Reading the real code shows
this is wrong** -- that relationship (one chord's notes are a strict
subset of another's, guitarists commonly omit the difference) lives
entirely in `songs.py`'s `build_related_note()` + `guide_tone_groups.json`,
a completely separate, already-working mechanism (Phase 3 Part 3/6, Phase
5 Part 1/7). `get_related_chords()` computes a **different** set of
relationships: relative major/minor, parallel major/minor, tritone
substitution, "resolves from (V7)", and a crude "simpler version" (drop
extensions back to a plain triad). This means Task 2's "Overlapping
chords" (b) and "related chords" (c) are two genuinely different data
sources, not one -- (b) reuses the existing guide-tone mechanism verbatim,
(c) is `get_related_chords()`'s own, separate relationships.

**Correctness, checked against real output for several real
multi-relationship chords** (not just "it returns something"):

| Chord | `related` output | Checked |
|---|---|---|
| `C` | Relative minor: Am, Parallel minor: Cm, Resolves from (V7): G7 | All 3 correct (Am is C's relative minor; Cm is C's parallel minor; G7 resolves to C) |
| `Am` | Relative major: C, Parallel major: A, Resolves from (V7): E7 | All 3 correct |
| `C7` | Tritone sub: F#7, Resolves from (V7): G7, Simpler version: C | Correct -- F#7/Gb7 is the standard tritone sub for a dominant built on C |
| `D9` | Tritone sub: Ab7, Resolves from (V7): A7, Simpler version: D | Correct |
| `Am7` | Relative major: C, Resolves from (V7): E7, Simpler version: Am | Correct |

Every checkable relationship above is musically correct. **Two real,
separate findings, not corrections to the above:**

- **`_subdominant()` is dead code.** Defined (lines 327-330, computes the
  IV chord) but never called anywhere in `get_related_chords()` --
  confirmed via a direct grep, zero other references. Either an
  intended-but-forgotten feature or leftover cruft; flagged, not removed
  (Task 0 is investigation-only).
- **"Resolves from (V7)" is computed unconditionally for every quality**,
  including diminished, augmented, and suspended chords, where a single
  well-defined "V7" is a much shakier concept than it is for a plain
  major/minor chord. Confirmed via real output: `Bdim7` -> `{'Resolves
  from (V7)': 'F#7'}`, `Eaug` -> `{'Resolves from (V7)': 'B7'}`, `Csus4`
  -> `{'Resolves from (V7)': 'G7'}` -- all three are the ONLY relationship
  shown for these qualities, presented with the same confident labeling
  as the major/minor cases where it's genuinely standard theory. Not a
  math bug (the `root+7` computation is internally consistent), but worth
  flagging before this text gets surfaced directly to end users in Task 2c
  -- a diminished or suspended chord being told it "resolves from" a
  specific V7 with no caveat could read as a stronger theoretical claim
  than is actually standard for those qualities.

## 4. How `get_chord_info()` is currently wired

Confirmed via a full-repo grep for `get_chord_info`/`chord_info` (not
assumed from memory): **only one live call site** --
`main.py`'s `identify_from_audio()` (the audio-ID pipeline). A second call
site exists in `music_theory.py` (line 568-569), but it's inside that
file's own `__main__` manual-test/debug harness (prints a "theory notes"
line for comparison against CNN output), not a live-serving path.
`voicings.py` imports `spell_note`/`LETTER_TO_SEMITONE` from
`chord_info.py` (utility functions, unrelated to `get_chord_info()` --
already documented in CLAUDE.md's Phase 5 Part 2/7 first-round note-map).

**Confirmed still true from the prior investigation**: `CaptureContext.jsx`'s
`handleContinue()` discards `result.info` (the audio-ID response's
`get_chord_info()` payload) before navigating -- so even on the one path
that already computes this data server-side, the frontend never uses it
today.

**Minimal change for Task 1**: `api.py` needs a new endpoint (or an
addition to an existing one) that accepts a chord name path parameter
(`{chord_name:path}`, per CLAUDE.md's established gotcha for chord names
containing `/`) and calls `get_chord_info(chord_name)` directly --
reusing the function as-is, no logic duplicated. The endpoint must accept
**any** resolved canonical chord, not just ones that came from audio ID,
which `get_chord_info()` already supports (it takes a plain chord string,
with no dependency on anything CNN/audio-specific) -- the "minimal change"
really is just wiring a route to it, not changing the function itself.
