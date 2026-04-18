
# Identifies a chord name from athe CNN 12-element note probability vector, root index, and bass index.

# Uses a kind of two layer identify system:
    # Layer 1 - rule-based algorithm (fast, free, offline)
    # Layer 2 - claude API fallback (when rule-based is uncertain, plus I want to get experience with this)

# Exact rule for when claude comes is:
    # - No exact rule-based match found (method == "weighted")
    # - Confidence below CLAUDE_CONFIDENCE_THRESHOLD (0.75 for rn)
    # - Root/note contradiction (predicted root not in detected notes)

# If Claude API fails for any reason (rate limit, expired credits, no internet, idk), falls back to rule-based result.

# Chromatic scale (index 0-11): [C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B]

import os
import json
import numpy as np

# CHROMATIC SCALE
CHROMATIC = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# NOTE DETECTION THRESHOLD 
THRESHOLD = 0.5

# CLAUDE API CONFIG
# Confidence below this triggers Claude fallback
CLAUDE_CONFIDENCE_THRESHOLD = 0.75

# Claude model to use, will swap to claude-sonnet-4-6 if Haiku sucks
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

# CHORD QUALITY INTERVALS
# All intervals are mod 12 (octave reduced)
# For 13th chords: "notes" = essential notes for matching, "full" = all theoretical notes

# Aliases (same interval set, both names returned on match, will need to update this with more matching chord classes since theres a lot of overlap naming conventions):
#   aug7    == 7#5     → [0, 4, 8, 10]
#   augmaj7 == maj7#5  → [0, 4, 8, 11]
#   m6/9    == m6add9  → [0, 2, 3, 7, 9]

QUALITY_INTERVALS = {

    # Triads
    # "notes" = full interval set, "required" = must be present, rest are optional
    "":         {"notes": [0, 4, 7],           "required": [0, 4]},
    "m":        {"notes": [0, 3, 7],           "required": [0, 3]},
    "aug":      {"notes": [0, 4, 8],           "required": [0, 4, 8]},       # #5 defines aug
    "dim":      {"notes": [0, 3, 6],           "required": [0, 3, 6]},       # b5 defines dim
    "sus2":     {"notes": [0, 2, 7],           "required": [0, 2]},
    "sus4":     {"notes": [0, 5, 7],           "required": [0, 5]},
    "5":        {"notes": [0, 7],              "required": [0, 7]},           # only 2 notes
    "-5":       {"notes": [0, 4, 6],           "required": [0, 4, 6]},       # b5 defines it

    # 6th chords
    "6":        {"notes": [0, 4, 7, 9],        "required": [0, 4, 9]},
    "m6":       {"notes": [0, 3, 7, 9],        "required": [0, 3, 9]},
    "6/9":      {"notes": [0, 2, 4, 7, 9],     "required": [0, 2, 4, 9],    "aliases": ["m6add9"]},
    "m6/9":     {"notes": [0, 2, 3, 7, 9],     "required": [0, 2, 3, 9],    "aliases": ["m6add9"]},

    # 7th chords
    "maj7":     {"notes": [0, 4, 7, 11],       "required": [0, 4, 11]},
    "m7":       {"notes": [0, 3, 7, 10],       "required": [0, 3, 10]},
    "7":        {"notes": [0, 4, 7, 10],       "required": [0, 4, 10]},
    "mmaj7":    {"notes": [0, 3, 7, 11],       "required": [0, 3, 11]},
    "aug7":     {"notes": [0, 4, 8, 10],       "required": [0, 4, 8, 10],   "aliases": ["7#5"]},
    "augmaj7":  {"notes": [0, 4, 8, 11],       "required": [0, 4, 8, 11],   "aliases": ["maj7#5"]},
    "dim7":     {"notes": [0, 3, 6, 9],        "required": [0, 3, 6, 9]},   # all define dim7
    "m7b5":     {"notes": [0, 3, 6, 10],       "required": [0, 3, 6, 10]},  # b5 defines it
    "7b5":      {"notes": [0, 4, 6, 10],       "required": [0, 4, 6, 10]},  # b5 defines it
    "maj7b5":   {"notes": [0, 4, 6, 11],       "required": [0, 4, 6, 11]},  # b5 defines it
    "m7#5":     {"notes": [0, 3, 8, 10],       "required": [0, 3, 8, 10]},  # #5 defines it
    "7sus2":    {"notes": [0, 2, 7, 10],       "required": [0, 2, 10]},
    "7sus4":    {"notes": [0, 5, 7, 10],       "required": [0, 5, 10]},
    "sus2sus4": {"notes": [0, 2, 5, 7],        "required": [0, 2, 5]},

    # Add chords
    "add9":     {"notes": [0, 2, 4, 7],        "required": [0, 2, 4]},
    "add4":     {"notes": [0, 4, 5, 7],        "required": [0, 4, 5]},
    "madd9":    {"notes": [0, 2, 3, 7],        "required": [0, 2, 3]},
    "madd4":    {"notes": [0, 3, 5, 7],        "required": [0, 3, 5]},

    # 9th chords
    "9":        {"notes": [0, 2, 4, 7, 10],    "required": [0, 2, 4, 10]},
    "maj9":     {"notes": [0, 2, 4, 7, 11],    "required": [0, 2, 4, 11]},
    "m9":       {"notes": [0, 2, 3, 7, 10],    "required": [0, 2, 3, 10]},
    "mmaj9":    {"notes": [0, 2, 3, 7, 11],    "required": [0, 2, 3, 11]},
    "9#5":      {"notes": [0, 2, 4, 8, 10],    "required": [0, 2, 4, 8, 10]},  # #5 defines it
    "9b5":      {"notes": [0, 2, 4, 6, 10],    "required": [0, 2, 4, 6, 10]},  # b5 defines it
    "9sus4":    {"notes": [0, 2, 5, 7, 10],    "required": [0, 2, 5, 10],      "aliases": ["11"]},
    "7b9":      {"notes": [0, 1, 4, 7, 10],    "required": [0, 1, 4, 10]},     # b9 defines it, 5th optional
    "7#9":      {"notes": [0, 3, 4, 7, 10],    "required": [0, 3, 4, 10]},     # #9 defines it, 5th optional
    "7(b5,b9)": {"notes": [0, 1, 4, 6, 10],    "required": [0, 1, 4, 6, 10]},  # all alterations required
    "7(b5,#9)": {"notes": [0, 3, 4, 6, 10],    "required": [0, 3, 4, 6, 10]},
    "7(#5,b9)": {"notes": [0, 1, 4, 8, 10],    "required": [0, 1, 4, 8, 10],   "aliases": ["7alt"]},
    "7(#5,#9)": {"notes": [0, 3, 4, 8, 10],    "required": [0, 3, 4, 8, 10]},

    # 11th chords
    "maj11":    {"notes": [0, 4, 5, 7, 11],    "required": [0, 4, 5, 11]},     # 5th+9th optional
    "m11":      {"notes": [0, 3, 5, 7, 10],    "required": [0, 3, 5, 10]},     # 5th+9th optional
    "maj9#11":  {"notes": [0, 2, 4, 6, 7, 11], "required": [0, 4, 6, 11]},     # 5th+9th optional
    "11b9":     {"notes": [0, 1, 4, 5, 7, 10], "required": [0, 1, 4, 5, 10]},  # 5th optional
    "7#11":     {"notes": [0, 4, 6, 7, 10],    "required": [0, 4, 6, 10]},     # 5th optional
    "maj7#11":  {"notes": [0, 4, 6, 7, 11],    "required": [0, 4, 6, 11]},     # 5th optional
    "m11b5":    {"notes": [0, 2, 3, 5, 6, 10], "required": [0, 3, 5, 6, 10]},  # 9th optional

    # 13th chords - essential notes used for matching, full notes for reference
    "13":       {"notes": [0, 4, 9, 10],       "required": [0, 4, 9, 10],      "full": [0, 2, 4, 5, 7, 9, 10]},
    "maj13":    {"notes": [0, 4, 9, 11],       "required": [0, 4, 9, 11],      "full": [0, 2, 4, 5, 7, 9, 11]},
    "m13":      {"notes": [0, 3, 9, 10],       "required": [0, 3, 9, 10],      "full": [0, 2, 3, 5, 7, 9, 10]},
    "aug13":    {"notes": [0, 4, 8, 9, 10],    "required": [0, 4, 8, 9, 10],   "full": [0, 2, 4, 5, 8, 9, 10]},
    "maj13#11": {"notes": [0, 4, 6, 9, 11],    "required": [0, 4, 6, 9, 11],   "full": [0, 2, 4, 6, 7, 9, 11]},
    "13#11":    {"notes": [0, 4, 6, 9, 10],    "required": [0, 4, 6, 9, 10],   "full": [0, 2, 4, 6, 7, 9, 10]},
    "13b9":     {"notes": [0, 1, 4, 9, 10],    "required": [0, 1, 4, 9, 10],   "full": [0, 1, 4, 5, 7, 9, 10]},
    "13sus4":   {"notes": [0, 5, 9, 10],       "required": [0, 5, 9, 10],      "full": [0, 2, 5, 7, 9, 10]},
    "13#9":     {"notes": [0, 3, 4, 9, 10],    "required": [0, 3, 4, 9, 10],   "full": [0, 3, 4, 7, 9, 10]},
    "13b9#11":  {"notes": [0, 1, 4, 6, 9, 10], "required": [0, 1, 4, 6, 9, 10],"full": [0, 1, 4, 6, 9, 10]},
}

# ALIAS LOOKUP
# Built automatically from QUALITY_INTERVALS aliases fields
# Maps quality → list of alternate names to include in output
ALIASES = {
    quality: data["aliases"]
    for quality, data in QUALITY_INTERVALS.items()
    if "aliases" in data
}

# ENHARMONIC MAP
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


def normalize(chord):
    return ENHARMONIC_MAP.get(chord, chord)


def get_active_intervals(note_vector, root_idx):
    # So this converts a binary note vector and root index into a set of intervals relative to the output root.
    # Example is note_vector = [1,0,0,0,1,0,0,1,0,1,0,0], root_idx = 9 (A)
         # A=9, C=0, E=4, G=7
         # intervals = (0-9)%12=3, (4-9)%12=7, (7-9)%12=10, (9-9)%12=0
         # returns {0, 3, 7, 10} = Am7 

    active = set()
    for note_idx, val in enumerate(note_vector):
        if val == 1:
            interval = (note_idx - root_idx) % 12
            active.add(interval)
    return active


def score_quality(active_intervals, quality, note_probs, root_idx):
    # This makes a probability weighted match score for a chord quality.

    # For each note in the quality's interval set:
      # - Add the probability of that note being active (reward)
    # For each note NOT in the quality's interval set:
      # - Add (1 - probability) of that note being inactive (reward for correct silence)

    # Higher score = better match.
    # Score is normalized to 0-1 range.

    quality_notes = set(QUALITY_INTERVALS[quality]["notes"])

    score = 0.0
    for note_idx in range(12):
        interval = (note_idx - root_idx) % 12
        prob     = note_probs[note_idx]
        if interval in quality_notes:
            score += prob           # reward for active note being present
        else:
            score += (1.0 - prob)  # reward for inactive note being absent

    return score / 12.0             # normalize to 0-1


def identify_chord(note_probs, root_idx, threshold=THRESHOLD):
  
    # Layer 1 - Rule-based chord identification.

    note_probs = np.array(note_probs, dtype=float)

    # Step 1 - binary note vector from threshold
    note_vector      = (note_probs >= threshold).astype(int)
    active_notes     = [CHROMATIC[i] for i, v in enumerate(note_vector) if v == 1]
    root_name        = CHROMATIC[root_idx]
    active_intervals = get_active_intervals(note_vector, root_idx)

    # Step 2 - try required-note match
    # A chord matches if:
    #   - all required notes are present in active_intervals
    #   - no active notes fall outside the full note set (no wrong notes)
    # This handles omitted optional notes (like the 5th)
    exact_matches = []

    for quality, data in QUALITY_INTERVALS.items():
        required_set = set(data["required"])
        full_set     = set(data["notes"])

        # All required notes must be present
        if not required_set.issubset(active_intervals):
            continue

        # No active note should be outside the full note set (no wrong notes)
        if not active_intervals.issubset(full_set):
            continue

        exact_matches.append(quality)

    if exact_matches:
        # If multiple matches pick the most specific one (most required notes)
        best_quality = max(exact_matches, key=lambda q: len(QUALITY_INTERVALS[q]["required"]))
        chord_name   = normalize(root_name + best_quality)
        alias_names  = [normalize(root_name + a) for a in ALIASES.get(best_quality, [])]
        all_names    = [chord_name] + alias_names
        display_name = " / ".join(all_names)

        # Determine method - exact if all notes present, partial if some optional omitted
        full_set = set(QUALITY_INTERVALS[best_quality]["notes"])
        method   = "exact" if active_intervals == full_set else "partial"

        return {
            "chord":      display_name,
            "root":       root_name,
            "quality":    best_quality,
            "aliases":    alias_names,
            "confidence": 1.0 if method == "exact" else 0.9,
            "method":     method,
            "notes":      active_notes,
            "candidates": [(display_name, 1.0)],
        }

    # Step 3 - no exact match, use probability weighted scoring
    scores = []
    for quality in QUALITY_INTERVALS:
        s = score_quality(active_intervals, quality, note_probs, root_idx)
        scores.append((quality, s))

    scores.sort(key=lambda x: x[1], reverse=True)

    best_quality = scores[0][0]
    best_score   = scores[0][1]
    chord_name   = normalize(root_name + best_quality)
    alias_names  = [normalize(root_name + a) for a in ALIASES.get(best_quality, [])]
    all_names    = [chord_name] + alias_names
    display_name = " / ".join(all_names)

    # Top 3 candidates for debugging
    candidates = [
        (normalize(root_name + q), round(s, 4))
        for q, s in scores[:3]
    ]

    return {
        "chord":      display_name,
        "root":       root_name,
        "quality":    best_quality,
        "aliases":    alias_names,
        "confidence": round(best_score, 4),
        "method":     "weighted",
        "notes":      active_notes,
        "candidates": candidates,
    }


def should_use_claude(result, note_probs, root_idx):

    # Decide whether to call Claude API based on rule-based result quality. (Method is weight which means no exact rule match found, confidence below threshold of .75, root/note contradtion, or fewer than 2 notes detected which usually means model is uncertain unless its a 5 chord)

    # Condition 1 - no exact match found
    if result["method"] == "weighted":
        return True

    # Condition 2 - low confidence even on partial match
    if result["confidence"] < CLAUDE_CONFIDENCE_THRESHOLD:
        return True

    # Condition 3 - root/note contradiction
    # The predicted root should be present in the detected notes
    root_name = CHROMATIC[root_idx]
    if root_name not in result["notes"]:
        return True

    # Condition 4 - too few notes detected to be reliable
    if len(result["notes"]) < 2:
        return True

    return False


def identify_chord_with_claude(note_probs, root_idx, bass_idx, rule_based_result):
    
    # Layer 2 - Claude API chord identification.
    # Called when rule-based result is uncertain.

    # Sends note probabilities, root, bass, and rule-based candidates to Claude and asks it to reason about the most likely chord.

    # Returns same dict structure as identify_chord() with method="claude" or None if API call fails.

    try:
        import anthropic
        client = anthropic.Anthropic()

        root_name = CHROMATIC[root_idx]
        bass_name = CHROMATIC[bass_idx]

        # Build note probability summary - only include notes above 0.2 to keep prompt concise
        note_prob_str = ", ".join(
            f"{CHROMATIC[i]}:{note_probs[i]:.2f}"
            for i in range(12)
            if note_probs[i] >= 0.2
        )

        # Build candidates string
        candidates_str = ", ".join(
            f"{chord}({score})"
            for chord, score in rule_based_result["candidates"]
        )

        prompt = f"""You are a music theory expert analyzing guitar chord detection output from a CNN model.

Model outputs:
- Detected root note: {root_name}
- Detected bass note: {bass_name}
- Note probabilities (notes ≥ 0.2): {note_prob_str}
- Active notes (≥ 0.5 threshold): {rule_based_result["notes"]}
- Rule-based algorithm candidates: {candidates_str}

The rule-based algorithm was uncertain. Using your music theory knowledge:
1. Consider whether the detected root makes sense given the note probabilities
2. Consider the bass note - if bass ≠ root it may be a slash chord
3. Consider which notes are strongly present vs weakly present
4. Account for common guitar voicings where the 5th is often omitted

Use this scale information: # Chromatic scale (index 0-11): [C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B], so for example instead of saying Gb, say F# to avoid confusion.

Respond ONLY with a JSON object in this exact format, no other text:
{{
    "chord": "chord name e.g. Am7 or F#maj9",
    "root": "root note e.g. A",
    "quality": "quality e.g. m7",
    "confidence": 0.0 to 1.0,
    "reasoning": "brief explanation"
}}"""

        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )

        # Parse Claude's response
        response_text = response.content[0].text.strip()
        parsed        = json.loads(response_text)

        chord_name = normalize(parsed["chord"])

        return {
            "chord":      chord_name,
            "root":       parsed["root"],
            "quality":    parsed["quality"],
            "aliases":    [],
            "confidence": float(parsed["confidence"]),
            "method":     "claude",
            "notes":      rule_based_result["notes"],
            "candidates": rule_based_result["candidates"],
            "reasoning":  parsed.get("reasoning", ""),
        }

    except Exception as e:
        # Any failure - rate limit, auth error, network, parse error - return None
        # Caller will fall back to rule-based result
        return None


def identify_chord_smart(note_logits, root_logits, bass_logits, threshold=THRESHOLD):

    # The main indentify function with the two-layer chord identification.

    # Layer 1: Rule-based algorithm (fast, free, offline)
    # Layer 2: Claude API fallback (when rule-based is uncertain)

    # Convert raw logits to probabilities
    note_probs = 1 / (1 + np.exp(-np.array(note_logits, dtype=float)))  # sigmoid
    root_idx   = int(np.argmax(root_logits))
    bass_idx   = int(np.argmax(bass_logits))

    # Layer 1 - rule-based algorithm
    result = identify_chord(note_probs, root_idx, threshold)

    # Add bass to result
    result["bass"] = CHROMATIC[bass_idx]

    # Check if bass != root - possible slash chord
    if CHROMATIC[bass_idx] != result["root"] and result["method"] in ("exact", "partial"):
        result["chord"] = result["chord"] + "/" + CHROMATIC[bass_idx]

    # Check if Claude fallback is needed
    if should_use_claude(result, note_probs, root_idx):
        claude_result = identify_chord_with_claude(note_probs, root_idx, bass_idx, result)

        if claude_result is not None:
            # Claude succeeded - use its result
            claude_result["bass"] = CHROMATIC[bass_idx]
            return claude_result
        else:
            # Claude failed - fall back to rule-based but flag it
            result["method"] = "claude_fallback"

    return result


def identify_chord_from_model_output(note_logits, root_logits, threshold=THRESHOLD):

    # Test wrapper thing for backwards compatibility with test scripts.
    # Uses rule-based only (no Claude). Use identify_chord_smart() for full pipeline.
    # Not going to be used in main just for testing 


    note_probs = 1 / (1 + np.exp(-np.array(note_logits, dtype=float)))  # sigmoid
    root_idx   = int(np.argmax(root_logits))
    return identify_chord(note_probs, root_idx, threshold)


# testing testing testing
if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
 
    # Load API key from .env file - never hardcode this
    load_dotenv()
 
    print("" + "="*65)
    print("  MUSIC THEORY - CLAUDE REASONING TEST")
    print("  Using hardcoded model outputs from real wav file tests")
    print("="*65)
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    print(f"  Claude : {CLAUDE_MODEL}")
    print(f"  API Key: {'set ✓' if api_key else 'NOT SET - Claude will not work'}")
 
    # ── HARDCODED MODEL OUTPUTS FROM REAL WAV TESTS ───────────────────────────
    # Format: (description, expected, note_probs dict, root_idx, bass_idx)
    # note_probs: {note: probability} - only notes >= 0.3 shown from test output
    # All other notes assumed ~0.0
 
    CHROMATIC_LOCAL = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
 
    def probs_dict_to_array(probs_dict):
        # Convert {note: prob} dict to 12-element array
        arr = [0.0] * 12
        for note, prob in probs_dict.items():
            if note in CHROMATIC_LOCAL:
                arr[CHROMATIC_LOCAL.index(note)] = prob
        return arr
 
    test_cases = [
        # ── PASSING CASES (rule-based should handle, Claude rarely called) ────
        {
            "desc":     "D9 amp recording (expected: D9)",
            "expected": "D9",
            "probs":    {"C": 1.0, "D": 0.984, "E": 1.0, "F#": 0.994, "G": 0.068, "Ab": 0.079},
            "root_idx": CHROMATIC_LOCAL.index("D"),
            "bass_idx": CHROMATIC_LOCAL.index("D"),
        },
        {
            "desc":     "Cmaj mac mic (expected: C)",
            "expected": "C",
            "probs":    {"C": 1.0, "E": 1.0, "G": 1.0},
            "root_idx": CHROMATIC_LOCAL.index("C"),
            "bass_idx": CHROMATIC_LOCAL.index("C"),
        },
 
        # ── FAILING CASES (Claude should help reason through) ─────────────────
        {
            "desc":     "D9 mac mic (expected: D9 - previously B7b9)",
            "expected": "D9",
            "probs":    {"C": 0.796, "C#": 0.297, "D": 0.244, "Eb": 0.627,
                         "E": 0.203, "F": 0.269, "F#": 0.282, "G": 0.239,
                         "Ab": 0.24, "A": 0.989, "Bb": 0.191, "B": 0.21},
            "root_idx": CHROMATIC_LOCAL.index("B"),   # model predicted B (wrong)
            "bass_idx": CHROMATIC_LOCAL.index("C"),
        },
        {
            "desc":     "F#maj9 mac mic (expected: F#maj9 - previously Bbm7)",
            "expected": "F#maj9",
            "probs":    {"C#": 0.926, "F": 1.0, "F#": 0.363, "Ab": 0.592, "Bb": 0.652},
            "root_idx": CHROMATIC_LOCAL.index("Bb"),  # model predicted Bb (wrong)
            "bass_idx": CHROMATIC_LOCAL.index("Bb"),
        },
        {
            "desc":     "Cmaj7 high pos (expected: Cmaj7 - previously Em)",
            "expected": "Cmaj7",
            "probs":    {"C": 0.638, "E": 1.0, "G": 0.993, "B": 0.744},
            "root_idx": CHROMATIC_LOCAL.index("E"),   # model predicted E (wrong)
            "bass_idx": CHROMATIC_LOCAL.index("C"),
        },
        {
            "desc":     "Dm7b5 mac mic (expected: Dm7b5 - previously Eb13sus4)",
            "expected": "Dm7b5",
            "probs":    {"C": 0.84, "C#": 0.318, "Eb": 0.363, "F": 0.31, "Ab": 0.371},
            "root_idx": CHROMATIC_LOCAL.index("Eb"),  # model predicted Eb (wrong)
            "bass_idx": CHROMATIC_LOCAL.index("Bb"),
        },
        {
            "desc":     "Dminor9 mac mic (expected: Dm9 - previously D7sus2)",
            "expected": "Dm9",
            "probs":    {"C": 1.0, "D": 1.0, "E": 0.989},
            "root_idx": CHROMATIC_LOCAL.index("D"),   # model predicted D (correct root)
            "bass_idx": CHROMATIC_LOCAL.index("D"),
        },
        {
            "desc":     "F#maj9 v2 mac mic (expected: F#maj9 - previously Fmadd4)",
            "expected": "F#maj9",
            "probs":    {"F": 0.999, "F#": 0.157, "Ab": 0.745, "Bb": 0.578},
            "root_idx": CHROMATIC_LOCAL.index("F"),   # model predicted F (wrong)
            "bass_idx": CHROMATIC_LOCAL.index("Ab"),
        },
    ]
 
    import numpy as np
 
    correct = 0
    total   = 0
 
    for case in test_cases:
        note_probs_arr = probs_dict_to_array(case["probs"])
        root_idx       = case["root_idx"]
        bass_idx       = case["bass_idx"]
        expected       = case["expected"]
        desc           = case["desc"]
 
        # Get rule-based result first
        rule_result = identify_chord(note_probs_arr, root_idx)
        rule_result["bass"] = CHROMATIC_LOCAL[bass_idx]
 
        # Force Claude for ALL cases in this test so we can see its reasoning
        # In production Claude is only called when rule-based is uncertain
        claude_result = identify_chord_with_claude(note_probs_arr, root_idx, bass_idx, rule_result)
 
        if claude_result:
            result = claude_result
            result["bass"] = CHROMATIC_LOCAL[bass_idx]
        else:
            # Claude failed - show rule-based result and error
            result = rule_result
            result["method"] = "claude_fallback"
 
        chord  = result["chord"]
        method = result["method"]
        conf   = result["confidence"]
        notes  = result["notes"]
        bass   = result["bass"]
 
        is_correct = expected.lower().replace("m", "") in chord.lower() or chord.lower().startswith(expected.lower()[:3])
        status     = "✓" if is_correct else "✗"
        total     += 1
        if is_correct:
            correct += 1
 
        print(f"  {status} {desc}")
        print(f"      Expected  : {expected}")
        print(f"      Got       : {chord}  [method={method}  conf={conf:.3f}]")
        print(f"      Notes     : {notes}  Bass: {bass}")
        if method == "claude" and "reasoning" in result:
            print(f"      Reasoning : {result['reasoning']}")
        elif method == "claude_fallback":
            print(f"      Claude failed - used rule-based fallback")
        print()
 
    print(f"  {'─'*60}")
    print(f"  Result: {correct}/{total} correct")
    print("="*65)