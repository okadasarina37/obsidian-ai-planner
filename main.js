"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AIPlannerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  provider: "custom",
  interfaceLanguage: "auto",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  customHeaders: "{}",
  temperature: 0.3,
  maxTokens: 1800,
  historyDays: 14,
  focusMinutes: 25,
  studyFolder: "06_Todo/\u5B66\u4E60",
  workFolder: "01_\u9879\u76EE/\u5DE5\u4F5C\u8BA1\u5212"
};
var PROVIDERS = {
  custom: { label: "Custom OpenAI-compatible / \u81EA\u5B9A\u4E49\u517C\u5BB9\u63A5\u53E3", baseUrl: "", model: "" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  claude: { label: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  glm: { label: "Zhipu GLM / \u667A\u8C31", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  kimi: { label: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" }
};
async function requestPlanCompletion(settings, baseUrl, headers, system, user) {
  if (settings.provider === "claude") {
    if (settings.apiKey) headers["x-api-key"] = settings.apiKey;
    headers["anthropic-version"] ??= "2023-06-01";
    return (0, import_obsidian.requestUrl)({
      url: `${baseUrl}/messages`,
      method: "POST",
      headers,
      body: JSON.stringify({ model: settings.model, max_tokens: settings.maxTokens, temperature: settings.temperature, system, messages: [{ role: "user", content: user }] }),
      throw: false
    });
  }
  if (settings.provider === "gemini") {
    const key = settings.apiKey ? `?key=${encodeURIComponent(settings.apiKey)}` : "";
    return (0, import_obsidian.requestUrl)({
      url: `${baseUrl}/models/${encodeURIComponent(settings.model)}:generateContent${key}`,
      method: "POST",
      headers,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: settings.temperature, maxOutputTokens: settings.maxTokens, responseMimeType: "application/json" } }),
      throw: false
    });
  }
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  return (0, import_obsidian.requestUrl)({
    url: `${baseUrl}/chat/completions`,
    method: "POST",
    headers,
    body: JSON.stringify({ model: settings.model, temperature: settings.temperature, max_tokens: settings.maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    throw: false
  });
}
function completionText(provider, response) {
  const json = response;
  if (provider === "claude") {
    const content = json.content;
    return content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
  }
  if (provider === "gemini") {
    const candidates = json.candidates;
    return candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  }
  const choices = json.choices;
  return choices?.[0]?.message?.content;
}
var AIPlannerPlugin = class extends import_obsidian.Plugin {
  pluginSettings;
  focusStatusEl;
  focusMiniEl;
  finishingFocus = false;
  focusTimerOpen = false;
  miniDragging = false;
  miniMoved = false;
  miniStartX = 0;
  miniStartY = 0;
  miniStartLeft = 0;
  miniStartTop = 0;
  async onload() {
    this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new AIPlannerSettingTab(this.app, this));
    this.addCommand({
      id: "create-ai-plan",
      name: "Create AI plan",
      callback: () => new PlanInputModal(this.app, this).open()
    });
    this.addCommand({ id: "start-focus-session", name: "Start focus session", callback: () => this.openFocusForActiveNote() });
    this.addCommand({ id: "resume-focus-session", name: "Resume focus session", callback: () => this.restoreFocusTimer() });
    this.addRibbonIcon("calendar-plus", "Create AI plan", () => new PlanInputModal(this.app, this).open());
    this.addRibbonIcon("timer", "Start focus session", () => this.openFocusForActiveNote());
    this.focusStatusEl = this.addStatusBarItem();
    this.focusStatusEl.addClass("ai-planner-focus-status");
    this.registerDomEvent(this.focusStatusEl, "click", () => void this.restoreFocusTimer());
    this.focusMiniEl = this.app.workspace.containerEl.createEl("button", {
      cls: "ai-planner-focus-mini",
      attr: { type: "button", "aria-label": "Restore focus timer" }
    });
    this.registerDomEvent(this.focusMiniEl, "click", (event) => {
      if (this.miniMoved) {
        event.preventDefault();
        return;
      }
      void this.restoreFocusTimer();
    });
    this.registerDomEvent(this.focusMiniEl, "pointerdown", (event) => this.beginMiniDrag(event));
    this.registerDomEvent(window, "pointermove", (event) => this.moveMiniDrag(event));
    this.registerDomEvent(window, "pointerup", () => void this.endMiniDrag());
    this.register(() => this.focusMiniEl.remove());
    const updateVisibleHeight = () => {
      const height = Math.min(window.visualViewport?.height ?? window.innerHeight, window.innerHeight);
      document.documentElement.style.setProperty("--ai-planner-visible-height", `${Math.round(height)}px`);
    };
    updateVisibleHeight();
    this.registerDomEvent(window, "resize", updateVisibleHeight);
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      viewport.addEventListener("resize", updateVisibleHeight);
      this.register(() => viewport.removeEventListener("resize", updateVisibleHeight));
    }
    this.registerDomEvent(document, "focusin", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select")) return;
      if (!target.closest(".ai-planner-modal")) return;
      this.keepFocusedInputVisible(target);
    });
    this.registerDomEvent(document, "focusout", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const modal = target.closest(".ai-planner-modal");
      if (!modal) return;
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest(".ai-planner-modal") === modal) return;
        modal.removeClass("ai-planner-keyboard-active");
        modal.style.removeProperty("--ai-planner-keyboard-shift");
      }, 180);
    });
    this.registerInterval(window.setInterval(() => void this.refreshFocusStatus(), 500));
    await this.refreshFocusStatus();
  }
  keepFocusedInputVisible(target) {
    const content = target.closest(".modal-content");
    const modal = target.closest(".ai-planner-modal");
    if (!content || !modal) return;
    modal.removeClass("ai-planner-keyboard-active");
    modal.style.removeProperty("--ai-planner-keyboard-shift");
    const move = () => {
      const viewportHeight = Math.min(window.visualViewport?.height ?? window.innerHeight, window.innerHeight);
      const targetRect = target.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const topLimit = Math.max(contentRect.top + 16, 16);
      const bottomLimit = Math.min(contentRect.bottom - 16, viewportHeight - 24);
      if (targetRect.bottom > bottomLimit) content.scrollTop += targetRect.bottom - bottomLimit;
      else if (targetRect.top < topLimit) content.scrollTop -= topLimit - targetRect.top;
      if (window.innerWidth > 600) return;
      const reportedHeight = window.visualViewport?.height ?? window.innerHeight;
      const keyboardTop = reportedHeight < window.innerHeight * 0.88 ? reportedHeight : window.innerHeight * 0.58;
      const updatedRect = target.getBoundingClientRect();
      const safeBottom = keyboardTop - 24;
      if (updatedRect.bottom > safeBottom) {
        const shift = Math.min(Math.max(0, updatedRect.top - Math.max(48, keyboardTop * 0.2)), window.innerHeight * 0.6);
        if (shift > 0) {
          modal.style.setProperty("--ai-planner-keyboard-shift", `${Math.round(shift)}px`);
          modal.addClass("ai-planner-keyboard-active");
        }
      }
    };
    for (const delay of [0, 180, 420, 750]) window.setTimeout(move, delay);
  }
  async saveSettings() {
    await this.saveData(this.pluginSettings);
  }
  getActiveFocus() {
    return this.pluginSettings.activeFocus;
  }
  setFocusTimerOpen(open) {
    this.focusTimerOpen = open;
    void this.refreshFocusStatus();
  }
  beginMiniDrag(event) {
    if (event.button !== 0) return;
    const rect = this.focusMiniEl.getBoundingClientRect();
    this.miniDragging = true;
    this.miniMoved = false;
    this.miniStartX = event.clientX;
    this.miniStartY = event.clientY;
    this.miniStartLeft = rect.left;
    this.miniStartTop = rect.top;
  }
  moveMiniDrag(event) {
    if (!this.miniDragging) return;
    const dx = event.clientX - this.miniStartX;
    const dy = event.clientY - this.miniStartY;
    if (!this.miniMoved && Math.hypot(dx, dy) < 6) return;
    this.miniMoved = true;
    event.preventDefault();
    const rect = this.focusMiniEl.getBoundingClientRect();
    const left = Math.min(Math.max(8, this.miniStartLeft + dx), Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(Math.max(8, this.miniStartTop + dy), Math.max(8, window.innerHeight - rect.height - 8));
    this.focusMiniEl.style.left = `${left}px`;
    this.focusMiniEl.style.top = `${top}px`;
    this.focusMiniEl.style.right = "auto";
    this.focusMiniEl.style.bottom = "auto";
  }
  async endMiniDrag() {
    if (!this.miniDragging) return;
    this.miniDragging = false;
    if (!this.miniMoved) return;
    const rect = this.focusMiniEl.getBoundingClientRect();
    const width = Math.max(1, window.innerWidth - rect.width);
    const height = Math.max(1, window.innerHeight - rect.height);
    this.pluginSettings.focusMiniPosition = { x: rect.left / width, y: rect.top / height };
    await this.saveSettings();
    window.setTimeout(() => {
      this.miniMoved = false;
    }, 0);
  }
  applyMiniPosition() {
    const position = this.pluginSettings.focusMiniPosition;
    if (!position) return;
    const rect = this.focusMiniEl.getBoundingClientRect();
    const left = Math.min(Math.max(8, position.x * (window.innerWidth - rect.width)), Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(Math.max(8, position.y * (window.innerHeight - rect.height)), Math.max(8, window.innerHeight - rect.height - 8));
    this.focusMiniEl.style.left = `${left}px`;
    this.focusMiniEl.style.top = `${top}px`;
    this.focusMiniEl.style.right = "auto";
    this.focusMiniEl.style.bottom = "auto";
  }
  async openFocusForActiveNote() {
    if (this.pluginSettings.activeFocus) {
      await this.restoreFocusTimer();
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u8BA1\u5212\u7B14\u8BB0 / Open a plan note first.");
      return;
    }
    const tasks = extractFocusTasks(this.app, file);
    if (!tasks.length) {
      new import_obsidian.Notice("\u5F53\u524D\u7B14\u8BB0\u6CA1\u6709\u53EF\u4E13\u6CE8\u7684\u8BA1\u5212\u4EFB\u52A1 / No plan tasks found.");
      return;
    }
    new FocusTaskPickerModal(this.app, this, file, tasks).open();
  }
  async startFocus(file, task, minutes) {
    if (this.pluginSettings.activeFocus) {
      new import_obsidian.Notice("\u5DF2\u6709\u8FDB\u884C\u4E2D\u7684\u4E13\u6CE8 / A focus session is already active.");
      await this.restoreFocusTimer();
      return;
    }
    const startedAt = Date.now();
    this.pluginSettings.activeFocus = {
      filePath: file.path,
      taskId: task.id,
      taskName: task.name,
      category: task.category,
      durationMs: Math.max(1, minutes) * 6e4,
      focusedMs: 0,
      runningAt: startedAt,
      startedAt
    };
    await this.saveSettings();
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm[`${task.id}ActualStart`] ??= timeOfDay(new Date(startedAt));
      });
    } catch {
      new import_obsidian.Notice("\u65E0\u6CD5\u7ACB\u5373\u5199\u5165\u5F00\u59CB\u65F6\u95F4\uFF0C\u5C06\u5728\u7ED3\u675F\u65F6\u91CD\u8BD5 / Could not write the start time yet; it will retry on finish.");
    }
    await this.refreshFocusStatus();
    new FocusTimerModal(this.app, this).open();
  }
  async toggleFocusPause() {
    const session = this.pluginSettings.activeFocus;
    if (!session) return;
    if (session.runningAt !== null) {
      session.focusedMs += Math.max(0, Date.now() - session.runningAt);
      session.runningAt = null;
    } else {
      session.runningAt = Date.now();
    }
    await this.saveSettings();
    await this.refreshFocusStatus();
  }
  async restoreFocusTimer() {
    const session = this.pluginSettings.activeFocus;
    if (!session) return;
    const file = this.app.vault.getAbstractFileByPath(session.filePath);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("\u627E\u4E0D\u5230\u539F\u8BA1\u5212\u7B14\u8BB0\uFF0C\u65E0\u6CD5\u5B8C\u6210\u56DE\u5199 / The plan note is missing.");
      return;
    }
    new FocusTimerModal(this.app, this).open();
  }
  async finishFocus() {
    const session = this.pluginSettings.activeFocus;
    if (!session || this.finishingFocus) return;
    this.finishingFocus = true;
    try {
      if (session.runningAt !== null) {
        session.focusedMs += Math.max(0, Date.now() - session.runningAt);
        session.runningAt = null;
        await this.saveSettings();
      }
      const file = this.app.vault.getAbstractFileByPath(session.filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        new import_obsidian.Notice("\u627E\u4E0D\u5230\u539F\u8BA1\u5212\u7B14\u8BB0\uFF0C\u4E13\u6CE8\u8BB0\u5F55\u6682\u672A\u5199\u5165 / Plan note missing; focus record was kept.");
        return;
      }
      const actualMinutes = Math.max(1, Math.round(session.focusedMs / 6e4));
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm[`${session.taskId}ActualStart`] ??= timeOfDay(new Date(session.startedAt));
        fm[`${session.taskId}ActualEnd`] = timeOfDay(/* @__PURE__ */ new Date());
        fm[`${session.taskId}ActualMinutes`] = Number(fm[`${session.taskId}ActualMinutes`] ?? 0) + actualMinutes;
        fm[`${session.taskId}FocusSessions`] = Number(fm[`${session.taskId}FocusSessions`] ?? 0) + 1;
      });
      this.pluginSettings.activeFocus = void 0;
      await this.saveSettings();
      new import_obsidian.Notice(`\u5DF2\u8BB0\u5F55 ${actualMinutes} \u5206\u949F\u4E13\u6CE8 / Focus recorded.`);
    } finally {
      this.finishingFocus = false;
      await this.refreshFocusStatus();
    }
  }
  async refreshFocusStatus() {
    const session = this.pluginSettings.activeFocus;
    if (!session) {
      this.focusStatusEl.style.display = "none";
      this.focusMiniEl.style.display = "none";
      return;
    }
    this.focusStatusEl.style.display = "";
    this.focusMiniEl.style.display = this.focusTimerOpen ? "none" : "";
    const elapsed = session.focusedMs + (session.runningAt === null ? 0 : Math.max(0, Date.now() - session.runningAt));
    if (session.runningAt !== null && elapsed >= session.durationMs) {
      this.focusStatusEl.setText(`Focus complete \xB7 ${session.taskName}`);
      this.focusMiniEl.setText("\u4E13\u6CE8\u5B8C\u6210 / Focus complete");
      void this.finishFocus();
      return;
    }
    const state = session.runningAt === null ? "Focus paused" : formatDuration(Math.max(0, session.durationMs - elapsed));
    this.focusStatusEl.setText(`${state} \xB7 ${session.taskName}`);
    this.focusMiniEl.setText(`${state} \xB7 ${session.taskName}`);
    this.focusStatusEl.setAttribute("aria-label", "Restore focus timer");
    if (!this.focusTimerOpen) window.requestAnimationFrame(() => this.applyMiniPosition());
  }
  async generatePlan(mode, date, startTime, endTime, input) {
    if (!this.pluginSettings.apiBaseUrl || !this.pluginSettings.model) throw new Error("Please configure an API base URL and model first.");
    let customHeaders = {};
    try {
      customHeaders = JSON.parse(this.pluginSettings.customHeaders || "{}");
    } catch {
      throw new Error("Custom headers must be valid JSON.");
    }
    const system = mode === "study" ? "You create practical same-day homework plans for a child. Break tasks into a sensible order, include short breaks when helpful, and only add review tasks grounded in the given homework." : "You create practical same-day work plans. Prioritize by urgency and cognitive load, include buffers, and do not invent work items.";
    const folder = mode === "study" ? this.pluginSettings.studyFolder : this.pluginSettings.workFolder;
    const history = buildHistoryContext(this.app, folder, this.pluginSettings.historyDays);
    const user = `Plan date: ${date}
Start time: ${startTime || "not specified"}
Latest finish: ${endTime || "not specified"}
Items:
${input}

Historical timing calibration:
${history}

Use the calibration only when it has at least two comparable records. Return JSON only, with this shape: {"title":"short title","summary":"one sentence","tasks":[{"title":"task","category":"subject or project","startTime":"HH:mm","endTime":"HH:mm","estimatedMinutes":30,"description":"optional"}],"reviewTasks":[same task shape]}. Use [] for reviewTasks when none are justified.`;
    const baseUrl = this.pluginSettings.apiBaseUrl.replace(/\/$/, "");
    const headers = { "Content-Type": "application/json", ...customHeaders };
    const response = await requestPlanCompletion(this.pluginSettings, baseUrl, headers, system, user);
    if (response.status < 200 || response.status >= 300) throw new Error(`API request failed (${response.status}): ${response.text.slice(0, 300)}`);
    const content = completionText(this.pluginSettings.provider, response.json);
    if (typeof content !== "string") throw new Error("The provider did not return a chat completion.");
    return parsePlan(content);
  }
  async writePlan(mode, date, plan) {
    const folder = mode === "study" ? this.pluginSettings.studyFolder : this.pluginSettings.workFolder;
    await ensureFolder(this.app, folder);
    const filename = `${date}-${safeFilename(plan.title || (mode === "study" ? "\u4F5C\u4E1A\u8BA1\u5212" : "\u5DE5\u4F5C\u8BA1\u5212"))}.md`;
    const path = (0, import_obsidian.normalizePath)(`${folder}/${filename}`);
    const content = renderPlan(mode, date, plan);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian.TFile) await this.app.vault.modify(existing, content);
    else await this.app.vault.create(path, content);
    await this.app.workspace.openLinkText(path, "", true);
    return path;
  }
};
function extractFocusTasks(app, file) {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  return Object.keys(fm).filter((key) => /^task\d+Name$/.test(key)).sort().map((key) => {
    const id = key.replace("Name", "");
    return { id, name: String(fm[key] ?? id), category: String(fm[`${id}Category`] ?? ""), estimatedMinutes: Number(fm[`${id}EstimatedMinutes`] ?? 0) };
  });
}
function buildHistoryContext(app, folder, days) {
  const cutoff = Date.now() - days * 864e5;
  const groups = /* @__PURE__ */ new Map();
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(`${(0, import_obsidian.normalizePath)(folder)}/`) || file.stat.mtime < cutoff) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    for (const key of Object.keys(fm).filter((item) => /^task\d+Name$/.test(item))) {
      const id = key.replace("Name", "");
      const planned = Number(fm[`${id}EstimatedMinutes`] ?? 0);
      const actual = Number(fm[`${id}ActualMinutes`] ?? 0) || durationFromTimes(fm[`${id}ActualStart`], fm[`${id}ActualEnd`]);
      if (planned <= 0 || actual <= 0) continue;
      const category = String(fm[`${id}Category`] ?? String(fm[key]).split("\xB7")[0] ?? "\u5176\u5B83").trim() || "\u5176\u5B83";
      const item = groups.get(category) ?? { planned: 0, actual: 0, count: 0 };
      item.planned += planned;
      item.actual += actual;
      item.count += 1;
      groups.set(category, item);
    }
  }
  const lines = [...groups.entries()].filter(([, value]) => value.count >= 2).sort((a, b) => b[1].count - a[1].count).slice(0, 6).map(([category, value]) => {
    const percent = Math.round((value.actual / value.planned - 1) * 100);
    return `${category}: ${value.count} records, planned ${value.planned} min, actual ${value.actual} min, deviation ${percent >= 0 ? "+" : ""}${percent}%`;
  });
  return lines.length ? lines.join("\n") : "No reliable historical records yet. Use reasonable estimates and a small buffer.";
}
function durationFromTimes(start, end) {
  const parse = (value) => {
    const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const from = parse(start), to = parse(end);
  return from === null || to === null ? 0 : to >= from ? to - from : to + 1440 - from;
}
var FocusTaskPickerModal = class extends import_obsidian.Modal {
  constructor(app, plugin, file, tasks) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.tasks = tasks;
    this.minutes = plugin.pluginSettings.focusMinutes;
  }
  minutes;
  onOpen() {
    this.modalEl.addClass("ai-planner-modal");
    this.titleEl.setText("\u4E13\u6CE8\u6A21\u5F0F / Focus mode");
    new import_obsidian.Setting(this.contentEl).setName("\u4E13\u6CE8\u65F6\u957F / Focus duration").addDropdown((dropdown) => dropdown.addOption("25", "25 min").addOption("50", "50 min").addOption("90", "90 min").setValue(String(this.minutes)).onChange((value) => this.minutes = Number(value)));
    const custom = this.contentEl.createEl("input", { type: "number", placeholder: "Custom minutes / \u81EA\u5B9A\u4E49\u5206\u949F" });
    custom.addEventListener("input", () => {
      const value = Number(custom.value);
      if (value > 0) this.minutes = value;
    });
    this.contentEl.createEl("h3", { text: "\u9009\u62E9\u4EFB\u52A1 / Choose a task" });
    for (const task of this.tasks) {
      const button = this.contentEl.createEl("button", { cls: "ai-planner-focus-task" });
      button.setText(`${task.category ? `${task.category} \xB7 ` : ""}${task.name} (${task.estimatedMinutes || "?"} min)`);
      button.addEventListener("click", () => {
        this.close();
        void this.plugin.startFocus(this.file, task, this.minutes);
      });
    }
  }
};
var FocusTimerModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  interval = null;
  onOpen() {
    const session = this.plugin.getActiveFocus();
    if (!session) {
      this.close();
      return;
    }
    this.plugin.setFocusTimerOpen(true);
    this.modalEl.addClass("ai-planner-modal", "ai-planner-focus-timer");
    this.titleEl.setText("\u4E13\u6CE8\u4E2D / Focusing");
    this.contentEl.createEl("p", { text: session.taskName, cls: "ai-planner-focus-title" });
    const clock = this.contentEl.createEl("div", { cls: "ai-planner-focus-clock" });
    this.contentEl.createEl("p", {
      text: "\u5173\u95ED\u6B64\u7A97\u53E3\u53EA\u4F1A\u6700\u5C0F\u5316\uFF0C\u8BA1\u65F6\u4F1A\u4FDD\u7559\u3002\u624B\u673A\u5207\u6362\u5230\u5176\u5B83 App \u540E\u6309\u7ECF\u8FC7\u7684\u5899\u4E0A\u65F6\u95F4\u4F30\u7B97\uFF1BiOS \u53EF\u80FD\u6682\u505C\u6216\u56DE\u6536 Obsidian\uFF0C\u56E0\u6B64\u8FD9\u4E0D\u4EE3\u8868\u5DF2\u9A8C\u8BC1\u7684\u4E13\u6CE8\u6216\u9605\u8BFB\u65F6\u957F\u3002 / Closing only minimizes this timer. Mobile background time is a wall-clock estimate; iOS may suspend or terminate Obsidian, so it is not verified focus or reading time.",
      cls: "ai-planner-focus-disclaimer"
    });
    const action = this.contentEl.createDiv({ cls: "modal-button-container" });
    const pause = action.createEl("button", { text: "\u6682\u505C / Pause" });
    const finish = action.createEl("button", { text: "\u7ED3\u675F / Finish", cls: "mod-cta" });
    const refresh = () => {
      const current = this.plugin.getActiveFocus();
      if (!current) {
        this.close();
        return;
      }
      const elapsed = current.focusedMs + (current.runningAt === null ? 0 : Math.max(0, Date.now() - current.runningAt));
      const remaining = Math.max(0, current.durationMs - elapsed);
      clock.setText(formatDuration(remaining));
      pause.setText(current.runningAt === null ? "\u7EE7\u7EED / Resume" : "\u6682\u505C / Pause");
      if (remaining <= 0) void this.plugin.finishFocus();
    };
    pause.addEventListener("click", () => void this.plugin.toggleFocusPause().then(refresh));
    finish.addEventListener("click", () => void this.plugin.finishFocus().then(() => this.close()));
    this.interval = window.setInterval(refresh, 500);
    refresh();
  }
  onClose() {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.plugin.setFocusTimerOpen(false);
  }
};
var PlanInputModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  mode = "study";
  date = localDate();
  startTime = "";
  endTime = "";
  input = "";
  onOpen() {
    this.modalEl.addClass("ai-planner-modal");
    this.titleEl.setText("AI Planner / AI \u8BA1\u5212");
    new import_obsidian.Setting(this.contentEl).setName("\u6A21\u5F0F / Mode").addDropdown((dropdown) => dropdown.addOption("study", "\u4F5C\u4E1A\u4E0E\u5B66\u4E60 / Homework & study").addOption("work", "\u5DE5\u4F5C / Work").setValue(this.mode).onChange((value) => this.mode = value));
    new import_obsidian.Setting(this.contentEl).setName("\u8BA1\u5212\u65E5\u671F / Plan date").addText((input) => input.setValue(this.date).setPlaceholder("YYYY-MM-DD").onChange((value) => this.date = value));
    new import_obsidian.Setting(this.contentEl).setName("\u5F00\u59CB\u65F6\u95F4 / Start time").setDesc("\u4F8B\u5982 / Example: 19:00").addText((input) => input.setValue(this.startTime).setPlaceholder("19:00").onChange((value) => this.startTime = value));
    new import_obsidian.Setting(this.contentEl).setName("\u6700\u665A\u7ED3\u675F / Latest finish").setDesc("\u53EF\u9009 / Optional.").addText((input) => input.setValue(this.endTime).setPlaceholder("21:00").onChange((value) => this.endTime = value));
    new import_obsidian.Setting(this.contentEl).setName("\u4EFB\u52A1\u6216\u4F5C\u4E1A / Tasks or homework").setDesc("\u586B\u5199\u79D1\u76EE/\u9879\u76EE\u3001\u4EFB\u52A1\u91CF\u3001\u622A\u6B62\u65F6\u95F4\u548C\u9650\u5236\u6761\u4EF6\u3002");
    const sourceBar = this.contentEl.createDiv({ cls: "ai-planner-source" });
    const sourceLabel = sourceBar.createSpan({ text: "\u6765\u6E90 / Source: \u624B\u52A8\u8F93\u5165 / manual input" });
    const useActiveButton = sourceBar.createEl("button", { text: "\u4F7F\u7528\u5F53\u524D\u7B14\u8BB0 / Use current note" });
    const chooseButton = sourceBar.createEl("button", { text: "\u9009\u62E9 Markdown \u7B14\u8BB0 / Choose note" });
    const area = this.contentEl.createEl("textarea", { cls: "ai-planner-input" });
    area.rows = 8;
    area.placeholder = "Example: Math workbook pages 12-14; memorize 20 English words; Chinese reading aloud.";
    area.addEventListener("input", () => this.input = area.value);
    const loadSource = async (file) => {
      const content = await this.app.vault.read(file);
      this.input = content;
      area.value = content;
      sourceLabel.setText(`\u6765\u6E90 / Source: ${file.path}`);
    };
    useActiveButton.addEventListener("click", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension !== "md") return new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Markdown \u7B14\u8BB0 / Open a Markdown note first.");
      try {
        await loadSource(activeFile);
      } catch {
        new import_obsidian.Notice("Could not read the current note.");
      }
    });
    chooseButton.addEventListener("click", () => new MarkdownFilePickerModal(this.app, async (file) => {
      try {
        await loadSource(file);
      } catch {
        new import_obsidian.Notice("Could not read that note.");
      }
    }).open());
    const action = this.contentEl.createDiv({ cls: "modal-button-container" });
    const button = action.createEl("button", { text: "\u751F\u6210\u9884\u89C8 / Generate preview", cls: "mod-cta" });
    button.addEventListener("click", async () => {
      if (!this.input.trim()) return new import_obsidian.Notice("\u8BF7\u81F3\u5C11\u586B\u5199\u4E00\u9879\u4EFB\u52A1 / Enter at least one task first.");
      button.disabled = true;
      button.setText("\u6B63\u5728\u751F\u6210 / Generating...");
      try {
        const plan = await this.plugin.generatePlan(this.mode, this.date, this.startTime, this.endTime, this.input);
        this.close();
        new PlanPreviewModal(this.app, this.plugin, this.mode, this.date, plan).open();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Could not generate plan.");
        button.disabled = false;
        button.setText("\u751F\u6210\u9884\u89C8 / Generate preview");
      }
    });
  }
};
var MarkdownFilePickerModal = class extends import_obsidian.Modal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.files = app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    this.resultsEl = document.createElement("div");
  }
  query = "";
  files;
  resultsEl;
  onOpen() {
    this.modalEl.addClass("ai-planner-modal", "ai-planner-file-picker");
    this.titleEl.setText("\u9009\u62E9 Markdown \u7B14\u8BB0 / Choose note");
    const search = this.contentEl.createEl("input", { type: "search", placeholder: "\u641C\u7D22\u7B14\u8BB0 / Search notes...", cls: "ai-planner-file-search" });
    search.addEventListener("input", () => {
      this.query = search.value.trim().toLowerCase();
      this.renderResults();
    });
    this.resultsEl = this.contentEl.createDiv({ cls: "ai-planner-file-results" });
    this.renderResults();
    search.focus();
  }
  renderResults() {
    this.resultsEl.empty();
    const matches = this.files.filter((file) => file.path.toLowerCase().includes(this.query)).slice(0, 100);
    if (!matches.length) {
      this.resultsEl.createEl("p", { text: "No Markdown notes found." });
      return;
    }
    for (const file of matches) {
      const button = this.resultsEl.createEl("button", { cls: "ai-planner-file-item" });
      button.createEl("strong", { text: file.basename });
      button.createEl("small", { text: file.path });
      button.addEventListener("click", async () => {
        await this.onChoose(file);
        this.close();
      });
    }
  }
};
var PlanPreviewModal = class extends import_obsidian.Modal {
  constructor(app, plugin, mode, date, plan) {
    super(app);
    this.plugin = plugin;
    this.mode = mode;
    this.date = date;
    this.plan = plan;
  }
  onOpen() {
    this.modalEl.addClass("ai-planner-modal");
    this.titleEl.setText(this.plan.title || "Plan preview");
    if (this.plan.summary) this.contentEl.createEl("p", { text: this.plan.summary });
    renderPreviewTasks(this.contentEl, "Plan", this.plan.tasks);
    if (this.mode === "study") renderPreviewTasks(this.contentEl, "Review", this.plan.reviewTasks ?? []);
    const action = this.contentEl.createDiv({ cls: "modal-button-container" });
    action.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    action.createEl("button", { text: "Write plan", cls: "mod-cta" }).addEventListener("click", async () => {
      try {
        const path = await this.plugin.writePlan(this.mode, this.date, this.plan);
        new import_obsidian.Notice(`Plan written: ${path}`);
        this.close();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Could not write plan.");
      }
    });
  }
};
var AIPlannerSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "AI Planner \u8BBE\u7F6E / Settings" });
    this.containerEl.createEl("p", { text: "Claude \u4E0E Gemini \u4F7F\u7528\u539F\u751F\u63A5\u53E3\uFF1B\u5176\u5B83\u9884\u8BBE\u4F7F\u7528 OpenAI-compatible \u63A5\u53E3\u3002Claude and Gemini use native API formats." });
    new import_obsidian.Setting(this.containerEl).setName("\u754C\u9762\u8BED\u8A00 / Interface language").addDropdown((dropdown) => dropdown.addOption("auto", "\u8DDF\u968F\u7CFB\u7EDF / Follow system").addOption("zh", "\u4E2D\u6587").addOption("en", "English").setValue(this.plugin.pluginSettings.interfaceLanguage).onChange(async (value) => {
      this.plugin.pluginSettings.interfaceLanguage = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("\u670D\u52A1\u5546\u9884\u8BBE / Provider preset").setDesc("\u9009\u62E9\u540E\u4F1A\u586B\u5165\u63A8\u8350\u5730\u5740\u4E0E\u6A21\u578B\uFF0C\u53EF\u7EE7\u7EED\u624B\u52A8\u4FEE\u6539\u3002").addDropdown((dropdown) => {
      for (const [id, preset] of Object.entries(PROVIDERS)) dropdown.addOption(id, preset.label);
      dropdown.setValue(this.plugin.pluginSettings.provider).onChange(async (value) => {
        const provider = value;
        this.plugin.pluginSettings.provider = provider;
        if (provider !== "custom") {
          this.plugin.pluginSettings.apiBaseUrl = PROVIDERS[provider].baseUrl;
          this.plugin.pluginSettings.model = PROVIDERS[provider].model;
        }
        await this.plugin.saveSettings();
        this.display();
      });
    });
    this.textSetting("API \u5730\u5740 / API base URL", "\u4F8B\u5982 / Example: https://api.openai.com/v1", "apiBaseUrl");
    new import_obsidian.Setting(this.containerEl).setName("API \u5BC6\u94A5 / API key").setDesc("Stored in this plugin's data.json.").addText((input) => {
      input.setValue(this.plugin.pluginSettings.apiKey).setPlaceholder("sk-...");
      input.inputEl.type = "password";
      input.onChange(async (value) => {
        this.plugin.pluginSettings.apiKey = value;
        await this.plugin.saveSettings();
      });
    });
    this.textSetting("\u6A21\u578B / Model", "\u4F8B\u5982 / Example: gpt-4.1-mini, deepseek-chat, glm-4-flash", "model");
    this.textSetting("\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934 / Custom headers", "JSON object, optional.", "customHeaders");
    new import_obsidian.Setting(this.containerEl).setName("\u6E29\u5EA6 / Temperature").addText((input) => input.setValue(String(this.plugin.pluginSettings.temperature)).onChange(async (value) => {
      this.plugin.pluginSettings.temperature = Number(value) || 0;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("\u6700\u5927\u8F93\u51FA\u957F\u5EA6 / Max output tokens").addText((input) => input.setValue(String(this.plugin.pluginSettings.maxTokens)).onChange(async (value) => {
      this.plugin.pluginSettings.maxTokens = Number(value) || DEFAULT_SETTINGS.maxTokens;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("\u5386\u53F2\u6821\u51C6\u5929\u6570 / History days").setDesc("\u751F\u6210\u8BA1\u5212\u65F6\u8BFB\u53D6\u8FD1\u671F\u771F\u5B9E\u7528\u65F6\uFF0C\u5EFA\u8BAE 7-30 \u5929\u3002").addText((input) => input.setValue(String(this.plugin.pluginSettings.historyDays)).onChange(async (value) => {
      this.plugin.pluginSettings.historyDays = Math.max(1, Number(value) || DEFAULT_SETTINGS.historyDays);
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("\u9ED8\u8BA4\u4E13\u6CE8\u5206\u949F / Default focus minutes").addText((input) => input.setValue(String(this.plugin.pluginSettings.focusMinutes)).onChange(async (value) => {
      this.plugin.pluginSettings.focusMinutes = Math.max(1, Number(value) || DEFAULT_SETTINGS.focusMinutes);
      await this.plugin.saveSettings();
    }));
    this.textSetting("\u5B66\u4E60\u8F93\u51FA\u76EE\u5F55 / Study output folder", "Vault-relative path.", "studyFolder");
    this.textSetting("\u5DE5\u4F5C\u8F93\u51FA\u76EE\u5F55 / Work output folder", "Vault-relative path.", "workFolder");
  }
  textSetting(name, desc, key) {
    new import_obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addText((input) => input.setValue(this.plugin.pluginSettings[key]).onChange(async (value) => {
      this.plugin.pluginSettings[key] = value.trim();
      await this.plugin.saveSettings();
    }));
  }
};
function parsePlan(content) {
  const json = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(json);
  if (!parsed.title || !Array.isArray(parsed.tasks)) throw new Error("The model returned an invalid plan format.");
  parsed.tasks = parsed.tasks.map(normalizeTask).filter(Boolean);
  parsed.reviewTasks = Array.isArray(parsed.reviewTasks) ? parsed.reviewTasks.map(normalizeTask).filter(Boolean) : [];
  if (!parsed.tasks.length) throw new Error("The model did not return any tasks.");
  return parsed;
}
function normalizeTask(value) {
  if (!value || typeof value !== "object") return null;
  const task = value;
  if (!task.title) return null;
  return { title: String(task.title), category: task.category ? String(task.category) : "", startTime: task.startTime ? String(task.startTime) : "", endTime: task.endTime ? String(task.endTime) : "", estimatedMinutes: Math.max(1, Number(task.estimatedMinutes) || 30), description: task.description ? String(task.description) : "" };
}
function renderPlan(mode, date, plan) {
  const allTasks = [...plan.tasks, ...plan.reviewTasks ?? []];
  const frontmatter = allTasks.flatMap((task, index) => {
    const id = `task${String(index + 1).padStart(2, "0")}`;
    return [`${id}Name: ${yamlQuote(task.title)}`, `${id}Category: ${yamlQuote(task.category || "\u5176\u5B83")}`, `${id}EstimatedMinutes: ${task.estimatedMinutes}`, `${id}ActualStart:`, `${id}ActualEnd:`, `${id}ActualMinutes: 0`, `${id}FocusSessions: 0`];
  });
  const taskCards = (label, tasks, offset) => tasks.length ? `## ${label}

${tasks.map((task, index) => renderTask(task, date, offset + index + 1)).join("\n\n")}` : `## ${label}

\u6682\u65E0\u5B89\u6392\u3002`;
  return `---
type: ${mode === "study" ? "\u6BCF\u65E5\u4F5C\u4E1A\u8BA1\u5212" : "\u6BCF\u65E5\u5DE5\u4F5C\u8BA1\u5212"}
planDate: ${date}
tags:
  - AI\u8BA1\u5212
${frontmatter.join("\n")}
---

# ${plan.title}

> [!abstract] \u6982\u89C8
> ${plan.summary || "\u7531 AI Planner \u751F\u6210\uFF0C\u6267\u884C\u540E\u586B\u5199\u6BCF\u9879\u5B9E\u9645\u5F00\u59CB\u548C\u5B8C\u6210\u65F6\u95F4\u3002"}

${taskCards(mode === "study" ? "\u4F5C\u4E1A\u8BA1\u5212\u8868" : "\u5DE5\u4F5C\u8BA1\u5212\u8868", plan.tasks, 0)}

${mode === "study" ? taskCards("\u590D\u4E60\u8BA1\u5212\u8868", plan.reviewTasks ?? [], plan.tasks.length) : ""}
`;
}
function renderTask(task, date, index) {
  const prefix = task.category ? `${task.category} \xB7 ` : "";
  const time = task.startTime && task.endTime ? `${task.startTime}-${task.endTime}` : "\u5F85\u5B89\u6392";
  const note = task.description ? `
> ${task.description}` : "";
  return `> [!todo]+ ${prefix}${task.title}
> \u65F6\u6BB5\uFF1A${time} \xB7 ${task.estimatedMinutes} \u5206\u949F
> \u5B9E\u9645\u5F00\u59CB\uFF1A____ \xB7 \u5B9E\u9645\u5B8C\u6210\uFF1A____${note}
> - [ ] ${task.title} \u{1F4C5} ${date} #\u8BA1\u5212`;
}
function renderPreviewTasks(parent, label, tasks) {
  parent.createEl("h3", { text: label });
  if (!tasks.length) {
    parent.createEl("p", { text: "None" });
    return;
  }
  const list = parent.createEl("ul");
  for (const task of tasks) list.createEl("li", { text: `${task.startTime || ""}${task.endTime ? `-${task.endTime}` : ""} ${task.title} (${task.estimatedMinutes} min)`.trim() });
}
async function ensureFolder(app, folder) {
  const parts = (0, import_obsidian.normalizePath)(folder).split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join("/");
    if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path);
  }
}
function safeFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 80) || "AI\u8BA1\u5212";
}
function yamlQuote(value) {
  return JSON.stringify(value);
}
function timeOfDay(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function formatDuration(milliseconds) {
  const total = Math.ceil(milliseconds / 1e3);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function localDate() {
  const now = /* @__PURE__ */ new Date();
  const offset = now.getTimezoneOffset() * 6e4;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgTW9kYWwsIE5vdGljZSwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nLCBURmlsZSwgbm9ybWFsaXplUGF0aCwgcmVxdWVzdFVybCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG50eXBlIFBsYW5Nb2RlID0gXCJzdHVkeVwiIHwgXCJ3b3JrXCI7XG50eXBlIFByb3ZpZGVySWQgPSBcImN1c3RvbVwiIHwgXCJvcGVuYWlcIiB8IFwiY2xhdWRlXCIgfCBcImRlZXBzZWVrXCIgfCBcImdsbVwiIHwgXCJraW1pXCIgfCBcImdlbWluaVwiO1xudHlwZSBJbnRlcmZhY2VMYW5ndWFnZSA9IFwiYXV0b1wiIHwgXCJ6aFwiIHwgXCJlblwiO1xuXG5pbnRlcmZhY2UgUGxhbm5lclNldHRpbmdzIHtcbiAgcHJvdmlkZXI6IFByb3ZpZGVySWQ7XG4gIGludGVyZmFjZUxhbmd1YWdlOiBJbnRlcmZhY2VMYW5ndWFnZTtcbiAgYXBpQmFzZVVybDogc3RyaW5nO1xuICBhcGlLZXk6IHN0cmluZztcbiAgbW9kZWw6IHN0cmluZztcbiAgY3VzdG9tSGVhZGVyczogc3RyaW5nO1xuICB0ZW1wZXJhdHVyZTogbnVtYmVyO1xuICBtYXhUb2tlbnM6IG51bWJlcjtcbiAgaGlzdG9yeURheXM6IG51bWJlcjtcbiAgZm9jdXNNaW51dGVzOiBudW1iZXI7XG4gIHN0dWR5Rm9sZGVyOiBzdHJpbmc7XG4gIHdvcmtGb2xkZXI6IHN0cmluZztcbiAgYWN0aXZlRm9jdXM/OiBBY3RpdmVGb2N1c1Nlc3Npb247XG4gIGZvY3VzTWluaVBvc2l0aW9uPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xufVxuXG5pbnRlcmZhY2UgQWN0aXZlRm9jdXNTZXNzaW9uIHtcbiAgZmlsZVBhdGg6IHN0cmluZztcbiAgdGFza0lkOiBzdHJpbmc7XG4gIHRhc2tOYW1lOiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG4gIGR1cmF0aW9uTXM6IG51bWJlcjtcbiAgZm9jdXNlZE1zOiBudW1iZXI7XG4gIHJ1bm5pbmdBdDogbnVtYmVyIHwgbnVsbDtcbiAgc3RhcnRlZEF0OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQbGFuVGFzayB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNhdGVnb3J5Pzogc3RyaW5nO1xuICBzdGFydFRpbWU/OiBzdHJpbmc7XG4gIGVuZFRpbWU/OiBzdHJpbmc7XG4gIGVzdGltYXRlZE1pbnV0ZXM6IG51bWJlcjtcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBQbGFuUmVzdWx0IHtcbiAgdGl0bGU6IHN0cmluZztcbiAgc3VtbWFyeT86IHN0cmluZztcbiAgdGFza3M6IFBsYW5UYXNrW107XG4gIHJldmlld1Rhc2tzPzogUGxhblRhc2tbXTtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGxhbm5lclNldHRpbmdzID0ge1xuICBwcm92aWRlcjogXCJjdXN0b21cIixcbiAgaW50ZXJmYWNlTGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBhcGlCYXNlVXJsOiBcImh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjFcIixcbiAgYXBpS2V5OiBcIlwiLFxuICBtb2RlbDogXCJncHQtNC4xLW1pbmlcIixcbiAgY3VzdG9tSGVhZGVyczogXCJ7fVwiLFxuICB0ZW1wZXJhdHVyZTogMC4zLFxuICBtYXhUb2tlbnM6IDE4MDAsXG4gIGhpc3RvcnlEYXlzOiAxNCxcbiAgZm9jdXNNaW51dGVzOiAyNSxcbiAgc3R1ZHlGb2xkZXI6IFwiMDZfVG9kby9cdTVCNjZcdTRFNjBcIixcbiAgd29ya0ZvbGRlcjogXCIwMV9cdTk4NzlcdTc2RUUvXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCJcbn07XG5cbmNvbnN0IFBST1ZJREVSUzogUmVjb3JkPFByb3ZpZGVySWQsIHsgbGFiZWw6IHN0cmluZzsgYmFzZVVybDogc3RyaW5nOyBtb2RlbDogc3RyaW5nIH0+ID0ge1xuICBjdXN0b206IHsgbGFiZWw6IFwiQ3VzdG9tIE9wZW5BSS1jb21wYXRpYmxlIC8gXHU4MUVBXHU1QjlBXHU0RTQ5XHU1MTdDXHU1QkI5XHU2M0E1XHU1M0UzXCIsIGJhc2VVcmw6IFwiXCIsIG1vZGVsOiBcIlwiIH0sXG4gIG9wZW5haTogeyBsYWJlbDogXCJPcGVuQUlcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsIG1vZGVsOiBcImdwdC00LjEtbWluaVwiIH0sXG4gIGNsYXVkZTogeyBsYWJlbDogXCJBbnRocm9waWMgQ2xhdWRlXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkuYW50aHJvcGljLmNvbS92MVwiLCBtb2RlbDogXCJjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTRcIiB9LFxuICBkZWVwc2VlazogeyBsYWJlbDogXCJEZWVwU2Vla1wiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLmRlZXBzZWVrLmNvbS92MVwiLCBtb2RlbDogXCJkZWVwc2Vlay1jaGF0XCIgfSxcbiAgZ2xtOiB7IGxhYmVsOiBcIlpoaXB1IEdMTSAvIFx1NjY3QVx1OEMzMVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vb3Blbi5iaWdtb2RlbC5jbi9hcGkvcGFhcy92NFwiLCBtb2RlbDogXCJnbG0tNC1mbGFzaFwiIH0sXG4gIGtpbWk6IHsgbGFiZWw6IFwiS2ltaSAvIE1vb25zaG90XCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkubW9vbnNob3QuY24vdjFcIiwgbW9kZWw6IFwibW9vbnNob3QtdjEtOGtcIiB9LFxuICBnZW1pbmk6IHsgbGFiZWw6IFwiR29vZ2xlIEdlbWluaVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vZ2VuZXJhdGl2ZWxhbmd1YWdlLmdvb2dsZWFwaXMuY29tL3YxYmV0YVwiLCBtb2RlbDogXCJnZW1pbmktMi4wLWZsYXNoXCIgfVxufTtcblxuYXN5bmMgZnVuY3Rpb24gcmVxdWVzdFBsYW5Db21wbGV0aW9uKFxuICBzZXR0aW5nczogUGxhbm5lclNldHRpbmdzLFxuICBiYXNlVXJsOiBzdHJpbmcsXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG4gIHN5c3RlbTogc3RyaW5nLFxuICB1c2VyOiBzdHJpbmdcbik6IFByb21pc2U8QXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiByZXF1ZXN0VXJsPj4+IHtcbiAgaWYgKHNldHRpbmdzLnByb3ZpZGVyID09PSBcImNsYXVkZVwiKSB7XG4gICAgaWYgKHNldHRpbmdzLmFwaUtleSkgaGVhZGVyc1tcIngtYXBpLWtleVwiXSA9IHNldHRpbmdzLmFwaUtleTtcbiAgICBoZWFkZXJzW1wiYW50aHJvcGljLXZlcnNpb25cIl0gPz89IFwiMjAyMy0wNi0wMVwiO1xuICAgIHJldHVybiByZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogYCR7YmFzZVVybH0vbWVzc2FnZXNgLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogc2V0dGluZ3MubW9kZWwsIG1heF90b2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBzeXN0ZW0sIG1lc3NhZ2VzOiBbeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogdXNlciB9XSB9KSwgdGhyb3c6IGZhbHNlXG4gICAgfSk7XG4gIH1cbiAgaWYgKHNldHRpbmdzLnByb3ZpZGVyID09PSBcImdlbWluaVwiKSB7XG4gICAgY29uc3Qga2V5ID0gc2V0dGluZ3MuYXBpS2V5ID8gYD9rZXk9JHtlbmNvZGVVUklDb21wb25lbnQoc2V0dGluZ3MuYXBpS2V5KX1gIDogXCJcIjtcbiAgICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGAke2Jhc2VVcmx9L21vZGVscy8ke2VuY29kZVVSSUNvbXBvbmVudChzZXR0aW5ncy5tb2RlbCl9OmdlbmVyYXRlQ29udGVudCR7a2V5fWAsIG1ldGhvZDogXCJQT1NUXCIsIGhlYWRlcnMsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN5c3RlbUluc3RydWN0aW9uOiB7IHBhcnRzOiBbeyB0ZXh0OiBzeXN0ZW0gfV0gfSwgY29udGVudHM6IFt7IHJvbGU6IFwidXNlclwiLCBwYXJ0czogW3sgdGV4dDogdXNlciB9XSB9XSwgZ2VuZXJhdGlvbkNvbmZpZzogeyB0ZW1wZXJhdHVyZTogc2V0dGluZ3MudGVtcGVyYXR1cmUsIG1heE91dHB1dFRva2Vuczogc2V0dGluZ3MubWF4VG9rZW5zLCByZXNwb25zZU1pbWVUeXBlOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9IH0pLCB0aHJvdzogZmFsc2VcbiAgICB9KTtcbiAgfVxuICBpZiAoc2V0dGluZ3MuYXBpS2V5KSBoZWFkZXJzLkF1dGhvcml6YXRpb24gPSBgQmVhcmVyICR7c2V0dGluZ3MuYXBpS2V5fWA7XG4gIHJldHVybiByZXF1ZXN0VXJsKHtcbiAgICB1cmw6IGAke2Jhc2VVcmx9L2NoYXQvY29tcGxldGlvbnNgLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6IHNldHRpbmdzLm1vZGVsLCB0ZW1wZXJhdHVyZTogc2V0dGluZ3MudGVtcGVyYXR1cmUsIG1heF90b2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgbWVzc2FnZXM6IFt7IHJvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IHN5c3RlbSB9LCB7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiB1c2VyIH1dIH0pLCB0aHJvdzogZmFsc2VcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRpb25UZXh0KHByb3ZpZGVyOiBQcm92aWRlcklkLCByZXNwb25zZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGpzb24gPSByZXNwb25zZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKHByb3ZpZGVyID09PSBcImNsYXVkZVwiKSB7XG4gICAgY29uc3QgY29udGVudCA9IGpzb24uY29udGVudCBhcyBBcnJheTx7IHR5cGU/OiBzdHJpbmc7IHRleHQ/OiBzdHJpbmcgfT4gfCB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIGNvbnRlbnQ/LmZpbHRlcihwYXJ0ID0+IHBhcnQudHlwZSA9PT0gXCJ0ZXh0XCIpLm1hcChwYXJ0ID0+IHBhcnQudGV4dCA/PyBcIlwiKS5qb2luKFwiXCIpO1xuICB9XG4gIGlmIChwcm92aWRlciA9PT0gXCJnZW1pbmlcIikge1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBqc29uLmNhbmRpZGF0ZXMgYXMgQXJyYXk8eyBjb250ZW50PzogeyBwYXJ0cz86IEFycmF5PHsgdGV4dD86IHN0cmluZyB9PiB9IH0+IHwgdW5kZWZpbmVkO1xuICAgIHJldHVybiBjYW5kaWRhdGVzPy5bMF0/LmNvbnRlbnQ/LnBhcnRzPy5tYXAocGFydCA9PiBwYXJ0LnRleHQgPz8gXCJcIikuam9pbihcIlwiKTtcbiAgfVxuICBjb25zdCBjaG9pY2VzID0ganNvbi5jaG9pY2VzIGFzIEFycmF5PHsgbWVzc2FnZT86IHsgY29udGVudD86IHN0cmluZyB9IH0+IHwgdW5kZWZpbmVkO1xuICByZXR1cm4gY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50O1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBBSVBsYW5uZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwbHVnaW5TZXR0aW5ncyE6IFBsYW5uZXJTZXR0aW5ncztcbiAgcHJpdmF0ZSBmb2N1c1N0YXR1c0VsITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgZm9jdXNNaW5pRWwhOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgcHJpdmF0ZSBmaW5pc2hpbmdGb2N1cyA9IGZhbHNlO1xuICBwcml2YXRlIGZvY3VzVGltZXJPcGVuID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaURyYWdnaW5nID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaU1vdmVkID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaVN0YXJ0WCA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0WSA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0TGVmdCA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0VG9wID0gMDtcblxuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBBSVBsYW5uZXJTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNyZWF0ZS1haS1wbGFuXCIsXG4gICAgICBuYW1lOiBcIkNyZWF0ZSBBSSBwbGFuXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gbmV3IFBsYW5JbnB1dE1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKClcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJzdGFydC1mb2N1cy1zZXNzaW9uXCIsIG5hbWU6IFwiU3RhcnQgZm9jdXMgc2Vzc2lvblwiLCBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuRm9jdXNGb3JBY3RpdmVOb3RlKCkgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwicmVzdW1lLWZvY3VzLXNlc3Npb25cIiwgbmFtZTogXCJSZXN1bWUgZm9jdXMgc2Vzc2lvblwiLCBjYWxsYmFjazogKCkgPT4gdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpIH0pO1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImNhbGVuZGFyLXBsdXNcIiwgXCJDcmVhdGUgQUkgcGxhblwiLCAoKSA9PiBuZXcgUGxhbklucHV0TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSk7XG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwidGltZXJcIiwgXCJTdGFydCBmb2N1cyBzZXNzaW9uXCIsICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLWZvY3VzLXN0YXR1c1wiKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c1N0YXR1c0VsLCBcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsID0gdGhpcy5hcHAud29ya3NwYWNlLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLW1pbmlcIixcbiAgICAgIGF0dHI6IHsgdHlwZTogXCJidXR0b25cIiwgXCJhcmlhLWxhYmVsXCI6IFwiUmVzdG9yZSBmb2N1cyB0aW1lclwiIH1cbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJjbGlja1wiLCBldmVudCA9PiB7XG4gICAgICBpZiAodGhpcy5taW5pTW92ZWQpIHsgZXZlbnQucHJldmVudERlZmF1bHQoKTsgcmV0dXJuOyB9XG4gICAgICB2b2lkIHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJwb2ludGVyZG93blwiLCBldmVudCA9PiB0aGlzLmJlZ2luTWluaURyYWcoZXZlbnQpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInBvaW50ZXJtb3ZlXCIsIGV2ZW50ID0+IHRoaXMubW92ZU1pbmlEcmFnKGV2ZW50KSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJwb2ludGVydXBcIiwgKCkgPT4gdm9pZCB0aGlzLmVuZE1pbmlEcmFnKCkpO1xuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdGhpcy5mb2N1c01pbmlFbC5yZW1vdmUoKSk7XG4gICAgY29uc3QgdXBkYXRlVmlzaWJsZUhlaWdodCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWluKHdpbmRvdy52aXN1YWxWaWV3cG9ydD8uaGVpZ2h0ID8/IHdpbmRvdy5pbm5lckhlaWdodCwgd2luZG93LmlubmVySGVpZ2h0KTtcbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tYWktcGxhbm5lci12aXNpYmxlLWhlaWdodFwiLCBgJHtNYXRoLnJvdW5kKGhlaWdodCl9cHhgKTtcbiAgICB9O1xuICAgIHVwZGF0ZVZpc2libGVIZWlnaHQoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInJlc2l6ZVwiLCB1cGRhdGVWaXNpYmxlSGVpZ2h0KTtcbiAgICBpZiAod2luZG93LnZpc3VhbFZpZXdwb3J0KSB7XG4gICAgICBjb25zdCB2aWV3cG9ydCA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydDtcbiAgICAgIHZpZXdwb3J0LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCk7XG4gICAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHZpZXdwb3J0LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCkpO1xuICAgIH1cbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiZm9jdXNpblwiLCBldmVudCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgIXRhcmdldC5tYXRjaGVzKFwiaW5wdXQsIHRleHRhcmVhLCBzZWxlY3RcIikpIHJldHVybjtcbiAgICAgIGlmICghdGFyZ2V0LmNsb3Nlc3QoXCIuYWktcGxhbm5lci1tb2RhbFwiKSkgcmV0dXJuO1xuICAgICAgdGhpcy5rZWVwRm9jdXNlZElucHV0VmlzaWJsZSh0YXJnZXQpO1xuICAgIH0pO1xuICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChkb2N1bWVudCwgXCJmb2N1c291dFwiLCBldmVudCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHJldHVybjtcbiAgICAgIGNvbnN0IG1vZGFsID0gdGFyZ2V0LmNsb3Nlc3QoXCIuYWktcGxhbm5lci1tb2RhbFwiKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBpZiAoIW1vZGFsKSByZXR1cm47XG4gICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG4gICAgICAgIGlmIChhY3RpdmUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCAmJiBhY3RpdmUuY2xvc2VzdChcIi5haS1wbGFubmVyLW1vZGFsXCIpID09PSBtb2RhbCkgcmV0dXJuO1xuICAgICAgICBtb2RhbC5yZW1vdmVDbGFzcyhcImFpLXBsYW5uZXIta2V5Ym9hcmQtYWN0aXZlXCIpO1xuICAgICAgICBtb2RhbC5zdHlsZS5yZW1vdmVQcm9wZXJ0eShcIi0tYWktcGxhbm5lci1rZXlib2FyZC1zaGlmdFwiKTtcbiAgICAgIH0sIDE4MCk7XG4gICAgfSk7XG4gICAgdGhpcy5yZWdpc3RlckludGVydmFsKHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB2b2lkIHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCksIDUwMCkpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gIH1cblxuICBwcml2YXRlIGtlZXBGb2N1c2VkSW5wdXRWaXNpYmxlKHRhcmdldDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBjb25zdCBjb250ZW50ID0gdGFyZ2V0LmNsb3Nlc3QoXCIubW9kYWwtY29udGVudFwiKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgbW9kYWwgPSB0YXJnZXQuY2xvc2VzdChcIi5haS1wbGFubmVyLW1vZGFsXCIpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAoIWNvbnRlbnQgfHwgIW1vZGFsKSByZXR1cm47XG4gICAgbW9kYWwucmVtb3ZlQ2xhc3MoXCJhaS1wbGFubmVyLWtleWJvYXJkLWFjdGl2ZVwiKTtcbiAgICBtb2RhbC5zdHlsZS5yZW1vdmVQcm9wZXJ0eShcIi0tYWktcGxhbm5lci1rZXlib2FyZC1zaGlmdFwiKTtcbiAgICBjb25zdCBtb3ZlID0gKCk6IHZvaWQgPT4ge1xuICAgICAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSBNYXRoLm1pbih3aW5kb3cudmlzdWFsVmlld3BvcnQ/LmhlaWdodCA/PyB3aW5kb3cuaW5uZXJIZWlnaHQsIHdpbmRvdy5pbm5lckhlaWdodCk7XG4gICAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgY29udGVudFJlY3QgPSBjb250ZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgdG9wTGltaXQgPSBNYXRoLm1heChjb250ZW50UmVjdC50b3AgKyAxNiwgMTYpO1xuICAgICAgY29uc3QgYm90dG9tTGltaXQgPSBNYXRoLm1pbihjb250ZW50UmVjdC5ib3R0b20gLSAxNiwgdmlld3BvcnRIZWlnaHQgLSAyNCk7XG4gICAgICBpZiAodGFyZ2V0UmVjdC5ib3R0b20gPiBib3R0b21MaW1pdCkgY29udGVudC5zY3JvbGxUb3AgKz0gdGFyZ2V0UmVjdC5ib3R0b20gLSBib3R0b21MaW1pdDtcbiAgICAgIGVsc2UgaWYgKHRhcmdldFJlY3QudG9wIDwgdG9wTGltaXQpIGNvbnRlbnQuc2Nyb2xsVG9wIC09IHRvcExpbWl0IC0gdGFyZ2V0UmVjdC50b3A7XG5cbiAgICAgIGlmICh3aW5kb3cuaW5uZXJXaWR0aCA+IDYwMCkgcmV0dXJuO1xuICAgICAgLy8gU29tZSBpT1MgV2ViVmlld3Mga2VlcCByZXBvcnRpbmcgdGhlIGZ1bGwgbGF5b3V0IHZpZXdwb3J0IGFib3ZlIHRoZSBrZXlib2FyZC5cbiAgICAgIGNvbnN0IHJlcG9ydGVkSGVpZ2h0ID0gd2luZG93LnZpc3VhbFZpZXdwb3J0Py5oZWlnaHQgPz8gd2luZG93LmlubmVySGVpZ2h0O1xuICAgICAgY29uc3Qga2V5Ym9hcmRUb3AgPSByZXBvcnRlZEhlaWdodCA8IHdpbmRvdy5pbm5lckhlaWdodCAqIDAuODggPyByZXBvcnRlZEhlaWdodCA6IHdpbmRvdy5pbm5lckhlaWdodCAqIDAuNTg7XG4gICAgICBjb25zdCB1cGRhdGVkUmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHNhZmVCb3R0b20gPSBrZXlib2FyZFRvcCAtIDI0O1xuICAgICAgaWYgKHVwZGF0ZWRSZWN0LmJvdHRvbSA+IHNhZmVCb3R0b20pIHtcbiAgICAgICAgY29uc3Qgc2hpZnQgPSBNYXRoLm1pbihNYXRoLm1heCgwLCB1cGRhdGVkUmVjdC50b3AgLSBNYXRoLm1heCg0OCwga2V5Ym9hcmRUb3AgKiAwLjIpKSwgd2luZG93LmlubmVySGVpZ2h0ICogMC42KTtcbiAgICAgICAgaWYgKHNoaWZ0ID4gMCkge1xuICAgICAgICAgIG1vZGFsLnN0eWxlLnNldFByb3BlcnR5KFwiLS1haS1wbGFubmVyLWtleWJvYXJkLXNoaWZ0XCIsIGAke01hdGgucm91bmQoc2hpZnQpfXB4YCk7XG4gICAgICAgICAgbW9kYWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLWtleWJvYXJkLWFjdGl2ZVwiKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gICAgZm9yIChjb25zdCBkZWxheSBvZiBbMCwgMTgwLCA0MjAsIDc1MF0pIHdpbmRvdy5zZXRUaW1lb3V0KG1vdmUsIGRlbGF5KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMucGx1Z2luU2V0dGluZ3MpO1xuICB9XG5cbiAgZ2V0QWN0aXZlRm9jdXMoKTogQWN0aXZlRm9jdXNTZXNzaW9uIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgfVxuXG4gIHNldEZvY3VzVGltZXJPcGVuKG9wZW46IGJvb2xlYW4pOiB2b2lkIHtcbiAgICB0aGlzLmZvY3VzVGltZXJPcGVuID0gb3BlbjtcbiAgICB2b2lkIHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gIH1cblxuICBwcml2YXRlIGJlZ2luTWluaURyYWcoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGlmIChldmVudC5idXR0b24gIT09IDApIHJldHVybjtcbiAgICBjb25zdCByZWN0ID0gdGhpcy5mb2N1c01pbmlFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICB0aGlzLm1pbmlEcmFnZ2luZyA9IHRydWU7XG4gICAgdGhpcy5taW5pTW92ZWQgPSBmYWxzZTtcbiAgICB0aGlzLm1pbmlTdGFydFggPSBldmVudC5jbGllbnRYO1xuICAgIHRoaXMubWluaVN0YXJ0WSA9IGV2ZW50LmNsaWVudFk7XG4gICAgdGhpcy5taW5pU3RhcnRMZWZ0ID0gcmVjdC5sZWZ0O1xuICAgIHRoaXMubWluaVN0YXJ0VG9wID0gcmVjdC50b3A7XG4gIH1cblxuICBwcml2YXRlIG1vdmVNaW5pRHJhZyhldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLm1pbmlEcmFnZ2luZykgcmV0dXJuO1xuICAgIGNvbnN0IGR4ID0gZXZlbnQuY2xpZW50WCAtIHRoaXMubWluaVN0YXJ0WDtcbiAgICBjb25zdCBkeSA9IGV2ZW50LmNsaWVudFkgLSB0aGlzLm1pbmlTdGFydFk7XG4gICAgaWYgKCF0aGlzLm1pbmlNb3ZlZCAmJiBNYXRoLmh5cG90KGR4LCBkeSkgPCA2KSByZXR1cm47XG4gICAgdGhpcy5taW5pTW92ZWQgPSB0cnVlO1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgbGVmdCA9IE1hdGgubWluKE1hdGgubWF4KDgsIHRoaXMubWluaVN0YXJ0TGVmdCArIGR4KSwgTWF0aC5tYXgoOCwgd2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoIC0gOCkpO1xuICAgIGNvbnN0IHRvcCA9IE1hdGgubWluKE1hdGgubWF4KDgsIHRoaXMubWluaVN0YXJ0VG9wICsgZHkpLCBNYXRoLm1heCg4LCB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCAtIDgpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5yaWdodCA9IFwiYXV0b1wiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuYm90dG9tID0gXCJhdXRvXCI7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGVuZE1pbmlEcmFnKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5taW5pRHJhZ2dpbmcpIHJldHVybjtcbiAgICB0aGlzLm1pbmlEcmFnZ2luZyA9IGZhbHNlO1xuICAgIGlmICghdGhpcy5taW5pTW92ZWQpIHJldHVybjtcbiAgICBjb25zdCByZWN0ID0gdGhpcy5mb2N1c01pbmlFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDEsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCk7XG4gICAgY29uc3QgaGVpZ2h0ID0gTWF0aC5tYXgoMSwgd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQpO1xuICAgIHRoaXMucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW5pUG9zaXRpb24gPSB7IHg6IHJlY3QubGVmdCAvIHdpZHRoLCB5OiByZWN0LnRvcCAvIGhlaWdodCB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4geyB0aGlzLm1pbmlNb3ZlZCA9IGZhbHNlOyB9LCAwKTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlNaW5pUG9zaXRpb24oKTogdm9pZCB7XG4gICAgY29uc3QgcG9zaXRpb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmZvY3VzTWluaVBvc2l0aW9uO1xuICAgIGlmICghcG9zaXRpb24pIHJldHVybjtcbiAgICBjb25zdCByZWN0ID0gdGhpcy5mb2N1c01pbmlFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBsZWZ0ID0gTWF0aC5taW4oTWF0aC5tYXgoOCwgcG9zaXRpb24ueCAqICh3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGgpKSwgTWF0aC5tYXgoOCwgd2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoIC0gOCkpO1xuICAgIGNvbnN0IHRvcCA9IE1hdGgubWluKE1hdGgubWF4KDgsIHBvc2l0aW9uLnkgKiAod2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQpKSwgTWF0aC5tYXgoOCwgd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSA4KSk7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUucmlnaHQgPSBcImF1dG9cIjtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmJvdHRvbSA9IFwiYXV0b1wiO1xuICB9XG5cbiAgYXN5bmMgb3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cykge1xuICAgICAgYXdhaXQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICBpZiAoIWZpbGUpIHsgbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQVx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMCAvIE9wZW4gYSBwbGFuIG5vdGUgZmlyc3QuXCIpOyByZXR1cm47IH1cbiAgICBjb25zdCB0YXNrcyA9IGV4dHJhY3RGb2N1c1Rhc2tzKHRoaXMuYXBwLCBmaWxlKTtcbiAgICBpZiAoIXRhc2tzLmxlbmd0aCkgeyBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU2Q0ExXHU2NzA5XHU1M0VGXHU0RTEzXHU2Q0U4XHU3Njg0XHU4QkExXHU1MjEyXHU0RUZCXHU1MkExIC8gTm8gcGxhbiB0YXNrcyBmb3VuZC5cIik7IHJldHVybjsgfVxuICAgIG5ldyBGb2N1c1Rhc2tQaWNrZXJNb2RhbCh0aGlzLmFwcCwgdGhpcywgZmlsZSwgdGFza3MpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHN0YXJ0Rm9jdXMoZmlsZTogVEZpbGUsIHRhc2s6IEZvY3VzVGFzaywgbWludXRlczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXMpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTVERjJcdTY3MDlcdThGREJcdTg4NENcdTRFMkRcdTc2ODRcdTRFMTNcdTZDRTggLyBBIGZvY3VzIHNlc3Npb24gaXMgYWxyZWFkeSBhY3RpdmUuXCIpO1xuICAgICAgYXdhaXQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdGFydGVkQXQgPSBEYXRlLm5vdygpO1xuICAgIHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXMgPSB7XG4gICAgICBmaWxlUGF0aDogZmlsZS5wYXRoLFxuICAgICAgdGFza0lkOiB0YXNrLmlkLFxuICAgICAgdGFza05hbWU6IHRhc2submFtZSxcbiAgICAgIGNhdGVnb3J5OiB0YXNrLmNhdGVnb3J5LFxuICAgICAgZHVyYXRpb25NczogTWF0aC5tYXgoMSwgbWludXRlcykgKiA2MDAwMCxcbiAgICAgIGZvY3VzZWRNczogMCxcbiAgICAgIHJ1bm5pbmdBdDogc3RhcnRlZEF0LFxuICAgICAgc3RhcnRlZEF0XG4gICAgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgZm0gPT4ge1xuICAgICAgICBmbVtgJHt0YXNrLmlkfUFjdHVhbFN0YXJ0YF0gPz89IHRpbWVPZkRheShuZXcgRGF0ZShzdGFydGVkQXQpKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2gge1xuICAgICAgbmV3IE5vdGljZShcIlx1NjVFMFx1NkNENVx1N0FDQlx1NTM3M1x1NTE5OVx1NTE2NVx1NUYwMFx1NTlDQlx1NjVGNlx1OTVGNFx1RkYwQ1x1NUMwNlx1NTcyOFx1N0VEM1x1Njc1Rlx1NjVGNlx1OTFDRFx1OEJENSAvIENvdWxkIG5vdCB3cml0ZSB0aGUgc3RhcnQgdGltZSB5ZXQ7IGl0IHdpbGwgcmV0cnkgb24gZmluaXNoLlwiKTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgICBuZXcgRm9jdXNUaW1lck1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XG4gIH1cblxuICBhc3luYyB0b2dnbGVGb2N1c1BhdXNlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCkge1xuICAgICAgc2Vzc2lvbi5mb2N1c2VkTXMgKz0gTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIHNlc3Npb24ucnVubmluZ0F0KTtcbiAgICAgIHNlc3Npb24ucnVubmluZ0F0ID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgc2Vzc2lvbi5ydW5uaW5nQXQgPSBEYXRlLm5vdygpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gIH1cblxuICBhc3luYyByZXN0b3JlRm9jdXNUaW1lcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24pIHJldHVybjtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHNlc3Npb24uZmlsZVBhdGgpO1xuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTYyN0VcdTRFMERcdTUyMzBcdTUzOUZcdThCQTFcdTUyMTJcdTdCMTRcdThCQjBcdUZGMENcdTY1RTBcdTZDRDVcdTVCOENcdTYyMTBcdTU2REVcdTUxOTkgLyBUaGUgcGxhbiBub3RlIGlzIG1pc3NpbmcuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuZXcgRm9jdXNUaW1lck1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XG4gIH1cblxuICBhc3luYyBmaW5pc2hGb2N1cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24gfHwgdGhpcy5maW5pc2hpbmdGb2N1cykgcmV0dXJuO1xuICAgIHRoaXMuZmluaXNoaW5nRm9jdXMgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICBpZiAoc2Vzc2lvbi5ydW5uaW5nQXQgIT09IG51bGwpIHtcbiAgICAgICAgc2Vzc2lvbi5mb2N1c2VkTXMgKz0gTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIHNlc3Npb24ucnVubmluZ0F0KTtcbiAgICAgICAgc2Vzc2lvbi5ydW5uaW5nQXQgPSBudWxsO1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgICAgfVxuICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChzZXNzaW9uLmZpbGVQYXRoKTtcbiAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcbiAgICAgICAgbmV3IE5vdGljZShcIlx1NjI3RVx1NEUwRFx1NTIzMFx1NTM5Rlx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMFx1RkYwQ1x1NEUxM1x1NkNFOFx1OEJCMFx1NUY1NVx1NjY4Mlx1NjcyQVx1NTE5OVx1NTE2NSAvIFBsYW4gbm90ZSBtaXNzaW5nOyBmb2N1cyByZWNvcmQgd2FzIGtlcHQuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBhY3R1YWxNaW51dGVzID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChzZXNzaW9uLmZvY3VzZWRNcyAvIDYwMDAwKSk7XG4gICAgICBhd2FpdCB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgZm0gPT4ge1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxTdGFydGBdID8/PSB0aW1lT2ZEYXkobmV3IERhdGUoc2Vzc2lvbi5zdGFydGVkQXQpKTtcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsRW5kYF0gPSB0aW1lT2ZEYXkobmV3IERhdGUoKSk7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbE1pbnV0ZXNgXSA9IE51bWJlcihmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxNaW51dGVzYF0gPz8gMCkgKyBhY3R1YWxNaW51dGVzO1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1Gb2N1c1Nlc3Npb25zYF0gPSBOdW1iZXIoZm1bYCR7c2Vzc2lvbi50YXNrSWR9Rm9jdXNTZXNzaW9uc2BdID8/IDApICsgMTtcbiAgICAgIH0pO1xuICAgICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cyA9IHVuZGVmaW5lZDtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICBuZXcgTm90aWNlKGBcdTVERjJcdThCQjBcdTVGNTUgJHthY3R1YWxNaW51dGVzfSBcdTUyMDZcdTk0OUZcdTRFMTNcdTZDRTggLyBGb2N1cyByZWNvcmRlZC5gKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5maW5pc2hpbmdGb2N1cyA9IGZhbHNlO1xuICAgICAgYXdhaXQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyByZWZyZXNoRm9jdXNTdGF0dXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmRpc3BsYXkgPSB0aGlzLmZvY3VzVGltZXJPcGVuID8gXCJub25lXCIgOiBcIlwiO1xuICAgIGNvbnN0IGVsYXBzZWQgPSBzZXNzaW9uLmZvY3VzZWRNcyArIChzZXNzaW9uLnJ1bm5pbmdBdCA9PT0gbnVsbCA/IDAgOiBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpKTtcbiAgICBpZiAoc2Vzc2lvbi5ydW5uaW5nQXQgIT09IG51bGwgJiYgZWxhcHNlZCA+PSBzZXNzaW9uLmR1cmF0aW9uTXMpIHtcbiAgICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zZXRUZXh0KGBGb2N1cyBjb21wbGV0ZSBcdTAwQjcgJHtzZXNzaW9uLnRhc2tOYW1lfWApO1xuICAgICAgdGhpcy5mb2N1c01pbmlFbC5zZXRUZXh0KFwiXHU0RTEzXHU2Q0U4XHU1QjhDXHU2MjEwIC8gRm9jdXMgY29tcGxldGVcIik7XG4gICAgICB2b2lkIHRoaXMuZmluaXNoRm9jdXMoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3RhdGUgPSBzZXNzaW9uLnJ1bm5pbmdBdCA9PT0gbnVsbCA/IFwiRm9jdXMgcGF1c2VkXCIgOiBmb3JtYXREdXJhdGlvbihNYXRoLm1heCgwLCBzZXNzaW9uLmR1cmF0aW9uTXMgLSBlbGFwc2VkKSk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldFRleHQoYCR7c3RhdGV9IFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zZXRUZXh0KGAke3N0YXRlfSBcdTAwQjcgJHtzZXNzaW9uLnRhc2tOYW1lfWApO1xuICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwiUmVzdG9yZSBmb2N1cyB0aW1lclwiKTtcbiAgICBpZiAoIXRoaXMuZm9jdXNUaW1lck9wZW4pIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gdGhpcy5hcHBseU1pbmlQb3NpdGlvbigpKTtcbiAgfVxuXG4gIGFzeW5jIGdlbmVyYXRlUGxhbihtb2RlOiBQbGFuTW9kZSwgZGF0ZTogc3RyaW5nLCBzdGFydFRpbWU6IHN0cmluZywgZW5kVGltZTogc3RyaW5nLCBpbnB1dDogc3RyaW5nKTogUHJvbWlzZTxQbGFuUmVzdWx0PiB7XG4gICAgaWYgKCF0aGlzLnBsdWdpblNldHRpbmdzLmFwaUJhc2VVcmwgfHwgIXRoaXMucGx1Z2luU2V0dGluZ3MubW9kZWwpIHRocm93IG5ldyBFcnJvcihcIlBsZWFzZSBjb25maWd1cmUgYW4gQVBJIGJhc2UgVVJMIGFuZCBtb2RlbCBmaXJzdC5cIik7XG4gICAgbGV0IGN1c3RvbUhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICB0cnkge1xuICAgICAgY3VzdG9tSGVhZGVycyA9IEpTT04ucGFyc2UodGhpcy5wbHVnaW5TZXR0aW5ncy5jdXN0b21IZWFkZXJzIHx8IFwie31cIik7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDdXN0b20gaGVhZGVycyBtdXN0IGJlIHZhbGlkIEpTT04uXCIpO1xuICAgIH1cbiAgICBjb25zdCBzeXN0ZW0gPSBtb2RlID09PSBcInN0dWR5XCJcbiAgICAgID8gXCJZb3UgY3JlYXRlIHByYWN0aWNhbCBzYW1lLWRheSBob21ld29yayBwbGFucyBmb3IgYSBjaGlsZC4gQnJlYWsgdGFza3MgaW50byBhIHNlbnNpYmxlIG9yZGVyLCBpbmNsdWRlIHNob3J0IGJyZWFrcyB3aGVuIGhlbHBmdWwsIGFuZCBvbmx5IGFkZCByZXZpZXcgdGFza3MgZ3JvdW5kZWQgaW4gdGhlIGdpdmVuIGhvbWV3b3JrLlwiXG4gICAgICA6IFwiWW91IGNyZWF0ZSBwcmFjdGljYWwgc2FtZS1kYXkgd29yayBwbGFucy4gUHJpb3JpdGl6ZSBieSB1cmdlbmN5IGFuZCBjb2duaXRpdmUgbG9hZCwgaW5jbHVkZSBidWZmZXJzLCBhbmQgZG8gbm90IGludmVudCB3b3JrIGl0ZW1zLlwiO1xuICAgIGNvbnN0IGZvbGRlciA9IG1vZGUgPT09IFwic3R1ZHlcIiA/IHRoaXMucGx1Z2luU2V0dGluZ3Muc3R1ZHlGb2xkZXIgOiB0aGlzLnBsdWdpblNldHRpbmdzLndvcmtGb2xkZXI7XG4gICAgY29uc3QgaGlzdG9yeSA9IGJ1aWxkSGlzdG9yeUNvbnRleHQodGhpcy5hcHAsIGZvbGRlciwgdGhpcy5wbHVnaW5TZXR0aW5ncy5oaXN0b3J5RGF5cyk7XG4gICAgY29uc3QgdXNlciA9IGBQbGFuIGRhdGU6ICR7ZGF0ZX1cXG5TdGFydCB0aW1lOiAke3N0YXJ0VGltZSB8fCBcIm5vdCBzcGVjaWZpZWRcIn1cXG5MYXRlc3QgZmluaXNoOiAke2VuZFRpbWUgfHwgXCJub3Qgc3BlY2lmaWVkXCJ9XFxuSXRlbXM6XFxuJHtpbnB1dH1cXG5cXG5IaXN0b3JpY2FsIHRpbWluZyBjYWxpYnJhdGlvbjpcXG4ke2hpc3Rvcnl9XFxuXFxuVXNlIHRoZSBjYWxpYnJhdGlvbiBvbmx5IHdoZW4gaXQgaGFzIGF0IGxlYXN0IHR3byBjb21wYXJhYmxlIHJlY29yZHMuIFJldHVybiBKU09OIG9ubHksIHdpdGggdGhpcyBzaGFwZToge1widGl0bGVcIjpcInNob3J0IHRpdGxlXCIsXCJzdW1tYXJ5XCI6XCJvbmUgc2VudGVuY2VcIixcInRhc2tzXCI6W3tcInRpdGxlXCI6XCJ0YXNrXCIsXCJjYXRlZ29yeVwiOlwic3ViamVjdCBvciBwcm9qZWN0XCIsXCJzdGFydFRpbWVcIjpcIkhIOm1tXCIsXCJlbmRUaW1lXCI6XCJISDptbVwiLFwiZXN0aW1hdGVkTWludXRlc1wiOjMwLFwiZGVzY3JpcHRpb25cIjpcIm9wdGlvbmFsXCJ9XSxcInJldmlld1Rhc2tzXCI6W3NhbWUgdGFzayBzaGFwZV19LiBVc2UgW10gZm9yIHJldmlld1Rhc2tzIHdoZW4gbm9uZSBhcmUganVzdGlmaWVkLmA7XG4gICAgY29uc3QgYmFzZVVybCA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybC5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG4gICAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsIC4uLmN1c3RvbUhlYWRlcnMgfTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RQbGFuQ29tcGxldGlvbih0aGlzLnBsdWdpblNldHRpbmdzLCBiYXNlVXJsLCBoZWFkZXJzLCBzeXN0ZW0sIHVzZXIpO1xuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPCAyMDAgfHwgcmVzcG9uc2Uuc3RhdHVzID49IDMwMCkgdGhyb3cgbmV3IEVycm9yKGBBUEkgcmVxdWVzdCBmYWlsZWQgKCR7cmVzcG9uc2Uuc3RhdHVzfSk6ICR7cmVzcG9uc2UudGV4dC5zbGljZSgwLCAzMDApfWApO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBjb21wbGV0aW9uVGV4dCh0aGlzLnBsdWdpblNldHRpbmdzLnByb3ZpZGVyLCByZXNwb25zZS5qc29uKTtcbiAgICBpZiAodHlwZW9mIGNvbnRlbnQgIT09IFwic3RyaW5nXCIpIHRocm93IG5ldyBFcnJvcihcIlRoZSBwcm92aWRlciBkaWQgbm90IHJldHVybiBhIGNoYXQgY29tcGxldGlvbi5cIik7XG4gICAgcmV0dXJuIHBhcnNlUGxhbihjb250ZW50KTtcbiAgfVxuXG4gIGFzeW5jIHdyaXRlUGxhbihtb2RlOiBQbGFuTW9kZSwgZGF0ZTogc3RyaW5nLCBwbGFuOiBQbGFuUmVzdWx0KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBmb2xkZXIgPSBtb2RlID09PSBcInN0dWR5XCIgPyB0aGlzLnBsdWdpblNldHRpbmdzLnN0dWR5Rm9sZGVyIDogdGhpcy5wbHVnaW5TZXR0aW5ncy53b3JrRm9sZGVyO1xuICAgIGF3YWl0IGVuc3VyZUZvbGRlcih0aGlzLmFwcCwgZm9sZGVyKTtcbiAgICBjb25zdCBmaWxlbmFtZSA9IGAke2RhdGV9LSR7c2FmZUZpbGVuYW1lKHBsYW4udGl0bGUgfHwgKG1vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU0RjVDXHU0RTFBXHU4QkExXHU1MjEyXCIgOiBcIlx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwiKSl9Lm1kYDtcbiAgICBjb25zdCBwYXRoID0gbm9ybWFsaXplUGF0aChgJHtmb2xkZXJ9LyR7ZmlsZW5hbWV9YCk7XG4gICAgY29uc3QgY29udGVudCA9IHJlbmRlclBsYW4obW9kZSwgZGF0ZSwgcGxhbik7XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCk7XG4gICAgaWYgKGV4aXN0aW5nIGluc3RhbmNlb2YgVEZpbGUpIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShleGlzdGluZywgY29udGVudCk7XG4gICAgZWxzZSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUocGF0aCwgY29udGVudCk7XG4gICAgYXdhaXQgdGhpcy5hcHAud29ya3NwYWNlLm9wZW5MaW5rVGV4dChwYXRoLCBcIlwiLCB0cnVlKTtcbiAgICByZXR1cm4gcGF0aDtcbiAgfVxufVxuXG5pbnRlcmZhY2UgRm9jdXNUYXNrIHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBjYXRlZ29yeTogc3RyaW5nOyBlc3RpbWF0ZWRNaW51dGVzOiBudW1iZXI7IH1cblxuZnVuY3Rpb24gZXh0cmFjdEZvY3VzVGFza3MoYXBwOiBBcHAsIGZpbGU6IFRGaWxlKTogRm9jdXNUYXNrW10ge1xuICBjb25zdCBmbSA9IGFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKT8uZnJvbnRtYXR0ZXIgPz8ge307XG4gIHJldHVybiBPYmplY3Qua2V5cyhmbSkuZmlsdGVyKGtleSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3Qoa2V5KSkuc29ydCgpLm1hcChrZXkgPT4ge1xuICAgIGNvbnN0IGlkID0ga2V5LnJlcGxhY2UoXCJOYW1lXCIsIFwiXCIpO1xuICAgIHJldHVybiB7IGlkLCBuYW1lOiBTdHJpbmcoZm1ba2V5XSA/PyBpZCksIGNhdGVnb3J5OiBTdHJpbmcoZm1bYCR7aWR9Q2F0ZWdvcnlgXSA/PyBcIlwiKSwgZXN0aW1hdGVkTWludXRlczogTnVtYmVyKGZtW2Ake2lkfUVzdGltYXRlZE1pbnV0ZXNgXSA/PyAwKSB9O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gYnVpbGRIaXN0b3J5Q29udGV4dChhcHA6IEFwcCwgZm9sZGVyOiBzdHJpbmcsIGRheXM6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IGN1dG9mZiA9IERhdGUubm93KCkgLSBkYXlzICogODY0MDAwMDA7XG4gIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHBsYW5uZWQ6IG51bWJlcjsgYWN0dWFsOiBudW1iZXI7IGNvdW50OiBudW1iZXIgfT4oKTtcbiAgZm9yIChjb25zdCBmaWxlIG9mIGFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkpIHtcbiAgICBpZiAoIWZpbGUucGF0aC5zdGFydHNXaXRoKGAke25vcm1hbGl6ZVBhdGgoZm9sZGVyKX0vYCkgfHwgZmlsZS5zdGF0Lm10aW1lIDwgY3V0b2ZmKSBjb250aW51ZTtcbiAgICBjb25zdCBmbSA9IGFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKT8uZnJvbnRtYXR0ZXIgPz8ge307XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZm0pLmZpbHRlcihpdGVtID0+IC9edGFza1xcZCtOYW1lJC8udGVzdChpdGVtKSkpIHtcbiAgICAgIGNvbnN0IGlkID0ga2V5LnJlcGxhY2UoXCJOYW1lXCIsIFwiXCIpO1xuICAgICAgY29uc3QgcGxhbm5lZCA9IE51bWJlcihmbVtgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzYF0gPz8gMCk7XG4gICAgICBjb25zdCBhY3R1YWwgPSBOdW1iZXIoZm1bYCR7aWR9QWN0dWFsTWludXRlc2BdID8/IDApIHx8IGR1cmF0aW9uRnJvbVRpbWVzKGZtW2Ake2lkfUFjdHVhbFN0YXJ0YF0sIGZtW2Ake2lkfUFjdHVhbEVuZGBdKTtcbiAgICAgIGlmIChwbGFubmVkIDw9IDAgfHwgYWN0dWFsIDw9IDApIGNvbnRpbnVlO1xuICAgICAgY29uc3QgY2F0ZWdvcnkgPSBTdHJpbmcoZm1bYCR7aWR9Q2F0ZWdvcnlgXSA/PyBTdHJpbmcoZm1ba2V5XSkuc3BsaXQoXCJcdTAwQjdcIilbMF0gPz8gXCJcdTUxNzZcdTVCODNcIikudHJpbSgpIHx8IFwiXHU1MTc2XHU1QjgzXCI7XG4gICAgICBjb25zdCBpdGVtID0gZ3JvdXBzLmdldChjYXRlZ29yeSkgPz8geyBwbGFubmVkOiAwLCBhY3R1YWw6IDAsIGNvdW50OiAwIH07XG4gICAgICBpdGVtLnBsYW5uZWQgKz0gcGxhbm5lZDsgaXRlbS5hY3R1YWwgKz0gYWN0dWFsOyBpdGVtLmNvdW50ICs9IDE7IGdyb3Vwcy5zZXQoY2F0ZWdvcnksIGl0ZW0pO1xuICAgIH1cbiAgfVxuICBjb25zdCBsaW5lcyA9IFsuLi5ncm91cHMuZW50cmllcygpXS5maWx0ZXIoKFssIHZhbHVlXSkgPT4gdmFsdWUuY291bnQgPj0gMikuc29ydCgoYSwgYikgPT4gYlsxXS5jb3VudCAtIGFbMV0uY291bnQpLnNsaWNlKDAsIDYpLm1hcCgoW2NhdGVnb3J5LCB2YWx1ZV0pID0+IHtcbiAgICBjb25zdCBwZXJjZW50ID0gTWF0aC5yb3VuZCgodmFsdWUuYWN0dWFsIC8gdmFsdWUucGxhbm5lZCAtIDEpICogMTAwKTtcbiAgICByZXR1cm4gYCR7Y2F0ZWdvcnl9OiAke3ZhbHVlLmNvdW50fSByZWNvcmRzLCBwbGFubmVkICR7dmFsdWUucGxhbm5lZH0gbWluLCBhY3R1YWwgJHt2YWx1ZS5hY3R1YWx9IG1pbiwgZGV2aWF0aW9uICR7cGVyY2VudCA+PSAwID8gXCIrXCIgOiBcIlwifSR7cGVyY2VudH0lYDtcbiAgfSk7XG4gIHJldHVybiBsaW5lcy5sZW5ndGggPyBsaW5lcy5qb2luKFwiXFxuXCIpIDogXCJObyByZWxpYWJsZSBoaXN0b3JpY2FsIHJlY29yZHMgeWV0LiBVc2UgcmVhc29uYWJsZSBlc3RpbWF0ZXMgYW5kIGEgc21hbGwgYnVmZmVyLlwiO1xufVxuXG5mdW5jdGlvbiBkdXJhdGlvbkZyb21UaW1lcyhzdGFydDogdW5rbm93biwgZW5kOiB1bmtub3duKTogbnVtYmVyIHtcbiAgY29uc3QgcGFyc2UgPSAodmFsdWU6IHVua25vd24pOiBudW1iZXIgfCBudWxsID0+IHsgY29uc3QgbWF0Y2ggPSBTdHJpbmcodmFsdWUgPz8gXCJcIikubWF0Y2goL14oXFxkezEsMn0pOihcXGR7Mn0pJC8pOyByZXR1cm4gbWF0Y2ggPyBOdW1iZXIobWF0Y2hbMV0pICogNjAgKyBOdW1iZXIobWF0Y2hbMl0pIDogbnVsbDsgfTtcbiAgY29uc3QgZnJvbSA9IHBhcnNlKHN0YXJ0KSwgdG8gPSBwYXJzZShlbmQpO1xuICByZXR1cm4gZnJvbSA9PT0gbnVsbCB8fCB0byA9PT0gbnVsbCA/IDAgOiAodG8gPj0gZnJvbSA/IHRvIC0gZnJvbSA6IHRvICsgMTQ0MCAtIGZyb20pO1xufVxuXG5jbGFzcyBGb2N1c1Rhc2tQaWNrZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBtaW51dGVzOiBudW1iZXI7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luLCBwcml2YXRlIHJlYWRvbmx5IGZpbGU6IFRGaWxlLCBwcml2YXRlIHJlYWRvbmx5IHRhc2tzOiBGb2N1c1Rhc2tbXSkgeyBzdXBlcihhcHApOyB0aGlzLm1pbnV0ZXMgPSBwbHVnaW4ucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW51dGVzOyB9XG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiXHU0RTEzXHU2Q0U4XHU2QTIxXHU1RjBGIC8gRm9jdXMgbW9kZVwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NEUxM1x1NkNFOFx1NjVGNlx1OTU3RiAvIEZvY3VzIGR1cmF0aW9uXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IGRyb3Bkb3duLmFkZE9wdGlvbihcIjI1XCIsIFwiMjUgbWluXCIpLmFkZE9wdGlvbihcIjUwXCIsIFwiNTAgbWluXCIpLmFkZE9wdGlvbihcIjkwXCIsIFwiOTAgbWluXCIpLnNldFZhbHVlKFN0cmluZyh0aGlzLm1pbnV0ZXMpKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLm1pbnV0ZXMgPSBOdW1iZXIodmFsdWUpKSk7XG4gICAgY29uc3QgY3VzdG9tID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IHR5cGU6IFwibnVtYmVyXCIsIHBsYWNlaG9sZGVyOiBcIkN1c3RvbSBtaW51dGVzIC8gXHU4MUVBXHU1QjlBXHU0RTQ5XHU1MjA2XHU5NDlGXCIgfSk7XG4gICAgY3VzdG9tLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7IGNvbnN0IHZhbHVlID0gTnVtYmVyKGN1c3RvbS52YWx1ZSk7IGlmICh2YWx1ZSA+IDApIHRoaXMubWludXRlcyA9IHZhbHVlOyB9KTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogXCJcdTkwMDlcdTYyRTlcdTRFRkJcdTUyQTEgLyBDaG9vc2UgYSB0YXNrXCIgfSk7XG4gICAgZm9yIChjb25zdCB0YXNrIG9mIHRoaXMudGFza3MpIHtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImFpLXBsYW5uZXItZm9jdXMtdGFza1wiIH0pO1xuICAgICAgYnV0dG9uLnNldFRleHQoYCR7dGFzay5jYXRlZ29yeSA/IGAke3Rhc2suY2F0ZWdvcnl9IFx1MDBCNyBgIDogXCJcIn0ke3Rhc2submFtZX0gKCR7dGFzay5lc3RpbWF0ZWRNaW51dGVzIHx8IFwiP1wifSBtaW4pYCk7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHsgdGhpcy5jbG9zZSgpOyB2b2lkIHRoaXMucGx1Z2luLnN0YXJ0Rm9jdXModGhpcy5maWxlLCB0YXNrLCB0aGlzLm1pbnV0ZXMpOyB9KTtcbiAgICB9XG4gIH1cbn1cblxuY2xhc3MgRm9jdXNUaW1lck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIGludGVydmFsOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4pIHsgc3VwZXIoYXBwKTsgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW4uZ2V0QWN0aXZlRm9jdXMoKTtcbiAgICBpZiAoIXNlc3Npb24pIHsgdGhpcy5jbG9zZSgpOyByZXR1cm47IH1cbiAgICB0aGlzLnBsdWdpbi5zZXRGb2N1c1RpbWVyT3Blbih0cnVlKTtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIsIFwiYWktcGxhbm5lci1mb2N1cy10aW1lclwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1NEUxM1x1NkNFOFx1NEUyRCAvIEZvY3VzaW5nXCIpO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHNlc3Npb24udGFza05hbWUsIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLXRpdGxlXCIgfSk7XG4gICAgY29uc3QgY2xvY2sgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJhaS1wbGFubmVyLWZvY3VzLWNsb2NrXCIgfSk7XG4gICAgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IFwiXHU1MTczXHU5NUVEXHU2QjY0XHU3QTk3XHU1M0UzXHU1M0VBXHU0RjFBXHU2NzAwXHU1QzBGXHU1MzE2XHVGRjBDXHU4QkExXHU2NUY2XHU0RjFBXHU0RkREXHU3NTU5XHUzMDAyXHU2MjRCXHU2NzNBXHU1MjA3XHU2MzYyXHU1MjMwXHU1MTc2XHU1QjgzIEFwcCBcdTU0MEVcdTYzMDlcdTdFQ0ZcdThGQzdcdTc2ODRcdTU4OTlcdTRFMEFcdTY1RjZcdTk1RjRcdTRGMzBcdTdCOTdcdUZGMUJpT1MgXHU1M0VGXHU4MEZEXHU2NjgyXHU1MDVDXHU2MjE2XHU1NkRFXHU2NTM2IE9ic2lkaWFuXHVGRjBDXHU1NkUwXHU2QjY0XHU4RkQ5XHU0RTBEXHU0RUUzXHU4ODY4XHU1REYyXHU5QThDXHU4QkMxXHU3Njg0XHU0RTEzXHU2Q0U4XHU2MjE2XHU5NjA1XHU4QkZCXHU2NUY2XHU5NTdGXHUzMDAyIC8gQ2xvc2luZyBvbmx5IG1pbmltaXplcyB0aGlzIHRpbWVyLiBNb2JpbGUgYmFja2dyb3VuZCB0aW1lIGlzIGEgd2FsbC1jbG9jayBlc3RpbWF0ZTsgaU9TIG1heSBzdXNwZW5kIG9yIHRlcm1pbmF0ZSBPYnNpZGlhbiwgc28gaXQgaXMgbm90IHZlcmlmaWVkIGZvY3VzIG9yIHJlYWRpbmcgdGltZS5cIixcbiAgICAgIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLWRpc2NsYWltZXJcIlxuICAgIH0pO1xuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJtb2RhbC1idXR0b24tY29udGFpbmVyXCIgfSk7XG4gICAgY29uc3QgcGF1c2UgPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NjY4Mlx1NTA1QyAvIFBhdXNlXCIgfSk7XG4gICAgY29uc3QgZmluaXNoID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTdFRDNcdTY3NUYgLyBGaW5pc2hcIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBjb25zdCByZWZyZXNoID0gKCk6IHZvaWQgPT4ge1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMucGx1Z2luLmdldEFjdGl2ZUZvY3VzKCk7XG4gICAgICBpZiAoIWN1cnJlbnQpIHsgdGhpcy5jbG9zZSgpOyByZXR1cm47IH1cbiAgICAgIGNvbnN0IGVsYXBzZWQgPSBjdXJyZW50LmZvY3VzZWRNcyArIChjdXJyZW50LnJ1bm5pbmdBdCA9PT0gbnVsbCA/IDAgOiBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gY3VycmVudC5ydW5uaW5nQXQpKTtcbiAgICAgIGNvbnN0IHJlbWFpbmluZyA9IE1hdGgubWF4KDAsIGN1cnJlbnQuZHVyYXRpb25NcyAtIGVsYXBzZWQpO1xuICAgICAgY2xvY2suc2V0VGV4dChmb3JtYXREdXJhdGlvbihyZW1haW5pbmcpKTtcbiAgICAgIHBhdXNlLnNldFRleHQoY3VycmVudC5ydW5uaW5nQXQgPT09IG51bGwgPyBcIlx1N0VFN1x1N0VFRCAvIFJlc3VtZVwiIDogXCJcdTY2ODJcdTUwNUMgLyBQYXVzZVwiKTtcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gMCkgdm9pZCB0aGlzLnBsdWdpbi5maW5pc2hGb2N1cygpO1xuICAgIH07XG4gICAgcGF1c2UuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5wbHVnaW4udG9nZ2xlRm9jdXNQYXVzZSgpLnRoZW4ocmVmcmVzaCkpO1xuICAgIGZpbmlzaC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnBsdWdpbi5maW5pc2hGb2N1cygpLnRoZW4oKCkgPT4gdGhpcy5jbG9zZSgpKSk7XG4gICAgdGhpcy5pbnRlcnZhbCA9IHdpbmRvdy5zZXRJbnRlcnZhbChyZWZyZXNoLCA1MDApOyByZWZyZXNoKCk7XG4gIH1cbiAgb25DbG9zZSgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5pbnRlcnZhbCAhPT0gbnVsbCkgd2luZG93LmNsZWFySW50ZXJ2YWwodGhpcy5pbnRlcnZhbCk7XG4gICAgdGhpcy5wbHVnaW4uc2V0Rm9jdXNUaW1lck9wZW4oZmFsc2UpO1xuICB9XG59XG5cbmNsYXNzIFBsYW5JbnB1dE1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG1vZGU6IFBsYW5Nb2RlID0gXCJzdHVkeVwiO1xuICBwcml2YXRlIGRhdGUgPSBsb2NhbERhdGUoKTtcbiAgcHJpdmF0ZSBzdGFydFRpbWUgPSBcIlwiO1xuICBwcml2YXRlIGVuZFRpbWUgPSBcIlwiO1xuICBwcml2YXRlIGlucHV0ID0gXCJcIjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJBSSBQbGFubmVyIC8gQUkgXHU4QkExXHU1MjEyXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU2QTIxXHU1RjBGIC8gTW9kZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxuICAgICAgLmFkZE9wdGlvbihcInN0dWR5XCIsIFwiXHU0RjVDXHU0RTFBXHU0RTBFXHU1QjY2XHU0RTYwIC8gSG9tZXdvcmsgJiBzdHVkeVwiKVxuICAgICAgLmFkZE9wdGlvbihcIndvcmtcIiwgXCJcdTVERTVcdTRGNUMgLyBXb3JrXCIpXG4gICAgICAuc2V0VmFsdWUodGhpcy5tb2RlKVxuICAgICAgLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMubW9kZSA9IHZhbHVlIGFzIFBsYW5Nb2RlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdThCQTFcdTUyMTJcdTY1RTVcdTY3MUYgLyBQbGFuIGRhdGVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dFxuICAgICAgLnNldFZhbHVlKHRoaXMuZGF0ZSkuc2V0UGxhY2Vob2xkZXIoXCJZWVlZLU1NLUREXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuZGF0ZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTVGMDBcdTU5Q0JcdTY1RjZcdTk1RjQgLyBTdGFydCB0aW1lXCIpLnNldERlc2MoXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiAxOTowMFwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0XG4gICAgICAuc2V0VmFsdWUodGhpcy5zdGFydFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMTk6MDBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5zdGFydFRpbWUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU2NzAwXHU2NjVBXHU3RUQzXHU2NzVGIC8gTGF0ZXN0IGZpbmlzaFwiKS5zZXREZXNjKFwiXHU1M0VGXHU5MDA5IC8gT3B0aW9uYWwuXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXRcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLmVuZFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMjE6MDBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5lbmRUaW1lID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NEVGQlx1NTJBMVx1NjIxNlx1NEY1Q1x1NEUxQSAvIFRhc2tzIG9yIGhvbWV3b3JrXCIpLnNldERlc2MoXCJcdTU4NkJcdTUxOTlcdTc5RDFcdTc2RUUvXHU5ODc5XHU3NkVFXHUzMDAxXHU0RUZCXHU1MkExXHU5MUNGXHUzMDAxXHU2MjJBXHU2QjYyXHU2NUY2XHU5NUY0XHU1NDhDXHU5NjUwXHU1MjM2XHU2NzYxXHU0RUY2XHUzMDAyXCIpO1xuICAgIGNvbnN0IHNvdXJjZUJhciA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLXNvdXJjZVwiIH0pO1xuICAgIGNvbnN0IHNvdXJjZUxhYmVsID0gc291cmNlQmFyLmNyZWF0ZVNwYW4oeyB0ZXh0OiBcIlx1Njc2NVx1NkU5MCAvIFNvdXJjZTogXHU2MjRCXHU1MkE4XHU4RjkzXHU1MTY1IC8gbWFudWFsIGlucHV0XCIgfSk7XG4gICAgY29uc3QgdXNlQWN0aXZlQnV0dG9uID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTRGN0ZcdTc1MjhcdTVGNTNcdTUyNERcdTdCMTRcdThCQjAgLyBVc2UgY3VycmVudCBub3RlXCIgfSk7XG4gICAgY29uc3QgY2hvb3NlQnV0dG9uID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTkwMDlcdTYyRTkgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gQ2hvb3NlIG5vdGVcIiB9KTtcbiAgICBjb25zdCBhcmVhID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJ0ZXh0YXJlYVwiLCB7IGNsczogXCJhaS1wbGFubmVyLWlucHV0XCIgfSk7XG4gICAgYXJlYS5yb3dzID0gODtcbiAgICBhcmVhLnBsYWNlaG9sZGVyID0gXCJFeGFtcGxlOiBNYXRoIHdvcmtib29rIHBhZ2VzIDEyLTE0OyBtZW1vcml6ZSAyMCBFbmdsaXNoIHdvcmRzOyBDaGluZXNlIHJlYWRpbmcgYWxvdWQuXCI7XG4gICAgYXJlYS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gdGhpcy5pbnB1dCA9IGFyZWEudmFsdWUpO1xuICAgIGNvbnN0IGxvYWRTb3VyY2UgPSBhc3luYyAoZmlsZTogVEZpbGUpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgdGhpcy5pbnB1dCA9IGNvbnRlbnQ7XG4gICAgICBhcmVhLnZhbHVlID0gY29udGVudDtcbiAgICAgIHNvdXJjZUxhYmVsLnNldFRleHQoYFx1Njc2NVx1NkU5MCAvIFNvdXJjZTogJHtmaWxlLnBhdGh9YCk7XG4gICAgfTtcbiAgICB1c2VBY3RpdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGFjdGl2ZUZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgaWYgKCFhY3RpdmVGaWxlIHx8IGFjdGl2ZUZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU1MTQ4XHU2MjUzXHU1RjAwXHU0RTAwXHU0RTJBIE1hcmtkb3duIFx1N0IxNFx1OEJCMCAvIE9wZW4gYSBNYXJrZG93biBub3RlIGZpcnN0LlwiKTtcbiAgICAgIHRyeSB7IGF3YWl0IGxvYWRTb3VyY2UoYWN0aXZlRmlsZSk7IH0gY2F0Y2ggeyBuZXcgTm90aWNlKFwiQ291bGQgbm90IHJlYWQgdGhlIGN1cnJlbnQgbm90ZS5cIik7IH1cbiAgICB9KTtcbiAgICBjaG9vc2VCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IG5ldyBNYXJrZG93bkZpbGVQaWNrZXJNb2RhbCh0aGlzLmFwcCwgYXN5bmMgZmlsZSA9PiB7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoYXQgbm90ZS5cIik7IH1cbiAgICB9KS5vcGVuKCkpO1xuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJtb2RhbC1idXR0b24tY29udGFpbmVyXCIgfSk7XG4gICAgY29uc3QgYnV0dG9uID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuaW5wdXQudHJpbSgpKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1ODFGM1x1NUMxMVx1NTg2Qlx1NTE5OVx1NEUwMFx1OTg3OVx1NEVGQlx1NTJBMSAvIEVudGVyIGF0IGxlYXN0IG9uZSB0YXNrIGZpcnN0LlwiKTtcbiAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBidXR0b24uc2V0VGV4dChcIlx1NkI2M1x1NTcyOFx1NzUxRlx1NjIxMCAvIEdlbmVyYXRpbmcuLi5cIik7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwbGFuID0gYXdhaXQgdGhpcy5wbHVnaW4uZ2VuZXJhdGVQbGFuKHRoaXMubW9kZSwgdGhpcy5kYXRlLCB0aGlzLnN0YXJ0VGltZSwgdGhpcy5lbmRUaW1lLCB0aGlzLmlucHV0KTtcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICBuZXcgUGxhblByZXZpZXdNb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHRoaXMubW9kZSwgdGhpcy5kYXRlLCBwbGFuKS5vcGVuKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3QgZ2VuZXJhdGUgcGxhbi5cIik7XG4gICAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICBidXR0b24uc2V0VGV4dChcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgcXVlcnkgPSBcIlwiO1xuICBwcml2YXRlIHJlYWRvbmx5IGZpbGVzOiBURmlsZVtdO1xuICBwcml2YXRlIHJlc3VsdHNFbDogSFRNTEVsZW1lbnQ7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgb25DaG9vc2U6IChmaWxlOiBURmlsZSkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMuZmlsZXMgPSBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xuICAgIHRoaXMucmVzdWx0c0VsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIsIFwiYWktcGxhbm5lci1maWxlLXBpY2tlclwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiKTtcbiAgICBjb25zdCBzZWFyY2ggPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJzZWFyY2hcIiwgcGxhY2Vob2xkZXI6IFwiXHU2NDFDXHU3RDIyXHU3QjE0XHU4QkIwIC8gU2VhcmNoIG5vdGVzLi4uXCIsIGNsczogXCJhaS1wbGFubmVyLWZpbGUtc2VhcmNoXCIgfSk7XG4gICAgc2VhcmNoLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7IHRoaXMucXVlcnkgPSBzZWFyY2gudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7IHRoaXMucmVuZGVyUmVzdWx0cygpOyB9KTtcbiAgICB0aGlzLnJlc3VsdHNFbCA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLWZpbGUtcmVzdWx0c1wiIH0pO1xuICAgIHRoaXMucmVuZGVyUmVzdWx0cygpO1xuICAgIHNlYXJjaC5mb2N1cygpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJSZXN1bHRzKCk6IHZvaWQge1xuICAgIHRoaXMucmVzdWx0c0VsLmVtcHR5KCk7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHRoaXMuZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5wYXRoLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGhpcy5xdWVyeSkpLnNsaWNlKDAsIDEwMCk7XG4gICAgaWYgKCFtYXRjaGVzLmxlbmd0aCkgeyB0aGlzLnJlc3VsdHNFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIk5vIE1hcmtkb3duIG5vdGVzIGZvdW5kLlwiIH0pOyByZXR1cm47IH1cbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgbWF0Y2hlcykge1xuICAgICAgY29uc3QgYnV0dG9uID0gdGhpcy5yZXN1bHRzRWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwiYWktcGxhbm5lci1maWxlLWl0ZW1cIiB9KTtcbiAgICAgIGJ1dHRvbi5jcmVhdGVFbChcInN0cm9uZ1wiLCB7IHRleHQ6IGZpbGUuYmFzZW5hbWUgfSk7XG4gICAgICBidXR0b24uY3JlYXRlRWwoXCJzbWFsbFwiLCB7IHRleHQ6IGZpbGUucGF0aCB9KTtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4geyBhd2FpdCB0aGlzLm9uQ2hvb3NlKGZpbGUpOyB0aGlzLmNsb3NlKCk7IH0pO1xuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBQbGFuUHJldmlld01vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBtb2RlOiBQbGFuTW9kZSwgcHJpdmF0ZSByZWFkb25seSBkYXRlOiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgcGxhbjogUGxhblJlc3VsdCkgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQodGhpcy5wbGFuLnRpdGxlIHx8IFwiUGxhbiBwcmV2aWV3XCIpO1xuICAgIGlmICh0aGlzLnBsYW4uc3VtbWFyeSkgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogdGhpcy5wbGFuLnN1bW1hcnkgfSk7XG4gICAgcmVuZGVyUHJldmlld1Rhc2tzKHRoaXMuY29udGVudEVsLCBcIlBsYW5cIiwgdGhpcy5wbGFuLnRhc2tzKTtcbiAgICBpZiAodGhpcy5tb2RlID09PSBcInN0dWR5XCIpIHJlbmRlclByZXZpZXdUYXNrcyh0aGlzLmNvbnRlbnRFbCwgXCJSZXZpZXdcIiwgdGhpcy5wbGFuLnJldmlld1Rhc2tzID8/IFtdKTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuY2xvc2UoKSk7XG4gICAgYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJXcml0ZSBwbGFuXCIsIGNsczogXCJtb2QtY3RhXCIgfSkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCB0aGlzLnBsdWdpbi53cml0ZVBsYW4odGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMucGxhbik7XG4gICAgICAgIG5ldyBOb3RpY2UoYFBsYW4gd3JpdHRlbjogJHtwYXRofWApO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3Qgd3JpdGUgcGxhbi5cIik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgQUlQbGFubmVyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHAsIHBsdWdpbik7IH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIHRoaXMuY29udGFpbmVyRWwuZW1wdHkoKTtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkFJIFBsYW5uZXIgXHU4QkJFXHU3RjZFIC8gU2V0dGluZ3NcIiB9KTtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiQ2xhdWRlIFx1NEUwRSBHZW1pbmkgXHU0RjdGXHU3NTI4XHU1MzlGXHU3NTFGXHU2M0E1XHU1M0UzXHVGRjFCXHU1MTc2XHU1QjgzXHU5ODg0XHU4QkJFXHU0RjdGXHU3NTI4IE9wZW5BSS1jb21wYXRpYmxlIFx1NjNBNVx1NTNFM1x1MzAwMkNsYXVkZSBhbmQgR2VtaW5pIHVzZSBuYXRpdmUgQVBJIGZvcm1hdHMuXCIgfSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NzU0Q1x1OTc2Mlx1OEJFRFx1OEEwMCAvIEludGVyZmFjZSBsYW5ndWFnZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxuICAgICAgLmFkZE9wdGlvbihcImF1dG9cIiwgXCJcdThEREZcdTk2OEZcdTdDRkJcdTdFREYgLyBGb2xsb3cgc3lzdGVtXCIpXG4gICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgIC5hZGRPcHRpb24oXCJlblwiLCBcIkVuZ2xpc2hcIilcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5pbnRlcmZhY2VMYW5ndWFnZSlcbiAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmludGVyZmFjZUxhbmd1YWdlID0gdmFsdWUgYXMgSW50ZXJmYWNlTGFuZ3VhZ2U7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NjcwRFx1NTJBMVx1NTU0Nlx1OTg4NFx1OEJCRSAvIFByb3ZpZGVyIHByZXNldFwiKS5zZXREZXNjKFwiXHU5MDA5XHU2MkU5XHU1NDBFXHU0RjFBXHU1ODZCXHU1MTY1XHU2M0E4XHU4MzUwXHU1NzMwXHU1NzQwXHU0RTBFXHU2QTIxXHU1NzhCXHVGRjBDXHU1M0VGXHU3RUU3XHU3RUVEXHU2MjRCXHU1MkE4XHU0RkVFXHU2NTM5XHUzMDAyXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcbiAgICAgIGZvciAoY29uc3QgW2lkLCBwcmVzZXRdIG9mIE9iamVjdC5lbnRyaWVzKFBST1ZJREVSUykpIGRyb3Bkb3duLmFkZE9wdGlvbihpZCwgcHJlc2V0LmxhYmVsKTtcbiAgICAgIGRyb3Bkb3duLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnByb3ZpZGVyKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gdmFsdWUgYXMgUHJvdmlkZXJJZDtcbiAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICAgICAgaWYgKHByb3ZpZGVyICE9PSBcImN1c3RvbVwiKSB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCA9IFBST1ZJREVSU1twcm92aWRlcl0uYmFzZVVybDtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tb2RlbCA9IFBST1ZJREVSU1twcm92aWRlcl0ubW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIkFQSSBcdTU3MzBcdTU3NDAgLyBBUEkgYmFzZSBVUkxcIiwgXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiBodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsIFwiYXBpQmFzZVVybFwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiQVBJIFx1NUJDNlx1OTRBNSAvIEFQSSBrZXlcIikuc2V0RGVzYyhcIlN0b3JlZCBpbiB0aGlzIHBsdWdpbidzIGRhdGEuanNvbi5cIikuYWRkVGV4dChpbnB1dCA9PiB7XG4gICAgICBpbnB1dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlLZXkpLnNldFBsYWNlaG9sZGVyKFwic2stLi4uXCIpO1xuICAgICAgaW5wdXQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuICAgICAgaW5wdXQub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlLZXkgPSB2YWx1ZTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pO1xuICAgIH0pO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTZBMjFcdTU3OEIgLyBNb2RlbFwiLCBcIlx1NEY4Qlx1NTk4MiAvIEV4YW1wbGU6IGdwdC00LjEtbWluaSwgZGVlcHNlZWstY2hhdCwgZ2xtLTQtZmxhc2hcIiwgXCJtb2RlbFwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU4MUVBXHU1QjlBXHU0RTQ5XHU4QkY3XHU2QzQyXHU1OTM0IC8gQ3VzdG9tIGhlYWRlcnNcIiwgXCJKU09OIG9iamVjdCwgb3B0aW9uYWwuXCIsIFwiY3VzdG9tSGVhZGVyc1wiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2RTI5XHU1RUE2IC8gVGVtcGVyYXR1cmVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MudGVtcGVyYXR1cmUpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnRlbXBlcmF0dXJlID0gTnVtYmVyKHZhbHVlKSB8fCAwOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTY3MDBcdTU5MjdcdThGOTNcdTUxRkFcdTk1N0ZcdTVFQTYgLyBNYXggb3V0cHV0IHRva2Vuc1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tYXhUb2tlbnMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLm1heFRva2VucyA9IE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5tYXhUb2tlbnM7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NTM4Nlx1NTNGMlx1NjgyMVx1NTFDNlx1NTkyOVx1NjU3MCAvIEhpc3RvcnkgZGF5c1wiKS5zZXREZXNjKFwiXHU3NTFGXHU2MjEwXHU4QkExXHU1MjEyXHU2NUY2XHU4QkZCXHU1M0Q2XHU4RkQxXHU2NzFGXHU3NzFGXHU1QjlFXHU3NTI4XHU2NUY2XHVGRjBDXHU1RUZBXHU4QkFFIDctMzAgXHU1OTI5XHUzMDAyXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5oaXN0b3J5RGF5cyA9IE1hdGgubWF4KDEsIE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5oaXN0b3J5RGF5cyk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1OUVEOFx1OEJBNFx1NEUxM1x1NkNFOFx1NTIwNlx1OTQ5RiAvIERlZmF1bHQgZm9jdXMgbWludXRlc1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbnV0ZXMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlcyA9IE1hdGgubWF4KDEsIE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5mb2N1c01pbnV0ZXMpOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTVCNjZcdTRFNjBcdThGOTNcdTUxRkFcdTc2RUVcdTVGNTUgLyBTdHVkeSBvdXRwdXQgZm9sZGVyXCIsIFwiVmF1bHQtcmVsYXRpdmUgcGF0aC5cIiwgXCJzdHVkeUZvbGRlclwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU1REU1XHU0RjVDXHU4RjkzXHU1MUZBXHU3NkVFXHU1RjU1IC8gV29yayBvdXRwdXQgZm9sZGVyXCIsIFwiVmF1bHQtcmVsYXRpdmUgcGF0aC5cIiwgXCJ3b3JrRm9sZGVyXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSB0ZXh0U2V0dGluZyhuYW1lOiBzdHJpbmcsIGRlc2M6IHN0cmluZywga2V5OiBcImFwaUJhc2VVcmxcIiB8IFwibW9kZWxcIiB8IFwiY3VzdG9tSGVhZGVyc1wiIHwgXCJzdHVkeUZvbGRlclwiIHwgXCJ3b3JrRm9sZGVyXCIpOiB2b2lkIHtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKG5hbWUpLnNldERlc2MoZGVzYykuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5nc1trZXldKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzW2tleV0gPSB2YWx1ZS50cmltKCk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VQbGFuKGNvbnRlbnQ6IHN0cmluZyk6IFBsYW5SZXN1bHQge1xuICBjb25zdCBqc29uID0gY29udGVudC50cmltKCkucmVwbGFjZSgvXmBgYCg/Ompzb24pP1xccyovaSwgXCJcIikucmVwbGFjZSgvXFxzKmBgYCQvLCBcIlwiKTtcbiAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uKSBhcyBQbGFuUmVzdWx0O1xuICBpZiAoIXBhcnNlZC50aXRsZSB8fCAhQXJyYXkuaXNBcnJheShwYXJzZWQudGFza3MpKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgbW9kZWwgcmV0dXJuZWQgYW4gaW52YWxpZCBwbGFuIGZvcm1hdC5cIik7XG4gIHBhcnNlZC50YXNrcyA9IHBhcnNlZC50YXNrcy5tYXAobm9ybWFsaXplVGFzaykuZmlsdGVyKEJvb2xlYW4pIGFzIFBsYW5UYXNrW107XG4gIHBhcnNlZC5yZXZpZXdUYXNrcyA9IEFycmF5LmlzQXJyYXkocGFyc2VkLnJldmlld1Rhc2tzKSA/IHBhcnNlZC5yZXZpZXdUYXNrcy5tYXAobm9ybWFsaXplVGFzaykuZmlsdGVyKEJvb2xlYW4pIGFzIFBsYW5UYXNrW10gOiBbXTtcbiAgaWYgKCFwYXJzZWQudGFza3MubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgbW9kZWwgZGlkIG5vdCByZXR1cm4gYW55IHRhc2tzLlwiKTtcbiAgcmV0dXJuIHBhcnNlZDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplVGFzayh2YWx1ZTogdW5rbm93bik6IFBsYW5UYXNrIHwgbnVsbCB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgdGFzayA9IHZhbHVlIGFzIFBhcnRpYWw8UGxhblRhc2s+O1xuICBpZiAoIXRhc2sudGl0bGUpIHJldHVybiBudWxsO1xuICByZXR1cm4geyB0aXRsZTogU3RyaW5nKHRhc2sudGl0bGUpLCBjYXRlZ29yeTogdGFzay5jYXRlZ29yeSA/IFN0cmluZyh0YXNrLmNhdGVnb3J5KSA6IFwiXCIsIHN0YXJ0VGltZTogdGFzay5zdGFydFRpbWUgPyBTdHJpbmcodGFzay5zdGFydFRpbWUpIDogXCJcIiwgZW5kVGltZTogdGFzay5lbmRUaW1lID8gU3RyaW5nKHRhc2suZW5kVGltZSkgOiBcIlwiLCBlc3RpbWF0ZWRNaW51dGVzOiBNYXRoLm1heCgxLCBOdW1iZXIodGFzay5lc3RpbWF0ZWRNaW51dGVzKSB8fCAzMCksIGRlc2NyaXB0aW9uOiB0YXNrLmRlc2NyaXB0aW9uID8gU3RyaW5nKHRhc2suZGVzY3JpcHRpb24pIDogXCJcIiB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBzdHJpbmcge1xuICBjb25zdCBhbGxUYXNrcyA9IFsuLi5wbGFuLnRhc2tzLCAuLi4ocGxhbi5yZXZpZXdUYXNrcyA/PyBbXSldO1xuICBjb25zdCBmcm9udG1hdHRlciA9IGFsbFRhc2tzLmZsYXRNYXAoKHRhc2ssIGluZGV4KSA9PiB7XG4gICAgY29uc3QgaWQgPSBgdGFzayR7U3RyaW5nKGluZGV4ICsgMSkucGFkU3RhcnQoMiwgXCIwXCIpfWA7XG4gICAgcmV0dXJuIFtgJHtpZH1OYW1lOiAke3lhbWxRdW90ZSh0YXNrLnRpdGxlKX1gLCBgJHtpZH1DYXRlZ29yeTogJHt5YW1sUXVvdGUodGFzay5jYXRlZ29yeSB8fCBcIlx1NTE3Nlx1NUI4M1wiKX1gLCBgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzOiAke3Rhc2suZXN0aW1hdGVkTWludXRlc31gLCBgJHtpZH1BY3R1YWxTdGFydDpgLCBgJHtpZH1BY3R1YWxFbmQ6YCwgYCR7aWR9QWN0dWFsTWludXRlczogMGAsIGAke2lkfUZvY3VzU2Vzc2lvbnM6IDBgXTtcbiAgfSk7XG4gIGNvbnN0IHRhc2tDYXJkcyA9IChsYWJlbDogc3RyaW5nLCB0YXNrczogUGxhblRhc2tbXSwgb2Zmc2V0OiBudW1iZXIpID0+IHRhc2tzLmxlbmd0aCA/IGAjIyAke2xhYmVsfVxcblxcbiR7dGFza3MubWFwKCh0YXNrLCBpbmRleCkgPT4gcmVuZGVyVGFzayh0YXNrLCBkYXRlLCBvZmZzZXQgKyBpbmRleCArIDEpKS5qb2luKFwiXFxuXFxuXCIpfWAgOiBgIyMgJHtsYWJlbH1cXG5cXG5cdTY2ODJcdTY1RTBcdTVCODlcdTYzOTJcdTMwMDJgO1xuICByZXR1cm4gYC0tLVxcbnR5cGU6ICR7bW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTZCQ0ZcdTY1RTVcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU2QkNGXHU2NUU1XHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCJ9XFxucGxhbkRhdGU6ICR7ZGF0ZX1cXG50YWdzOlxcbiAgLSBBSVx1OEJBMVx1NTIxMlxcbiR7ZnJvbnRtYXR0ZXIuam9pbihcIlxcblwiKX1cXG4tLS1cXG5cXG4jICR7cGxhbi50aXRsZX1cXG5cXG4+IFshYWJzdHJhY3RdIFx1Njk4Mlx1ODlDOFxcbj4gJHtwbGFuLnN1bW1hcnkgfHwgXCJcdTc1MzEgQUkgUGxhbm5lciBcdTc1MUZcdTYyMTBcdUZGMENcdTYyNjdcdTg4NENcdTU0MEVcdTU4NkJcdTUxOTlcdTZCQ0ZcdTk4NzlcdTVCOUVcdTk2NDVcdTVGMDBcdTU5Q0JcdTU0OENcdTVCOENcdTYyMTBcdTY1RjZcdTk1RjRcdTMwMDJcIn1cXG5cXG4ke3Rhc2tDYXJkcyhtb2RlID09PSBcInN0dWR5XCIgPyBcIlx1NEY1Q1x1NEUxQVx1OEJBMVx1NTIxMlx1ODg2OFwiIDogXCJcdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcdTg4NjhcIiwgcGxhbi50YXNrcywgMCl9XFxuXFxuJHttb2RlID09PSBcInN0dWR5XCIgPyB0YXNrQ2FyZHMoXCJcdTU5MERcdTRFNjBcdThCQTFcdTUyMTJcdTg4NjhcIiwgcGxhbi5yZXZpZXdUYXNrcyA/PyBbXSwgcGxhbi50YXNrcy5sZW5ndGgpIDogXCJcIn1cXG5gO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUYXNrKHRhc2s6IFBsYW5UYXNrLCBkYXRlOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBwcmVmaXggPSB0YXNrLmNhdGVnb3J5ID8gYCR7dGFzay5jYXRlZ29yeX0gXHUwMEI3IGAgOiBcIlwiO1xuICBjb25zdCB0aW1lID0gdGFzay5zdGFydFRpbWUgJiYgdGFzay5lbmRUaW1lID8gYCR7dGFzay5zdGFydFRpbWV9LSR7dGFzay5lbmRUaW1lfWAgOiBcIlx1NUY4NVx1NUI4OVx1NjM5MlwiO1xuICBjb25zdCBub3RlID0gdGFzay5kZXNjcmlwdGlvbiA/IGBcXG4+ICR7dGFzay5kZXNjcmlwdGlvbn1gIDogXCJcIjtcbiAgcmV0dXJuIGA+IFshdG9kb10rICR7cHJlZml4fSR7dGFzay50aXRsZX1cXG4+IFx1NjVGNlx1NkJCNVx1RkYxQSR7dGltZX0gXHUwMEI3ICR7dGFzay5lc3RpbWF0ZWRNaW51dGVzfSBcdTUyMDZcdTk0OUZcXG4+IFx1NUI5RVx1OTY0NVx1NUYwMFx1NTlDQlx1RkYxQV9fX18gXHUwMEI3IFx1NUI5RVx1OTY0NVx1NUI4Q1x1NjIxMFx1RkYxQV9fX18ke25vdGV9XFxuPiAtIFsgXSAke3Rhc2sudGl0bGV9IFx1RDgzRFx1RENDNSAke2RhdGV9ICNcdThCQTFcdTUyMTJgO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQcmV2aWV3VGFza3MocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgdGFza3M6IFBsYW5UYXNrW10pOiB2b2lkIHtcbiAgcGFyZW50LmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBsYWJlbCB9KTtcbiAgaWYgKCF0YXNrcy5sZW5ndGgpIHsgcGFyZW50LmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiTm9uZVwiIH0pOyByZXR1cm47IH1cbiAgY29uc3QgbGlzdCA9IHBhcmVudC5jcmVhdGVFbChcInVsXCIpO1xuICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIGxpc3QuY3JlYXRlRWwoXCJsaVwiLCB7IHRleHQ6IGAke3Rhc2suc3RhcnRUaW1lIHx8IFwiXCJ9JHt0YXNrLmVuZFRpbWUgPyBgLSR7dGFzay5lbmRUaW1lfWAgOiBcIlwifSAke3Rhc2sudGl0bGV9ICgke3Rhc2suZXN0aW1hdGVkTWludXRlc30gbWluKWAudHJpbSgpIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVGb2xkZXIoYXBwOiBBcHAsIGZvbGRlcjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHBhcnRzID0gbm9ybWFsaXplUGF0aChmb2xkZXIpLnNwbGl0KFwiL1wiKS5maWx0ZXIoQm9vbGVhbik7XG4gIGZvciAobGV0IGkgPSAxOyBpIDw9IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcGF0aCA9IHBhcnRzLnNsaWNlKDAsIGkpLmpvaW4oXCIvXCIpO1xuICAgIGlmICghYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKSkgYXdhaXQgYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihwYXRoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzYWZlRmlsZW5hbWUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgXCItXCIpLnRyaW0oKS5zbGljZSgwLCA4MCkgfHwgXCJBSVx1OEJBMVx1NTIxMlwiOyB9XG5mdW5jdGlvbiB5YW1sUXVvdGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7IH1cbmZ1bmN0aW9uIHRpbWVPZkRheShkYXRlOiBEYXRlKTogc3RyaW5nIHsgcmV0dXJuIGAke1N0cmluZyhkYXRlLmdldEhvdXJzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX06JHtTdHJpbmcoZGF0ZS5nZXRNaW51dGVzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX1gOyB9XG5mdW5jdGlvbiBmb3JtYXREdXJhdGlvbihtaWxsaXNlY29uZHM6IG51bWJlcik6IHN0cmluZyB7IGNvbnN0IHRvdGFsID0gTWF0aC5jZWlsKG1pbGxpc2Vjb25kcyAvIDEwMDApOyByZXR1cm4gYCR7U3RyaW5nKE1hdGguZmxvb3IodG90YWwgLyA2MCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX06JHtTdHJpbmcodG90YWwgJSA2MCkucGFkU3RhcnQoMiwgXCIwXCIpfWA7IH1cbmZ1bmN0aW9uIGxvY2FsRGF0ZSgpOiBzdHJpbmcgeyBjb25zdCBub3cgPSBuZXcgRGF0ZSgpOyBjb25zdCBvZmZzZXQgPSBub3cuZ2V0VGltZXpvbmVPZmZzZXQoKSAqIDYwMDAwOyByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSAtIG9mZnNldCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7IH1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQUF3RztBQWtEeEcsSUFBTSxtQkFBb0M7QUFBQSxFQUN4QyxVQUFVO0FBQUEsRUFDVixtQkFBbUI7QUFBQSxFQUNuQixZQUFZO0FBQUEsRUFDWixRQUFRO0FBQUEsRUFDUixPQUFPO0FBQUEsRUFDUCxlQUFlO0FBQUEsRUFDZixhQUFhO0FBQUEsRUFDYixXQUFXO0FBQUEsRUFDWCxhQUFhO0FBQUEsRUFDYixjQUFjO0FBQUEsRUFDZCxhQUFhO0FBQUEsRUFDYixZQUFZO0FBQ2Q7QUFFQSxJQUFNLFlBQW1GO0FBQUEsRUFDdkYsUUFBUSxFQUFFLE9BQU8seUVBQXNDLFNBQVMsSUFBSSxPQUFPLEdBQUc7QUFBQSxFQUM5RSxRQUFRLEVBQUUsT0FBTyxVQUFVLFNBQVMsNkJBQTZCLE9BQU8sZUFBZTtBQUFBLEVBQ3ZGLFFBQVEsRUFBRSxPQUFPLG9CQUFvQixTQUFTLGdDQUFnQyxPQUFPLDJCQUEyQjtBQUFBLEVBQ2hILFVBQVUsRUFBRSxPQUFPLFlBQVksU0FBUywrQkFBK0IsT0FBTyxnQkFBZ0I7QUFBQSxFQUM5RixLQUFLLEVBQUUsT0FBTyw0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
