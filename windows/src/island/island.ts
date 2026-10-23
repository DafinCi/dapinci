// The island: DOM shell, sizing animation, ipin placement, mouse handling.
// Mirrors IslandRootView.swift + IslandWindowController.swift.

import { Tracked, Spring, clamp } from "../core/anim";
import { Bridge, IS_TAURI, onDragDrop } from "../core/bridge";
import {
  COMPACT_W, EXPANDED_W, NOTCH_W, PANEL_H, PANEL_W,
  ROUNDED_CORNER, VIEW_LAYOUTS, botGlowColor, botGlowOpacity, botPosition, chatPromptHeight,
  islandSize,
  QUESTION_PICKER_H,
  type BotEmoteName, type IslandMode, type IslandViewName,
} from "../core/layout";
import {
  EDGE_MARGIN,
  computeRadius,
  placeIsland,
  toCssMonitor,
  toPhysical,
  type MonitorRect,
  type Placement,
  type Rect,
  type ScreenInfo,
} from "../core/dock";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { SPOTIFY_ID, islandDances } from "../core/spotify";
import { BotEngine, hexToRGB } from "../ipin/engine";
import { PET_CURSOR_CSS, SQUEEZE_CURSOR_CSS } from "../ipin/cursor";
import { createMiniBot, pruneMiniBots, syncMiniBotStates, tickMiniBots } from "../ipin/minibots";
import { SeasonCache, parseOutfit } from "../ipin/wardrobe";
import { UploadCanvas } from "../upload/canvas";
import { USC, UploadSeq } from "../upload/sequence";
import { closePlanCard, openPlanColor, planCardOpen } from "../views/usage";
import { buildHeader, buildViews, type ViewActions, type ViewHost } from "../views/views";
import { h } from "../views/dom";
import { t } from "../i18n/i18n";
import { IslandStateMachine } from "./fsm";
import { refreshHookPills } from "./integrations";
import { DesktopLink } from "./desktop";
import type { ViewCommand } from "./shortcuts";
import { DRAG_THRESHOLD } from "../ipin/desktop-logic";

const BOT_OVERHANG = 40;
const CLAUDE_DESKTOP_ID = "agent_claude-desktop";

/** Rect comparison with the tolerance a screen can actually show. */
function differs(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    Math.abs(a.x - b.x) > 0.5 ||
    Math.abs(a.y - b.y) > 0.5 ||
    Math.abs(a.w - b.w) > 0.5 ||
    Math.abs(a.h - b.h) > 0.5
  );
}

/** The browser's idea of the screen, until Rust reports the island's display. */
function screenFallback(): ScreenInfo {
  const dpr = window.devicePixelRatio || 1;
  const w = window.screen?.width ?? 0;
  const h = window.screen?.height ?? 0;
  // Physical, like Rust's ScreenInfo: the page converts with its own dpr.
  return { x: 0, y: 0, width: (w > 0 ? w : 1920) * dpr, height: (h > 0 ? h : 1080) * dpr, scale: dpr };
}
/** Fixed maximum canvas bounding box to avoid reallocating GPU textures on animation */
const BOT_CANVAS_SIZE = 200;
/** Same margin as the Rust hit test (src-tauri/src/island.rs). */
const HIT_MARGIN = 14;

/** The three views the drop sequence owns; leaving them stops the engine. */
const UPLOAD_VIEWS: ReadonlySet<IslandViewName> = new Set(["upload", "uploading", "choose"]);

/** Seconds between the drop and the moment the progress bar starts filling. */
const PRE_PROGRESS = USC.T_PROG_START - USC.T_DROP;

const modeOrder = (m: IslandMode) => (m === "hidden" ? 0 : m === "compact" ? 1 : 2);

export class Island {
  readonly fsm = new IslandStateMachine();
  /** ipin on the desktop: his life cycle and the drag out of the island. */
  readonly desktop: DesktopLink;

  private root: HTMLElement;
  private islandEl!: HTMLElement;
  private clipEl!: HTMLElement;
  private contentEl!: HTMLElement;
  private viewsEl!: HTMLElement;
  private botCanvas!: HTMLCanvasElement;
  private botGlow!: HTMLElement;
  private miniGrid!: HTMLElement;
  private countdown!: HTMLElement;
  private wakeStrip!: HTMLElement;
  private announcerEl!: HTMLElement;

  private header!: ViewHost;
  private views!: Map<IslandViewName, ViewHost>;
  private uploadCanvas!: UploadCanvas;

  private width = new Tracked(NOTCH_W);
  private height = new Tracked(0);
  private radius = new Tracked(ROUNDED_CORNER);
  private botCx = new Spring(46);
  private botCy = new Spring(16);
  private botSize = new Spring(10);

  private engine = new BotEngine();
  /** The next expansion makes no open whoosh: the launch greeting has sounds of its own. */
  private silentOpen = false;
  private seasons = new SeasonCache();

  private islandDragActive = false;
  private islandDragStartX = 0;
  private islandDragStartPercent = 0.5;
  private saveTimeout: number | null = null;

  private saveThrottled() {
    if (this.saveTimeout != null) return;
    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = null;
      void Bridge.saveSettings(State.settings);
    }, 50);
  }

  private running = false;
  private lastFrame = 0;
  private dirty = true;

  // Rust starts the window at full size so the launch greeting has room.
  private collapsed = false;
  private collapseTimer: number | null = null;
  private wasInIsland = false;
  /** Last shape handed to Rust for the click-through test. */
  private pushedRect = { x: -1, y: -1, w: -1, h: -1 };
  /** Last window rect handed to Rust: the window follows the island, not the reverse. */
  private pushedWindow = { x: -1, y: -1, w: -1, h: -1 };
  /** The display the island lives on, in physical pixels, as Rust reports it. */
  private monitor: ScreenInfo = screenFallback();
  /** False until Rust has said which display that is: nothing is pushed before that. */
  private monitorReady = false;
  /** A viewport that did not match the window we placed, and when it started. */
  private viewportAlarm: { sig: string; since: number } | null = null;

  // Bot hover → love (IslandWindowController.botHoverIn)
  private botHovering = false;
  private botHoverTimer: number | null = null;
  private lastLoveTime = 0;
  private botHoverStart = { x: 0, y: 0 };
  private ambientLookTarget = { x: 0, y: 0 };
  private ambientTimer: number | null = null;

  private confusedRecovery: number | null = null;
  private prevViewBeforeConfused: IslandViewName = "overview";
  private lastSyncedView: IslandViewName | null = null;

  /** The launch greeting ended, or the island came out of hidden — two of the
   *  moments the Monday recap may open (see src/recap/recap.ts). */
  onGreetingDone: (() => void) | null = null;
  onWake: (() => void) | null = null;

  /** Where a press on ipin started: moving past DRAG_THRESHOLD drags him out. */
  private botPress: { x: number; y: number } | null = null;

  /** The next reveal from hidden makes no peek (music starting, as on macOS). */
  private silentReveal = false;

  /** Drop sequence bookkeeping: last tick played, and whether the ✓ has fired. */
  private uploadTens = 0;
  private uploadDone = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.desktop = new DesktopLink({
      reveal: () => this.reveal(),
      wardrobeFromDesktop: () => this.wardrobeFromDesktop(),
      dizzyFromDesktop: () => this.handleDizzy(),
    });
    this.build();
    this.wireFsm();
    this.wireInput();
    this.engine.onDizzy = () => this.handleDizzy();
    this.engine.onGreetDone = () => {
      this.fsm.greetComplete();
      this.onGreetingDone?.();
    };
    State.subscribe(() => {
      this.dirty = true;
      if (State.settings.followCursor === false) {
        this.scheduleAmbientGlance();
      } else if (this.ambientTimer != null) {
        window.clearTimeout(this.ambientTimer);
        this.ambientTimer = null;
      }
      this.ensureRunning();
    });
    if (State.settings.followCursor === false) {
      this.scheduleAmbientGlance();
    }
  }

  /** The request has its answer: the card goes and the session carries on. */
  private closeApproval() {
    State.endApproval();
    this.fsm.pinned = false;
    this.setView(State.defaultView());
  }

  /**
   * Folds a card that is waiting for an answer down to the compact island,
   * without answering it (Mac #290). Nothing is decided: the request keeps
   * waiting, the island stays on screen, and opening it shows the card again.
   */
  foldApproval() {
    if (!State.pendingApproval || State.mode !== "expanded") return;
    State.isPinned = true;
    this.fsm.pinned = true;
    this.fsm.forcePetit();
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────

  private build() {
    const actions: ViewActions = {
      setView: (v) => this.setView(v),
      cancelDrop: () => this.discardDrop(),
      collapse: () => this.collapse(),
      foldApproval: () => this.foldApproval(),
      setFocus: (id) => {
        State.setFocus(id);
        Sound.play("blip");
        // A pill with a waiting request opens on its card: going back to it
        // after looking at another pill brings the card up again.
        const req = State.pendingApproval;
        if (req?.pillId === id) this.setView(req.questions ? "question" : "approval");
      },
      openTerminal: () => {
        const task = State.focusTask;
        // Sessions from the Claude desktop app live there, not in a terminal.
        if (task?.id === CLAUDE_DESKTOP_ID) void Bridge.openClaudeDesktop();
        else void Bridge.openSession(task?.sessionId ?? null, task?.sessionCwd ?? null);
      },
      // The ↗ button — same targets as openAgentTarget() on macOS.
      openTarget: () => {
        const task = State.focusTask;
        if (!task) return;
        const urls: Record<string, string> = {
          integration_resend: "https://resend.com/emails",
          integration_vercel: "https://vercel.com/dashboard",
          integration_github: "https://github.com/pulls",
          integration_stripe: "https://dashboard.stripe.com/payments",
          integration_notion: "https://notion.so",
          integration_calcom: "https://app.cal.com/bookings",
        };
        if (task.id === CLAUDE_DESKTOP_ID) void Bridge.openClaudeDesktop();
        else if (task.id === "pill_verifier") {
          void Bridge.openInVSCode(State.workspace?.path ?? task.sessionCwd ?? null);
        } else if (task.id === "integration_claude" || task.sessionId) {
          void Bridge.openSession(task.sessionId ?? null, task.sessionCwd ?? null);
        } else if (task.id === "integration_n8n") void Bridge.openN8n();
        else if (task.id === SPOTIFY_ID) void Bridge.spotifyOpen();
        else if (urls[task.id]) void Bridge.openUrl(urls[task.id]);
      },
      openUrl: (url) => {
        if (url) void Bridge.openUrl(url);
      },
      decide: (d) => {
        const req = State.pendingApproval;
        void Bridge.log(`decide ${d} req=${req?.requestId ?? "none"}`);
        if (!req) return;
        Sound.play(d === "deny" ? "blip" : "approve");
        void Bridge.approvalDecision(req.requestId, d);
        this.closeApproval();
      },
      answer: (answers) => {
        const req = State.pendingApproval;
        if (!req) return;
        Sound.play("approve");
        void Bridge.approvalAnswer(req.requestId, answers);
        this.closeApproval();
      },
      answerInTerminal: () => {
        const req = State.pendingApproval;
        if (!req) return;
        Sound.play("blip");
        void Bridge.approvalDecline(req.requestId);
        this.closeApproval();
      },
      toggleSound: () => {
        State.settings.soundEnabled = !State.settings.soundEnabled;
        Sound.setEnabled(State.settings.soundEnabled);
        void Bridge.saveSettings(State.settings);
        State.notify();
      },
      setVolume: (v) => {
        State.settings.soundVolume = v;
        Sound.setVolume(v);
        void Bridge.saveSettings(State.settings);
        State.notify();
      },
      setAutoClose: (s) => {
        State.settings.autoCloseInterval = s;
        this.fsm.homeToPetitDelay = s;
        void Bridge.saveSettings(State.settings);
        State.notify();
      },
      openSettingsWindow: () => void Bridge.openSettingsWindow(),
      blip: () => Sound.play("blip"),
      chooseOutfit: (selection) => {
        if (parseOutfit(State.settings.mochiOutfit) === selection) return;
        State.settings.mochiOutfit = selection;
        void Bridge.saveSettings(State.settings);
        Sound.play("pop");
        this.engine.triggerEmote("proud");
        State.notify();
      },
      previewOutfit: (outfit) => {
        State.wardrobePreview = outfit;
        State.notify();
      },
    };

    this.wakeStrip = h("div", { id: "wake-strip" });
    this.botGlow = h("div", { id: "bot-glow" });
    this.botCanvas = h("canvas", {
      id: "bot-canvas",
      title: `${t("Send ipin to the desktop")} · ${t("Open the wardrobe")}`,
    }) as HTMLCanvasElement;
    const initialDpr = Math.min(2, window.devicePixelRatio || 1);
    this.botCanvas.width = Math.round(BOT_CANVAS_SIZE * initialDpr);
    this.botCanvas.height = Math.round(BOT_CANVAS_SIZE * initialDpr);
    this.botCanvas.style.width = `${BOT_CANVAS_SIZE}px`;
    this.botCanvas.style.height = `${BOT_CANVAS_SIZE}px`;
    this.miniGrid = h("div", { id: "mini-grid" });
    this.countdown = h("div", { id: "countdown" });
    this.announcerEl = h("div", {
      id: "island-announcer",
      class: "sr-only",
      "aria-live": "polite",
      "aria-atomic": "true",
    });

    this.header = buildHeader(actions);
    this.views = buildViews(actions, () => this.animateGeometry(false));
    this.viewsEl = h("div", { id: "views" });
    for (const v of this.views.values()) this.viewsEl.append(v.el);
    this.contentEl = h("div", { id: "content" }, this.header.el, this.viewsEl);

    // The drop sequence draws the card, the bar and its own ipin. It sits under
    // the header, which stays visible on top of it exactly as on macOS.
    this.uploadCanvas = new UploadCanvas({
      ask: () => {
        State.promptContext = State.droppedFile
          ? { kind: "file", name: State.droppedFile.name, path: State.droppedFile.path }
          : null;
        this.setView("prompt");
      },
      cancel: () => this.discardDrop(),
    });

    this.clipEl = h(
      "div",
      { id: "island-clip" },
      this.uploadCanvas.el,
      this.contentEl,
    );
    this.islandEl = h(
      "div",
      { id: "island" },
      this.clipEl,
      this.botGlow,
      this.botCanvas,
      this.miniGrid,
      this.countdown,
      this.announcerEl,
    );

    this.root.append(this.wakeStrip, this.islandEl);
    this.applyGeometry();
  }

  // ── FSM ─────────────────────────────────────────────────────────────────────

  private wireFsm() {
    this.fsm.homeToPetitDelay = State.settings.autoCloseInterval;
    this.fsm.openOnHover = State.settings.openOnHover;
    this.fsm.onTransition = (from, to) => {
      // The greeting is over, however it ended: back to his desktop spot.
      if (from === "coucou" && to !== "coucou") this.desktop.launch();
      switch (to) {
        case "hidden":
          this.setMode("hidden");
          break;
        case "petit":
          if (from === "hidden" && !this.silentReveal) Sound.play("peek");
          this.setMode("compact");
          if (from === "coucou") State.view = State.defaultView();
          if (!this.wasInIsland) this.fsm.mouseLeft();
          break;
        case "home":
          this.expand(State.defaultView());
          if (!this.wasInIsland) this.fsm.mouseLeft();
          // Hooks may have been installed in a terminal since: the idle cards
          // say so on the next open, without polling while the island is shut.
          void refreshHookPills();
          break;
        case "coucou": {
          // The island lends him a stage, opened silently so the greeting's own
          // sounds are not buried under the open whoosh. He greets on his usual
          // canvas, already in place, half out of the top edge of the screen.
          this.silentOpen = true;
          this.expand("greeting");
          this.silentOpen = false;
          const p = botPosition("expanded", "greeting", VIEW_LAYOUTS.greeting.height);
          this.botCx.set(p.cx);
          this.botCy.set(p.cy);
          this.botSize.set(p.diameter / 0.6);
          this.engine.greet();
          break;
        }
      }
      // Whatever ends the greeting early — the pointer leaving, an alert, a click
      // on the compact island — he finishes his turn and puts his hand away.
      if (from === "coucou" && to !== "coucou") this.engine.interruptGreet();
      State.notify();
      if (from === "hidden") this.onWake?.();
    };
  }

  launch() {
    this.fsm.launch();
  }

  // ── Mode / view ─────────────────────────────────────────────────────────────

  private setMode(mode: IslandMode) {
    const prev = State.mode;
    if (mode === prev) return;
    State.mode = mode;
    if (mode === "expanded" && !this.silentOpen) Sound.play("open");
    if (prev === "expanded") {
      Sound.play("close");
      // A folded card is still waiting: it keeps the island pinned.
      if (!State.pendingApproval) State.isPinned = false;
      void Bridge.focusWindow(false);
    }
    if (mode !== "expanded") {
      closePlanCard();
      this.engine.resetMorph();
      // Nothing can be seen of the sequence once the island is shut, and leaving
      // it running would keep the frame loop awake — the island must cost
      // nothing while hidden.
      UploadSeq.deactivate();
    }
    this.updateWindowCollapsed();
    this.animateGeometry(modeOrder(mode) < modeOrder(prev));
    State.notify();
  }

  /** True while the drop sequence owns the island body. */
  private get uploadActive(): boolean {
    return State.mode === "expanded" && UploadSeq.isActive && UPLOAD_VIEWS.has(State.view);
  }

  /** Navigating out of the drop flow ends the sequence, as on macOS. */
  private stopSequenceIfLeaving(view: IslandViewName) {
    if (UploadSeq.isActive && !UPLOAD_VIEWS.has(view)) UploadSeq.deactivate();
  }

  expand(view: IslandViewName) {
    this.stopSequenceIfLeaving(view);
    if (view !== "overview") closePlanCard();
    State.view = view;
    const isCritical = view === "approval" || view === "question" || State.pendingApproval != null;
    if (isCritical) {
      this.fsm.pinned = true;
      this.fsm.cancelTimers();
    }
    if (State.mode !== "expanded") this.setMode("expanded");
    else this.animateGeometry(false);
    State.lastActivity = performance.now();
    State.notify();
  }

  setView(view: IslandViewName) {
    this.stopSequenceIfLeaving(view);
    if (view !== "overview") closePlanCard();
    const isCritical = view === "approval" || view === "question" || State.pendingApproval != null;
    if (isCritical) {
      this.fsm.pinned = true;
      this.fsm.cancelTimers();
    }
    if (State.mode !== "expanded") {
      this.fsm.forceHome();
      State.view = view;
      this.animateGeometry(false);
      State.notify();
      return;
    }
    const grew = VIEW_LAYOUTS[view].height >= VIEW_LAYOUTS[State.view].height;
    State.view = view;
    State.lastActivity = performance.now();
    this.animateGeometry(!grew);
    State.notify();
  }

  collapse() {
    // A waiting card is only ever folded, never dropped by a close.
    if (State.pendingApproval) {
      this.foldApproval();
      return;
    }
    State.isPinned = false;
    this.fsm.pinned = false;
    // Drive the state machine rather than the mode: setting the mode behind its
    // back left it thinking the island was still open, and a click on the compact
    // island then did nothing — the island could never be reopened.
    this.fsm.forcePetit();
  }

  /** Alert from the hook server: open on this view. Pinned alerts never auto-close. */
  alert(view: IslandViewName) {
    const isCritical = view === "approval" || view === "question" || State.pendingApproval != null;
    this.fsm.pinned = isCritical || State.isPinned;
    if (isCritical) this.fsm.cancelTimers();
    this.fsm.forceHome();
    this.expand(view);
    if (this.announcerEl) {
      this.announcerEl.textContent =
        view === "approval" ? t("needs permission") : view === "question" ? t("is asking a question") : "";
    }
  }

  reveal() {
    this.fsm.reveal();
  }

  /** Music started playing: the compact island, without the peek sound (musicReveal). */
  revealSilently() {
    this.silentReveal = true;
    this.fsm.reveal();
    this.silentReveal = false;
  }

  /**
   * Something Rust wants said: the note card, taken back after a moment the way a
   * failed drop is. A control that silently does nothing is the outcome worth
   * avoiding — a free account, or nothing playing anywhere.
   */
  note(message: string) {
    State.noteMessage = message;
    this.setView("note");
    Sound.play("error");
    window.setTimeout(() => this.setView(State.defaultView()), 2400);
  }

  /** Right-click on ipin: wardrobe open ↔ back to the usual view. */
  toggleWardrobe() {
    if (State.paused || State.mode === "hidden") return;
    // The greeting and the drop sequence draw a ipin of their own.
    if (State.mode === "expanded" && (State.view === "greeting" || this.uploadActive)) return;
    if (State.mode === "expanded" && State.view === "wardrobe") this.setView(State.defaultView());
    else this.setView("wardrobe");
  }

  /**
   * Right-click on the desktop ipin (macOS openWardrobeFromDesktop): opens the
   * wardrobe from any state, or goes back if it is already open.
   */
  wardrobeFromDesktop() {
    this.wardrobeAnywhere();
  }

  /**
   * The wardrobe from any state — compact or hidden island included — or back
   * to the usual view if it is already open. The desktop ipin's right-click
   * and the wardrobe shortcut (`open-wardrobe`) both land here.
   */
  wardrobeAnywhere() {
    if (State.mode === "expanded" && State.view === "wardrobe") {
      this.setView(State.defaultView());
      return;
    }
    if (State.paused) return;
    this.alert("wardrobe");
  }

  /** An alert stopped waiting for an answer: let the island auto-close again. */
  dropPin() {
    this.fsm.pinned = false;
    // The countdown the pin held back starts now, if the mouse is elsewhere.
    if (!this.wasInIsland) this.fsm.mouseLeft();
  }

  // ── Keyboard shortcuts (island/shortcuts.ts) ────────────────────────────────

  emote(name: BotEmoteName) {
    this.engine.triggerEmote(name);
    this.ensureRunning();
  }

  /** Connects Tier 0 verification status changes directly to ipin's mascot reaction. */
  applyVerificationStatus(status: "idle" | "verifying" | "verified" | "failed") {
    this.engine.applyVerificationStatus(status);
    this.ensureRunning();
  }

  /** Ctrl+P: keep the open island from folding away, or let it fold again. */
  setPinned(on: boolean) {
    State.isPinned = on;
    this.fsm.pinned = on;
    if (on) {
      // The countdown bar reads the state machine's deadline, cleared with it.
      this.fsm.cancelTimers();
    } else if (!this.wasInIsland && this.fsm.state === "home") {
      this.fsm.mouseLeft();
    }
    State.notify();
  }

  /** The island takes the keyboard, so its own shortcuts work (Mac: makeKey).
   *  It gives it back when it closes, or when the chat is left. */
  takeKeyboard() {
    void Bridge.focusWindow(true);
  }

  /** The desktop shortcut needs a desktop ipin: none on GNOME's Wayland. */
  canLeaveIsland(): boolean {
    return this.desktop.supported;
  }

  /** The desktop shortcut (macOS DesktopIpinController.flyOutOrHome). */
  flyOutOrHome() {
    // The greeting and the drop sequence draw a ipin of their own: he stays
    // for them, as he does for a drag (canDragOut).
    const busy = State.mode === "expanded" && (State.view === "greeting" || this.uploadActive);
    if (busy && !State.ipinOnDesktop) return;
    this.desktop.flyOutOrHome();
  }

  /** Ctrl+O / Ctrl+E go to the view on screen. */
  viewCommand(command: ViewCommand) {
    this.views.get(State.view)?.command?.(command);
  }

  // ── File drop ───────────────────────────────────────────────────────────────

  private onDragDrop(e: { type: string; paths?: string[] }) {
    if (e.type !== "over") void Bridge.log(`drag ${e.type} ${e.paths?.length ?? 0} file(s)`);
    if (State.paused) return;
    switch (e.type) {
      case "enter":
      case "over": {
        if (State.fileDragOver) return;
        Sound.play("attach");
        State.fileDragOver = true;
        this.engine.animateMorph(1);
        // enterZone must run before the island expands, so the sequence is
        // already active by the time the view becomes `upload`.
        UploadSeq.enterZone(State.mouseInIsland.x, State.mouseInIsland.y);
        this.alert("upload");
        break;
      }
      case "leave": {
        if (!State.fileDragOver) return;
        State.fileDragOver = false;
        this.engine.animateMorph(0);
        // The island deliberately stays open: the drag session is still alive.
        UploadSeq.exitZone();
        State.notify();
        break;
      }
      case "drop": {
        State.fileDragOver = false;
        const path = e.paths?.[0];
        if (!path) {
          this.engine.animateMorph(0);
          this.setView(State.defaultView());
          return;
        }
        this.swallow(path);
        break;
      }
    }
  }

  /**
   * ipin eats the file. Nothing here waits on the file system: the copy into
   * the inbox runs in the background and swaps the path in when it lands, so a
   * slow disk can never stall the animation — same as FileDropHandler on macOS.
   */
  private swallow(path: string) {
    const name = path.split(/[\\/]/).pop() || "file";
    State.droppedFile = { name, path };
    State.promptContext = { kind: "file", name, path };
    State.chatHistory = [];
    void Bridge.chatReset();

    UploadSeq.performDrop(State.uploadDuration);
    this.uploadTens = 0;
    this.uploadDone = false;

    this.engine.gulp();
    Sound.play("gulp");
    this.engine.triggerEmote("happy");
    this.engine.animateMorph(0);

    State.uploadProgress = 0;
    this.setView("uploading");
    this.ensureRunning();

    void Bridge.ingestFile(path)
      .then((file) => {
        // Cancelled (or replaced by another drop) while the copy was running.
        if (State.droppedFile?.path !== path) return;
        State.droppedFile = { name: file.name, path: file.path };
        State.promptContext = { kind: "file", name: file.name, path: file.path };
        State.notify();
      })
      .catch((err) => {
        if (State.droppedFile?.path !== path) return;
        UploadSeq.deactivate();
        State.noteMessage = String(err).replace(/^Error:\s*/, "");
        this.engine.animateMorph(0);
        this.setView("note");
        Sound.play("error");
        window.setTimeout(() => this.setView(State.defaultView()), 2400);
      });
  }

  /** "Cancel" on the dropped file: forget it, so the chat does not pick it up. */
  private discardDrop() {
    State.droppedFile = null;
    State.promptContext = null;
    this.setView(State.defaultView());
  }

  /**
   * Sounds and view changes hung off the canvas timeline: a `tick` every 10 %,
   * the ✓ chime when the bar completes, then `choose` once ipin has grown back.
   */
  private stepSequence() {
    const since = UploadSeq.sinceDrop();
    if (since == null) return;
    const dur = State.uploadDuration;
    const p = Math.max(0, Math.min(1, (since - PRE_PROGRESS) / dur));

    const tens = Math.floor(p * 10);
    if (tens > this.uploadTens && tens < 10) {
      this.uploadTens = tens;
      Sound.play("tick");
    }

    if (!this.uploadDone && since >= PRE_PROGRESS + dur) {
      this.uploadDone = true;
      Sound.play("approve");
      this.engine.triggerEmote("happy");
    }
    // The extra second is the grow-back, after which the choose card is up.
    if (since >= PRE_PROGRESS + dur + 1 && State.view === "uploading") {
      this.setView("choose");
    }
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  private targetSize(): { w: number; h: number; r: number } {
    let { w, h } = islandSize(State.mode, State.view, State.chatHistory.length);
    if (State.mode === "expanded" && State.view === "question" && State.pendingApproval?.questions) {
      h = QUESTION_PICKER_H;
    }
    const isExpanded = State.mode === "expanded";
    const style = State.settings.islandStyle ?? "flush";
    const r = computeRadius(style, isExpanded);
    return { w, h, r };
  }

  private animateGeometry(shrinking: boolean) {
    const { w, h, r } = this.targetSize();
    if (shrinking) {
      this.width.curveTowards(w);
      this.height.curveTowards(h);
      this.radius.curveTowards(r);
    } else {
      this.width.springTo(w);
      this.height.springTo(h);
      this.radius.springTo(r);
    }
    this.ensureRunning();
  }

  private applyGeometry() {
    const w = this.width.value;
    const hh = this.height.value;
    const r = this.radius.value;
    const style = State.settings.islandStyle ?? "flush";
    const { window: win, island, strip } = this.place();

    this.islandEl.style.width = `${w}px`;
    this.islandEl.style.height = `${hh}px`;

    if (style === "floating") {
      this.islandEl.style.borderRadius = `${r}px`;
    } else {
      this.islandEl.style.borderRadius = `0 0 ${r}px ${r}px`;
    }

    // The island is placed, not centred by CSS: its own x is what holds it
    // against the edge it was asked for. The window slides under it, so opening
    // the panel can never run it off the screen (see core/dock.ts).
    this.islandEl.style.left = `${island.x}px`;
    this.islandEl.style.right = "auto";
    this.islandEl.style.transform = "none";
    this.islandEl.style.top = `${island.y}px`;
    this.wakeStrip.style.left = `${strip.x}px`;
    this.wakeStrip.style.right = "auto";
    this.wakeStrip.style.transform = "none";

    // The window follows the island, so it has to be in place before the island
    // grows wider than the room it has. Pushed on every real change, never every
    // frame: this runs at 60 Hz.
    if (this.monitorReady) {
      // Physical pixels: the Windows side places windows in those, and the page
      // is the side that knows the ratio it renders with (see core/dock.ts).
      const dpr = this.dpr();
      const monitor = this.cssMonitor();
      const want = toPhysical(
        { x: win.x - monitor.x, y: win.y - monitor.y, w: win.w, h: win.h },
        dpr,
      );
      if (differs(this.pushedWindow, want)) {
        this.pushedWindow = want;
        void Bridge.applyWindow(want.x, want.y, want.w, want.h);
      }
      this.checkViewport(win.w, win.h, dpr);
    }

    // These follow the island as it resizes, so they belong here rather than in
    // the state-driven DOM sync.
    this.miniGrid.style.left = `${w - 40 - 14.5}px`;
    this.miniGrid.style.top = `${hh / 2 - 14.5}px`;
    this.uploadCanvas.el.style.left = `${(w - EXPANDED_W) / 2}px`;

    // The island's shape in window coordinates: Rust decides click-through from
    // it, in the same tick as it reads the cursor.
    if (differs(this.pushedRect, island)) {
      this.pushedRect = { ...island };
      void Bridge.setIslandRect(island.x, island.y, island.w, island.h, this.dpr());
    }
  }

  /** The page's own pixel ratio: the only ratio its rendering uses. */
  private dpr(): number {
    return window.devicePixelRatio || 1;
  }

  /** The island's display in the page's own pixels. */
  private cssMonitor(): MonitorRect {
    return toCssMonitor({ ...this.monitor, scale: this.dpr() });
  }

  /**
   * The window the page asked for, against the window the page can measure.
   *
   * A mismatch means the two sides disagree about what a pixel is: a Windows
   * display with custom scaling and a host process that is not per-monitor DPI
   * aware is how that happens (measured on a 110 % display: the page saw
   * devicePixelRatio 1.1 while Tauri reported 1.0, so a 720 px window came back
   * 655 CSS px wide and the island was clipped by its own window's edge).
   * placeIsland clamps the island into the measured viewport, so a repeat of that
   * costs reach instead of a clipped edge; this says so out loud, once, after the
   * mismatch has lasted a second - long enough that a slow first frame or a
   * resize between two frames cannot raise it.
   */
  private checkViewport(w: number, h: number, dpr: number) {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (Math.abs(vw - w) <= 1.5 && Math.abs(vh - h) <= 1.5) {
      this.viewportAlarm = null;
      return;
    }
    const sig = `${vw}x${vh} vs ${w}x${h}`;
    const now = performance.now();
    if (this.viewportAlarm?.sig !== sig) {
      this.viewportAlarm = { sig, since: now };
      return;
    }
    if (now - this.viewportAlarm.since < 1000) return;
    this.viewportAlarm = null;
    console.warn(
      `[coucou] the island window measures ${vw}x${vh} px but ${w}x${h} was placed ` +
        `(devicePixelRatio ${dpr}): the host and the webview disagree about DPI. ` +
        `The island is clamped to the window it really has.`,
    );
  }

  /** Island rect in window coordinates (origin top-left of the 720×320 window). */
  private islandRect(): Rect {
    return this.place().island;
  }

  /** The window, the island and the wake strip for the width at this instant. */
  private place(): Placement {
    return placeIsland({
      monitor: this.cssMonitor(),
      dock: State.settings.islandDock ?? "center",
      freeDrag: State.settings.islandFreeDrag ?? false,
      percent: State.settings.islandCustomX ?? 0.5,
      style: State.settings.islandStyle ?? "flush",
      width: this.width.value,
      height: this.height.value,
      collapsed: this.collapsed,
      // The window as the page really has it. If the host and the webview
      // disagree about DPI, this is what keeps the island inside its window.
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    });
  }

  /**
   * The display the island lives on, in physical pixels. Rust reports it at boot
   * and whenever the displays are rearranged: `window.screen` is the display the
   * *window* is on, and until the island has been placed that is not always its
   * own.
   */
  setMonitor(info: ScreenInfo) {
    this.monitor = info;
    this.monitorReady = true;
    // A different display means a different calculation, even when it lands on
    // the same numbers: push it.
    this.pushedWindow = { x: -1, y: -1, w: -1, h: -1 };
    this.applyGeometry();
  }

  // ── Window collapse (hidden → tiny wake strip, zero polling) ────────────────

  private updateWindowCollapsed() {
    if (this.collapseTimer != null) {
      window.clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
    if (State.mode === "hidden") {
      // Let the island finish retracting, then drop the window to the wake strip:
      // from there the OS delivers no cursor events, so nothing polls at all.
      this.collapseTimer = window.setTimeout(() => {
        this.collapseTimer = null;
        if (State.mode !== "hidden") return;
        this.collapsed = true;
        void Bridge.setCollapsed(true);
        // The window *is* the wake strip now: it has to be where the island was,
        // or the next hover lands on nothing.
        this.applyGeometry();
      }, 420);
    } else if (this.collapsed) {
      // Grow the window back before the island animates open.
      this.collapsed = false;
      void Bridge.setCollapsed(false);
      this.applyGeometry();
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  private wireInput() {
    // The wake strip is the only thing the OS can hit while the island is hidden.
    this.wakeStrip.addEventListener("mouseenter", () => {
      Sound.resume();
      if (State.mode === "hidden") this.fsm.mouseEntered();
    });

    this.islandEl.addEventListener("pointerdown", (e) => {
      // Alt + Drag: free horizontal repositioning
      if (e.altKey && e.button === 0) {
        this.islandDragActive = true;
        this.islandDragStartX = e.screenX;
        this.islandDragStartPercent = State.settings.islandCustomX ?? 0.5;
        try {
          this.islandEl.setPointerCapture(e.pointerId);
        } catch {}
        this.islandEl.style.cursor = "ew-resize";
        e.preventDefault();
        return;
      }
    });

    const endDrag = (e?: PointerEvent) => {
      if (this.islandDragActive) {
        this.islandDragActive = false;
        this.islandEl.style.cursor = "";
        if (e) {
          try {
            this.islandEl.releasePointerCapture(e.pointerId);
          } catch {}
        }
        if (this.saveTimeout != null) {
          window.clearTimeout(this.saveTimeout);
          this.saveTimeout = null;
        }
        void Bridge.saveSettings(State.settings);
      }
    };

    window.addEventListener("pointerup", (e) => endDrag(e));
    window.addEventListener("pointercancel", (e) => endDrag(e));

    this.islandEl.addEventListener("mousedown", (e) => {
      Sound.resume();
      State.lastActivity = performance.now();
      if (e.altKey && e.button === 0) {
        e.preventDefault();
        return;
      }
      // A click makes a hover-opened island an ordinary open one.
      this.fsm.userInteracted();
      // A press on ipin may become a drag out to the desktop.
      if (e.button === 0 && this.isBotHit(e.clientX, e.clientY)) {
        this.botPress = { x: e.clientX, y: e.clientY };
        this.islandEl.style.cursor = SQUEEZE_CURSOR_CSS;
      }
      // Right-click on ipin opens the wardrobe, and closes it again.
      if (e.button === 2 && this.isBotHit(e.clientX, e.clientY)) {
        this.cancelBotHover();
        this.toggleWardrobe();
        return;
      }
      if (State.mode !== "expanded") {
        this.fsm.click();
        return;
      }
      if (this.isBotHit(e.clientX, e.clientY)) {
        this.cancelBotHover();
        this.engine.slap();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.botHovering) {
        this.islandEl.style.cursor = PET_CURSOR_CSS;
      } else if (!this.islandDragActive) {
        this.islandEl.style.cursor = "";
      }
    });

    // No browser menu over ipin: his right-click is the wardrobe. Everywhere
    // else (the chat field) the webview keeps its own menu.
    this.islandEl.addEventListener("contextmenu", (e) => {
      if (this.isBotHit(e.clientX, e.clientY)) e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
      if (this.islandDragActive) {
        if (!(e.buttons & 1)) {
          endDrag(e);
          return;
        }
        const delta = e.screenX - this.islandDragStartX;
        // The pointer travels the slider's own range, so the pill sticks to it:
        // 0 % is a screen edge, 100 % the other one, whatever the display's width.
        const travel = Math.max(1, this.monitor.width / this.dpr() - 2 * EDGE_MARGIN - COMPACT_W);
        const deltaPercent = delta / travel;
        const newPercent = Math.max(0.0, Math.min(1.0, this.islandDragStartPercent + deltaPercent));
        State.settings.islandFreeDrag = true;
        State.settings.islandCustomX = Math.round(newPercent * 1000) / 1000;
        this.applyGeometry();
        this.saveThrottled();
        return;
      }
    });

    // Dragging ipin out of the island puts him on the desktop.
    window.addEventListener("mousemove", (e) => {
      if (this.islandDragActive) return;
      if (this.desktop.carrying) {
        this.desktop.carry(e.clientX, e.clientY);
        return;
      }
      const press = this.botPress;
      if (!press) return;
      if (!(e.buttons & 1)) {
        this.botPress = null;
        return;
      }
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_THRESHOLD) return;
      this.botPress = null;
      if (!this.canDragOut()) return;
      this.cancelBotHover();
      this.desktop.pickUp(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", (e) => {
      this.botPress = null;
      if (this.desktop.carrying) this.desktop.carryEnd(e.clientX, e.clientY);
    });

    // Only keys typed into the island itself land here, never Escape typed in
    // a terminal — so it may fold a waiting card away, as Escape in the notch
    // does on macOS.
    window.addEventListener("keydown", (e) => {
      if (e.key === "Alt" && !this.islandDragActive) {
        this.islandEl.style.cursor = "ew-resize";
      }
      if (e.key === "Escape" && State.mode === "expanded") {
        if (State.pendingApproval) this.foldApproval();
        else if (!State.isPinned) this.collapse();
      }
      State.lastActivity = performance.now();
    });

    window.addEventListener("keyup", (e) => {
      if (e.key === "Alt" && !this.islandDragActive) {
        this.islandEl.style.cursor = "";
      }
    });

    void onDragDrop((e) => this.onDragDrop(e));

    // Outside Tauri (plain browser) drive the cursor from DOM events so the
    // island can be inspected with `npm run dev`.
    if (!IS_TAURI) this.followPageCursor();
  }

  /**
   * Takes the cursor from the page's own mouse events instead of Rust's poll.
   * Used where the OS has no global cursor position (Wayland): the events only
   * fire while the pointer is over the island, so leaving the window is
   * reported as a cursor far away, which is what the poll would have said.
   */
  followPageCursor() {
    window.addEventListener("mousemove", (e) => this.onCursor(e.clientX, e.clientY));
    window.addEventListener("mouseout", (e) => {
      if (e.relatedTarget == null) this.onCursor(-10_000, -10_000);
    });
  }

  /**
   * Pointer on/off the island as the compositor sees it (Linux only). Null
   * until the first report, so a platform that never sends it is not gated.
   */
  private pointerInside: boolean | null = null;

  setPointerInside(inside: boolean) {
    this.pointerInside = inside;
  }

  /** Cursor in window-logical coordinates. */
  onCursor(x: number, y: number) {
    // WebKitGTK can deliver a mousemove after the pointer has left the layer
    // surface; trusting it re-enters the island and the auto-close never runs.
    if (this.pointerInside === false) {
      x = -10_000;
      y = -10_000;
    }
    State.mouse = { x, y };
    const rect = this.islandRect();
    State.mouseInIsland = { x: x - rect.x, y: y - rect.y };

    // Windows sends no cursor position with an OLE drag, so the drop sequence is
    // fed from the Win32 cursor poll instead — it runs throughout the drag.
    if (UploadSeq.isActive && !UploadSeq.dropped) {
      UploadSeq.updateCursor(State.mouseInIsland.x, State.mouseInIsland.y);
    }

    const inIsland =
      x >= rect.x - HIT_MARGIN && x <= rect.x + rect.w + HIT_MARGIN &&
      y >= rect.y - HIT_MARGIN && y <= rect.y + rect.h + HIT_MARGIN;

    // Recorded before the state machine hears of it: a transition it makes
    // right away (open on hover) reads where the pointer is, and must not see
    // the pointer as still outside.
    const wasIn = this.wasInIsland;
    this.wasInIsland = inIsland;
    if (inIsland && !wasIn) {
      this.fsm.mouseEntered();
    }
    if (!inIsland && wasIn) {
      this.fsm.mouseLeft();
    }

    // Bot hover → petting & love (not while he is busy greeting)
    const overBot =
      State.mode === "expanded" && State.stateOverride == null && !this.engine.greeting && this.isBotHit(x, y);
    if (overBot && !this.botHovering) this.botHoverIn(x, y);
    if (!overBot && this.botHovering) this.cancelBotHover();
    this.botHovering = overBot;
    if (this.botHovering) {
      this.engine.setHover(true, x, y);
      const d = Math.hypot(x - this.botHoverStart.x, y - this.botHoverStart.y);
      if (d > 40) {
        this.botHoverStart = { x, y };
        this.scheduleLove();
      }
    }

    this.ensureRunning();
  }

  /** He is not pulled out of the island while he greets, nor while the drop sequence draws its own ipin. */
  private canDragOut(): boolean {
    if (State.mode === "hidden" || !this.desktop.canPickUp()) return false;
    return !(State.mode === "expanded" && (State.view === "greeting" || this.uploadActive));
  }

  private isBotHit(x: number, y: number): boolean {
    // Out on the desktop, the island's ipin is invisible: nothing to hit.
    if (State.ipinOnDesktop) return false;
    const rect = this.islandRect();
    const cx = rect.x + this.botCx.value;
    const cy = rect.y + this.botCy.value;
    const radius = Math.max(22, this.botSize.value / 2 + 10);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
  }

  private botHoverIn(x: number, y: number) {
    if (this.ambientTimer != null) {
      window.clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
    this.islandEl.style.cursor = PET_CURSOR_CSS;
    this.engine.setHover(true, x, y);
    if (performance.now() / 1000 - this.lastLoveTime < 6) return;
    this.botHoverStart = { x, y };
    this.engine.blink();
    this.engine.tgEs = 1.08;
    Sound.play("hover");
    this.scheduleLove();
  }

  private scheduleLove() {
    if (this.botHoverTimer != null) window.clearTimeout(this.botHoverTimer);
    this.botHoverTimer = window.setTimeout(() => {
      this.botHoverTimer = null;
      if (!this.botHovering || State.stateOverride != null) return;
      if (performance.now() / 1000 - this.lastLoveTime < 6) return;
      this.lastLoveTime = performance.now() / 1000;
      this.engine.triggerEmote("love");
      Sound.play("love");
    }, 1900);
  }

  private cancelBotHover() {
    this.islandEl.style.cursor = "";
    this.engine.setHover(false);
    if (this.botHoverTimer != null) window.clearTimeout(this.botHoverTimer);
    this.botHoverTimer = null;
    this.engine.tgEs = 1;
    if (State.settings.followCursor === false) {
      this.ambientLookTarget = { x: 0, y: 0 };
      this.scheduleAmbientGlance();
      this.ensureRunning();
    }
  }

  /** Three slaps → dizzy + confused view for 3.3 s, then back. */
  handleDizzy() {
    this.prevViewBeforeConfused = State.view;
    State.stateOverride = "dizzy";
    this.engine.setState("dizzy");
    Sound.play("dizzy");
    this.alert("confused");
    if (this.confusedRecovery != null) window.clearTimeout(this.confusedRecovery);
    this.confusedRecovery = window.setTimeout(() => {
      this.confusedRecovery = null;
      State.stateOverride = null;
      this.engine.setState(State.effectiveState);
      if (State.view === "confused") {
        const fallback = State.defaultView();
        this.setView(this.prevViewBeforeConfused === "confused" ? fallback : this.prevViewBeforeConfused);
      }
      this.engine.triggerEmote("happy");
    }, 3300);
  }

  // ── Frame loop ──────────────────────────────────────────────────────────────

  ensureRunning() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (nowMs: number) => {
    const dt = Math.min(0.05, (nowMs - this.lastFrame) / 1000);
    this.lastFrame = nowMs;

    this.width.step(dt, nowMs);
    this.height.step(dt, nowMs);
    this.radius.step(dt, nowMs);
    this.applyGeometry();

    if (this.dirty) {
      this.dirty = false;
      this.syncDom();
    }

    this.updateBotTargets();
    this.botCx.step(dt);
    this.botCy.step(dt);
    this.botSize.step(dt);

    // Kept running even while the drop canvas is up, so the island's own ipin
    // is already in the right place the moment the canvas fades out.
    this.drawBot(dt);

    const uploadActive = this.uploadActive;
    if (uploadActive) this.uploadCanvas.draw(UploadSeq.frame(), nowMs / 1000);
    this.uploadCanvas.el.classList.toggle("on", uploadActive);
    this.viewsEl.classList.toggle("hidden-by-upload", uploadActive);

    tickMiniBots(dt);
    // A ticker scroll that loses its frames freezes mid-way, rows overlapping.
    const viewAnimating = this.views.get(State.view)?.tick?.(nowMs) === true;
    if (UploadSeq.isActive) this.stepSequence();
    this.updateCountdown(nowMs);

    // Nothing is drawn while the island is hidden, so nothing may keep the loop
    // alive either. This used to read `... || this.engine.busy || State.mode !==
    // "hidden"`, and engine.busy is permanently true for any state with a
    // looping animation — breathing, ratelimit sweat, sleeping z's, the search
    // sweep — so a hidden island went on burning frames in exactly the states it
    // spends most of its life in. Geometry still has to finish retracting.
    const settling =
      this.width.animating || this.height.animating || this.radius.animating;
    const busy = State.mode === "hidden"
      ? settling
      : settling ||
        !this.botCx.settled || !this.botCy.settled || !this.botSize.settled ||
        this.engine.busy || UploadSeq.isActive || viewAnimating;

    if (busy) {
      requestAnimationFrame(this.frame);
    } else {
      this.running = false;
      Sound.idle();
    }
  };

  private updateBotTargets() {
    const p = botPosition(State.mode, State.view, this.height.value, State.uploadProgress);
    this.botCx.target = p.cx;
    this.botCy.target = p.cy;
    this.botSize.target = p.diameter / 0.6;

    const greetingStage = State.mode === "expanded" && State.view === "greeting";
    // The drop canvas draws its own ipin; two of them would overlap. Out on the
    // desktop, he isn't here at all.
    const away = State.ipinOnDesktop;
    const visible = p.opacity > 0 && !this.uploadActive && !away;
    // While the island opens for the greeting he fades in with it, so he never
    // floats over a desktop with no island behind him yet.
    const fade = greetingStage ? clamp(this.height.value / 40, 0, 1) : 1;
    this.botCanvas.style.opacity = visible ? String(fade) : "0";

    if (State.mode === "expanded" && State.view !== "uploading" && !this.uploadActive && !away) {
      const d = p.diameter;
      const color = botGlowColor(State.effectiveState);
      this.botGlow.style.display = "block";
      this.botGlow.style.width = `${d * 2.2}px`;
      this.botGlow.style.height = `${d * 2.2}px`;
      this.botGlow.style.left = `${this.botCx.value - d * 1.1}px`;
      this.botGlow.style.top = `${this.botCy.value - d * 1.1}px`;
      this.botGlow.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
      this.botGlow.style.opacity = String(botGlowOpacity(State.effectiveState));
    } else {
      this.botGlow.style.display = "none";
    }
  }

  private drawBot(dt: number) {
    const size = this.botSize.value;
    const w = Math.max(1, Math.round(size));
    const hCss = w + BOT_OVERHANG;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // Keep GPU backing buffer fixed to avoid re-allocating textures during animations.
    // Only resize if DPR changes (e.g. moved between different DPI screens).
    const targetPx = Math.round(BOT_CANVAS_SIZE * dpr);
    if (this.botCanvas.width !== targetPx) {
      this.botCanvas.width = targetPx;
      this.botCanvas.height = targetPx;
      this.botCanvas.style.width = `${BOT_CANVAS_SIZE}px`;
      this.botCanvas.style.height = `${BOT_CANVAS_SIZE}px`;
    }
    this.botCanvas.style.left = `${this.botCx.value - BOT_CANVAS_SIZE / 2}px`;
    this.botCanvas.style.top = `${this.botCy.value - BOT_CANVAS_SIZE / 2}px`;

    const ctx = this.botCanvas.getContext("2d");
    if (!ctx) return;

    const focus = State.focusTask;
    // While a plan card is open ipin wears the plan's colour, like its pill.
    this.engine.bodyColor = planCardOpen()
      ? hexToRGB(openPlanColor())
      : focus?.isIntegration
        ? hexToRGB(focus.color)
        : null;
    this.engine.particleOverhang = BOT_OVERHANG;
    this.engine.lookX = this.lookX();
    this.engine.lookY = this.lookY();
    if (this.engine.morph > 0.3) {
      this.engine.slotHTarget = State.fileDragOver ? 0.2 : 0;
    } else {
      this.engine.slotHTarget = 0;
      if (this.engine.morph < 0.05) {
        this.engine.slotH = 0;
        this.engine.slotHVel = 0;
      }
    }
    // Only the main ipin is dressed — the one of the main tool's pill (Settings →
    // Active pills): a focused integration pill shows its own colours, unless
    // the wardrobe is open (BotCanvasView.showOutfit, macOS).
    // In the wardrobe the hovered outfit swaps in at once, without the drop-in.
    const inWardrobe = State.mode === "expanded" && State.view === "wardrobe";
    const mainFocused = State.focusId == null || State.focusId === State.mainPillId;
    const showOutfit = mainFocused || State.mode !== "expanded" || inWardrobe;
    const outfit = State.wardrobePreview ?? this.seasons.get(parseOutfit(State.settings.mochiOutfit));
    this.engine.setOutfit(showOutfit ? outfit : "none", !inWardrobe);
    // Dances while music plays: always in the compact island, expanded only on
    // the music pill's card (BotCanvasView, macOS). Asked every frame.
    this.engine.setDancing(islandDances({
      music: State.spotifyPlaying,
      state: State.effectiveState,
      mode: State.mode,
      view: State.view,
      focusId: State.focusTask?.id,
    }));

    this.engine.update(dt);
    const originX = BOT_CANVAS_SIZE / 2 - w / 2;
    const originY = BOT_CANVAS_SIZE / 2 - (hCss / 2 + BOT_OVERHANG / 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, BOT_CANVAS_SIZE, BOT_CANVAS_SIZE);
    ctx.setTransform(dpr, 0, 0, dpr, originX * dpr, originY * dpr);
    ctx.save();
    this.engine.applyDance(ctx, w, hCss);
    this.engine.draw(ctx, w, hCss);
    ctx.restore();
  }

  private scheduleAmbientGlance() {
    if (this.ambientTimer != null) return;
    const delayMs = 3500 + Math.random() * 4000;
    this.ambientTimer = window.setTimeout(() => {
      this.ambientTimer = null;
      if (State.settings.followCursor === false) {
        if (Math.random() < 0.6) {
          this.ambientLookTarget = { x: 0, y: 0 };
        } else {
          this.ambientLookTarget = {
            x: -0.35 + Math.random() * 0.7,
            y: -0.15 + Math.random() * 0.25,
          };
        }
        this.ensureRunning();
        this.scheduleAmbientGlance();
      }
    }, delayMs);
  }

  /** BotCanvasView.lookX / lookY — tanh of the distance to the bot. */
  private lookX(): number {
    const follow = State.settings.followCursor ?? true;
    if (!follow && !this.botHovering) {
      this.scheduleAmbientGlance();
      return this.ambientLookTarget.x;
    }
    const rect = this.islandRect();
    const botScreenX = rect.x + this.botCx.value;
    return Math.tanh((State.mouse.x - botScreenX) / 260);
  }

  private lookY(): number {
    const follow = State.settings.followCursor ?? true;
    if (!follow && !this.botHovering) {
      return this.ambientLookTarget.y;
    }
    return -Math.tanh((State.mouse.y - this.botCy.value) / 200);
  }

  private updateCountdown(nowMs: number) {
    // The state machine's own deadline, so the bar follows an auto-close delay
    // edited while the countdown runs.
    const dueAt = this.fsm.homeCollapseDueAt;
    if (State.mode !== "expanded" || State.isPinned || dueAt == null) {
      this.countdown.style.width = "0px";
      return;
    }
    const autoClose = this.fsm.homeToPetitDelay;
    const windowS = Math.min(10, autoClose * 0.6);
    const remaining = (dueAt - nowMs) / 1000;
    this.countdown.style.width =
      remaining < windowS ? `${Math.max(0, clamp(remaining / windowS, 0, 1) * 160)}px` : "0px";
  }

  // ── DOM sync ────────────────────────────────────────────────────────────────

  private syncDom() {
    const expanded = State.mode === "expanded";
    const greetingActive = expanded && State.view === "greeting";

    const live = expanded && !greetingActive;
    this.contentEl.style.opacity = live ? "1" : "0";
    // While the drop sequence owns the body its buttons are painted on the canvas
    // underneath, so only the header may keep taking clicks up here.
    this.contentEl.style.pointerEvents = live && !this.uploadActive ? "auto" : "none";
    this.header.el.style.pointerEvents = live ? "auto" : "none";

    // A wardrobe try-on never outlives the wardrobe.
    if (State.wardrobePreview && !(expanded && State.view === "wardrobe")) State.wardrobePreview = null;

    this.header.sync();
    for (const [name, view] of this.views) {
      const on = name === State.view;
      view.el.classList.toggle("on", on);
      if (on) view.sync();
    }

    // The chat is the only view with a text field, so it is the only time the
    // island is allowed to take keyboard focus.
    if (this.lastSyncedView !== State.view) {
      const wasChat = this.lastSyncedView === "prompt";
      this.lastSyncedView = State.view;
      if (State.view === "prompt") {
        void Bridge.focusWindow(true);
        window.setTimeout(() => this.views.get("prompt")?.focus?.(), 120);
      } else if (wasChat) {
        void Bridge.focusWindow(false);
      }
    }

    // Compact mini grid
    const showGrid = State.mode === "compact";
    this.miniGrid.style.opacity = showGrid ? "1" : "0";
    if (showGrid) {
      const others = State.otherTasks.slice(0, 4);
      const key = others.map((t) => t.id).join("|");
      if (this.miniGrid.dataset.key !== key) {
        this.miniGrid.dataset.key = key;
        this.miniGrid.replaceChildren();
        for (const t of others) {
          this.miniGrid.append(createMiniBot(t, 13));
        }
        pruneMiniBots();
      }
    }

    syncMiniBotStates(State.tasks);
    this.engine.setState(State.effectiveState);
  }

  /** Applies settings coming from Rust at boot or when changed. */
  applySettings() {
    Sound.setEnabled(State.settings.soundEnabled);
    Sound.setVolume(State.settings.soundVolume);
    this.fsm.homeToPetitDelay = State.settings.autoCloseInterval;
    this.fsm.openOnHover = State.settings.openOnHover;
    this.animateGeometry(false);
    this.applyGeometry();
    State.notify();
  }

  get panelSize() {
    return { w: PANEL_W, h: PANEL_H };
  }

  get chatHeight() {
    return chatPromptHeight(State.chatHistory.length);
  }
}
