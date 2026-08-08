> This is the full local project layout, including gitignored/personal
> folders and files (e.g. `.env`, `data/spec_data`, `betterchord_mytesting/`).
> For what's actually committed/pushed to GitHub, see `README.md` instead.

```
BetterChord/
  main.py                          -- inference orchestrator (CNN -> chord -> info/voicings/songs)
  api.py                           -- FastAPI backend wrapping main.py/voicings.py/songs.py
                                      (run: uvicorn api:app --reload). Three endpoints:
                                      /identify, /voicings/{chord}, /songs/{chord}
  requirements-gpu.txt              -- local dev, CUDA GPU
  requirements-cpu.txt              -- CPU-only / deployment
  LICENSE                           -- MIT
  TODO.md
  README.md
  betterchord/
    .env                           -- local secrets (gitignored, not committed)
    config/                        -- live-serving modules
      chord_parser.py, interval_calculator.py, music_theory.py,
      chord_info.py, voicings.py, songs.py, audio_processing.py
      (audio_processing.py lives here, not training_scripts/ -- it's on
      the live inference path via main.py/api.py, not training-only)
    training_scripts/               -- CNN training pipeline, not used at runtime
      cnn_model.py, chord_to_notes.py, database.py, train.py, chord_cnn.pth
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
    src/
      main.jsx, App.jsx, App.css, index.css   -- app shell, design-system tokens
      pages/       Home.jsx/.css, Results.jsx/.css, About.jsx/.css,
                    HowItWorks.jsx/.css
      components/  CapturePanel.jsx/.css       -- unified upload/drag-drop/record/search
                    CaptureModal.jsx/.css       -- record/preview overlay
                    ManualSearch.jsx/.css       -- autocomplete search input
                    FretboardDiagram.jsx/.css   -- per-voicing chord diagram
                    IntervalLegend.jsx/.css     -- interval-color swatch legend
                    VoicingModal.jsx/.css       -- click-to-expand voicing detail
                    SongCard.jsx/.css           -- collapsed/expand song list card
                                                   (rich media, UG info, capo-shape/
                                                   enharmonic "why differs" note --
                                                   Phase 4)
      context/     CaptureContext.jsx, FretboardPrefsContext.jsx           -- capture/record/upload state + fretboard phase
      lib/         api.js               -- backend fetch calls, incl. cached getChords()
                    fretParser.js        -- voicing -> svguitar chord-diagram config
                    chordAlias.js        -- enharmonic-alias normalization + captions
                    intervalColors.js    -- interval -> color/bucket classification
                    useAlbumThumb.js     -- Phase 4: album-art fetch/retry/blob-URL
                                            hook, works around a Deezer CDN
                                            placeholder-redirect issue (see
                                            CLAUDE.md's Phase 4 entry)
      assets/      hero.png (unused leftovers: react.svg, vite.svg from the Vite template)
```