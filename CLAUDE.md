# BetterChord — Claude Code Project Notes

## Project
Guitar audio strum ID + searchable chord database. Windows, PowerShell, venv at
`C:\BetterChord\.venv`. Always run scripts from the project root unless told otherwise —
default paths in scripts are relative to CWD, and mismatches here have caused repeat bugs.

## Core files (update this list as it evolves)
- `betterchord_songs.db` — 30k+ songs, `all_chords` / `unique_chords` raw scrape columns
- `voicings.db` — guitar fretboard voicings per chord

## Working style — read this before starting any task
1. **State the plan before changing files.** Phases/steps, in dependency order. If mid-project,
   check the roadmap status below rather than assuming.
2. **Say exactly what a script touches**: does it mutate the db in place, write a new file, or
   just print? Never leave this ambiguous.
3. **Verify against real data, don't assert.** If a fix is claimed, run a query/diagnostic
   showing before/after counts. "Should work" is not a stopping point.
4. **Full rebuild over patching**, matching the existing pipeline philosophy: prefer regenerating
   derived columns/files from source over hand-editing rows, unless explicitly asked otherwise.
5. **Ask before running anything against the real db** — work against a copy/output first,
   confirm before touching `betterchord_songs.db` directly.

## Roadmap status
_(keep this updated as phases complete — Claude Code should read this at the start of a session
instead of asking "what step are we on")_

- Phase 0 — Chord parser (raw parsing): ✅ done
- Phase 1 — Exact-interval grouping + guide-tone grouping + `music_theory.py` cross-check: ✅ done
- Phase 2 — `normalized_all_chords` / `normalized_unique_chords` columns + search: in progress
- Phase 3 — UI-facing chord equivalence (C13/C7add13-style overlap surfacing): not started

## Known gotchas
- Bare leading-accidental alterations (e.g. `(b9)` alone) must be rendered with parens via
  `format_chord()` — unwrapped, they re-parse as a different root+quality entirely.
- `mM7`-style bare capital `M` after minor base is real notation, not junk — don't filter it.