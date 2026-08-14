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


def build_related_note(root, primary_quality, related_quality, registry, bass=None, has_songs=True):
    """Builds the beginner-friendly explanation for why `related_quality`
    overlaps with a search for `primary_quality`. Always explains from the
    bigger (superset) chord toward the smaller (subset) chord, regardless of
    which one the user actually searched for, since that's the direction the
    "commonly omits X" framing is factually true in.

    Phase 5 Part 2/7 style pass: reworded from 4 sentences down to 1 and
    reordered to cause-before-effect (NOTE_STYLE_GUIDE.md's ordering rule
    for EDUCATIONAL notes -- this one explains WHY, so the reason leads and
    the "also shown here" fact follows, not the reverse). Previously led
    with the effect ("Songs tagged X are also shown here.") and only
    explained why over the following 3 sentences -- same information, now
    one sentence, reason first. Terminology: "same notes" (plural, with an
    explicit "missing a tone" qualifier), reserved specifically for this
    subset relationship -- never "same chord", which is reserved for a true
    full-equivalence note (see searched_quality_note below).

    `bass` (Phase 5 Part 2/7 closing round, Task 2 -- bass-display fix):
    DISPLAY-ONLY. Included in the chord strings this function builds for
    `text`/`chord`/`emphasize`, so a combined root+bass+quality search (e.g.
    `G#7#5/D`) shows the bass consistently in BOTH Similar Chords entries --
    previously the synonym entry (built from /chord-info, always
    bass-inclusive) and this overlap entry (bass-less) disagreed with no
    explanation, a real, confirmed inconsistency. This does NOT touch what
    actually gets searched for songs -- get_songs()'s own overlap-relative
    search stays deliberately bass-less (guide-tone relatives are never
    searched bass-inclusive, a separate, already-documented design decision
    unrelated to this fix) -- only what the NOTE calls the chord changes,
    never what got looked up.

    `has_songs` (Task 3 -- theory/songs decoupling): whether real song data
    actually backs this relationship for this root. The theory sentence (the
    bigger chord's extra tone is commonly left out...) is a standing music
    fact, true regardless of whether any song happens to be tagged with the
    result -- so it's always included. The trailing "-- so songs tagged X
    are shown here too" clause is the only conditional part, appended only
    when `has_songs` is True; when False, the sentence ends after the theory
    fact instead of implying song data that isn't there."""
    primary_full = set(registry[primary_quality]["interval_set"])
    related_full = set(registry[related_quality]["interval_set"])

    if related_full.issubset(primary_full):
        bigger_q, smaller_q = primary_quality, related_quality
    else:
        bigger_q, smaller_q = related_quality, primary_quality

    bigger_chord = cp.format_chord(root, bigger_q, bass)
    smaller_chord = cp.format_chord(root, smaller_q, bass)
    related_chord = cp.format_chord(root, related_quality, bass)

    extra = sorted(set(registry[bigger_q]["interval_set"]) - set(registry[smaller_q]["interval_set"]))
    names = [INTERVAL_NAMES.get(i, f"interval {i}") for i in extra]
    phrase = names[0] if len(names) == 1 else " and ".join(names)
    is_are = "is" if len(names) == 1 else "are"

    theory = (
        f"{article_for(root).capitalize()} `{bigger_chord}` chord's {phrase} "
        f"{is_are} commonly left out by guitarists, leaving the same notes as "
        f"`{smaller_chord}`"
    )
    text = f"{theory} -- so songs tagged `{related_chord}` are shown here too." if has_songs else f"{theory}."

    return {
        "quality": related_quality,
        "chord": related_chord,
        "text": text,
        "emphasize": [bigger_chord, smaller_chord],
        "has_songs": has_songs,
    }


def _load(db_path, registry_path, guide_tone_path):
    registry = json.load(open(registry_path))
    guide_tones = json.load(open(guide_tone_path)) if os.path.exists(guide_tone_path) else {"name_to_related": {}}
    intervalset_to_canonical = {
        frozenset(entry["interval_set"]): name for name, entry in registry.items()
    }
    return registry, guide_tones, intervalset_to_canonical


def resolve_query(chord_query, intervalset_to_canonical):
    """Parse a user's search string into (root, canonical_quality, bass,
    quality_blob). `quality_blob` is the literal as-typed quality substring
    (e.g. "7#5"), returned alongside the resolved canonical name (e.g.
    "aug7") so callers can tell when a search used an alias/alternate
    spelling for the same underlying quality -- see get_songs()'s
    `searched_quality_note`."""
    parsed = cp.parse_chord(chord_query)
    if not parsed["parsed"]:
        return None, None, None, None
    full, required = compute_intervals(parsed["quality"])
    canonical_quality = intervalset_to_canonical.get(frozenset(full))
    return parsed["root"], canonical_quality, parsed["bass"], parsed.get("quality_blob")


def _quality_spelling_differs(quality_blob, canonical_quality):
    """True when the user's literally-typed quality spelling isn't the
    same string as the canonical quality name it resolved to (e.g. typing
    "7#5", which resolves to canonical "aug7") -- paren-insensitive, since
    format_chord() wraps bare-accidental qualities in parens purely for
    round-trip parsing safety, not a real spelling difference."""
    if not quality_blob or not canonical_quality:
        return False
    norm = lambda s: s.replace("(", "").replace(")", "").lower()
    return norm(quality_blob) != norm(canonical_quality)


def _ambiguity_note(quality_blob):
    """Phase 5 Part 2/7 follow-up (Task 4): a genuinely AMBIGUOUS shorthand
    the raw search used, that chord_parser.py had to default -- e.g. bare
    "sus" (no explicit "2"/"4") always resolves to sus4. Must run against
    the RAW, as-typed `quality_blob` from THIS search specifically --
    unlike the alt-spelling facts exposed via /chord-info, which describe
    the resolved chord itself and are path-independent, this is only ever
    knowable at search time (by the time a chord reaches /chord-info, it's
    already fully canonical -- "sus" would already read "sus4" -- so that
    endpoint structurally can't detect this after the fact; confirmed by
    tracing the data flow before picking where to compute this).

    Real, confirmed-by-testing finding, not assumed: this does NOT reuse
    WORD_ALIASES' `\\bsus\\b(?!\\d)` entry -- that only fires for a bare
    standalone "sus" search (e.g. "Csus") where a real word boundary
    exists before "sus". A compound blob like "maj7sus" has no boundary
    between the digit "7" and "s", so WORD_ALIASES never matches it at
    all -- tested directly against real parser output before picking a
    mechanism, not assumed from the table's own comment. The actual
    resolution for compound blobs happens entirely inside
    parse_quality()'s alteration-scanning loop, via `ALT_PATTERN`'s own
    bare `sus` alternative -- reusing THAT pattern (hoisted to module
    level specifically for this) covers both cases correctly, one
    mechanism instead of two hand-picked ones that could drift apart.
    Names the ambiguous TOKEN itself (e.g. "sus"), not the whole quality
    blob (e.g. "maj7sus"), so the note stays short and points at exactly
    the part that was ambiguous."""
    if not quality_blob:
        return None
    for match in cp.ALT_PATTERN.finditer(quality_blob):
        if match.group(0) == "sus":
            return f"`{match.group(0)}` was interpreted as `sus4`."
    return None


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

    root, canonical_quality, bass, quality_blob = resolve_query(chord_query, intervalset_to_canonical)
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

    def _query_songs(target):
        cur.execute(
            "SELECT title, artist, normalized_unique_chords, spotify_track_id, "
            "album_image_url, artist_image_url, youtube_video_id, youtube_confidence, "
            "ug_url, ug_key, ug_capo, ug_capo_source, ug_tuning_name, ug_tuning_value, "
            "ug_votes, artist_genres, all_chords, normalized_all_chords, album_release_date "
            "FROM songs WHERE normalized_unique_chords LIKE ?",
            (f'%"{target}"%',)
        )
        return cur.fetchall()

    def _rows_to_songs(rows, target):
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
                # ISO "YYYY-MM-DD" (confirmed against real data -- 31138 of
                # 31140 rows, only 2 genuinely NULL/empty) -- Phase 5 Part
                # 5/7, added for the year-range filter on the Songs panel.
                "album_release_date": r[18],
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
        return songs_list

    # Real bug fix: resolve_query() correctly parses out a slash chord's
    # bass note, but the search itself previously never used it -- "C/E"
    # silently searched the db for plain "C" the whole time, even though
    # normalized_unique_chords really does store bass-inclusive tokens like
    # "C13/E". Only the PRIMARY quality (search_qualities[0], i.e.
    # canonical_quality itself) gets bass-aware search -- related/guide-tone
    # qualities keep searching bass-less, that's a separate concern.
    inversion_fallback_used = False
    # The chord spelling actually resolved/searched for the PRIMARY quality,
    # post any inversion fallback -- i.e. exactly the key used for it in
    # results_by_quality below. This is the single source of truth for "what
    # is actually being shown", and every note that claims to describe what's
    # displayed must reference THIS, not the pre-fallback `primary_chord`
    # (bass-inclusive, frozen at the top of this function) -- see the
    # stale-chord-reference audit in the searched_quality_note/
    # quality_fallback note construction below.
    resolved_primary_chord = None
    # Per-related-quality song count, so related_notes (built below) can
    # skip claiming "songs tagged X are also shown here" for a related
    # quality that genuinely has zero songs for this root -- same class of
    # staleness bug as the primary-chord one above, just for the guide-tone
    # note instead.
    related_song_counts = {}

    results_by_quality = {}
    for q in search_qualities:
        is_primary = (q == canonical_quality)

        if is_primary and bass:
            target = cp.format_chord(root, q, bass)
            rows = _query_songs(target)
            if not rows:
                # No songs tagged with the exact inversion -- fall back to
                # the bass-less (root-position) spelling for this quality,
                # and flag it so callers/UI can make the fallback explicit
                # rather than silently showing root-position songs as if
                # they matched the inversion.
                inversion_fallback_used = True
                target = cp.format_chord(root, q)
                rows = _query_songs(target)
        else:
            target = cp.format_chord(root, q)
            rows = _query_songs(target)

        results_by_quality[target] = _rows_to_songs(rows, target)
        if is_primary:
            resolved_primary_chord = target
        else:
            related_song_counts[q] = len(rows)

    total_songs = sum(len(v) for v in results_by_quality.values())

    # Genuine-no-songs fallback: if NOTHING was found for this root at all
    # (not even via fuzzy guide-tone relatives), fall back to searching for
    # the same quality on OTHER roots -- a song in a different key using
    # the identical quality is still the same fretted shape (just moved),
    # which is real, useful information rather than a plain "no songs"
    # dead end. Kept in a clearly separate field (never merged into
    # results_by_spelling) so the UI can't present these as if they matched
    # the searched root (Dump Notes: "If genuine no songs exist").
    quality_fallback_used = False
    quality_fallback_songs = []
    if total_songs == 0:
        for other_root in cp.CHROMATIC:
            if other_root == root:
                continue  # already searched above with zero results
            other_target = cp.format_chord(other_root, canonical_quality)
            other_rows = _query_songs(other_target)
            if other_rows:
                quality_fallback_songs.append({
                    "root": other_root,
                    "chord": other_target,
                    "songs": _rows_to_songs(other_rows, other_target),
                })
        quality_fallback_used = bool(quality_fallback_songs)

    conn.close()

    # Real, confirmed staleness bug (audit pass, Phase 5 Part 1/6 follow-up):
    # a related_note used to be built unconditionally for every guide-tone
    # relative regardless of real song backing -- e.g. "F#-5" claimed "Songs
    # tagged `F#add#11` are also shown here" even when there were genuinely
    # zero F#add#11 songs. Fixed AT THE TIME by only building a note when
    # `related_song_counts.get(rq, 0) > 0` -- but that fix went too far: it
    # suppressed the entire THEORY explanation too, not just the songs
    # claim, so a real, always-true overlap relationship (the guide-tone
    # grouping itself, independent of any particular root's song data)
    # silently disappeared whenever a root's related quality had zero songs.
    # Chord-theory content must never be gated by song-data availability --
    # split (Phase 5 Part 2/7 closing round, Task 3): a note is now built for
    # EVERY real overlap relationship in `related` (the registry/guide-tone
    # fact, not song-dependent), with `has_songs` telling build_related_note
    # whether to append the conditional songs clause. Verified against a
    # real zero-song case (root G, canonical quality "11", related "7add11"
    # -- G7add11 has genuinely zero literal songs of its own): the theory
    # sentence still renders, just without the trailing songs clause.
    related_notes = [
        build_related_note(
            root, canonical_quality, rq, registry, bass=bass, has_songs=related_song_counts.get(rq, 0) > 0
        )
        for rq in related
    ]

    # Real, reported confusion (Dump Notes: "E7#5 investigate bug?"): a
    # search like "E7#5" resolves to the registry's canonical quality name
    # "aug7" -- so when THAT quality also has a guide-tone relative
    # (E7b13), related_notes' text talks about "Eaug7"/"E7b13" without ever
    # mentioning "E7#5", which is what the user actually typed/sees as the
    # page title. This isn't a bug in the guide-tone grouping itself (aug7
    # and 7b13 genuinely are interchangeable, same as the message says) --
    # it's a missing explanation for the FIRST, separate substitution (typed
    # spelling -> canonical quality name) that happens before guide-tone
    # matching even runs. Surfaced here, mirroring the existing root-alias
    # caption pattern (ManualSearch's enharmonicCaption/resultsEnharmonicCaption),
    # so the UI can show "Searched as E7#5 -- shown here as Eaug7" ahead of
    # the related_notes text, instead of leaving the reader to guess how
    # the two are connected.
    # Reworded per real screenshot feedback (Phase 5 Part 1/6 follow-up):
    # the original wording ("BetterChord treats this as...") read like an
    # app-specific convention rather than a music fact. Leads with the
    # actual fact (two names, identical notes) and only secondarily
    # mentions that's why one of them is what's shown.
    #
    # Real stale-chord-reference bug (audit pass, Phase 5 Part 1/6
    # follow-up): the closing "so it's shown as X below" clause used to
    # reference `canonical_chord` (bass-inclusive, e.g. "Eaug7/Bb")
    # unconditionally -- but when an inversion fallback ALSO fired (no
    # songs for the exact inversion), what's actually shown below is
    # `resolved_primary_chord` (root-position "Eaug7"), not the
    # bass-inclusive spelling. The middle "that's the same chord as X"
    # clause is left referencing `canonical_chord` on purpose -- that's a
    # pure naming-equivalence fact (independent of whether songs exist for
    # either spelling) and stays true with the bass attached either way;
    # only the "what's actually below" claim needs the resolved chord.
    # Phase 5 Part 2/7 style pass: unified on the fixed "shown here as X"
    # idiom (was "so it's shown as X below" -- the "below" was redundant
    # once every other family says "here", and this is the only family that
    # didn't) and dropped one of the two dashes for readability (comma
    # clause, then a single em-dash-equivalent " -- " before the effect).
    # Cause-before-effect ordering (the equivalence fact, then what it
    # caused) is unchanged -- this family already matched the rule.
    searched_quality_note = None
    if _quality_spelling_differs(quality_blob, canonical_quality):
        canonical_chord = cp.format_chord(root, canonical_quality, bass)
        searched_quality_note = (
            f"You searched `{chord_query}`, which is the same chord as "
            f"`{canonical_chord}` (identical notes, just a different name) -- "
            f"shown here as `{resolved_primary_chord}`."
        )

    return {
        "query": chord_query,
        "resolved_root": root,
        "resolved_quality": canonical_quality,
        "primary_chord": cp.format_chord(root, canonical_quality, bass),
        # Always the bass-less/root-position spelling, regardless of
        # whether an inversion was searched -- exposed so the UI can name
        # exactly what a fallback landed on (see inversion_fallback_used)
        # without re-deriving it client-side.
        "root_position_chord": cp.format_chord(root, canonical_quality),
        # The chord spelling ACTUALLY searched/shown for the primary
        # quality, post any inversion fallback -- equals `primary_chord`
        # when no fallback was needed, `root_position_chord` when it was.
        # Single source of truth for "what's actually below" (Phase 5
        # Part 1/6 stale-chord-reference audit) -- use this, not
        # `primary_chord`, whenever a note needs to name what's displayed.
        "resolved_primary_chord": resolved_primary_chord,
        "searched_quality_note": searched_quality_note,
        # Task 4 (Phase 5 Part 2/7 follow-up): see _ambiguity_note()'s own
        # docstring for why this has to be computed here (from the raw,
        # as-searched quality_blob) rather than at /chord-info.
        "ambiguity_note": _ambiguity_note(quality_blob),
        "mode": "strict" if strict else "fuzzy",
        "related_qualities_included": related,
        "related_notes": related_notes,
        "results_by_spelling": results_by_quality,
        "total_songs": total_songs,
        # True only when the query had a bass note AND no songs were tagged
        # with the exact bass-inclusive spelling, so the primary quality's
        # results silently fell back to root-position songs. Lets the UI
        # make that fallback explicit instead of implying an inversion
        # match that isn't real (Dump Notes: "Fall back clearness").
        "inversion_fallback_used": inversion_fallback_used,
        # True only when total_songs is 0 even after strict/fuzzy matching
        # -- see quality_fallback_songs for same-quality songs on other
        # roots (Dump Notes: "If genuine no songs exist").
        "quality_fallback_used": quality_fallback_used,
        "quality_fallback_songs": quality_fallback_songs,
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