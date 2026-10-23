# DapinCi Mascot Design & Animation Specification

**Version:** 2.0 (Windows-Focused Architecture)\
**Status:** Approved design & architecture specification — DapinCi Squishy Slime (Mouthless, Vibrant Energetic Pastel, Grok-Bot Solid Ink Eyes with Conditional Sparkle, Petting Hand Cursor & Hover Physics, Gelatin Osmosis File Absorption)\
**Date:** 12 October 2026\
**Scope:** Character identity, anatomy, palette, expressions, motion vocabulary, FSM integration, LOD scaling, custom cursors, and Windows interactive behaviors.

---

## 1. Purpose

This document establishes the official mascot design, anatomy, and animation specifications for **DapinCi** (mascot identity: **Squishy Slime**). It serves as the definitive reference for the procedural Canvas 2D implementation on Windows (`windows/src/`), replacing legacy designs with a 100% original, copyright-clean, playful character identity.

The mascot establishes DapinCi as a living, personable desktop companion rather than a sterile chatbot interface. Its personality expresses cleverness, approachability, and tactile playfulness through tight timing, expressive geometry, and organic jelly physics that delight the user without distracting from deep work.

### Core Principles

- **Companion-first & immediately recognizable:** Clean, iconic squishy droplet/dome silhouette with plump cheeks, recognizable even at tiny icon sizes.
- **Strictly Mouthless:** Clean, minimalist face with zero mouth line, zero nostrils, and zero facial seams.
- **Playful, Tactile, and Reactive:** Organically deforms and wobbles like elastic gelatin; reacts delightfully to cursor hover and petting.
- **Custom Interactive Cursors (Windows):** Hovering over the companion dynamically switches the OS pointer to a playful cartoon open petting hand (`PET_CURSOR`), and pressing/dragging switches to a grasping/squeezing hand (`SQUEEZE_CURSOR`).
- **Gelatin Osmosis File Absorption:** Replaces mechanical mouth holes with fluid gelatin surface absorption and ripples when dragging files onto the companion.
- **Procedural Canvas 2D rendering:** Rendered mathematically in real-time — crisp at all display scaling factors (100%–250%), tiny binary footprint, zero external GIF/video assets.
- **Tight FSM alignment:** Directly wired into DapinCi's actual agent lifecycle (thinking, tool execution, user approvals, question prompts, music playback, and file drops).
- **Zero idle CPU waste:** Automatically pauses or throttles animation loops when the companion is collapsed, hidden, or minimized.

---

## 2. Character Identity

### 2.1. Core Concept

A **playful, ultra-elastic AI Slime companion**, designed as a **head-only, mouthless mascot**.

The character combines modern designer vinyl toys and tactile gelatin physics with a friendly developer aesthetic. It features a bouncy dome crown, plump cheeks, vibrant energetic pastel gradients with translucent inner glow, and Grok-Bot style minimalist ink eyes.

### 2.2. Personality

- **Curious & observant:** Always exploring; large ink eyes track cursor movements and terminal events intelligently.
- **Approachable & squishy:** Soft elastic squash-and-stretch on interactions and landings ($s_x \cdot s_y \approx 1$).
- **Delighted by attention:** Blushes softly and squints into happy arcs (`^ ^`) when the user pets its head with the cursor.
- **Reliable developer companion:** Builds alongside the user; drops playful antics to display alert focus when an approval or question prompt is active.
- **Calm work companion:** Never chatters visually while the user is typing or concentrating.

### 2.3. Silhouette & Form

- **Single Squishy Body:** Smooth, plump squishy dome with organic cheek expansion and gently flattened base.
- **Strictly Mouthless:** Absolutely no nostrils, mouth lines, mouth holes, or facial cuts.
- **Grok-Bot Ink Eyes:** Pure solid black (`#000000`) capsule eyes with clean comic-strip legibility.
- **Conditional Sparkle:** Eyes remain solid matte black by default, gaining delicate micro-sparkle highlights only on special states (approval/question puppy eyes).

### 2.4. Exclusions & Guardrails

- No ears, limbs, snout, nostrils, mouth lines, or mouth holes.
- No permanent accessories hardcoded into the base mesh (wardrobe items remain modular overlays).

---

## 3. Color and Material

### 3.1. Official Slime Palette (v2.0)

| Token | Hex | RGB (Normalized 0..1) | Intended Use |
| :--- | :--- | :--- | :--- |
| **Pastel Mint Top (Default)** | `#4DE3B2` | `(0.302, 0.890, 0.698)` | Main upper body dome |
| **Vibrant Mint Teal Bottom** | `#26C291` | `(0.149, 0.761, 0.569)` | Base shadow & volume gradient |
| **Translucent Gloss Highlight** | `#A3FFDF` | `(0.639, 1.000, 0.875)` | Translucent jelly dome bounce glow |
| **Pure Black Ink / Eyes** | `#000000` | `(0.000, 0.000, 0.000)` | Minimalist Grok-Bot ink eyes |
| **Cheek Blush** | `#FFAEC0` | `(1.000, 0.682, 0.753)` | Interactive petting blush |
| **Gold Accent** | `#F7C948` | `(0.969, 0.788, 0.282)` | Wardrobe Sunglasses frames |
| **AI Glow / Violet** | `#5C4ADE` | `(0.361, 0.290, 0.871)` | AI mode glow, Crown, and highlights |

---

## 4. Simplified Character Anatomy

```
                   ┌──────────────────────────────┐
                   │    ENERGETIC PASTEL BODY     │
                   │  Bouncy dome & plump cheeks  │
         ┌─────────┴──────────────────────────────┴─────────┐
         │             SOLID INK EYE REGION                 │
         │  ┌──────────────────────┬──────────────────────┐ │
         │  │   LEFT EYE REGION    │   RIGHT EYE REGION   │ │
         │  │   Tall Pill Eye      │   Tall Pill Eye      │ │
         │  │   0.36R × 0.70R      │   0.36R × 0.70R      │ │
         │  │   Solid Black #000   │   Solid Black #000   │ │
         │  │   *Sparkle on req*   │   *Sparkle on req*   │ │
         │  └──────────────────────┴──────────────────────┘ │
         │              (NO NOSE / NO NOSTRILS)             │
         │                                                  │
         │             (100% MOUTHLESS SLIME)               │
         │       Smooth, organic tactile jelly face         │
         └──────────────────────────────────────────────────┘
```

---

## 5. Interactive Petting Cursors & Hover Physics (Windows)

### 5.1. Custom Cursors

Rendered as crisp SVG data URIs (`windows/src/mochi/cursor.ts`):
- **Hover (`PET_CURSOR_CSS`):** Gentle open cartoon glove cupped downwards over the companion.
- **Press / Drag (`SQUEEZE_CURSOR_CSS`):** Fingers curled inwards pinching and squeezing the squishy body.

### 5.2. Reactive Petting Physics & Love Bubbles

1. **Magnetic Lean-in:** Top dome leans slightly towards cursor coordinates (`hoverIndent`).
2. **Petting Delight & Mini Love Bubbles:** Moving mouse back and forth across the head ramps up `blush`, triggers content squint eyes (`happy`), and emits gentle translucent pastel pink love bubbles with specular gloss and micro-heart centers (`love_bubble` particles).
3. **Poke Reaction:** Single click triggers rapid elastic squash ($s_x = 1.25, s_y = 0.75$) with damped harmonic oscillation.
4. **Comfortable Hit Targets:** Notch hit testing (`isBotHit`) guarantees at least a 44px diameter target (`Math.max(22, botSize / 2 + 10)`) preventing missed interactions.

### 5.3. Idle Micro-Jiggle

- Periodically (every 7–14 seconds) while idle, the companion performs an organic, damped jelly micro-wobble ($s_y: 1.06 \to 0.94 \to 1.03 \to 1.0$; $s_x: 0.94 \to 1.06 \to 0.97 \to 1.0$) preserving volume ($s_x \cdot s_y \approx 1$) to feel alive and organic with zero background CPU overhead.

---

## 6. Gelatin Osmosis File Absorption

When files are dragged over the companion ([`upload/canvas.ts`](file:///c:/projects/dapinci/windows/src/upload/canvas.ts)):
1. **Entry:** Slime tracks the cursor with eager eyes; body stretches subtly upwards.
2. **Absorption:** The file passes smoothly into the slime's top dome surface, triggering an expanding gelatin ripple wave.
3. **Completion:** Body snaps back with deep squishy oscillation and happy arc eyes (`^ ^`).

---

## 7. State Mapping Matrix

| DapinCi State | Mascot Expression | Eyes | Micro-Motion | Sound FX Trigger |
| :--- | :--- | :--- | :--- | :--- |
| `idle` | **Idle** | Relaxed pill eyes (flat ink) | Gentle jelly float, occasional blink | — |
| `working` | **Focused** | Sharp pill eyes | Steady subtle bounce | `work.wav` |
| `thinking` | **Thinking** | Gaze shifted up/side | Gentle head tilt, low sway | `think.wav` |
| `approval` | **Approval Required** | Wide eyes + **puppy sparkle** | Alert bounce, holds pose, bang badge (`!`) | `approval.wav` |
| `question` | **Question Prompt** | Inquisitive eyes + **sparkle** | Head tilt (`+8°`), question badge (`?`) | `question.wav` |
| `finished` | **Success** | Happy upward arcs (`^ ^`) | Joyful 360° roll hop, sparkles | `finish.wav` |
| `error` | **Error** | Flat narrow eyes (`- -`) | Sudden freeze, vibration, sweat drop | `error.wav` |
| `sleeping` | **Resting** | Closed downward arcs | Slow deep breathing stretch, Zzz | `sleep.wav` |
| `dizzy` | **Dizzy** | Spinning spiral eyes | Head wobble roll, dizzy stars | `dizzy.wav` |

---

## 8. Wardrobe & Accessories System (Slime-Native & Copyright-Clean)

### 8.1. Architecture & Design Principles

The wardrobe system (`windows/src/mochi/wardrobe.ts`, `outfits.ts`, `views/wardrobe.ts`) is designed from the ground up for the mouthless squishy slime mascot:
- **100% Original & Copyright-Clean:** All legacy costumes (monkey ears, witch hats, pumpkins, Santa hats) are completely replaced with original procedural items tailored to the slime dome silhouette.
- **Pure Canvas 2D Procedural Math:** Zero image assets, SVGs, or external textures. Every item is rendered mathematically via paths, arcs, and gradients.
- **Inertial Spring Physics Anchoring:** Accessories anchor to head superellipsoid projection coordinates (`proj(H, [x, y, z])`), dynamically swaying and bobbing in response to slime head movement, squashing, and momentum (`physDx`, `physDy`).
- **Offscreen Canvas Thumbnail Caching:** Grid previews are rendered once at boot into offscreen canvases (`HTMLCanvasElement`) and cached in an LRU/Map, resulting in **0ms idle overhead** and silky smooth 60fps palette interaction.
- **Fixed 10-Item Flat Grid (Option A):** A 5-column × 2-row layout without nested tabs or horizontal sliders, providing instantaneous one-click equipping.
- **Full Localization (i18n):** All 8 items and selections are fully translated across all 10 supported interface languages.

### 8.2. Catalog of 8 Slime-Native Accessories

| Key | Name | Visual Description | Reactive Motion / Detail | Seasonal Auto-Equip Window |
| :--- | :--- | :--- | :--- | :--- |
| `sprout` | **Blooming Sprout** | Fresh green seedling sprouting from crown with 2 wobbly leaves | Swayed organically by velocity (`physDx`) | Easter / Spring |
| `propeller`| **Propeller Cap** | Pastel retro cap with spinning dual-blade rotor | Rotor spins continuously with slime bounce | New Year (Dec 31 – Jan 2) |
| `headset` | **Developer Headset**| Modern headband with floating ear pads and neon mint LED mic boom | Pulses soft mint glow during active state | Permanent Selection |
| `friedEgg` | **Fried Egg** | Organic wavy white with bouncy sunny-side-up yolk & specular gloss | Yolk squashes subtly with head landings | Permanent Selection |
| `boba` | **Boba Straw** | Diagonal striped straw piercing dome with dark chewy tapioca pearls | Boba pearls float inside translucent base | Summer (Jun 21 – Aug 31) |
| `cloud` | **Cloud Puff** | Fluffy hovering marshmallow cloud with golden spark star | Hovers gently above crown with micro-bob | Autumn / Halloween (Oct 1 – Nov 1) |
| `origami` | **Origami Boat** | Geometric folded paper boat hat with shaded polygonal facets | Tilts crisply along head inclination | Permanent Selection |
| `nightcap` | **Cozy Nightcap** | Lavender striped sleeping nightcap with drooping dangling pompom | Pompom bounces and swings with inertia | Winter Holiday (Dec 1 – Dec 26) |

### 8.3. UI / UX Specifications (`views/wardrobe.ts` & `style.css`)

1. **Layout & Dimensions:**
   - Grid: `display: grid; grid-template-columns: repeat(5, 42px); gap: 6px;`
   - Buttons: `42px × 42px`, `border-radius: 10px`, translucent glass backing (`rgba(255, 255, 255, 0.05)`).
   - High-DPI Icons: Rendered at 34×34px (`devicePixelRatio` aware) into 30×30px CSS display space for tack-sharp lines on 4K/retina displays.
2. **Interactive States & Accessibility (WCAG 2.2 Compliant):**
   - **Debounced Hover Preview (60ms):** Prevents visual strobing / flickering when the mouse moves quickly across adjacent buttons.
   - **Keyboard Navigation & Sync:** Full 5×2 Arrow key navigation (Right/Left wraps, Down/Up jumps ±5 rows). Event `focus` and `blur` synchronize the preview on the mascot in real-time.
   - **High-Contrast Focus Rings (`:focus-visible`):** 2px solid `#4de3b2` outline with 2px offset and soft mint glow.
   - **WCAG 1.4.11 Non-Text Contrast Compliance:** Idle border opacity upgraded to `rgba(255, 255, 255, 0.20)` (contrast ratio $\ge 3:1$).
   - **Screen Reader Semantics:** Grid declared with `role="radiogroup"` and `aria-label="Wardrobe"`; buttons equipped with `role="radio"` and dynamic `aria-checked="true|false"`.
   - **Emergency Exit (Escape Handling):** Pressing `Escape` cancels active preview and folds the card gracefully.
   - **Equipped (`.on`):** Vibrant mint border (`#4de3b2`), soft mint glow drop-shadow (`box-shadow: 0 0 12px rgba(77, 227, 178, 0.35)`).
   - **Audio Cue:** Triggered via `actions.blip()` and `popNew` on equip for tactile audio confirmation.
3. **Mascot Icon Integrity:**
   - `iconMochi` thumbnail generator is updated to draw the authentic **vibrant pastel mint mouthless slime** with Grok-bot ink pill eyes, completely banishing the legacy blue monkey face mask icon.

