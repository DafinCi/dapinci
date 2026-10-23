#!/usr/bin/env python3
"""Audit the WAV sound effects in windows/sounds/.

Reads every .wav, prints its technical properties and flags anything that
would surprise a playback engine: mixed channel counts or sample rates,
clipping, a DC offset, a file that is mostly silence, or a level very
different from the others.

    python scripts/audit-sounds.py [folder]
"""
import array
import math
import os
import sys
import wave

DEFAULT_FOLDER = os.path.join("windows", "sounds")
SILENCE_DB = -60.0          # below this a sample counts as silence
CLIP_LEVEL = 0.999          # at or above this a sample counts as clipped


def decode(frames, width):
    """Raw bytes -> list of floats in [-1, 1], interleaved."""
    if width == 2:
        a = array.array("h")
        a.frombytes(frames)
        return [v / 32768.0 for v in a]
    if width == 1:
        a = array.array("B")
        a.frombytes(frames)
        return [(v - 128) / 128.0 for v in a]
    if width == 4:
        a = array.array("i")
        a.frombytes(frames)
        return [v / 2147483648.0 for v in a]
    raise ValueError(f"unsupported sample width: {width} bytes")


def db(value):
    return 20.0 * math.log10(value) if value > 0 else float("-inf")


def fmt_db(value):
    return "-inf" if value == float("-inf") else f"{value:+.1f}"


def analyze(path):
    with wave.open(path, "rb") as w:
        channels = w.getnchannels()
        rate = w.getframerate()
        width = w.getsampwidth()
        frames = w.readframes(w.getnframes())
        duration = w.getnframes() / float(rate) if rate else 0.0

    samples = decode(frames, width)
    count = len(samples)
    if count == 0:
        raise ValueError("no samples")

    peak = max(abs(s) for s in samples)
    rms = math.sqrt(sum(s * s for s in samples) / count)
    dc = sum(samples) / count
    clipped = sum(1 for s in samples if abs(s) >= CLIP_LEVEL)

    # Silence at the head and the tail, measured per block of 5 ms.
    block = max(1, int(rate * 0.005) * channels)
    threshold = 10 ** (SILENCE_DB / 20.0)
    blocks = [samples[i:i + block] for i in range(0, count, block)]
    loud = [any(abs(s) >= threshold for s in b) for b in blocks]
    lead = loud.index(True) if any(loud) else len(loud)
    trail = loud[::-1].index(True) if any(loud) else len(loud)

    return {
        "name": os.path.splitext(os.path.basename(path))[0],
        "bytes": os.path.getsize(path),
        "channels": channels,
        "rate": rate,
        "width": width,
        "duration": duration,
        "peak_db": db(peak),
        "rms_db": db(rms),
        "crest_db": db(peak) - db(rms) if rms > 0 else 0.0,
        "dc": dc,
        "clipped": clipped,
        "lead_ms": lead * 5.0,
        "trail_ms": trail * 5.0,
    }


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FOLDER
    paths = sorted(
        os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".wav")
    )
    if not paths:
        print(f"no .wav in {folder}")
        return
    results = [analyze(p) for p in paths]

    head = f"{'name':<10} {'rate':>6} {'ch':>2} {'bits':>4} {'s':>6} {'peak':>7} {'rms':>7} {'crest':>6} {'lead':>6} {'tail':>6} {'dc':>8} {'clip':>5}"
    print(head)
    print("-" * len(head))
    for r in results:
        print(
            f"{r['name']:<10} {r['rate']:>6} {r['channels']:>2} {r['width'] * 8:>4} "
            f"{r['duration']:>6.2f} {fmt_db(r['peak_db']):>7} {fmt_db(r['rms_db']):>7} "
            f"{r['crest_db']:>6.1f} {r['lead_ms']:>6.0f} {r['trail_ms']:>6.0f} "
            f"{r['dc']:>+8.5f} {r['clipped']:>5}"
        )

    print()
    rates = {r["rate"] for r in results}
    chans = {r["channels"] for r in results}
    widths = {r["width"] * 8 for r in results}
    print(f"{len(results)} files - sample rates {sorted(rates)}, channel counts {sorted(chans)}, bit depths {sorted(widths)}")

    rms_values = [r["rms_db"] for r in results]
    print(f"loudest rms {fmt_db(max(rms_values))} dB, quietest {fmt_db(min(rms_values))} dB")
    for r in results:
        flags = []
        if abs(r["dc"]) > 0.002:
            flags.append(f"dc offset {r['dc']:+.4f}")
        if r["clipped"]:
            flags.append(f"{r['clipped']} clipped samples")
        if r["lead_ms"] >= 100:
            flags.append(f"{r['lead_ms']:.0f} ms of silence at the head")
        if r["trail_ms"] >= 300:
            flags.append(f"{r['trail_ms']:.0f} ms of silence at the tail")
        if r["rms_db"] < -45:
            flags.append(f"very quiet (rms {fmt_db(r['rms_db'])} dB)")
        if flags:
            print(f"  {r['name']}: " + "; ".join(flags))


if __name__ == "__main__":
    main()
