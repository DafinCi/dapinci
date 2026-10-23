// Where the island sits on its display: one calculation for the window *and*
// for the island inside it.
//
// It used to be two. Rust placed the 720x320 window along the top of the
// display, the page placed the island inside that window, and the island's
// place on screen was the sum of the two. Each side clamped what it owned, and
// the clamps disagreed, so the compact island could not reach the edges: the
// window was held far enough from the edge for the *expanded* panel (640 px
// wide) to fit, and the 288 px pill, centred in that window, inherited its
// 176 px of slack. 196 px from either edge, while the panel it grows into
// stopped 20 px away.
//
// What keeps both ends reachable *and* nothing cut off is a single anchor (the
// centre the island settles on, measured on the resting pill) clamped twice, in
// this order, for the island's width at that instant:
//
//   1. the island, at the width it has right now, has to fit the display;
//   2. the window, which is the panel's size whatever the island's is right
//      now, has to fit the display too, and it follows the island.
//
// The island is then drawn at `screen x - window x` inside the window. Because
// the window follows the island instead of the other way round, the island can
// touch either edge while the panel it opens into stays whole on screen.

import {
  COMPACT_W,
  EXPANDED_CORNER,
  PANEL_H,
  PANEL_W,
  ROUNDED_CORNER,
  WAKE_STRIP_H,
  WAKE_STRIP_W,
} from "./layout";
import type { IslandDock, IslandStyle } from "./state";

/**
 * Logical pixels between the island and the left/right screen edge.
 *
 * Zero: at the ends the island touches the edge, which is what "left", "right"
 * and the 0 % / 100 % ends of the free-drag slider all mean. There is no
 * separate margin for the docked slots, so the two positioning modes cannot
 * drift apart.
 */
export const EDGE_MARGIN = 0;

/** Logical pixel margin from the screen top edge when in floating style. */
export const FLOATING_TOP = 8;

/** Fully rounded corner radius for compact island in floating style. */
export const FLOATING_CORNER = 16;

/** Fully rounded corner radius for expanded island in floating style. */
export const FLOATING_EXPANDED_CORNER = 22;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A display in the page's own pixels: the space everything here is computed in. */
export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A display as Rust reports it: **physical** pixels plus its scale factor, for
 * `boot` and `screen-changed`. Physical because that is the one space the host
 * and the webview always agree on; `toCssMonitor` turns it into what the page
 * draws in, and `toPhysical` turns the page's own rects back for the host.
 */
export interface ScreenInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/** The one coordinate the island is placed by. */
export interface IslandAnchor {
  /** The display the island lives on, in logical pixels. */
  monitor: MonitorRect;
  /** The docked slot, used when `freeDrag` is false. */
  dock?: IslandDock;
  /** Free horizontal dragging, from the slider or Alt + drag on the island. */
  freeDrag?: boolean;
  /** Where the slider was left: 0 touches the left edge, 1 the right one. */
  percent?: number;
}

export interface PlacementRequest extends IslandAnchor {
  style?: IslandStyle;
  /** The island's width right now: it animates, so it is neither COMPACT_W nor EXPANDED_W. */
  width: number;
  height: number;
  /** True once the window has shrunk to the wake strip: the island is hidden and settled. */
  collapsed?: boolean;
  /**
   * The window's inner size as the page can *measure* it
   * (`document.documentElement.clientWidth/Height`). The island is clamped into
   * it, so a disagreement about what a pixel is can cost the island its reach,
   * never a clipped edge. Left out, the window's own size is assumed.
   */
  viewport?: { width: number; height: number };
}

export interface Placement {
  /** The window, in logical screen coordinates. */
  window: Rect;
  /** The island, in the window's own coordinates. */
  island: Rect;
  /** The wake strip, also in the window's coordinates. */
  strip: Rect;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Clamps into a range that may be empty - the island is wider than the display
 * it was asked to sit on - by centring instead of guessing a side.
 */
const fit = (v: number, lo: number, hi: number) => (hi >= lo ? clamp(v, lo, hi) : (lo + hi) / 2);

/**
 * The page's pixels in physical pixels, and back.
 *
 * This is the only place the two spaces meet. The page draws in CSS pixels and
 * knows its own `devicePixelRatio`; the Windows side places windows in physical
 * pixels. Tauri's scale factor is *not* that ratio on a display with custom
 * scaling, where the host process may be laid out at 96 DPI while WebView2
 * renders at the display's real DPI (measured: 1.0 against 1.1 at 110 %), so the
 * page does the conversion itself.
 */
export function toPhysical(rect: Rect, dpr: number): Rect {
  const s = dpr > 0 ? dpr : 1;
  return {
    x: Math.round(rect.x * s),
    y: Math.round(rect.y * s),
    w: Math.max(1, Math.round(rect.w * s)),
    h: Math.max(1, Math.round(rect.h * s)),
  };
}

/** The display Rust reported (physical pixels) in the page's own pixels. */
export function toCssMonitor(info: ScreenInfo): MonitorRect {
  const s = info.scale > 0 ? info.scale : 1;
  return { x: info.x / s, y: info.y / s, width: info.width / s, height: info.height / s };
}

/**
 * The anchor: the centre the island settles on, along the top of its display.
 *
 * Measured on the resting pill, not on the island's current width, so the place
 * the user chose does not move while the island opens and closes. "Left",
 * "right" and "centre" are the same coordinate as 0, 1 and 0.5 of the free-drag
 * slider: the dropdown and the slider can never mean two different places.
 */
export function anchorX({ monitor, dock = "center", freeDrag = false, percent = 0.5 }: IslandAnchor): number {
  const left = monitor.x + EDGE_MARGIN;
  const right = monitor.x + monitor.width - EDGE_MARGIN;
  const travel = Math.max(0, monitor.width - 2 * EDGE_MARGIN - COMPACT_W);
  if (freeDrag) {
    return left + COMPACT_W / 2 + clamp(percent, 0, 1) * travel;
  }
  switch (dock) {
    case "left":
      return left + COMPACT_W / 2;
    case "right":
      return right - COMPACT_W / 2;
    default:
      return monitor.x + monitor.width / 2;
  }
}

/**
 * The window, the island and the wake strip, from that one anchor.
 *
 * `collapsed` is the state where the window *is* the wake strip: 240x12, so a
 * hidden island costs the OS nothing to deliver events to.
 */
export function placeIsland(req: PlacementRequest): Placement {
  const { monitor, width, height } = req;
  const floating = (req.style ?? "flush") === "floating";
  const anchor = anchorX(req);
  const left = monitor.x + EDGE_MARGIN;
  const right = monitor.x + monitor.width - EDGE_MARGIN;
  // The window as the page can measure it: the island never leaves it, whatever
  // the numbers above say.
  const viewW = req.viewport?.width ?? PANEL_W;
  const viewH = req.viewport?.height ?? PANEL_H;

  // The wake strip is placed first: while the island is hidden it is the only
  // thing on screen, and it belongs where the island was - centred on the
  // anchor, never hanging off the display.
  const stripX = fit(anchor - WAKE_STRIP_W / 2, left, right - WAKE_STRIP_W);

  if (req.collapsed) {
    return {
      window: { x: stripX, y: monitor.y, w: WAKE_STRIP_W, h: WAKE_STRIP_H },
      island: {
        x: fit(anchor - width / 2 - stripX, 0, viewW - width),
        y: fit(0, 0, viewH - height),
        w: width,
        h: height,
      },
      strip: { x: 0, y: 0, w: WAKE_STRIP_W, h: WAKE_STRIP_H },
    };
  }

  // 1. the island, at the width it has right now, on the display.
  const centre = fit(anchor, left + width / 2, right - width / 2);
  const islandScreenX = centre - width / 2;

  // 2. the window, which is the panel's size whatever the island's is right
  //    now, on the display as well.
  const windowX = fit(centre - PANEL_W / 2, monitor.x, monitor.x + monitor.width - PANEL_W);

  return {
    window: { x: windowX, y: monitor.y, w: PANEL_W, h: PANEL_H },
    island: {
      x: fit(islandScreenX - windowX, 0, viewW - width),
      // The window's top edge is the display's, so the y inside it is the
      // island's own top margin and nothing else.
      y: fit(floating ? FLOATING_TOP : 0, 0, viewH - height),
      w: width,
      h: height,
    },
    strip: {
      x: fit(stripX - windowX, 0, viewW - WAKE_STRIP_W),
      y: 0,
      w: WAKE_STRIP_W,
      h: WAKE_STRIP_H,
    },
  };
}

/**
 * Computes the corner radius based on island style and expansion state.
 */
export function computeRadius(
  style: IslandStyle = "flush",
  isExpanded: boolean,
): number {
  if (style === "floating") {
    return isExpanded ? FLOATING_EXPANDED_CORNER : FLOATING_CORNER;
  }
  return isExpanded ? EXPANDED_CORNER : ROUNDED_CORNER;
}
