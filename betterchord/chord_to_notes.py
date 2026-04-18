
# Converts a chord name to a 12-element binary vector where each position

# The chromatic scale
CHROMATIC = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# Converts non-standard names to my chromatic convention:
# A#/D#/G# → Bb/Eb/Ab (sharp to flat)
# Gb/Db    → F#/C#    (flat to sharp, since F# and C# are more common in guitar)

# Normalizes non-standard root names to our chromatic convention
ROOT_ENHARMONIC_MAP = {
    "A#": "Bb",
    "D#": "Eb",
    "G#": "Ab",
    "Gb": "F#",
    "Db": "C#",
}

# dictionary of chord types, keys values are type of chord, list associated is notes used in it
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


def normalize(chord_name):
    # Apply enharmonic normalization to a chord name.
    # Works by parsing the root, normalizing it, then recombining with quality.

    if not chord_name:
        return chord_name
 
    # Extract root - check 2-char roots first to avoid Eb being parsed as E
    if len(chord_name) >= 2 and chord_name[1] in ("#", "b"):
        root    = chord_name[:2]
        quality = chord_name[2:]
    else:
        root    = chord_name[0]
        quality = chord_name[1:]
 
    # Normalize root if needed
    normalized_root = ROOT_ENHARMONIC_MAP.get(root, root)
 
    return normalized_root + quality


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

