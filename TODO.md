## Status 
- Project structure
- Audio loading with onset detection (uses strongest onset)
- Test script for validating audio files
- Handles M4A/MP4 files with librosa + audioread + ffmpeg

## to do
- ffmpeg is a local machine library, so ppl who donnt have it downloaded ccan use a lot of audio format files
   - Idea is to in audio processing if they dont have it, to show pop uop (similar to audacity) where it says
   - they are using an unsupported audio format (like mp4) sinnce they domt have ffmpeg, and to give directions
   - or pointer of where to go to download quick
- Either user drags audio file into box to input audio, chooses it via prompt (puts them in finder or something), or record their guitar with a play button right there
- For ML, download
 - Hugging Face DB, Data -> Train, Each chord variation, download 1 - 6, 10 - 15, 19 - 24