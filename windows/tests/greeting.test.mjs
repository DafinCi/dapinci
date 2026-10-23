// The launch greeting (src/ipin/greeting.ts + BotEngine.greet): he peeks out of
// the top edge, crouches, jumps down in a winking full spin, lands, waves and
// settles — all on ipin's own canvas. These tests drive the engine with a fake
// clock, frame by frame, the way the island's loop does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BotEngine } from "../src/ipin/engine.ts";
import { GREET, TAU } from "../src/ipin/greeting.ts";
import {
  COMPACT_W, EXPANDED_W, GREETING_STAGE_H, GREETING_STAGE_W, VIEW_LAYOUTS,
  botPosition, islandSize,
} from "../src/core/layout.ts";

const FRAME = 1 / 60;

/** Runs `fn` with performance.now() under the test's control. */
function withClock(fn) {
  const real = performance.now;
  let ms = 100_000;
  performance.now = () => ms;
  try {
    return fn({
      advance: (seconds) => {
        ms += seconds * 1000;
      },
    });
  } finally {
    performance.now = real;
  }
}

/** Starts a greeting and calls `each(t)` after every frame up to `until` seconds. */
function play(clock, engine, until, each) {
  let t = 0;
  while (t < until) {
    clock.advance(FRAME);
    t += FRAME;
    engine.update(FRAME);
    each?.(t);
  }
}

test("the greeting plays the full 4.6 s choreography to match greeting", () => {
  withClock((clock) => {
    const e = new BotEngine();
    let doneAt = null;
    e.onGreetDone = () => {
      doneAt ??= t;
    };
    let t = 0;
    e.greet();
    play(clock, e, 5.0, (now) => (t = now));
    assert.ok(doneAt !== null, "never finished");
    assert.ok(doneAt >= GREET.T.end - 0.05 && doneAt <= 4.8, `finished at ${doneAt}`);
    assert.equal(e.greeting, false);
  });
});

test("he starts half out of the top edge, eyes wide, then rises a little", () => {
  withClock((clock) => {
    const e = new BotEngine();
    e.greet();
    play(clock, e, FRAME * 2);
    assert.ok(e.oy < -1.7, `peeking at oy=${e.oy}`);
    assert.equal(e.eyeOverride, "wide");
    play(clock, e, 0.2);
    assert.ok(e.oy > GREET.PEEK_OY && e.oy < -1.4, `rising, oy=${e.oy}`);
  });
});

test("one full turn, happy eyes all the way, then he is upright again", () => {
  withClock((clock) => {
    const e = new BotEngine();
    e.greet();
    let max = 0;
    let last = 0;
    play(clock, e, 2.6, () => {
      assert.ok(e.spin >= 0 && e.spin <= TAU + 1e-6, `spin ${e.spin}`);
      if (e.spin > 0.01 && e.spin < TAU * 0.98) {
        assert.equal(e.eyeOverride, "happy", `no happy eyes at spin ${e.spin.toFixed(2)}`);
        assert.ok(e.spin >= last - 1e-9, "he spun backwards");
        last = e.spin;
      }
      max = Math.max(max, e.spin);
    });
    assert.ok(max > TAU * 0.9, `only turned ${((max / TAU) * 100).toFixed(0)}%`);
    assert.equal(e.spin, 0);
  });
});

test("he has all but finished the turn when he lands, and lands on his spot", () => {
  withClock((clock) => {
    const e = new BotEngine();
    e.greet();
    play(clock, e, GREET.T.land);
    assert.ok(e.spin > TAU * 0.7, `still at ${((e.spin / TAU) * 100).toFixed(0)}% on landing`);
    assert.ok(e.oy > -0.1 && e.oy < 0.2, `landing at oy=${e.oy}`);
  });
});

test("he waves with the hand out, then puts it away", () => {
  withClock((clock) => {
    const e = new BotEngine();
    e.greet();
    play(clock, e, GREET.T.waveStart + 0.35);
    assert.ok(e.hands > 0.9, `hands ${e.hands}`);
    assert.ok(e.waveStart > 0 && e.waveUntil > 0, "not waving");
    play(clock, e, GREET.T.end - (GREET.T.waveStart + 0.35) + 0.1);
    assert.ok(e.hands < 0.05, `hands still out: ${e.hands}`);
    assert.equal(e.waveUntil, 0);
    assert.ok(Math.abs(e.oy) < 0.01 && Math.abs(e.sx - 1) < 0.02 && Math.abs(e.sy - 1) < 0.02);
  });
});

test("he waves with happy eyes, opens both eyes first, then winks playfully", () => {
  withClock((clock) => {
    const e = new BotEngine();
    e.greet();

    // 1. During waving: hand is out, eyes are happy (^^)
    play(clock, e, GREET.T.waveStart + 0.35);
    assert.ok(e.hands > 0.85, `hands waving: ${e.hands}`);
    assert.equal(e.eyeOverride, "happy", "eyes must be happy during waving");

    // 2. After waving wraps up (waveEnd + 0.15): BOTH EYES OPEN first!
    play(clock, e, (GREET.T.waveEnd + 0.15) - (GREET.T.waveStart + 0.35));
    assert.equal(e.eyeOverride, null, "eyes must be open after waving before winking");
    assert.ok(e.hands < 0.15, `hand should be retracted: ${e.hands}`);

    // 3. Wink peak (winkStart + 0.15): winks playfully with head tilt and micro-hop
    play(clock, e, (GREET.T.winkStart + 0.15) - (GREET.T.waveEnd + 0.15));
    assert.equal(e.eyeOverride, "wink", "eyeOverride should be wink");
    assert.ok(e.tilt > 0.08, `head tilted playfully: ${e.tilt}`);
    assert.ok(e.oy < -0.02, `micro-hop bounce active: oy=${e.oy}`);
    assert.ok(e.hands < 0.05, `hand is tucked: ${e.hands}`);

    // 4. Conclude & settle
    play(clock, e, (GREET.T.end + 0.1) - (GREET.T.winkStart + 0.15));
    assert.equal(e.eyeOverride, null, "eyeOverride should be cleared");
    assert.ok(Math.abs(e.tilt) < 0.02, `tilt settled: ${e.tilt}`);
    assert.ok(Math.abs(e.oy) < 0.01 && Math.abs(e.sx - 1) < 0.02 && Math.abs(e.sy - 1) < 0.02);
  });
});

test("cut short mid-spin he finishes the turn, drops to his spot and tells the island once", () => {
  withClock((clock) => {
    const e = new BotEngine();
    let done = 0;
    e.onGreetDone = () => done++;
    e.greet();
    play(clock, e, GREET.T.launch + 0.25);
    assert.ok(e.spin > 0.1 && e.spin < TAU, "not mid-spin");
    e.interruptGreet();
    assert.equal(e.greeting, false);
    play(clock, e, 0.6);
    assert.equal(e.spin, 0);
    assert.ok(Math.abs(e.oy) < 0.01, `oy ${e.oy}`);
    assert.ok(e.hands < 0.01);
    assert.equal(done, 1);
    // The cancelled timeline never plays its later steps.
    play(clock, e, 2);
    assert.equal(done, 1);
  });
});

test("interrupting when no greeting runs does nothing", () => {
  withClock(() => {
    const e = new BotEngine();
    let done = 0;
    e.onGreetDone = () => done++;
    e.interruptGreet();
    assert.equal(done, 0);
  });
});

test("the stage is wider than the compact island, narrower than a full one, and he fits", () => {
  const size = islandSize("expanded", "greeting");
  assert.deepEqual(size, { w: GREETING_STAGE_W, h: GREETING_STAGE_H });
  assert.ok(size.w > COMPACT_W && size.w < EXPANDED_W);
  assert.equal(VIEW_LAYOUTS.greeting.height, GREETING_STAGE_H);

  const p = botPosition("expanded", "greeting", GREETING_STAGE_H);
  assert.equal(p.cx, GREETING_STAGE_W / 2);
  assert.ok(p.opacity > 0 && p.diameter > 0, "he must be drawn on the stage");
  // Body radius R = diameter / 2; wide side 1.14 R, tall side 0.88 R, plus the
  // stretch and squash he goes through (≤ 1.3×) and the hand's reach.
  const R = p.diameter / 2;
  assert.ok(p.cy + 0.88 * R * 1.3 <= GREETING_STAGE_H, "his feet leave the island");
  assert.ok(R * 1.14 * 1.3 + R * 0.7 < GREETING_STAGE_W / 2, "his hand leaves the island");
});

test("the peek puts only part of him in view and the jump brings all of him down", () => {
  const p = botPosition("expanded", "greeting", GREETING_STAGE_H);
  const R = p.diameter / 2;
  const peekCenter = p.cy + GREET.PEEK_OY * R;
  const ry = 0.88 * R;
  assert.ok(peekCenter - ry < 0, "his head should be above the top edge");
  assert.ok(peekCenter + ry > 0, "but his eyes and lower half show");
});

test("slap / click on ipin makes his eyes squint into >< on progressive poke", () => {
  const e = new BotEngine();
  assert.equal(e.eyeOverride, null);
  e.slap();
  assert.ok(e.eyeOverride === "happy" || e.eyeOverride === "wink");
  e.slap();
  assert.equal(e.eyeOverride, "squint");
});

