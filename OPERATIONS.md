# BetterChord — Operations reference

Day-to-day / month-to-month upkeep of the deployed app: **how is this
running, and what do I actually need to check.**

- **Setting the services up the first time?** → [`DEPLOYMENT.md`](DEPLOYMENT.md)
  (dashboard checklist, env vars). This file assumes that's already done.
- **"Why is it built this way?"** → [`CLAUDE.md`](CLAUDE.md) phase history.
- **Retrain the model?** → jump to [section 8](#8-retrain-workflow).

---

## Current deploy status

The app is **live and deployed:**

| | URL | Host | Auto-deploys from |
|---|---|---|---|
| Frontend | <https://better-chord.vercel.app> | Vercel (static Vite build of `frontend/`) | `Anders` branch |
| Backend | <https://betterchord.onrender.com> | Render (Docker web service, free 512 MB tier) | `Anders` branch |

Both branch settings are **confirmed directly in each dashboard.** No
custom domain is in use (the `.vercel.app` / `.onrender.com` URLs are the
real ones); a custom domain was discussed and set aside over cost, and is
a Phase 8 decision point.

Render's free tier was briefly in doubt during Phase 7 (its 512 MB
instance OOM-killed on cold-start `/identify`), and Google Cloud Run was
considered as an alternative. **That is no longer the plan** — Phase 9's
numba compile-cache fix removed the cold-start OOM (cold start now ~3 s,
clear of the ceiling, zero OOM kills, confirmed on the live Render
deploy), so **Render stays the backend host.** Full story: `CLAUDE.md`
Phase 9.

Dashboard consoles (for reference — the person's own logins):
- Render: <https://dashboard.render.com/web/srv-daa9vhon74is73a9ltrg>
- Vercel: <https://vercel.com/anders15/better-chord>

---

## 1. Architecture at a glance

```
GitHub  andresrodriler/BetterChord   ← source of truth
  │   (push to `Anders` — both hosts auto-deploy from it; `main` is stale, see §2)
  │
  ├──────────► VERCEL ──────► static frontend  (Vite build of frontend/)
  │              build step bakes VITE_API_URL into the JS bundle
  │
  └──────────► RENDER (Docker, repo-root Dockerfile) ──► FastAPI backend (api:app)
                 │
                 │   BUILD STEP ONLY ↓↓↓
                 └──► HUGGING FACE  (private "dataset" repo)
                      downloads chord_cnn.onnx, voicings.db,
                      betterchord_songs.db INTO the image.
```

**Runtime request path (what happens when someone uses the site):**

```
browser ──HTTPS──► Vercel static page
        ──fetch(VITE_API_URL)──► Render backend
                                   ├─ ONNX Runtime inference (chord_cnn.onnx, in the image)
                                   └─ sqlite reads (voicings.db / betterchord_songs.db, in the image)
```

**Build-time vs runtime — the one thing to internalise:**

| | Build-time | Runtime (live app) |
|---|---|---|
| **Render** | pip install `requirements-deploy.txt`, `apt` ffmpeg, **download 3 files from Hugging Face**, bake numba compile-cache (`docker/warmup_numba.py`) | `uvicorn api:app`, ONNX inference, sqlite reads — **all from files already in the image.** No outbound calls to HF, no torch. |
| **Vercel** | `npm run build` in `frontend/`, `VITE_API_URL` compiled into the bundle | serve static files only |

**Hugging Face is touched only during Render's build.** The running app
never calls it. If HF is down, *builds* fail; a *live* app is unaffected.

---

## 2. The 4 places to know

### GitHub — `andresrodriler/BetterChord`

Source of truth. Everything deploys *from* a branch here.

**Both Vercel and Render auto-deploy from the `Anders` branch** —
confirmed directly in each dashboard (Settings → Git / "Production
Branch"). A push to `Anders` triggers a build on both.

- **`main` is stale** (`origin/HEAD` points at it, but its last commit is
  months / ~27 commits behind `Anders`). Nothing deploys from it. Don't
  push deploy-worthy work to `main` expecting it to go live, and don't
  assume `main` reflects what's running.
- **Re-check the branch setting** in both dashboards if you ever
  reconnect the Git integration, rename the branch, or start seeing
  deploys that don't match your pushes (see §7).

### Render — the backend host

**The single most important thing to check: the _Events_ tab.**
(Render dashboard → your service → **Events**.) It is the timeline of
every deploy, restart, crash, and out-of-memory kill.

- This exact tab is what caught the real Phase 7 bug: the free instance
  showed **`exit 137` / "Ran out of memory (used over 512MB)"** on
  cold-start `/identify`, which a local `docker run --memory=512m` test
  had *not* reproduced (Render's own agent overhead lives inside the same
  512 MB). Phase 9's numba compile-cache fixed that cold-start OOM (also
  confirmed here in the Events tab — clean deploys, no `exit 137`), so
  free-tier Render is the working host. If `exit 137` ever comes back,
  this is the first place it shows up.
- A healthy Events tab: `Deploy started` → `Build succeeded` →
  `Deploy live`, then quiet. Occasional `Instance spun down` /
  `Instance spun up` on the free tier is **normal** (idle sleep, see §3).
- Bad: `exit 137`, `OOMKilled`, a restart *loop* (spun up → died → spun
  up within seconds, repeatedly), or repeated `Build failed`.

Also useful: the **Logs** tab (live stdout/stderr — `uvicorn` request
lines, Python tracebacks) and the **Metrics** tab (memory/CPU over time;
watch for memory riding the ceiling).

**Environment variables** live under **Environment** in the dashboard
(full table in `DEPLOYMENT.md` §2). When each one needs changing:

| Var | Scope | Change it when… |
|---|---|---|
| `ALLOWED_ORIGINS` | Runtime | **The frontend URL changes** (new Vercel project, custom domain added, preview domain you want allowed). It's a comma-separated allow-list of frontend origins; a mismatch = the browser blocks every API call with a CORS error. After changing it, **redeploy** (or restart) the backend. |
| `HF_TOKEN` | Build | The HF token is rotated/revoked/expired, or you move to a different HF account. Only used during the build's data-fetch stage. |
| `HF_DATASET_REPO` | Build | You move the 3 data files to a different HF repo (or rename it). |
| `PORT` | — | **Never set this.** Render injects it; the container binds `$PORT`. |

> **Not planned, but if the backend ever moves off Render** (e.g. to
> Cloud Run): the equivalents are a **Logs** / **Revisions** view instead
> of the Events tab, env vars set on the service (`gcloud run services
> update … --set-env-vars` or the console), and build args like
> `HF_TOKEN` as Cloud Build substitutions rather than a dashboard "Build
> var". Cloud Run was considered in Phase 7 and dropped once the numba
> fix made Render free viable — see `CLAUDE.md` Phase 9.

### Vercel — the frontend host

Static hosting for the built SPA. Almost nothing to operate here.

- **Deployments** tab: every push to the watched branch → one deployment,
  with `Building` → `Ready` (or `Error`). Click a deployment for its full
  build log.
- **Settings → Environment Variables:** `VITE_API_URL` = the backend
  origin, **no trailing slash, no path** (`DEPLOYMENT.md` §3). It is read
  **at build time** and compiled into the JS — so **changing it requires
  a redeploy**, not just a save. If it's wrong/unset, the built site
  calls `http://127.0.0.1:8000` and every request fails in the browser.
- Vercel gives previews per branch/PR; only the **Production** deployment
  (the watched branch) is the "real" site.

### Hugging Face — build-time only, NOT a live dependency

A **private dataset repo** holding the 3 files the image can't get from
git (`chord_cnn.onnx`, `voicings.db`, `betterchord_songs.db`).

- Relevant **only** to: (a) a Render **build** (it downloads them), and
  (b) the **retrain workflow** ([§8](#8-retrain-workflow)) or **rotating
  `HF_TOKEN`**.
- **The running app never contacts Hugging Face.** HF being down, slow, or
  rate-limited cannot break a site that's already up — only the next
  build.
- If `HF_TOKEN` expires: existing deploys keep running fine; the next
  build fails at the `fetch_hf_data` step until you set a fresh token.

---

## 3. What "healthy" looks like vs. what to worry about

**Healthy:**

- `GET /chords` (the health-check path) returns `200` with a big JSON
  body. `GET /voicings/C`, `GET /songs/C` likewise.
- Render Events: a clean `Build succeeded → Deploy live`, then silence
  (plus benign free-tier `spun down/up` pairs).
- **First request after the service has been idle** is slow, then fast:
  - Free-tier **spin-up** from sleep adds container start time on top.
  - The **first `/identify`** then loads librosa's CQT/onset kernels. The
    image bakes a **numba compile-cache** (`docker/warmup_numba.py`), so
    this cold first `/identify` runs in **~3 s** (down from ~17 s before
    the cache), with peak memory ~448 MiB instead of pegged at 512.
    Verified in-container and **on the live Render deploy** (Phase 9).
  - Every subsequent `/identify` while warm: **~0.2 s** unconstrained,
    ~0.45 s under a hard 512 MB cap.
- Steady-state memory sits **below** the instance limit with real
  headroom (on 512 MB: ~385 MiB anonymous / ~485 MiB `docker stats`
  under load — i.e. ~125 MiB spare and no more).

**Worry — these mean something is actually wrong:**

| Sign | What it means |
|---|---|
| `exit 137` / `OOMKilled: true` / "Ran out of memory" in Render Events | The instance ran out of RAM. Phase 9's numba cache fixed the known cold-start OOM, so a *new* one means something regressed (an image change that bloated memory, or a genuine traffic spike). If it can't be traced to a change, the **1 GB tier** is the next step — further tuning would need architecture changes. |
| Restart loop (spun up → died → spun up, repeatedly, in Events) | The container is crashing on start. Check **Logs** for the traceback — usually a missing data file (HF fetch produced an empty/absent file) or a bad env var. |
| Repeated `Build failed` | See the build log. If it dies at `fetch_hf_data: …` → HF token/repo problem ([§7](#7-quick-troubleshooting-reference)). If at `pip install` → a dependency/version issue. |
| CORS errors in the browser console (`blocked by CORS policy`, `No 'Access-Control-Allow-Origin'`) while the API itself responds to `curl` | `ALLOWED_ORIGINS` on the backend doesn't include the exact current frontend origin. |
| Vercel deployment `Ready` but the site shows old behaviour | A push landed on `main` instead of `Anders` (only `Anders` deploys), the branch setting changed, or a stale `VITE_API_URL` that wasn't followed by a redeploy ([§7](#7-quick-troubleshooting-reference)). |

---

## 4. Known, accepted limitations

Not bugs to re-open — deliberate current behaviour.

- **iOS Safari "Take Video" uploads don't produce an analysis.** When
  someone on iOS picks "Take Video" (or uploads a `.mov`/`.mp4` whose
  audio is in a video container), the browser cannot decode it
  client-side. After a multi-round investigation (full history in
  `CLAUDE.md`, Phase 9), the accepted outcome is: the quality check
  **fails fast and gracefully within the existing 7-second safety
  timeout** — the user sees "Could not analyze this recording's quality
  (playback should still work)" instead of a hang — and **no waveform /
  no level readout** is shown for that file. There is no client-side fix;
  a real fix would need server-side audio extraction. This was a
  deliberate decision to stop, not an unresolved defect. (The temporary
  `CAPTURE_DIAGNOSTICS` on-screen instrumentation used during that
  investigation was fully removed afterward.)
- **Render free-tier cold starts are slow (but no longer fail).** The
  free instance **sleeps after ~15 min idle**; the next visitor waits for
  a container spin-up (tens of seconds) before anything responds, and the
  first `/identify` after that adds a few seconds more for kernel load.
  Phase 9's numba cache removed the *OOM* on that cold path — it's slow,
  not broken. Treat "first request after a quiet period is slow" as
  expected on the free tier, not a regression.

---

## 5. Cost / billing reality check

Based on what's configured in the repo and `CLAUDE.md` — **verify each
directly in its dashboard**, none of this is enforced by the repo:

| Service | Expected | Confirm |
|---|---|---|
| **Render** | Deployed on the **free 512 MB tier**, $0. Sleeps when idle. Phase 7 explicitly ruled out paying for the 2 GB Standard tier. | > **CONFIRM:** no paid plan / no card on the Render account? |
| **Vercel** | Free ("Hobby") tier, $0. Static hosting only, trivial bandwidth for a personal project. | > **CONFIRM:** account is on Hobby, no Pro subscription? |
| **Hugging Face** | Free tier — a **private dataset repo** is free on HF's free plan. | > **CONFIRM:** still free, no HF billing/PRO attached, repo still private? |
| **GitHub** | Free. | > **CONFIRM:** repo visibility (public vs private) as intended. |

If a card is attached anywhere "just in case", note *why* here so a
surprise charge is diagnosable.

---

## 6. Routine check-in guide

Personal-project cadence, not enterprise monitoring.

**After any deploy (frontend or backend):**

1. Render **Events** → the deploy went `live`, no restart loop.
2. `curl https://betterchord.onrender.com/chords` → `200` + JSON.
3. Open <https://better-chord.vercel.app> → it loads, no red errors in
   the browser console.
4. One real end-to-end: **upload a short guitar `.wav`** (or the repo's
   `frontend/public/assets/Gminor_3_5_5_3_3_3.wav`) → Continue → lands on
   a Results page with voicings + songs. (Expect the first one to be slow
   if the backend was asleep.)

**Roughly monthly (or before showing it to anyone):**

- A **real-device** pass on an actual phone — not Playwright, not browser
  device-emulation. Open the live URL in real mobile Safari **and** real
  mobile Chrome and run: record a strum, upload a file, manual chord
  search, open/close the capture modal and the voicing modal, scroll the
  Results page.
- **Why real devices specifically:** across this project's history,
  Playwright and device-emulation have *repeatedly* passed while real iOS
  Safari failed — the entire video-container decode saga (§4) is exactly
  that pattern. Phase 9's mobile-fixes rounds only converged because they
  were checked on an actual phone against the live deploy, not the
  emulator. Emulator-green here means "worth checking on a phone", not
  "done".
- While you're at it: glance at Render **Metrics** for any memory creep,
  and confirm the site still hits the backend you expect (Network tab →
  requests go to the current `VITE_API_URL`).

---

## 7. Quick troubleshooting reference

| Symptom | Likely cause | Where to look / fix |
|---|---|---|
| Browser console: `blocked by CORS policy` / missing `Access-Control-Allow-Origin`, but `curl <backend>/chords` works | `ALLOWED_ORIGINS` on the backend doesn't list the exact current frontend origin (scheme + host, no path) | Render → **Environment** → fix `ALLOWED_ORIGINS`, **redeploy**. Include every origin the site is served from (apex + `www`, custom domain, any preview domain). |
| First request after a quiet period takes 20–60 s, or times out once then works | Free-tier **cold start** (spin-up from idle sleep) + first-inference kernel load | Expected on Render free (§3–4). Not a bug. If it *consistently* fails rather than just being slow → check Events for `exit 137`. |
| Vercel shows `Ready` but the site behaves like an old version | (a) the new work went to `main`, not `Anders` — only `Anders` deploys (§2); (b) the production-branch setting changed; or (c) `VITE_API_URL` was changed without a redeploy | Confirm the commit that deployed is on `Anders`. Vercel → **Settings → Git** (production branch = `Anders`) and **Environment Variables**; trigger a fresh deployment after any env change. |
| Render **Build failed** at `fetch_hf_data: downloading …` | `HF_TOKEN` invalid/expired/no read scope on the repo, or `HF_DATASET_REPO` wrong, or a file renamed on HF | Render → **Environment**: re-check `HF_TOKEN` (regenerate on HF with **Read** scope) and `HF_DATASET_REPO` (`user/repo`, must be a **dataset** repo, private). If a filename changed on HF, update the `FILES` dict in `docker/fetch_hf_data.py`. |
| Backend up but every `/identify` returns 500 | ffmpeg missing (record-path decode) or a corrupt upload — the JSON body carries `"reason": "ffmpeg_unavailable"` or `"audio_decode_failed"` | The Docker image installs ffmpeg via `apt`; if it's genuinely missing the image build changed. `audio_decode_failed` on one weird file is fine. Check Render **Logs** for the traceback. |
| Backend container crash-loops on start | A data file is missing/empty in the image (HF fetch half-failed) or a bad env var | Render **Logs** for the Python traceback; re-run the deploy (re-fetches from HF). |
| iOS user reports "it didn't work with a video" | The accepted "Take Video" limitation (§4) | Nothing to fix. It should fail *gracefully* within ~7 s with the "could not analyze" message — if it *hangs* instead, that's a real regression in the 7 s timeout, worth investigating. |

---

## 8. Retrain workflow

Not repeated here so it can't drift. The model retrain → ONNX re-export →
HF re-upload → redeploy steps live in **`DEPLOYMENT.md`**:

- [`DEPLOYMENT.md` §1 — "Retrain → re-export → re-upload workflow"](DEPLOYMENT.md)
  (`train.py` → `export_onnx.py` → upload `chord_cnn.onnx` to the private
  HF repo → redeploy the backend so its next build fetches the new file).

The live app picks up a new model **only on the next backend build/deploy**
— there is no runtime model reload.
