// ipin — DapinCi Squishy Slime procedural Canvas 2D engine (v2.0).
// Mouthless, energetic pastel mint slime with Grok-Bot solid ink eyes,
// conditional puppy sparkle, high-response underdamped jelly physics,
// and zero-allocation LUT mesh rendering for minimal RAM/CPU/GPU footprint.

import { Ease, lerp, type EaseFn } from "../core/anim";
import { Sound } from "../core/sound";
import type { BotEmoteName, BotStateName } from "../core/layout";
import { GREET } from "./greeting";
import { drawOutfitBehind, drawOutfitFront, makeHead } from "./outfits";
import type { Outfit } from "./wardrobe";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EyeShape =
  | "pill"
  | "wide"
  | "dot"
  | "line"
  | "flat"
  | "happy"
  | "closed"
  | "spiral"
  | "heart"
  | "star"
  | "tired"
  | "wink"
  | "cup"
  | "squint";

export type BadgeKind = "dots" | "bang" | "question" | "dot";

export interface Badge {
  kind: BadgeKind;
  color: RGB;
}

export type RGB = readonly [number, number, number]; // components 0…1

export type TweenKey = readonly [
  target: number,
  durationMs: number,
  ease: EaseFn,
];

interface Tween {
  prop: PropKey;
  keys: TweenKey[];
  index: number;
  from: number;
  startMs: number;
  onComplete?: () => void;
}

type PropKey =
  | "yaw"
  | "pitch"
  | "roll"
  | "spin"
  | "tilt"
  | "open"
  | "sx"
  | "sy"
  | "oy"
  | "ox"
  | "tint"
  | "morph"
  | "hands"
  | "blush"
  | "es"
  | "badgeS"
  | "outfitPresence";

interface BotStateCfg {
  color: RGB;
  tint: number;
  eye: EyeShape;
  badge: Badge | null;
  bounces: boolean;
  scans: boolean;
  breathes: boolean;
  zz: boolean;
  sweat: boolean;
  look: readonly [number, number] | null;
  tilt: number;
}

interface Particle {
  type: "heart" | "star" | "spark" | "sweat" | "z" | "love_bubble";
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  rot: number;
  size: number;
}

interface ScheduledTask {
  at: number;
  fn: () => void;
}

// ── Energetic Pastel Slime Palette (v2.0 Official Spec) ──────────────────────
// Main Body: Vibrant Pastel Mint (#4DE3B2 -> #26C291), Translucent Highlight (#A3FFDF)
// Cheek Blush: Official #FFAEC0 (255, 174, 192)
// Eyes: Pure Solid Black Ink (#000000) with conditional sparkle on special states
const EYE_W = 0.36;
const EYE_H = 0.7;
const EYE_SP = 0.36;
const EYE_P = 0.03;
const SLIME_TOP: RGB = [0.302, 0.89, 0.698]; // #4DE3B2 (Energetic Pastel Mint)
const SLIME_BOTTOM: RGB = [0.149, 0.761, 0.569]; // #26C291 (Vibrant Mint Teal)
const EYE_DARK = "#000000"; // Pure Solid Black for Grok-Bot style ink eyes
const MINI_INK = "#000000";

const C = {
  idle: [0.902, 0.914, 0.933] as RGB,
  working: [0.231, 0.62, 1] as RGB,
  thinking: [0.545, 0.361, 0.965] as RGB,
  searching: [0.388, 0.396, 0.949] as RGB,
  approval: [0.961, 0.647, 0.141] as RGB,
  question: [0.133, 0.827, 0.933] as RGB,
  error: [0.957, 0.314, 0.369] as RGB,
  finished: [0.204, 0.831, 0.6] as RGB,
  ratelimit: [0.984, 0.573, 0.235] as RGB,
  sleeping: [0.58, 0.635, 0.722] as RGB,
  dizzy: [0.957, 0.447, 0.714] as RGB,
};

const base = {
  bounces: false,
  scans: false,
  breathes: false,
  zz: false,
  sweat: false,
  look: null,
  tilt: 0,
};

export const BOT_STATES: Record<BotStateName, BotStateCfg> = {
  idle: { ...base, color: C.idle, tint: 0, eye: "pill", badge: null },
  working: {
    ...base,
    color: C.working,
    tint: 0.72,
    eye: "pill",
    badge: { kind: "dots", color: C.working },
    bounces: true,
  },
  thinking: {
    ...base,
    color: C.thinking,
    tint: 0.72,
    eye: "pill",
    badge: { kind: "dots", color: C.thinking },
    look: [0.55, 0.55],
    tilt: -0.1,
  },
  searching: {
    ...base,
    color: C.searching,
    tint: 0.72,
    eye: "pill",
    badge: { kind: "dots", color: C.searching },
    scans: true,
  },
  approval: {
    ...base,
    color: C.approval,
    tint: 0.78,
    eye: "wide",
    badge: { kind: "bang", color: C.approval },
    bounces: true,
  },
  question: {
    ...base,
    color: C.question,
    tint: 0.75,
    eye: "pill",
    badge: { kind: "question", color: C.question },
    tilt: 0.17,
  },
  error: {
    ...base,
    color: C.error,
    tint: 0.78,
    eye: "flat",
    badge: { kind: "dot", color: C.error },
  },
  finished: {
    ...base,
    color: C.finished,
    tint: 0.35,
    eye: "happy",
    badge: { kind: "dot", color: C.finished },
  },
  ratelimit: {
    ...base,
    color: C.ratelimit,
    tint: 0.72,
    eye: "tired",
    badge: { kind: "dot", color: C.ratelimit },
    sweat: true,
  },
  sleeping: {
    ...base,
    color: C.sleeping,
    tint: 0.32,
    eye: "closed",
    badge: null,
    breathes: true,
    zz: true,
  },
  dizzy: { ...base, color: C.dizzy, tint: 0.7, eye: "spiral", badge: null },
};

/** State → sound, as in BotStateCfg.sound. */
export const STATE_SOUND: Partial<Record<BotStateName, string>> = {
  working: "work",
  thinking: "think",
  searching: "search",
  approval: "approval",
  question: "question",
  error: "error",
  finished: "finish",
  ratelimit: "rate",
  sleeping: "sleep",
  dizzy: "dizzy",
};

const EMOTE_EYE: Record<BotEmoteName, EyeShape> = {
  love: "heart",
  surprised: "dot",
  proud: "star",
  wink: "wink",
  yawn: "tired",
  happy: "happy",
  annoyed: "squint",
};

// ── Pre-computed Slime Mesh Lookup Table (Zero per-frame Math.pow/trig) ─────
const MESH_N = 96;
const LUT_CA = new Float32Array(MESH_N + 1);
const LUT_SA = new Float32Array(MESH_N + 1);
const LUT_UX = new Float32Array(MESH_N + 1); // Unit X before rx scaling
const LUT_UY = new Float32Array(MESH_N + 1); // Unit Y before ry scaling
const LUT_CROWN_W = new Float32Array(MESH_N + 1); // Crown jelly physics weight
const LUT_CHEEK_W = new Float32Array(MESH_N + 1); // Cheek plump/bulge weight
const LUT_HOVER_W = new Float32Array(MESH_N + 1); // Petting crown cushion weight
const LUT_RR_UX = new Float32Array(MESH_N + 1); // Unit mailbox morph X (for R=1)
const LUT_RR_UY = new Float32Array(MESH_N + 1); // Unit mailbox morph Y (for R=1)

(function initSlimeMeshLUT() {
  for (let i = 0; i <= MESH_N; i++) {
    const a = (i / MESH_N) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    LUT_CA[i] = ca;
    LUT_SA[i] = sa;

    // Bouncy squishy slime dome with plump cheeks
    const expN = sa < 0 ? 2.0 / 2.4 : 2.0 / 2.6;
    let ux = ca >= 0 ? Math.pow(ca, expN) : -Math.pow(-ca, expN);
    const uy = sa >= 0 ? Math.pow(sa, expN) : -Math.pow(-sa, expN);

    if (sa > 0) {
      // Plump squishy cheek expansion
      ux *= 1.0 + 0.055 * Math.sin(sa * Math.PI);
      LUT_CHEEK_W[i] = Math.sin(sa * Math.PI);
      LUT_CROWN_W[i] = 0;
    } else {
      // Soft teardrop crown lift & smooth upper-half deformation weight
      ux *= 1.0 - 0.03 * Math.pow(-sa, 1.4);
      LUT_CROWN_W[i] = Math.pow(-sa, 1.35);
      LUT_CHEEK_W[i] = 0;
    }

    LUT_UX[i] = ux;
    LUT_UY[i] = uy;
    LUT_HOVER_W[i] =
      sa < -0.15
        ? Math.max(0, Math.cos(ca * Math.PI * 0.65)) * (-sa - 0.15)
        : 0;

    // Pre-compute mailbox rounded-rect morph target for unit radius R = 1
    const rr = rrPoint(ca, sa, 1.0, 0.94, 0.42);
    LUT_RR_UX[i] = rr.x;
    LUT_RR_UY[i] = rr.y;
  }
})();

// ── Small helpers ─────────────────────────────────────────────────────────────

const now = () => performance.now() / 1000;

export function hexToRGB(hex: string): RGB {
  const h = hex.replace("#", "");
  const v = parseInt(h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

const rgba = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

const mix3 = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

function roundRectPath(
  x: CanvasRenderingContext2D,
  X: number,
  Y: number,
  W: number,
  H: number,
  R: number,
) {
  const r = Math.max(0, Math.min(R, W / 2, H / 2));
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

function heartPath(x: CanvasRenderingContext2D, s: number) {
  x.beginPath();
  x.moveTo(0, s * 0.38);
  x.bezierCurveTo(-s * 1.05, -s * 0.15, -s * 0.5, -s * 0.95, 0, -s * 0.38);
  x.bezierCurveTo(s * 0.5, -s * 0.95, s * 1.05, -s * 0.15, 0, s * 0.38);
  x.closePath();
}

function starPath(x: CanvasRenderingContext2D, ro: number, ri: number) {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
}

const FONT = `system-ui, "Segoe UI Variable Text", "Segoe UI", sans-serif`;

// ── Dance (BotEngine.applyDance, macOS) ──────────────────────────────────────

/** The dance fades in over 0.3 s and out over 0.5 s. */
export function stepDanceLevel(
  level: number,
  dancing: boolean,
  dt: number,
): number {
  const target = dancing ? 1 : 0;
  if (level < target) return Math.min(target, level + dt / 0.3);
  if (level > target) return Math.max(target, level - dt / 0.5);
  return level;
}

/**
 * The 112-BPM bounce at `seconds`, for a body of radius R and a dance `level`
 * (0…1): a sideways sway, a hop, a tilt, and a squash on landing.
 */
export function danceTransform(seconds: number, level: number, R: number) {
  const beat = (seconds * 112) / 60;
  const hop = Math.abs(Math.sin(Math.PI * beat));
  const land = Math.pow(1 - hop, 6);
  return {
    dx: 0.08 * R * Math.sin(Math.PI * beat) * level,
    dy: -0.2 * R * hop * level,
    rotate: 0.1 * Math.sin(Math.PI * beat) * level,
    sx: 1 + 0.045 * land * level,
    sy: 1 - 0.06 * land * level,
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class BotEngine {
  isMini = false;
  /** Solid body colour for mini bots / integration pills (null = ipin gradient). */
  bodyColor: RGB | null = null;

  // Animated state (BotEngine `s`)
  yaw = 0;
  pitch = 0;
  roll = 0;
  /** The greeting's full turn, radians: turns the whole body, dressed or not. */
  spin = 0;
  tilt = 0;
  open = 1;
  sx = 1;
  sy = 1;
  oy = 0;
  ox = 0;
  tint = 0;
  morph = 0;
  hands = 0;
  blush = 0;
  es = 1;
  badgeS = 0;

  // Outfit (the main ipin only — minis never wear one).
  outfit: Outfit = "none";
  /** 0 = gone, 1 = fully on. */
  outfitPresence = 0;
  private outfitTarget: Outfit = "none";

  // Underdamped spring lag of the soft slime crown & accessories (−1.5…1.5).
  physDx = 0;
  physDy = 0;
  private physVx = 0;
  private physVy = 0;
  private prevYaw = 0;
  private prevOy = 0;
  private prevRoll = 0;
  private prevSpin = 0;

  // Targets
  tgYaw = 0;
  tgPitch = 0;
  tgTilt = 0;
  tgSy = 1;
  tgSx = 1;
  tgEs = 1;

  /** Extra canvas height above the body so hearts can fly out without clipping. */
  particleOverhang = 0;

  /** Dancing to music; `dancingLevel` follows it, 0→1 in 0.3 s, 1→0 in 0.5 s. */
  isDancing = false;
  dancingLevel = 0;

  // Legacy properties retained for external caller compatibility (0 CPU when idle)
  slotH = 0;
  slotHTarget = 0;
  slotHVel = 0;
  isChewing = false;

  // Hover, Magnetic Lean-in & Tactile Petting Physics (Windows interactive delights)
  isHovered = false;
  hoverPet = 0;
  hoverLeanX = 0;
  hoverLeanY = 0;
  petEnergy = 0;
  private targetHoverLeanX = 0;
  private targetHoverLeanY = 0;
  private prevPointerX = 0;
  private prevPointerY = 0;
  private hasPointerOrigin = false;
  private nextIdleJiggle = now() + 4 + Math.random() * 5;
  private idleQuirkStep = 0;

  /** Smooth 0..1 factor that lifts and plumps cheeks when happy/smiling. */
  private joyMorph = 0;

  setHover(hover: boolean, x = 0, y = 0) {
    const wasHovered = this.isHovered;
    this.isHovered = hover;

    if (hover) {
      // 1. Initial Touch Boop: cursor just landed on ipin's head!
      if (!wasHovered) {
        this.prevPointerX = x;
        this.prevPointerY = y;
        this.hasPointerOrigin = true;
        // Immediate tactile squish impulse into the jelly crown
        this.physVy += 1.45;
        this.physVx += (Math.random() - 0.5) * 0.55;
        this.petEnergy = Math.min(1, this.petEnergy + 0.35);
        return;
      }

      if (!this.hasPointerOrigin) {
        this.prevPointerX = x;
        this.prevPointerY = y;
        this.hasPointerOrigin = true;
      }

      const dx = x - this.prevPointerX;
      const dy = y - this.prevPointerY;
      const d = Math.hypot(dx, dy);

      // 2. Active Petting Scrubbing: strong 2D elastic shear & pudding wobble
      if (d > 1.2 && d < 110) {
        this.blush = Math.min(0.95, this.blush + Math.min(0.14, d * 0.012));
        this.petEnergy = Math.min(
          1,
          this.petEnergy + Math.min(0.28, d * 0.022),
        );

        // Pull crown & body toward the stroke direction
        this.targetHoverLeanX = Math.max(
          -1.25,
          Math.min(1.25, this.targetHoverLeanX * 0.55 + dx * 0.085),
        );
        this.targetHoverLeanY = Math.max(
          -1.1,
          Math.min(1.1, this.targetHoverLeanY * 0.55 + dy * 0.075),
        );

        // Pump kinetic energy directly into the underdamped jelly spring
        this.physVx = Math.max(-2.4, Math.min(2.4, this.physVx + dx * 0.095));
        this.physVy = Math.max(
          -2.4,
          Math.min(2.4, this.physVy + dy * 0.085 + Math.abs(dx) * 0.03),
        );

        if (this.blush > 0.36 && !this.eyeOverride) {
          this.eyeOverride = "happy";
          this.eyeOverrideUntil = now() + 0.7;
        }
      }
      this.prevPointerX = x;
      this.prevPointerY = y;
    } else {
      // 3. Elastic Release Rebound: hand lifted off, crown springs back up!
      if (wasHovered) {
        this.physVy -= 1.25;
        this.physVx += -this.hoverLeanX * 0.85;
      }
      this.hasPointerOrigin = false;
      this.targetHoverLeanX = 0;
      this.targetHoverLeanY = 0;
    }
  }

  col: RGB = C.idle;
  colT: RGB = C.idle;

  state: BotStateName = "idle";
  cfg: BotStateCfg = BOT_STATES.idle;

  eyeOverride: EyeShape | null = null;
  eyeOverrideUntil = 0;
  permanentEye: EyeShape | null = null;
  permanentEmote: BotEmoteName | null = null;
  miniNextBehavior = 0;

  badge: Badge | null = null;
  private badgeKey = "none";

  private tweens = new Map<PropKey, Tween>();
  private locks = new Set<PropKey>();
  private particles: Particle[] = [];
  private scheduled: ScheduledTask[] = [];

  lookX = 0;
  lookY = 0;

  lastTime = now();
  private t0 = now() - Math.random() * 5;
  private nextBlink = now() + 1.5 + Math.random() * 2;
  waveUntil = 0;
  waveStart = 0;
  /** The launch greeting's timeline: steps at seconds from greetT0, run by update(). */
  private greetSteps: { at: number; fn: () => void }[] = [];
  private greetT0 = 0;
  private greetActive = false;
  /** While set, his eyes look here (seconds clock) instead of at the mouse. */
  private lookHoldUntil = 0;
  private lookHoldX = 0;
  private lookHoldY = 0;
  private lastAmbient = 0;
  private slapTimes: number[] = [];
  private miniLookTarget = { x: 0, y: 0 };
  private miniLookNextTime = 0;

  /** Fired when three slaps land inside 1.7 s (→ dizzy + confused view). */
  onDizzy: (() => void) | null = null;

  /** Fired once when the launch greeting is over, finished or cut short. */
  onGreetDone: (() => void) | null = null;

  /** Schedules a callback on the frame loop without browser setTimeout overhead. */
  private schedule(delaySec: number, fn: () => void) {
    this.scheduled.push({ at: now() + delaySec, fn });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setState(next: BotStateName, force = false) {
    if (this.state === next && !force) return;
    const prev = this.state;
    this.state = next;
    this.cfg = BOT_STATES[next];
    this.colT = this.cfg.color;
    if (!this.locks.has("tint")) this.tint = this.cfg.tint;
    if (!this.locks.has("tilt")) this.tgTilt = this.cfg.tilt;
    this.setBadge(this.cfg.badge);

    switch (next) {
      case "finished":
        this.doRoll(920, 1);
        this.anim("oy", [
          [-0.28, 170, Ease.out],
          [0.03, 140, Ease.inOut],
          [0, 220, Ease.back],
        ]);
        this.anim("sy", [
          [1.14, 140, Ease.out],
          [0.86, 130, Ease.inOut],
          [1.0, 200, Ease.back],
        ]);
        this.anim("sx", [
          [0.88, 140, Ease.out],
          [1.14, 130, Ease.inOut],
          [1.0, 200, Ease.back],
        ]);
        this.blush = Math.max(this.blush, 0.55);
        this.schedule(0.42, () => {
          if (this.state === "finished") {
            this.emit("spark", 5);
            this.emit("star", 2);
          }
        });
        break;
      case "error":
        this.anim("ox", [
          [0.12, 40, Ease.out],
          [-0.12, 50, Ease.inOut],
          [0.09, 50, Ease.inOut],
          [-0.07, 50, Ease.inOut],
          [0.04, 60, Ease.inOut],
          [0, 80, Ease.out],
        ]);
        this.anim("sy", [
          [0.84, 70, Ease.out],
          [1.08, 90, Ease.inOut],
          [1.0, 120, Ease.back],
        ]);
        this.anim("sx", [
          [1.16, 70, Ease.out],
          [0.93, 90, Ease.inOut],
          [1.0, 120, Ease.back],
        ]);
        this.physVx += 0.95;
        this.emit("sweat", 1);
        break;
      case "approval":
        this.anim("oy", [
          [-0.25, 140, Ease.out],
          [0.03, 180, Ease.inOut],
          [0, 200, Ease.back],
        ]);
        this.anim("sy", [
          [1.16, 110, Ease.out],
          [0.91, 130, Ease.inOut],
          [1.0, 180, Ease.back],
        ]);
        this.anim("sx", [
          [0.87, 110, Ease.out],
          [1.09, 130, Ease.inOut],
          [1.0, 180, Ease.back],
        ]);
        this.physVy -= 0.75;
        break;
      case "thinking":
      case "working":
        this.anim("sy", [
          [1.12, 110, Ease.out],
          [0.95, 120, Ease.inOut],
          [1.0, 160, Ease.back],
        ]);
        this.anim("sx", [
          [0.9, 110, Ease.out],
          [1.05, 120, Ease.inOut],
          [1.0, 160, Ease.back],
        ]);
        this.blink();
        break;
      case "searching":
        this.anim("tilt", [
          [0.14, 130, Ease.out],
          [-0.1, 170, Ease.inOut],
          [this.cfg.tilt, 160, Ease.out],
        ]);
        this.blink();
        break;
      case "dizzy":
        this.doRoll(1300, 2);
        this.emit("star", 4);
        break;
      case "question":
        this.anim("tilt", [
          [0.23, 140, Ease.out],
          [0.17, 200, Ease.back],
        ]);
        this.anim("sy", [
          [1.09, 110, Ease.out],
          [1.0, 160, Ease.back],
        ]);
        this.anim("sx", [
          [0.92, 110, Ease.out],
          [1.0, 160, Ease.back],
        ]);
        this.blink();
        break;
      case "ratelimit":
        this.emit("sweat", 1);
        break;
      case "sleeping":
        Sound.play("sleep");
        break;
      default:
        if (prev !== "idle" || next !== "idle") this.blink();
    }
  }

  /**
   * Connects Tier 0 Verification status directly to ipin's mascot reactions:
   * - `verifying`: scanning eyes + amber badge (`searching`)
   * - `verified`: celebratory jump + star eyes (`finished` + `proud`)
   * - `failed`: head shake + squint `><` eyes (`error` + `annoyed`)
   * - `idle`: calm breathing (`idle`)
   */
  applyVerificationStatus(status: "idle" | "verifying" | "verified" | "failed") {
    switch (status) {
      case "verifying":
        this.setState("searching", true);
        this.setBadge({ kind: "dots", color: C.approval });
        break;
      case "verified":
        this.setState("finished", true);
        this.triggerEmote("proud", 1.8);
        Sound.play("finish");
        break;
      case "failed":
        this.setState("error", true);
        this.triggerEmote("annoyed", 1.4);
        Sound.play("error");
        break;
      case "idle":
      default:
        this.setState("idle");
        break;
    }
  }

  setBadge(b: Badge | null) {
    const key = b ? `${b.kind}-${b.color.join(",")}` : "none";
    if (key === this.badgeKey) return;
    this.badgeKey = key;
    this.anim("badgeS", [[0, 90, Ease.inOut]], () => {
      this.badge = b;
      if (b) this.anim("badgeS", [[1, 280, Ease.back]]);
    });
  }

  blink() {
    if (this.locks.has("open")) return;
    this.anim("open", [
      [0.05, 68, Ease.inOut],
      [1, 135, Ease.out],
    ]);
  }

  squash() {
    this.physVy += 1.1;
    this.anim("sy", [
      [0.74, 75, Ease.out],
      [1.14, 130, Ease.out],
      [0.96, 110, Ease.inOut],
      [1, 150, Ease.back],
    ]);
    this.anim("sx", [
      [1.26, 75, Ease.out],
      [0.9, 130, Ease.out],
      [1.03, 110, Ease.inOut],
      [1, 150, Ease.back],
    ]);
  }

  /** Subtle joyful pop when an agent completes a sub-step during work. */
  pulseStep() {
    if (this.locks.has("sy") || this.state === "sleeping") return;
    this.physVy -= 0.55;
    this.anim("sy", [
      [1.08, 80, Ease.out],
      [0.95, 95, Ease.inOut],
      [1, 120, Ease.back],
    ]);
    this.anim("sx", [
      [0.93, 80, Ease.out],
      [1.05, 95, Ease.inOut],
      [1, 120, Ease.back],
    ]);
  }

  /** Gelatin Osmosis Absorption — deep squishy bounce and happy jiggle. */
  gulp() {
    this.slotHTarget = 0;
    this.isChewing = false;
    this.eyeOverride = "happy";
    this.eyeOverrideUntil = now() + 0.95;
    this.blush = Math.max(this.blush, 0.65);
    this.physVy += 1.2;
    this.anim("sy", [
      [0.72, 90, Ease.out],
      [1.22, 140, Ease.out],
      [0.88, 160, Ease.inOut],
      [1.06, 180, Ease.inOut],
      [1, 220, Ease.back],
    ]);
    this.anim("sx", [
      [1.32, 90, Ease.out],
      [0.85, 140, Ease.out],
      [1.1, 160, Ease.inOut],
      [0.96, 180, Ease.inOut],
      [1, 220, Ease.back],
    ]);
    this.emit("spark", 3);
    this.blink();
  }

  /**
   * Progressive tactile poke reaction (Spec Section 5.2):
   * - 1st poke: Playful boop! Elastic squash, happy/wink eyes, blush & love bubble.
   * - 2nd rapid poke: Ticklish/annoyed squint (`><`).
   * - 3rd rapid poke (< 1.7s): Dizzy spin with stars!
   */
  slap() {
    this.interruptGreet();
    if (this.state === "dizzy") return;
    const t = now();
    this.slapTimes = this.slapTimes.filter((s) => t - s < 1.7);
    this.slapTimes.push(t);
    Sound.play("slap");
    this.squash();
    this.physVy -= 1.4;
    this.physVx += Math.random() < 0.5 ? 1.15 : -1.15;

    if (this.slapTimes.length >= 3) {
      this.slapTimes = [];
      this.onDizzy?.();
    } else if (this.slapTimes.length === 1) {
      // 1st click: Joyful tactile boop!
      this.eyeOverride = Math.random() < 0.45 ? "wink" : "happy";
      this.eyeOverrideUntil = t + 0.85;
      this.blush = Math.max(this.blush, 0.65);
      this.anim("oy", [
        [-0.14, 110, Ease.out],
        [0, 190, Ease.back],
      ]);
      this.emit("love_bubble", 1);
      this.emit("spark", 2);
    } else {
      // 2nd rapid click: Annoyed squeeze eyes (`><`)
      this.eyeOverride = "squint";
      this.eyeOverrideUntil = t + 0.8;
      this.schedule(0.06, () => Sound.play("annoyed"));
    }
  }

  doRoll(durationMs: number, turns: number) {
    this.roll = 0;
    this.anim("roll", [[Math.PI * 2 * turns, durationMs, Ease.inOut]], () => {
      this.roll = 0;
    });
  }

  /**
   * The launch "coucou": he peeks out of the top edge of the screen, crouches,
   * jumps down in a joyful full spin, lands with a squash, waves hello, opens both
   * eyes, and winks playfully with a bouncy head tilt before settling.
   */
  greet() {
    const T = GREET.T;
    const t0 = now();
    this.greetSteps = [];
    this.greetT0 = t0;
    this.greetActive = true;
    this.waveStart = 0;
    this.waveUntil = 0;
    this.nextIdleJiggle = t0 + T.end + 3 + Math.random() * 4;

    // He waits half out of the top edge, eyes wide, looking down at the screen.
    this.snap("oy", GREET.PEEK_OY);
    this.snap("spin", 0);
    this.snap("hands", 0);
    this.eyeOverride = "wide";
    this.eyeOverrideUntil = t0 + T.peekEnd;
    this.lookHoldX = 0;
    this.lookHoldY = -0.85;
    this.lookHoldUntil = t0 + T.peekEnd;

    const at = (seconds: number, fn: () => void) => {
      this.greetSteps.push({ at: seconds, fn });
    };

    // 1 · Peek: The full launch theme starts playing. Curious rise and head wobble.
    at(0, () => {
      Sound.play("greeting");
      this.anim("oy", [
        [GREET.PEEK_OY + GREET.PEEK_RISE, 650, Ease.out],
        [GREET.PEEK_OY + GREET.PEEK_RISE + 0.1, 550, Ease.inOut],
      ]);
      this.anim("tilt", [
        [0.08, 300, Ease.inOut],
        [-0.06, 320, Ease.inOut],
        [0.04, 300, Ease.inOut],
        [0, 280, Ease.out],
      ]);
    });
    at(0.65, () => {
      this.lookHoldX = 0.35;
      this.lookHoldY = -0.7;
    });
    at(0.85, () => {
      this.blink();
    });

    // 2 · Crouch: spots the user, winds up to jump!
    at(T.peekEnd, () => {
      this.lookHoldUntil = 0;
      this.anim("tilt", [[0, 160, Ease.out]]);
      this.anim("oy", [[GREET.PEEK_OY + 0.65, 380, Ease.easeIn]]);
      this.anim("sy", [[0.8, 380, Ease.out]]);
      this.anim("sx", [[1.2, 380, Ease.out]]);
    });

    // 3 · Jump: downward leap into the stage with a joyful full 360° spin!
    at(T.launch, () => {
      this.eyeOverride = "happy";
      this.eyeOverrideUntil = this.greetT0 + T.waveEnd;
      this.anim("oy", [
        [0.05, GREET.FALL_MS, Ease.easeIn],
        [-0.32, 180, Ease.out],
        [0, 220, Ease.back],
      ]);
      this.anim("spin", [[GREET.SPIN, GREET.SPIN_MS, Ease.inOut]], () => {
        this.spin = 0;
      });
      this.anim("sy", [[1.2, 220, Ease.out]]);
      this.anim("sx", [[0.86, 220, Ease.out]]);
    });
    at(T.launch + 0.3, () => this.emit("spark", 8));

    // 4 · Landing: bouncy slime squash, spring rebound, blush and stars.
    at(T.land, () => {
      this.anim("sy", [
        [0.72, 110, Ease.out],
        [1.15, 170, Ease.out],
        [1, 240, Ease.back],
      ]);
      this.anim("sx", [
        [1.28, 110, Ease.out],
        [0.88, 170, Ease.out],
        [1, 240, Ease.back],
      ]);
      this.physVy += 1.3;
      this.emit("star", 4);
      this.blush = 0.7;
    });

    // 5 · Wave: right hand waves cheerfully at the user.
    at(T.waveStart, () => {
      this.anim("hands", [[1, 260, Ease.out]]);
      this.waveStart = this.greetT0 + T.waveStart;
      this.waveUntil = this.greetT0 + T.waveEnd;
    });

    // 6 · Tuck hand back in, and OPEN BOTH EYES to look directly at the user!
    at(T.waveEnd, () => {
      this.waveUntil = 0;
      this.anim("hands", [[0, 220, Ease.inOut]]);
      this.anim("tilt", [[0, 180, Ease.inOut]]);
      this.eyeOverride = null;
      this.eyeOverrideUntil = 0;
      this.anim("es", [
        [1.14, 110, Ease.out],
        [1.0, 140, Ease.back],
      ]);
      this.lookHoldX = 0;
      this.lookHoldY = 0;
      this.lookHoldUntil = this.greetT0 + T.winkStart;
    });

    // 7 · Playful Wink Climax: squishy micro-hop, perky tilt, jelly wobble, and sparkle pop!
    at(T.winkStart, () => {
      Sound.play("wink");
      this.eyeOverride = "wink";
      this.eyeOverrideUntil = this.greetT0 + T.winkEnd;
      this.anim("tilt", [
        [0.16, 140, Ease.out],
        [0.16, 180, Ease.lin],
        [0, 150, Ease.inOut],
      ]);
      this.anim("oy", [
        [-0.12, 130, Ease.out],
        [0.02, 130, Ease.inOut],
        [0, 160, Ease.back],
      ]);
      this.anim("sy", [
        [1.12, 120, Ease.out],
        [0.93, 140, Ease.inOut],
        [1.0, 160, Ease.back],
      ]);
      this.anim("sx", [
        [0.9, 120, Ease.out],
        [1.07, 140, Ease.inOut],
        [1.0, 160, Ease.back],
      ]);
      this.physVx += 0.85;
      this.physVy -= 0.75;
      this.blush = Math.max(this.blush, 0.75);
      this.emit("spark", 4);
    });

    // 8 · Settle & conclude.
    at(T.winkEnd, () => {
      this.eyeOverride = null;
      this.eyeOverrideUntil = 0;
    });
    at(T.end, () => {
      this.greetActive = false;
      this.onGreetDone?.();
    });
  }

  /** The greeting is running (the island ignores his hover until it is over). */
  get greeting(): boolean {
    return this.greetActive;
  }

  /**
   * Cuts the greeting short — the pointer left the island, he was slapped, the
   * island closed. He drops to his spot, finishes the turn he was in and puts
   * the hand away, instead of freezing wherever he was.
   */
  interruptGreet() {
    const wasActive = this.greetActive;
    if (!wasActive && this.hands <= 0.01 && now() >= this.waveUntil) return;
    this.greetActive = false;
    this.greetSteps = [];
    this.waveUntil = 0;
    this.waveStart = 0;
    this.lookHoldUntil = 0;
    this.anim("hands", [[0, 150, Ease.inOut]]);
    if (!wasActive) return;

    Sound.fadeOut("greeting", 0.25);
    this.eyeOverrideUntil = 0;
    this.anim("oy", [[0, 220, Ease.out]]);
    this.anim("sx", [[1, 160, Ease.out]]);
    this.anim("sy", [[1, 160, Ease.out]]);
    this.anim("tilt", [[0, 160, Ease.out]]);
    if (this.spin > 0.001) {
      const left = 1 - this.spin / GREET.SPIN;
      this.anim("spin", [[GREET.SPIN, 60 + 180 * left, Ease.out]], () => {
        this.spin = 0;
      });
    }
    this.onGreetDone?.();
  }

  /** Jumps a property to `value`, dropping any tween that was moving it. */
  private snap(prop: PropKey, value: number) {
    this.tweens.delete(prop);
    this.locks.delete(prop);
    this[prop] = value;
  }

  setPermanentEmote(emote: BotEmoteName | null) {
    this.permanentEmote = emote;
    if (emote === "wink") {
      this.miniNextBehavior = now() + 0.8 + Math.random() * 1.7;
      return;
    }
    this.permanentEye = emote ? EMOTE_EYE[emote] : null;
    if (this.permanentEye) {
      this.eyeOverride = this.permanentEye;
      this.eyeOverrideUntil = Number.POSITIVE_INFINITY;
    } else if (this.eyeOverrideUntil === Number.POSITIVE_INFINITY) {
      this.eyeOverride = null;
      this.eyeOverrideUntil = 0;
    }
    this.miniNextBehavior = now() + 0.8 + Math.random() * 1.7;
  }

  triggerEmote(emote: BotEmoteName, duration = 1.8) {
    const t = now();
    this.eyeOverride = EMOTE_EYE[emote];
    this.eyeOverrideUntil = t + duration;

    switch (emote) {
      case "love":
        this.anim("blush", [
          [1, 300, Ease.out],
          [1, (duration - 0.6) * 1000, Ease.lin],
          [0, 300, Ease.inOut],
        ]);
        this.emit("heart", 4);
        this.anim("oy", [
          [-0.12, 160, Ease.out],
          [0, 300, Ease.back],
        ]);
        this.physVy -= 0.65;
        break;
      case "surprised":
        this.anim("oy", [
          [-0.3, 140, Ease.out],
          [0, 380, Ease.back],
        ]);
        this.anim("es", [
          [1.25, 120, Ease.out],
          [1, 500, Ease.inOut],
        ]);
        this.physVy -= 0.85;
        break;
      case "proud":
        Sound.play("proud");
        this.emit("star", 5);
        this.anim("tilt", [
          [-0.14, 220, Ease.out],
          [-0.14, (duration - 0.5) * 1000, Ease.lin],
          [0, 280, Ease.inOut],
        ]);
        this.anim("blush", [
          [0.7, 250, Ease.out],
          [0.7, (duration - 0.5) * 1000, Ease.lin],
          [0, 300, Ease.inOut],
        ]);
        break;
      case "wink":
        Sound.play("wink");
        this.anim("tilt", [
          [0.14, 160, Ease.out],
          [0.14, (duration - 0.4) * 1000, Ease.lin],
          [0, 240, Ease.inOut],
        ]);
        this.physVx += 0.6;
        break;
      case "yawn":
        this.anim("sy", [
          [1.13, 500, Ease.inOut],
          [1, 500, Ease.inOut],
        ]);
        this.anim("sx", [
          [0.93, 500, Ease.inOut],
          [1, 500, Ease.inOut],
        ]);
        this.schedule(0.7, () => {
          if (this.eyeOverride === "tired") {
            this.eyeOverride = "closed";
            this.emit("z", 2);
            Sound.play("yawn");
          }
        });
        break;
      case "happy":
        this.anim("blush", [
          [0.65, 200, Ease.out],
          [0, 600, Ease.inOut],
        ]);
        this.physVy -= 0.5;
        break;
      case "annoyed":
        this.eyeOverride = "squint";
        this.eyeOverrideUntil = t + 0.8;
        this.schedule(0.06, () => Sound.play("annoyed"));
        break;
    }
  }

  emit(type: Particle["type"], count: number) {
    for (let i = 0; i < count; i++) {
      const isZ = type === "z";
      const isBubble = type === "love_bubble";
      this.particles.push({
        type,
        x: (Math.random() - 0.5) * (isBubble ? 0.6 : 0.9) + (isZ ? 0.55 : 0),
        y: isBubble ? -0.65 - Math.random() * 0.2 : -0.7 - Math.random() * 0.2,
        vx: (Math.random() - 0.5) * (isBubble ? 0.22 : 0.35) + (isZ ? 0.18 : 0),
        vy: isBubble
          ? -(0.35 + Math.random() * 0.25)
          : -(0.45 + Math.random() * 0.35),
        age: -i * 0.14,
        life: isBubble ? 1.4 + Math.random() * 0.4 : 1.3 + Math.random() * 0.5,
        rot: Math.random() * Math.PI * 2,
        size: isBubble
          ? 0.13 + Math.random() * 0.05
          : 0.15 + Math.random() * 0.08,
      });
    }
  }

  animateMorph(target: number, durationMs?: number) {
    const dur = durationMs ?? (target > 0.5 ? 550 : 650);
    this.anim("morph", [[target, dur, Ease.inOut]]);
  }

  resetMorph() {
    this.tweens.delete("morph");
    this.locks.delete("morph");
    this.morph = 0;
  }

  /**
   * Dresses ipin. Animated: the old outfit leaves (180 ms), the new one drops
   * in (350 ms) and ipin does a little squash — BotEngine.setOutfit on macOS.
   */
  setOutfit(next: Outfit, animated = true) {
    if (next === this.outfitTarget) return;
    this.outfitTarget = next;
    this.tweens.delete("outfitPresence");
    this.locks.delete("outfitPresence");
    const enter = () => {
      this.outfit = next;
      this.anim("outfitPresence", [[1, 350, Ease.inOut]], () => this.squash());
    };
    if (!animated) {
      this.outfit = next;
      this.outfitPresence = next !== "none" ? 1 : 0;
    } else if (next === "none") {
      this.anim("outfitPresence", [[0, 180, Ease.inOut]], () => {
        this.outfit = "none";
      });
    } else if (this.outfit === "none") {
      this.outfitPresence = 0;
      enter();
    } else {
      this.anim("outfitPresence", [[0, 180, Ease.inOut]], enter);
    }
  }

  /** True while anything is still moving — lets the island stop its RAF loop for 0% idle CPU. */
  get busy(): boolean {
    return (
      this.tweens.size > 0 ||
      this.greetSteps.length > 0 ||
      this.scheduled.length > 0 ||
      this.particles.length > 0 ||
      this.cfg.bounces ||
      this.cfg.scans ||
      this.cfg.breathes ||
      this.cfg.zz ||
      this.cfg.sweat ||
      this.isMini ||
      this.isDancing ||
      this.dancingLevel > 0.001 ||
      this.isHovered ||
      this.hoverPet > 0.004 ||
      this.petEnergy > 0.004 ||
      this.blush > 0.004 ||
      Math.abs(this.hoverLeanX) > 0.004 ||
      Math.abs(this.hoverLeanY) > 0.004 ||
      Math.abs(this.tgYaw - this.yaw) > 0.002 ||
      Math.abs(this.tgPitch - this.pitch) > 0.002 ||
      Math.abs(this.tgTilt - this.tilt) > 0.002 ||
      Math.abs(this.tgSy - this.sy) > 0.002 ||
      Math.abs(this.tgSx - this.sx) > 0.002 ||
      Math.abs(this.tgEs - this.es) > 0.002 ||
      Math.abs(this.physVx) > 0.008 ||
      Math.abs(this.physVy) > 0.008 ||
      Math.abs(this.physDx) > 0.005 ||
      Math.abs(this.physDy) > 0.005 ||
      Math.abs(this.col[0] - this.colT[0]) > 0.003 ||
      Math.abs(this.col[1] - this.colT[1]) > 0.003 ||
      Math.abs(this.col[2] - this.colT[2]) > 0.003
    );
  }

  // ── Tweens ──────────────────────────────────────────────────────────────────

  anim(prop: PropKey, keys: TweenKey[], onComplete?: () => void) {
    this.tweens.set(prop, {
      prop,
      keys,
      index: 0,
      from: this[prop],
      startMs: performance.now(),
      onComplete,
    });
    this.locks.add(prop);
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  update(dt: number) {
    const n = now();
    const nowMs = performance.now();

    // 1. Greeting timeline steps
    while (
      this.greetSteps.length > 0 &&
      n >= this.greetT0 + this.greetSteps[0].at
    ) {
      this.greetSteps.shift()!.fn();
    }

    // 2. Frame-synced scheduled tasks (in-place compaction, zero allocation)
    if (this.scheduled.length > 0) {
      let writeIdx = 0;
      for (let i = 0; i < this.scheduled.length; i++) {
        const task = this.scheduled[i];
        if (n >= task.at) {
          task.fn();
        } else {
          this.scheduled[writeIdx++] = task;
        }
      }
      this.scheduled.length = writeIdx;
    }

    if (n < this.lookHoldUntil) {
      this.lookX = this.lookHoldX;
      this.lookY = this.lookHoldY;
    }

    // 3. Tweens update (direct Map iterator, zero spread array allocation)
    for (const tw of this.tweens.values()) {
      const k = tw.keys[tw.index];
      const p = Math.min(1, Math.max(0, (nowMs - tw.startMs) / k[1]));
      this[tw.prop] = tw.from + (k[0] - tw.from) * k[2](p);
      if (p >= 1) {
        tw.from = k[0];
        tw.index += 1;
        tw.startMs = nowMs;
        if (tw.index >= tw.keys.length) {
          this.tweens.delete(tw.prop);
          this.locks.delete(tw.prop);
          tw.onComplete?.();
        }
      }
    }

    const t = n - this.t0;
    let ty = Math.max(-0.42, Math.min(0.42, this.lookX * 0.42));
    let tp = Math.max(-0.26, Math.min(0.26, this.lookY * 0.28));

    if (this.cfg.look) {
      ty = ty * 0.35 + this.cfg.look[0] * 0.42;
      tp = tp * 0.3 + this.cfg.look[1] * 0.28;
    }
    if (this.cfg.scans) {
      ty = Math.sin(t * 2.6) * 0.42;
      tp = -0.06;
    }
    if (this.state === "sleeping") {
      ty = 0;
      tp = -0.14;
    }
    if (this.state === "dizzy") {
      ty = Math.sin(t * 9) * 0.22;
    }

    // Mini bots never follow the mouse — they wander.
    if (
      this.isMini &&
      !this.cfg.look &&
      !this.cfg.scans &&
      this.state !== "sleeping" &&
      this.state !== "dizzy"
    ) {
      if (n > this.miniLookNextTime) {
        this.miniLookTarget.x = -0.88 + Math.random() * 1.76;
        this.miniLookTarget.y = -0.55 + Math.random() * 1.0;
        this.miniLookNextTime = n + 0.5 + Math.random() * 1.5;
      }
      ty = this.miniLookTarget.x * 0.42;
      tp = this.miniLookTarget.y * 0.28;
    }

    this.tgYaw = ty + (this.isMini ? 0 : this.hoverLeanX * 0.14);
    this.tgPitch = tp - (this.isMini ? 0 : this.hoverLeanY * 0.12);

    // Gentle sway when thinking, plus responsive tilt into the petting hand!
    const thinkSway = this.state === "thinking" ? Math.sin(t * 2.1) * 0.045 : 0;
    this.tgTilt =
      this.cfg.tilt +
      thinkSway +
      (this.isMini ? 0 : ty * 0.075 + this.hoverLeanX * 0.4);

    if (n > this.waveStart && n < this.waveUntil) {
      const wt = n - this.waveStart;
      this.tgTilt = -0.06 + Math.sin(2 * Math.PI * 1.2 * wt) * 0.07;
    }

    // State bounce + tactile hover cushion sink
    let bounce = 0;
    if (this.cfg.bounces) {
      bounce =
        this.state === "working"
          ? -Math.abs(Math.sin(t * 4.2)) * 0.042
          : -Math.abs(Math.sin(t * 5.4)) * 0.075;
    }
    if (
      !this.isMini &&
      (this.hoverPet > 0.005 || Math.abs(this.hoverLeanY) > 0.005)
    ) {
      bounce += this.hoverPet * 0.055 + this.hoverLeanY * 0.075;
    }

    const kGen = 1 - Math.pow(0.0008, dt);
    if (!this.locks.has("oy")) this.oy += (bounce - this.oy) * kGen;
    if (!this.locks.has("ox") && !this.isMini) {
      const sway =
        Math.sin(ty) * 0.035 + thinkSway * 0.4 + this.hoverLeanX * 0.11;
      this.ox += (sway - this.ox) * kGen;
    }

    // Base breathing / state scale
    if (this.cfg.breathes) {
      const amp = this.isMini ? 0.07 : 0.038;
      this.tgSy = 1 + Math.sin(t * 1.8) * amp;
      this.tgSx = 1 - Math.sin(t * 1.8) * amp * 0.57;
    } else if (this.isMini) {
      this.tgSy = 1 + Math.sin(t * 2.2) * 0.04;
      this.tgSx = 1 - Math.sin(t * 2.2) * 0.02;
    } else if (this.state === "working") {
      const wWave = Math.sin(t * 8.4) * 0.018;
      this.tgSy = 1 + wWave;
      this.tgSx = 1 - wWave * 0.65;
    } else {
      this.tgSy = 1;
      this.tgSx = 1;
    }

    // Tactile Hover Cushion Squish: pressing/petting visibly squishes the whole slime body
    if (!this.isMini && (this.hoverPet > 0.005 || this.petEnergy > 0.005)) {
      const petSquish =
        this.hoverPet * 0.0 +
        this.petEnergy * 0.0 +
        Math.max(0, this.hoverLeanY) * 0.075 -
        Math.max(0, -this.hoverLeanY) * 0.055;
      this.tgSy *= 1 - petSquish;
      this.tgSx *= 1 + petSquish * 0.92;
    }

    if (this.isMini && n > this.miniNextBehavior) this.doMiniBehaviorLoop();

    const kLook = 1 - Math.pow(0.0025, dt);
    if (!this.locks.has("yaw")) this.yaw += (this.tgYaw - this.yaw) * kLook;
    if (!this.locks.has("pitch"))
      this.pitch += (this.tgPitch - this.pitch) * kLook;
    if (!this.locks.has("tilt")) this.tilt += (this.tgTilt - this.tilt) * kGen;
    if (!this.locks.has("sy")) this.sy += (this.tgSy - this.sy) * kGen;
    if (!this.locks.has("sx")) this.sx += (this.tgSx - this.sx) * kGen;
    if (!this.locks.has("es")) this.es += (this.tgEs - this.es) * kGen;

    if (
      Math.abs(this.col[0] - this.colT[0]) > 0.001 ||
      Math.abs(this.col[1] - this.colT[1]) > 0.001 ||
      Math.abs(this.col[2] - this.colT[2]) > 0.001
    ) {
      this.col = mix3(this.col, this.colT, 1 - Math.pow(0.002, dt));
    }

    if (n > this.nextBlink) {
      if (this.state !== "sleeping" && this.state !== "dizzy") {
        this.blink();
        if (Math.random() < 0.24) {
          this.schedule(0.22, () => this.blink());
        }
      }
      this.nextBlink = n + 2.2 + Math.random() * 3.2;
    }

    // Playful Idle Micro-Jiggle & Quirks (Spec Section 5.3 + Option D)
    if (
      this.state === "idle" &&
      !this.greeting &&
      n > this.nextIdleJiggle &&
      !this.isDancing &&
      !this.isHovered &&
      !this.locks.has("sy") &&
      !this.locks.has("sx")
    ) {
      this.idleQuirkStep = (this.idleQuirkStep + 1) % 3;
      if (this.idleQuirkStep === 0) {
        // Playful perky stretch + happy blink
        this.physVy -= 0.65;
        this.anim("sy", [
          [1.08, 110, Ease.out],
          [0.93, 120, Ease.inOut],
          [1.02, 110, Ease.inOut],
          [1.0, 140, Ease.back],
        ]);
        this.anim("sx", [
          [0.93, 110, Ease.out],
          [1.07, 120, Ease.inOut],
          [0.98, 110, Ease.inOut],
          [1.0, 140, Ease.back],
        ]);
        this.anim("tilt", [
          [0.09, 130, Ease.out],
          [-0.06, 150, Ease.inOut],
          [0, 160, Ease.out],
        ]);
      } else {
        // Classic damped jelly micro-wobble preserving volume (sx * sy ≈ 1)
        this.physVx += (Math.random() < 0.5 ? 1 : -1) * 0.5;
        this.anim("sy", [
          [1.06, 90, Ease.out],
          [0.94, 110, Ease.inOut],
          [1.03, 110, Ease.inOut],
          [1.0, 140, Ease.back],
        ]);
        this.anim("sx", [
          [0.94, 90, Ease.out],
          [1.06, 110, Ease.inOut],
          [0.97, 110, Ease.inOut],
          [1.0, 140, Ease.back],
        ]);
      }
      this.nextIdleJiggle = n + 7 + Math.random() * 7;
    }

    if (this.eyeOverride && n > this.eyeOverrideUntil) {
      this.eyeOverride = this.permanentEye;
      if (this.permanentEye) this.eyeOverrideUntil = Number.POSITIVE_INFINITY;
    }

    if (n - this.lastAmbient > 1.3) {
      this.lastAmbient = n;
      if (this.cfg.zz) this.emit("z", 1);
      if (!this.isMini && this.cfg.sweat && Math.random() < 0.5) {
        this.emit("sweat", 1);
      }
    }

    // 4. In-place particle aging & compaction (zero array allocation)
    if (this.particles.length > 0) {
      let writeIdx = 0;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.age += dt;
        if (p.age < p.life) {
          this.particles[writeIdx++] = p;
        }
      }
      this.particles.length = writeIdx;
    }

    // 5. Legacy mouth spring — only computed if an external caller sets slotHTarget > 0
    if (
      this.slotHTarget > 0.0001 ||
      this.slotH > 0.0001 ||
      Math.abs(this.slotHVel) > 0.0001
    ) {
      const omega = (2 * Math.PI) / 0.25;
      const zeta = 0.6;
      const acc =
        omega * omega * (this.slotHTarget - this.slotH) -
        2 * zeta * omega * this.slotHVel;
      this.slotHVel += acc * dt;
      this.slotH = Math.max(0, this.slotH + this.slotHVel * dt);
    }

    this.dancingLevel = stepDanceLevel(this.dancingLevel, this.isDancing, dt);

    // 6. Hover petting transition, 2D magnetic lean-in, and decay
    const fastLerp = Math.min(1, dt * 12);
    this.hoverPet = lerp(this.hoverPet, this.isHovered ? 1 : 0, fastLerp);
    this.hoverLeanX = lerp(this.hoverLeanX, this.targetHoverLeanX, fastLerp);
    this.hoverLeanY = lerp(this.hoverLeanY, this.targetHoverLeanY, fastLerp);
    this.petEnergy = Math.max(
      0,
      this.petEnergy - dt * (this.isHovered ? 1.4 : 2.6),
    );

    if (this.isHovered) {
      // Gently relax stroke targets while pointer rests still on head
      const relax = Math.max(0, 1 - dt * 5);
      this.targetHoverLeanX *= relax;
      this.targetHoverLeanY *= relax;
    } else {
      const releaseDecay = Math.max(0, 1 - dt * 10);
      this.targetHoverLeanX *= releaseDecay;
      this.targetHoverLeanY *= releaseDecay;
      if (this.blush > 0) {
        this.blush = Math.max(0, this.blush - dt * 0.45);
      }
    }

    // Smooth cheek smile lift (Option A: Happy Cheek Lift)
    const activeEye = this.eyeOverride ?? this.cfg.eye;
    const isJoyful =
      activeEye === "happy" ||
      activeEye === "wink" ||
      activeEye === "heart" ||
      activeEye === "star" ||
      this.blush > 0.35 ||
      this.dancingLevel > 0.2;
    this.joyMorph = lerp(this.joyMorph, isJoyful ? 1 : 0, Math.min(1, dt * 9));

    // 7. Underdamped Pudding Spring (stiffness 85, damping 4.6 -> juicy multi-bounce!)
    if (dt > 0 && dt < 0.25) {
      const yawVel = (this.yaw - this.prevYaw) / dt;
      const oyVel = (this.oy - this.prevOy) / dt;
      const dRoll = this.roll - this.prevRoll;
      const rollVel = Math.abs(dRoll) > Math.PI ? 0 : dRoll / dt;
      const dSpin = this.spin - this.prevSpin;
      const spinVel = Math.abs(dSpin) > Math.PI ? 0 : dSpin / dt;
      const centrifugal = (rollVel + spinVel) * 0.18;
      const tDx = Math.max(
        -1.35,
        Math.min(
          1.35,
          -yawVel * 0.42 -
            this.tilt * 2.1 +
            centrifugal +
            this.hoverLeanX * 0.65,
        ),
      );
      const tDy = Math.max(
        -1.35,
        Math.min(1.35, oyVel * 0.65 + this.hoverLeanY * 0.55),
      );
      this.physVx += (85 * (tDx - this.physDx) - 4.6 * this.physVx) * dt;
      this.physVy += (85 * (tDy - this.physDy) - 4.6 * this.physVy) * dt;
      this.physDx = Math.max(
        -1.6,
        Math.min(1.6, this.physDx + this.physVx * dt),
      );
      this.physDy = Math.max(
        -1.6,
        Math.min(1.6, this.physDy + this.physVy * dt),
      );
    }
    this.prevYaw = this.yaw;
    this.prevOy = this.oy;
    this.prevRoll = this.roll;
    this.prevSpin = this.spin;

    this.lastTime = n;
  }

  private doMiniBehaviorLoop() {
    const n = now();
    switch (this.permanentEmote) {
      case "happy":
        if (this.locks.has("oy")) {
          this.miniNextBehavior = n + 0.4;
          return;
        }
        this.anim("oy", [
          [-0.3, 120, Ease.out],
          [0.03, 200, Ease.inOut],
          [0, 160, Ease.back],
        ]);
        this.anim("sy", [
          [0.82, 80, Ease.out],
          [1.18, 130, Ease.out],
          [0.88, 160, Ease.inOut],
          [1, 200, Ease.back],
        ]);
        this.anim("sx", [
          [1.15, 80, Ease.out],
          [0.88, 130, Ease.out],
          [1.06, 160, Ease.inOut],
          [1, 200, Ease.back],
        ]);
        this.miniNextBehavior = n + 2.2 + Math.random() * 1.2;
        break;
      case "annoyed":
        if (this.locks.has("yaw")) {
          this.miniNextBehavior = n + 0.5;
          return;
        }
        this.anim("yaw", [
          [-0.65, 50, Ease.out],
          [0.65, 90, Ease.inOut],
          [-0.5, 80, Ease.inOut],
          [0.4, 75, Ease.inOut],
          [-0.2, 70, Ease.inOut],
          [0, 140, Ease.out],
        ]);
        this.miniNextBehavior = n + 3.0 + Math.random() * 2.5;
        break;
      case "wink":
        this.eyeOverride = "wink";
        this.eyeOverrideUntil = n + 0.55;
        this.anim("tilt", [
          [0.13, 100, Ease.out],
          [0.13, 320, Ease.lin],
          [0, 200, Ease.inOut],
        ]);
        this.miniNextBehavior = n + 2.2 + Math.random() * 2.0;
        break;
      case "love":
        this.emit("heart", 2);
        this.anim("tilt", [
          [-0.1, 180, Ease.out],
          [0.1, 340, Ease.inOut],
          [0, 220, Ease.inOut],
        ]);
        this.miniNextBehavior = n + 2.6 + Math.random() * 1.5;
        break;
      default:
        this.miniNextBehavior = n + 3.0 + Math.random() * 2.0;
    }
  }

  // ── Dancing ─────────────────────────────────────────────────────────────────

  setDancing(dancing: boolean) {
    if (this.isDancing !== dancing) this.isDancing = dancing;
  }

  /**
   * Applies the dance bounce and sway around the bottom of the body. Call it on
   * a saved context, before draw(), with the same size (BotEngine.applyDance).
   */
  applyDance(x: CanvasRenderingContext2D, W: number, H: number) {
    if (this.dancingLevel <= 0.001) return;
    const R = W * 0.3;
    const px = W / 2 + this.ox * R;
    const py =
      H / 2 + this.particleOverhang / 2 + this.oy * R + R * 0.06 + R * 0.88;
    const d = danceTransform(now(), this.dancingLevel, R);
    x.translate(px + d.dx, py + d.dy);
    x.rotate(d.rotate);
    x.scale(d.sx, d.sy);
    x.translate(-px, -py);
  }

  // ── Draw ────────────────────────────────────────────────────────────────────

  /**
   * Draws hands, body, blush, eyes, badge and particles into a canvas of
   * `W`×`H` CSS pixels (the caller has already applied the DPR transform).
   */
  draw(x: CanvasRenderingContext2D, W: number, H: number) {
    const R = W * 0.3;
    const rx = R * 1.14;
    const ry = R * 0.88;
    const cx = W / 2 + this.ox * R;
    const cy = H / 2 + this.particleOverhang / 2 + this.oy * R + R * 0.06;

    // Both `roll` (finished/dizzy 360° turn) and `spin` (launch greeting turn)
    // rotate the character smoothly whether wearing an outfit or not.
    x.save();
    const turn = this.roll + this.spin;
    if (Math.abs(turn) > 0.001) {
      x.translate(cx, cy);
      x.rotate(turn);
      x.translate(-cx, -cy);
    }

    this.drawHandsBehind(x, R, rx, ry, cx, cy);

    x.save();
    x.translate(cx, cy);
    if (this.tilt !== 0) x.rotate(this.tilt);
    x.scale(this.sx, this.sy);

    const dressed = !this.isMini && this.outfit !== "none";
    const head = dressed
      ? makeHead(R, this.yaw, this.pitch, this.physDx, this.physDy)
      : null;
    const outfitState = { presence: this.outfitPresence, morph: this.morph };
    if (head) drawOutfitBehind(x, this.outfit, head, outfitState);

    const body = this.bodyPath(rx, ry, R);
    this.drawBody(x, body, R, rx, ry);

    // Official Spec v2.0 Cheek Blush (#FFAEC0 -> 255, 174, 192) anchored to face parallax
    const blushVal = Math.max(this.blush, this.tint * 0.45) * (1 - this.morph);
    if (blushVal > 0.01) {
      x.save();
      x.clip(body);
      const { fx, fy, scaleX } = this.getFaceAnchor(rx, ry);
      const blushY = fy + ry * (0.24 - this.joyMorph * 0.035);
      const blushSep = rx * 0.54 * scaleX;
      x.fillStyle = `rgba(255, 174, 192, ${0.58 * blushVal})`;
      for (const sd of [-1, 1]) {
        x.beginPath();
        x.ellipse(
          fx + sd * blushSep,
          blushY,
          R * (0.18 + this.joyMorph * 0.025) * scaleX,
          R * (0.105 + this.joyMorph * 0.015),
          0,
          0,
          Math.PI * 2,
        );
        x.fill();
      }
      x.restore();
    }

    this.drawEyes(x, body, R, rx, ry);

    if (head) drawOutfitFront(x, this.outfit, head, outfitState);

    x.restore();
    x.restore();

    if (this.badge && this.badgeS > 0.01 && this.morph < 0.25) {
      this.drawBadge(x, this.badge, R, cx, cy);
    }
    this.drawParticles(x, R, cx, cy);
  }

  /**
   * Builds the squishy slime silhouette using the pre-computed LUT, applying
   * real-time underdamped crown inertia (`physDx`, `physDy`), volume-preserving
   * cheek bulge under pressure, happy cheek lift (`joyMorph`), and 2D petting deflection.
   */
  private bodyPath(rx: number, ry: number, R: number): Path2D {
    const p = new Path2D();
    const m = this.morph;
    const hoverIndent =
      (this.hoverPet * 0 +
        this.petEnergy * 0.08 +
        Math.max(0, this.hoverLeanY) * 0.1) *
      R;
    const jellySheerX = this.isMini
      ? 0
      : (this.physDx * 0.24 + this.hoverLeanX * 0.16) * rx;
    const jellyBounceY = this.isMini
      ? 0
      : (this.physDy * 0.1 + this.hoverLeanY * 0.12) * ry;

    // Pressing down on the crown pushes slime volume into the plump cheeks!
    const squishBulge = this.isMini
      ? 0
      : Math.max(
          0,
          this.physDy * 0.08 + this.hoverPet * 0.065 + this.petEnergy * 0.05,
        );
    const joyCheekX = this.isMini ? 0 : this.joyMorph * 0.045 + squishBulge;
    const joyCheekLiftY = this.isMini ? 0 : this.joyMorph * 0.038 * ry;

    for (let i = 0; i <= MESH_N; i++) {
      const crownW = LUT_CROWN_W[i];
      const cheekW = LUT_CHEEK_W[i];

      let px0 =
        rx * LUT_UX[i] * (1 + cheekW * joyCheekX) + crownW * jellySheerX;
      let py0 = ry * LUT_UY[i] + crownW * jellyBounceY - cheekW * joyCheekLiftY;

      if (hoverIndent > 0.001) {
        py0 += LUT_HOVER_W[i] * hoverIndent;
      }

      let px = px0;
      let py = py0;
      if (m >= 0.005) {
        px = lerp(px0, LUT_RR_UX[i] * R, m);
        py = lerp(py0, LUT_RR_UY[i] * R, m);
      }
      if (i === 0) p.moveTo(px, py);
      else p.lineTo(px, py);
    }
    p.closePath();
    return p;
  }

  /** Face coordinate anchor (parallax shift & foreshortening based on head yaw and pitch). */
  private getFaceAnchor(rx: number, ry: number) {
    const effYaw = Math.max(-0.45, Math.min(0.45, this.yaw));
    const effPitch = Math.max(-0.28, Math.min(0.28, this.pitch));
    const fx =
      Math.sin(effYaw) * rx * 0.52 +
      (this.physDx * 0.065 + this.hoverLeanX * 0.05) * rx;
    const fy =
      -Math.sin(effPitch) * ry * 0.36 +
      (this.physDy * 0.05 + this.hoverPet * 0.04 - this.joyMorph * 0.025) * ry +
      (this.morph > 0 ? ry * 0.12 * this.morph : 0);
    const scaleX = Math.max(0.74, Math.cos(effYaw));
    return { fx, fy, scaleX, effYaw, effPitch };
  }

  private drawBody(
    x: CanvasRenderingContext2D,
    body: Path2D,
    R: number,
    rx: number,
    ry: number,
  ) {
    // Energetic Pastel Slime Palette (v2.0)
    let bodyTop: RGB = SLIME_TOP;
    let bodyBottom: RGB = SLIME_BOTTOM;

    if (this.bodyColor) {
      bodyTop = mix3(this.bodyColor, [1, 1, 1], 0.28);
      bodyBottom = this.bodyColor;
    }

    if (this.isMini) {
      x.fillStyle = rgba(this.bodyColor ?? SLIME_BOTTOM, 1);
      x.fill(body);
      return;
    }

    // Outer slime body gradient
    const g = x.createLinearGradient(rx * 0.6, -ry * 0.9, -rx * 0.7, ry * 0.9);
    g.addColorStop(0, rgba(bodyTop));
    g.addColorStop(1, rgba(bodyBottom));
    x.fillStyle = g;
    x.fill(body);

    x.save();

    const effectiveTint = this.tint * (1 - this.morph);
    if (effectiveTint > 0.01) {
      const tg = x.createLinearGradient(0, ry, 0, -ry);
      tg.addColorStop(0, rgba(this.col, 0.72 * effectiveTint));
      tg.addColorStop(1, rgba(this.col, 0));
      x.fillStyle = tg;
      x.fill(body);
    }

    // Soft translucent jelly inner bounce glow (#A3FFDF)
    const innerGlow = x.createRadialGradient(
      0,
      ry * 0.35,
      R * 0.1,
      0,
      ry * 0.35,
      R * 0.95,
    );
    innerGlow.addColorStop(0, "rgba(255,255,255,0.24)");
    innerGlow.addColorStop(0.6, "rgba(163,255,223,0.14)");
    innerGlow.addColorStop(1, "rgba(163,255,223,0)");
    x.fillStyle = innerGlow;
    x.fill(body);

    // Soft rim ambient shadow around the base
    const sh = x.createRadialGradient(
      0,
      ry * 0.2,
      R * 0.2,
      0,
      ry * 0.2,
      R * 1.3,
    );
    sh.addColorStop(0, "rgba(0,0,0,0)");
    sh.addColorStop(0.7, "rgba(10,50,35,0.06)");
    sh.addColorStop(1, "rgba(10,50,35,0.28)");
    x.fillStyle = sh;
    x.fill(body);

    // Translucent glossy jelly dome highlight (shifts dynamically with crown jelly physics)
    const hlX = rx * 0.3 + (this.physDx * 0.14 + this.hoverLeanX * 0.1) * R;
    const hlY = -ry * 0.46 + (this.physDy * 0.12 + this.hoverPet * 0.08) * R;
    const hl = x.createRadialGradient(hlX, hlY, 0, hlX, hlY, R * 0.46);
    hl.addColorStop(0, "rgba(255,255,255,0.38)");
    hl.addColorStop(0.5, "rgba(255,255,255,0.13)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = hl;
    x.fill(body);
    x.restore();
  }

  private drawEyes(
    x: CanvasRenderingContext2D,
    body: Path2D,
    R: number,
    rx: number,
    ry: number,
  ) {
    let shape: EyeShape = this.eyeOverride ?? this.cfg.eye;
    // Dancing: happy eyes in the calm states.
    if (
      this.isDancing &&
      this.dancingLevel > 0.15 &&
      !this.isMini &&
      (this.state === "idle" || this.state === "finished")
    ) {
      shape = "happy";
    }
    if (this.morph > 0.5) {
      shape = "happy";
    }

    x.save();
    x.clip(body);
    const ink = this.isMini ? MINI_INK : EYE_DARK;
    x.fillStyle = ink;
    x.strokeStyle = ink;

    const { fx, fy, scaleX, effYaw } = this.getFaceAnchor(rx, ry);
    const eyeMult = this.isMini ? 1.9 : 1.0;
    const baseW = R * EYE_W * this.es * eyeMult;
    const baseH = R * EYE_H * this.es * eyeMult;

    // Minimum distance between the two eyes to guarantee they NEVER touch or overlap
    const eyeSpacing = rx * EYE_SP;
    const minSep = baseW * 0.75;
    const sepX = Math.max(minSep, eyeSpacing * scaleX);

    // Subtle glance within the eye
    const glanceX = this.lookX * (R * 0.038);
    const glanceY = this.lookY * (R * 0.028);

    const showSparkle =
      !this.isMini &&
      (this.state === "approval" ||
        this.state === "question" ||
        shape === "wide");

    // Option C: Inquisitive asymmetric gaze on question / thinking states
    const isInquisitive =
      !this.isMini &&
      shape === "pill" &&
      (this.state === "question" || this.state === "thinking");

    for (const sd of [-1, 1]) {
      const ex = this.isMini ? sd * eyeSpacing : fx + sd * sepX + glanceX;
      const ey = this.isMini
        ? 0
        : fy +
          EYE_P * ry +
          glanceY +
          (this.morph > 0 ? ry * 0.14 * this.morph : 0);

      // Eye foreshortening: the eye on the side turning away compresses slightly
      const sideComp = 1 - sd * effYaw * 0.28;
      const eyeScaleX = Math.max(0.68, Math.min(1.15, scaleX * sideComp));

      // Slight curious asymmetry ("Hmm?" look)
      const asymH = isInquisitive ? (sd > 0 ? 1.09 : 0.92) : 1.0;
      const asymW = isInquisitive ? (sd > 0 ? 1.04 : 0.96) : 1.0;

      x.save();
      x.translate(ex, ey);
      x.scale(eyeScaleX, 1);
      this.drawEyeShape(
        x,
        shape,
        baseW * asymW,
        baseH * asymH,
        sd,
        ink,
        showSparkle,
      );
      x.restore();
    }
    x.restore();
  }

  private drawEyeShape(
    x: CanvasRenderingContext2D,
    shape: EyeShape,
    w: number,
    h: number,
    sd: number,
    ink: string,
    showSparkle = false,
  ) {
    const t = now();
    switch (shape) {
      case "wide":
        this.drawEyeShape(x, "pill", w * 1.16, h * 1.12, sd, ink, true);
        break;
      case "pill": {
        // Option C: Squishy blink — eye widens slightly as it squashes shut
        const blinkSquishW = w * (1 + (1 - this.open) * 0.16);
        const hh = Math.max(h * this.open, w * 0.28);
        roundRectPath(
          x,
          -blinkSquishW / 2,
          -hh / 2,
          blinkSquishW,
          hh,
          Math.min(blinkSquishW / 2, hh / 2),
        );
        x.fill();
        // Conditional catchlight only on special states (approval/question puppy eyes)
        if (showSparkle && this.open > 0.6 && w >= 3.5) {
          x.fillStyle = "#FFFFFF";
          x.beginPath();
          x.arc(
            sd < 0 ? w * 0.14 : -w * 0.14,
            -hh * 0.22,
            Math.max(0.7, w * 0.18),
            0,
            Math.PI * 2,
          );
          x.fill();
          x.fillStyle = ink;
        }
        break;
      }
      case "dot":
        x.beginPath();
        x.arc(0, 0, w * 0.46, 0, Math.PI * 2);
        x.fill();
        break;
      case "line":
        x.rotate(-sd * 0.2);
        roundRectPath(x, -w * 0.78, -w * 0.21, w * 1.56, w * 0.42, w * 0.21);
        x.fill();
        break;
      case "flat":
        roundRectPath(x, -w * 0.72, -w * 0.2, w * 1.44, w * 0.4, w * 0.2);
        x.fill();
        break;
      case "squint": {
        // Anime/manga squeeze eyes: left eye points right, right eye points left
        const armX = sd * w * 0.72;
        const tipX = -sd * w * 0.68;
        const armY = h * 0.38;
        x.lineWidth = Math.max(2.2, w * 0.44);
        x.lineCap = "round";
        x.lineJoin = "round";
        x.beginPath();
        x.moveTo(armX, -armY);
        x.lineTo(tipX, 0);
        x.lineTo(armX, armY);
        x.stroke();
        break;
      }
      case "happy":
        x.lineWidth = w * 0.5;
        x.lineCap = "round";
        x.beginPath();
        x.arc(0, h * 0.18, w * 0.82, Math.PI * 1.12, Math.PI * 1.88);
        x.stroke();
        break;
      case "closed":
        x.lineWidth = w * 0.36;
        x.lineCap = "round";
        x.beginPath();
        x.arc(0, -h * 0.08, w * 0.78, Math.PI * 0.15, Math.PI * 0.85);
        x.stroke();
        break;
      case "spiral": {
        x.lineWidth = w * 0.22;
        x.lineCap = "round";
        x.beginPath();
        for (let a = 0; a < 4.4 * Math.PI; a += 0.2) {
          const r = w * 0.06 + a * w * 0.058;
          const aa = a + t * 9 * sd;
          const px = Math.cos(aa) * r;
          const py = Math.sin(aa) * r;
          if (a === 0) x.moveTo(px, py);
          else x.lineTo(px, py);
        }
        x.stroke();
        break;
      }
      case "heart":
        x.fillStyle = "#FF5D7A";
        heartPath(x, w * 1.2);
        x.fill();
        x.fillStyle = ink;
        break;
      case "star":
        x.fillStyle = "#F7B32B";
        x.rotate(t * 1.5 * sd);
        starPath(x, w * 1.05, w * 0.46);
        x.fill();
        x.fillStyle = ink;
        break;
      case "tired":
        roundRectPath(x, -w / 2, -h * 0.02, w, h * 0.38, w / 2);
        x.fill();
        roundRectPath(x, -w * 0.62, -h * 0.1, w * 1.24, w * 0.22, w * 0.11);
        x.fill();
        break;
      case "wink":
        if (sd < 0) {
          const hh = Math.max(h * this.open, w * 0.3);
          roundRectPath(x, -w / 2, -hh / 2, w, hh, Math.min(w / 2, hh / 2));
          x.fill();
          if (!this.isMini && this.open > 0.5 && w >= 3.5) {
            x.fillStyle = "#FFFFFF";
            x.beginPath();
            x.arc(
              -w * 0.18,
              -hh * 0.22,
              Math.max(0.8, w * 0.22),
              0,
              Math.PI * 2,
            );
            x.fill();
            x.beginPath();
            x.arc(w * 0.2, hh * 0.22, Math.max(0.4, w * 0.11), 0, Math.PI * 2);
            x.fill();
            x.fillStyle = ink;
          }
        } else {
          x.lineWidth = w * 0.5;
          x.lineCap = "round";
          x.beginPath();
          x.arc(0, h * 0.18, w * 0.82, Math.PI * 1.12, Math.PI * 1.88);
          x.stroke();
        }
        break;
      case "cup": {
        const hh = Math.max(h * this.open, w * 0.3);
        const cr = Math.min(w / 2, hh / 2);
        x.beginPath();
        x.moveTo(-w / 2, -hh / 2);
        x.lineTo(w / 2, -hh / 2);
        x.lineTo(w / 2, hh / 2 - cr);
        x.quadraticCurveTo(w / 2, hh / 2, w / 2 - cr, hh / 2);
        x.lineTo(-w / 2 + cr, hh / 2);
        x.quadraticCurveTo(-w / 2, hh / 2, -w / 2, hh / 2 - cr);
        x.closePath();
        x.fill();
        break;
      }
    }
  }

  /** Hands sit behind the body — drawn before it, in world coordinates. */
  private drawHandsBehind(
    x: CanvasRenderingContext2D,
    R: number,
    rx: number,
    ry: number,
    cx: number,
    cy: number,
  ) {
    if (this.hands <= 0.01 || this.isMini) return;
    if (R <= 14) return; // meaningless at compact/peek sizes

    const n = now();
    const bodyH = 2 * ry;
    const hew = 0.3 * ry * this.hands;
    const heh = 0.26 * ry * this.hands;
    const hwB = rx * this.sx;
    const hhB = ry * this.sy;
    const isWaving =
      n >= this.waveStart && this.waveStart > 0 && n < this.waveUntil;

    for (const sd of [-1, 1]) {
      let localX: number;
      let localY: number;
      let handRot = 0;

      if (sd > 0 && isWaving) {
        const wt = n - this.waveStart;
        const rise = Math.min(1, wt / 0.18);
        const riseEased = 1 - Math.pow(1 - rise, 3);
        const restX = hwB * 1.08;
        const restY = hhB * 0.7;
        const oscX = Math.cos(13 * wt) * 0.06 * bodyH;
        const oscY = -Math.sin(13 * wt) * 0.14 * bodyH;
        const waveX = hwB * 1.1 + oscX;
        const waveY = -hhB * 0.15 + oscY;
        localX = restX + (waveX - restX) * riseEased;
        localY = restY + (waveY - restY) * riseEased;
        handRot = (-0.5 + Math.sin(13 * wt) * 0.35) * riseEased;
      } else if (sd < 0 && isWaving) {
        const wt = n - this.waveStart;
        localX = -hwB * 1.08;
        localY = hhB * 0.7 + Math.sin(6 * wt) * 0.04 * bodyH;
      } else {
        localX = sd * hwB * 1.08;
        localY = hhB * 0.7;
      }

      const cosT = Math.cos(this.tilt);
      const sinT = Math.sin(this.tilt);
      const worldX = cx + cosT * localX - sinT * localY;
      const worldY = cy + sinT * localX + cosT * localY;

      x.save();
      x.translate(worldX, worldY);
      if (handRot !== 0) x.rotate(handRot);
      const g = x.createLinearGradient(
        hew * 0.7,
        -heh * 0.85,
        -hew * 0.8,
        heh * 0.9,
      );
      if (this.bodyColor) {
        g.addColorStop(0, rgba(mix3(this.bodyColor, [1, 1, 1], 0.35)));
        g.addColorStop(1, rgba(this.bodyColor));
      } else {
        g.addColorStop(0, rgba(SLIME_TOP));
        g.addColorStop(1, rgba(SLIME_BOTTOM));
      }
      x.beginPath();
      x.ellipse(0, 0, hew, heh, 0, 0, Math.PI * 2);
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = "rgba(0,0,0,0.08)";
      x.lineWidth = 1;
      x.stroke();
      x.restore();
    }
  }

  private drawBadge(
    x: CanvasRenderingContext2D,
    badge: Badge,
    R: number,
    cx: number,
    cy: number,
  ) {
    const bs = this.badgeS * (this.isMini ? 1.25 : 1);
    const bx = cx - R * 0.72 * this.sx;
    const by = cy - R * 0.72 * this.sy;
    const t = now();

    x.save();
    x.translate(bx, by);
    x.scale(bs, bs);
    const col = rgba(badge.color);

    if (badge.kind === "dots") {
      if (this.isMini) {
        const phase = (t * 2.4) % 1;
        const dotR = R * 0.22 * (1 + 0.25 * Math.sin(phase * Math.PI * 2));
        x.fillStyle = "#000";
        x.beginPath();
        x.arc(0, 0, R * 0.2, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = col;
        x.beginPath();
        x.arc(0, 0, dotR, 0, Math.PI * 2);
        x.fill();
      } else {
        const pw = R * 0.72;
        const ph = R * 0.36;
        roundRectPath(x, -pw / 2, -ph / 2, pw, ph, ph / 2);
        x.fillStyle = col;
        x.fill();
        for (let i = 0; i < 3; i++) {
          const phase = (((t * 2.4 - i * 0.22) % 1) + 1) % 1;
          const dotR =
            R * 0.055 * (1 + 0.4 * Math.max(0, Math.sin(phase * Math.PI * 2)));
          x.fillStyle = "#fff";
          x.beginPath();
          x.arc((i - 1) * R * 0.18, 0, dotR, 0, Math.PI * 2);
          x.fill();
        }
      }
    } else if (badge.kind === "bang" || badge.kind === "question") {
      x.fillStyle = "#000";
      x.beginPath();
      x.arc(0, 0, R * 0.3, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = col;
      x.beginPath();
      x.arc(0, 0, R * 0.23, 0, Math.PI * 2);
      x.fill();
      if (!this.isMini) {
        x.fillStyle = "#fff";
        x.font = `900 ${R * 0.32}px ${FONT}`;
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText(badge.kind === "bang" ? "!" : "?", 0, R * 0.02);
      }
    } else {
      x.fillStyle = "#000";
      x.beginPath();
      x.arc(0, 0, R * 0.2, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = col;
      x.beginPath();
      x.arc(0, 0, R * 0.135, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
  }

  private drawParticles(
    x: CanvasRenderingContext2D,
    R: number,
    cx: number,
    cy: number,
  ) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.age <= 0) continue;
      const k = p.age / p.life;
      const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      const px = cx + (p.x + p.vx * p.age) * R * 1.3;
      const py = cy + (p.y + p.vy * p.age) * R * 1.3;
      const sz = R * p.size * (1 + k * 0.4);

      x.save();
      x.translate(px, py);
      x.globalAlpha = Math.min(1, Math.max(0, a));
      switch (p.type) {
        case "heart":
          x.rotate(Math.sin(p.age * 6) * 0.3);
          x.fillStyle = "#FF4D6D";
          heartPath(x, sz);
          x.fill();
          break;
        case "love_bubble": {
          x.rotate(Math.sin(p.age * 5) * 0.25);
          // Translucent pastel pink bubble
          x.fillStyle = "rgba(255, 140, 180, 0.42)";
          x.beginPath();
          x.arc(0, 0, sz, 0, Math.PI * 2);
          x.fill();
          x.strokeStyle = "rgba(255, 105, 150, 0.7)";
          x.lineWidth = Math.max(1, sz * 0.15);
          x.stroke();
          // Glossy highlight
          x.fillStyle = "rgba(255, 255, 255, 0.8)";
          x.beginPath();
          x.arc(-sz * 0.35, -sz * 0.35, sz * 0.28, 0, Math.PI * 2);
          x.fill();
          // Mini inner heart
          x.fillStyle = "#FF4D6D";
          heartPath(x, sz * 0.46);
          x.fill();
          break;
        }
        case "star":
          x.rotate(p.rot + p.age * 2);
          x.fillStyle = "#F7B32B";
          starPath(x, sz, sz * 0.45);
          x.fill();
          break;
        case "spark":
          x.rotate(p.rot);
          x.fillStyle = "#fff";
          starPath(x, sz * 0.8, sz * 0.18);
          x.fill();
          break;
        case "sweat":
          x.fillStyle = "#7CC7FF";
          x.beginPath();
          x.moveTo(0, -sz);
          x.quadraticCurveTo(sz * 0.8, sz * 0.2, 0, sz * 0.6);
          x.quadraticCurveTo(-sz * 0.8, sz * 0.2, 0, -sz);
          x.fill();
          break;
        case "z":
          x.fillStyle = "rgb(209,219,235)";
          x.font = `700 ${sz * 1.9}px ${FONT}`;
          x.textAlign = "center";
          x.textBaseline = "middle";
          x.fillText("z", 0, 0);
          break;
      }
      x.restore();
    }
  }
}

/** Ray → rounded-rect boundary intersection, for the mailbox morph. */
function rrPoint(
  ca: number,
  sa: number,
  W: number,
  H: number,
  cr: number,
): { x: number; y: number } {
  const eps = 1e-6;
  const kx = ca >= 0 ? 1 : -1;
  const ky = sa >= 0 ? 1 : -1;
  const cx = kx * (W - cr);
  const cy = ky * (H - cr);

  const dot = ca * cx + sa * cy;
  const disc = dot * dot - (cx * cx + cy * cy - cr * cr);
  if (disc >= 0) {
    const t = dot + Math.sqrt(disc);
    if (t > eps) {
      const px = ca * t;
      const py = sa * t;
      if (Math.abs(px) >= W - cr - eps && Math.abs(py) >= H - cr - eps)
        return { x: px, y: py };
    }
  }
  if (Math.abs(sa) > eps) {
    const t = (ky * H) / sa;
    if (t > eps) {
      const px = ca * t;
      if (Math.abs(px) <= W - cr + eps) return { x: px, y: ky * H };
    }
  }
  if (Math.abs(ca) > eps) {
    const t = (kx * W) / ca;
    if (t > eps) {
      const py = sa * t;
      if (Math.abs(py) <= H - cr + eps) return { x: kx * W, y: py };
    }
  }
  return { x: kx * W, y: ky * H };
}
