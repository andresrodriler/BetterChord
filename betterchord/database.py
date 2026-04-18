import os
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import datasets, transforms
from audio_processing import load_or_cache_spectrogram, apply_noise_augmentation
from chord_to_notes import chord_to_binary, parse_chord, normalize


NOTE_CLASSES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

OPEN_STRINGS = [40, 45, 50, 55, 59, 64] # This is for our synth chord wav files

# Check if its a self file (My own actual guitar recordings)
def is_self_file(fname):
    return fname.startswith("SELF_")

# Check if its a synth file (My own synth generated recordings)
def is_synth_file(fname):
    return fname.startswith("SYNTH_")

# Check if its an IDMT file (MIDI generated synthetic recording)
def is_idmt_file(fname):
    return fname.startswith("IDMT_")

# Check if file should receive noise augmentation during training
# Only synthetic sources get augmented - real guitar recordings are left clean
def should_augment(fname):
    return is_synth_file(fname) or is_idmt_file(fname)

# Get tabs from self file names
def tab_from_self_filename(fname):
    parts = fname.replace(".wav", "").split("_")
    for part in parts:
        if "-" in part and any(c in part for c in "0123456789X"):
            return part
    return None

# get tabs from synth file names
def tab_from_synth_filename(fname):
    parts = fname.replace(".wav", "").split("_")
    for part in reversed(parts):
        if "-" in part and any(c in part for c in "0123456789X"):
            return part
    return None

# Get 12 elemenet binary vector representing notes in chord from file name tabs
def notes_from_tab(tab):
    # Uses normalize() and NOTE_CLASSES for consistency with rest of codebase.
    parts  = tab.split("-")
    vector = [0] * 12
    for i, p in enumerate(parts):
        if p != "X":
            midi      = OPEN_STRINGS[i] + int(p)
            note_name = normalize(NOTE_CLASSES[midi % 12])
            note_idx  = NOTE_CLASSES.index(note_name)
            vector[note_idx] = 1
    return vector

# Get bass note index from file name tab
def bass_from_tab(tab):
    # Uses normalize() and NOTE_CLASSES for consistency with rest of codebase.
    parts  = tab.split("-")
    midi_notes = []
    for i, p in enumerate(parts):
        if p != "X":
            midi_notes.append(OPEN_STRINGS[i] + int(p))
    if not midi_notes:
        return None
    bass_midi = min(midi_notes)
    note_name = normalize(NOTE_CLASSES[bass_midi % 12])
    return NOTE_CLASSES.index(note_name)

# This definition is to get the root note index of a chord for our CNN 
def get_root_index(chord_name):

    # Apply normailization (Ie turn A# to Bb)
    chord_name = normalize(chord_name)

    # Get root and quality of a chord
    root, quality = parse_chord(chord_name)

    if root is None or root not in NOTE_CLASSES:
        return None
        print("Uh oh cant find root of certain chord")

    return NOTE_CLASSES.index(root)

class ChordDataset(Dataset):
    def __init__(self, data_dir, augment = False):
 
        # samples: list of file paths to audio samples
        self.samples = []

        # augment: wether to apply noise augmentation during get item
        # True for training dataset, False for test dataset
        self.augment = augment
 
        # note_labels: 12-element binary vectors representing notes actually played
        # For SELF and SYNTH files: derived from tab in filename (accurate)
        # For HF, IDMT, GADA files: derived from chord folder name (chord_to_binary)
        self.note_labels = []
 
        # root_labels: chromatic index of the theoretical root note (0-11)
        # Always derived from chord folder name for all sources
        self.root_labels = []
 
        # bass_labels: chromatic index of the lowest sounding note (0-11)
        # For SELF and SYNTH files: derived from tab in filename (accurate)
        # For HF, IDMT, GADA files: assumed bass == root (safe for standard voicings)
        self.bass_labels = []

        # augment_flags: Flag for whether noise augmentation applies, true fot SYNTH and IDMT, false for SELF, HF, GADA
        self.augment_flags = []
 
        # chords we couldn't convert (for debugging)
        self.skipped = []
 
        # tab parse failures (for debugging)
        self.tab_failures = 0
 
        chord_classes = sorted(os.listdir(data_dir))
 
        for chord in chord_classes:
            chord_dir = os.path.join(data_dir, chord)
            if not os.path.isdir(chord_dir):
                continue

            # For slash chord folders stored as Am7_over_C, convert back to Am7/C
            # Then strip the bass part for root/note lookups - use just Am7
            # Bass comes from tab for SYNTH files so stripping is safe
            chord_lookup = chord.replace("_over_", "/")
            if "/" in chord_lookup:
                chord_lookup = chord_lookup.split("/")[0]

            # Get root index from chord folder name - same for all files in folder
            root_idx = get_root_index(chord_lookup)
            if root_idx is None:
                self.skipped.append(chord)
                continue

            # Used for HF, IDMT, GADA files that have no tab info
            # For new chord classes only SYNTH files exist - fallback_binary may be None
            # We still process the folder since SYNTH files use tab-based labels
            fallback_binary = chord_to_binary(chord_lookup)

            root_label = torch.tensor(root_idx, dtype=torch.long)

            for fname in os.listdir(chord_dir):
                if not fname.endswith('.wav'):
                    continue
 
                if is_self_file(fname):
                    # SELF recording: use tab from filename for accurate labels
                    tab = tab_from_self_filename(fname)
                    if tab is None:
                        self.tab_failures += 1
                        continue
                    note_vec = notes_from_tab(tab)
                    bass_idx = bass_from_tab(tab)
                    if note_vec is None or bass_idx is None:
                        self.tab_failures += 1
                        continue
 
                elif is_synth_file(fname):
                    # SYNTH recording: use tab from filename for accurate labels 
                    tab = tab_from_synth_filename(fname)
                    if tab is None:
                        self.tab_failures += 1
                        continue
                    note_vec = notes_from_tab(tab)
                    bass_idx = bass_from_tab(tab)
                    if note_vec is None or bass_idx is None:
                        self.tab_failures += 1
                        continue
 
                else:
                    # HF, IDMT, GADA: use chord name labels
                    # Bass assumed to equal root (safe for standard voicings)
                    if fallback_binary is None:
                        # Can't label this file without chord_to_binary - skip it
                        self.tab_failures += 1
                        continue
                    note_vec = fallback_binary
                    bass_idx = root_idx
 
                note_label = torch.tensor(note_vec, dtype=torch.float32)
                bass_label = torch.tensor(bass_idx, dtype=torch.long)
 
                self.samples.append(os.path.join(chord_dir, fname))
                self.note_labels.append(note_label)
                self.root_labels.append(root_label)
                self.bass_labels.append(bass_label)
                self.augment_flags.append(should_augment(fname))
 
        # Debugging output
        if self.skipped:
            print(f"  [!] Skipped {len(self.skipped)} unrecognized chord classes: {self.skipped}")
        if self.tab_failures > 0:
            print(f"  [!] {self.tab_failures} files skipped due to tab parse failures")
 
        augment_count = sum(self.augment_flags)
        print(f"  Loaded {len(self.samples)} samples across "
              f"{len(chord_classes) - len(self.skipped)} chord classes "
              f"({augment_count} eligible for noise augmentation)")
 
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        file_path = self.samples[idx]
        note_label = self.note_labels[idx]
        root_label = self.root_labels[idx]
        bass_label = self.bass_labels[idx]

        # load spectrogram from cache or compute if not cached
        spectrogram = load_or_cache_spectrogram(file_path)

        # Apply noise augmentation if eligible
        if self.augment and self.augment_flags[idx]:
            spectrogram = apply_noise_augmentation(spectrogram)

        # Convert to tensor and add channel dimension
        spec_tensor = torch.tensor(spectrogram, dtype=torch.float32).unsqueeze(0)

        return spec_tensor, note_label, root_label, bass_label

    
def get_dataloader(data_root, batch_size=32, num_workers=0):
    
    train_dir = os.path.join(data_root, 'training_data')
    test_dir  = os.path.join(data_root, 'test_data')

    # Training dataset gets noise augment for SYNTH and IDMT
    # Test uses clean
    train_dataset = ChordDataset(train_dir, augment=True)
    test_dataset  = ChordDataset(test_dir, augment=False)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True,  num_workers=num_workers)

    test_loader  = DataLoader(test_dataset,  batch_size=batch_size, shuffle=False, num_workers=num_workers)

    return train_loader, test_loader, NOTE_CLASSES