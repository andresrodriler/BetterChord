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

# Cap every numerical-library thread pool to 1. On a 512 MB instance the
# per-thread stacks/buffers of OpenBLAS (numpy/scipy), OpenMP and numba's
# threadpool are pure overhead -- the /identify path is one small
# inference, not a parallel workload. Set as ENV (not just Render
# dashboard vars) so they're guaranteed present before numpy/OpenBLAS
# load, and version-controlled.
#   BLAS backend here is bundled OpenBLAS (libscipy_openblas), which reads
#   OPENBLAS_NUM_THREADS + OMP_NUM_THREADS. MKL_NUM_THREADS is a no-op
#   with these PyPI wheels (no MKL) but harmless. numba: NUMBA_NUM_THREADS
#   caps its pool; workqueue is its lightest threading layer (no external
#   libgomp/libtbb).
#
# NUMBA_CACHE_DIR + NUMBA_CPU_NAME: librosa's CQT/onset kernels are numba
# @jit(cache=True). Compiling them live on the first /identify runs ~17 s
# of LLVM and, under a 512 MB cap, pins the container at the ceiling with
# hundreds of reclaim events + ~110 MiB more anon RSS -- the cold-start
# transient Phase 7 saw OOM-kill on Render. `docker/warmup_numba.py` (RUN
# below) pre-compiles those kernels into /opt/numba-cache during the
# build; the first request then loads all 41 from disk (0 recompiles,
# verified in-container), cold peak drops 512 -> ~448 MiB, wall ~17 s ->
# ~3 s. NUMBA_CPU_NAME=generic drops host CPU features from the cache key
# (numba forces CPU_FEATURES="" too), so the baked cache is valid on
# whatever host runs the image; warmup_numba.py also pins the librosa
# source mtimes so the cache survives the image-layer round-trip. If the
# cache ever misses (version skew, key change) numba recompiles live --
# same behaviour as today, no failure. numba/llvmlite are pinned in
# requirements-deploy.txt for the same reason.
ENV OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMBA_NUM_THREADS=1 \
    NUMBA_THREADING_LAYER=workqueue \
    NUMBA_CACHE_DIR=/opt/numba-cache \
    NUMBA_CPU_NAME=generic

# Runtime deps. NO torch here -- the container runs CNN inference through
# chord_cnn.onnx via onnxruntime (requirements-deploy.txt). This is the
# bulk of the image's memory saving.
COPY requirements-deploy.txt ./
RUN pip install --no-cache-dir -r requirements-deploy.txt

# App source. Large local data files, the frontend, venvs, personal test
# data and test_scripts are excluded via .dockerignore.
COPY . .

# Pre-compile librosa's numba kernels into $NUMBA_CACHE_DIR (see the ENV
# note above). Uses a synthetic clip -- numba caches per arg-type, not per
# data, so this compiles the exact set the real /identify path loads.
# Needs only librosa/numpy/soundfile + betterchord/config/, all present by
# now; the model and DBs (COPY --from=data below) are not involved.
RUN python docker/warmup_numba.py

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
