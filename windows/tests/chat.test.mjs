// The chat view (src/views/chat.ts) on a fake DOM, through the real bridge:
// the model switcher asks for a provider's models only once it is picked and
// has a key, picking saves the settings, a streamed answer grows in place, the
// send button doubles as Stop, the transcript is saved as it changes, and the
// history list opens, deletes and re-opens the conversations before it.

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./fakedom.mjs";
import { calls, emit, internals, sent } from "./tauri.mjs";

installFakeDom();
const { buildPrompt, loadChatHistory } = await import("../src/views/chat.ts");
const { DEFAULT_SETTINGS, State } = await import("../src/core/state.ts");

/** What the mocked Rust side answers, by command. */
let answers;
const plainInvoke = internals.invoke;
internals.invoke = async (cmd, args) => {
  const result = await plainInvoke(cmd, args);
  if (cmd in answers) return typeof answers[cmd] === "function" ? answers[cmd](args) : answers[cmd];
  return result;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let view;
beforeEach(() => {
  calls.length = 0;
  answers = {};
  State.settings = { ...DEFAULT_SETTINGS, chatModels: {} };
  State.chatHistory = [];
  State.stateOverride = null;
  State.view = "prompt";
  State.droppedFile = null;
  view = buildPrompt(() => {});
  view.sync();
});

const $ = (cls) => view.el.querySelector(cls);
const chips = () => view.el.find(".picker-chip").map((c) => c.textContent);
const models = () => view.el.find(".picker-model").map((m) => m.textContent);

test("the model button shows the active provider's model", () => {
  assert.equal($(".model-name").textContent, "claude-opus-5");
  State.settings = { ...State.settings, chatProvider: "google" };
  view.sync();
  assert.equal($(".model-name").textContent, "gemini-2.0-flash");
  State.settings = { ...State.settings, chatProvider: "ollama" };
  view.sync();
  assert.equal($(".model-name").textContent, "Choose a model");
});

test("a provider without a key is never asked for its models", async () => {
  answers.secret_present = false;
  $(".model-btn").fire("click");
  await flush();
  assert.ok($(".chat-body").classList.contains("picking"));
  assert.deepEqual(chips(), ["Anthropic", "DeepSeek", "Google", "OpenAI", "OpenRouter"]);
  assert.deepEqual(sent("secret_present"), [{ key: "anthropic-api-key" }]);
  assert.deepEqual(sent("chat_models"), []);
  assert.match($(".picker-status").textContent, /No API key/);
});

test("with a key, the models are listed and picking one saves it", async () => {
  answers.secret_present = true;
  answers.chat_models = [
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  ];
  $(".model-btn").fire("click");
  await flush();
  assert.deepEqual(sent("chat_models"), [{ provider: "anthropic" }]);
  assert.deepEqual(models(), ["Claude Opus 5", "Claude Sonnet 5"]);
  view.el.find(".picker-model")[1].fire("click");
  assert.equal(State.settings.model, "claude-sonnet-5");
  assert.equal(sent("save_settings").at(-1).settings.model, "claude-sonnet-5");
  assert.ok(!$(".chat-body").classList.contains("picking"));
  assert.equal($(".model-name").textContent, "claude-sonnet-5");
});

test("switching provider saves it and asks the new provider only", async () => {
  answers.secret_present = (args) => args.key === "google-api-key";
  answers.chat_models = (args) => (args.provider === "google" ? [{ id: "gemini-2.5-flash", label: "gemini-2.5-flash" }] : []);
  $(".model-btn").fire("click");
  await flush();
  assert.deepEqual(sent("chat_models"), []);
  // By name, so adding a provider to the picker never moves this test's target.
  view.el.find(".picker-chip").find((c) => c.textContent === "Google").fire("click");
  await flush();
  assert.equal(State.settings.chatProvider, "google");
  assert.deepEqual(sent("chat_models"), [{ provider: "google" }]);
  // The saved model was not offered: the flash one is kept instead, and saved.
  assert.equal(State.settings.chatModels.google, "gemini-2.5-flash");
  assert.equal(sent("save_settings").at(-1).settings.chatModels.google, "gemini-2.5-flash");
  assert.deepEqual(models(), ["gemini-2.5-flash"]);
});

test("a local answer streams into one reply, then the finished text replaces it", async () => {
  let finish;
  answers.chat_send = () => new Promise((resolve) => (finish = resolve));
  const input = $(".chat-input");
  input.value = "hello";
  $(".send-btn").fire("click");
  await flush();
  view.sync(); // what State.notify() does in the island
  assert.ok($(".model-btn").disabled, "no switching mid-answer");
  assert.ok($(".typing"), "dots until the first visible text");

  emit("chat-delta", ""); // still thinking
  assert.ok($(".typing"));
  emit("chat-delta", "Hel");
  emit("chat-delta", "Hello **there**");
  view.sync(); // another view update mid-stream must not wipe the live answer
  assert.equal($(".typing"), null);
  const replies = view.el.find(".reply");
  assert.equal(replies.length, 1);
  assert.equal(replies[0].find("STRONG")[0].textContent, "there");

  finish({ text: "Hello **there**!" });
  await flush();
  view.sync();
  assert.equal(view.el.find(".reply").length, 1);
  assert.equal(view.el.find(".reply")[0].textContent, "Hello there!");
  assert.deepEqual(State.chatHistory.map((m) => m.role), ["user", "assistant"]);
  assert.ok(!$(".model-btn").disabled);
});

test("Stop abandons the answer on its way, and the question stays", async () => {
  let finish;
  answers.chat_send = () => new Promise((resolve) => (finish = resolve));
  const input = $(".chat-input");
  input.value = "a long one";
  $(".send-btn").fire("click");
  await flush();
  view.sync();
  assert.ok($(".typing"), "the dots are up while it runs");
  assert.ok($(".send-btn").classList.contains("stop"), "the send button is Stop now");

  $(".send-btn").fire("click");
  assert.equal(sent("chat_cancel").length, 1, "Rust is told to drop the answer");
  view.sync();
  assert.equal($(".typing"), null, "the dots go when the turn is abandoned");
  assert.deepEqual(State.chatHistory.map((m) => m.role), ["user"], "the question stays, the answer does not");
  assert.ok(!$(".send-btn").classList.contains("stop"), "and the button is Send again");

  // The answer lands anyway — after the Stop — and is dropped on the floor.
  finish({ text: "too late" });
  await flush();
  view.sync();
  assert.deepEqual(State.chatHistory.map((m) => m.role), ["user"]);
  assert.equal(view.el.find(".reply").length, 0);
  assert.ok(!$(".model-btn").disabled, "the chat is ready for the next question");
});

test("the chat comes back as it was left, and every turn is saved", async () => {
  answers.chat_history = [
    {
      id: "2026-10-11 09:00:00",
      updatedAt: "2026-10-11 09:00:00",
      messages: [
        { role: "user", content: "earlier question" },
        { role: "assistant", content: "earlier answer" },
      ],
    },
  ];
  await loadChatHistory();
  view.sync();
  assert.deepEqual(State.chatHistory.map((m) => m.role), ["user", "assistant"]);
  assert.equal(view.el.find(".bubble")[0].textContent, "earlier question");
  assert.equal(view.el.find(".reply")[0].textContent, "earlier answer");

  // A turn on top of it saves the whole transcript, once without the answer
  // and once with it.
  answers.chat_send = { text: "new answer" };
  const input = $(".chat-input");
  input.value = "new question";
  $(".send-btn").fire("click");
  await flush();
  const saved = sent("chat_save");
  assert.equal(saved.length, 2, "once for the question, once for the answer");
  assert.deepEqual(saved[0].messages.map((m) => m.role), ["user", "assistant", "user"]);
  assert.deepEqual(saved[1].messages.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  assert.equal(saved[1].messages.at(-1).content, "new answer");
});

const twoConversations = [
  { id: "b", updatedAt: "2026-10-11 16:04:22", messages: [{ role: "user", content: "the second question" }] },
  {
    id: "a",
    updatedAt: "2026-10-10 09:00:00",
    messages: [{ role: "user", content: "the first question" }, { role: "assistant", content: "an answer" }],
  },
];

test("the history lists the conversations before this one, newest first", async () => {
  answers.chat_history = twoConversations;
  await loadChatHistory();
  view.sync();
  const log = $(".chat-log");

  $(".history-btn").fire("click");
  const body = $(".chat-body");
  assert.ok(body.classList.contains("history"), "the list takes the log's place");
  const rows = view.el.find(".history-row");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].find(".history-open-name")[0].textContent, "the second question");
  assert.equal(rows[1].find(".history-open-name")[0].textContent, "the first question");
  assert.ok(rows[0].find(".picker-model")[0].classList.contains("on"), "the one on screen is marked");
  assert.equal(view.el.find(".history-delete").length, 2, "each one can be removed");

  // And the button folds it away again.
  $(".history-btn").fire("click");
  assert.ok(!body.classList.contains("history"));
  assert.equal(log, $(".chat-log"), "the log was only hidden, not rebuilt");
});

test("opening an older conversation asks Rust for it and follows what is current", async () => {
  answers.chat_history = twoConversations;
  await loadChatHistory();
  view.sync();
  $(".history-btn").fire("click");

  // Rust is the one that decides: after chat_open, the first conversation in the
  // store is the opened one, and the page draws it.
  answers.chat_history = [...twoConversations].reverse();
  view.el.find(".history-row")[1].find(".picker-model")[0].fire("click");
  await flush();
  assert.deepEqual(sent("chat_open"), [{ id: "a" }]);
  view.sync();
  assert.equal(view.el.find(".bubble")[0].textContent, "the first question", "the transcript follows");
  assert.deepEqual(State.chatHistory.map((m) => m.content), ["the first question", "an answer"]);
});

test("a conversation can be removed from the list", async () => {
  answers.chat_history = [{ id: "b", updatedAt: "2026-10-11 16:04:22", messages: [{ role: "user", content: "only one" }] }];
  await loadChatHistory();
  view.sync();
  $(".history-btn").fire("click");
  view.el.find(".history-delete")[0].fire("click");
  await flush();
  assert.deepEqual(sent("chat_delete"), [{ id: "b" }]);
  assert.ok(sent("chat_history").length >= 2, "and the list is read again afterwards");
});

test("an empty history says so instead of showing nothing", async () => {
  answers.chat_history = [];
  await loadChatHistory();
  view.sync();
  $(".history-btn").fire("click");
  assert.equal(view.el.find(".history-row").length, 0);
  assert.match(view.el.find(".history-empty")[0].textContent, /No conversations yet/);
});

test("never two panels at once: each one carries its own marker", async () => {
  // The two share the `picker` box, so a CSS rule that matched every `.picker`
  // showed the history behind the model picker (until 2026-10-11). The markers
  // are what the stylesheet shows and hides; the fake DOM has no CSS engine, so
  // keeping them apart and swapping the body classes is what stands in for one.
  const models = view.el.find(".picker-models");
  const history = view.el.find(".picker-history");
  assert.equal(models.length, 1);
  assert.equal(history.length, 1);
  assert.notEqual(models[0], history[0], "two panels, not one twice");
  for (const panel of [models[0], history[0]]) assert.ok(panel.classList.contains("picker"));

  answers.chat_history = [];
  $(".history-btn").fire("click");
  const body = $(".chat-body");
  assert.ok(body.classList.contains("history"));

  // Opening the model picker takes the space: the history marker goes with it.
  $(".model-btn").fire("click");
  assert.ok(body.classList.contains("picking"));
  assert.ok(!body.classList.contains("history"), "only one panel is ever marked");
  // And the other way round.
  $(".history-btn").fire("click");
  assert.ok(body.classList.contains("history"));
  assert.ok(!body.classList.contains("picking"), "the model picker closed behind it");
});

test("attached window context shows as a chip and is passed with the first question", async () => {
  State.promptContext = {
    kind: "window",
    appName: "Visual Studio Code",
    title: "main.rs - dapinci",
    url: undefined,
  };
  view.sync();

  const chip = $(".chip");
  assert.ok(chip);
  assert.equal(chip.textContent.trim(), "Visual Studio Code");

  answers.chat_send = { text: "I see your code!" };
  const input = $(".chat-input");
  input.value = "What is this?";
  $(".send-btn").fire("click");
  await flush();

  assert.equal(sent("chat_send").length, 1);
  assert.deepEqual(sent("chat_send")[0], {
    query: "What is this?",
    context: {
      kind: "window",
      appName: "Visual Studio Code",
      title: "main.rs - dapinci",
      url: undefined,
    },
  });
});

