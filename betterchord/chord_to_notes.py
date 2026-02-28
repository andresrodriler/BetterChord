
# Converts a chord name to a 12-element binary vector where each position
# represents a note in the chromatic scale:
# Index: [0,   1,   2,  3,   4,  5,  6,   7,  8,   9,  10,  11]
# Note:  [C,  C#,   D, Eb,   E,  F, F#,   G, Ab,   A,  Bb,   B]


# The chromatic scale
CHROMATIC = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# Converts non-standard names to my chromatic convention:
# A#/D#/G# → Bb/Eb/Ab (sharp to flat)
# Gb/Db    → F#/C#    (flat to sharp, since F# and C# are more common in guitar)
# Might change this later, not entirely sure though

# This is for current chords we have in data, will need updating if decide to import more
ENHARMONIC_MAP = {
    "A#": "Bb", "A#m": "Bbm", "A#5": "Bb5", "A#7": "Bb7",
    "A#m7": "Bbm7", "A#m7b5": "Bbm7b5", "A#maj7": "Bbmaj7",

    "D#": "Eb", "D#m": "Ebm", "D#5": "Eb5", "D#7": "Eb7",
    "D#m7": "Ebm7", "D#m7b5": "Ebm7b5", "D#maj7": "Ebmaj7",

    "G#": "Ab", "G#m": "Abm", "G#5": "Ab5", "G#7": "Ab7",
    "G#m7": "Abm7", "G#m7b5": "Abm7b5", "G#maj7": "Abmaj7",

    "Gb": "F#", "Gbm": "F#m", "Gb5": "F#5", "Gb7": "F#7",
    "Gbm7": "F#m7", "Gbm7b5": "F#m7b5", "Gbmaj7": "F#maj7",

    "Db": "C#", "Dbm": "C#m", "Db5": "C#5", "Db7": "C#7",
    "Dbm7": "C#m7", "Dbm7b5": "C#m7b5", "Dbmaj7": "C#maj7",
}

# dictionary of chord types, keys values are type of chord, list assocaited is notes used in it
QUALITY_INTERVALS = {
    "":     [0, 4, 7],        # major       e.g. C  → C E G
    "m":    [0, 3, 7],        # minor       e.g. Cm → C Eb G
    "maj7": [0, 4, 7, 11],    # major 7     e.g. Cmaj7 → C E G B
    "m7":   [0, 3, 7, 10],    # minor 7     e.g. Cm7 → C Eb G Bb
    "7":    [0, 4, 7, 10],    # dominant 7  e.g. C7 → C E G Bb
    "5":    [0, 7],           # power chord e.g. C5 → C G
    "m7b5": [0, 3, 6, 10],    # half dim    e.g. Cm7b5 → C Eb Gb Bb
    "dim":  [0, 3, 6],        # diminished  e.g. Cdim → C Eb Gb
}


def normalize(chord):
    # Apply enharmonic normalization e.g. A# → Bb, Gb → F#
    return ENHARMONIC_MAP.get(chord, chord)


def parse_chord(chord):
    # Split chord name into (root, quality) Handles 1-char roots (C, D, E, F, G, A, B) and 2-char roots (C#, Bb, Eb, Ab, F#). Returns (None, None) if unrecognized. Also something that might need updating if new chord classes within db

    if not chord:
        return None, None

    if len(chord) >= 2 and chord[1] in ("#", "b"):
        root, quality = chord[:2], chord[2:]
    else:
        root, quality = chord[0], chord[1:]

    if root not in CHROMATIC:
        return None, None

    return root, quality


def chord_to_binary(chord_name):

    # Convert a chord name to a 12-element binary vector

    # Returns:
        # list: 12-element binary vector e.g. [1,0,0,1,0,0,0,1,0,0,0,0]
        # None: if chord name is unrecognized

    chord_name = normalize(chord_name)
    root, quality = parse_chord(chord_name)

    if root is None:
        print(f"  [!] Could not parse chord: '{chord_name}'")
        return None

    intervals = QUALITY_INTERVALS.get(quality)
    if intervals is None:
        print(f"  [!] Unknown chord quality: '{quality}' in '{chord_name}'")
        return None

    root_idx = CHROMATIC.index(root)
    vector   = [0] * 12
    for interval in intervals:
        vector[(root_idx + interval) % 12] = 1

    return vector


def chord_to_notes(chord_name):

    # Returns the actual note names for a chord instead of binary vector just in case

    vector = chord_to_binary(chord_name)
    if vector is None:
        return None
    return [CHROMATIC[i] for i, v in enumerate(vector) if v == 1]

