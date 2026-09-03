# BetterChord — Deployment reference

Frontend → **Vercel** (static Vite build). Backend → **Render** (Docker
web service, free tier). **Both are live and deployed** — frontend at
<https://better-chord.vercel.app>, backend at
<https://betterchord.onrender.com>, both auto-deploying from the `Anders`
branch. Render's free 512 MB tier is viable now that the image bakes a
numba compile-cache (see the instance-type row below and "What changed in
the repo"); the earlier "move to Cloud Run" plan is **dropped** — the
numba fix resolved the cold-start OOM that motivated it. Full technical
story: `CLAUDE.md`'s Phase 9 entry.

This doc stays the **setup / reference** checklist — the values to plug
into each dashboard, and what every deploy-related file does. For
**day-to-day upkeep** of the running app (what to check after a deploy,
the Render Events tab, when env vars need updating), see
[`OPERATIONS.md`](OPERATIONS.md). Nothing here creates the services for
you.

---

## 1. Private data files (do this first)

Three files are **not in git** (size + an open licensing question) and are
fetched at backend build time from a **private Hugging Face dataset repo**:

| File (name in the HF repo) | Placed at (in the image) |
|---|---|
| `chord_cnn.onnx` | `betterchord/training_scripts/chord_cnn.onnx` |
| `voicings.db` | `data/voicing_data/voicings.db` |
| `betterchord_songs.db` | `data/song_data/betterchord_songs.db` |

The deployed backend runs CNN inference through **ONNX**, not PyTorch, so
it needs **`chord_cnn.onnx`** — *not* `chord_cnn.pth`. The `.pth` (the
PyTorch training output) can stay in the HF repo or be deleted; the image
never uses it.

Requirements:

- The HF repo is a **dataset** repo (not a model repo) and **private**.
- The three files sit at the **repo root** with **exactly** the names in
  the left column. If yours differ, edit the `FILES` dict in
  [`docker/fetch_hf_data.py`](docker/fetch_hf_data.py) — that's the only
  place the names live.
- Create a Hugging Face **access token** with **Read** scope
  (huggingface.co → Settings → Access Tokens). If it's a fine-grained
  token, grant it read access to that specific dataset repo.

### Retrain → re-export → re-upload workflow

`chord_cnn.onnx` is a *converted copy* of `chord_cnn.pth`, not something
training produces directly. Any time the model is retrained:

1. `python betterchord/training_scripts/train.py` → new `chord_cnn.pth`
   (unchanged from before — training is 100% PyTorch).
2. `python betterchord/training_scripts/export_onnx.py` → new
   `chord_cnn.onnx` next to it. The script re-runs a numerical-equivalence
   check on real audio and refuses to write a bad file.
3. Upload the new `chord_cnn.onnx` to the private HF repo, **replacing**
   the old one (web UI, or `hf upload <repo> betterchord/training_scripts/chord_cnn.onnx chord_cnn.onnx --repo-type dataset`).
4. Redeploy the Render service (its next build fetches the new `.onnx`).

---

## 2. Render (backend)

**New → Web Service**, connect the GitHub repo, then:

| Setting | Value |
|---|---|
| Language / Runtime | **Docker** (not native Python — Render will otherwise try to autodetect pip) |
| Root Directory | *(blank — repo root)* |
| Dockerfile Path | `./Dockerfile` |
| Instance type | **512 MB (free / Starter) — this is the live config.** Inference runs via ONNX Runtime, not PyTorch; the image is dep-trimmed + ORT-tuned (arena off, single-thread) and bakes a numba compile-cache (`docker/warmup_numba.py`), so the first `/identify` loads librosa's CQT/onset kernels from disk instead of compiling them live. Verified **on the real Render deploy** (Phase 9): cold start ~3 s and clear of the 512 MiB ceiling with **zero reclaim events / zero OOM kills** (before the cache: ~17 s, pinned at 512 MiB, 644–834 reclaim events, OOM-killing 1 of 2 cold starts). Warm `/identify` ~0.2 s. Headroom is real but not large (~125 MiB anon) — Render's own platform overhead comes out of the same 512 — so if it ever misbehaves under load, the 1 GB tier is the next step; further optimization would need architecture changes. Full story: `CLAUDE.md` Phase 9. |
| Health Check Path | `/chords` |

### Environment variables (Render dashboard → Environment)

| Name | Value | Scope | Notes |
|---|---|---|---|
| `HF_TOKEN` | your HF Read token (`hf_...`) | **Build** | Render passes dashboard vars as `--build-arg` for matching `ARG` names. Make sure it is available at build time (not "runtime only"). Consumed only in the isolated `data` build stage — never lands in the final image. |
| `HF_DATASET_REPO` | e.g. `your-user/betterchord-data` | **Build** | The private dataset repo id. |
| `ALLOWED_ORIGINS` | the Vercel origin — currently `https://better-chord.vercel.app` | **Runtime** | Comma-separated for multiple (e.g. add a stable preview domain, or a custom domain if one is ever added). Controls the API's CORS `allow_origins`. Without it the browser frontend's requests are blocked. |
| `PORT` | **do not set** | — | Render injects this automatically; the container binds `0.0.0.0:$PORT`. |

First deploy will fail CORS-wise until you know the Vercel URL — that's
fine, set `ALLOWED_ORIGINS` and redeploy once step 3 is done.

---

## 3. Vercel (frontend)

**Add New → Project**, import the repo, then:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite (auto-detected) |
| Build Command | `npm run build` (default) |
| Output Directory | `dist` (default) |

### Environment variable (Vercel → Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `VITE_API_URL` | the Render backend origin — currently `https://betterchord.onrender.com` | **No trailing slash, no path.** Read at build time by `frontend/src/lib/api.js`; a trailing slash is trimmed defensively anyway. Set it for **Production** (and Preview if you want previews to hit the live API). If unset, the build falls back to `http://127.0.0.1:8000` — fine for local, useless in prod. |

Wiring order:
1. Deploy the Render backend, note its URL.
2. Set `VITE_API_URL` on Vercel to that URL, deploy the frontend, note its URL.
3. Set `ALLOWED_ORIGINS` on Render to the Vercel URL, redeploy the backend.

---

## 4. Building the image locally (when Docker is available)

```bash
docker build \
  --build-arg HF_TOKEN=hf_xxxxxxxxxxxxxxxxx \
  --build-arg HF_DATASET_REPO=your-user/betterchord-data \
  -t betterchord-api .

docker run --rm -p 8000:8000 \
  -e ALLOWED_ORIGINS=http://localhost:5173 \
  betterchord-api
```

Then verify against the running container:

```bash
docker exec <container> ffmpeg -version | head -1
curl -s localhost:8000/chords | head -c 200
curl -s localhost:8000/voicings/C | head -c 200
curl -s localhost:8000/songs/C | head -c 200
curl -s -F file=@frontend/public/assets/Gminor_3_5_5_3_3_3.wav localhost:8000/identify
```

---

## 5. Env var summary

| Variable | Where | Build / Runtime | Purpose |
|---|---|---|---|
| `HF_TOKEN` | Render | Build | Auth to download the 3 private data files from Hugging Face. |
| `HF_DATASET_REPO` | Render | Build | Which private HF dataset repo to download them from. |
| `ALLOWED_ORIGINS` | Render | Runtime | CORS allow-list — the frontend origin(s) permitted to call the API. |
| `PORT` | Render | Runtime | Provided by Render; the container binds it. Do not set manually. |
| `VITE_API_URL` | Vercel | Build | The backend origin the built frontend calls. |

---

## 6. After any deploy

Real-device checks matter more here than most projects — Playwright /
device-emulation has repeatedly passed while real iOS Safari failed. The
Phase 6 mobile work went through a full real-phone pass on the live
deploy across Phase 9's mobile-fixes rounds; keep doing a quick real-phone
run (record, upload, manual search, the modals, Results) after any deploy
that touches the frontend. Ongoing operational routine: [`OPERATIONS.md`](OPERATIONS.md)
§6.

---

## What changed in the repo to make it deployable

(All landed in Phase 7; the numba-cache line was confirmed on the real
Render deploy in Phase 9 — see `CLAUDE.md`.)

- `frontend/src/lib/api.js` — `API_BASE` now `import.meta.env.VITE_API_URL`
  with the `http://127.0.0.1:8000` fallback (trailing slash trimmed).
- `frontend/.env.example` — documents `VITE_API_URL`.
- `frontend/.gitignore` — ignores real `.env*` files, keeps `.env.example`.
- `Dockerfile` (repo root) — 2-stage CPU image: stage 1 fetches the 3
  private files from HF (token isolated there), stage 2 is the API
  runtime (ffmpeg via apt, deps from `requirements-deploy.txt`,
  `uvicorn api:app` on `$PORT`). **No torch** — inference runs via
  onnxruntime + `chord_cnn.onnx`.
- `.dockerignore` (repo root) — trims the build context; excludes the
  large local data files so the container uses the freshly-fetched ones.
- `docker/fetch_hf_data.py` — the HF download script the Dockerfile runs.
- `docker/warmup_numba.py` (new) + `Dockerfile` `ENV NUMBA_CACHE_DIR` /
  `NUMBA_CPU_NAME=generic` + a `RUN python docker/warmup_numba.py` step +
  `numba`/`llvmlite` pins in `requirements-deploy.txt` — pre-compiles
  librosa's `@jit(cache=True)` CQT/onset kernels into an image layer so
  the first `/identify` loads all 41 from disk instead of a live LLVM
  compile (the cold-start cost that OOM-killed the free tier). Two
  non-obvious pieces: `NUMBA_CPU_NAME=generic` keeps the cache key free
  of host-CPU features so the baked cache is valid on whatever host runs
  the image, and `warmup_numba.py` pins the librosa source-file mtimes to
  a fixed value so the cache survives BuildKit's whole-second mtime
  truncation at layer commit. A cache miss falls back to live compile —
  no failure. Confirmed on the real Render deploy (Phase 9): cold start
  ~17 s / 512 MiB-pinned / 644–834 reclaim events → ~3 s / ~448 MiB / 0
  reclaim events, zero OOM kills; chord output bit-identical to a live
  recompile across a 50-file sweep. Full investigation: `CLAUDE.md`
  Phase 9.
- `betterchord/training_scripts/export_onnx.py` — converts `chord_cnn.pth`
  → `chord_cnn.onnx` with a real numerical-equivalence check. Re-run
  after every retrain.
- `requirements-deploy.txt` (new) — runtime-only deps for the image:
  `requirements-cpu.txt` minus torch/torchaudio/torchvision and
  minus matplotlib/pandas (audited as not on the `/identify` path),
  plus `onnxruntime`. `scikit-learn` stays — librosa 0.11 hard-requires
  it.
- `requirements-cpu.txt` — added `python-multipart` (required for the
  `/identify` file upload; was only present transitively in local dev)
  and `huggingface_hub`; also `onnx` + `onnxruntime` for the export
  toolchain. Still has torch (it's the CPU training/export deps file).
- `main.py` — CNN inference path is now lazy and ONNX-first: uses
  `chord_cnn.onnx` via onnxruntime when available, falls back to the
  PyTorch `.pth` where torch is installed. `import torch` no longer runs
  at module load. The ONNX `InferenceSession` is created with
  memory-lean options (`enable_cpu_mem_arena=False`,
  `intra_op_num_threads=1`) — doesn't serialize concurrent requests
  (verified).
- `api.py` — CORS `allow_origins` now reads `ALLOWED_ORIGINS`
  (comma-separated), defaulting to the Vite dev origin. No endpoint or
  inference logic touched.
