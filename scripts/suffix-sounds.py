#!/usr/bin/env python3
"""Add or remove a suffix on every sound name the app plays.

The 29 sound names live in two lists (SoundEngine.soundNames on the Mac,
SOUND_NAMES in windows/src/core/sound.ts) and are then typed at every call
site. Renaming the files means renaming all of those, which is what this does.

Appending only ever rewrites a quoted name that is in the known set, and only
inside a place that plays a sound: a play(...)/playSound(...)/fadeOut(...) call,
a `sound:` or `sound =` value, a phone notification sound, or a `*.wav` literal.
Anything else - a badge called "error", a view called "approval", an i18n key -
is left alone.

`--strip` takes the suffix off again. There that guard is no longer needed: only
`<name><suffix>` is rewritten, which is unambiguous by itself, so it works on
every occurrence, in code and in comments alike.

    python scripts/suffix-sounds.py New --dry-run
    python scripts/suffix-sounds.py New
    python scripts/suffix-sounds.py New --strip --roots windows/src windows/tests

`--roots` says which folders to walk (default: windows/src).
"""

import argparse
import os
import re
import sys

SOUNDS = [
    "peek", "open", "close", "hover", "blip", "slap", "annoyed", "dizzy", "greet",
    "work", "finish", "error", "approval", "question", "approve", "gulp", "tick",
    "send", "love", "pop", "proud", "wink", "yawn", "attach", "think", "search",
    "rate", "sleep", "greeting",
]
KNOWN = set(SOUNDS)

DEFAULT_ROOTS = [os.path.join("windows", "src")]

# Windows is .ts and .mjs, the Mac is .swift; nothing else carries a sound name.
EXTENSIONS = (".swift", ".ts", ".mjs")

# The two places that list every name, rewritten in one go.
NAME_LISTS = [
    (os.path.join("NotchBuddy", "Sources", "App", "SoundEngine.swift"), "soundNames"),
    (os.path.join("windows", "src", "core", "sound.ts"), "SOUND_NAMES"),
]

SUFFIXABLE = re.compile(r'"([a-z]+)"')


def suffix(name, suffix_text):
    return name + suffix_text if name in KNOWN else name


def rewrite_calls(text, pattern, suffix_text):
    """Rewrite the quoted names inside calls matched by `pattern`."""
    def replace(match):
        return match.group(1) + SUFFIXABLE.sub(
            lambda m: f'"{suffix(m.group(1), suffix_text)}"', match.group(2)
        ) + match.group(3)

    return re.sub(pattern, replace, text)


def rewrite_file(path, suffix_text, dry):
    with open(path, "r", encoding="utf-8", newline="") as f:
        original = f.read()
    text = original
    before = text

    # Every call that takes the sound as an argument.
    text = rewrite_calls(
        text, r"(\b(?:play|playSound|fadeOut)\()([^()]*)(\))", suffix_text
    )
    # `sound:"work"` in the state table, `sound: "error"` in an alert, and the
    # `sound: "error" | "question" | "finish"` type that goes with it.
    text = re.sub(
        r'(\bsound:\s*)((?:"[a-z]+"\s*\|\s*)*"[a-z]+")',
        lambda m: m.group(1) + SUFFIXABLE.sub(
            lambda q: f'"{suffix(q.group(1), suffix_text)}"', m.group(2)),
        text,
    )
    # `sound = "error"` in AppState's GitHub alerts.
    text = re.sub(r'\bsound\s*=\s*"([a-z]+)"',
                  lambda m: f'sound = "{suffix(m.group(1), suffix_text)}"', text)
    # A notification sound, and a notification sound's file name.
    text = re.sub(r'\bPhoneSettings\.sound\(\s*"([a-z]+)"\s*\)',
                  lambda m: f'PhoneSettings.sound("{suffix(m.group(1), suffix_text)}")', text)
    text = re.sub(r'"([a-z]+)\.wav"',
                  lambda m: f'"{suffix(m.group(1), suffix_text)}.wav"', text)

    for list_path, marker in NAME_LISTS:
        if path != os.path.normpath(list_path.replace("/", os.sep)):
            continue
        start = text.index(marker)
        start = text.index("[", start) + 1
        end = text.index("]", start)
        body = SUFFIXABLE.sub(lambda m: f'"{suffix(m.group(1), suffix_text)}"', text[start:end])
        text = text[:start] + body + text[end:]

    if text == before:
        return 0
    changed = sum(1 for a, b in zip(before.splitlines(), text.splitlines()) if a != b)
    if not dry:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    return changed


def strip_file(path, suffix_text, dry):
    """Take `suffix_text` off every known sound name in `path`."""
    with open(path, "r", encoding="utf-8", newline="") as f:
        original = f.read()
    text = original
    for name in SOUNDS:
        token = re.escape(name + suffix_text)
        # Whole words only: `finishNew` is a sound, `fromNew` and `isNewFile` are not.
        text = re.sub(rf"(?<![A-Za-z0-9_]){token}(?![A-Za-z0-9_])", name, text)

    if text == original:
        return 0
    changed = sum(1 for a, b in zip(original.splitlines(), text.splitlines()) if a != b)
    if not dry:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    return changed


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("suffix", nargs="?", default="New", help="text to append or remove (default: New)")
    parser.add_argument("--strip", action="store_true", help="remove the suffix instead of adding it")
    parser.add_argument("--roots", nargs="+", help="folders to walk (default: the Mac's Sources and windows/src)")
    parser.add_argument("--dry-run", action="store_true", help="report without writing")
    args = parser.parse_args()

    rewrite = strip_file if args.strip else rewrite_file
    total = 0
    for root in args.roots or DEFAULT_ROOTS:
        if not os.path.isdir(root):
            print(f"skipped, no such folder: {root}")
            continue
        for folder, _, files in os.walk(root):
            for name in sorted(files):
                if not name.endswith(EXTENSIONS):
                    continue
                path = os.path.join(folder, name)
                changed = rewrite(path, args.suffix, args.dry_run)
                if changed:
                    print(f"{changed:>3} line(s)  {path}")
                    total += changed
    print(f"\n{total} line(s) {'would change' if args.dry_run else 'changed'}")
    if not args.dry_run:
        leftover = "still carrying the suffix" if args.strip else "still typed without the suffix"
        print(f"Now grep for leftovers: a sound name {leftover}.")
    return 0 if total else 1


if __name__ == "__main__":
    sys.exit(main())
