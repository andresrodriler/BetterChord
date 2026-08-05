# Runtime voicing lookup module. Called at inference time to get guitar voicings for a identified chord
# Returns a list of voicing dicts sorted by priority (Must Know first), excluding inversion-category voicings.
# If model gets slash chord, and no voicings are foundm, falls back to base chord voicings

import os
import json
import sqlite3
import re

import chord_parser as cp
from interval_calculator import compute_intervals

_HERE = os.path.dirname(os.path.abspath(__file__))

# Path to voicing db
DB_PATH = os.path.join(_HERE, '..', '..', 'data', 'voicing_data', 'voicings.db')

# Path to the quality registry -- built by registry_builder.py, sits
# alongside this file in betterchord/
QUALITY_REGISTRY_PATH = os.path.join(_HERE, '..', '..', 'data', 'registry', 'quality_registry.json')

# Priority sorting for voicing type
TYPE_PRIORITY = {
    "Must Know": 0,
    "Other":      1,
    "Capo":     2,
}


def _get_connection():
    # Get a SQLite connection. Called fresh each time on runtime
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # allows dict-like access by column name
    return conn


# ---------------------------------------------------------------------------
# Registry-based quality translation
#
# THE BUG THIS FIXES: voicings.db stores each chord's quality under
# whatever string the scraper/tagger happened to use (e.g. "7#5"), which is
# frequently NOT the same string music_theory.py's identify_chord() outputs
# for the identical chord (e.g. "aug7") -- same interval content, different
# name. The old code queried voicings.db with a literal string match on
# whatever chord_name it was handed, so any chord where the two naming
# conventions disagree silently returned zero rows -- confirmed concretely:
# 28 real voicing rows exist for the aug7-family chord, filed under "7#5",
# invisible to a literal "Aaug7" lookup.
#
# FIX: translate the query through quality_registry.json's interval-set
# matching -- the exact same mechanism registry_builder.py already uses to
# reconcile music_theory.py names against voicings.db names -- so a lookup
# for "Aaug7" resolves to "A7#5" (whatever string voicings.db actually
# uses for that chord's interval content) before querying.
# ---------------------------------------------------------------------------

_registry_cache = None


def _load_registry():
    global _registry_cache
    if _registry_cache is None:
        with open(QUALITY_REGISTRY_PATH) as f:
            registry = json.load(f)

        intervalset_to_canonical = {
            frozenset(entry["interval_set"]): name for name, entry in registry.items()
        }
        # canonical quality name -> the actual string voicings.db uses for
        # it (only present for qualities that DO have a voicing -- the 34
        # known real gaps correctly have nothing here, not a mistranslation)
        canonical_to_voicing_quality = {
            name: entry["voicing_strings_found"][0]
            for name, entry in registry.items()
            if entry.get("has_voicing_entry") and entry.get("voicing_strings_found")
        }
        _registry_cache = (intervalset_to_canonical, canonical_to_voicing_quality)
    return _registry_cache


def resolve_voicing_chord(chord_name):
    """
    Translate ANY chord string (however it happens to be spelled) into the
    (root, voicing_quality, bass) that actually matches voicings.db's own
    naming convention, using the shared interval-set registry rather than
    a literal string comparison.

    Returns a dict {root, voicing_quality, bass, canonical_quality,
    translated} on success -- 'translated' is True when voicings.db's
    string differs from music_theory.py's canonical name for this chord
    (i.e. this is exactly the case the old code silently failed on).

    Returns None if the chord can't be parsed at all, OR if it parses fine
    but has no matching voicing under ANY known name (a real gap -- see
    registry_builder.py's gap report -- not a lookup bug this can fix).
    """
    parsed = cp.parse_chord(chord_name)
    if not parsed["parsed"]:
        return None

    full, required = compute_intervals(parsed["quality"])
    intervalset_to_canonical, canonical_to_voicing_quality = _load_registry()

    canonical = intervalset_to_canonical.get(frozenset(full))
    if canonical is None:
        # Structural pattern the registry doesn't know at all (parser and
        # registry have drifted since the registry was last built) --
        # nothing to translate against.
        return None

    voicing_quality = canonical_to_voicing_quality.get(canonical)
    if voicing_quality is None:
        # No voicing exists for this chord under ANY name -- a real,
        # already-known gap, not something a smarter lookup can fix.
        return None

    return {
        "root": parsed["root"],
        "voicing_quality": voicing_quality,
        "bass": parsed["bass"],
        "canonical_quality": canonical,
        "translated": voicing_quality != canonical,
    }


def _query_voicings(conn, chord, bass=None):
    # Query voicings for output chord

    # If bass is none (null), query base chord voicings (null bass imples its not a slash chord)
    # If bass is provided, query slash chord voicings for that bass note (filled bass implies its a slash)

    if bass is None:
        rows = conn.execute("""
            SELECT frets, base_fret, barres, notes, intervals,
                   type, category, capo, rank, source
            FROM voicings
            WHERE chord = ?
              AND bass IS NULL
              AND type IN ('Must Know', 'Other', 'Capo')
            ORDER BY rank
        """, (chord,)).fetchall()
    else:
        rows = conn.execute("""
            SELECT frets, base_fret, barres, notes, intervals,
                   type, category, capo, rank, source
            FROM voicings
            WHERE chord = ?
              AND bass = ?
              AND type IN ('Must Know', 'Other', 'Capo')
            ORDER BY rank
        """, (chord, bass)).fetchall()
    return rows


def _rows_to_dicts(rows):
    # Convert sqlite3.Row objects to plain dicts with parsed JSON fields
    result = []
    for row in rows:
        result.append({
            "frets":     row["frets"],
            "base_fret": row["base_fret"],
            "barres":    json.loads(row["barres"]) if row["barres"] else [],
            "notes":     json.loads(row["notes"])  if row["notes"]  else [],
            "intervals": json.loads(row["intervals"]) if row["intervals"] else [],
            "type":      row["type"],
            "category":  row["category"],
            "capo":      row["capo"] or 0,
            "rank":      row["rank"],
            "source":    row["source"],
        })
    return result


def _sort_by_type(voicings):
    # Sort voicings by type priority (Must Know, Other, Capo), then by
    # base_fret ascending within each type group -- was `rank` before, but
    # frontend now renders every voicing as its own diagram grouped by
    # type/section, so ordering low-to-high on the fretboard within a
    # section reads better than the old rank order.
    return sorted(voicings, key=lambda v: (TYPE_PRIORITY.get(v["type"], 99), v["base_fret"]))


def _get_voicings_literal(conn, chord_name):
    """
    The ORIGINAL literal-string-match behavior, preserved as a fallback for
    cases the registry can't resolve at all (unparseable input, or a chord
    whose interval set the registry has never seen). Kept so this fix can
    only ever find MORE voicings than before, never fewer.
    """
    slash_match = re.search(r'/([A-G][b#]?)$', chord_name)

    fallback  = False
    displayed = chord_name

    if slash_match:
        bass_note  = slash_match.group(1)
        base_chord = chord_name[:slash_match.start()]
        rows = _query_voicings(conn, chord_name, bass=bass_note)

        if not rows:
            rows = _query_voicings(conn, base_chord, bass=None)
            fallback  = True
            displayed = base_chord
    else:
        rows = _query_voicings(conn, chord_name, bass=None)

    voicings = _rows_to_dicts(rows)
    sorted_voicings = _sort_by_type(voicings)

    return {
        "voicings":        sorted_voicings,
        "fallback":        fallback,
        "displayed":       displayed,
        "translated":      False,
        "translated_from": None,
    }


def get_voicings(chord_name):
    # Get all voicings for a chord, sorted Must Know, Other, Capo
    # Excludes inversion-category voicings.

    # If chord_name is a slash chord (e.g. Cmaj7/E) and no voicings are found, falls back to the base chord (Cmaj7).

    conn = _get_connection()

    try:
        resolved = resolve_voicing_chord(chord_name)

        if resolved is None:
            # Couldn't parse, or the registry has no entry for this exact
            # interval set at all -- fall back to the original literal
            # behavior so results are never WORSE than before this fix.
            return _get_voicings_literal(conn, chord_name)

        root            = resolved["root"]
        bass            = resolved["bass"]
        voicing_quality = resolved["voicing_quality"]
        translated_chord = root + voicing_quality  # e.g. "A7#5", not "Aaug7"

        fallback = False
        if bass:
            full_query = f"{translated_chord}/{bass}"
            rows = _query_voicings(conn, full_query, bass=bass)
            displayed = full_query
            if not rows:
                rows = _query_voicings(conn, translated_chord, bass=None)
                fallback  = True
                displayed = translated_chord
        else:
            rows = _query_voicings(conn, translated_chord, bass=None)
            displayed = translated_chord

        # Safety net: the registry said this SHOULD have a voicing, but if
        # the lookup still comes up empty for some edge case (e.g. a
        # slash-bass spelling voicings.db doesn't have, like the stray
        # "Gb" bass rows found in this db), try the raw literal input too
        # before giving up -- never makes results worse than pre-fix.
        if not rows:
            literal = _get_voicings_literal(conn, chord_name)
            if literal["voicings"]:
                return literal

        voicings = _rows_to_dicts(rows)
        sorted_voicings = _sort_by_type(voicings)

        return {
            "voicings":        sorted_voicings,
            "fallback":        fallback,
            "displayed":       displayed,
            "translated":      resolved["translated"],
            "translated_from": chord_name if resolved["translated"] else None,
        }
    finally:
        conn.close()


def get_voicings_by_type(chord_name, vtype="Must Know"):
    # Get voicings filtered to a specific type only

    result = get_voicings(chord_name)
    return {
        "voicings":  [v for v in result["voicings"] if v["type"] == vtype],
        "fallback":  result["fallback"],
        "displayed": result["displayed"],
    }


def get_must_know(chord_name):
    # returns Must Know voicings only
    return get_voicings_by_type(chord_name, "Must Know")


if __name__ == "__main__":
    # Quick diagnostic - test a few chords, including ones that exercise
    # the new translation path (Aaug7, C7b13, etc.)
    test_chords = ["Cmaj7", "Gm7", "F#m7b5", "Cmaj7/E", "Am7", "G", "D9",
                   "C6/9", "D6/9/E", "Aaug7", "Caug7", "C7b13"]

    for chord in test_chords:
        result    = get_voicings(chord)
        voicings  = result["voicings"]
        must_know = [v for v in voicings if v["type"] == "Must Know"]
        fallback  = result["fallback"]
        displayed = result["displayed"]
        translated = result.get("translated")
        print(f"\n{chord}: {len(voicings)} total, {len(must_know)} must know  "
              f"fallback={fallback}  displayed='{displayed}'  translated={translated}")
        for v in voicings[:3]:
            print(f"  [{v['type']:<10}] {v['frets']:<22} capo={v['capo']} notes={v['notes']}")