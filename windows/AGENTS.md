# DapinCi — third-party agent integration

Any tool that can write to a Windows named pipe can send events to DapinCi and
get its own pill next to Claude Code. DapinCi does not need to know the tool in
advance.

## The `coucou_agent` field

Add the optional field `coucou_agent` to any hook JSON payload. DapinCi creates a
pill labelled with that name and routes the events to it.

Validation: the name must match `^[a-z0-9-]{1,24}$` — lowercase letters, digits
and hyphens, 1 to 24 characters. An absent or invalid name routes the event to
the Claude Code pill instead.

The field still says `coucou`: it is a data contract that tools already send.
See **Leftover names** in `README.md` for the other names that deliberately stay.

## Hook command (Windows)

Configure your tool to call the relay with `--agent <your-name>`. DapinCi stages
the relay at launch:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "C:\\Users\\<you>\\AppData\\Local\\Coucou\\bin\\coucou-hook.exe --agent my-tool"
      }
    ]
  }
}
```

Quote the path if it contains spaces. **Settings → Agents** installs the same
relay for the built-in agents and shows the exact shape each one expects.

## Sending events directly

The relay talks to DapinCi over `\\.\pipe\coucou-<SID>`, where `<SID>` is your
Windows account SID as a string (`S-1-5-21-…`). The SID keeps two accounts on the
same machine apart, and both ends check that the other belongs to the same user.

You normally do not need this: calling the relay is simpler and keeps the wire
format in one place. If you write to the pipe yourself, send one
newline-terminated JSON object per event and add `coucou_agent` to it:

```json
{
  "hook_event_name": "UserPromptSubmit",
  "session_id": "my-session-1",
  "coucou_agent": "my-tool",
  "prompt": "Running task…"
}
```

## Supported events

All standard Claude Code hook events are supported:

| Event | Effect |
|---|---|
| `SessionStart` | Creates the pill (if absent), sets state to idle |
| `UserPromptSubmit` | State → thinking; prompt shown in the ticker |
| `PreToolUse` | State → working; tool label shown in the ticker |
| `PostToolUse` / `PostToolUseFailure` | State → working |
| `PermissionRequest` | Allow / Deny card for Claude Code, Codex, Copilot CLI and Muse Code; other agents are asked in their own window |
| `Notification` | Rate-limit or question state if applicable |
| `Stop` | State → finished for 5 s; declared pills reset to idle, the others are removed |
| `StopFailure` | State → error |
| `SessionEnd` | Declared pills reset to idle; the others are removed |
| `SubagentStart` / `SubagentStop` | Step added to the ticker |

## Declared pills

A pill is **declared** when it is enabled in **Settings → Active pills**. When a
session ends, a declared pill stays visible and resets to idle; any other pill
is removed.

Session support is independent of that: a tool that sends `coucou_agent` gets a
pill for as long as its session runs, whether or not it is in the catalog.

## Quick test (Windows)

With DapinCi running, in PowerShell:

```powershell
'{"hook_event_name":"UserPromptSubmit","session_id":"t1","prompt":"hello","coucou_agent":"demo"}' |
  & "$env:LOCALAPPDATA\Coucou\bin\coucou-hook.exe" --agent demo
```

A **demo** pill should appear in the island.
