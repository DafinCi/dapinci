<div align="center">

<img src="windows/src-tauri/icons/128x128.png" width="96" alt="DapinCi icon">

# DapinCi

**A personal desktop companion for Windows: your coding agents, the services you
use, and a small character called ipin at the top of your screen.**

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows)
![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-backend-000?logo=rust)
![Code: MIT](https://img.shields.io/badge/code-MIT-green)

</div>

## What it is

DapinCi lives at the top of your screen and keeps your work in sight: approve a
Claude Code permission request, watch a session work, answer a question, drop a
file, chat with Claude or another provider, keep an eye on the services you
declared, and control Spotify while it plays. A character called **ipin** reacts
to all of it — he peeks out when something happens, follows your pointer, wears
the outfit the season calls for, and can move out onto your desktop.

Everything runs on your machine. There is no telemetry, and nothing leaves it
except the requests to the services you configure yourself.

## Status

DapinCi is a personal project, built in the open as it goes. It is **Windows
first**, and there is no release yet — build it from source:

```powershell
cd windows
npm install
npm run tauri dev      # development build, with live reload
npm run pack           # the installer lands in windows/release/
```

The [Windows app's README](windows/README.md) covers everything else: what each
part does, the keyboard shortcuts, where your data lives, Spotify, privacy, the
build, the layout, and how to recover when something misbehaves.

## What is in this repository

| Path | What it is |
|---|---|
| `windows/` | **The project.** The Tauri 2 app: Rust backend, TypeScript front end, the relay, the 41 sounds, the icon generator, and the relay contract in `AGENTS.md` |
| `plans/` | The plan of record — phases, decisions taken, and the internal contracts that must not be renamed by accident |
| `scripts/` | `render-sounds.py`, `audit-sounds.py` and `suffix-sounds.py` — the sounds this app ships are generated and checked here |

## Licence and credit

DapinCi is a fork of **[Coucou](https://github.com/Louis-CFM/coucou)** by Louis
Raillé. The source code is MIT — see [LICENSE](LICENSE) — and the `windows/` app
is his work carried forward. Thank you to him for releasing it.

Coucou's own name, character (Mochi), icons, sounds and media are **reserved**
and are not reused here: DapinCi has its own name, its own icon, its own character
(ipin) and its own 41 sounds. See [LICENSE-ASSETS.md](LICENSE-ASSETS.md) for the
exact terms.

This repository contains none of Coucou's artwork: no Mochi character, no Coucou
icons and no Coucou media. The upstream project is linked above as the source
this fork builds on.
