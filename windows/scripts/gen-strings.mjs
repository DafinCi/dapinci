// Generates src/i18n/strings.json from the catalog that ships with this app
// (src/i18n/Localizable.xcstrings), so the interface speaks the same ten
// languages wherever it runs.
//
//   node scripts/gen-strings.mjs           writes src/i18n/strings.json
//   node scripts/gen-strings.mjs --check   fails if the file is out of date
//
// Every entry is keyed by its English text, as the catalog's are (a key such as
// "step.reads" is replaced by its English value, "Reads"). Format specifiers
// become named or numbered placeholders: "%@" and "%lld" → "{0}", "{1}"…
// ("%1$@" keeps its number), renamed where RENAMES says so. Plural entries keep
// their categories ({ "one": …, "other": … }) and are keyed by the English
// "other" form. English is the key itself, so it is not stored.
//
// Strings the catalog does not have (Windows and Linux only) live in
// src/i18n/extra.json, written by hand; see src/i18n/i18n.ts.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../src/i18n/Localizable.xcstrings");
const OUTPUT = resolve(here, "../src/i18n/strings.json");

/** The languages DapinCi ships, in the catalog's picker order. English is the source. */
export const LANGUAGES = ["en", "zh-Hans", "hi", "es", "ar", "fr", "bn", "pt-BR", "ru", "id"];

/**
 * The name this app shows for itself. The Mac's catalog is the source of every
 * translation, so the brand is swapped here rather than in each string: whole
 * words only, in keys and in values, in every language.
 *
 * Only the capitalised name is a name. Lower-case "coucou" is not: it belongs to
 * paths and file names the relay owns (`coucou-hook`, `plugins/coucou.js`,
 * `~/.claude/coucou/nb-hook`) and those keep their names until the files do too.
 */
function brand(value) {
  if (typeof value === "string") return value.replace(/\bCoucou\b/g, "DapinCi");
  const out = {};
  for (const [form, text] of Object.entries(value)) out[form] = brand(text);
  return out;
}

/**
 * Names for the placeholders of the Mac strings the Windows code uses, by Mac
 * key: the n-th specifier becomes `{names[n]}` instead of `{n}`.
 */
const RENAMES = {
  "Auto-close · %llds": ["seconds"],
  "Chat with %@": ["name"],
  "Claude is reading %@…": ["name"],
  "Connected · %@": ["detail"],
  "Key configured · %@": ["model"],
  "Open %@": ["name"],
  "Playing · %@": ["title"],
  "Uploading %@": ["name"],
  "Watching %lld of %lld": ["count", "total"],
  "file.ready %@": ["name"],
  "mail.with %@": ["name"],
  "plan.hours-ago %lld": ["n"],
  "plan.mins-ago %lld": ["n"],
  "plan.reset-in-hm %lld %lld": ["h", "m"],
  "plan.reset-in-m %lld": ["m"],
  "settings.slots-used %lld": ["count"],
  "status.local.connected %lld": ["count"],
  "status.local.no-models %@": ["name"],
  "status.local.unreachable %1$@ %2$@": ["name", "url"],
};

/** "%@ at %lld" → "{0} at {1}"; "%2$@" → "{1}"; "%%" → "%". */
export function convertFormat(text, names = []) {
  let next = 0;
  return text.replace(/%(?:(\d+)\$)?(@|lld|ld|d|lu|u|f|%)/g, (_m, pos, spec) => {
    if (spec === "%") return "%";
    const index = pos ? Number(pos) - 1 : next++;
    return `{${names[index] ?? index}}`;
  });
}

function unitValue(loc) {
  return loc?.stringUnit?.value;
}

/** A localization as a string, or as plural categories. */
function readLocalization(loc, names) {
  const plural = loc?.variations?.plural;
  if (plural) {
    const out = {};
    for (const [category, v] of Object.entries(plural)) {
      const value = unitValue(v);
      if (typeof value === "string") out[category] = convertFormat(value, names);
    }
    return Object.keys(out).length ? out : undefined;
  }
  const value = unitValue(loc);
  return typeof value === "string" ? convertFormat(value, names) : undefined;
}

export function generate(catalog) {
  const strings = {};
  for (const [macKey, entry] of Object.entries(catalog.strings ?? {})) {
    const names = RENAMES[macKey] ?? [];
    const locs = entry.localizations ?? {};
    // A Mac key with no English localization is its own English text.
    const en = brand(readLocalization(locs.en, names) ?? convertFormat(macKey, names));
    const key = typeof en === "string" ? en : en.other ?? Object.values(en)[0];
    const out = {};
    for (const lang of LANGUAGES) {
      if (lang === "en") continue;
      const value = readLocalization(locs[lang], names);
      if (value !== undefined) out[lang] = brand(value);
    }
    // The English plural forms are needed to pick "one" in English too.
    if (typeof en !== "string") out.en = en;
    strings[key] = out;
  }
  const sorted = Object.fromEntries(Object.entries(strings).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {
    _generated: "By scripts/gen-strings.mjs from src/i18n/Localizable.xcstrings. Do not edit: run `node scripts/gen-strings.mjs`.",
    languages: LANGUAGES,
    strings: sorted,
  };
}

function main() {
  const catalog = JSON.parse(readFileSync(SOURCE, "utf8"));
  const text = `${JSON.stringify(generate(catalog), null, 1)}\n`;
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUTPUT, "utf8");
    } catch {
      // missing: out of date
    }
    if (current !== text) {
      console.error("src/i18n/strings.json is out of date: run `node scripts/gen-strings.mjs`.");
      process.exit(1);
    }
    console.log("src/i18n/strings.json is up to date.");
    return;
  }
  writeFileSync(OUTPUT, text);
  const count = Object.keys(JSON.parse(text).strings).length;
  console.log(`Wrote ${count} strings to src/i18n/strings.json`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
