# syntax=docker/dockerfile:1
#
# BetterChord backend (FastAPI, api:app). CPU-only.
# Build context: repo root. Render auto-detects this file at the root;
# point Render's "Root Directory" at the repo root and set its language
# to Docker (not native Python).
#
# Build args (required):
#   HF_TOKEN         Hugging Face read token for the private data repo.
#   HF_DATASET_REPO  e.g. "your-user/betterchord-data".
# Neither is baked into the final image -- see the isolated "data" stage.

# --------------------------------------------------------------------------
# Stage 1 -- fetch the 3 private data files from Hugging Face
# (chord_cnn.onnx, voicings.db, betterchord_songs.db).
# Kept separate so HF_TOKEN never appears in the final image's history.
# --------------------------------------------------------------------------
FROM python:3.14-slim-bookworm AS data

ARG HF_TOKEN
ARG HF_DATASET_REPO

RUN pip install --no-cache-dir huggingface_hub

WORKDIR /out
COPY docker/fetch_hf_data.py /tmp/fetch_hf_data.py
RUN HF_TOKEN="$HF_TOKEN" HF_DATASET_REPO="$HF_DATASET_REPO" OUT_DIR=/out \
      python /tmp/fetch_hf_data.py \
 && rm -rf /out/_hf_tmp

# --------------------------------------------------------------------------
# Stage 2 -- the actual API runtime image.
# --------------------------------------------------------------------------
FROM python:3.14-slim-bookworm

# ffmpeg: needed only for the browser record path (WebM/Opus decode).
# MP3 and other common uploads decode natively via libsndfile; the record
# button does not. System package, not pip.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Runtime deps. NO torch here -- the container runs CNN inference through
# chord_cnn.onnx via onnxruntime (requirements-deploy.txt). This is the
# bulk of the image's memory saving.
COPY requirements-deploy.txt ./
RUN pip install --no-cache-dir -r requirements-deploy.txt

# App source. Large local data files, the frontend, venvs, personal test
# data and test_scripts are excluded via .dockerignore.
COPY . .

# The 3 private data files, placed at the exact paths main.py /
# betterchord/config/voicings.py / betterchord/config/songs.py read from.
COPY --from=data /out/betterchord/training_scripts/chord_cnn.onnx  betterchord/training_scripts/chord_cnn.onnx
COPY --from=data /out/data/voicing_data/voicings.db                data/voicing_data/voicings.db
COPY --from=data /out/data/song_data/betterchord_songs.db          data/song_data/betterchord_songs.db

# Render injects $PORT at runtime. 8000 is only a local-dev default.
ENV PORT=8000
EXPOSE 8000

# Exec form + sh -c so ${PORT} still expands at container start.
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
