"""
api.py -- FastAPI wrapper around the existing pipeline (main.py, and
betterchord/config/voicings.py, songs.py). Pure plumbing: every function
this calls already exists and is verified independently; this file's only
job is exposing them over HTTP.

Run with:
    uvicorn api:app --reload
Then open http://127.0.0.1:8000/docs
"""

import ctypes
import gc
import json
import os
import shutil
import tempfile

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# glibc malloc_trim: hand freed heap pages back to the OS after a request.
# Python's allocator and numba/scipy/onnxruntime C-side pools retain freed
# memory, so RSS creeps up across /identify requests on a memory-tight
# instance. glibc-only; a harmless no-op anywhere libc.so.6 / malloc_trim
# isn't available (local dev on Windows/macOS).
try:
    _LIBC = ctypes.CDLL("libc.so.6", use_errno=False)
    _HAS_MALLOC_TRIM = hasattr(_LIBC, "malloc_trim")
except OSError:
    _LIBC = None
    _HAS_MALLOC_TRIM = False


def _release_memory():
    gc.collect()
    if _HAS_MALLOC_TRIM:
        try:
            _LIBC.malloc_trim(0)
        except Exception:
            pass

from main import identify_from_audio
from voicings import get_voicings, _load_registry
from interval_calculator import compute_intervals, guide_tone_formula
from songs import get_songs
from chord_info import get_chord_info, explain_quality_synonym
import chord_parser as cp

app = FastAPI(title="BetterChord API")

# Path to the quality registry, relative to project root (see CLAUDE.md's
# directory layout -- data/registry/quality_registry.json).
_REGISTRY_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data", "registry", "quality_registry.json"
)


def _build_chord_suggestions():
    """Build the full root+quality suggestion list once at import time
    (the registry doesn't change at runtime). Every (root, quality) combo
    across the 12 chromatic roots x every registry quality key, built via
    chord_parser.format_chord (never hand-concatenated -- see CLAUDE.md's
    core parser rule). No slash/bass variants.

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

# The reverse of ROOT_ALIASES, grouped -- given a CANONICAL note name, every
# other real spelling for that pitch. Used only by root_alt_spellings/
# bass_alt_spellings below, which feed only the "Why this spelling?" clause
# (chordAlias.js's buildAltSpellingSentence). ManualSearch's typing-time
# root normalization uses the full, unrestricted ROOT_ALIASES above.
#
# Restricted to the 5 conventionally dual-spelled pitch classes -- C#/Db,
# D#/Eb, F#/Gb, G#/Ab, A#/Bb, the ones a player actually encounters
# written both ways. NOTE_ALIASES' full table also carries spellings
# nobody uses (B#, Fb, E#, Cb/H); without this restriction "Why this
# spelling?" would surface those as real-but-useless trivia. A natural
# root (C/D/E/F/G/A/B) gets no entry at all, so the clause -- and the
# whole bar, if root and bass are both outside this set -- simply doesn't
# render (ChordOverview.jsx already handles the empty-list case).
_CONVENTIONAL_ENHARMONIC_ROOTS = {"C#", "Eb", "F#", "Ab", "Bb"}
REVERSE_ROOT_ALIASES = {}
for _raw, _canon in ROOT_ALIASES.items():
    if _canon in _CONVENTIONAL_ENHARMONIC_ROOTS:
        REVERSE_ROOT_ALIASES.setdefault(_canon, []).append(_raw)

# Full quality registry, kept in memory for /chord-info's quality-alternate-
# spelling lookup (songs_db_example_spellings / voicing_strings_found are
# already-computed real-world spellings for each canonical quality -- see
# frontend/CHORD_INFO_AUDIT.md). Loaded once here rather than duplicating
# voicings.py's own narrower _load_registry() cache, which only keeps a
# single voicing spelling per quality, not the full real-spelling data this
# needs.
with open(_REGISTRY_PATH, "r", encoding="utf-8") as _f:
    _QUALITY_REGISTRY = json.load(_f)


def _quality_alt_spellings(canonical_quality):
    """Every other real, distinct way this quality has been seen spelled
    in real data -- voicings.db's scrape spelling (voicing_strings_found)
    plus betterchord_songs.db's example chord strings
    (songs_db_example_spellings, root stripped via chord_parser to
    isolate the quality portion) -- excluding the canonical spelling.
    Already-computed registry data, never re-derived.

    Filtered through chord_info.explain_quality_synonym(): some raw
    candidate pairs aren't real synonyms (parenthesization-only
    differences, parser artifacts where an unrecognized alteration token
    silently no-ops, or overclaimed music-theory equivalences). Only
    spellings with a real one-line "why" survive."""
    entry = _QUALITY_REGISTRY.get(canonical_quality, {})
    alts = set(entry.get("voicing_strings_found", []))
    for example in entry.get("songs_db_example_spellings", []):
        parsed = cp.parse_chord(example)
        if parsed["parsed"]:
            alts.add(parsed["quality_blob"])
    alts.discard(canonical_quality)
    return sorted(alt for alt in alts if explain_quality_synonym(canonical_quality, alt))

# CORS: the browser frontend's origin(s). ALLOWED_ORIGINS is a
# comma-separated env var set in production to the deployed frontend's
# origin(s) (e.g. https://betterchord.vercel.app); unset, it falls back to
# the Vite dev server so local dev needs no config.
_allowed_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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


def _identify_error_reason(exc):
    """Classify an /identify exception into a short `reason` slug (same
    convention as the 400 responses' `reason`), or None for anything not
    recognized as an audio-decode failure.

    Verified directly (ffmpeg hidden from PATH): a browser-recorded
    webm/opus with no ffmpeg raises audioread.exceptions.NoBackendError
    (empty message) whose __context__ is a soundfile.LibsndfileError
    "Format not recognised" -- and a genuinely corrupt file raises the
    IDENTICAL pair even WITH ffmpeg present. So the two are told apart by
    shutil.which("ffmpeg"), not by the exception itself. librosa wraps
    the real error, so the whole __cause__/__context__ chain is walked.
    """
    seen = set()
    cur = exc
    is_decode_failure = False
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        name = type(cur).__name__
        module = type(cur).__module__ or ""
        message = str(cur).lower()
        if (
            name in ("NoBackendError", "LibsndfileError", "DecodeError", "SoundFileRuntimeError")
            or module.startswith("audioread")
            or "format not recognised" in message
            or "format not recognized" in message
        ):
            is_decode_failure = True
        cur = cur.__cause__ or cur.__context__

    if not is_decode_failure:
        return None
    # ffmpeg absent is a server-dependency problem (the real deploy risk);
    # ffmpeg present + still undecodable means the uploaded file itself is
    # corrupt or an unsupported codec.
    return "ffmpeg_unavailable" if shutil.which("ffmpeg") is None else "audio_decode_failed"


@app.post("/identify")
async def identify(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        result = identify_from_audio(tmp_path)
    except Exception as e:
        content = {"error": f"{type(e).__name__}: {e}" if str(e) else type(e).__name__}
        reason = _identify_error_reason(e)
        if reason:
            content["reason"] = reason
        return JSONResponse(status_code=500, content=content)
    finally:
        os.remove(tmp_path)
        _release_memory()  # return freed pages to the OS -- see _release_memory

    return result


@app.get("/voicings/{chord_name:path}")
async def voicings(chord_name: str):
    parsed = cp.parse_chord(chord_name)
    if not parsed["parsed"]:
        return JSONResponse(
            status_code=400,
            content={"error": f"{chord_name!r} is not a valid chord string.", "reason": parsed.get("reason")},
        )

    full, required = compute_intervals(parsed["quality"])
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

    # Chord-quality-aware guide-tone formula -- which of root/third-or-sus/
    # 5th/7th/extensions are structurally part of THIS chord's formula
    # (e.g. sus4 has no 3rd slot, a plain triad has no extensions), and
    # this app's real interval-string label for each ("m3" for a minor
    # chord, "maj7" for a major-seventh, "9"/"11"/"13" individually named,
    # not one anonymous "other" blob). Passes the structured quality dict,
    # not just the flat semitone set `full` -- guide_tone_formula needs it
    # to avoid a semitone-collision bug (see its own docstring). `required`
    # feeds the response's `formula.omittable` field: which slots are the
    # chord's real guide tones vs. genuinely optional.
    result["formula"] = guide_tone_formula(parsed["quality"], full, required)
    return result


@app.get("/chord-info/{chord_name:path}")
async def chord_info_endpoint(chord_name: str):
    """Exposes chord_info.py's get_chord_info() (interval breakdown,
    quality "feeling" description, related chords -- see
    frontend/CHORD_INFO_AUDIT.md) for any resolved canonical chord, not
    just the audio-ID path. Pure routing, no logic duplicated.

    404 covers two distinct cases: an unregistered quality, or a
    registered quality get_chord_info() can't process because
    music_theory.QUALITY_INTERVALS doesn't define its intervals (see the
    audit doc's section 2). The frontend omits this section either way;
    the rest of Results is unaffected.
    """
    parsed = cp.parse_chord(chord_name)
    if not parsed["parsed"]:
        return JSONResponse(
            status_code=400,
            content={"error": f"{chord_name!r} is not a valid chord string.", "reason": parsed.get("reason")},
        )

    try:
        result = get_chord_info(chord_name)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"{type(e).__name__}: {e}" if str(e) else type(e).__name__},
        )

    if result is None:
        return JSONResponse(
            status_code=404,
            content={"error": f"{chord_name!r} parses fine but chord_info has no theory data for this quality yet."},
        )

    # "Other ways to write this chord" -- root/bass enharmonic alternates
    # (the same NOTE_ALIASES-derived table /chords exposes) plus
    # quality-naming alternates (registry data -- see
    # _quality_alt_spellings above). A fact about the chord, not about how
    # this search arrived at it, so it's attached unconditionally.
    result["root_alt_spellings"] = REVERSE_ROOT_ALIASES.get(result["root"], [])
    result["bass_alt_spellings"] = REVERSE_ROOT_ALIASES.get(result["slash_bass"], []) if result["slash_bass"] else []
    # One entry per real quality synonym -- full chord string (via
    # cp.format_chord(), which adds parens for alt spellings that start
    # with a bare accidental like "b9") plus the "why" reason from
    # chord_info.explain_quality_synonym(). Same bass as the resolved
    # chord -- a quality synonym is the identical chord, not an inversion.
    result["quality_synonyms"] = [
        {
            "chord": cp.format_chord(result["root"], alt, result["slash_bass"]),
            "reason": explain_quality_synonym(result["quality"], alt),
        }
        for alt in _quality_alt_spellings(result["quality"])
    ]
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
    # total_songs==0 doesn't mean a 404 on its own -- get_songs() can
    # populate quality_fallback_songs for that case (same-quality songs
    # on other roots). Only 404 when there's truly nothing to show.
    if result.get("total_songs", 0) == 0 and not result.get("quality_fallback_used"):
        result["error"] = f"{chord_name!r} is a real chord, but no song data is available for it yet."
        return JSONResponse(status_code=404, content=result)
    return result
