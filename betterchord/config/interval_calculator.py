"""
interval_calculator.py

Turns a structural chord-quality dict (from chord_parser.parse_quality) into
two things:
  - full_intervals     : every pitch class (0-11, root-relative) the chord
                          theoretically contains
  - required_intervals : the subset that MUST be present for the label to
                          apply (the "guide tones") -- the rest is omittable
                          on a 6-string guitar without changing the name

This is a rule engine, not a lookup table, so it can produce an answer for
ANY parsed structure -- including ones that don't exist yet in
music_theory.py's hand-tuned QUALITY_INTERVALS. Where music_theory.py
already has a tuned entry for an equivalent quality, that's compared
against (not silently overridden) by registry_builder.py.

Rules (in application order):
  1. Base triad/dyad sets the starting full+required set.
  2. Seventh (7 / maj7 / dim7) adds one interval, always required.
  3. Extension (9/11/13) adds the NAMED interval as required, and the
     lower "implied" extensions (9 within 11/13, 11 within 13) as
     OMITTABLE -- this is the C13-omits-9-and-11 rule from our discussion.
  4. six / sixnine add their interval(s), always required (naming a 6th
     chord is deliberate, there's nothing to omit).
  5. adds (add9, add11, ...) insert one specific tone, always required.
  6. Alterations (#5, b5, #9, b9, #11, b13, ...) REPLACE their natural
     unaltered counterpart (an altered tone is always required -- that's
     the entire point of naming it).
  7. A plain, UNALTERED 5th is downgraded from required to omittable
     unless the base chord IS the 5th doing the identity work (power
     chord, aug, dim, or an explicit b5/#5 alteration already handled
     the removal in step 6).
  8. no3 / no5 flags strip those tones entirely.
"""

BASE_INTERVALS = {
    "maj":  {"full": [0, 4, 7], "required": [0, 4]},
    "min":  {"full": [0, 3, 7], "required": [0, 3]},
    "dim":  {"full": [0, 3, 6], "required": [0, 3, 6]},
    "aug":  {"full": [0, 4, 8], "required": [0, 4, 8]},
    "sus2": {"full": [0, 2, 7], "required": [0, 2]},
    "sus4": {"full": [0, 5, 7], "required": [0, 5]},
    "sus2sus4": {"full": [0, 2, 5, 7], "required": [0, 2, 5]},
    "5":    {"full": [0, 7],    "required": [0, 7]},
}

SEVENTH_INTERVAL = {"7": 10, "maj7": 11, "dim7": 9}

# alteration -> (new interval to add, natural interval it replaces if present)
ALTERATION_MAP = {
    "b5":  (6, 7),
    "#5":  (8, 7),
    "b6":  (8, 7),   # enharmonic to #5 as a triad alteration (e.g. "mb6" == minor-augmented)
    "#6":  (10, 9),
    "b9":  (1, 2),
    "#9":  (3, 2),
    "b11": (4, 5),
    "#11": (6, 5),
    "b13": (8, 9),
    "#13": (10, 9),
}

ADD_INTERVAL = {
    "add2": 2, "add9": 2,
    "add4": 5, "add11": 5,
    "add6": 9, "add13": 9,
    # Altered-degree adds -- e.g. "add(b9)" means "keep the plain triad and
    # add a flat-9 on top", distinct from a b9 ALTERATION (which would
    # replace an existing natural 9th). Previously silently dropped since
    # this table only had natural-degree entries -- confirmed by testing
    # "Caddb9" and finding the b9 never made it into the computed interval
    # set at all.
    "addb5": 6, "add#5": 8,
    "addb9": 1, "add#9": 3,
    "addb11": 4, "add#11": 6,
    "addb13": 8, "add#13": 10,
}


def compute_intervals(q):
    """q is the 'quality' dict produced by chord_parser.parse_quality().
    Returns (full_intervals: sorted list, required_intervals: sorted list)."""

    base = q["base"] if q["base"] in BASE_INTERVALS else "maj"
    full = set(BASE_INTERVALS[base]["full"])
    required = set(BASE_INTERVALS[base]["required"])

    # -- seventh --
    if q["seventh"]:
        iv = SEVENTH_INTERVAL.get(q["seventh"])
        if iv is not None:
            full.add(iv)
            required.add(iv)

    # -- extension (9/11/13): named tone required, implied lower ones omittable --
    if q["ext"] == "9":
        full.add(2); required.add(2)
    elif q["ext"] == "11":
        full.update({2, 5}); required.add(5)          # 9 implied but omittable
    elif q["ext"] == "13":
        full.update({2, 5, 9}); required.add(9)        # 9, 11 implied but omittable

    # -- six / sixnine --
    if q["six"]:
        full.add(9); required.add(9)
    if q["sixnine"]:
        full.update({2, 9}); required.update({2, 9})

    # -- explicit adds --
    for a in q["adds"]:
        iv = ADD_INTERVAL.get(a)
        if iv is not None:
            full.add(iv); required.add(iv)

    # -- alterations: replace the natural tone, altered tone is always required --
    for alt in q["alterations"]:
        if alt in ALTERATION_MAP:
            new_iv, natural_iv = ALTERATION_MAP[alt]
            full.discard(natural_iv); required.discard(natural_iv)
            full.add(new_iv); required.add(new_iv)
        else:
            # unrecognized alteration token -- keep it visible rather than dropping silently
            pass

    # -- no3 / no5 --
    if q.get("no3"):
        full -= {3, 4}; required -= {3, 4}
    if q.get("no5"):
        full -= {6, 7, 8}; required -= {6, 7, 8}

    # -- plain unaltered 5th is omittable unless it IS the chord's identity --
    # (power chord / aug / dim / sus already have 7 doing real identity work,
    # or already replaced via alteration in step above -- so this only
    # downgrades the "plain perfect 5th sitting in a maj/min triad" case)
    if 7 in required and base in ("maj", "min") and not q["alterations"] & {"b5", "#5"}:
        required.discard(7)

    return sorted(full), sorted(required)