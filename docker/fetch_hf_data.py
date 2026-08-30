"""Fetch BetterChord's three gitignored runtime files -- chord_cnn.onnx,
voicings.db, betterchord_songs.db -- from a private Hugging Face dataset
repo, into the exact paths the runtime code reads from.

The deployed backend runs CNN inference via ONNX, so it needs
chord_cnn.onnx (the converted copy), NOT the PyTorch chord_cnn.pth. When
the model is retrained, re-run betterchord/training_scripts/export_onnx.py
and re-upload chord_cnn.onnx to the HF repo (see DEPLOYMENT.md).

Runs at Docker build time (see the repo-root Dockerfile), inside an
isolated builder stage so HF_TOKEN never ends up in the final image's
layers or history.

Environment:
    HF_TOKEN         Hugging Face access token with read scope on the repo.
    HF_DATASET_REPO  Dataset repo id, e.g. "your-user/betterchord-data".
    OUT_DIR          Root to write files under (default "."). Each file
                     lands at OUT_DIR/<its real repo-relative path>.

The keys of FILES are the filenames as stored *in the HF dataset repo*;
adjust them here if the upload used different names.
"""

import os
import sys

from huggingface_hub import hf_hub_download

TOKEN = os.environ.get("HF_TOKEN")
REPO = os.environ.get("HF_DATASET_REPO")
OUT_DIR = os.environ.get("OUT_DIR", ".")

if not TOKEN:
    sys.exit("fetch_hf_data: HF_TOKEN is not set (pass it as a build arg).")
if not REPO:
    sys.exit("fetch_hf_data: HF_DATASET_REPO is not set "
             "(e.g. 'your-user/betterchord-data').")

# filename in the HF dataset repo  ->  path the app expects it at
FILES = {
    "chord_cnn.onnx": "betterchord/training_scripts/chord_cnn.onnx",
    "voicings.db": "data/voicing_data/voicings.db",
    "betterchord_songs.db": "data/song_data/betterchord_songs.db",
}

tmp_dir = os.path.join(OUT_DIR, "_hf_tmp")

for hf_name, dest_rel in FILES.items():
    dest = os.path.join(OUT_DIR, dest_rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"fetch_hf_data: downloading {hf_name!r} -> {dest}", flush=True)

    downloaded = hf_hub_download(
        repo_id=REPO,
        filename=hf_name,
        repo_type="dataset",
        token=TOKEN,
        local_dir=tmp_dir,
    )
    os.replace(downloaded, dest)

    size = os.path.getsize(dest)
    if size == 0:
        sys.exit(f"fetch_hf_data: {dest} downloaded but is empty.")
    print(f"fetch_hf_data:   ok, {size:,} bytes", flush=True)

print("fetch_hf_data: all 3 files present.", flush=True)
