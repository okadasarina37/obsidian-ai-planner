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
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--ai-planner-visible-height", `${Math.round(height)}px`);
    };
    updateVisibleHeight();
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      viewport.addEventListener("resize", updateVisibleHeight);
      this.register(() => viewport.removeEventListener("resize", updateVisibleHeight));
    }
    this.registerDomEvent(document, "focusin", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select")) return;
      if (!target.closest(".ai-planner-modal")) return;
      window.setTimeout(() => target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }), 250);
    });
    this.registerInterval(window.setInterval(() => void this.refreshFocusStatus(), 500));
    await this.refreshFocusStatus();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgTW9kYWwsIE5vdGljZSwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nLCBURmlsZSwgbm9ybWFsaXplUGF0aCwgcmVxdWVzdFVybCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG50eXBlIFBsYW5Nb2RlID0gXCJzdHVkeVwiIHwgXCJ3b3JrXCI7XG50eXBlIFByb3ZpZGVySWQgPSBcImN1c3RvbVwiIHwgXCJvcGVuYWlcIiB8IFwiY2xhdWRlXCIgfCBcImRlZXBzZWVrXCIgfCBcImdsbVwiIHwgXCJraW1pXCIgfCBcImdlbWluaVwiO1xudHlwZSBJbnRlcmZhY2VMYW5ndWFnZSA9IFwiYXV0b1wiIHwgXCJ6aFwiIHwgXCJlblwiO1xuXG5pbnRlcmZhY2UgUGxhbm5lclNldHRpbmdzIHtcbiAgcHJvdmlkZXI6IFByb3ZpZGVySWQ7XG4gIGludGVyZmFjZUxhbmd1YWdlOiBJbnRlcmZhY2VMYW5ndWFnZTtcbiAgYXBpQmFzZVVybDogc3RyaW5nO1xuICBhcGlLZXk6IHN0cmluZztcbiAgbW9kZWw6IHN0cmluZztcbiAgY3VzdG9tSGVhZGVyczogc3RyaW5nO1xuICB0ZW1wZXJhdHVyZTogbnVtYmVyO1xuICBtYXhUb2tlbnM6IG51bWJlcjtcbiAgaGlzdG9yeURheXM6IG51bWJlcjtcbiAgZm9jdXNNaW51dGVzOiBudW1iZXI7XG4gIHN0dWR5Rm9sZGVyOiBzdHJpbmc7XG4gIHdvcmtGb2xkZXI6IHN0cmluZztcbiAgYWN0aXZlRm9jdXM/OiBBY3RpdmVGb2N1c1Nlc3Npb247XG4gIGZvY3VzTWluaVBvc2l0aW9uPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xufVxuXG5pbnRlcmZhY2UgQWN0aXZlRm9jdXNTZXNzaW9uIHtcbiAgZmlsZVBhdGg6IHN0cmluZztcbiAgdGFza0lkOiBzdHJpbmc7XG4gIHRhc2tOYW1lOiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG4gIGR1cmF0aW9uTXM6IG51bWJlcjtcbiAgZm9jdXNlZE1zOiBudW1iZXI7XG4gIHJ1bm5pbmdBdDogbnVtYmVyIHwgbnVsbDtcbiAgc3RhcnRlZEF0OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQbGFuVGFzayB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNhdGVnb3J5Pzogc3RyaW5nO1xuICBzdGFydFRpbWU/OiBzdHJpbmc7XG4gIGVuZFRpbWU/OiBzdHJpbmc7XG4gIGVzdGltYXRlZE1pbnV0ZXM6IG51bWJlcjtcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBQbGFuUmVzdWx0IHtcbiAgdGl0bGU6IHN0cmluZztcbiAgc3VtbWFyeT86IHN0cmluZztcbiAgdGFza3M6IFBsYW5UYXNrW107XG4gIHJldmlld1Rhc2tzPzogUGxhblRhc2tbXTtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGxhbm5lclNldHRpbmdzID0ge1xuICBwcm92aWRlcjogXCJjdXN0b21cIixcbiAgaW50ZXJmYWNlTGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBhcGlCYXNlVXJsOiBcImh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjFcIixcbiAgYXBpS2V5OiBcIlwiLFxuICBtb2RlbDogXCJncHQtNC4xLW1pbmlcIixcbiAgY3VzdG9tSGVhZGVyczogXCJ7fVwiLFxuICB0ZW1wZXJhdHVyZTogMC4zLFxuICBtYXhUb2tlbnM6IDE4MDAsXG4gIGhpc3RvcnlEYXlzOiAxNCxcbiAgZm9jdXNNaW51dGVzOiAyNSxcbiAgc3R1ZHlGb2xkZXI6IFwiMDZfVG9kby9cdTVCNjZcdTRFNjBcIixcbiAgd29ya0ZvbGRlcjogXCIwMV9cdTk4NzlcdTc2RUUvXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCJcbn07XG5cbmNvbnN0IFBST1ZJREVSUzogUmVjb3JkPFByb3ZpZGVySWQsIHsgbGFiZWw6IHN0cmluZzsgYmFzZVVybDogc3RyaW5nOyBtb2RlbDogc3RyaW5nIH0+ID0ge1xuICBjdXN0b206IHsgbGFiZWw6IFwiQ3VzdG9tIE9wZW5BSS1jb21wYXRpYmxlIC8gXHU4MUVBXHU1QjlBXHU0RTQ5XHU1MTdDXHU1QkI5XHU2M0E1XHU1M0UzXCIsIGJhc2VVcmw6IFwiXCIsIG1vZGVsOiBcIlwiIH0sXG4gIG9wZW5haTogeyBsYWJlbDogXCJPcGVuQUlcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsIG1vZGVsOiBcImdwdC00LjEtbWluaVwiIH0sXG4gIGNsYXVkZTogeyBsYWJlbDogXCJBbnRocm9waWMgQ2xhdWRlXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkuYW50aHJvcGljLmNvbS92MVwiLCBtb2RlbDogXCJjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTRcIiB9LFxuICBkZWVwc2VlazogeyBsYWJlbDogXCJEZWVwU2Vla1wiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLmRlZXBzZWVrLmNvbS92MVwiLCBtb2RlbDogXCJkZWVwc2Vlay1jaGF0XCIgfSxcbiAgZ2xtOiB7IGxhYmVsOiBcIlpoaXB1IEdMTSAvIFx1NjY3QVx1OEMzMVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vb3Blbi5iaWdtb2RlbC5jbi9hcGkvcGFhcy92NFwiLCBtb2RlbDogXCJnbG0tNC1mbGFzaFwiIH0sXG4gIGtpbWk6IHsgbGFiZWw6IFwiS2ltaSAvIE1vb25zaG90XCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkubW9vbnNob3QuY24vdjFcIiwgbW9kZWw6IFwibW9vbnNob3QtdjEtOGtcIiB9LFxuICBnZW1pbmk6IHsgbGFiZWw6IFwiR29vZ2xlIEdlbWluaVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vZ2VuZXJhdGl2ZWxhbmd1YWdlLmdvb2dsZWFwaXMuY29tL3YxYmV0YVwiLCBtb2RlbDogXCJnZW1pbmktMi4wLWZsYXNoXCIgfVxufTtcblxuYXN5bmMgZnVuY3Rpb24gcmVxdWVzdFBsYW5Db21wbGV0aW9uKFxuICBzZXR0aW5nczogUGxhbm5lclNldHRpbmdzLFxuICBiYXNlVXJsOiBzdHJpbmcsXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG4gIHN5c3RlbTogc3RyaW5nLFxuICB1c2VyOiBzdHJpbmdcbik6IFByb21pc2U8QXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiByZXF1ZXN0VXJsPj4+IHtcbiAgaWYgKHNldHRpbmdzLnByb3ZpZGVyID09PSBcImNsYXVkZVwiKSB7XG4gICAgaWYgKHNldHRpbmdzLmFwaUtleSkgaGVhZGVyc1tcIngtYXBpLWtleVwiXSA9IHNldHRpbmdzLmFwaUtleTtcbiAgICBoZWFkZXJzW1wiYW50aHJvcGljLXZlcnNpb25cIl0gPz89IFwiMjAyMy0wNi0wMVwiO1xuICAgIHJldHVybiByZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogYCR7YmFzZVVybH0vbWVzc2FnZXNgLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogc2V0dGluZ3MubW9kZWwsIG1heF90b2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBzeXN0ZW0sIG1lc3NhZ2VzOiBbeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogdXNlciB9XSB9KSwgdGhyb3c6IGZhbHNlXG4gICAgfSk7XG4gIH1cbiAgaWYgKHNldHRpbmdzLnByb3ZpZGVyID09PSBcImdlbWluaVwiKSB7XG4gICAgY29uc3Qga2V5ID0gc2V0dGluZ3MuYXBpS2V5ID8gYD9rZXk9JHtlbmNvZGVVUklDb21wb25lbnQoc2V0dGluZ3MuYXBpS2V5KX1gIDogXCJcIjtcbiAgICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGAke2Jhc2VVcmx9L21vZGVscy8ke2VuY29kZVVSSUNvbXBvbmVudChzZXR0aW5ncy5tb2RlbCl9OmdlbmVyYXRlQ29udGVudCR7a2V5fWAsIG1ldGhvZDogXCJQT1NUXCIsIGhlYWRlcnMsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN5c3RlbUluc3RydWN0aW9uOiB7IHBhcnRzOiBbeyB0ZXh0OiBzeXN0ZW0gfV0gfSwgY29udGVudHM6IFt7IHJvbGU6IFwidXNlclwiLCBwYXJ0czogW3sgdGV4dDogdXNlciB9XSB9XSwgZ2VuZXJhdGlvbkNvbmZpZzogeyB0ZW1wZXJhdHVyZTogc2V0dGluZ3MudGVtcGVyYXR1cmUsIG1heE91dHB1dFRva2Vuczogc2V0dGluZ3MubWF4VG9rZW5zLCByZXNwb25zZU1pbWVUeXBlOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9IH0pLCB0aHJvdzogZmFsc2VcbiAgICB9KTtcbiAgfVxuICBpZiAoc2V0dGluZ3MuYXBpS2V5KSBoZWFkZXJzLkF1dGhvcml6YXRpb24gPSBgQmVhcmVyICR7c2V0dGluZ3MuYXBpS2V5fWA7XG4gIHJldHVybiByZXF1ZXN0VXJsKHtcbiAgICB1cmw6IGAke2Jhc2VVcmx9L2NoYXQvY29tcGxldGlvbnNgLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6IHNldHRpbmdzLm1vZGVsLCB0ZW1wZXJhdHVyZTogc2V0dGluZ3MudGVtcGVyYXR1cmUsIG1heF90b2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgbWVzc2FnZXM6IFt7IHJvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IHN5c3RlbSB9LCB7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiB1c2VyIH1dIH0pLCB0aHJvdzogZmFsc2VcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRpb25UZXh0KHByb3ZpZGVyOiBQcm92aWRlcklkLCByZXNwb25zZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGpzb24gPSByZXNwb25zZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKHByb3ZpZGVyID09PSBcImNsYXVkZVwiKSB7XG4gICAgY29uc3QgY29udGVudCA9IGpzb24uY29udGVudCBhcyBBcnJheTx7IHR5cGU/OiBzdHJpbmc7IHRleHQ/OiBzdHJpbmcgfT4gfCB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIGNvbnRlbnQ/LmZpbHRlcihwYXJ0ID0+IHBhcnQudHlwZSA9PT0gXCJ0ZXh0XCIpLm1hcChwYXJ0ID0+IHBhcnQudGV4dCA/PyBcIlwiKS5qb2luKFwiXCIpO1xuICB9XG4gIGlmIChwcm92aWRlciA9PT0gXCJnZW1pbmlcIikge1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBqc29uLmNhbmRpZGF0ZXMgYXMgQXJyYXk8eyBjb250ZW50PzogeyBwYXJ0cz86IEFycmF5PHsgdGV4dD86IHN0cmluZyB9PiB9IH0+IHwgdW5kZWZpbmVkO1xuICAgIHJldHVybiBjYW5kaWRhdGVzPy5bMF0/LmNvbnRlbnQ/LnBhcnRzPy5tYXAocGFydCA9PiBwYXJ0LnRleHQgPz8gXCJcIikuam9pbihcIlwiKTtcbiAgfVxuICBjb25zdCBjaG9pY2VzID0ganNvbi5jaG9pY2VzIGFzIEFycmF5PHsgbWVzc2FnZT86IHsgY29udGVudD86IHN0cmluZyB9IH0+IHwgdW5kZWZpbmVkO1xuICByZXR1cm4gY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50O1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBBSVBsYW5uZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwbHVnaW5TZXR0aW5ncyE6IFBsYW5uZXJTZXR0aW5ncztcbiAgcHJpdmF0ZSBmb2N1c1N0YXR1c0VsITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgZm9jdXNNaW5pRWwhOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgcHJpdmF0ZSBmaW5pc2hpbmdGb2N1cyA9IGZhbHNlO1xuICBwcml2YXRlIGZvY3VzVGltZXJPcGVuID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaURyYWdnaW5nID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaU1vdmVkID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaVN0YXJ0WCA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0WSA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0TGVmdCA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0VG9wID0gMDtcblxuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBBSVBsYW5uZXJTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNyZWF0ZS1haS1wbGFuXCIsXG4gICAgICBuYW1lOiBcIkNyZWF0ZSBBSSBwbGFuXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gbmV3IFBsYW5JbnB1dE1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKClcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJzdGFydC1mb2N1cy1zZXNzaW9uXCIsIG5hbWU6IFwiU3RhcnQgZm9jdXMgc2Vzc2lvblwiLCBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuRm9jdXNGb3JBY3RpdmVOb3RlKCkgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwicmVzdW1lLWZvY3VzLXNlc3Npb25cIiwgbmFtZTogXCJSZXN1bWUgZm9jdXMgc2Vzc2lvblwiLCBjYWxsYmFjazogKCkgPT4gdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpIH0pO1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImNhbGVuZGFyLXBsdXNcIiwgXCJDcmVhdGUgQUkgcGxhblwiLCAoKSA9PiBuZXcgUGxhbklucHV0TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSk7XG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwidGltZXJcIiwgXCJTdGFydCBmb2N1cyBzZXNzaW9uXCIsICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLWZvY3VzLXN0YXR1c1wiKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c1N0YXR1c0VsLCBcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsID0gdGhpcy5hcHAud29ya3NwYWNlLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLW1pbmlcIixcbiAgICAgIGF0dHI6IHsgdHlwZTogXCJidXR0b25cIiwgXCJhcmlhLWxhYmVsXCI6IFwiUmVzdG9yZSBmb2N1cyB0aW1lclwiIH1cbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJjbGlja1wiLCBldmVudCA9PiB7XG4gICAgICBpZiAodGhpcy5taW5pTW92ZWQpIHsgZXZlbnQucHJldmVudERlZmF1bHQoKTsgcmV0dXJuOyB9XG4gICAgICB2b2lkIHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJwb2ludGVyZG93blwiLCBldmVudCA9PiB0aGlzLmJlZ2luTWluaURyYWcoZXZlbnQpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInBvaW50ZXJtb3ZlXCIsIGV2ZW50ID0+IHRoaXMubW92ZU1pbmlEcmFnKGV2ZW50KSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJwb2ludGVydXBcIiwgKCkgPT4gdm9pZCB0aGlzLmVuZE1pbmlEcmFnKCkpO1xuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdGhpcy5mb2N1c01pbmlFbC5yZW1vdmUoKSk7XG4gICAgY29uc3QgdXBkYXRlVmlzaWJsZUhlaWdodCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGhlaWdodCA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydD8uaGVpZ2h0ID8/IHdpbmRvdy5pbm5lckhlaWdodDtcbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tYWktcGxhbm5lci12aXNpYmxlLWhlaWdodFwiLCBgJHtNYXRoLnJvdW5kKGhlaWdodCl9cHhgKTtcbiAgICB9O1xuICAgIHVwZGF0ZVZpc2libGVIZWlnaHQoKTtcbiAgICBpZiAod2luZG93LnZpc3VhbFZpZXdwb3J0KSB7XG4gICAgICBjb25zdCB2aWV3cG9ydCA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydDtcbiAgICAgIHZpZXdwb3J0LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCk7XG4gICAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHZpZXdwb3J0LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCkpO1xuICAgIH1cbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiZm9jdXNpblwiLCBldmVudCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgIXRhcmdldC5tYXRjaGVzKFwiaW5wdXQsIHRleHRhcmVhLCBzZWxlY3RcIikpIHJldHVybjtcbiAgICAgIGlmICghdGFyZ2V0LmNsb3Nlc3QoXCIuYWktcGxhbm5lci1tb2RhbFwiKSkgcmV0dXJuO1xuICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGFyZ2V0LnNjcm9sbEludG9WaWV3KHsgYmxvY2s6IFwiY2VudGVyXCIsIGlubGluZTogXCJuZWFyZXN0XCIsIGJlaGF2aW9yOiBcInNtb290aFwiIH0pLCAyNTApO1xuICAgIH0pO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbCh3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpLCA1MDApKTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5wbHVnaW5TZXR0aW5ncyk7XG4gIH1cblxuICBnZXRBY3RpdmVGb2N1cygpOiBBY3RpdmVGb2N1c1Nlc3Npb24gfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICB9XG5cbiAgc2V0Rm9jdXNUaW1lck9wZW4ob3BlbjogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMuZm9jdXNUaW1lck9wZW4gPSBvcGVuO1xuICAgIHZvaWQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgfVxuXG4gIHByaXZhdGUgYmVnaW5NaW5pRHJhZyhldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gICAgaWYgKGV2ZW50LmJ1dHRvbiAhPT0gMCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHRoaXMubWluaURyYWdnaW5nID0gdHJ1ZTtcbiAgICB0aGlzLm1pbmlNb3ZlZCA9IGZhbHNlO1xuICAgIHRoaXMubWluaVN0YXJ0WCA9IGV2ZW50LmNsaWVudFg7XG4gICAgdGhpcy5taW5pU3RhcnRZID0gZXZlbnQuY2xpZW50WTtcbiAgICB0aGlzLm1pbmlTdGFydExlZnQgPSByZWN0LmxlZnQ7XG4gICAgdGhpcy5taW5pU3RhcnRUb3AgPSByZWN0LnRvcDtcbiAgfVxuXG4gIHByaXZhdGUgbW92ZU1pbmlEcmFnKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMubWluaURyYWdnaW5nKSByZXR1cm47XG4gICAgY29uc3QgZHggPSBldmVudC5jbGllbnRYIC0gdGhpcy5taW5pU3RhcnRYO1xuICAgIGNvbnN0IGR5ID0gZXZlbnQuY2xpZW50WSAtIHRoaXMubWluaVN0YXJ0WTtcbiAgICBpZiAoIXRoaXMubWluaU1vdmVkICYmIE1hdGguaHlwb3QoZHgsIGR5KSA8IDYpIHJldHVybjtcbiAgICB0aGlzLm1pbmlNb3ZlZCA9IHRydWU7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCByZWN0ID0gdGhpcy5mb2N1c01pbmlFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBsZWZ0ID0gTWF0aC5taW4oTWF0aC5tYXgoOCwgdGhpcy5taW5pU3RhcnRMZWZ0ICsgZHgpLCBNYXRoLm1heCg4LCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGggLSA4KSk7XG4gICAgY29uc3QgdG9wID0gTWF0aC5taW4oTWF0aC5tYXgoOCwgdGhpcy5taW5pU3RhcnRUb3AgKyBkeSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gOCkpO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnJpZ2h0ID0gXCJhdXRvXCI7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5ib3R0b20gPSBcImF1dG9cIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5kTWluaURyYWcoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLm1pbmlEcmFnZ2luZykgcmV0dXJuO1xuICAgIHRoaXMubWluaURyYWdnaW5nID0gZmFsc2U7XG4gICAgaWYgKCF0aGlzLm1pbmlNb3ZlZCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMSwgd2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoKTtcbiAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgxLCB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCk7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbmlQb3NpdGlvbiA9IHsgeDogcmVjdC5sZWZ0IC8gd2lkdGgsIHk6IHJlY3QudG9wIC8gaGVpZ2h0IH07XG4gICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7IHRoaXMubWluaU1vdmVkID0gZmFsc2U7IH0sIDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseU1pbmlQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBjb25zdCBwb3NpdGlvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW5pUG9zaXRpb247XG4gICAgaWYgKCFwb3NpdGlvbikgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1pbihNYXRoLm1heCg4LCBwb3NpdGlvbi54ICogKHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCkpLCBNYXRoLm1heCg4LCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGggLSA4KSk7XG4gICAgY29uc3QgdG9wID0gTWF0aC5taW4oTWF0aC5tYXgoOCwgcG9zaXRpb24ueSAqICh3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCkpLCBNYXRoLm1heCg4LCB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCAtIDgpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5yaWdodCA9IFwiYXV0b1wiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuYm90dG9tID0gXCJhdXRvXCI7XG4gIH1cblxuICBhc3luYyBvcGVuRm9jdXNGb3JBY3RpdmVOb3RlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzKSB7XG4gICAgICBhd2FpdCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgIGlmICghZmlsZSkgeyBuZXcgTm90aWNlKFwiXHU4QkY3XHU1MTQ4XHU2MjUzXHU1RjAwXHU0RTAwXHU0RTJBXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwIC8gT3BlbiBhIHBsYW4gbm90ZSBmaXJzdC5cIik7IHJldHVybjsgfVxuICAgIGNvbnN0IHRhc2tzID0gZXh0cmFjdEZvY3VzVGFza3ModGhpcy5hcHAsIGZpbGUpO1xuICAgIGlmICghdGFza3MubGVuZ3RoKSB7IG5ldyBOb3RpY2UoXCJcdTVGNTNcdTUyNERcdTdCMTRcdThCQjBcdTZDQTFcdTY3MDlcdTUzRUZcdTRFMTNcdTZDRThcdTc2ODRcdThCQTFcdTUyMTJcdTRFRkJcdTUyQTEgLyBObyBwbGFuIHRhc2tzIGZvdW5kLlwiKTsgcmV0dXJuOyB9XG4gICAgbmV3IEZvY3VzVGFza1BpY2tlck1vZGFsKHRoaXMuYXBwLCB0aGlzLCBmaWxlLCB0YXNrcykub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgc3RhcnRGb2N1cyhmaWxlOiBURmlsZSwgdGFzazogRm9jdXNUYXNrLCBtaW51dGVzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cykge1xuICAgICAgbmV3IE5vdGljZShcIlx1NURGMlx1NjcwOVx1OEZEQlx1ODg0Q1x1NEUyRFx1NzY4NFx1NEUxM1x1NkNFOCAvIEEgZm9jdXMgc2Vzc2lvbiBpcyBhbHJlYWR5IGFjdGl2ZS5cIik7XG4gICAgICBhd2FpdCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cyA9IHtcbiAgICAgIGZpbGVQYXRoOiBmaWxlLnBhdGgsXG4gICAgICB0YXNrSWQ6IHRhc2suaWQsXG4gICAgICB0YXNrTmFtZTogdGFzay5uYW1lLFxuICAgICAgY2F0ZWdvcnk6IHRhc2suY2F0ZWdvcnksXG4gICAgICBkdXJhdGlvbk1zOiBNYXRoLm1heCgxLCBtaW51dGVzKSAqIDYwMDAwLFxuICAgICAgZm9jdXNlZE1zOiAwLFxuICAgICAgcnVubmluZ0F0OiBzdGFydGVkQXQsXG4gICAgICBzdGFydGVkQXRcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Rhc2suaWR9QWN0dWFsU3RhcnRgXSA/Pz0gdGltZU9mRGF5KG5ldyBEYXRlKHN0YXJ0ZWRBdCkpO1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU2NUUwXHU2Q0Q1XHU3QUNCXHU1MzczXHU1MTk5XHU1MTY1XHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0XHVGRjBDXHU1QzA2XHU1NzI4XHU3RUQzXHU2NzVGXHU2NUY2XHU5MUNEXHU4QkQ1IC8gQ291bGQgbm90IHdyaXRlIHRoZSBzdGFydCB0aW1lIHlldDsgaXQgd2lsbCByZXRyeSBvbiBmaW5pc2guXCIpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHRvZ2dsZUZvY3VzUGF1c2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XG4gICAgaWYgKHNlc3Npb24ucnVubmluZ0F0ICE9PSBudWxsKSB7XG4gICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgc2Vzc2lvbi5ydW5uaW5nQXQgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IERhdGUubm93KCk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgfVxuXG4gIGFzeW5jIHJlc3RvcmVGb2N1c1RpbWVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoc2Vzc2lvbi5maWxlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NjI3RVx1NEUwRFx1NTIzMFx1NTM5Rlx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMFx1RkYwQ1x1NjVFMFx1NkNENVx1NUI4Q1x1NjIxMFx1NTZERVx1NTE5OSAvIFRoZSBwbGFuIG5vdGUgaXMgbWlzc2luZy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIGZpbmlzaEZvY3VzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbiB8fCB0aGlzLmZpbmlzaGluZ0ZvY3VzKSByZXR1cm47XG4gICAgdGhpcy5maW5pc2hpbmdGb2N1cyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCkge1xuICAgICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IG51bGw7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHNlc3Npb24uZmlsZVBhdGgpO1xuICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgICBuZXcgTm90aWNlKFwiXHU2MjdFXHU0RTBEXHU1MjMwXHU1MzlGXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwXHVGRjBDXHU0RTEzXHU2Q0U4XHU4QkIwXHU1RjU1XHU2NjgyXHU2NzJBXHU1MTk5XHU1MTY1IC8gUGxhbiBub3RlIG1pc3Npbmc7IGZvY3VzIHJlY29yZCB3YXMga2VwdC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdHVhbE1pbnV0ZXMgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHNlc3Npb24uZm9jdXNlZE1zIC8gNjAwMDApKTtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbFN0YXJ0YF0gPz89IHRpbWVPZkRheShuZXcgRGF0ZShzZXNzaW9uLnN0YXJ0ZWRBdCkpO1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxFbmRgXSA9IHRpbWVPZkRheShuZXcgRGF0ZSgpKTtcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsTWludXRlc2BdID0gTnVtYmVyKGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSArIGFjdHVhbE1pbnV0ZXM7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUZvY3VzU2Vzc2lvbnNgXSA9IE51bWJlcihmbVtgJHtzZXNzaW9uLnRhc2tJZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgKyAxO1xuICAgICAgfSk7XG4gICAgICB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzID0gdW5kZWZpbmVkO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgIG5ldyBOb3RpY2UoYFx1NURGMlx1OEJCMFx1NUY1NSAke2FjdHVhbE1pbnV0ZXN9IFx1NTIwNlx1OTQ5Rlx1NEUxM1x1NkNFOCAvIEZvY3VzIHJlY29yZGVkLmApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmZpbmlzaGluZ0ZvY3VzID0gZmFsc2U7XG4gICAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hGb2N1c1N0YXR1cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuZGlzcGxheSA9IHRoaXMuZm9jdXNUaW1lck9wZW4gPyBcIm5vbmVcIiA6IFwiXCI7XG4gICAgY29uc3QgZWxhcHNlZCA9IHNlc3Npb24uZm9jdXNlZE1zICsgKHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gMCA6IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBzZXNzaW9uLnJ1bm5pbmdBdCkpO1xuICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCAmJiBlbGFwc2VkID49IHNlc3Npb24uZHVyYXRpb25Ncykge1xuICAgICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldFRleHQoYEZvY3VzIGNvbXBsZXRlIFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTVCOENcdTYyMTAgLyBGb2N1cyBjb21wbGV0ZVwiKTtcbiAgICAgIHZvaWQgdGhpcy5maW5pc2hGb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ZSA9IHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gXCJGb2N1cyBwYXVzZWRcIiA6IGZvcm1hdER1cmF0aW9uKE1hdGgubWF4KDAsIHNlc3Npb24uZHVyYXRpb25NcyAtIGVsYXBzZWQpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc2V0VGV4dChgJHtzdGF0ZX0gXHUwMEI3ICR7c2Vzc2lvbi50YXNrTmFtZX1gKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoYCR7c3RhdGV9IFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCJSZXN0b3JlIGZvY3VzIHRpbWVyXCIpO1xuICAgIGlmICghdGhpcy5mb2N1c1RpbWVyT3Blbikgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmFwcGx5TWluaVBvc2l0aW9uKCkpO1xuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHN0YXJ0VGltZTogc3RyaW5nLCBlbmRUaW1lOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcpOiBQcm9taXNlPFBsYW5SZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCB8fCAhdGhpcy5wbHVnaW5TZXR0aW5ncy5tb2RlbCkgdGhyb3cgbmV3IEVycm9yKFwiUGxlYXNlIGNvbmZpZ3VyZSBhbiBBUEkgYmFzZSBVUkwgYW5kIG1vZGVsIGZpcnN0LlwiKTtcbiAgICBsZXQgY3VzdG9tSGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHRyeSB7XG4gICAgICBjdXN0b21IZWFkZXJzID0gSlNPTi5wYXJzZSh0aGlzLnBsdWdpblNldHRpbmdzLmN1c3RvbUhlYWRlcnMgfHwgXCJ7fVwiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1c3RvbSBoZWFkZXJzIG11c3QgYmUgdmFsaWQgSlNPTi5cIik7XG4gICAgfVxuICAgIGNvbnN0IHN5c3RlbSA9IG1vZGUgPT09IFwic3R1ZHlcIlxuICAgICAgPyBcIllvdSBjcmVhdGUgcHJhY3RpY2FsIHNhbWUtZGF5IGhvbWV3b3JrIHBsYW5zIGZvciBhIGNoaWxkLiBCcmVhayB0YXNrcyBpbnRvIGEgc2Vuc2libGUgb3JkZXIsIGluY2x1ZGUgc2hvcnQgYnJlYWtzIHdoZW4gaGVscGZ1bCwgYW5kIG9ubHkgYWRkIHJldmlldyB0YXNrcyBncm91bmRlZCBpbiB0aGUgZ2l2ZW4gaG9tZXdvcmsuXCJcbiAgICAgIDogXCJZb3UgY3JlYXRlIHByYWN0aWNhbCBzYW1lLWRheSB3b3JrIHBsYW5zLiBQcmlvcml0aXplIGJ5IHVyZ2VuY3kgYW5kIGNvZ25pdGl2ZSBsb2FkLCBpbmNsdWRlIGJ1ZmZlcnMsIGFuZCBkbyBub3QgaW52ZW50IHdvcmsgaXRlbXMuXCI7XG4gICAgY29uc3QgZm9sZGVyID0gbW9kZSA9PT0gXCJzdHVkeVwiID8gdGhpcy5wbHVnaW5TZXR0aW5ncy5zdHVkeUZvbGRlciA6IHRoaXMucGx1Z2luU2V0dGluZ3Mud29ya0ZvbGRlcjtcbiAgICBjb25zdCBoaXN0b3J5ID0gYnVpbGRIaXN0b3J5Q29udGV4dCh0aGlzLmFwcCwgZm9sZGVyLCB0aGlzLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKTtcbiAgICBjb25zdCB1c2VyID0gYFBsYW4gZGF0ZTogJHtkYXRlfVxcblN0YXJ0IHRpbWU6ICR7c3RhcnRUaW1lIHx8IFwibm90IHNwZWNpZmllZFwifVxcbkxhdGVzdCBmaW5pc2g6ICR7ZW5kVGltZSB8fCBcIm5vdCBzcGVjaWZpZWRcIn1cXG5JdGVtczpcXG4ke2lucHV0fVxcblxcbkhpc3RvcmljYWwgdGltaW5nIGNhbGlicmF0aW9uOlxcbiR7aGlzdG9yeX1cXG5cXG5Vc2UgdGhlIGNhbGlicmF0aW9uIG9ubHkgd2hlbiBpdCBoYXMgYXQgbGVhc3QgdHdvIGNvbXBhcmFibGUgcmVjb3Jkcy4gUmV0dXJuIEpTT04gb25seSwgd2l0aCB0aGlzIHNoYXBlOiB7XCJ0aXRsZVwiOlwic2hvcnQgdGl0bGVcIixcInN1bW1hcnlcIjpcIm9uZSBzZW50ZW5jZVwiLFwidGFza3NcIjpbe1widGl0bGVcIjpcInRhc2tcIixcImNhdGVnb3J5XCI6XCJzdWJqZWN0IG9yIHByb2plY3RcIixcInN0YXJ0VGltZVwiOlwiSEg6bW1cIixcImVuZFRpbWVcIjpcIkhIOm1tXCIsXCJlc3RpbWF0ZWRNaW51dGVzXCI6MzAsXCJkZXNjcmlwdGlvblwiOlwib3B0aW9uYWxcIn1dLFwicmV2aWV3VGFza3NcIjpbc2FtZSB0YXNrIHNoYXBlXX0uIFVzZSBbXSBmb3IgcmV2aWV3VGFza3Mgd2hlbiBub25lIGFyZSBqdXN0aWZpZWQuYDtcbiAgICBjb25zdCBiYXNlVXJsID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiwgLi4uY3VzdG9tSGVhZGVycyB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFBsYW5Db21wbGV0aW9uKHRoaXMucGx1Z2luU2V0dGluZ3MsIGJhc2VVcmwsIGhlYWRlcnMsIHN5c3RlbSwgdXNlcik7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB0aHJvdyBuZXcgRXJyb3IoYEFQSSByZXF1ZXN0IGZhaWxlZCAoJHtyZXNwb25zZS5zdGF0dXN9KTogJHtyZXNwb25zZS50ZXh0LnNsaWNlKDAsIDMwMCl9YCk7XG4gICAgY29uc3QgY29udGVudCA9IGNvbXBsZXRpb25UZXh0KHRoaXMucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIsIHJlc3BvbnNlLmpzb24pO1xuICAgIGlmICh0eXBlb2YgY29udGVudCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHByb3ZpZGVyIGRpZCBub3QgcmV0dXJuIGEgY2hhdCBjb21wbGV0aW9uLlwiKTtcbiAgICByZXR1cm4gcGFyc2VQbGFuKGNvbnRlbnQpO1xuICB9XG5cbiAgYXN5bmMgd3JpdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGZvbGRlciA9IG1vZGUgPT09IFwic3R1ZHlcIiA/IHRoaXMucGx1Z2luU2V0dGluZ3Muc3R1ZHlGb2xkZXIgOiB0aGlzLnBsdWdpblNldHRpbmdzLndvcmtGb2xkZXI7XG4gICAgYXdhaXQgZW5zdXJlRm9sZGVyKHRoaXMuYXBwLCBmb2xkZXIpO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7ZGF0ZX0tJHtzYWZlRmlsZW5hbWUocGxhbi50aXRsZSB8fCAobW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCIpKX0ubWRgO1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKGAke2ZvbGRlcn0vJHtmaWxlbmFtZX1gKTtcbiAgICBjb25zdCBjb250ZW50ID0gcmVuZGVyUGxhbihtb2RlLCBkYXRlLCBwbGFuKTtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcgaW5zdGFuY2VvZiBURmlsZSkgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGV4aXN0aW5nLCBjb250ZW50KTtcbiAgICBlbHNlIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShwYXRoLCBjb250ZW50KTtcbiAgICBhd2FpdCB0aGlzLmFwcC53b3Jrc3BhY2Uub3BlbkxpbmtUZXh0KHBhdGgsIFwiXCIsIHRydWUpO1xuICAgIHJldHVybiBwYXRoO1xuICB9XG59XG5cbmludGVyZmFjZSBGb2N1c1Rhc2sgeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGNhdGVnb3J5OiBzdHJpbmc7IGVzdGltYXRlZE1pbnV0ZXM6IG51bWJlcjsgfVxuXG5mdW5jdGlvbiBleHRyYWN0Rm9jdXNUYXNrcyhhcHA6IEFwcCwgZmlsZTogVEZpbGUpOiBGb2N1c1Rhc2tbXSB7XG4gIGNvbnN0IGZtID0gYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoa2V5ID0+IC9edGFza1xcZCtOYW1lJC8udGVzdChrZXkpKS5zb3J0KCkubWFwKGtleSA9PiB7XG4gICAgY29uc3QgaWQgPSBrZXkucmVwbGFjZShcIk5hbWVcIiwgXCJcIik7XG4gICAgcmV0dXJuIHsgaWQsIG5hbWU6IFN0cmluZyhmbVtrZXldID8/IGlkKSwgY2F0ZWdvcnk6IFN0cmluZyhmbVtgJHtpZH1DYXRlZ29yeWBdID8/IFwiXCIpLCBlc3RpbWF0ZWRNaW51dGVzOiBOdW1iZXIoZm1bYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID8/IDApIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidWlsZEhpc3RvcnlDb250ZXh0KGFwcDogQXBwLCBmb2xkZXI6IHN0cmluZywgZGF5czogbnVtYmVyKTogc3RyaW5nIHtcbiAgY29uc3QgY3V0b2ZmID0gRGF0ZS5ub3coKSAtIGRheXMgKiA4NjQwMDAwMDtcbiAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlcjsgY291bnQ6IG51bWJlciB9PigpO1xuICBmb3IgKGNvbnN0IGZpbGUgb2YgYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgIGlmICghZmlsZS5wYXRoLnN0YXJ0c1dpdGgoYCR7bm9ybWFsaXplUGF0aChmb2xkZXIpfS9gKSB8fCBmaWxlLnN0YXQubXRpbWUgPCBjdXRvZmYpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGZtID0gYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhmbSkuZmlsdGVyKGl0ZW0gPT4gL150YXNrXFxkK05hbWUkLy50ZXN0KGl0ZW0pKSkge1xuICAgICAgY29uc3QgaWQgPSBrZXkucmVwbGFjZShcIk5hbWVcIiwgXCJcIik7XG4gICAgICBjb25zdCBwbGFubmVkID0gTnVtYmVyKGZtW2Ake2lkfUVzdGltYXRlZE1pbnV0ZXNgXSA/PyAwKTtcbiAgICAgIGNvbnN0IGFjdHVhbCA9IE51bWJlcihmbVtgJHtpZH1BY3R1YWxNaW51dGVzYF0gPz8gMCkgfHwgZHVyYXRpb25Gcm9tVGltZXMoZm1bYCR7aWR9QWN0dWFsU3RhcnRgXSwgZm1bYCR7aWR9QWN0dWFsRW5kYF0pO1xuICAgICAgaWYgKHBsYW5uZWQgPD0gMCB8fCBhY3R1YWwgPD0gMCkgY29udGludWU7XG4gICAgICBjb25zdCBjYXRlZ29yeSA9IFN0cmluZyhmbVtgJHtpZH1DYXRlZ29yeWBdID8/IFN0cmluZyhmbVtrZXldKS5zcGxpdChcIlx1MDBCN1wiKVswXSA/PyBcIlx1NTE3Nlx1NUI4M1wiKS50cmltKCkgfHwgXCJcdTUxNzZcdTVCODNcIjtcbiAgICAgIGNvbnN0IGl0ZW0gPSBncm91cHMuZ2V0KGNhdGVnb3J5KSA/PyB7IHBsYW5uZWQ6IDAsIGFjdHVhbDogMCwgY291bnQ6IDAgfTtcbiAgICAgIGl0ZW0ucGxhbm5lZCArPSBwbGFubmVkOyBpdGVtLmFjdHVhbCArPSBhY3R1YWw7IGl0ZW0uY291bnQgKz0gMTsgZ3JvdXBzLnNldChjYXRlZ29yeSwgaXRlbSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGxpbmVzID0gWy4uLmdyb3Vwcy5lbnRyaWVzKCldLmZpbHRlcigoWywgdmFsdWVdKSA9PiB2YWx1ZS5jb3VudCA+PSAyKS5zb3J0KChhLCBiKSA9PiBiWzFdLmNvdW50IC0gYVsxXS5jb3VudCkuc2xpY2UoMCwgNikubWFwKChbY2F0ZWdvcnksIHZhbHVlXSkgPT4ge1xuICAgIGNvbnN0IHBlcmNlbnQgPSBNYXRoLnJvdW5kKCh2YWx1ZS5hY3R1YWwgLyB2YWx1ZS5wbGFubmVkIC0gMSkgKiAxMDApO1xuICAgIHJldHVybiBgJHtjYXRlZ29yeX06ICR7dmFsdWUuY291bnR9IHJlY29yZHMsIHBsYW5uZWQgJHt2YWx1ZS5wbGFubmVkfSBtaW4sIGFjdHVhbCAke3ZhbHVlLmFjdHVhbH0gbWluLCBkZXZpYXRpb24gJHtwZXJjZW50ID49IDAgPyBcIitcIiA6IFwiXCJ9JHtwZXJjZW50fSVgO1xuICB9KTtcbiAgcmV0dXJuIGxpbmVzLmxlbmd0aCA/IGxpbmVzLmpvaW4oXCJcXG5cIikgOiBcIk5vIHJlbGlhYmxlIGhpc3RvcmljYWwgcmVjb3JkcyB5ZXQuIFVzZSByZWFzb25hYmxlIGVzdGltYXRlcyBhbmQgYSBzbWFsbCBidWZmZXIuXCI7XG59XG5cbmZ1bmN0aW9uIGR1cmF0aW9uRnJvbVRpbWVzKHN0YXJ0OiB1bmtub3duLCBlbmQ6IHVua25vd24pOiBudW1iZXIge1xuICBjb25zdCBwYXJzZSA9ICh2YWx1ZTogdW5rbm93bik6IG51bWJlciB8IG51bGwgPT4geyBjb25zdCBtYXRjaCA9IFN0cmluZyh2YWx1ZSA/PyBcIlwiKS5tYXRjaCgvXihcXGR7MSwyfSk6KFxcZHsyfSkkLyk7IHJldHVybiBtYXRjaCA/IE51bWJlcihtYXRjaFsxXSkgKiA2MCArIE51bWJlcihtYXRjaFsyXSkgOiBudWxsOyB9O1xuICBjb25zdCBmcm9tID0gcGFyc2Uoc3RhcnQpLCB0byA9IHBhcnNlKGVuZCk7XG4gIHJldHVybiBmcm9tID09PSBudWxsIHx8IHRvID09PSBudWxsID8gMCA6ICh0byA+PSBmcm9tID8gdG8gLSBmcm9tIDogdG8gKyAxNDQwIC0gZnJvbSk7XG59XG5cbmNsYXNzIEZvY3VzVGFza1BpY2tlck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG1pbnV0ZXM6IG51bWJlcjtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4sIHByaXZhdGUgcmVhZG9ubHkgZmlsZTogVEZpbGUsIHByaXZhdGUgcmVhZG9ubHkgdGFza3M6IEZvY3VzVGFza1tdKSB7IHN1cGVyKGFwcCk7IHRoaXMubWludXRlcyA9IHBsdWdpbi5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbnV0ZXM7IH1cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTZBMjFcdTVGMEYgLyBGb2N1cyBtb2RlXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU0RTEzXHU2Q0U4XHU2NUY2XHU5NTdGIC8gRm9jdXMgZHVyYXRpb25cIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd24uYWRkT3B0aW9uKFwiMjVcIiwgXCIyNSBtaW5cIikuYWRkT3B0aW9uKFwiNTBcIiwgXCI1MCBtaW5cIikuYWRkT3B0aW9uKFwiOTBcIiwgXCI5MCBtaW5cIikuc2V0VmFsdWUoU3RyaW5nKHRoaXMubWludXRlcykpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMubWludXRlcyA9IE51bWJlcih2YWx1ZSkpKTtcbiAgICBjb25zdCBjdXN0b20gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJudW1iZXJcIiwgcGxhY2Vob2xkZXI6IFwiQ3VzdG9tIG1pbnV0ZXMgLyBcdTgxRUFcdTVCOUFcdTRFNDlcdTUyMDZcdTk0OUZcIiB9KTtcbiAgICBjdXN0b20uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHsgY29uc3QgdmFsdWUgPSBOdW1iZXIoY3VzdG9tLnZhbHVlKTsgaWYgKHZhbHVlID4gMCkgdGhpcy5taW51dGVzID0gdmFsdWU7IH0pO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBcIlx1OTAwOVx1NjJFOVx1NEVGQlx1NTJBMSAvIENob29zZSBhIHRhc2tcIiB9KTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy50YXNrcykge1xuICAgICAgY29uc3QgYnV0dG9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy10YXNrXCIgfSk7XG4gICAgICBidXR0b24uc2V0VGV4dChgJHt0YXNrLmNhdGVnb3J5ID8gYCR7dGFzay5jYXRlZ29yeX0gXHUwMEI3IGAgOiBcIlwifSR7dGFzay5uYW1lfSAoJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXMgfHwgXCI/XCJ9IG1pbilgKTtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4geyB0aGlzLmNsb3NlKCk7IHZvaWQgdGhpcy5wbHVnaW4uc3RhcnRGb2N1cyh0aGlzLmZpbGUsIHRhc2ssIHRoaXMubWludXRlcyk7IH0pO1xuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBGb2N1c1RpbWVyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgaW50ZXJ2YWw6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVGb2N1cygpO1xuICAgIGlmICghc2Vzc2lvbikgeyB0aGlzLmNsb3NlKCk7IHJldHVybjsgfVxuICAgIHRoaXMucGx1Z2luLnNldEZvY3VzVGltZXJPcGVuKHRydWUpO1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIiwgXCJhaS1wbGFubmVyLWZvY3VzLXRpbWVyXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiXHU0RTEzXHU2Q0U4XHU0RTJEIC8gRm9jdXNpbmdcIik7XG4gICAgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogc2Vzc2lvbi50YXNrTmFtZSwgY2xzOiBcImFpLXBsYW5uZXItZm9jdXMtdGl0bGVcIiB9KTtcbiAgICBjb25zdCBjbG9jayA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcImFpLXBsYW5uZXItZm9jdXMtY2xvY2tcIiB9KTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwge1xuICAgICAgdGV4dDogXCJcdTUxNzNcdTk1RURcdTZCNjRcdTdBOTdcdTUzRTNcdTUzRUFcdTRGMUFcdTY3MDBcdTVDMEZcdTUzMTZcdUZGMENcdThCQTFcdTY1RjZcdTRGMUFcdTRGRERcdTc1NTlcdTMwMDJcdTYyNEJcdTY3M0FcdTUyMDdcdTYzNjJcdTUyMzBcdTUxNzZcdTVCODMgQXBwIFx1NTQwRVx1NjMwOVx1N0VDRlx1OEZDN1x1NzY4NFx1NTg5OVx1NEUwQVx1NjVGNlx1OTVGNFx1NEYzMFx1N0I5N1x1RkYxQmlPUyBcdTUzRUZcdTgwRkRcdTY2ODJcdTUwNUNcdTYyMTZcdTU2REVcdTY1MzYgT2JzaWRpYW5cdUZGMENcdTU2RTBcdTZCNjRcdThGRDlcdTRFMERcdTRFRTNcdTg4NjhcdTVERjJcdTlBOENcdThCQzFcdTc2ODRcdTRFMTNcdTZDRThcdTYyMTZcdTk2MDVcdThCRkJcdTY1RjZcdTk1N0ZcdTMwMDIgLyBDbG9zaW5nIG9ubHkgbWluaW1pemVzIHRoaXMgdGltZXIuIE1vYmlsZSBiYWNrZ3JvdW5kIHRpbWUgaXMgYSB3YWxsLWNsb2NrIGVzdGltYXRlOyBpT1MgbWF5IHN1c3BlbmQgb3IgdGVybWluYXRlIE9ic2lkaWFuLCBzbyBpdCBpcyBub3QgdmVyaWZpZWQgZm9jdXMgb3IgcmVhZGluZyB0aW1lLlwiLFxuICAgICAgY2xzOiBcImFpLXBsYW5uZXItZm9jdXMtZGlzY2xhaW1lclwiXG4gICAgfSk7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGFsLWJ1dHRvbi1jb250YWluZXJcIiB9KTtcbiAgICBjb25zdCBwYXVzZSA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU2NjgyXHU1MDVDIC8gUGF1c2VcIiB9KTtcbiAgICBjb25zdCBmaW5pc2ggPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1N0VEM1x1Njc1RiAvIEZpbmlzaFwiLCBjbHM6IFwibW9kLWN0YVwiIH0pO1xuICAgIGNvbnN0IHJlZnJlc2ggPSAoKTogdm9pZCA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5wbHVnaW4uZ2V0QWN0aXZlRm9jdXMoKTtcbiAgICAgIGlmICghY3VycmVudCkgeyB0aGlzLmNsb3NlKCk7IHJldHVybjsgfVxuICAgICAgY29uc3QgZWxhcHNlZCA9IGN1cnJlbnQuZm9jdXNlZE1zICsgKGN1cnJlbnQucnVubmluZ0F0ID09PSBudWxsID8gMCA6IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBjdXJyZW50LnJ1bm5pbmdBdCkpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gTWF0aC5tYXgoMCwgY3VycmVudC5kdXJhdGlvbk1zIC0gZWxhcHNlZCk7XG4gICAgICBjbG9jay5zZXRUZXh0KGZvcm1hdER1cmF0aW9uKHJlbWFpbmluZykpO1xuICAgICAgcGF1c2Uuc2V0VGV4dChjdXJyZW50LnJ1bm5pbmdBdCA9PT0gbnVsbCA/IFwiXHU3RUU3XHU3RUVEIC8gUmVzdW1lXCIgOiBcIlx1NjY4Mlx1NTA1QyAvIFBhdXNlXCIpO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKSB2b2lkIHRoaXMucGx1Z2luLmZpbmlzaEZvY3VzKCk7XG4gICAgfTtcbiAgICBwYXVzZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnBsdWdpbi50b2dnbGVGb2N1c1BhdXNlKCkudGhlbihyZWZyZXNoKSk7XG4gICAgZmluaXNoLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucGx1Z2luLmZpbmlzaEZvY3VzKCkudGhlbigoKSA9PiB0aGlzLmNsb3NlKCkpKTtcbiAgICB0aGlzLmludGVydmFsID0gd2luZG93LnNldEludGVydmFsKHJlZnJlc2gsIDUwMCk7IHJlZnJlc2goKTtcbiAgfVxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmludGVydmFsICE9PSBudWxsKSB3aW5kb3cuY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcbiAgICB0aGlzLnBsdWdpbi5zZXRGb2N1c1RpbWVyT3BlbihmYWxzZSk7XG4gIH1cbn1cblxuY2xhc3MgUGxhbklucHV0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbW9kZTogUGxhbk1vZGUgPSBcInN0dWR5XCI7XG4gIHByaXZhdGUgZGF0ZSA9IGxvY2FsRGF0ZSgpO1xuICBwcml2YXRlIHN0YXJ0VGltZSA9IFwiXCI7XG4gIHByaXZhdGUgZW5kVGltZSA9IFwiXCI7XG4gIHByaXZhdGUgaW5wdXQgPSBcIlwiO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIkFJIFBsYW5uZXIgLyBBSSBcdThCQTFcdTUyMTJcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTZBMjFcdTVGMEYgLyBNb2RlXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IGRyb3Bkb3duXG4gICAgICAuYWRkT3B0aW9uKFwic3R1ZHlcIiwgXCJcdTRGNUNcdTRFMUFcdTRFMEVcdTVCNjZcdTRFNjAgLyBIb21ld29yayAmIHN0dWR5XCIpXG4gICAgICAuYWRkT3B0aW9uKFwid29ya1wiLCBcIlx1NURFNVx1NEY1QyAvIFdvcmtcIilcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLm1vZGUpXG4gICAgICAub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5tb2RlID0gdmFsdWUgYXMgUGxhbk1vZGUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1OEJBMVx1NTIxMlx1NjVFNVx1NjcxRiAvIFBsYW4gZGF0ZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0XG4gICAgICAuc2V0VmFsdWUodGhpcy5kYXRlKS5zZXRQbGFjZWhvbGRlcihcIllZWVktTU0tRERcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5kYXRlID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NUYwMFx1NTlDQlx1NjVGNlx1OTVGNCAvIFN0YXJ0IHRpbWVcIikuc2V0RGVzYyhcIlx1NEY4Qlx1NTk4MiAvIEV4YW1wbGU6IDE5OjAwXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXRcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLnN0YXJ0VGltZSkuc2V0UGxhY2Vob2xkZXIoXCIxOTowMFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLnN0YXJ0VGltZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTY3MDBcdTY2NUFcdTdFRDNcdTY3NUYgLyBMYXRlc3QgZmluaXNoXCIpLnNldERlc2MoXCJcdTUzRUZcdTkwMDkgLyBPcHRpb25hbC5cIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dFxuICAgICAgLnNldFZhbHVlKHRoaXMuZW5kVGltZSkuc2V0UGxhY2Vob2xkZXIoXCIyMTowMFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLmVuZFRpbWUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU0RUZCXHU1MkExXHU2MjE2XHU0RjVDXHU0RTFBIC8gVGFza3Mgb3IgaG9tZXdvcmtcIikuc2V0RGVzYyhcIlx1NTg2Qlx1NTE5OVx1NzlEMVx1NzZFRS9cdTk4NzlcdTc2RUVcdTMwMDFcdTRFRkJcdTUyQTFcdTkxQ0ZcdTMwMDFcdTYyMkFcdTZCNjJcdTY1RjZcdTk1RjRcdTU0OENcdTk2NTBcdTUyMzZcdTY3NjFcdTRFRjZcdTMwMDJcIik7XG4gICAgY29uc3Qgc291cmNlQmFyID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItc291cmNlXCIgfSk7XG4gICAgY29uc3Qgc291cmNlTGFiZWwgPSBzb3VyY2VCYXIuY3JlYXRlU3Bhbih7IHRleHQ6IFwiXHU2NzY1XHU2RTkwIC8gU291cmNlOiBcdTYyNEJcdTUyQThcdThGOTNcdTUxNjUgLyBtYW51YWwgaW5wdXRcIiB9KTtcbiAgICBjb25zdCB1c2VBY3RpdmVCdXR0b24gPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NEY3Rlx1NzUyOFx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMCAvIFVzZSBjdXJyZW50IG5vdGVcIiB9KTtcbiAgICBjb25zdCBjaG9vc2VCdXR0b24gPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiIH0pO1xuICAgIGNvbnN0IGFyZWEgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInRleHRhcmVhXCIsIHsgY2xzOiBcImFpLXBsYW5uZXItaW5wdXRcIiB9KTtcbiAgICBhcmVhLnJvd3MgPSA4O1xuICAgIGFyZWEucGxhY2Vob2xkZXIgPSBcIkV4YW1wbGU6IE1hdGggd29ya2Jvb2sgcGFnZXMgMTItMTQ7IG1lbW9yaXplIDIwIEVuZ2xpc2ggd29yZHM7IENoaW5lc2UgcmVhZGluZyBhbG91ZC5cIjtcbiAgICBhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLmlucHV0ID0gYXJlYS52YWx1ZSk7XG4gICAgY29uc3QgbG9hZFNvdXJjZSA9IGFzeW5jIChmaWxlOiBURmlsZSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICB0aGlzLmlucHV0ID0gY29udGVudDtcbiAgICAgIGFyZWEudmFsdWUgPSBjb250ZW50O1xuICAgICAgc291cmNlTGFiZWwuc2V0VGV4dChgXHU2NzY1XHU2RTkwIC8gU291cmNlOiAke2ZpbGUucGF0aH1gKTtcbiAgICB9O1xuICAgIHVzZUFjdGl2ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgYWN0aXZlRmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICBpZiAoIWFjdGl2ZUZpbGUgfHwgYWN0aXZlRmlsZS5leHRlbnNpb24gIT09IFwibWRcIikgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkEgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gT3BlbiBhIE1hcmtkb3duIG5vdGUgZmlyc3QuXCIpO1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShhY3RpdmVGaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGUgY3VycmVudCBub3RlLlwiKTsgfVxuICAgIH0pO1xuICAgIGNob29zZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gbmV3IE1hcmtkb3duRmlsZVBpY2tlck1vZGFsKHRoaXMuYXBwLCBhc3luYyBmaWxlID0+IHtcbiAgICAgIHRyeSB7IGF3YWl0IGxvYWRTb3VyY2UoZmlsZSk7IH0gY2F0Y2ggeyBuZXcgTm90aWNlKFwiQ291bGQgbm90IHJlYWQgdGhhdCBub3RlLlwiKTsgfVxuICAgIH0pLm9wZW4oKSk7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGFsLWJ1dHRvbi1jb250YWluZXJcIiB9KTtcbiAgICBjb25zdCBidXR0b24gPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5pbnB1dC50cmltKCkpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU4MUYzXHU1QzExXHU1ODZCXHU1MTk5XHU0RTAwXHU5ODc5XHU0RUZCXHU1MkExIC8gRW50ZXIgYXQgbGVhc3Qgb25lIHRhc2sgZmlyc3QuXCIpO1xuICAgICAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGJ1dHRvbi5zZXRUZXh0KFwiXHU2QjYzXHU1NzI4XHU3NTFGXHU2MjEwIC8gR2VuZXJhdGluZy4uLlwiKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBsYW4gPSBhd2FpdCB0aGlzLnBsdWdpbi5nZW5lcmF0ZVBsYW4odGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMuc3RhcnRUaW1lLCB0aGlzLmVuZFRpbWUsIHRoaXMuaW5wdXQpO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICAgIG5ldyBQbGFuUHJldmlld01vZGFsKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgdGhpcy5tb2RlLCB0aGlzLmRhdGUsIHBsYW4pLm9wZW4oKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkNvdWxkIG5vdCBnZW5lcmF0ZSBwbGFuLlwiKTtcbiAgICAgICAgYnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGJ1dHRvbi5zZXRUZXh0KFwiXHU3NTFGXHU2MjEwXHU5ODg0XHU4OUM4IC8gR2VuZXJhdGUgcHJldmlld1wiKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5jbGFzcyBNYXJrZG93bkZpbGVQaWNrZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBxdWVyeSA9IFwiXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgZmlsZXM6IFRGaWxlW107XG4gIHByaXZhdGUgcmVzdWx0c0VsOiBIVE1MRWxlbWVudDtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBvbkNob29zZTogKGZpbGU6IFRGaWxlKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPikge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy5maWxlcyA9IGFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XG4gICAgdGhpcy5yZXN1bHRzRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIiwgXCJhaS1wbGFubmVyLWZpbGUtcGlja2VyXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiXHU5MDA5XHU2MkU5IE1hcmtkb3duIFx1N0IxNFx1OEJCMCAvIENob29zZSBub3RlXCIpO1xuICAgIGNvbnN0IHNlYXJjaCA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyB0eXBlOiBcInNlYXJjaFwiLCBwbGFjZWhvbGRlcjogXCJcdTY0MUNcdTdEMjJcdTdCMTRcdThCQjAgLyBTZWFyY2ggbm90ZXMuLi5cIiwgY2xzOiBcImFpLXBsYW5uZXItZmlsZS1zZWFyY2hcIiB9KTtcbiAgICBzZWFyY2guYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHsgdGhpcy5xdWVyeSA9IHNlYXJjaC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgdGhpcy5yZW5kZXJSZXN1bHRzKCk7IH0pO1xuICAgIHRoaXMucmVzdWx0c0VsID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItZmlsZS1yZXN1bHRzXCIgfSk7XG4gICAgdGhpcy5yZW5kZXJSZXN1bHRzKCk7XG4gICAgc2VhcmNoLmZvY3VzKCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlclJlc3VsdHMoKTogdm9pZCB7XG4gICAgdGhpcy5yZXN1bHRzRWwuZW1wdHkoKTtcbiAgICBjb25zdCBtYXRjaGVzID0gdGhpcy5maWxlcy5maWx0ZXIoZmlsZSA9PiBmaWxlLnBhdGgudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0aGlzLnF1ZXJ5KSkuc2xpY2UoMCwgMTAwKTtcbiAgICBpZiAoIW1hdGNoZXMubGVuZ3RoKSB7IHRoaXMucmVzdWx0c0VsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiTm8gTWFya2Rvd24gbm90ZXMgZm91bmQuXCIgfSk7IHJldHVybjsgfVxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBtYXRjaGVzKSB7XG4gICAgICBjb25zdCBidXR0b24gPSB0aGlzLnJlc3VsdHNFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJhaS1wbGFubmVyLWZpbGUtaXRlbVwiIH0pO1xuICAgICAgYnV0dG9uLmNyZWF0ZUVsKFwic3Ryb25nXCIsIHsgdGV4dDogZmlsZS5iYXNlbmFtZSB9KTtcbiAgICAgIGJ1dHRvbi5jcmVhdGVFbChcInNtYWxsXCIsIHsgdGV4dDogZmlsZS5wYXRoIH0pO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7IGF3YWl0IHRoaXMub25DaG9vc2UoZmlsZSk7IHRoaXMuY2xvc2UoKTsgfSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIFBsYW5QcmV2aWV3TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luLCBwcml2YXRlIHJlYWRvbmx5IG1vZGU6IFBsYW5Nb2RlLCBwcml2YXRlIHJlYWRvbmx5IGRhdGU6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSBwbGFuOiBQbGFuUmVzdWx0KSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dCh0aGlzLnBsYW4udGl0bGUgfHwgXCJQbGFuIHByZXZpZXdcIik7XG4gICAgaWYgKHRoaXMucGxhbi5zdW1tYXJ5KSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiB0aGlzLnBsYW4uc3VtbWFyeSB9KTtcbiAgICByZW5kZXJQcmV2aWV3VGFza3ModGhpcy5jb250ZW50RWwsIFwiUGxhblwiLCB0aGlzLnBsYW4udGFza3MpO1xuICAgIGlmICh0aGlzLm1vZGUgPT09IFwic3R1ZHlcIikgcmVuZGVyUHJldmlld1Rhc2tzKHRoaXMuY29udGVudEVsLCBcIlJldmlld1wiLCB0aGlzLnBsYW4ucmV2aWV3VGFza3MgPz8gW10pO1xuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJtb2RhbC1idXR0b24tY29udGFpbmVyXCIgfSk7XG4gICAgYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDYW5jZWxcIiB9KS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIldyaXRlIHBsYW5cIiwgY2xzOiBcIm1vZC1jdGFcIiB9KS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGF3YWl0IHRoaXMucGx1Z2luLndyaXRlUGxhbih0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgdGhpcy5wbGFuKTtcbiAgICAgICAgbmV3IE5vdGljZShgUGxhbiB3cml0dGVuOiAke3BhdGh9YCk7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkNvdWxkIG5vdCB3cml0ZSBwbGFuLlwiKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5jbGFzcyBBSVBsYW5uZXJTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCwgcGx1Z2luKTsgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgdGhpcy5jb250YWluZXJFbC5lbXB0eSgpO1xuICAgIHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQUkgUGxhbm5lciBcdThCQkVcdTdGNkUgLyBTZXR0aW5nc1wiIH0pO1xuICAgIHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJDbGF1ZGUgXHU0RTBFIEdlbWluaSBcdTRGN0ZcdTc1MjhcdTUzOUZcdTc1MUZcdTYzQTVcdTUzRTNcdUZGMUJcdTUxNzZcdTVCODNcdTk4ODRcdThCQkVcdTRGN0ZcdTc1MjggT3BlbkFJLWNvbXBhdGlibGUgXHU2M0E1XHU1M0UzXHUzMDAyQ2xhdWRlIGFuZCBHZW1pbmkgdXNlIG5hdGl2ZSBBUEkgZm9ybWF0cy5cIiB9KTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU3NTRDXHU5NzYyXHU4QkVEXHU4QTAwIC8gSW50ZXJmYWNlIGxhbmd1YWdlXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IGRyb3Bkb3duXG4gICAgICAuYWRkT3B0aW9uKFwiYXV0b1wiLCBcIlx1OERERlx1OTY4Rlx1N0NGQlx1N0VERiAvIEZvbGxvdyBzeXN0ZW1cIilcbiAgICAgIC5hZGRPcHRpb24oXCJ6aFwiLCBcIlx1NEUyRFx1NjU4N1wiKVxuICAgICAgLmFkZE9wdGlvbihcImVuXCIsIFwiRW5nbGlzaFwiKVxuICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmludGVyZmFjZUxhbmd1YWdlKVxuICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaW50ZXJmYWNlTGFuZ3VhZ2UgPSB2YWx1ZSBhcyBJbnRlcmZhY2VMYW5ndWFnZTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2NzBEXHU1MkExXHU1NTQ2XHU5ODg0XHU4QkJFIC8gUHJvdmlkZXIgcHJlc2V0XCIpLnNldERlc2MoXCJcdTkwMDlcdTYyRTlcdTU0MEVcdTRGMUFcdTU4NkJcdTUxNjVcdTYzQThcdTgzNTBcdTU3MzBcdTU3NDBcdTRFMEVcdTZBMjFcdTU3OEJcdUZGMENcdTUzRUZcdTdFRTdcdTdFRURcdTYyNEJcdTUyQThcdTRGRUVcdTY1MzlcdTMwMDJcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4ge1xuICAgICAgZm9yIChjb25zdCBbaWQsIHByZXNldF0gb2YgT2JqZWN0LmVudHJpZXMoUFJPVklERVJTKSkgZHJvcGRvd24uYWRkT3B0aW9uKGlkLCBwcmVzZXQubGFiZWwpO1xuICAgICAgZHJvcGRvd24uc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSB2YWx1ZSBhcyBQcm92aWRlcklkO1xuICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgICAgICBpZiAocHJvdmlkZXIgIT09IFwiY3VzdG9tXCIpIHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsID0gUFJPVklERVJTW3Byb3ZpZGVyXS5iYXNlVXJsO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLm1vZGVsID0gUFJPVklERVJTW3Byb3ZpZGVyXS5tb2RlbDtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiQVBJIFx1NTczMFx1NTc0MCAvIEFQSSBiYXNlIFVSTFwiLCBcIlx1NEY4Qlx1NTk4MiAvIEV4YW1wbGU6IGh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjFcIiwgXCJhcGlCYXNlVXJsXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJBUEkgXHU1QkM2XHU5NEE1IC8gQVBJIGtleVwiKS5zZXREZXNjKFwiU3RvcmVkIGluIHRoaXMgcGx1Z2luJ3MgZGF0YS5qc29uLlwiKS5hZGRUZXh0KGlucHV0ID0+IHtcbiAgICAgIGlucHV0LnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmFwaUtleSkuc2V0UGxhY2Vob2xkZXIoXCJzay0uLi5cIik7XG4gICAgICBpbnB1dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG4gICAgICBpbnB1dC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmFwaUtleSA9IHZhbHVlOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSk7XG4gICAgfSk7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1NkEyMVx1NTc4QiAvIE1vZGVsXCIsIFwiXHU0RjhCXHU1OTgyIC8gRXhhbXBsZTogZ3B0LTQuMS1taW5pLCBkZWVwc2Vlay1jaGF0LCBnbG0tNC1mbGFzaFwiLCBcIm1vZGVsXCIpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTgxRUFcdTVCOUFcdTRFNDlcdThCRjdcdTZDNDJcdTU5MzQgLyBDdXN0b20gaGVhZGVyc1wiLCBcIkpTT04gb2JqZWN0LCBvcHRpb25hbC5cIiwgXCJjdXN0b21IZWFkZXJzXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTZFMjlcdTVFQTYgLyBUZW1wZXJhdHVyZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy50ZW1wZXJhdHVyZSkpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MudGVtcGVyYXR1cmUgPSBOdW1iZXIodmFsdWUpIHx8IDA7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NjcwMFx1NTkyN1x1OEY5M1x1NTFGQVx1OTU3Rlx1NUVBNiAvIE1heCBvdXRwdXQgdG9rZW5zXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLm1heFRva2VucykpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MubWF4VG9rZW5zID0gTnVtYmVyKHZhbHVlKSB8fCBERUZBVUxUX1NFVFRJTkdTLm1heFRva2VuczsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU1Mzg2XHU1M0YyXHU2ODIxXHU1MUM2XHU1OTI5XHU2NTcwIC8gSGlzdG9yeSBkYXlzXCIpLnNldERlc2MoXCJcdTc1MUZcdTYyMTBcdThCQTFcdTUyMTJcdTY1RjZcdThCRkJcdTUzRDZcdThGRDFcdTY3MUZcdTc3MUZcdTVCOUVcdTc1MjhcdTY1RjZcdUZGMENcdTVFRkFcdThCQUUgNy0zMCBcdTU5MjlcdTMwMDJcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaGlzdG9yeURheXMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzID0gTWF0aC5tYXgoMSwgTnVtYmVyKHZhbHVlKSB8fCBERUZBVUxUX1NFVFRJTkdTLmhpc3RvcnlEYXlzKTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU5RUQ4XHU4QkE0XHU0RTEzXHU2Q0U4XHU1MjA2XHU5NDlGIC8gRGVmYXVsdCBmb2N1cyBtaW51dGVzXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlcykpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW51dGVzID0gTWF0aC5tYXgoMSwgTnVtYmVyKHZhbHVlKSB8fCBERUZBVUxUX1NFVFRJTkdTLmZvY3VzTWludXRlcyk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1NUI2Nlx1NEU2MFx1OEY5M1x1NTFGQVx1NzZFRVx1NUY1NSAvIFN0dWR5IG91dHB1dCBmb2xkZXJcIiwgXCJWYXVsdC1yZWxhdGl2ZSBwYXRoLlwiLCBcInN0dWR5Rm9sZGVyXCIpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTVERTVcdTRGNUNcdThGOTNcdTUxRkFcdTc2RUVcdTVGNTUgLyBXb3JrIG91dHB1dCBmb2xkZXJcIiwgXCJWYXVsdC1yZWxhdGl2ZSBwYXRoLlwiLCBcIndvcmtGb2xkZXJcIik7XG4gIH1cblxuICBwcml2YXRlIHRleHRTZXR0aW5nKG5hbWU6IHN0cmluZywgZGVzYzogc3RyaW5nLCBrZXk6IFwiYXBpQmFzZVVybFwiIHwgXCJtb2RlbFwiIHwgXCJjdXN0b21IZWFkZXJzXCIgfCBcInN0dWR5Rm9sZGVyXCIgfCBcIndvcmtGb2xkZXJcIik6IHZvaWQge1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUobmFtZSkuc2V0RGVzYyhkZXNjKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzW2tleV0pLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3Nba2V5XSA9IHZhbHVlLnRyaW0oKTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJzZVBsYW4oY29udGVudDogc3RyaW5nKTogUGxhblJlc3VsdCB7XG4gIGNvbnN0IGpzb24gPSBjb250ZW50LnRyaW0oKS5yZXBsYWNlKC9eYGBgKD86anNvbik/XFxzKi9pLCBcIlwiKS5yZXBsYWNlKC9cXHMqYGBgJC8sIFwiXCIpO1xuICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb24pIGFzIFBsYW5SZXN1bHQ7XG4gIGlmICghcGFyc2VkLnRpdGxlIHx8ICFBcnJheS5pc0FycmF5KHBhcnNlZC50YXNrcykpIHRocm93IG5ldyBFcnJvcihcIlRoZSBtb2RlbCByZXR1cm5lZCBhbiBpbnZhbGlkIHBsYW4gZm9ybWF0LlwiKTtcbiAgcGFyc2VkLnRhc2tzID0gcGFyc2VkLnRhc2tzLm1hcChub3JtYWxpemVUYXNrKS5maWx0ZXIoQm9vbGVhbikgYXMgUGxhblRhc2tbXTtcbiAgcGFyc2VkLnJldmlld1Rhc2tzID0gQXJyYXkuaXNBcnJheShwYXJzZWQucmV2aWV3VGFza3MpID8gcGFyc2VkLnJldmlld1Rhc2tzLm1hcChub3JtYWxpemVUYXNrKS5maWx0ZXIoQm9vbGVhbikgYXMgUGxhblRhc2tbXSA6IFtdO1xuICBpZiAoIXBhcnNlZC50YXNrcy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcihcIlRoZSBtb2RlbCBkaWQgbm90IHJldHVybiBhbnkgdGFza3MuXCIpO1xuICByZXR1cm4gcGFyc2VkO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVUYXNrKHZhbHVlOiB1bmtub3duKTogUGxhblRhc2sgfCBudWxsIHtcbiAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09IFwib2JqZWN0XCIpIHJldHVybiBudWxsO1xuICBjb25zdCB0YXNrID0gdmFsdWUgYXMgUGFydGlhbDxQbGFuVGFzaz47XG4gIGlmICghdGFzay50aXRsZSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7IHRpdGxlOiBTdHJpbmcodGFzay50aXRsZSksIGNhdGVnb3J5OiB0YXNrLmNhdGVnb3J5ID8gU3RyaW5nKHRhc2suY2F0ZWdvcnkpIDogXCJcIiwgc3RhcnRUaW1lOiB0YXNrLnN0YXJ0VGltZSA/IFN0cmluZyh0YXNrLnN0YXJ0VGltZSkgOiBcIlwiLCBlbmRUaW1lOiB0YXNrLmVuZFRpbWUgPyBTdHJpbmcodGFzay5lbmRUaW1lKSA6IFwiXCIsIGVzdGltYXRlZE1pbnV0ZXM6IE1hdGgubWF4KDEsIE51bWJlcih0YXNrLmVzdGltYXRlZE1pbnV0ZXMpIHx8IDMwKSwgZGVzY3JpcHRpb246IHRhc2suZGVzY3JpcHRpb24gPyBTdHJpbmcodGFzay5kZXNjcmlwdGlvbikgOiBcIlwiIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlclBsYW4obW9kZTogUGxhbk1vZGUsIGRhdGU6IHN0cmluZywgcGxhbjogUGxhblJlc3VsdCk6IHN0cmluZyB7XG4gIGNvbnN0IGFsbFRhc2tzID0gWy4uLnBsYW4udGFza3MsIC4uLihwbGFuLnJldmlld1Rhc2tzID8/IFtdKV07XG4gIGNvbnN0IGZyb250bWF0dGVyID0gYWxsVGFza3MuZmxhdE1hcCgodGFzaywgaW5kZXgpID0+IHtcbiAgICBjb25zdCBpZCA9IGB0YXNrJHtTdHJpbmcoaW5kZXggKyAxKS5wYWRTdGFydCgyLCBcIjBcIil9YDtcbiAgICByZXR1cm4gW2Ake2lkfU5hbWU6ICR7eWFtbFF1b3RlKHRhc2sudGl0bGUpfWAsIGAke2lkfUNhdGVnb3J5OiAke3lhbWxRdW90ZSh0YXNrLmNhdGVnb3J5IHx8IFwiXHU1MTc2XHU1QjgzXCIpfWAsIGAke2lkfUVzdGltYXRlZE1pbnV0ZXM6ICR7dGFzay5lc3RpbWF0ZWRNaW51dGVzfWAsIGAke2lkfUFjdHVhbFN0YXJ0OmAsIGAke2lkfUFjdHVhbEVuZDpgLCBgJHtpZH1BY3R1YWxNaW51dGVzOiAwYCwgYCR7aWR9Rm9jdXNTZXNzaW9uczogMGBdO1xuICB9KTtcbiAgY29uc3QgdGFza0NhcmRzID0gKGxhYmVsOiBzdHJpbmcsIHRhc2tzOiBQbGFuVGFza1tdLCBvZmZzZXQ6IG51bWJlcikgPT4gdGFza3MubGVuZ3RoID8gYCMjICR7bGFiZWx9XFxuXFxuJHt0YXNrcy5tYXAoKHRhc2ssIGluZGV4KSA9PiByZW5kZXJUYXNrKHRhc2ssIGRhdGUsIG9mZnNldCArIGluZGV4ICsgMSkpLmpvaW4oXCJcXG5cXG5cIil9YCA6IGAjIyAke2xhYmVsfVxcblxcblx1NjY4Mlx1NjVFMFx1NUI4OVx1NjM5Mlx1MzAwMmA7XG4gIHJldHVybiBgLS0tXFxudHlwZTogJHttb2RlID09PSBcInN0dWR5XCIgPyBcIlx1NkJDRlx1NjVFNVx1NEY1Q1x1NEUxQVx1OEJBMVx1NTIxMlwiIDogXCJcdTZCQ0ZcdTY1RTVcdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcIn1cXG5wbGFuRGF0ZTogJHtkYXRlfVxcbnRhZ3M6XFxuICAtIEFJXHU4QkExXHU1MjEyXFxuJHtmcm9udG1hdHRlci5qb2luKFwiXFxuXCIpfVxcbi0tLVxcblxcbiMgJHtwbGFuLnRpdGxlfVxcblxcbj4gWyFhYnN0cmFjdF0gXHU2OTgyXHU4OUM4XFxuPiAke3BsYW4uc3VtbWFyeSB8fCBcIlx1NzUzMSBBSSBQbGFubmVyIFx1NzUxRlx1NjIxMFx1RkYwQ1x1NjI2N1x1ODg0Q1x1NTQwRVx1NTg2Qlx1NTE5OVx1NkJDRlx1OTg3OVx1NUI5RVx1OTY0NVx1NUYwMFx1NTlDQlx1NTQ4Q1x1NUI4Q1x1NjIxMFx1NjVGNlx1OTVGNFx1MzAwMlwifVxcblxcbiR7dGFza0NhcmRzKG1vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU0RjVDXHU0RTFBXHU4QkExXHU1MjEyXHU4ODY4XCIgOiBcIlx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlx1ODg2OFwiLCBwbGFuLnRhc2tzLCAwKX1cXG5cXG4ke21vZGUgPT09IFwic3R1ZHlcIiA/IHRhc2tDYXJkcyhcIlx1NTkwRFx1NEU2MFx1OEJBMVx1NTIxMlx1ODg2OFwiLCBwbGFuLnJldmlld1Rhc2tzID8/IFtdLCBwbGFuLnRhc2tzLmxlbmd0aCkgOiBcIlwifVxcbmA7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRhc2sodGFzazogUGxhblRhc2ssIGRhdGU6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IHByZWZpeCA9IHRhc2suY2F0ZWdvcnkgPyBgJHt0YXNrLmNhdGVnb3J5fSBcdTAwQjcgYCA6IFwiXCI7XG4gIGNvbnN0IHRpbWUgPSB0YXNrLnN0YXJ0VGltZSAmJiB0YXNrLmVuZFRpbWUgPyBgJHt0YXNrLnN0YXJ0VGltZX0tJHt0YXNrLmVuZFRpbWV9YCA6IFwiXHU1Rjg1XHU1Qjg5XHU2MzkyXCI7XG4gIGNvbnN0IG5vdGUgPSB0YXNrLmRlc2NyaXB0aW9uID8gYFxcbj4gJHt0YXNrLmRlc2NyaXB0aW9ufWAgOiBcIlwiO1xuICByZXR1cm4gYD4gWyF0b2RvXSsgJHtwcmVmaXh9JHt0YXNrLnRpdGxlfVxcbj4gXHU2NUY2XHU2QkI1XHVGRjFBJHt0aW1lfSBcdTAwQjcgJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXN9IFx1NTIwNlx1OTQ5Rlxcbj4gXHU1QjlFXHU5NjQ1XHU1RjAwXHU1OUNCXHVGRjFBX19fXyBcdTAwQjcgXHU1QjlFXHU5NjQ1XHU1QjhDXHU2MjEwXHVGRjFBX19fXyR7bm90ZX1cXG4+IC0gWyBdICR7dGFzay50aXRsZX0gXHVEODNEXHVEQ0M1ICR7ZGF0ZX0gI1x1OEJBMVx1NTIxMmA7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclByZXZpZXdUYXNrcyhwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCB0YXNrczogUGxhblRhc2tbXSk6IHZvaWQge1xuICBwYXJlbnQuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IGxhYmVsIH0pO1xuICBpZiAoIXRhc2tzLmxlbmd0aCkgeyBwYXJlbnQuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJOb25lXCIgfSk7IHJldHVybjsgfVxuICBjb25zdCBsaXN0ID0gcGFyZW50LmNyZWF0ZUVsKFwidWxcIik7XG4gIGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykgbGlzdC5jcmVhdGVFbChcImxpXCIsIHsgdGV4dDogYCR7dGFzay5zdGFydFRpbWUgfHwgXCJcIn0ke3Rhc2suZW5kVGltZSA/IGAtJHt0YXNrLmVuZFRpbWV9YCA6IFwiXCJ9ICR7dGFzay50aXRsZX0gKCR7dGFzay5lc3RpbWF0ZWRNaW51dGVzfSBtaW4pYC50cmltKCkgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZUZvbGRlcihhcHA6IEFwcCwgZm9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcGFydHMgPSBub3JtYWxpemVQYXRoKGZvbGRlcikuc3BsaXQoXCIvXCIpLmZpbHRlcihCb29sZWFuKTtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPD0gcGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwYXRoID0gcGFydHMuc2xpY2UoMCwgaSkuam9pbihcIi9cIik7XG4gICAgaWYgKCFhcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpKSBhd2FpdCBhcHAudmF1bHQuY3JlYXRlRm9sZGVyKHBhdGgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNhZmVGaWxlbmFtZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHsgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XS9nLCBcIi1cIikudHJpbSgpLnNsaWNlKDAsIDgwKSB8fCBcIkFJXHU4QkExXHU1MjEyXCI7IH1cbmZ1bmN0aW9uIHlhbWxRdW90ZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTsgfVxuZnVuY3Rpb24gdGltZU9mRGF5KGRhdGU6IERhdGUpOiBzdHJpbmcgeyByZXR1cm4gYCR7U3RyaW5nKGRhdGUuZ2V0SG91cnMoKSkucGFkU3RhcnQoMiwgXCIwXCIpfToke1N0cmluZyhkYXRlLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgXCIwXCIpfWA7IH1cbmZ1bmN0aW9uIGZvcm1hdER1cmF0aW9uKG1pbGxpc2Vjb25kczogbnVtYmVyKTogc3RyaW5nIHsgY29uc3QgdG90YWwgPSBNYXRoLmNlaWwobWlsbGlzZWNvbmRzIC8gMTAwMCk7IHJldHVybiBgJHtTdHJpbmcoTWF0aC5mbG9vcih0b3RhbCAvIDYwKSkucGFkU3RhcnQoMiwgXCIwXCIpfToke1N0cmluZyh0b3RhbCAlIDYwKS5wYWRTdGFydCgyLCBcIjBcIil9YDsgfVxuZnVuY3Rpb24gbG9jYWxEYXRlKCk6IHN0cmluZyB7IGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7IGNvbnN0IG9mZnNldCA9IG5vdy5nZXRUaW1lem9uZU9mZnNldCgpICogNjAwMDA7IHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpIC0gb2Zmc2V0KS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTsgfVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsc0JBQXdHO0FBa0R4RyxJQUFNLG1CQUFvQztBQUFBLEVBQ3hDLFVBQVU7QUFBQSxFQUNWLG1CQUFtQjtBQUFBLEVBQ25CLFlBQVk7QUFBQSxFQUNaLFFBQVE7QUFBQSxFQUNSLE9BQU87QUFBQSxFQUNQLGVBQWU7QUFBQSxFQUNmLGFBQWE7QUFBQSxFQUNiLFdBQVc7QUFBQSxFQUNYLGFBQWE7QUFBQSxFQUNiLGNBQWM7QUFBQSxFQUNkLGFBQWE7QUFBQSxFQUNiLFlBQVk7QUFDZDtBQUVBLElBQU0sWUFBbUY7QUFBQSxFQUN2RixRQUFRLEVBQUUsT0FBTyx5RUFBc0MsU0FB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
