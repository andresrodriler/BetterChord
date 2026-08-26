## Status
- Full pipeline works end to end: audio -> spectrogram -> CNN -> chord identification -> theory info + voicings + matching songs
- CNN predicts note/root/bass vectors (not fixed chord classes), so identify_chord_smart can theoretically name any chord whose interval pattern is in the registry, not just what it was explicitly trained on
- Chord quality registry reconciles music_theory.py, voicings.db, and the songs database against each other (all three used to drift and disagree on chord naming, now single source of truth)
- Voicings.db has strong coverage across quality/root/inversion combinations. All popular important chords are covered completely.
- Guide-tone explanation feature: when a search pulls in a closely related chord (e.g. C13 also shows C7add13 songs), there's now an actual explanation of why, written for someone who doesn't know music theory
- main.py ties the whole thing together as one callable pipeline
- Directory reorg done: config/ (live-serving), training_scripts/ (CNN training), data_scripts/ (registry maintenance)
- FastAPI backend (api.py) done -- /identify, /voicings/{chord}, /songs/{chord}, all tested against real data, consistent 400/404/200 responses
- Browser audio recording confirmed working end to end -- real human test, real mic, real browser, real network request, correct chord at 98.6% confidence. Fixed getUserMedia's default voice-call audio processing (echo cancellation/noise suppression/auto-gain, all default on and all bad for capturing a guitar chord) and bumped MediaRecorder's bitrate, both measurably improved results
- ffmpeg's existing librosa/audioread fallback handles WebM/Opus (what the browser records) the same way it already handled M4A -- confirmed, no new conversion code needed, as long as ffmpeg is actually installed and on PATH

## To do

**Frontend + backend (the big one)**
- Build the actual UI on top of the now-proven recording pipeline: show the identified chord + fretboard voicings + matching songs, instead of raw JSON dumped on the page
- API_URL is currently hardcoded to 127.0.0.1:8000 in App.jsx -- needs to become configurable (env variable) before deployment, otherwise every real visitor's browser tries to reach their own machine instead of the actual backend
- Deploy: frontend on Vercel/Netlify, backend on Railway/Render/Fly.io
- Whatever backend host gets picked needs ffmpeg actually available in its environment -- pip install can't install it, it's a system-level dependency, not a Python package. Probably needs a Dockerfile step or checking if the platform supports system packages some other way. Same dependency just fixed locally, will need solving again for deployment

**Data**
- If someone does want to download the github repo, it has everything needed except the data used. Next step for someone to be able to completely replicate my model from scratch with my repo is posting my data (training/test data, voicing data, song data, essentially everything data related) on something like Kaggle. I can then link it in my github to instruct that there is the data for my project (Need to be careful on how its posted, concerns with copyright).
- Separately from the raw data: decide whether to publish chord_cnn.pth
  (the trained model weights) so people can use the current model
  without retraining. Lower technical risk than publishing raw data, but
  legal status of publishing weights trained on external datasets
  (HF/IDMT/GADA) is unresolved -- check each dataset's actual license
  terms for model-weight redistribution before deciding. See CLAUDE.md's
  Phase 8 entry for full reasoning.

**UX**
- ffmpeg missing popup -- if a user doesn't have ffmpeg locally, show something like Audacity's "unsupported format" popup with a quick pointer on where to grab it, instead of just failing. (This is a real, confirmed failure mode, not theoretical -- hit this exact thing testing Phase 1 before ffmpeg was installed)

**Later / nice to have**
- Wire the guide-tone explanation text into the actual UI (bold the two chord names, currently just returned as plain text + a list of what to bold) -- formally scoped as **Phase 3 Part 3/6**, see CLAUDE.md's Phase 3 entry, not started (This is now done with Phase 3 part 3/6)
- Make the model even better, more data (biggest thing that can help), tweaking the model a bit, messing with CNN layers, etc.
- No handling yet for denied mic permission (fails silently, no on-page feedback) or cleanup if a user navigates away mid-recording (mic stream could stay open) -- fine for the Phase 1 test page, worth real handling once Phase 2 builds the actual UI
- ~~Surface `chord_info.py`'s dormant chord-info data (interval
  breakdown, per-quality "feeling" description, related chords) in the
  actual UI~~ -- **substantially done.** What started as a Phase 5 Part
  2/7 Step 0 finding (real, already-computed data that never reached
  the frontend -- no endpoint exposed it for manual search, and the one
  path that did compute it discarded the result before navigating) grew
  into that part's main body of work across several rounds: a new
  `/chord-info` endpoint, and a "Chord Overview" card on Results
  showing the interval breakdown, notes, quality description/"feeling",
  root/bass/quality alt-spelling explanations ("Why this spelling?"),
  and a unified "Similar Chords" list (true quality synonyms +
  guide-tone overlap relationships, each with a real theory
  explanation, decoupled from song-data availability). See CLAUDE.md's
  Phase 5 Part 2/7 entry for the full build/fix history.
  **Still genuinely open, not done**: `chord_info.py`'s `related` dict
  (relative minor/parallel/tritone-sub/"resolves from (V7)"/simpler-
  version) remains deliberately unwired -- considered and explicitly
  excluded from the Chord Overview card across multiple rounds, not an
  oversight. Also still open: `voicings.py`'s dormant `fallback`/
  `translated`/`displayed`/`translated_from` fields, returned by
  `GET /voicings/{chord}` but referenced by zero frontend code
  (confirmed via a full `frontend/src` grep) -- a genuinely separate
  surface from the chord-info work above, never addressed by it. Both
  remaining pieces were re-confirmed still-open when Phase 5 Part 2/7
  closed; if picked up later, they'd most naturally land under Part
  4/7 ("voicings & VoicingModal enhancements") rather than a new part.

**Phase 3 UI polish (deferred from Phase 2 on purpose)**
- ~~Real-time autocomplete on the manual chord search input~~ -- done,
  see CLAUDE.md's Phase 3 Part 4/6 entry for full detail (two-pass
  prefix/substring matching, enharmonic-alias-aware, `/chords` endpoint,
  new `chordAlias.js`)
  -- formally scoped as **Phase 3 Part 4/6**, not started
- ~~Actual visual design pass on Home/Results~~ -- done, see CLAUDE.md's
  Phase 3 Part 1/6 entry for the full history (design direction changed
  from the original navy/sienna spec below to a warm brown/brass/moss
  re-skin partway through -- CLAUDE.md has the real, current palette,
  this entry is kept only so old context still makes sense: original
  spec was navy base + burnt sienna accent family
  (#E35336/#F5F5DC/#F4A460/#A0522D), skeuomorphic Teenage-Engineering-
  style UI, monospace touches for chord names/confidence readouts, red
  circular record button)
- ~~Comprehensive fretboard diagram polish once the basic library-based
  rendering is proven in Phase 2~~ -- done, see CLAUDE.md's Phase 3
  Part 2/6 entry. Follow-up polish (interval-colored dots, in-dot
  interval labels, omitted-interval notes, dropping the redundant
  base-fret/capo pills) -- done, see CLAUDE.md's Phase 3 Part 5/6 entry.
  Site chrome (persistent header, About/How-it-works/GitHub pages) --
  done, see CLAUDE.md's Phase 3 Part 6/6 entry. **Phase 3 is fully closed.**

**Site chrome**
- A slim footer for the bottom of every page. Raised during a Phase 5
  Part 6/7 Results follow-up session (real trigger: once the bottom-of-
  page mini capture panel moved into the header row and the panel-height
  fix landed, nothing renders below the Voicings/Songs row on Results
  anymore -- the page just ends). **This is new-feature scope, not part
  of the visual-fidelity pass** -- no mockup shows a footer for this
  exact page state, this is a genuinely new idea raised in chat, not a
  mockup-fidelity gap being tracked in `RESULTS_VISUAL_FIDELITY_OPEN_ITEMS.md`.
  Deliberately scoped SMALL -- discussed and explicitly rejected: a full
  sitemap-style, multi-column link-directory footer. BetterChord doesn't
  have the page count or site scale that would justify one (three real
  pages beyond Home/Results: About, How It Works, and the GitHub link,
  all of which already live in the top nav). What's actually proposed: a
  single slim row, same content on every page --
  - The same two links already in the top nav (About, How It Works) --
    genuinely useful to repeat at the bottom of a long Results page,
    where the top nav has long since scrolled out of view.
  - A GitHub link -- real value here specifically: someone who just used
    a chord-ID tool and is curious how it works is a plausible audience
    for "here's the actual code," more so than on a typical marketing
    site's footer.
  - A one-line copyright/made-by credit.
  No Legal/license line yet -- deliberately deferred, not forgotten.
  Would become a real, meaningful thing to add only once Phase 8
  (Publishing/release decisions, see CLAUDE.md's own Phase 8 entry)
  actually resolves the open data/model-weight licensing questions;
  adding a Legal link now would either be blank or premature.

**Phase 4 rich media (done)**
- Album art, artist image, Spotify embed playback, YouTube embed
  (confidence-gated), UG capo/key/tuning display, plus several follow-up
  passes: a real crushed-card CSS bug fix, a 4-item polish batch (Spotify
  embed white space, high-volume load performance via incremental
  rendering, genre/key/capo chips, UG-vote-count sorting), a Deezer
  album-art placeholder-routing investigation + retry/fallback hook, 12
  stale Mac DeMarco YouTube link corrections, and a capo-shape/
  enharmonic-normalization "why does this differ from UG?" transparency
  note. See CLAUDE.md's Phase 4 entry for full detail (multiple real
  bugs found and fixed along the way, not just the initial build).
  **Phase 4 is fully closed.**
- Deferred on purpose, not forgotten: a "chords used in this song" list/
  dropdown (showing every chord a song uses, not just the one matched/
  searched chord) -- discussed during Phase 4 but explicitly out of
  scope for the capo-shape/normalization transparency note above. Real,
  intended future item; not yet scoped (which chords, what UI, whether
  it reuses `all_chords`/`normalized_all_chords` the same way the
  transparency note does).


- Whether someone uploads a file or records live, show them feedback on
  what was actually captured: a waveform/spectrogram visualization, and
  the ability to listen back before submitting
- Establish some agreed-upon signal-quality threshold (e.g. amplitude/
  SNR-based) -- if a recording falls below it, show a note like "this
  recording may be less accurate, possibly due to X" rather than just
  returning a low-confidence result with no context
- Motivated by a real Phase 1 finding: audio quality at the point of
  capture (mic quality, distance, volume, whether the guitar is plugged
  in or acoustic, etc.) has a real, measurable effect on accuracy --
  worth investigating further which factors matter most, and worth
  giving users visibility into their own recording quality rather than
  just a black-box result