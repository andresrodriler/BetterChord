import os
import torch
import torch.nn as nn
import torch.optim as optim

from cnn_model import ChordCNN
from database import get_dataloader

# Metaparameters
data_root = os.path.join(os.path.dirname(__file__), '..', 'data')
epochs = 100
batch_size = 32
learning_rate = 0.0005
path = 'chord_cnn.pth'
THRESHOLD = 0.5   # probability threshold for note detection
ROOT_LOSS_WEIGHT = 0.5  # how much root loss contributes vs note loss


# Get dataloaders
train_loader, test_loader, note_classes = get_dataloader(data_root, batch_size=batch_size)

# Model:
    # For note recogniztion, 12 vector array for each note in chromatic scale, BCEWithLogitsLoss for multi label
    # For root recogniztion, index of the root note in chromatic scale array, CrossEntropyLoss for single label

model = ChordCNN(chromatic_notes=12)
note_criterion = nn.BCEWithLogitsLoss()
root_criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=learning_rate, weight_decay=1e-4)

# Reduce learning rate by 50% if exact match doesn't improve for 5 epochs
scheduler = optim.lr_scheduler.ReduceLROnPlateau(
    optimizer, mode='max', factor=0.5, patience=5
)

def note_accuracy(note_out, note_labels, threshold=THRESHOLD):
    #Percentage of individual note predictions correct
    preds = (torch.sigmoid(note_out) >= threshold).float()
    correct = (preds == note_labels).float()
    return correct.mean().item()

def exact_match(note_out, note_labels, threshold=THRESHOLD):
    # Percentage of samples where ALL 12 notes predicted correctly (for note recogniztion)
    preds = (torch.sigmoid(note_out) >= threshold).float()
    all_correct = (preds == note_labels).all(dim=1).float()
    return all_correct.mean().item()

def root_accuracy(root_out, root_labels):
    # Percentage of root notes predicted correctly 
    predicted = root_out.argmax(dim=1)
    return (predicted == root_labels).float().mean().item()

def train(epoch):
    model.train()

    losses, note_accs, exact_accs, root_accs = [], [], [], []

    for spectrograms, note_labels, root_labels in train_loader:
        optimizer.zero_grad()
        note_out, root_out = model(spectrograms)

        note_loss = note_criterion(note_out, note_labels)
        root_loss = root_criterion(root_out, root_labels)
        loss = note_loss + ROOT_LOSS_WEIGHT * root_loss

        loss.backward()
        optimizer.step()

        losses.append(loss.item())
        note_accs.append(note_accuracy(note_out, note_labels))
        exact_accs.append(exact_match(note_out, note_labels))
        root_accs.append(root_accuracy(root_out, root_labels))
    
    print(f'Epoch {epoch+1}/{epochs} | '
          f'Loss: {sum(losses)/len(losses):.4f} | '
          f'Note Acc: {sum(note_accs)/len(note_accs):.4f} | '
          f'Exact Match: {sum(exact_accs)/len(exact_accs):.4f} | '
          f'Root Acc: {sum(root_accs)/len(root_accs):.4f}')

def test():
    losses, note_accs, exact_accs, root_accs = [], [], [], []

    with torch.no_grad():
        for spectrograms, note_labels, root_labels in test_loader:
            note_out, root_out = model(spectrograms)

            note_loss = note_criterion(note_out, note_labels)
            root_loss = root_criterion(root_out, root_labels)
            loss = note_loss + ROOT_LOSS_WEIGHT * root_loss

            losses.append(loss.item())
            note_accs.append(note_accuracy(note_out, note_labels))
            exact_accs.append(exact_match(note_out, note_labels))
            root_accs.append(root_accuracy(root_out, root_labels))

    avg_exact = sum(exact_accs) / len(exact_accs)
    avg_root  = sum(root_accs)  / len(root_accs)

    print(f'Test | '
          f'Loss: {sum(losses)/len(losses):.4f} | '
          f'Note Acc: {sum(note_accs)/len(note_accs):.4f} | '
          f'Exact Match: {avg_exact:.4f} | '
          f'Root Acc: {avg_root:.4f}')

    # Step scheduler based on exact match
    scheduler.step(avg_exact)

    return avg_exact, avg_root


if __name__ == '__main__':

    best_acc = 0.0
    
    for epoch in range(epochs):
        train(epoch)
        exact_acc, root_acc = test()

        if float(exact_acc) > best_acc:
            best_acc = exact_acc
            torch.save(model.state_dict(), path)
            print(f'  New best model saved | '
                  f'Exact Match: {best_acc:.4f} | '
                  f'Root Acc: {root_acc:.4f}')

    print(f'\nTraining complete. Best exact match: {best_acc:.4f}')