// Draws ipin into the PNG/ICO set Tauri needs. No dependencies: the icons are
// rasterised here and encoded with node:zlib, so the app icon stays "drawn in
// code" like the character itself.
//
//   node scripts/gen-icons.mjs

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src-tauri",
  "icons",
);

// ── DapinCi Squishy Slime Mascot Icon Generator (v2.0) ───────────────────────
// Mouthless, Vibrant Energetic Pastel (#4DE3B2 -> #26C291), Translucent Highlight (#A3FFDF),
// Grok-Bot Minimalist Solid Ink Pill Eyes (#000000) with Catchlight Sparkle, Soft Cheek Blush (#FFAEC0).

const SLIME_TOP = [77, 227, 178]; // #4DE3B2 (Energetic Pastel Mint)
const SLIME_BOTTOM = [38, 194, 145]; // #26C291 (Vibrant Mint Teal)
const GLOW_COLOR = [163, 255, 223]; // #A3FFDF (Translucent Jelly Inner Glow)
const SHADOW_COLOR = [10, 50, 35]; // Deep Mint ambient shadow
const BLUSH_COLOR = [255, 174, 192]; // #FFAEC0 (Soft Pink Cheek Blush)
const EYE_DARK = [0, 0, 0]; // Pure Black (#000000) for Grok-Bot minimalist ink eyes
const SPARKLE_COLOR = [255, 255, 255]; // Pure White catchlight
const RIM_COLOR = [12, 42, 32]; // Deep dark mint outline so icon reads crisply on light & dark themes

const SS = 4; // 4x4 supersampling factor for smooth antialiasing

/**
 * Slime dome contour with plump cheeks, matching BotEngine.bodyPath.
 * Evaluates boundary distance R(theta) in polar coordinates from (0, 0).
 */
function slimeBodyRadius(theta, rx, ry) {
  const ca = Math.cos(theta);
  const sa = Math.sin(theta);
  // expN: top dome has expN = 2.0 / 2.4, bottom has 2.0 / 2.6
  const expN = sa < 0 ? 2.0 / 2.4 : 2.0 / 2.6;
  let px0 = rx * (ca >= 0 ? Math.pow(ca, expN) : -Math.pow(-ca, expN));
  let py0 = ry * (sa >= 0 ? Math.pow(sa, expN) : -Math.pow(-sa, expN));
  if (sa > 0) {
    // Plump squishy cheek expansion
    px0 *= 1.0 + 0.05 * Math.sin(sa * Math.PI);
  } else {
    // Soft teardrop lift
    px0 *= 1.0 - 0.03 * Math.pow(-sa, 1.4);
  }
  return Math.hypot(px0, py0);
}

function insidePill(x, y, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(hw, hh);
  const cx = Math.max(-hw + r, Math.min(hw - r, x));
  const cy = Math.max(-hh + r, Math.min(hh - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function renderipin(size) {
  const px = new Uint8Array(size * size * 4);
  const R = size * 0.35;
  const rx = R * 1.14;
  const ry = R * 0.88;
  const cx = size / 2;
  const cy = size / 2 + R * 0.06;
  const rim = Math.max(1.0, R * 0.06);

  // Eye dimensions (matching BotEngine: EYE_W = 0.36, EYE_H = 0.70, EYE_SP = 0.36, EYE_P = 0.03)
  const ew = R * 0.36;
  const eh = R * 0.7;
  const eyeSpacing = rx * 0.36;
  const eyeCy = ry * 0.03;

  // Eye catchlight sparkle
  const sparkleDx = ew * 0.16;
  const sparkleDy = -eh * 0.22;
  const sparkleR = Math.max(0.6, ew * 0.18);

  // Cheek blush dimensions
  const blushDx = rx * 0.55;
  const blushDy = ry * 0.24;
  const blushRw = R * 0.18;
  const blushRh = R * 0.11;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bodyHits = 0;
      let rimHits = 0;
      let eyeHits = 0;
      let sparkleHits = 0;
      let blushAccum = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px0 = x + (sx + 0.5) / SS - cx;
          const py0 = y + (sy + 0.5) / SS - cy;
          const dist = Math.hypot(px0, py0);
          const theta = Math.atan2(py0, px0);
          const rBody = slimeBodyRadius(theta, rx, ry);

          if (dist > rBody + rim) continue;
          rimHits++;

          if (dist <= rBody) {
            bodyHits++;

            // Check blush
            for (const sd of [-1, 1]) {
              const bx = px0 - sd * blushDx;
              const by = py0 - blushDy;
              const bDist = Math.hypot(bx / blushRw, by / blushRh);
              if (bDist < 1.0) {
                blushAccum += Math.cos(bDist * Math.PI * 0.5) * 0.5;
              }
            }

            // Check eyes
            for (const sd of [-1, 1]) {
              const eyeCx = sd * eyeSpacing;
              const ex = px0 - eyeCx;
              const ey = py0 - eyeCy;
              if (insidePill(ex, ey, ew, eh)) {
                eyeHits++;
                // Check catchlight inside the eye
                const sx0 = ex - sparkleDx;
                const sy0 = ey - sparkleDy;
                if (sx0 * sx0 + sy0 * sy0 <= sparkleR * sparkleR) {
                  sparkleHits++;
                }
              }
            }
          }
        }
      }

      if (rimHits === 0) continue;

      const total = SS * SS;
      const rimA = rimHits / total;
      const bodyA = bodyHits / total;
      const eyeA = eyeHits / total;
      const sparkleA = sparkleHits / total;
      const blushA = Math.min(0.65, blushAccum / total);

      // --- Body Material and Lighting ---
      // 1. Base Gradient (top-left -> bottom-right)
      const gradT = Math.min(
        1,
        Math.max(0, ((x - cx) * -0.5 + (y - cy) * 0.85) / (2 * ry) + 0.45),
      );
      let bodyCol = [0, 1, 2].map(
        (i) => SLIME_TOP[i] + (SLIME_BOTTOM[i] - SLIME_TOP[i]) * gradT,
      );

      // 2. Translucent Inner Bounce Glow (lower center)
      const glowDist = Math.hypot(x - cx, y - (cy + ry * 0.35)) / (R * 0.95);
      if (glowDist < 1.0) {
        const glowFactor = (1 - glowDist) * 0.22;
        bodyCol = bodyCol.map(
          (c, i) => c * (1 - glowFactor) + GLOW_COLOR[i] * glowFactor,
        );
      }

      // 3. Ambient Base Shadow (bottom edge)
      if (y > cy) {
        const shDist = Math.hypot(x - cx, y - (cy + ry * 0.2)) / (R * 1.3);
        const shFactor = Math.min(0.24, Math.max(0, (shDist - 0.4) * 0.4));
        bodyCol = bodyCol.map(
          (c, i) => c * (1 - shFactor) + SHADOW_COLOR[i] * shFactor,
        );
      }

      // 4. Glossy Dome Highlight (top-left specular)
      const hlDist =
        Math.hypot(x - (cx + rx * 0.26), y - (cy - ry * 0.46)) / (R * 0.45);
      if (hlDist < 1.0) {
        const hlFactor = Math.pow(1 - hlDist, 1.8) * 0.42;
        bodyCol = bodyCol.map((c) => Math.min(255, c + (255 - c) * hlFactor));
      }

      // 5. Cheek Blush
      if (blushA > 0) {
        bodyCol = bodyCol.map(
          (c, i) => c * (1 - blushA) + BLUSH_COLOR[i] * blushA,
        );
      }

      // --- Layer Compositing: Rim -> Body -> Eyes -> Sparkle ---
      let col = RIM_COLOR.slice();
      let alpha = rimA;

      if (bodyA > 0) {
        const bodyFrac = bodyA / rimA;
        col = col.map((c, i) => c * (1 - bodyFrac) + bodyCol[i] * bodyFrac);
      }

      if (eyeA > 0) {
        col = col.map((c, i) => c * (1 - eyeA) + EYE_DARK[i] * eyeA);
      }

      if (sparkleA > 0) {
        col = col.map(
          (c, i) => c * (1 - sparkleA) + SPARKLE_COLOR[i] * sparkleA,
        );
      }

      const o = (y * size + x) * 4;
      px[o] = Math.round(col[0]);
      px[o + 1] = Math.round(col[1]);
      px[o + 2] = Math.round(col[2]);
      px[o + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  return px;
}

// ── PNG ───────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO (PNG-in-ICO, Vista and later) ─────────────────────────────────────────

function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size;
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

// ── Go ────────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true });

const png = (size) => encodePNG(size, renderipin(size));

const files = {
  "32x32.png": png(32),
  "128x128.png": png(128),
  "128x128@2x.png": png(256),
  "icon.png": png(512),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  console.log(`${name} — ${data.length} bytes`);
}

const ico = encodeICO(
  [16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png(size) })),
);
writeFileSync(join(OUT, "icon.ico"), ico);
console.log(`icon.ico — ${ico.length} bytes`);
