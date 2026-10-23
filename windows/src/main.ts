// Entry point: boot the bridge, wire the island, start the greeting.

import "./style.css";
import {
  Bridge,
  IS_TAURI,
  onEvent,
  type VerificationReport,
  type VerificationStartedEvent,
  type WorkspaceInfo,
} from "./core/bridge";
import type { ScreenInfo } from "./core/dock";
import { VERIFIER_PILL_ID } from "./core/pills";
import { Sound } from "./core/sound";
import { State, type Settings } from "./core/state";
import { Island } from "./island/island";
import { registerHookHandlers } from "./island/hooks";
import { registerIntegrationHandlers, refreshConfigured } from "./island/integrations";
import { registerShortcutHandlers } from "./island/shortcuts";
import { applySpotify, registerSpotifyHandlers } from "./island/spotify";
import { SPOTIFY_ID } from "./core/spotify";
import { Recap } from "./recap/recap";
import { loadChatHistory } from "./views/chat";
import { onLanguageChange, resolveLanguage, setLanguage, systemLanguages } from "./i18n/i18n";

/** Shows the language Settings asks for ("" = the system's, when Coucou has it). */
function applyLanguage() {
  setLanguage(resolveLanguage(State.settings.language, systemLanguages()));
}

async function main() {
  const root = document.getElementById("root");
  if (!root) return;

  void Sound.preload();

  const island = new Island(root);

  const boot = await Bridge.boot();
  if (boot) {
    State.settings = { ...State.settings, ...boot.settings };
    // Which display the island lives on is geometry, and geometry is the page's
    // to decide (core/dock.ts): Rust only knows where that display is.
    island.setMonitor(boot.screen);
  }
  // A language change redraws the island in place: the texts given as tl(…)
  // relabel themselves (views/dom.ts) and the views redraw the rest on this
  // sync. Nothing is rebuilt, so tasks, steps and the chat stay as they are.
  onLanguageChange(() => State.notify());
  applyLanguage();
  // Rust shows the tray and its errors in the same language as the webview.
  void Bridge.setSystemLanguages(systemLanguages());
  island.applySettings();
  State.loadIntegrationTasks();
  const initialWorkspace = await Bridge.getCurrentWorkspace();
  if (initialWorkspace) {
    State.setWorkspace(initialWorkspace);
  } else {
    State.syncVerifierPill(true);
  }
  // The chat the last session was on, before the island is drawn.
  await loadChatHistory();
  if (boot && !boot.cursorPoll) island.followPageCursor();
  await island.desktop.init();

  await onEvent<{ x: number; y: number }>("cursor", ({ x, y }) => island.onCursor(x, y));
  await onEvent<boolean>("pointer-inside", (inside) => island.setPointerInside(inside));

  /** Pause has to reach Rust too, or the pollers keep calling out. */
  const setPaused = (on: boolean) => {
    if (State.paused === on) return;
    State.paused = on;
    void Bridge.setPaused(on);
  };

  await onEvent<string>("tray", (what) => {
    switch (what) {
      case "settings":
        setPaused(false);
        island.alert("settings");
        break;
      case "open":
        setPaused(false);
        island.alert(State.defaultView());
        break;
      case "recap":
        setPaused(false);
        void Recap.open(island);
        break;
      case "wardrobe":
        setPaused(false);
        island.alert("wardrobe");
        break;
      case "pause":
        setPaused(!State.paused);
        if (State.paused) island.fsm.forceHidden();
        else island.reveal();
        break;
    }
  });

  // Displays get rearranged, rescaled and unplugged: Rust watches, and reports
  // where the island's display is now.
  await onEvent<ScreenInfo>("screen-changed", (info) => island.setMonitor(info));

  // Settings → Reload sounds: read the sounds folder again, and let them hear it.
  await onEvent<null>("sounds-changed", () => {
    void Sound.reload().then(() => Sound.play("pop"));
  });

  // The settings window writes preferences; apply them here without a restart.
  await onEvent<Settings>("settings-changed", (s) => {
    const previousMain = State.mainPillId;
    State.settings = { ...State.settings, ...s };
    applyLanguage();
    island.applySettings();
    State.loadIntegrationTasks();
    // A new main tool comes to the front, as on macOS.
    if (State.mainPillId !== previousMain) State.setFocus(State.mainPillId);
    void refreshConfigured();
  });

  await onEvent<WorkspaceInfo>("workspace-changed", (ws) => {
    State.setWorkspace(ws);
    State.setFocus(VERIFIER_PILL_ID);
    island.reveal();
  });

  await onEvent<VerificationStartedEvent>("verification-started", (evt) => {
    State.beginVerification(evt);
    island.applyVerificationStatus("verifying");
    island.reveal();
  });

  await onEvent<VerificationReport>("verification-finished", (report) => {
    State.finishVerification(report);
    const status = report.cancelled ? "idle" : report.passed ? "verified" : "failed";
    island.applyVerificationStatus(status);
    if (!report.cancelled && !report.passed && !State.paused) {
      State.setFocus(VERIFIER_PILL_ID);
      island.alert("overview");
    }
  });

  registerHookHandlers(island);
  registerIntegrationHandlers(island);
  registerShortcutHandlers(island, () => setPaused(false));
  registerSpotifyHandlers(island);
  // Rust may have read Spotify before this page listened: ask once.
  if (State.settings.activeIntegrations.includes(SPOTIFY_ID)) {
    void Bridge.spotifyRefresh().then((s) => s && applySpotify(island, s));
  }

  // Monday recap: app start (greeting over), an agent starting work, waking up.
  const checkRecap = () => void Recap.check(island);
  island.onGreetingDone = checkRecap;
  island.onWake = checkRecap;
  await onEvent<null>("recap-check", checkRecap);

  island.launch();

  // In a plain browser there is no wake strip behind the cursor: make the whole
  // page wake the island so the visuals can be checked with `npm run dev`.
  if (!IS_TAURI) {
    document.addEventListener("click", () => Sound.resume(), { once: true });
  }
}

void main();
