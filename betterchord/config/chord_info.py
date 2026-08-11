# chord_info.py
# Given a chord name, returns interval spellings quality description and related chords.
#
# Imports QUALITY_INTERVALS and CHROMATIC from music_theory.py to avoid duplicating the interval definitions that already live there.

import re
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from music_theory import QUALITY_INTERVALS, CHROMATIC, normalize, normalize_note
import chord_parser as cp

# Enharmonic respelling
# Our internal chromatic scale uses one fixed spelling per pitch, which follows this scale (C C# D Eb E F F# G Ab A Bb B). 
# # But when  displaying notes to users we need the technically correct letter for each chord tone relative to its root.
# e.g. Eb9's b7 is semitone 1 — stored as C# internally — but the correct display spelling in an Eb context is Db (the lowered 7th degree of Eb major).

LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

# Natural semitone for each letter name
LETTER_TO_SEMITONE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

# Which LETTER each root starts on (index into LETTERS)
ROOT_LETTER_IDX = {
    'C':  0, 'C#': 0,
    'D':  1,
    'Eb': 2, 'E':  2,
    'F':  3, 'F#': 3,
    'G':  4,
    'Ab': 5, 'A':  5,
    'Bb': 6, 'B':  6,
}

# Diatonic interval for each major scale degree
MAJOR_SCALE_INTERVALS = {1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11}

# Default: (scale_degree, accidental) for each chromatic interval
# accidental: 0=natural, -1=flat, +1=sharp
_INTERVAL_DEGREE_BASE = {
    0:  (1,  0),   # R
    1:  (2, -1),   # b9
    2:  (2,  0),   # 9
    3:  (3, -1),   # b3
    4:  (3,  0),   # 3
    5:  (4,  0),   # 11
    6:  (4,  1),   # #11  (overridden to (5,-1) = b5 for flat-five qualities)
    7:  (5,  0),   # 5
    8:  (5,  1),   # #5   (overridden to (6,-1) = b13 for certain altered qualities)
    9:  (6,  0),   # 6/13
    10: (7, -1),   # b7
    11: (7,  0),   # maj7
}

# Qualities where interval 6 is the b5 (degree 5 flat) not #11 (degree 4 sharp)
_B5_QUALITIES = {
    'm7b5', 'dim', 'dim7', '7b5', 'maj7b5',
    '9b5', '7(b5,b9)', '7(b5,#9)', 'm11b5', '-5',
}

# Qualities where interval 8 is b13 (degree 6 flat) not #5 (degree 5 sharp)
_B13_QUALITIES = {'7(#5,b9)', '7(#5,#9)', 'aug13'}

# Qualities where interval 9 is a genuinely DIMINISHED (double-flatted)
# seventh -- degree 7 lowered twice -- not the natural 6th degree
# _INTERVAL_DEGREE_BASE defaults interval 9 to. Real bug, found via
# voicings.py's closing verification pass (Phase 3 Part 5/6): a
# fully-diminished-7th chord stacks four minor thirds (root-b3-b5-bb7),
# so its 7th is conventionally spelled as the ROOT's 7th-degree LETTER
# flattened twice (e.g. F's -> Ebb), never as its 6th-degree letter
# (D) -- both are the same pitch (9 semitones up), but only one is the
# letter a diminished-7th chord is actually built from. Confirmed this
# was a pre-existing gap in THIS function specifically (not something
# voicings.py's own fix introduced): get_chord_info('Fdim7') already
# showed "D" labeled "13 (thirteenth)" before this fix, for the exact
# same underlying reason -- interval 9 had no dim7-aware override here,
# same class of ambiguity _B5_QUALITIES/_B13_QUALITIES above already
# solve for interval 6/8, just never extended to interval 9.
_BB7_QUALITIES = {'dim7'}


def _get_degree(interval, quality):
    if interval == 6 and quality in _B5_QUALITIES:
        return (5, -1)
    if interval == 8 and quality in _B13_QUALITIES:
        return (6, -1)
    if interval == 9 and quality in _BB7_QUALITIES:
        return (7, -2)
    return _INTERVAL_DEGREE_BASE[interval]


def spell_note(root_name, interval, quality=''):
    # Return the correctly spelled note name for a given root and chromatic interval.
    # e.g. spell_note('Eb', 10, '9') -> 'Db'  (not 'C#')
    
    if interval == 0:
        return root_name

    root_letter_idx = ROOT_LETTER_IDX[root_name]
    root_chrom_idx  = CHROMATIC.index(root_name)
    degree, accidental = _get_degree(interval, quality)

    letter = LETTERS[(root_letter_idx + degree - 1) % 7]

    # Semitone of the diatonic (major scale) note for this degree above root
    diatonic_semitone    = (root_chrom_idx + MAJOR_SCALE_INTERVALS[degree]) % 12
    letter_natural_semi  = LETTER_TO_SEMITONE[letter]

    # How many semitones the root shifts this letter away from its natural pitch
    root_acc = (diatonic_semitone - letter_natural_semi) % 12
    if root_acc > 6:
        root_acc -= 12

    total_acc = root_acc + accidental

    if   total_acc ==  0: return letter
    elif total_acc == -1: return letter + 'b'
    elif total_acc ==  1: return letter + '#'
    elif total_acc == -2: return letter + 'bb'
    elif total_acc ==  2: return letter + '##'
    else:
        return CHROMATIC[(root_chrom_idx + interval) % 12]  # fallback


# Interval to label mapping
INTERVAL_NAMES = {
    0:  ("R",    "root"),
    1:  ("b9",   "flat ninth"),
    2:  ("9",    "ninth"),
    3:  ("b3",   "minor third"),
    4:  ("3",    "major third"),
    5:  ("11",   "eleventh"),
    6:  ("#11",  "sharp eleventh"),
    7:  ("5",    "fifth"),
    8:  ("#5",   "augmented fifth"),
    9:  ("13",   "thirteenth"),
    10: ("b7",   "minor seventh"),
    11: ("7",    "major seventh"),
}

# Quality-specific label overrides (short, full) for some intervals where the quality naming is misleading (example sus4 chords showing eleventh instead of fourth)
INTERVAL_LABEL_OVERRIDES = {
    2: {
        "sus2":     ("2",   "second"),
        "sus2sus4": ("2",   "second"),
        "7sus2":    ("2",   "second"),
    },
    5: {
        "sus4":     ("4",   "fourth"),
        "sus2sus4": ("4",   "fourth"),
        "7sus4":    ("4",   "fourth"),
        "9sus4":    ("4",   "fourth"),
        "13sus4":   ("4",   "fourth"),
        "add4":     ("4",   "fourth"),
        "madd4":    ("4",   "fourth"),
    },
    6: {
        "m7b5":     ("b5",  "flat fifth"),
        "dim":      ("b5",  "flat fifth"),
        "dim7":     ("b5",  "flat fifth"),
        "7b5":      ("b5",  "flat fifth"),
        "maj7b5":   ("b5",  "flat fifth"),
        "9b5":      ("b5",  "flat fifth"),
        "7(b5,b9)": ("b5",  "flat fifth"),
        "7(b5,#9)": ("b5",  "flat fifth"),
        "m11b5":    ("b5",  "flat fifth"),
        "-5":       ("b5",  "flat fifth"),
    },
    3: {
        "7#9":      ("#9",  "sharp ninth"),
        "7(b5,#9)": ("#9",  "sharp ninth"),
        "7(#5,#9)": ("#9",  "sharp ninth"),
    },
    8: {
        "aug":      ("#5",  "augmented fifth"),
        "augmaj7":  ("#5",  "augmented fifth"),
        "aug7":     ("#5",  "augmented fifth"),
        "m7#5":     ("#5",  "augmented fifth"),
        "9#5":      ("#5",  "augmented fifth"),
        "aug13":    ("#5",  "augmented fifth"),
        "7(#5,b9)": ("#5",  "augmented fifth"),
        "7(#5,#9)": ("#5",  "augmented fifth"),
        "augmaj7":  ("#5",  "augmented fifth"),
    },
    9: {
        "6":        ("6",   "sixth"),
        "m6":       ("6",   "sixth"),
        "6/9":      ("6",   "sixth"),
        "m6/9":     ("6",   "sixth"),
        "13":       ("13",  "thirteenth"),
        "maj13":    ("13",  "thirteenth"),
        "m13":      ("13",  "thirteenth"),
        "aug13":    ("13",  "thirteenth"),
        "13#11":    ("13",  "thirteenth"),
        "maj13#11": ("13",  "thirteenth"),
        "13sus4":   ("13",  "thirteenth"),
        "13b9":     ("13",  "thirteenth"),
        "13#9":     ("13",  "thirteenth"),
        "13b9#11":  ("13",  "thirteenth"),
        # Paired with _BB7_QUALITIES above -- the note is now correctly
        # spelled "Ebb"-style (double-flatted 7th degree); the label
        # needs to match, not still say "13 (thirteenth)" next to it.
        "dim7":     ("dim7", "diminished seventh"),
    },
}

# Quality descriptions
# Covers every quality defined in music_theory.QUALITY_INTERVALS

QUALITY_DESCRIPTIONS = {
    "":         "Major triad — bright, stable, the most common chord in Western music.",
    "m":        "Minor triad — darker, introspective. The backbone of sad and emotive music.",
    "5":        "Power chord — just root and fifth, no third. Raw, ambiguous, quintessential rock.",
    "-5":       "Major flat-five — tritone substitution territory. Tense and unresolved.",
    "aug":      "Augmented triad — symmetrical, unstable, dreamlike. Often a passing chord.",
    "dim":      "Diminished triad — tense and unstable, usually resolves up by a half step.",
    "sus2":     "Suspended second — open and airy, replaces the third with the ninth.",
    "sus4":     "Suspended fourth — tense but unresolved, leans toward the major chord.",
    "6":        "Major sixth — warm and mellow. Common in jazz and bossa nova.",
    "m6":       "Minor sixth — bittersweet. Widely used in jazz and film scoring.",
    "6/9":      "Six-nine chord — lush, no seventh. A jazzy, complete-sounding major color.",
    "m6/9":     "Minor six-nine — dark but full, popular in jazz ballads.",
    "maj7":     "Major seventh — smooth and sophisticated. The sound of jazz and R&B.",
    "m7":       "Minor seventh — mellow and melancholic. Essential in jazz, soul, and funk.",
    "7":        "Dominant seventh — tense, wants to resolve. The engine of blues and jazz.",
    "mmaj7":    "Minor-major seventh — haunting and tense. A film noir sound.",
    "aug7":     "Augmented seventh — tense with a raised fifth. Dramatic, chromatic movement.",
    "augmaj7":  "Augmented major seventh — otherworldly and unresolved. Rare and striking.",
    "dim7":     "Diminished seventh — fully symmetrical, extremely tense. Horror film favorite.",
    "m7b5":     "Half-diminished — the ii chord in minor keys. Jazzy, unresolved tension.",
    "7b5":      "Dominant seven flat-five — tritone tension on both the fifth and seventh.",
    "maj7b5":   "Major seven flat-five — ethereal and unusual. Rarely used outside jazz.",
    "m7#5":     "Minor seven sharp-five — chromatic curiosity, very rare in practice.",
    "7sus2":    "Seven suspended two — open and unresolved. Modern jazz and pop.",
    "7sus4":    "Seven suspended four — gospel and funk staple. Delays the resolution.",
    "sus2sus4": "Double suspended — no third at all, maximum ambiguity.",
    "add9":     "Add nine — major triad plus the ninth, no seventh. Bright and full.",
    "add4":     "Add four — major triad with the fourth added. Open and Lydian-flavored.",
    "madd9":    "Minor add nine — minor triad plus ninth, no seventh. Melancholic and rich.",
    "madd4":    "Minor add four — minor triad with the fourth. Dark and heavy.",
    "9":        "Dominant ninth — full blues/jazz color. Funky when played on guitar.",
    "maj9":     "Major ninth — lush and sophisticated. Key sound in neo-soul and jazz.",
    "m9":       "Minor ninth — rich and melancholic. A go-to for smooth jazz and R&B.",
    "mmaj9":    "Minor-major ninth — tense and cinematic. Rare, highly expressive.",
    "9#5":      "Nine sharp-five — chromatic altered tension. Jazz improvisation color.",
    "9b5":      "Nine flat-five — tritone-heavy altered chord. Bebop and jazz fusion.",
    "9sus4":    "Nine suspended four — floating, unresolved. Common in modern production.",
    "7b9":      "Seven flat-nine — dark, Spanish-flavored tension. Flamenco and jazz.",
    "7#9":      "Seven sharp-nine — the 'Hendrix chord.' Rock and funk staple.",
    "7b5b9":    "Altered dominant — maximum tension, multiple chromatic alterations.",
    "7b5#9":    "Altered dominant — tritone and sharp-nine clash. Very tense.",
    "7#5b9":    "Altered dominant — augmented fifth meets flat-nine. Film score tension.",
    "7#5#9":    "Altered dominant — augmented fifth meets sharp-nine. Full alteration.",
    "maj11":    "Major eleventh — lush and orchestral. Rare on guitar.",
    "m11":      "Minor eleventh — Dorian mode in a chord. Modal jazz sound.",
    "7#11":     "Dominant seven sharp-eleven — Lydian dominant. Bright, tense, and modern.",
    "maj7#11":  "Major seven sharp-eleven — Lydian mode captured in one chord. Dreamy.",
    "maj9#11":  "Major nine sharp-eleven — full Lydian sound. Beautiful and complex.",
    "11b9":     "Eleven flat-nine — dark and tense extended chord. Advanced jazz.",
    "m11b5":    "Minor eleven flat-five — Locrian mode color. Very tense and rare.",
    "13":       "Dominant thirteenth — the richest dominant color. Full jazz orchestra sound.",
    "maj13":    "Major thirteenth — warm and complete. Jazz voicing royalty.",
    "m13":      "Minor thirteenth — rich and emotive. Dorian harmony at full extension.",
    "aug13":    "Augmented thirteenth — highly chromatic. Altered jazz tension.",
    "maj13#11": "Major thirteen sharp-eleven — Lydian color fully extended. Stunning.",
    "13#11":    "Dominant thirteen sharp-eleven — Lydian dominant at maximum extension.",
    "13sus4":   "Thirteen suspended four — gospel and jazz hybrid. Soulful and unresolved.",
    "13b9":     "Thirteen flat-nine — Spanish/Phrygian dominant flavor. Dark and rich.",
    "13#9":     "Thirteen sharp-nine — Hendrix-adjacent, fully extended. Funky and tense.",
    "13b9#11":  "Thirteen flat-nine sharp-eleven — the most altered dominant possible.",

    # Phase 5 Part 2/7 follow-up audit (see frontend/CHORD_INFO_AUDIT.md):
    # 39 real registry qualities had no entry here at all -- 4 of those were
    # actually already "covered" above under a dead parenthesized key
    # (e.g. "7(#5,#9)") that no real chord string is ever spelled as; those
    # were respelled in place to their real registry keys just above. These
    # are the remaining 35, written from each quality's real interval
    # content (checked directly against music_theory.QUALITY_INTERVALS/the
    # registry, not guessed from the name alone). 6 of the original 39
    # (7b9b13, dim7b13, m7b13, m7no5, susb9, plus 7#5 which isn't even a
    # registry quality) still can't actually be returned by
    # get_chord_info() today -- it bails before reaching this dict, since
    # music_theory.QUALITY_INTERVALS doesn't define their intervals at all.
    # Described anyway so the text is ready once that deeper gap is closed;
    # see the audit doc for why that fix is out of this pass's scope.
    "#9":         "Sharp-nine add — a major triad clashing against its own sharp ninth (the Hendrix-chord color), no seventh.",
    "11":         "Dominant eleventh — the full 9-11-b7 stack with the third left in, an unusually dense, clashing voicing.",
    "6add11":     "Sixth chord with an added eleventh — colors the mellow 6th sound with a fourth-degree tension.",
    "6sus2":      "Suspended-second sixth — open and ambiguous, combining the 6th's warmth with sus2's missing third.",
    "6sus4":      "Suspended-fourth sixth — combines sus4's unresolved pull with the 6th's mellow color.",
    "7add11":     "Dominant seventh with an added eleventh (no ninth) — a bluesy seventh colored by the fourth-degree tension.",
    "7add13":     "Dominant seventh with an added thirteenth (no ninth/eleventh) — the guide-tone partner of a full dominant 13, voiced leaner.",
    "7b13":       "Dominant seventh with a flat thirteenth — the guide-tone partner of an augmented seventh (aug7), spelled by the extended-chord convention instead of the altered-triad one.",
    "7b9b13":     "Altered dominant with a flat ninth and flat thirteenth — dark, Spanish/Phrygian-tinged tension stacked on the dominant seventh.",
    "9#11":       "Dominant nine sharp-eleven — Lydian-dominant color with the ninth added, bright and modern.",
    "9add13":     "Dominant nine with an added thirteenth (no eleventh) — the guide-tone partner of a full dominant 13 chord.",
    "9b13":       "Dominant nine flat-thirteen — the ninth's color stacked on a dark, altered flat-thirteen.",
    "add#11":     "Major triad with an added sharp eleventh — a bright Lydian color with no seventh at all.",
    "add4add9":   "Major triad with both a ninth and a fourth added — a dense, open cluster color, no seventh.",
    "add9#11":    "Major triad with an added ninth and sharp eleventh — bright Lydian shimmer without a seventh.",
    "addb13":     "Major triad with an added flat thirteenth — a major chord colored by a dark, out-of-key sixth-degree tension.",
    "b9":         "Major triad with an added flat ninth (no seventh) — a jarring, dissonant splash rarely used outside modern/experimental voicings.",
    "dim7b13":    "Diminished triad with an added flat thirteenth — an unusual, highly dissonant tension chord, rare in real voicings.",
    "m7add11":    "Minor seventh with an added eleventh (no ninth) — a leaner version of a full minor eleventh chord.",
    "m7add13":    "Minor seventh with an added thirteenth (no ninth/eleventh) — the guide-tone partner of a full minor 13 chord.",
    "m7b13":      "Minor seventh with a flat thirteenth — an unusual altered color rarely seen outside advanced jazz voicings.",
    "m7no5":      "Minor seventh with the fifth omitted — a lean three-note voicing built purely from the minor seventh's guide tones.",
    "m9#5":       "Minor nine sharp-five — a rare, chromatic minor chord blending the ninth's color with an augmented fifth.",
    "maj7#9":     "Major seventh sharp-nine — an unusual, dense pairing of the major seventh's sophistication with the sharp ninth's bite.",
    "maj7add11":  "Major seventh with an added eleventh (no ninth) — colors the smooth major-seventh sound with a fourth-degree tension.",
    "maj7add13":  "Major seventh with an added thirteenth (no ninth/eleventh) — the guide-tone partner of a full major 13 chord.",
    "maj7sus2":   "Major seventh suspended second — replaces the third with the ninth, open and modern.",
    "maj7sus4":   "Major seventh suspended fourth — the smooth major-seventh color left hanging on an unresolved fourth.",
    "maj9add13":  "Major nine with an added thirteenth (no eleventh) — the guide-tone partner of a full major 13 chord.",
    "mb6":        "Minor flat-six triad — a minor chord colored by a lowered sixth degree, a classic melodic-minor-scale sound.",
    "mb9":        "Minor flat-nine — a rare, dissonant minor triad clashing against a flat ninth.",
    "mmaj13":     "Minor-major thirteenth — the fullest extension of the minor-major seventh sound, cinematic and complex.",
    "sus2add#11": "Suspended second with an added sharp eleventh — open, Lydian-tinged ambiguity with no third at all.",
    "susb9":      "Suspended fourth with a flat ninth — an unusual, dissonant suspended color.",
    "7no3":       "Dominant seventh with the third omitted — an ambiguous, power-chord-like voicing built from just the root, fifth, and flat seventh.",
}



# Display intervals - full theoretical note sets for educational display
# These override QUALITY_INTERVALS which uses minimal sets for CNN detection.

# 11th chords include the 9th (interval 2) even when omitted in practice.
# 13th chords include the 9th (2) and 11th (5) even when omitted in practice.
# The CNN deliberately omits these for recognition, this is display only

DISPLAY_INTERVALS = {
    # 11th chords - add 9th (interval 2)
    "maj11":    [0, 2, 4, 5, 7, 11],
    "m11":      [0, 2, 3, 5, 7, 10],
    "7#11":     [0, 2, 4, 6, 7, 10],
    "maj7#11":  [0, 2, 4, 6, 7, 11],
    "maj9#11":  [0, 2, 4, 6, 7, 11],
    "m11b5":    [0, 2, 3, 5, 6, 10],

    # 13th chords - add 9th (2) and 11th (5)
    "13":       [0, 2, 4, 5, 7, 9, 10],
    "maj13":    [0, 2, 4, 5, 7, 9, 11],
    "m13":      [0, 2, 3, 5, 7, 9, 10],
    "aug13":    [0, 2, 4, 5, 8, 9, 10],
    "maj13#11": [0, 2, 4, 6, 7, 9, 11],
    "13#11":    [0, 2, 4, 6, 7, 9, 10],
    "13b9":     [0, 1, 4, 5, 7, 9, 10],
    "13sus4":   [0, 2, 5, 7, 9, 10],
    "13#9":     [0, 3, 4, 7, 9, 10],
    "13b9#11":  [0, 1, 4, 6, 9, 10],
}

# Related chord logic
def _relative_minor(root_idx):
    # Relative minor is a minor sixth (9 semitones) up from the major root
    return CHROMATIC[(root_idx + 9) % 12] + "m"

def _relative_major(root_idx):
    # Relative major is a minor third (3 semitones) up from the minor root
    return CHROMATIC[(root_idx + 3) % 12]

def _parallel(root_name, quality):
    # Swap major ↔ minor (same root, opposite quality)
    if quality == "":
        return root_name + "m"
    if quality == "m":
        return root_name

def _tritone_sub(root_idx):
    # Tritone substitution: dominant chord a tritone (6 semitones) away
    return CHROMATIC[(root_idx + 6) % 12] + "7"

def _dominant(root_idx):
    # The V7 chord — a perfect fifth above the root
    return CHROMATIC[(root_idx + 7) % 12] + "7"

def _subdominant(root_idx, quality):
    # The IV chord — a perfect fourth above the root
    q = "m" if "m" in quality and quality not in ("mmaj7", "mmaj9", "m7b5") else ""
    return CHROMATIC[(root_idx + 5) % 12] + q

def get_related_chords(root_name, quality, root_idx):
    related = {}

    # Relative major/minor
    if quality == "":
        related["Relative minor"] = _relative_minor(root_idx)
    elif quality in ("m", "m7", "m9", "m11", "m13"):
        related["Relative major"] = _relative_major(root_idx)

    # Parallel
    p = _parallel(root_name, quality)
    if p:
        label = "Parallel minor" if quality == "" else "Parallel major"
        related[label] = p

    # Tritone substitution for dominant chords
    if quality in ("7", "9", "13", "7b9", "7#9", "7sus4", "7sus2",
                   "7b5", "7#11", "13b9", "13#9", "13#11"):
        related["Tritone sub"] = _tritone_sub(root_idx)

    # V7 of this chord (what resolves to it)
    related["Resolves from (V7)"] = _dominant(root_idx)

    # Add the simpler version if this is an extended chord
    if quality in ("m7", "m9", "m11", "m13"):
        related["Simpler version"] = root_name + "m"
    elif quality in ("maj7", "maj9", "maj11", "maj13"):
        related["Simpler version"] = root_name
    elif quality in ("7", "9", "11", "13", "7b9", "7#9"):
        related["Simpler version"] = root_name

    return related


# ---------------------------------------------------------------------------
# Quality-synonym "why" explanations (Phase 5 Part 2/7 follow-up, Task 3b)
# ---------------------------------------------------------------------------
# Investigated EVERY real quality-alt-spelling pair the registry actually
# produces before writing any of this (36 total, via api.py's
# _quality_alt_spellings() run against all 95 registry qualities) --
# real findings, not assumed:
#   - 4 pairs ("#9"/"(#9)", "b9"/"(b9)", "add#11"/"(add#11)", "7no3"/
#     "7(no3)") are NOT real spelling differences at all -- identical once
#     parens are stripped (format_chord() wraps bare-leading-accidental
#     qualities in parens purely for round-trip parsing safety, per
#     CLAUDE.md's core parser rule -- never a real alternate name).
#   - 4 pairs are real, confirmed PARSER ARTIFACTS, not intentional
#     notation: e.g. "C+7"/"Faddb6"/"GM#7" all resolve to a plain major
#     triad only because their "+7"/"addb6"/"#7" tokens aren't in any
#     alteration/add table this engine recognizes, so they're silently
#     dropped rather than applied -- confirmed by inspecting each raw
#     parsed structure directly (parse_chord("C+7")["quality"] shows
#     alterations={"+7"}, a token compute_intervals never acts on), not
#     assumed from the resolved quality name alone. Similarly "F#m7-11"
#     resolving to "7#9"'s interval set turned out to be an
#     interval_calculator quirk around an unsupported "b11" alteration,
#     not real "m7b11 == 7#9" notation.
#   - 2 pairs ("13sus4"/"13sus", "6sus2"/"sus2add13") are excluded on
#     purpose: "13sus" is the SAME bare-"sus"-defaults-to-sus4 ambiguity
#     Task 4's `_ambiguity_note()` already owns (see songs.py) -- listing
#     it here too as if it were a clean, symmetric "these mean the same
#     thing" fact would contradict that mechanism's own framing (there's
#     no real "sus4 is also called sus", it's shorthand that only ever
#     meant one thing once resolved). "sus2add13" would need a genuinely
#     different (word-reordering) explanation than any rule below
#     produces cleanly, so it's left out rather than forced.
#   - 1 pair ("m7"/"m7+9") is a real, subtle music-theory edge case, not
#     an artifact: a `#9`/`+9` alteration collapses onto the SAME semitone
#     an m7's own minor 3rd already occupies (enharmonically identical
#     pitch classes), so the raw interval SET is technically unchanged --
#     but a plain "m7" and an "m7#9" are still understood as two
#     deliberately different chord choices in practice, not "the same
#     chord, different name" the way aug7/7#5 genuinely are. Forcing a
#     "why" here would overclaim a real synonymy that isn't really there.
#
# The 32 remaining pairs DO have a clean, honest one-line reason, and
# fall into a small number of real, recurring PATTERNS (not one hardcoded
# reason per pair) -- stored as structured data/rules here, applied by
# api.py's /chord-info enrichment, so the frontend never hardcodes
# per-instance strings (per the task's explicit instruction).

_SYNONYM_REASON_TEXT = {
    "aug_sharp5": "`aug` means a raised 5th, exactly what `#5` specifies",
    "dim_flat5": "`dim` means a minor 3rd and flat 5th, exactly what `mb5` spells out",
    "b6_sharp5": "`b6` and `#5` land on the same altered tone, just named from two different reference points",
    "symbol": "`+`/`#` and `-`/`b` are two common symbols for the same alteration",
    "octave": "the two numbers name the same pitch class an octave apart (e.g. a 9th and a 2nd, or a 13th and a 6th, are the same note)",
    "shorthand": "the shorter name is shorthand for the longer one -- both add the identical extra tone",
    "m_shorthand": "`M` is shorthand for `maj` -- both mean the same major-quality extension",
}

# A small, explicit set for relationships that are real but too specific
# (or too few in number, 1-3 each) to generalize into a regex rule without
# it becoming harder to verify than just listing them -- verified against
# the real registry data above, not guessed.
_EXPLICIT_SYNONYM_REASONS = {
    ("aug", "+"): "aug_sharp5",
    ("aug7", "7#5"): "aug_sharp5",
    ("augmaj7", "maj7#5"): "aug_sharp5",
    ("dim", "mb5"): "dim_flat5",
    ("mb6", "m#5"): "b6_sharp5",
    ("6", "add6"): "shorthand",
    ("6", "add13"): "octave",
    ("m6", "madd6"): "shorthand",
    ("m6", "madd13"): "octave",
    ("6/9", "6add9"): "shorthand",
    ("m6/9", "m6add9"): "shorthand",
    ("m9", "m7add9"): "shorthand",
}

# Octave-equivalent extension-number pairs (a 9th and a 2nd, an 11th and a
# 4th, a 13th and a 6th, are literally the same pitch class) -- a real,
# general rule, not a per-pair memorization, since it applies identically
# regardless of what quality/prefix the "addN" is attached to.
_OCTAVE_EQUIVALENT_DEGREES = [("9", "2"), ("11", "4"), ("13", "6")]


def _strip_parens(s):
    return s.replace("(", "").replace(")", "")


def _octave_equivalent_add(a, b):
    match_a = re.fullmatch(r"(.*add)(\d+)", a)
    match_b = re.fullmatch(r"(.*add)(\d+)", b)
    if not match_a or not match_b or match_a.group(1) != match_b.group(1):
        return False
    degrees = {match_a.group(2), match_b.group(2)}
    return any(degrees == {x, y} for x, y in _OCTAVE_EQUIVALENT_DEGREES)


def _symbol_variant(a, b):
    """'+' <-> '#' and '-' <-> 'b' (the flat symbol, only immediately
    before a digit -- never a root/bass letter) are two notation
    traditions for the identical alteration."""

    def normalize(s):
        s = s.replace("#", "+")
        return re.sub(r"b(?=\d)", "-", s)

    return normalize(a) == normalize(b)


def explain_quality_synonym(canonical_quality, alt_spelling):
    """Returns a short, honest, beginner-friendly reason the two quality
    spellings describe identical notes, or None when there ISN'T a clean
    one-liner (a real parser artifact, an ambiguous-shorthand duplicate of
    Task 4's own note, or a genuine music-theory edge case that would
    overclaim a synonymy that isn't really there -- see the real
    investigation notes above). None means: exclude this pair from
    Similar Chords entirely, don't force an explanation onto it."""
    c, a = _strip_parens(canonical_quality), _strip_parens(alt_spelling)
    if c == a:
        return None  # pure formatting difference, not a real alt spelling at all
    if (c, a) in _EXPLICIT_SYNONYM_REASONS:
        return _SYNONYM_REASON_TEXT[_EXPLICIT_SYNONYM_REASONS[(c, a)]]
    if "maj" in c and a == c.replace("maj", "M"):
        return _SYNONYM_REASON_TEXT["m_shorthand"]
    if _octave_equivalent_add(c, a):
        return _SYNONYM_REASON_TEXT["octave"]
    if _symbol_variant(c, a):
        return _SYNONYM_REASON_TEXT["symbol"]
    return None


# Main public function

def get_chord_info(chord_name):
    # Given a chord name string, returns a dict with normnalized chord name, root note name, quality, intervals, description, and related chords
 
    chord_name = normalize(chord_name)

    # Delegate root/quality/bass splitting to chord_parser.py's real parser
    # instead of naive character slicing -- that naive approach treated
    # ANY "/" in the quality portion as a slash-bass separator, which
    # silently mis-parsed "A6/9" (a real quality using "/" as PART of its
    # own conventional notation, not a bass separator) into root=A,
    # quality="6", slash_bass="9" -- a nonsense "bass note" that doesn't
    # even exist, confirmed via real testing.
    parsed = cp.parse_chord(chord_name)
    if not parsed["parsed"]:
        return None

    root = parsed["root"]
    bass = parsed["bass"]

    # Quality string = whatever's left after the root, minus a genuine
    # trailing "/bass" if chord_parser actually found one (not stripped
    # naively -- chord_parser already correctly distinguishes a real
    # slash-bass from quality notation that happens to contain a slash).
    remainder = chord_name[len(root):]
    if bass and remainder.endswith("/" + bass):
        quality = remainder[: -(len(bass) + 1)]
        slash_bass = bass
    else:
        quality = remainder
        slash_bass = None

    data = QUALITY_INTERVALS.get(quality)
    if data is None:
        return None

    root_idx = CHROMATIC.index(root)
    intervals_list = []

    # Use full theoretical intervals for display if available
    # Falls back to QUALITY_INTERVALS which uses minimal sets for CNN detection
    display_notes = DISPLAY_INTERVALS.get(quality, data["notes"])

    # Sort by musical convention order: R, 3rd, 5th, 7th, 9th, 11th, 13th
    # Maps each semitone interval to a display position index
    _DISPLAY_ORDER = {0: 0, 4: 1, 3: 1, 7: 2, 6: 2, 8: 2, 11: 3, 10: 3, 2: 4, 1: 4, 5: 5, 9: 6}
    display_notes = sorted(display_notes, key=lambda s: _DISPLAY_ORDER.get(s, 99))

    for semitones in display_notes:
        # Correctly spelled note name for this root context
        note_name = spell_note(root, semitones, quality)

        # Label: check for quality-specific override first
        override_map = INTERVAL_LABEL_OVERRIDES.get(semitones, {})
        if quality in override_map:
            short, full = override_map[quality]
        else:
            short, full = INTERVAL_NAMES.get(semitones, (str(semitones), ""))

        intervals_list.append({
            "note":      note_name,
            "semitones": semitones,
            "short":     short,
            "full":      full,
            "display":   f"{short} ({full})",
        })

    description = QUALITY_DESCRIPTIONS.get(quality, "Extended or altered chord.")

    related = get_related_chords(root, quality, root_idx)

    # Build display chord name
    display_chord = root + quality
    if slash_bass:
        display_chord += "/" + slash_bass

    return {
        "chord":       display_chord,
        "root":        root,
        "quality":     quality,
        "slash_bass":  slash_bass,
        "intervals":   intervals_list,
        "description": description,
        "related":     related,
    }


# Testing
if __name__ == "__main__":

    TEST_CHORDS = [
        "C",
        "Am",
        "G7",
        "Dm7",
        "Fmaj7",
        "D9",
        "F#maj9",
        "Dm7b5",
        "Bb13",
        "E7#9",       # Hendrix chord
        "Ab/C",       # slash chord
        "Bm11",
        "Csus4",
        "A#m7",          # enharmonic — should normalize to Bbm7
        "Csus2"            
    ]

    print("=" * 65)
    print("  CHORD_INFO — TEST OUTPUT")
    print("=" * 65)

    for chord in TEST_CHORDS:
        info = get_chord_info(chord)
        if info is None:
            print(f"\n  [!] Could not parse: {chord}")
            continue

        print(f"\n  {info['chord']}")
        print(f"  {'─' * 40}")
        print(f"  {info['description']}")
        print()

        # Interval spelling
        spacing = max(len(i["note"]) for i in info["intervals"]) + 1
        for iv in info["intervals"]:
            marker = " ← root" if iv["semitones"] == 0 else ""
            print(f"    {iv['note']:<{spacing}} = {iv['display']}{marker}")

        if info["slash_bass"]:
            print(f"    Bass note: {info['slash_bass']}")

        if info["related"]:
            print()
            print("  Related chords:")
            for label, rel_chord in info["related"].items():
                print(f"    {label:<30} {rel_chord}")

    print()
    print("=" * 65)