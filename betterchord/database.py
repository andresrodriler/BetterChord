import os
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import datasets, transforms
from audio_processing import load_audio, create_spectrogram
from chord_to_notes import chord_to_binary, parse_chord, normalize


NOTE_CLASSES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# This definition is to get the roof of a chord for our CNN (To make sure we get chord right, first thing we need to know is what is the root)
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
    def __init__(self, data_dir):
        # samples: List of file paths to audio samples
        self.samples = []

        # note_labels: 12 element binary vectors representing notes in chord
        self.note_labels = []

        # root_labels: the index of the root note (0 - 11)
        self.root_labels = []  

        # chords we couldn't convert (for debugging)
        self.skipped = []  

        # chord_classes: List of chord class names (e.g. ['C_major', 'C_minor', ...]) Corresponds to labels 0, 1, ...
        chord_classes = sorted(os.listdir(data_dir))

        for chord in chord_classes:
            chord_dir = os.path.join(data_dir, chord)
            if not os.path.isdir(chord_dir):
                continue
            
            # Convert the chord name to the 12 element vector with its respective notes that make the chord
            binary = chord_to_binary(chord)
            if binary is None:
                self.skipped.append(chord) # Again for debugging
                continue

            # Convert the chord name to the root index of the chord
            root_idx = get_root_index(chord)
            if root_idx is None:
                self.skipped.append(chord) # Again for debugging
                continue

            note_label = torch.tensor(binary, dtype = torch.float32)
            root_label = torch.tensor(root_idx, dtype = torch.long)

            for fname in os.listdir(chord_dir):
                if fname.endswith('.wav'):
                    self.samples.append(os.path.join(chord_dir, fname))
                    self.note_labels.append(note_label)
                    self.root_labels.append(root_label)
        
        # again for debugging
        if self.skipped:
            print(f"  [!] Skipped {len(self.skipped)} unrecognized chord classes: {self.skipped}")

        print(f"  Loaded {len(self.samples)} samples across "f"{len(chord_classes) - len(self.skipped)} chord classes")


    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        file_path = self.samples[idx]
        note_label = self.note_labels[idx]
        root_label = self.root_labels[idx]

        # Load audio and create spectrogram
        y, sr = load_audio(file_path)
        spectrogram = create_spectrogram(y, sr)

        # Convert to tensor and add channel dimension
        spec_tensor = torch.tensor(spectrogram, dtype=torch.float32).unsqueeze(0)

        return spec_tensor, note_label, root_label
    
def get_dataloader(data_root, batch_size=32, num_workers=0):
    
    train_dir = os.path.join(data_root, 'training_data')
    test_dir  = os.path.join(data_root, 'test_data')

    train_dataset = ChordDataset(train_dir)
    test_dataset  = ChordDataset(test_dir)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True,  num_workers=num_workers)

    test_loader  = DataLoader(test_dataset,  batch_size=batch_size, shuffle=False, num_workers=num_workers)

    return train_loader, test_loader, NOTE_CLASSES


