// ipin's wardrobe: season → outfit, stored preference → outfit (src/ipin/wardrobe.ts).
// Tests 8 original slime-native accessories and season mapping.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTFIT_SELECTIONS, OUTFIT_LABELS, SeasonCache, easterDate, parseOutfit, resolveOutfit,
  seasonalOutfit, wardrobeHeader,
} from "../src/ipin/wardrobe.ts";
import { DEFAULT_SETTINGS } from "../src/core/state.ts";

/** A local calendar day, at noon so no time zone can push it into the next one. */
const day = (y, m, d) => new Date(y, m - 1, d, 12);
const season = (y, m, d) => seasonalOutfit(day(y, m, d));

test("cloud puff from October 1 to November 1", () => {
  assert.equal(season(2026, 9, 30), "none");
  assert.equal(season(2026, 10, 1), "cloud");
  assert.equal(season(2026, 10, 31), "cloud");
  assert.equal(season(2026, 11, 1), "cloud");
  assert.equal(season(2026, 11, 2), "none");
});

test("nightcap from December 1 to 26", () => {
  assert.equal(season(2026, 11, 30), "none");
  assert.equal(season(2026, 12, 1), "nightcap");
  assert.equal(season(2026, 12, 26), "nightcap");
  assert.equal(season(2026, 12, 27), "none");
});

test("propeller cap from December 31 to January 2", () => {
  assert.equal(season(2026, 12, 30), "none");
  assert.equal(season(2026, 12, 31), "propeller");
  assert.equal(season(2027, 1, 1), "propeller");
  assert.equal(season(2027, 1, 2), "propeller");
  assert.equal(season(2027, 1, 3), "none");
});

test("nothing around Valentine's day", () => {
  for (const d of [12, 13, 15, 16]) assert.equal(season(2026, 2, d), "none");
});

test("Easter falls where the calendar says", () => {
  assert.deepEqual(easterDate(2026), [4, 5]);
  assert.deepEqual(easterDate(2027), [3, 28]);
  assert.deepEqual(easterDate(2028), [4, 16]);
  assert.deepEqual(easterDate(2019), [4, 21]);
});

test("blooming sprout from two days before Easter to the day after", () => {
  // Easter 2026 = April 5
  assert.equal(season(2026, 4, 2), "none");
  for (const d of [3, 4, 5, 6]) assert.equal(season(2026, 4, d), "sprout", `April ${d}`);
  assert.equal(season(2026, 4, 7), "none");
  // Easter 2027 = March 28
  assert.equal(season(2027, 3, 26), "sprout");
  assert.equal(season(2027, 3, 29), "sprout");
  assert.equal(season(2027, 3, 30), "none");
  // Easter 2028 = April 16
  assert.equal(season(2028, 4, 14), "sprout");
  assert.equal(season(2028, 4, 17), "sprout");
  assert.equal(season(2028, 4, 18), "none");
});

test("a daylight-saving change just before Easter doesn't shift the count", () => {
  assert.equal(seasonalOutfit(new Date(2026, 3, 3, 0, 0)), "sprout");
  assert.equal(seasonalOutfit(new Date(2026, 3, 6, 23, 59)), "sprout");
  assert.equal(seasonalOutfit(new Date(2026, 3, 7, 0, 0)), "none");
});

test("refreshing boba straw from June 21 to August 31", () => {
  assert.equal(season(2026, 6, 20), "none");
  assert.equal(season(2026, 6, 21), "boba");
  assert.equal(season(2026, 8, 31), "boba");
  assert.equal(season(2026, 9, 1), "none");
});

test("auto dresses for the season, any other choice is worn as is", () => {
  const d = day(2026, 10, 15);
  assert.equal(resolveOutfit("auto", d), "cloud");
  assert.equal(resolveOutfit("none", d), "none");
  assert.equal(resolveOutfit("sprout", d), "sprout");
});

test("the stored values are the new 8 slime accessories in order", () => {
  assert.deepEqual([...OUTFIT_SELECTIONS], [
    "auto", "none", "sprout", "propeller", "headset", "friedEgg", "boba", "cloud", "origami", "nightcap",
  ]);
  for (const sel of OUTFIT_SELECTIONS) assert.ok(OUTFIT_LABELS[sel], `${sel} has a label`);
});

test("a stored preference is read back as it was saved", () => {
  for (const sel of OUTFIT_SELECTIONS) assert.equal(parseOutfit(sel), sel);
});

test("removed, unknown or missing preferences mean auto", () => {
  for (const raw of ["topHat", "cap", "witchHat", "santaHat", "beanie", "totallyUnknown", "", "Sprout"]) {
    assert.equal(parseOutfit(raw), "auto", JSON.stringify(raw));
  }
  for (const raw of [undefined, null, 42, true, {}, ["sprout"]]) {
    assert.equal(parseOutfit(raw), "auto", String(raw));
  }
});

test("preferences from before the wardrobe start on auto", () => {
  assert.equal(DEFAULT_SETTINGS.mochiOutfit, "auto");
  const old = { soundEnabled: false, model: "x" };
  const merged = { ...DEFAULT_SETTINGS, ...old };
  assert.equal(parseOutfit(merged.mochiOutfit), "auto");
});

test("the wardrobe header names the hovered outfit, else the current choice", () => {
  const d = day(2026, 10, 15);
  assert.equal(wardrobeHeader(null, "auto", d), "Auto · Cloud puff");
  assert.equal(wardrobeHeader(null, "sprout", d), "Sprout");
  assert.equal(wardrobeHeader("auto", "sprout", d), "Auto · follows the seasons (now: Cloud puff)");
  assert.equal(wardrobeHeader("headset", "auto", d), "Dev headset");
  assert.equal(wardrobeHeader(null, "auto", day(2026, 5, 1)), "Auto · None");
});

test("the per-frame season lookup follows the calendar day", () => {
  const cache = new SeasonCache();
  assert.equal(cache.get("auto", day(2026, 9, 30)), "none");
  assert.equal(cache.get("auto", new Date(2026, 9, 1, 0, 0, 1)), "cloud");
  assert.equal(cache.get("sprout", day(2026, 10, 1)), "sprout");
  assert.equal(cache.get("auto", day(2026, 12, 2)), "nightcap");
});
