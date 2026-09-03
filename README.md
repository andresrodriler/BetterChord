# BetterChord 🎸

ML-powered guitar chord recognition with 92.96% test set accuracy, built on a CNN + a music theory engine.
Record or upload a single strum, and BetterChord identifies the chord,
shows you real fretboard voicings, breaks down the theory behind it, and
finds real songs that use it.

**Live: [better-chord.vercel.app](https://better-chord.vercel.app)**

## Status

This is an active passion project, not a finished product, but it's now
live on the web. The core pipeline (audio → chord → voicings/theory/songs)
works end to end and is verified against real audio; a React frontend
([Vercel](https://better-chord.vercel.app)) and a FastAPI backend (Render)
wrap it, and it still runs from the command line too. See
[TODO.md](TODO.md) for the current roadmap.

## Features

- **Chord identification from a single audio recording** — works from a
  real guitar strum. Recommend anyone to strum their guitar clearly, 
  with a pick, and loud. Standard tuning (make sure its tuned well!)
- **Multiple real fretboard voicings** for the identified chord
- **Music theory breakdown** — the actual notes/intervals that make up
  the chord, in plain language
- **Song recommendations** — real songs that use the identified chord,
  pulled from a database of tens of thousands of tracks
- **Guide-tone explanations** — when a closely related chord's songs get
  pulled in alongside your search (e.g. `C13` also surfaces `C7add13`),
  there's an actual explanation of *why*, written for someone who
  doesn't already know music theory

## How it works

1. **Librosa** turns the recorded audio into a CQT spectrogram.
2. A **PyTorch CNN** takes that spectrogram and predicts three things:
   which of the 12 chromatic notes are present, the root, and the bass.
   It predicts raw notes, not a fixed set of chord classes. This means
   it can theoretically identify any chord whose interval pattern is
   known to the system, not just chords it was explicitly trained on.
3. A **rule-based music theory engine** takes those note predictions and
   determines the actual chord name by matching against a canonical
   interval registry.
4. That registry is the core of the project: the project's three data
   sources (the chord naming engine, a database of scraped fretboard
   voicings, and a database of real songs and their chords) used to
   independently disagree about how to name and group chords. A shared
   registry now reconciles all three by comparing actual interval
   content rather than trusting names/strings. This closed dozens of real
   coverage gaps and fixing several silent-wrong-answer bugs along the
   way.

## Tech stack

- **PyTorch** — CNN for note/root/bass prediction (converted to **ONNX
  Runtime** for the deployed backend — no torch at serve time)
- **Librosa** — audio analysis and spectrogram generation
- **NumPy / pandas** — numerical processing
- **SQLite** — chord voicing and song databases
- **FastAPI** + **React** — web backend/frontend, deployed on **Render**
  (Docker) + **Vercel**

## Project structure
```
BetterChord/
├── main.py                               # inference: audio -> chord -> theory/voicings/songs
├── requirements-gpu.txt                  # local dev, CUDA GPU
├── requirements-cpu.txt                  # CPU-only / deployment
├── LICENSE
├── TODO.md
├── betterchord/
│   ├── config/                           # live-serving modules
│   │   ├── chord_parser.py
│   │   ├── interval_calculator.py
│   │   ├── music_theory.py
│   │   ├── chord_info.py
│   │   ├── voicings.py
│   │   └── songs.py
│   ├── training_scripts/                 # CNN training pipeline (not used at runtime)
│   │   ├── audio_processing.py
│   │   ├── cnn_model.py
│   │   ├── chord_to_notes.py
│   │   ├── database.py
│   │   ├── train.py
│   │   └── chord_cnn.pth
│   └── data_scripts/                     # registry/maintenance pipeline, rerun with data changes/updates
│       ├── registry_builder.py
│       ├── guide_tone_grouping.py
│       └── build_normalized_columns.py
└── data/                                 
    ├── voicing_data/voicings.db          # voicing data
    ├── song_data/betterchord_songs.db    # song data
    ├── training_data                     # raw audio training data
    ├── test_data                         # raw audio test data
    ├── spec_data                         # spectrogram cached data of training/test data
    ├── noise_bank                        # noise bank audio data, stamped on synth data
    └── registry
        ├── quality_registry.json         # source truth of all chord qualities, and their intervals
        └── guide_tone_groups.json        # source truth of all ambiguous qualities, grouped 
```

## Prerequisites

- Python 3.8+
- Git
- ffmpeg (⚠️ needed for M4A/MP3 and other non-WAV/FLAC formats)

**Install ffmpeg:**

Mac:
```bash
brew install ffmpeg
```

Windows: download from https://ffmpeg.org/download.html

Linux:
```bash
sudo apt-get install ffmpeg
```

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/BetterChord.git
cd BetterChord
```

Then install dependencies depending on your machine:

**If you have a CUDA GPU** (recommended for training, optional for inference):
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements-gpu.txt
```

**CPU-only:**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-cpu.txt
```

**Note:** the training/voicing/song data isn't included directly in this
repo. See [TODO.md](TODO.md) for the current plan on making that
available separately.

## Usage

Use the live app at [better-chord.vercel.app](https://better-chord.vercel.app),
or run the full pipeline directly from the command line:

```bash
python main.py <filename>
```

This identifies the chord from the given audio file and prints the
identified chord, its theory breakdown, a few real fretboard voicings,
and a few real songs that use it.

## Roadmap

See [TODO.md](TODO.md) for the full, up-to-date list. The FastAPI backend,
React frontend, and deployment are done and live; what's left is ongoing
UI polish plus deciding what training/model data (if any) to publish so
others can reproduce the model.

## License

MIT — see [LICENSE](LICENSE).

# Guitar Emoji!!! 🎸🎸🎸