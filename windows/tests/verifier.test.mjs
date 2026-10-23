// Verification Pill (`pill_verifier`), `State` verification lifecycle,
// `VerificationCardView` (`buildVerificationCard`), and `BotEngine` reactions.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { sent } from "./tauri.mjs";
import { installFakeDom } from "./fakedom.mjs";
import {
  VERIFIER_PILL_ID,
  formatVerifierPillLabel,
  pillDefinition,
} from "../src/core/pills.ts";
import { DEFAULT_SETTINGS, State } from "../src/core/state.ts";
import { buildVerificationCard } from "../src/views/views.ts";
import { BotEngine } from "../src/ipin/engine.ts";

installFakeDom();

const SAMPLE_WORKSPACE = {
  path: "C:\\projects\\dapinci",
  name: "dapinci",
  branch: "main",
  projectType: "NodeTs",
  packageManager: "npm",
};

const PASSED_REPORT = {
  workspace: SAMPLE_WORKSPACE,
  trigger: "AutoSave",
  passed: true,
  cancelled: false,
  totalDurationMs: 1420,
  stages: [
    {
      stage: "Stage1Ratchet",
      status: "passed",
      durationMs: 15,
      summary: "0 ratchet violations",
      errors: [],
    },
    {
      stage: "Stage2Typecheck",
      status: "passed",
      durationMs: 650,
      summary: "0 type errors",
      errors: [],
    },
    {
      stage: 3,
      name: "Stage 3: Unit Tests",
      status: "passed",
      durationMs: 755,
      errors: [],
    },
  ],
  aiRepairPayload: null,
};

const FAILED_REPORT = {
  workspace: SAMPLE_WORKSPACE,
  trigger: "AgentHook",
  passed: false,
  cancelled: false,
  totalDurationMs: 680,
  stages: [
    {
      stage: 1,
      name: "Stage 1: Lint Ratchet & Anti-Cheat",
      status: "passed",
      durationMs: 12,
      errors: [],
    },
    {
      stage: 2,
      name: "Stage 2: Typecheck (Incremental)",
      status: "failed",
      durationMs: 668,
      errors: [
        "src/app.ts(14,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        "src/app.ts(22,9): error TS2304: Cannot find name 'foo'.",
      ],
    },
    {
      stage: 3,
      name: "Stage 3: Unit Tests",
      status: "skipped",
      durationMs: 0,
      errors: [],
    },
  ],
  aiRepairPayload:
    "<dapinci_verification_failure>\nStage: Stage2Typecheck\nsrc/app.ts(14,5): error TS2322\n</dapinci_verification_failure>",
};

beforeEach(() => {
  State.tasks = [];
  State.focusId = null;
  State.os = "windows";
  State.settings = { ...DEFAULT_SETTINGS };
  State.workspace = null;
  State.verificationStatus = "idle";
  State.verificationReport = null;
  State.stateOverride = null;
});

test("formatVerifierPillLabel formats unbound, verifying, failed, verified, and idle states", () => {
  assert.equal(formatVerifierPillLabel(null, "idle", null), "⚪ Unbound");
  assert.equal(
    formatVerifierPillLabel(SAMPLE_WORKSPACE, "idle", null),
    "⚪ dapinci:main",
  );
  assert.equal(
    formatVerifierPillLabel(SAMPLE_WORKSPACE, "verifying", null),
    "🟡 Verifying...",
  );
  assert.equal(
    formatVerifierPillLabel(SAMPLE_WORKSPACE, "verified", PASSED_REPORT),
    "🟢 dapinci:main",
  );
  assert.equal(
    formatVerifierPillLabel(SAMPLE_WORKSPACE, "failed", FAILED_REPORT),
    "🔴 2 Errors",
  );
  assert.equal(
    formatVerifierPillLabel(
      { ...SAMPLE_WORKSPACE, branch: null },
      "verified",
      PASSED_REPORT,
    ),
    "🟢 dapinci",
  );
});

test("when verificationEnabled is false (default), pill_verifier is dormant and hidden from Island", () => {
  State.loadIntegrationTasks();
  assert.equal(State.settings.verificationEnabled, false);

  State.setWorkspace(SAMPLE_WORKSPACE);
  const pill = State.tasks.find((t) => t.id === VERIFIER_PILL_ID);
  assert.equal(pill, undefined, "pill_verifier must NOT be in tasks when verification is disabled");
});

test("State.setWorkspace, beginVerification, and finishVerification update pill_verifier when enabled", () => {
  State.settings.verificationEnabled = true;
  State.loadIntegrationTasks();
  assert.equal(pillDefinition(VERIFIER_PILL_ID)?.id, VERIFIER_PILL_ID);

  State.setWorkspace(SAMPLE_WORKSPACE);
  const pill = State.tasks.find((t) => t.id === VERIFIER_PILL_ID);
  assert.ok(pill, "pill_verifier is added when workspace is bound and verification is enabled");
  assert.equal(pill.name, "⚪ dapinci:main");
  assert.equal(pill.state, "idle");

  State.beginVerification({ workspace: SAMPLE_WORKSPACE, trigger: "Manual" });
  assert.equal(State.verificationStatus, "verifying");
  assert.equal(pill.name, "🟡 Verifying...");
  assert.equal(pill.state, "searching");
  assert.equal(pill.color, "#F5A524");

  State.finishVerification(PASSED_REPORT);
  assert.equal(State.verificationStatus, "verified");
  assert.equal(pill.name, "🟢 dapinci:main");
  assert.equal(pill.state, "finished");
  assert.equal(pill.pillBadge, "finished");

  State.finishVerification(FAILED_REPORT);
  assert.equal(State.verificationStatus, "failed");
  assert.equal(pill.name, "🔴 2 Errors");
  assert.equal(pill.state, "error");
  assert.equal(pill.pillBadge, "error");
});

test("VerificationCardView renders stages, errors, Copy Error for AI, and Re-verify", async () => {
  let clipboardText = "";
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: {
      writeText: async (txt) => {
        clipboardText = txt;
      },
    },
    configurable: true,
  });

  const card = buildVerificationCard();
  State.setWorkspace(SAMPLE_WORKSPACE);
  State.finishVerification(PASSED_REPORT);
  card.sync();

  const passedText = card.el.textContent;
  assert.ok(passedText.includes("dapinci"));
  assert.ok(passedText.includes("main"));
  assert.ok(passedText.includes("1.4s"));
  assert.ok(passedText.includes("Stage 1: Lint Ratchet & Anti-Cheat"));
  assert.ok(passedText.includes("Stage 2: Typecheck (Incremental)"));
  assert.ok(passedText.includes("Stage 3: Unit Tests"));
  assert.ok(passedText.includes("✅"));

  // Switch to failed report
  State.finishVerification(FAILED_REPORT);
  card.sync();
  const failedText = card.el.textContent;
  assert.ok(failedText.includes("❌"));
  assert.ok(failedText.includes("⏭️"));
  assert.ok(failedText.includes("error TS2322"));

  const buttons = card.el.querySelector(".verifier-actions").children;
  const [copyBtn, reverifyBtn] = buttons;
  assert.equal(copyBtn.style.display, "");

  copyBtn.fire("click");
  await Promise.resolve();
  assert.equal(clipboardText, FAILED_REPORT.aiRepairPayload);
  assert.ok(copyBtn.textContent.includes("Copied! ✓"));

  const beforeTrigger = sent("trigger_verification").length;
  reverifyBtn.fire("click");
  assert.equal(sent("trigger_verification").length, beforeTrigger + 1);
});

test("BotEngine.applyVerificationStatus maps verification status to states and emotes", () => {
  const bot = new BotEngine();
  bot.applyVerificationStatus("verifying");
  assert.equal(bot.state, "searching");

  bot.applyVerificationStatus("verified");
  assert.equal(bot.state, "finished");
  assert.equal(bot.eyeOverride, "star");

  bot.applyVerificationStatus("failed");
  assert.equal(bot.state, "error");
  assert.equal(bot.eyeOverride, "squint");

  bot.applyVerificationStatus("idle");
  assert.equal(bot.state, "idle");
});
