import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EDGE_MARGIN,
  FLOATING_CORNER,
  FLOATING_EXPANDED_CORNER,
  FLOATING_TOP,
  anchorX,
  computeRadius,
  placeIsland,
  toCssMonitor,
  toPhysical,
} from "../src/core/dock.ts";
import {
  COMPACT_W,
  EXPANDED_CORNER,
  EXPANDED_W,
  PANEL_W,
  ROUNDED_CORNER,
  WAKE_STRIP_H,
  WAKE_STRIP_W,
} from "../src/core/layout.ts";

const monitor = (x, width, height = 1080) => ({ x, y: 0, width, height });

const base = {
  monitor: monitor(0, 1920),
  dock: "center",
  freeDrag: false,
  percent: 0.5,
  style: "flush",
  width: COMPACT_W,
  height: 32,
  collapsed: false,
};

const place = (over = {}) => placeIsland({ ...base, ...over });

/** The island's left edge in screen coordinates. */
const screenLeft = (p) => p.window.x + p.island.x;

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.001, `${what}: ${a} != ${b}`);

test("the compact island reaches both screen edges, and so does the panel", () => {
  const mon = monitor(0, 1920);
  for (const width of [COMPACT_W, EXPANDED_W]) {
    const atLeft = place({ monitor: mon, freeDrag: true, percent: 0, width });
    const atRight = place({ monitor: mon, freeDrag: true, percent: 1, width });

    // 0 % is the left edge, 100 % the right one: the pill and the panel it opens
    // into end up against the same edge. This is what the two-clamp version
    // broke: the 288 px pill stopped 196 px short of the edge while the 640 px
    // panel stopped 20 px short.
    near(screenLeft(atLeft), mon.x + EDGE_MARGIN, `left edge at width ${width}`);
    near(
      screenLeft(atRight) + width,
      mon.x + mon.width - EDGE_MARGIN,
      `right edge at width ${width}`,
    );
  }
});

test("the panel is never cut off while the island opens", () => {
  const displays = [
    monitor(0, 1920),
    monitor(1920, 2560, 1440),
    monitor(-1080, 1080, 1920),
    monitor(0, 1366, 768),
    monitor(0, 640, 480),
  ];
  for (const mon of displays) {
    for (let i = 0; i <= 20; i++) {
      const percent = i / 20;
      // Every width the island passes through on its way open, pill to panel.
      for (let k = 0; k <= 32; k++) {
        const width = COMPACT_W + ((EXPANDED_W - COMPACT_W) * k) / 32;
        for (const dock of ["center", "left", "right"]) {
          for (const freeDrag of [false, true]) {
            const p = place({ monitor: mon, dock, freeDrag, percent, width, height: 200 });
            const where = `${mon.width}px display, ${dock}, percent ${percent}, width ${width}`;

            // The island is on the display...
            assert.ok(screenLeft(p) >= mon.x - 0.001, `island off the left: ${where}`);
            assert.ok(
              screenLeft(p) + width <= mon.x + mon.width + 0.001,
              `island off the right: ${where}`,
            );
            // ...and the window holds it, so nothing is clipped by the window.
            assert.ok(p.island.x >= -0.001, `island left of the window: ${where}`);
            assert.ok(
              p.island.x + width <= p.window.w + 0.001,
              `island right of the window: ${where}`,
            );
            assert.equal(p.window.w, PANEL_W, `window is not the panel: ${where}`);

            // A display that can hold the panel must hold all of it.
            if (mon.width >= PANEL_W) {
              assert.ok(p.window.x >= mon.x - 0.001, `window off the left: ${where}`);
              assert.ok(
                p.window.x + p.window.w <= mon.x + mon.width + 0.001,
                `window off the right: ${where}`,
              );
            }
          }
        }
      }
    }
  }
});

test("the docked slots are the same coordinate as the slider's ends", () => {
  const mon = monitor(0, 1920);
  near(anchorX({ monitor: mon, dock: "left" }), anchorX({ monitor: mon, freeDrag: true, percent: 0 }), "left");
  near(anchorX({ monitor: mon, dock: "right" }), anchorX({ monitor: mon, freeDrag: true, percent: 1 }), "right");
  near(anchorX({ monitor: mon, dock: "center" }), anchorX({ monitor: mon, freeDrag: true, percent: 0.5 }), "centre");

  for (const [dock, percent] of [["left", 0], ["center", 0.5], ["right", 1]]) {
    for (const width of [COMPACT_W, EXPANDED_W]) {
      const docked = place({ monitor: mon, dock, freeDrag: false, width });
      const dragged = place({ monitor: mon, freeDrag: true, percent, width });
      assert.deepEqual(docked, dragged, `${dock} and ${percent} disagree at width ${width}`);
    }
  }
});

test("centred docking grows symmetrically and never moves the window", () => {
  const mon = monitor(0, 1920);
  const centre = mon.x + mon.width / 2;
  let windowX = null;
  for (let k = 0; k <= 32; k++) {
    const width = COMPACT_W + ((EXPANDED_W - COMPACT_W) * k) / 32;
    const p = place({ monitor: mon, dock: "center", width });
    near(screenLeft(p) + width / 2, centre, `centre at width ${width}`);
    if (windowX == null) windowX = p.window.x;
    near(p.window.x, windowX, "window moved while opening");
  }
  near(windowX, centre - PANEL_W / 2, "centred window");
});

test("a display narrower than the panel gets a centred island, not a cut one", () => {
  const mon = monitor(0, 640, 480);
  const p = place({ monitor: mon, dock: "center", width: EXPANDED_W });
  near(screenLeft(p), mon.x, "island starts at the display's left edge");
  near(p.window.x, (mon.x + mon.width - PANEL_W) / 2, "the window hangs off both sides equally");
  near(p.island.x, PANEL_W / 2 - EXPANDED_W / 2, "island is centred inside the window");
});

test("the anchor never moves back on itself as the slider moves", () => {
  const mon = monitor(0, 1920);
  let previous = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const x = anchorX({ monitor: mon, freeDrag: true, percent: i / 100 });
    assert.ok(x > previous, `anchor went backwards at ${i}%`);
    previous = x;
  }
});

test("floating style keeps its top margin, and still reaches the edge", () => {
  assert.equal(place({ style: "floating" }).island.y, FLOATING_TOP);
  assert.equal(place({ style: "flush" }).island.y, 0);

  const p = place({ monitor: monitor(0, 1920), freeDrag: true, percent: 0, style: "floating" });
  near(screenLeft(p), 0, "floating island at the left edge");
});

test("the wake strip is where the island was, and the window becomes it", () => {
  const mon = monitor(0, 1920);
  for (const percent of [0, 0.25, 0.5, 0.75, 1]) {
    const p = place({ monitor: mon, freeDrag: true, percent, collapsed: true, width: 184, height: 0 });
    assert.equal(p.window.w, WAKE_STRIP_W);
    assert.equal(p.window.h, WAKE_STRIP_H);
    assert.ok(p.window.x >= mon.x, "strip off the left");
    assert.ok(p.window.x + p.window.w <= mon.x + mon.width, "strip off the right");
    // The strip is the whole window, so the page draws it at 0 and it takes the
    // mouse across its own width.
    assert.equal(p.strip.x, 0);
    assert.equal(p.strip.w, WAKE_STRIP_W);
    // Centred on the anchor whenever it fits: hovering where the island was
    // still wakes it.
    const anchor = anchorX({ monitor: mon, freeDrag: true, percent });
    if (anchor - WAKE_STRIP_W / 2 >= mon.x && anchor + WAKE_STRIP_W / 2 <= mon.x + mon.width) {
      near(p.window.x + WAKE_STRIP_W / 2, anchor, `strip centre at ${percent}`);
    }
  }

  // Hidden, the island is still drawn inside the strip's window, not off it.
  const hidden = place({ freeDrag: true, percent: 0, collapsed: true, width: 184, height: 0 });
  assert.ok(hidden.island.x >= 0 && hidden.island.x + 184 <= hidden.window.w);
});

test("computeRadius: returns correct corner radius for flush and floating styles", () => {
  assert.equal(computeRadius("flush", false), ROUNDED_CORNER);
  assert.equal(computeRadius("flush", true), EXPANDED_CORNER);
  assert.equal(computeRadius("floating", false), FLOATING_CORNER);
  assert.equal(computeRadius("floating", true), FLOATING_EXPANDED_CORNER);
});

test("the page converts its own pixels for the host, and the host's back", () => {
  // The machine this was found on: a 1920x1080 display scaled to 110 %, where the
  // page draws in 1745 px and the host works in physical pixels.
  const display = { x: 0, y: 0, width: 1920, height: 1080, scale: 1.1 };
  const monitor = toCssMonitor(display);
  near(monitor.width, 1920 / 1.1, "display width in the page's pixels");
  near(monitor.x, 0, "display origin in the page's pixels");

  // A 720 px window is 792 physical px, and comes back as 720 when the host's
  // numbers are read in the page's space again: that round trip is the whole fix.
  const asked = toPhysical({ x: 1200, y: 0, w: PANEL_W, h: 320 }, 1.1);
  assert.deepEqual(asked, { x: 1320, y: 0, w: 792, h: 352 });
  near(asked.w / 1.1, PANEL_W, "window width back in the page's pixels");
  near(asked.x / 1.1, 1200, "window position back in the page's pixels");
});

test("a window narrower than the page asked for costs reach, never a cut", () => {
  // The bug as measured: the page believed a 1920 px display and placed a 720 px
  // window, but the window came back 655 px wide (host laid out at 100 %, webview
  // rendering at 110 %). The island used to be drawn at 80 and lose its right
  // 65 px; now it is clamped into the window it really has.
  const display = monitor(0, 1920);
  const viewport = { width: 655, height: 320 };
  const room = 655 - EXPANDED_W;

  for (let i = 0; i <= 20; i++) {
    const percent = i / 20;
    for (const width of [COMPACT_W, EXPANDED_W]) {
      const p = place({ monitor: display, freeDrag: true, percent, width, viewport });
      const where = `percent ${percent}, width ${width}`;
      assert.ok(p.island.x >= -0.001, `island left of the window: ${where}`);
      assert.ok(p.island.x + width <= viewport.width + 0.001, `island clipped: ${where}`);
      assert.ok(p.island.y >= -0.001 && p.island.y + p.island.h <= viewport.height + 0.001);
    }
  }

  const panel = place({ monitor: display, freeDrag: true, percent: 1, width: EXPANDED_W, viewport });
  assert.equal(panel.island.x, room, "pushed up against the window it really has");
  assert.equal(panel.window.w, PANEL_W, "the window is still the size the page asked for");
});

test("a window that is exactly what was asked for changes nothing", () => {
  const display = monitor(0, 1920);
  const viewport = { width: PANEL_W, height: 320 };
  for (const percent of [0, 0.5, 1]) {
    for (const width of [COMPACT_W, EXPANDED_W]) {
      const withViewport = place({ monitor: display, freeDrag: true, percent, width, viewport });
      const without = place({ monitor: display, freeDrag: true, percent, width });
      assert.deepEqual(withViewport, without, `percent ${percent}, width ${width}`);
    }
  }
});
