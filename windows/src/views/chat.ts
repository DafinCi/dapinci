// Chat view — DOM port of PromptView / ChatBubble / TypingDotsView /
// ModelPickerView from IslandViewContent.swift.
//
// Answers are rendered as Markdown (markdown.ts). A local model streams its
// answer: Rust sends `chat-delta` events with the text visible so far. The
// model name above the text field opens the picker: provider chips, then the
// models of the chosen provider, asked for only once it is picked.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { renderMarkdown } from "./markdown";
import { Bridge, onEvent, type ChatContext, type ModelInfo, type StoredConversation } from "../core/bridge";
import {
  activeModel, pickModel, providerDef, visibleProviders, withModel, type ProviderDef,
} from "../core/providers";
import { Sound } from "../core/sound";
import { State, type ChatMessage } from "../core/state";
import type { ViewHost } from "./views";
import { N_, language, t, tl } from "../i18n/i18n";
import { createMiniBot, pruneMiniBots } from "../ipin/minibots";

const STRINGS = {
  placeholderFirst: N_("Ask me anything…"),
  placeholderNext: N_("Continue…"),
  send: N_("Send"),
  stop: N_("Cancel"),
  switchModel: N_("Switch provider or model"),
  noModel: N_("Choose a model"),
  loading: N_("Loading models…"),
  noKey: N_("No API key — add it in Settings."),
  openSettings: N_("Open Settings"),
  history: N_("History"),
  noChats: N_("No conversations yet."),
  newConversation: N_("New conversation"),
  copyAnswer: N_("Copy answer"),
};

let nextId = 1;

function bubble(message: ChatMessage): HTMLElement {
  if (message.role === "user") {
    return h(
      "div",
      { class: "chat-row user" },
      h("div", { class: "bubble user-bubble", text: message.content }),
    );
  }
  const reply = h("div", { class: "reply" });
  renderMarkdown(reply, message.content);
  const botIcon = createMiniBot({
    id: `ipin_chat_${message.id}`,
    name: "ipin",
    color: "#a78bfa",
    state: "idle",
    stepIndex: 0,
    steps: [],
    source: "agent",
    isIntegration: false,
  }, 20);
  const copyBtn = h("button", {
    class: "reply-copy-btn",
    title: t(STRINGS.copyAnswer),
    "aria-label": t(STRINGS.copyAnswer),
    onclick: (e: Event) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(message.content);
      copyBtn.classList.add("done");
      clear(copyBtn);
      copyBtn.append(svg(ICONS.check, 10, { stroke: 2.2 }));
      window.setTimeout(() => {
        copyBtn.classList.remove("done");
        clear(copyBtn);
        copyBtn.append(svg(ICONS.copy, 10));
      }, 1600);
    },
  }, svg(ICONS.copy, 10));
  const header = h("div", { class: "assistant-header" },
    botIcon,
    h("span", { class: "reply-name", text: "ipin" }),
    h("div", { class: "grow" }),
    copyBtn,
  );
  return h("div", { class: "chat-row assistant" }, header, reply);
}

function typingDots(): HTMLElement {
  const botIcon = createMiniBot({
    id: "ipin_chat_thinking",
    name: "ipin",
    color: "#a78bfa",
    state: "thinking",
    stepIndex: 0,
    steps: [],
    source: "agent",
    isIntegration: false,
  }, 20);
  const header = h("div", { class: "assistant-header" },
    botIcon,
    h("span", { class: "reply-name", text: "ipin" }),
  );
  return h(
    "div",
    { class: "chat-row assistant thinking" },
    header,
    h("div", { class: "typing" }, h("i"), h("i"), h("i")),
  );
}

function contextLabel(ctx: typeof State.promptContext): string {
  if (!ctx) return "";
  if (ctx.kind === "file") return ctx.name;
  if (ctx.kind === "window") {
    if (ctx.url) {
      try {
        const u = new URL(ctx.url);
        if (u.hostname) return `${ctx.appName} · ${u.hostname}`;
      } catch {}
    }
    return ctx.appName;
  }
  return "";
}

/** The coloured chip showing what the question is about (a dropped file or active window). */
function contextChip(label: string, onDismiss?: () => void): HTMLElement {
  const chip = h("div", { class: "chip" }, h("i", { class: "chip-dot" }), h("span", { text: label }));
  if (onDismiss) {
    const closeBtn = h(
      "button",
      {
        class: "chip-close",
        title: t("Remove"),
        onclick: (e: Event) => {
          e.stopPropagation();
          onDismiss();
        },
      },
      svg(ICONS.xmark, 8, { stroke: 2 }),
    );
    chip.append(closeBtn);
  }
  requestAnimationFrame(() => chip.classList.add("settled"));
  return chip;
}

function saveSettings() {
  void Bridge.saveSettings(State.settings);
}

/**
 * The saved conversations, newest first: the one on screen is the first, and the
 * rest are what the history list offers.
 */
let conversations: StoredConversation[] = [];
/** Set while the view is built, so a reload can redraw an open list. */
let redrawHistory: (() => void) | null = null;

/**
 * The chat as it was left: what the island draws at launch. The model's own
 * context comes back on the Rust side (chat.rs adopt), from the same file.
 */
export async function loadChatHistory() {
  conversations = (await Bridge.chatHistory()) ?? [];
  State.chatHistory = (conversations[0]?.messages ?? []).map((m) => ({
    id: nextId++,
    role: m.role,
    content: m.content,
  }));
  redrawHistory?.();
  State.notify();
}

/** Saves the transcript on screen — after every turn, a stopped one included. */
function saveChatHistory() {
  void Bridge.chatSave(State.chatHistory.map(({ role, content }) => ({ role, content })));
}

// ── Model picker ──────────────────────────────────────────────────────────────

interface Picker {
  el: HTMLElement;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

/** Provider chips, then the chosen provider's models — ModelPickerView. */
function buildPicker(onChange: () => void): Picker {
  const chips = h("div", { class: "picker-chips" });
  const list = h("div", { class: "picker-list" });
  // The marker class is what the CSS shows and hides: the two panels share the
  // `picker` box, and a rule that matched every `.picker` would show both at once
  // (it did, until 2026-10-11).
  const el = h("div", { class: "picker picker-models" }, chips, h("div", { class: "picker-rule" }), list);

  /** Models already asked for, by provider; a model server is asked again each time. */
  const cache = new Map<string, ModelInfo[]>();
  let isOpen = false;
  let request = 0;

  function drawChips() {
    clear(chips);
    for (const p of visibleProviders(State.settings)) {
      const on = p.id === State.settings.chatProvider;
      const chip = h(
        "button",
        { class: on ? "picker-chip on" : "picker-chip", style: `--accent:${p.accent}` },
        h("i", { class: "picker-dot" }),
        h("span", { text: t(p.name) }),
      );
      chip.addEventListener("click", () => {
        if (p.id === State.settings.chatProvider) return;
        State.settings = { ...State.settings, chatProvider: p.id };
        saveSettings();
        Sound.play("pop");
        drawChips();
        void loadModels();
        onChange();
      });
      chips.append(chip);
    }
  }

  function status(text: string, withSettings = false) {
    clear(list);
    const line = h("div", { class: "picker-status", text });
    if (withSettings) {
      line.append(
        h("button", {
          class: "picker-link",
          text: tl(STRINGS.openSettings),
          onclick: () => void Bridge.openSettingsWindow(),
        }),
      );
    }
    list.append(line);
  }

  function drawModels(p: ProviderDef, models: ModelInfo[]) {
    clear(list);
    const current = activeModel(State.settings);
    for (const m of models) {
      const on = m.id === current;
      const row = h(
        "button",
        { class: on ? "picker-model on" : "picker-model", style: `--accent:${p.accent}`, title: m.id },
        h("span", { class: "picker-model-name", text: m.label }),
        on ? svg(ICONS.check, 11, { stroke: 2.2 }) : null,
      );
      row.addEventListener("click", () => {
        State.settings = withModel(State.settings, p.id, m.id);
        saveSettings();
        Sound.play("blip");
        close();
      });
      list.append(row);
    }
    list.querySelector(".picker-model.on")?.scrollIntoView({ block: "nearest" });
  }

  async function loadModels() {
    const p = providerDef(State.settings.chatProvider);
    const ticket = ++request;
    const cached = p.urlField ? undefined : cache.get(p.id);
    if (cached) {
      drawModels(p, cached);
      return;
    }
    // Nothing is asked of a provider that has no key yet.
    if (p.key && !(await Bridge.secretPresent(p.key))) {
      if (ticket === request) status(t(STRINGS.noKey), true);
      return;
    }
    if (ticket !== request) return;
    status(t(STRINGS.loading));
    try {
      const models = await Bridge.chatModels(p.id);
      if (ticket !== request) return;
      if (!p.urlField) cache.set(p.id, models);
      const keep = pickModel(p, models.map((m) => m.id), activeModel(State.settings));
      if (keep && keep !== activeModel(State.settings)) {
        State.settings = withModel(State.settings, p.id, keep);
        saveSettings();
        onChange();
      }
      drawModels(p, models);
    } catch (err) {
      if (ticket === request) status(String(err).replace(/^Error:\s*/, ""), Boolean(p.key));
    }
  }

  function open() {
    isOpen = true;
    el.classList.add("on");
    drawChips();
    onChange();
    void loadModels();
  }

  function close() {
    isOpen = false;
    request++;
    el.classList.remove("on");
    onChange();
  }

  return {
    el,
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}

// ── View ──────────────────────────────────────────────────────────────────────

export function buildPrompt(onHeightChange: () => void): ViewHost {
  const chipRow = h("div", { class: "chip-row" });
  const log = h("div", { class: "chat-log" });
  const input = h("textarea", {
    class: "chat-input",
    placeholder: t(STRINGS.placeholderFirst),
    spellcheck: "false",
    rows: 1,
  }) as HTMLTextAreaElement;

  function resizeInput() {
    input.style.height = "auto";
    const nextH = Math.min(input.scrollHeight, 76);
    input.style.height = `${Math.max(22, nextH)}px`;
  }
  input.addEventListener("input", resizeInput);

  const send = h("button", { class: "send-btn", title: t(STRINGS.send) }, svg(ICONS.arrowUp, 11));
  const bar = h("div", { class: "chat-bar" }, input, send);

  const newChatBtn = h(
    "button",
    { class: "new-chat-btn", title: tl(STRINGS.newConversation) },
    svg(ICONS.plus, 10),
    h("span", { text: tl("New") }),
  );
  newChatBtn.addEventListener("click", async () => {
    if (sending) return;
    if (picker.isOpen) picker.close();
    if (historyOpen) closeHistory();
    await Bridge.chatReset();
    State.promptContext = null;
    State.droppedFile = null;
    live = null;
    renderedCount = -1;
    await loadChatHistory();
    pruneMiniBots();
    input.value = "";
    resizeInput();
    Sound.play("pop");
    State.notify();
    onHeightChange();
    input.focus();
  });

  const modelDot = h("i", { class: "model-dot" });
  const modelName = h("span", { class: "model-name" });
  const modelBtn = h(
    "button",
    { class: "model-btn", title: tl(STRINGS.switchModel) },
    modelDot,
    modelName,
    svg(ICONS.chevronUpDown, 9, { stroke: 2 }),
  );
  const historyBtn = h("button", { class: "model-btn history-btn", title: t(STRINGS.history) }, svg(ICONS.stack, 11));
  const modelRow = h("div", { class: "model-row" }, newChatBtn, h("div", { class: "grow" }), modelBtn, historyBtn);

  const body = h("div", { class: "chat-body" });
  const picker = buildPicker(() => {
    body.classList.toggle("picking", picker.isOpen);
    drawModelButton();
  });

  // ── History: the conversations kept in the store, newest first ──────────────
  const historyList = h("div", { class: "picker-list" });
  const historyPanel = h("div", { class: "picker picker-history" }, h("div", { class: "picker-rule" }), historyList);
  let historyOpen = false;

  /** The stored stamp ("YYYY-MM-DD HH:MM:SS", local time) as a short date. */
  function when(stamp: string): string {
    const date = new Date(stamp.replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(language());
  }

  function drawHistory() {
    clear(historyList);
    if (conversations.length === 0) {
      historyList.append(h("div", { class: "history-empty", text: t(STRINGS.noChats) }));
      return;
    }
    conversations.forEach((c, index) => {
      // A conversation is named by the first thing asked in it.
      const asked = c.messages.find((m) => m.role === "user")?.content ?? "";
      const label = asked.replace(/\s+/g, " ").trim().slice(0, 60) || t(STRINGS.noChats);
      const open = h(
        "button",
        { class: index === 0 ? "picker-model on" : "picker-model", title: asked },
        h("span", { class: "history-open-name", text: label }),
        h("span", { class: "history-date", text: when(c.updatedAt) }),
      );
      open.addEventListener("click", () => void openConversation(c.id));
      const remove = h("button", { class: "history-delete", title: t("Remove") }, svg(ICONS.xmark, 9, { stroke: 2 }));
      remove.addEventListener("click", () => void removeConversation(c.id));
      historyList.append(h("div", { class: "history-row" }, open, remove));
    });
  }

  /** Anything the list itself cannot do is said in the list, where the eye is. */
  function historyProblem(err: unknown) {
    clear(historyList);
    historyList.append(h("div", { class: "history-empty", text: String(err).replace(/^Error:\s*/, "") }));
    Sound.play("error");
  }

  async function openConversation(id: string) {
    try {
      // Rust makes it current and gives the model its turns back; the page then
      // draws whatever is current, the same way it does at launch.
      await Bridge.chatOpen(id);
      // A different transcript now, even when it has the same number of messages:
      // the redraw cannot be left to the count.
      live = null;
      renderedCount = -1;
      await loadChatHistory();
    } catch (err) {
      historyProblem(err);
    }
  }

  async function removeConversation(id: string) {
    try {
      await Bridge.chatDelete(id);
      live = null;
      renderedCount = -1;
      await loadChatHistory();
    } catch (err) {
      historyProblem(err);
    }
  }

  function openHistory() {
    if (sending) return;
    if (picker.isOpen) picker.close();
    historyOpen = true;
    body.classList.add("history");
    drawHistory();
    onHeightChange();
  }

  function closeHistory() {
    historyOpen = false;
    body.classList.remove("history");
    onHeightChange();
  }

  redrawHistory = () => {
    if (historyOpen) drawHistory();
  };

  historyBtn.addEventListener("click", () => {
    if (historyOpen) closeHistory();
    else openHistory();
  });

  body.append(chipRow, log, picker.el, historyPanel, modelRow, bar);

  const el = h("div", { class: "view" }, h("div", { class: "card wash chat-card" }, body));
  (el.querySelector(".card") as HTMLElement).style.setProperty("--wash", "rgba(99,102,241,0.5)");

  let sending = false;
  let renderedCount = -1;
  /** Bumped when a turn is abandoned: an answer from before it is dropped. */
  let ticket = 0;
  /** What the send button was last drawn as; null before the first draw. */
  let drawnSending: boolean | null = null;
  // A local model answers token by token: where its text so far is shown.
  let live: HTMLElement | null = null;

  function drawModelButton() {
    const p = providerDef(State.settings.chatProvider);
    modelDot.style.background = p.accent;
    modelName.textContent = activeModel(State.settings) || t(STRINGS.noModel);
    modelBtn.classList.toggle("open", picker.isOpen);
    modelBtn.disabled = sending;
  }

  modelBtn.addEventListener("click", () => {
    if (sending) return;
    if (picker.isOpen) picker.close();
    else {
      closeHistory();
      picker.open();
    }
  });

  void onEvent<string>("chat-delta", (text) => {
    if (!sending || !text) return; // nothing visible yet: the dots stay
    if (!live) {
      live = h("div", { class: "reply" });
      log.querySelector(".typing")?.parentElement?.remove();
      const botIcon = createMiniBot({
        id: "ipin_chat_streaming",
        name: "ipin",
        color: "#a78bfa",
        state: "working",
        stepIndex: 0,
        steps: [],
        source: "agent",
        isIntegration: false,
      }, 20);
      const header = h("div", { class: "assistant-header" },
        botIcon,
        h("span", { class: "reply-name", text: "ipin" }),
      );
      log.append(h("div", { class: "chat-row assistant streaming" }, header, live));
    }
    renderMarkdown(live, text);
    log.scrollTop = log.scrollHeight;
  });

  async function submit() {
    const query = input.value.trim();
    if (!query || sending) return;
    if (picker.isOpen) picker.close();
    input.value = "";
    resizeInput();
    sending = true;
    newChatBtn.disabled = true;
    const mine = ++ticket;
    drawModelButton();
    drawSendButton();
    Sound.play("send");

    State.chatHistory.push({ id: nextId++, role: "user", content: query });
    State.stateOverride = "thinking";
    State.notify();
    onHeightChange();
    // The question reaches the disk before the answer exists: a crash, or a
    // Stop, leaves the question in the transcript rather than an empty chat.
    saveChatHistory();

    const ctx = State.promptContext;
    const file = State.droppedFile;
    let context: ChatContext | null = null;
    if (State.chatHistory.length === 1) {
      if (ctx?.kind === "window") {
        context = { kind: "window", appName: ctx.appName, title: ctx.title, url: ctx.url };
      } else if (ctx?.kind === "file" && ctx.path) {
        context = { kind: "file", name: ctx.name, path: ctx.path };
      } else if (file) {
        context = { kind: "file", name: file.name, path: file.path };
      }
    }

    try {
      const reply = await Bridge.chatSend(query, context);
      if (mine !== ticket) return; // stopped while the answer was on its way
      State.chatHistory.push({ id: nextId++, role: "assistant", content: reply.text });
      State.stateOverride = null;
      Sound.play("finish");
    } catch (err) {
      if (mine !== ticket) return; // stopped: not an error to show
      State.stateOverride = null;
      State.noteMessage = String(err).replace(/^Error:\s*/, "");
      State.view = "note";
      Sound.play("error");
    } finally {
      if (mine === ticket) {
        sending = false;
        newChatBtn.disabled = false;
        live = null;
        renderedCount = -1; // the finished answer replaces the streamed one
        saveChatHistory();
        drawModelButton();
        drawSendButton();
        State.notify();
        onHeightChange();
        input.focus();
      }
    }
  }

  /** The send button doubles as Stop while an answer is on its way. */
  function drawSendButton() {
    // The title follows the language, so it is set every time; the icon is only
    // redrawn when the button turns into Stop or back.
    send.title = t(sending ? STRINGS.stop : STRINGS.send);
    if (drawnSending === sending) return;
    drawnSending = sending;
    clear(send);
    send.append(svg(sending ? ICONS.stop : ICONS.arrowUp, sending ? 9 : 11));
    send.classList.toggle("stop", sending);
  }

  /**
   * Stop. The answer on its way is abandoned: Rust drops it when it lands
   * (chat.rs), the transcript keeps the question, and the chat is ready again.
   */
  function stop() {
    if (!sending) return;
    ticket++;
    sending = false;
    newChatBtn.disabled = false;
    live = null;
    renderedCount = -1; // the dots and the streamed text go on the next sync
    State.stateOverride = null;
    void Bridge.chatCancel();
    saveChatHistory();
    Sound.play("close");
    drawSendButton();
    State.notify();
    onHeightChange();
    input.focus();
  }

  send.addEventListener("click", () => {
    if (sending) stop();
    else void submit();
  });
  input.addEventListener("keydown", (e) => {
    const evt = e as KeyboardEvent;
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      void submit();
    } else if (evt.key === "Escape" && picker.isOpen) {
      evt.preventDefault();
      picker.close();
    }
    evt.stopPropagation(); // Escape closes the island, not the chat
  });

  return {
    el,
    sync() {
      const ctx = State.promptContext;
      const file = State.droppedFile;
      const wantChip = contextLabel(ctx) || file?.name || "";
      if (chipRow.dataset.label !== wantChip) {
        chipRow.dataset.label = wantChip;
        clear(chipRow);
        if (wantChip) {
          chipRow.append(
            contextChip(wantChip, () => {
              State.promptContext = null;
              State.droppedFile = null;
              State.notify();
              onHeightChange();
            }),
          );
        }
      }

      const thinking = State.stateOverride === "thinking";
      const count = State.chatHistory.length + (thinking ? 0.5 : 0);
      if (count !== renderedCount && !live) {
        renderedCount = count;
        clear(log);
        for (const m of State.chatHistory) log.append(bubble(m));
        if (thinking) log.append(typingDots());
        pruneMiniBots();
        log.scrollTop = log.scrollHeight;
      }

      // Leaving the chat folds the picker and the history away.
      if (State.view !== "prompt" && picker.isOpen) picker.close();
      if (State.view !== "prompt" && historyOpen) closeHistory();
      drawModelButton();
      drawSendButton();

      input.placeholder = t(State.chatHistory.length === 0 ? STRINGS.placeholderFirst : STRINGS.placeholderNext);
      input.disabled = sending;
      newChatBtn.disabled = sending;
    },
    focus() {
      input.focus();
      input.select();
    },
  };
}
