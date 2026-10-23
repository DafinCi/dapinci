#!/usr/bin/env python3
"""DapinCi Playful Sound Generator (DSP Synthesis).

Generates all 29 UI sound effects for Ipin (the mochi slime mascot)
plus variant options (A, B, C) for customizable sounds.
Uses pure Python standard library: 48 kHz, 16-bit, stereo WAV.
"""

import argparse
import array
import math
import os
import random
import wave

SR = 48000
FLOOR = 0.0001


# ── Envelope Generators ───────────────────────────────────────────────────────

def env_exp(t, attack, duration, gain):
    """Exponential attack and decay."""
    if t >= duration or gain == 0.0:
        return 0.0
    base = FLOOR / abs(gain)
    if t < attack:
        return gain * (base ** (1.0 - t / max(1e-5, attack)))
    return gain * (base ** ((t - attack) / max(1e-5, duration - attack)))


def env_percussive(t, duration, gain, curve=3.5):
    """Snappy percussive decay envelope."""
    if t >= duration:
        return 0.0
    p = t / duration
    att = min(1.0, t / 0.0015)
    return gain * att * math.exp(-curve * p)


# ── Synthesis Primitives ──────────────────────────────────────────────────────

def tone(buf, f, to=None, d=0.2, g=0.1, a=0.006, delay=0.0, vib=0.0, vibf=6.0,
         partials=[(1.0, 1.0, 1.0)]):
    """Standard additive tone with optional pitch glide, vibrato, and partials."""
    start = int(delay * SR)
    n = int(d * SR)
    for mult, pgain, share in partials:
        phase = 0.0
        pd = max(a + 0.01, d * share)
        for i in range(n):
            t = i / SR
            k = (to / f) ** (t / d) if to else 1.0
            freq = f * mult * k
            if vib:
                freq += vib * math.sin(2.0 * math.pi * vibf * t)
            phase += 2.0 * math.pi * freq / SR
            j = start + i
            if j < len(buf):
                buf[j] += math.sin(phase) * env_exp(t, a, pd, g * pgain)


def bubble(buf, f_start, f_end, d=0.12, g=0.08, delay=0.0, curvature=4.5, wet_harmonics=True):
    """
    Physical model of a liquid bubble / water drop.
    Rapid exponential pitch curve with harmonic bubble resonance.
    """
    start = int(delay * SR)
    n = int(d * SR)
    phase1 = 0.0
    phase2 = 0.0
    for i in range(n):
        t = i / SR
        p = t / d
        freq = f_end + (f_start - f_end) * math.exp(-curvature * p)
        phase1 += 2.0 * math.pi * freq / SR
        amp = env_percussive(t, d, g, curve=3.8)
        
        sample = math.sin(phase1) * amp
        if wet_harmonics:
            phase2 += 2.0 * math.pi * (freq * 1.85) / SR
            sample += math.sin(phase2) * (amp * 0.22 * math.exp(-6.0 * p))
            
        j = start + i
        if j < len(buf):
            buf[j] += sample


def squish(buf, f_start=340, f_low=130, f_rebound=165, d=0.18, g=0.1, delay=0.0):
    """
    Gelatinous mochi slime squish.
    Fast pitch drop under pressure, then slight elastic rebound.
    """
    start = int(delay * SR)
    n = int(d * SR)
    phase = 0.0
    t_drop = min(0.045, d * 0.3)
    for i in range(n):
        t = i / SR
        if t < t_drop:
            p = t / t_drop
            freq = f_start + (f_low - f_start) * (p ** 1.8)
        else:
            p = (t - t_drop) / (d - t_drop)
            freq = f_low + (f_rebound - f_low) * math.sin(p * math.pi * 0.5)
            
        phase += 2.0 * math.pi * freq / SR
        amp = env_exp(t, 0.003, d, g)
        sample = (math.sin(phase) + 0.3 * math.sin(phase * 2.0) - 0.1 * math.cos(phase * 3.0)) * amp
        j = start + i
        if j < len(buf):
            buf[j] += sample


def sparkle(buf, f_base, d=0.18, g=0.05, delay=0.0):
    """
    Crystalline sparkle twinkle (micro-chime + star glitter).
    """
    start = int(delay * SR)
    n = int(d * SR)
    p1 = p2 = p3 = 0.0
    for i in range(n):
        t = i / SR
        f1 = f_base * (1.0 + 0.15 * math.sin(2.0 * math.pi * 14.0 * t))
        f2 = f_base * 1.5 * (1.0 + 0.1 * math.cos(2.0 * math.pi * 18.0 * t))
        f3 = f_base * 2.3
        
        p1 += 2.0 * math.pi * f1 / SR
        p2 += 2.0 * math.pi * f2 / SR
        p3 += 2.0 * math.pi * f3 / SR
        
        amp = env_exp(t, 0.002, d, g)
        sample = (math.sin(p1) * 0.6 + math.sin(p2) * 0.3 + math.sin(p3) * 0.15) * amp
        j = start + i
        if j < len(buf):
            buf[j] += sample


def cute_vowel(buf, f0_start, f0_end, f1, f2, d=0.4, g=0.06, delay=0.0, vib=4.0, vibf=5.0):
    """
    Cute formant synthesis (mochi vocalization).
    """
    start = int(delay * SR)
    n = int(d * SR)
    q = 5.0
    bw1 = f1 / q
    bw2 = f2 / q
    
    x1_1 = x2_1 = y1_1 = y2_1 = 0.0
    x1_2 = x2_2 = y1_2 = y2_2 = 0.0
    
    w0_1 = 2.0 * math.pi * f1 / SR
    w0_2 = 2.0 * math.pi * f2 / SR
    alpha1 = math.sin(w0_1) * math.sinh(math.log(2.0) / 2.0 * bw1 * w0_1 / math.sin(w0_1))
    alpha2 = math.sin(w0_2) * math.sinh(math.log(2.0) / 2.0 * bw2 * w0_2 / math.sin(w0_2))
    
    b0_1, b2_1 = alpha1, -alpha1
    a0_1 = 1.0 + alpha1
    a1_1 = -2.0 * math.cos(w0_1)
    a2_1 = 1.0 - alpha1
    
    b0_2, b2_2 = alpha2, -alpha2
    a0_2 = 1.0 + alpha2
    a1_2 = -2.0 * math.cos(w0_2)
    a2_2 = 1.0 - alpha2
    
    phase = 0.0
    for i in range(n):
        t = i / SR
        p = t / d
        f0 = f0_start + (f0_end - f0_start) * (p ** 1.2)
        if vib:
            f0 += vib * math.sin(2.0 * math.pi * vibf * t)
        phase += 2.0 * math.pi * f0 / SR
        
        pulse = math.sin(phase) + 0.5 * math.sin(2.0 * phase) + 0.25 * math.sin(3.0 * phase)
        
        y_f1 = (b0_1 * pulse + b2_1 * x2_1 - a1_1 * y1_1 - a2_1 * y2_1) / a0_1
        x2_1, x1_1 = x1_1, pulse
        y2_1, y1_1 = y1_1, y_f1
        
        y_f2 = (b0_2 * pulse + b2_2 * x2_2 - a1_2 * y1_2 - a2_2 * y2_2) / a0_2
        x2_2, x1_2 = x1_2, pulse
        y2_2, y1_2 = y1_2, y_f2
        
        amp = env_exp(t, 0.02, d, g)
        out = (y_f1 * 0.7 + y_f2 * 0.4) * amp
        j = start + i
        if j < len(buf):
            buf[j] += out


def noise(buf, d=0.2, g=0.04, f=1500.0, to=None, q=0.9, delay=0.0, rng=None):
    """Band-passed noise burst."""
    rng = rng or random
    start = int(delay * SR)
    n = int(d * SR)
    x1 = x2 = y1 = y2 = 0.0
    cutoff = f

    for i in range(n):
        t = i / SR
        if i % 32 == 0:
            cutoff = f * ((to / f) ** (t / d) if to else 1.0)
            w0 = 2.0 * math.pi * min(cutoff, SR * 0.45) / SR
            alpha = math.sin(w0) / (2.0 * q)
            a0 = 1.0 + alpha
            b0, b2 = alpha / a0, -alpha / a0
            a1, a2 = -2.0 * math.cos(w0) / a0, (1.0 - alpha) / a0
        x = rng.uniform(-1.0, 1.0)
        y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, x
        y2, y1 = y1, y
        j = start + i
        if j < len(buf):
            buf[j] += y * env_exp(t, 0.004, d, g)


# ── Acoustic Room & Spatial Reverb ────────────────────────────────────────────

class Comb:
    def __init__(self, size, feedback, damp):
        self.buf = [0.0] * size
        self.i = 0
        self.feedback = feedback
        self.damp = damp
        self.store = 0.0

    def process(self, x):
        y = self.buf[self.i]
        self.store = y * (1.0 - self.damp) + self.store * self.damp
        self.buf[self.i] = x + self.store * self.feedback
        self.i += 1
        if self.i == len(self.buf):
            self.i = 0
        return y


class Allpass:
    def __init__(self, size, gain):
        self.buf = [0.0] * size
        self.i = 0
        self.gain = gain

    def process(self, x):
        buffered = self.buf[self.i]
        y = -self.gain * x + buffered
        self.buf[self.i] = x + self.gain * buffered
        self.i += 1
        if self.i == len(self.buf):
            self.i = 0
        return y


COMB_SIZES = [1215, 1293, 1390, 1476, 1548, 1623, 1695, 1760]
ALLPASS_SIZES = [605, 480, 371, 245]
SPREAD = 23


def room(mono, feedback=0.82, damp=0.25):
    """Stereo decorrelation room reverb."""
    combs = [[Comb(s + (SPREAD if ch else 0), feedback, damp) for s in COMB_SIZES]
             for ch in (0, 1)]
    passes = [[Allpass(s, 0.5) for s in ALLPASS_SIZES] for _ in (0, 1)]
    left = [0.0] * len(mono)
    right = [0.0] * len(mono)
    for i, x in enumerate(mono):
        for ch, out in ((0, left), (1, right)):
            y = 0.0
            for c in combs[ch]:
                y += c.process(x)
            y /= len(combs[ch])
            for p in passes[ch]:
                y = p.process(y)
            out[i] = y
    return left, right


def highpass(buf, cutoff=60.0):
    a = 1.0 / (1.0 + 2.0 * math.pi * cutoff / SR)
    previous_in = 0.0
    previous_out = 0.0
    for i, x in enumerate(buf):
        y = a * (previous_out + x - previous_in)
        previous_in, previous_out = x, y
        buf[i] = y


def last_above(buf, threshold):
    for i in range(len(buf) - 1, -1, -1):
        if abs(buf[i]) > threshold:
            return i
    return 0


# ── Timbre Definitions ────────────────────────────────────────────────────────

BELL = [(1.0, 1.0, 1.0), (3.98, 0.28, 0.5), (9.1, 0.08, 0.3)]   # Mallet/kalimba
MARIMBA = [(1.0, 1.0, 1.0), (2.75, 0.25, 0.4), (5.4, 0.07, 0.25)] # Warm round wood
TRI = [(1.0, 1.0, 1.0), (3.0, -0.12, 0.7), (5.0, 0.04, 0.5)]     # Soft round
PURE = [(1.0, 1.0, 1.0)]


# ── Sound Recipes (Base & Variants) ───────────────────────────────────────────

def build(name, buf):
    rng = random.Random(name)

    # ── Universal Core Sounds ──────────────────────────────────────────────────
    if name == "pop":
        noise(buf, d=0.012, g=0.03, f=2400, to=4800, q=1.2, rng=rng)
        bubble(buf, f_start=380, f_end=1380, d=0.10, g=0.09, curvature=5.2)

    elif name == "gulp":
        bubble(buf, f_start=240, f_end=580, d=0.08, g=0.06, curvature=3.5)
        squish(buf, f_start=420, f_low=120, f_rebound=160, d=0.26, g=0.13, delay=0.06)
        bubble(buf, f_start=180, f_end=320, d=0.14, g=0.07, delay=0.16, curvature=4.0)

    elif name == "wink":
        tone(buf, 1480, to=2200, d=0.12, g=0.045, partials=BELL)
        sparkle(buf, 2480, d=0.16, g=0.035, delay=0.03)

    elif name == "slap":
        noise(buf, d=0.025, g=0.05, f=1100, q=0.7, rng=rng)
        squish(buf, f_start=320, f_low=115, f_rebound=155, d=0.22, g=0.16)

    elif name == "greet":
        for i, f in enumerate((587.33, 739.99, 880.0)):
            tone(buf, f, d=0.35, g=0.065, delay=i * 0.085, partials=BELL)
            bubble(buf, f * 0.8, f, d=0.06, g=0.025, delay=i * 0.085)

    elif name == "proud":
        notes = (783.99, 1046.50, 1318.51, 1567.98)
        for i, f in enumerate(notes):
            tone(buf, f, d=0.45, g=0.055, delay=i * 0.075, partials=BELL)
        sparkle(buf, 2093.0, d=0.25, g=0.03, delay=0.32)

    elif name == "yawn":
        cute_vowel(buf, f0_start=410, f0_end=240, f1=480, f2=920, d=0.85, g=0.055, vib=7.0, vibf=4.5)
        noise(buf, d=0.35, g=0.012, f=1800, to=900, q=0.5, delay=0.45, rng=rng)

    elif name == "sleep":
        cute_vowel(buf, f0_start=310, f0_end=270, f1=340, f2=750, d=0.65, g=0.035, vib=3.0, vibf=3.0)
        tone(buf, 587.33, d=0.7, g=0.015, delay=0.05, partials=TRI)

    elif name == "attach":
        bubble(buf, f_start=320, f_end=1150, d=0.07, g=0.06)
        tone(buf, 1760, d=0.18, g=0.045, delay=0.04, partials=BELL)
        noise(buf, d=0.05, g=0.025, f=3400, to=5600, q=1.2, delay=0.03, rng=rng)

    elif name == "peek":
        bubble(buf, f_start=720, f_end=1280, d=0.07, g=0.05)
        bubble(buf, f_start=1150, f_end=1780, d=0.09, g=0.045, delay=0.065)

    elif name == "open":
        tone(buf, 349.23, to=523.25, d=0.25, g=0.05, partials=MARIMBA)
        tone(buf, 523.25, to=698.46, d=0.28, g=0.04, delay=0.04, partials=BELL)
        noise(buf, d=0.25, g=0.016, f=900, to=2800, q=0.7, rng=rng)

    elif name == "close":
        tone(buf, 523.25, to=349.23, d=0.22, g=0.05, partials=MARIMBA)
        tone(buf, 349.23, to=261.63, d=0.26, g=0.04, delay=0.03, partials=TRI)
        noise(buf, d=0.18, g=0.014, f=2400, to=700, q=0.7, rng=rng)

    elif name == "hover":
        bubble(buf, f_start=1800, f_end=2400, d=0.045, g=0.02, curvature=5.0)

    elif name == "blip":
        tone(buf, 1396.91, d=0.07, g=0.04, partials=MARIMBA)

    elif name == "tick":
        bubble(buf, f_start=1650, f_end=2250, d=0.035, g=0.016, curvature=6.0)

    elif name == "send":
        noise(buf, d=0.34, g=0.032, f=750, to=4200, q=0.8, rng=rng)
        tone(buf, 740, to=1480, d=0.24, g=0.03, delay=0.05, partials=BELL)

    elif name == "love":
        tone(buf, 1046.50, d=0.35, g=0.045, vib=12, vibf=7.5, partials=BELL)
        tone(buf, 1318.51, d=0.55, g=0.042, delay=0.12, vib=14, vibf=8.0, partials=BELL)

    elif name == "question":
        cute_vowel(buf, f0_start=540, f0_end=940, f1=600, f2=1400, d=0.36, g=0.065, vib=4.0, vibf=6.0)

    elif name == "annoyed":
        cute_vowel(buf, f0_start=260, f0_end=190, f1=380, f2=850, d=0.28, g=0.075, vib=9.0, vibf=11.0)
        squish(buf, f_start=240, f_low=140, f_rebound=160, d=0.14, g=0.04, delay=0.02)

    elif name == "error":
        squish(buf, f_start=340, f_low=180, f_rebound=210, d=0.28, g=0.09)
        tone(buf, 261.63, d=0.45, g=0.075, delay=0.14, partials=TRI)

    elif name == "approval":
        tone(buf, 987.77, d=0.28, g=0.07, partials=MARIMBA)
        tone(buf, 987.77, d=0.45, g=0.065, delay=0.15, partials=MARIMBA)

    elif name == "approve":
        tone(buf, 783.99, d=0.18, g=0.05, partials=BELL)
        tone(buf, 1174.66, d=0.32, g=0.055, delay=0.07, partials=BELL)

    elif name == "think":
        bubble(buf, f_start=460, f_end=780, d=0.16, g=0.04)
        bubble(buf, f_start=580, f_end=960, d=0.20, g=0.038, delay=0.13)

    elif name == "search":
        for i, f in enumerate((740.0, 987.77, 1318.51)):
            bubble(buf, f * 0.75, f, d=0.12, g=0.032, delay=i * 0.095)

    elif name == "rate":
        squish(buf, f_start=480, f_low=320, f_rebound=360, d=0.32, g=0.05)
        squish(buf, f_start=400, f_low=260, f_rebound=290, d=0.38, g=0.045, delay=0.16)

    # ── DIZZY Variants ─────────────────────────────────────────────────────────
    elif name in ("dizzy", "dizzy_a"):
        # Opsi A: Cartoon Spinning Stars & Spring Boing
        squish(buf, f_start=360, f_low=140, f_rebound=220, d=0.45, g=0.09)
        tone(buf, 1420, to=680, d=1.1, g=0.045, vib=88, vibf=11.5, partials=PURE)
        tone(buf, 1780, to=860, d=1.0, g=0.025, delay=0.08, vib=110, vibf=10.0, partials=PURE)
        sparkle(buf, 2400, d=0.25, g=0.02, delay=0.22)
        sparkle(buf, 1950, d=0.25, g=0.02, delay=0.52)

    elif name == "dizzy_b":
        # Opsi B: Slime Jelly Wobble & Groan
        squish(buf, f_start=290, f_low=110, f_rebound=165, d=0.35, g=0.12)
        squish(buf, f_start=200, f_low=95, f_rebound=140, d=0.38, g=0.09, delay=0.22)
        cute_vowel(buf, f0_start=250, f0_end=150, f1=370, f2=820, d=0.6, g=0.075, delay=0.18, vib=14.0, vibf=7.0)

    elif name == "dizzy_c":
        # Opsi C: Bubble Scatter & Deflate
        bubble(buf, 620, 1120, d=0.08, g=0.065, delay=0.0)
        bubble(buf, 980, 460, d=0.07, g=0.055, delay=0.07)
        bubble(buf, 440, 880, d=0.08, g=0.06, delay=0.15)
        bubble(buf, 820, 310, d=0.09, g=0.055, delay=0.24)
        cute_vowel(buf, f0_start=360, f0_end=160, f1=410, f2=880, d=0.65, g=0.05, delay=0.32, vib=4.0, vibf=5.0)
        noise(buf, d=0.32, g=0.012, f=1500, to=550, q=0.6, delay=0.42, rng=rng)

    # ── FINISH Variants ────────────────────────────────────────────────────────
    elif name in ("finish", "finish_a"):
        # Opsi A: Nintendo Quest Clear / Level-Up Fanfare (ting-tang... tu-tu-TUUUNG!)
        notes = (
            (523.25, 0.00, 0.16),  # C5
            (659.25, 0.09, 0.16),  # E5
            (783.99, 0.18, 0.18),  # G5
            (987.77, 0.28, 0.22),  # B5
            (1046.50, 0.38, 0.82), # C6 triumphant hold
        )
        for f, at, d in notes:
            tone(buf, f, d=d, g=0.07, delay=at, partials=BELL)
        # Harmonize root and fifth on final resolution
        tone(buf, 523.25, d=0.82, g=0.045, delay=0.38, partials=MARIMBA)
        tone(buf, 783.99, d=0.82, g=0.04, delay=0.38, partials=BELL)
        sparkle(buf, 2093.00, d=0.45, g=0.035, delay=0.42)

    elif name == "finish_b":
        # Opsi B: Celebration Pop & Star Shower
        bubble(buf, 360, 1480, d=0.09, g=0.08)
        notes = (783.99, 1046.50, 1318.51, 1567.98, 2093.00)
        for i, f in enumerate(notes):
            tone(buf, f, d=0.45 + 0.08 * i, g=0.065, delay=0.05 + i * 0.06, partials=BELL)
            sparkle(buf, f * 1.5, d=0.25, g=0.02, delay=0.08 + i * 0.06)

    elif name == "finish_c":
        # Opsi C: Harmonized Double Hop (hop-hop-hooray!)
        # Hop 1 (C5 + E5)
        tone(buf, 523.25, d=0.22, g=0.06, delay=0.00, partials=BELL)
        tone(buf, 659.25, d=0.22, g=0.055, delay=0.00, partials=BELL)
        # Hop 2 (E5 + G5)
        tone(buf, 659.25, d=0.24, g=0.065, delay=0.14, partials=BELL)
        tone(buf, 783.99, d=0.24, g=0.06, delay=0.14, partials=BELL)
        # Big Landing (G5 + C6 + E6)
        tone(buf, 783.99, d=0.75, g=0.065, delay=0.28, partials=MARIMBA)
        tone(buf, 1046.50, d=0.85, g=0.07, delay=0.28, partials=BELL)
        tone(buf, 1318.51, d=0.85, g=0.055, delay=0.28, partials=BELL)
        sparkle(buf, 2637.02, d=0.4, g=0.03, delay=0.32)

    # ── GREETING Variants ──────────────────────────────────────────────────────
    elif name in ("greeting", "greeting_a"):
        # Opsi A: Heartwarming Music-Box / Animal Crossing Swing (synchronous with wave)
        lead = 0.55
        notes = (
            (587.33, 0.00, 0.45), # D5 (wave left)
            (739.99, 0.00, 0.40), # F#5
            (880.00, 0.28, 0.45), # A5 (wave right)
            (783.99, 0.56, 0.40), # G5 (wave left)
            (987.77, 0.84, 0.42), # B5
            (1174.66, 0.84, 1.40),# D6 held (smile & open eyes)
        )
        for f, at, d in notes:
            tone(buf, f, d=d, g=0.07, delay=lead + at, partials=BELL)
            sparkle(buf, f * 1.5, d=d * 0.35, g=0.018, delay=lead + at + 0.02)
        tone(buf, 293.66, d=1.6, g=0.035, delay=lead + 0.84, partials=TRI)

    elif name == "greeting_b":
        # Opsi B: Playful Tech Startup Jingle (da-da-da... DING!)
        lead = 0.55
        notes = (
            (783.99, 0.00, 0.26),  # G5
            (1046.50, 0.16, 0.26), # C6
            (1318.51, 0.32, 0.30), # E6
            (1567.98, 0.54, 1.45), # G6 DING!
        )
        for f, at, d in notes:
            tone(buf, f, d=d, g=0.075, delay=lead + at, partials=BELL)
            bubble(buf, f * 0.75, f, d=0.06, g=0.03, delay=lead + at)
        sparkle(buf, 2350.0, d=0.6, g=0.04, delay=lead + 0.58)
        tone(buf, 392.00, d=1.5, g=0.035, delay=lead + 0.54, partials=TRI)

    elif name == "greeting_c":
        # Opsi C: Toy Marimba & Slime Rhythm
        lead = 0.55
        marimba_notes = (
            (523.25, 0.00, 0.28),  # C5
            (659.25, 0.20, 0.28),  # E5
            (783.99, 0.40, 0.30),  # G5
            (880.00, 0.60, 0.30),  # A5
            (1046.50, 0.85, 1.35), # C6
        )
        for f, at, d in marimba_notes:
            tone(buf, f, d=d, g=0.075, delay=lead + at, partials=MARIMBA)
            bubble(buf, f * 0.7, f, d=0.08, g=0.035, delay=lead + at)
        sparkle(buf, 2093.0, d=0.5, g=0.03, delay=lead + 0.88)

    # ── WORK Variants ──────────────────────────────────────────────────────────
    elif name in ("work", "work_a"):
        # Opsi A: Energetic 'Let's Go!' Wind-Up (per spin + rising ready chirp)
        tone(buf, 580, d=0.04, g=0.025, partials=MARIMBA)
        tone(buf, 820, d=0.04, g=0.028, delay=0.03, partials=MARIMBA)
        tone(buf, 1160, d=0.05, g=0.03, delay=0.06, partials=MARIMBA)
        tone(buf, 880, to=1480, d=0.18, g=0.045, delay=0.10, partials=BELL)
        bubble(buf, 520, 1150, d=0.08, g=0.035, delay=0.10)

    elif name == "work_b":
        # Opsi B: Bubbling Brain (3 ascending active thinking bubbles)
        bubble(buf, 420, 720, d=0.08, g=0.035, delay=0.00)
        bubble(buf, 650, 1050, d=0.08, g=0.038, delay=0.07)
        bubble(buf, 980, 1550, d=0.12, g=0.045, delay=0.14)

    elif name == "work_c":
        # Opsi C: Cozy Clockwork Tick (refined warm wooden clockwork)
        tone(buf, 783.99, d=0.14, g=0.035, delay=0.00, partials=MARIMBA)
        tone(buf, 1046.50, d=0.18, g=0.032, delay=0.11, partials=MARIMBA)

    else:
        raise SystemExit(f"no recipe for {name}")


# Technical parameters (target peak dBFS, wet mix, tail decay seconds)
RECIPES = {
    # 29 Base Sounds
    "peek":     (-17.0, 0.18, 0.30),
    "open":     (-21.0, 0.20, 0.30),
    "close":    (-23.0, 0.20, 0.30),
    "hover":    (-35.0, 0.00, 0.05),
    "blip":     (-27.0, 0.06, 0.08),
    "slap":     (-13.5, 0.16, 0.22),
    "annoyed":  (-12.0, 0.16, 0.25),
    "dizzy":    (-11.5, 0.22, 0.45),
    "greet":    (-7.0, 0.22, 0.60),
    "greeting": (-5.0, 0.24, 1.10),
    "work":     (-19.0, 0.16, 0.25),
    "finish":   (-4.5, 0.24, 0.70),
    "error":    (-6.0, 0.20, 0.55),
    "approval": (-5.5, 0.22, 0.60),
    "question": (-10.5, 0.20, 0.50),
    "approve":  (-13.5, 0.16, 0.30),
    "gulp":     (-8.0, 0.16, 0.30),
    "tick":     (-36.0, 0.00, 0.04),
    "send":     (-20.0, 0.20, 0.40),
    "love":     (-11.5, 0.22, 0.50),
    "pop":      (-21.0, 0.16, 0.22),
    "proud":    (-7.0, 0.22, 0.55),
    "wink":     (-26.0, 0.12, 0.18),
    "yawn":     (-19.0, 0.20, 0.40),
    "attach":   (-9.5, 0.22, 0.50),
    "think":    (-16.0, 0.16, 0.30),
    "search":   (-17.0, 0.16, 0.35),
    "rate":     (-12.5, 0.20, 0.45),
    "sleep":    (-24.5, 0.20, 0.45),

    # Variants for User Selection in Settings
    "dizzy_a":    (-11.5, 0.22, 0.45),
    "dizzy_b":    (-11.5, 0.22, 0.45),
    "dizzy_c":    (-11.5, 0.20, 0.45),
    "finish_a":   (-4.5, 0.24, 0.70),
    "finish_b":   (-4.5, 0.24, 0.70),
    "finish_c":   (-4.5, 0.24, 0.70),
    "greeting_a": (-5.0, 0.24, 1.10),
    "greeting_b": (-5.0, 0.24, 1.10),
    "greeting_c": (-5.0, 0.24, 1.10),
    "work_a":     (-19.0, 0.16, 0.25),
    "work_b":     (-19.0, 0.16, 0.25),
    "work_c":     (-20.5, 0.16, 0.25),
}


def render(name):
    peak_db, wet, tail = RECIPES[name]
    length = int(6.0 * SR)
    mono = [0.0] * length
    build(name, mono)
    highpass(mono)

    dry_peak = max(abs(x) for x in mono) or 1.0
    dry_last = last_above(mono, dry_peak * 1e-3)
    length = min(length, dry_last + int(tail * SR) + 1)
    mono = mono[:length]

    left, right = room(mono) if wet > 0 else (mono, mono)
    left = [mono[i] + left[i] * wet for i in range(length)]
    right = [mono[i] + right[i] * wet for i in range(length)]

    mixed_peak = max(abs(x) for x in left)
    audible = max(last_above(left, mixed_peak * 1.8e-3), last_above(right, mixed_peak * 1.8e-3))
    length = min(length, audible + int(0.006 * SR) + 1)
    left, right = left[:length], right[:length]

    peak = max(max(abs(l) for l in left), max(abs(r) for r in right)) or 1.0
    target = 10 ** (peak_db / 20.0)
    gain = target / peak
    fade = int(0.003 * SR)
    frames = array.array("h")
    for i in range(length):
        l, r = left[i], right[i]
        k = 1.0
        if i < fade:
            k = i / fade
        elif i > length - fade:
            k = (length - i) / fade
        frames.append(int(max(-1.0, min(1.0, l * gain * k)) * 32767))
        frames.append(int(max(-1.0, min(1.0, r * gain * k)) * 32767))
    return frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="windows/sounds", help="output folder")
    parser.add_argument("--suffix", default="", help="appended to file name")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)

    for name in RECIPES:
        frames = render(name)
        path = os.path.join(args.out, f"{name}{args.suffix}.wav")
        with wave.open(path, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(frames.tobytes())
        print(f"{name:<12} {len(frames) / 2 / SR:5.2f} s  {len(frames) * 2:>8} bytes")
    print(f"\n{len(RECIPES)} sounds generated into {args.out}/")


if __name__ == "__main__":
    main()
