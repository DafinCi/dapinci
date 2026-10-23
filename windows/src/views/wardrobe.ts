// Wardrobe view — port of WardrobeView (IslandViewContent.swift). Opened with a
// right-click on ipin or from the tray menu. Resting the pointer on a button
// tries the outfit on ipin; a click keeps it.

import { h } from "./dom";
import { State } from "../core/state";
import { drawWardrobeIcon } from "../ipin/outfits";
import {
  OUTFIT_KEYS, OUTFIT_SELECTIONS, WARDROBE_STRINGS, parseOutfit, resolveOutfit, seasonalOutfit,
  wardrobeHeader, type Outfit, type OutfitSelection,
} from "../ipin/wardrobe";
import type { ViewActions, ViewHost } from "./views";
import { language, tl } from "../i18n/i18n";

const ICON = 34;

export function buildWardrobe(actions: ViewActions): ViewHost {
  const note = h("span", { class: "wardrobe-note" });
  const grid = h("div", {
    class: "wardrobe-grid",
    role: "radiogroup",
    "aria-label": tl("Wardrobe"),
  });
  const el = h(
    "div",
    { class: "view wardrobe" },
    h(
      "div",
      { class: "card" },
      h(
        "div",
        { class: "stack wardrobe-stack" },
        h("div", { class: "wardrobe-head" }, h("span", { class: "wardrobe-title", text: tl("Wardrobe") }), note),
        grid,
      ),
    ),
  );

  let hovered: OutfitSelection | null = null;
  let drawnSeason: Outfit | null = null;
  let drawnLanguage = language();
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  const items = new Map<OutfitSelection, { button: HTMLButtonElement; canvas: HTMLCanvasElement }>();
  const selectionList = Array.from(OUTFIT_SELECTIONS);

  const updateNote = () => {
    note.textContent = wardrobeHeader(hovered, parseOutfit(State.settings.mochiOutfit), new Date());
  };

  const clearHoverTimer = () => {
    if (hoverTimer != null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };

  selectionList.forEach((sel, index) => {
    const canvas = h("canvas");
    const button = h(
      "button",
      {
        class: "wardrobe-item",
        title: tl(OUTFIT_KEYS[sel]),
        "aria-label": tl(OUTFIT_KEYS[sel]),
        role: "radio",
        "aria-checked": "false",
      },
      canvas,
    );

    const onEnter = () => {
      clearHoverTimer();
      hovered = sel;
      updateNote();
      // Debounce preview by 60ms to prevent visual strobing on rapid cursor movement
      hoverTimer = setTimeout(() => {
        actions.previewOutfit(resolveOutfit(sel, new Date()));
      }, 60);
    };

    const onLeave = () => {
      clearHoverTimer();
      if (hovered !== sel) return;
      hovered = null;
      actions.previewOutfit(null);
      updateNote();
    };

    button.addEventListener("mouseenter", onEnter);
    button.addEventListener("mouseleave", onLeave);
    button.addEventListener("focus", onEnter);
    button.addEventListener("blur", onLeave);

    // 5x2 grid Arrow key keyboard navigation
    button.addEventListener("keydown", (e: KeyboardEvent) => {
      let nextIndex = -1;
      if (e.key === "ArrowRight") nextIndex = (index + 1) % selectionList.length;
      else if (e.key === "ArrowLeft") nextIndex = (index - 1 + selectionList.length) % selectionList.length;
      else if (e.key === "ArrowDown") nextIndex = (index + 5) % selectionList.length;
      else if (e.key === "ArrowUp") nextIndex = (index - 5 + selectionList.length) % selectionList.length;

      if (nextIndex >= 0) {
        e.preventDefault();
        const nextSel = selectionList[nextIndex];
        items.get(nextSel)?.button.focus();
      }
    });

    button.addEventListener("click", () => {
      clearHoverTimer();
      actions.chooseOutfit(sel);
      actions.blip();
      updateNote();
    });
    items.set(sel, { button, canvas });
    grid.append(button);
  });

  // Escape key closes wardrobe card & clears preview
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      clearHoverTimer();
      actions.previewOutfit(null);
      actions.collapse();
    }
  });

  /** Icons are drawn once; only "auto" changes, with the season and its badge's language. */
  const drawIcons = () => {
    const season = seasonalOutfit(new Date());
    if (season === drawnSeason && drawnLanguage === language()) return;
    const first = drawnSeason == null;
    drawnSeason = season;
    drawnLanguage = language();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const [sel, { canvas }] of items) {
      if (!first && sel !== "auto") continue;
      canvas.width = Math.round(ICON * dpr);
      canvas.height = Math.round(ICON * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWardrobeIcon(ctx, ICON, sel, season, WARDROBE_STRINGS.autoBadge);
    }
  };

  return {
    el,
    sync() {
      drawIcons();
      // The island drops the preview when the view closes: so does the hover.
      if (State.wardrobePreview == null) hovered = null;
      const current = parseOutfit(State.settings.mochiOutfit);
      for (const [sel, { button }] of items) {
        const isOn = sel === current;
        button.classList.toggle("on", isOn);
        button.setAttribute("aria-checked", isOn ? "true" : "false");
      }
      updateNote();
    },
  };
}
