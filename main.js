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
    this.addCommand({ id: "create-manual-plan", name: "\u65B0\u5EFA\u624B\u52A8\u8BA1\u5212 / Create manual plan", callback: () => new ManualTaskModal(this.app, this).open() });
    this.addCommand({ id: "add-task-to-current-plan", name: "\u5411\u5F53\u524D\u8BA1\u5212\u6DFB\u52A0\u4EFB\u52A1 / Add task to current plan", callback: () => this.openManualTaskForActiveNote() });
    this.addCommand({ id: "refresh-plan-summary", name: "\u5237\u65B0\u5F53\u524D\u8BA1\u5212\u603B\u7ED3 / Refresh current plan summary", callback: () => void this.refreshPlanSummaryForActiveNote() });
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
  openManualTaskForActiveNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u8BA1\u5212\u7B14\u8BB0 / Open a plan note first.");
      return;
    }
    new ManualTaskModal(this.app, this, file).open();
  }
  async addManualTask(file, task, mode, date, planTitle) {
    if (!file) {
      await this.writePlan(mode, date, { title: planTitle || (mode === "study" ? "\u624B\u52A8\u5B66\u4E60\u8BA1\u5212" : "\u624B\u52A8\u5DE5\u4F5C\u8BA1\u5212"), summary: "\u624B\u52A8\u5EFA\u7ACB\u3002\u63D2\u4EF6\u4F1A\u6839\u636E\u4EFB\u52A1\u8BB0\u5F55\u81EA\u52A8\u66F4\u65B0\u6267\u884C\u603B\u7ED3\u3002", tasks: [task], reviewTasks: [] });
      return;
    }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const ids = Object.keys(fm).filter((key) => /^task\d+Name$/.test(key)).map((key) => Number(key.match(/^task(\d+)Name$/)?.[1] ?? 0));
    const number = Math.max(0, ...ids) + 1;
    const id = `task${String(number).padStart(2, "0")}`;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[`${id}Name`] = task.title;
      frontmatter[`${id}Category`] = task.category || "\u5176\u5B83";
      frontmatter[`${id}EstimatedMinutes`] = task.estimatedMinutes;
      frontmatter[`${id}ActualStart`] = "";
      frontmatter[`${id}ActualEnd`] = "";
      frontmatter[`${id}ActualMinutes`] = 0;
      frontmatter[`${id}FocusSessions`] = 0;
    });
    const content = await this.app.vault.read(file);
    const section = "## \u624B\u52A8\u8865\u5145";
    const card = renderTask(task, String(fm.planDate ?? localDate()), number);
    await this.app.vault.modify(file, content.includes(section) ? `${content.trimEnd()}

${card}
` : `${content.trimEnd()}

${section}

${card}
`);
    await this.refreshPlanSummary(file);
    new import_obsidian.Notice("\u5DF2\u6DFB\u52A0\u4EFB\u52A1\u5E76\u66F4\u65B0\u603B\u7ED3 / Task added and summary updated.");
  }
  async refreshPlanSummaryForActiveNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u8BA1\u5212\u7B14\u8BB0 / Open a plan note first.");
      return;
    }
    await this.refreshPlanSummary(file);
    new import_obsidian.Notice("\u5DF2\u5237\u65B0\u8BA1\u5212\u603B\u7ED3 / Plan summary refreshed.");
  }
  async refreshPlanSummary(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const taskKeys = Object.keys(fm).filter((key) => /^task\d+Name$/.test(key));
    if (!taskKeys.length) {
      new import_obsidian.Notice("\u5F53\u524D\u7B14\u8BB0\u6CA1\u6709 AI Planner \u4EFB\u52A1\u5B57\u6BB5 / No AI Planner tasks found.");
      return;
    }
    const content = await this.app.vault.read(file);
    const tasks = taskKeys.map((key) => {
      const id = key.replace("Name", "");
      return { category: String(fm[`${id}Category`] ?? "\u5176\u5B83"), planned: Number(fm[`${id}EstimatedMinutes`] ?? 0), actual: Number(fm[`${id}ActualMinutes`] ?? 0) || durationFromTimes(fm[`${id}ActualStart`], fm[`${id}ActualEnd`]), sessions: Number(fm[`${id}FocusSessions`] ?? 0) };
    });
    const planned = tasks.reduce((sum, task) => sum + task.planned, 0);
    const actual = tasks.reduce((sum, task) => sum + task.actual, 0);
    const sessions = tasks.reduce((sum, task) => sum + task.sessions, 0);
    const completed = (content.match(/^- \[x\].*#计划/im) ?? []).length;
    const categories = /* @__PURE__ */ new Map();
    for (const task of tasks) categories.set(task.category, (categories.get(task.category) ?? 0) + task.planned);
    const allocation = [...categories.entries()].map(([name, minutes]) => `${name} ${minutes} \u5206\u949F`).join("\uFF1B") || "\u6682\u65E0";
    const variance = actual > 0 ? `${actual >= planned ? "+" : ""}${actual - planned} \u5206\u949F` : "\u5F85\u8BB0\u5F55";
    const summary = `<!-- AI-PLANNER-SUMMARY:START -->
> [!summary] \u6267\u884C\u603B\u7ED3 / Execution summary
> - \u4EFB\u52A1\uFF1A${tasks.length} \u9879\uFF1B\u5DF2\u52FE\u9009\uFF1A${Math.min(completed, tasks.length)} \u9879\uFF1B\u4E13\u6CE8\u6B21\u6570\uFF1A${sessions} \u6B21\u3002
> - \u65F6\u95F4\uFF1A\u9884\u8BA1 ${planned} \u5206\u949F\uFF1B\u5DF2\u8BB0\u5F55\u5B9E\u9645 ${actual || "\u5F85\u8BB0\u5F55"}${actual ? " \u5206\u949F" : ""}\uFF1B\u504F\u5DEE\uFF1A${variance}\u3002
> - \u5206\u7C7B\u9884\u8BA1\u5206\u914D\uFF1A${allocation}\u3002
> - \u8BF4\u660E\uFF1A\u4EE5\u4E0A\u4EC5\u57FA\u4E8E\u4EFB\u52A1\u5B57\u6BB5\u3001\u52FE\u9009\u72B6\u6001\u548C\u4E13\u6CE8\u8BB0\u5F55\u8BA1\u7B97\u3002
<!-- AI-PLANNER-SUMMARY:END -->`;
    const pattern = /<!-- AI-PLANNER-SUMMARY:START -->[\s\S]*?<!-- AI-PLANNER-SUMMARY:END -->/;
    await this.app.vault.modify(file, pattern.test(content) ? content.replace(pattern, summary) : `${content.trimEnd()}

${summary}
`);
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
    const file = existing instanceof import_obsidian.TFile ? existing : await this.app.vault.create(path, content);
    if (existing instanceof import_obsidian.TFile) await this.app.vault.modify(existing, content);
    await this.refreshPlanSummary(file);
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
    const manual = action.createEl("button", { text: "\u624B\u52A8\u521B\u5EFA / Create manual" });
    const generate = action.createEl("button", { text: "\u751F\u6210\u9884\u89C8 / Generate preview", cls: "mod-cta" });
    manual.addEventListener("click", async () => {
      const tasks = this.input.split(/\r?\n/).map((title) => title.trim()).filter(Boolean).map((title) => ({ title, category: "\u5176\u5B83", estimatedMinutes: 30 }));
      if (!tasks.length) return new import_obsidian.Notice("\u6BCF\u884C\u586B\u5199\u4E00\u9879\u4EFB\u52A1 / Enter one task per line.");
      manual.disabled = true;
      try {
        await this.plugin.writePlan(this.mode, this.date, { title: `${this.date} ${this.mode === "study" ? "\u624B\u52A8\u5B66\u4E60\u8BA1\u5212" : "\u624B\u52A8\u5DE5\u4F5C\u8BA1\u5212"}`, summary: "\u624B\u52A8\u5EFA\u7ACB\u3002\u63D2\u4EF6\u4F1A\u6839\u636E\u4EFB\u52A1\u8BB0\u5F55\u81EA\u52A8\u66F4\u65B0\u6267\u884C\u603B\u7ED3\u3002", tasks, reviewTasks: [] });
        new import_obsidian.Notice("\u624B\u52A8\u8BA1\u5212\u5DF2\u521B\u5EFA / Manual plan created.");
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Could not create the manual plan.");
        manual.disabled = false;
      }
    });
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
    const input = parent.createEl("input", { cls: "ai-planner-mobile-time", type: "time" });
    input.step = "60";
    input.value = value;
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }
};
var ManualTaskModal = class extends import_obsidian.Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
  }
  mode = "study";
  date = localDate();
  planTitle = "";
  title = "";
  category = "";
  minutes = 30;
  startTime = "";
  endTime = "";
  onOpen() {
    this.modalEl.addClass("ai-planner-modal");
    this.titleEl.setText(this.file ? "\u6DFB\u52A0\u8BA1\u5212\u4EFB\u52A1 / Add task" : "\u65B0\u5EFA\u624B\u52A8\u8BA1\u5212 / Create manual plan");
    if (!this.file) {
      new import_obsidian.Setting(this.contentEl).setName("\u6A21\u5F0F / Mode").addDropdown((dropdown) => dropdown.addOption("study", "\u4F5C\u4E1A\u4E0E\u5B66\u4E60 / Homework & study").addOption("work", "\u5DE5\u4F5C / Work").setValue(this.mode).onChange((value) => this.mode = value));
      new import_obsidian.Setting(this.contentEl).setName("\u8BA1\u5212\u65E5\u671F / Plan date").addText((input) => input.setValue(this.date).onChange((value) => this.date = value));
      new import_obsidian.Setting(this.contentEl).setName("\u8BA1\u5212\u6807\u9898 / Plan title").addText((input) => input.setValue(this.planTitle).onChange((value) => this.planTitle = value));
    }
    new import_obsidian.Setting(this.contentEl).setName("\u4EFB\u52A1 / Task").addText((input) => input.setValue(this.title).onChange((value) => this.title = value));
    new import_obsidian.Setting(this.contentEl).setName("\u5206\u7C7B / Category").addText((input) => input.setValue(this.category).setPlaceholder("\u6570\u5B66 / Project").onChange((value) => this.category = value));
    new import_obsidian.Setting(this.contentEl).setName("\u9884\u8BA1\u5206\u949F / Estimated minutes").addText((input) => input.setValue(String(this.minutes)).onChange((value) => this.minutes = Math.max(1, Number(value) || 30)));
    new import_obsidian.Setting(this.contentEl).setName("\u5F00\u59CB\u65F6\u95F4 / Start time").addText((input) => input.setValue(this.startTime).setPlaceholder("19:00").onChange((value) => this.startTime = value));
    new import_obsidian.Setting(this.contentEl).setName("\u7ED3\u675F\u65F6\u95F4 / End time").addText((input) => input.setValue(this.endTime).setPlaceholder("19:30").onChange((value) => this.endTime = value));
    const action = this.contentEl.createDiv({ cls: "modal-button-container" });
    const submit = action.createEl("button", { text: this.file ? "\u6DFB\u52A0\u4EFB\u52A1 / Add task" : "\u521B\u5EFA\u8BA1\u5212 / Create plan", cls: "mod-cta" });
    submit.addEventListener("click", async () => {
      if (!this.title.trim()) return new import_obsidian.Notice("\u8BF7\u586B\u5199\u4EFB\u52A1 / Enter a task first.");
      submit.disabled = true;
      try {
        await this.plugin.addManualTask(this.file, { title: this.title.trim(), category: this.category.trim(), estimatedMinutes: this.minutes, startTime: this.startTime.trim(), endTime: this.endTime.trim() }, this.mode, this.date, this.planTitle.trim());
        this.close();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Could not save the task.");
        submit.disabled = false;
      }
    });
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

<!-- AI-PLANNER-SUMMARY:START -->
> [!summary] \u6267\u884C\u603B\u7ED3 / Execution summary
> - \u521D\u59CB\u8BA1\u5212\u5DF2\u521B\u5EFA\uFF1B\u5B8C\u6210\u4EFB\u52A1\u3001\u4E13\u6CE8\u6216\u8865\u5145\u4EFB\u52A1\u540E\u8FD0\u884C\u201C\u5237\u65B0\u5F53\u524D\u8BA1\u5212\u603B\u7ED3\u201D\u3002
<!-- AI-PLANNER-SUMMARY:END -->

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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgSXRlbVZpZXcsIE1vZGFsLCBOb3RpY2UsIFBsYXRmb3JtLCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIFRGaWxlLCBXb3Jrc3BhY2VMZWFmLCBub3JtYWxpemVQYXRoLCByZXF1ZXN0VXJsIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbnR5cGUgUGxhbk1vZGUgPSBcInN0dWR5XCIgfCBcIndvcmtcIjtcbnR5cGUgUHJvdmlkZXJJZCA9IFwiY3VzdG9tXCIgfCBcIm9wZW5haVwiIHwgXCJjbGF1ZGVcIiB8IFwiZGVlcHNlZWtcIiB8IFwiZ2xtXCIgfCBcImtpbWlcIiB8IFwiZ2VtaW5pXCI7XG50eXBlIEludGVyZmFjZUxhbmd1YWdlID0gXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG5cbmNvbnN0IE1PQklMRV9QTEFOX0VESVRPUl9WSUVXID0gXCJhaS1wbGFubmVyLW1vYmlsZS1lZGl0b3JcIjtcblxuaW50ZXJmYWNlIFBsYW5uZXJTZXR0aW5ncyB7XG4gIHByb3ZpZGVyOiBQcm92aWRlcklkO1xuICBpbnRlcmZhY2VMYW5ndWFnZTogSW50ZXJmYWNlTGFuZ3VhZ2U7XG4gIGFwaUJhc2VVcmw6IHN0cmluZztcbiAgYXBpS2V5OiBzdHJpbmc7XG4gIG1vZGVsOiBzdHJpbmc7XG4gIGN1c3RvbUhlYWRlcnM6IHN0cmluZztcbiAgdGVtcGVyYXR1cmU6IG51bWJlcjtcbiAgbWF4VG9rZW5zOiBudW1iZXI7XG4gIGhpc3RvcnlEYXlzOiBudW1iZXI7XG4gIGZvY3VzTWludXRlczogbnVtYmVyO1xuICBzdHVkeUZvbGRlcjogc3RyaW5nO1xuICB3b3JrRm9sZGVyOiBzdHJpbmc7XG4gIGFjdGl2ZUZvY3VzPzogQWN0aXZlRm9jdXNTZXNzaW9uO1xuICBmb2N1c01pbmlQb3NpdGlvbj86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbn1cblxuaW50ZXJmYWNlIEFjdGl2ZUZvY3VzU2Vzc2lvbiB7XG4gIGZpbGVQYXRoOiBzdHJpbmc7XG4gIHRhc2tJZDogc3RyaW5nO1xuICB0YXNrTmFtZTogc3RyaW5nO1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICBkdXJhdGlvbk1zOiBudW1iZXI7XG4gIGZvY3VzZWRNczogbnVtYmVyO1xuICBydW5uaW5nQXQ6IG51bWJlciB8IG51bGw7XG4gIHN0YXJ0ZWRBdDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGxhblRhc2sge1xuICB0aXRsZTogc3RyaW5nO1xuICBjYXRlZ29yeT86IHN0cmluZztcbiAgc3RhcnRUaW1lPzogc3RyaW5nO1xuICBlbmRUaW1lPzogc3RyaW5nO1xuICBlc3RpbWF0ZWRNaW51dGVzOiBudW1iZXI7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGxhblJlc3VsdCB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHN1bW1hcnk/OiBzdHJpbmc7XG4gIHRhc2tzOiBQbGFuVGFza1tdO1xuICByZXZpZXdUYXNrcz86IFBsYW5UYXNrW107XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFBsYW5uZXJTZXR0aW5ncyA9IHtcbiAgcHJvdmlkZXI6IFwiY3VzdG9tXCIsXG4gIGludGVyZmFjZUxhbmd1YWdlOiBcImF1dG9cIixcbiAgYXBpQmFzZVVybDogXCJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsXG4gIGFwaUtleTogXCJcIixcbiAgbW9kZWw6IFwiZ3B0LTQuMS1taW5pXCIsXG4gIGN1c3RvbUhlYWRlcnM6IFwie31cIixcbiAgdGVtcGVyYXR1cmU6IDAuMyxcbiAgbWF4VG9rZW5zOiAxODAwLFxuICBoaXN0b3J5RGF5czogMTQsXG4gIGZvY3VzTWludXRlczogMjUsXG4gIHN0dWR5Rm9sZGVyOiBcIjA2X1RvZG8vXHU1QjY2XHU0RTYwXCIsXG4gIHdvcmtGb2xkZXI6IFwiMDFfXHU5ODc5XHU3NkVFL1x1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwiXG59O1xuXG5jb25zdCBQUk9WSURFUlM6IFJlY29yZDxQcm92aWRlcklkLCB7IGxhYmVsOiBzdHJpbmc7IGJhc2VVcmw6IHN0cmluZzsgbW9kZWw6IHN0cmluZyB9PiA9IHtcbiAgY3VzdG9tOiB7IGxhYmVsOiBcIkN1c3RvbSBPcGVuQUktY29tcGF0aWJsZSAvIFx1ODFFQVx1NUI5QVx1NEU0OVx1NTE3Q1x1NUJCOVx1NjNBNVx1NTNFM1wiLCBiYXNlVXJsOiBcIlwiLCBtb2RlbDogXCJcIiB9LFxuICBvcGVuYWk6IHsgbGFiZWw6IFwiT3BlbkFJXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MVwiLCBtb2RlbDogXCJncHQtNC4xLW1pbmlcIiB9LFxuICBjbGF1ZGU6IHsgbGFiZWw6IFwiQW50aHJvcGljIENsYXVkZVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLmFudGhyb3BpYy5jb20vdjFcIiwgbW9kZWw6IFwiY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0XCIgfSxcbiAgZGVlcHNlZWs6IHsgbGFiZWw6IFwiRGVlcFNlZWtcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5kZWVwc2Vlay5jb20vdjFcIiwgbW9kZWw6IFwiZGVlcHNlZWstY2hhdFwiIH0sXG4gIGdsbTogeyBsYWJlbDogXCJaaGlwdSBHTE0gLyBcdTY2N0FcdThDMzFcIiwgYmFzZVVybDogXCJodHRwczovL29wZW4uYmlnbW9kZWwuY24vYXBpL3BhYXMvdjRcIiwgbW9kZWw6IFwiZ2xtLTQtZmxhc2hcIiB9LFxuICBraW1pOiB7IGxhYmVsOiBcIktpbWkgLyBNb29uc2hvdFwiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLm1vb25zaG90LmNuL3YxXCIsIG1vZGVsOiBcIm1vb25zaG90LXYxLThrXCIgfSxcbiAgZ2VtaW5pOiB7IGxhYmVsOiBcIkdvb2dsZSBHZW1pbmlcIiwgYmFzZVVybDogXCJodHRwczovL2dlbmVyYXRpdmVsYW5ndWFnZS5nb29nbGVhcGlzLmNvbS92MWJldGFcIiwgbW9kZWw6IFwiZ2VtaW5pLTIuMC1mbGFzaFwiIH1cbn07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlcXVlc3RQbGFuQ29tcGxldGlvbihcbiAgc2V0dGluZ3M6IFBsYW5uZXJTZXR0aW5ncyxcbiAgYmFzZVVybDogc3RyaW5nLFxuICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICBzeXN0ZW06IHN0cmluZyxcbiAgdXNlcjogc3RyaW5nXG4pOiBQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2YgcmVxdWVzdFVybD4+PiB7XG4gIGlmIChzZXR0aW5ncy5wcm92aWRlciA9PT0gXCJjbGF1ZGVcIikge1xuICAgIGlmIChzZXR0aW5ncy5hcGlLZXkpIGhlYWRlcnNbXCJ4LWFwaS1rZXlcIl0gPSBzZXR0aW5ncy5hcGlLZXk7XG4gICAgaGVhZGVyc1tcImFudGhyb3BpYy12ZXJzaW9uXCJdID8/PSBcIjIwMjMtMDYtMDFcIjtcbiAgICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGAke2Jhc2VVcmx9L21lc3NhZ2VzYCwgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6IHNldHRpbmdzLm1vZGVsLCBtYXhfdG9rZW5zOiBzZXR0aW5ncy5tYXhUb2tlbnMsIHRlbXBlcmF0dXJlOiBzZXR0aW5ncy50ZW1wZXJhdHVyZSwgc3lzdGVtLCBtZXNzYWdlczogW3sgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHVzZXIgfV0gfSksIHRocm93OiBmYWxzZVxuICAgIH0pO1xuICB9XG4gIGlmIChzZXR0aW5ncy5wcm92aWRlciA9PT0gXCJnZW1pbmlcIikge1xuICAgIGNvbnN0IGtleSA9IHNldHRpbmdzLmFwaUtleSA/IGA/a2V5PSR7ZW5jb2RlVVJJQ29tcG9uZW50KHNldHRpbmdzLmFwaUtleSl9YCA6IFwiXCI7XG4gICAgcmV0dXJuIHJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBgJHtiYXNlVXJsfS9tb2RlbHMvJHtlbmNvZGVVUklDb21wb25lbnQoc2V0dGluZ3MubW9kZWwpfTpnZW5lcmF0ZUNvbnRlbnQke2tleX1gLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzeXN0ZW1JbnN0cnVjdGlvbjogeyBwYXJ0czogW3sgdGV4dDogc3lzdGVtIH1dIH0sIGNvbnRlbnRzOiBbeyByb2xlOiBcInVzZXJcIiwgcGFydHM6IFt7IHRleHQ6IHVzZXIgfV0gfV0sIGdlbmVyYXRpb25Db25maWc6IHsgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBtYXhPdXRwdXRUb2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgcmVzcG9uc2VNaW1lVHlwZTogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSB9KSwgdGhyb3c6IGZhbHNlXG4gICAgfSk7XG4gIH1cbiAgaWYgKHNldHRpbmdzLmFwaUtleSkgaGVhZGVycy5BdXRob3JpemF0aW9uID0gYEJlYXJlciAke3NldHRpbmdzLmFwaUtleX1gO1xuICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgdXJsOiBgJHtiYXNlVXJsfS9jaGF0L2NvbXBsZXRpb25zYCwgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycyxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiBzZXR0aW5ncy5tb2RlbCwgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBtYXhfdG9rZW5zOiBzZXR0aW5ncy5tYXhUb2tlbnMsIG1lc3NhZ2VzOiBbeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBzeXN0ZW0gfSwgeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogdXNlciB9XSB9KSwgdGhyb3c6IGZhbHNlXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0aW9uVGV4dChwcm92aWRlcjogUHJvdmlkZXJJZCwgcmVzcG9uc2U6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBqc29uID0gcmVzcG9uc2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmIChwcm92aWRlciA9PT0gXCJjbGF1ZGVcIikge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBqc29uLmNvbnRlbnQgYXMgQXJyYXk8eyB0eXBlPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgIHJldHVybiBjb250ZW50Py5maWx0ZXIocGFydCA9PiBwYXJ0LnR5cGUgPT09IFwidGV4dFwiKS5tYXAocGFydCA9PiBwYXJ0LnRleHQgPz8gXCJcIikuam9pbihcIlwiKTtcbiAgfVxuICBpZiAocHJvdmlkZXIgPT09IFwiZ2VtaW5pXCIpIHtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0ganNvbi5jYW5kaWRhdGVzIGFzIEFycmF5PHsgY29udGVudD86IHsgcGFydHM/OiBBcnJheTx7IHRleHQ/OiBzdHJpbmcgfT4gfSB9PiB8IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0cz8ubWFwKHBhcnQgPT4gcGFydC50ZXh0ID8/IFwiXCIpLmpvaW4oXCJcIik7XG4gIH1cbiAgY29uc3QgY2hvaWNlcyA9IGpzb24uY2hvaWNlcyBhcyBBcnJheTx7IG1lc3NhZ2U/OiB7IGNvbnRlbnQ/OiBzdHJpbmcgfSB9PiB8IHVuZGVmaW5lZDtcbiAgcmV0dXJuIGNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQUlQbGFubmVyUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgcGx1Z2luU2V0dGluZ3MhOiBQbGFubmVyU2V0dGluZ3M7XG4gIHByaXZhdGUgZm9jdXNTdGF0dXNFbCE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGZvY3VzTWluaUVsITogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gIHByaXZhdGUgZmluaXNoaW5nRm9jdXMgPSBmYWxzZTtcbiAgcHJpdmF0ZSBmb2N1c1RpbWVyT3BlbiA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlEcmFnZ2luZyA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlNb3ZlZCA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlTdGFydFggPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydFkgPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydExlZnQgPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydFRvcCA9IDA7XG5cbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucGx1Z2luU2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgQUlQbGFubmVyU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJjcmVhdGUtYWktcGxhblwiLFxuICAgICAgbmFtZTogXCJDcmVhdGUgQUkgcGxhblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHZvaWQgdGhpcy5vcGVuUGxhbkVkaXRvcigpXG4gICAgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwic3RhcnQtZm9jdXMtc2Vzc2lvblwiLCBuYW1lOiBcIlN0YXJ0IGZvY3VzIHNlc3Npb25cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcInJlc3VtZS1mb2N1cy1zZXNzaW9uXCIsIG5hbWU6IFwiUmVzdW1lIGZvY3VzIHNlc3Npb25cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKSB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJjcmVhdGUtbWFudWFsLXBsYW5cIiwgbmFtZTogXCJcdTY1QjBcdTVFRkFcdTYyNEJcdTUyQThcdThCQTFcdTUyMTIgLyBDcmVhdGUgbWFudWFsIHBsYW5cIiwgY2FsbGJhY2s6ICgpID0+IG5ldyBNYW51YWxUYXNrTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJhZGQtdGFzay10by1jdXJyZW50LXBsYW5cIiwgbmFtZTogXCJcdTU0MTFcdTVGNTNcdTUyNERcdThCQTFcdTUyMTJcdTZERkJcdTUyQTBcdTRFRkJcdTUyQTEgLyBBZGQgdGFzayB0byBjdXJyZW50IHBsYW5cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMub3Blbk1hbnVhbFRhc2tGb3JBY3RpdmVOb3RlKCkgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwicmVmcmVzaC1wbGFuLXN1bW1hcnlcIiwgbmFtZTogXCJcdTUyMzdcdTY1QjBcdTVGNTNcdTUyNERcdThCQTFcdTUyMTJcdTYwM0JcdTdFRDMgLyBSZWZyZXNoIGN1cnJlbnQgcGxhbiBzdW1tYXJ5XCIsIGNhbGxiYWNrOiAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5Rm9yQWN0aXZlTm90ZSgpIH0pO1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImNhbGVuZGFyLXBsdXNcIiwgXCJDcmVhdGUgQUkgcGxhblwiLCAoKSA9PiB2b2lkIHRoaXMub3BlblBsYW5FZGl0b3IoKSk7XG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwidGltZXJcIiwgXCJTdGFydCBmb2N1cyBzZXNzaW9uXCIsICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLWZvY3VzLXN0YXR1c1wiKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c1N0YXR1c0VsLCBcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsID0gdGhpcy5hcHAud29ya3NwYWNlLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLW1pbmlcIixcbiAgICAgIGF0dHI6IHsgdHlwZTogXCJidXR0b25cIiwgXCJhcmlhLWxhYmVsXCI6IFwiUmVzdG9yZSBmb2N1cyB0aW1lclwiIH1cbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJjbGlja1wiLCBldmVudCA9PiB7XG4gICAgICBpZiAodGhpcy5taW5pTW92ZWQpIHsgZXZlbnQucHJldmVudERlZmF1bHQoKTsgcmV0dXJuOyB9XG4gICAgICB2b2lkIHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJwb2ludGVyZG93blwiLCBldmVudCA9PiB0aGlzLmJlZ2luTWluaURyYWcoZXZlbnQpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInBvaW50ZXJtb3ZlXCIsIGV2ZW50ID0+IHRoaXMubW92ZU1pbmlEcmFnKGV2ZW50KSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJwb2ludGVydXBcIiwgKCkgPT4gdm9pZCB0aGlzLmVuZE1pbmlEcmFnKCkpO1xuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdGhpcy5mb2N1c01pbmlFbC5yZW1vdmUoKSk7XG4gICAgY29uc3QgdXBkYXRlVmlzaWJsZUhlaWdodCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWluKHdpbmRvdy52aXN1YWxWaWV3cG9ydD8uaGVpZ2h0ID8/IHdpbmRvdy5pbm5lckhlaWdodCwgd2luZG93LmlubmVySGVpZ2h0KTtcbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tYWktcGxhbm5lci12aXNpYmxlLWhlaWdodFwiLCBgJHtNYXRoLnJvdW5kKGhlaWdodCl9cHhgKTtcbiAgICB9O1xuICAgIHVwZGF0ZVZpc2libGVIZWlnaHQoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInJlc2l6ZVwiLCB1cGRhdGVWaXNpYmxlSGVpZ2h0KTtcbiAgICBpZiAod2luZG93LnZpc3VhbFZpZXdwb3J0KSB7XG4gICAgICBjb25zdCB2aWV3cG9ydCA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydDtcbiAgICAgIHZpZXdwb3J0LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCk7XG4gICAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHZpZXdwb3J0LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCkpO1xuICAgIH1cbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiZm9jdXNpblwiLCBldmVudCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgIXRhcmdldC5tYXRjaGVzKFwiaW5wdXQsIHRleHRhcmVhLCBzZWxlY3RcIikpIHJldHVybjtcbiAgICAgIGlmICghdGFyZ2V0LmNsb3Nlc3QoXCIuYWktcGxhbm5lci1tb2RhbFwiKSkgcmV0dXJuO1xuICAgICAgdGhpcy5rZWVwRm9jdXNlZElucHV0VmlzaWJsZSh0YXJnZXQpO1xuICAgIH0pO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbCh3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpLCA1MDApKTtcbiAgICB0aGlzLnJlZ2lzdGVyVmlldyhNT0JJTEVfUExBTl9FRElUT1JfVklFVywgbGVhZiA9PiBuZXcgTW9iaWxlUGxhbkVkaXRvclZpZXcobGVhZiwgdGhpcykpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gIH1cblxuICBhc3luYyBvcGVuUGxhbkVkaXRvcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVBsYXRmb3JtLmlzTW9iaWxlKSB7XG4gICAgICBuZXcgUGxhbklucHV0TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKE1PQklMRV9QTEFOX0VESVRPUl9WSUVXKVswXTtcbiAgICBjb25zdCBsZWFmID0gZXhpc3RpbmcgPz8gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIik7XG4gICAgYXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoeyB0eXBlOiBNT0JJTEVfUExBTl9FRElUT1JfVklFVywgYWN0aXZlOiB0cnVlIH0pO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGxlYWYpO1xuICB9XG5cbiAgcHJpdmF0ZSBrZWVwRm9jdXNlZElucHV0VmlzaWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgY29uc3QgY29udGVudCA9IHRhcmdldC5jbG9zZXN0KFwiLm1vZGFsLWNvbnRlbnRcIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghY29udGVudCkgcmV0dXJuO1xuICAgIGNvbnN0IG1vdmUgPSAoKTogdm9pZCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgY29udGVudFJlY3QgPSBjb250ZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgdGFyZ2V0VG9wID0gdGFyZ2V0UmVjdC50b3AgLSBjb250ZW50UmVjdC50b3AgKyBjb250ZW50LnNjcm9sbFRvcDtcbiAgICAgIGNvbnN0IGRlc2lyZWRUb3AgPSBNYXRoLm1heCgyNCwgTWF0aC5yb3VuZChjb250ZW50LmNsaWVudEhlaWdodCAqIDAuMikpO1xuICAgICAgY29udGVudC5zY3JvbGxUb3AgPSBNYXRoLm1heCgwLCB0YXJnZXRUb3AgLSBkZXNpcmVkVG9wKTtcbiAgICB9O1xuICAgIGZvciAoY29uc3QgZGVsYXkgb2YgWzAsIDE4MCwgNDIwLCA3NTBdKSB3aW5kb3cuc2V0VGltZW91dChtb3ZlLCBkZWxheSk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnBsdWdpblNldHRpbmdzKTtcbiAgfVxuXG4gIGdldEFjdGl2ZUZvY3VzKCk6IEFjdGl2ZUZvY3VzU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gIH1cblxuICBzZXRGb2N1c1RpbWVyT3BlbihvcGVuOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5mb2N1c1RpbWVyT3BlbiA9IG9wZW47XG4gICAgdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICB9XG5cbiAgcHJpdmF0ZSBiZWdpbk1pbmlEcmFnKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSB0cnVlO1xuICAgIHRoaXMubWluaU1vdmVkID0gZmFsc2U7XG4gICAgdGhpcy5taW5pU3RhcnRYID0gZXZlbnQuY2xpZW50WDtcbiAgICB0aGlzLm1pbmlTdGFydFkgPSBldmVudC5jbGllbnRZO1xuICAgIHRoaXMubWluaVN0YXJ0TGVmdCA9IHJlY3QubGVmdDtcbiAgICB0aGlzLm1pbmlTdGFydFRvcCA9IHJlY3QudG9wO1xuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlTWluaURyYWcoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5taW5pRHJhZ2dpbmcpIHJldHVybjtcbiAgICBjb25zdCBkeCA9IGV2ZW50LmNsaWVudFggLSB0aGlzLm1pbmlTdGFydFg7XG4gICAgY29uc3QgZHkgPSBldmVudC5jbGllbnRZIC0gdGhpcy5taW5pU3RhcnRZO1xuICAgIGlmICghdGhpcy5taW5pTW92ZWQgJiYgTWF0aC5oeXBvdChkeCwgZHkpIDwgNikgcmV0dXJuO1xuICAgIHRoaXMubWluaU1vdmVkID0gdHJ1ZTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydExlZnQgKyBkeCksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydFRvcCArIGR5KSwgTWF0aC5tYXgoOCwgd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSA4KSk7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUucmlnaHQgPSBcImF1dG9cIjtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmJvdHRvbSA9IFwiYXV0b1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbmRNaW5pRHJhZygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMubWluaURyYWdnaW5nKSByZXR1cm47XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICBpZiAoIXRoaXMubWluaU1vdmVkKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgxLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGgpO1xuICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDEsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KTtcbiAgICB0aGlzLnBsdWdpblNldHRpbmdzLmZvY3VzTWluaVBvc2l0aW9uID0geyB4OiByZWN0LmxlZnQgLyB3aWR0aCwgeTogcmVjdC50b3AgLyBoZWlnaHQgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5taW5pTW92ZWQgPSBmYWxzZTsgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5TWluaVBvc2l0aW9uKCk6IHZvaWQge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbmlQb3NpdGlvbjtcbiAgICBpZiAoIXBvc2l0aW9uKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgbGVmdCA9IE1hdGgubWluKE1hdGgubWF4KDgsIHBvc2l0aW9uLnggKiAod2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoKSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCBwb3NpdGlvbi55ICogKHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gOCkpO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnJpZ2h0ID0gXCJhdXRvXCI7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5ib3R0b20gPSBcImF1dG9cIjtcbiAgfVxuXG4gIGFzeW5jIG9wZW5Gb2N1c0ZvckFjdGl2ZU5vdGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXMpIHtcbiAgICAgIGF3YWl0IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7IG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdThCQTFcdTUyMTJcdTdCMTRcdThCQjAgLyBPcGVuIGEgcGxhbiBub3RlIGZpcnN0LlwiKTsgcmV0dXJuOyB9XG4gICAgY29uc3QgdGFza3MgPSBleHRyYWN0Rm9jdXNUYXNrcyh0aGlzLmFwcCwgZmlsZSk7XG4gICAgaWYgKCF0YXNrcy5sZW5ndGgpIHsgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NkNBMVx1NjcwOVx1NTNFRlx1NEUxM1x1NkNFOFx1NzY4NFx1OEJBMVx1NTIxMlx1NEVGQlx1NTJBMSAvIE5vIHBsYW4gdGFza3MgZm91bmQuXCIpOyByZXR1cm47IH1cbiAgICBuZXcgRm9jdXNUYXNrUGlja2VyTW9kYWwodGhpcy5hcHAsIHRoaXMsIGZpbGUsIHRhc2tzKS5vcGVuKCk7XG4gIH1cblxuICBvcGVuTWFudWFsVGFza0ZvckFjdGl2ZU5vdGUoKTogdm9pZCB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7IG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdThCQTFcdTUyMTJcdTdCMTRcdThCQjAgLyBPcGVuIGEgcGxhbiBub3RlIGZpcnN0LlwiKTsgcmV0dXJuOyB9XG4gICAgbmV3IE1hbnVhbFRhc2tNb2RhbCh0aGlzLmFwcCwgdGhpcywgZmlsZSkub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgYWRkTWFudWFsVGFzayhmaWxlOiBURmlsZSB8IHVuZGVmaW5lZCwgdGFzazogUGxhblRhc2ssIG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW5UaXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBhd2FpdCB0aGlzLndyaXRlUGxhbihtb2RlLCBkYXRlLCB7IHRpdGxlOiBwbGFuVGl0bGUgfHwgKG1vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU2MjRCXHU1MkE4XHU1QjY2XHU0RTYwXHU4QkExXHU1MjEyXCIgOiBcIlx1NjI0Qlx1NTJBOFx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwiKSwgc3VtbWFyeTogXCJcdTYyNEJcdTUyQThcdTVFRkFcdTdBQ0JcdTMwMDJcdTYzRDJcdTRFRjZcdTRGMUFcdTY4MzlcdTYzNkVcdTRFRkJcdTUyQTFcdThCQjBcdTVGNTVcdTgxRUFcdTUyQThcdTY2RjRcdTY1QjBcdTYyNjdcdTg4NENcdTYwM0JcdTdFRDNcdTMwMDJcIiwgdGFza3M6IFt0YXNrXSwgcmV2aWV3VGFza3M6IFtdIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmbSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCBpZHMgPSBPYmplY3Qua2V5cyhmbSkuZmlsdGVyKGtleSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3Qoa2V5KSkubWFwKGtleSA9PiBOdW1iZXIoa2V5Lm1hdGNoKC9edGFzayhcXGQrKU5hbWUkLyk/LlsxXSA/PyAwKSk7XG4gICAgY29uc3QgbnVtYmVyID0gTWF0aC5tYXgoMCwgLi4uaWRzKSArIDE7XG4gICAgY29uc3QgaWQgPSBgdGFzayR7U3RyaW5nKG51bWJlcikucGFkU3RhcnQoMiwgXCIwXCIpfWA7XG4gICAgYXdhaXQgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvY2Vzc0Zyb250TWF0dGVyKGZpbGUsIGZyb250bWF0dGVyID0+IHtcbiAgICAgIGZyb250bWF0dGVyW2Ake2lkfU5hbWVgXSA9IHRhc2sudGl0bGU7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1DYXRlZ29yeWBdID0gdGFzay5jYXRlZ29yeSB8fCBcIlx1NTE3Nlx1NUI4M1wiO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID0gdGFzay5lc3RpbWF0ZWRNaW51dGVzO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9QWN0dWFsU3RhcnRgXSA9IFwiXCI7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1BY3R1YWxFbmRgXSA9IFwiXCI7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1BY3R1YWxNaW51dGVzYF0gPSAwO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9Rm9jdXNTZXNzaW9uc2BdID0gMDtcbiAgICB9KTtcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzZWN0aW9uID0gXCIjIyBcdTYyNEJcdTUyQThcdTg4NjVcdTUxNDVcIjtcbiAgICBjb25zdCBjYXJkID0gcmVuZGVyVGFzayh0YXNrLCBTdHJpbmcoZm0ucGxhbkRhdGUgPz8gbG9jYWxEYXRlKCkpLCBudW1iZXIpO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBjb250ZW50LmluY2x1ZGVzKHNlY3Rpb24pID8gYCR7Y29udGVudC50cmltRW5kKCl9XFxuXFxuJHtjYXJkfVxcbmAgOiBgJHtjb250ZW50LnRyaW1FbmQoKX1cXG5cXG4ke3NlY3Rpb259XFxuXFxuJHtjYXJkfVxcbmApO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5KGZpbGUpO1xuICAgIG5ldyBOb3RpY2UoXCJcdTVERjJcdTZERkJcdTUyQTBcdTRFRkJcdTUyQTFcdTVFNzZcdTY2RjRcdTY1QjBcdTYwM0JcdTdFRDMgLyBUYXNrIGFkZGVkIGFuZCBzdW1tYXJ5IHVwZGF0ZWQuXCIpO1xuICB9XG5cbiAgYXN5bmMgcmVmcmVzaFBsYW5TdW1tYXJ5Rm9yQWN0aXZlTm90ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICBpZiAoIWZpbGUpIHsgbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQVx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMCAvIE9wZW4gYSBwbGFuIG5vdGUgZmlyc3QuXCIpOyByZXR1cm47IH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hQbGFuU3VtbWFyeShmaWxlKTtcbiAgICBuZXcgTm90aWNlKFwiXHU1REYyXHU1MjM3XHU2NUIwXHU4QkExXHU1MjEyXHU2MDNCXHU3RUQzIC8gUGxhbiBzdW1tYXJ5IHJlZnJlc2hlZC5cIik7XG4gIH1cblxuICBhc3luYyByZWZyZXNoUGxhblN1bW1hcnkoZmlsZTogVEZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmbSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCB0YXNrS2V5cyA9IE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoa2V5ID0+IC9edGFza1xcZCtOYW1lJC8udGVzdChrZXkpKTtcbiAgICBpZiAoIXRhc2tLZXlzLmxlbmd0aCkgeyBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU2Q0ExXHU2NzA5IEFJIFBsYW5uZXIgXHU0RUZCXHU1MkExXHU1QjU3XHU2QkI1IC8gTm8gQUkgUGxhbm5lciB0YXNrcyBmb3VuZC5cIik7IHJldHVybjsgfVxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHRhc2tzID0gdGFza0tleXMubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICAgIHJldHVybiB7IGNhdGVnb3J5OiBTdHJpbmcoZm1bYCR7aWR9Q2F0ZWdvcnlgXSA/PyBcIlx1NTE3Nlx1NUI4M1wiKSwgcGxhbm5lZDogTnVtYmVyKGZtW2Ake2lkfUVzdGltYXRlZE1pbnV0ZXNgXSA/PyAwKSwgYWN0dWFsOiBOdW1iZXIoZm1bYCR7aWR9QWN0dWFsTWludXRlc2BdID8/IDApIHx8IGR1cmF0aW9uRnJvbVRpbWVzKGZtW2Ake2lkfUFjdHVhbFN0YXJ0YF0sIGZtW2Ake2lkfUFjdHVhbEVuZGBdKSwgc2Vzc2lvbnM6IE51bWJlcihmbVtgJHtpZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgfTtcbiAgICB9KTtcbiAgICBjb25zdCBwbGFubmVkID0gdGFza3MucmVkdWNlKChzdW0sIHRhc2spID0+IHN1bSArIHRhc2sucGxhbm5lZCwgMCk7XG4gICAgY29uc3QgYWN0dWFsID0gdGFza3MucmVkdWNlKChzdW0sIHRhc2spID0+IHN1bSArIHRhc2suYWN0dWFsLCAwKTtcbiAgICBjb25zdCBzZXNzaW9ucyA9IHRhc2tzLnJlZHVjZSgoc3VtLCB0YXNrKSA9PiBzdW0gKyB0YXNrLnNlc3Npb25zLCAwKTtcbiAgICBjb25zdCBjb21wbGV0ZWQgPSAoY29udGVudC5tYXRjaCgvXi0gXFxbeFxcXS4qI1x1OEJBMVx1NTIxMi9pbSkgPz8gW10pLmxlbmd0aDtcbiAgICBjb25zdCBjYXRlZ29yaWVzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIGNhdGVnb3JpZXMuc2V0KHRhc2suY2F0ZWdvcnksIChjYXRlZ29yaWVzLmdldCh0YXNrLmNhdGVnb3J5KSA/PyAwKSArIHRhc2sucGxhbm5lZCk7XG4gICAgY29uc3QgYWxsb2NhdGlvbiA9IFsuLi5jYXRlZ29yaWVzLmVudHJpZXMoKV0ubWFwKChbbmFtZSwgbWludXRlc10pID0+IGAke25hbWV9ICR7bWludXRlc30gXHU1MjA2XHU5NDlGYCkuam9pbihcIlx1RkYxQlwiKSB8fCBcIlx1NjY4Mlx1NjVFMFwiO1xuICAgIGNvbnN0IHZhcmlhbmNlID0gYWN0dWFsID4gMCA/IGAke2FjdHVhbCA+PSBwbGFubmVkID8gXCIrXCIgOiBcIlwifSR7YWN0dWFsIC0gcGxhbm5lZH0gXHU1MjA2XHU5NDlGYCA6IFwiXHU1Rjg1XHU4QkIwXHU1RjU1XCI7XG4gICAgY29uc3Qgc3VtbWFyeSA9IGA8IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpTVEFSVCAtLT5cXG4+IFshc3VtbWFyeV0gXHU2MjY3XHU4ODRDXHU2MDNCXHU3RUQzIC8gRXhlY3V0aW9uIHN1bW1hcnlcXG4+IC0gXHU0RUZCXHU1MkExXHVGRjFBJHt0YXNrcy5sZW5ndGh9IFx1OTg3OVx1RkYxQlx1NURGMlx1NTJGRVx1OTAwOVx1RkYxQSR7TWF0aC5taW4oY29tcGxldGVkLCB0YXNrcy5sZW5ndGgpfSBcdTk4NzlcdUZGMUJcdTRFMTNcdTZDRThcdTZCMjFcdTY1NzBcdUZGMUEke3Nlc3Npb25zfSBcdTZCMjFcdTMwMDJcXG4+IC0gXHU2NUY2XHU5NUY0XHVGRjFBXHU5ODg0XHU4QkExICR7cGxhbm5lZH0gXHU1MjA2XHU5NDlGXHVGRjFCXHU1REYyXHU4QkIwXHU1RjU1XHU1QjlFXHU5NjQ1ICR7YWN0dWFsIHx8IFwiXHU1Rjg1XHU4QkIwXHU1RjU1XCJ9JHthY3R1YWwgPyBcIiBcdTUyMDZcdTk0OUZcIiA6IFwiXCJ9XHVGRjFCXHU1MDRGXHU1REVFXHVGRjFBJHt2YXJpYW5jZX1cdTMwMDJcXG4+IC0gXHU1MjA2XHU3QzdCXHU5ODg0XHU4QkExXHU1MjA2XHU5MTREXHVGRjFBJHthbGxvY2F0aW9ufVx1MzAwMlxcbj4gLSBcdThCRjRcdTY2MEVcdUZGMUFcdTRFRTVcdTRFMEFcdTRFQzVcdTU3RkFcdTRFOEVcdTRFRkJcdTUyQTFcdTVCNTdcdTZCQjVcdTMwMDFcdTUyRkVcdTkwMDlcdTcyQjZcdTYwMDFcdTU0OENcdTRFMTNcdTZDRThcdThCQjBcdTVGNTVcdThCQTFcdTdCOTdcdTMwMDJcXG48IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpFTkQgLS0+YDtcbiAgICBjb25zdCBwYXR0ZXJuID0gLzwhLS0gQUktUExBTk5FUi1TVU1NQVJZOlNUQVJUIC0tPltcXHNcXFNdKj88IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpFTkQgLS0+LztcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgcGF0dGVybi50ZXN0KGNvbnRlbnQpID8gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHN1bW1hcnkpIDogYCR7Y29udGVudC50cmltRW5kKCl9XFxuXFxuJHtzdW1tYXJ5fVxcbmApO1xuICB9XG5cbiAgYXN5bmMgc3RhcnRGb2N1cyhmaWxlOiBURmlsZSwgdGFzazogRm9jdXNUYXNrLCBtaW51dGVzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cykge1xuICAgICAgbmV3IE5vdGljZShcIlx1NURGMlx1NjcwOVx1OEZEQlx1ODg0Q1x1NEUyRFx1NzY4NFx1NEUxM1x1NkNFOCAvIEEgZm9jdXMgc2Vzc2lvbiBpcyBhbHJlYWR5IGFjdGl2ZS5cIik7XG4gICAgICBhd2FpdCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cyA9IHtcbiAgICAgIGZpbGVQYXRoOiBmaWxlLnBhdGgsXG4gICAgICB0YXNrSWQ6IHRhc2suaWQsXG4gICAgICB0YXNrTmFtZTogdGFzay5uYW1lLFxuICAgICAgY2F0ZWdvcnk6IHRhc2suY2F0ZWdvcnksXG4gICAgICBkdXJhdGlvbk1zOiBNYXRoLm1heCgxLCBtaW51dGVzKSAqIDYwMDAwLFxuICAgICAgZm9jdXNlZE1zOiAwLFxuICAgICAgcnVubmluZ0F0OiBzdGFydGVkQXQsXG4gICAgICBzdGFydGVkQXRcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Rhc2suaWR9QWN0dWFsU3RhcnRgXSA/Pz0gdGltZU9mRGF5KG5ldyBEYXRlKHN0YXJ0ZWRBdCkpO1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU2NUUwXHU2Q0Q1XHU3QUNCXHU1MzczXHU1MTk5XHU1MTY1XHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0XHVGRjBDXHU1QzA2XHU1NzI4XHU3RUQzXHU2NzVGXHU2NUY2XHU5MUNEXHU4QkQ1IC8gQ291bGQgbm90IHdyaXRlIHRoZSBzdGFydCB0aW1lIHlldDsgaXQgd2lsbCByZXRyeSBvbiBmaW5pc2guXCIpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHRvZ2dsZUZvY3VzUGF1c2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XG4gICAgaWYgKHNlc3Npb24ucnVubmluZ0F0ICE9PSBudWxsKSB7XG4gICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgc2Vzc2lvbi5ydW5uaW5nQXQgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IERhdGUubm93KCk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgfVxuXG4gIGFzeW5jIHJlc3RvcmVGb2N1c1RpbWVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoc2Vzc2lvbi5maWxlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NjI3RVx1NEUwRFx1NTIzMFx1NTM5Rlx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMFx1RkYwQ1x1NjVFMFx1NkNENVx1NUI4Q1x1NjIxMFx1NTZERVx1NTE5OSAvIFRoZSBwbGFuIG5vdGUgaXMgbWlzc2luZy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIGZpbmlzaEZvY3VzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbiB8fCB0aGlzLmZpbmlzaGluZ0ZvY3VzKSByZXR1cm47XG4gICAgdGhpcy5maW5pc2hpbmdGb2N1cyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCkge1xuICAgICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IG51bGw7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHNlc3Npb24uZmlsZVBhdGgpO1xuICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgICBuZXcgTm90aWNlKFwiXHU2MjdFXHU0RTBEXHU1MjMwXHU1MzlGXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwXHVGRjBDXHU0RTEzXHU2Q0U4XHU4QkIwXHU1RjU1XHU2NjgyXHU2NzJBXHU1MTk5XHU1MTY1IC8gUGxhbiBub3RlIG1pc3Npbmc7IGZvY3VzIHJlY29yZCB3YXMga2VwdC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdHVhbE1pbnV0ZXMgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHNlc3Npb24uZm9jdXNlZE1zIC8gNjAwMDApKTtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbFN0YXJ0YF0gPz89IHRpbWVPZkRheShuZXcgRGF0ZShzZXNzaW9uLnN0YXJ0ZWRBdCkpO1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxFbmRgXSA9IHRpbWVPZkRheShuZXcgRGF0ZSgpKTtcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsTWludXRlc2BdID0gTnVtYmVyKGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSArIGFjdHVhbE1pbnV0ZXM7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUZvY3VzU2Vzc2lvbnNgXSA9IE51bWJlcihmbVtgJHtzZXNzaW9uLnRhc2tJZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgKyAxO1xuICAgICAgfSk7XG4gICAgICB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzID0gdW5kZWZpbmVkO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgIG5ldyBOb3RpY2UoYFx1NURGMlx1OEJCMFx1NUY1NSAke2FjdHVhbE1pbnV0ZXN9IFx1NTIwNlx1OTQ5Rlx1NEUxM1x1NkNFOCAvIEZvY3VzIHJlY29yZGVkLmApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmZpbmlzaGluZ0ZvY3VzID0gZmFsc2U7XG4gICAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hGb2N1c1N0YXR1cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuZGlzcGxheSA9IHRoaXMuZm9jdXNUaW1lck9wZW4gPyBcIm5vbmVcIiA6IFwiXCI7XG4gICAgY29uc3QgZWxhcHNlZCA9IHNlc3Npb24uZm9jdXNlZE1zICsgKHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gMCA6IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBzZXNzaW9uLnJ1bm5pbmdBdCkpO1xuICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCAmJiBlbGFwc2VkID49IHNlc3Npb24uZHVyYXRpb25Ncykge1xuICAgICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldFRleHQoYEZvY3VzIGNvbXBsZXRlIFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTVCOENcdTYyMTAgLyBGb2N1cyBjb21wbGV0ZVwiKTtcbiAgICAgIHZvaWQgdGhpcy5maW5pc2hGb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ZSA9IHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gXCJGb2N1cyBwYXVzZWRcIiA6IGZvcm1hdER1cmF0aW9uKE1hdGgubWF4KDAsIHNlc3Npb24uZHVyYXRpb25NcyAtIGVsYXBzZWQpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc2V0VGV4dChgJHtzdGF0ZX0gXHUwMEI3ICR7c2Vzc2lvbi50YXNrTmFtZX1gKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoYCR7c3RhdGV9IFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCJSZXN0b3JlIGZvY3VzIHRpbWVyXCIpO1xuICAgIGlmICghdGhpcy5mb2N1c1RpbWVyT3Blbikgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmFwcGx5TWluaVBvc2l0aW9uKCkpO1xuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHN0YXJ0VGltZTogc3RyaW5nLCBlbmRUaW1lOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcpOiBQcm9taXNlPFBsYW5SZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCB8fCAhdGhpcy5wbHVnaW5TZXR0aW5ncy5tb2RlbCkgdGhyb3cgbmV3IEVycm9yKFwiUGxlYXNlIGNvbmZpZ3VyZSBhbiBBUEkgYmFzZSBVUkwgYW5kIG1vZGVsIGZpcnN0LlwiKTtcbiAgICBsZXQgY3VzdG9tSGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHRyeSB7XG4gICAgICBjdXN0b21IZWFkZXJzID0gSlNPTi5wYXJzZSh0aGlzLnBsdWdpblNldHRpbmdzLmN1c3RvbUhlYWRlcnMgfHwgXCJ7fVwiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1c3RvbSBoZWFkZXJzIG11c3QgYmUgdmFsaWQgSlNPTi5cIik7XG4gICAgfVxuICAgIGNvbnN0IHN5c3RlbSA9IG1vZGUgPT09IFwic3R1ZHlcIlxuICAgICAgPyBcIllvdSBjcmVhdGUgcHJhY3RpY2FsIHNhbWUtZGF5IGhvbWV3b3JrIHBsYW5zIGZvciBhIGNoaWxkLiBCcmVhayB0YXNrcyBpbnRvIGEgc2Vuc2libGUgb3JkZXIsIGluY2x1ZGUgc2hvcnQgYnJlYWtzIHdoZW4gaGVscGZ1bCwgYW5kIG9ubHkgYWRkIHJldmlldyB0YXNrcyBncm91bmRlZCBpbiB0aGUgZ2l2ZW4gaG9tZXdvcmsuXCJcbiAgICAgIDogXCJZb3UgY3JlYXRlIHByYWN0aWNhbCBzYW1lLWRheSB3b3JrIHBsYW5zLiBQcmlvcml0aXplIGJ5IHVyZ2VuY3kgYW5kIGNvZ25pdGl2ZSBsb2FkLCBpbmNsdWRlIGJ1ZmZlcnMsIGFuZCBkbyBub3QgaW52ZW50IHdvcmsgaXRlbXMuXCI7XG4gICAgY29uc3QgZm9sZGVyID0gbW9kZSA9PT0gXCJzdHVkeVwiID8gdGhpcy5wbHVnaW5TZXR0aW5ncy5zdHVkeUZvbGRlciA6IHRoaXMucGx1Z2luU2V0dGluZ3Mud29ya0ZvbGRlcjtcbiAgICBjb25zdCBoaXN0b3J5ID0gYnVpbGRIaXN0b3J5Q29udGV4dCh0aGlzLmFwcCwgZm9sZGVyLCB0aGlzLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKTtcbiAgICBjb25zdCB1c2VyID0gYFBsYW4gZGF0ZTogJHtkYXRlfVxcblN0YXJ0IHRpbWU6ICR7c3RhcnRUaW1lIHx8IFwibm90IHNwZWNpZmllZFwifVxcbkxhdGVzdCBmaW5pc2g6ICR7ZW5kVGltZSB8fCBcIm5vdCBzcGVjaWZpZWRcIn1cXG5JdGVtczpcXG4ke2lucHV0fVxcblxcbkhpc3RvcmljYWwgdGltaW5nIGNhbGlicmF0aW9uOlxcbiR7aGlzdG9yeX1cXG5cXG5Vc2UgdGhlIGNhbGlicmF0aW9uIG9ubHkgd2hlbiBpdCBoYXMgYXQgbGVhc3QgdHdvIGNvbXBhcmFibGUgcmVjb3Jkcy4gUmV0dXJuIEpTT04gb25seSwgd2l0aCB0aGlzIHNoYXBlOiB7XCJ0aXRsZVwiOlwic2hvcnQgdGl0bGVcIixcInN1bW1hcnlcIjpcIm9uZSBzZW50ZW5jZVwiLFwidGFza3NcIjpbe1widGl0bGVcIjpcInRhc2tcIixcImNhdGVnb3J5XCI6XCJzdWJqZWN0IG9yIHByb2plY3RcIixcInN0YXJ0VGltZVwiOlwiSEg6bW1cIixcImVuZFRpbWVcIjpcIkhIOm1tXCIsXCJlc3RpbWF0ZWRNaW51dGVzXCI6MzAsXCJkZXNjcmlwdGlvblwiOlwib3B0aW9uYWxcIn1dLFwicmV2aWV3VGFza3NcIjpbc2FtZSB0YXNrIHNoYXBlXX0uIFVzZSBbXSBmb3IgcmV2aWV3VGFza3Mgd2hlbiBub25lIGFyZSBqdXN0aWZpZWQuYDtcbiAgICBjb25zdCBiYXNlVXJsID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiwgLi4uY3VzdG9tSGVhZGVycyB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFBsYW5Db21wbGV0aW9uKHRoaXMucGx1Z2luU2V0dGluZ3MsIGJhc2VVcmwsIGhlYWRlcnMsIHN5c3RlbSwgdXNlcik7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB0aHJvdyBuZXcgRXJyb3IoYEFQSSByZXF1ZXN0IGZhaWxlZCAoJHtyZXNwb25zZS5zdGF0dXN9KTogJHtyZXNwb25zZS50ZXh0LnNsaWNlKDAsIDMwMCl9YCk7XG4gICAgY29uc3QgY29udGVudCA9IGNvbXBsZXRpb25UZXh0KHRoaXMucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIsIHJlc3BvbnNlLmpzb24pO1xuICAgIGlmICh0eXBlb2YgY29udGVudCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHByb3ZpZGVyIGRpZCBub3QgcmV0dXJuIGEgY2hhdCBjb21wbGV0aW9uLlwiKTtcbiAgICByZXR1cm4gcGFyc2VQbGFuKGNvbnRlbnQpO1xuICB9XG5cbiAgYXN5bmMgd3JpdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGZvbGRlciA9IG1vZGUgPT09IFwic3R1ZHlcIiA/IHRoaXMucGx1Z2luU2V0dGluZ3Muc3R1ZHlGb2xkZXIgOiB0aGlzLnBsdWdpblNldHRpbmdzLndvcmtGb2xkZXI7XG4gICAgYXdhaXQgZW5zdXJlRm9sZGVyKHRoaXMuYXBwLCBmb2xkZXIpO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7ZGF0ZX0tJHtzYWZlRmlsZW5hbWUocGxhbi50aXRsZSB8fCAobW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCIpKX0ubWRgO1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKGAke2ZvbGRlcn0vJHtmaWxlbmFtZX1gKTtcbiAgICBjb25zdCBjb250ZW50ID0gcmVuZGVyUGxhbihtb2RlLCBkYXRlLCBwbGFuKTtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICBjb25zdCBmaWxlID0gZXhpc3RpbmcgaW5zdGFuY2VvZiBURmlsZSA/IGV4aXN0aW5nIDogYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHBhdGgsIGNvbnRlbnQpO1xuICAgIGlmIChleGlzdGluZyBpbnN0YW5jZW9mIFRGaWxlKSBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmcsIGNvbnRlbnQpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5KGZpbGUpO1xuICAgIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5vcGVuTGlua1RleHQocGF0aCwgXCJcIiwgdHJ1ZSk7XG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEZvY3VzVGFzayB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgY2F0ZWdvcnk6IHN0cmluZzsgZXN0aW1hdGVkTWludXRlczogbnVtYmVyOyB9XG5cbmZ1bmN0aW9uIGV4dHJhY3RGb2N1c1Rhc2tzKGFwcDogQXBwLCBmaWxlOiBURmlsZSk6IEZvY3VzVGFza1tdIHtcbiAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICByZXR1cm4gT2JqZWN0LmtleXMoZm0pLmZpbHRlcihrZXkgPT4gL150YXNrXFxkK05hbWUkLy50ZXN0KGtleSkpLnNvcnQoKS5tYXAoa2V5ID0+IHtcbiAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICByZXR1cm4geyBpZCwgbmFtZTogU3RyaW5nKGZtW2tleV0gPz8gaWQpLCBjYXRlZ29yeTogU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gXCJcIiksIGVzdGltYXRlZE1pbnV0ZXM6IE51bWJlcihmbVtgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzYF0gPz8gMCkgfTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkSGlzdG9yeUNvbnRleHQoYXBwOiBBcHAsIGZvbGRlcjogc3RyaW5nLCBkYXlzOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBjdXRvZmYgPSBEYXRlLm5vdygpIC0gZGF5cyAqIDg2NDAwMDAwO1xuICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBwbGFubmVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyOyBjb3VudDogbnVtYmVyIH0+KCk7XG4gIGZvciAoY29uc3QgZmlsZSBvZiBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgaWYgKCFmaWxlLnBhdGguc3RhcnRzV2l0aChgJHtub3JtYWxpemVQYXRoKGZvbGRlcil9L2ApIHx8IGZpbGUuc3RhdC5tdGltZSA8IGN1dG9mZikgY29udGludWU7XG4gICAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoaXRlbSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3QoaXRlbSkpKSB7XG4gICAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICAgIGNvbnN0IHBsYW5uZWQgPSBOdW1iZXIoZm1bYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID8/IDApO1xuICAgICAgY29uc3QgYWN0dWFsID0gTnVtYmVyKGZtW2Ake2lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSB8fCBkdXJhdGlvbkZyb21UaW1lcyhmbVtgJHtpZH1BY3R1YWxTdGFydGBdLCBmbVtgJHtpZH1BY3R1YWxFbmRgXSk7XG4gICAgICBpZiAocGxhbm5lZCA8PSAwIHx8IGFjdHVhbCA8PSAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGNhdGVnb3J5ID0gU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gU3RyaW5nKGZtW2tleV0pLnNwbGl0KFwiXHUwMEI3XCIpWzBdID8/IFwiXHU1MTc2XHU1QjgzXCIpLnRyaW0oKSB8fCBcIlx1NTE3Nlx1NUI4M1wiO1xuICAgICAgY29uc3QgaXRlbSA9IGdyb3Vwcy5nZXQoY2F0ZWdvcnkpID8/IHsgcGxhbm5lZDogMCwgYWN0dWFsOiAwLCBjb3VudDogMCB9O1xuICAgICAgaXRlbS5wbGFubmVkICs9IHBsYW5uZWQ7IGl0ZW0uYWN0dWFsICs9IGFjdHVhbDsgaXRlbS5jb3VudCArPSAxOyBncm91cHMuc2V0KGNhdGVnb3J5LCBpdGVtKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbGluZXMgPSBbLi4uZ3JvdXBzLmVudHJpZXMoKV0uZmlsdGVyKChbLCB2YWx1ZV0pID0+IHZhbHVlLmNvdW50ID49IDIpLnNvcnQoKGEsIGIpID0+IGJbMV0uY291bnQgLSBhWzFdLmNvdW50KS5zbGljZSgwLCA2KS5tYXAoKFtjYXRlZ29yeSwgdmFsdWVdKSA9PiB7XG4gICAgY29uc3QgcGVyY2VudCA9IE1hdGgucm91bmQoKHZhbHVlLmFjdHVhbCAvIHZhbHVlLnBsYW5uZWQgLSAxKSAqIDEwMCk7XG4gICAgcmV0dXJuIGAke2NhdGVnb3J5fTogJHt2YWx1ZS5jb3VudH0gcmVjb3JkcywgcGxhbm5lZCAke3ZhbHVlLnBsYW5uZWR9IG1pbiwgYWN0dWFsICR7dmFsdWUuYWN0dWFsfSBtaW4sIGRldmlhdGlvbiAke3BlcmNlbnQgPj0gMCA/IFwiK1wiIDogXCJcIn0ke3BlcmNlbnR9JWA7XG4gIH0pO1xuICByZXR1cm4gbGluZXMubGVuZ3RoID8gbGluZXMuam9pbihcIlxcblwiKSA6IFwiTm8gcmVsaWFibGUgaGlzdG9yaWNhbCByZWNvcmRzIHlldC4gVXNlIHJlYXNvbmFibGUgZXN0aW1hdGVzIGFuZCBhIHNtYWxsIGJ1ZmZlci5cIjtcbn1cblxuZnVuY3Rpb24gZHVyYXRpb25Gcm9tVGltZXMoc3RhcnQ6IHVua25vd24sIGVuZDogdW5rbm93bik6IG51bWJlciB7XG4gIGNvbnN0IHBhcnNlID0gKHZhbHVlOiB1bmtub3duKTogbnVtYmVyIHwgbnVsbCA9PiB7IGNvbnN0IG1hdGNoID0gU3RyaW5nKHZhbHVlID8/IFwiXCIpLm1hdGNoKC9eKFxcZHsxLDJ9KTooXFxkezJ9KSQvKTsgcmV0dXJuIG1hdGNoID8gTnVtYmVyKG1hdGNoWzFdKSAqIDYwICsgTnVtYmVyKG1hdGNoWzJdKSA6IG51bGw7IH07XG4gIGNvbnN0IGZyb20gPSBwYXJzZShzdGFydCksIHRvID0gcGFyc2UoZW5kKTtcbiAgcmV0dXJuIGZyb20gPT09IG51bGwgfHwgdG8gPT09IG51bGwgPyAwIDogKHRvID49IGZyb20gPyB0byAtIGZyb20gOiB0byArIDE0NDAgLSBmcm9tKTtcbn1cblxuY2xhc3MgRm9jdXNUYXNrUGlja2VyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbWludXRlczogbnVtYmVyO1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBmaWxlOiBURmlsZSwgcHJpdmF0ZSByZWFkb25seSB0YXNrczogRm9jdXNUYXNrW10pIHsgc3VwZXIoYXBwKTsgdGhpcy5taW51dGVzID0gcGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlczsgfVxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1NEUxM1x1NkNFOFx1NkEyMVx1NUYwRiAvIEZvY3VzIG1vZGVcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTRFMTNcdTZDRThcdTY1RjZcdTk1N0YgLyBGb2N1cyBkdXJhdGlvblwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93bi5hZGRPcHRpb24oXCIyNVwiLCBcIjI1IG1pblwiKS5hZGRPcHRpb24oXCI1MFwiLCBcIjUwIG1pblwiKS5hZGRPcHRpb24oXCI5MFwiLCBcIjkwIG1pblwiKS5zZXRWYWx1ZShTdHJpbmcodGhpcy5taW51dGVzKSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5taW51dGVzID0gTnVtYmVyKHZhbHVlKSkpO1xuICAgIGNvbnN0IGN1c3RvbSA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyB0eXBlOiBcIm51bWJlclwiLCBwbGFjZWhvbGRlcjogXCJDdXN0b20gbWludXRlcyAvIFx1ODFFQVx1NUI5QVx1NEU0OVx1NTIwNlx1OTQ5RlwiIH0pO1xuICAgIGN1c3RvbS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4geyBjb25zdCB2YWx1ZSA9IE51bWJlcihjdXN0b20udmFsdWUpOyBpZiAodmFsdWUgPiAwKSB0aGlzLm1pbnV0ZXMgPSB2YWx1ZTsgfSk7XG4gICAgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiXHU5MDA5XHU2MkU5XHU0RUZCXHU1MkExIC8gQ2hvb3NlIGEgdGFza1wiIH0pO1xuICAgIGZvciAoY29uc3QgdGFzayBvZiB0aGlzLnRhc2tzKSB7XG4gICAgICBjb25zdCBidXR0b24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJhaS1wbGFubmVyLWZvY3VzLXRhc2tcIiB9KTtcbiAgICAgIGJ1dHRvbi5zZXRUZXh0KGAke3Rhc2suY2F0ZWdvcnkgPyBgJHt0YXNrLmNhdGVnb3J5fSBcdTAwQjcgYCA6IFwiXCJ9JHt0YXNrLm5hbWV9ICgke3Rhc2suZXN0aW1hdGVkTWludXRlcyB8fCBcIj9cIn0gbWluKWApO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7IHRoaXMuY2xvc2UoKTsgdm9pZCB0aGlzLnBsdWdpbi5zdGFydEZvY3VzKHRoaXMuZmlsZSwgdGFzaywgdGhpcy5taW51dGVzKTsgfSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIEZvY3VzVGltZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBpbnRlcnZhbDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luLmdldEFjdGl2ZUZvY3VzKCk7XG4gICAgaWYgKCFzZXNzaW9uKSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgdGhpcy5wbHVnaW4uc2V0Rm9jdXNUaW1lck9wZW4odHJ1ZSk7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiLCBcImFpLXBsYW5uZXItZm9jdXMtdGltZXJcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTRFMkQgLyBGb2N1c2luZ1wiKTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBzZXNzaW9uLnRhc2tOYW1lLCBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy10aXRsZVwiIH0pO1xuICAgIGNvbnN0IGNsb2NrID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1jbG9ja1wiIH0pO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG4gICAgICB0ZXh0OiBcIlx1NTE3M1x1OTVFRFx1NkI2NFx1N0E5N1x1NTNFM1x1NTNFQVx1NEYxQVx1NjcwMFx1NUMwRlx1NTMxNlx1RkYwQ1x1OEJBMVx1NjVGNlx1NEYxQVx1NEZERFx1NzU1OVx1MzAwMlx1NjI0Qlx1NjczQVx1NTIwN1x1NjM2Mlx1NTIzMFx1NTE3Nlx1NUI4MyBBcHAgXHU1NDBFXHU2MzA5XHU3RUNGXHU4RkM3XHU3Njg0XHU1ODk5XHU0RTBBXHU2NUY2XHU5NUY0XHU0RjMwXHU3Qjk3XHVGRjFCaU9TIFx1NTNFRlx1ODBGRFx1NjY4Mlx1NTA1Q1x1NjIxNlx1NTZERVx1NjUzNiBPYnNpZGlhblx1RkYwQ1x1NTZFMFx1NkI2NFx1OEZEOVx1NEUwRFx1NEVFM1x1ODg2OFx1NURGMlx1OUE4Q1x1OEJDMVx1NzY4NFx1NEUxM1x1NkNFOFx1NjIxNlx1OTYwNVx1OEJGQlx1NjVGNlx1OTU3Rlx1MzAwMiAvIENsb3Npbmcgb25seSBtaW5pbWl6ZXMgdGhpcyB0aW1lci4gTW9iaWxlIGJhY2tncm91bmQgdGltZSBpcyBhIHdhbGwtY2xvY2sgZXN0aW1hdGU7IGlPUyBtYXkgc3VzcGVuZCBvciB0ZXJtaW5hdGUgT2JzaWRpYW4sIHNvIGl0IGlzIG5vdCB2ZXJpZmllZCBmb2N1cyBvciByZWFkaW5nIHRpbWUuXCIsXG4gICAgICBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1kaXNjbGFpbWVyXCJcbiAgICB9KTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGNvbnN0IHBhdXNlID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTY2ODJcdTUwNUMgLyBQYXVzZVwiIH0pO1xuICAgIGNvbnN0IGZpbmlzaCA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU3RUQzXHU2NzVGIC8gRmluaXNoXCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgY29uc3QgcmVmcmVzaCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVGb2N1cygpO1xuICAgICAgaWYgKCFjdXJyZW50KSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgICBjb25zdCBlbGFwc2VkID0gY3VycmVudC5mb2N1c2VkTXMgKyAoY3VycmVudC5ydW5uaW5nQXQgPT09IG51bGwgPyAwIDogTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIGN1cnJlbnQucnVubmluZ0F0KSk7XG4gICAgICBjb25zdCByZW1haW5pbmcgPSBNYXRoLm1heCgwLCBjdXJyZW50LmR1cmF0aW9uTXMgLSBlbGFwc2VkKTtcbiAgICAgIGNsb2NrLnNldFRleHQoZm9ybWF0RHVyYXRpb24ocmVtYWluaW5nKSk7XG4gICAgICBwYXVzZS5zZXRUZXh0KGN1cnJlbnQucnVubmluZ0F0ID09PSBudWxsID8gXCJcdTdFRTdcdTdFRUQgLyBSZXN1bWVcIiA6IFwiXHU2NjgyXHU1MDVDIC8gUGF1c2VcIik7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDApIHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKTtcbiAgICB9O1xuICAgIHBhdXNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucGx1Z2luLnRvZ2dsZUZvY3VzUGF1c2UoKS50aGVuKHJlZnJlc2gpKTtcbiAgICBmaW5pc2guYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKS50aGVuKCgpID0+IHRoaXMuY2xvc2UoKSkpO1xuICAgIHRoaXMuaW50ZXJ2YWwgPSB3aW5kb3cuc2V0SW50ZXJ2YWwocmVmcmVzaCwgNTAwKTsgcmVmcmVzaCgpO1xuICB9XG4gIG9uQ2xvc2UoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaW50ZXJ2YWwgIT09IG51bGwpIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWwpO1xuICAgIHRoaXMucGx1Z2luLnNldEZvY3VzVGltZXJPcGVuKGZhbHNlKTtcbiAgfVxufVxuXG5jbGFzcyBNb2JpbGVQbGFuRWRpdG9yVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcbiAgcHJpdmF0ZSBtb2RlOiBQbGFuTW9kZSA9IFwic3R1ZHlcIjtcbiAgcHJpdmF0ZSBkYXRlID0gbG9jYWxEYXRlKCk7XG4gIHByaXZhdGUgc3RhcnRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBlbmRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBpbnB1dCA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihsZWFmKTsgfVxuXG4gIGdldFZpZXdUeXBlKCk6IHN0cmluZyB7IHJldHVybiBNT0JJTEVfUExBTl9FRElUT1JfVklFVzsgfVxuICBnZXREaXNwbGF5VGV4dCgpOiBzdHJpbmcgeyByZXR1cm4gXCJBSSBQbGFubmVyXCI7IH1cbiAgZ2V0SWNvbigpOiBzdHJpbmcgeyByZXR1cm4gXCJjYWxlbmRhci1wbHVzXCI7IH1cblxuICBhc3luYyBvbk9wZW4oKTogUHJvbWlzZTx2b2lkPiB7IHRoaXMucmVuZGVyKCk7IH1cblxuICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIHRoaXMuY29udGVudEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2JpbGUtZWRpdG9yXCIpO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaDFcIiwgeyB0ZXh0OiBcIkFJIFBsYW5uZXIgLyBBSSBcdThCQTFcdTUyMTJcIiB9KTtcblxuICAgIGNvbnN0IGZvcm0gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtZm9ybVwiIH0pO1xuICAgIGNvbnN0IG1vZGUgPSB0aGlzLmZpZWxkKGZvcm0sIFwiXHU2QTIxXHU1RjBGIC8gTW9kZVwiKS5jcmVhdGVFbChcInNlbGVjdFwiKTtcbiAgICBtb2RlLmNyZWF0ZUVsKFwib3B0aW9uXCIsIHsgdmFsdWU6IFwic3R1ZHlcIiwgdGV4dDogXCJcdTRGNUNcdTRFMUFcdTRFMEVcdTVCNjZcdTRFNjAgLyBIb21ld29yayAmIHN0dWR5XCIgfSk7XG4gICAgbW9kZS5jcmVhdGVFbChcIm9wdGlvblwiLCB7IHZhbHVlOiBcIndvcmtcIiwgdGV4dDogXCJcdTVERTVcdTRGNUMgLyBXb3JrXCIgfSk7XG4gICAgbW9kZS52YWx1ZSA9IHRoaXMubW9kZTtcbiAgICBtb2RlLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4gdGhpcy5tb2RlID0gbW9kZS52YWx1ZSBhcyBQbGFuTW9kZSk7XG5cbiAgICBjb25zdCBkYXRlID0gdGhpcy5maWVsZChmb3JtLCBcIlx1OEJBMVx1NTIxMlx1NjVFNVx1NjcxRiAvIFBsYW4gZGF0ZVwiKS5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJkYXRlXCIgfSk7XG4gICAgZGF0ZS52YWx1ZSA9IHRoaXMuZGF0ZTtcbiAgICBkYXRlLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLmRhdGUgPSBkYXRlLnZhbHVlKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gdGhpcy5jcmVhdGVNb2JpbGVUaW1lSW5wdXQodGhpcy5maWVsZChmb3JtLCBcIlx1NUYwMFx1NTlDQlx1NjVGNlx1OTVGNCAvIFN0YXJ0IHRpbWVcIiwgXCJcdTUzRUZcdTkwMDkgLyBPcHRpb25hbC5cIiksIHRoaXMuc3RhcnRUaW1lLCB2YWx1ZSA9PiB0aGlzLnN0YXJ0VGltZSA9IHZhbHVlKTtcbiAgICBjb25zdCBlbmQgPSB0aGlzLmNyZWF0ZU1vYmlsZVRpbWVJbnB1dCh0aGlzLmZpZWxkKGZvcm0sIFwiXHU2NzAwXHU2NjVBXHU3RUQzXHU2NzVGIC8gTGF0ZXN0IGZpbmlzaFwiLCBcIlx1NTNFRlx1OTAwOSAvIE9wdGlvbmFsLlwiKSwgdGhpcy5lbmRUaW1lLCB2YWx1ZSA9PiB0aGlzLmVuZFRpbWUgPSB2YWx1ZSk7XG5cbiAgICB0aGlzLmZpZWxkKGZvcm0sIFwiXHU0RUZCXHU1MkExXHU2MjE2XHU0RjVDXHU0RTFBIC8gVGFza3Mgb3IgaG9tZXdvcmtcIiwgXCJcdTU4NkJcdTUxOTlcdTc5RDFcdTc2RUUvXHU5ODc5XHU3NkVFXHUzMDAxXHU0RUZCXHU1MkExXHU5MUNGXHUzMDAxXHU2MjJBXHU2QjYyXHU2NUY2XHU5NUY0XHU1NDhDXHU5NjUwXHU1MjM2XHU2NzYxXHU0RUY2XHUzMDAyXCIpO1xuICAgIGNvbnN0IHNvdXJjZUJhciA9IGZvcm0uY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItc291cmNlXCIgfSk7XG4gICAgY29uc3Qgc291cmNlTGFiZWwgPSBzb3VyY2VCYXIuY3JlYXRlU3Bhbih7IHRleHQ6IFwiXHU2NzY1XHU2RTkwIC8gU291cmNlOiBcdTYyNEJcdTUyQThcdThGOTNcdTUxNjUgLyBtYW51YWwgaW5wdXRcIiB9KTtcbiAgICBjb25zdCB1c2VBY3RpdmUgPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NEY3Rlx1NzUyOFx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMCAvIFVzZSBjdXJyZW50IG5vdGVcIiB9KTtcbiAgICBjb25zdCBjaG9vc2UgPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiIH0pO1xuICAgIGNvbnN0IGFyZWEgPSBmb3JtLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1pbnB1dFwiIH0pO1xuICAgIGFyZWEucm93cyA9IDk7XG4gICAgYXJlYS52YWx1ZSA9IHRoaXMuaW5wdXQ7XG4gICAgYXJlYS5wbGFjZWhvbGRlciA9IFwiRXhhbXBsZTogTWF0aCB3b3JrYm9vayBwYWdlcyAxMi0xNDsgbWVtb3JpemUgMjAgRW5nbGlzaCB3b3JkczsgQ2hpbmVzZSByZWFkaW5nIGFsb3VkLlwiO1xuICAgIGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHRoaXMuaW5wdXQgPSBhcmVhLnZhbHVlKTtcbiAgICBjb25zdCBsb2FkU291cmNlID0gYXN5bmMgKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIHRoaXMuaW5wdXQgPSBjb250ZW50O1xuICAgICAgYXJlYS52YWx1ZSA9IGNvbnRlbnQ7XG4gICAgICBzb3VyY2VMYWJlbC5zZXRUZXh0KGBcdTY3NjVcdTZFOTAgLyBTb3VyY2U6ICR7ZmlsZS5wYXRofWApO1xuICAgIH07XG4gICAgdXNlQWN0aXZlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgIGlmICghZmlsZSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBPcGVuIGEgTWFya2Rvd24gbm90ZSBmaXJzdC5cIik7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoZSBjdXJyZW50IG5vdGUuXCIpOyB9XG4gICAgfSk7XG4gICAgY2hvb3NlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBuZXcgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwodGhpcy5hcHAsIGFzeW5jIGZpbGUgPT4ge1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShmaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGF0IG5vdGUuXCIpOyB9XG4gICAgfSkub3BlbigpKTtcblxuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLW1vYmlsZS1hY3Rpb25zXCIgfSk7XG4gICAgY29uc3QgbWFudWFsID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTYyNEJcdTUyQThcdTUyMUJcdTVFRkEgLyBDcmVhdGUgbWFudWFsXCIgfSk7XG4gICAgY29uc3QgZ2VuZXJhdGUgPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBtYW51YWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHRhc2tzID0gdGhpcy5pbnB1dC5zcGxpdCgvXFxyP1xcbi8pLm1hcCh0aXRsZSA9PiB0aXRsZS50cmltKCkpLmZpbHRlcihCb29sZWFuKS5tYXAodGl0bGUgPT4gKHsgdGl0bGUsIGNhdGVnb3J5OiBcIlx1NTE3Nlx1NUI4M1wiLCBlc3RpbWF0ZWRNaW51dGVzOiAzMCB9KSk7XG4gICAgICBpZiAoIXRhc2tzLmxlbmd0aCkgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdTZCQ0ZcdTg4NENcdTU4NkJcdTUxOTlcdTRFMDBcdTk4NzlcdTRFRkJcdTUyQTEgLyBFbnRlciBvbmUgdGFzayBwZXIgbGluZS5cIik7XG4gICAgICBtYW51YWwuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ud3JpdGVQbGFuKHRoaXMubW9kZSwgdGhpcy5kYXRlLCB7IHRpdGxlOiBgJHt0aGlzLmRhdGV9ICR7dGhpcy5tb2RlID09PSBcInN0dWR5XCIgPyBcIlx1NjI0Qlx1NTJBOFx1NUI2Nlx1NEU2MFx1OEJBMVx1NTIxMlwiIDogXCJcdTYyNEJcdTUyQThcdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcIn1gLCBzdW1tYXJ5OiBcIlx1NjI0Qlx1NTJBOFx1NUVGQVx1N0FDQlx1MzAwMlx1NjNEMlx1NEVGNlx1NEYxQVx1NjgzOVx1NjM2RVx1NEVGQlx1NTJBMVx1OEJCMFx1NUY1NVx1ODFFQVx1NTJBOFx1NjZGNFx1NjVCMFx1NjI2N1x1ODg0Q1x1NjAzQlx1N0VEM1x1MzAwMlwiLCB0YXNrcywgcmV2aWV3VGFza3M6IFtdIH0pO1xuICAgICAgICBuZXcgTm90aWNlKFwiXHU2MjRCXHU1MkE4XHU4QkExXHU1MjEyXHU1REYyXHU1MjFCXHU1RUZBIC8gTWFudWFsIHBsYW4gY3JlYXRlZC5cIik7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3QgY3JlYXRlIHRoZSBtYW51YWwgcGxhbi5cIik7XG4gICAgICAgIG1hbnVhbC5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGdlbmVyYXRlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuaW5wdXQudHJpbSgpKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1ODFGM1x1NUMxMVx1NTg2Qlx1NTE5OVx1NEUwMFx1OTg3OVx1NEVGQlx1NTJBMSAvIEVudGVyIGF0IGxlYXN0IG9uZSB0YXNrIGZpcnN0LlwiKTtcbiAgICAgIGdlbmVyYXRlLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGdlbmVyYXRlLnNldFRleHQoXCJcdTZCNjNcdTU3MjhcdTc1MUZcdTYyMTAgLyBHZW5lcmF0aW5nLi4uXCIpO1xuICAgICAgYXJlYS5ibHVyKCk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwbGFuID0gYXdhaXQgdGhpcy5wbHVnaW4uZ2VuZXJhdGVQbGFuKHRoaXMubW9kZSwgdGhpcy5kYXRlLCB0aGlzLnN0YXJ0VGltZSwgdGhpcy5lbmRUaW1lLCB0aGlzLmlucHV0KTtcbiAgICAgICAgbmV3IFBsYW5QcmV2aWV3TW9kYWwodGhpcy5hcHAsIHRoaXMucGx1Z2luLCB0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgcGxhbikub3BlbigpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiQ291bGQgbm90IGdlbmVyYXRlIHBsYW4uXCIpO1xuICAgICAgICBnZW5lcmF0ZS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICBnZW5lcmF0ZS5zZXRUZXh0KFwiXHU3NTFGXHU2MjEwXHU5ODg0XHU4OUM4IC8gR2VuZXJhdGUgcHJldmlld1wiKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZmllbGQocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgZGVzY3JpcHRpb24/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZmllbGQgPSBwYXJlbnQuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItbW9iaWxlLWZpZWxkXCIgfSk7XG4gICAgZmllbGQuY3JlYXRlRWwoXCJsYWJlbFwiLCB7IHRleHQ6IGxhYmVsIH0pO1xuICAgIGlmIChkZXNjcmlwdGlvbikgZmllbGQuY3JlYXRlRWwoXCJzbWFsbFwiLCB7IHRleHQ6IGRlc2NyaXB0aW9uIH0pO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlTW9iaWxlVGltZUlucHV0KHBhcmVudDogSFRNTEVsZW1lbnQsIHZhbHVlOiBzdHJpbmcsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCk6IEhUTUxJbnB1dEVsZW1lbnQge1xuICAgIGNvbnN0IGlucHV0ID0gcGFyZW50LmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtdGltZVwiLCB0eXBlOiBcInRpbWVcIiB9KTtcbiAgICBpbnB1dC5zdGVwID0gXCI2MFwiO1xuICAgIGlucHV0LnZhbHVlID0gdmFsdWU7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IG9uQ2hhbmdlKGlucHV0LnZhbHVlKSk7XG4gICAgcmV0dXJuIGlucHV0O1xuICB9XG59XG5cbmNsYXNzIE1hbnVhbFRhc2tNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBtb2RlOiBQbGFuTW9kZSA9IFwic3R1ZHlcIjtcbiAgcHJpdmF0ZSBkYXRlID0gbG9jYWxEYXRlKCk7XG4gIHByaXZhdGUgcGxhblRpdGxlID0gXCJcIjtcbiAgcHJpdmF0ZSB0aXRsZSA9IFwiXCI7XG4gIHByaXZhdGUgY2F0ZWdvcnkgPSBcIlwiO1xuICBwcml2YXRlIG1pbnV0ZXMgPSAzMDtcbiAgcHJpdmF0ZSBzdGFydFRpbWUgPSBcIlwiO1xuICBwcml2YXRlIGVuZFRpbWUgPSBcIlwiO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luLCBwcml2YXRlIHJlYWRvbmx5IGZpbGU/OiBURmlsZSkgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQodGhpcy5maWxlID8gXCJcdTZERkJcdTUyQTBcdThCQTFcdTUyMTJcdTRFRkJcdTUyQTEgLyBBZGQgdGFza1wiIDogXCJcdTY1QjBcdTVFRkFcdTYyNEJcdTUyQThcdThCQTFcdTUyMTIgLyBDcmVhdGUgbWFudWFsIHBsYW5cIik7XG4gICAgaWYgKCF0aGlzLmZpbGUpIHtcbiAgICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU2QTIxXHU1RjBGIC8gTW9kZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93bi5hZGRPcHRpb24oXCJzdHVkeVwiLCBcIlx1NEY1Q1x1NEUxQVx1NEUwRVx1NUI2Nlx1NEU2MCAvIEhvbWV3b3JrICYgc3R1ZHlcIikuYWRkT3B0aW9uKFwid29ya1wiLCBcIlx1NURFNVx1NEY1QyAvIFdvcmtcIikuc2V0VmFsdWUodGhpcy5tb2RlKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLm1vZGUgPSB2YWx1ZSBhcyBQbGFuTW9kZSkpO1xuICAgICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdThCQTFcdTUyMTJcdTY1RTVcdTY3MUYgLyBQbGFuIGRhdGVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLmRhdGUpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuZGF0ZSA9IHZhbHVlKSk7XG4gICAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1OEJBMVx1NTIxMlx1NjgwN1x1OTg5OCAvIFBsYW4gdGl0bGVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLnBsYW5UaXRsZSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5wbGFuVGl0bGUgPSB2YWx1ZSkpO1xuICAgIH1cbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NEVGQlx1NTJBMSAvIFRhc2tcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLnRpdGxlKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLnRpdGxlID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NTIwNlx1N0M3QiAvIENhdGVnb3J5XCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy5jYXRlZ29yeSkuc2V0UGxhY2Vob2xkZXIoXCJcdTY1NzBcdTVCNjYgLyBQcm9qZWN0XCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuY2F0ZWdvcnkgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU5ODg0XHU4QkExXHU1MjA2XHU5NDlGIC8gRXN0aW1hdGVkIG1pbnV0ZXNcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5taW51dGVzKSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5taW51dGVzID0gTWF0aC5tYXgoMSwgTnVtYmVyKHZhbHVlKSB8fCAzMCkpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NUYwMFx1NTlDQlx1NjVGNlx1OTVGNCAvIFN0YXJ0IHRpbWVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLnN0YXJ0VGltZSkuc2V0UGxhY2Vob2xkZXIoXCIxOTowMFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLnN0YXJ0VGltZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTdFRDNcdTY3NUZcdTY1RjZcdTk1RjQgLyBFbmQgdGltZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMuZW5kVGltZSkuc2V0UGxhY2Vob2xkZXIoXCIxOTozMFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLmVuZFRpbWUgPSB2YWx1ZSkpO1xuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJtb2RhbC1idXR0b24tY29udGFpbmVyXCIgfSk7XG4gICAgY29uc3Qgc3VibWl0ID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogdGhpcy5maWxlID8gXCJcdTZERkJcdTUyQTBcdTRFRkJcdTUyQTEgLyBBZGQgdGFza1wiIDogXCJcdTUyMUJcdTVFRkFcdThCQTFcdTUyMTIgLyBDcmVhdGUgcGxhblwiLCBjbHM6IFwibW9kLWN0YVwiIH0pO1xuICAgIHN1Ym1pdC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLnRpdGxlLnRyaW0oKSkgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdThCRjdcdTU4NkJcdTUxOTlcdTRFRkJcdTUyQTEgLyBFbnRlciBhIHRhc2sgZmlyc3QuXCIpO1xuICAgICAgc3VibWl0LmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmFkZE1hbnVhbFRhc2sodGhpcy5maWxlLCB7IHRpdGxlOiB0aGlzLnRpdGxlLnRyaW0oKSwgY2F0ZWdvcnk6IHRoaXMuY2F0ZWdvcnkudHJpbSgpLCBlc3RpbWF0ZWRNaW51dGVzOiB0aGlzLm1pbnV0ZXMsIHN0YXJ0VGltZTogdGhpcy5zdGFydFRpbWUudHJpbSgpLCBlbmRUaW1lOiB0aGlzLmVuZFRpbWUudHJpbSgpIH0sIHRoaXMubW9kZSwgdGhpcy5kYXRlLCB0aGlzLnBsYW5UaXRsZS50cmltKCkpO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3Qgc2F2ZSB0aGUgdGFzay5cIik7XG4gICAgICAgIHN1Ym1pdC5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIFBsYW5JbnB1dE1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG1vZGU6IFBsYW5Nb2RlID0gXCJzdHVkeVwiO1xuICBwcml2YXRlIGRhdGUgPSBsb2NhbERhdGUoKTtcbiAgcHJpdmF0ZSBzdGFydFRpbWUgPSBcIlwiO1xuICBwcml2YXRlIGVuZFRpbWUgPSBcIlwiO1xuICBwcml2YXRlIGlucHV0ID0gXCJcIjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJBSSBQbGFubmVyIC8gQUkgXHU4QkExXHU1MjEyXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU2QTIxXHU1RjBGIC8gTW9kZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxuICAgICAgLmFkZE9wdGlvbihcInN0dWR5XCIsIFwiXHU0RjVDXHU0RTFBXHU0RTBFXHU1QjY2XHU0RTYwIC8gSG9tZXdvcmsgJiBzdHVkeVwiKVxuICAgICAgLmFkZE9wdGlvbihcIndvcmtcIiwgXCJcdTVERTVcdTRGNUMgLyBXb3JrXCIpXG4gICAgICAuc2V0VmFsdWUodGhpcy5tb2RlKVxuICAgICAgLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMubW9kZSA9IHZhbHVlIGFzIFBsYW5Nb2RlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdThCQTFcdTUyMTJcdTY1RTVcdTY3MUYgLyBQbGFuIGRhdGVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dFxuICAgICAgLnNldFZhbHVlKHRoaXMuZGF0ZSkuc2V0UGxhY2Vob2xkZXIoXCJZWVlZLU1NLUREXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuZGF0ZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTVGMDBcdTU5Q0JcdTY1RjZcdTk1RjQgLyBTdGFydCB0aW1lXCIpLnNldERlc2MoXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiAxOTowMFwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0XG4gICAgICAuc2V0VmFsdWUodGhpcy5zdGFydFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMTk6MDBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5zdGFydFRpbWUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU2NzAwXHU2NjVBXHU3RUQzXHU2NzVGIC8gTGF0ZXN0IGZpbmlzaFwiKS5zZXREZXNjKFwiXHU1M0VGXHU5MDA5IC8gT3B0aW9uYWwuXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXRcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLmVuZFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMjE6MDBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5lbmRUaW1lID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NEVGQlx1NTJBMVx1NjIxNlx1NEY1Q1x1NEUxQSAvIFRhc2tzIG9yIGhvbWV3b3JrXCIpLnNldERlc2MoXCJcdTU4NkJcdTUxOTlcdTc5RDFcdTc2RUUvXHU5ODc5XHU3NkVFXHUzMDAxXHU0RUZCXHU1MkExXHU5MUNGXHUzMDAxXHU2MjJBXHU2QjYyXHU2NUY2XHU5NUY0XHU1NDhDXHU5NjUwXHU1MjM2XHU2NzYxXHU0RUY2XHUzMDAyXCIpO1xuICAgIGNvbnN0IHNvdXJjZUJhciA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLXNvdXJjZVwiIH0pO1xuICAgIGNvbnN0IHNvdXJjZUxhYmVsID0gc291cmNlQmFyLmNyZWF0ZVNwYW4oeyB0ZXh0OiBcIlx1Njc2NVx1NkU5MCAvIFNvdXJjZTogXHU2MjRCXHU1MkE4XHU4RjkzXHU1MTY1IC8gbWFudWFsIGlucHV0XCIgfSk7XG4gICAgY29uc3QgdXNlQWN0aXZlQnV0dG9uID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTRGN0ZcdTc1MjhcdTVGNTNcdTUyNERcdTdCMTRcdThCQjAgLyBVc2UgY3VycmVudCBub3RlXCIgfSk7XG4gICAgY29uc3QgY2hvb3NlQnV0dG9uID0gc291cmNlQmFyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTkwMDlcdTYyRTkgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gQ2hvb3NlIG5vdGVcIiB9KTtcbiAgICBjb25zdCBhcmVhID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJ0ZXh0YXJlYVwiLCB7IGNsczogXCJhaS1wbGFubmVyLWlucHV0XCIgfSk7XG4gICAgYXJlYS5yb3dzID0gODtcbiAgICBhcmVhLnBsYWNlaG9sZGVyID0gXCJFeGFtcGxlOiBNYXRoIHdvcmtib29rIHBhZ2VzIDEyLTE0OyBtZW1vcml6ZSAyMCBFbmdsaXNoIHdvcmRzOyBDaGluZXNlIHJlYWRpbmcgYWxvdWQuXCI7XG4gICAgYXJlYS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gdGhpcy5pbnB1dCA9IGFyZWEudmFsdWUpO1xuICAgIGNvbnN0IGxvYWRTb3VyY2UgPSBhc3luYyAoZmlsZTogVEZpbGUpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgdGhpcy5pbnB1dCA9IGNvbnRlbnQ7XG4gICAgICBhcmVhLnZhbHVlID0gY29udGVudDtcbiAgICAgIHNvdXJjZUxhYmVsLnNldFRleHQoYFx1Njc2NVx1NkU5MCAvIFNvdXJjZTogJHtmaWxlLnBhdGh9YCk7XG4gICAgfTtcbiAgICB1c2VBY3RpdmVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGFjdGl2ZUZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgaWYgKCFhY3RpdmVGaWxlIHx8IGFjdGl2ZUZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU1MTQ4XHU2MjUzXHU1RjAwXHU0RTAwXHU0RTJBIE1hcmtkb3duIFx1N0IxNFx1OEJCMCAvIE9wZW4gYSBNYXJrZG93biBub3RlIGZpcnN0LlwiKTtcbiAgICAgIHRyeSB7IGF3YWl0IGxvYWRTb3VyY2UoYWN0aXZlRmlsZSk7IH0gY2F0Y2ggeyBuZXcgTm90aWNlKFwiQ291bGQgbm90IHJlYWQgdGhlIGN1cnJlbnQgbm90ZS5cIik7IH1cbiAgICB9KTtcbiAgICBjaG9vc2VCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IG5ldyBNYXJrZG93bkZpbGVQaWNrZXJNb2RhbCh0aGlzLmFwcCwgYXN5bmMgZmlsZSA9PiB7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoYXQgbm90ZS5cIik7IH1cbiAgICB9KS5vcGVuKCkpO1xuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJtb2RhbC1idXR0b24tY29udGFpbmVyXCIgfSk7XG4gICAgY29uc3QgYnV0dG9uID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuaW5wdXQudHJpbSgpKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1ODFGM1x1NUMxMVx1NTg2Qlx1NTE5OVx1NEUwMFx1OTg3OVx1NEVGQlx1NTJBMSAvIEVudGVyIGF0IGxlYXN0IG9uZSB0YXNrIGZpcnN0LlwiKTtcbiAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBidXR0b24uc2V0VGV4dChcIlx1NkI2M1x1NTcyOFx1NzUxRlx1NjIxMCAvIEdlbmVyYXRpbmcuLi5cIik7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwbGFuID0gYXdhaXQgdGhpcy5wbHVnaW4uZ2VuZXJhdGVQbGFuKHRoaXMubW9kZSwgdGhpcy5kYXRlLCB0aGlzLnN0YXJ0VGltZSwgdGhpcy5lbmRUaW1lLCB0aGlzLmlucHV0KTtcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICBuZXcgUGxhblByZXZpZXdNb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHRoaXMubW9kZSwgdGhpcy5kYXRlLCBwbGFuKS5vcGVuKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3QgZ2VuZXJhdGUgcGxhbi5cIik7XG4gICAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICBidXR0b24uc2V0VGV4dChcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgcXVlcnkgPSBcIlwiO1xuICBwcml2YXRlIHJlYWRvbmx5IGZpbGVzOiBURmlsZVtdO1xuICBwcml2YXRlIHJlc3VsdHNFbDogSFRNTEVsZW1lbnQ7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgb25DaG9vc2U6IChmaWxlOiBURmlsZSkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMuZmlsZXMgPSBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xuICAgIHRoaXMucmVzdWx0c0VsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIsIFwiYWktcGxhbm5lci1maWxlLXBpY2tlclwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiKTtcbiAgICBjb25zdCBzZWFyY2ggPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJzZWFyY2hcIiwgcGxhY2Vob2xkZXI6IFwiXHU2NDFDXHU3RDIyXHU3QjE0XHU4QkIwIC8gU2VhcmNoIG5vdGVzLi4uXCIsIGNsczogXCJhaS1wbGFubmVyLWZpbGUtc2VhcmNoXCIgfSk7XG4gICAgc2VhcmNoLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB7IHRoaXMucXVlcnkgPSBzZWFyY2gudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7IHRoaXMucmVuZGVyUmVzdWx0cygpOyB9KTtcbiAgICB0aGlzLnJlc3VsdHNFbCA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLWZpbGUtcmVzdWx0c1wiIH0pO1xuICAgIHRoaXMucmVuZGVyUmVzdWx0cygpO1xuICAgIHNlYXJjaC5mb2N1cygpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJSZXN1bHRzKCk6IHZvaWQge1xuICAgIHRoaXMucmVzdWx0c0VsLmVtcHR5KCk7XG4gICAgY29uc3QgbWF0Y2hlcyA9IHRoaXMuZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5wYXRoLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGhpcy5xdWVyeSkpLnNsaWNlKDAsIDEwMCk7XG4gICAgaWYgKCFtYXRjaGVzLmxlbmd0aCkgeyB0aGlzLnJlc3VsdHNFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIk5vIE1hcmtkb3duIG5vdGVzIGZvdW5kLlwiIH0pOyByZXR1cm47IH1cbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgbWF0Y2hlcykge1xuICAgICAgY29uc3QgYnV0dG9uID0gdGhpcy5yZXN1bHRzRWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwiYWktcGxhbm5lci1maWxlLWl0ZW1cIiB9KTtcbiAgICAgIGJ1dHRvbi5jcmVhdGVFbChcInN0cm9uZ1wiLCB7IHRleHQ6IGZpbGUuYmFzZW5hbWUgfSk7XG4gICAgICBidXR0b24uY3JlYXRlRWwoXCJzbWFsbFwiLCB7IHRleHQ6IGZpbGUucGF0aCB9KTtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4geyBhd2FpdCB0aGlzLm9uQ2hvb3NlKGZpbGUpOyB0aGlzLmNsb3NlKCk7IH0pO1xuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBQbGFuUHJldmlld01vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBtb2RlOiBQbGFuTW9kZSwgcHJpdmF0ZSByZWFkb25seSBkYXRlOiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgcGxhbjogUGxhblJlc3VsdCkgeyBzdXBlcihhcHApOyB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQodGhpcy5wbGFuLnRpdGxlIHx8IFwiUGxhbiBwcmV2aWV3XCIpO1xuICAgIGlmICh0aGlzLnBsYW4uc3VtbWFyeSkgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogdGhpcy5wbGFuLnN1bW1hcnkgfSk7XG4gICAgcmVuZGVyUHJldmlld1Rhc2tzKHRoaXMuY29udGVudEVsLCBcIlBsYW5cIiwgdGhpcy5wbGFuLnRhc2tzKTtcbiAgICBpZiAodGhpcy5tb2RlID09PSBcInN0dWR5XCIpIHJlbmRlclByZXZpZXdUYXNrcyh0aGlzLmNvbnRlbnRFbCwgXCJSZXZpZXdcIiwgdGhpcy5wbGFuLnJldmlld1Rhc2tzID8/IFtdKTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuY2xvc2UoKSk7XG4gICAgYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJXcml0ZSBwbGFuXCIsIGNsczogXCJtb2QtY3RhXCIgfSkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBhd2FpdCB0aGlzLnBsdWdpbi53cml0ZVBsYW4odGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMucGxhbik7XG4gICAgICAgIG5ldyBOb3RpY2UoYFBsYW4gd3JpdHRlbjogJHtwYXRofWApO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3Qgd3JpdGUgcGxhbi5cIik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgQUlQbGFubmVyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihhcHAsIHBsdWdpbik7IH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIHRoaXMuY29udGFpbmVyRWwuZW1wdHkoKTtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkFJIFBsYW5uZXIgXHU4QkJFXHU3RjZFIC8gU2V0dGluZ3NcIiB9KTtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiQ2xhdWRlIFx1NEUwRSBHZW1pbmkgXHU0RjdGXHU3NTI4XHU1MzlGXHU3NTFGXHU2M0E1XHU1M0UzXHVGRjFCXHU1MTc2XHU1QjgzXHU5ODg0XHU4QkJFXHU0RjdGXHU3NTI4IE9wZW5BSS1jb21wYXRpYmxlIFx1NjNBNVx1NTNFM1x1MzAwMkNsYXVkZSBhbmQgR2VtaW5pIHVzZSBuYXRpdmUgQVBJIGZvcm1hdHMuXCIgfSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NzU0Q1x1OTc2Mlx1OEJFRFx1OEEwMCAvIEludGVyZmFjZSBsYW5ndWFnZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxuICAgICAgLmFkZE9wdGlvbihcImF1dG9cIiwgXCJcdThEREZcdTk2OEZcdTdDRkJcdTdFREYgLyBGb2xsb3cgc3lzdGVtXCIpXG4gICAgICAuYWRkT3B0aW9uKFwiemhcIiwgXCJcdTRFMkRcdTY1ODdcIilcbiAgICAgIC5hZGRPcHRpb24oXCJlblwiLCBcIkVuZ2xpc2hcIilcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5pbnRlcmZhY2VMYW5ndWFnZSlcbiAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmludGVyZmFjZUxhbmd1YWdlID0gdmFsdWUgYXMgSW50ZXJmYWNlTGFuZ3VhZ2U7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NjcwRFx1NTJBMVx1NTU0Nlx1OTg4NFx1OEJCRSAvIFByb3ZpZGVyIHByZXNldFwiKS5zZXREZXNjKFwiXHU5MDA5XHU2MkU5XHU1NDBFXHU0RjFBXHU1ODZCXHU1MTY1XHU2M0E4XHU4MzUwXHU1NzMwXHU1NzQwXHU0RTBFXHU2QTIxXHU1NzhCXHVGRjBDXHU1M0VGXHU3RUU3XHU3RUVEXHU2MjRCXHU1MkE4XHU0RkVFXHU2NTM5XHUzMDAyXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcbiAgICAgIGZvciAoY29uc3QgW2lkLCBwcmVzZXRdIG9mIE9iamVjdC5lbnRyaWVzKFBST1ZJREVSUykpIGRyb3Bkb3duLmFkZE9wdGlvbihpZCwgcHJlc2V0LmxhYmVsKTtcbiAgICAgIGRyb3Bkb3duLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnByb3ZpZGVyKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gdmFsdWUgYXMgUHJvdmlkZXJJZDtcbiAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICAgICAgaWYgKHByb3ZpZGVyICE9PSBcImN1c3RvbVwiKSB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCA9IFBST1ZJREVSU1twcm92aWRlcl0uYmFzZVVybDtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tb2RlbCA9IFBST1ZJREVSU1twcm92aWRlcl0ubW9kZWw7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIkFQSSBcdTU3MzBcdTU3NDAgLyBBUEkgYmFzZSBVUkxcIiwgXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiBodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsIFwiYXBpQmFzZVVybFwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiQVBJIFx1NUJDNlx1OTRBNSAvIEFQSSBrZXlcIikuc2V0RGVzYyhcIlN0b3JlZCBpbiB0aGlzIHBsdWdpbidzIGRhdGEuanNvbi5cIikuYWRkVGV4dChpbnB1dCA9PiB7XG4gICAgICBpbnB1dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlLZXkpLnNldFBsYWNlaG9sZGVyKFwic2stLi4uXCIpO1xuICAgICAgaW5wdXQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuICAgICAgaW5wdXQub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlLZXkgPSB2YWx1ZTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pO1xuICAgIH0pO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTZBMjFcdTU3OEIgLyBNb2RlbFwiLCBcIlx1NEY4Qlx1NTk4MiAvIEV4YW1wbGU6IGdwdC00LjEtbWluaSwgZGVlcHNlZWstY2hhdCwgZ2xtLTQtZmxhc2hcIiwgXCJtb2RlbFwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU4MUVBXHU1QjlBXHU0RTQ5XHU4QkY3XHU2QzQyXHU1OTM0IC8gQ3VzdG9tIGhlYWRlcnNcIiwgXCJKU09OIG9iamVjdCwgb3B0aW9uYWwuXCIsIFwiY3VzdG9tSGVhZGVyc1wiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2RTI5XHU1RUE2IC8gVGVtcGVyYXR1cmVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MudGVtcGVyYXR1cmUpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnRlbXBlcmF0dXJlID0gTnVtYmVyKHZhbHVlKSB8fCAwOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTY3MDBcdTU5MjdcdThGOTNcdTUxRkFcdTk1N0ZcdTVFQTYgLyBNYXggb3V0cHV0IHRva2Vuc1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tYXhUb2tlbnMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLm1heFRva2VucyA9IE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5tYXhUb2tlbnM7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NTM4Nlx1NTNGMlx1NjgyMVx1NTFDNlx1NTkyOVx1NjU3MCAvIEhpc3RvcnkgZGF5c1wiKS5zZXREZXNjKFwiXHU3NTFGXHU2MjEwXHU4QkExXHU1MjEyXHU2NUY2XHU4QkZCXHU1M0Q2XHU4RkQxXHU2NzFGXHU3NzFGXHU1QjlFXHU3NTI4XHU2NUY2XHVGRjBDXHU1RUZBXHU4QkFFIDctMzAgXHU1OTI5XHUzMDAyXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5oaXN0b3J5RGF5cyA9IE1hdGgubWF4KDEsIE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5oaXN0b3J5RGF5cyk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1OUVEOFx1OEJBNFx1NEUxM1x1NkNFOFx1NTIwNlx1OTQ5RiAvIERlZmF1bHQgZm9jdXMgbWludXRlc1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbnV0ZXMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlcyA9IE1hdGgubWF4KDEsIE51bWJlcih2YWx1ZSkgfHwgREVGQVVMVF9TRVRUSU5HUy5mb2N1c01pbnV0ZXMpOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTVCNjZcdTRFNjBcdThGOTNcdTUxRkFcdTc2RUVcdTVGNTUgLyBTdHVkeSBvdXRwdXQgZm9sZGVyXCIsIFwiVmF1bHQtcmVsYXRpdmUgcGF0aC5cIiwgXCJzdHVkeUZvbGRlclwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU1REU1XHU0RjVDXHU4RjkzXHU1MUZBXHU3NkVFXHU1RjU1IC8gV29yayBvdXRwdXQgZm9sZGVyXCIsIFwiVmF1bHQtcmVsYXRpdmUgcGF0aC5cIiwgXCJ3b3JrRm9sZGVyXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSB0ZXh0U2V0dGluZyhuYW1lOiBzdHJpbmcsIGRlc2M6IHN0cmluZywga2V5OiBcImFwaUJhc2VVcmxcIiB8IFwibW9kZWxcIiB8IFwiY3VzdG9tSGVhZGVyc1wiIHwgXCJzdHVkeUZvbGRlclwiIHwgXCJ3b3JrRm9sZGVyXCIpOiB2b2lkIHtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKG5hbWUpLnNldERlc2MoZGVzYykuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5nc1trZXldKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzW2tleV0gPSB2YWx1ZS50cmltKCk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VQbGFuKGNvbnRlbnQ6IHN0cmluZyk6IFBsYW5SZXN1bHQge1xuICBjb25zdCBqc29uID0gY29udGVudC50cmltKCkucmVwbGFjZSgvXmBgYCg/Ompzb24pP1xccyovaSwgXCJcIikucmVwbGFjZSgvXFxzKmBgYCQvLCBcIlwiKTtcbiAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uKSBhcyBQbGFuUmVzdWx0O1xuICBpZiAoIXBhcnNlZC50aXRsZSB8fCAhQXJyYXkuaXNBcnJheShwYXJzZWQudGFza3MpKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgbW9kZWwgcmV0dXJuZWQgYW4gaW52YWxpZCBwbGFuIGZvcm1hdC5cIik7XG4gIHBhcnNlZC50YXNrcyA9IHBhcnNlZC50YXNrcy5tYXAobm9ybWFsaXplVGFzaykuZmlsdGVyKEJvb2xlYW4pIGFzIFBsYW5UYXNrW107XG4gIHBhcnNlZC5yZXZpZXdUYXNrcyA9IEFycmF5LmlzQXJyYXkocGFyc2VkLnJldmlld1Rhc2tzKSA/IHBhcnNlZC5yZXZpZXdUYXNrcy5tYXAobm9ybWFsaXplVGFzaykuZmlsdGVyKEJvb2xlYW4pIGFzIFBsYW5UYXNrW10gOiBbXTtcbiAgaWYgKCFwYXJzZWQudGFza3MubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgbW9kZWwgZGlkIG5vdCByZXR1cm4gYW55IHRhc2tzLlwiKTtcbiAgcmV0dXJuIHBhcnNlZDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplVGFzayh2YWx1ZTogdW5rbm93bik6IFBsYW5UYXNrIHwgbnVsbCB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSBcIm9iamVjdFwiKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgdGFzayA9IHZhbHVlIGFzIFBhcnRpYWw8UGxhblRhc2s+O1xuICBpZiAoIXRhc2sudGl0bGUpIHJldHVybiBudWxsO1xuICByZXR1cm4geyB0aXRsZTogU3RyaW5nKHRhc2sudGl0bGUpLCBjYXRlZ29yeTogdGFzay5jYXRlZ29yeSA/IFN0cmluZyh0YXNrLmNhdGVnb3J5KSA6IFwiXCIsIHN0YXJ0VGltZTogdGFzay5zdGFydFRpbWUgPyBTdHJpbmcodGFzay5zdGFydFRpbWUpIDogXCJcIiwgZW5kVGltZTogdGFzay5lbmRUaW1lID8gU3RyaW5nKHRhc2suZW5kVGltZSkgOiBcIlwiLCBlc3RpbWF0ZWRNaW51dGVzOiBNYXRoLm1heCgxLCBOdW1iZXIodGFzay5lc3RpbWF0ZWRNaW51dGVzKSB8fCAzMCksIGRlc2NyaXB0aW9uOiB0YXNrLmRlc2NyaXB0aW9uID8gU3RyaW5nKHRhc2suZGVzY3JpcHRpb24pIDogXCJcIiB9O1xufVxuXG5mdW5jdGlvbiByZW5kZXJQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBzdHJpbmcge1xuICBjb25zdCBhbGxUYXNrcyA9IFsuLi5wbGFuLnRhc2tzLCAuLi4ocGxhbi5yZXZpZXdUYXNrcyA/PyBbXSldO1xuICBjb25zdCBmcm9udG1hdHRlciA9IGFsbFRhc2tzLmZsYXRNYXAoKHRhc2ssIGluZGV4KSA9PiB7XG4gICAgY29uc3QgaWQgPSBgdGFzayR7U3RyaW5nKGluZGV4ICsgMSkucGFkU3RhcnQoMiwgXCIwXCIpfWA7XG4gICAgcmV0dXJuIFtgJHtpZH1OYW1lOiAke3lhbWxRdW90ZSh0YXNrLnRpdGxlKX1gLCBgJHtpZH1DYXRlZ29yeTogJHt5YW1sUXVvdGUodGFzay5jYXRlZ29yeSB8fCBcIlx1NTE3Nlx1NUI4M1wiKX1gLCBgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzOiAke3Rhc2suZXN0aW1hdGVkTWludXRlc31gLCBgJHtpZH1BY3R1YWxTdGFydDpgLCBgJHtpZH1BY3R1YWxFbmQ6YCwgYCR7aWR9QWN0dWFsTWludXRlczogMGAsIGAke2lkfUZvY3VzU2Vzc2lvbnM6IDBgXTtcbiAgfSk7XG4gIGNvbnN0IHRhc2tDYXJkcyA9IChsYWJlbDogc3RyaW5nLCB0YXNrczogUGxhblRhc2tbXSwgb2Zmc2V0OiBudW1iZXIpID0+IHRhc2tzLmxlbmd0aCA/IGAjIyAke2xhYmVsfVxcblxcbiR7dGFza3MubWFwKCh0YXNrLCBpbmRleCkgPT4gcmVuZGVyVGFzayh0YXNrLCBkYXRlLCBvZmZzZXQgKyBpbmRleCArIDEpKS5qb2luKFwiXFxuXFxuXCIpfWAgOiBgIyMgJHtsYWJlbH1cXG5cXG5cdTY2ODJcdTY1RTBcdTVCODlcdTYzOTJcdTMwMDJgO1xuICByZXR1cm4gYC0tLVxcbnR5cGU6ICR7bW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTZCQ0ZcdTY1RTVcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU2QkNGXHU2NUU1XHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCJ9XFxucGxhbkRhdGU6ICR7ZGF0ZX1cXG50YWdzOlxcbiAgLSBBSVx1OEJBMVx1NTIxMlxcbiR7ZnJvbnRtYXR0ZXIuam9pbihcIlxcblwiKX1cXG4tLS1cXG5cXG4jICR7cGxhbi50aXRsZX1cXG5cXG4+IFshYWJzdHJhY3RdIFx1Njk4Mlx1ODlDOFxcbj4gJHtwbGFuLnN1bW1hcnkgfHwgXCJcdTc1MzEgQUkgUGxhbm5lciBcdTc1MUZcdTYyMTBcdUZGMENcdTYyNjdcdTg4NENcdTU0MEVcdTU4NkJcdTUxOTlcdTZCQ0ZcdTk4NzlcdTVCOUVcdTk2NDVcdTVGMDBcdTU5Q0JcdTU0OENcdTVCOENcdTYyMTBcdTY1RjZcdTk1RjRcdTMwMDJcIn1cXG5cXG48IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpTVEFSVCAtLT5cXG4+IFshc3VtbWFyeV0gXHU2MjY3XHU4ODRDXHU2MDNCXHU3RUQzIC8gRXhlY3V0aW9uIHN1bW1hcnlcXG4+IC0gXHU1MjFEXHU1OUNCXHU4QkExXHU1MjEyXHU1REYyXHU1MjFCXHU1RUZBXHVGRjFCXHU1QjhDXHU2MjEwXHU0RUZCXHU1MkExXHUzMDAxXHU0RTEzXHU2Q0U4XHU2MjE2XHU4ODY1XHU1MTQ1XHU0RUZCXHU1MkExXHU1NDBFXHU4RkQwXHU4ODRDXHUyMDFDXHU1MjM3XHU2NUIwXHU1RjUzXHU1MjREXHU4QkExXHU1MjEyXHU2MDNCXHU3RUQzXHUyMDFEXHUzMDAyXFxuPCEtLSBBSS1QTEFOTkVSLVNVTU1BUlk6RU5EIC0tPlxcblxcbiR7dGFza0NhcmRzKG1vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU0RjVDXHU0RTFBXHU4QkExXHU1MjEyXHU4ODY4XCIgOiBcIlx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlx1ODg2OFwiLCBwbGFuLnRhc2tzLCAwKX1cXG5cXG4ke21vZGUgPT09IFwic3R1ZHlcIiA/IHRhc2tDYXJkcyhcIlx1NTkwRFx1NEU2MFx1OEJBMVx1NTIxMlx1ODg2OFwiLCBwbGFuLnJldmlld1Rhc2tzID8/IFtdLCBwbGFuLnRhc2tzLmxlbmd0aCkgOiBcIlwifVxcbmA7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRhc2sodGFzazogUGxhblRhc2ssIGRhdGU6IHN0cmluZywgaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IHByZWZpeCA9IHRhc2suY2F0ZWdvcnkgPyBgJHt0YXNrLmNhdGVnb3J5fSBcdTAwQjcgYCA6IFwiXCI7XG4gIGNvbnN0IHRpbWUgPSB0YXNrLnN0YXJ0VGltZSAmJiB0YXNrLmVuZFRpbWUgPyBgJHt0YXNrLnN0YXJ0VGltZX0tJHt0YXNrLmVuZFRpbWV9YCA6IFwiXHU1Rjg1XHU1Qjg5XHU2MzkyXCI7XG4gIGNvbnN0IG5vdGUgPSB0YXNrLmRlc2NyaXB0aW9uID8gYFxcbj4gJHt0YXNrLmRlc2NyaXB0aW9ufWAgOiBcIlwiO1xuICByZXR1cm4gYD4gWyF0b2RvXSsgJHtwcmVmaXh9JHt0YXNrLnRpdGxlfVxcbj4gXHU2NUY2XHU2QkI1XHVGRjFBJHt0aW1lfSBcdTAwQjcgJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXN9IFx1NTIwNlx1OTQ5Rlxcbj4gXHU1QjlFXHU5NjQ1XHU1RjAwXHU1OUNCXHVGRjFBX19fXyBcdTAwQjcgXHU1QjlFXHU5NjQ1XHU1QjhDXHU2MjEwXHVGRjFBX19fXyR7bm90ZX1cXG4+IC0gWyBdICR7dGFzay50aXRsZX0gXHVEODNEXHVEQ0M1ICR7ZGF0ZX0gI1x1OEJBMVx1NTIxMmA7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclByZXZpZXdUYXNrcyhwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCB0YXNrczogUGxhblRhc2tbXSk6IHZvaWQge1xuICBwYXJlbnQuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IGxhYmVsIH0pO1xuICBpZiAoIXRhc2tzLmxlbmd0aCkgeyBwYXJlbnQuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJOb25lXCIgfSk7IHJldHVybjsgfVxuICBjb25zdCBsaXN0ID0gcGFyZW50LmNyZWF0ZUVsKFwidWxcIik7XG4gIGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykgbGlzdC5jcmVhdGVFbChcImxpXCIsIHsgdGV4dDogYCR7dGFzay5zdGFydFRpbWUgfHwgXCJcIn0ke3Rhc2suZW5kVGltZSA/IGAtJHt0YXNrLmVuZFRpbWV9YCA6IFwiXCJ9ICR7dGFzay50aXRsZX0gKCR7dGFzay5lc3RpbWF0ZWRNaW51dGVzfSBtaW4pYC50cmltKCkgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZUZvbGRlcihhcHA6IEFwcCwgZm9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcGFydHMgPSBub3JtYWxpemVQYXRoKGZvbGRlcikuc3BsaXQoXCIvXCIpLmZpbHRlcihCb29sZWFuKTtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPD0gcGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwYXRoID0gcGFydHMuc2xpY2UoMCwgaSkuam9pbihcIi9cIik7XG4gICAgaWYgKCFhcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHBhdGgpKSBhd2FpdCBhcHAudmF1bHQuY3JlYXRlRm9sZGVyKHBhdGgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNhZmVGaWxlbmFtZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHsgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XS9nLCBcIi1cIikudHJpbSgpLnNsaWNlKDAsIDgwKSB8fCBcIkFJXHU4QkExXHU1MjEyXCI7IH1cbmZ1bmN0aW9uIHlhbWxRdW90ZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHsgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTsgfVxuZnVuY3Rpb24gdGltZU9mRGF5KGRhdGU6IERhdGUpOiBzdHJpbmcgeyByZXR1cm4gYCR7U3RyaW5nKGRhdGUuZ2V0SG91cnMoKSkucGFkU3RhcnQoMiwgXCIwXCIpfToke1N0cmluZyhkYXRlLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgXCIwXCIpfWA7IH1cbmZ1bmN0aW9uIGZvcm1hdER1cmF0aW9uKG1pbGxpc2Vjb25kczogbnVtYmVyKTogc3RyaW5nIHsgY29uc3QgdG90YWwgPSBNYXRoLmNlaWwobWlsbGlzZWNvbmRzIC8gMTAwMCk7IHJldHVybiBgJHtTdHJpbmcoTWF0aC5mbG9vcih0b3RhbCAvIDYwKSkucGFkU3RhcnQoMiwgXCIwXCIpfToke1N0cmluZyh0b3RhbCAlIDYwKS5wYWRTdGFydCgyLCBcIjBcIil9YDsgfVxuZnVuY3Rpb24gbG9jYWxEYXRlKCk6IHN0cmluZyB7IGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7IGNvbnN0IG9mZnNldCA9IG5vdy5nZXRUaW1lem9uZU9mZnNldCgpICogNjAwMDA7IHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpIC0gb2Zmc2V0KS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTsgfVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsc0JBQTJJO0FBTTNJLElBQU0sMEJBQTBCO0FBOENoQyxJQUFNLG1CQUFvQztBQUFBLEVBQ3hDLFVBQVU7QUFBQSxFQUNWLG1CQUFtQjtBQUFBLEVBQ25CLFlBQVk7QUFBQSxFQUNaLFFBQVE7QUFBQSxFQUNSLE9BQU87QUFBQSxFQUNQLGVBQWU7QUFBQSxFQUNmLGFBQWE7QUFBQSxFQUNiLFdBQVc7QUFBQSxFQUNYLGFBQWE7QUFBQSxFQUNiLGNBQWM7QUFBQSxFQUNkLGFBQWE7QUFBQSxFQUNiLFlBQVk7QUFDZDtBQUVBLElBQU0sWUFBbUY7QUFBQSxFQUN2RixRQUFRLEVBQUUsT0FBTyx5RUFBc0MsU0FBUyxJQUFJLE9BQU8sR0FBRztBQUFBLEVBQzlFLFFBQVEsRUFBRSxPQUFPLFVBQVUsU0FBUyw2QkFBNkIsT0FBTyxlQUFlO0FBQUEsRUFDdkYsUUFBUSxFQUFFLE9BQU8sb0JBQW9CLFNBQVMsZ0NBQWdDLE9BQU8sMkJB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
