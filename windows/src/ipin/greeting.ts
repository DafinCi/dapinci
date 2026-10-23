// The launch "coucou" (greeting v3): ipin peeks out of the top edge of the
// screen, crouches, jumps down in a full joyful spin (winking), lands with a
// squash, waves hello and settles.
//
// It plays on ipin's own canvas (BotEngine.greet), so the outfit he wears comes
// along and there is no second canvas to swap to afterwards. The island only
// lends him a stage (GREETING_STAGE_W × GREETING_STAGE_H in core/layout.ts) and
// folds to the compact island once he is done. This file holds the choreography
// numbers, shared by the engine and the tests. Total duration 4.6 s, matching the
// full musical score (greeting.wav) from the original app.

export const TAU = Math.PI * 2;

export const GREET = {
  /**
   * Where he waits, in body radii above his resting spot: about half of him is
   * out of the top edge of the screen, only his eyes and lower half show.
   */
  PEEK_OY: -1.9,
  /** How far he rises while he peeks. */
  PEEK_RISE: 0.45,
  /** One full turn. */
  SPIN: TAU,
  SPIN_MS: 780,
  /** Seconds from the start of the greeting. */
  T: {
    /** Curiosity over: he crouches to jump. */
    peekEnd: 1.25,
    /** The jump and the spin begin. */
    launch: 1.65,
    /** He lands (the fall lasts FALL_MS). */
    land: 2.35,
    /** The hand comes out and waves until waveEnd. */
    waveStart: 2.95,
    waveEnd: 3.7,
    /** Both eyes open at waveEnd, then playful wink with micro-hop and head tilt. */
    winkStart: 4.05,
    winkEnd: 4.45,
    /** The greeting settles to normal idle. */
    end: 4.6,
  },
  FALL_MS: 700,
} as const;
