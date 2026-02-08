# BetterChord
Just a ML-powered guitar chord recognition using CNN and music theory.

## Guitar Emoji
🎸

## Overview
- Uses two main libraries
- Librosa mainly to turn audio files into spectrograms to look at pitches to see what notes are used in chord audio
- Pytorch for ML and based on whats given by Librosa can recognize common chord patters
- Combines these two for max accuracy since PyTorch recognizes common chords, and for more rare/augmented (no pun intended) librosa can use music thoery to figure it out, and combines those two to see most likely played chord in audio file

## Features
- Single guitar strum chord recogniztion
- Multiple voicing suggestions for output chord
- Song reccommendations based on output chord for practice
- Reveals what notes make output chord for user to understand music theory

## Prerequisites
- Python 3.8+
- Git
- ffmpeg (⚠️ To use M4A/MP3 and other formats)


## Stack
- PyTorch 2.10.0 - Deep learning framework
- Librosa 0.11.0 - Audio analysis (⚠️ Only works with WAV/FLAC without ffmpeg)
- NumPy 2.3.5 - Number computation
- SQLite - Chord/Song database

## Install ffmpeg ⚠️ (Highly recommended)

**Mac:**
```bash
brew install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

**Linux:**
```bash
sudo apt-get install ffmpeg
```


## Installation
- git clone https://github.com/YOUR_USERNAME/BetterChord.git
- cd BetterChord

## Project Structure
```
BetterChord/
├── betterchord/           # Main package
│   ├── audio_processing.py   # Librosa audio stuff
│   ├── cnn_model.py          # PyTorch CNN model
│   ├── music_theory.py       # Chord construction logic?
│   └── database.py           # SQLite DB
├── data/
│   ├── training_data/     # Training audio samples
│   └── test_data/         # Test audio files
├── models/                # Saved trained models
├── scripts/               # Helper scripts
├── main.py               # Main
```
