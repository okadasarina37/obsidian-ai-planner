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
    this.addCommand({ id: "create-manual-plan", name: "Create manual plan", callback: () => new ManualTaskModal(this.app, this).open() });
    this.addCommand({ id: "add-task-to-current-plan", name: "Add task to current plan", callback: () => this.openManualTaskForActiveNote() });
    this.addCommand({ id: "refresh-plan-summary", name: "Refresh current plan summary", callback: () => void this.refreshPlanSummaryForActiveNote() });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgSXRlbVZpZXcsIE1vZGFsLCBOb3RpY2UsIFBsYXRmb3JtLCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIFRGaWxlLCBXb3Jrc3BhY2VMZWFmLCBub3JtYWxpemVQYXRoLCByZXF1ZXN0VXJsIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbnR5cGUgUGxhbk1vZGUgPSBcInN0dWR5XCIgfCBcIndvcmtcIjtcbnR5cGUgUHJvdmlkZXJJZCA9IFwiY3VzdG9tXCIgfCBcIm9wZW5haVwiIHwgXCJjbGF1ZGVcIiB8IFwiZGVlcHNlZWtcIiB8IFwiZ2xtXCIgfCBcImtpbWlcIiB8IFwiZ2VtaW5pXCI7XG50eXBlIEludGVyZmFjZUxhbmd1YWdlID0gXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG5cbmNvbnN0IE1PQklMRV9QTEFOX0VESVRPUl9WSUVXID0gXCJhaS1wbGFubmVyLW1vYmlsZS1lZGl0b3JcIjtcblxuaW50ZXJmYWNlIFBsYW5uZXJTZXR0aW5ncyB7XG4gIHByb3ZpZGVyOiBQcm92aWRlcklkO1xuICBpbnRlcmZhY2VMYW5ndWFnZTogSW50ZXJmYWNlTGFuZ3VhZ2U7XG4gIGFwaUJhc2VVcmw6IHN0cmluZztcbiAgYXBpS2V5OiBzdHJpbmc7XG4gIG1vZGVsOiBzdHJpbmc7XG4gIGN1c3RvbUhlYWRlcnM6IHN0cmluZztcbiAgdGVtcGVyYXR1cmU6IG51bWJlcjtcbiAgbWF4VG9rZW5zOiBudW1iZXI7XG4gIGhpc3RvcnlEYXlzOiBudW1iZXI7XG4gIGZvY3VzTWludXRlczogbnVtYmVyO1xuICBzdHVkeUZvbGRlcjogc3RyaW5nO1xuICB3b3JrRm9sZGVyOiBzdHJpbmc7XG4gIGFjdGl2ZUZvY3VzPzogQWN0aXZlRm9jdXNTZXNzaW9uO1xuICBmb2N1c01pbmlQb3NpdGlvbj86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbn1cblxuaW50ZXJmYWNlIEFjdGl2ZUZvY3VzU2Vzc2lvbiB7XG4gIGZpbGVQYXRoOiBzdHJpbmc7XG4gIHRhc2tJZDogc3RyaW5nO1xuICB0YXNrTmFtZTogc3RyaW5nO1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICBkdXJhdGlvbk1zOiBudW1iZXI7XG4gIGZvY3VzZWRNczogbnVtYmVyO1xuICBydW5uaW5nQXQ6IG51bWJlciB8IG51bGw7XG4gIHN0YXJ0ZWRBdDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGxhblRhc2sge1xuICB0aXRsZTogc3RyaW5nO1xuICBjYXRlZ29yeT86IHN0cmluZztcbiAgc3RhcnRUaW1lPzogc3RyaW5nO1xuICBlbmRUaW1lPzogc3RyaW5nO1xuICBlc3RpbWF0ZWRNaW51dGVzOiBudW1iZXI7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGxhblJlc3VsdCB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHN1bW1hcnk/OiBzdHJpbmc7XG4gIHRhc2tzOiBQbGFuVGFza1tdO1xuICByZXZpZXdUYXNrcz86IFBsYW5UYXNrW107XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFBsYW5uZXJTZXR0aW5ncyA9IHtcbiAgcHJvdmlkZXI6IFwiY3VzdG9tXCIsXG4gIGludGVyZmFjZUxhbmd1YWdlOiBcImF1dG9cIixcbiAgYXBpQmFzZVVybDogXCJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxXCIsXG4gIGFwaUtleTogXCJcIixcbiAgbW9kZWw6IFwiZ3B0LTQuMS1taW5pXCIsXG4gIGN1c3RvbUhlYWRlcnM6IFwie31cIixcbiAgdGVtcGVyYXR1cmU6IDAuMyxcbiAgbWF4VG9rZW5zOiAxODAwLFxuICBoaXN0b3J5RGF5czogMTQsXG4gIGZvY3VzTWludXRlczogMjUsXG4gIHN0dWR5Rm9sZGVyOiBcIjA2X1RvZG8vXHU1QjY2XHU0RTYwXCIsXG4gIHdvcmtGb2xkZXI6IFwiMDFfXHU5ODc5XHU3NkVFL1x1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwiXG59O1xuXG5jb25zdCBQUk9WSURFUlM6IFJlY29yZDxQcm92aWRlcklkLCB7IGxhYmVsOiBzdHJpbmc7IGJhc2VVcmw6IHN0cmluZzsgbW9kZWw6IHN0cmluZyB9PiA9IHtcbiAgY3VzdG9tOiB7IGxhYmVsOiBcIkN1c3RvbSBPcGVuQUktY29tcGF0aWJsZSAvIFx1ODFFQVx1NUI5QVx1NEU0OVx1NTE3Q1x1NUJCOVx1NjNBNVx1NTNFM1wiLCBiYXNlVXJsOiBcIlwiLCBtb2RlbDogXCJcIiB9LFxuICBvcGVuYWk6IHsgbGFiZWw6IFwiT3BlbkFJXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MVwiLCBtb2RlbDogXCJncHQtNC4xLW1pbmlcIiB9LFxuICBjbGF1ZGU6IHsgbGFiZWw6IFwiQW50aHJvcGljIENsYXVkZVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLmFudGhyb3BpYy5jb20vdjFcIiwgbW9kZWw6IFwiY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0XCIgfSxcbiAgZGVlcHNlZWs6IHsgbGFiZWw6IFwiRGVlcFNlZWtcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5kZWVwc2Vlay5jb20vdjFcIiwgbW9kZWw6IFwiZGVlcHNlZWstY2hhdFwiIH0sXG4gIGdsbTogeyBsYWJlbDogXCJaaGlwdSBHTE0gLyBcdTY2N0FcdThDMzFcIiwgYmFzZVVybDogXCJodHRwczovL29wZW4uYmlnbW9kZWwuY24vYXBpL3BhYXMvdjRcIiwgbW9kZWw6IFwiZ2xtLTQtZmxhc2hcIiB9LFxuICBraW1pOiB7IGxhYmVsOiBcIktpbWkgLyBNb29uc2hvdFwiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLm1vb25zaG90LmNuL3YxXCIsIG1vZGVsOiBcIm1vb25zaG90LXYxLThrXCIgfSxcbiAgZ2VtaW5pOiB7IGxhYmVsOiBcIkdvb2dsZSBHZW1pbmlcIiwgYmFzZVVybDogXCJodHRwczovL2dlbmVyYXRpdmVsYW5ndWFnZS5nb29nbGVhcGlzLmNvbS92MWJldGFcIiwgbW9kZWw6IFwiZ2VtaW5pLTIuMC1mbGFzaFwiIH1cbn07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlcXVlc3RQbGFuQ29tcGxldGlvbihcbiAgc2V0dGluZ3M6IFBsYW5uZXJTZXR0aW5ncyxcbiAgYmFzZVVybDogc3RyaW5nLFxuICBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICBzeXN0ZW06IHN0cmluZyxcbiAgdXNlcjogc3RyaW5nXG4pOiBQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTx0eXBlb2YgcmVxdWVzdFVybD4+PiB7XG4gIGlmIChzZXR0aW5ncy5wcm92aWRlciA9PT0gXCJjbGF1ZGVcIikge1xuICAgIGlmIChzZXR0aW5ncy5hcGlLZXkpIGhlYWRlcnNbXCJ4LWFwaS1rZXlcIl0gPSBzZXR0aW5ncy5hcGlLZXk7XG4gICAgaGVhZGVyc1tcImFudGhyb3BpYy12ZXJzaW9uXCJdID8/PSBcIjIwMjMtMDYtMDFcIjtcbiAgICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgICB1cmw6IGAke2Jhc2VVcmx9L21lc3NhZ2VzYCwgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6IHNldHRpbmdzLm1vZGVsLCBtYXhfdG9rZW5zOiBzZXR0aW5ncy5tYXhUb2tlbnMsIHRlbXBlcmF0dXJlOiBzZXR0aW5ncy50ZW1wZXJhdHVyZSwgc3lzdGVtLCBtZXNzYWdlczogW3sgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHVzZXIgfV0gfSksIHRocm93OiBmYWxzZVxuICAgIH0pO1xuICB9XG4gIGlmIChzZXR0aW5ncy5wcm92aWRlciA9PT0gXCJnZW1pbmlcIikge1xuICAgIGNvbnN0IGtleSA9IHNldHRpbmdzLmFwaUtleSA/IGA/a2V5PSR7ZW5jb2RlVVJJQ29tcG9uZW50KHNldHRpbmdzLmFwaUtleSl9YCA6IFwiXCI7XG4gICAgcmV0dXJuIHJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBgJHtiYXNlVXJsfS9tb2RlbHMvJHtlbmNvZGVVUklDb21wb25lbnQoc2V0dGluZ3MubW9kZWwpfTpnZW5lcmF0ZUNvbnRlbnQke2tleX1gLCBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzeXN0ZW1JbnN0cnVjdGlvbjogeyBwYXJ0czogW3sgdGV4dDogc3lzdGVtIH1dIH0sIGNvbnRlbnRzOiBbeyByb2xlOiBcInVzZXJcIiwgcGFydHM6IFt7IHRleHQ6IHVzZXIgfV0gfV0sIGdlbmVyYXRpb25Db25maWc6IHsgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBtYXhPdXRwdXRUb2tlbnM6IHNldHRpbmdzLm1heFRva2VucywgcmVzcG9uc2VNaW1lVHlwZTogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSB9KSwgdGhyb3c6IGZhbHNlXG4gICAgfSk7XG4gIH1cbiAgaWYgKHNldHRpbmdzLmFwaUtleSkgaGVhZGVycy5BdXRob3JpemF0aW9uID0gYEJlYXJlciAke3NldHRpbmdzLmFwaUtleX1gO1xuICByZXR1cm4gcmVxdWVzdFVybCh7XG4gICAgdXJsOiBgJHtiYXNlVXJsfS9jaGF0L2NvbXBsZXRpb25zYCwgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycyxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiBzZXR0aW5ncy5tb2RlbCwgdGVtcGVyYXR1cmU6IHNldHRpbmdzLnRlbXBlcmF0dXJlLCBtYXhfdG9rZW5zOiBzZXR0aW5ncy5tYXhUb2tlbnMsIG1lc3NhZ2VzOiBbeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBzeXN0ZW0gfSwgeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogdXNlciB9XSB9KSwgdGhyb3c6IGZhbHNlXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0aW9uVGV4dChwcm92aWRlcjogUHJvdmlkZXJJZCwgcmVzcG9uc2U6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBqc29uID0gcmVzcG9uc2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGlmIChwcm92aWRlciA9PT0gXCJjbGF1ZGVcIikge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBqc29uLmNvbnRlbnQgYXMgQXJyYXk8eyB0eXBlPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH0+IHwgdW5kZWZpbmVkO1xuICAgIHJldHVybiBjb250ZW50Py5maWx0ZXIocGFydCA9PiBwYXJ0LnR5cGUgPT09IFwidGV4dFwiKS5tYXAocGFydCA9PiBwYXJ0LnRleHQgPz8gXCJcIikuam9pbihcIlwiKTtcbiAgfVxuICBpZiAocHJvdmlkZXIgPT09IFwiZ2VtaW5pXCIpIHtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0ganNvbi5jYW5kaWRhdGVzIGFzIEFycmF5PHsgY29udGVudD86IHsgcGFydHM/OiBBcnJheTx7IHRleHQ/OiBzdHJpbmcgfT4gfSB9PiB8IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0cz8ubWFwKHBhcnQgPT4gcGFydC50ZXh0ID8/IFwiXCIpLmpvaW4oXCJcIik7XG4gIH1cbiAgY29uc3QgY2hvaWNlcyA9IGpzb24uY2hvaWNlcyBhcyBBcnJheTx7IG1lc3NhZ2U/OiB7IGNvbnRlbnQ/OiBzdHJpbmcgfSB9PiB8IHVuZGVmaW5lZDtcbiAgcmV0dXJuIGNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQUlQbGFubmVyUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgcGx1Z2luU2V0dGluZ3MhOiBQbGFubmVyU2V0dGluZ3M7XG4gIHByaXZhdGUgZm9jdXNTdGF0dXNFbCE6IEhUTUxFbGVtZW50O1xuICBwcml2YXRlIGZvY3VzTWluaUVsITogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gIHByaXZhdGUgZmluaXNoaW5nRm9jdXMgPSBmYWxzZTtcbiAgcHJpdmF0ZSBmb2N1c1RpbWVyT3BlbiA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlEcmFnZ2luZyA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlNb3ZlZCA9IGZhbHNlO1xuICBwcml2YXRlIG1pbmlTdGFydFggPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydFkgPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydExlZnQgPSAwO1xuICBwcml2YXRlIG1pbmlTdGFydFRvcCA9IDA7XG5cbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucGx1Z2luU2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgQUlQbGFubmVyU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJjcmVhdGUtYWktcGxhblwiLFxuICAgICAgbmFtZTogXCJDcmVhdGUgQUkgcGxhblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHZvaWQgdGhpcy5vcGVuUGxhbkVkaXRvcigpXG4gICAgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwic3RhcnQtZm9jdXMtc2Vzc2lvblwiLCBuYW1lOiBcIlN0YXJ0IGZvY3VzIHNlc3Npb25cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcInJlc3VtZS1mb2N1cy1zZXNzaW9uXCIsIG5hbWU6IFwiUmVzdW1lIGZvY3VzIHNlc3Npb25cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKSB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJjcmVhdGUtbWFudWFsLXBsYW5cIiwgbmFtZTogXCJDcmVhdGUgbWFudWFsIHBsYW5cIiwgY2FsbGJhY2s6ICgpID0+IG5ldyBNYW51YWxUYXNrTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJhZGQtdGFzay10by1jdXJyZW50LXBsYW5cIiwgbmFtZTogXCJBZGQgdGFzayB0byBjdXJyZW50IHBsYW5cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMub3Blbk1hbnVhbFRhc2tGb3JBY3RpdmVOb3RlKCkgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwicmVmcmVzaC1wbGFuLXN1bW1hcnlcIiwgbmFtZTogXCJSZWZyZXNoIGN1cnJlbnQgcGxhbiBzdW1tYXJ5XCIsIGNhbGxiYWNrOiAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5Rm9yQWN0aXZlTm90ZSgpIH0pO1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImNhbGVuZGFyLXBsdXNcIiwgXCJDcmVhdGUgQUkgcGxhblwiLCAoKSA9PiB2b2lkIHRoaXMub3BlblBsYW5FZGl0b3IoKSk7XG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwidGltZXJcIiwgXCJTdGFydCBmb2N1cyBzZXNzaW9uXCIsICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLWZvY3VzLXN0YXR1c1wiKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c1N0YXR1c0VsLCBcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsID0gdGhpcy5hcHAud29ya3NwYWNlLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLW1pbmlcIixcbiAgICAgIGF0dHI6IHsgdHlwZTogXCJidXR0b25cIiwgXCJhcmlhLWxhYmVsXCI6IFwiUmVzdG9yZSBmb2N1cyB0aW1lclwiIH1cbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJjbGlja1wiLCBldmVudCA9PiB7XG4gICAgICBpZiAodGhpcy5taW5pTW92ZWQpIHsgZXZlbnQucHJldmVudERlZmF1bHQoKTsgcmV0dXJuOyB9XG4gICAgICB2b2lkIHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJwb2ludGVyZG93blwiLCBldmVudCA9PiB0aGlzLmJlZ2luTWluaURyYWcoZXZlbnQpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInBvaW50ZXJtb3ZlXCIsIGV2ZW50ID0+IHRoaXMubW92ZU1pbmlEcmFnKGV2ZW50KSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJwb2ludGVydXBcIiwgKCkgPT4gdm9pZCB0aGlzLmVuZE1pbmlEcmFnKCkpO1xuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdGhpcy5mb2N1c01pbmlFbC5yZW1vdmUoKSk7XG4gICAgY29uc3QgdXBkYXRlVmlzaWJsZUhlaWdodCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWluKHdpbmRvdy52aXN1YWxWaWV3cG9ydD8uaGVpZ2h0ID8/IHdpbmRvdy5pbm5lckhlaWdodCwgd2luZG93LmlubmVySGVpZ2h0KTtcbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tYWktcGxhbm5lci12aXNpYmxlLWhlaWdodFwiLCBgJHtNYXRoLnJvdW5kKGhlaWdodCl9cHhgKTtcbiAgICB9O1xuICAgIHVwZGF0ZVZpc2libGVIZWlnaHQoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInJlc2l6ZVwiLCB1cGRhdGVWaXNpYmxlSGVpZ2h0KTtcbiAgICBpZiAod2luZG93LnZpc3VhbFZpZXdwb3J0KSB7XG4gICAgICBjb25zdCB2aWV3cG9ydCA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydDtcbiAgICAgIHZpZXdwb3J0LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCk7XG4gICAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHZpZXdwb3J0LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCkpO1xuICAgIH1cbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiZm9jdXNpblwiLCBldmVudCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgIXRhcmdldC5tYXRjaGVzKFwiaW5wdXQsIHRleHRhcmVhLCBzZWxlY3RcIikpIHJldHVybjtcbiAgICAgIGlmICghdGFyZ2V0LmNsb3Nlc3QoXCIuYWktcGxhbm5lci1tb2RhbFwiKSkgcmV0dXJuO1xuICAgICAgdGhpcy5rZWVwRm9jdXNlZElucHV0VmlzaWJsZSh0YXJnZXQpO1xuICAgIH0pO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbCh3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpLCA1MDApKTtcbiAgICB0aGlzLnJlZ2lzdGVyVmlldyhNT0JJTEVfUExBTl9FRElUT1JfVklFVywgbGVhZiA9PiBuZXcgTW9iaWxlUGxhbkVkaXRvclZpZXcobGVhZiwgdGhpcykpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gIH1cblxuICBhc3luYyBvcGVuUGxhbkVkaXRvcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVBsYXRmb3JtLmlzTW9iaWxlKSB7XG4gICAgICBuZXcgUGxhbklucHV0TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKE1PQklMRV9QTEFOX0VESVRPUl9WSUVXKVswXTtcbiAgICBjb25zdCBsZWFmID0gZXhpc3RpbmcgPz8gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIik7XG4gICAgYXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoeyB0eXBlOiBNT0JJTEVfUExBTl9FRElUT1JfVklFVywgYWN0aXZlOiB0cnVlIH0pO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGxlYWYpO1xuICB9XG5cbiAgcHJpdmF0ZSBrZWVwRm9jdXNlZElucHV0VmlzaWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgY29uc3QgY29udGVudCA9IHRhcmdldC5jbG9zZXN0KFwiLm1vZGFsLWNvbnRlbnRcIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghY29udGVudCkgcmV0dXJuO1xuICAgIGNvbnN0IG1vdmUgPSAoKTogdm9pZCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgY29udGVudFJlY3QgPSBjb250ZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgdGFyZ2V0VG9wID0gdGFyZ2V0UmVjdC50b3AgLSBjb250ZW50UmVjdC50b3AgKyBjb250ZW50LnNjcm9sbFRvcDtcbiAgICAgIGNvbnN0IGRlc2lyZWRUb3AgPSBNYXRoLm1heCgyNCwgTWF0aC5yb3VuZChjb250ZW50LmNsaWVudEhlaWdodCAqIDAuMikpO1xuICAgICAgY29udGVudC5zY3JvbGxUb3AgPSBNYXRoLm1heCgwLCB0YXJnZXRUb3AgLSBkZXNpcmVkVG9wKTtcbiAgICB9O1xuICAgIGZvciAoY29uc3QgZGVsYXkgb2YgWzAsIDE4MCwgNDIwLCA3NTBdKSB3aW5kb3cuc2V0VGltZW91dChtb3ZlLCBkZWxheSk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnBsdWdpblNldHRpbmdzKTtcbiAgfVxuXG4gIGdldEFjdGl2ZUZvY3VzKCk6IEFjdGl2ZUZvY3VzU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gIH1cblxuICBzZXRGb2N1c1RpbWVyT3BlbihvcGVuOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5mb2N1c1RpbWVyT3BlbiA9IG9wZW47XG4gICAgdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICB9XG5cbiAgcHJpdmF0ZSBiZWdpbk1pbmlEcmFnKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSB0cnVlO1xuICAgIHRoaXMubWluaU1vdmVkID0gZmFsc2U7XG4gICAgdGhpcy5taW5pU3RhcnRYID0gZXZlbnQuY2xpZW50WDtcbiAgICB0aGlzLm1pbmlTdGFydFkgPSBldmVudC5jbGllbnRZO1xuICAgIHRoaXMubWluaVN0YXJ0TGVmdCA9IHJlY3QubGVmdDtcbiAgICB0aGlzLm1pbmlTdGFydFRvcCA9IHJlY3QudG9wO1xuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlTWluaURyYWcoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5taW5pRHJhZ2dpbmcpIHJldHVybjtcbiAgICBjb25zdCBkeCA9IGV2ZW50LmNsaWVudFggLSB0aGlzLm1pbmlTdGFydFg7XG4gICAgY29uc3QgZHkgPSBldmVudC5jbGllbnRZIC0gdGhpcy5taW5pU3RhcnRZO1xuICAgIGlmICghdGhpcy5taW5pTW92ZWQgJiYgTWF0aC5oeXBvdChkeCwgZHkpIDwgNikgcmV0dXJuO1xuICAgIHRoaXMubWluaU1vdmVkID0gdHJ1ZTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydExlZnQgKyBkeCksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydFRvcCArIGR5KSwgTWF0aC5tYXgoOCwgd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSA4KSk7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUucmlnaHQgPSBcImF1dG9cIjtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmJvdHRvbSA9IFwiYXV0b1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbmRNaW5pRHJhZygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMubWluaURyYWdnaW5nKSByZXR1cm47XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICBpZiAoIXRoaXMubWluaU1vdmVkKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgxLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGgpO1xuICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDEsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KTtcbiAgICB0aGlzLnBsdWdpblNldHRpbmdzLmZvY3VzTWluaVBvc2l0aW9uID0geyB4OiByZWN0LmxlZnQgLyB3aWR0aCwgeTogcmVjdC50b3AgLyBoZWlnaHQgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5taW5pTW92ZWQgPSBmYWxzZTsgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5TWluaVBvc2l0aW9uKCk6IHZvaWQge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbmlQb3NpdGlvbjtcbiAgICBpZiAoIXBvc2l0aW9uKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgbGVmdCA9IE1hdGgubWluKE1hdGgubWF4KDgsIHBvc2l0aW9uLnggKiAod2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoKSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCBwb3NpdGlvbi55ICogKHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gOCkpO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnJpZ2h0ID0gXCJhdXRvXCI7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5ib3R0b20gPSBcImF1dG9cIjtcbiAgfVxuXG4gIGFzeW5jIG9wZW5Gb2N1c0ZvckFjdGl2ZU5vdGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXMpIHtcbiAgICAgIGF3YWl0IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7IG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdThCQTFcdTUyMTJcdTdCMTRcdThCQjAgLyBPcGVuIGEgcGxhbiBub3RlIGZpcnN0LlwiKTsgcmV0dXJuOyB9XG4gICAgY29uc3QgdGFza3MgPSBleHRyYWN0Rm9jdXNUYXNrcyh0aGlzLmFwcCwgZmlsZSk7XG4gICAgaWYgKCF0YXNrcy5sZW5ndGgpIHsgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NkNBMVx1NjcwOVx1NTNFRlx1NEUxM1x1NkNFOFx1NzY4NFx1OEJBMVx1NTIxMlx1NEVGQlx1NTJBMSAvIE5vIHBsYW4gdGFza3MgZm91bmQuXCIpOyByZXR1cm47IH1cbiAgICBuZXcgRm9jdXNUYXNrUGlja2VyTW9kYWwodGhpcy5hcHAsIHRoaXMsIGZpbGUsIHRhc2tzKS5vcGVuKCk7XG4gIH1cblxuICBvcGVuTWFudWFsVGFza0ZvckFjdGl2ZU5vdGUoKTogdm9pZCB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7IG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdThCQTFcdTUyMTJcdTdCMTRcdThCQjAgLyBPcGVuIGEgcGxhbiBub3RlIGZpcnN0LlwiKTsgcmV0dXJuOyB9XG4gICAgbmV3IE1hbnVhbFRhc2tNb2RhbCh0aGlzLmFwcCwgdGhpcywgZmlsZSkub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgYWRkTWFudWFsVGFzayhmaWxlOiBURmlsZSB8IHVuZGVmaW5lZCwgdGFzazogUGxhblRhc2ssIG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW5UaXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBhd2FpdCB0aGlzLndyaXRlUGxhbihtb2RlLCBkYXRlLCB7IHRpdGxlOiBwbGFuVGl0bGUgfHwgKG1vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU2MjRCXHU1MkE4XHU1QjY2XHU0RTYwXHU4QkExXHU1MjEyXCIgOiBcIlx1NjI0Qlx1NTJBOFx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwiKSwgc3VtbWFyeTogXCJcdTYyNEJcdTUyQThcdTVFRkFcdTdBQ0JcdTMwMDJcdTYzRDJcdTRFRjZcdTRGMUFcdTY4MzlcdTYzNkVcdTRFRkJcdTUyQTFcdThCQjBcdTVGNTVcdTgxRUFcdTUyQThcdTY2RjRcdTY1QjBcdTYyNjdcdTg4NENcdTYwM0JcdTdFRDNcdTMwMDJcIiwgdGFza3M6IFt0YXNrXSwgcmV2aWV3VGFza3M6IFtdIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmbSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCBpZHMgPSBPYmplY3Qua2V5cyhmbSkuZmlsdGVyKGtleSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3Qoa2V5KSkubWFwKGtleSA9PiBOdW1iZXIoa2V5Lm1hdGNoKC9edGFzayhcXGQrKU5hbWUkLyk/LlsxXSA/PyAwKSk7XG4gICAgY29uc3QgbnVtYmVyID0gTWF0aC5tYXgoMCwgLi4uaWRzKSArIDE7XG4gICAgY29uc3QgaWQgPSBgdGFzayR7U3RyaW5nKG51bWJlcikucGFkU3RhcnQoMiwgXCIwXCIpfWA7XG4gICAgYXdhaXQgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvY2Vzc0Zyb250TWF0dGVyKGZpbGUsIGZyb250bWF0dGVyID0+IHtcbiAgICAgIGZyb250bWF0dGVyW2Ake2lkfU5hbWVgXSA9IHRhc2sudGl0bGU7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1DYXRlZ29yeWBdID0gdGFzay5jYXRlZ29yeSB8fCBcIlx1NTE3Nlx1NUI4M1wiO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID0gdGFzay5lc3RpbWF0ZWRNaW51dGVzO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9QWN0dWFsU3RhcnRgXSA9IFwiXCI7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1BY3R1YWxFbmRgXSA9IFwiXCI7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1BY3R1YWxNaW51dGVzYF0gPSAwO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9Rm9jdXNTZXNzaW9uc2BdID0gMDtcbiAgICB9KTtcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzZWN0aW9uID0gXCIjIyBcdTYyNEJcdTUyQThcdTg4NjVcdTUxNDVcIjtcbiAgICBjb25zdCBjYXJkID0gcmVuZGVyVGFzayh0YXNrLCBTdHJpbmcoZm0ucGxhbkRhdGUgPz8gbG9jYWxEYXRlKCkpLCBudW1iZXIpO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBjb250ZW50LmluY2x1ZGVzKHNlY3Rpb24pID8gYCR7Y29udGVudC50cmltRW5kKCl9XFxuXFxuJHtjYXJkfVxcbmAgOiBgJHtjb250ZW50LnRyaW1FbmQoKX1cXG5cXG4ke3NlY3Rpb259XFxuXFxuJHtjYXJkfVxcbmApO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5KGZpbGUpO1xuICAgIG5ldyBOb3RpY2UoXCJcdTVERjJcdTZERkJcdTUyQTBcdTRFRkJcdTUyQTFcdTVFNzZcdTY2RjRcdTY1QjBcdTYwM0JcdTdFRDMgLyBUYXNrIGFkZGVkIGFuZCBzdW1tYXJ5IHVwZGF0ZWQuXCIpO1xuICB9XG5cbiAgYXN5bmMgcmVmcmVzaFBsYW5TdW1tYXJ5Rm9yQWN0aXZlTm90ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICBpZiAoIWZpbGUpIHsgbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQVx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMCAvIE9wZW4gYSBwbGFuIG5vdGUgZmlyc3QuXCIpOyByZXR1cm47IH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hQbGFuU3VtbWFyeShmaWxlKTtcbiAgICBuZXcgTm90aWNlKFwiXHU1REYyXHU1MjM3XHU2NUIwXHU4QkExXHU1MjEyXHU2MDNCXHU3RUQzIC8gUGxhbiBzdW1tYXJ5IHJlZnJlc2hlZC5cIik7XG4gIH1cblxuICBhc3luYyByZWZyZXNoUGxhblN1bW1hcnkoZmlsZTogVEZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmbSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCB0YXNrS2V5cyA9IE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoa2V5ID0+IC9edGFza1xcZCtOYW1lJC8udGVzdChrZXkpKTtcbiAgICBpZiAoIXRhc2tLZXlzLmxlbmd0aCkgeyBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU2Q0ExXHU2NzA5IEFJIFBsYW5uZXIgXHU0RUZCXHU1MkExXHU1QjU3XHU2QkI1IC8gTm8gQUkgUGxhbm5lciB0YXNrcyBmb3VuZC5cIik7IHJldHVybjsgfVxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHRhc2tzID0gdGFza0tleXMubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICAgIHJldHVybiB7IGNhdGVnb3J5OiBTdHJpbmcoZm1bYCR7aWR9Q2F0ZWdvcnlgXSA/PyBcIlx1NTE3Nlx1NUI4M1wiKSwgcGxhbm5lZDogTnVtYmVyKGZtW2Ake2lkfUVzdGltYXRlZE1pbnV0ZXNgXSA/PyAwKSwgYWN0dWFsOiBOdW1iZXIoZm1bYCR7aWR9QWN0dWFsTWludXRlc2BdID8/IDApIHx8IGR1cmF0aW9uRnJvbVRpbWVzKGZtW2Ake2lkfUFjdHVhbFN0YXJ0YF0sIGZtW2Ake2lkfUFjdHVhbEVuZGBdKSwgc2Vzc2lvbnM6IE51bWJlcihmbVtgJHtpZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgfTtcbiAgICB9KTtcbiAgICBjb25zdCBwbGFubmVkID0gdGFza3MucmVkdWNlKChzdW0sIHRhc2spID0+IHN1bSArIHRhc2sucGxhbm5lZCwgMCk7XG4gICAgY29uc3QgYWN0dWFsID0gdGFza3MucmVkdWNlKChzdW0sIHRhc2spID0+IHN1bSArIHRhc2suYWN0dWFsLCAwKTtcbiAgICBjb25zdCBzZXNzaW9ucyA9IHRhc2tzLnJlZHVjZSgoc3VtLCB0YXNrKSA9PiBzdW0gKyB0YXNrLnNlc3Npb25zLCAwKTtcbiAgICBjb25zdCBjb21wbGV0ZWQgPSAoY29udGVudC5tYXRjaCgvXi0gXFxbeFxcXS4qI1x1OEJBMVx1NTIxMi9pbSkgPz8gW10pLmxlbmd0aDtcbiAgICBjb25zdCBjYXRlZ29yaWVzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIGNhdGVnb3JpZXMuc2V0KHRhc2suY2F0ZWdvcnksIChjYXRlZ29yaWVzLmdldCh0YXNrLmNhdGVnb3J5KSA/PyAwKSArIHRhc2sucGxhbm5lZCk7XG4gICAgY29uc3QgYWxsb2NhdGlvbiA9IFsuLi5jYXRlZ29yaWVzLmVudHJpZXMoKV0ubWFwKChbbmFtZSwgbWludXRlc10pID0+IGAke25hbWV9ICR7bWludXRlc30gXHU1MjA2XHU5NDlGYCkuam9pbihcIlx1RkYxQlwiKSB8fCBcIlx1NjY4Mlx1NjVFMFwiO1xuICAgIGNvbnN0IHZhcmlhbmNlID0gYWN0dWFsID4gMCA/IGAke2FjdHVhbCA+PSBwbGFubmVkID8gXCIrXCIgOiBcIlwifSR7YWN0dWFsIC0gcGxhbm5lZH0gXHU1MjA2XHU5NDlGYCA6IFwiXHU1Rjg1XHU4QkIwXHU1RjU1XCI7XG4gICAgY29uc3Qgc3VtbWFyeSA9IGA8IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpTVEFSVCAtLT5cXG4+IFshc3VtbWFyeV0gXHU2MjY3XHU4ODRDXHU2MDNCXHU3RUQzIC8gRXhlY3V0aW9uIHN1bW1hcnlcXG4+IC0gXHU0RUZCXHU1MkExXHVGRjFBJHt0YXNrcy5sZW5ndGh9IFx1OTg3OVx1RkYxQlx1NURGMlx1NTJGRVx1OTAwOVx1RkYxQSR7TWF0aC5taW4oY29tcGxldGVkLCB0YXNrcy5sZW5ndGgpfSBcdTk4NzlcdUZGMUJcdTRFMTNcdTZDRThcdTZCMjFcdTY1NzBcdUZGMUEke3Nlc3Npb25zfSBcdTZCMjFcdTMwMDJcXG4+IC0gXHU2NUY2XHU5NUY0XHVGRjFBXHU5ODg0XHU4QkExICR7cGxhbm5lZH0gXHU1MjA2XHU5NDlGXHVGRjFCXHU1REYyXHU4QkIwXHU1RjU1XHU1QjlFXHU5NjQ1ICR7YWN0dWFsIHx8IFwiXHU1Rjg1XHU4QkIwXHU1RjU1XCJ9JHthY3R1YWwgPyBcIiBcdTUyMDZcdTk0OUZcIiA6IFwiXCJ9XHVGRjFCXHU1MDRGXHU1REVFXHVGRjFBJHt2YXJpYW5jZX1cdTMwMDJcXG4+IC0gXHU1MjA2XHU3QzdCXHU5ODg0XHU4QkExXHU1MjA2XHU5MTREXHVGRjFBJHthbGxvY2F0aW9ufVx1MzAwMlxcbj4gLSBcdThCRjRcdTY2MEVcdUZGMUFcdTRFRTVcdTRFMEFcdTRFQzVcdTU3RkFcdTRFOEVcdTRFRkJcdTUyQTFcdTVCNTdcdTZCQjVcdTMwMDFcdTUyRkVcdTkwMDlcdTcyQjZcdTYwMDFcdTU0OENcdTRFMTNcdTZDRThcdThCQjBcdTVGNTVcdThCQTFcdTdCOTdcdTMwMDJcXG48IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpFTkQgLS0+YDtcbiAgICBjb25zdCBwYXR0ZXJuID0gLzwhLS0gQUktUExBTk5FUi1TVU1NQVJZOlNUQVJUIC0tPltcXHNcXFNdKj88IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpFTkQgLS0+LztcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgcGF0dGVybi50ZXN0KGNvbnRlbnQpID8gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHN1bW1hcnkpIDogYCR7Y29udGVudC50cmltRW5kKCl9XFxuXFxuJHtzdW1tYXJ5fVxcbmApO1xuICB9XG5cbiAgYXN5bmMgc3RhcnRGb2N1cyhmaWxlOiBURmlsZSwgdGFzazogRm9jdXNUYXNrLCBtaW51dGVzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cykge1xuICAgICAgbmV3IE5vdGljZShcIlx1NURGMlx1NjcwOVx1OEZEQlx1ODg0Q1x1NEUyRFx1NzY4NFx1NEUxM1x1NkNFOCAvIEEgZm9jdXMgc2Vzc2lvbiBpcyBhbHJlYWR5IGFjdGl2ZS5cIik7XG4gICAgICBhd2FpdCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cyA9IHtcbiAgICAgIGZpbGVQYXRoOiBmaWxlLnBhdGgsXG4gICAgICB0YXNrSWQ6IHRhc2suaWQsXG4gICAgICB0YXNrTmFtZTogdGFzay5uYW1lLFxuICAgICAgY2F0ZWdvcnk6IHRhc2suY2F0ZWdvcnksXG4gICAgICBkdXJhdGlvbk1zOiBNYXRoLm1heCgxLCBtaW51dGVzKSAqIDYwMDAwLFxuICAgICAgZm9jdXNlZE1zOiAwLFxuICAgICAgcnVubmluZ0F0OiBzdGFydGVkQXQsXG4gICAgICBzdGFydGVkQXRcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Rhc2suaWR9QWN0dWFsU3RhcnRgXSA/Pz0gdGltZU9mRGF5KG5ldyBEYXRlKHN0YXJ0ZWRBdCkpO1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU2NUUwXHU2Q0Q1XHU3QUNCXHU1MzczXHU1MTk5XHU1MTY1XHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0XHVGRjBDXHU1QzA2XHU1NzI4XHU3RUQzXHU2NzVGXHU2NUY2XHU5MUNEXHU4QkQ1IC8gQ291bGQgbm90IHdyaXRlIHRoZSBzdGFydCB0aW1lIHlldDsgaXQgd2lsbCByZXRyeSBvbiBmaW5pc2guXCIpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHRvZ2dsZUZvY3VzUGF1c2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XG4gICAgaWYgKHNlc3Npb24ucnVubmluZ0F0ICE9PSBudWxsKSB7XG4gICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgc2Vzc2lvbi5ydW5uaW5nQXQgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IERhdGUubm93KCk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgfVxuXG4gIGFzeW5jIHJlc3RvcmVGb2N1c1RpbWVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoc2Vzc2lvbi5maWxlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NjI3RVx1NEUwRFx1NTIzMFx1NTM5Rlx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMFx1RkYwQ1x1NjVFMFx1NkNENVx1NUI4Q1x1NjIxMFx1NTZERVx1NTE5OSAvIFRoZSBwbGFuIG5vdGUgaXMgbWlzc2luZy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIGZpbmlzaEZvY3VzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbiB8fCB0aGlzLmZpbmlzaGluZ0ZvY3VzKSByZXR1cm47XG4gICAgdGhpcy5maW5pc2hpbmdGb2N1cyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCkge1xuICAgICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IG51bGw7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHNlc3Npb24uZmlsZVBhdGgpO1xuICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgICBuZXcgTm90aWNlKFwiXHU2MjdFXHU0RTBEXHU1MjMwXHU1MzlGXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwXHVGRjBDXHU0RTEzXHU2Q0U4XHU4QkIwXHU1RjU1XHU2NjgyXHU2NzJBXHU1MTk5XHU1MTY1IC8gUGxhbiBub3RlIG1pc3Npbmc7IGZvY3VzIHJlY29yZCB3YXMga2VwdC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdHVhbE1pbnV0ZXMgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHNlc3Npb24uZm9jdXNlZE1zIC8gNjAwMDApKTtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbFN0YXJ0YF0gPz89IHRpbWVPZkRheShuZXcgRGF0ZShzZXNzaW9uLnN0YXJ0ZWRBdCkpO1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxFbmRgXSA9IHRpbWVPZkRheShuZXcgRGF0ZSgpKTtcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsTWludXRlc2BdID0gTnVtYmVyKGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSArIGFjdHVhbE1pbnV0ZXM7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUZvY3VzU2Vzc2lvbnNgXSA9IE51bWJlcihmbVtgJHtzZXNzaW9uLnRhc2tJZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgKyAxO1xuICAgICAgfSk7XG4gICAgICB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzID0gdW5kZWZpbmVkO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgIG5ldyBOb3RpY2UoYFx1NURGMlx1OEJCMFx1NUY1NSAke2FjdHVhbE1pbnV0ZXN9IFx1NTIwNlx1OTQ5Rlx1NEUxM1x1NkNFOCAvIEZvY3VzIHJlY29yZGVkLmApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmZpbmlzaGluZ0ZvY3VzID0gZmFsc2U7XG4gICAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hGb2N1c1N0YXR1cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuZGlzcGxheSA9IHRoaXMuZm9jdXNUaW1lck9wZW4gPyBcIm5vbmVcIiA6IFwiXCI7XG4gICAgY29uc3QgZWxhcHNlZCA9IHNlc3Npb24uZm9jdXNlZE1zICsgKHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gMCA6IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBzZXNzaW9uLnJ1bm5pbmdBdCkpO1xuICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCAmJiBlbGFwc2VkID49IHNlc3Npb24uZHVyYXRpb25Ncykge1xuICAgICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldFRleHQoYEZvY3VzIGNvbXBsZXRlIFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTVCOENcdTYyMTAgLyBGb2N1cyBjb21wbGV0ZVwiKTtcbiAgICAgIHZvaWQgdGhpcy5maW5pc2hGb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ZSA9IHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gXCJGb2N1cyBwYXVzZWRcIiA6IGZvcm1hdER1cmF0aW9uKE1hdGgubWF4KDAsIHNlc3Npb24uZHVyYXRpb25NcyAtIGVsYXBzZWQpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc2V0VGV4dChgJHtzdGF0ZX0gXHUwMEI3ICR7c2Vzc2lvbi50YXNrTmFtZX1gKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoYCR7c3RhdGV9IFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCJSZXN0b3JlIGZvY3VzIHRpbWVyXCIpO1xuICAgIGlmICghdGhpcy5mb2N1c1RpbWVyT3Blbikgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmFwcGx5TWluaVBvc2l0aW9uKCkpO1xuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHN0YXJ0VGltZTogc3RyaW5nLCBlbmRUaW1lOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcpOiBQcm9taXNlPFBsYW5SZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCB8fCAhdGhpcy5wbHVnaW5TZXR0aW5ncy5tb2RlbCkgdGhyb3cgbmV3IEVycm9yKFwiUGxlYXNlIGNvbmZpZ3VyZSBhbiBBUEkgYmFzZSBVUkwgYW5kIG1vZGVsIGZpcnN0LlwiKTtcbiAgICBsZXQgY3VzdG9tSGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHRyeSB7XG4gICAgICBjdXN0b21IZWFkZXJzID0gSlNPTi5wYXJzZSh0aGlzLnBsdWdpblNldHRpbmdzLmN1c3RvbUhlYWRlcnMgfHwgXCJ7fVwiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1c3RvbSBoZWFkZXJzIG11c3QgYmUgdmFsaWQgSlNPTi5cIik7XG4gICAgfVxuICAgIGNvbnN0IHN5c3RlbSA9IG1vZGUgPT09IFwic3R1ZHlcIlxuICAgICAgPyBcIllvdSBjcmVhdGUgcHJhY3RpY2FsIHNhbWUtZGF5IGhvbWV3b3JrIHBsYW5zIGZvciBhIGNoaWxkLiBCcmVhayB0YXNrcyBpbnRvIGEgc2Vuc2libGUgb3JkZXIsIGluY2x1ZGUgc2hvcnQgYnJlYWtzIHdoZW4gaGVscGZ1bCwgYW5kIG9ubHkgYWRkIHJldmlldyB0YXNrcyBncm91bmRlZCBpbiB0aGUgZ2l2ZW4gaG9tZXdvcmsuXCJcbiAgICAgIDogXCJZb3UgY3JlYXRlIHByYWN0aWNhbCBzYW1lLWRheSB3b3JrIHBsYW5zLiBQcmlvcml0aXplIGJ5IHVyZ2VuY3kgYW5kIGNvZ25pdGl2ZSBsb2FkLCBpbmNsdWRlIGJ1ZmZlcnMsIGFuZCBkbyBub3QgaW52ZW50IHdvcmsgaXRlbXMuXCI7XG4gICAgY29uc3QgZm9sZGVyID0gbW9kZSA9PT0gXCJzdHVkeVwiID8gdGhpcy5wbHVnaW5TZXR0aW5ncy5zdHVkeUZvbGRlciA6IHRoaXMucGx1Z2luU2V0dGluZ3Mud29ya0ZvbGRlcjtcbiAgICBjb25zdCBoaXN0b3J5ID0gYnVpbGRIaXN0b3J5Q29udGV4dCh0aGlzLmFwcCwgZm9sZGVyLCB0aGlzLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKTtcbiAgICBjb25zdCB1c2VyID0gYFBsYW4gZGF0ZTogJHtkYXRlfVxcblN0YXJ0IHRpbWU6ICR7c3RhcnRUaW1lIHx8IFwibm90IHNwZWNpZmllZFwifVxcbkxhdGVzdCBmaW5pc2g6ICR7ZW5kVGltZSB8fCBcIm5vdCBzcGVjaWZpZWRcIn1cXG5JdGVtczpcXG4ke2lucHV0fVxcblxcbkhpc3RvcmljYWwgdGltaW5nIGNhbGlicmF0aW9uOlxcbiR7aGlzdG9yeX1cXG5cXG5Vc2UgdGhlIGNhbGlicmF0aW9uIG9ubHkgd2hlbiBpdCBoYXMgYXQgbGVhc3QgdHdvIGNvbXBhcmFibGUgcmVjb3Jkcy4gUmV0dXJuIEpTT04gb25seSwgd2l0aCB0aGlzIHNoYXBlOiB7XCJ0aXRsZVwiOlwic2hvcnQgdGl0bGVcIixcInN1bW1hcnlcIjpcIm9uZSBzZW50ZW5jZVwiLFwidGFza3NcIjpbe1widGl0bGVcIjpcInRhc2tcIixcImNhdGVnb3J5XCI6XCJzdWJqZWN0IG9yIHByb2plY3RcIixcInN0YXJ0VGltZVwiOlwiSEg6bW1cIixcImVuZFRpbWVcIjpcIkhIOm1tXCIsXCJlc3RpbWF0ZWRNaW51dGVzXCI6MzAsXCJkZXNjcmlwdGlvblwiOlwib3B0aW9uYWxcIn1dLFwicmV2aWV3VGFza3NcIjpbc2FtZSB0YXNrIHNoYXBlXX0uIFVzZSBbXSBmb3IgcmV2aWV3VGFza3Mgd2hlbiBub25lIGFyZSBqdXN0aWZpZWQuYDtcbiAgICBjb25zdCBiYXNlVXJsID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiwgLi4uY3VzdG9tSGVhZGVycyB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFBsYW5Db21wbGV0aW9uKHRoaXMucGx1Z2luU2V0dGluZ3MsIGJhc2VVcmwsIGhlYWRlcnMsIHN5c3RlbSwgdXNlcik7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB0aHJvdyBuZXcgRXJyb3IoYEFQSSByZXF1ZXN0IGZhaWxlZCAoJHtyZXNwb25zZS5zdGF0dXN9KTogJHtyZXNwb25zZS50ZXh0LnNsaWNlKDAsIDMwMCl9YCk7XG4gICAgY29uc3QgY29udGVudCA9IGNvbXBsZXRpb25UZXh0KHRoaXMucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIsIHJlc3BvbnNlLmpzb24pO1xuICAgIGlmICh0eXBlb2YgY29udGVudCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHByb3ZpZGVyIGRpZCBub3QgcmV0dXJuIGEgY2hhdCBjb21wbGV0aW9uLlwiKTtcbiAgICByZXR1cm4gcGFyc2VQbGFuKGNvbnRlbnQpO1xuICB9XG5cbiAgYXN5bmMgd3JpdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGZvbGRlciA9IG1vZGUgPT09IFwic3R1ZHlcIiA/IHRoaXMucGx1Z2luU2V0dGluZ3Muc3R1ZHlGb2xkZXIgOiB0aGlzLnBsdWdpblNldHRpbmdzLndvcmtGb2xkZXI7XG4gICAgYXdhaXQgZW5zdXJlRm9sZGVyKHRoaXMuYXBwLCBmb2xkZXIpO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7ZGF0ZX0tJHtzYWZlRmlsZW5hbWUocGxhbi50aXRsZSB8fCAobW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCIpKX0ubWRgO1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKGAke2ZvbGRlcn0vJHtmaWxlbmFtZX1gKTtcbiAgICBjb25zdCBjb250ZW50ID0gcmVuZGVyUGxhbihtb2RlLCBkYXRlLCBwbGFuKTtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICBjb25zdCBmaWxlID0gZXhpc3RpbmcgaW5zdGFuY2VvZiBURmlsZSA/IGV4aXN0aW5nIDogYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHBhdGgsIGNvbnRlbnQpO1xuICAgIGlmIChleGlzdGluZyBpbnN0YW5jZW9mIFRGaWxlKSBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmcsIGNvbnRlbnQpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5KGZpbGUpO1xuICAgIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5vcGVuTGlua1RleHQocGF0aCwgXCJcIiwgdHJ1ZSk7XG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEZvY3VzVGFzayB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgY2F0ZWdvcnk6IHN0cmluZzsgZXN0aW1hdGVkTWludXRlczogbnVtYmVyOyB9XG5cbmZ1bmN0aW9uIGV4dHJhY3RGb2N1c1Rhc2tzKGFwcDogQXBwLCBmaWxlOiBURmlsZSk6IEZvY3VzVGFza1tdIHtcbiAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICByZXR1cm4gT2JqZWN0LmtleXMoZm0pLmZpbHRlcihrZXkgPT4gL150YXNrXFxkK05hbWUkLy50ZXN0KGtleSkpLnNvcnQoKS5tYXAoa2V5ID0+IHtcbiAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICByZXR1cm4geyBpZCwgbmFtZTogU3RyaW5nKGZtW2tleV0gPz8gaWQpLCBjYXRlZ29yeTogU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gXCJcIiksIGVzdGltYXRlZE1pbnV0ZXM6IE51bWJlcihmbVtgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzYF0gPz8gMCkgfTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkSGlzdG9yeUNvbnRleHQoYXBwOiBBcHAsIGZvbGRlcjogc3RyaW5nLCBkYXlzOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBjdXRvZmYgPSBEYXRlLm5vdygpIC0gZGF5cyAqIDg2NDAwMDAwO1xuICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBwbGFubmVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyOyBjb3VudDogbnVtYmVyIH0+KCk7XG4gIGZvciAoY29uc3QgZmlsZSBvZiBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgaWYgKCFmaWxlLnBhdGguc3RhcnRzV2l0aChgJHtub3JtYWxpemVQYXRoKGZvbGRlcil9L2ApIHx8IGZpbGUuc3RhdC5tdGltZSA8IGN1dG9mZikgY29udGludWU7XG4gICAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoaXRlbSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3QoaXRlbSkpKSB7XG4gICAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICAgIGNvbnN0IHBsYW5uZWQgPSBOdW1iZXIoZm1bYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID8/IDApO1xuICAgICAgY29uc3QgYWN0dWFsID0gTnVtYmVyKGZtW2Ake2lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSB8fCBkdXJhdGlvbkZyb21UaW1lcyhmbVtgJHtpZH1BY3R1YWxTdGFydGBdLCBmbVtgJHtpZH1BY3R1YWxFbmRgXSk7XG4gICAgICBpZiAocGxhbm5lZCA8PSAwIHx8IGFjdHVhbCA8PSAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGNhdGVnb3J5ID0gU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gU3RyaW5nKGZtW2tleV0pLnNwbGl0KFwiXHUwMEI3XCIpWzBdID8/IFwiXHU1MTc2XHU1QjgzXCIpLnRyaW0oKSB8fCBcIlx1NTE3Nlx1NUI4M1wiO1xuICAgICAgY29uc3QgaXRlbSA9IGdyb3Vwcy5nZXQoY2F0ZWdvcnkpID8/IHsgcGxhbm5lZDogMCwgYWN0dWFsOiAwLCBjb3VudDogMCB9O1xuICAgICAgaXRlbS5wbGFubmVkICs9IHBsYW5uZWQ7IGl0ZW0uYWN0dWFsICs9IGFjdHVhbDsgaXRlbS5jb3VudCArPSAxOyBncm91cHMuc2V0KGNhdGVnb3J5LCBpdGVtKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbGluZXMgPSBbLi4uZ3JvdXBzLmVudHJpZXMoKV0uZmlsdGVyKChbLCB2YWx1ZV0pID0+IHZhbHVlLmNvdW50ID49IDIpLnNvcnQoKGEsIGIpID0+IGJbMV0uY291bnQgLSBhWzFdLmNvdW50KS5zbGljZSgwLCA2KS5tYXAoKFtjYXRlZ29yeSwgdmFsdWVdKSA9PiB7XG4gICAgY29uc3QgcGVyY2VudCA9IE1hdGgucm91bmQoKHZhbHVlLmFjdHVhbCAvIHZhbHVlLnBsYW5uZWQgLSAxKSAqIDEwMCk7XG4gICAgcmV0dXJuIGAke2NhdGVnb3J5fTogJHt2YWx1ZS5jb3VudH0gcmVjb3JkcywgcGxhbm5lZCAke3ZhbHVlLnBsYW5uZWR9IG1pbiwgYWN0dWFsICR7dmFsdWUuYWN0dWFsfSBtaW4sIGRldmlhdGlvbiAke3BlcmNlbnQgPj0gMCA/IFwiK1wiIDogXCJcIn0ke3BlcmNlbnR9JWA7XG4gIH0pO1xuICByZXR1cm4gbGluZXMubGVuZ3RoID8gbGluZXMuam9pbihcIlxcblwiKSA6IFwiTm8gcmVsaWFibGUgaGlzdG9yaWNhbCByZWNvcmRzIHlldC4gVXNlIHJlYXNvbmFibGUgZXN0aW1hdGVzIGFuZCBhIHNtYWxsIGJ1ZmZlci5cIjtcbn1cblxuZnVuY3Rpb24gZHVyYXRpb25Gcm9tVGltZXMoc3RhcnQ6IHVua25vd24sIGVuZDogdW5rbm93bik6IG51bWJlciB7XG4gIGNvbnN0IHBhcnNlID0gKHZhbHVlOiB1bmtub3duKTogbnVtYmVyIHwgbnVsbCA9PiB7IGNvbnN0IG1hdGNoID0gU3RyaW5nKHZhbHVlID8/IFwiXCIpLm1hdGNoKC9eKFxcZHsxLDJ9KTooXFxkezJ9KSQvKTsgcmV0dXJuIG1hdGNoID8gTnVtYmVyKG1hdGNoWzFdKSAqIDYwICsgTnVtYmVyKG1hdGNoWzJdKSA6IG51bGw7IH07XG4gIGNvbnN0IGZyb20gPSBwYXJzZShzdGFydCksIHRvID0gcGFyc2UoZW5kKTtcbiAgcmV0dXJuIGZyb20gPT09IG51bGwgfHwgdG8gPT09IG51bGwgPyAwIDogKHRvID49IGZyb20gPyB0byAtIGZyb20gOiB0byArIDE0NDAgLSBmcm9tKTtcbn1cblxuY2xhc3MgRm9jdXNUYXNrUGlja2VyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbWludXRlczogbnVtYmVyO1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBmaWxlOiBURmlsZSwgcHJpdmF0ZSByZWFkb25seSB0YXNrczogRm9jdXNUYXNrW10pIHsgc3VwZXIoYXBwKTsgdGhpcy5taW51dGVzID0gcGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlczsgfVxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1NEUxM1x1NkNFOFx1NkEyMVx1NUYwRiAvIEZvY3VzIG1vZGVcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTRFMTNcdTZDRThcdTY1RjZcdTk1N0YgLyBGb2N1cyBkdXJhdGlvblwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93bi5hZGRPcHRpb24oXCIyNVwiLCBcIjI1IG1pblwiKS5hZGRPcHRpb24oXCI1MFwiLCBcIjUwIG1pblwiKS5hZGRPcHRpb24oXCI5MFwiLCBcIjkwIG1pblwiKS5zZXRWYWx1ZShTdHJpbmcodGhpcy5taW51dGVzKSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5taW51dGVzID0gTnVtYmVyKHZhbHVlKSkpO1xuICAgIGNvbnN0IGN1c3RvbSA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyB0eXBlOiBcIm51bWJlclwiLCBwbGFjZWhvbGRlcjogXCJDdXN0b20gbWludXRlcyAvIFx1ODFFQVx1NUI5QVx1NEU0OVx1NTIwNlx1OTQ5RlwiIH0pO1xuICAgIGN1c3RvbS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4geyBjb25zdCB2YWx1ZSA9IE51bWJlcihjdXN0b20udmFsdWUpOyBpZiAodmFsdWUgPiAwKSB0aGlzLm1pbnV0ZXMgPSB2YWx1ZTsgfSk7XG4gICAgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiXHU5MDA5XHU2MkU5XHU0RUZCXHU1MkExIC8gQ2hvb3NlIGEgdGFza1wiIH0pO1xuICAgIGZvciAoY29uc3QgdGFzayBvZiB0aGlzLnRhc2tzKSB7XG4gICAgICBjb25zdCBidXR0b24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJhaS1wbGFubmVyLWZvY3VzLXRhc2tcIiB9KTtcbiAgICAgIGJ1dHRvbi5zZXRUZXh0KGAke3Rhc2suY2F0ZWdvcnkgPyBgJHt0YXNrLmNhdGVnb3J5fSBcdTAwQjcgYCA6IFwiXCJ9JHt0YXNrLm5hbWV9ICgke3Rhc2suZXN0aW1hdGVkTWludXRlcyB8fCBcIj9cIn0gbWluKWApO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7IHRoaXMuY2xvc2UoKTsgdm9pZCB0aGlzLnBsdWdpbi5zdGFydEZvY3VzKHRoaXMuZmlsZSwgdGFzaywgdGhpcy5taW51dGVzKTsgfSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIEZvY3VzVGltZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBpbnRlcnZhbDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luLmdldEFjdGl2ZUZvY3VzKCk7XG4gICAgaWYgKCFzZXNzaW9uKSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgdGhpcy5wbHVnaW4uc2V0Rm9jdXNUaW1lck9wZW4odHJ1ZSk7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiLCBcImFpLXBsYW5uZXItZm9jdXMtdGltZXJcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTRFMkQgLyBGb2N1c2luZ1wiKTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBzZXNzaW9uLnRhc2tOYW1lLCBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy10aXRsZVwiIH0pO1xuICAgIGNvbnN0IGNsb2NrID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1jbG9ja1wiIH0pO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG4gICAgICB0ZXh0OiBcIlx1NTE3M1x1OTVFRFx1NkI2NFx1N0E5N1x1NTNFM1x1NTNFQVx1NEYxQVx1NjcwMFx1NUMwRlx1NTMxNlx1RkYwQ1x1OEJBMVx1NjVGNlx1NEYxQVx1NEZERFx1NzU1OVx1MzAwMlx1NjI0Qlx1NjczQVx1NTIwN1x1NjM2Mlx1NTIzMFx1NTE3Nlx1NUI4MyBBcHAgXHU1NDBFXHU2MzA5XHU3RUNGXHU4RkM3XHU3Njg0XHU1ODk5XHU0RTBBXHU2NUY2XHU5NUY0XHU0RjMwXHU3Qjk3XHVGRjFCaU9TIFx1NTNFRlx1ODBGRFx1NjY4Mlx1NTA1Q1x1NjIxNlx1NTZERVx1NjUzNiBPYnNpZGlhblx1RkYwQ1x1NTZFMFx1NkI2NFx1OEZEOVx1NEUwRFx1NEVFM1x1ODg2OFx1NURGMlx1OUE4Q1x1OEJDMVx1NzY4NFx1NEUxM1x1NkNFOFx1NjIxNlx1OTYwNVx1OEJGQlx1NjVGNlx1OTU3Rlx1MzAwMiAvIENsb3Npbmcgb25seSBtaW5pbWl6ZXMgdGhpcyB0aW1lci4gTW9iaWxlIGJhY2tncm91bmQgdGltZSBpcyBhIHdhbGwtY2xvY2sgZXN0aW1hdGU7IGlPUyBtYXkgc3VzcGVuZCBvciB0ZXJtaW5hdGUgT2JzaWRpYW4sIHNvIGl0IGlzIG5vdCB2ZXJpZmllZCBmb2N1cyBvciByZWFkaW5nIHRpbWUuXCIsXG4gICAgICBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1kaXNjbGFpbWVyXCJcbiAgICB9KTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGNvbnN0IHBhdXNlID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTY2ODJcdTUwNUMgLyBQYXVzZVwiIH0pO1xuICAgIGNvbnN0IGZpbmlzaCA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU3RUQzXHU2NzVGIC8gRmluaXNoXCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgY29uc3QgcmVmcmVzaCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVGb2N1cygpO1xuICAgICAgaWYgKCFjdXJyZW50KSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgICBjb25zdCBlbGFwc2VkID0gY3VycmVudC5mb2N1c2VkTXMgKyAoY3VycmVudC5ydW5uaW5nQXQgPT09IG51bGwgPyAwIDogTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIGN1cnJlbnQucnVubmluZ0F0KSk7XG4gICAgICBjb25zdCByZW1haW5pbmcgPSBNYXRoLm1heCgwLCBjdXJyZW50LmR1cmF0aW9uTXMgLSBlbGFwc2VkKTtcbiAgICAgIGNsb2NrLnNldFRleHQoZm9ybWF0RHVyYXRpb24ocmVtYWluaW5nKSk7XG4gICAgICBwYXVzZS5zZXRUZXh0KGN1cnJlbnQucnVubmluZ0F0ID09PSBudWxsID8gXCJcdTdFRTdcdTdFRUQgLyBSZXN1bWVcIiA6IFwiXHU2NjgyXHU1MDVDIC8gUGF1c2VcIik7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDApIHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKTtcbiAgICB9O1xuICAgIHBhdXNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucGx1Z2luLnRvZ2dsZUZvY3VzUGF1c2UoKS50aGVuKHJlZnJlc2gpKTtcbiAgICBmaW5pc2guYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKS50aGVuKCgpID0+IHRoaXMuY2xvc2UoKSkpO1xuICAgIHRoaXMuaW50ZXJ2YWwgPSB3aW5kb3cuc2V0SW50ZXJ2YWwocmVmcmVzaCwgNTAwKTsgcmVmcmVzaCgpO1xuICB9XG4gIG9uQ2xvc2UoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaW50ZXJ2YWwgIT09IG51bGwpIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWwpO1xuICAgIHRoaXMucGx1Z2luLnNldEZvY3VzVGltZXJPcGVuKGZhbHNlKTtcbiAgfVxufVxuXG5jbGFzcyBNb2JpbGVQbGFuRWRpdG9yVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcbiAgcHJpdmF0ZSBtb2RlOiBQbGFuTW9kZSA9IFwic3R1ZHlcIjtcbiAgcHJpdmF0ZSBkYXRlID0gbG9jYWxEYXRlKCk7XG4gIHByaXZhdGUgc3RhcnRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBlbmRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBpbnB1dCA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihsZWFmKTsgfVxuXG4gIGdldFZpZXdUeXBlKCk6IHN0cmluZyB7IHJldHVybiBNT0JJTEVfUExBTl9FRElUT1JfVklFVzsgfVxuICBnZXREaXNwbGF5VGV4dCgpOiBzdHJpbmcgeyByZXR1cm4gXCJBSSBQbGFubmVyXCI7IH1cbiAgZ2V0SWNvbigpOiBzdHJpbmcgeyByZXR1cm4gXCJjYWxlbmRhci1wbHVzXCI7IH1cblxuICBhc3luYyBvbk9wZW4oKTogUHJvbWlzZTx2b2lkPiB7IHRoaXMucmVuZGVyKCk7IH1cblxuICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIHRoaXMuY29udGVudEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2JpbGUtZWRpdG9yXCIpO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaDFcIiwgeyB0ZXh0OiBcIkFJIFBsYW5uZXIgLyBBSSBcdThCQTFcdTUyMTJcIiB9KTtcblxuICAgIGNvbnN0IGZvcm0gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtZm9ybVwiIH0pO1xuICAgIGNvbnN0IG1vZGUgPSB0aGlzLmZpZWxkKGZvcm0sIFwiXHU2QTIxXHU1RjBGIC8gTW9kZVwiKS5jcmVhdGVFbChcInNlbGVjdFwiKTtcbiAgICBtb2RlLmNyZWF0ZUVsKFwib3B0aW9uXCIsIHsgdmFsdWU6IFwic3R1ZHlcIiwgdGV4dDogXCJcdTRGNUNcdTRFMUFcdTRFMEVcdTVCNjZcdTRFNjAgLyBIb21ld29yayAmIHN0dWR5XCIgfSk7XG4gICAgbW9kZS5jcmVhdGVFbChcIm9wdGlvblwiLCB7IHZhbHVlOiBcIndvcmtcIiwgdGV4dDogXCJcdTVERTVcdTRGNUMgLyBXb3JrXCIgfSk7XG4gICAgbW9kZS52YWx1ZSA9IHRoaXMubW9kZTtcbiAgICBtb2RlLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4gdGhpcy5tb2RlID0gbW9kZS52YWx1ZSBhcyBQbGFuTW9kZSk7XG5cbiAgICBjb25zdCBkYXRlID0gdGhpcy5maWVsZChmb3JtLCBcIlx1OEJBMVx1NTIxMlx1NjVFNVx1NjcxRiAvIFBsYW4gZGF0ZVwiKS5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJkYXRlXCIgfSk7XG4gICAgZGF0ZS52YWx1ZSA9IHRoaXMuZGF0ZTtcbiAgICBkYXRlLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLmRhdGUgPSBkYXRlLnZhbHVlKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gdGhpcy5jcmVhdGVNb2JpbGVUaW1lSW5wdXQodGhpcy5maWVsZChmb3JtLCBcIlx1NUYwMFx1NTlDQlx1NjVGNlx1OTVGNCAvIFN0YXJ0IHRpbWVcIiwgXCJcdTUzRUZcdTkwMDkgLyBPcHRpb25hbC5cIiksIHRoaXMuc3RhcnRUaW1lLCB2YWx1ZSA9PiB0aGlzLnN0YXJ0VGltZSA9IHZhbHVlKTtcbiAgICBjb25zdCBlbmQgPSB0aGlzLmNyZWF0ZU1vYmlsZVRpbWVJbnB1dCh0aGlzLmZpZWxkKGZvcm0sIFwiXHU2NzAwXHU2NjVBXHU3RUQzXHU2NzVGIC8gTGF0ZXN0IGZpbmlzaFwiLCBcIlx1NTNFRlx1OTAwOSAvIE9wdGlvbmFsLlwiKSwgdGhpcy5lbmRUaW1lLCB2YWx1ZSA9PiB0aGlzLmVuZFRpbWUgPSB2YWx1ZSk7XG5cbiAgICB0aGlzLmZpZWxkKGZvcm0sIFwiXHU0RUZCXHU1MkExXHU2MjE2XHU0RjVDXHU0RTFBIC8gVGFza3Mgb3IgaG9tZXdvcmtcIiwgXCJcdTU4NkJcdTUxOTlcdTc5RDFcdTc2RUUvXHU5ODc5XHU3NkVFXHUzMDAxXHU0RUZCXHU1MkExXHU5MUNGXHUzMDAxXHU2MjJBXHU2QjYyXHU2NUY2XHU5NUY0XHU1NDhDXHU5NjUwXHU1MjM2XHU2NzYxXHU0RUY2XHUzMDAyXCIpO1xuICAgIGNvbnN0IHNvdXJjZUJhciA9IGZvcm0uY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItc291cmNlXCIgfSk7XG4gICAgY29uc3Qgc291cmNlTGFiZWwgPSBzb3VyY2VCYXIuY3JlYXRlU3Bhbih7IHRleHQ6IFwiXHU2NzY1XHU2RTkwIC8gU291cmNlOiBcdTYyNEJcdTUyQThcdThGOTNcdTUxNjUgLyBtYW51YWwgaW5wdXRcIiB9KTtcbiAgICBjb25zdCB1c2VBY3RpdmUgPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NEY3Rlx1NzUyOFx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMCAvIFVzZSBjdXJyZW50IG5vdGVcIiB9KTtcbiAgICBjb25zdCBjaG9vc2UgPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiIH0pO1xuICAgIGNvbnN0IGFyZWEgPSBmb3JtLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1pbnB1dFwiIH0pO1xuICAgIGFyZWEucm93cyA9IDk7XG4gICAgYXJlYS52YWx1ZSA9IHRoaXMuaW5wdXQ7XG4gICAgYXJlYS5wbGFjZWhvbGRlciA9IFwiRXhhbXBsZTogTWF0aCB3b3JrYm9vayBwYWdlcyAxMi0xNDsgbWVtb3JpemUgMjAgRW5nbGlzaCB3b3JkczsgQ2hpbmVzZSByZWFkaW5nIGFsb3VkLlwiO1xuICAgIGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHRoaXMuaW5wdXQgPSBhcmVhLnZhbHVlKTtcbiAgICBjb25zdCBsb2FkU291cmNlID0gYXN5bmMgKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIHRoaXMuaW5wdXQgPSBjb250ZW50O1xuICAgICAgYXJlYS52YWx1ZSA9IGNvbnRlbnQ7XG4gICAgICBzb3VyY2VMYWJlbC5zZXRUZXh0KGBcdTY3NjVcdTZFOTAgLyBTb3VyY2U6ICR7ZmlsZS5wYXRofWApO1xuICAgIH07XG4gICAgdXNlQWN0aXZlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgIGlmICghZmlsZSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBPcGVuIGEgTWFya2Rvd24gbm90ZSBmaXJzdC5cIik7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoZSBjdXJyZW50IG5vdGUuXCIpOyB9XG4gICAgfSk7XG4gICAgY2hvb3NlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBuZXcgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwodGhpcy5hcHAsIGFzeW5jIGZpbGUgPT4ge1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShmaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGF0IG5vdGUuXCIpOyB9XG4gICAgfSkub3BlbigpKTtcblxuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLW1vYmlsZS1hY3Rpb25zXCIgfSk7XG4gICAgY29uc3QgZ2VuZXJhdGUgPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBnZW5lcmF0ZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLmlucHV0LnRyaW0oKSkgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdThCRjdcdTgxRjNcdTVDMTFcdTU4NkJcdTUxOTlcdTRFMDBcdTk4NzlcdTRFRkJcdTUyQTEgLyBFbnRlciBhdCBsZWFzdCBvbmUgdGFzayBmaXJzdC5cIik7XG4gICAgICBnZW5lcmF0ZS5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBnZW5lcmF0ZS5zZXRUZXh0KFwiXHU2QjYzXHU1NzI4XHU3NTFGXHU2MjEwIC8gR2VuZXJhdGluZy4uLlwiKTtcbiAgICAgIGFyZWEuYmx1cigpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGxhbiA9IGF3YWl0IHRoaXMucGx1Z2luLmdlbmVyYXRlUGxhbih0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgdGhpcy5zdGFydFRpbWUsIHRoaXMuZW5kVGltZSwgdGhpcy5pbnB1dCk7XG4gICAgICAgIG5ldyBQbGFuUHJldmlld01vZGFsKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgdGhpcy5tb2RlLCB0aGlzLmRhdGUsIHBsYW4pLm9wZW4oKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkNvdWxkIG5vdCBnZW5lcmF0ZSBwbGFuLlwiKTtcbiAgICAgICAgZ2VuZXJhdGUuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgZ2VuZXJhdGUuc2V0VGV4dChcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGZpZWxkKHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IGZpZWxkID0gcGFyZW50LmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLW1vYmlsZS1maWVsZFwiIH0pO1xuICAgIGZpZWxkLmNyZWF0ZUVsKFwibGFiZWxcIiwgeyB0ZXh0OiBsYWJlbCB9KTtcbiAgICBpZiAoZGVzY3JpcHRpb24pIGZpZWxkLmNyZWF0ZUVsKFwic21hbGxcIiwgeyB0ZXh0OiBkZXNjcmlwdGlvbiB9KTtcbiAgICByZXR1cm4gZmllbGQ7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZU1vYmlsZVRpbWVJbnB1dChwYXJlbnQ6IEhUTUxFbGVtZW50LCB2YWx1ZTogc3RyaW5nLCBvbkNoYW5nZTogKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQpOiBIVE1MSW5wdXRFbGVtZW50IHtcbiAgICBjb25zdCBpbnB1dCA9IHBhcmVudC5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImFpLXBsYW5uZXItbW9iaWxlLXRpbWVcIiwgdHlwZTogXCJ0aW1lXCIgfSk7XG4gICAgaW5wdXQuc3RlcCA9IFwiNjBcIjtcbiAgICBpbnB1dC52YWx1ZSA9IHZhbHVlO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiBvbkNoYW5nZShpbnB1dC52YWx1ZSkpO1xuICAgIHJldHVybiBpbnB1dDtcbiAgfVxufVxuXG5jbGFzcyBNYW51YWxUYXNrTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbW9kZTogUGxhbk1vZGUgPSBcInN0dWR5XCI7XG4gIHByaXZhdGUgZGF0ZSA9IGxvY2FsRGF0ZSgpO1xuICBwcml2YXRlIHBsYW5UaXRsZSA9IFwiXCI7XG4gIHByaXZhdGUgdGl0bGUgPSBcIlwiO1xuICBwcml2YXRlIGNhdGVnb3J5ID0gXCJcIjtcbiAgcHJpdmF0ZSBtaW51dGVzID0gMzA7XG4gIHByaXZhdGUgc3RhcnRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBlbmRUaW1lID0gXCJcIjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBmaWxlPzogVEZpbGUpIHsgc3VwZXIoYXBwKTsgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KHRoaXMuZmlsZSA/IFwiXHU2REZCXHU1MkEwXHU4QkExXHU1MjEyXHU0RUZCXHU1MkExIC8gQWRkIHRhc2tcIiA6IFwiXHU2NUIwXHU1RUZBXHU2MjRCXHU1MkE4XHU4QkExXHU1MjEyIC8gQ3JlYXRlIG1hbnVhbCBwbGFuXCIpO1xuICAgIGlmICghdGhpcy5maWxlKSB7XG4gICAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NkEyMVx1NUYwRiAvIE1vZGVcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd24uYWRkT3B0aW9uKFwic3R1ZHlcIiwgXCJcdTRGNUNcdTRFMUFcdTRFMEVcdTVCNjZcdTRFNjAgLyBIb21ld29yayAmIHN0dWR5XCIpLmFkZE9wdGlvbihcIndvcmtcIiwgXCJcdTVERTVcdTRGNUMgLyBXb3JrXCIpLnNldFZhbHVlKHRoaXMubW9kZSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5tb2RlID0gdmFsdWUgYXMgUGxhbk1vZGUpKTtcbiAgICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU4QkExXHU1MjEyXHU2NUU1XHU2NzFGIC8gUGxhbiBkYXRlXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy5kYXRlKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLmRhdGUgPSB2YWx1ZSkpO1xuICAgICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdThCQTFcdTUyMTJcdTY4MDdcdTk4OTggLyBQbGFuIHRpdGxlXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy5wbGFuVGl0bGUpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMucGxhblRpdGxlID0gdmFsdWUpKTtcbiAgICB9XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTRFRkJcdTUyQTEgLyBUYXNrXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy50aXRsZSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy50aXRsZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTUyMDZcdTdDN0IgLyBDYXRlZ29yeVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMuY2F0ZWdvcnkpLnNldFBsYWNlaG9sZGVyKFwiXHU2NTcwXHU1QjY2IC8gUHJvamVjdFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLmNhdGVnb3J5ID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1OTg4NFx1OEJBMVx1NTIwNlx1OTQ5RiAvIEVzdGltYXRlZCBtaW51dGVzXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMubWludXRlcykpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMubWludXRlcyA9IE1hdGgubWF4KDEsIE51bWJlcih2YWx1ZSkgfHwgMzApKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTVGMDBcdTU5Q0JcdTY1RjZcdTk1RjQgLyBTdGFydCB0aW1lXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy5zdGFydFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMTk6MDBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5zdGFydFRpbWUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU3RUQzXHU2NzVGXHU2NUY2XHU5NUY0IC8gRW5kIHRpbWVcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLmVuZFRpbWUpLnNldFBsYWNlaG9sZGVyKFwiMTk6MzBcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5lbmRUaW1lID0gdmFsdWUpKTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGNvbnN0IHN1Ym1pdCA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IHRoaXMuZmlsZSA/IFwiXHU2REZCXHU1MkEwXHU0RUZCXHU1MkExIC8gQWRkIHRhc2tcIiA6IFwiXHU1MjFCXHU1RUZBXHU4QkExXHU1MjEyIC8gQ3JlYXRlIHBsYW5cIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBzdWJtaXQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy50aXRsZS50cmltKCkpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU1ODZCXHU1MTk5XHU0RUZCXHU1MkExIC8gRW50ZXIgYSB0YXNrIGZpcnN0LlwiKTtcbiAgICAgIHN1Ym1pdC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5hZGRNYW51YWxUYXNrKHRoaXMuZmlsZSwgeyB0aXRsZTogdGhpcy50aXRsZS50cmltKCksIGNhdGVnb3J5OiB0aGlzLmNhdGVnb3J5LnRyaW0oKSwgZXN0aW1hdGVkTWludXRlczogdGhpcy5taW51dGVzLCBzdGFydFRpbWU6IHRoaXMuc3RhcnRUaW1lLnRyaW0oKSwgZW5kVGltZTogdGhpcy5lbmRUaW1lLnRyaW0oKSB9LCB0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgdGhpcy5wbGFuVGl0bGUudHJpbSgpKTtcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiQ291bGQgbm90IHNhdmUgdGhlIHRhc2suXCIpO1xuICAgICAgICBzdWJtaXQuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5jbGFzcyBQbGFuSW5wdXRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBtb2RlOiBQbGFuTW9kZSA9IFwic3R1ZHlcIjtcbiAgcHJpdmF0ZSBkYXRlID0gbG9jYWxEYXRlKCk7XG4gIHByaXZhdGUgc3RhcnRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBlbmRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBpbnB1dCA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4pIHsgc3VwZXIoYXBwKTsgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiQUkgUGxhbm5lciAvIEFJIFx1OEJBMVx1NTIxMlwiKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NkEyMVx1NUYwRiAvIE1vZGVcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cbiAgICAgIC5hZGRPcHRpb24oXCJzdHVkeVwiLCBcIlx1NEY1Q1x1NEUxQVx1NEUwRVx1NUI2Nlx1NEU2MCAvIEhvbWV3b3JrICYgc3R1ZHlcIilcbiAgICAgIC5hZGRPcHRpb24oXCJ3b3JrXCIsIFwiXHU1REU1XHU0RjVDIC8gV29ya1wiKVxuICAgICAgLnNldFZhbHVlKHRoaXMubW9kZSlcbiAgICAgIC5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLm1vZGUgPSB2YWx1ZSBhcyBQbGFuTW9kZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU4QkExXHU1MjEyXHU2NUU1XHU2NzFGIC8gUGxhbiBkYXRlXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXRcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLmRhdGUpLnNldFBsYWNlaG9sZGVyKFwiWVlZWS1NTS1ERFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLmRhdGUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0IC8gU3RhcnQgdGltZVwiKS5zZXREZXNjKFwiXHU0RjhCXHU1OTgyIC8gRXhhbXBsZTogMTk6MDBcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dFxuICAgICAgLnNldFZhbHVlKHRoaXMuc3RhcnRUaW1lKS5zZXRQbGFjZWhvbGRlcihcIjE5OjAwXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuc3RhcnRUaW1lID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NjcwMFx1NjY1QVx1N0VEM1x1Njc1RiAvIExhdGVzdCBmaW5pc2hcIikuc2V0RGVzYyhcIlx1NTNFRlx1OTAwOSAvIE9wdGlvbmFsLlwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0XG4gICAgICAuc2V0VmFsdWUodGhpcy5lbmRUaW1lKS5zZXRQbGFjZWhvbGRlcihcIjIxOjAwXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuZW5kVGltZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTRFRkJcdTUyQTFcdTYyMTZcdTRGNUNcdTRFMUEgLyBUYXNrcyBvciBob21ld29ya1wiKS5zZXREZXNjKFwiXHU1ODZCXHU1MTk5XHU3OUQxXHU3NkVFL1x1OTg3OVx1NzZFRVx1MzAwMVx1NEVGQlx1NTJBMVx1OTFDRlx1MzAwMVx1NjIyQVx1NkI2Mlx1NjVGNlx1OTVGNFx1NTQ4Q1x1OTY1MFx1NTIzNlx1Njc2MVx1NEVGNlx1MzAwMlwiKTtcbiAgICBjb25zdCBzb3VyY2VCYXIgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1zb3VyY2VcIiB9KTtcbiAgICBjb25zdCBzb3VyY2VMYWJlbCA9IHNvdXJjZUJhci5jcmVhdGVTcGFuKHsgdGV4dDogXCJcdTY3NjVcdTZFOTAgLyBTb3VyY2U6IFx1NjI0Qlx1NTJBOFx1OEY5M1x1NTE2NSAvIG1hbnVhbCBpbnB1dFwiIH0pO1xuICAgIGNvbnN0IHVzZUFjdGl2ZUJ1dHRvbiA9IHNvdXJjZUJhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU0RjdGXHU3NTI4XHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwIC8gVXNlIGN1cnJlbnQgbm90ZVwiIH0pO1xuICAgIGNvbnN0IGNob29zZUJ1dHRvbiA9IHNvdXJjZUJhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU5MDA5XHU2MkU5IE1hcmtkb3duIFx1N0IxNFx1OEJCMCAvIENob29zZSBub3RlXCIgfSk7XG4gICAgY29uc3QgYXJlYSA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1pbnB1dFwiIH0pO1xuICAgIGFyZWEucm93cyA9IDg7XG4gICAgYXJlYS5wbGFjZWhvbGRlciA9IFwiRXhhbXBsZTogTWF0aCB3b3JrYm9vayBwYWdlcyAxMi0xNDsgbWVtb3JpemUgMjAgRW5nbGlzaCB3b3JkczsgQ2hpbmVzZSByZWFkaW5nIGFsb3VkLlwiO1xuICAgIGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHRoaXMuaW5wdXQgPSBhcmVhLnZhbHVlKTtcbiAgICBjb25zdCBsb2FkU291cmNlID0gYXN5bmMgKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIHRoaXMuaW5wdXQgPSBjb250ZW50O1xuICAgICAgYXJlYS52YWx1ZSA9IGNvbnRlbnQ7XG4gICAgICBzb3VyY2VMYWJlbC5zZXRUZXh0KGBcdTY3NjVcdTZFOTAgLyBTb3VyY2U6ICR7ZmlsZS5wYXRofWApO1xuICAgIH07XG4gICAgdXNlQWN0aXZlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgIGlmICghYWN0aXZlRmlsZSB8fCBhY3RpdmVGaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBPcGVuIGEgTWFya2Rvd24gbm90ZSBmaXJzdC5cIik7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGFjdGl2ZUZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoZSBjdXJyZW50IG5vdGUuXCIpOyB9XG4gICAgfSk7XG4gICAgY2hvb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBuZXcgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwodGhpcy5hcHAsIGFzeW5jIGZpbGUgPT4ge1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShmaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGF0IG5vdGUuXCIpOyB9XG4gICAgfSkub3BlbigpKTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGNvbnN0IGJ1dHRvbiA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU3NTFGXHU2MjEwXHU5ODg0XHU4OUM4IC8gR2VuZXJhdGUgcHJldmlld1wiLCBjbHM6IFwibW9kLWN0YVwiIH0pO1xuICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLmlucHV0LnRyaW0oKSkgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdThCRjdcdTgxRjNcdTVDMTFcdTU4NkJcdTUxOTlcdTRFMDBcdTk4NzlcdTRFRkJcdTUyQTEgLyBFbnRlciBhdCBsZWFzdCBvbmUgdGFzayBmaXJzdC5cIik7XG4gICAgICBidXR0b24uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgYnV0dG9uLnNldFRleHQoXCJcdTZCNjNcdTU3MjhcdTc1MUZcdTYyMTAgLyBHZW5lcmF0aW5nLi4uXCIpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGxhbiA9IGF3YWl0IHRoaXMucGx1Z2luLmdlbmVyYXRlUGxhbih0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgdGhpcy5zdGFydFRpbWUsIHRoaXMuZW5kVGltZSwgdGhpcy5pbnB1dCk7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgICAgbmV3IFBsYW5QcmV2aWV3TW9kYWwodGhpcy5hcHAsIHRoaXMucGx1Z2luLCB0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgcGxhbikub3BlbigpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiQ291bGQgbm90IGdlbmVyYXRlIHBsYW4uXCIpO1xuICAgICAgICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgYnV0dG9uLnNldFRleHQoXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIE1hcmtkb3duRmlsZVBpY2tlck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIHF1ZXJ5ID0gXCJcIjtcbiAgcHJpdmF0ZSByZWFkb25seSBmaWxlczogVEZpbGVbXTtcbiAgcHJpdmF0ZSByZXN1bHRzRWw6IEhUTUxFbGVtZW50O1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IG9uQ2hvb3NlOiAoZmlsZTogVEZpbGUpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLmZpbGVzID0gYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKS5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgpKTtcbiAgICB0aGlzLnJlc3VsdHNFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiLCBcImFpLXBsYW5uZXItZmlsZS1waWNrZXJcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTkwMDlcdTYyRTkgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gQ2hvb3NlIG5vdGVcIik7XG4gICAgY29uc3Qgc2VhcmNoID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IHR5cGU6IFwic2VhcmNoXCIsIHBsYWNlaG9sZGVyOiBcIlx1NjQxQ1x1N0QyMlx1N0IxNFx1OEJCMCAvIFNlYXJjaCBub3Rlcy4uLlwiLCBjbHM6IFwiYWktcGxhbm5lci1maWxlLXNlYXJjaFwiIH0pO1xuICAgIHNlYXJjaC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4geyB0aGlzLnF1ZXJ5ID0gc2VhcmNoLnZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpOyB0aGlzLnJlbmRlclJlc3VsdHMoKTsgfSk7XG4gICAgdGhpcy5yZXN1bHRzRWwgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1maWxlLXJlc3VsdHNcIiB9KTtcbiAgICB0aGlzLnJlbmRlclJlc3VsdHMoKTtcbiAgICBzZWFyY2guZm9jdXMoKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyUmVzdWx0cygpOiB2b2lkIHtcbiAgICB0aGlzLnJlc3VsdHNFbC5lbXB0eSgpO1xuICAgIGNvbnN0IG1hdGNoZXMgPSB0aGlzLmZpbGVzLmZpbHRlcihmaWxlID0+IGZpbGUucGF0aC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRoaXMucXVlcnkpKS5zbGljZSgwLCAxMDApO1xuICAgIGlmICghbWF0Y2hlcy5sZW5ndGgpIHsgdGhpcy5yZXN1bHRzRWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJObyBNYXJrZG93biBub3RlcyBmb3VuZC5cIiB9KTsgcmV0dXJuOyB9XG4gICAgZm9yIChjb25zdCBmaWxlIG9mIG1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IHRoaXMucmVzdWx0c0VsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImFpLXBsYW5uZXItZmlsZS1pdGVtXCIgfSk7XG4gICAgICBidXR0b24uY3JlYXRlRWwoXCJzdHJvbmdcIiwgeyB0ZXh0OiBmaWxlLmJhc2VuYW1lIH0pO1xuICAgICAgYnV0dG9uLmNyZWF0ZUVsKFwic21hbGxcIiwgeyB0ZXh0OiBmaWxlLnBhdGggfSk7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHsgYXdhaXQgdGhpcy5vbkNob29zZShmaWxlKTsgdGhpcy5jbG9zZSgpOyB9KTtcbiAgICB9XG4gIH1cbn1cblxuY2xhc3MgUGxhblByZXZpZXdNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4sIHByaXZhdGUgcmVhZG9ubHkgbW9kZTogUGxhbk1vZGUsIHByaXZhdGUgcmVhZG9ubHkgZGF0ZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IHBsYW46IFBsYW5SZXN1bHQpIHsgc3VwZXIoYXBwKTsgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGFsRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLW1vZGFsXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KHRoaXMucGxhbi50aXRsZSB8fCBcIlBsYW4gcHJldmlld1wiKTtcbiAgICBpZiAodGhpcy5wbGFuLnN1bW1hcnkpIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IHRoaXMucGxhbi5zdW1tYXJ5IH0pO1xuICAgIHJlbmRlclByZXZpZXdUYXNrcyh0aGlzLmNvbnRlbnRFbCwgXCJQbGFuXCIsIHRoaXMucGxhbi50YXNrcyk7XG4gICAgaWYgKHRoaXMubW9kZSA9PT0gXCJzdHVkeVwiKSByZW5kZXJQcmV2aWV3VGFza3ModGhpcy5jb250ZW50RWwsIFwiUmV2aWV3XCIsIHRoaXMucGxhbi5yZXZpZXdUYXNrcyA/PyBbXSk7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGFsLWJ1dHRvbi1jb250YWluZXJcIiB9KTtcbiAgICBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNhbmNlbFwiIH0pLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuICAgIGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiV3JpdGUgcGxhblwiLCBjbHM6IFwibW9kLWN0YVwiIH0pLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXRoID0gYXdhaXQgdGhpcy5wbHVnaW4ud3JpdGVQbGFuKHRoaXMubW9kZSwgdGhpcy5kYXRlLCB0aGlzLnBsYW4pO1xuICAgICAgICBuZXcgTm90aWNlKGBQbGFuIHdyaXR0ZW46ICR7cGF0aH1gKTtcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiQ291bGQgbm90IHdyaXRlIHBsYW4uXCIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIEFJUGxhbm5lclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4pIHsgc3VwZXIoYXBwLCBwbHVnaW4pOyB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRhaW5lckVsLmVtcHR5KCk7XG4gICAgdGhpcy5jb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJBSSBQbGFubmVyIFx1OEJCRVx1N0Y2RSAvIFNldHRpbmdzXCIgfSk7XG4gICAgdGhpcy5jb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIkNsYXVkZSBcdTRFMEUgR2VtaW5pIFx1NEY3Rlx1NzUyOFx1NTM5Rlx1NzUxRlx1NjNBNVx1NTNFM1x1RkYxQlx1NTE3Nlx1NUI4M1x1OTg4NFx1OEJCRVx1NEY3Rlx1NzUyOCBPcGVuQUktY29tcGF0aWJsZSBcdTYzQTVcdTUzRTNcdTMwMDJDbGF1ZGUgYW5kIEdlbWluaSB1c2UgbmF0aXZlIEFQSSBmb3JtYXRzLlwiIH0pO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTc1NENcdTk3NjJcdThCRURcdThBMDAgLyBJbnRlcmZhY2UgbGFuZ3VhZ2VcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cbiAgICAgIC5hZGRPcHRpb24oXCJhdXRvXCIsIFwiXHU4RERGXHU5NjhGXHU3Q0ZCXHU3RURGIC8gRm9sbG93IHN5c3RlbVwiKVxuICAgICAgLmFkZE9wdGlvbihcInpoXCIsIFwiXHU0RTJEXHU2NTg3XCIpXG4gICAgICAuYWRkT3B0aW9uKFwiZW5cIiwgXCJFbmdsaXNoXCIpXG4gICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaW50ZXJmYWNlTGFuZ3VhZ2UpXG4gICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5pbnRlcmZhY2VMYW5ndWFnZSA9IHZhbHVlIGFzIEludGVyZmFjZUxhbmd1YWdlOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTY3MERcdTUyQTFcdTU1NDZcdTk4ODRcdThCQkUgLyBQcm92aWRlciBwcmVzZXRcIikuc2V0RGVzYyhcIlx1OTAwOVx1NjJFOVx1NTQwRVx1NEYxQVx1NTg2Qlx1NTE2NVx1NjNBOFx1ODM1MFx1NTczMFx1NTc0MFx1NEUwRVx1NkEyMVx1NTc4Qlx1RkYwQ1x1NTNFRlx1N0VFN1x1N0VFRFx1NjI0Qlx1NTJBOFx1NEZFRVx1NjUzOVx1MzAwMlwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XG4gICAgICBmb3IgKGNvbnN0IFtpZCwgcHJlc2V0XSBvZiBPYmplY3QuZW50cmllcyhQUk9WSURFUlMpKSBkcm9wZG93bi5hZGRPcHRpb24oaWQsIHByZXNldC5sYWJlbCk7XG4gICAgICBkcm9wZG93bi5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5wcm92aWRlcikub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xuICAgICAgICBjb25zdCBwcm92aWRlciA9IHZhbHVlIGFzIFByb3ZpZGVySWQ7XG4gICAgICAgIHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnByb3ZpZGVyID0gcHJvdmlkZXI7XG4gICAgICAgIGlmIChwcm92aWRlciAhPT0gXCJjdXN0b21cIikge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmFwaUJhc2VVcmwgPSBQUk9WSURFUlNbcHJvdmlkZXJdLmJhc2VVcmw7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MubW9kZWwgPSBQUk9WSURFUlNbcHJvdmlkZXJdLm1vZGVsO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJBUEkgXHU1NzMwXHU1NzQwIC8gQVBJIGJhc2UgVVJMXCIsIFwiXHU0RjhCXHU1OTgyIC8gRXhhbXBsZTogaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MVwiLCBcImFwaUJhc2VVcmxcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIkFQSSBcdTVCQzZcdTk0QTUgLyBBUEkga2V5XCIpLnNldERlc2MoXCJTdG9yZWQgaW4gdGhpcyBwbHVnaW4ncyBkYXRhLmpzb24uXCIpLmFkZFRleHQoaW5wdXQgPT4ge1xuICAgICAgaW5wdXQuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuYXBpS2V5KS5zZXRQbGFjZWhvbGRlcihcInNrLS4uLlwiKTtcbiAgICAgIGlucHV0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcbiAgICAgIGlucHV0Lm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuYXBpS2V5ID0gdmFsdWU7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU2QTIxXHU1NzhCIC8gTW9kZWxcIiwgXCJcdTRGOEJcdTU5ODIgLyBFeGFtcGxlOiBncHQtNC4xLW1pbmksIGRlZXBzZWVrLWNoYXQsIGdsbS00LWZsYXNoXCIsIFwibW9kZWxcIik7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1ODFFQVx1NUI5QVx1NEU0OVx1OEJGN1x1NkM0Mlx1NTkzNCAvIEN1c3RvbSBoZWFkZXJzXCIsIFwiSlNPTiBvYmplY3QsIG9wdGlvbmFsLlwiLCBcImN1c3RvbUhlYWRlcnNcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NkUyOVx1NUVBNiAvIFRlbXBlcmF0dXJlXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLnRlbXBlcmF0dXJlKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy50ZW1wZXJhdHVyZSA9IE51bWJlcih2YWx1ZSkgfHwgMDsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2NzAwXHU1OTI3XHU4RjkzXHU1MUZBXHU5NTdGXHU1RUE2IC8gTWF4IG91dHB1dCB0b2tlbnNcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MubWF4VG9rZW5zKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5tYXhUb2tlbnMgPSBOdW1iZXIodmFsdWUpIHx8IERFRkFVTFRfU0VUVElOR1MubWF4VG9rZW5zOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTUzODZcdTUzRjJcdTY4MjFcdTUxQzZcdTU5MjlcdTY1NzAgLyBIaXN0b3J5IGRheXNcIikuc2V0RGVzYyhcIlx1NzUxRlx1NjIxMFx1OEJBMVx1NTIxMlx1NjVGNlx1OEJGQlx1NTNENlx1OEZEMVx1NjcxRlx1NzcxRlx1NUI5RVx1NzUyOFx1NjVGNlx1RkYwQ1x1NUVGQVx1OEJBRSA3LTMwIFx1NTkyOVx1MzAwMlwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5oaXN0b3J5RGF5cykpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaGlzdG9yeURheXMgPSBNYXRoLm1heCgxLCBOdW1iZXIodmFsdWUpIHx8IERFRkFVTFRfU0VUVElOR1MuaGlzdG9yeURheXMpOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTlFRDhcdThCQTRcdTRFMTNcdTZDRThcdTUyMDZcdTk0OUYgLyBEZWZhdWx0IGZvY3VzIG1pbnV0ZXNcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW51dGVzKSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbnV0ZXMgPSBNYXRoLm1heCgxLCBOdW1iZXIodmFsdWUpIHx8IERFRkFVTFRfU0VUVElOR1MuZm9jdXNNaW51dGVzKTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiXHU1QjY2XHU0RTYwXHU4RjkzXHU1MUZBXHU3NkVFXHU1RjU1IC8gU3R1ZHkgb3V0cHV0IGZvbGRlclwiLCBcIlZhdWx0LXJlbGF0aXZlIHBhdGguXCIsIFwic3R1ZHlGb2xkZXJcIik7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1NURFNVx1NEY1Q1x1OEY5M1x1NTFGQVx1NzZFRVx1NUY1NSAvIFdvcmsgb3V0cHV0IGZvbGRlclwiLCBcIlZhdWx0LXJlbGF0aXZlIHBhdGguXCIsIFwid29ya0ZvbGRlclwiKTtcbiAgfVxuXG4gIHByaXZhdGUgdGV4dFNldHRpbmcobmFtZTogc3RyaW5nLCBkZXNjOiBzdHJpbmcsIGtleTogXCJhcGlCYXNlVXJsXCIgfCBcIm1vZGVsXCIgfCBcImN1c3RvbUhlYWRlcnNcIiB8IFwic3R1ZHlGb2xkZXJcIiB8IFwid29ya0ZvbGRlclwiKTogdm9pZCB7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShuYW1lKS5zZXREZXNjKGRlc2MpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3Nba2V5XSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4geyB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5nc1trZXldID0gdmFsdWUudHJpbSgpOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSkpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlUGxhbihjb250ZW50OiBzdHJpbmcpOiBQbGFuUmVzdWx0IHtcbiAgY29uc3QganNvbiA9IGNvbnRlbnQudHJpbSgpLnJlcGxhY2UoL15gYGAoPzpqc29uKT9cXHMqL2ksIFwiXCIpLnJlcGxhY2UoL1xccypgYGAkLywgXCJcIik7XG4gIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbikgYXMgUGxhblJlc3VsdDtcbiAgaWYgKCFwYXJzZWQudGl0bGUgfHwgIUFycmF5LmlzQXJyYXkocGFyc2VkLnRhc2tzKSkgdGhyb3cgbmV3IEVycm9yKFwiVGhlIG1vZGVsIHJldHVybmVkIGFuIGludmFsaWQgcGxhbiBmb3JtYXQuXCIpO1xuICBwYXJzZWQudGFza3MgPSBwYXJzZWQudGFza3MubWFwKG5vcm1hbGl6ZVRhc2spLmZpbHRlcihCb29sZWFuKSBhcyBQbGFuVGFza1tdO1xuICBwYXJzZWQucmV2aWV3VGFza3MgPSBBcnJheS5pc0FycmF5KHBhcnNlZC5yZXZpZXdUYXNrcykgPyBwYXJzZWQucmV2aWV3VGFza3MubWFwKG5vcm1hbGl6ZVRhc2spLmZpbHRlcihCb29sZWFuKSBhcyBQbGFuVGFza1tdIDogW107XG4gIGlmICghcGFyc2VkLnRhc2tzLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKFwiVGhlIG1vZGVsIGRpZCBub3QgcmV0dXJuIGFueSB0YXNrcy5cIik7XG4gIHJldHVybiBwYXJzZWQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVRhc2sodmFsdWU6IHVua25vd24pOiBQbGFuVGFzayB8IG51bGwge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHRhc2sgPSB2YWx1ZSBhcyBQYXJ0aWFsPFBsYW5UYXNrPjtcbiAgaWYgKCF0YXNrLnRpdGxlKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHsgdGl0bGU6IFN0cmluZyh0YXNrLnRpdGxlKSwgY2F0ZWdvcnk6IHRhc2suY2F0ZWdvcnkgPyBTdHJpbmcodGFzay5jYXRlZ29yeSkgOiBcIlwiLCBzdGFydFRpbWU6IHRhc2suc3RhcnRUaW1lID8gU3RyaW5nKHRhc2suc3RhcnRUaW1lKSA6IFwiXCIsIGVuZFRpbWU6IHRhc2suZW5kVGltZSA/IFN0cmluZyh0YXNrLmVuZFRpbWUpIDogXCJcIiwgZXN0aW1hdGVkTWludXRlczogTWF0aC5tYXgoMSwgTnVtYmVyKHRhc2suZXN0aW1hdGVkTWludXRlcykgfHwgMzApLCBkZXNjcmlwdGlvbjogdGFzay5kZXNjcmlwdGlvbiA/IFN0cmluZyh0YXNrLmRlc2NyaXB0aW9uKSA6IFwiXCIgfTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGxhbihtb2RlOiBQbGFuTW9kZSwgZGF0ZTogc3RyaW5nLCBwbGFuOiBQbGFuUmVzdWx0KTogc3RyaW5nIHtcbiAgY29uc3QgYWxsVGFza3MgPSBbLi4ucGxhbi50YXNrcywgLi4uKHBsYW4ucmV2aWV3VGFza3MgPz8gW10pXTtcbiAgY29uc3QgZnJvbnRtYXR0ZXIgPSBhbGxUYXNrcy5mbGF0TWFwKCh0YXNrLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IGlkID0gYHRhc2ske1N0cmluZyhpbmRleCArIDEpLnBhZFN0YXJ0KDIsIFwiMFwiKX1gO1xuICAgIHJldHVybiBbYCR7aWR9TmFtZTogJHt5YW1sUXVvdGUodGFzay50aXRsZSl9YCwgYCR7aWR9Q2F0ZWdvcnk6ICR7eWFtbFF1b3RlKHRhc2suY2F0ZWdvcnkgfHwgXCJcdTUxNzZcdTVCODNcIil9YCwgYCR7aWR9RXN0aW1hdGVkTWludXRlczogJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXN9YCwgYCR7aWR9QWN0dWFsU3RhcnQ6YCwgYCR7aWR9QWN0dWFsRW5kOmAsIGAke2lkfUFjdHVhbE1pbnV0ZXM6IDBgLCBgJHtpZH1Gb2N1c1Nlc3Npb25zOiAwYF07XG4gIH0pO1xuICBjb25zdCB0YXNrQ2FyZHMgPSAobGFiZWw6IHN0cmluZywgdGFza3M6IFBsYW5UYXNrW10sIG9mZnNldDogbnVtYmVyKSA9PiB0YXNrcy5sZW5ndGggPyBgIyMgJHtsYWJlbH1cXG5cXG4ke3Rhc2tzLm1hcCgodGFzaywgaW5kZXgpID0+IHJlbmRlclRhc2sodGFzaywgZGF0ZSwgb2Zmc2V0ICsgaW5kZXggKyAxKSkuam9pbihcIlxcblxcblwiKX1gIDogYCMjICR7bGFiZWx9XFxuXFxuXHU2NjgyXHU2NUUwXHU1Qjg5XHU2MzkyXHUzMDAyYDtcbiAgcmV0dXJuIGAtLS1cXG50eXBlOiAke21vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU2QkNGXHU2NUU1XHU0RjVDXHU0RTFBXHU4QkExXHU1MjEyXCIgOiBcIlx1NkJDRlx1NjVFNVx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwifVxcbnBsYW5EYXRlOiAke2RhdGV9XFxudGFnczpcXG4gIC0gQUlcdThCQTFcdTUyMTJcXG4ke2Zyb250bWF0dGVyLmpvaW4oXCJcXG5cIil9XFxuLS0tXFxuXFxuIyAke3BsYW4udGl0bGV9XFxuXFxuPiBbIWFic3RyYWN0XSBcdTY5ODJcdTg5QzhcXG4+ICR7cGxhbi5zdW1tYXJ5IHx8IFwiXHU3NTMxIEFJIFBsYW5uZXIgXHU3NTFGXHU2MjEwXHVGRjBDXHU2MjY3XHU4ODRDXHU1NDBFXHU1ODZCXHU1MTk5XHU2QkNGXHU5ODc5XHU1QjlFXHU5NjQ1XHU1RjAwXHU1OUNCXHU1NDhDXHU1QjhDXHU2MjEwXHU2NUY2XHU5NUY0XHUzMDAyXCJ9XFxuXFxuPCEtLSBBSS1QTEFOTkVSLVNVTU1BUlk6U1RBUlQgLS0+XFxuPiBbIXN1bW1hcnldIFx1NjI2N1x1ODg0Q1x1NjAzQlx1N0VEMyAvIEV4ZWN1dGlvbiBzdW1tYXJ5XFxuPiAtIFx1NTIxRFx1NTlDQlx1OEJBMVx1NTIxMlx1NURGMlx1NTIxQlx1NUVGQVx1RkYxQlx1NUI4Q1x1NjIxMFx1NEVGQlx1NTJBMVx1MzAwMVx1NEUxM1x1NkNFOFx1NjIxNlx1ODg2NVx1NTE0NVx1NEVGQlx1NTJBMVx1NTQwRVx1OEZEMFx1ODg0Q1x1MjAxQ1x1NTIzN1x1NjVCMFx1NUY1M1x1NTI0RFx1OEJBMVx1NTIxMlx1NjAzQlx1N0VEM1x1MjAxRFx1MzAwMlxcbjwhLS0gQUktUExBTk5FUi1TVU1NQVJZOkVORCAtLT5cXG5cXG4ke3Rhc2tDYXJkcyhtb2RlID09PSBcInN0dWR5XCIgPyBcIlx1NEY1Q1x1NEUxQVx1OEJBMVx1NTIxMlx1ODg2OFwiIDogXCJcdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcdTg4NjhcIiwgcGxhbi50YXNrcywgMCl9XFxuXFxuJHttb2RlID09PSBcInN0dWR5XCIgPyB0YXNrQ2FyZHMoXCJcdTU5MERcdTRFNjBcdThCQTFcdTUyMTJcdTg4NjhcIiwgcGxhbi5yZXZpZXdUYXNrcyA/PyBbXSwgcGxhbi50YXNrcy5sZW5ndGgpIDogXCJcIn1cXG5gO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUYXNrKHRhc2s6IFBsYW5UYXNrLCBkYXRlOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBwcmVmaXggPSB0YXNrLmNhdGVnb3J5ID8gYCR7dGFzay5jYXRlZ29yeX0gXHUwMEI3IGAgOiBcIlwiO1xuICBjb25zdCB0aW1lID0gdGFzay5zdGFydFRpbWUgJiYgdGFzay5lbmRUaW1lID8gYCR7dGFzay5zdGFydFRpbWV9LSR7dGFzay5lbmRUaW1lfWAgOiBcIlx1NUY4NVx1NUI4OVx1NjM5MlwiO1xuICBjb25zdCBub3RlID0gdGFzay5kZXNjcmlwdGlvbiA/IGBcXG4+ICR7dGFzay5kZXNjcmlwdGlvbn1gIDogXCJcIjtcbiAgcmV0dXJuIGA+IFshdG9kb10rICR7cHJlZml4fSR7dGFzay50aXRsZX1cXG4+IFx1NjVGNlx1NkJCNVx1RkYxQSR7dGltZX0gXHUwMEI3ICR7dGFzay5lc3RpbWF0ZWRNaW51dGVzfSBcdTUyMDZcdTk0OUZcXG4+IFx1NUI5RVx1OTY0NVx1NUYwMFx1NTlDQlx1RkYxQV9fX18gXHUwMEI3IFx1NUI5RVx1OTY0NVx1NUI4Q1x1NjIxMFx1RkYxQV9fX18ke25vdGV9XFxuPiAtIFsgXSAke3Rhc2sudGl0bGV9IFx1RDgzRFx1RENDNSAke2RhdGV9ICNcdThCQTFcdTUyMTJgO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQcmV2aWV3VGFza3MocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgdGFza3M6IFBsYW5UYXNrW10pOiB2b2lkIHtcbiAgcGFyZW50LmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBsYWJlbCB9KTtcbiAgaWYgKCF0YXNrcy5sZW5ndGgpIHsgcGFyZW50LmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiTm9uZVwiIH0pOyByZXR1cm47IH1cbiAgY29uc3QgbGlzdCA9IHBhcmVudC5jcmVhdGVFbChcInVsXCIpO1xuICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIGxpc3QuY3JlYXRlRWwoXCJsaVwiLCB7IHRleHQ6IGAke3Rhc2suc3RhcnRUaW1lIHx8IFwiXCJ9JHt0YXNrLmVuZFRpbWUgPyBgLSR7dGFzay5lbmRUaW1lfWAgOiBcIlwifSAke3Rhc2sudGl0bGV9ICgke3Rhc2suZXN0aW1hdGVkTWludXRlc30gbWluKWAudHJpbSgpIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVGb2xkZXIoYXBwOiBBcHAsIGZvbGRlcjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHBhcnRzID0gbm9ybWFsaXplUGF0aChmb2xkZXIpLnNwbGl0KFwiL1wiKS5maWx0ZXIoQm9vbGVhbik7XG4gIGZvciAobGV0IGkgPSAxOyBpIDw9IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgcGF0aCA9IHBhcnRzLnNsaWNlKDAsIGkpLmpvaW4oXCIvXCIpO1xuICAgIGlmICghYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKSkgYXdhaXQgYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihwYXRoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzYWZlRmlsZW5hbWUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgXCItXCIpLnRyaW0oKS5zbGljZSgwLCA4MCkgfHwgXCJBSVx1OEJBMVx1NTIxMlwiOyB9XG5mdW5jdGlvbiB5YW1sUXVvdGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7IH1cbmZ1bmN0aW9uIHRpbWVPZkRheShkYXRlOiBEYXRlKTogc3RyaW5nIHsgcmV0dXJuIGAke1N0cmluZyhkYXRlLmdldEhvdXJzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX06JHtTdHJpbmcoZGF0ZS5nZXRNaW51dGVzKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX1gOyB9XG5mdW5jdGlvbiBmb3JtYXREdXJhdGlvbihtaWxsaXNlY29uZHM6IG51bWJlcik6IHN0cmluZyB7IGNvbnN0IHRvdGFsID0gTWF0aC5jZWlsKG1pbGxpc2Vjb25kcyAvIDEwMDApOyByZXR1cm4gYCR7U3RyaW5nKE1hdGguZmxvb3IodG90YWwgLyA2MCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX06JHtTdHJpbmcodG90YWwgJSA2MCkucGFkU3RhcnQoMiwgXCIwXCIpfWA7IH1cbmZ1bmN0aW9uIGxvY2FsRGF0ZSgpOiBzdHJpbmcgeyBjb25zdCBub3cgPSBuZXcgRGF0ZSgpOyBjb25zdCBvZmZzZXQgPSBub3cuZ2V0VGltZXpvbmVPZmZzZXQoKSAqIDYwMDAwOyByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSAtIG9mZnNldCku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
