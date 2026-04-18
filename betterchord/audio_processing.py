import librosa
import numpy as np
import warnings
import os

# spec_data lives in data along with training_data and test_data
SPEC_CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'spec_data')

# Noise bank lives in data/noise_bank/processed
NOISE_BANK_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'noise_bank', 'processed')

# Noise bank cache - loaded once into memory on first use
_noise_bank = None

def find_chord_position_time(y, sr):
    # This is a function to find in what section of the audio clip the chord is being played
    # y: Audio Signal
    # sr: Sample Rate

    # We can use the onset detection function from librosa to find the onsets in the audio signal, which
    # captures sudden changes in the audio signal, which is likely to be the chord being played.
    # Then use frames to time to convert the frame index to time in seconds to return time of onset
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr)

    if len(onset_frames) == 0:
        warnings.warn("No onsets detected. Using beginning of file. (This may lead to inaccurate chord detection, you actually strum?)")
        onset_time = 0.25  # Default to 0.25 seconds
    else:

        # Convert all onsets to times
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        
        # Get onset strengths (how strong each one is)
        onset_strength = librosa.onset.onset_strength(y=y, sr=sr)

        # Get strength at detected onset frames only
        onset_strength_at_onsets = onset_strength[onset_frames]

        # Pick strongest onset
        max_strength_index = np.argmax(onset_strength_at_onsets)
        onset_time = onset_times[max_strength_index]

    start_time = 0.0
    end_time = 0.0
    
    start_time = max(0, onset_time - 0.25) # Start 0.25 before onset for safety
    end_time = min(len(y) / sr, onset_time + 2.5)

    return start_time, end_time



def load_audio(file_path, sr=22050, target_duration=2.75):
    # Load audio file
    # file_path: Path to the audio file
    # sr: Sample rate to load the audio at (default is 22050)
    
    # First, load the entire file (cutoff at 1 minute to avoid ridiculously long files)
    y_full, sr = librosa.load(file_path, sr=sr, duration = 60) 

    # Then, find the chord position and load only that section
    start_time, end_time = find_chord_position_time(y_full, sr)

    # Cut the audio signal to the chord section
    y_full = y_full[int(start_time * sr):int(end_time * sr)]

    # Fix loaded audio length to be exactly 2.75 seconds (for consistent spectrogram input size, only for ones who need it)
    if len(y_full) < int(target_duration * sr):
        y_full = librosa.util.fix_length(y_full, size=int(target_duration * sr))

    return y_full, sr

def create_spectrogram(y, sr, n_bins=84, hop_length=512):
    # To create spectrogram for anaylsis on ML and music theory algoririthm
    # y = File path
    # sr = Sample Rate
    # n_mels: Number of mel frequency bands
    # hop_length:  Hop length for CQT

    # Create a SQT spectrogram
    My_SQT_Spec = librosa.cqt(y=y, sr=sr, n_bins=n_bins, hop_length=hop_length)

    # convert mel spectrogram to decibels
    cqt_mag = np.abs(My_SQT_Spec)
    cqt_db  = librosa.amplitude_to_db(cqt_mag, ref=np.max)

    mean  = np.mean(cqt_db)
    std = np.std(cqt_db)

    # Calculate normalized spectrogram for CNN input. Edge case for std being 0
    if std  > 0:
        cqt_normalized = (cqt_db - mean) / std
    else:
        cqt_normalized = cqt_db - mean

    return cqt_normalized

def load_or_cache_spectrogram(file_path):
    # This is a function that loads spectrograms from cache if it exists, otherwise computes it and saves it
    # Cache lives in data/spec_data

    data_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'data'))
    file_norm = os.path.normpath(file_path)

    # Get path from data/training_data or data/test_data
    rel_path = os.path.relpath(file_norm, data_dir)

    # Build the cache path eg spec_data/training_data/Am/HF_Am_1.npy
    cache_path = os.path.join(SPEC_CACHE_DIR, os.path.splitext(rel_path)[0] + '.npy')

    # load from cache if it exists
    if os.path.exists(cache_path):
        return np.load(cache_path)
    
    # If cache miss, compute spectrogram from scratch and save to cache
    y, sr = load_audio(file_path)
    spectrogram = create_spectrogram(y, sr)

    # Create cache directory (spec_data) if needed and save it
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    np.save(cache_path, spectrogram)

    return spectrogram

def load_noise_bank():
    # Load all noise npy into memory once

    global _noise_bank

    if _noise_bank is not None:
        return _noise_bank
 
    if not os.path.exists(NOISE_BANK_DIR):
        _noise_bank = []
        return _noise_bank
    
    noise_files = sorted([f for f in os.listdir(NOISE_BANK_DIR) if f.endswith('.npy')])
    _noise_bank = [np.load(os.path.join(NOISE_BANK_DIR, f)) for f in noise_files]
    return _noise_bank

def apply_noise_augmentation(spectrogram):
    # Mix a random noise slice from the noise bank into the spectrogram.
    # Returns augmented spectrogram same shape as input.

    noise_bank = load_noise_bank()
    if not noise_bank:
        return spectrogram # No noise bank, return clean
    
    # Pick a random noise type from bank
    noise_array = noise_bank[np.random.randint(len(noise_bank))]

    # Pick a random slice matching spectrogram width of chord spectrogram
    spec_width = spectrogram.shape[1]
    noise_width = noise_array.shape[1]

    if noise_width <= spec_width:
        # Noise is shorter, tile it to fit
        repeats = (spec_width // noise_width) + 1
        noise_full = np.tile(noise_array, (1, repeats))
        noise_slice = noise_full[:, :spec_width]
    else:
        # Pick random start point for noice slice
        max_start = noise_width - spec_width
        start = np.random.randint(0, max_start)
        noise_slice = noise_array[:, start:start + spec_width]

    # Determine SNR level using a 20/60/20 distrubution
    roll = np.random.rand()
    if roll < 0.20:
        # Heavy noise (SNR 10-15dB)
        snr_db = np.random.uniform(10, 15)
    elif roll < 0.80:
        # Moderate noise (SNR 20-35dB)
        snr_db = np.random.uniform(20, 35)
    else:
        # Light noise (SNR 40-50dB)
        snr_db = np.random.uniform(40, 50)
    
    # Scale noise to achieve target SNR
    # SNR = 10 * log10(signal_power / noise_power)
    signal_power = np.mean(spectrogram ** 2)
    noise_power = np.mean(noise_slice ** 2)

    if noise_power > 0 and signal_power > 0:
        target_noise_power = signal_power / (10 ** (snr_db / 10))
        scale              = np.sqrt(target_noise_power / noise_power)
        noise_slice        = noise_slice * scale
 
    return spectrogram + noise_slice
