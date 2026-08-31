"""Pre-compile librosa's numba kernels into $NUMBA_CACHE_DIR at Docker build
time, so the first /identify request loads them from disk instead of running
an ~18 s LLVM compile that also leaves ~100+ MiB resident -- the transient
that OOM-kills a 512 MB instance on cold start.

Runs the real load_audio + create_spectrogram on a synthetic 2.75 s clip.
The compiled artifacts numba caches are keyed on argument *types*, not data,
so a synthetic signal compiles the identical set the real /identify path
does (verified: same 54 cache files, same function identities).

numba's on-disk cache is only reused if the *source stamp* -- (st_mtime,
st_size) of the module the jitted function lives in -- matches. A build-time
compile captures librosa's .py mtimes with sub-second precision; the image
layer that ships them truncates to whole seconds, so at runtime the stamp
no longer matches and every kernel recompiles anyway (verified: 0 hits).
Fix: pin every librosa .py mtime to a fixed whole second here, before
compiling, so the stamp stored in the cache survives the layer round-trip.

Requires NUMBA_CACHE_DIR to be set (the Dockerfile sets it) and
NUMBA_CPU_NAME=generic (also the Dockerfile) so the cache key carries no
host-CPU features and the baked cache is valid on whatever host runs the
image. Exits non-zero if nothing got written, so a broken warm-up fails
the build rather than silently shipping a no-op.
"""
import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_REPO, "betterchord", "config"))
sys.path.insert(0, os.path.join(_REPO, "betterchord", "training_scripts"))

cache_dir = os.environ.get("NUMBA_CACHE_DIR")
if not cache_dir:
    sys.exit("warmup_numba: NUMBA_CACHE_DIR is not set.")
os.makedirs(cache_dir, exist_ok=True)

import numpy as np
import soundfile as sf
import librosa

# Fixed whole-second mtime for every librosa source file (2024-01-01 UTC).
# Whole second => nothing for the image layer's tar to truncate => the
# source stamp numba records now still matches at runtime.
_PINNED_MTIME = 1704067200
_librosa_root = os.path.dirname(librosa.__file__)
_pinned = 0
for root, _dirs, files in os.walk(_librosa_root):
    for name in files:
        if name.endswith(".py"):
            os.utime(os.path.join(root, name), (_PINNED_MTIME, _PINNED_MTIME))
            _pinned += 1

from audio_processing import load_audio, create_spectrogram

SR = 22050
DUR = 2.75


def _synth_clip():
    t = np.linspace(0.0, DUR, int(SR * DUR), endpoint=False)
    sig = np.zeros_like(t)
    for f in (98.0, 146.83, 196.0, 246.94, 293.66):  # a low guitar-ish stack
        sig += np.sin(2 * np.pi * f * t) / f * 60.0
    env = np.exp(-t * 2.5)
    attack = int(SR * 0.05)
    env[:attack] *= np.linspace(0.0, 1.0, attack)
    sig = sig * env + np.random.RandomState(0).randn(t.size) * 0.002
    return (sig / np.max(np.abs(sig)) * 0.7).astype(np.float32)


with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, "warmup.wav")
    sf.write(wav, _synth_clip(), SR, subtype="PCM_16")
    y, sr = load_audio(wav)
    spec = create_spectrogram(y, sr)

n = sum(
    1
    for root, _dirs, files in os.walk(cache_dir)
    for name in files
    if name.endswith((".nbc", ".nbi"))
)
size = sum(
    os.path.getsize(os.path.join(root, name))
    for root, _dirs, files in os.walk(cache_dir)
    for name in files
)
print(
    f"warmup_numba: pinned {_pinned} librosa .py mtimes, "
    f"spectrogram {spec.shape}, {n} numba cache files, {size / 1024:.0f} KiB "
    f"in {cache_dir}",
    flush=True,
)
if n == 0:
    sys.exit("warmup_numba: no numba cache files were written -- warm-up failed.")
