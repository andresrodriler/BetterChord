import os
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import datasets, transforms
from torchvision.utils import make_grid

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix
import matplotlib.pyplot as plt


class ChordCNN(nn.Module):

    # num_class_chords: Number of chord classes to predict (default is 24 for 12 major and 12 minor chords, will do more soon)
    def __init__(self, num_class_chords=24):

        # Convolutional layers to extract features from the spectrogram
        super(ChordCNN, self).__init__()
        self.conv1 = nn.Conv2d(in_channels=1, out_channels=32, kernel_size=3, stride=1, padding=1)
        self.conv2 = nn.Conv2d(in_channels = 32, out_channels=64, kernel_size=3, stride=1, padding=1)

        # Fully connceted layers input after pooling will be
        # Height: 128 to 64 to 32
        # Width: 119 to 59 to 29
        # Channels: 1 to 32 to 64
        # So input to first FC layer will be 32*29*64 = 59392
        self.fc1 = nn.Linear(59392, 256) 
        self.fc2 = nn.Linear(256, 128)
        self.fc3 = nn.Linear(128, num_class_chords)

        self.dropout = nn.Dropout(0.5) # Dropout layer

    def forward(self, x):
        # Pass through conv layers
        x = F.relu(self.conv1(x))
        x = F.max_pool2d(x, kernel_size = 2, stride = 2)

        # Second conv layer
        x = F.relu(self.conv2(x))
        x = F.max_pool2d(x, kernel_size = 2, stride = 2)

        # Flatten
        x = x.view(x.size(0), -1)

        # Fully connected (NN)
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        x = self.fc3(x) # Output

        # Apply softmax to get probabilities for each chord class
        return x
