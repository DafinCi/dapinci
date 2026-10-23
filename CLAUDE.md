# DapinCi — guide for AI coding agents

DapinCi is a Windows desktop companion: a Tauri 2 app in `windows/` — Rust in
`src-tauri/`, TypeScript in `src/`, the relay in `hook/`. It shows coding-agent
sessions (Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI, Antigravity, Muse
Code, OpenCode, Amp, Hermes), a few service integrations, and a character called
**ipin**, drawn in code with Canvas 2D — no images, no animation library.

It is based on [Coucou](https://github.com/Louis-CFM/coucou): a local copy that
has been reworked here. This repository has its own history and is not a GitHub
fork. It holds only the Windows app, its plans and the asset scripts. The
upstream project's Mac and iPhone apps, design files, website and relay are kept
in a separate private reference copy; do not expect to find them here.

## The plan of record

`plans/DapinCi_Product_Specification_v1.md` holds the phases, the decisions
already taken, and **Lampiran A** — the internal contracts, with the sites that
must change together. Read it before renaming anything.

## Where things are

- `windows/src/` — the front end: `ipin/` (the character, the greeting, outfits,
  the mini bots), `island/` (the state machine, hooks, integrations, shortcuts),
  `views/`, `settings/`, `desktop/` (his own window), `core/` (bridge, state,
  providers, pollers), `upload/`, `recap/`, `i18n/`.
- `windows/src-tauri/src/` — Rust: the windows, the named pipe, the chat
  providers, the pollers, `secrets.rs`, `settings.rs`, the tray, the sounds.
- `windows/hook/` — the relay, staged into `%LOCALAPPDATA%\Coucou\bin` at launch.
- `windows/sounds/` — the 41 WAVs the app ships (29 sounds plus A/B/C variants).
- `windows/AGENTS.md` — the contract a third-party tool follows to get its own
  pill: the `coucou_agent` field, validation and the Windows relay command.
- `windows/scripts/` — `gen-icons.mjs` (the icon set), `pack.mjs` (installer
  names), `gen-strings.mjs` (the translations, generated from
  `src/i18n/Localizable.xcstrings`).
- `scripts/` at the root — `render-sounds.py` and `audit-sounds.py`, which
  produce and check the sounds.

## Commands

```
cd windows
npm ci                          # once: installs exactly what the lockfile pins
cargo build --release -p coucou-hook  # once in a fresh checkout: the Tauri build script bundles it
npx tsc --noEmit
npm test                        # 396 tests
cargo test --workspace --locked # 278 Rust tests
npm run pack                    # both installers, in windows/release/ (~4 min)
```

Run all four before a commit. `npm run pack` is the only check that the icons,
the sounds and the installer names really hold together.

## Rules

- **Only one remote is pushed to**: `DafinCi/dapinci`. Never add or push to the
  upstream Coucou repository.
- **The assets are ours.** The icon, ipin and the 41 sounds are original. Change
  them by regenerating (`windows/scripts/gen-icons.mjs`, `scripts/render-sounds.py`),
  never by copying anything in. Coucou's name, character, icons and media are
  reserved — see `LICENSE-ASSETS.md`.
- **Provenance comments stay.** `// port of BotEngine.swift`,
  `NotchBuddy/Sources/CoucouKit/…` name the upstream files the code came from.
  They are attribution, not branding: do not rename them.
- **Some names are data contracts.** `mochiOutfit` and `desktopMochi` are already
  written in `settings.json`; so are the relay's name, the named pipe, the two
  data folders and the keyring service. Renaming one of them is a migration, not a
  rename — one contract per commit, with a real hook tested after it (Lampiran A).
- **Pill ids are stable** (`src/core/pills.ts`): they are stored in settings and
  they route the hooks. Never rename an existing one.
- **Secrets live in the Windows Credential Manager**, never on disk and never in
  git. No telemetry, and no network call except to a service the user configured.
- **Never block an agent.** The hook exits immediately when the app doesn't
  answer, and writing an agent's config file always shows the diff, takes a dated
  backup and waits for the user's click. Their own entries are never touched.
- **The interface speaks ten languages.** User-facing text goes through `t()`,
  `tl()`, `tn()` or `N_()` in `src/i18n/`, never a bare English string; new keys
  go in `src/i18n/extra.json` with all nine translations.
