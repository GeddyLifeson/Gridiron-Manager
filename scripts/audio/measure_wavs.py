"""Third, independent level check for the PV-07 recipe renders (numpy only, no soundfile needed).

Reads the 16-bit WAVs that scripts/audio/render-recipes.ts wrote from Chromium and prints each
file's sample peak and loudest 400 ms RMS in dBFS, plus a pass flag against the loudness target.
    python3 -I scripts/audio/measure_wavs.py <dir>
Target values mirror packages/app-ui/src/audio/recipes/loudness.ts (an Assumption, not a fact).
"""
import pathlib, sys, wave
import numpy as np

TARGET, TOL, CEIL, WIN = -20.0, 1.5, -1.0, 0.4

def levels(path):
    with wave.open(str(path)) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32767.0
    peak = 20 * np.log10(np.max(np.abs(x)))
    idx = np.nonzero(np.abs(x) > 1e-3)[0]
    a = x[idx[0]: idx[-1] + 1]
    n = min(len(a), int(round(WIN * sr)))
    c = np.concatenate([[0.0], np.cumsum(a * a)])
    rms = 20 * np.log10(np.sqrt(np.max(c[n:] - c[:-n]) / n))
    return peak, rms

bad = 0
files = sorted(pathlib.Path(sys.argv[1]).glob('*.wav'))
for f in files:
    pk, rms = levels(f)
    ok = abs(rms - TARGET) <= TOL and pk <= CEIL
    bad += not ok
    print(f"{f.stem:32s} peak {pk:7.2f}  rms {rms:7.2f}  {'ok' if ok else 'FAIL'}")
print(f"{len(files) - bad} of {len(files)} within target")
sys.exit(1 if bad else 0)
