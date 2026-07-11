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
var MOBILE_PLAN_EDITOR_VIEW = "ai-planner-mobile-editor";
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
      callback: () => void this.openPlanEditor()
    });
    this.addCommand({ id: "start-focus-session", name: "Start focus session", callback: () => this.openFocusForActiveNote() });
    this.addCommand({ id: "resume-focus-session", name: "Resume focus session", callback: () => this.restoreFocusTimer() });
    this.addRibbonIcon("calendar-plus", "Create AI plan", () => void this.openPlanEditor());
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
    this.registerInterval(window.setInterval(() => void this.refreshFocusStatus(), 500));
    this.registerView(MOBILE_PLAN_EDITOR_VIEW, (leaf) => new MobilePlanEditorView(leaf, this));
    await this.refreshFocusStatus();
  }
  async openPlanEditor() {
    if (!import_obsidian.Platform.isMobile) {
      new PlanInputModal(this.app, this).open();
      return;
    }
    const existing = this.app.workspace.getLeavesOfType(MOBILE_PLAN_EDITOR_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: MOBILE_PLAN_EDITOR_VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  keepFocusedInputVisible(target) {
    const content = target.closest(".modal-content");
    if (!content) return;
    const move = () => {
      const targetRect = target.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const targetTop = targetRect.top - contentRect.top + content.scrollTop;
      const desiredTop = Math.max(24, Math.round(content.clientHeight * 0.2));
      content.scrollTop = Math.max(0, targetTop - desiredTop);
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
var MobilePlanEditorView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  mode = "study";
  date = localDate();
  startTime = "";
  endTime = "";
  input = "";
  getViewType() {
    return MOBILE_PLAN_EDITOR_VIEW;
  }
  getDisplayText() {
    return "AI Planner";
  }
  getIcon() {
    return "calendar-plus";
  }
  async onOpen() {
    this.render();
  }
  render() {
    this.contentEl.empty();
    this.contentEl.addClass("ai-planner-mobile-editor");
    this.contentEl.createEl("h1", { text: "AI Planner / AI \u8BA1\u5212" });
    const form = this.contentEl.createDiv({ cls: "ai-planner-mobile-form" });
    const mode = this.field(form, "\u6A21\u5F0F / Mode").createEl("select");
    mode.createEl("option", { value: "study", text: "\u4F5C\u4E1A\u4E0E\u5B66\u4E60 / Homework & study" });
    mode.createEl("option", { value: "work", text: "\u5DE5\u4F5C / Work" });
    mode.value = this.mode;
    mode.addEventListener("change", () => this.mode = mode.value);
    const date = this.field(form, "\u8BA1\u5212\u65E5\u671F / Plan date").createEl("input", { type: "date" });
    date.value = this.date;
    date.addEventListener("input", () => this.date = date.value);
    const start = this.createMobileTimeInput(this.field(form, "\u5F00\u59CB\u65F6\u95F4 / Start time", "\u53EF\u9009 / Optional."), this.startTime, (value) => this.startTime = value);
    const end = this.createMobileTimeInput(this.field(form, "\u6700\u665A\u7ED3\u675F / Latest finish", "\u53EF\u9009 / Optional."), this.endTime, (value) => this.endTime = value);
    this.field(form, "\u4EFB\u52A1\u6216\u4F5C\u4E1A / Tasks or homework", "\u586B\u5199\u79D1\u76EE/\u9879\u76EE\u3001\u4EFB\u52A1\u91CF\u3001\u622A\u6B62\u65F6\u95F4\u548C\u9650\u5236\u6761\u4EF6\u3002");
    const sourceBar = form.createDiv({ cls: "ai-planner-source" });
    const sourceLabel = sourceBar.createSpan({ text: "\u6765\u6E90 / Source: \u624B\u52A8\u8F93\u5165 / manual input" });
    const useActive = sourceBar.createEl("button", { text: "\u4F7F\u7528\u5F53\u524D\u7B14\u8BB0 / Use current note" });
    const choose = sourceBar.createEl("button", { text: "\u9009\u62E9 Markdown \u7B14\u8BB0 / Choose note" });
    const area = form.createEl("textarea", { cls: "ai-planner-input" });
    area.rows = 9;
    area.value = this.input;
    area.placeholder = "Example: Math workbook pages 12-14; memorize 20 English words; Chinese reading aloud.";
    area.addEventListener("input", () => this.input = area.value);
    const loadSource = async (file) => {
      const content = await this.app.vault.read(file);
      this.input = content;
      area.value = content;
      sourceLabel.setText(`\u6765\u6E90 / Source: ${file.path}`);
    };
    useActive.addEventListener("click", async () => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md") return new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Markdown \u7B14\u8BB0 / Open a Markdown note first.");
      try {
        await loadSource(file);
      } catch {
        new import_obsidian.Notice("Could not read the current note.");
      }
    });
    choose.addEventListener("click", () => new MarkdownFilePickerModal(this.app, async (file) => {
      try {
        await loadSource(file);
      } catch {
        new import_obsidian.Notice("Could not read that note.");
      }
    }).open());
    const action = this.contentEl.createDiv({ cls: "ai-planner-mobile-actions" });
    const generate = action.createEl("button", { text: "\u751F\u6210\u9884\u89C8 / Generate preview", cls: "mod-cta" });
    generate.addEventListener("click", async () => {
      if (!this.input.trim()) return new import_obsidian.Notice("\u8BF7\u81F3\u5C11\u586B\u5199\u4E00\u9879\u4EFB\u52A1 / Enter at least one task first.");
      generate.disabled = true;
      generate.setText("\u6B63\u5728\u751F\u6210 / Generating...");
      area.blur();
      try {
        const plan = await this.plugin.generatePlan(this.mode, this.date, this.startTime, this.endTime, this.input);
        new PlanPreviewModal(this.app, this.plugin, this.mode, this.date, plan).open();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Could not generate plan.");
        generate.disabled = false;
        generate.setText("\u751F\u6210\u9884\u89C8 / Generate preview");
      }
    });
  }
  field(parent, label, description) {
    const field = parent.createDiv({ cls: "ai-planner-mobile-field" });
    field.createEl("label", { text: label });
    if (description) field.createEl("small", { text: description });
    return field;
  }
  createMobileTimeInput(parent, value, onChange) {
    const input = parent.createEl("input", { cls: "ai-planner-mobile-time", placeholder: "HH:mm" });
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.maxLength = 5;
    input.value = value;
    input.addEventListener("input", () => onChange(input.value));
    input.addEventListener("blur", () => {
      const digits = input.value.replace(/\D/g, "");
      if (/^\d{4}$/.test(digits)) input.value = `${digits.slice(0, 2)}:${digits.slice(2)}`;
      onChange(input.value);
    });
    return input;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgSXRlbVZpZXcsIE1vZGFsLCBOb3RpY2UsIFBsYXRmb3JtLCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIFRGaWxlLCBXb3Jrc3BhY2VMZWFmLCBub3JtYWxpemVQYXRoLCByZXF1ZXN0VXJsIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbnR5cGUgUGxhbk1vZGUgPSBcInN0dWR5XCIgfCBcIndvcmtcIjtcbnR5cGUgUHJvdmlkZXJJZCA9IFwiY3VzdG9tXCIgfCBcIm9wZW5haVwiIHwgXCJjbGF1ZGVcIiB8IFwiZGVlcHNlZWtcIiB8IFwiZ2xtXCIgfCBcImtpbWlcIiB8IFwiZ2VtaW5pXCI7XG50eXBlIEludGVyZmFjZUxhbmd1YWdlID0gXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG5cbmNvbnN0IE1PQklMRV9QTEFOX0VESVRPUl9WSUVXID0gXCJhaS1wbGFubmVyLW1vYmlsZS1lZGl0b3JcIjtcblxuaW50ZXJmYWNlIFBsYW5uZXJTZXR0aW5ncyB7XG4gIHByb3ZpZGVyOiBQcm92aWRlcklkO1xuICBpbnRlcmZhY2VMYW5ndWFnZTogSW50ZXJmYWNlTGFuZ3VhZ2U7XG4gIGFwaUJhc2VVcmw6IHN0cmluZztcbiAgYXBpS2V5OiBzdHJpbmc7XG4gIG1vZGVsOiBzdHJpbmc7XG4gIGN1c3RvbUhlYWRlcnM6IHN0cmluZztcbiAgdGVtcGVyYXR1cmU6IG51bWJlcjtcbiAgbWF4VG9rZW5zOiBudW1iZXI7XG4gIGhpc3RvcnlEYXlzOiBudW1iZXI7XG4gIGZvY3VzTWludXRlczogbnVtYmVyO1xuICBzdHVkeUZvbGRlcjogc3RyaW5nO1xuICB3b3JrRm9sZGVyOiBzdHJpbmc7XG4gIGFjdGl2ZUZvY3VzPzogQWN0aXZlRm9jdXNTZXNzaW9uO1xuICBmb2N1c01pbmlQb3NpdGlvbj86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbn1cblxuaW50ZXJmYWNlIEFjdGl2ZUZvY3VzU2Vzc2lvbiB7XG4gIGZpbGVQYXRoOiBzdHJpbmc7XG4gIHRhc2tJZDogc3RyaW5nO1xuICB0YXNrTmFtZTogc3RyaW5nO1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICBkdXJhdGlvbk1zOiBudW1iZXI7XG4gIGZvY3VzZWRNczogbnVtYmVyO1xuICBydW5uaW5nQXQ6IG51bWJlciB8IG51bGw7XG4gIHN0YXJ0ZWRBdDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGxhblRhc2sge1xuICB0aXRsZTogc3RyaW5nO1xuICBjYXRlZ29yeT86IHN0cmluZztcbiAgc3RhcnRUaW1lPzogc3RyaW5nO1xuICBlbmRUaW1lPzogc3RyaW5nO1xuICBlc3RpbWF0ZWRNaW51dGVzOiBudW1iZXI7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGxhblJlc3VsdCB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHN1bW1hcnk/OiBzdHJpbmc7XG4gIHRhc2tzOiBQbGFuVGFza1tdO1xuICByZXZpZXdUYXNrcz86IFBsYW5UYXNrW107XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFBsYW5uZXJTZXR0aW5ncyA9IHtcbiAgcHJvdmlkZXI6IFwiY3VzdG9tXCIsXG4gIGludGVyZmFjZUxhbmd1YWdlOiBcImF1dG9cIixcbiAgYXBpQmFzZVVybDogXCJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsXG4gIGFwaUtleTogXCJcIixcbiAgbW9kZWw6IFwiZ3B0LTQuMS1taW5pXCIsXG4gIGN1c3RvbUhlYWRlcnM6IFwie31cIixcbiAgdGVtcGVyYXR1cmU6IDAuMyxcbiAgbWF4VG9rZW5zOiAxODAwLFxuICBoaXN0b3J5RGF5czogMTQsXG4gIGZvY3VzTWludXRlczogMjUsXG4gIHN0dWR5Rm9sZGVyOiBcIjA2X1RvZG8vXHU1QjY2XHU0RTYwXCIsXG4gIHdvcmtGb2xkZXI6IFwiMDFfXHU5ODc5XHU3NkVFL1x1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwiXG59O1xuXG5jb25zdCBQUk9WSURFUlM6IFJlY29yZDxQcm92aWRlcklkLCB7IGxhYmVsOiBzdHJpbmc7IGJhc2VVcmw6IHN0cmluZzsgbW9kZWw6IHN0cmluZyB9PiA9IHtcbiAgY3VzdG9tOiB7IGxhYmVsOiBcIkN1c3RvbSBPcGVuQUktY29tcGF0aWJsZSAvIFx1ODFFQVx1NUI5QVx1NEU0OVx1NTE3Q1x1NUJCOVx1NjNBNVx1NTNFM1wiLCBiYXNlVXJsOiBcIlwiLCBtb2RlbDogXCJcIiB9LFxuICBvcGVuYWk6IHsgbGFiZWw6IFwiT3BlbkFJXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MVwiLCBtb2RlbDogXCJncHQtNC4xLW1pbmlcIiB9LFxuICBjbGF1ZGU6IHsgbGFiZWw6IFwiQW50aHJvcGljIENsYXVkZVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLmFudGhyb3BpYy5jb20vdjFcIiwgbW9kZWw6IFwiY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0XCIgfSxcbiAgZGVlcHNlZWs6IHsgbGFiZWw6IFwiRGVlcFNlZWtcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5kZWVwc2Vlay5jb20vdjFcIiwgbW9kZWw6IFwiZGVlcHNlZWstY2hhdFwiIH0sXG4gIGdsbTogeyBsYWJlbDogXCJaaGlwdSBHTE0gLyBcdTY2N0FcdThDMzFcIiwgYmFzZVVybDogXCJodHRwczovL29wZW4uYmlnbW9kZWwuY24vYXBpL3BhYXMvdjRcIiwgbW9kZWw6IFwiZ2xtLTQtZmxhc2hcIiB9LFxuICBraW1pOiB7IGxhYmVsOiBcIktpbWkgLyBNb29uc2hvdFwiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLm1vb25zaG90LmNuL3YxXCIsIG1vZGVsOiBcIm1vb25zaG90LXYxLThrXCIgfSxcbiAgZ2VtaW5pOiB7IGxhYmVsOiBcIkdvb2dsZSBHZW1pbmlcIiwgYmFzZVVybDogXCJodHRwczovL2dlbmVyYXRpdmVsYW5ndWFnZS5nb29nbGVhcGlzLmNvbS92MWJldGFcIiwgbW9kZWw6IFwiZ2VtaW5pLTIuMC1mbGFzaFwiIH1cbn07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlcXVlc3RQbGFuQ29tcGxldGlvbihcbiAgc2V0dGluZ3M6IFBsYW5uZXJTZXR0aW5ncyxcbiAgYmFzZVVybDogc3RyaW5nLFxuICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICBzeXN0ZW06IHN0cmluZyxcbiAgdXNlcjogc3RyaW5nXG4pOiBQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2YgcmVxdWVzdFVybD4+PiB7XG4gIGlmIChzZXR0aW5ncy5wcm92aWRlciA9PT0gXCJjbGF1ZGVcIikge1xuICAgIGlmIChzZXR0aW5ncy5hcGlLZXkpIGhlYWRlcnNbXCJ4LWFwaS1rZXlcIl0gPSBzZXR0aW5ncy5hcGlLZXk7XG4gICAgaGVhZGVyc1tcImFudGhyb3BpYy12ZXJzaW9uXCJdID8/PSBcIjIwMjMtMDYtMDFcIjtcbiAgICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGAke2Jhc2VVcmx9L21lc3NhZ2VzYCwgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6IHNldHRpbmdzLm1vZGVsLCBtYXhfdG9rZW5zOiBzZXR0aW5ncy5tYXhUb2tlbnMsIHRlbXBlcmF0dXJlOiBzZXR0aW5ncy50ZW1wZXJhdHVyZSwgc3lzdGVtLCBtZXNzYWdlczogW3sgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHVzZXIgfV0gfSksIHRocm93OiBmYWxzZVxuICAgIH0pO1xuICB9XG4gIGlmIChzZXR0aW5ncy5wcm92aWRlciA9PT0gXCJnZW1pbmlcIikge1xuICAgIGNvbnN0IGtleSA9IHNldHRpbmdzLmFwaUtleSA/IGA/a2V5PSR7ZW5jb2RlVVJJQ29tcG9uZW50KHNldHRpbmdzLmFwaUtleSl9YCA6IFwiXCI7XG4gICAgcmV0dXJuIHJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBgJHtiYXNlVXJsfS9tb2RlbHMvJHtlbmNvZGVVUklDb21wb25lbnQoc2V0dGluZ3MubW9kZWwpfTpnZW5lcmF0ZUNvbnRlbnQke2tleX1gLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzeXN0ZW1JbnN0cnVjdGlvbjogeyBwYXJ0czogW3sgdGV4dDogc3lzdGVtIH1dIH0sIGNvbnRlbnRzOiBbeyByb2xlOiBcInVzZXJcIiwgcGFydHM6IFt7IHRleHQ6IHVzZXIgfV0gfV0sIGdlbmVyYXRpb25Db25maWc6IHsgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBtYXhPdXRwdXRUb2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgcmVzcG9uc2VNaW1lVHlwZTogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSB9KSwgdGhyb3c6IGZhbHNlXG4gICAgfSk7XG4gIH1cbiAgaWYgKHNldHRpbmdzLmFwaUtleSkgaGVhZGVycy5BdXRob3JpemF0aW9uID0gYEJlYXJlciAke3NldHRpbmdzLmFwaUtleX1gO1xuICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgdXJsOiBgJHtiYXNlVXJsfS9jaGF0L2NvbXBsZXRpb25zYCwgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycyxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiBzZXR0aW5ncy5tb2RlbCwgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBtYXhfdG9rZW5zOiBzZXR0aW5ncy5tYXhUb2tlbnMsIG1lc3NhZ2VzOiBbeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBzeXN0ZW0gfSwgeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogdXNlciB9XSB9KSwgdGhyb3c6IGZhbHNlXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0aW9uVGV4dChwcm92aWRlcjogUHJvdmlkZXJJZCwgcmVzcG9uc2U6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBqc29uID0gcmVzcG9uc2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmIChwcm92aWRlciA9PT0gXCJjbGF1ZGVcIikge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBqc29uLmNvbnRlbnQgYXMgQXJyYXk8eyB0eXBlPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgIHJldHVybiBjb250ZW50Py5maWx0ZXIocGFydCA9PiBwYXJ0LnR5cGUgPT09IFwidGV4dFwiKS5tYXAocGFydCA9PiBwYXJ0LnRleHQgPz8gXCJcIikuam9pbihcIlwiKTtcbiAgfVxuICBpZiAocHJvdmlkZXIgPT09IFwiZ2VtaW5pXCIpIHtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0ganNvbi5jYW5kaWRhdGVzIGFzIEFycmF5PHsgY29udGVudD86IHsgcGFydHM/OiBBcnJheTx7IHRleHQ/OiBzdHJpbmcgfT4gfSB9PiB8IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0cz8ubWFwKHBhcnQgPT4gcGFydC50ZXh0ID8/IFwiXCIpLmpvaW4oXCJcIik7XG4gIH1cbiAgY29uc3QgY2hvaWNlcyA9IGpzb24uY2hvaWNlcyBhcyBBcnJheTx7IG1lc3NhZ2U/OiB7IGNvbnRlbnQ/OiBzdHJpbmcgfSB9PiB8IHVuZGVmaW5lZDtcbiAgcmV0dXJuIGNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQUlQbGFubmVyUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgcGx1Z2luU2V0dGluZ3MhOiBQbGFubmVyU2V0dGluZ3M7XG4gIHByaXZhdGUgZm9jdXNTdGF0dXNFbCE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGZvY3VzTWluaUVsITogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gIHByaXZhdGUgZmluaXNoaW5nRm9jdXMgPSBmYWxzZTtcbiAgcHJpdmF0ZSBmb2N1c1RpbWVyT3BlbiA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlEcmFnZ2luZyA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlNb3ZlZCA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlTdGFydFggPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydFkgPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydExlZnQgPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydFRvcCA9IDA7XG5cbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucGx1Z2luU2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgQUlQbGFubmVyU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJjcmVhdGUtYWktcGxhblwiLFxuICAgICAgbmFtZTogXCJDcmVhdGUgQUkgcGxhblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHZvaWQgdGhpcy5vcGVuUGxhbkVkaXRvcigpXG4gICAgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwic3RhcnQtZm9jdXMtc2Vzc2lvblwiLCBuYW1lOiBcIlN0YXJ0IGZvY3VzIHNlc3Npb25cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcInJlc3VtZS1mb2N1cy1zZXNzaW9uXCIsIG5hbWU6IFwiUmVzdW1lIGZvY3VzIHNlc3Npb25cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKSB9KTtcbiAgICB0aGlzLmFkZFJpYmJvbkljb24oXCJjYWxlbmRhci1wbHVzXCIsIFwiQ3JlYXRlIEFJIHBsYW5cIiwgKCkgPT4gdm9pZCB0aGlzLm9wZW5QbGFuRWRpdG9yKCkpO1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcInRpbWVyXCIsIFwiU3RhcnQgZm9jdXMgc2Vzc2lvblwiLCAoKSA9PiB0aGlzLm9wZW5Gb2N1c0ZvckFjdGl2ZU5vdGUoKSk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsID0gdGhpcy5hZGRTdGF0dXNCYXJJdGVtKCk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLmFkZENsYXNzKFwiYWktcGxhbm5lci1mb2N1cy1zdGF0dXNcIik7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuZm9jdXNTdGF0dXNFbCwgXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKSk7XG4gICAgdGhpcy5mb2N1c01pbmlFbCA9IHRoaXMuYXBwLndvcmtzcGFjZS5jb250YWluZXJFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG4gICAgICBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1taW5pXCIsXG4gICAgICBhdHRyOiB7IHR5cGU6IFwiYnV0dG9uXCIsIFwiYXJpYS1sYWJlbFwiOiBcIlJlc3RvcmUgZm9jdXMgdGltZXJcIiB9XG4gICAgfSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuZm9jdXNNaW5pRWwsIFwiY2xpY2tcIiwgZXZlbnQgPT4ge1xuICAgICAgaWYgKHRoaXMubWluaU1vdmVkKSB7IGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IHJldHVybjsgfVxuICAgICAgdm9pZCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgfSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHRoaXMuZm9jdXNNaW5pRWwsIFwicG9pbnRlcmRvd25cIiwgZXZlbnQgPT4gdGhpcy5iZWdpbk1pbmlEcmFnKGV2ZW50KSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJwb2ludGVybW92ZVwiLCBldmVudCA9PiB0aGlzLm1vdmVNaW5pRHJhZyhldmVudCkpO1xuICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh3aW5kb3csIFwicG9pbnRlcnVwXCIsICgpID0+IHZvaWQgdGhpcy5lbmRNaW5pRHJhZygpKTtcbiAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHRoaXMuZm9jdXNNaW5pRWwucmVtb3ZlKCkpO1xuICAgIGNvbnN0IHVwZGF0ZVZpc2libGVIZWlnaHQgPSAoKTogdm9pZCA9PiB7XG4gICAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1pbih3aW5kb3cudmlzdWFsVmlld3BvcnQ/LmhlaWdodCA/PyB3aW5kb3cuaW5uZXJIZWlnaHQsIHdpbmRvdy5pbm5lckhlaWdodCk7XG4gICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoXCItLWFpLXBsYW5uZXItdmlzaWJsZS1oZWlnaHRcIiwgYCR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YCk7XG4gICAgfTtcbiAgICB1cGRhdGVWaXNpYmxlSGVpZ2h0KCk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCk7XG4gICAgaWYgKHdpbmRvdy52aXN1YWxWaWV3cG9ydCkge1xuICAgICAgY29uc3Qgdmlld3BvcnQgPSB3aW5kb3cudmlzdWFsVmlld3BvcnQ7XG4gICAgICB2aWV3cG9ydC5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHVwZGF0ZVZpc2libGVIZWlnaHQpO1xuICAgICAgdGhpcy5yZWdpc3RlcigoKSA9PiB2aWV3cG9ydC5yZW1vdmVFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHVwZGF0ZVZpc2libGVIZWlnaHQpKTtcbiAgICB9XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCBcImZvY3VzaW5cIiwgZXZlbnQgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0O1xuICAgICAgaWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHx8ICF0YXJnZXQubWF0Y2hlcyhcImlucHV0LCB0ZXh0YXJlYSwgc2VsZWN0XCIpKSByZXR1cm47XG4gICAgICBpZiAoIXRhcmdldC5jbG9zZXN0KFwiLmFpLXBsYW5uZXItbW9kYWxcIikpIHJldHVybjtcbiAgICAgIHRoaXMua2VlcEZvY3VzZWRJbnB1dFZpc2libGUodGFyZ2V0KTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVySW50ZXJ2YWwod2luZG93LnNldEludGVydmFsKCgpID0+IHZvaWQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKSwgNTAwKSk7XG4gICAgdGhpcy5yZWdpc3RlclZpZXcoTU9CSUxFX1BMQU5fRURJVE9SX1ZJRVcsIGxlYWYgPT4gbmV3IE1vYmlsZVBsYW5FZGl0b3JWaWV3KGxlYWYsIHRoaXMpKTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICB9XG5cbiAgYXN5bmMgb3BlblBsYW5FZGl0b3IoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFQbGF0Zm9ybS5pc01vYmlsZSkge1xuICAgICAgbmV3IFBsYW5JbnB1dE1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShNT0JJTEVfUExBTl9FRElUT1JfVklFVylbMF07XG4gICAgY29uc3QgbGVhZiA9IGV4aXN0aW5nID8/IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKFwidGFiXCIpO1xuICAgIGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHsgdHlwZTogTU9CSUxFX1BMQU5fRURJVE9SX1ZJRVcsIGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcbiAgfVxuXG4gIHByaXZhdGUga2VlcEZvY3VzZWRJbnB1dFZpc2libGUodGFyZ2V0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgIGNvbnN0IGNvbnRlbnQgPSB0YXJnZXQuY2xvc2VzdChcIi5tb2RhbC1jb250ZW50XCIpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAoIWNvbnRlbnQpIHJldHVybjtcbiAgICBjb25zdCBtb3ZlID0gKCk6IHZvaWQgPT4ge1xuICAgICAgY29uc3QgdGFyZ2V0UmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IGNvbnRlbnRSZWN0ID0gY29udGVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGNvbnN0IHRhcmdldFRvcCA9IHRhcmdldFJlY3QudG9wIC0gY29udGVudFJlY3QudG9wICsgY29udGVudC5zY3JvbGxUb3A7XG4gICAgICBjb25zdCBkZXNpcmVkVG9wID0gTWF0aC5tYXgoMjQsIE1hdGgucm91bmQoY29udGVudC5jbGllbnRIZWlnaHQgKiAwLjIpKTtcbiAgICAgIGNvbnRlbnQuc2Nyb2xsVG9wID0gTWF0aC5tYXgoMCwgdGFyZ2V0VG9wIC0gZGVzaXJlZFRvcCk7XG4gICAgfTtcbiAgICBmb3IgKGNvbnN0IGRlbGF5IG9mIFswLCAxODAsIDQyMCwgNzUwXSkgd2luZG93LnNldFRpbWVvdXQobW92ZSwgZGVsYXkpO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5wbHVnaW5TZXR0aW5ncyk7XG4gIH1cblxuICBnZXRBY3RpdmVGb2N1cygpOiBBY3RpdmVGb2N1c1Nlc3Npb24gfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICB9XG5cbiAgc2V0Rm9jdXNUaW1lck9wZW4ob3BlbjogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMuZm9jdXNUaW1lck9wZW4gPSBvcGVuO1xuICAgIHZvaWQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgfVxuXG4gIHByaXZhdGUgYmVnaW5NaW5pRHJhZyhldmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG4gICAgaWYgKGV2ZW50LmJ1dHRvbiAhPT0gMCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHRoaXMubWluaURyYWdnaW5nID0gdHJ1ZTtcbiAgICB0aGlzLm1pbmlNb3ZlZCA9IGZhbHNlO1xuICAgIHRoaXMubWluaVN0YXJ0WCA9IGV2ZW50LmNsaWVudFg7XG4gICAgdGhpcy5taW5pU3RhcnRZID0gZXZlbnQuY2xpZW50WTtcbiAgICB0aGlzLm1pbmlTdGFydExlZnQgPSByZWN0LmxlZnQ7XG4gICAgdGhpcy5taW5pU3RhcnRUb3AgPSByZWN0LnRvcDtcbiAgfVxuXG4gIHByaXZhdGUgbW92ZU1pbmlEcmFnKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMubWluaURyYWdnaW5nKSByZXR1cm47XG4gICAgY29uc3QgZHggPSBldmVudC5jbGllbnRYIC0gdGhpcy5taW5pU3RhcnRYO1xuICAgIGNvbnN0IGR5ID0gZXZlbnQuY2xpZW50WSAtIHRoaXMubWluaVN0YXJ0WTtcbiAgICBpZiAoIXRoaXMubWluaU1vdmVkICYmIE1hdGguaHlwb3QoZHgsIGR5KSA8IDYpIHJldHVybjtcbiAgICB0aGlzLm1pbmlNb3ZlZCA9IHRydWU7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCByZWN0ID0gdGhpcy5mb2N1c01pbmlFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBsZWZ0ID0gTWF0aC5taW4oTWF0aC5tYXgoOCwgdGhpcy5taW5pU3RhcnRMZWZ0ICsgZHgpLCBNYXRoLm1heCg4LCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGggLSA4KSk7XG4gICAgY29uc3QgdG9wID0gTWF0aC5taW4oTWF0aC5tYXgoOCwgdGhpcy5taW5pU3RhcnRUb3AgKyBkeSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gOCkpO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnJpZ2h0ID0gXCJhdXRvXCI7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5ib3R0b20gPSBcImF1dG9cIjtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5kTWluaURyYWcoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLm1pbmlEcmFnZ2luZykgcmV0dXJuO1xuICAgIHRoaXMubWluaURyYWdnaW5nID0gZmFsc2U7XG4gICAgaWYgKCF0aGlzLm1pbmlNb3ZlZCkgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMSwgd2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoKTtcbiAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgxLCB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCk7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbmlQb3NpdGlvbiA9IHsgeDogcmVjdC5sZWZ0IC8gd2lkdGgsIHk6IHJlY3QudG9wIC8gaGVpZ2h0IH07XG4gICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7IHRoaXMubWluaU1vdmVkID0gZmFsc2U7IH0sIDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseU1pbmlQb3NpdGlvbigpOiB2b2lkIHtcbiAgICBjb25zdCBwb3NpdGlvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW5pUG9zaXRpb247XG4gICAgaWYgKCFwb3NpdGlvbikgcmV0dXJuO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1pbihNYXRoLm1heCg4LCBwb3NpdGlvbi54ICogKHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCkpLCBNYXRoLm1heCg4LCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGggLSA4KSk7XG4gICAgY29uc3QgdG9wID0gTWF0aC5taW4oTWF0aC5tYXgoOCwgcG9zaXRpb24ueSAqICh3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCkpLCBNYXRoLm1heCg4LCB3aW5kb3cuaW5uZXJIZWlnaHQgLSByZWN0LmhlaWdodCAtIDgpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5yaWdodCA9IFwiYXV0b1wiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuYm90dG9tID0gXCJhdXRvXCI7XG4gIH1cblxuICBhc3luYyBvcGVuRm9jdXNGb3JBY3RpdmVOb3RlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzKSB7XG4gICAgICBhd2FpdCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgIGlmICghZmlsZSkgeyBuZXcgTm90aWNlKFwiXHU4QkY3XHU1MTQ4XHU2MjUzXHU1RjAwXHU0RTAwXHU0RTJBXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwIC8gT3BlbiBhIHBsYW4gbm90ZSBmaXJzdC5cIik7IHJldHVybjsgfVxuICAgIGNvbnN0IHRhc2tzID0gZXh0cmFjdEZvY3VzVGFza3ModGhpcy5hcHAsIGZpbGUpO1xuICAgIGlmICghdGFza3MubGVuZ3RoKSB7IG5ldyBOb3RpY2UoXCJcdTVGNTNcdTUyNERcdTdCMTRcdThCQjBcdTZDQTFcdTY3MDlcdTUzRUZcdTRFMTNcdTZDRThcdTc2ODRcdThCQTFcdTUyMTJcdTRFRkJcdTUyQTEgLyBObyBwbGFuIHRhc2tzIGZvdW5kLlwiKTsgcmV0dXJuOyB9XG4gICAgbmV3IEZvY3VzVGFza1BpY2tlck1vZGFsKHRoaXMuYXBwLCB0aGlzLCBmaWxlLCB0YXNrcykub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgc3RhcnRGb2N1cyhmaWxlOiBURmlsZSwgdGFzazogRm9jdXNUYXNrLCBtaW51dGVzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cykge1xuICAgICAgbmV3IE5vdGljZShcIlx1NURGMlx1NjcwOVx1OEZEQlx1ODg0Q1x1NEUyRFx1NzY4NFx1NEUxM1x1NkNFOCAvIEEgZm9jdXMgc2Vzc2lvbiBpcyBhbHJlYWR5IGFjdGl2ZS5cIik7XG4gICAgICBhd2FpdCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cyA9IHtcbiAgICAgIGZpbGVQYXRoOiBmaWxlLnBhdGgsXG4gICAgICB0YXNrSWQ6IHRhc2suaWQsXG4gICAgICB0YXNrTmFtZTogdGFzay5uYW1lLFxuICAgICAgY2F0ZWdvcnk6IHRhc2suY2F0ZWdvcnksXG4gICAgICBkdXJhdGlvbk1zOiBNYXRoLm1heCgxLCBtaW51dGVzKSAqIDYwMDAwLFxuICAgICAgZm9jdXNlZE1zOiAwLFxuICAgICAgcnVubmluZ0F0OiBzdGFydGVkQXQsXG4gICAgICBzdGFydGVkQXRcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Rhc2suaWR9QWN0dWFsU3RhcnRgXSA/Pz0gdGltZU9mRGF5KG5ldyBEYXRlKHN0YXJ0ZWRBdCkpO1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU2NUUwXHU2Q0Q1XHU3QUNCXHU1MzczXHU1MTk5XHU1MTY1XHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0XHVGRjBDXHU1QzA2XHU1NzI4XHU3RUQzXHU2NzVGXHU2NUY2XHU5MUNEXHU4QkQ1IC8gQ291bGQgbm90IHdyaXRlIHRoZSBzdGFydCB0aW1lIHlldDsgaXQgd2lsbCByZXRyeSBvbiBmaW5pc2guXCIpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHRvZ2dsZUZvY3VzUGF1c2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XG4gICAgaWYgKHNlc3Npb24ucnVubmluZ0F0ICE9PSBudWxsKSB7XG4gICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgc2Vzc2lvbi5ydW5uaW5nQXQgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IERhdGUubm93KCk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgfVxuXG4gIGFzeW5jIHJlc3RvcmVGb2N1c1RpbWVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoc2Vzc2lvbi5maWxlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NjI3RVx1NEUwRFx1NTIzMFx1NTM5Rlx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMFx1RkYwQ1x1NjVFMFx1NkNENVx1NUI4Q1x1NjIxMFx1NTZERVx1NTE5OSAvIFRoZSBwbGFuIG5vdGUgaXMgbWlzc2luZy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIGZpbmlzaEZvY3VzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbiB8fCB0aGlzLmZpbmlzaGluZ0ZvY3VzKSByZXR1cm47XG4gICAgdGhpcy5maW5pc2hpbmdGb2N1cyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCkge1xuICAgICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IG51bGw7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHNlc3Npb24uZmlsZVBhdGgpO1xuICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgICBuZXcgTm90aWNlKFwiXHU2MjdFXHU0RTBEXHU1MjMwXHU1MzlGXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwXHVGRjBDXHU0RTEzXHU2Q0U4XHU4QkIwXHU1RjU1XHU2NjgyXHU2NzJBXHU1MTk5XHU1MTY1IC8gUGxhbiBub3RlIG1pc3Npbmc7IGZvY3VzIHJlY29yZCB3YXMga2VwdC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdHVhbE1pbnV0ZXMgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHNlc3Npb24uZm9jdXNlZE1zIC8gNjAwMDApKTtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbFN0YXJ0YF0gPz89IHRpbWVPZkRheShuZXcgRGF0ZShzZXNzaW9uLnN0YXJ0ZWRBdCkpO1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxFbmRgXSA9IHRpbWVPZkRheShuZXcgRGF0ZSgpKTtcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsTWludXRlc2BdID0gTnVtYmVyKGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSArIGFjdHVhbE1pbnV0ZXM7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUZvY3VzU2Vzc2lvbnNgXSA9IE51bWJlcihmbVtgJHtzZXNzaW9uLnRhc2tJZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgKyAxO1xuICAgICAgfSk7XG4gICAgICB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzID0gdW5kZWZpbmVkO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgIG5ldyBOb3RpY2UoYFx1NURGMlx1OEJCMFx1NUY1NSAke2FjdHVhbE1pbnV0ZXN9IFx1NTIwNlx1OTQ5Rlx1NEUxM1x1NkNFOCAvIEZvY3VzIHJlY29yZGVkLmApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmZpbmlzaGluZ0ZvY3VzID0gZmFsc2U7XG4gICAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hGb2N1c1N0YXR1cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuZGlzcGxheSA9IHRoaXMuZm9jdXNUaW1lck9wZW4gPyBcIm5vbmVcIiA6IFwiXCI7XG4gICAgY29uc3QgZWxhcHNlZCA9IHNlc3Npb24uZm9jdXNlZE1zICsgKHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gMCA6IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBzZXNzaW9uLnJ1bm5pbmdBdCkpO1xuICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCAmJiBlbGFwc2VkID49IHNlc3Npb24uZHVyYXRpb25Ncykge1xuICAgICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldFRleHQoYEZvY3VzIGNvbXBsZXRlIFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTVCOENcdTYyMTAgLyBGb2N1cyBjb21wbGV0ZVwiKTtcbiAgICAgIHZvaWQgdGhpcy5maW5pc2hGb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ZSA9IHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gXCJGb2N1cyBwYXVzZWRcIiA6IGZvcm1hdER1cmF0aW9uKE1hdGgubWF4KDAsIHNlc3Npb24uZHVyYXRpb25NcyAtIGVsYXBzZWQpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc2V0VGV4dChgJHtzdGF0ZX0gXHUwMEI3ICR7c2Vzc2lvbi50YXNrTmFtZX1gKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoYCR7c3RhdGV9IFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCJSZXN0b3JlIGZvY3VzIHRpbWVyXCIpO1xuICAgIGlmICghdGhpcy5mb2N1c1RpbWVyT3Blbikgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmFwcGx5TWluaVBvc2l0aW9uKCkpO1xuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHN0YXJ0VGltZTogc3RyaW5nLCBlbmRUaW1lOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcpOiBQcm9taXNlPFBsYW5SZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCB8fCAhdGhpcy5wbHVnaW5TZXR0aW5ncy5tb2RlbCkgdGhyb3cgbmV3IEVycm9yKFwiUGxlYXNlIGNvbmZpZ3VyZSBhbiBBUEkgYmFzZSBVUkwgYW5kIG1vZGVsIGZpcnN0LlwiKTtcbiAgICBsZXQgY3VzdG9tSGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHRyeSB7XG4gICAgICBjdXN0b21IZWFkZXJzID0gSlNPTi5wYXJzZSh0aGlzLnBsdWdpblNldHRpbmdzLmN1c3RvbUhlYWRlcnMgfHwgXCJ7fVwiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1c3RvbSBoZWFkZXJzIG11c3QgYmUgdmFsaWQgSlNPTi5cIik7XG4gICAgfVxuICAgIGNvbnN0IHN5c3RlbSA9IG1vZGUgPT09IFwic3R1ZHlcIlxuICAgICAgPyBcIllvdSBjcmVhdGUgcHJhY3RpY2FsIHNhbWUtZGF5IGhvbWV3b3JrIHBsYW5zIGZvciBhIGNoaWxkLiBCcmVhayB0YXNrcyBpbnRvIGEgc2Vuc2libGUgb3JkZXIsIGluY2x1ZGUgc2hvcnQgYnJlYWtzIHdoZW4gaGVscGZ1bCwgYW5kIG9ubHkgYWRkIHJldmlldyB0YXNrcyBncm91bmRlZCBpbiB0aGUgZ2l2ZW4gaG9tZXdvcmsuXCJcbiAgICAgIDogXCJZb3UgY3JlYXRlIHByYWN0aWNhbCBzYW1lLWRheSB3b3JrIHBsYW5zLiBQcmlvcml0aXplIGJ5IHVyZ2VuY3kgYW5kIGNvZ25pdGl2ZSBsb2FkLCBpbmNsdWRlIGJ1ZmZlcnMsIGFuZCBkbyBub3QgaW52ZW50IHdvcmsgaXRlbXMuXCI7XG4gICAgY29uc3QgZm9sZGVyID0gbW9kZSA9PT0gXCJzdHVkeVwiID8gdGhpcy5wbHVnaW5TZXR0aW5ncy5zdHVkeUZvbGRlciA6IHRoaXMucGx1Z2luU2V0dGluZ3Mud29ya0ZvbGRlcjtcbiAgICBjb25zdCBoaXN0b3J5ID0gYnVpbGRIaXN0b3J5Q29udGV4dCh0aGlzLmFwcCwgZm9sZGVyLCB0aGlzLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKTtcbiAgICBjb25zdCB1c2VyID0gYFBsYW4gZGF0ZTogJHtkYXRlfVxcblN0YXJ0IHRpbWU6ICR7c3RhcnRUaW1lIHx8IFwibm90IHNwZWNpZmllZFwifVxcbkxhdGVzdCBmaW5pc2g6ICR7ZW5kVGltZSB8fCBcIm5vdCBzcGVjaWZpZWRcIn1cXG5JdGVtczpcXG4ke2lucHV0fVxcblxcbkhpc3RvcmljYWwgdGltaW5nIGNhbGlicmF0aW9uOlxcbiR7aGlzdG9yeX1cXG5cXG5Vc2UgdGhlIGNhbGlicmF0aW9uIG9ubHkgd2hlbiBpdCBoYXMgYXQgbGVhc3QgdHdvIGNvbXBhcmFibGUgcmVjb3Jkcy4gUmV0dXJuIEpTT04gb25seSwgd2l0aCB0aGlzIHNoYXBlOiB7XCJ0aXRsZVwiOlwic2hvcnQgdGl0bGVcIixcInN1bW1hcnlcIjpcIm9uZSBzZW50ZW5jZVwiLFwidGFza3NcIjpbe1widGl0bGVcIjpcInRhc2tcIixcImNhdGVnb3J5XCI6XCJzdWJqZWN0IG9yIHByb2plY3RcIixcInN0YXJ0VGltZVwiOlwiSEg6bW1cIixcImVuZFRpbWVcIjpcIkhIOm1tXCIsXCJlc3RpbWF0ZWRNaW51dGVzXCI6MzAsXCJkZXNjcmlwdGlvblwiOlwib3B0aW9uYWxcIn1dLFwicmV2aWV3VGFza3NcIjpbc2FtZSB0YXNrIHNoYXBlXX0uIFVzZSBbXSBmb3IgcmV2aWV3VGFza3Mgd2hlbiBub25lIGFyZSBqdXN0aWZpZWQuYDtcbiAgICBjb25zdCBiYXNlVXJsID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiwgLi4uY3VzdG9tSGVhZGVycyB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFBsYW5Db21wbGV0aW9uKHRoaXMucGx1Z2luU2V0dGluZ3MsIGJhc2VVcmwsIGhlYWRlcnMsIHN5c3RlbSwgdXNlcik7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB0aHJvdyBuZXcgRXJyb3IoYEFQSSByZXF1ZXN0IGZhaWxlZCAoJHtyZXNwb25zZS5zdGF0dXN9KTogJHtyZXNwb25zZS50ZXh0LnNsaWNlKDAsIDMwMCl9YCk7XG4gICAgY29uc3QgY29udGVudCA9IGNvbXBsZXRpb25UZXh0KHRoaXMucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIsIHJlc3BvbnNlLmpzb24pO1xuICAgIGlmICh0eXBlb2YgY29udGVudCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHByb3ZpZGVyIGRpZCBub3QgcmV0dXJuIGEgY2hhdCBjb21wbGV0aW9uLlwiKTtcbiAgICByZXR1cm4gcGFyc2VQbGFuKGNvbnRlbnQpO1xuICB9XG5cbiAgYXN5bmMgd3JpdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGZvbGRlciA9IG1vZGUgPT09IFwic3R1ZHlcIiA/IHRoaXMucGx1Z2luU2V0dGluZ3Muc3R1ZHlGb2xkZXIgOiB0aGlzLnBsdWdpblNldHRpbmdzLndvcmtGb2xkZXI7XG4gICAgYXdhaXQgZW5zdXJlRm9sZGVyKHRoaXMuYXBwLCBmb2xkZXIpO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7ZGF0ZX0tJHtzYWZlRmlsZW5hbWUocGxhbi50aXRsZSB8fCAobW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCIpKX0ubWRgO1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKGAke2ZvbGRlcn0vJHtmaWxlbmFtZX1gKTtcbiAgICBjb25zdCBjb250ZW50ID0gcmVuZGVyUGxhbihtb2RlLCBkYXRlLCBwbGFuKTtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcgaW5zdGFuY2VvZiBURmlsZSkgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGV4aXN0aW5nLCBjb250ZW50KTtcbiAgICBlbHNlIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShwYXRoLCBjb250ZW50KTtcbiAgICBhd2FpdCB0aGlzLmFwcC53b3Jrc3BhY2Uub3BlbkxpbmtUZXh0KHBhdGgsIFwiXCIsIHRydWUpO1xuICAgIHJldHVybiBwYXRoO1xuICB9XG59XG5cbmludGVyZmFjZSBGb2N1c1Rhc2sgeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGNhdGVnb3J5OiBzdHJpbmc7IGVzdGltYXRlZE1pbnV0ZXM6IG51bWJlcjsgfVxuXG5mdW5jdGlvbiBleHRyYWN0Rm9jdXNUYXNrcyhhcHA6IEFwcCwgZmlsZTogVEZpbGUpOiBGb2N1c1Rhc2tbXSB7XG4gIGNvbnN0IGZtID0gYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoa2V5ID0+IC9edGFza1xcZCtOYW1lJC8udGVzdChrZXkpKS5zb3J0KCkubWFwKGtleSA9PiB7XG4gICAgY29uc3QgaWQgPSBrZXkucmVwbGFjZShcIk5hbWVcIiwgXCJcIik7XG4gICAgcmV0dXJuIHsgaWQsIG5hbWU6IFN0cmluZyhmbVtrZXldID8/IGlkKSwgY2F0ZWdvcnk6IFN0cmluZyhmbVtgJHtpZH1DYXRlZ29yeWBdID8/IFwiXCIpLCBlc3RpbWF0ZWRNaW51dGVzOiBOdW1iZXIoZm1bYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID8/IDApIH07XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBidWlsZEhpc3RvcnlDb250ZXh0KGFwcDogQXBwLCBmb2xkZXI6IHN0cmluZywgZGF5czogbnVtYmVyKTogc3RyaW5nIHtcbiAgY29uc3QgY3V0b2ZmID0gRGF0ZS5ub3coKSAtIGRheXMgKiA4NjQwMDAwMDtcbiAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHsgcGxhbm5lZDogbnVtYmVyOyBhY3R1YWw6IG51bWJlcjsgY291bnQ6IG51bWJlciB9PigpO1xuICBmb3IgKGNvbnN0IGZpbGUgb2YgYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKSkge1xuICAgIGlmICghZmlsZS5wYXRoLnN0YXJ0c1dpdGgoYCR7bm9ybWFsaXplUGF0aChmb2xkZXIpfS9gKSB8fCBmaWxlLnN0YXQubXRpbWUgPCBjdXRvZmYpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGZtID0gYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhmbSkuZmlsdGVyKGl0ZW0gPT4gL150YXNrXFxkK05hbWUkLy50ZXN0KGl0ZW0pKSkge1xuICAgICAgY29uc3QgaWQgPSBrZXkucmVwbGFjZShcIk5hbWVcIiwgXCJcIik7XG4gICAgICBjb25zdCBwbGFubmVkID0gTnVtYmVyKGZtW2Ake2lkfUVzdGltYXRlZE1pbnV0ZXNgXSA/PyAwKTtcbiAgICAgIGNvbnN0IGFjdHVhbCA9IE51bWJlcihmbVtgJHtpZH1BY3R1YWxNaW51dGVzYF0gPz8gMCkgfHwgZHVyYXRpb25Gcm9tVGltZXMoZm1bYCR7aWR9QWN0dWFsU3RhcnRgXSwgZm1bYCR7aWR9QWN0dWFsRW5kYF0pO1xuICAgICAgaWYgKHBsYW5uZWQgPD0gMCB8fCBhY3R1YWwgPD0gMCkgY29udGludWU7XG4gICAgICBjb25zdCBjYXRlZ29yeSA9IFN0cmluZyhmbVtgJHtpZH1DYXRlZ29yeWBdID8/IFN0cmluZyhmbVtrZXldKS5zcGxpdChcIlx1MDBCN1wiKVswXSA/PyBcIlx1NTE3Nlx1NUI4M1wiKS50cmltKCkgfHwgXCJcdTUxNzZcdTVCODNcIjtcbiAgICAgIGNvbnN0IGl0ZW0gPSBncm91cHMuZ2V0KGNhdGVnb3J5KSA/PyB7IHBsYW5uZWQ6IDAsIGFjdHVhbDogMCwgY291bnQ6IDAgfTtcbiAgICAgIGl0ZW0ucGxhbm5lZCArPSBwbGFubmVkOyBpdGVtLmFjdHVhbCArPSBhY3R1YWw7IGl0ZW0uY291bnQgKz0gMTsgZ3JvdXBzLnNldChjYXRlZ29yeSwgaXRlbSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IGxpbmVzID0gWy4uLmdyb3Vwcy5lbnRyaWVzKCldLmZpbHRlcigoWywgdmFsdWVdKSA9PiB2YWx1ZS5jb3VudCA+PSAyKS5zb3J0KChhLCBiKSA9PiBiWzFdLmNvdW50IC0gYVsxXS5jb3VudCkuc2xpY2UoMCwgNikubWFwKChbY2F0ZWdvcnksIHZhbHVlXSkgPT4ge1xuICAgIGNvbnN0IHBlcmNlbnQgPSBNYXRoLnJvdW5kKCh2YWx1ZS5hY3R1YWwgLyB2YWx1ZS5wbGFubmVkIC0gMSkgKiAxMDApO1xuICAgIHJldHVybiBgJHtjYXRlZ29yeX06ICR7dmFsdWUuY291bnR9IHJlY29yZHMsIHBsYW5uZWQgJHt2YWx1ZS5wbGFubmVkfSBtaW4sIGFjdHVhbCAke3ZhbHVlLmFjdHVhbH0gbWluLCBkZXZpYXRpb24gJHtwZXJjZW50ID49IDAgPyBcIitcIiA6IFwiXCJ9JHtwZXJjZW50fSVgO1xuICB9KTtcbiAgcmV0dXJuIGxpbmVzLmxlbmd0aCA/IGxpbmVzLmpvaW4oXCJcXG5cIikgOiBcIk5vIHJlbGlhYmxlIGhpc3RvcmljYWwgcmVjb3JkcyB5ZXQuIFVzZSByZWFzb25hYmxlIGVzdGltYXRlcyBhbmQgYSBzbWFsbCBidWZmZXIuXCI7XG59XG5cbmZ1bmN0aW9uIGR1cmF0aW9uRnJvbVRpbWVzKHN0YXJ0OiB1bmtub3duLCBlbmQ6IHVua25vd24pOiBudW1iZXIge1xuICBjb25zdCBwYXJzZSA9ICh2YWx1ZTogdW5rbm93bik6IG51bWJlciB8IG51bGwgPT4geyBjb25zdCBtYXRjaCA9IFN0cmluZyh2YWx1ZSA/PyBcIlwiKS5tYXRjaCgvXihcXGR7MSwyfSk6KFxcZHsyfSkkLyk7IHJldHVybiBtYXRjaCA/IE51bWJlcihtYXRjaFsxXSkgKiA2MCArIE51bWJlcihtYXRjaFsyXSkgOiBudWxsOyB9O1xuICBjb25zdCBmcm9tID0gcGFyc2Uoc3RhcnQpLCB0byA9IHBhcnNlKGVuZCk7XG4gIHJldHVybiBmcm9tID09PSBudWxsIHx8IHRvID09PSBudWxsID8gMCA6ICh0byA+PSBmcm9tID8gdG8gLSBmcm9tIDogdG8gKyAxNDQwIC0gZnJvbSk7XG59XG5cbmNsYXNzIEZvY3VzVGFza1BpY2tlck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG1pbnV0ZXM6IG51bWJlcjtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4sIHByaXZhdGUgcmVhZG9ubHkgZmlsZTogVEZpbGUsIHByaXZhdGUgcmVhZG9ubHkgdGFza3M6IEZvY3VzVGFza1tdKSB7IHN1cGVyKGFwcCk7IHRoaXMubWludXRlcyA9IHBsdWdpbi5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbnV0ZXM7IH1cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTZBMjFcdTVGMEYgLyBGb2N1cyBtb2RlXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU0RTEzXHU2Q0U4XHU2NUY2XHU5NTdGIC8gRm9jdXMgZHVyYXRpb25cIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd24uYWRkT3B0aW9uKFwiMjVcIiwgXCIyNSBtaW5cIikuYWRkT3B0aW9uKFwiNTBcIiwgXCI1MCBtaW5cIikuYWRkT3B0aW9uKFwiOTBcIiwgXCI5MCBtaW5cIikuc2V0VmFsdWUoU3RyaW5nKHRoaXMubWludXRlcykpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMubWludXRlcyA9IE51bWJlcih2YWx1ZSkpKTtcbiAgICBjb25zdCBjdXN0b20gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJudW1iZXJcIiwgcGxhY2Vob2xkZXI6IFwiQ3VzdG9tIG1pbnV0ZXMgLyBcdTgxRUFcdTVCOUFcdTRFNDlcdTUyMDZcdTk0OUZcIiB9KTtcbiAgICBjdXN0b20uYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHsgY29uc3QgdmFsdWUgPSBOdW1iZXIoY3VzdG9tLnZhbHVlKTsgaWYgKHZhbHVlID4gMCkgdGhpcy5taW51dGVzID0gdmFsdWU7IH0pO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBcIlx1OTAwOVx1NjJFOVx1NEVGQlx1NTJBMSAvIENob29zZSBhIHRhc2tcIiB9KTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy50YXNrcykge1xuICAgICAgY29uc3QgYnV0dG9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy10YXNrXCIgfSk7XG4gICAgICBidXR0b24uc2V0VGV4dChgJHt0YXNrLmNhdGVnb3J5ID8gYCR7dGFzay5jYXRlZ29yeX0gXHUwMEI3IGAgOiBcIlwifSR7dGFzay5uYW1lfSAoJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXMgfHwgXCI/XCJ9IG1pbilgKTtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4geyB0aGlzLmNsb3NlKCk7IHZvaWQgdGhpcy5wbHVnaW4uc3RhcnRGb2N1cyh0aGlzLmZpbGUsIHRhc2ssIHRoaXMubWludXRlcyk7IH0pO1xuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBGb2N1c1RpbWVyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgaW50ZXJ2YWw6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVGb2N1cygpO1xuICAgIGlmICghc2Vzc2lvbikgeyB0aGlzLmNsb3NlKCk7IHJldHVybjsgfVxuICAgIHRoaXMucGx1Z2luLnNldEZvY3VzVGltZXJPcGVuKHRydWUpO1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIiwgXCJhaS1wbGFubmVyLWZvY3VzLXRpbWVyXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiXHU0RTEzXHU2Q0U4XHU0RTJEIC8gRm9jdXNpbmdcIik7XG4gICAgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogc2Vzc2lvbi50YXNrTmFtZSwgY2xzOiBcImFpLXBsYW5uZXItZm9jdXMtdGl0bGVcIiB9KTtcbiAgICBjb25zdCBjbG9jayA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcImFpLXBsYW5uZXItZm9jdXMtY2xvY2tcIiB9KTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwge1xuICAgICAgdGV4dDogXCJcdTUxNzNcdTk1RURcdTZCNjRcdTdBOTdcdTUzRTNcdTUzRUFcdTRGMUFcdTY3MDBcdTVDMEZcdTUzMTZcdUZGMENcdThCQTFcdTY1RjZcdTRGMUFcdTRGRERcdTc1NTlcdTMwMDJcdTYyNEJcdTY3M0FcdTUyMDdcdTYzNjJcdTUyMzBcdTUxNzZcdTVCODMgQXBwIFx1NTQwRVx1NjMwOVx1N0VDRlx1OEZDN1x1NzY4NFx1NTg5OVx1NEUwQVx1NjVGNlx1OTVGNFx1NEYzMFx1N0I5N1x1RkYxQmlPUyBcdTUzRUZcdTgwRkRcdTY2ODJcdTUwNUNcdTYyMTZcdTU2REVcdTY1MzYgT2JzaWRpYW5cdUZGMENcdTU2RTBcdTZCNjRcdThGRDlcdTRFMERcdTRFRTNcdTg4NjhcdTVERjJcdTlBOENcdThCQzFcdTc2ODRcdTRFMTNcdTZDRThcdTYyMTZcdTk2MDVcdThCRkJcdTY1RjZcdTk1N0ZcdTMwMDIgLyBDbG9zaW5nIG9ubHkgbWluaW1pemVzIHRoaXMgdGltZXIuIE1vYmlsZSBiYWNrZ3JvdW5kIHRpbWUgaXMgYSB3YWxsLWNsb2NrIGVzdGltYXRlOyBpT1MgbWF5IHN1c3BlbmQgb3IgdGVybWluYXRlIE9ic2lkaWFuLCBzbyBpdCBpcyBub3QgdmVyaWZpZWQgZm9jdXMgb3IgcmVhZGluZyB0aW1lLlwiLFxuICAgICAgY2xzOiBcImFpLXBsYW5uZXItZm9jdXMtZGlzY2xhaW1lclwiXG4gICAgfSk7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGFsLWJ1dHRvbi1jb250YWluZXJcIiB9KTtcbiAgICBjb25zdCBwYXVzZSA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU2NjgyXHU1MDVDIC8gUGF1c2VcIiB9KTtcbiAgICBjb25zdCBmaW5pc2ggPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1N0VEM1x1Njc1RiAvIEZpbmlzaFwiLCBjbHM6IFwibW9kLWN0YVwiIH0pO1xuICAgIGNvbnN0IHJlZnJlc2ggPSAoKTogdm9pZCA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5wbHVnaW4uZ2V0QWN0aXZlRm9jdXMoKTtcbiAgICAgIGlmICghY3VycmVudCkgeyB0aGlzLmNsb3NlKCk7IHJldHVybjsgfVxuICAgICAgY29uc3QgZWxhcHNlZCA9IGN1cnJlbnQuZm9jdXNlZE1zICsgKGN1cnJlbnQucnVubmluZ0F0ID09PSBudWxsID8gMCA6IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBjdXJyZW50LnJ1bm5pbmdBdCkpO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gTWF0aC5tYXgoMCwgY3VycmVudC5kdXJhdGlvbk1zIC0gZWxhcHNlZCk7XG4gICAgICBjbG9jay5zZXRUZXh0KGZvcm1hdER1cmF0aW9uKHJlbWFpbmluZykpO1xuICAgICAgcGF1c2Uuc2V0VGV4dChjdXJyZW50LnJ1bm5pbmdBdCA9PT0gbnVsbCA/IFwiXHU3RUU3XHU3RUVEIC8gUmVzdW1lXCIgOiBcIlx1NjY4Mlx1NTA1QyAvIFBhdXNlXCIpO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwKSB2b2lkIHRoaXMucGx1Z2luLmZpbmlzaEZvY3VzKCk7XG4gICAgfTtcbiAgICBwYXVzZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnBsdWdpbi50b2dnbGVGb2N1c1BhdXNlKCkudGhlbihyZWZyZXNoKSk7XG4gICAgZmluaXNoLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucGx1Z2luLmZpbmlzaEZvY3VzKCkudGhlbigoKSA9PiB0aGlzLmNsb3NlKCkpKTtcbiAgICB0aGlzLmludGVydmFsID0gd2luZG93LnNldEludGVydmFsKHJlZnJlc2gsIDUwMCk7IHJlZnJlc2goKTtcbiAgfVxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmludGVydmFsICE9PSBudWxsKSB3aW5kb3cuY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsKTtcbiAgICB0aGlzLnBsdWdpbi5zZXRGb2N1c1RpbWVyT3BlbihmYWxzZSk7XG4gIH1cbn1cblxuY2xhc3MgTW9iaWxlUGxhbkVkaXRvclZpZXcgZXh0ZW5kcyBJdGVtVmlldyB7XG4gIHByaXZhdGUgbW9kZTogUGxhbk1vZGUgPSBcInN0dWR5XCI7XG4gIHByaXZhdGUgZGF0ZSA9IGxvY2FsRGF0ZSgpO1xuICBwcml2YXRlIHN0YXJ0VGltZSA9IFwiXCI7XG4gIHByaXZhdGUgZW5kVGltZSA9IFwiXCI7XG4gIHByaXZhdGUgaW5wdXQgPSBcIlwiO1xuXG4gIGNvbnN0cnVjdG9yKGxlYWY6IFdvcmtzcGFjZUxlYWYsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4pIHsgc3VwZXIobGVhZik7IH1cblxuICBnZXRWaWV3VHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gTU9CSUxFX1BMQU5fRURJVE9SX1ZJRVc7IH1cbiAgZ2V0RGlzcGxheVRleHQoKTogc3RyaW5nIHsgcmV0dXJuIFwiQUkgUGxhbm5lclwiOyB9XG4gIGdldEljb24oKTogc3RyaW5nIHsgcmV0dXJuIFwiY2FsZW5kYXItcGx1c1wiOyB9XG5cbiAgYXN5bmMgb25PcGVuKCk6IFByb21pc2U8dm9pZD4geyB0aGlzLnJlbmRlcigpOyB9XG5cbiAgcHJpdmF0ZSByZW5kZXIoKTogdm9pZCB7XG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcbiAgICB0aGlzLmNvbnRlbnRFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9iaWxlLWVkaXRvclwiKTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImgxXCIsIHsgdGV4dDogXCJBSSBQbGFubmVyIC8gQUkgXHU4QkExXHU1MjEyXCIgfSk7XG5cbiAgICBjb25zdCBmb3JtID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItbW9iaWxlLWZvcm1cIiB9KTtcbiAgICBjb25zdCBtb2RlID0gdGhpcy5maWVsZChmb3JtLCBcIlx1NkEyMVx1NUYwRiAvIE1vZGVcIikuY3JlYXRlRWwoXCJzZWxlY3RcIik7XG4gICAgbW9kZS5jcmVhdGVFbChcIm9wdGlvblwiLCB7IHZhbHVlOiBcInN0dWR5XCIsIHRleHQ6IFwiXHU0RjVDXHU0RTFBXHU0RTBFXHU1QjY2XHU0RTYwIC8gSG9tZXdvcmsgJiBzdHVkeVwiIH0pO1xuICAgIG1vZGUuY3JlYXRlRWwoXCJvcHRpb25cIiwgeyB2YWx1ZTogXCJ3b3JrXCIsIHRleHQ6IFwiXHU1REU1XHU0RjVDIC8gV29ya1wiIH0pO1xuICAgIG1vZGUudmFsdWUgPSB0aGlzLm1vZGU7XG4gICAgbW9kZS5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHRoaXMubW9kZSA9IG1vZGUudmFsdWUgYXMgUGxhbk1vZGUpO1xuXG4gICAgY29uc3QgZGF0ZSA9IHRoaXMuZmllbGQoZm9ybSwgXCJcdThCQTFcdTUyMTJcdTY1RTVcdTY3MUYgLyBQbGFuIGRhdGVcIikuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IHR5cGU6IFwiZGF0ZVwiIH0pO1xuICAgIGRhdGUudmFsdWUgPSB0aGlzLmRhdGU7XG4gICAgZGF0ZS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gdGhpcy5kYXRlID0gZGF0ZS52YWx1ZSk7XG5cbiAgICBjb25zdCBzdGFydCA9IHRoaXMuY3JlYXRlTW9iaWxlVGltZUlucHV0KHRoaXMuZmllbGQoZm9ybSwgXCJcdTVGMDBcdTU5Q0JcdTY1RjZcdTk1RjQgLyBTdGFydCB0aW1lXCIsIFwiXHU1M0VGXHU5MDA5IC8gT3B0aW9uYWwuXCIpLCB0aGlzLnN0YXJ0VGltZSwgdmFsdWUgPT4gdGhpcy5zdGFydFRpbWUgPSB2YWx1ZSk7XG4gICAgY29uc3QgZW5kID0gdGhpcy5jcmVhdGVNb2JpbGVUaW1lSW5wdXQodGhpcy5maWVsZChmb3JtLCBcIlx1NjcwMFx1NjY1QVx1N0VEM1x1Njc1RiAvIExhdGVzdCBmaW5pc2hcIiwgXCJcdTUzRUZcdTkwMDkgLyBPcHRpb25hbC5cIiksIHRoaXMuZW5kVGltZSwgdmFsdWUgPT4gdGhpcy5lbmRUaW1lID0gdmFsdWUpO1xuXG4gICAgdGhpcy5maWVsZChmb3JtLCBcIlx1NEVGQlx1NTJBMVx1NjIxNlx1NEY1Q1x1NEUxQSAvIFRhc2tzIG9yIGhvbWV3b3JrXCIsIFwiXHU1ODZCXHU1MTk5XHU3OUQxXHU3NkVFL1x1OTg3OVx1NzZFRVx1MzAwMVx1NEVGQlx1NTJBMVx1OTFDRlx1MzAwMVx1NjIyQVx1NkI2Mlx1NjVGNlx1OTVGNFx1NTQ4Q1x1OTY1MFx1NTIzNlx1Njc2MVx1NEVGNlx1MzAwMlwiKTtcbiAgICBjb25zdCBzb3VyY2VCYXIgPSBmb3JtLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLXNvdXJjZVwiIH0pO1xuICAgIGNvbnN0IHNvdXJjZUxhYmVsID0gc291cmNlQmFyLmNyZWF0ZVNwYW4oeyB0ZXh0OiBcIlx1Njc2NVx1NkU5MCAvIFNvdXJjZTogXHU2MjRCXHU1MkE4XHU4RjkzXHU1MTY1IC8gbWFudWFsIGlucHV0XCIgfSk7XG4gICAgY29uc3QgdXNlQWN0aXZlID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTRGN0ZcdTc1MjhcdTVGNTNcdTUyNERcdTdCMTRcdThCQjAgLyBVc2UgY3VycmVudCBub3RlXCIgfSk7XG4gICAgY29uc3QgY2hvb3NlID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTkwMDlcdTYyRTkgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gQ2hvb3NlIG5vdGVcIiB9KTtcbiAgICBjb25zdCBhcmVhID0gZm9ybS5jcmVhdGVFbChcInRleHRhcmVhXCIsIHsgY2xzOiBcImFpLXBsYW5uZXItaW5wdXRcIiB9KTtcbiAgICBhcmVhLnJvd3MgPSA5O1xuICAgIGFyZWEudmFsdWUgPSB0aGlzLmlucHV0O1xuICAgIGFyZWEucGxhY2Vob2xkZXIgPSBcIkV4YW1wbGU6IE1hdGggd29ya2Jvb2sgcGFnZXMgMTItMTQ7IG1lbW9yaXplIDIwIEVuZ2xpc2ggd29yZHM7IENoaW5lc2UgcmVhZGluZyBhbG91ZC5cIjtcbiAgICBhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLmlucHV0ID0gYXJlYS52YWx1ZSk7XG4gICAgY29uc3QgbG9hZFNvdXJjZSA9IGFzeW5jIChmaWxlOiBURmlsZSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICB0aGlzLmlucHV0ID0gY29udGVudDtcbiAgICAgIGFyZWEudmFsdWUgPSBjb250ZW50O1xuICAgICAgc291cmNlTGFiZWwuc2V0VGV4dChgXHU2NzY1XHU2RTkwIC8gU291cmNlOiAke2ZpbGUucGF0aH1gKTtcbiAgICB9O1xuICAgIHVzZUFjdGl2ZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICBpZiAoIWZpbGUgfHwgZmlsZS5leHRlbnNpb24gIT09IFwibWRcIikgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkEgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gT3BlbiBhIE1hcmtkb3duIG5vdGUgZmlyc3QuXCIpO1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShmaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGUgY3VycmVudCBub3RlLlwiKTsgfVxuICAgIH0pO1xuICAgIGNob29zZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gbmV3IE1hcmtkb3duRmlsZVBpY2tlck1vZGFsKHRoaXMuYXBwLCBhc3luYyBmaWxlID0+IHtcbiAgICAgIHRyeSB7IGF3YWl0IGxvYWRTb3VyY2UoZmlsZSk7IH0gY2F0Y2ggeyBuZXcgTm90aWNlKFwiQ291bGQgbm90IHJlYWQgdGhhdCBub3RlLlwiKTsgfVxuICAgIH0pLm9wZW4oKSk7XG5cbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtYWN0aW9uc1wiIH0pO1xuICAgIGNvbnN0IGdlbmVyYXRlID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgZ2VuZXJhdGUuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5pbnB1dC50cmltKCkpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU4MUYzXHU1QzExXHU1ODZCXHU1MTk5XHU0RTAwXHU5ODc5XHU0RUZCXHU1MkExIC8gRW50ZXIgYXQgbGVhc3Qgb25lIHRhc2sgZmlyc3QuXCIpO1xuICAgICAgZ2VuZXJhdGUuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgZ2VuZXJhdGUuc2V0VGV4dChcIlx1NkI2M1x1NTcyOFx1NzUxRlx1NjIxMCAvIEdlbmVyYXRpbmcuLi5cIik7XG4gICAgICBhcmVhLmJsdXIoKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBsYW4gPSBhd2FpdCB0aGlzLnBsdWdpbi5nZW5lcmF0ZVBsYW4odGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMuc3RhcnRUaW1lLCB0aGlzLmVuZFRpbWUsIHRoaXMuaW5wdXQpO1xuICAgICAgICBuZXcgUGxhblByZXZpZXdNb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHRoaXMubW9kZSwgdGhpcy5kYXRlLCBwbGFuKS5vcGVuKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3QgZ2VuZXJhdGUgcGxhbi5cIik7XG4gICAgICAgIGdlbmVyYXRlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGdlbmVyYXRlLnNldFRleHQoXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBmaWVsZChwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBmaWVsZCA9IHBhcmVudC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtZmllbGRcIiB9KTtcbiAgICBmaWVsZC5jcmVhdGVFbChcImxhYmVsXCIsIHsgdGV4dDogbGFiZWwgfSk7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBmaWVsZC5jcmVhdGVFbChcInNtYWxsXCIsIHsgdGV4dDogZGVzY3JpcHRpb24gfSk7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVNb2JpbGVUaW1lSW5wdXQocGFyZW50OiBIVE1MRWxlbWVudCwgdmFsdWU6IHN0cmluZywgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKTogSFRNTElucHV0RWxlbWVudCB7XG4gICAgY29uc3QgaW5wdXQgPSBwYXJlbnQuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IGNsczogXCJhaS1wbGFubmVyLW1vYmlsZS10aW1lXCIsIHBsYWNlaG9sZGVyOiBcIkhIOm1tXCIgfSk7XG4gICAgaW5wdXQudHlwZSA9IFwidGV4dFwiO1xuICAgIGlucHV0LmlucHV0TW9kZSA9IFwibnVtZXJpY1wiO1xuICAgIGlucHV0LmF1dG9jb21wbGV0ZSA9IFwib2ZmXCI7XG4gICAgaW5wdXQubWF4TGVuZ3RoID0gNTtcbiAgICBpbnB1dC52YWx1ZSA9IHZhbHVlO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiBvbkNoYW5nZShpbnB1dC52YWx1ZSkpO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJibHVyXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGRpZ2l0cyA9IGlucHV0LnZhbHVlLnJlcGxhY2UoL1xcRC9nLCBcIlwiKTtcbiAgICAgIGlmICgvXlxcZHs0fSQvLnRlc3QoZGlnaXRzKSkgaW5wdXQudmFsdWUgPSBgJHtkaWdpdHMuc2xpY2UoMCwgMil9OiR7ZGlnaXRzLnNsaWNlKDIpfWA7XG4gICAgICBvbkNoYW5nZShpbnB1dC52YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGlucHV0O1xuICB9XG59XG5cbmNsYXNzIFBsYW5JbnB1dE1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG1vZGU6IFBsYW5Nb2RlID0gXCJzdHVkeVwiO1xuICBwcml2YXRlIGRhdGUgPSBsb2NhbERhdGUoKTtcbiAgcHJpdmF0ZSBzdGFydFRpbWUgPSBcIlwiO1xuICBwcml2YXRlIGVuZFRpbWUgPSBcIlwiO1xuICBwcml2YXRlIGlucHV0ID0gXCJcIjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJBSSBQbGFubmVyIC8gQUkgXHU4QkExXHU1MjEyXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU2QTIxXHU1RjBGIC8gTW9kZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxuICAgICAgLmFkZE9wdGlvbihcInN0dWR5XCIsIFwiXHU0RjVDXHU0RTFBXHU0RTBFXHU1QjY2XHU0RTYwIC8gSG9tZXdvcmsgJiBzdHVkeVwiKVxuICAgICAgLmFkZE9wdGlvbihcIndvcmtcIiwgXCJcdTVERTVcdTRGNUMgLyBXb3JrXCIpXG4gICAgICAuc2V0VmFsdWUodGhpcy5tb2RlKVxuICAgICAgLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMubW9kZSA9IHZhbHVlIGFzIFBsYW5Nb2RlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdThCQTFcdTUyMTJcdTY1RTVcdTY3MUYgLyBQbGFuIGRhdGVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dFxuICAgICAgLnNldFZhbHVlKHRoaXMuZGF0ZSkuc2V0UGxhY2Vob2xkZXIoXCJZWVlZLU1NLUREXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuZGF0ZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTVGMDBcdTU5Q0JcdTY1RjZcdTk1RjQgLyBTdGFydCB0aW1lXCIpLnNldERlc2MoXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiAxOTowMFwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0XG4gICAgICAuc2V0VmFsdWUodGhpcy5zdGFydFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMTk6MDBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5zdGFydFRpbWUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU2NzAwXHU2NjVBXHU3RUQzXHU2NzVGIC8gTGF0ZXN0IGZpbmlzaFwiKS5zZXREZXNjKFwiXHU1M0VGXHU5MDA5IC8gT3B0aW9uYWwuXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXRcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLmVuZFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMjE6MDBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5lbmRUaW1lID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NEVGQlx1NTJBMVx1NjIxNlx1NEY1Q1x1NEUxQSAvIFRhc2tzIG9yIGhvbWV3b3JrXCIpLnNldERlc2MoXCJcdTU4NkJcdTUxOTlcdTc5RDFcdTc2RUUvXHU5ODc5XHU3NkVFXHUzMDAxXHU0RUZCXHU1MkExXHU5MUNGXHUzMDAxXHU2MjJBXHU2QjYyXHU2NUY2XHU5NUY0XHU1NDhDXHU5NjUwXHU1MjM2XHU2NzYxXHU0RUY2XHUzMDAyXCIpO1xuICAgIGNvbnN0IHNvdXJjZUJhciA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLXNvdXJjZVwiIH0pO1xuICAgIGNvbnN0IHNvdXJjZUxhYmVsID0gc291cmNlQmFyLmNyZWF0ZVNwYW4oeyB0ZXh0OiBcIlx1Njc2NVx1NkU5MCAvIFNvdXJjZTogXHU2MjRCXHU1MkE4XHU4RjkzXHU1MTY1IC8gbWFudWFsIGlucHV0XCIgfSk7XG4gICAgY29uc3QgdXNlQWN0aXZlQnV0dG9uID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTRGN0ZcdTc1MjhcdTVGNTNcdTUyNERcdTdCMTRcdThCQjAgLyBVc2UgY3VycmVudCBub3RlXCIgfSk7XG4gICAgY29uc3QgY2hvb3NlQnV0dG9uID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTkwMDlcdTYyRTkgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gQ2hvb3NlIG5vdGVcIiB9KTtcbiAgICBjb25zdCBhcmVhID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJ0ZXh0YXJlYVwiLCB7IGNsczogXCJhaS1wbGFubmVyLWlucHV0XCIgfSk7XG4gICAgYXJlYS5yb3dzID0gODtcbiAgICBhcmVhLnBsYWNlaG9sZGVyID0gXCJFeGFtcGxlOiBNYXRoIHdvcmtib29rIHBhZ2VzIDEyLTE0OyBtZW1vcml6ZSAyMCBFbmdsaXNoIHdvcmRzOyBDaGluZXNlIHJlYWRpbmcgYWxvdWQuXCI7XG4gICAgYXJlYS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gdGhpcy5pbnB1dCA9IGFyZWEudmFsdWUpO1xuICAgIGNvbnN0IGxvYWRTb3VyY2UgPSBhc3luYyAoZmlsZTogVEZpbGUpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgdGhpcy5pbnB1dCA9IGNvbnRlbnQ7XG4gICAgICBhcmVhLnZhbHVlID0gY29udGVudDtcbiAgICAgIHNvdXJjZUxhYmVsLnNldFRleHQoYFx1Njc2NVx1NkU5MCAvIFNvdXJjZTogJHtmaWxlLnBhdGh9YCk7XG4gICAgfTtcbiAgICB1c2VBY3RpdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGFjdGl2ZUZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgaWYgKCFhY3RpdmVGaWxlIHx8IGFjdGl2ZUZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU1MTQ4XHU2MjUzXHU1RjAwXHU0RTAwXHU0RTJBIE1hcmtkb3duIFx1N0IxNFx1OEJCMCAvIE9wZW4gYSBNYXJrZG93biBub3RlIGZpcnN0LlwiKTtcbiAgICAgIHRyeSB7IGF3YWl0IGxvYWRTb3VyY2UoYWN0aXZlRmlsZSk7IH0gY2F0Y2ggeyBuZXcgTm90aWNlKFwiQ291bGQgbm90IHJlYWQgdGhlIGN1cnJlbnQgbm90ZS5cIik7IH1cbiAgICB9KTtcbiAgICBjaG9vc2VCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IG5ldyBNYXJrZG93bkZpbGVQaWNrZXJNb2RhbCh0aGlzLmFwcCwgYXN5bmMgZmlsZSA9PiB7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoYXQgbm90ZS5cIik7IH1cbiAgICB9KS5vcGVuKCkpO1xuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJtb2RhbC1idXR0b24tY29udGFpbmVyXCIgfSk7XG4gICAgY29uc3QgYnV0dG9uID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuaW5wdXQudHJpbSgpKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1ODFGM1x1NUMxMVx1NTg2Qlx1NTE5OVx1NEUwMFx1OTg3OVx1NEVGQlx1NTJBMSAvIEVudGVyIGF0IGxlYXN0IG9uZSB0YXNrIGZpcnN0LlwiKTtcbiAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBidXR0b24uc2V0VGV4dChcIlx1NkI2M1x1NTcyOFx1NzUxRlx1NjIxMCAvIEdlbmVyYXRpbmcuLi5cIik7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwbGFuID0gYXdhaXQgdGhpcy5wbHVnaW4uZ2VuZXJhdGVQbGFuKHRoaXMubW9kZSwgdGhpcy5kYXRlLCB0aGlzLnN0YXJ0VGltZSwgdGhpcy5lbmRUaW1lLCB0aGlzLmlucHV0KTtcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICBuZXcgUGxhblByZXZpZXdNb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHRoaXMubW9kZSwgdGhpcy5kYXRlLCBwbGFuKS5vcGVuKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3QgZ2VuZXJhdGUgcGxhbi5cIik7XG4gICAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICBidXR0b24uc2V0VGV4dChcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgcXVlcnkgPSBcIlwiO1xuICBwcml2YXRlIHJlYWRvbmx5IGZpbGVzOiBURmlsZVtdO1xuICBwcml2YXRlIHJlc3VsdHNFbDogSFRNTEVsZW1lbnQ7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgb25DaG9vc2U6IChmaWxlOiBURmlsZSkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMuZmlsZXMgPSBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xuICAgIHRoaXMucmVzdWx0c0VsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIsIFwiYWktcGxhbm5lci1maWxlLXBpY2tlclwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiKTtcbiAgICBjb25zdCBzZWFyY2ggPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJzZWFyY2hcIiwgcGxhY2Vob2xkZXI6IFwiXHU2NDFDXHU3RDIyXHU3QjE0XHU4QkIwIC8gU2VhcmNoIG5vdGVzLi4uXCIsIGNsczogXCJhaS1wbGFubmVyLWZpbGUtc2VhcmNoXCIgfSk7XG4gICAgc2VhcmNoLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7IHRoaXMucXVlcnkgPSBzZWFyY2gudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7IHRoaXMucmVuZGVyUmVzdWx0cygpOyB9KTtcbiAgICB0aGlzLnJlc3VsdHNFbCA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLWZpbGUtcmVzdWx0c1wiIH0pO1xuICAgIHRoaXMucmVuZGVyUmVzdWx0cygpO1xuICAgIHNlYXJjaC5mb2N1cygpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJSZXN1bHRzKCk6IHZvaWQge1xuICAgIHRoaXMucmVzdWx0c0VsLmVtcHR5KCk7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHRoaXMuZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5wYXRoLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGhpcy5xdWVyeSkpLnNsaWNlKDAsIDEwMCk7XG4gICAgaWYgKCFtYXRjaGVzLmxlbmd0aCkgeyB0aGlzLnJlc3VsdHNFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIk5vIE1hcmtkb3duIG5vdGVzIGZvdW5kLlwiIH0pOyByZXR1cm47IH1cbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgbWF0Y2hlcykge1xuICAgICAgY29uc3QgYnV0dG9uID0gdGhpcy5yZXN1bHRzRWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwiYWktcGxhbm5lci1maWxlLWl0ZW1cIiB9KTtcbiAgICAgIGJ1dHRvbi5jcmVhdGVFbChcInN0cm9uZ1wiLCB7IHRleHQ6IGZpbGUuYmFzZW5hbWUgfSk7XG4gICAgICBidXR0b24uY3JlYXRlRWwoXCJzbWFsbFwiLCB7IHRleHQ6IGZpbGUucGF0aCB9KTtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4geyBhd2FpdCB0aGlzLm9uQ2hvb3NlKGZpbGUpOyB0aGlzLmNsb3NlKCk7IH0pO1xuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBQbGFuUHJldmlld01vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBtb2RlOiBQbGFuTW9kZSwgcHJpdmF0ZSByZWFkb25seSBkYXRlOiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgcGxhbjogUGxhblJlc3VsdCkgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQodGhpcy5wbGFuLnRpdGxlIHx8IFwiUGxhbiBwcmV2aWV3XCIpO1xuICAgIGlmICh0aGlzLnBsYW4uc3VtbWFyeSkgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogdGhpcy5wbGFuLnN1bW1hcnkgfSk7XG4gICAgcmVuZGVyUHJldmlld1Rhc2tzKHRoaXMuY29udGVudEVsLCBcIlBsYW5cIiwgdGhpcy5wbGFuLnRhc2tzKTtcbiAgICBpZiAodGhpcy5tb2RlID09PSBcInN0dWR5XCIpIHJlbmRlclByZXZpZXdUYXNrcyh0aGlzLmNvbnRlbnRFbCwgXCJSZXZpZXdcIiwgdGhpcy5wbGFuLnJldmlld1Rhc2tzID8/IFtdKTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuY2xvc2UoKSk7XG4gICAgYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJXcml0ZSBwbGFuXCIsIGNsczogXCJtb2QtY3RhXCIgfSkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCB0aGlzLnBsdWdpbi53cml0ZVBsYW4odGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMucGxhbik7XG4gICAgICAgIG5ldyBOb3RpY2UoYFBsYW4gd3JpdHRlbjogJHtwYXRofWApO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3Qgd3JpdGUgcGxhbi5cIik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgQUlQbGFubmVyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHAsIHBsdWdpbik7IH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIHRoaXMuY29udGFpbmVyRWwuZW1wdHkoKTtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkFJIFBsYW5uZXIgXHU4QkJFXHU3RjZFIC8gU2V0dGluZ3NcIiB9KTtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiQ2xhdWRlIFx1NEUwRSBHZW1pbmkgXHU0RjdGXHU3NTI4XHU1MzlGXHU3NTFGXHU2M0E1XHU1M0UzXHVGRjFCXHU1MTc2XHU1QjgzXHU5ODg0XHU4QkJFXHU0RjdGXHU3NTI4IE9wZW5BSS1jb21wYXRpYmxlIFx1NjNBNVx1NTNFM1x1MzAwMkNsYXVkZSBhbmQgR2VtaW5pIHVzZSBuYXRpdmUgQVBJIGZvcm1hdHMuXCIgfSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NzU0Q1x1OTc2Mlx1OEJFRFx1OEEwMCAvIEludGVyZmFjZSBsYW5ndWFnZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxuICAgICAgLmFkZE9wdGlvbihcImF1dG9cIiwgXCJcdThEREZcdTk2OEZcdTdDRkJcdTdFREYgLyBGb2xsb3cgc3lzdGVtXCIpXG4gICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgIC5hZGRPcHRpb24oXCJlblwiLCBcIkVuZ2xpc2hcIilcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5pbnRlcmZhY2VMYW5ndWFnZSlcbiAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmludGVyZmFjZUxhbmd1YWdlID0gdmFsdWUgYXMgSW50ZXJmYWNlTGFuZ3VhZ2U7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NjcwRFx1NTJBMVx1NTU0Nlx1OTg4NFx1OEJCRSAvIFByb3ZpZGVyIHByZXNldFwiKS5zZXREZXNjKFwiXHU5MDA5XHU2MkU5XHU1NDBFXHU0RjFBXHU1ODZCXHU1MTY1XHU2M0E4XHU4MzUwXHU1NzMwXHU1NzQwXHU0RTBFXHU2QTIxXHU1NzhCXHVGRjBDXHU1M0VGXHU3RUU3XHU3RUVEXHU2MjRCXHU1MkE4XHU0RkVFXHU2NTM5XHUzMDAyXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcbiAgICAgIGZvciAoY29uc3QgW2lkLCBwcmVzZXRdIG9mIE9iamVjdC5lbnRyaWVzKFBST1ZJREVSUykpIGRyb3Bkb3duLmFkZE9wdGlvbihpZCwgcHJlc2V0LmxhYmVsKTtcbiAgICAgIGRyb3Bkb3duLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnByb3ZpZGVyKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gdmFsdWUgYXMgUHJvdmlkZXJJZDtcbiAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICAgICAgaWYgKHByb3ZpZGVyICE9PSBcImN1c3RvbVwiKSB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCA9IFBST1ZJREVSU1twcm92aWRlcl0uYmFzZVVybDtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tb2RlbCA9IFBST1ZJREVSU1twcm92aWRlcl0ubW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIkFQSSBcdTU3MzBcdTU3NDAgLyBBUEkgYmFzZSBVUkxcIiwgXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiBodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsIFwiYXBpQmFzZVVybFwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiQVBJIFx1NUJDNlx1OTRBNSAvIEFQSSBrZXlcIikuc2V0RGVzYyhcIlN0b3JlZCBpbiB0aGlzIHBsdWdpbidzIGRhdGEuanNvbi5cIikuYWRkVGV4dChpbnB1dCA9PiB7XG4gICAgICBpbnB1dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlLZXkpLnNldFBsYWNlaG9sZGVyKFwic2stLi4uXCIpO1xuICAgICAgaW5wdXQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuICAgICAgaW5wdXQub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlLZXkgPSB2YWx1ZTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pO1xuICAgIH0pO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTZBMjFcdTU3OEIgLyBNb2RlbFwiLCBcIlx1NEY4Qlx1NTk4MiAvIEV4YW1wbGU6IGdwdC00LjEtbWluaSwgZGVlcHNlZWstY2hhdCwgZ2xtLTQtZmxhc2hcIiwgXCJtb2RlbFwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU4MUVBXHU1QjlBXHU0RTQ5XHU4QkY3XHU2QzQyXHU1OTM0IC8gQ3VzdG9tIGhlYWRlcnNcIiwgXCJKU09OIG9iamVjdCwgb3B0aW9uYWwuXCIsIFwiY3VzdG9tSGVhZGVyc1wiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2RTI5XHU1RUE2IC8gVGVtcGVyYXR1cmVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MudGVtcGVyYXR1cmUpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnRlbXBlcmF0dXJlID0gTnVtYmVyKHZhbHVlKSB8fCAwOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTY3MDBcdTU5MjdcdThGOTNcdTUxRkFcdTk1N0ZcdTVFQTYgLyBNYXggb3V0cHV0IHRva2Vuc1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tYXhUb2tlbnMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLm1heFRva2VucyA9IE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5tYXhUb2tlbnM7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NTM4Nlx1NTNGMlx1NjgyMVx1NTFDNlx1NTkyOVx1NjU3MCAvIEhpc3RvcnkgZGF5c1wiKS5zZXREZXNjKFwiXHU3NTFGXHU2MjEwXHU4QkExXHU1MjEyXHU2NUY2XHU4QkZCXHU1M0Q2XHU4RkQxXHU2NzFGXHU3NzFGXHU1QjlFXHU3NTI4XHU2NUY2XHVGRjBDXHU1RUZBXHU4QkFFIDctMzAgXHU1OTI5XHUzMDAyXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5oaXN0b3J5RGF5cyA9IE1hdGgubWF4KDEsIE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5oaXN0b3J5RGF5cyk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1OUVEOFx1OEJBNFx1NEUxM1x1NkNFOFx1NTIwNlx1OTQ5RiAvIERlZmF1bHQgZm9jdXMgbWludXRlc1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbnV0ZXMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlcyA9IE1hdGgubWF4KDEsIE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5mb2N1c01pbnV0ZXMpOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTVCNjZcdTRFNjBcdThGOTNcdTUxRkFcdTc2RUVcdTVGNTUgLyBTdHVkeSBvdXRwdXQgZm9sZGVyXCIsIFwiVmF1bHQtcmVsYXRpdmUgcGF0aC5cIiwgXCJzdHVkeUZvbGRlclwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU1REU1XHU0RjVDXHU4RjkzXHU1MUZBXHU3NkVFXHU1RjU1IC8gV29yayBvdXRwdXQgZm9sZGVyXCIsIFwiVmF1bHQtcmVsYXRpdmUgcGF0aC5cIiwgXCJ3b3JrRm9sZGVyXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSB0ZXh0U2V0dGluZyhuYW1lOiBzdHJpbmcsIGRlc2M6IHN0cmluZywga2V5OiBcImFwaUJhc2VVcmxcIiB8IFwibW9kZWxcIiB8IFwiY3VzdG9tSGVhZGVyc1wiIHwgXCJzdHVkeUZvbGRlclwiIHwgXCJ3b3JrRm9sZGVyXCIpOiB2b2lkIHtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKG5hbWUpLnNldERlc2MoZGVzYykuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5nc1trZXldKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzW2tleV0gPSB2YWx1ZS50cmltKCk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VQbGFuKGNvbnRlbnQ6IHN0cmluZyk6IFBsYW5SZXN1bHQge1xuICBjb25zdCBqc29uID0gY29udGVudC50cmltKCkucmVwbGFjZSgvXmBgYCg/Ompzb24pP1xccyovaSwgXCJcIikucmVwbGFjZSgvXFxzKmBgYCQvLCBcIlwiKTtcbiAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uKSBhcyBQbGFuUmVzdWx0O1xuICBpZiAoIXBhcnNlZC50aXRsZSB8fCAhQXJyYXkuaXNBcnJheShwYXJzZWQudGFza3MpKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgbW9kZWwgcmV0dXJuZWQgYW4gaW52YWxpZCBwbGFuIGZvcm1hdC5cIik7XG4gIHBhcnNlZC50YXNrcyA9IHBhcnNlZC50YXNrcy5tYXAobm9ybWFsaXplVGFzaykuZmlsdGVyKEJvb2xlYW4pIGFzIFBsYW5UYXNrW107XG4gIHBhcnNlZC5yZXZpZXdUYXNrcyA9IEFycmF5LmlzQXJyYXkocGFyc2VkLnJldmlld1Rhc2tzKSA/IHBhcnNlZC5yZXZpZXdUYXNrcy5tYXAobm9ybWFsaXplVGFzaykuZmlsdGVyKEJvb2xlYW4pIGFzIFBsYW5UYXNrW10gOiBbXTtcbiAgaWYgKCFwYXJzZWQudGFza3MubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgbW9kZWwgZGlkIG5vdCByZXR1cm4gYW55IHRhc2tzLlwiKTtcbiAgcmV0dXJuIHBhcnNlZDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplVGFzayh2YWx1ZTogdW5rbm93bik6IFBsYW5UYXNrIHwgbnVsbCB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgdGFzayA9IHZhbHVlIGFzIFBhcnRpYWw8UGxhblRhc2s+O1xuICBpZiAoIXRhc2sudGl0bGUpIHJldHVybiBudWxsO1xuICByZXR1cm4geyB0aXRsZTogU3RyaW5nKHRhc2sudGl0bGUpLCBjYXRlZ29yeTogdGFzay5jYXRlZ29yeSA/IFN0cmluZyh0YXNrLmNhdGVnb3J5KSA6IFwiXCIsIHN0YXJ0VGltZTogdGFzay5zdGFydFRpbWUgPyBTdHJpbmcodGFzay5zdGFydFRpbWUpIDogXCJcIiwgZW5kVGltZTogdGFzay5lbmRUaW1lID8gU3RyaW5nKHRhc2suZW5kVGltZSkgOiBcIlwiLCBlc3RpbWF0ZWRNaW51dGVzOiBNYXRoLm1heCgxLCBOdW1iZXIodGFzay5lc3RpbWF0ZWRNaW51dGVzKSB8fCAzMCksIGRlc2NyaXB0aW9uOiB0YXNrLmRlc2NyaXB0aW9uID8gU3RyaW5nKHRhc2suZGVzY3JpcHRpb24pIDogXCJcIiB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBzdHJpbmcge1xuICBjb25zdCBhbGxUYXNrcyA9IFsuLi5wbGFuLnRhc2tzLCAuLi4ocGxhbi5yZXZpZXdUYXNrcyA/PyBbXSldO1xuICBjb25zdCBmcm9udG1hdHRlciA9IGFsbFRhc2tzLmZsYXRNYXAoKHRhc2ssIGluZGV4KSA9PiB7XG4gICAgY29uc3QgaWQgPSBgdGFzayR7U3RyaW5nKGluZGV4ICsgMSkucGFkU3RhcnQoMiwgXCIwXCIpfWA7XG4gICAgcmV0dXJuIFtgJHtpZH1OYW1lOiAke3lhbWxRdW90ZSh0YXNrLnRpdGxlKX1gLCBgJHtpZH1DYXRlZ29yeTogJHt5YW1sUXVvdGUodGFzay5jYXRlZ29yeSB8fCBcIlx1NTE3Nlx1NUI4M1wiKX1gLCBgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzOiAke3Rhc2suZXN0aW1hdGVkTWludXRlc31gLCBgJHtpZH1BY3R1YWxTdGFydDpgLCBgJHtpZH1BY3R1YWxFbmQ6YCwgYCR7aWR9QWN0dWFsTWludXRlczogMGAsIGAke2lkfUZvY3VzU2Vzc2lvbnM6IDBgXTtcbiAgfSk7XG4gIGNvbnN0IHRhc2tDYXJkcyA9IChsYWJlbDogc3RyaW5nLCB0YXNrczogUGxhblRhc2tbXSwgb2Zmc2V0OiBudW1iZXIpID0+IHRhc2tzLmxlbmd0aCA/IGAjIyAke2xhYmVsfVxcblxcbiR7dGFza3MubWFwKCh0YXNrLCBpbmRleCkgPT4gcmVuZGVyVGFzayh0YXNrLCBkYXRlLCBvZmZzZXQgKyBpbmRleCArIDEpKS5qb2luKFwiXFxuXFxuXCIpfWAgOiBgIyMgJHtsYWJlbH1cXG5cXG5cdTY2ODJcdTY1RTBcdTVCODlcdTYzOTJcdTMwMDJgO1xuICByZXR1cm4gYC0tLVxcbnR5cGU6ICR7bW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTZCQ0ZcdTY1RTVcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU2QkNGXHU2NUU1XHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCJ9XFxucGxhbkRhdGU6ICR7ZGF0ZX1cXG50YWdzOlxcbiAgLSBBSVx1OEJBMVx1NTIxMlxcbiR7ZnJvbnRtYXR0ZXIuam9pbihcIlxcblwiKX1cXG4tLS1cXG5cXG4jICR7cGxhbi50aXRsZX1cXG5cXG4+IFshYWJzdHJhY3RdIFx1Njk4Mlx1ODlDOFxcbj4gJHtwbGFuLnN1bW1hcnkgfHwgXCJcdTc1MzEgQUkgUGxhbm5lciBcdTc1MUZcdTYyMTBcdUZGMENcdTYyNjdcdTg4NENcdTU0MEVcdTU4NkJcdTUxOTlcdTZCQ0ZcdTk4NzlcdTVCOUVcdTk2NDVcdTVGMDBcdTU5Q0JcdTU0OENcdTVCOENcdTYyMTBcdTY1RjZcdTk1RjRcdTMwMDJcIn1cXG5cXG4ke3Rhc2tDYXJkcyhtb2RlID09PSBcInN0dWR5XCIgPyBcIlx1NEY1Q1x1NEUxQVx1OEJBMVx1NTIxMlx1ODg2OFwiIDogXCJcdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcdTg4NjhcIiwgcGxhbi50YXNrcywgMCl9XFxuXFxuJHttb2RlID09PSBcInN0dWR5XCIgPyB0YXNrQ2FyZHMoXCJcdTU5MERcdTRFNjBcdThCQTFcdTUyMTJcdTg4NjhcIiwgcGxhbi5yZXZpZXdUYXNrcyA/PyBbXSwgcGxhbi50YXNrcy5sZW5ndGgpIDogXCJcIn1cXG5gO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUYXNrKHRhc2s6IFBsYW5UYXNrLCBkYXRlOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBwcmVmaXggPSB0YXNrLmNhdGVnb3J5ID8gYCR7dGFzay5jYXRlZ29yeX0gXHUwMEI3IGAgOiBcIlwiO1xuICBjb25zdCB0aW1lID0gdGFzay5zdGFydFRpbWUgJiYgdGFzay5lbmRUaW1lID8gYCR7dGFzay5zdGFydFRpbWV9LSR7dGFzay5lbmRUaW1lfWAgOiBcIlx1NUY4NVx1NUI4OVx1NjM5MlwiO1xuICBjb25zdCBub3RlID0gdGFzay5kZXNjcmlwdGlvbiA/IGBcXG4+ICR7dGFzay5kZXNjcmlwdGlvbn1gIDogXCJcIjtcbiAgcmV0dXJuIGA+IFshdG9kb10rICR7cHJlZml4fSR7dGFzay50aXRsZX1cXG4+IFx1NjVGNlx1NkJCNVx1RkYxQSR7dGltZX0gXHUwMEI3ICR7dGFzay5lc3RpbWF0ZWRNaW51dGVzfSBcdTUyMDZcdTk0OUZcXG4+IFx1NUI5RVx1OTY0NVx1NUYwMFx1NTlDQlx1RkYxQV9fX18gXHUwMEI3IFx1NUI5RVx1OTY0NVx1NUI4Q1x1NjIxMFx1RkYxQV9fX18ke25vdGV9XFxuPiAtIFsgXSAke3Rhc2sudGl0bGV9IFx1RDgzRFx1RENDNSAke2RhdGV9ICNcdThCQTFcdTUyMTJgO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQcmV2aWV3VGFza3MocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgdGFza3M6IFBsYW5UYXNrW10pOiB2b2lkIHtcbiAgcGFyZW50LmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBsYWJlbCB9KTtcbiAgaWYgKCF0YXNrcy5sZW5ndGgpIHsgcGFyZW50LmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiTm9uZVwiIH0pOyByZXR1cm47IH1cbiAgY29uc3QgbGlzdCA9IHBhcmVudC5jcmVhdGVFbChcInVsXCIpO1xuICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIGxpc3QuY3JlYXRlRWwoXCJsaVwiLCB7IHRleHQ6IGAke3Rhc2suc3RhcnRUaW1lIHx8IFwiXCJ9JHt0YXNrLmVuZFRpbWUgPyBgLSR7dGFzay5lbmRUaW1lfWAgOiBcIlwifSAke3Rhc2sudGl0bGV9ICgke3Rhc2suZXN0aW1hdGVkTWludXRlc30gbWluKWAudHJpbSgpIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVGb2xkZXIoYXBwOiBBcHAsIGZvbGRlcjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHBhcnRzID0gbm9ybWFsaXplUGF0aChmb2xkZXIpLnNwbGl0KFwiL1wiKS5maWx0ZXIoQm9vbGVhbik7XG4gIGZvciAobGV0IGkgPSAxOyBpIDw9IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcGF0aCA9IHBhcnRzLnNsaWNlKDAsIGkpLmpvaW4oXCIvXCIpO1xuICAgIGlmICghYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKSkgYXdhaXQgYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihwYXRoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzYWZlRmlsZW5hbWUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgXCItXCIpLnRyaW0oKS5zbGljZSgwLCA4MCkgfHwgXCJBSVx1OEJBMVx1NTIxMlwiOyB9XG5mdW5jdGlvbiB5YW1sUXVvdGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7IH1cbmZ1bmN0aW9uIHRpbWVPZkRheShkYXRlOiBEYXRlKTogc3RyaW5nIHsgcmV0dXJuIGAke1N0cmluZyhkYXRlLmdldEhvdXJzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX06JHtTdHJpbmcoZGF0ZS5nZXRNaW51dGVzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX1gOyB9XG5mdW5jdGlvbiBmb3JtYXREdXJhdGlvbihtaWxsaXNlY29uZHM6IG51bWJlcik6IHN0cmluZyB7IGNvbnN0IHRvdGFsID0gTWF0aC5jZWlsKG1pbGxpc2Vjb25kcyAvIDEwMDApOyByZXR1cm4gYCR7U3RyaW5nKE1hdGguZmxvb3IodG90YWwgLyA2MCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX06JHtTdHJpbmcodG90YWwgJSA2MCkucGFkU3RhcnQoMiwgXCIwXCIpfWA7IH1cbmZ1bmN0aW9uIGxvY2FsRGF0ZSgpOiBzdHJpbmcgeyBjb25zdCBub3cgPSBuZXcgRGF0ZSgpOyBjb25zdCBvZmZzZXQgPSBub3cuZ2V0VGltZXpvbmVPZmZzZXQoKSAqIDYwMDAwOyByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSAtIG9mZnNldCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7IH1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQUEySTtBQU0zSSxJQUFNLDBCQUEwQjtBQThDaEMsSUFBTSxtQkFBb0M7QUFBQSxFQUN4QyxVQUFVO0FBQUEsRUFDVixtQkFBbUI7QUFBQSxFQUNuQixZQUFZO0FBQUEsRUFDWixRQUFRO0FBQUEsRUFDUixPQUFPO0FBQUEsRUFDUCxlQUFlO0FBQUEsRUFDZixhQUFhO0FBQUEsRUFDYixXQUFXO0FBQUEsRUFDWCxhQUFhO0FBQUEsRUFDYixjQUFjO0FBQUEsRUFDZCxhQUFhO0FBQUEsRUFDYixZQUFZO0FBQ2Q7QUFFQSxJQUFNLFlBQW1GO0FBQUEsRUFDdkYsUUFBUSxFQUFFLE9BQU8seUVBQXNDLFNBQVMsSUFBSSxPQUFPLEdBQUc7QUFBQSxFQUM5RSxRQUFRLEVBQUUsT0FBTyxVQUFVLFNBQVMsNkJBQTZCLE9BQU8sZUFBZTtBQUFBLEVBQ3ZGLFFBQVEsRUFBRSxPQUFPLG9CQUFvQixTQUFTLGdDQUFnQyxPQUFPLDJCQUEyQjtBQUFBLEVBQ2hILFVBQVUsRUFBRSxPQUFPLFlBQVksU0FBUywrQkFBK0IsT0FBTyxnQkFBZ0I7QUFBQSxFQUM5RixLQUFLLEVBQUUsT0FBTyw0QkFBa0IsU0FBUyx3Q0FBd0MsT0FBTyxjQUFjO0FBQUEsRUFDdEcsTUFBTSxFQUFFLE9BQU8sbUJBQW1CLFNBQVMsOEJBQThCLE9BQU8saUJBQWlCO0FBQUEsRUFD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
