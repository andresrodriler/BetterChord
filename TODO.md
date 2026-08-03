## Status
- Full pipeline works end to end: audio -> spectrogram -> CNN -> chord identification -> theory info + voicings + matching songs
- CNN predicts note/root/bass vectors (not fixed chord classes), so identify_chord_smart can theoretically name any chord whose interval pattern is in the registry, not just what it was explicitly trained on
- Chord quality registry reconciles music_theory.py, voicings.db, and the songs database against each other (all three used to drift and disagree on chord naming, now single source of truth)
- Voicings.db has strong coverage across quality/root/inversion combinations. All popular important chords are covered completely.
- Guide-tone explanation feature: when a search pulls in a closely related chord (e.g. C13 also shows C7add13 songs), there's now an actual explanation of why, written for someone who doesn't know music theory
- main.py ties the whole thing together as one callable pipeline
- Directory reorg done: config/ (live-serving), training_scripts/ (CNN training), data_scripts/ (registry maintenance)

## To do

**Frontend + backend (the big one)**
- Wrap main.py's pipeline in a real FastAPI backend (endpoints for identify / voicings / songs)
- React frontend -- record audio in-browser (MediaRecorder), show identified chord + fretboard + songs
- Allow multiple audio formats? Instructions for downloading ffmpeg for people who want to use M4A/MP4. Or maybe if user inputs either, pipeline could convert it into a WAV file?
- Deploy: frontend on Vercel/Netlify, backend on Railway/Render/Fly.io

**Data**
- If someone does want to download the github repo, it has everything needed except the data used. Next step for someone to be able to completely replicate my model from scratch with my repo is posting my data (training/test data, voicing data, song data, essentially everything data related) on something like Kaggle. I can then link it in my github to instruct that there is the data for my project (Need to be careful on how its posted, concerns with copyright).

**UX**
- ffmpeg missing popup -- if a user doesn't have ffmpeg locally, show something like Audacity's "unsupported format" popup with a quick pointer on where to grab it, instead of just failing

**Later / nice to have**
- Wire the guide-tone explanation text into the actual UI (bold the two chord names, currently just returned as plain text + a list of what to bold)
- Make the model even better, more data (biggest thing that can help), tweaking the model a bit, messing with CNN layers, etc.
