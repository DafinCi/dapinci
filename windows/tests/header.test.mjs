// Tests for the Island header and the close cross button.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./fakedom.mjs";

installFakeDom();
const { buildHeader } = await import("../src/views/views.ts");
const { State } = await import("../src/core/state.ts");

test("buildHeader renders close cross button, which triggers collapse on click", () => {
  let collapsed = false;
  let blipped = false;
  const actions = {
    setView() {},
    cancelDrop() {},
    collapse() { collapsed = true; },
    foldApproval() {},
    setFocus() {},
    openTerminal() {},
    openTarget() {},
    openUrl() {},
    decide() {},
    answer() {},
    answerInTerminal() {},
    toggleSound() {},
    setVolume() {},
    setAutoClose() {},
    openSettingsWindow() {},
    blip() { blipped = true; },
    chooseOutfit() {},
    previewOutfit() {},
  };

  const header = buildHeader(actions);
  assert.ok(header.el, "header element exists");

  const closeBtn = header.el.querySelector(".close-btn");
  assert.ok(closeBtn, "close cross button exists in header");
  assert.equal(closeBtn.getAttribute("aria-label"), "Close");

  // Clicking it plays blip and triggers collapse
  assert.equal(collapsed, false);
  assert.equal(blipped, false);
  closeBtn.fire("click");
  assert.equal(collapsed, true);
  assert.equal(blipped, true);
});

test("close cross button is hidden when island is held open by pending approval", () => {
  const actions = {
    setView() {},
    cancelDrop() {},
    collapse() {},
    foldApproval() {},
    setFocus() {},
    openTerminal() {},
    openTarget() {},
    openUrl() {},
    decide() {},
    answer() {},
    answerInTerminal() {},
    toggleSound() {},
    setVolume() {},
    setAutoClose() {},
    openSettingsWindow() {},
    blip() {},
    chooseOutfit() {},
    previewOutfit() {},
  };

  const header = buildHeader(actions);
  const closeBtn = header.el.querySelector(".close-btn");
  assert.ok(closeBtn);

  // When no pending approval, button is shown
  State.pendingApproval = null;
  header.sync();
  assert.equal(closeBtn.style.display, "");

  // When pending approval arrives, close button is hidden
  State.pendingApproval = { requestId: "req-1", pillId: "test", text: "Approve?" };
  header.sync();
  assert.equal(closeBtn.style.display, "none");

  // When pending approval is cleared, close button shows again
  State.pendingApproval = null;
  header.sync();
  assert.equal(closeBtn.style.display, "");
});
