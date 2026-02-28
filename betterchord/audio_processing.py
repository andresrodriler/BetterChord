import librosa
import numpy as np
import warnings

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