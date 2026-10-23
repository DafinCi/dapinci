<div align="center">

<img src="src-tauri/icons/128x128.png" width="96" alt="DapinCi icon">

# DapinCi for Windows

**ipin lives at the top of your screen: your coding agents, your services, and a small character who reacts to it all.**

Approve Claude Code permissions, watch your session work, drop a file, chat with Claude, keep an eye on your services — without leaving what you're doing.

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows)
![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-backend-000?logo=rust)
![Code: MIT](https://img.shields.io/badge/code-MIT-green)

</div>

---

## Install

There is no release yet. DapinCi is still being built, and the installer will be
published here when it is ready. Until then, [build it yourself](#build-it-yourself):
`npm run pack` leaves one in `windows/release/`.

The installer will not be code-signed, so **Windows will warn you the first time
— that is expected**:

1. A **"Windows protected your PC"** screen appears, with *Publisher: Unknown publisher*.
2. Click **More info** (*Informations complémentaires* in French). This reveals a **Run anyway** button.
3. Click **Run anyway** (*Exécuter quand même*). The installer starts normally.

The `.exe` installs for the current user only, with no admin prompt; the `.msi`
may ask for admin rights. Unsigned installers are also what Windows Defender
sometimes flags by mistake: if yours gets blocked, update its definitions
(`Update-MpSignature` in PowerShell) and try again.

### Uninstalling

**Settings → Apps → DapinCi → Uninstall**, or the `uninstall.exe` in the install
folder. It removes the app itself, the relay it staged into
`%LOCALAPPDATA%\Coucou\bin`, the `inbox` folder and the log. Your preferences,
chat history and recap **stay** in `%APPDATA%\Coucou` and `%LOCALAPPDATA%\Coucou`
— delete those two folders yourself if you want them gone too.

What it deliberately does **not** do is touch any agent's config. If you had
installed the Claude Code hooks, their entries stay in `settings.json` and now
point at a relay that is gone: Claude Code runs a command that no longer exists
until DapinCi is installed and launched again — or you remove those hooks
yourself, in **Settings… → Claude Code → Uninstall hooks…**, before uninstalling.

## Using it

| What you do | What happens |
|---|---|
| Move the mouse to the very top-centre of the screen | ipin peeks out |
| Click the small island | It opens. With **Settings → General → Open on hover**, resting the pointer on it is enough, and it folds again shortly after the pointer leaves (click inside to keep it open) |
| Click ipin | It gets annoyed. Three times in a row and it goes dizzy |
| Rest the pointer on ipin for two seconds | Hearts |
| Right-click ipin | The wardrobe: rest the pointer on an outfit to try it on, click to keep it. **Auto** dresses him for the season (witch hat in October, Santa hat in December…) |
| Drag ipin out of the island | He moves onto your desktop and hangs out there, in his outfit, watching your cursor. Drop him back on the island to bring him home |
| On the desktop: click / right-click / double-click ipin | Poke him / the wardrobe / he flies home. Drag him to move him |
| Drag a file onto the island | ipin turns into a box, swallows it, then offers to answer questions about it |
| Click a file in the session ticker | Its diff opens in the island; ↗ opens the file in VS Code, ‹ or `Esc` goes back |
| `Esc` | Closes the island |
| Put a file named like one of ipin's sounds (`finish.wav`, `approval.mp3`, `greet.m4a`…) in the sounds folder | It replaces that sound after **Settings → General → Reload sounds**. **Open sounds folder** shows the folder, `%APPDATA%\Coucou\sounds` |
| Tray icon | Open, Weekly recap, Wardrobe…, Settings…, Pause, Quit |
| `Ctrl+Alt+Space` | Opens the chat, from any app |
| `Ctrl+Alt+A` | Jumps to the waiting permission or question |
| `Ctrl+Alt+T` | Brings the session's window forward ("Open terminal") |
| `Ctrl+Alt+→` / `Ctrl+Alt+←` | Next / previous pill |
| `Ctrl+Alt+S` | Mutes or unmutes ipin |
| `Ctrl+Alt+G` | Opens the wardrobe |
| `Ctrl+Alt+D` | Sends ipin to the desktop, or brings him home |
| `Ctrl+Alt+N` | Opens and closes the island (off until you turn it on) |
| In the open island: `Ctrl+→` `Ctrl+←`, `Ctrl+1`–`Ctrl+9` | Switch pills |
| In the open island: `Ctrl+↓` `Ctrl+↑`, `Ctrl+O` | Walk the open GitHub list, open the highlighted row |
| In the open island: `Ctrl+E` | Opens the latest edit's diff, or closes the diff |
| In the open island: `Ctrl+Enter`, `Ctrl+K` | Send, start a new chat |
| In the open island: `Ctrl+,`, `Ctrl+P` | Settings, keep the island open |

### Keyboard shortcuts

Every global shortcut can be changed or turned off in **Settings… → Shortcuts**:
click it and press the new keys. A combination another app already holds is
flagged *In use*, and two DapinCi shortcuts on the same keys are flagged *Used
twice*. While you record a new one, DapinCi lets go of its own so the keys reach
the recorder.

The defaults are not the Mac's `⌃⌥` letters. On Windows, `Ctrl+Alt` is `AltGr`,
so a global `Ctrl+Alt+E` would swallow every `€` typed on a French or German
keyboard. The defaults were checked against the AltGr layer of the French,
German, Spanish, Italian, Portuguese and Brazilian (ABNT2) layouts — that is why
pill switching uses the arrows rather than `[` `]`, and mute is `S` rather than
`M` (`AltGr+M` is `µ` in German). On top of that, DapinCi asks Windows what each
`Ctrl+Alt` combination types on the layouts you have installed and leaves any
that types a character unregistered, flagged *Types “ą”* in Settings: Polish,
for one, puts `ą` on `AltGr+A` and `ś` on `AltGr+S`. The recorder refuses such
a combination too.

Older Intel graphics drivers rotate the screen on `Ctrl+Alt+←` / `→`; if yours
still does, those two show up as *In use*. On Linux, Xfce and MATE keep
`Ctrl+Alt+D` to show the desktop, so there **Send ipin to the desktop** shows
up as *In use* until you give it other keys.

Everything else happens on its own: a Claude Code permission request opens the
island with **Deny / Allow**, a question from Claude Code shows its options to
pick from, a finished session shows what it did, and
your integrations sit in the coloured pills next to ipin.

A permission card or a question stays until you answer it: the mouse leaving
never folds it, it comes up even when the island is already open or another
pill is in front, and the pill you were on comes back once you answer. To keep
it for later, fold it with the **⌃** in its corner (or `Esc` in the island): the
island shrinks to its compact size and stays on screen, nothing is answered, and
opening it again shows the card. **Open terminal** brings the window the session
runs in to the front.

When ipin lives on the desktop, he flies back to the island with a permission
request or a question and returns to his spot once you have answered; he does a
little jump when a task finishes, and dozes off when nothing has happened for
two minutes and your cursor is elsewhere — asleep, he costs nothing: no cursor
polling, a few frames a second. He remembers his spot between launches; if it
was on a display that is no longer connected, he stays in the island.

**Live diff.** Every file Claude edits (Edit, MultiEdit, Write) shows up in the
session ticker with its **+N −M** lines; click it for the diff. Same limits as the
Mac: past 200 KB or 4 000 lines only the counts are kept, at most 50 diffs per
session, and they are forgotten an hour after the last edit or when the session
ends. When Claude finishes, the card keeps the first paragraph of its final
answer on one line, still, until the next prompt.

## Your pills

**Settings… → Active pills** lists the tools you use, from the same catalog as
the Mac app. Pick your **main tool** — VS Code, Cursor, Codex or Antigravity —
which is always there and doesn't take a slot, then declare up to four more:
agents (Gemini CLI, Copilot CLI, Muse Code, OpenCode, Amp, Hermes, Claude
Desktop), the chat providers (Anthropic, Google AI, OpenAI, Ollama, LM Studio),
and the services under **Integrations**. A pill fed by hooks says whether its
hooks are installed, never asks for a key; a local model server's pill says
whether the chat is connected to it. A session on a pill you didn't
declare still shows up, for as long as it runs.

## Claude Code

Open **Settings… → Claude Code → Install hooks…**. You get the exact diff of what
will change in `%USERPROFILE%\.claude\settings.json`, the path of the dated backup
that will be taken, and nothing is written until you click. Your own hooks are
never touched, and uninstalling removes only DapinCi's entries.

The relay is a tiny executable, `coucou-hook.exe`, copied to
`%LOCALAPPDATA%\Coucou\bin\` at launch. It is given 300 ms to reach DapinCi and
exits cleanly if the app is closed, slow or crashed — **a Claude Code session is
never blocked or slowed down by DapinCi.** If nobody answers a permission request
in time, DapinCi stays quiet and Claude Code asks in the terminal as usual.

It works from any terminal — Windows Terminal, PowerShell, VS Code, Git Bash.

### Plan usage

The island's header can show your plan limits: a small pill
("Claude 73%", green below 50 %, orange up to 80 %, red above) for the 5-hour and
weekly Claude limits, and another for Codex. Click one for the details and the
reset times. Both are off by default; turn them on in **Settings… → Plan usage**.

- **Claude** (Pro and Max plans): the numbers come from Claude Code's own status
  line. **Show in notch** first shows you the diff of the `statusLine` change in
  `%USERPROFILE%\.claude\settings.json`, takes a dated backup and writes only
  after your click, with the same writer as the hooks: the status line becomes `coucou-hook --statusline`, which
  passes only the limits on (300 ms at most) and runs the status line you had
  before — kept in `statusline-previous.json` next to the relay — with the same
  input, printing what it prints. On Windows that one runs through Git Bash, as
  Claude Code runs it (`CLAUDE_CODE_GIT_BASH_PATH`, then the Git for Windows that
  `git.exe` on `PATH` belongs to, then the usual install folders); it gets 10 s
  and 64 KB of output. **Uninstall relay** puts your status line back. The
  numbers arrive with Claude Code's replies.
- **Codex**: nothing is installed. When the pill shows (or is clicked, at most
  once a minute) DapinCi starts `codex app-server` and asks it
  `account/rateLimits/read`, as Codex's `/status` does, then stops it (15 s at
  most, never while paused). Codex must be signed in with ChatGPT.

## Weekly recap

On Monday from 8 am, the first time DapinCi starts, an agent starts working or
you wake the island, a card sums up the past week: time spent, sessions, files
and lines changed, commands run, permissions and questions, your top agent,
top project, busiest day and longest session. **Tray → Weekly recap** opens it
any day.

**Share image** turns it into a 1080 × 1920 picture with ipin. **Save image**
writes it to your Pictures folder (Downloads if there is none) as
`DapinCi weekly recap YYYY-MM-DD.png`, never over an existing file; **Copy** puts
it on the clipboard. **Hide project names** leaves the project out of the image.

The history is `recap.json` next to the log, a 12-week rolling window: counts,
the agent and the project folder's name — never a command, a file path, file
contents or a prompt. It never leaves your machine. **Settings → General →
Weekly recap** turns it off or clears it.

## Languages

DapinCi speaks ten languages: English, 简体中文, हिन्दी,
Español, العربية, Français, বাংলা, Português (Brasil), Русский and Bahasa
Indonesia. **Settings… → General → Language** picks one; **System** (the
default) follows your system's language when it is one of these, English
otherwise. The island, the settings window and the tray menu switch at once —
nothing restarts, and the island keeps its sessions, steps and chat.

In Arabic the island's cards read right to left; ipin, the pills and the
header stay where they are, and commands, code and file paths stay left to
right. Steps already in a session's ticker keep the language they were written
in.

The translations come from `src/i18n/Localizable.xcstrings`, turned into
`src/i18n/strings.json` by `node scripts/gen-strings.mjs`, plus
`src/i18n/extra.json` for what only Windows and Linux show. Both are keyed by
the English text; a string missing in a language shows in English. The Rust
side (tray, errors) embeds the same two files.

## Chat and keys

**Settings… → Claude** takes your Anthropic API key. Keys live in the **Windows
Credential Manager**, never on disk and never in the interface — the island can
only ask whether a key exists. Same for every integration key.

The chat also talks to **Google AI (Gemini)**, **OpenAI** and **OpenRouter**:
add their keys in **Settings… → Chat providers**, then click the model name
above the chat box to switch provider and model. The model list
is fetched from the provider only once you pick it and it has a key. Switching
mid-conversation carries the conversation over as plain text, so nothing in one
provider's format is ever sent to another. These providers get no web search
and no tools — they answer, they never act on your PC.

**Local models**: **Settings… → Local models** connects **Ollama** or **LM
Studio** (leave the address empty for the usual one on this PC; Ollama's
`OLLAMA_HOST` is honoured) or any server that speaks the OpenAI API (vLLM,
llama.cpp…), with an optional key kept in the credential store. Answers stream
in as they are written, and the `<think>` blocks of reasoning models stay
hidden. A text file you dropped goes along inline (24 000 characters at most);
images and PDFs by name only. Settings tells you whether the address is this
PC — nothing leaves it then — and warns before a key would travel over plain
`http://` to another machine.

Answers from every provider are shown as **Markdown**: headings, lists, bold,
inline code, quotes, and code blocks with a copy button. It is built from text
nodes, never parsed as HTML, and only `http`/`https` links open. ipin greets
you by your first name when your account has one (the Windows display name or
the Linux GECOS full name; a bare login name is not used).

To send the Claude chat through an Anthropic-compatible gateway, set
`COUCOU_ANTHROPIC_BASE_URL` (for example `https://gateway.example.com`;
`/v1/messages` is added). It must be `https://`, or `http://` to this PC only.
Claude Code's own `ANTHROPIC_BASE_URL` is deliberately ignored: your key only
goes where you told DapinCi to send it. The gateway's host is written to the log
once; the key never is.

No telemetry. The only network requests DapinCi makes are to the services you
configure yourself.

## GitHub

With a token in **Settings… → Integrations → GitHub** — a classic token with
the `repo` scope, or a fine-grained one with read access to Pull requests,
Commit statuses and Actions — the GitHub pill shows:

- **My PRs**: your open pull requests and their CI status.
- **To review**: the pull requests waiting for your review.
- **Default branch CI**: the CI of the default branch of your 10 most recently
  pushed repositories.
- Your stars and the **last 7 days of contributions** in the card header; click
  them for the past 23 weeks, and hover or click a day for its count.

Click a row for the list, then an item to open it on github.com. The pill gets
a badge and a sound when the CI of one of your pull requests turns red or green
(fast runs between two checks included), when a default branch breaks, or when
someone requests your review. Pull requests are checked every 5 minutes, every
minute while a CI is running, and as soon as you open the card on data older
than a minute; contributions every 30 minutes. Nothing is fetched while the pill
is off or DapinCi is paused.

## Build it yourself

You need [Rust](https://rustup.rs), [Node 20+](https://nodejs.org), and the
**MSVC build tools** (Visual Studio Build Tools with "Desktop development with
C++"). WebView2 ships with Windows 10/11.

```powershell
cd windows
npm install
npm run tauri dev      # live-reloading development build
npm run pack           # builds the installer and drops it in windows/release/
```

Both of those build the relay for you. If you run `cargo test` by hand in a fresh
checkout, build it once first — the Tauri build script validates it as a bundle
resource: `cargo build --release -p coucou-hook`.

`npm run dev` alone serves the front end in an ordinary browser, which is enough
to work on the island's looks. It also serves `dev/upload-preview.html`, which
replays the whole file-drop choreography on a loop — the one part of the UI that
otherwise needs a real drag from Explorer to see — and `dev/recap-preview.html`,
the weekly recap card and its shared image on a sample week. None of these pages
ships in the app.

`npm run pack` leaves two files in `windows/release/`, the same names the release
workflow publishes:

```
DapinCi-Windows-X.Y.Z-setup.exe    the versioned installer
DapinCi-Windows-setup.exe          the same file under the rolling name
```

Installing is optional — `target/release/coucou.exe` runs on its own. There is no
window in the taskbar and no console: the island at the top of the screen and the
ipin in the notification area are the whole app, and Quit lives in its menu.

The 41 sounds are our own, rendered by `scripts/render-sounds.py`, and they live
in `windows/sounds/`. The path is declared once, in `SOUNDS_DIR` at the top of
`vite.config.ts`.

The app icon and the tray icon are drawn in code, like ipin itself:

```powershell
npm run icons          # regenerates src-tauri/icons from scripts/gen-icons.mjs
```

### Layout

```
windows/
  src/                 island front end (TypeScript, no framework)
    ipin/              Ipin and the launch greeting, in Canvas 2D
    desktop/           Ipin's own little window, when he lives on the desktop
    island/            state machine, hooks, integrations
    views/             every island view
    settings/          the settings window
  src-tauri/           Rust backend: window, named pipe, Claude API, pollers
  hook/                coucou-hook.exe, the Claude Code relay
  scripts/             icon generator
```

### Log

`%LOCALAPPDATA%\Coucou\coucou.log` — hook events, permission decisions, poller
problems. It stays on your machine. The weekly recap's history sits beside it in
`recap.json`.

### Checking the island's geometry (DPI)

The island's window is placed in physical pixels by Rust and drawn in CSS pixels
by the page, and the page converts between the two with its own
`devicePixelRatio`. That matters on Windows displays with **custom scaling**
(110 %, 115 %, ...): the host process and WebView2 can disagree about the
display's DPI there, and when they do the window comes out smaller than the page
asked for and the island would be clipped by its own window's edge. `core/dock.ts`
clamps the island into the viewport the page can really measure, so the worst case
is less reach, never a cut, and the page warns in the console when it sees it.

No unit test can catch this: it needs a real display. Walk through it by hand
after touching `src/core/dock.ts`, `src/island/island.ts` or
`src-tauri/src/island.rs`, at **100 %**, at whatever custom scale the machine is
set to, and at **125 %** (Settings > System > Display > Scale):

1. Right-click the island > Inspect (a `npm run tauri dev` build has DevTools) and
   run:

   ```js
   const i = document.getElementById("island");
   ({ dpr: devicePixelRatio, clientW: document.documentElement.clientWidth,
      screenW: screen.availWidth, winX: window.screenX,
      islandLeft: i.style.left, islandW: i.getBoundingClientRect().width })
   ```

   `clientW` must be **720** (240 while the island is hidden): the page and the
   window have to agree on how wide a 720 px window is. `dpr * clientW` should be
   the physical width Rust placed, and `screenW` the display's width in the page's
   own pixels (`physical / dpr`).
2. Settings > Positioning mode > *Free horizontal drag*, then slide to **0 %** and
   **100 %**, and open the island at both ends.

   * At 0 % the pill touches the left edge of the screen; at 100 % the right one,
     with its mini-bots still visible.
   * Opened at either end the panel is whole: no edge cut off, nothing hanging
     past the screen.
   * Between the two ends it only ever slides, and the pill follows the pointer
     during an Alt + drag.
3. The same at *Docked* left, centre and right: each sits flush against its edge,
   and opening never pushes the panel off the screen.
4. A console warning saying the island window measures something other than it was
   placed as means the two DPI sources disagree on this machine: note the numbers
   in the warning and the display scale. The island still works; it stops at the
   window's edge instead of the screen's.

## Supported agents

Every agent below is installed from **Settings → Agents** with the same steps as
Claude Code: the exact diff, the path of the dated backup, nothing written until
you click, and uninstalling removes only DapinCi's entries. A config DapinCi cannot
read, or where it finds something it does not expect, is left alone and the
reason is shown. Each agent gets its own pill (`agent_<name>`, the Mac's ids and
colours). The files live under `%USERPROFILE%`.

| Agent | Installs | Permissions |
|---|---|---|
| Claude Code | `.claude\settings.json` (**Settings → Claude Code**) | Allow / Deny and questions in the island |
| Codex | `.codex\hooks.json` — then trust the hooks once with `/hooks` in Codex | Allow / Deny in the island |
| GitHub Copilot CLI | `.copilot\hooks\coucou.json` | Allow / Deny in the island |
| Muse Code | `.config\muse\settings.json` | Allow / Deny in the island |
| Gemini CLI | `.gemini\settings.json` | asked in Gemini CLI |
| Antigravity | `.gemini\config\hooks.json` (a `coucou` hook group) | asked in Antigravity |
| Cursor Agent | `.cursor\hooks.json` — Claude Code in Cursor's terminal also goes on the Cursor pill, through the Claude Code hooks | asked in Cursor |
| Claude Desktop (Windows) | nothing to install: Claude Code sessions from the Claude app are tagged by the relay | asked in the Claude app |
| OpenCode | plugin `.config\opencode\plugins\coucou.js` | asked in OpenCode |
| Amp | plugin `.config\amp\plugins\coucou.ts` | asked in Amp |
| Hermes Agent | plugin `.hermes\plugins\coucou\` — then `hermes plugins enable coucou` once | asked in Hermes |
| Any other | run `coucou-hook --agent <name> [<Event>]` from your tool's hooks | asked in the tool |

The relay maps every agent's event and field names onto Claude Code's (Gemini
CLI's `BeforeTool`, Copilot's `preToolUse`, Cursor's `beforeSubmitPrompt`…), and
answers each agent the way it expects. It never lets anything through on its
own: with no click it prints no decision at all (`{}` for the agents that need
JSON, `"ask"` for Copilot, which is fail-closed), so the agent asks in its own
terminal exactly as without DapinCi — including when DapinCi is closed.

The plugins start the relay directly, with no shell in between, and never wait
for it. Amp's steps appear as each tool finishes: its "before" hook must return
a verdict, and DapinCi never gives one.

**How each agent runs the relay on Windows.** Hook commands are written for the
shell that runs them: Git Bash for Claude Code (quoted, forward slashes),
PowerShell for Gemini CLI and Copilot CLI (`& '…\coucou-hook.exe'`), `cmd /C`
for Codex. Cursor, Antigravity and Muse Code do not document theirs: the relay
path is written bare when it has no space or special character — which works in
cmd, PowerShell and when started directly — and in double quotes otherwise.
These three are untested on Windows.

A pill is **connected** when DapinCi finds its own entries in the files above —
the same check as Settings → Agents (for Claude Code: a SessionStart hook
running DapinCi's relay; the Cursor pill also counts Claude Code's hooks).
DapinCi only reads these files, each time the island opens. Permission requests
get the island's card for Claude Code (in any terminal, and in Cursor's),
Codex, Copilot CLI and Muse Code; other agents and Claude Desktop ask in their
own window.

## Spotify

The Spotify pill shows what is playing and controls it from the island: play and
pause, next, previous, seek, volume, shuffle and repeat, with the cover on the
card. DapinCi never plays audio itself and keeps no listening history — it reads
the player and sends commands, nothing more.

It goes through **Spotify's Web API**, so the controls need an account with
**Premium**: Spotify refuses playback commands on a free account. Something also
has to be playing somewhere — if no device of yours is active, the card says so
instead of failing.

**Connecting it takes an app of your own, once:**

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard),
   create an app (any name), and pick the **Web API** — not the Web Playback SDK.
2. Add this redirect URI **exactly**: `http://127.0.0.1:8765/callback`
   The port is fixed on purpose: Spotify matches redirect URIs character by
   character.
3. Copy the app's **Client ID**. There is no client secret to copy — see below.
4. In DapinCi, open **Settings… → Spotify**, paste the Client ID and click
   **Connect**. Your browser opens Spotify's consent page and the answer comes
   back to the port above. The pill also has to be declared in **Settings… →
   Active pills** for the island to show it.

The sign-in is **OAuth with PKCE**, which is what a desktop app can keep safe:
there is no client secret in DapinCi, and the only thing you paste is a public
Client ID. The Client ID and the refresh token are kept in the Windows Credential
Manager, never on disk — the same place your API keys go.

**A 403 is not always what it looks like.** Spotify answers 403 in two very
different cases: the account is not Premium, or the device that is playing
refuses the command. Volume is the usual one — Spotify's Web API cannot set the
volume of the phone or the web player, so a command that works against the
desktop app is refused while you listen elsewhere. DapinCi tells the two apart,
on the card and in the log.

## Where your data lives

Everything DapinCi writes is on this PC, and all of it is under one of two
folders:

| What | Where |
|---|---|
| Preferences — pills, shortcuts, language, wardrobe | `%APPDATA%\Coucou\settings.json` |
| Sounds of your own, if you drop any in | `%APPDATA%\Coucou\sounds\` |
| Chat history | `%LOCALAPPDATA%\Coucou\conversations.json` |
| Weekly recap history | `%LOCALAPPDATA%\Coucou\recap.json` |
| Log | `%LOCALAPPDATA%\Coucou\coucou.log` |
| The relay, staged there at launch | `%LOCALAPPDATA%\Coucou\bin\coucou-hook.exe` |
| Files you drop on the island | `%LOCALAPPDATA%\Coucou\inbox\` |
| API keys, and the Spotify login | the Windows Credential Manager, not a file |

Both folder names still say `Coucou`, for the reason in **Leftover names** below.

## Privacy

- **No telemetry, no analytics, no crash reporting.** DapinCi collects nothing.
- The only network requests are to services **you** configured: the chat provider
  you picked (Anthropic, Google AI, OpenAI, DeepSeek, Ollama, LM Studio, or your
  own gateway), the integrations you gave a key or a token (GitHub, Stripe,
  Vercel, Resend, Notion, Cal.com, n8n), and Spotify once you connect it. A pill
  with no key behind it never reaches the network.
- Keys and tokens live in the Windows Credential Manager. They are never written
  to the repository and never to a plain file.
- The log stays on your machine and records what the hooks did and where a poller
  failed. It holds hosts, never keys — the only host written down is the chat
  gateway's, and only when you set `COUCOU_ANTHROPIC_BASE_URL` yourself.
- The three windows (island, settings, ipin) talk to the Rust side over Tauri's
  own IPC on localhost; nothing listens on a port except the one-off Spotify
  sign-in.

## If something goes wrong

**The island doesn't appear.** Read `%LOCALAPPDATA%\Coucou\coucou.log` first:
startup, the desktop window's mode and every poller write a line there. The
island retracts into the top edge — move the pointer to the very top of the
screen to bring it back, or use **Open DapinCi** in the notification area.

**The hooks look missing, or a pill stays grey.** Open **Settings… → Claude
Code** and install the hooks again; it is safe to repeat, and your own entries in
`settings.json` are never touched. A pill is only *connected* while DapinCi finds
its own entries in that agent's config.

**No sound.** Use **Settings… → General → Open sounds folder**: a file named like
one of the 41 (`finish.wav`, `approval.mp3`…) replaces that sound. A file that
doesn't decode is ignored and the built-in sound plays instead. **Reload sounds**
re-reads the folder without restarting.

**A shortcut does nothing.** Windows gives a global shortcut to a single app. If
another app holds `Ctrl+Alt+S`, DapinCi records that in the log and shows the
conflict in **Settings… → Shortcuts**; recording a new key releases its old one.

**Starting over.** Quit DapinCi, then rename or delete `%APPDATA%\Coucou` and
`%LOCALAPPDATA%\Coucou`. Both are recreated with defaults on the next launch;
your keys stay in the Credential Manager until you clear them in Settings.

## Leftover names

A few names still carry the name of the app DapinCi is built on, and they are
deliberately untouched: each one is a contract rather than branding, and changing
it without a migration loses data or breaks agents that are already set up.

| Name | Where you meet it |
|---|---|
| `coucou-hook.exe`, and the `coucou-hook` marker DapinCi looks for | `%LOCALAPPDATA%\Coucou\bin\`, the plugin files it writes (`.copilot\hooks\coucou.json`, `plugins/coucou.js`, `plugins/coucou.ts`, `.hermes/plugins/coucou/`) and the `coucou` hook group in Antigravity |
| The named pipe `\\.\pipe\coucou-<sid>` | between the relay and the app, invisible |
| `%APPDATA%\Coucou` and `%LOCALAPPDATA%\Coucou` | every file in the table under **Where your data lives** |
| `mochiOutfit` and `desktopMochi` | JSON keys in `settings.json`, already written on disk: renaming them would lose the outfit and the desktop spot of every existing settings file |
| `COUCOU_ANTHROPIC_BASE_URL` | the environment variable that points the chat at your own gateway |
| `target\release\coucou.exe` | the binary Tauri builds; the installer's own name is `DapinCi` |

The plan for each of these lives in
`plans/DapinCi_Product_Specification_v1.md` (Lampiran A).

## Credits and licence

DapinCi is based on **[Coucou](https://github.com/Louis-CFM/coucou)** by Louis
Raillé, and the `windows/` app comes from that repository. Thank you to him: this
project exists because his work is open.

The MIT licence covers the **source code**. Coucou's own name, character, icons
and sounds are reserved and are not reused here — DapinCi's icon, its character
(ipin) and its 41 sounds are its own. The sounds are rendered by
`scripts/render-sounds.py` and the icon by `windows/scripts/gen-icons.mjs`, so
both can be regenerated rather than copied. See `LICENSE` and
`LICENSE-ASSETS.md` at the root of the repository for the exact terms.

Third-party dependencies keep their own licences; `windows/package-lock.json` and
`windows/Cargo.lock` name every one of them.
