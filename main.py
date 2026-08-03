"""
main.py -- the inference orchestrator. Ties the whole pipeline together:

    audio file -> spectrogram -> CNN -> identify_chord_smart ->
    chord_info + voicings + songs -> one combined response dict

This is deliberately just plumbing -- no new logic. Every piece it calls
(audio_processing, cnn_model, music_theory, chord_info, voicings,
songs) has already been built and verified independently; this
file's only job is wiring them together correctly.

NOT YET RUN END-TO-END -- built from exact function signatures pulled
directly from the real files, and syntax-checked, but I don't have torch/
librosa available in my own environment to actually execute a forward
pass. You're the one who needs to run this for real and confirm it
works -- particularly the tensor shape going into the model (see the
shape comment below) and the CUDA/CPU device handling.

Usage:
    python main.py path/to/audio.wav
"""

import json
import os
import sys

import numpy as np
import torch

_HERE = os.path.dirname(os.path.abspath(__file__))

# main.py lives at the BetterChord/ project root; everything it needs
# lives two levels down inside betterchord/config/ (music_theory,
# chord_info, voicings, songs, chord_parser, interval_calculator)
# and betterchord/training_scripts/ (audio_processing, cnn_model,
# chord_cnn.pth) -- neither is found by Python automatically since
# they're sibling subdirectories, not the same folder as this file.
sys.path.insert(0, os.path.join(_HERE, "betterchord", "config"))
sys.path.insert(0, os.path.join(_HERE, "betterchord", "training_scripts"))

from audio_processing import load_audio, create_spectrogram
from cnn_model import ChordCNN
from music_theory import identify_chord_smart
from chord_info import get_chord_info
from voicings import get_voicings
from songs import get_songs
import chord_parser as cp

MODEL_PATH = os.path.join(_HERE, "betterchord", "training_scripts", "chord_cnn.pth")

_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_model = None  # loaded once, lazily, on first call -- not at import time


def _load_model():
    global _model
    if _model is None:
        _model = ChordCNN()
        _model.load_state_dict(torch.load(MODEL_PATH, map_location=_device))
        _model.to(_device)
        _model.eval()  # disables dropout/batchnorm training behavior -- required for inference
    return _model


def identify_from_audio(file_path):
    """
    Full pipeline: path to an audio file -> one combined response dict
    with the identified chord, theory info, fretboard voicings, and
    matching songs (including the guide-tone related_notes explanation).
    """
    model = _load_model()

    # 1. audio file -> waveform -> CQT spectrogram
    #    load_audio applies clip compression + RMS normalization;
    #    create_spectrogram applies dataset-mean/std normalization +
    #    winsorization -- both already tuned during training, untouched here.
    y, sr = load_audio(file_path)
    spec = create_spectrogram(y, sr)  # shape (84, ~119) -- (n_bins, time_frames)

    # 2. spectrogram -> tensor with batch + channel dims: (1, 1, 84, 119)
    #    ChordCNN.conv1 expects in_channels=1, and the model was trained
    #    on batches, so a single inference still needs a batch dim of 1.
    x = torch.tensor(spec, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(_device)

    # 3. CNN forward pass -- returns raw logits for all three heads,
    #    NOT probabilities (identify_chord_smart applies sigmoid/softmax
    #    itself, confirmed directly from its source).
    with torch.no_grad():
        note_out, root_out, bass_out = model(x)

    note_logits = note_out.squeeze(0).cpu().numpy()
    root_logits = root_out.squeeze(0).cpu().numpy()
    bass_logits = bass_out.squeeze(0).cpu().numpy()

    # 4. raw logits -> identified chord (name, root, quality, confidence,
    #    bass, alternatives -- see identify_chord_smart's own docstring
    #    for the full return shape)
    identified = identify_chord_smart(note_logits, root_logits, bass_logits)
    # identified["chord"] is a DISPLAY string (e.g. "A6/9 / A6add9" --
    # primary name + alias, joined with " / ") -- never re-parse it.
    # Build a clean, single, parseable chord name from the structured
    # fields instead, same safe helper used everywhere else in this
    # project. Confirmed necessary: reusing identified["chord"] directly
    # caused get_chord_info to silently mis-parse the alias text as a
    # bogus bass note, and both get_voicings/search to find nothing.
    display_name = identified["chord"]
    bass = identified["bass"] if identified["bass"] != identified["root"] else None
    chord_name = cp.format_chord(identified["root"], identified["quality"], bass)

    # Print immediately -- if anything below fails, we still know what
    # chord was actually identified instead of losing it to a crash.
    print(f"[identified chord: {chord_name!r}, confidence={identified['confidence']:.3f}]")

    # 5. chord name -> theory info, fretboard voicings, matching songs
    info = get_chord_info(chord_name)
    voicing_result = get_voicings(chord_name)
    song_result = get_songs(chord_name)

    # Cap output for readability during manual testing -- 3 voicings, and
    # up to 3 songs per spelling within results_by_spelling.
    voicing_result = dict(voicing_result)
    voicing_result["voicings"] = voicing_result["voicings"][:3]

    song_result = dict(song_result)
    # get_songs() returns {"error": "..."} (no results_by_spelling key at all)
    # when the chord name can't be parsed, or parses but matches no known
    # registry quality -- both real, distinct failure modes worth seeing
    # clearly rather than crashing on a missing key.
    if "results_by_spelling" in song_result:
        song_result["results_by_spelling"] = {
            spelling: songs[:3] for spelling, songs in song_result["results_by_spelling"].items()
        }

    return {
        "identified": identified,
        "chord_name": chord_name,
        "info": info,
        "voicings": voicing_result,
        "songs": song_result,
    }


TEST_DATA_DIR = r"C:\BetterChord\data\betterchord_mytesting\my_data_raw"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py <filename>")
        print(f"  (filename is looked up inside {TEST_DATA_DIR})")
        sys.exit(1)

    audio_path = os.path.join(TEST_DATA_DIR, sys.argv[1])

    result = identify_from_audio(audio_path)
    print(json.dumps(result, indent=2, default=str))