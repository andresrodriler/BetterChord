"""
api.py -- FastAPI wrapper around the existing pipeline (main.py, and
betterchord/config/voicings.py, songs.py). Pure plumbing: every function
this calls already exists and is verified independently; this file's only
job is exposing them over HTTP.

Run with:
    uvicorn api:app --reload
Then open http://127.0.0.1:8000/docs
"""

import json
import os
import tempfile

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from main import identify_from_audio
from voicings import get_voicings, _load_registry
from interval_calculator import compute_intervals, guide_tone_formula
from songs import get_songs
import chord_parser as cp

app = FastAPI(title="BetterChord API")

# Path to the quality registry, relative to project root (see CLAUDE.md's
# directory layout -- data/registry/quality_registry.json).
_REGISTRY_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "registry", "quality_registry.json"
)


def _build_chord_suggestions():
    """Build the full root+quality suggestion list once at import time
    (the registry doesn't change at runtime -- see task instructions).
    Every (root, quality) combo across the 12 standard chromatic roots x
    every registry quality key, built via chord_parser.format_chord (never
    hand-concatenated -- see CLAUDE.md's core parser rule). No slash/bass
    variants -- root+quality only, per current scope.

    Sorted by the quality's songs_db_occurrences descending, ties broken
    alphabetically by the formatted chord string.
    """
    with open(_REGISTRY_PATH, "r", encoding="utf-8") as f:
        registry = json.load(f)

    suggestions = []
    for quality_name, quality_info in registry.items():
        occurrences = quality_info.get("songs_db_occurrences", 0)
        for root in cp.CHROMATIC:
            chord_string = cp.format_chord(root, quality_name)
            suggestions.append({"chord": chord_string, "occurrences": occurrences})

    suggestions.sort(key=lambda item: (-item["occurrences"], item["chord"]))
    return suggestions


CHORD_SUGGESTIONS = _build_chord_suggestions()

# Root-alias map for the frontend to normalize a typed alias spelling (e.g.
# "D#") to BetterChord's canonical chromatic spelling ("Eb") before matching
# against CHORD_SUGGESTIONS -- reuses chord_parser.py's existing NOTE_ALIASES
# directly (see CLAUDE.md's core parser rule: never hand-copy this mapping
# into a second source of truth). Filtered to only the entries where the raw
# spelling actually differs from its canonical form -- these are the true
# aliases the frontend needs to substitute; canonical-to-itself entries would
# be no-ops anyway.
ROOT_ALIASES = {raw: canon for raw, canon in cp.NOTE_ALIASES.items() if raw != canon}

# DEV-ONLY CORS: allows the Vite dev server (localhost:5173) to call this
# API directly from the browser during Phase 1 (browser audio -> API proof
# of concept). Must be tightened to the real deployed frontend's origin
# before Phase 3 (deployment) -- do not ship this wildcard-of-one to prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/chords")
async def chords():
    """Full autocomplete suggestion list -- every (root, quality) combo
    built from the registry, precomputed at import time. See
    CHORD_SUGGESTIONS above for sort order. Also carries root_aliases so
    the frontend can normalize alias root spellings (e.g. "D#" -> "Eb")
    without duplicating chord_parser.py's NOTE_ALIASES map in JS.
    """
    return {"chords": CHORD_SUGGESTIONS, "root_aliases": ROOT_ALIASES}


@app.post("/identify")
async def identify(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        result = identify_from_audio(tmp_path)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"{type(e).__name__}: {e}" if str(e) else type(e).__name__},
        )
    finally:
        os.remove(tmp_path)

    return result


@app.get("/voicings/{chord_name:path}")
async def voicings(chord_name: str):
    parsed = cp.parse_chord(chord_name)
    if not parsed["parsed"]:
        return JSONResponse(
            status_code=400,
            content={"error": f"{chord_name!r} is not a valid chord string.", "reason": parsed.get("reason")},
        )

    full, _required = compute_intervals(parsed["quality"])
    intervalset_to_canonical, _canonical_to_voicing_quality = _load_registry()
    if intervalset_to_canonical.get(frozenset(full)) is None:
        return JSONResponse(
            status_code=404,
            content={"error": f"{chord_name!r} parses fine but matches no known quality in the registry."},
        )

    try:
        result = get_voicings(chord_name)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"{type(e).__name__}: {e}" if str(e) else type(e).__name__},
        )

    if not result.get("voicings"):
        result["error"] = f"{chord_name!r} is a real chord, but no voicing data is available for it yet."
        return JSONResponse(status_code=404, content=result)

    # Chord-quality-aware guide-tone formula (Phase 3 Part 5/6, 3rd + 4th
    # follow-ups) -- which of root/third-or-sus/5th/7th/extensions are
    # structurally part of THIS CHORD'S formula at all (e.g. sus4 has no
    # 3rd slot, a plain triad has no extensions), and this app's real
    # interval-string label for each one that is (e.g. "m3" for a minor
    # chord, "maj7" for a major-seventh chord, "9"/"11"/"13" individually
    # named, not one anonymous "other" blob). Passes both `parsed["quality"]`
    # (the structured q dict) and `full` (already computed above for the
    # registry-match check, reused rather than recomputed) -- the 4th
    # follow-up session's fix requires the structured dict specifically to
    # avoid the semitone-collision bug the 3rd follow-up's `full`-only
    # version had (see guide_tone_formula's own docstring).
    result["formula"] = guide_tone_formula(parsed["quality"], full)
    return result


@app.get("/songs/{chord_name:path}")
async def songs(chord_name: str):
    parsed = cp.parse_chord(chord_name)
    if not parsed["parsed"]:
        return JSONResponse(
            status_code=400,
            content={"error": f"{chord_name!r} is not a valid chord string.", "reason": parsed.get("reason")},
        )

    try:
        result = get_songs(chord_name)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"{type(e).__name__}: {e}" if str(e) else type(e).__name__},
        )

    if "error" in result:
        result["error"] = f"{chord_name!r} parses fine but matches no known quality in the registry."
        return JSONResponse(status_code=404, content=result)
    # Real bug fix (Phase 5 Part 1/6): total_songs==0 alone used to always
    # mean a 404, but get_songs() can now populate quality_fallback_songs
    # for that exact case -- same-quality songs on other roots, genuinely
    # useful data, not "nothing found." Only 404 when there's truly nothing
    # to show at all (no exact-root songs AND no quality fallback either).
    if result.get("total_songs", 0) == 0 and not result.get("quality_fallback_used"):
        result["error"] = f"{chord_name!r} is a real chord, but no song data is available for it yet."
        return JSONResponse(status_code=404, content=result)
    return result
