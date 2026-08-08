"""
songs.py

The actual song-lookup function -- built on top of the normalized_unique_chords
column from build_normalized_columns.py. (Renamed from chord_search.py to
match the voicings.py naming convention: file named after what it returns,
not the action it performs.)

Two modes:
  strict : exact canonical quality match only
  fuzzy  : also includes guide-tone-related qualities from
           guide_tone_groups.json (e.g. searching "C13" also returns
           songs tagged "C7add13"), with a note on WHY they're related

Usage:
    python songs.py "C13"                  # fuzzy (default)
    python songs.py "C13" --strict          # exact only
    python songs.py "Aaug7"
"""

import json
import os
import re
import sqlite3
import sys

import chord_parser as cp
from interval_calculator import compute_intervals

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(_HERE, "..", "..", "data", "song_data", "betterchord_songs.db")
DEFAULT_REGISTRY_PATH = os.path.join(_HERE, "..", "..", "data", "registry", "quality_registry.json")
DEFAULT_GUIDE_TONE_PATH = os.path.join(_HERE, "..", "..", "data", "registry", "guide_tone_groups.json")

INTERVAL_NAMES = {2: "9th", 4: "3rd", 5: "11th", 7: "5th", 9: "13th", 10: "b7"}

# Root letters whose SPOKEN name starts with a vowel sound (e.g. "F" is
# spoken "eff", "A" is spoken "ay") -- since a chord is always read aloud
# starting with its root, the article depends on the root, not the quality.
VOWEL_SOUND_ROOTS = {"Eb", "E", "F", "F#", "Ab", "A"}


def article_for(root):
    return "an" if root in VOWEL_SOUND_ROOTS else "a"


def build_related_note(root, primary_quality, related_quality, registry):
    """Builds the beginner-friendly explanation for why `related_quality`'s
    songs are being shown alongside a search for `primary_quality`. Always
    explains from the bigger (superset) chord toward the smaller (subset)
    chord, regardless of which one the user actually searched for, since
    that's the direction the "commonly omits X" framing is factually true in."""
    primary_full = set(registry[primary_quality]["interval_set"])
    related_full = set(registry[related_quality]["interval_set"])

    if related_full.issubset(primary_full):
        bigger_q, smaller_q = primary_quality, related_quality
    else:
        bigger_q, smaller_q = related_quality, primary_quality

    bigger_chord = cp.format_chord(root, bigger_q)
    smaller_chord = cp.format_chord(root, smaller_q)
    related_chord = cp.format_chord(root, related_quality)

    extra = sorted(set(registry[bigger_q]["interval_set"]) - set(registry[smaller_q]["interval_set"]))
    names = [INTERVAL_NAMES.get(i, f"interval {i}") for i in extra]
    phrase = names[0] if len(names) == 1 else " and ".join(names)
    is_are = "is" if len(names) == 1 else "are"
    it_them = "it" if len(names) == 1 else "them"

    text = (
        f"Songs tagged `{related_chord}` are also shown here. "
        f"{article_for(root).capitalize()} `{bigger_chord}` chord's {phrase} "
        f"{is_are} commonly left out by guitarists. "
        f"Without {it_them}, it's the same notes as `{smaller_chord}`. "
        f"Thus, both are often interchangeable."
    )

    return {
        "quality": related_quality,
        "chord": related_chord,
        "text": text,
        "emphasize": [bigger_chord, smaller_chord],
    }


def _load(db_path, registry_path, guide_tone_path):
    registry = json.load(open(registry_path))
    guide_tones = json.load(open(guide_tone_path)) if os.path.exists(guide_tone_path) else {"name_to_related": {}}
    intervalset_to_canonical = {
        frozenset(entry["interval_set"]): name for name, entry in registry.items()
    }
    return registry, guide_tones, intervalset_to_canonical


def resolve_query(chord_query, intervalset_to_canonical):
    """Parse a user's search string into (root, canonical_quality, bass)."""
    parsed = cp.parse_chord(chord_query)
    if not parsed["parsed"]:
        return None, None, None
    full, required = compute_intervals(parsed["quality"])
    canonical_quality = intervalset_to_canonical.get(frozenset(full))
    return parsed["root"], canonical_quality, parsed["bass"]


def transpose_chord_down(chord_string, semitones, intervalset_to_canonical):
    """Transposes a chord string DOWN by `semitones`, e.g. for computing the
    shape a guitarist actually frets under a capo (the real sounding pitch
    is `chord_string`; the shape is `chord_string` transposed down by the
    capo fret). Built from existing primitives per CLAUDE.md's core rule --
    never hand-rolls string slicing on the chord name: parse_chord() for
    structured root/bass, CHROMATIC for the shift, compute_intervals() +
    the registry's interval-set map to recover the quality's canonical
    NAME (parse_chord() only returns quality as a structured dict, not a
    string, so this is the same registry lookup resolve_query() already
    uses elsewhere in this file), then format_chord() to rebuild. Returns
    None if `chord_string` doesn't parse or its quality isn't a registry
    quality (shouldn't happen for a chord_string built from this file's
    own root/canonical_quality, but stay defensive rather than crash).
    """
    parsed = cp.parse_chord(chord_string)
    if not parsed["parsed"]:
        return None

    root_idx = cp.CHROMATIC.index(parsed["root"])
    new_root = cp.CHROMATIC[(root_idx - semitones) % 12]

    new_bass = None
    if parsed["bass"]:
        bass_idx = cp.CHROMATIC.index(parsed["bass"])
        new_bass = cp.CHROMATIC[(bass_idx - semitones) % 12]

    full, _required = compute_intervals(parsed["quality"])
    quality_name = intervalset_to_canonical.get(frozenset(full))
    if quality_name is None:
        return None

    return cp.format_chord(new_root, quality_name, new_bass)


def find_raw_chord(all_chords_json, normalized_all_chords_json, target):
    """Looks up the pre-normalization token UG actually shows for `target`.
    `all_chords`/`normalized_all_chords` are parallel arrays (same length/
    order per song -- build_normalized_columns.py normalizes each raw
    token in place) -- find the first index where the normalized array
    equals `target` and return the raw token at that same index, or None
    if it's identical to `target` (no real difference to report) or the
    columns don't parse/don't contain a match (defensive -- shouldn't
    happen since `target` was matched via normalized_unique_chords in the
    caller's own SQL WHERE clause, but never crash on a real scrape
    inconsistency)."""
    try:
        all_chords = json.loads(all_chords_json)
        normalized_all_chords = json.loads(normalized_all_chords_json)
    except (TypeError, ValueError):
        return None
    for raw, norm in zip(all_chords, normalized_all_chords):
        if norm == target:
            return raw if raw != target else None
    return None


def get_songs(chord_query, db_path=None, registry_path=None, guide_tone_path=None, strict=False):
    db_path = db_path or DEFAULT_DB_PATH
    registry_path = registry_path or DEFAULT_REGISTRY_PATH
    guide_tone_path = guide_tone_path or DEFAULT_GUIDE_TONE_PATH

    registry, guide_tones, intervalset_to_canonical = _load(db_path, registry_path, guide_tone_path)

    root, canonical_quality, bass = resolve_query(chord_query, intervalset_to_canonical)
    if root is None:
        return {"error": f"Could not parse {chord_query!r} as a chord."}
    if canonical_quality is None:
        return {"error": f"{chord_query!r} parsed fine but matches no known quality in the registry."}

    # Which canonical quality names to search for: just this one (strict),
    # or this one plus its guide-tone relatives (fuzzy)
    related = [] if strict else guide_tones.get("name_to_related", {}).get(canonical_quality, [])
    search_qualities = [canonical_quality] + related

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    results_by_quality = {}
    for q in search_qualities:
        target = cp.format_chord(root, q)
        cur.execute(
            "SELECT title, artist, normalized_unique_chords, spotify_track_id, "
            "album_image_url, artist_image_url, youtube_video_id, youtube_confidence, "
            "ug_url, ug_key, ug_capo, ug_capo_source, ug_tuning_name, ug_tuning_value, "
            "ug_votes, artist_genres, all_chords, normalized_all_chords "
            "FROM songs WHERE normalized_unique_chords LIKE ?",
            (f'%"{target}"%',)
        )
        rows = cur.fetchall()
        songs_list = [
            {
                "title": r[0],
                "artist": r[1],
                "spotify_track_id": r[3],
                "album_image_url": r[4],
                "artist_image_url": r[5],
                "youtube_video_id": r[6],
                "youtube_confidence": r[7],
                "ug_url": r[8],
                "ug_key": r[9],
                "ug_capo": r[10],
                "ug_capo_source": r[11],
                "ug_tuning_name": r[12],
                "ug_tuning_value": r[13],
                "ug_votes": r[14],
                "artist_genres": r[15],
                # Both explain why the chord name shown here can differ from
                # what's literally printed on the UG tab -- two genuinely
                # separate reasons, see songs.py's helpers for how each is
                # computed. Only ever set for THIS one matched/output chord
                # (`target`), not the song's full chord list.
                "raw_chord": find_raw_chord(r[16], r[17], target),
                "capo_shape": transpose_chord_down(target, r[10], intervalset_to_canonical) if r[10] and r[10] > 0 else None,
            }
            for r in rows
        ]
        # Most-voted first. Real data has zero NULL ug_votes rows today
        # (checked directly against betterchord_songs.db, not assumed), but
        # sort defensively anyway: a missing value sorts to the very end,
        # below even a real 0-vote song, rather than crashing or -- worse --
        # silently sorting alongside/above real low-vote songs as if it
        # were itself a legitimate 0.
        songs_list.sort(key=lambda s: s["ug_votes"] if s["ug_votes"] is not None else -1, reverse=True)
        results_by_quality[target] = songs_list

    conn.close()

    related_notes = [build_related_note(root, canonical_quality, rq, registry) for rq in related]

    return {
        "query": chord_query,
        "resolved_root": root,
        "resolved_quality": canonical_quality,
        "primary_chord": cp.format_chord(root, canonical_quality),
        "mode": "strict" if strict else "fuzzy",
        "related_qualities_included": related,
        "related_notes": related_notes,
        "results_by_spelling": results_by_quality,
        "total_songs": sum(len(v) for v in results_by_quality.values()),
    }


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)

    strict = "--strict" in args
    db_override = None
    if "--db" in args:
        idx = args.index("--db")
        db_override = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    query = [a for a in args if a != "--strict"][0]

    result = get_songs(query, db_path=db_override, strict=strict)

    if "error" in result:
        print(result["error"])
        sys.exit(1)

    print(f"Query: {result['query']!r} -> resolved to {result['primary_chord']!r} "
          f"(mode={result['mode']})")
    if result["related_qualities_included"]:
        print(f"Fuzzy match also includes: {result['related_qualities_included']} "
              f"(same guide tones, different voicing/spelling convention)")
    print(f"Total songs found: {result['total_songs']}\n")

    for spelling, songs in result["results_by_spelling"].items():
        print(f"  Tagged as {spelling!r}: {len(songs)} song(s)")
        for s in songs[:5]:
            print(f"      {s['title']} - {s['artist']}")
        if len(songs) > 5:
            print(f"      ... and {len(songs)-5} more")