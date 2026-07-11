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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgTW9kYWwsIE5vdGljZSwgUGx1Z2luLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nLCBURmlsZSwgbm9ybWFsaXplUGF0aCwgcmVxdWVzdFVybCB9IGZyb20gXCJvYnNpZGlhblwiO1xuXG50eXBlIFBsYW5Nb2RlID0gXCJzdHVkeVwiIHwgXCJ3b3JrXCI7XG50eXBlIFByb3ZpZGVySWQgPSBcImN1c3RvbVwiIHwgXCJvcGVuYWlcIiB8IFwiY2xhdWRlXCIgfCBcImRlZXBzZWVrXCIgfCBcImdsbVwiIHwgXCJraW1pXCIgfCBcImdlbWluaVwiO1xudHlwZSBJbnRlcmZhY2VMYW5ndWFnZSA9IFwiYXV0b1wiIHwgXCJ6aFwiIHwgXCJlblwiO1xuXG5pbnRlcmZhY2UgUGxhbm5lclNldHRpbmdzIHtcbiAgcHJvdmlkZXI6IFByb3ZpZGVySWQ7XG4gIGludGVyZmFjZUxhbmd1YWdlOiBJbnRlcmZhY2VMYW5ndWFnZTtcbiAgYXBpQmFzZVVybDogc3RyaW5nO1xuICBhcGlLZXk6IHN0cmluZztcbiAgbW9kZWw6IHN0cmluZztcbiAgY3VzdG9tSGVhZGVyczogc3RyaW5nO1xuICB0ZW1wZXJhdHVyZTogbnVtYmVyO1xuICBtYXhUb2tlbnM6IG51bWJlcjtcbiAgaGlzdG9yeURheXM6IG51bWJlcjtcbiAgZm9jdXNNaW51dGVzOiBudW1iZXI7XG4gIHN0dWR5Rm9sZGVyOiBzdHJpbmc7XG4gIHdvcmtGb2xkZXI6IHN0cmluZztcbiAgYWN0aXZlRm9jdXM/OiBBY3RpdmVGb2N1c1Nlc3Npb247XG4gIGZvY3VzTWluaVBvc2l0aW9uPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xufVxuXG5pbnRlcmZhY2UgQWN0aXZlRm9jdXNTZXNzaW9uIHtcbiAgZmlsZVBhdGg6IHN0cmluZztcbiAgdGFza0lkOiBzdHJpbmc7XG4gIHRhc2tOYW1lOiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG4gIGR1cmF0aW9uTXM6IG51bWJlcjtcbiAgZm9jdXNlZE1zOiBudW1iZXI7XG4gIHJ1bm5pbmdBdDogbnVtYmVyIHwgbnVsbDtcbiAgc3RhcnRlZEF0OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQbGFuVGFzayB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNhdGVnb3J5Pzogc3RyaW5nO1xuICBzdGFydFRpbWU/OiBzdHJpbmc7XG4gIGVuZFRpbWU/OiBzdHJpbmc7XG4gIGVzdGltYXRlZE1pbnV0ZXM6IG51bWJlcjtcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBQbGFuUmVzdWx0IHtcbiAgdGl0bGU6IHN0cmluZztcbiAgc3VtbWFyeT86IHN0cmluZztcbiAgdGFza3M6IFBsYW5UYXNrW107XG4gIHJldmlld1Rhc2tzPzogUGxhblRhc2tbXTtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogUGxhbm5lclNldHRpbmdzID0ge1xuICBwcm92aWRlcjogXCJjdXN0b21cIixcbiAgaW50ZXJmYWNlTGFuZ3VhZ2U6IFwiYXV0b1wiLFxuICBhcGlCYXNlVXJsOiBcImh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjFcIixcbiAgYXBpS2V5OiBcIlwiLFxuICBtb2RlbDogXCJncHQtNC4xLW1pbmlcIixcbiAgY3VzdG9tSGVhZGVyczogXCJ7fVwiLFxuICB0ZW1wZXJhdHVyZTogMC4zLFxuICBtYXhUb2tlbnM6IDE4MDAsXG4gIGhpc3RvcnlEYXlzOiAxNCxcbiAgZm9jdXNNaW51dGVzOiAyNSxcbiAgc3R1ZHlGb2xkZXI6IFwiMDZfVG9kby9cdTVCNjZcdTRFNjBcIixcbiAgd29ya0ZvbGRlcjogXCIwMV9cdTk4NzlcdTc2RUUvXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCJcbn07XG5cbmNvbnN0IFBST1ZJREVSUzogUmVjb3JkPFByb3ZpZGVySWQsIHsgbGFiZWw6IHN0cmluZzsgYmFzZVVybDogc3RyaW5nOyBtb2RlbDogc3RyaW5nIH0+ID0ge1xuICBjdXN0b206IHsgbGFiZWw6IFwiQ3VzdG9tIE9wZW5BSS1jb21wYXRpYmxlIC8gXHU4MUVBXHU1QjlBXHU0RTQ5XHU1MTdDXHU1QkI5XHU2M0E1XHU1M0UzXCIsIGJhc2VVcmw6IFwiXCIsIG1vZGVsOiBcIlwiIH0sXG4gIG9wZW5haTogeyBsYWJlbDogXCJPcGVuQUlcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsIG1vZGVsOiBcImdwdC00LjEtbWluaVwiIH0sXG4gIGNsYXVkZTogeyBsYWJlbDogXCJBbnRocm9waWMgQ2xhdWRlXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkuYW50aHJvcGljLmNvbS92MVwiLCBtb2RlbDogXCJjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTRcIiB9LFxuICBkZWVwc2VlazogeyBsYWJlbDogXCJEZWVwU2Vla1wiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLmRlZXBzZWVrLmNvbS92MVwiLCBtb2RlbDogXCJkZWVwc2Vlay1jaGF0XCIgfSxcbiAgZ2xtOiB7IGxhYmVsOiBcIlpoaXB1IEdMTSAvIFx1NjY3QVx1OEMzMVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vb3Blbi5iaWdtb2RlbC5jbi9hcGkvcGFhcy92NFwiLCBtb2RlbDogXCJnbG0tNC1mbGFzaFwiIH0sXG4gIGtpbWk6IHsgbGFiZWw6IFwiS2ltaSAvIE1vb25zaG90XCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkubW9vbnNob3QuY24vdjFcIiwgbW9kZWw6IFwibW9vbnNob3QtdjEtOGtcIiB9LFxuICBnZW1pbmk6IHsgbGFiZWw6IFwiR29vZ2xlIEdlbWluaVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vZ2VuZXJhdGl2ZWxhbmd1YWdlLmdvb2dsZWFwaXMuY29tL3YxYmV0YVwiLCBtb2RlbDogXCJnZW1pbmktMi4wLWZsYXNoXCIgfVxufTtcblxuYXN5bmMgZnVuY3Rpb24gcmVxdWVzdFBsYW5Db21wbGV0aW9uKFxuICBzZXR0aW5nczogUGxhbm5lclNldHRpbmdzLFxuICBiYXNlVXJsOiBzdHJpbmcsXG4gIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG4gIHN5c3RlbTogc3RyaW5nLFxuICB1c2VyOiBzdHJpbmdcbik6IFByb21pc2U8QXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiByZXF1ZXN0VXJsPj4+IHtcbiAgaWYgKHNldHRpbmdzLnByb3ZpZGVyID09PSBcImNsYXVkZVwiKSB7XG4gICAgaWYgKHNldHRpbmdzLmFwaUtleSkgaGVhZGVyc1tcIngtYXBpLWtleVwiXSA9IHNldHRpbmdzLmFwaUtleTtcbiAgICBoZWFkZXJzW1wiYW50aHJvcGljLXZlcnNpb25cIl0gPz89IFwiMjAyMy0wNi0wMVwiO1xuICAgIHJldHVybiByZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogYCR7YmFzZVVybH0vbWVzc2FnZXNgLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogc2V0dGluZ3MubW9kZWwsIG1heF90b2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBzeXN0ZW0sIG1lc3NhZ2VzOiBbeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogdXNlciB9XSB9KSwgdGhyb3c6IGZhbHNlXG4gICAgfSk7XG4gIH1cbiAgaWYgKHNldHRpbmdzLnByb3ZpZGVyID09PSBcImdlbWluaVwiKSB7XG4gICAgY29uc3Qga2V5ID0gc2V0dGluZ3MuYXBpS2V5ID8gYD9rZXk9JHtlbmNvZGVVUklDb21wb25lbnQoc2V0dGluZ3MuYXBpS2V5KX1gIDogXCJcIjtcbiAgICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGAke2Jhc2VVcmx9L21vZGVscy8ke2VuY29kZVVSSUNvbXBvbmVudChzZXR0aW5ncy5tb2RlbCl9OmdlbmVyYXRlQ29udGVudCR7a2V5fWAsIG1ldGhvZDogXCJQT1NUXCIsIGhlYWRlcnMsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN5c3RlbUluc3RydWN0aW9uOiB7IHBhcnRzOiBbeyB0ZXh0OiBzeXN0ZW0gfV0gfSwgY29udGVudHM6IFt7IHJvbGU6IFwidXNlclwiLCBwYXJ0czogW3sgdGV4dDogdXNlciB9XSB9XSwgZ2VuZXJhdGlvbkNvbmZpZzogeyB0ZW1wZXJhdHVyZTogc2V0dGluZ3MudGVtcGVyYXR1cmUsIG1heE91dHB1dFRva2Vuczogc2V0dGluZ3MubWF4VG9rZW5zLCByZXNwb25zZU1pbWVUeXBlOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9IH0pLCB0aHJvdzogZmFsc2VcbiAgICB9KTtcbiAgfVxuICBpZiAoc2V0dGluZ3MuYXBpS2V5KSBoZWFkZXJzLkF1dGhvcml6YXRpb24gPSBgQmVhcmVyICR7c2V0dGluZ3MuYXBpS2V5fWA7XG4gIHJldHVybiByZXF1ZXN0VXJsKHtcbiAgICB1cmw6IGAke2Jhc2VVcmx9L2NoYXQvY29tcGxldGlvbnNgLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6IHNldHRpbmdzLm1vZGVsLCB0ZW1wZXJhdHVyZTogc2V0dGluZ3MudGVtcGVyYXR1cmUsIG1heF90b2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgbWVzc2FnZXM6IFt7IHJvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IHN5c3RlbSB9LCB7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiB1c2VyIH1dIH0pLCB0aHJvdzogZmFsc2VcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRpb25UZXh0KHByb3ZpZGVyOiBQcm92aWRlcklkLCByZXNwb25zZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IGpzb24gPSByZXNwb25zZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgaWYgKHByb3ZpZGVyID09PSBcImNsYXVkZVwiKSB7XG4gICAgY29uc3QgY29udGVudCA9IGpzb24uY29udGVudCBhcyBBcnJheTx7IHR5cGU/OiBzdHJpbmc7IHRleHQ/OiBzdHJpbmcgfT4gfCB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIGNvbnRlbnQ/LmZpbHRlcihwYXJ0ID0+IHBhcnQudHlwZSA9PT0gXCJ0ZXh0XCIpLm1hcChwYXJ0ID0+IHBhcnQudGV4dCA/PyBcIlwiKS5qb2luKFwiXCIpO1xuICB9XG4gIGlmIChwcm92aWRlciA9PT0gXCJnZW1pbmlcIikge1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBqc29uLmNhbmRpZGF0ZXMgYXMgQXJyYXk8eyBjb250ZW50PzogeyBwYXJ0cz86IEFycmF5PHsgdGV4dD86IHN0cmluZyB9PiB9IH0+IHwgdW5kZWZpbmVkO1xuICAgIHJldHVybiBjYW5kaWRhdGVzPy5bMF0/LmNvbnRlbnQ/LnBhcnRzPy5tYXAocGFydCA9PiBwYXJ0LnRleHQgPz8gXCJcIikuam9pbihcIlwiKTtcbiAgfVxuICBjb25zdCBjaG9pY2VzID0ganNvbi5jaG9pY2VzIGFzIEFycmF5PHsgbWVzc2FnZT86IHsgY29udGVudD86IHN0cmluZyB9IH0+IHwgdW5kZWZpbmVkO1xuICByZXR1cm4gY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50O1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBBSVBsYW5uZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBwbHVnaW5TZXR0aW5ncyE6IFBsYW5uZXJTZXR0aW5ncztcbiAgcHJpdmF0ZSBmb2N1c1N0YXR1c0VsITogSFRNTEVsZW1lbnQ7XG4gIHByaXZhdGUgZm9jdXNNaW5pRWwhOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgcHJpdmF0ZSBmaW5pc2hpbmdGb2N1cyA9IGZhbHNlO1xuICBwcml2YXRlIGZvY3VzVGltZXJPcGVuID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaURyYWdnaW5nID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaU1vdmVkID0gZmFsc2U7XG4gIHByaXZhdGUgbWluaVN0YXJ0WCA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0WSA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0TGVmdCA9IDA7XG4gIHByaXZhdGUgbWluaVN0YXJ0VG9wID0gMDtcblxuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBBSVBsYW5uZXJTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNyZWF0ZS1haS1wbGFuXCIsXG4gICAgICBuYW1lOiBcIkNyZWF0ZSBBSSBwbGFuXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gbmV3IFBsYW5JbnB1dE1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKClcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJzdGFydC1mb2N1cy1zZXNzaW9uXCIsIG5hbWU6IFwiU3RhcnQgZm9jdXMgc2Vzc2lvblwiLCBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuRm9jdXNGb3JBY3RpdmVOb3RlKCkgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwicmVzdW1lLWZvY3VzLXNlc3Npb25cIiwgbmFtZTogXCJSZXN1bWUgZm9jdXMgc2Vzc2lvblwiLCBjYWxsYmFjazogKCkgPT4gdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpIH0pO1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImNhbGVuZGFyLXBsdXNcIiwgXCJDcmVhdGUgQUkgcGxhblwiLCAoKSA9PiBuZXcgUGxhbklucHV0TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSk7XG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwidGltZXJcIiwgXCJTdGFydCBmb2N1cyBzZXNzaW9uXCIsICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLWZvY3VzLXN0YXR1c1wiKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c1N0YXR1c0VsLCBcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsID0gdGhpcy5hcHAud29ya3NwYWNlLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLW1pbmlcIixcbiAgICAgIGF0dHI6IHsgdHlwZTogXCJidXR0b25cIiwgXCJhcmlhLWxhYmVsXCI6IFwiUmVzdG9yZSBmb2N1cyB0aW1lclwiIH1cbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJjbGlja1wiLCBldmVudCA9PiB7XG4gICAgICBpZiAodGhpcy5taW5pTW92ZWQpIHsgZXZlbnQucHJldmVudERlZmF1bHQoKTsgcmV0dXJuOyB9XG4gICAgICB2b2lkIHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJwb2ludGVyZG93blwiLCBldmVudCA9PiB0aGlzLmJlZ2luTWluaURyYWcoZXZlbnQpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInBvaW50ZXJtb3ZlXCIsIGV2ZW50ID0+IHRoaXMubW92ZU1pbmlEcmFnKGV2ZW50KSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJwb2ludGVydXBcIiwgKCkgPT4gdm9pZCB0aGlzLmVuZE1pbmlEcmFnKCkpO1xuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdGhpcy5mb2N1c01pbmlFbC5yZW1vdmUoKSk7XG4gICAgdGhpcy5yZWdpc3RlckludGVydmFsKHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB2b2lkIHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCksIDUwMCkpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnBsdWdpblNldHRpbmdzKTtcbiAgfVxuXG4gIGdldEFjdGl2ZUZvY3VzKCk6IEFjdGl2ZUZvY3VzU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gIH1cblxuICBzZXRGb2N1c1RpbWVyT3BlbihvcGVuOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5mb2N1c1RpbWVyT3BlbiA9IG9wZW47XG4gICAgdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICB9XG5cbiAgcHJpdmF0ZSBiZWdpbk1pbmlEcmFnKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSB0cnVlO1xuICAgIHRoaXMubWluaU1vdmVkID0gZmFsc2U7XG4gICAgdGhpcy5taW5pU3RhcnRYID0gZXZlbnQuY2xpZW50WDtcbiAgICB0aGlzLm1pbmlTdGFydFkgPSBldmVudC5jbGllbnRZO1xuICAgIHRoaXMubWluaVN0YXJ0TGVmdCA9IHJlY3QubGVmdDtcbiAgICB0aGlzLm1pbmlTdGFydFRvcCA9IHJlY3QudG9wO1xuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlTWluaURyYWcoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5taW5pRHJhZ2dpbmcpIHJldHVybjtcbiAgICBjb25zdCBkeCA9IGV2ZW50LmNsaWVudFggLSB0aGlzLm1pbmlTdGFydFg7XG4gICAgY29uc3QgZHkgPSBldmVudC5jbGllbnRZIC0gdGhpcy5taW5pU3RhcnRZO1xuICAgIGlmICghdGhpcy5taW5pTW92ZWQgJiYgTWF0aC5oeXBvdChkeCwgZHkpIDwgNikgcmV0dXJuO1xuICAgIHRoaXMubWluaU1vdmVkID0gdHJ1ZTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydExlZnQgKyBkeCksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydFRvcCArIGR5KSwgTWF0aC5tYXgoOCwgd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSA4KSk7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUucmlnaHQgPSBcImF1dG9cIjtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmJvdHRvbSA9IFwiYXV0b1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbmRNaW5pRHJhZygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMubWluaURyYWdnaW5nKSByZXR1cm47XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICBpZiAoIXRoaXMubWluaU1vdmVkKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgxLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGgpO1xuICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDEsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KTtcbiAgICB0aGlzLnBsdWdpblNldHRpbmdzLmZvY3VzTWluaVBvc2l0aW9uID0geyB4OiByZWN0LmxlZnQgLyB3aWR0aCwgeTogcmVjdC50b3AgLyBoZWlnaHQgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5taW5pTW92ZWQgPSBmYWxzZTsgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5TWluaVBvc2l0aW9uKCk6IHZvaWQge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbmlQb3NpdGlvbjtcbiAgICBpZiAoIXBvc2l0aW9uKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgbGVmdCA9IE1hdGgubWluKE1hdGgubWF4KDgsIHBvc2l0aW9uLnggKiAod2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoKSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCBwb3NpdGlvbi55ICogKHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gOCkpO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnJpZ2h0ID0gXCJhdXRvXCI7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5ib3R0b20gPSBcImF1dG9cIjtcbiAgfVxuXG4gIGFzeW5jIG9wZW5Gb2N1c0ZvckFjdGl2ZU5vdGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXMpIHtcbiAgICAgIGF3YWl0IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7IG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdThCQTFcdTUyMTJcdTdCMTRcdThCQjAgLyBPcGVuIGEgcGxhbiBub3RlIGZpcnN0LlwiKTsgcmV0dXJuOyB9XG4gICAgY29uc3QgdGFza3MgPSBleHRyYWN0Rm9jdXNUYXNrcyh0aGlzLmFwcCwgZmlsZSk7XG4gICAgaWYgKCF0YXNrcy5sZW5ndGgpIHsgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NkNBMVx1NjcwOVx1NTNFRlx1NEUxM1x1NkNFOFx1NzY4NFx1OEJBMVx1NTIxMlx1NEVGQlx1NTJBMSAvIE5vIHBsYW4gdGFza3MgZm91bmQuXCIpOyByZXR1cm47IH1cbiAgICBuZXcgRm9jdXNUYXNrUGlja2VyTW9kYWwodGhpcy5hcHAsIHRoaXMsIGZpbGUsIHRhc2tzKS5vcGVuKCk7XG4gIH1cblxuICBhc3luYyBzdGFydEZvY3VzKGZpbGU6IFRGaWxlLCB0YXNrOiBGb2N1c1Rhc2ssIG1pbnV0ZXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU1REYyXHU2NzA5XHU4RkRCXHU4ODRDXHU0RTJEXHU3Njg0XHU0RTEzXHU2Q0U4IC8gQSBmb2N1cyBzZXNzaW9uIGlzIGFscmVhZHkgYWN0aXZlLlwiKTtcbiAgICAgIGF3YWl0IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcbiAgICB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzID0ge1xuICAgICAgZmlsZVBhdGg6IGZpbGUucGF0aCxcbiAgICAgIHRhc2tJZDogdGFzay5pZCxcbiAgICAgIHRhc2tOYW1lOiB0YXNrLm5hbWUsXG4gICAgICBjYXRlZ29yeTogdGFzay5jYXRlZ29yeSxcbiAgICAgIGR1cmF0aW9uTXM6IE1hdGgubWF4KDEsIG1pbnV0ZXMpICogNjAwMDAsXG4gICAgICBmb2N1c2VkTXM6IDAsXG4gICAgICBydW5uaW5nQXQ6IHN0YXJ0ZWRBdCxcbiAgICAgIHN0YXJ0ZWRBdFxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvY2Vzc0Zyb250TWF0dGVyKGZpbGUsIGZtID0+IHtcbiAgICAgICAgZm1bYCR7dGFzay5pZH1BY3R1YWxTdGFydGBdID8/PSB0aW1lT2ZEYXkobmV3IERhdGUoc3RhcnRlZEF0KSk7XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTY1RTBcdTZDRDVcdTdBQ0JcdTUzNzNcdTUxOTlcdTUxNjVcdTVGMDBcdTU5Q0JcdTY1RjZcdTk1RjRcdUZGMENcdTVDMDZcdTU3MjhcdTdFRDNcdTY3NUZcdTY1RjZcdTkxQ0RcdThCRDUgLyBDb3VsZCBub3Qgd3JpdGUgdGhlIHN0YXJ0IHRpbWUgeWV0OyBpdCB3aWxsIHJldHJ5IG9uIGZpbmlzaC5cIik7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gICAgbmV3IEZvY3VzVGltZXJNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgdG9nZ2xlRm9jdXNQYXVzZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24pIHJldHVybjtcbiAgICBpZiAoc2Vzc2lvbi5ydW5uaW5nQXQgIT09IG51bGwpIHtcbiAgICAgIHNlc3Npb24uZm9jdXNlZE1zICs9IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBzZXNzaW9uLnJ1bm5pbmdBdCk7XG4gICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlc3Npb24ucnVubmluZ0F0ID0gRGF0ZS5ub3coKTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICB9XG5cbiAgYXN5bmMgcmVzdG9yZUZvY3VzVGltZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChzZXNzaW9uLmZpbGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU2MjdFXHU0RTBEXHU1MjMwXHU1MzlGXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwXHVGRjBDXHU2NUUwXHU2Q0Q1XHU1QjhDXHU2MjEwXHU1NkRFXHU1MTk5IC8gVGhlIHBsYW4gbm90ZSBpcyBtaXNzaW5nLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmV3IEZvY3VzVGltZXJNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgZmluaXNoRm9jdXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uIHx8IHRoaXMuZmluaXNoaW5nRm9jdXMpIHJldHVybjtcbiAgICB0aGlzLmZpbmlzaGluZ0ZvY3VzID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgaWYgKHNlc3Npb24ucnVubmluZ0F0ICE9PSBudWxsKSB7XG4gICAgICAgIHNlc3Npb24uZm9jdXNlZE1zICs9IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBzZXNzaW9uLnJ1bm5pbmdBdCk7XG4gICAgICAgIHNlc3Npb24ucnVubmluZ0F0ID0gbnVsbDtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoc2Vzc2lvbi5maWxlUGF0aCk7XG4gICAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoXCJcdTYyN0VcdTRFMERcdTUyMzBcdTUzOUZcdThCQTFcdTUyMTJcdTdCMTRcdThCQjBcdUZGMENcdTRFMTNcdTZDRThcdThCQjBcdTVGNTVcdTY2ODJcdTY3MkFcdTUxOTlcdTUxNjUgLyBQbGFuIG5vdGUgbWlzc2luZzsgZm9jdXMgcmVjb3JkIHdhcyBrZXB0LlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgYWN0dWFsTWludXRlcyA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoc2Vzc2lvbi5mb2N1c2VkTXMgLyA2MDAwMCkpO1xuICAgICAgYXdhaXQgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvY2Vzc0Zyb250TWF0dGVyKGZpbGUsIGZtID0+IHtcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsU3RhcnRgXSA/Pz0gdGltZU9mRGF5KG5ldyBEYXRlKHNlc3Npb24uc3RhcnRlZEF0KSk7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbEVuZGBdID0gdGltZU9mRGF5KG5ldyBEYXRlKCkpO1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxNaW51dGVzYF0gPSBOdW1iZXIoZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsTWludXRlc2BdID8/IDApICsgYWN0dWFsTWludXRlcztcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9Rm9jdXNTZXNzaW9uc2BdID0gTnVtYmVyKGZtW2Ake3Nlc3Npb24udGFza0lkfUZvY3VzU2Vzc2lvbnNgXSA/PyAwKSArIDE7XG4gICAgICB9KTtcbiAgICAgIHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXMgPSB1bmRlZmluZWQ7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgICAgbmV3IE5vdGljZShgXHU1REYyXHU4QkIwXHU1RjU1ICR7YWN0dWFsTWludXRlc30gXHU1MjA2XHU5NDlGXHU0RTEzXHU2Q0U4IC8gRm9jdXMgcmVjb3JkZWQuYCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuZmluaXNoaW5nRm9jdXMgPSBmYWxzZTtcbiAgICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgcmVmcmVzaEZvY3VzU3RhdHVzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhpcy5mb2N1c1N0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5kaXNwbGF5ID0gdGhpcy5mb2N1c1RpbWVyT3BlbiA/IFwibm9uZVwiIDogXCJcIjtcbiAgICBjb25zdCBlbGFwc2VkID0gc2Vzc2lvbi5mb2N1c2VkTXMgKyAoc2Vzc2lvbi5ydW5uaW5nQXQgPT09IG51bGwgPyAwIDogTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIHNlc3Npb24ucnVubmluZ0F0KSk7XG4gICAgaWYgKHNlc3Npb24ucnVubmluZ0F0ICE9PSBudWxsICYmIGVsYXBzZWQgPj0gc2Vzc2lvbi5kdXJhdGlvbk1zKSB7XG4gICAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc2V0VGV4dChgRm9jdXMgY29tcGxldGUgXHUwMEI3ICR7c2Vzc2lvbi50YXNrTmFtZX1gKTtcbiAgICAgIHRoaXMuZm9jdXNNaW5pRWwuc2V0VGV4dChcIlx1NEUxM1x1NkNFOFx1NUI4Q1x1NjIxMCAvIEZvY3VzIGNvbXBsZXRlXCIpO1xuICAgICAgdm9pZCB0aGlzLmZpbmlzaEZvY3VzKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXRlID0gc2Vzc2lvbi5ydW5uaW5nQXQgPT09IG51bGwgPyBcIkZvY3VzIHBhdXNlZFwiIDogZm9ybWF0RHVyYXRpb24oTWF0aC5tYXgoMCwgc2Vzc2lvbi5kdXJhdGlvbk1zIC0gZWxhcHNlZCkpO1xuICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zZXRUZXh0KGAke3N0YXRlfSBcdTAwQjcgJHtzZXNzaW9uLnRhc2tOYW1lfWApO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc2V0VGV4dChgJHtzdGF0ZX0gXHUwMEI3ICR7c2Vzc2lvbi50YXNrTmFtZX1gKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIlJlc3RvcmUgZm9jdXMgdGltZXJcIik7XG4gICAgaWYgKCF0aGlzLmZvY3VzVGltZXJPcGVuKSB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHRoaXMuYXBwbHlNaW5pUG9zaXRpb24oKSk7XG4gIH1cblxuICBhc3luYyBnZW5lcmF0ZVBsYW4obW9kZTogUGxhbk1vZGUsIGRhdGU6IHN0cmluZywgc3RhcnRUaW1lOiBzdHJpbmcsIGVuZFRpbWU6IHN0cmluZywgaW5wdXQ6IHN0cmluZyk6IFByb21pc2U8UGxhblJlc3VsdD4ge1xuICAgIGlmICghdGhpcy5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsIHx8ICF0aGlzLnBsdWdpblNldHRpbmdzLm1vZGVsKSB0aHJvdyBuZXcgRXJyb3IoXCJQbGVhc2UgY29uZmlndXJlIGFuIEFQSSBiYXNlIFVSTCBhbmQgbW9kZWwgZmlyc3QuXCIpO1xuICAgIGxldCBjdXN0b21IZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgdHJ5IHtcbiAgICAgIGN1c3RvbUhlYWRlcnMgPSBKU09OLnBhcnNlKHRoaXMucGx1Z2luU2V0dGluZ3MuY3VzdG9tSGVhZGVycyB8fCBcInt9XCIpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ3VzdG9tIGhlYWRlcnMgbXVzdCBiZSB2YWxpZCBKU09OLlwiKTtcbiAgICB9XG4gICAgY29uc3Qgc3lzdGVtID0gbW9kZSA9PT0gXCJzdHVkeVwiXG4gICAgICA/IFwiWW91IGNyZWF0ZSBwcmFjdGljYWwgc2FtZS1kYXkgaG9tZXdvcmsgcGxhbnMgZm9yIGEgY2hpbGQuIEJyZWFrIHRhc2tzIGludG8gYSBzZW5zaWJsZSBvcmRlciwgaW5jbHVkZSBzaG9ydCBicmVha3Mgd2hlbiBoZWxwZnVsLCBhbmQgb25seSBhZGQgcmV2aWV3IHRhc2tzIGdyb3VuZGVkIGluIHRoZSBnaXZlbiBob21ld29yay5cIlxuICAgICAgOiBcIllvdSBjcmVhdGUgcHJhY3RpY2FsIHNhbWUtZGF5IHdvcmsgcGxhbnMuIFByaW9yaXRpemUgYnkgdXJnZW5jeSBhbmQgY29nbml0aXZlIGxvYWQsIGluY2x1ZGUgYnVmZmVycywgYW5kIGRvIG5vdCBpbnZlbnQgd29yayBpdGVtcy5cIjtcbiAgICBjb25zdCBmb2xkZXIgPSBtb2RlID09PSBcInN0dWR5XCIgPyB0aGlzLnBsdWdpblNldHRpbmdzLnN0dWR5Rm9sZGVyIDogdGhpcy5wbHVnaW5TZXR0aW5ncy53b3JrRm9sZGVyO1xuICAgIGNvbnN0IGhpc3RvcnkgPSBidWlsZEhpc3RvcnlDb250ZXh0KHRoaXMuYXBwLCBmb2xkZXIsIHRoaXMucGx1Z2luU2V0dGluZ3MuaGlzdG9yeURheXMpO1xuICAgIGNvbnN0IHVzZXIgPSBgUGxhbiBkYXRlOiAke2RhdGV9XFxuU3RhcnQgdGltZTogJHtzdGFydFRpbWUgfHwgXCJub3Qgc3BlY2lmaWVkXCJ9XFxuTGF0ZXN0IGZpbmlzaDogJHtlbmRUaW1lIHx8IFwibm90IHNwZWNpZmllZFwifVxcbkl0ZW1zOlxcbiR7aW5wdXR9XFxuXFxuSGlzdG9yaWNhbCB0aW1pbmcgY2FsaWJyYXRpb246XFxuJHtoaXN0b3J5fVxcblxcblVzZSB0aGUgY2FsaWJyYXRpb24gb25seSB3aGVuIGl0IGhhcyBhdCBsZWFzdCB0d28gY29tcGFyYWJsZSByZWNvcmRzLiBSZXR1cm4gSlNPTiBvbmx5LCB3aXRoIHRoaXMgc2hhcGU6IHtcInRpdGxlXCI6XCJzaG9ydCB0aXRsZVwiLFwic3VtbWFyeVwiOlwib25lIHNlbnRlbmNlXCIsXCJ0YXNrc1wiOlt7XCJ0aXRsZVwiOlwidGFza1wiLFwiY2F0ZWdvcnlcIjpcInN1YmplY3Qgb3IgcHJvamVjdFwiLFwic3RhcnRUaW1lXCI6XCJISDptbVwiLFwiZW5kVGltZVwiOlwiSEg6bW1cIixcImVzdGltYXRlZE1pbnV0ZXNcIjozMCxcImRlc2NyaXB0aW9uXCI6XCJvcHRpb25hbFwifV0sXCJyZXZpZXdUYXNrc1wiOltzYW1lIHRhc2sgc2hhcGVdfS4gVXNlIFtdIGZvciByZXZpZXdUYXNrcyB3aGVuIG5vbmUgYXJlIGp1c3RpZmllZC5gO1xuICAgIGNvbnN0IGJhc2VVcmwgPSB0aGlzLnBsdWdpblNldHRpbmdzLmFwaUJhc2VVcmwucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLCAuLi5jdXN0b21IZWFkZXJzIH07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0UGxhbkNvbXBsZXRpb24odGhpcy5wbHVnaW5TZXR0aW5ncywgYmFzZVVybCwgaGVhZGVycywgc3lzdGVtLCB1c2VyKTtcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHRocm93IG5ldyBFcnJvcihgQVBJIHJlcXVlc3QgZmFpbGVkICgke3Jlc3BvbnNlLnN0YXR1c30pOiAke3Jlc3BvbnNlLnRleHQuc2xpY2UoMCwgMzAwKX1gKTtcbiAgICBjb25zdCBjb250ZW50ID0gY29tcGxldGlvblRleHQodGhpcy5wbHVnaW5TZXR0aW5ncy5wcm92aWRlciwgcmVzcG9uc2UuanNvbik7XG4gICAgaWYgKHR5cGVvZiBjb250ZW50ICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgcHJvdmlkZXIgZGlkIG5vdCByZXR1cm4gYSBjaGF0IGNvbXBsZXRpb24uXCIpO1xuICAgIHJldHVybiBwYXJzZVBsYW4oY29udGVudCk7XG4gIH1cblxuICBhc3luYyB3cml0ZVBsYW4obW9kZTogUGxhbk1vZGUsIGRhdGU6IHN0cmluZywgcGxhbjogUGxhblJlc3VsdCk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgZm9sZGVyID0gbW9kZSA9PT0gXCJzdHVkeVwiID8gdGhpcy5wbHVnaW5TZXR0aW5ncy5zdHVkeUZvbGRlciA6IHRoaXMucGx1Z2luU2V0dGluZ3Mud29ya0ZvbGRlcjtcbiAgICBhd2FpdCBlbnN1cmVGb2xkZXIodGhpcy5hcHAsIGZvbGRlcik7XG4gICAgY29uc3QgZmlsZW5hbWUgPSBgJHtkYXRlfS0ke3NhZmVGaWxlbmFtZShwbGFuLnRpdGxlIHx8IChtb2RlID09PSBcInN0dWR5XCIgPyBcIlx1NEY1Q1x1NEUxQVx1OEJBMVx1NTIxMlwiIDogXCJcdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcIikpfS5tZGA7XG4gICAgY29uc3QgcGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7Zm9sZGVyfS8ke2ZpbGVuYW1lfWApO1xuICAgIGNvbnN0IGNvbnRlbnQgPSByZW5kZXJQbGFuKG1vZGUsIGRhdGUsIHBsYW4pO1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpO1xuICAgIGlmIChleGlzdGluZyBpbnN0YW5jZW9mIFRGaWxlKSBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmcsIGNvbnRlbnQpO1xuICAgIGVsc2UgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHBhdGgsIGNvbnRlbnQpO1xuICAgIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5vcGVuTGlua1RleHQocGF0aCwgXCJcIiwgdHJ1ZSk7XG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEZvY3VzVGFzayB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgY2F0ZWdvcnk6IHN0cmluZzsgZXN0aW1hdGVkTWludXRlczogbnVtYmVyOyB9XG5cbmZ1bmN0aW9uIGV4dHJhY3RGb2N1c1Rhc2tzKGFwcDogQXBwLCBmaWxlOiBURmlsZSk6IEZvY3VzVGFza1tdIHtcbiAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICByZXR1cm4gT2JqZWN0LmtleXMoZm0pLmZpbHRlcihrZXkgPT4gL150YXNrXFxkK05hbWUkLy50ZXN0KGtleSkpLnNvcnQoKS5tYXAoa2V5ID0+IHtcbiAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICByZXR1cm4geyBpZCwgbmFtZTogU3RyaW5nKGZtW2tleV0gPz8gaWQpLCBjYXRlZ29yeTogU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gXCJcIiksIGVzdGltYXRlZE1pbnV0ZXM6IE51bWJlcihmbVtgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzYF0gPz8gMCkgfTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkSGlzdG9yeUNvbnRleHQoYXBwOiBBcHAsIGZvbGRlcjogc3RyaW5nLCBkYXlzOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBjdXRvZmYgPSBEYXRlLm5vdygpIC0gZGF5cyAqIDg2NDAwMDAwO1xuICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBwbGFubmVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyOyBjb3VudDogbnVtYmVyIH0+KCk7XG4gIGZvciAoY29uc3QgZmlsZSBvZiBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgaWYgKCFmaWxlLnBhdGguc3RhcnRzV2l0aChgJHtub3JtYWxpemVQYXRoKGZvbGRlcil9L2ApIHx8IGZpbGUuc3RhdC5tdGltZSA8IGN1dG9mZikgY29udGludWU7XG4gICAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoaXRlbSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3QoaXRlbSkpKSB7XG4gICAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICAgIGNvbnN0IHBsYW5uZWQgPSBOdW1iZXIoZm1bYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID8/IDApO1xuICAgICAgY29uc3QgYWN0dWFsID0gTnVtYmVyKGZtW2Ake2lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSB8fCBkdXJhdGlvbkZyb21UaW1lcyhmbVtgJHtpZH1BY3R1YWxTdGFydGBdLCBmbVtgJHtpZH1BY3R1YWxFbmRgXSk7XG4gICAgICBpZiAocGxhbm5lZCA8PSAwIHx8IGFjdHVhbCA8PSAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGNhdGVnb3J5ID0gU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gU3RyaW5nKGZtW2tleV0pLnNwbGl0KFwiXHUwMEI3XCIpWzBdID8/IFwiXHU1MTc2XHU1QjgzXCIpLnRyaW0oKSB8fCBcIlx1NTE3Nlx1NUI4M1wiO1xuICAgICAgY29uc3QgaXRlbSA9IGdyb3Vwcy5nZXQoY2F0ZWdvcnkpID8/IHsgcGxhbm5lZDogMCwgYWN0dWFsOiAwLCBjb3VudDogMCB9O1xuICAgICAgaXRlbS5wbGFubmVkICs9IHBsYW5uZWQ7IGl0ZW0uYWN0dWFsICs9IGFjdHVhbDsgaXRlbS5jb3VudCArPSAxOyBncm91cHMuc2V0KGNhdGVnb3J5LCBpdGVtKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbGluZXMgPSBbLi4uZ3JvdXBzLmVudHJpZXMoKV0uZmlsdGVyKChbLCB2YWx1ZV0pID0+IHZhbHVlLmNvdW50ID49IDIpLnNvcnQoKGEsIGIpID0+IGJbMV0uY291bnQgLSBhWzFdLmNvdW50KS5zbGljZSgwLCA2KS5tYXAoKFtjYXRlZ29yeSwgdmFsdWVdKSA9PiB7XG4gICAgY29uc3QgcGVyY2VudCA9IE1hdGgucm91bmQoKHZhbHVlLmFjdHVhbCAvIHZhbHVlLnBsYW5uZWQgLSAxKSAqIDEwMCk7XG4gICAgcmV0dXJuIGAke2NhdGVnb3J5fTogJHt2YWx1ZS5jb3VudH0gcmVjb3JkcywgcGxhbm5lZCAke3ZhbHVlLnBsYW5uZWR9IG1pbiwgYWN0dWFsICR7dmFsdWUuYWN0dWFsfSBtaW4sIGRldmlhdGlvbiAke3BlcmNlbnQgPj0gMCA/IFwiK1wiIDogXCJcIn0ke3BlcmNlbnR9JWA7XG4gIH0pO1xuICByZXR1cm4gbGluZXMubGVuZ3RoID8gbGluZXMuam9pbihcIlxcblwiKSA6IFwiTm8gcmVsaWFibGUgaGlzdG9yaWNhbCByZWNvcmRzIHlldC4gVXNlIHJlYXNvbmFibGUgZXN0aW1hdGVzIGFuZCBhIHNtYWxsIGJ1ZmZlci5cIjtcbn1cblxuZnVuY3Rpb24gZHVyYXRpb25Gcm9tVGltZXMoc3RhcnQ6IHVua25vd24sIGVuZDogdW5rbm93bik6IG51bWJlciB7XG4gIGNvbnN0IHBhcnNlID0gKHZhbHVlOiB1bmtub3duKTogbnVtYmVyIHwgbnVsbCA9PiB7IGNvbnN0IG1hdGNoID0gU3RyaW5nKHZhbHVlID8/IFwiXCIpLm1hdGNoKC9eKFxcZHsxLDJ9KTooXFxkezJ9KSQvKTsgcmV0dXJuIG1hdGNoID8gTnVtYmVyKG1hdGNoWzFdKSAqIDYwICsgTnVtYmVyKG1hdGNoWzJdKSA6IG51bGw7IH07XG4gIGNvbnN0IGZyb20gPSBwYXJzZShzdGFydCksIHRvID0gcGFyc2UoZW5kKTtcbiAgcmV0dXJuIGZyb20gPT09IG51bGwgfHwgdG8gPT09IG51bGwgPyAwIDogKHRvID49IGZyb20gPyB0byAtIGZyb20gOiB0byArIDE0NDAgLSBmcm9tKTtcbn1cblxuY2xhc3MgRm9jdXNUYXNrUGlja2VyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbWludXRlczogbnVtYmVyO1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBmaWxlOiBURmlsZSwgcHJpdmF0ZSByZWFkb25seSB0YXNrczogRm9jdXNUYXNrW10pIHsgc3VwZXIoYXBwKTsgdGhpcy5taW51dGVzID0gcGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlczsgfVxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1NEUxM1x1NkNFOFx1NkEyMVx1NUYwRiAvIEZvY3VzIG1vZGVcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTRFMTNcdTZDRThcdTY1RjZcdTk1N0YgLyBGb2N1cyBkdXJhdGlvblwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93bi5hZGRPcHRpb24oXCIyNVwiLCBcIjI1IG1pblwiKS5hZGRPcHRpb24oXCI1MFwiLCBcIjUwIG1pblwiKS5hZGRPcHRpb24oXCI5MFwiLCBcIjkwIG1pblwiKS5zZXRWYWx1ZShTdHJpbmcodGhpcy5taW51dGVzKSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5taW51dGVzID0gTnVtYmVyKHZhbHVlKSkpO1xuICAgIGNvbnN0IGN1c3RvbSA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyB0eXBlOiBcIm51bWJlclwiLCBwbGFjZWhvbGRlcjogXCJDdXN0b20gbWludXRlcyAvIFx1ODFFQVx1NUI5QVx1NEU0OVx1NTIwNlx1OTQ5RlwiIH0pO1xuICAgIGN1c3RvbS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4geyBjb25zdCB2YWx1ZSA9IE51bWJlcihjdXN0b20udmFsdWUpOyBpZiAodmFsdWUgPiAwKSB0aGlzLm1pbnV0ZXMgPSB2YWx1ZTsgfSk7XG4gICAgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiXHU5MDA5XHU2MkU5XHU0RUZCXHU1MkExIC8gQ2hvb3NlIGEgdGFza1wiIH0pO1xuICAgIGZvciAoY29uc3QgdGFzayBvZiB0aGlzLnRhc2tzKSB7XG4gICAgICBjb25zdCBidXR0b24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJhaS1wbGFubmVyLWZvY3VzLXRhc2tcIiB9KTtcbiAgICAgIGJ1dHRvbi5zZXRUZXh0KGAke3Rhc2suY2F0ZWdvcnkgPyBgJHt0YXNrLmNhdGVnb3J5fSBcdTAwQjcgYCA6IFwiXCJ9JHt0YXNrLm5hbWV9ICgke3Rhc2suZXN0aW1hdGVkTWludXRlcyB8fCBcIj9cIn0gbWluKWApO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7IHRoaXMuY2xvc2UoKTsgdm9pZCB0aGlzLnBsdWdpbi5zdGFydEZvY3VzKHRoaXMuZmlsZSwgdGFzaywgdGhpcy5taW51dGVzKTsgfSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIEZvY3VzVGltZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBpbnRlcnZhbDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luLmdldEFjdGl2ZUZvY3VzKCk7XG4gICAgaWYgKCFzZXNzaW9uKSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgdGhpcy5wbHVnaW4uc2V0Rm9jdXNUaW1lck9wZW4odHJ1ZSk7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiLCBcImFpLXBsYW5uZXItZm9jdXMtdGltZXJcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTRFMkQgLyBGb2N1c2luZ1wiKTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBzZXNzaW9uLnRhc2tOYW1lLCBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy10aXRsZVwiIH0pO1xuICAgIGNvbnN0IGNsb2NrID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1jbG9ja1wiIH0pO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG4gICAgICB0ZXh0OiBcIlx1NTE3M1x1OTVFRFx1NkI2NFx1N0E5N1x1NTNFM1x1NTNFQVx1NEYxQVx1NjcwMFx1NUMwRlx1NTMxNlx1RkYwQ1x1OEJBMVx1NjVGNlx1NEYxQVx1NEZERFx1NzU1OVx1MzAwMlx1NjI0Qlx1NjczQVx1NTIwN1x1NjM2Mlx1NTIzMFx1NTE3Nlx1NUI4MyBBcHAgXHU1NDBFXHU2MzA5XHU3RUNGXHU4RkM3XHU3Njg0XHU1ODk5XHU0RTBBXHU2NUY2XHU5NUY0XHU0RjMwXHU3Qjk3XHVGRjFCaU9TIFx1NTNFRlx1ODBGRFx1NjY4Mlx1NTA1Q1x1NjIxNlx1NTZERVx1NjUzNiBPYnNpZGlhblx1RkYwQ1x1NTZFMFx1NkI2NFx1OEZEOVx1NEUwRFx1NEVFM1x1ODg2OFx1NURGMlx1OUE4Q1x1OEJDMVx1NzY4NFx1NEUxM1x1NkNFOFx1NjIxNlx1OTYwNVx1OEJGQlx1NjVGNlx1OTU3Rlx1MzAwMiAvIENsb3Npbmcgb25seSBtaW5pbWl6ZXMgdGhpcyB0aW1lci4gTW9iaWxlIGJhY2tncm91bmQgdGltZSBpcyBhIHdhbGwtY2xvY2sgZXN0aW1hdGU7IGlPUyBtYXkgc3VzcGVuZCBvciB0ZXJtaW5hdGUgT2JzaWRpYW4sIHNvIGl0IGlzIG5vdCB2ZXJpZmllZCBmb2N1cyBvciByZWFkaW5nIHRpbWUuXCIsXG4gICAgICBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1kaXNjbGFpbWVyXCJcbiAgICB9KTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGNvbnN0IHBhdXNlID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTY2ODJcdTUwNUMgLyBQYXVzZVwiIH0pO1xuICAgIGNvbnN0IGZpbmlzaCA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU3RUQzXHU2NzVGIC8gRmluaXNoXCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgY29uc3QgcmVmcmVzaCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVGb2N1cygpO1xuICAgICAgaWYgKCFjdXJyZW50KSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgICBjb25zdCBlbGFwc2VkID0gY3VycmVudC5mb2N1c2VkTXMgKyAoY3VycmVudC5ydW5uaW5nQXQgPT09IG51bGwgPyAwIDogTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIGN1cnJlbnQucnVubmluZ0F0KSk7XG4gICAgICBjb25zdCByZW1haW5pbmcgPSBNYXRoLm1heCgwLCBjdXJyZW50LmR1cmF0aW9uTXMgLSBlbGFwc2VkKTtcbiAgICAgIGNsb2NrLnNldFRleHQoZm9ybWF0RHVyYXRpb24ocmVtYWluaW5nKSk7XG4gICAgICBwYXVzZS5zZXRUZXh0KGN1cnJlbnQucnVubmluZ0F0ID09PSBudWxsID8gXCJcdTdFRTdcdTdFRUQgLyBSZXN1bWVcIiA6IFwiXHU2NjgyXHU1MDVDIC8gUGF1c2VcIik7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDApIHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKTtcbiAgICB9O1xuICAgIHBhdXNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucGx1Z2luLnRvZ2dsZUZvY3VzUGF1c2UoKS50aGVuKHJlZnJlc2gpKTtcbiAgICBmaW5pc2guYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKS50aGVuKCgpID0+IHRoaXMuY2xvc2UoKSkpO1xuICAgIHRoaXMuaW50ZXJ2YWwgPSB3aW5kb3cuc2V0SW50ZXJ2YWwocmVmcmVzaCwgNTAwKTsgcmVmcmVzaCgpO1xuICB9XG4gIG9uQ2xvc2UoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaW50ZXJ2YWwgIT09IG51bGwpIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWwpO1xuICAgIHRoaXMucGx1Z2luLnNldEZvY3VzVGltZXJPcGVuKGZhbHNlKTtcbiAgfVxufVxuXG5jbGFzcyBQbGFuSW5wdXRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBtb2RlOiBQbGFuTW9kZSA9IFwic3R1ZHlcIjtcbiAgcHJpdmF0ZSBkYXRlID0gbG9jYWxEYXRlKCk7XG4gIHByaXZhdGUgc3RhcnRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBlbmRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBpbnB1dCA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4pIHsgc3VwZXIoYXBwKTsgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiQUkgUGxhbm5lciAvIEFJIFx1OEJBMVx1NTIxMlwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NkEyMVx1NUYwRiAvIE1vZGVcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cbiAgICAgIC5hZGRPcHRpb24oXCJzdHVkeVwiLCBcIlx1NEY1Q1x1NEUxQVx1NEUwRVx1NUI2Nlx1NEU2MCAvIEhvbWV3b3JrICYgc3R1ZHlcIilcbiAgICAgIC5hZGRPcHRpb24oXCJ3b3JrXCIsIFwiXHU1REU1XHU0RjVDIC8gV29ya1wiKVxuICAgICAgLnNldFZhbHVlKHRoaXMubW9kZSlcbiAgICAgIC5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLm1vZGUgPSB2YWx1ZSBhcyBQbGFuTW9kZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU4QkExXHU1MjEyXHU2NUU1XHU2NzFGIC8gUGxhbiBkYXRlXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXRcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLmRhdGUpLnNldFBsYWNlaG9sZGVyKFwiWVlZWS1NTS1ERFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLmRhdGUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0IC8gU3RhcnQgdGltZVwiKS5zZXREZXNjKFwiXHU0RjhCXHU1OTgyIC8gRXhhbXBsZTogMTk6MDBcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dFxuICAgICAgLnNldFZhbHVlKHRoaXMuc3RhcnRUaW1lKS5zZXRQbGFjZWhvbGRlcihcIjE5OjAwXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuc3RhcnRUaW1lID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NjcwMFx1NjY1QVx1N0VEM1x1Njc1RiAvIExhdGVzdCBmaW5pc2hcIikuc2V0RGVzYyhcIlx1NTNFRlx1OTAwOSAvIE9wdGlvbmFsLlwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0XG4gICAgICAuc2V0VmFsdWUodGhpcy5lbmRUaW1lKS5zZXRQbGFjZWhvbGRlcihcIjIxOjAwXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuZW5kVGltZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTRFRkJcdTUyQTFcdTYyMTZcdTRGNUNcdTRFMUEgLyBUYXNrcyBvciBob21ld29ya1wiKS5zZXREZXNjKFwiXHU1ODZCXHU1MTk5XHU3OUQxXHU3NkVFL1x1OTg3OVx1NzZFRVx1MzAwMVx1NEVGQlx1NTJBMVx1OTFDRlx1MzAwMVx1NjIyQVx1NkI2Mlx1NjVGNlx1OTVGNFx1NTQ4Q1x1OTY1MFx1NTIzNlx1Njc2MVx1NEVGNlx1MzAwMlwiKTtcbiAgICBjb25zdCBzb3VyY2VCYXIgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1zb3VyY2VcIiB9KTtcbiAgICBjb25zdCBzb3VyY2VMYWJlbCA9IHNvdXJjZUJhci5jcmVhdGVTcGFuKHsgdGV4dDogXCJcdTY3NjVcdTZFOTAgLyBTb3VyY2U6IFx1NjI0Qlx1NTJBOFx1OEY5M1x1NTE2NSAvIG1hbnVhbCBpbnB1dFwiIH0pO1xuICAgIGNvbnN0IHVzZUFjdGl2ZUJ1dHRvbiA9IHNvdXJjZUJhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU0RjdGXHU3NTI4XHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwIC8gVXNlIGN1cnJlbnQgbm90ZVwiIH0pO1xuICAgIGNvbnN0IGNob29zZUJ1dHRvbiA9IHNvdXJjZUJhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU5MDA5XHU2MkU5IE1hcmtkb3duIFx1N0IxNFx1OEJCMCAvIENob29zZSBub3RlXCIgfSk7XG4gICAgY29uc3QgYXJlYSA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1pbnB1dFwiIH0pO1xuICAgIGFyZWEucm93cyA9IDg7XG4gICAgYXJlYS5wbGFjZWhvbGRlciA9IFwiRXhhbXBsZTogTWF0aCB3b3JrYm9vayBwYWdlcyAxMi0xNDsgbWVtb3JpemUgMjAgRW5nbGlzaCB3b3JkczsgQ2hpbmVzZSByZWFkaW5nIGFsb3VkLlwiO1xuICAgIGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHRoaXMuaW5wdXQgPSBhcmVhLnZhbHVlKTtcbiAgICBjb25zdCBsb2FkU291cmNlID0gYXN5bmMgKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIHRoaXMuaW5wdXQgPSBjb250ZW50O1xuICAgICAgYXJlYS52YWx1ZSA9IGNvbnRlbnQ7XG4gICAgICBzb3VyY2VMYWJlbC5zZXRUZXh0KGBcdTY3NjVcdTZFOTAgLyBTb3VyY2U6ICR7ZmlsZS5wYXRofWApO1xuICAgIH07XG4gICAgdXNlQWN0aXZlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgIGlmICghYWN0aXZlRmlsZSB8fCBhY3RpdmVGaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBPcGVuIGEgTWFya2Rvd24gbm90ZSBmaXJzdC5cIik7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGFjdGl2ZUZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoZSBjdXJyZW50IG5vdGUuXCIpOyB9XG4gICAgfSk7XG4gICAgY2hvb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBuZXcgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwodGhpcy5hcHAsIGFzeW5jIGZpbGUgPT4ge1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShmaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGF0IG5vdGUuXCIpOyB9XG4gICAgfSkub3BlbigpKTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGNvbnN0IGJ1dHRvbiA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU3NTFGXHU2MjEwXHU5ODg0XHU4OUM4IC8gR2VuZXJhdGUgcHJldmlld1wiLCBjbHM6IFwibW9kLWN0YVwiIH0pO1xuICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLmlucHV0LnRyaW0oKSkgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdThCRjdcdTgxRjNcdTVDMTFcdTU4NkJcdTUxOTlcdTRFMDBcdTk4NzlcdTRFRkJcdTUyQTEgLyBFbnRlciBhdCBsZWFzdCBvbmUgdGFzayBmaXJzdC5cIik7XG4gICAgICBidXR0b24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgYnV0dG9uLnNldFRleHQoXCJcdTZCNjNcdTU3MjhcdTc1MUZcdTYyMTAgLyBHZW5lcmF0aW5nLi4uXCIpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGxhbiA9IGF3YWl0IHRoaXMucGx1Z2luLmdlbmVyYXRlUGxhbih0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgdGhpcy5zdGFydFRpbWUsIHRoaXMuZW5kVGltZSwgdGhpcy5pbnB1dCk7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgICAgbmV3IFBsYW5QcmV2aWV3TW9kYWwodGhpcy5hcHAsIHRoaXMucGx1Z2luLCB0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgcGxhbikub3BlbigpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiQ291bGQgbm90IGdlbmVyYXRlIHBsYW4uXCIpO1xuICAgICAgICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgYnV0dG9uLnNldFRleHQoXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIE1hcmtkb3duRmlsZVBpY2tlck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIHF1ZXJ5ID0gXCJcIjtcbiAgcHJpdmF0ZSByZWFkb25seSBmaWxlczogVEZpbGVbXTtcbiAgcHJpdmF0ZSByZXN1bHRzRWw6IEhUTUxFbGVtZW50O1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IG9uQ2hvb3NlOiAoZmlsZTogVEZpbGUpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLmZpbGVzID0gYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKS5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgpKTtcbiAgICB0aGlzLnJlc3VsdHNFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiLCBcImFpLXBsYW5uZXItZmlsZS1waWNrZXJcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTkwMDlcdTYyRTkgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gQ2hvb3NlIG5vdGVcIik7XG4gICAgY29uc3Qgc2VhcmNoID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IHR5cGU6IFwic2VhcmNoXCIsIHBsYWNlaG9sZGVyOiBcIlx1NjQxQ1x1N0QyMlx1N0IxNFx1OEJCMCAvIFNlYXJjaCBub3Rlcy4uLlwiLCBjbHM6IFwiYWktcGxhbm5lci1maWxlLXNlYXJjaFwiIH0pO1xuICAgIHNlYXJjaC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4geyB0aGlzLnF1ZXJ5ID0gc2VhcmNoLnZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpOyB0aGlzLnJlbmRlclJlc3VsdHMoKTsgfSk7XG4gICAgdGhpcy5yZXN1bHRzRWwgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1maWxlLXJlc3VsdHNcIiB9KTtcbiAgICB0aGlzLnJlbmRlclJlc3VsdHMoKTtcbiAgICBzZWFyY2guZm9jdXMoKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyUmVzdWx0cygpOiB2b2lkIHtcbiAgICB0aGlzLnJlc3VsdHNFbC5lbXB0eSgpO1xuICAgIGNvbnN0IG1hdGNoZXMgPSB0aGlzLmZpbGVzLmZpbHRlcihmaWxlID0+IGZpbGUucGF0aC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRoaXMucXVlcnkpKS5zbGljZSgwLCAxMDApO1xuICAgIGlmICghbWF0Y2hlcy5sZW5ndGgpIHsgdGhpcy5yZXN1bHRzRWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJObyBNYXJrZG93biBub3RlcyBmb3VuZC5cIiB9KTsgcmV0dXJuOyB9XG4gICAgZm9yIChjb25zdCBmaWxlIG9mIG1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IHRoaXMucmVzdWx0c0VsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImFpLXBsYW5uZXItZmlsZS1pdGVtXCIgfSk7XG4gICAgICBidXR0b24uY3JlYXRlRWwoXCJzdHJvbmdcIiwgeyB0ZXh0OiBmaWxlLmJhc2VuYW1lIH0pO1xuICAgICAgYnV0dG9uLmNyZWF0ZUVsKFwic21hbGxcIiwgeyB0ZXh0OiBmaWxlLnBhdGggfSk7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHsgYXdhaXQgdGhpcy5vbkNob29zZShmaWxlKTsgdGhpcy5jbG9zZSgpOyB9KTtcbiAgICB9XG4gIH1cbn1cblxuY2xhc3MgUGxhblByZXZpZXdNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4sIHByaXZhdGUgcmVhZG9ubHkgbW9kZTogUGxhbk1vZGUsIHByaXZhdGUgcmVhZG9ubHkgZGF0ZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IHBsYW46IFBsYW5SZXN1bHQpIHsgc3VwZXIoYXBwKTsgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KHRoaXMucGxhbi50aXRsZSB8fCBcIlBsYW4gcHJldmlld1wiKTtcbiAgICBpZiAodGhpcy5wbGFuLnN1bW1hcnkpIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMucGxhbi5zdW1tYXJ5IH0pO1xuICAgIHJlbmRlclByZXZpZXdUYXNrcyh0aGlzLmNvbnRlbnRFbCwgXCJQbGFuXCIsIHRoaXMucGxhbi50YXNrcyk7XG4gICAgaWYgKHRoaXMubW9kZSA9PT0gXCJzdHVkeVwiKSByZW5kZXJQcmV2aWV3VGFza3ModGhpcy5jb250ZW50RWwsIFwiUmV2aWV3XCIsIHRoaXMucGxhbi5yZXZpZXdUYXNrcyA/PyBbXSk7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGFsLWJ1dHRvbi1jb250YWluZXJcIiB9KTtcbiAgICBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNhbmNlbFwiIH0pLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuICAgIGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiV3JpdGUgcGxhblwiLCBjbHM6IFwibW9kLWN0YVwiIH0pLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXRoID0gYXdhaXQgdGhpcy5wbHVnaW4ud3JpdGVQbGFuKHRoaXMubW9kZSwgdGhpcy5kYXRlLCB0aGlzLnBsYW4pO1xuICAgICAgICBuZXcgTm90aWNlKGBQbGFuIHdyaXR0ZW46ICR7cGF0aH1gKTtcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiQ291bGQgbm90IHdyaXRlIHBsYW4uXCIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIEFJUGxhbm5lclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4pIHsgc3VwZXIoYXBwLCBwbHVnaW4pOyB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmVtcHR5KCk7XG4gICAgdGhpcy5jb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJBSSBQbGFubmVyIFx1OEJCRVx1N0Y2RSAvIFNldHRpbmdzXCIgfSk7XG4gICAgdGhpcy5jb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIkNsYXVkZSBcdTRFMEUgR2VtaW5pIFx1NEY3Rlx1NzUyOFx1NTM5Rlx1NzUxRlx1NjNBNVx1NTNFM1x1RkYxQlx1NTE3Nlx1NUI4M1x1OTg4NFx1OEJCRVx1NEY3Rlx1NzUyOCBPcGVuQUktY29tcGF0aWJsZSBcdTYzQTVcdTUzRTNcdTMwMDJDbGF1ZGUgYW5kIEdlbWluaSB1c2UgbmF0aXZlIEFQSSBmb3JtYXRzLlwiIH0pO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDAgLyBJbnRlcmZhY2UgbGFuZ3VhZ2VcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cbiAgICAgIC5hZGRPcHRpb24oXCJhdXRvXCIsIFwiXHU4RERGXHU5NjhGXHU3Q0ZCXHU3RURGIC8gRm9sbG93IHN5c3RlbVwiKVxuICAgICAgLmFkZE9wdGlvbihcInpoXCIsIFwiXHU0RTJEXHU2NTg3XCIpXG4gICAgICAuYWRkT3B0aW9uKFwiZW5cIiwgXCJFbmdsaXNoXCIpXG4gICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaW50ZXJmYWNlTGFuZ3VhZ2UpXG4gICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5pbnRlcmZhY2VMYW5ndWFnZSA9IHZhbHVlIGFzIEludGVyZmFjZUxhbmd1YWdlOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTY3MERcdTUyQTFcdTU1NDZcdTk4ODRcdThCQkUgLyBQcm92aWRlciBwcmVzZXRcIikuc2V0RGVzYyhcIlx1OTAwOVx1NjJFOVx1NTQwRVx1NEYxQVx1NTg2Qlx1NTE2NVx1NjNBOFx1ODM1MFx1NTczMFx1NTc0MFx1NEUwRVx1NkEyMVx1NTc4Qlx1RkYwQ1x1NTNFRlx1N0VFN1x1N0VFRFx1NjI0Qlx1NTJBOFx1NEZFRVx1NjUzOVx1MzAwMlwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XG4gICAgICBmb3IgKGNvbnN0IFtpZCwgcHJlc2V0XSBvZiBPYmplY3QuZW50cmllcyhQUk9WSURFUlMpKSBkcm9wZG93bi5hZGRPcHRpb24oaWQsIHByZXNldC5sYWJlbCk7XG4gICAgICBkcm9wZG93bi5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5wcm92aWRlcikub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IHZhbHVlIGFzIFByb3ZpZGVySWQ7XG4gICAgICAgIHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnByb3ZpZGVyID0gcHJvdmlkZXI7XG4gICAgICAgIGlmIChwcm92aWRlciAhPT0gXCJjdXN0b21cIikge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmFwaUJhc2VVcmwgPSBQUk9WSURFUlNbcHJvdmlkZXJdLmJhc2VVcmw7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MubW9kZWwgPSBQUk9WSURFUlNbcHJvdmlkZXJdLm1vZGVsO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJBUEkgXHU1NzMwXHU1NzQwIC8gQVBJIGJhc2UgVVJMXCIsIFwiXHU0RjhCXHU1OTgyIC8gRXhhbXBsZTogaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MVwiLCBcImFwaUJhc2VVcmxcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIkFQSSBcdTVCQzZcdTk0QTUgLyBBUEkga2V5XCIpLnNldERlc2MoXCJTdG9yZWQgaW4gdGhpcyBwbHVnaW4ncyBkYXRhLmpzb24uXCIpLmFkZFRleHQoaW5wdXQgPT4ge1xuICAgICAgaW5wdXQuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuYXBpS2V5KS5zZXRQbGFjZWhvbGRlcihcInNrLS4uLlwiKTtcbiAgICAgIGlucHV0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcbiAgICAgIGlucHV0Lm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuYXBpS2V5ID0gdmFsdWU7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU2QTIxXHU1NzhCIC8gTW9kZWxcIiwgXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiBncHQtNC4xLW1pbmksIGRlZXBzZWVrLWNoYXQsIGdsbS00LWZsYXNoXCIsIFwibW9kZWxcIik7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1ODFFQVx1NUI5QVx1NEU0OVx1OEJGN1x1NkM0Mlx1NTkzNCAvIEN1c3RvbSBoZWFkZXJzXCIsIFwiSlNPTiBvYmplY3QsIG9wdGlvbmFsLlwiLCBcImN1c3RvbUhlYWRlcnNcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NkUyOVx1NUVBNiAvIFRlbXBlcmF0dXJlXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnRlbXBlcmF0dXJlKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy50ZW1wZXJhdHVyZSA9IE51bWJlcih2YWx1ZSkgfHwgMDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2NzAwXHU1OTI3XHU4RjkzXHU1MUZBXHU5NTdGXHU1RUE2IC8gTWF4IG91dHB1dCB0b2tlbnNcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MubWF4VG9rZW5zKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tYXhUb2tlbnMgPSBOdW1iZXIodmFsdWUpIHx8IERFRkFVTFRfU0VUVElOR1MubWF4VG9rZW5zOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTUzODZcdTUzRjJcdTY4MjFcdTUxQzZcdTU5MjlcdTY1NzAgLyBIaXN0b3J5IGRheXNcIikuc2V0RGVzYyhcIlx1NzUxRlx1NjIxMFx1OEJBMVx1NTIxMlx1NjVGNlx1OEJGQlx1NTNENlx1OEZEMVx1NjcxRlx1NzcxRlx1NUI5RVx1NzUyOFx1NjVGNlx1RkYwQ1x1NUVGQVx1OEJBRSA3LTMwIFx1NTkyOVx1MzAwMlwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5oaXN0b3J5RGF5cykpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaGlzdG9yeURheXMgPSBNYXRoLm1heCgxLCBOdW1iZXIodmFsdWUpIHx8IERFRkFVTFRfU0VUVElOR1MuaGlzdG9yeURheXMpOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTlFRDhcdThCQTRcdTRFMTNcdTZDRThcdTUyMDZcdTk0OUYgLyBEZWZhdWx0IGZvY3VzIG1pbnV0ZXNcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW51dGVzKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbnV0ZXMgPSBNYXRoLm1heCgxLCBOdW1iZXIodmFsdWUpIHx8IERFRkFVTFRfU0VUVElOR1MuZm9jdXNNaW51dGVzKTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU1QjY2XHU0RTYwXHU4RjkzXHU1MUZBXHU3NkVFXHU1RjU1IC8gU3R1ZHkgb3V0cHV0IGZvbGRlclwiLCBcIlZhdWx0LXJlbGF0aXZlIHBhdGguXCIsIFwic3R1ZHlGb2xkZXJcIik7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1NURFNVx1NEY1Q1x1OEY5M1x1NTFGQVx1NzZFRVx1NUY1NSAvIFdvcmsgb3V0cHV0IGZvbGRlclwiLCBcIlZhdWx0LXJlbGF0aXZlIHBhdGguXCIsIFwid29ya0ZvbGRlclwiKTtcbiAgfVxuXG4gIHByaXZhdGUgdGV4dFNldHRpbmcobmFtZTogc3RyaW5nLCBkZXNjOiBzdHJpbmcsIGtleTogXCJhcGlCYXNlVXJsXCIgfCBcIm1vZGVsXCIgfCBcImN1c3RvbUhlYWRlcnNcIiB8IFwic3R1ZHlGb2xkZXJcIiB8IFwid29ya0ZvbGRlclwiKTogdm9pZCB7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShuYW1lKS5zZXREZXNjKGRlc2MpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3Nba2V5XSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5nc1trZXldID0gdmFsdWUudHJpbSgpOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlUGxhbihjb250ZW50OiBzdHJpbmcpOiBQbGFuUmVzdWx0IHtcbiAgY29uc3QganNvbiA9IGNvbnRlbnQudHJpbSgpLnJlcGxhY2UoL15gYGAoPzpqc29uKT9cXHMqL2ksIFwiXCIpLnJlcGxhY2UoL1xccypgYGAkLywgXCJcIik7XG4gIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbikgYXMgUGxhblJlc3VsdDtcbiAgaWYgKCFwYXJzZWQudGl0bGUgfHwgIUFycmF5LmlzQXJyYXkocGFyc2VkLnRhc2tzKSkgdGhyb3cgbmV3IEVycm9yKFwiVGhlIG1vZGVsIHJldHVybmVkIGFuIGludmFsaWQgcGxhbiBmb3JtYXQuXCIpO1xuICBwYXJzZWQudGFza3MgPSBwYXJzZWQudGFza3MubWFwKG5vcm1hbGl6ZVRhc2spLmZpbHRlcihCb29sZWFuKSBhcyBQbGFuVGFza1tdO1xuICBwYXJzZWQucmV2aWV3VGFza3MgPSBBcnJheS5pc0FycmF5KHBhcnNlZC5yZXZpZXdUYXNrcykgPyBwYXJzZWQucmV2aWV3VGFza3MubWFwKG5vcm1hbGl6ZVRhc2spLmZpbHRlcihCb29sZWFuKSBhcyBQbGFuVGFza1tdIDogW107XG4gIGlmICghcGFyc2VkLnRhc2tzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKFwiVGhlIG1vZGVsIGRpZCBub3QgcmV0dXJuIGFueSB0YXNrcy5cIik7XG4gIHJldHVybiBwYXJzZWQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVRhc2sodmFsdWU6IHVua25vd24pOiBQbGFuVGFzayB8IG51bGwge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHRhc2sgPSB2YWx1ZSBhcyBQYXJ0aWFsPFBsYW5UYXNrPjtcbiAgaWYgKCF0YXNrLnRpdGxlKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHsgdGl0bGU6IFN0cmluZyh0YXNrLnRpdGxlKSwgY2F0ZWdvcnk6IHRhc2suY2F0ZWdvcnkgPyBTdHJpbmcodGFzay5jYXRlZ29yeSkgOiBcIlwiLCBzdGFydFRpbWU6IHRhc2suc3RhcnRUaW1lID8gU3RyaW5nKHRhc2suc3RhcnRUaW1lKSA6IFwiXCIsIGVuZFRpbWU6IHRhc2suZW5kVGltZSA/IFN0cmluZyh0YXNrLmVuZFRpbWUpIDogXCJcIiwgZXN0aW1hdGVkTWludXRlczogTWF0aC5tYXgoMSwgTnVtYmVyKHRhc2suZXN0aW1hdGVkTWludXRlcykgfHwgMzApLCBkZXNjcmlwdGlvbjogdGFzay5kZXNjcmlwdGlvbiA/IFN0cmluZyh0YXNrLmRlc2NyaXB0aW9uKSA6IFwiXCIgfTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGxhbihtb2RlOiBQbGFuTW9kZSwgZGF0ZTogc3RyaW5nLCBwbGFuOiBQbGFuUmVzdWx0KTogc3RyaW5nIHtcbiAgY29uc3QgYWxsVGFza3MgPSBbLi4ucGxhbi50YXNrcywgLi4uKHBsYW4ucmV2aWV3VGFza3MgPz8gW10pXTtcbiAgY29uc3QgZnJvbnRtYXR0ZXIgPSBhbGxUYXNrcy5mbGF0TWFwKCh0YXNrLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IGlkID0gYHRhc2ske1N0cmluZyhpbmRleCArIDEpLnBhZFN0YXJ0KDIsIFwiMFwiKX1gO1xuICAgIHJldHVybiBbYCR7aWR9TmFtZTogJHt5YW1sUXVvdGUodGFzay50aXRsZSl9YCwgYCR7aWR9Q2F0ZWdvcnk6ICR7eWFtbFF1b3RlKHRhc2suY2F0ZWdvcnkgfHwgXCJcdTUxNzZcdTVCODNcIil9YCwgYCR7aWR9RXN0aW1hdGVkTWludXRlczogJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXN9YCwgYCR7aWR9QWN0dWFsU3RhcnQ6YCwgYCR7aWR9QWN0dWFsRW5kOmAsIGAke2lkfUFjdHVhbE1pbnV0ZXM6IDBgLCBgJHtpZH1Gb2N1c1Nlc3Npb25zOiAwYF07XG4gIH0pO1xuICBjb25zdCB0YXNrQ2FyZHMgPSAobGFiZWw6IHN0cmluZywgdGFza3M6IFBsYW5UYXNrW10sIG9mZnNldDogbnVtYmVyKSA9PiB0YXNrcy5sZW5ndGggPyBgIyMgJHtsYWJlbH1cXG5cXG4ke3Rhc2tzLm1hcCgodGFzaywgaW5kZXgpID0+IHJlbmRlclRhc2sodGFzaywgZGF0ZSwgb2Zmc2V0ICsgaW5kZXggKyAxKSkuam9pbihcIlxcblxcblwiKX1gIDogYCMjICR7bGFiZWx9XFxuXFxuXHU2NjgyXHU2NUUwXHU1Qjg5XHU2MzkyXHUzMDAyYDtcbiAgcmV0dXJuIGAtLS1cXG50eXBlOiAke21vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU2QkNGXHU2NUU1XHU0RjVDXHU0RTFBXHU4QkExXHU1MjEyXCIgOiBcIlx1NkJDRlx1NjVFNVx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwifVxcbnBsYW5EYXRlOiAke2RhdGV9XFxudGFnczpcXG4gIC0gQUlcdThCQTFcdTUyMTJcXG4ke2Zyb250bWF0dGVyLmpvaW4oXCJcXG5cIil9XFxuLS0tXFxuXFxuIyAke3BsYW4udGl0bGV9XFxuXFxuPiBbIWFic3RyYWN0XSBcdTY5ODJcdTg5QzhcXG4+ICR7cGxhbi5zdW1tYXJ5IHx8IFwiXHU3NTMxIEFJIFBsYW5uZXIgXHU3NTFGXHU2MjEwXHVGRjBDXHU2MjY3XHU4ODRDXHU1NDBFXHU1ODZCXHU1MTk5XHU2QkNGXHU5ODc5XHU1QjlFXHU5NjQ1XHU1RjAwXHU1OUNCXHU1NDhDXHU1QjhDXHU2MjEwXHU2NUY2XHU5NUY0XHUzMDAyXCJ9XFxuXFxuJHt0YXNrQ2FyZHMobW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcdTg4NjhcIiA6IFwiXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXHU4ODY4XCIsIHBsYW4udGFza3MsIDApfVxcblxcbiR7bW9kZSA9PT0gXCJzdHVkeVwiID8gdGFza0NhcmRzKFwiXHU1OTBEXHU0RTYwXHU4QkExXHU1MjEyXHU4ODY4XCIsIHBsYW4ucmV2aWV3VGFza3MgPz8gW10sIHBsYW4udGFza3MubGVuZ3RoKSA6IFwiXCJ9XFxuYDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFzayh0YXNrOiBQbGFuVGFzaywgZGF0ZTogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcbiAgY29uc3QgcHJlZml4ID0gdGFzay5jYXRlZ29yeSA/IGAke3Rhc2suY2F0ZWdvcnl9IFx1MDBCNyBgIDogXCJcIjtcbiAgY29uc3QgdGltZSA9IHRhc2suc3RhcnRUaW1lICYmIHRhc2suZW5kVGltZSA/IGAke3Rhc2suc3RhcnRUaW1lfS0ke3Rhc2suZW5kVGltZX1gIDogXCJcdTVGODVcdTVCODlcdTYzOTJcIjtcbiAgY29uc3Qgbm90ZSA9IHRhc2suZGVzY3JpcHRpb24gPyBgXFxuPiAke3Rhc2suZGVzY3JpcHRpb259YCA6IFwiXCI7XG4gIHJldHVybiBgPiBbIXRvZG9dKyAke3ByZWZpeH0ke3Rhc2sudGl0bGV9XFxuPiBcdTY1RjZcdTZCQjVcdUZGMUEke3RpbWV9IFx1MDBCNyAke3Rhc2suZXN0aW1hdGVkTWludXRlc30gXHU1MjA2XHU5NDlGXFxuPiBcdTVCOUVcdTk2NDVcdTVGMDBcdTU5Q0JcdUZGMUFfX19fIFx1MDBCNyBcdTVCOUVcdTk2NDVcdTVCOENcdTYyMTBcdUZGMUFfX19fJHtub3RlfVxcbj4gLSBbIF0gJHt0YXNrLnRpdGxlfSBcdUQ4M0RcdURDQzUgJHtkYXRlfSAjXHU4QkExXHU1MjEyYDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUHJldmlld1Rhc2tzKHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHRhc2tzOiBQbGFuVGFza1tdKTogdm9pZCB7XG4gIHBhcmVudC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogbGFiZWwgfSk7XG4gIGlmICghdGFza3MubGVuZ3RoKSB7IHBhcmVudC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIk5vbmVcIiB9KTsgcmV0dXJuOyB9XG4gIGNvbnN0IGxpc3QgPSBwYXJlbnQuY3JlYXRlRWwoXCJ1bFwiKTtcbiAgZm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSBsaXN0LmNyZWF0ZUVsKFwibGlcIiwgeyB0ZXh0OiBgJHt0YXNrLnN0YXJ0VGltZSB8fCBcIlwifSR7dGFzay5lbmRUaW1lID8gYC0ke3Rhc2suZW5kVGltZX1gIDogXCJcIn0gJHt0YXNrLnRpdGxlfSAoJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXN9IG1pbilgLnRyaW0oKSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZW5zdXJlRm9sZGVyKGFwcDogQXBwLCBmb2xkZXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBwYXJ0cyA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyKS5zcGxpdChcIi9cIikuZmlsdGVyKEJvb2xlYW4pO1xuICBmb3IgKGxldCBpID0gMTsgaSA8PSBwYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHBhdGggPSBwYXJ0cy5zbGljZSgwLCBpKS5qb2luKFwiL1wiKTtcbiAgICBpZiAoIWFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCkpIGF3YWl0IGFwcC52YXVsdC5jcmVhdGVGb2xkZXIocGF0aCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2FmZUZpbGVuYW1lKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgeyByZXR1cm4gdmFsdWUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdL2csIFwiLVwiKS50cmltKCkuc2xpY2UoMCwgODApIHx8IFwiQUlcdThCQTFcdTUyMTJcIjsgfVxuZnVuY3Rpb24geWFtbFF1b3RlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpOyB9XG5mdW5jdGlvbiB0aW1lT2ZEYXkoZGF0ZTogRGF0ZSk6IHN0cmluZyB7IHJldHVybiBgJHtTdHJpbmcoZGF0ZS5nZXRIb3VycygpKS5wYWRTdGFydCgyLCBcIjBcIil9OiR7U3RyaW5nKGRhdGUuZ2V0TWludXRlcygpKS5wYWRTdGFydCgyLCBcIjBcIil9YDsgfVxuZnVuY3Rpb24gZm9ybWF0RHVyYXRpb24obWlsbGlzZWNvbmRzOiBudW1iZXIpOiBzdHJpbmcgeyBjb25zdCB0b3RhbCA9IE1hdGguY2VpbChtaWxsaXNlY29uZHMgLyAxMDAwKTsgcmV0dXJuIGAke1N0cmluZyhNYXRoLmZsb29yKHRvdGFsIC8gNjApKS5wYWRTdGFydCgyLCBcIjBcIil9OiR7U3RyaW5nKHRvdGFsICUgNjApLnBhZFN0YXJ0KDIsIFwiMFwiKX1gOyB9XG5mdW5jdGlvbiBsb2NhbERhdGUoKTogc3RyaW5nIHsgY29uc3Qgbm93ID0gbmV3IERhdGUoKTsgY29uc3Qgb2Zmc2V0ID0gbm93LmdldFRpbWV6b25lT2Zmc2V0KCkgKiA2MDAwMDsgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgLSBvZmZzZXQpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApOyB9XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFBd0c7QUFrRHhHLElBQU0sbUJBQW9DO0FBQUEsRUFDeEMsVUFBVTtBQUFBLEVBQ1YsbUJBQW1CO0FBQUEsRUFDbkIsWUFBWTtBQUFBLEVBQ1osUUFBUTtBQUFBLEVBQ1IsT0FBTztBQUFBLEVBQ1AsZUFBZTtBQUFBLEVBQ2YsYUFBYTtBQUFBLEVBQ2IsV0FBVztBQUFBLEVBQ1gsYUFBYTtBQUFBLEVBQ2IsY0FBYztBQUFBLEVBQ2QsYUFBYTtBQUFBLEVBQ2IsWUFBWTtBQUNkO0FBRUEsSUFBTSxZQUFtRjtBQUFBLEVBQ3ZGLFFBQVEsRUFBRSxPQUFPLHlFQUFzQyxTQUFTLElBQUks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
