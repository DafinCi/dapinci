// DapinCi Squishy Slime Accessories (100% Original, Slime-Native Procedural Canvas 2D)
// Completely replaces legacy costumes with 8 brand-new, copyright-clean,
// playful accessories tailored for a squishy mouthless slime companion.

import { Ease } from "../core/anim";
import type { Outfit, OutfitSelection } from "./wardrobe";
import { SCRIPT_FONTS } from "../core/fonts";

const VIEW_TILT = -0.3;
const ACC_PITCH = 0.4;
const EYE_W = 0.36;
const EYE_H = 0.70;
const EYE_SP = 0.36;

type Ctx = CanvasRenderingContext2D;
type Vec3 = readonly [number, number, number];
interface P3 { x: number; y: number; z: number }

export interface Head {
  R: number;
  rx: number;
  ry: number;
  yaw: number;
  pitch: number;
  physDx: number;
  physDy: number;
}

export function makeHead(R: number, yaw = 0, pitch = 0, physDx = 0, physDy = 0): Head {
  return { R, rx: R * 1.14, ry: R * 0.88, yaw, pitch, physDx, physDy };
}

export interface OutfitState {
  presence: number;
  morph: number;
}

// ── 3D Projection Helpers ─────────────────────────────────────────────────────

function proj(H: Head, p: Vec3): P3 {
  const [x, y, z] = p;
  const cy = Math.cos(H.yaw);
  const sy = Math.sin(H.yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const pitch = VIEW_TILT + H.pitch * ACC_PITCH;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y * cp + z1 * sp;
  const z2 = -y * sp + z1 * cp;
  return { x: x1 * H.rx, y: -y2 * H.ry, z: z2 };
}

// ── Drawing Helpers ───────────────────────────────────────────────────────────

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function rad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(0.001, r1));
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function pompom(ctx: Ctx, x: number, y: number, r: number, base = "#FFFFFF", shade = "#D5D9E2") {
  ctx.save();
  ctx.translate(x, y);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const br = r * (0.35 + 0.05 * Math.sin(i * 2.3));
    const bx = Math.cos(a) * r * 0.75;
    const by = Math.sin(a) * r * 0.75;
    ctx.fillStyle = rad(ctx, bx - br * 0.4, by - br * 0.5, 0, br * 1.3, [[0, base], [1, shade]]);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rad(ctx, -r * 0.3, -r * 0.35, 0, r * 1.05, [[0, base], [0.7, base], [1, shade]]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function starPath(ctx: Ctx, cx: number, cy: number, ro: number, ri: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Smooth squishy slime body outline. */
export function bodyOutline(rx: number, ry: number): Path2D {
  const p = new Path2D();
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const expN = sa < 0 ? 2.0 / 2.4 : 2.0 / 2.6;
    let x = rx * (ca >= 0 ? Math.pow(ca, expN) : -Math.pow(-ca, expN));
    let y = ry * (sa >= 0 ? Math.pow(sa, expN) : -Math.pow(-sa, expN));
    if (sa > 0) {
      x *= 1.0 + 0.05 * Math.sin(sa * Math.PI);
    } else {
      x *= 1.0 - 0.03 * Math.pow(-sa, 1.4);
    }
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

export const PUMPKIN_BODY: readonly [string, string] = ["#4DE3B2", "#26C291"];

// ── 8 Original Slime-Native Accessories ───────────────────────────────────────

/** 1. Sprout — fresh blooming seedling with 2 wobbly leaves. */
function drawSprout(ctx: Ctx, H: Head) {
  const R = H.R;
  const root = proj(H, [0, 0.98, 0]);
  const sway = H.physDx * R * 0.35 + Math.sin(H.yaw) * R * 0.15;
  const tipX = root.x + sway;
  const tipY = root.y - R * 0.42;

  ctx.save();
  // Stem
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.quadraticCurveTo(root.x + sway * 0.4, root.y - R * 0.22, tipX, tipY);
  ctx.strokeStyle = "#38A126";
  ctx.lineWidth = Math.max(1.8, R * 0.08);
  ctx.lineCap = "round";
  ctx.stroke();

  // Left leaf
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(-0.65 + sway * 0.02);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-R * 0.15, -R * 0.25, -R * 0.35, -R * 0.12, 0, -R * 0.35);
  ctx.bezierCurveTo(R * 0.15, -R * 0.25, R * 0.05, -R * 0.1, 0, 0);
  ctx.fillStyle = lin(ctx, 0, 0, 0, -R * 0.35, [[0, "#74E255"], [1, "#40BC28"]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,80,15,0.3)";
  ctx.lineWidth = Math.max(0.8, R * 0.03);
  ctx.stroke();
  ctx.restore();

  // Right leaf
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(0.55 + sway * 0.02);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(R * 0.12, -R * 0.22, R * 0.32, -R * 0.1, 0, -R * 0.3);
  ctx.bezierCurveTo(-R * 0.12, -R * 0.22, -R * 0.05, -R * 0.1, 0, 0);
  ctx.fillStyle = lin(ctx, 0, 0, 0, -R * 0.3, [[0, "#8AE86B"], [1, "#4EC832"]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,80,15,0.3)";
  ctx.lineWidth = Math.max(0.8, R * 0.03);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/** 2. Propeller — retro propeller cap with spinning pastel blades. */
function drawPropeller(ctx: Ctx, H: Head) {
  const R = H.R;
  const root = proj(H, [0, 0.96, 0]);
  const capW = R * 0.55;
  const capH = R * 0.22;
  const shaftH = R * 0.22;

  ctx.save();
  // Cap dome
  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.beginPath();
  ctx.ellipse(0, 0, capW / 2, capH / 2, 0, Math.PI, 0);
  ctx.fillStyle = lin(ctx, -capW / 2, 0, capW / 2, 0, [
    [0, "#FFD166"],
    [0.5, "#F4A261"],
    [1, "#E76F51"],
  ]);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Shaft
  const shaftX = root.x;
  const shaftY = root.y - capH * 0.45;
  const topY = shaftY - shaftH;
  ctx.beginPath();
  ctx.moveTo(shaftX, shaftY);
  ctx.lineTo(shaftX, topY);
  ctx.strokeStyle = "#495057";
  ctx.lineWidth = Math.max(1.8, R * 0.07);
  ctx.lineCap = "round";
  ctx.stroke();

  // Spinning blades
  const angle = (performance.now() / 90) % (Math.PI * 2);
  const span = R * 0.62;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  ctx.save();
  ctx.translate(shaftX, topY);
  ctx.beginPath();
  ctx.ellipse(cosA * span * 0.45, sinA * span * 0.2, span * 0.45, R * 0.09, angle, 0, Math.PI * 2);
  ctx.fillStyle = "#4CC9F0";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-cosA * span * 0.45, -sinA * span * 0.2, span * 0.45, R * 0.09, angle, 0, Math.PI * 2);
  ctx.fillStyle = "#4361EE";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Center bead
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, R * 0.09), 0, Math.PI * 2);
  ctx.fillStyle = "#EF476F";
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/** 3. Dev Headset — floating developer headset with neon mint mic boom. */
function drawHeadset(ctx: Ctx, H: Head) {
  const R = H.R;
  const leftAnchor = proj(H, [-0.94, 0.15, 0]);
  const rightAnchor = proj(H, [0.94, 0.15, 0]);
  const apex = proj(H, [0, 1.05, 0]);

  ctx.save();
  // Headband
  ctx.beginPath();
  ctx.moveTo(leftAnchor.x, leftAnchor.y);
  ctx.quadraticCurveTo(apex.x, apex.y - R * 0.35, rightAnchor.x, rightAnchor.y);
  ctx.strokeStyle = "#2B2D42";
  ctx.lineWidth = Math.max(2.5, R * 0.12);
  ctx.lineCap = "round";
  ctx.stroke();

  // Mint accent strip
  ctx.beginPath();
  ctx.moveTo(leftAnchor.x, leftAnchor.y);
  ctx.quadraticCurveTo(apex.x, apex.y - R * 0.35, rightAnchor.x, rightAnchor.y);
  ctx.strokeStyle = "#4DE3B2";
  ctx.lineWidth = Math.max(1, R * 0.04);
  ctx.stroke();

  // Ear pads
  const padW = R * 0.22;
  const padH = R * 0.38;
  for (const anchor of [leftAnchor, rightAnchor]) {
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.beginPath();
    roundRect(ctx, -padW / 2, -padH / 2, padW, padH, padW / 2);
    ctx.fillStyle = lin(ctx, 0, -padH / 2, 0, padH / 2, [[0, "#3D405B"], [1, "#1E1F2B"]]);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Mic boom on right side
  const micTipX = rightAnchor.x - R * 0.42;
  const micTipY = rightAnchor.y + R * 0.26;
  ctx.beginPath();
  ctx.moveTo(rightAnchor.x, rightAnchor.y + R * 0.06);
  ctx.quadraticCurveTo(rightAnchor.x - R * 0.18, rightAnchor.y + R * 0.32, micTipX, micTipY);
  ctx.strokeStyle = "#2B2D42";
  ctx.lineWidth = Math.max(1.5, R * 0.06);
  ctx.lineCap = "round";
  ctx.stroke();

  // Glowing LED tip
  ctx.beginPath();
  ctx.arc(micTipX, micTipY, Math.max(1.8, R * 0.07), 0, Math.PI * 2);
  ctx.fillStyle = "#4DE3B2";
  ctx.fill();
  ctx.restore();
}

/** 4. Fried Egg — delicious squishy sunny-side up egg on the head. */
function drawFriedEgg(ctx: Ctx, H: Head) {
  const R = H.R;
  const root = proj(H, [0, 0.94, 0]);
  const swayY = H.physDy * R * 0.12;
  const swayX = H.physDx * R * 0.12;

  ctx.save();
  ctx.translate(root.x, root.y);

  // Egg white organic lobes
  const ew = R * 0.7;
  const eh = R * 0.4;
  ctx.beginPath();
  ctx.moveTo(-ew * 0.8, -eh * 0.2);
  ctx.bezierCurveTo(-ew * 1.1, -eh * 0.8, -ew * 0.3, -eh * 1.2, ew * 0.1, -eh * 0.9);
  ctx.bezierCurveTo(ew * 0.7, -eh * 1.1, ew * 1.15, -eh * 0.4, ew * 0.9, eh * 0.2);
  ctx.bezierCurveTo(ew * 0.95, eh * 0.9, ew * 0.2, eh * 1.15, -ew * 0.2, eh * 0.8);
  ctx.bezierCurveTo(-ew * 0.8, eh * 1.1, -ew * 1.05, eh * 0.4, -ew * 0.8, -eh * 0.2);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, -eh, 0, eh, [[0, "#FFFFFF"], [1, "#EEF0F5"]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glossy yolk
  const yr = R * 0.21;
  const yx = ew * 0.12 + swayX;
  const yy = -eh * 0.1 + swayY;
  ctx.beginPath();
  ctx.arc(yx, yy, yr, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, yx - yr * 0.3, yy - yr * 0.4, 0, yr * 1.2, [
    [0, "#FFE066"],
    [0.6, "#FAB005"],
    [1, "#F76707"],
  ]);
  ctx.fill();

  // Specular highlight
  ctx.beginPath();
  ctx.arc(yx - yr * 0.32, yy - yr * 0.35, yr * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  ctx.restore();
}

/** 5. Boba Straw — pastel pink striped straw with cute dark tapioca pearls. */
function drawBoba(ctx: Ctx, H: Head) {
  const R = H.R;
  const root = proj(H, [0.18, 0.94, 0]);
  const strawW = R * 0.15;
  const strawLen = R * 0.58;

  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.rotate(0.32);

  // Straw body
  ctx.beginPath();
  ctx.rect(-strawW / 2, -strawLen, strawW, strawLen);
  ctx.fillStyle = lin(ctx, -strawW / 2, 0, strawW / 2, 0, [
    [0, "#FF85A1"],
    [0.5, "#FFAEC0"],
    [1, "#FF6384"],
  ]);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Top bevel ellipse
  ctx.beginPath();
  ctx.ellipse(0, -strawLen, strawW / 2, strawW * 0.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#880E4F";
  ctx.fill();

  // Inside floating pearl
  ctx.beginPath();
  ctx.arc(0, -strawLen * 0.45, strawW * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "#1E1A17";
  ctx.fill();
  ctx.restore();

  // Pearl on the crown
  const p1 = proj(H, [-0.15, 0.92, 0]);
  ctx.beginPath();
  ctx.arc(p1.x, p1.y, Math.max(1.5, R * 0.08), 0, Math.PI * 2);
  ctx.fillStyle = "#2B2119";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p1.x - R * 0.02, p1.y - R * 0.02, R * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fill();
}

/** 6. Cloud Puff — fluffy hovering cloud with tiny lightning spark. */
function drawCloud(ctx: Ctx, H: Head) {
  const R = H.R;
  const root = proj(H, [0, 1.06, 0]);
  const bob = Math.sin(performance.now() / 450) * R * 0.06;

  ctx.save();
  ctx.translate(root.x, root.y - R * 0.28 + bob);

  // Fluffy cloud lobes
  ctx.beginPath();
  ctx.arc(-R * 0.28, 0, R * 0.2, 0, Math.PI * 2);
  ctx.arc(-R * 0.1, -R * 0.16, R * 0.25, 0, Math.PI * 2);
  ctx.arc(R * 0.16, -R * 0.13, R * 0.23, 0, Math.PI * 2);
  ctx.arc(R * 0.3, 0, R * 0.18, 0, Math.PI * 2);
  ctx.arc(0, R * 0.04, R * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, 0, -R * 0.4, 0, R * 0.2, [[0, "#FFFFFF"], [1, "#DCE4F7"]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(100,140,200,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tiny golden spark star
  const sx = R * 0.34;
  const sy = R * 0.15;
  ctx.fillStyle = "#FBBF24";
  starPath(ctx, sx, sy, R * 0.09, R * 0.035);
  ctx.fill();

  ctx.restore();
}

/** 7. Origami Boat — folded paper boat hat perched jauntily. */
function drawOrigami(ctx: Ctx, H: Head) {
  const R = H.R;
  const root = proj(H, [0, 0.96, 0]);

  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.rotate(-0.1);

  const bw = R * 0.82;
  const bh = R * 0.46;

  // Center sail triangle
  ctx.beginPath();
  ctx.moveTo(0, -bh);
  ctx.lineTo(-bw * 0.38, -bh * 0.15);
  ctx.lineTo(bw * 0.38, -bh * 0.15);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, -bh, 0, 0, [[0, "#FFFFFF"], [1, "#E2E8F0"]]);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Left hull flap
  ctx.beginPath();
  ctx.moveTo(-bw / 2, 0);
  ctx.lineTo(-bw * 0.38, -bh * 0.2);
  ctx.lineTo(0, 0);
  ctx.lineTo(-bw * 0.32, bh * 0.15);
  ctx.closePath();
  ctx.fillStyle = "#F1F5F9";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right hull flap
  ctx.beginPath();
  ctx.moveTo(bw / 2, 0);
  ctx.lineTo(bw * 0.38, -bh * 0.2);
  ctx.lineTo(0, 0);
  ctx.lineTo(bw * 0.32, bh * 0.15);
  ctx.closePath();
  ctx.fillStyle = "#E2E8F0";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

/** 8. Nightcap — cozy lavender striped sleep cap with dangling pompom. */
function drawNightcap(ctx: Ctx, H: Head) {
  const R = H.R;
  const root = proj(H, [0, 0.94, 0]);
  const sway = H.physDx * R * 0.38;

  ctx.save();
  ctx.translate(root.x, root.y);

  const nw = R * 0.65;
  const nh = R * 0.38;

  // Slumping cone
  ctx.beginPath();
  ctx.moveTo(-nw / 2, 0);
  ctx.quadraticCurveTo(-nw * 0.2, -nh * 1.5, nw * 0.6 + sway, -nh * 0.6);
  ctx.quadraticCurveTo(nw * 0.3, -nh * 0.2, nw / 2, 0);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, -nw / 2, 0, nw / 2, 0, [
    [0, "#818CF8"],
    [0.5, "#A5B4FC"],
    [1, "#6366F1"],
  ]);
  ctx.fill();

  // White fluffy cuff band
  ctx.beginPath();
  roundRect(ctx, -nw * 0.55, -nh * 0.2, nw * 1.1, nh * 0.3, nh * 0.15);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Dangling pompom
  pompom(ctx, nw * 0.6 + sway, -nh * 0.6, Math.max(3, R * 0.14));

  ctx.restore();
}

// ── Master Draw Functions ─────────────────────────────────────────────────────

function layerAlpha(st: OutfitState): number {
  const morphFade = 1 - Math.min(1, Math.max(0, (st.morph - 0.3) / 0.2));
  return morphFade * Math.min(1, st.presence * 2.5);
}

export function drawOutfitBehind(_ctx: Ctx, outfit: Outfit, _H: Head, st: OutfitState) {
  if (outfit === "none") return;
  const alpha = layerAlpha(st);
  if (alpha <= 0.005) return;
}

export function drawOutfitFront(ctx: Ctx, outfit: Outfit, H: Head, st: OutfitState) {
  if (outfit === "none") return;
  const alpha = layerAlpha(st);
  if (alpha <= 0.005) return;

  const posP = Ease.back(st.presence);
  ctx.save();
  ctx.globalAlpha *= alpha;
  // Gentle settle down onto head
  ctx.translate(0, -(1 - posP) * H.ry * 0.5);

  switch (outfit) {
    case "sprout":
      drawSprout(ctx, H);
      break;
    case "propeller":
      drawPropeller(ctx, H);
      break;
    case "headset":
      drawHeadset(ctx, H);
      break;
    case "friedEgg":
      drawFriedEgg(ctx, H);
      break;
    case "boba":
      drawBoba(ctx, H);
      break;
    case "cloud":
      drawCloud(ctx, H);
      break;
    case "origami":
      drawOrigami(ctx, H);
      break;
    case "nightcap":
      drawNightcap(ctx, H);
      break;
  }
  ctx.restore();
}

// ── Wardrobe Thumbnail Icons (New Slime Engine) ───────────────────────────────

/** Draw a miniature DapinCi pastel mint slime wearing the outfit in size×size. */
function iconIpin(ctx: Ctx, size: number, outfit: Outfit) {
  const R = 11;
  const H = makeHead(R);
  const cx = size / 2;
  const cy = size / 2 + R * 0.55;
  const st: OutfitState = { presence: 1, morph: 0 };

  ctx.save();
  ctx.translate(cx, cy);

  // 1. Energetic Pastel Slime Body
  const body = bodyOutline(H.rx, H.ry);
  const g = lin(ctx, H.rx * 0.7, -H.ry * 0.85, -H.rx * 0.8, H.ry * 0.9, [
    [0, "#4DE3B2"], // Energetic Pastel Mint
    [1, "#26C291"], // Vibrant Mint Teal
  ]);
  ctx.fillStyle = g;
  ctx.fill(body);

  // Translucent highlight bounce glow
  ctx.fillStyle = rad(ctx, -H.rx * 0.25, -H.ry * 0.4, 0, H.R * 1.1, [
    [0, "rgba(163, 255, 223, 0.45)"],
    [0.7, "rgba(163, 255, 223, 0.1)"],
    [1, "rgba(0, 0, 0, 0)"],
  ]);
  ctx.fill(body);

  // 2. Grok-Bot Matte Black Ink Pill Eyes (No monkey mask, 100% mouthless!)
  ctx.fillStyle = "#000000";
  const eyeW = R * EYE_W * 0.95;
  const eyeH = R * EYE_H * 1.1;
  const eyeSep = R * EYE_SP;
  for (const sd of [-1, 1]) {
    const ex = sd * eyeSep;
    const ey = -R * 0.05;
    ctx.save();
    ctx.translate(ex, ey);
    roundRect(ctx, -eyeW / 2, -eyeH / 2, eyeW, eyeH, eyeW / 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Draw the Outfit on top
  drawOutfitFront(ctx, outfit, H, st);

  ctx.restore();
}

/**
 * Renders one wardrobe button thumbnail. "auto" displays the current season's
 * outfit with an AUTO tag, "none" displays a crossed-out circle.
 */
export function drawWardrobeIcon(
  ctx: Ctx,
  size: number,
  selection: OutfitSelection,
  seasonal: Outfit,
  autoLabel: string,
) {
  ctx.clearRect(0, 0, size, size);
  if (selection === "none") {
    const r = size * 0.26;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = "#4D5360";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.moveTo(-r * 0.65, r * 0.65);
    ctx.lineTo(r * 0.65, -r * 0.65);
    ctx.stroke();
    ctx.restore();
    return;
  }

  iconIpin(ctx, size, selection === "auto" ? seasonal : selection);

  if (selection !== "auto") return;
  const bw = 16;
  const bh = 7;
  const by = size - bh / 2 - 2;
  ctx.save();
  ctx.translate(size / 2, by);
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = "#26C291"; // Brand vibrant teal
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  let fontPx = 4.5;
  ctx.font = `700 ${fontPx}px system-ui, "Segoe UI", ${SCRIPT_FONTS}, sans-serif`;
  while (ctx.measureText(autoLabel).width > bw - 2 && fontPx > 2.8) {
    fontPx -= 0.2;
    ctx.font = `700 ${fontPx}px system-ui, "Segoe UI", ${SCRIPT_FONTS}, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(autoLabel, 0, 0.2);
  ctx.restore();
}
