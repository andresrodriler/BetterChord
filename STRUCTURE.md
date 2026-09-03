> This is the full local project layout, including gitignored/personal
> folders and files (e.g. `.env`, `data/spec_data`, `betterchord_mytesting/`).
> For what's actually committed/pushed to GitHub, see `README.md` instead.

```
BetterChord/
  main.py                          -- inference orchestrator (CNN -> chord -> info/voicings/songs)
  api.py                           -- FastAPI backend wrapping main.py/voicings.py/songs.py/
                                      chord_info.py (run: uvicorn api:app --reload). Five endpoints:
                                      /chords (autocomplete + root aliases), /identify,
                                      /voicings/{chord}, /chord-info/{chord} (interval breakdown,
                                      quality description, root/bass/quality alt-spellings,
                                      quality synonyms -- Phase 5 Part 2/7), /songs/{chord}
  requirements-gpu.txt              -- local dev, CUDA GPU
  requirements-cpu.txt              -- CPU-only, training + ONNX export (has torch)
  requirements-deploy.txt          -- Phase 7: runtime-only deps for the deployed
                                      backend image -- requirements-cpu.txt minus
                                      torch/torchaudio/torchvision and minus
                                      matplotlib/pandas, plus onnxruntime (the
                                      container runs CNN inference via ONNX)
  LICENSE                           -- MIT
  TODO.md
  README.md
  STRUCTURE.md                     -- this file
  Dockerfile                       -- Phase 7/9: 2-stage backend image (stage 1 fetches
                                      the private HF data files in isolation so
                                      HF_TOKEN never lands in a layer; stage 2 is the
                                      API runtime -- ffmpeg via apt, requirements-
                                      deploy.txt, thread-cap ENV vars, a baked numba
                                      compile-cache, uvicorn api:app on $PORT). Live on
                                      Render's free tier (CLAUDE.md Phase 9).
  .dockerignore                     -- trims the build context; excludes the large
                                      local data files so the container fetches fresh
  DEPLOYMENT.md                     -- Phase 7/9: dashboard checklist + env vars for the
                                      Render backend and Vercel frontend (both live);
                                      retrain -> re-export -> re-upload chord_cnn.onnx
                                      workflow
  OPERATIONS.md                     -- ongoing upkeep of the deployed app (what to check
                                      after a deploy, Render Events tab, CORS/env-var
                                      triggers, known limitations, cost check, monthly
                                      real-device pass); complements DEPLOYMENT.md's
                                      one-time setup
  docker/
    fetch_hf_data.py                -- Phase 7: build-time script the Dockerfile's
                                      stage 1 runs -- downloads chord_cnn.onnx,
                                      voicings.db, betterchord_songs.db from the
                                      private HF dataset repo to their real paths
  betterchord/
    .env                           -- local secrets (gitignored, not committed)
    config/                        -- live-serving modules
      chord_parser.py, interval_calculator.py, music_theory.py,
      chord_info.py, voicings.py, songs.py, audio_processing.py
      (audio_processing.py lives here, not training_scripts/ -- it's on
      the live inference path via main.py/api.py, not training-only)
    training_scripts/               -- CNN training pipeline, not used at runtime
      cnn_model.py, chord_to_notes.py, database.py, train.py, chord_cnn.pth
      export_onnx.py                -- Phase 7: one-time-per-training-run export of
                                      chord_cnn.pth -> chord_cnn.onnx (torch.onnx.export)
                                      with a built-in numerical-equivalence check;
                                      re-run after every retrain
      chord_cnn.onnx                -- Phase 7: converted copy of chord_cnn.pth's
                                      weights, run by onnxruntime with no torch dep;
                                      what the deployed image uses. Gitignored (large
                                      derived artifact, lives on the private HF repo)
    data_scripts/                   -- registry/maintenance pipeline, rerun when data changes
      registry_builder.py, guide_tone_grouping.py, build_normalized_columns.py
  data/
    voicing_data/voicings.db, voicings.sql, voicings10row.csv -- voicings10row csv for schema understanding
    song_data/betterchord_songs.db, songs_10rows.csv -- songs_10rows for schema understanding
    registry/quality_registry.json, guide_tone_groups.json
    spec_data/, noise_bank/, training_data/, test_data/, betterchord_mytesting/  -- all gitignored, regenerable/personal
  test_scripts/                     -- personal test scripts, not part of the live pipeline
    test_audio_file.py, test_chords.py
  frontend/                         -- React 19 + Vite SPA
    index.html, vite.config.js, package.json
    .env.example                    -- Phase 7: documents VITE_API_URL (the deployed
                                       backend origin, read at build time by
                                       src/lib/api.js); real value set in the host's
                                       dashboard, not committed
    CHORD_INFO_AUDIT.md              -- chord_info.py data-coverage audit that fed the
                                         Chord Overview card (Phase 5 Part 2/7)
    NOTE_STYLE_GUIDE.md              -- wording/terminology/ordering rules for every
                                         "extra note" family app-wide (Phase 5 Part 2/7)
    RESULTS_ENTRY_PATHS.md           -- the 4 real ways to reach Results (dropdown pick,
                                         typed+submit, direct URL, audio-ID) and which
                                         notes should/shouldn't fire on each (Phase 5 Part 2/7)
    src/
      main.jsx, App.jsx, App.css, index.css   -- app shell, design-system tokens
      pages/       Home.jsx/.css, Results.jsx/.css, About.jsx/.css,
                    HowItWorks.jsx/.css, NotFound.jsx   -- catch-all 404
                                                           (path="*"), inline
                                                           styles only, no .css
      components/  CapturePanel.jsx/.css       -- unified upload/drag-drop/record/search
                    CaptureModal.jsx/.css       -- record/preview overlay (preview body stays
                                                   mounted -- blurred -- under a floating
                                                   loading card while identifying; see
                                                   IdentifyingStatus below -- Phase 5 Part 3/7)
                    Waveform.jsx/.css           -- Phase 5 Part 3/7: canvas waveform + custom
                                                   transport for the preview's audio -- click/
                                                   drag-to-seek playhead, dB-scale bar heights
                                                   (adaptive ceiling, fixed floor) with QUIET/
                                                   CLIP reference lines, copper loudness-ramp
                                                   bar coloring (--loudness-* tokens, index.css)
                                                   relative to each clip's own range, --scan
                                                   reserved for the true signature peak,
                                                   devicePixelRatio-aware canvas sizing
                    RecordingInfo.jsx/.css      -- Phase 5 Part 3/7: recording-quality status
                                                   card (OK/quiet/clipping, dB via
                                                   lib/audioUnits.js) + device/format/channel
                                                   readout row, replaces the old plain quality text
                    IdentifyingStatus.jsx/.css  -- Phase 5 Part 3/7: pulse-dots + rotating
                                                   real-pipeline fact shown in CaptureModal's
                                                   floating loading card while /identify runs
                    ManualSearch.jsx/.css       -- autocomplete search input
                    FretboardDiagram.jsx/.css   -- per-voicing chord diagram
                    IntervalLegend.jsx/.css     -- interval-color swatch legend
                    VoicingModal.jsx/.css       -- click-to-expand voicing detail; Phase 5
                                                   Part 4/7: two-column layout, diagram left
                                                   (unchanged size) + ChordTonePanel right
                                                   (700px wide modal, fixed regardless of chord)
                    ChordTonePanel.jsx/.css     -- Phase 5 Part 4/7: chord-tones column, one
                                                   compact row per structural degree (Root/3rd-
                                                   or-sus/5th/7th/9th/11th/13th, +Bass for slash
                                                   chords) -- ALL 7 always render, degrees
                                                   outside this chord's own formula in a
                                                   visually smaller/muted tier vs. degrees the
                                                   formula uses. Filled-tone chips reuse
                                                   FretboardDiagram.css's own
                                                   .interval-dot--<bucket> glow classes, same
                                                   interval-bucket colors as the fretboard dots
                                                   (lib/intervalColors.js). Slot data itself
                                                   (lib/chordTones.js's buildAllToneSlots/
                                                   buildBassSlot) is layout-agnostic, kept
                                                   reusable for a possible future layout variant
                    ChordOverview.jsx/.css      -- Phase 5 Part 2/7: "Chord Overview" card
                                                   (interval breakdown/notes/formula, "Why
                                                   this spelling?", "Similar Chords" --
                                                   synonyms + guide-tone overlaps), positioned
                                                   above the Voicings/Songs grid on Results
                    ChordName.jsx               -- Phase 5 Part 2/7: shared .readout-styled
                                                   chord-name span, the one place that
                                                   treatment is applied
                    SongCard.jsx/.css           -- collapsed/expand song list card
                                                   (rich media, UG info, capo-shape/
                                                   enharmonic "why differs" note --
                                                   Phase 4)
                    SongFilters.jsx/.css        -- Phase 5 Part 5/7: collapsible artist/genre/
                                                   capo/album-release-year filters above the
                                                   Songs panel list, client-side against the
                                                   already-fetched song list (lib/songFilters.js)
                    AmbientFretboards.jsx/.css  -- Phase 5 Part 6/7, 5th-9th follow-ups:
                                                   purely decorative, aria-hidden scattered
                                                   fretboard sketches behind Home (data-driven,
                                                   generated at module scope via
                                                   generateShapes() -- stratified sampling +
                                                   skewedRandom() density gradient + real
                                                   minimum-spacing rejection sampling, not a
                                                   hardcoded shape list). Positioned relative to
                                                   Home.jsx's `.home-page` wrapper, negative
                                                   z-index. See CLAUDE.md's Phase 5 Part 6/7
                                                   entry for the forward-looking note about
                                                   possibly swapping to real voicing data once
                                                   vertical fretboard orientation lands
                    DetectionBadge.jsx/.css     -- Phase 5 Part 6/7: "BetterChord detected X!"
                                                   pulsing scan-dot + sonar-ripple + animated
                                                   bar flourish on Results, replaces the old
                                                   static .badge markup for the fromAudio case
      context/     CaptureContext.jsx, FretboardPrefsContext.jsx           -- capture/record/upload state + fretboard phase
      lib/         api.js               -- backend fetch calls, incl. cached getChords(),
                                            getChordInfo() (Phase 5 Part 2/7)
                    fretParser.js        -- voicing -> svguitar chord-diagram config
                    chordAlias.js        -- enharmonic-alias normalization (root AND bass --
                                            normalizeAliases), alt-spelling/synonym sentence
                                            builders for the Chord Overview card
                    renderChordNote.jsx  -- Phase 5 Part 2/7: shared backtick-to-ChordName
                                            text renderer, used by every "extra note" family
                    intervalColors.js    -- interval -> color/bucket classification
                    chordTones.js        -- Phase 5 Part 4/7: shared "what functional slots
                                            does this chord's formula have" logic
                                            (formulaTones/omittedTones/presentToneLabels,
                                            used by VoicingModal.jsx's omitted-tones sentence;
                                            buildAllToneSlots/buildBassSlot, the layout-agnostic
                                            data model ChordTonePanel.jsx renders -- ALL 7
                                            canonical degrees always, tiered primary/muted by
                                            whether this chord's own formula uses each one)
                    useAlbumThumb.js     -- Phase 4: album-art fetch/retry/blob-URL
                                            hook, works around a Deezer CDN
                                            placeholder-redirect issue (see
                                            CLAUDE.md's Phase 4 entry)
                    audioUnits.js        -- Phase 5 Part 3/7: shared amplitude<->dB
                                            conversion (amplitudeToDbClamped, formatDb),
                                            used by both Waveform.jsx and RecordingInfo.jsx
                                            so the two can't disagree on the same value
                    identifyFacts.js     -- Phase 5 Part 3/7: real pipeline facts (condensed
                                            from HowItWorks.jsx) rotated by IdentifyingStatus
                                            while /identify is in flight
```