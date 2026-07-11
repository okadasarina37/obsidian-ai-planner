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
var MOBILE_MANUAL_TASK_EDITOR_VIEW = "ai-planner-mobile-manual-task-editor";
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
    this.addCommand({ id: "create-manual-plan", name: "\u65B0\u5EFA\u624B\u52A8\u8BA1\u5212 / Create manual plan", callback: () => void this.openManualTaskEditor() });
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
    this.registerView(MOBILE_MANUAL_TASK_EDITOR_VIEW, (leaf) => new MobileManualTaskEditorView(leaf, this));
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
    if (import_obsidian.Platform.isMobile) {
      void this.openManualTaskEditor(file);
      return;
    }
    new ManualTaskModal(this.app, this, file).open();
  }
  async openManualTaskEditor(file) {
    if (!import_obsidian.Platform.isMobile) {
      new ManualTaskModal(this.app, this, file).open();
      return;
    }
    const existing = this.app.workspace.getLeavesOfType(MOBILE_MANUAL_TASK_EDITOR_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: MOBILE_MANUAL_TASK_EDITOR_VIEW, active: true });
    const view = leaf.view;
    if (view instanceof MobileManualTaskEditorView) view.configure(file);
    this.app.workspace.revealLeaf(leaf);
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
    const manual = action.createEl("button", { text: "\u624B\u52A8\u9010\u6761\u586B\u5199 / Manual task form" });
    const generate = action.createEl("button", { text: "\u751F\u6210\u9884\u89C8 / Generate preview", cls: "mod-cta" });
    manual.addEventListener("click", () => void this.plugin.openManualTaskEditor());
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
var MobileManualTaskEditorView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  targetFile;
  mode = "study";
  date = localDate();
  planTitle = "";
  title = "";
  category = "";
  minutes = 30;
  startTime = "";
  endTime = "";
  description = "";
  getViewType() {
    return MOBILE_MANUAL_TASK_EDITOR_VIEW;
  }
  getDisplayText() {
    return "Manual plan";
  }
  getIcon() {
    return "list-plus";
  }
  async onOpen() {
    this.render();
  }
  configure(file) {
    this.targetFile = file;
    this.title = "";
    this.category = "";
    this.minutes = 30;
    this.startTime = "";
    this.endTime = "";
    this.description = "";
    if (!file) {
      this.mode = "study";
      this.date = localDate();
      this.planTitle = "";
    }
    this.render();
  }
  render() {
    this.contentEl.empty();
    this.contentEl.addClass("ai-planner-mobile-editor", "ai-planner-mobile-manual-editor");
    this.contentEl.createEl("h1", { text: this.targetFile ? "\u6DFB\u52A0\u8BA1\u5212\u4EFB\u52A1 / Add task" : "\u624B\u52A8\u521B\u5EFA\u8BA1\u5212 / Create manual plan" });
    const form = this.contentEl.createDiv({ cls: "ai-planner-mobile-form" });
    if (this.targetFile) {
      form.createEl("p", { cls: "ai-planner-manual-target", text: `\u6DFB\u52A0\u5230 / Add to: ${this.targetFile.basename}` });
    } else {
      const mode = this.field(form, "\u6A21\u5F0F / Mode").createEl("select");
      mode.createEl("option", { value: "study", text: "\u4F5C\u4E1A\u4E0E\u5B66\u4E60 / Homework & study" });
      mode.createEl("option", { value: "work", text: "\u5DE5\u4F5C / Work" });
      mode.value = this.mode;
      mode.addEventListener("change", () => this.mode = mode.value);
      const date = this.field(form, "\u8BA1\u5212\u65E5\u671F / Plan date").createEl("input", { type: "date" });
      date.value = this.date;
      date.addEventListener("input", () => this.date = date.value);
      const planTitle = this.field(form, "\u8BA1\u5212\u6807\u9898 / Plan title", "\u53EF\u9009\uFF0C\u4E0D\u586B\u5199\u5219\u81EA\u52A8\u547D\u540D\u3002 / Optional.").createEl("input", { type: "text" });
      planTitle.value = this.planTitle;
      planTitle.addEventListener("input", () => this.planTitle = planTitle.value);
    }
    const title = this.field(form, "\u4EFB\u52A1\u5185\u5BB9 / Task", "\u4E00\u6761\u8868\u5355\u53EA\u521B\u5EFA\u4E00\u9879\u4EFB\u52A1\u3002 / One task per form.").createEl("input", { type: "text" });
    title.value = this.title;
    title.placeholder = "\u4F8B\u5982\uFF1A\u5B8C\u6210\u6570\u5B66\u7EC3\u4E60\u518C\u7B2C 12-14 \u9875";
    title.addEventListener("input", () => this.title = title.value);
    const category = this.field(form, "\u5206\u7C7B / Category").createEl("input", { type: "text" });
    category.value = this.category;
    category.placeholder = "\u4F8B\u5982\uFF1A\u6570\u5B66 / \u9879\u76EE";
    category.addEventListener("input", () => this.category = category.value);
    const minutes = this.field(form, "\u9884\u8BA1\u65F6\u957F\uFF08\u5206\u949F\uFF09/ Estimated minutes").createEl("input", { type: "number" });
    minutes.min = "1";
    minutes.inputMode = "numeric";
    minutes.value = String(this.minutes);
    minutes.addEventListener("input", () => this.minutes = Math.max(1, Number(minutes.value) || 30));
    this.timeInput(this.field(form, "\u5F00\u59CB\u65F6\u95F4 / Start time", "\u53EF\u9009 / Optional."), this.startTime, (value) => this.startTime = value);
    this.timeInput(this.field(form, "\u7ED3\u675F\u65F6\u95F4 / End time", "\u53EF\u9009 / Optional."), this.endTime, (value) => this.endTime = value);
    const description = this.field(form, "\u5907\u6CE8 / Notes", "\u53EF\u586B\u5199\u9875\u7801\u3001\u622A\u6B62\u65F6\u95F4\u6216\u9650\u5236\u6761\u4EF6\u3002 / Optional.").createEl("textarea", { cls: "ai-planner-input" });
    description.rows = 3;
    description.value = this.description;
    description.addEventListener("input", () => this.description = description.value);
    const action = this.contentEl.createDiv({ cls: "ai-planner-mobile-actions ai-planner-mobile-single-action" });
    const submit = action.createEl("button", { text: this.targetFile ? "\u6DFB\u52A0\u8FD9\u6761\u4EFB\u52A1 / Add this task" : "\u521B\u5EFA\u8BA1\u5212 / Create plan", cls: "mod-cta" });
    submit.addEventListener("click", async () => {
      if (!this.title.trim()) return new import_obsidian.Notice("\u8BF7\u586B\u5199\u4EFB\u52A1\u5185\u5BB9 / Enter a task first.");
      submit.disabled = true;
      try {
        await this.plugin.addManualTask(this.targetFile, {
          title: this.title.trim(),
          category: this.category.trim(),
          estimatedMinutes: this.minutes,
          startTime: this.startTime,
          endTime: this.endTime,
          description: this.description.trim()
        }, this.mode, this.date, this.planTitle.trim());
        new import_obsidian.Notice(this.targetFile ? "\u5DF2\u6DFB\u52A0\u4EFB\u52A1\u5E76\u66F4\u65B0\u603B\u7ED3 / Task added and summary updated." : "\u624B\u52A8\u8BA1\u5212\u5DF2\u521B\u5EFA / Manual plan created.");
        this.title = "";
        this.category = "";
        this.minutes = 30;
        this.startTime = "";
        this.endTime = "";
        this.description = "";
        this.render();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Could not save the task.");
        submit.disabled = false;
      }
    });
  }
  field(parent, label, description) {
    const field = parent.createDiv({ cls: "ai-planner-mobile-field" });
    field.createEl("label", { text: label });
    if (description) field.createEl("small", { text: description });
    return field;
  }
  timeInput(parent, value, onChange) {
    const input = parent.createEl("input", { cls: "ai-planner-mobile-time", type: "time" });
    input.step = "60";
    input.value = value;
    input.addEventListener("input", () => onChange(input.value));
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgSXRlbVZpZXcsIE1vZGFsLCBOb3RpY2UsIFBsYXRmb3JtLCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIFRGaWxlLCBXb3Jrc3BhY2VMZWFmLCBub3JtYWxpemVQYXRoLCByZXF1ZXN0VXJsIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbnR5cGUgUGxhbk1vZGUgPSBcInN0dWR5XCIgfCBcIndvcmtcIjtcbnR5cGUgUHJvdmlkZXJJZCA9IFwiY3VzdG9tXCIgfCBcIm9wZW5haVwiIHwgXCJjbGF1ZGVcIiB8IFwiZGVlcHNlZWtcIiB8IFwiZ2xtXCIgfCBcImtpbWlcIiB8IFwiZ2VtaW5pXCI7XG50eXBlIEludGVyZmFjZUxhbmd1YWdlID0gXCJhdXRvXCIgfCBcInpoXCIgfCBcImVuXCI7XG5cbmNvbnN0IE1PQklMRV9QTEFOX0VESVRPUl9WSUVXID0gXCJhaS1wbGFubmVyLW1vYmlsZS1lZGl0b3JcIjtcbmNvbnN0IE1PQklMRV9NQU5VQUxfVEFTS19FRElUT1JfVklFVyA9IFwiYWktcGxhbm5lci1tb2JpbGUtbWFudWFsLXRhc2stZWRpdG9yXCI7XG5cbmludGVyZmFjZSBQbGFubmVyU2V0dGluZ3Mge1xuICBwcm92aWRlcjogUHJvdmlkZXJJZDtcbiAgaW50ZXJmYWNlTGFuZ3VhZ2U6IEludGVyZmFjZUxhbmd1YWdlO1xuICBhcGlCYXNlVXJsOiBzdHJpbmc7XG4gIGFwaUtleTogc3RyaW5nO1xuICBtb2RlbDogc3RyaW5nO1xuICBjdXN0b21IZWFkZXJzOiBzdHJpbmc7XG4gIHRlbXBlcmF0dXJlOiBudW1iZXI7XG4gIG1heFRva2VuczogbnVtYmVyO1xuICBoaXN0b3J5RGF5czogbnVtYmVyO1xuICBmb2N1c01pbnV0ZXM6IG51bWJlcjtcbiAgc3R1ZHlGb2xkZXI6IHN0cmluZztcbiAgd29ya0ZvbGRlcjogc3RyaW5nO1xuICBhY3RpdmVGb2N1cz86IEFjdGl2ZUZvY3VzU2Vzc2lvbjtcbiAgZm9jdXNNaW5pUG9zaXRpb24/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG59XG5cbmludGVyZmFjZSBBY3RpdmVGb2N1c1Nlc3Npb24ge1xuICBmaWxlUGF0aDogc3RyaW5nO1xuICB0YXNrSWQ6IHN0cmluZztcbiAgdGFza05hbWU6IHN0cmluZztcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgZHVyYXRpb25NczogbnVtYmVyO1xuICBmb2N1c2VkTXM6IG51bWJlcjtcbiAgcnVubmluZ0F0OiBudW1iZXIgfCBudWxsO1xuICBzdGFydGVkQXQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFBsYW5UYXNrIHtcbiAgdGl0bGU6IHN0cmluZztcbiAgY2F0ZWdvcnk/OiBzdHJpbmc7XG4gIHN0YXJ0VGltZT86IHN0cmluZztcbiAgZW5kVGltZT86IHN0cmluZztcbiAgZXN0aW1hdGVkTWludXRlczogbnVtYmVyO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFBsYW5SZXN1bHQge1xuICB0aXRsZTogc3RyaW5nO1xuICBzdW1tYXJ5Pzogc3RyaW5nO1xuICB0YXNrczogUGxhblRhc2tbXTtcbiAgcmV2aWV3VGFza3M/OiBQbGFuVGFza1tdO1xufVxuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBQbGFubmVyU2V0dGluZ3MgPSB7XG4gIHByb3ZpZGVyOiBcImN1c3RvbVwiLFxuICBpbnRlcmZhY2VMYW5ndWFnZTogXCJhdXRvXCIsXG4gIGFwaUJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MVwiLFxuICBhcGlLZXk6IFwiXCIsXG4gIG1vZGVsOiBcImdwdC00LjEtbWluaVwiLFxuICBjdXN0b21IZWFkZXJzOiBcInt9XCIsXG4gIHRlbXBlcmF0dXJlOiAwLjMsXG4gIG1heFRva2VuczogMTgwMCxcbiAgaGlzdG9yeURheXM6IDE0LFxuICBmb2N1c01pbnV0ZXM6IDI1LFxuICBzdHVkeUZvbGRlcjogXCIwNl9Ub2RvL1x1NUI2Nlx1NEU2MFwiLFxuICB3b3JrRm9sZGVyOiBcIjAxX1x1OTg3OVx1NzZFRS9cdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcIlxufTtcblxuY29uc3QgUFJPVklERVJTOiBSZWNvcmQ8UHJvdmlkZXJJZCwgeyBsYWJlbDogc3RyaW5nOyBiYXNlVXJsOiBzdHJpbmc7IG1vZGVsOiBzdHJpbmcgfT4gPSB7XG4gIGN1c3RvbTogeyBsYWJlbDogXCJDdXN0b20gT3BlbkFJLWNvbXBhdGlibGUgLyBcdTgxRUFcdTVCOUFcdTRFNDlcdTUxN0NcdTVCQjlcdTYzQTVcdTUzRTNcIiwgYmFzZVVybDogXCJcIiwgbW9kZWw6IFwiXCIgfSxcbiAgb3BlbmFpOiB7IGxhYmVsOiBcIk9wZW5BSVwiLCBiYXNlVXJsOiBcImh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjFcIiwgbW9kZWw6IFwiZ3B0LTQuMS1taW5pXCIgfSxcbiAgY2xhdWRlOiB7IGxhYmVsOiBcIkFudGhyb3BpYyBDbGF1ZGVcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5hbnRocm9waWMuY29tL3YxXCIsIG1vZGVsOiBcImNsYXVkZS1zb25uZXQtNC0yMDI1MDUxNFwiIH0sXG4gIGRlZXBzZWVrOiB7IGxhYmVsOiBcIkRlZXBTZWVrXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9hcGkuZGVlcHNlZWsuY29tL3YxXCIsIG1vZGVsOiBcImRlZXBzZWVrLWNoYXRcIiB9LFxuICBnbG06IHsgbGFiZWw6IFwiWmhpcHUgR0xNIC8gXHU2NjdBXHU4QzMxXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9vcGVuLmJpZ21vZGVsLmNuL2FwaS9wYWFzL3Y0XCIsIG1vZGVsOiBcImdsbS00LWZsYXNoXCIgfSxcbiAga2ltaTogeyBsYWJlbDogXCJLaW1pIC8gTW9vbnNob3RcIiwgYmFzZVVybDogXCJodHRwczovL2FwaS5tb29uc2hvdC5jbi92MVwiLCBtb2RlbDogXCJtb29uc2hvdC12MS04a1wiIH0sXG4gIGdlbWluaTogeyBsYWJlbDogXCJHb29nbGUgR2VtaW5pXCIsIGJhc2VVcmw6IFwiaHR0cHM6Ly9nZW5lcmF0aXZlbGFuZ3VhZ2UuZ29vZ2xlYXBpcy5jb20vdjFiZXRhXCIsIG1vZGVsOiBcImdlbWluaS0yLjAtZmxhc2hcIiB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiByZXF1ZXN0UGxhbkNvbXBsZXRpb24oXG4gIHNldHRpbmdzOiBQbGFubmVyU2V0dGluZ3MsXG4gIGJhc2VVcmw6IHN0cmluZyxcbiAgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPixcbiAgc3lzdGVtOiBzdHJpbmcsXG4gIHVzZXI6IHN0cmluZ1xuKTogUHJvbWlzZTxBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIHJlcXVlc3RVcmw+Pj4ge1xuICBpZiAoc2V0dGluZ3MucHJvdmlkZXIgPT09IFwiY2xhdWRlXCIpIHtcbiAgICBpZiAoc2V0dGluZ3MuYXBpS2V5KSBoZWFkZXJzW1wieC1hcGkta2V5XCJdID0gc2V0dGluZ3MuYXBpS2V5O1xuICAgIGhlYWRlcnNbXCJhbnRocm9waWMtdmVyc2lvblwiXSA/Pz0gXCIyMDIzLTA2LTAxXCI7XG4gICAgcmV0dXJuIHJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiBgJHtiYXNlVXJsfS9tZXNzYWdlc2AsIG1ldGhvZDogXCJQT1NUXCIsIGhlYWRlcnMsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiBzZXR0aW5ncy5tb2RlbCwgbWF4X3Rva2Vuczogc2V0dGluZ3MubWF4VG9rZW5zLCB0ZW1wZXJhdHVyZTogc2V0dGluZ3MudGVtcGVyYXR1cmUsIHN5c3RlbSwgbWVzc2FnZXM6IFt7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiB1c2VyIH1dIH0pLCB0aHJvdzogZmFsc2VcbiAgICB9KTtcbiAgfVxuICBpZiAoc2V0dGluZ3MucHJvdmlkZXIgPT09IFwiZ2VtaW5pXCIpIHtcbiAgICBjb25zdCBrZXkgPSBzZXR0aW5ncy5hcGlLZXkgPyBgP2tleT0ke2VuY29kZVVSSUNvbXBvbmVudChzZXR0aW5ncy5hcGlLZXkpfWAgOiBcIlwiO1xuICAgIHJldHVybiByZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogYCR7YmFzZVVybH0vbW9kZWxzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHNldHRpbmdzLm1vZGVsKX06Z2VuZXJhdGVDb250ZW50JHtrZXl9YCwgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3lzdGVtSW5zdHJ1Y3Rpb246IHsgcGFydHM6IFt7IHRleHQ6IHN5c3RlbSB9XSB9LCBjb250ZW50czogW3sgcm9sZTogXCJ1c2VyXCIsIHBhcnRzOiBbeyB0ZXh0OiB1c2VyIH1dIH1dLCBnZW5lcmF0aW9uQ29uZmlnOiB7IHRlbXBlcmF0dXJlOiBzZXR0aW5ncy50ZW1wZXJhdHVyZSwgbWF4T3V0cHV0VG9rZW5zOiBzZXR0aW5ncy5tYXhUb2tlbnMsIHJlc3BvbnNlTWltZVR5cGU6IFwiYXBwbGljYXRpb24vanNvblwiIH0gfSksIHRocm93OiBmYWxzZVxuICAgIH0pO1xuICB9XG4gIGlmIChzZXR0aW5ncy5hcGlLZXkpIGhlYWRlcnMuQXV0aG9yaXphdGlvbiA9IGBCZWFyZXIgJHtzZXR0aW5ncy5hcGlLZXl9YDtcbiAgcmV0dXJuIHJlcXVlc3RVcmwoe1xuICAgIHVybDogYCR7YmFzZVVybH0vY2hhdC9jb21wbGV0aW9uc2AsIG1ldGhvZDogXCJQT1NUXCIsIGhlYWRlcnMsXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogc2V0dGluZ3MubW9kZWwsIHRlbXBlcmF0dXJlOiBzZXR0aW5ncy50ZW1wZXJhdHVyZSwgbWF4X3Rva2Vuczogc2V0dGluZ3MubWF4VG9rZW5zLCBtZXNzYWdlczogW3sgcm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogc3lzdGVtIH0sIHsgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHVzZXIgfV0gfSksIHRocm93OiBmYWxzZVxuICB9KTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGlvblRleHQocHJvdmlkZXI6IFByb3ZpZGVySWQsIHJlc3BvbnNlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QganNvbiA9IHJlc3BvbnNlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBpZiAocHJvdmlkZXIgPT09IFwiY2xhdWRlXCIpIHtcbiAgICBjb25zdCBjb250ZW50ID0ganNvbi5jb250ZW50IGFzIEFycmF5PHsgdHlwZT86IHN0cmluZzsgdGV4dD86IHN0cmluZyB9PiB8IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gY29udGVudD8uZmlsdGVyKHBhcnQgPT4gcGFydC50eXBlID09PSBcInRleHRcIikubWFwKHBhcnQgPT4gcGFydC50ZXh0ID8/IFwiXCIpLmpvaW4oXCJcIik7XG4gIH1cbiAgaWYgKHByb3ZpZGVyID09PSBcImdlbWluaVwiKSB7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IGpzb24uY2FuZGlkYXRlcyBhcyBBcnJheTx7IGNvbnRlbnQ/OiB7IHBhcnRzPzogQXJyYXk8eyB0ZXh0Pzogc3RyaW5nIH0+IH0gfT4gfCB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIGNhbmRpZGF0ZXM/LlswXT8uY29udGVudD8ucGFydHM/Lm1hcChwYXJ0ID0+IHBhcnQudGV4dCA/PyBcIlwiKS5qb2luKFwiXCIpO1xuICB9XG4gIGNvbnN0IGNob2ljZXMgPSBqc29uLmNob2ljZXMgYXMgQXJyYXk8eyBtZXNzYWdlPzogeyBjb250ZW50Pzogc3RyaW5nIH0gfT4gfCB1bmRlZmluZWQ7XG4gIHJldHVybiBjaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEFJUGxhbm5lclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHBsdWdpblNldHRpbmdzITogUGxhbm5lclNldHRpbmdzO1xuICBwcml2YXRlIGZvY3VzU3RhdHVzRWwhOiBIVE1MRWxlbWVudDtcbiAgcHJpdmF0ZSBmb2N1c01pbmlFbCE6IEhUTUxCdXR0b25FbGVtZW50O1xuICBwcml2YXRlIGZpbmlzaGluZ0ZvY3VzID0gZmFsc2U7XG4gIHByaXZhdGUgZm9jdXNUaW1lck9wZW4gPSBmYWxzZTtcbiAgcHJpdmF0ZSBtaW5pRHJhZ2dpbmcgPSBmYWxzZTtcbiAgcHJpdmF0ZSBtaW5pTW92ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBtaW5pU3RhcnRYID0gMDtcbiAgcHJpdmF0ZSBtaW5pU3RhcnRZID0gMDtcbiAgcHJpdmF0ZSBtaW5pU3RhcnRMZWZ0ID0gMDtcbiAgcHJpdmF0ZSBtaW5pU3RhcnRUb3AgPSAwO1xuXG4gIGFzeW5jIG9ubG9hZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnBsdWdpblNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IEFJUGxhbm5lclNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiY3JlYXRlLWFpLXBsYW5cIixcbiAgICAgIG5hbWU6IFwiQ3JlYXRlIEFJIHBsYW5cIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB2b2lkIHRoaXMub3BlblBsYW5FZGl0b3IoKVxuICAgIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcInN0YXJ0LWZvY3VzLXNlc3Npb25cIiwgbmFtZTogXCJTdGFydCBmb2N1cyBzZXNzaW9uXCIsIGNhbGxiYWNrOiAoKSA9PiB0aGlzLm9wZW5Gb2N1c0ZvckFjdGl2ZU5vdGUoKSB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJyZXN1bWUtZm9jdXMtc2Vzc2lvblwiLCBuYW1lOiBcIlJlc3VtZSBmb2N1cyBzZXNzaW9uXCIsIGNhbGxiYWNrOiAoKSA9PiB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCkgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwiY3JlYXRlLW1hbnVhbC1wbGFuXCIsIG5hbWU6IFwiXHU2NUIwXHU1RUZBXHU2MjRCXHU1MkE4XHU4QkExXHU1MjEyIC8gQ3JlYXRlIG1hbnVhbCBwbGFuXCIsIGNhbGxiYWNrOiAoKSA9PiB2b2lkIHRoaXMub3Blbk1hbnVhbFRhc2tFZGl0b3IoKSB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJhZGQtdGFzay10by1jdXJyZW50LXBsYW5cIiwgbmFtZTogXCJcdTU0MTFcdTVGNTNcdTUyNERcdThCQTFcdTUyMTJcdTZERkJcdTUyQTBcdTRFRkJcdTUyQTEgLyBBZGQgdGFzayB0byBjdXJyZW50IHBsYW5cIiwgY2FsbGJhY2s6ICgpID0+IHRoaXMub3Blbk1hbnVhbFRhc2tGb3JBY3RpdmVOb3RlKCkgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwicmVmcmVzaC1wbGFuLXN1bW1hcnlcIiwgbmFtZTogXCJcdTUyMzdcdTY1QjBcdTVGNTNcdTUyNERcdThCQTFcdTUyMTJcdTYwM0JcdTdFRDMgLyBSZWZyZXNoIGN1cnJlbnQgcGxhbiBzdW1tYXJ5XCIsIGNhbGxiYWNrOiAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5Rm9yQWN0aXZlTm90ZSgpIH0pO1xuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImNhbGVuZGFyLXBsdXNcIiwgXCJDcmVhdGUgQUkgcGxhblwiLCAoKSA9PiB2b2lkIHRoaXMub3BlblBsYW5FZGl0b3IoKSk7XG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwidGltZXJcIiwgXCJTdGFydCBmb2N1cyBzZXNzaW9uXCIsICgpID0+IHRoaXMub3BlbkZvY3VzRm9yQWN0aXZlTm90ZSgpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuYWRkQ2xhc3MoXCJhaS1wbGFubmVyLWZvY3VzLXN0YXR1c1wiKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c1N0YXR1c0VsLCBcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZXN0b3JlRm9jdXNUaW1lcigpKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsID0gdGhpcy5hcHAud29ya3NwYWNlLmNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJhaS1wbGFubmVyLWZvY3VzLW1pbmlcIixcbiAgICAgIGF0dHI6IHsgdHlwZTogXCJidXR0b25cIiwgXCJhcmlhLWxhYmVsXCI6IFwiUmVzdG9yZSBmb2N1cyB0aW1lclwiIH1cbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJjbGlja1wiLCBldmVudCA9PiB7XG4gICAgICBpZiAodGhpcy5taW5pTW92ZWQpIHsgZXZlbnQucHJldmVudERlZmF1bHQoKTsgcmV0dXJuOyB9XG4gICAgICB2b2lkIHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICB9KTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQodGhpcy5mb2N1c01pbmlFbCwgXCJwb2ludGVyZG93blwiLCBldmVudCA9PiB0aGlzLmJlZ2luTWluaURyYWcoZXZlbnQpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInBvaW50ZXJtb3ZlXCIsIGV2ZW50ID0+IHRoaXMubW92ZU1pbmlEcmFnKGV2ZW50KSk7XG4gICAgdGhpcy5yZWdpc3RlckRvbUV2ZW50KHdpbmRvdywgXCJwb2ludGVydXBcIiwgKCkgPT4gdm9pZCB0aGlzLmVuZE1pbmlEcmFnKCkpO1xuICAgIHRoaXMucmVnaXN0ZXIoKCkgPT4gdGhpcy5mb2N1c01pbmlFbC5yZW1vdmUoKSk7XG4gICAgY29uc3QgdXBkYXRlVmlzaWJsZUhlaWdodCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWluKHdpbmRvdy52aXN1YWxWaWV3cG9ydD8uaGVpZ2h0ID8/IHdpbmRvdy5pbm5lckhlaWdodCwgd2luZG93LmlubmVySGVpZ2h0KTtcbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tYWktcGxhbm5lci12aXNpYmxlLWhlaWdodFwiLCBgJHtNYXRoLnJvdW5kKGhlaWdodCl9cHhgKTtcbiAgICB9O1xuICAgIHVwZGF0ZVZpc2libGVIZWlnaHQoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCBcInJlc2l6ZVwiLCB1cGRhdGVWaXNpYmxlSGVpZ2h0KTtcbiAgICBpZiAod2luZG93LnZpc3VhbFZpZXdwb3J0KSB7XG4gICAgICBjb25zdCB2aWV3cG9ydCA9IHdpbmRvdy52aXN1YWxWaWV3cG9ydDtcbiAgICAgIHZpZXdwb3J0LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCk7XG4gICAgICB0aGlzLnJlZ2lzdGVyKCgpID0+IHZpZXdwb3J0LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdXBkYXRlVmlzaWJsZUhlaWdodCkpO1xuICAgIH1cbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZG9jdW1lbnQsIFwiZm9jdXNpblwiLCBldmVudCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG4gICAgICBpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgIXRhcmdldC5tYXRjaGVzKFwiaW5wdXQsIHRleHRhcmVhLCBzZWxlY3RcIikpIHJldHVybjtcbiAgICAgIGlmICghdGFyZ2V0LmNsb3Nlc3QoXCIuYWktcGxhbm5lci1tb2RhbFwiKSkgcmV0dXJuO1xuICAgICAgdGhpcy5rZWVwRm9jdXNlZElucHV0VmlzaWJsZSh0YXJnZXQpO1xuICAgIH0pO1xuICAgIHRoaXMucmVnaXN0ZXJJbnRlcnZhbCh3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpLCA1MDApKTtcbiAgICB0aGlzLnJlZ2lzdGVyVmlldyhNT0JJTEVfUExBTl9FRElUT1JfVklFVywgbGVhZiA9PiBuZXcgTW9iaWxlUGxhbkVkaXRvclZpZXcobGVhZiwgdGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJWaWV3KE1PQklMRV9NQU5VQUxfVEFTS19FRElUT1JfVklFVywgbGVhZiA9PiBuZXcgTW9iaWxlTWFudWFsVGFza0VkaXRvclZpZXcobGVhZiwgdGhpcykpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEZvY3VzU3RhdHVzKCk7XG4gIH1cblxuICBhc3luYyBvcGVuUGxhbkVkaXRvcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIVBsYXRmb3JtLmlzTW9iaWxlKSB7XG4gICAgICBuZXcgUGxhbklucHV0TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKE1PQklMRV9QTEFOX0VESVRPUl9WSUVXKVswXTtcbiAgICBjb25zdCBsZWFmID0gZXhpc3RpbmcgPz8gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIik7XG4gICAgYXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoeyB0eXBlOiBNT0JJTEVfUExBTl9FRElUT1JfVklFVywgYWN0aXZlOiB0cnVlIH0pO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGxlYWYpO1xuICB9XG5cbiAgcHJpdmF0ZSBrZWVwRm9jdXNlZElucHV0VmlzaWJsZSh0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgY29uc3QgY29udGVudCA9IHRhcmdldC5jbG9zZXN0KFwiLm1vZGFsLWNvbnRlbnRcIikgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghY29udGVudCkgcmV0dXJuO1xuICAgIGNvbnN0IG1vdmUgPSAoKTogdm9pZCA9PiB7XG4gICAgICBjb25zdCB0YXJnZXRSZWN0ID0gdGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgY29udGVudFJlY3QgPSBjb250ZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgdGFyZ2V0VG9wID0gdGFyZ2V0UmVjdC50b3AgLSBjb250ZW50UmVjdC50b3AgKyBjb250ZW50LnNjcm9sbFRvcDtcbiAgICAgIGNvbnN0IGRlc2lyZWRUb3AgPSBNYXRoLm1heCgyNCwgTWF0aC5yb3VuZChjb250ZW50LmNsaWVudEhlaWdodCAqIDAuMikpO1xuICAgICAgY29udGVudC5zY3JvbGxUb3AgPSBNYXRoLm1heCgwLCB0YXJnZXRUb3AgLSBkZXNpcmVkVG9wKTtcbiAgICB9O1xuICAgIGZvciAoY29uc3QgZGVsYXkgb2YgWzAsIDE4MCwgNDIwLCA3NTBdKSB3aW5kb3cuc2V0VGltZW91dChtb3ZlLCBkZWxheSk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnBsdWdpblNldHRpbmdzKTtcbiAgfVxuXG4gIGdldEFjdGl2ZUZvY3VzKCk6IEFjdGl2ZUZvY3VzU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gIH1cblxuICBzZXRGb2N1c1RpbWVyT3BlbihvcGVuOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5mb2N1c1RpbWVyT3BlbiA9IG9wZW47XG4gICAgdm9pZCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICB9XG5cbiAgcHJpdmF0ZSBiZWdpbk1pbmlEcmFnKGV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSB0cnVlO1xuICAgIHRoaXMubWluaU1vdmVkID0gZmFsc2U7XG4gICAgdGhpcy5taW5pU3RhcnRYID0gZXZlbnQuY2xpZW50WDtcbiAgICB0aGlzLm1pbmlTdGFydFkgPSBldmVudC5jbGllbnRZO1xuICAgIHRoaXMubWluaVN0YXJ0TGVmdCA9IHJlY3QubGVmdDtcbiAgICB0aGlzLm1pbmlTdGFydFRvcCA9IHJlY3QudG9wO1xuICB9XG5cbiAgcHJpdmF0ZSBtb3ZlTWluaURyYWcoZXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5taW5pRHJhZ2dpbmcpIHJldHVybjtcbiAgICBjb25zdCBkeCA9IGV2ZW50LmNsaWVudFggLSB0aGlzLm1pbmlTdGFydFg7XG4gICAgY29uc3QgZHkgPSBldmVudC5jbGllbnRZIC0gdGhpcy5taW5pU3RhcnRZO1xuICAgIGlmICghdGhpcy5taW5pTW92ZWQgJiYgTWF0aC5oeXBvdChkeCwgZHkpIDwgNikgcmV0dXJuO1xuICAgIHRoaXMubWluaU1vdmVkID0gdHJ1ZTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IHJlY3QgPSB0aGlzLmZvY3VzTWluaUVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydExlZnQgKyBkeCksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCB0aGlzLm1pbmlTdGFydFRvcCArIGR5KSwgTWF0aC5tYXgoOCwgd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5oZWlnaHQgLSA4KSk7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUucmlnaHQgPSBcImF1dG9cIjtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmJvdHRvbSA9IFwiYXV0b1wiO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbmRNaW5pRHJhZygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMubWluaURyYWdnaW5nKSByZXR1cm47XG4gICAgdGhpcy5taW5pRHJhZ2dpbmcgPSBmYWxzZTtcbiAgICBpZiAoIXRoaXMubWluaU1vdmVkKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgxLCB3aW5kb3cuaW5uZXJXaWR0aCAtIHJlY3Qud2lkdGgpO1xuICAgIGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KDEsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KTtcbiAgICB0aGlzLnBsdWdpblNldHRpbmdzLmZvY3VzTWluaVBvc2l0aW9uID0geyB4OiByZWN0LmxlZnQgLyB3aWR0aCwgeTogcmVjdC50b3AgLyBoZWlnaHQgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5taW5pTW92ZWQgPSBmYWxzZTsgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5TWluaVBvc2l0aW9uKCk6IHZvaWQge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5mb2N1c01pbmlQb3NpdGlvbjtcbiAgICBpZiAoIXBvc2l0aW9uKSByZXR1cm47XG4gICAgY29uc3QgcmVjdCA9IHRoaXMuZm9jdXNNaW5pRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3QgbGVmdCA9IE1hdGgubWluKE1hdGgubWF4KDgsIHBvc2l0aW9uLnggKiAod2luZG93LmlubmVyV2lkdGggLSByZWN0LndpZHRoKSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lcldpZHRoIC0gcmVjdC53aWR0aCAtIDgpKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1pbihNYXRoLm1heCg4LCBwb3NpdGlvbi55ICogKHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0KSksIE1hdGgubWF4KDgsIHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuaGVpZ2h0IC0gOCkpO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLnJpZ2h0ID0gXCJhdXRvXCI7XG4gICAgdGhpcy5mb2N1c01pbmlFbC5zdHlsZS5ib3R0b20gPSBcImF1dG9cIjtcbiAgfVxuXG4gIGFzeW5jIG9wZW5Gb2N1c0ZvckFjdGl2ZU5vdGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXMpIHtcbiAgICAgIGF3YWl0IHRoaXMucmVzdG9yZUZvY3VzVGltZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7IG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdThCQTFcdTUyMTJcdTdCMTRcdThCQjAgLyBPcGVuIGEgcGxhbiBub3RlIGZpcnN0LlwiKTsgcmV0dXJuOyB9XG4gICAgY29uc3QgdGFza3MgPSBleHRyYWN0Rm9jdXNUYXNrcyh0aGlzLmFwcCwgZmlsZSk7XG4gICAgaWYgKCF0YXNrcy5sZW5ndGgpIHsgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMFx1NkNBMVx1NjcwOVx1NTNFRlx1NEUxM1x1NkNFOFx1NzY4NFx1OEJBMVx1NTIxMlx1NEVGQlx1NTJBMSAvIE5vIHBsYW4gdGFza3MgZm91bmQuXCIpOyByZXR1cm47IH1cbiAgICBuZXcgRm9jdXNUYXNrUGlja2VyTW9kYWwodGhpcy5hcHAsIHRoaXMsIGZpbGUsIHRhc2tzKS5vcGVuKCk7XG4gIH1cblxuICBvcGVuTWFudWFsVGFza0ZvckFjdGl2ZU5vdGUoKTogdm9pZCB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7IG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkFcdThCQTFcdTUyMTJcdTdCMTRcdThCQjAgLyBPcGVuIGEgcGxhbiBub3RlIGZpcnN0LlwiKTsgcmV0dXJuOyB9XG4gICAgaWYgKFBsYXRmb3JtLmlzTW9iaWxlKSB7IHZvaWQgdGhpcy5vcGVuTWFudWFsVGFza0VkaXRvcihmaWxlKTsgcmV0dXJuOyB9XG4gICAgbmV3IE1hbnVhbFRhc2tNb2RhbCh0aGlzLmFwcCwgdGhpcywgZmlsZSkub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgb3Blbk1hbnVhbFRhc2tFZGl0b3IoZmlsZT86IFRGaWxlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFQbGF0Zm9ybS5pc01vYmlsZSkge1xuICAgICAgbmV3IE1hbnVhbFRhc2tNb2RhbCh0aGlzLmFwcCwgdGhpcywgZmlsZSkub3BlbigpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoTU9CSUxFX01BTlVBTF9UQVNLX0VESVRPUl9WSUVXKVswXTtcbiAgICBjb25zdCBsZWFmID0gZXhpc3RpbmcgPz8gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIik7XG4gICAgYXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoeyB0eXBlOiBNT0JJTEVfTUFOVUFMX1RBU0tfRURJVE9SX1ZJRVcsIGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICBjb25zdCB2aWV3ID0gbGVhZi52aWV3O1xuICAgIGlmICh2aWV3IGluc3RhbmNlb2YgTW9iaWxlTWFudWFsVGFza0VkaXRvclZpZXcpIHZpZXcuY29uZmlndXJlKGZpbGUpO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGxlYWYpO1xuICB9XG5cbiAgYXN5bmMgYWRkTWFudWFsVGFzayhmaWxlOiBURmlsZSB8IHVuZGVmaW5lZCwgdGFzazogUGxhblRhc2ssIG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW5UaXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBhd2FpdCB0aGlzLndyaXRlUGxhbihtb2RlLCBkYXRlLCB7IHRpdGxlOiBwbGFuVGl0bGUgfHwgKG1vZGUgPT09IFwic3R1ZHlcIiA/IFwiXHU2MjRCXHU1MkE4XHU1QjY2XHU0RTYwXHU4QkExXHU1MjEyXCIgOiBcIlx1NjI0Qlx1NTJBOFx1NURFNVx1NEY1Q1x1OEJBMVx1NTIxMlwiKSwgc3VtbWFyeTogXCJcdTYyNEJcdTUyQThcdTVFRkFcdTdBQ0JcdTMwMDJcdTYzRDJcdTRFRjZcdTRGMUFcdTY4MzlcdTYzNkVcdTRFRkJcdTUyQTFcdThCQjBcdTVGNTVcdTgxRUFcdTUyQThcdTY2RjRcdTY1QjBcdTYyNjdcdTg4NENcdTYwM0JcdTdFRDNcdTMwMDJcIiwgdGFza3M6IFt0YXNrXSwgcmV2aWV3VGFza3M6IFtdIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmbSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCBpZHMgPSBPYmplY3Qua2V5cyhmbSkuZmlsdGVyKGtleSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3Qoa2V5KSkubWFwKGtleSA9PiBOdW1iZXIoa2V5Lm1hdGNoKC9edGFzayhcXGQrKU5hbWUkLyk/LlsxXSA/PyAwKSk7XG4gICAgY29uc3QgbnVtYmVyID0gTWF0aC5tYXgoMCwgLi4uaWRzKSArIDE7XG4gICAgY29uc3QgaWQgPSBgdGFzayR7U3RyaW5nKG51bWJlcikucGFkU3RhcnQoMiwgXCIwXCIpfWA7XG4gICAgYXdhaXQgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvY2Vzc0Zyb250TWF0dGVyKGZpbGUsIGZyb250bWF0dGVyID0+IHtcbiAgICAgIGZyb250bWF0dGVyW2Ake2lkfU5hbWVgXSA9IHRhc2sudGl0bGU7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1DYXRlZ29yeWBdID0gdGFzay5jYXRlZ29yeSB8fCBcIlx1NTE3Nlx1NUI4M1wiO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID0gdGFzay5lc3RpbWF0ZWRNaW51dGVzO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9QWN0dWFsU3RhcnRgXSA9IFwiXCI7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1BY3R1YWxFbmRgXSA9IFwiXCI7XG4gICAgICBmcm9udG1hdHRlcltgJHtpZH1BY3R1YWxNaW51dGVzYF0gPSAwO1xuICAgICAgZnJvbnRtYXR0ZXJbYCR7aWR9Rm9jdXNTZXNzaW9uc2BdID0gMDtcbiAgICB9KTtcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBzZWN0aW9uID0gXCIjIyBcdTYyNEJcdTUyQThcdTg4NjVcdTUxNDVcIjtcbiAgICBjb25zdCBjYXJkID0gcmVuZGVyVGFzayh0YXNrLCBTdHJpbmcoZm0ucGxhbkRhdGUgPz8gbG9jYWxEYXRlKCkpLCBudW1iZXIpO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBjb250ZW50LmluY2x1ZGVzKHNlY3Rpb24pID8gYCR7Y29udGVudC50cmltRW5kKCl9XFxuXFxuJHtjYXJkfVxcbmAgOiBgJHtjb250ZW50LnRyaW1FbmQoKX1cXG5cXG4ke3NlY3Rpb259XFxuXFxuJHtjYXJkfVxcbmApO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5KGZpbGUpO1xuICAgIG5ldyBOb3RpY2UoXCJcdTVERjJcdTZERkJcdTUyQTBcdTRFRkJcdTUyQTFcdTVFNzZcdTY2RjRcdTY1QjBcdTYwM0JcdTdFRDMgLyBUYXNrIGFkZGVkIGFuZCBzdW1tYXJ5IHVwZGF0ZWQuXCIpO1xuICB9XG5cbiAgYXN5bmMgcmVmcmVzaFBsYW5TdW1tYXJ5Rm9yQWN0aXZlTm90ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICBpZiAoIWZpbGUpIHsgbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQVx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMCAvIE9wZW4gYSBwbGFuIG5vdGUgZmlyc3QuXCIpOyByZXR1cm47IH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hQbGFuU3VtbWFyeShmaWxlKTtcbiAgICBuZXcgTm90aWNlKFwiXHU1REYyXHU1MjM3XHU2NUIwXHU4QkExXHU1MjEyXHU2MDNCXHU3RUQzIC8gUGxhbiBzdW1tYXJ5IHJlZnJlc2hlZC5cIik7XG4gIH1cblxuICBhc3luYyByZWZyZXNoUGxhblN1bW1hcnkoZmlsZTogVEZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmbSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCB0YXNrS2V5cyA9IE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoa2V5ID0+IC9edGFza1xcZCtOYW1lJC8udGVzdChrZXkpKTtcbiAgICBpZiAoIXRhc2tLZXlzLmxlbmd0aCkgeyBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU3QjE0XHU4QkIwXHU2Q0ExXHU2NzA5IEFJIFBsYW5uZXIgXHU0RUZCXHU1MkExXHU1QjU3XHU2QkI1IC8gTm8gQUkgUGxhbm5lciB0YXNrcyBmb3VuZC5cIik7IHJldHVybjsgfVxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHRhc2tzID0gdGFza0tleXMubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICAgIHJldHVybiB7IGNhdGVnb3J5OiBTdHJpbmcoZm1bYCR7aWR9Q2F0ZWdvcnlgXSA/PyBcIlx1NTE3Nlx1NUI4M1wiKSwgcGxhbm5lZDogTnVtYmVyKGZtW2Ake2lkfUVzdGltYXRlZE1pbnV0ZXNgXSA/PyAwKSwgYWN0dWFsOiBOdW1iZXIoZm1bYCR7aWR9QWN0dWFsTWludXRlc2BdID8/IDApIHx8IGR1cmF0aW9uRnJvbVRpbWVzKGZtW2Ake2lkfUFjdHVhbFN0YXJ0YF0sIGZtW2Ake2lkfUFjdHVhbEVuZGBdKSwgc2Vzc2lvbnM6IE51bWJlcihmbVtgJHtpZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgfTtcbiAgICB9KTtcbiAgICBjb25zdCBwbGFubmVkID0gdGFza3MucmVkdWNlKChzdW0sIHRhc2spID0+IHN1bSArIHRhc2sucGxhbm5lZCwgMCk7XG4gICAgY29uc3QgYWN0dWFsID0gdGFza3MucmVkdWNlKChzdW0sIHRhc2spID0+IHN1bSArIHRhc2suYWN0dWFsLCAwKTtcbiAgICBjb25zdCBzZXNzaW9ucyA9IHRhc2tzLnJlZHVjZSgoc3VtLCB0YXNrKSA9PiBzdW0gKyB0YXNrLnNlc3Npb25zLCAwKTtcbiAgICBjb25zdCBjb21wbGV0ZWQgPSAoY29udGVudC5tYXRjaCgvXi0gXFxbeFxcXS4qI1x1OEJBMVx1NTIxMi9pbSkgPz8gW10pLmxlbmd0aDtcbiAgICBjb25zdCBjYXRlZ29yaWVzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIGNhdGVnb3JpZXMuc2V0KHRhc2suY2F0ZWdvcnksIChjYXRlZ29yaWVzLmdldCh0YXNrLmNhdGVnb3J5KSA/PyAwKSArIHRhc2sucGxhbm5lZCk7XG4gICAgY29uc3QgYWxsb2NhdGlvbiA9IFsuLi5jYXRlZ29yaWVzLmVudHJpZXMoKV0ubWFwKChbbmFtZSwgbWludXRlc10pID0+IGAke25hbWV9ICR7bWludXRlc30gXHU1MjA2XHU5NDlGYCkuam9pbihcIlx1RkYxQlwiKSB8fCBcIlx1NjY4Mlx1NjVFMFwiO1xuICAgIGNvbnN0IHZhcmlhbmNlID0gYWN0dWFsID4gMCA/IGAke2FjdHVhbCA+PSBwbGFubmVkID8gXCIrXCIgOiBcIlwifSR7YWN0dWFsIC0gcGxhbm5lZH0gXHU1MjA2XHU5NDlGYCA6IFwiXHU1Rjg1XHU4QkIwXHU1RjU1XCI7XG4gICAgY29uc3Qgc3VtbWFyeSA9IGA8IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpTVEFSVCAtLT5cXG4+IFshc3VtbWFyeV0gXHU2MjY3XHU4ODRDXHU2MDNCXHU3RUQzIC8gRXhlY3V0aW9uIHN1bW1hcnlcXG4+IC0gXHU0RUZCXHU1MkExXHVGRjFBJHt0YXNrcy5sZW5ndGh9IFx1OTg3OVx1RkYxQlx1NURGMlx1NTJGRVx1OTAwOVx1RkYxQSR7TWF0aC5taW4oY29tcGxldGVkLCB0YXNrcy5sZW5ndGgpfSBcdTk4NzlcdUZGMUJcdTRFMTNcdTZDRThcdTZCMjFcdTY1NzBcdUZGMUEke3Nlc3Npb25zfSBcdTZCMjFcdTMwMDJcXG4+IC0gXHU2NUY2XHU5NUY0XHVGRjFBXHU5ODg0XHU4QkExICR7cGxhbm5lZH0gXHU1MjA2XHU5NDlGXHVGRjFCXHU1REYyXHU4QkIwXHU1RjU1XHU1QjlFXHU5NjQ1ICR7YWN0dWFsIHx8IFwiXHU1Rjg1XHU4QkIwXHU1RjU1XCJ9JHthY3R1YWwgPyBcIiBcdTUyMDZcdTk0OUZcIiA6IFwiXCJ9XHVGRjFCXHU1MDRGXHU1REVFXHVGRjFBJHt2YXJpYW5jZX1cdTMwMDJcXG4+IC0gXHU1MjA2XHU3QzdCXHU5ODg0XHU4QkExXHU1MjA2XHU5MTREXHVGRjFBJHthbGxvY2F0aW9ufVx1MzAwMlxcbj4gLSBcdThCRjRcdTY2MEVcdUZGMUFcdTRFRTVcdTRFMEFcdTRFQzVcdTU3RkFcdTRFOEVcdTRFRkJcdTUyQTFcdTVCNTdcdTZCQjVcdTMwMDFcdTUyRkVcdTkwMDlcdTcyQjZcdTYwMDFcdTU0OENcdTRFMTNcdTZDRThcdThCQjBcdTVGNTVcdThCQTFcdTdCOTdcdTMwMDJcXG48IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpFTkQgLS0+YDtcbiAgICBjb25zdCBwYXR0ZXJuID0gLzwhLS0gQUktUExBTk5FUi1TVU1NQVJZOlNUQVJUIC0tPltcXHNcXFNdKj88IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpFTkQgLS0+LztcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgcGF0dGVybi50ZXN0KGNvbnRlbnQpID8gY29udGVudC5yZXBsYWNlKHBhdHRlcm4sIHN1bW1hcnkpIDogYCR7Y29udGVudC50cmltRW5kKCl9XFxuXFxuJHtzdW1tYXJ5fVxcbmApO1xuICB9XG5cbiAgYXN5bmMgc3RhcnRGb2N1cyhmaWxlOiBURmlsZSwgdGFzazogRm9jdXNUYXNrLCBtaW51dGVzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cykge1xuICAgICAgbmV3IE5vdGljZShcIlx1NURGMlx1NjcwOVx1OEZEQlx1ODg0Q1x1NEUyRFx1NzY4NFx1NEUxM1x1NkNFOCAvIEEgZm9jdXMgc2Vzc2lvbiBpcyBhbHJlYWR5IGFjdGl2ZS5cIik7XG4gICAgICBhd2FpdCB0aGlzLnJlc3RvcmVGb2N1c1RpbWVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cyA9IHtcbiAgICAgIGZpbGVQYXRoOiBmaWxlLnBhdGgsXG4gICAgICB0YXNrSWQ6IHRhc2suaWQsXG4gICAgICB0YXNrTmFtZTogdGFzay5uYW1lLFxuICAgICAgY2F0ZWdvcnk6IHRhc2suY2F0ZWdvcnksXG4gICAgICBkdXJhdGlvbk1zOiBNYXRoLm1heCgxLCBtaW51dGVzKSAqIDYwMDAwLFxuICAgICAgZm9jdXNlZE1zOiAwLFxuICAgICAgcnVubmluZ0F0OiBzdGFydGVkQXQsXG4gICAgICBzdGFydGVkQXRcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Rhc2suaWR9QWN0dWFsU3RhcnRgXSA/Pz0gdGltZU9mRGF5KG5ldyBEYXRlKHN0YXJ0ZWRBdCkpO1xuICAgICAgfSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU2NUUwXHU2Q0Q1XHU3QUNCXHU1MzczXHU1MTk5XHU1MTY1XHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0XHVGRjBDXHU1QzA2XHU1NzI4XHU3RUQzXHU2NzVGXHU2NUY2XHU5MUNEXHU4QkQ1IC8gQ291bGQgbm90IHdyaXRlIHRoZSBzdGFydCB0aW1lIHlldDsgaXQgd2lsbCByZXRyeSBvbiBmaW5pc2guXCIpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHRvZ2dsZUZvY3VzUGF1c2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luU2V0dGluZ3MuYWN0aXZlRm9jdXM7XG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XG4gICAgaWYgKHNlc3Npb24ucnVubmluZ0F0ICE9PSBudWxsKSB7XG4gICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgc2Vzc2lvbi5ydW5uaW5nQXQgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IERhdGUubm93KCk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoRm9jdXNTdGF0dXMoKTtcbiAgfVxuXG4gIGFzeW5jIHJlc3RvcmVGb2N1c1RpbWVyKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoc2Vzc2lvbi5maWxlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NjI3RVx1NEUwRFx1NTIzMFx1NTM5Rlx1OEJBMVx1NTIxMlx1N0IxNFx1OEJCMFx1RkYwQ1x1NjVFMFx1NkNENVx1NUI4Q1x1NjIxMFx1NTZERVx1NTE5OSAvIFRoZSBwbGFuIG5vdGUgaXMgbWlzc2luZy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ldyBGb2N1c1RpbWVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIGZpbmlzaEZvY3VzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzO1xuICAgIGlmICghc2Vzc2lvbiB8fCB0aGlzLmZpbmlzaGluZ0ZvY3VzKSByZXR1cm47XG4gICAgdGhpcy5maW5pc2hpbmdGb2N1cyA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCkge1xuICAgICAgICBzZXNzaW9uLmZvY3VzZWRNcyArPSBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc2Vzc2lvbi5ydW5uaW5nQXQpO1xuICAgICAgICBzZXNzaW9uLnJ1bm5pbmdBdCA9IG51bGw7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICB9XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHNlc3Npb24uZmlsZVBhdGgpO1xuICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgICBuZXcgTm90aWNlKFwiXHU2MjdFXHU0RTBEXHU1MjMwXHU1MzlGXHU4QkExXHU1MjEyXHU3QjE0XHU4QkIwXHVGRjBDXHU0RTEzXHU2Q0U4XHU4QkIwXHU1RjU1XHU2NjgyXHU2NzJBXHU1MTk5XHU1MTY1IC8gUGxhbiBub3RlIG1pc3Npbmc7IGZvY3VzIHJlY29yZCB3YXMga2VwdC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdHVhbE1pbnV0ZXMgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHNlc3Npb24uZm9jdXNlZE1zIC8gNjAwMDApKTtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCBmbSA9PiB7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbFN0YXJ0YF0gPz89IHRpbWVPZkRheShuZXcgRGF0ZShzZXNzaW9uLnN0YXJ0ZWRBdCkpO1xuICAgICAgICBmbVtgJHtzZXNzaW9uLnRhc2tJZH1BY3R1YWxFbmRgXSA9IHRpbWVPZkRheShuZXcgRGF0ZSgpKTtcbiAgICAgICAgZm1bYCR7c2Vzc2lvbi50YXNrSWR9QWN0dWFsTWludXRlc2BdID0gTnVtYmVyKGZtW2Ake3Nlc3Npb24udGFza0lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSArIGFjdHVhbE1pbnV0ZXM7XG4gICAgICAgIGZtW2Ake3Nlc3Npb24udGFza0lkfUZvY3VzU2Vzc2lvbnNgXSA9IE51bWJlcihmbVtgJHtzZXNzaW9uLnRhc2tJZH1Gb2N1c1Nlc3Npb25zYF0gPz8gMCkgKyAxO1xuICAgICAgfSk7XG4gICAgICB0aGlzLnBsdWdpblNldHRpbmdzLmFjdGl2ZUZvY3VzID0gdW5kZWZpbmVkO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgIG5ldyBOb3RpY2UoYFx1NURGMlx1OEJCMFx1NUY1NSAke2FjdHVhbE1pbnV0ZXN9IFx1NTIwNlx1OTQ5Rlx1NEUxM1x1NkNFOCAvIEZvY3VzIHJlY29yZGVkLmApO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmZpbmlzaGluZ0ZvY3VzID0gZmFsc2U7XG4gICAgICBhd2FpdCB0aGlzLnJlZnJlc2hGb2N1c1N0YXR1cygpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hGb2N1c1N0YXR1cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hY3RpdmVGb2N1cztcbiAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgIHRoaXMuZm9jdXNTdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIHRoaXMuZm9jdXNNaW5pRWwuc3R5bGUuZGlzcGxheSA9IHRoaXMuZm9jdXNUaW1lck9wZW4gPyBcIm5vbmVcIiA6IFwiXCI7XG4gICAgY29uc3QgZWxhcHNlZCA9IHNlc3Npb24uZm9jdXNlZE1zICsgKHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gMCA6IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSBzZXNzaW9uLnJ1bm5pbmdBdCkpO1xuICAgIGlmIChzZXNzaW9uLnJ1bm5pbmdBdCAhPT0gbnVsbCAmJiBlbGFwc2VkID49IHNlc3Npb24uZHVyYXRpb25Ncykge1xuICAgICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldFRleHQoYEZvY3VzIGNvbXBsZXRlIFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTVCOENcdTYyMTAgLyBGb2N1cyBjb21wbGV0ZVwiKTtcbiAgICAgIHZvaWQgdGhpcy5maW5pc2hGb2N1cygpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ZSA9IHNlc3Npb24ucnVubmluZ0F0ID09PSBudWxsID8gXCJGb2N1cyBwYXVzZWRcIiA6IGZvcm1hdER1cmF0aW9uKE1hdGgubWF4KDAsIHNlc3Npb24uZHVyYXRpb25NcyAtIGVsYXBzZWQpKTtcbiAgICB0aGlzLmZvY3VzU3RhdHVzRWwuc2V0VGV4dChgJHtzdGF0ZX0gXHUwMEI3ICR7c2Vzc2lvbi50YXNrTmFtZX1gKTtcbiAgICB0aGlzLmZvY3VzTWluaUVsLnNldFRleHQoYCR7c3RhdGV9IFx1MDBCNyAke3Nlc3Npb24udGFza05hbWV9YCk7XG4gICAgdGhpcy5mb2N1c1N0YXR1c0VsLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCJSZXN0b3JlIGZvY3VzIHRpbWVyXCIpO1xuICAgIGlmICghdGhpcy5mb2N1c1RpbWVyT3Blbikgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmFwcGx5TWluaVBvc2l0aW9uKCkpO1xuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHN0YXJ0VGltZTogc3RyaW5nLCBlbmRUaW1lOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcpOiBQcm9taXNlPFBsYW5SZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMucGx1Z2luU2V0dGluZ3MuYXBpQmFzZVVybCB8fCAhdGhpcy5wbHVnaW5TZXR0aW5ncy5tb2RlbCkgdGhyb3cgbmV3IEVycm9yKFwiUGxlYXNlIGNvbmZpZ3VyZSBhbiBBUEkgYmFzZSBVUkwgYW5kIG1vZGVsIGZpcnN0LlwiKTtcbiAgICBsZXQgY3VzdG9tSGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIHRyeSB7XG4gICAgICBjdXN0b21IZWFkZXJzID0gSlNPTi5wYXJzZSh0aGlzLnBsdWdpblNldHRpbmdzLmN1c3RvbUhlYWRlcnMgfHwgXCJ7fVwiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkN1c3RvbSBoZWFkZXJzIG11c3QgYmUgdmFsaWQgSlNPTi5cIik7XG4gICAgfVxuICAgIGNvbnN0IHN5c3RlbSA9IG1vZGUgPT09IFwic3R1ZHlcIlxuICAgICAgPyBcIllvdSBjcmVhdGUgcHJhY3RpY2FsIHNhbWUtZGF5IGhvbWV3b3JrIHBsYW5zIGZvciBhIGNoaWxkLiBCcmVhayB0YXNrcyBpbnRvIGEgc2Vuc2libGUgb3JkZXIsIGluY2x1ZGUgc2hvcnQgYnJlYWtzIHdoZW4gaGVscGZ1bCwgYW5kIG9ubHkgYWRkIHJldmlldyB0YXNrcyBncm91bmRlZCBpbiB0aGUgZ2l2ZW4gaG9tZXdvcmsuXCJcbiAgICAgIDogXCJZb3UgY3JlYXRlIHByYWN0aWNhbCBzYW1lLWRheSB3b3JrIHBsYW5zLiBQcmlvcml0aXplIGJ5IHVyZ2VuY3kgYW5kIGNvZ25pdGl2ZSBsb2FkLCBpbmNsdWRlIGJ1ZmZlcnMsIGFuZCBkbyBub3QgaW52ZW50IHdvcmsgaXRlbXMuXCI7XG4gICAgY29uc3QgZm9sZGVyID0gbW9kZSA9PT0gXCJzdHVkeVwiID8gdGhpcy5wbHVnaW5TZXR0aW5ncy5zdHVkeUZvbGRlciA6IHRoaXMucGx1Z2luU2V0dGluZ3Mud29ya0ZvbGRlcjtcbiAgICBjb25zdCBoaXN0b3J5ID0gYnVpbGRIaXN0b3J5Q29udGV4dCh0aGlzLmFwcCwgZm9sZGVyLCB0aGlzLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzKTtcbiAgICBjb25zdCB1c2VyID0gYFBsYW4gZGF0ZTogJHtkYXRlfVxcblN0YXJ0IHRpbWU6ICR7c3RhcnRUaW1lIHx8IFwibm90IHNwZWNpZmllZFwifVxcbkxhdGVzdCBmaW5pc2g6ICR7ZW5kVGltZSB8fCBcIm5vdCBzcGVjaWZpZWRcIn1cXG5JdGVtczpcXG4ke2lucHV0fVxcblxcbkhpc3RvcmljYWwgdGltaW5nIGNhbGlicmF0aW9uOlxcbiR7aGlzdG9yeX1cXG5cXG5Vc2UgdGhlIGNhbGlicmF0aW9uIG9ubHkgd2hlbiBpdCBoYXMgYXQgbGVhc3QgdHdvIGNvbXBhcmFibGUgcmVjb3Jkcy4gUmV0dXJuIEpTT04gb25seSwgd2l0aCB0aGlzIHNoYXBlOiB7XCJ0aXRsZVwiOlwic2hvcnQgdGl0bGVcIixcInN1bW1hcnlcIjpcIm9uZSBzZW50ZW5jZVwiLFwidGFza3NcIjpbe1widGl0bGVcIjpcInRhc2tcIixcImNhdGVnb3J5XCI6XCJzdWJqZWN0IG9yIHByb2plY3RcIixcInN0YXJ0VGltZVwiOlwiSEg6bW1cIixcImVuZFRpbWVcIjpcIkhIOm1tXCIsXCJlc3RpbWF0ZWRNaW51dGVzXCI6MzAsXCJkZXNjcmlwdGlvblwiOlwib3B0aW9uYWxcIn1dLFwicmV2aWV3VGFza3NcIjpbc2FtZSB0YXNrIHNoYXBlXX0uIFVzZSBbXSBmb3IgcmV2aWV3VGFza3Mgd2hlbiBub25lIGFyZSBqdXN0aWZpZWQuYDtcbiAgICBjb25zdCBiYXNlVXJsID0gdGhpcy5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiwgLi4uY3VzdG9tSGVhZGVycyB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFBsYW5Db21wbGV0aW9uKHRoaXMucGx1Z2luU2V0dGluZ3MsIGJhc2VVcmwsIGhlYWRlcnMsIHN5c3RlbSwgdXNlcik7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA8IDIwMCB8fCByZXNwb25zZS5zdGF0dXMgPj0gMzAwKSB0aHJvdyBuZXcgRXJyb3IoYEFQSSByZXF1ZXN0IGZhaWxlZCAoJHtyZXNwb25zZS5zdGF0dXN9KTogJHtyZXNwb25zZS50ZXh0LnNsaWNlKDAsIDMwMCl9YCk7XG4gICAgY29uc3QgY29udGVudCA9IGNvbXBsZXRpb25UZXh0KHRoaXMucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIsIHJlc3BvbnNlLmpzb24pO1xuICAgIGlmICh0eXBlb2YgY29udGVudCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHByb3ZpZGVyIGRpZCBub3QgcmV0dXJuIGEgY2hhdCBjb21wbGV0aW9uLlwiKTtcbiAgICByZXR1cm4gcGFyc2VQbGFuKGNvbnRlbnQpO1xuICB9XG5cbiAgYXN5bmMgd3JpdGVQbGFuKG1vZGU6IFBsYW5Nb2RlLCBkYXRlOiBzdHJpbmcsIHBsYW46IFBsYW5SZXN1bHQpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGZvbGRlciA9IG1vZGUgPT09IFwic3R1ZHlcIiA/IHRoaXMucGx1Z2luU2V0dGluZ3Muc3R1ZHlGb2xkZXIgOiB0aGlzLnBsdWdpblNldHRpbmdzLndvcmtGb2xkZXI7XG4gICAgYXdhaXQgZW5zdXJlRm9sZGVyKHRoaXMuYXBwLCBmb2xkZXIpO1xuICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7ZGF0ZX0tJHtzYWZlRmlsZW5hbWUocGxhbi50aXRsZSB8fCAobW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcIiA6IFwiXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXCIpKX0ubWRgO1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKGAke2ZvbGRlcn0vJHtmaWxlbmFtZX1gKTtcbiAgICBjb25zdCBjb250ZW50ID0gcmVuZGVyUGxhbihtb2RlLCBkYXRlLCBwbGFuKTtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcbiAgICBjb25zdCBmaWxlID0gZXhpc3RpbmcgaW5zdGFuY2VvZiBURmlsZSA/IGV4aXN0aW5nIDogYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHBhdGgsIGNvbnRlbnQpO1xuICAgIGlmIChleGlzdGluZyBpbnN0YW5jZW9mIFRGaWxlKSBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmcsIGNvbnRlbnQpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaFBsYW5TdW1tYXJ5KGZpbGUpO1xuICAgIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5vcGVuTGlua1RleHQocGF0aCwgXCJcIiwgdHJ1ZSk7XG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cbn1cblxuaW50ZXJmYWNlIEZvY3VzVGFzayB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgY2F0ZWdvcnk6IHN0cmluZzsgZXN0aW1hdGVkTWludXRlczogbnVtYmVyOyB9XG5cbmZ1bmN0aW9uIGV4dHJhY3RGb2N1c1Rhc2tzKGFwcDogQXBwLCBmaWxlOiBURmlsZSk6IEZvY3VzVGFza1tdIHtcbiAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICByZXR1cm4gT2JqZWN0LmtleXMoZm0pLmZpbHRlcihrZXkgPT4gL150YXNrXFxkK05hbWUkLy50ZXN0KGtleSkpLnNvcnQoKS5tYXAoa2V5ID0+IHtcbiAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICByZXR1cm4geyBpZCwgbmFtZTogU3RyaW5nKGZtW2tleV0gPz8gaWQpLCBjYXRlZ29yeTogU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gXCJcIiksIGVzdGltYXRlZE1pbnV0ZXM6IE51bWJlcihmbVtgJHtpZH1Fc3RpbWF0ZWRNaW51dGVzYF0gPz8gMCkgfTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkSGlzdG9yeUNvbnRleHQoYXBwOiBBcHAsIGZvbGRlcjogc3RyaW5nLCBkYXlzOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBjdXRvZmYgPSBEYXRlLm5vdygpIC0gZGF5cyAqIDg2NDAwMDAwO1xuICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBwbGFubmVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyOyBjb3VudDogbnVtYmVyIH0+KCk7XG4gIGZvciAoY29uc3QgZmlsZSBvZiBhcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpKSB7XG4gICAgaWYgKCFmaWxlLnBhdGguc3RhcnRzV2l0aChgJHtub3JtYWxpemVQYXRoKGZvbGRlcil9L2ApIHx8IGZpbGUuc3RhdC5tdGltZSA8IGN1dG9mZikgY29udGludWU7XG4gICAgY29uc3QgZm0gPSBhcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGZtKS5maWx0ZXIoaXRlbSA9PiAvXnRhc2tcXGQrTmFtZSQvLnRlc3QoaXRlbSkpKSB7XG4gICAgICBjb25zdCBpZCA9IGtleS5yZXBsYWNlKFwiTmFtZVwiLCBcIlwiKTtcbiAgICAgIGNvbnN0IHBsYW5uZWQgPSBOdW1iZXIoZm1bYCR7aWR9RXN0aW1hdGVkTWludXRlc2BdID8/IDApO1xuICAgICAgY29uc3QgYWN0dWFsID0gTnVtYmVyKGZtW2Ake2lkfUFjdHVhbE1pbnV0ZXNgXSA/PyAwKSB8fCBkdXJhdGlvbkZyb21UaW1lcyhmbVtgJHtpZH1BY3R1YWxTdGFydGBdLCBmbVtgJHtpZH1BY3R1YWxFbmRgXSk7XG4gICAgICBpZiAocGxhbm5lZCA8PSAwIHx8IGFjdHVhbCA8PSAwKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGNhdGVnb3J5ID0gU3RyaW5nKGZtW2Ake2lkfUNhdGVnb3J5YF0gPz8gU3RyaW5nKGZtW2tleV0pLnNwbGl0KFwiXHUwMEI3XCIpWzBdID8/IFwiXHU1MTc2XHU1QjgzXCIpLnRyaW0oKSB8fCBcIlx1NTE3Nlx1NUI4M1wiO1xuICAgICAgY29uc3QgaXRlbSA9IGdyb3Vwcy5nZXQoY2F0ZWdvcnkpID8/IHsgcGxhbm5lZDogMCwgYWN0dWFsOiAwLCBjb3VudDogMCB9O1xuICAgICAgaXRlbS5wbGFubmVkICs9IHBsYW5uZWQ7IGl0ZW0uYWN0dWFsICs9IGFjdHVhbDsgaXRlbS5jb3VudCArPSAxOyBncm91cHMuc2V0KGNhdGVnb3J5LCBpdGVtKTtcbiAgICB9XG4gIH1cbiAgY29uc3QgbGluZXMgPSBbLi4uZ3JvdXBzLmVudHJpZXMoKV0uZmlsdGVyKChbLCB2YWx1ZV0pID0+IHZhbHVlLmNvdW50ID49IDIpLnNvcnQoKGEsIGIpID0+IGJbMV0uY291bnQgLSBhWzFdLmNvdW50KS5zbGljZSgwLCA2KS5tYXAoKFtjYXRlZ29yeSwgdmFsdWVdKSA9PiB7XG4gICAgY29uc3QgcGVyY2VudCA9IE1hdGgucm91bmQoKHZhbHVlLmFjdHVhbCAvIHZhbHVlLnBsYW5uZWQgLSAxKSAqIDEwMCk7XG4gICAgcmV0dXJuIGAke2NhdGVnb3J5fTogJHt2YWx1ZS5jb3VudH0gcmVjb3JkcywgcGxhbm5lZCAke3ZhbHVlLnBsYW5uZWR9IG1pbiwgYWN0dWFsICR7dmFsdWUuYWN0dWFsfSBtaW4sIGRldmlhdGlvbiAke3BlcmNlbnQgPj0gMCA/IFwiK1wiIDogXCJcIn0ke3BlcmNlbnR9JWA7XG4gIH0pO1xuICByZXR1cm4gbGluZXMubGVuZ3RoID8gbGluZXMuam9pbihcIlxcblwiKSA6IFwiTm8gcmVsaWFibGUgaGlzdG9yaWNhbCByZWNvcmRzIHlldC4gVXNlIHJlYXNvbmFibGUgZXN0aW1hdGVzIGFuZCBhIHNtYWxsIGJ1ZmZlci5cIjtcbn1cblxuZnVuY3Rpb24gZHVyYXRpb25Gcm9tVGltZXMoc3RhcnQ6IHVua25vd24sIGVuZDogdW5rbm93bik6IG51bWJlciB7XG4gIGNvbnN0IHBhcnNlID0gKHZhbHVlOiB1bmtub3duKTogbnVtYmVyIHwgbnVsbCA9PiB7IGNvbnN0IG1hdGNoID0gU3RyaW5nKHZhbHVlID8/IFwiXCIpLm1hdGNoKC9eKFxcZHsxLDJ9KTooXFxkezJ9KSQvKTsgcmV0dXJuIG1hdGNoID8gTnVtYmVyKG1hdGNoWzFdKSAqIDYwICsgTnVtYmVyKG1hdGNoWzJdKSA6IG51bGw7IH07XG4gIGNvbnN0IGZyb20gPSBwYXJzZShzdGFydCksIHRvID0gcGFyc2UoZW5kKTtcbiAgcmV0dXJuIGZyb20gPT09IG51bGwgfHwgdG8gPT09IG51bGwgPyAwIDogKHRvID49IGZyb20gPyB0byAtIGZyb20gOiB0byArIDE0NDAgLSBmcm9tKTtcbn1cblxuY2xhc3MgRm9jdXNUYXNrUGlja2VyTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbWludXRlczogbnVtYmVyO1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbiwgcHJpdmF0ZSByZWFkb25seSBmaWxlOiBURmlsZSwgcHJpdmF0ZSByZWFkb25seSB0YXNrczogRm9jdXNUYXNrW10pIHsgc3VwZXIoYXBwKTsgdGhpcy5taW51dGVzID0gcGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlczsgfVxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIlx1NEUxM1x1NkNFOFx1NkEyMVx1NUYwRiAvIEZvY3VzIG1vZGVcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTRFMTNcdTZDRThcdTY1RjZcdTk1N0YgLyBGb2N1cyBkdXJhdGlvblwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93bi5hZGRPcHRpb24oXCIyNVwiLCBcIjI1IG1pblwiKS5hZGRPcHRpb24oXCI1MFwiLCBcIjUwIG1pblwiKS5hZGRPcHRpb24oXCI5MFwiLCBcIjkwIG1pblwiKS5zZXRWYWx1ZShTdHJpbmcodGhpcy5taW51dGVzKSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5taW51dGVzID0gTnVtYmVyKHZhbHVlKSkpO1xuICAgIGNvbnN0IGN1c3RvbSA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyB0eXBlOiBcIm51bWJlclwiLCBwbGFjZWhvbGRlcjogXCJDdXN0b20gbWludXRlcyAvIFx1ODFFQVx1NUI5QVx1NEU0OVx1NTIwNlx1OTQ5RlwiIH0pO1xuICAgIGN1c3RvbS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4geyBjb25zdCB2YWx1ZSA9IE51bWJlcihjdXN0b20udmFsdWUpOyBpZiAodmFsdWUgPiAwKSB0aGlzLm1pbnV0ZXMgPSB2YWx1ZTsgfSk7XG4gICAgdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiXHU5MDA5XHU2MkU5XHU0RUZCXHU1MkExIC8gQ2hvb3NlIGEgdGFza1wiIH0pO1xuICAgIGZvciAoY29uc3QgdGFzayBvZiB0aGlzLnRhc2tzKSB7XG4gICAgICBjb25zdCBidXR0b24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJhaS1wbGFubmVyLWZvY3VzLXRhc2tcIiB9KTtcbiAgICAgIGJ1dHRvbi5zZXRUZXh0KGAke3Rhc2suY2F0ZWdvcnkgPyBgJHt0YXNrLmNhdGVnb3J5fSBcdTAwQjcgYCA6IFwiXCJ9JHt0YXNrLm5hbWV9ICgke3Rhc2suZXN0aW1hdGVkTWludXRlcyB8fCBcIj9cIn0gbWluKWApO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7IHRoaXMuY2xvc2UoKTsgdm9pZCB0aGlzLnBsdWdpbi5zdGFydEZvY3VzKHRoaXMuZmlsZSwgdGFzaywgdGhpcy5taW51dGVzKTsgfSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIEZvY3VzVGltZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBpbnRlcnZhbDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucGx1Z2luLmdldEFjdGl2ZUZvY3VzKCk7XG4gICAgaWYgKCFzZXNzaW9uKSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgdGhpcy5wbHVnaW4uc2V0Rm9jdXNUaW1lck9wZW4odHJ1ZSk7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiLCBcImFpLXBsYW5uZXItZm9jdXMtdGltZXJcIik7XG4gICAgdGhpcy50aXRsZUVsLnNldFRleHQoXCJcdTRFMTNcdTZDRThcdTRFMkQgLyBGb2N1c2luZ1wiKTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBzZXNzaW9uLnRhc2tOYW1lLCBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy10aXRsZVwiIH0pO1xuICAgIGNvbnN0IGNsb2NrID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1jbG9ja1wiIH0pO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG4gICAgICB0ZXh0OiBcIlx1NTE3M1x1OTVFRFx1NkI2NFx1N0E5N1x1NTNFM1x1NTNFQVx1NEYxQVx1NjcwMFx1NUMwRlx1NTMxNlx1RkYwQ1x1OEJBMVx1NjVGNlx1NEYxQVx1NEZERFx1NzU1OVx1MzAwMlx1NjI0Qlx1NjczQVx1NTIwN1x1NjM2Mlx1NTIzMFx1NTE3Nlx1NUI4MyBBcHAgXHU1NDBFXHU2MzA5XHU3RUNGXHU4RkM3XHU3Njg0XHU1ODk5XHU0RTBBXHU2NUY2XHU5NUY0XHU0RjMwXHU3Qjk3XHVGRjFCaU9TIFx1NTNFRlx1ODBGRFx1NjY4Mlx1NTA1Q1x1NjIxNlx1NTZERVx1NjUzNiBPYnNpZGlhblx1RkYwQ1x1NTZFMFx1NkI2NFx1OEZEOVx1NEUwRFx1NEVFM1x1ODg2OFx1NURGMlx1OUE4Q1x1OEJDMVx1NzY4NFx1NEUxM1x1NkNFOFx1NjIxNlx1OTYwNVx1OEJGQlx1NjVGNlx1OTU3Rlx1MzAwMiAvIENsb3Npbmcgb25seSBtaW5pbWl6ZXMgdGhpcyB0aW1lci4gTW9iaWxlIGJhY2tncm91bmQgdGltZSBpcyBhIHdhbGwtY2xvY2sgZXN0aW1hdGU7IGlPUyBtYXkgc3VzcGVuZCBvciB0ZXJtaW5hdGUgT2JzaWRpYW4sIHNvIGl0IGlzIG5vdCB2ZXJpZmllZCBmb2N1cyBvciByZWFkaW5nIHRpbWUuXCIsXG4gICAgICBjbHM6IFwiYWktcGxhbm5lci1mb2N1cy1kaXNjbGFpbWVyXCJcbiAgICB9KTtcbiAgICBjb25zdCBhY3Rpb24gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibW9kYWwtYnV0dG9uLWNvbnRhaW5lclwiIH0pO1xuICAgIGNvbnN0IHBhdXNlID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTY2ODJcdTUwNUMgLyBQYXVzZVwiIH0pO1xuICAgIGNvbnN0IGZpbmlzaCA9IGFjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiXHU3RUQzXHU2NzVGIC8gRmluaXNoXCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgY29uc3QgcmVmcmVzaCA9ICgpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVGb2N1cygpO1xuICAgICAgaWYgKCFjdXJyZW50KSB7IHRoaXMuY2xvc2UoKTsgcmV0dXJuOyB9XG4gICAgICBjb25zdCBlbGFwc2VkID0gY3VycmVudC5mb2N1c2VkTXMgKyAoY3VycmVudC5ydW5uaW5nQXQgPT09IG51bGwgPyAwIDogTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIGN1cnJlbnQucnVubmluZ0F0KSk7XG4gICAgICBjb25zdCByZW1haW5pbmcgPSBNYXRoLm1heCgwLCBjdXJyZW50LmR1cmF0aW9uTXMgLSBlbGFwc2VkKTtcbiAgICAgIGNsb2NrLnNldFRleHQoZm9ybWF0RHVyYXRpb24ocmVtYWluaW5nKSk7XG4gICAgICBwYXVzZS5zZXRUZXh0KGN1cnJlbnQucnVubmluZ0F0ID09PSBudWxsID8gXCJcdTdFRTdcdTdFRUQgLyBSZXN1bWVcIiA6IFwiXHU2NjgyXHU1MDVDIC8gUGF1c2VcIik7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDApIHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKTtcbiAgICB9O1xuICAgIHBhdXNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucGx1Z2luLnRvZ2dsZUZvY3VzUGF1c2UoKS50aGVuKHJlZnJlc2gpKTtcbiAgICBmaW5pc2guYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5wbHVnaW4uZmluaXNoRm9jdXMoKS50aGVuKCgpID0+IHRoaXMuY2xvc2UoKSkpO1xuICAgIHRoaXMuaW50ZXJ2YWwgPSB3aW5kb3cuc2V0SW50ZXJ2YWwocmVmcmVzaCwgNTAwKTsgcmVmcmVzaCgpO1xuICB9XG4gIG9uQ2xvc2UoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaW50ZXJ2YWwgIT09IG51bGwpIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWwpO1xuICAgIHRoaXMucGx1Z2luLnNldEZvY3VzVGltZXJPcGVuKGZhbHNlKTtcbiAgfVxufVxuXG5jbGFzcyBNb2JpbGVQbGFuRWRpdG9yVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcbiAgcHJpdmF0ZSBtb2RlOiBQbGFuTW9kZSA9IFwic3R1ZHlcIjtcbiAgcHJpdmF0ZSBkYXRlID0gbG9jYWxEYXRlKCk7XG4gIHByaXZhdGUgc3RhcnRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBlbmRUaW1lID0gXCJcIjtcbiAgcHJpdmF0ZSBpbnB1dCA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IEFJUGxhbm5lclBsdWdpbikgeyBzdXBlcihsZWFmKTsgfVxuXG4gIGdldFZpZXdUeXBlKCk6IHN0cmluZyB7IHJldHVybiBNT0JJTEVfUExBTl9FRElUT1JfVklFVzsgfVxuICBnZXREaXNwbGF5VGV4dCgpOiBzdHJpbmcgeyByZXR1cm4gXCJBSSBQbGFubmVyXCI7IH1cbiAgZ2V0SWNvbigpOiBzdHJpbmcgeyByZXR1cm4gXCJjYWxlbmRhci1wbHVzXCI7IH1cblxuICBhc3luYyBvbk9wZW4oKTogUHJvbWlzZTx2b2lkPiB7IHRoaXMucmVuZGVyKCk7IH1cblxuICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIHRoaXMuY29udGVudEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2JpbGUtZWRpdG9yXCIpO1xuICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaDFcIiwgeyB0ZXh0OiBcIkFJIFBsYW5uZXIgLyBBSSBcdThCQTFcdTUyMTJcIiB9KTtcblxuICAgIGNvbnN0IGZvcm0gPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtZm9ybVwiIH0pO1xuICAgIGNvbnN0IG1vZGUgPSB0aGlzLmZpZWxkKGZvcm0sIFwiXHU2QTIxXHU1RjBGIC8gTW9kZVwiKS5jcmVhdGVFbChcInNlbGVjdFwiKTtcbiAgICBtb2RlLmNyZWF0ZUVsKFwib3B0aW9uXCIsIHsgdmFsdWU6IFwic3R1ZHlcIiwgdGV4dDogXCJcdTRGNUNcdTRFMUFcdTRFMEVcdTVCNjZcdTRFNjAgLyBIb21ld29yayAmIHN0dWR5XCIgfSk7XG4gICAgbW9kZS5jcmVhdGVFbChcIm9wdGlvblwiLCB7IHZhbHVlOiBcIndvcmtcIiwgdGV4dDogXCJcdTVERTVcdTRGNUMgLyBXb3JrXCIgfSk7XG4gICAgbW9kZS52YWx1ZSA9IHRoaXMubW9kZTtcbiAgICBtb2RlLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4gdGhpcy5tb2RlID0gbW9kZS52YWx1ZSBhcyBQbGFuTW9kZSk7XG5cbiAgICBjb25zdCBkYXRlID0gdGhpcy5maWVsZChmb3JtLCBcIlx1OEJBMVx1NTIxMlx1NjVFNVx1NjcxRiAvIFBsYW4gZGF0ZVwiKS5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJkYXRlXCIgfSk7XG4gICAgZGF0ZS52YWx1ZSA9IHRoaXMuZGF0ZTtcbiAgICBkYXRlLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLmRhdGUgPSBkYXRlLnZhbHVlKTtcblxuICAgIGNvbnN0IHN0YXJ0ID0gdGhpcy5jcmVhdGVNb2JpbGVUaW1lSW5wdXQodGhpcy5maWVsZChmb3JtLCBcIlx1NUYwMFx1NTlDQlx1NjVGNlx1OTVGNCAvIFN0YXJ0IHRpbWVcIiwgXCJcdTUzRUZcdTkwMDkgLyBPcHRpb25hbC5cIiksIHRoaXMuc3RhcnRUaW1lLCB2YWx1ZSA9PiB0aGlzLnN0YXJ0VGltZSA9IHZhbHVlKTtcbiAgICBjb25zdCBlbmQgPSB0aGlzLmNyZWF0ZU1vYmlsZVRpbWVJbnB1dCh0aGlzLmZpZWxkKGZvcm0sIFwiXHU2NzAwXHU2NjVBXHU3RUQzXHU2NzVGIC8gTGF0ZXN0IGZpbmlzaFwiLCBcIlx1NTNFRlx1OTAwOSAvIE9wdGlvbmFsLlwiKSwgdGhpcy5lbmRUaW1lLCB2YWx1ZSA9PiB0aGlzLmVuZFRpbWUgPSB2YWx1ZSk7XG5cbiAgICB0aGlzLmZpZWxkKGZvcm0sIFwiXHU0RUZCXHU1MkExXHU2MjE2XHU0RjVDXHU0RTFBIC8gVGFza3Mgb3IgaG9tZXdvcmtcIiwgXCJcdTU4NkJcdTUxOTlcdTc5RDFcdTc2RUUvXHU5ODc5XHU3NkVFXHUzMDAxXHU0RUZCXHU1MkExXHU5MUNGXHUzMDAxXHU2MjJBXHU2QjYyXHU2NUY2XHU5NUY0XHU1NDhDXHU5NjUwXHU1MjM2XHU2NzYxXHU0RUY2XHUzMDAyXCIpO1xuICAgIGNvbnN0IHNvdXJjZUJhciA9IGZvcm0uY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItc291cmNlXCIgfSk7XG4gICAgY29uc3Qgc291cmNlTGFiZWwgPSBzb3VyY2VCYXIuY3JlYXRlU3Bhbih7IHRleHQ6IFwiXHU2NzY1XHU2RTkwIC8gU291cmNlOiBcdTYyNEJcdTUyQThcdThGOTNcdTUxNjUgLyBtYW51YWwgaW5wdXRcIiB9KTtcbiAgICBjb25zdCB1c2VBY3RpdmUgPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NEY3Rlx1NzUyOFx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMCAvIFVzZSBjdXJyZW50IG5vdGVcIiB9KTtcbiAgICBjb25zdCBjaG9vc2UgPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiIH0pO1xuICAgIGNvbnN0IGFyZWEgPSBmb3JtLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1pbnB1dFwiIH0pO1xuICAgIGFyZWEucm93cyA9IDk7XG4gICAgYXJlYS52YWx1ZSA9IHRoaXMuaW5wdXQ7XG4gICAgYXJlYS5wbGFjZWhvbGRlciA9IFwiRXhhbXBsZTogTWF0aCB3b3JrYm9vayBwYWdlcyAxMi0xNDsgbWVtb3JpemUgMjAgRW5nbGlzaCB3b3JkczsgQ2hpbmVzZSByZWFkaW5nIGFsb3VkLlwiO1xuICAgIGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHRoaXMuaW5wdXQgPSBhcmVhLnZhbHVlKTtcbiAgICBjb25zdCBsb2FkU291cmNlID0gYXN5bmMgKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgIHRoaXMuaW5wdXQgPSBjb250ZW50O1xuICAgICAgYXJlYS52YWx1ZSA9IGNvbnRlbnQ7XG4gICAgICBzb3VyY2VMYWJlbC5zZXRUZXh0KGBcdTY3NjVcdTZFOTAgLyBTb3VyY2U6ICR7ZmlsZS5wYXRofWApO1xuICAgIH07XG4gICAgdXNlQWN0aXZlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgIGlmICghZmlsZSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1NTE0OFx1NjI1M1x1NUYwMFx1NEUwMFx1NEUyQSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBPcGVuIGEgTWFya2Rvd24gbm90ZSBmaXJzdC5cIik7XG4gICAgICB0cnkgeyBhd2FpdCBsb2FkU291cmNlKGZpbGUpOyB9IGNhdGNoIHsgbmV3IE5vdGljZShcIkNvdWxkIG5vdCByZWFkIHRoZSBjdXJyZW50IG5vdGUuXCIpOyB9XG4gICAgfSk7XG4gICAgY2hvb3NlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiBuZXcgTWFya2Rvd25GaWxlUGlja2VyTW9kYWwodGhpcy5hcHAsIGFzeW5jIGZpbGUgPT4ge1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShmaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGF0IG5vdGUuXCIpOyB9XG4gICAgfSkub3BlbigpKTtcblxuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLW1vYmlsZS1hY3Rpb25zXCIgfSk7XG4gICAgY29uc3QgbWFudWFsID0gYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJcdTYyNEJcdTUyQThcdTkwMTBcdTY3NjFcdTU4NkJcdTUxOTkgLyBNYW51YWwgdGFzayBmb3JtXCIgfSk7XG4gICAgY29uc3QgZ2VuZXJhdGUgPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBtYW51YWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5wbHVnaW4ub3Blbk1hbnVhbFRhc2tFZGl0b3IoKSk7XG4gICAgZ2VuZXJhdGUuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5pbnB1dC50cmltKCkpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU4MUYzXHU1QzExXHU1ODZCXHU1MTk5XHU0RTAwXHU5ODc5XHU0RUZCXHU1MkExIC8gRW50ZXIgYXQgbGVhc3Qgb25lIHRhc2sgZmlyc3QuXCIpO1xuICAgICAgZ2VuZXJhdGUuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgZ2VuZXJhdGUuc2V0VGV4dChcIlx1NkI2M1x1NTcyOFx1NzUxRlx1NjIxMCAvIEdlbmVyYXRpbmcuLi5cIik7XG4gICAgICBhcmVhLmJsdXIoKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBsYW4gPSBhd2FpdCB0aGlzLnBsdWdpbi5nZW5lcmF0ZVBsYW4odGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMuc3RhcnRUaW1lLCB0aGlzLmVuZFRpbWUsIHRoaXMuaW5wdXQpO1xuICAgICAgICBuZXcgUGxhblByZXZpZXdNb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIHRoaXMubW9kZSwgdGhpcy5kYXRlLCBwbGFuKS5vcGVuKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJDb3VsZCBub3QgZ2VuZXJhdGUgcGxhbi5cIik7XG4gICAgICAgIGdlbmVyYXRlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGdlbmVyYXRlLnNldFRleHQoXCJcdTc1MUZcdTYyMTBcdTk4ODRcdTg5QzggLyBHZW5lcmF0ZSBwcmV2aWV3XCIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBmaWVsZChwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBmaWVsZCA9IHBhcmVudC5jcmVhdGVEaXYoeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtZmllbGRcIiB9KTtcbiAgICBmaWVsZC5jcmVhdGVFbChcImxhYmVsXCIsIHsgdGV4dDogbGFiZWwgfSk7XG4gICAgaWYgKGRlc2NyaXB0aW9uKSBmaWVsZC5jcmVhdGVFbChcInNtYWxsXCIsIHsgdGV4dDogZGVzY3JpcHRpb24gfSk7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVNb2JpbGVUaW1lSW5wdXQocGFyZW50OiBIVE1MRWxlbWVudCwgdmFsdWU6IHN0cmluZywgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKTogSFRNTElucHV0RWxlbWVudCB7XG4gICAgY29uc3QgaW5wdXQgPSBwYXJlbnQuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IGNsczogXCJhaS1wbGFubmVyLW1vYmlsZS10aW1lXCIsIHR5cGU6IFwidGltZVwiIH0pO1xuICAgIGlucHV0LnN0ZXAgPSBcIjYwXCI7XG4gICAgaW5wdXQudmFsdWUgPSB2YWx1ZTtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gb25DaGFuZ2UoaW5wdXQudmFsdWUpKTtcbiAgICByZXR1cm4gaW5wdXQ7XG4gIH1cbn1cblxuY2xhc3MgTW9iaWxlTWFudWFsVGFza0VkaXRvclZpZXcgZXh0ZW5kcyBJdGVtVmlldyB7XG4gIHByaXZhdGUgdGFyZ2V0RmlsZT86IFRGaWxlO1xuICBwcml2YXRlIG1vZGU6IFBsYW5Nb2RlID0gXCJzdHVkeVwiO1xuICBwcml2YXRlIGRhdGUgPSBsb2NhbERhdGUoKTtcbiAgcHJpdmF0ZSBwbGFuVGl0bGUgPSBcIlwiO1xuICBwcml2YXRlIHRpdGxlID0gXCJcIjtcbiAgcHJpdmF0ZSBjYXRlZ29yeSA9IFwiXCI7XG4gIHByaXZhdGUgbWludXRlcyA9IDMwO1xuICBwcml2YXRlIHN0YXJ0VGltZSA9IFwiXCI7XG4gIHByaXZhdGUgZW5kVGltZSA9IFwiXCI7XG4gIHByaXZhdGUgZGVzY3JpcHRpb24gPSBcIlwiO1xuXG4gIGNvbnN0cnVjdG9yKGxlYWY6IFdvcmtzcGFjZUxlYWYsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4pIHsgc3VwZXIobGVhZik7IH1cblxuICBnZXRWaWV3VHlwZSgpOiBzdHJpbmcgeyByZXR1cm4gTU9CSUxFX01BTlVBTF9UQVNLX0VESVRPUl9WSUVXOyB9XG4gIGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7IHJldHVybiBcIk1hbnVhbCBwbGFuXCI7IH1cbiAgZ2V0SWNvbigpOiBzdHJpbmcgeyByZXR1cm4gXCJsaXN0LXBsdXNcIjsgfVxuXG4gIGFzeW5jIG9uT3BlbigpOiBQcm9taXNlPHZvaWQ+IHsgdGhpcy5yZW5kZXIoKTsgfVxuXG4gIGNvbmZpZ3VyZShmaWxlPzogVEZpbGUpOiB2b2lkIHtcbiAgICB0aGlzLnRhcmdldEZpbGUgPSBmaWxlO1xuICAgIHRoaXMudGl0bGUgPSBcIlwiO1xuICAgIHRoaXMuY2F0ZWdvcnkgPSBcIlwiO1xuICAgIHRoaXMubWludXRlcyA9IDMwO1xuICAgIHRoaXMuc3RhcnRUaW1lID0gXCJcIjtcbiAgICB0aGlzLmVuZFRpbWUgPSBcIlwiO1xuICAgIHRoaXMuZGVzY3JpcHRpb24gPSBcIlwiO1xuICAgIGlmICghZmlsZSkge1xuICAgICAgdGhpcy5tb2RlID0gXCJzdHVkeVwiO1xuICAgICAgdGhpcy5kYXRlID0gbG9jYWxEYXRlKCk7XG4gICAgICB0aGlzLnBsYW5UaXRsZSA9IFwiXCI7XG4gICAgfVxuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIHRoaXMuY29udGVudEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2JpbGUtZWRpdG9yXCIsIFwiYWktcGxhbm5lci1tb2JpbGUtbWFudWFsLWVkaXRvclwiKTtcbiAgICB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImgxXCIsIHsgdGV4dDogdGhpcy50YXJnZXRGaWxlID8gXCJcdTZERkJcdTUyQTBcdThCQTFcdTUyMTJcdTRFRkJcdTUyQTEgLyBBZGQgdGFza1wiIDogXCJcdTYyNEJcdTUyQThcdTUyMUJcdTVFRkFcdThCQTFcdTUyMTIgLyBDcmVhdGUgbWFudWFsIHBsYW5cIiB9KTtcbiAgICBjb25zdCBmb3JtID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItbW9iaWxlLWZvcm1cIiB9KTtcblxuICAgIGlmICh0aGlzLnRhcmdldEZpbGUpIHtcbiAgICAgIGZvcm0uY3JlYXRlRWwoXCJwXCIsIHsgY2xzOiBcImFpLXBsYW5uZXItbWFudWFsLXRhcmdldFwiLCB0ZXh0OiBgXHU2REZCXHU1MkEwXHU1MjMwIC8gQWRkIHRvOiAke3RoaXMudGFyZ2V0RmlsZS5iYXNlbmFtZX1gIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBtb2RlID0gdGhpcy5maWVsZChmb3JtLCBcIlx1NkEyMVx1NUYwRiAvIE1vZGVcIikuY3JlYXRlRWwoXCJzZWxlY3RcIik7XG4gICAgICBtb2RlLmNyZWF0ZUVsKFwib3B0aW9uXCIsIHsgdmFsdWU6IFwic3R1ZHlcIiwgdGV4dDogXCJcdTRGNUNcdTRFMUFcdTRFMEVcdTVCNjZcdTRFNjAgLyBIb21ld29yayAmIHN0dWR5XCIgfSk7XG4gICAgICBtb2RlLmNyZWF0ZUVsKFwib3B0aW9uXCIsIHsgdmFsdWU6IFwid29ya1wiLCB0ZXh0OiBcIlx1NURFNVx1NEY1QyAvIFdvcmtcIiB9KTtcbiAgICAgIG1vZGUudmFsdWUgPSB0aGlzLm1vZGU7XG4gICAgICBtb2RlLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4gdGhpcy5tb2RlID0gbW9kZS52YWx1ZSBhcyBQbGFuTW9kZSk7XG4gICAgICBjb25zdCBkYXRlID0gdGhpcy5maWVsZChmb3JtLCBcIlx1OEJBMVx1NTIxMlx1NjVFNVx1NjcxRiAvIFBsYW4gZGF0ZVwiKS5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJkYXRlXCIgfSk7XG4gICAgICBkYXRlLnZhbHVlID0gdGhpcy5kYXRlO1xuICAgICAgZGF0ZS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gdGhpcy5kYXRlID0gZGF0ZS52YWx1ZSk7XG4gICAgICBjb25zdCBwbGFuVGl0bGUgPSB0aGlzLmZpZWxkKGZvcm0sIFwiXHU4QkExXHU1MjEyXHU2ODA3XHU5ODk4IC8gUGxhbiB0aXRsZVwiLCBcIlx1NTNFRlx1OTAwOVx1RkYwQ1x1NEUwRFx1NTg2Qlx1NTE5OVx1NTIxOVx1ODFFQVx1NTJBOFx1NTQ3RFx1NTQwRFx1MzAwMiAvIE9wdGlvbmFsLlwiKS5jcmVhdGVFbChcImlucHV0XCIsIHsgdHlwZTogXCJ0ZXh0XCIgfSk7XG4gICAgICBwbGFuVGl0bGUudmFsdWUgPSB0aGlzLnBsYW5UaXRsZTtcbiAgICAgIHBsYW5UaXRsZS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gdGhpcy5wbGFuVGl0bGUgPSBwbGFuVGl0bGUudmFsdWUpO1xuICAgIH1cblxuICAgIGNvbnN0IHRpdGxlID0gdGhpcy5maWVsZChmb3JtLCBcIlx1NEVGQlx1NTJBMVx1NTE4NVx1NUJCOSAvIFRhc2tcIiwgXCJcdTRFMDBcdTY3NjFcdTg4NjhcdTUzNTVcdTUzRUFcdTUyMUJcdTVFRkFcdTRFMDBcdTk4NzlcdTRFRkJcdTUyQTFcdTMwMDIgLyBPbmUgdGFzayBwZXIgZm9ybS5cIikuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IHR5cGU6IFwidGV4dFwiIH0pO1xuICAgIHRpdGxlLnZhbHVlID0gdGhpcy50aXRsZTtcbiAgICB0aXRsZS5wbGFjZWhvbGRlciA9IFwiXHU0RjhCXHU1OTgyXHVGRjFBXHU1QjhDXHU2MjEwXHU2NTcwXHU1QjY2XHU3RUMzXHU0RTYwXHU1MThDXHU3QjJDIDEyLTE0IFx1OTg3NVwiO1xuICAgIHRpdGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLnRpdGxlID0gdGl0bGUudmFsdWUpO1xuXG4gICAgY29uc3QgY2F0ZWdvcnkgPSB0aGlzLmZpZWxkKGZvcm0sIFwiXHU1MjA2XHU3QzdCIC8gQ2F0ZWdvcnlcIikuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IHR5cGU6IFwidGV4dFwiIH0pO1xuICAgIGNhdGVnb3J5LnZhbHVlID0gdGhpcy5jYXRlZ29yeTtcbiAgICBjYXRlZ29yeS5wbGFjZWhvbGRlciA9IFwiXHU0RjhCXHU1OTgyXHVGRjFBXHU2NTcwXHU1QjY2IC8gXHU5ODc5XHU3NkVFXCI7XG4gICAgY2F0ZWdvcnkuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHRoaXMuY2F0ZWdvcnkgPSBjYXRlZ29yeS52YWx1ZSk7XG5cbiAgICBjb25zdCBtaW51dGVzID0gdGhpcy5maWVsZChmb3JtLCBcIlx1OTg4NFx1OEJBMVx1NjVGNlx1OTU3Rlx1RkYwOFx1NTIwNlx1OTQ5Rlx1RkYwOS8gRXN0aW1hdGVkIG1pbnV0ZXNcIikuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IHR5cGU6IFwibnVtYmVyXCIgfSk7XG4gICAgbWludXRlcy5taW4gPSBcIjFcIjtcbiAgICBtaW51dGVzLmlucHV0TW9kZSA9IFwibnVtZXJpY1wiO1xuICAgIG1pbnV0ZXMudmFsdWUgPSBTdHJpbmcodGhpcy5taW51dGVzKTtcbiAgICBtaW51dGVzLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLm1pbnV0ZXMgPSBNYXRoLm1heCgxLCBOdW1iZXIobWludXRlcy52YWx1ZSkgfHwgMzApKTtcblxuICAgIHRoaXMudGltZUlucHV0KHRoaXMuZmllbGQoZm9ybSwgXCJcdTVGMDBcdTU5Q0JcdTY1RjZcdTk1RjQgLyBTdGFydCB0aW1lXCIsIFwiXHU1M0VGXHU5MDA5IC8gT3B0aW9uYWwuXCIpLCB0aGlzLnN0YXJ0VGltZSwgdmFsdWUgPT4gdGhpcy5zdGFydFRpbWUgPSB2YWx1ZSk7XG4gICAgdGhpcy50aW1lSW5wdXQodGhpcy5maWVsZChmb3JtLCBcIlx1N0VEM1x1Njc1Rlx1NjVGNlx1OTVGNCAvIEVuZCB0aW1lXCIsIFwiXHU1M0VGXHU5MDA5IC8gT3B0aW9uYWwuXCIpLCB0aGlzLmVuZFRpbWUsIHZhbHVlID0+IHRoaXMuZW5kVGltZSA9IHZhbHVlKTtcblxuICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5maWVsZChmb3JtLCBcIlx1NTkwN1x1NkNFOCAvIE5vdGVzXCIsIFwiXHU1M0VGXHU1ODZCXHU1MTk5XHU5ODc1XHU3ODAxXHUzMDAxXHU2MjJBXHU2QjYyXHU2NUY2XHU5NUY0XHU2MjE2XHU5NjUwXHU1MjM2XHU2NzYxXHU0RUY2XHUzMDAyIC8gT3B0aW9uYWwuXCIpLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1pbnB1dFwiIH0pO1xuICAgIGRlc2NyaXB0aW9uLnJvd3MgPSAzO1xuICAgIGRlc2NyaXB0aW9uLnZhbHVlID0gdGhpcy5kZXNjcmlwdGlvbjtcbiAgICBkZXNjcmlwdGlvbi5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4gdGhpcy5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uLnZhbHVlKTtcblxuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJhaS1wbGFubmVyLW1vYmlsZS1hY3Rpb25zIGFpLXBsYW5uZXItbW9iaWxlLXNpbmdsZS1hY3Rpb25cIiB9KTtcbiAgICBjb25zdCBzdWJtaXQgPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiB0aGlzLnRhcmdldEZpbGUgPyBcIlx1NkRGQlx1NTJBMFx1OEZEOVx1Njc2MVx1NEVGQlx1NTJBMSAvIEFkZCB0aGlzIHRhc2tcIiA6IFwiXHU1MjFCXHU1RUZBXHU4QkExXHU1MjEyIC8gQ3JlYXRlIHBsYW5cIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBzdWJtaXQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy50aXRsZS50cmltKCkpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU1ODZCXHU1MTk5XHU0RUZCXHU1MkExXHU1MTg1XHU1QkI5IC8gRW50ZXIgYSB0YXNrIGZpcnN0LlwiKTtcbiAgICAgIHN1Ym1pdC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5hZGRNYW51YWxUYXNrKHRoaXMudGFyZ2V0RmlsZSwge1xuICAgICAgICAgIHRpdGxlOiB0aGlzLnRpdGxlLnRyaW0oKSwgY2F0ZWdvcnk6IHRoaXMuY2F0ZWdvcnkudHJpbSgpLCBlc3RpbWF0ZWRNaW51dGVzOiB0aGlzLm1pbnV0ZXMsXG4gICAgICAgICAgc3RhcnRUaW1lOiB0aGlzLnN0YXJ0VGltZSwgZW5kVGltZTogdGhpcy5lbmRUaW1lLCBkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbi50cmltKClcbiAgICAgICAgfSwgdGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMucGxhblRpdGxlLnRyaW0oKSk7XG4gICAgICAgIG5ldyBOb3RpY2UodGhpcy50YXJnZXRGaWxlID8gXCJcdTVERjJcdTZERkJcdTUyQTBcdTRFRkJcdTUyQTFcdTVFNzZcdTY2RjRcdTY1QjBcdTYwM0JcdTdFRDMgLyBUYXNrIGFkZGVkIGFuZCBzdW1tYXJ5IHVwZGF0ZWQuXCIgOiBcIlx1NjI0Qlx1NTJBOFx1OEJBMVx1NTIxMlx1NURGMlx1NTIxQlx1NUVGQSAvIE1hbnVhbCBwbGFuIGNyZWF0ZWQuXCIpO1xuICAgICAgICB0aGlzLnRpdGxlID0gXCJcIjsgdGhpcy5jYXRlZ29yeSA9IFwiXCI7IHRoaXMubWludXRlcyA9IDMwOyB0aGlzLnN0YXJ0VGltZSA9IFwiXCI7IHRoaXMuZW5kVGltZSA9IFwiXCI7IHRoaXMuZGVzY3JpcHRpb24gPSBcIlwiO1xuICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiQ291bGQgbm90IHNhdmUgdGhlIHRhc2suXCIpO1xuICAgICAgICBzdWJtaXQuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZmllbGQocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgZGVzY3JpcHRpb24/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZmllbGQgPSBwYXJlbnQuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItbW9iaWxlLWZpZWxkXCIgfSk7XG4gICAgZmllbGQuY3JlYXRlRWwoXCJsYWJlbFwiLCB7IHRleHQ6IGxhYmVsIH0pO1xuICAgIGlmIChkZXNjcmlwdGlvbikgZmllbGQuY3JlYXRlRWwoXCJzbWFsbFwiLCB7IHRleHQ6IGRlc2NyaXB0aW9uIH0pO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIHByaXZhdGUgdGltZUlucHV0KHBhcmVudDogSFRNTEVsZW1lbnQsIHZhbHVlOiBzdHJpbmcsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuICAgIGNvbnN0IGlucHV0ID0gcGFyZW50LmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyBjbHM6IFwiYWktcGxhbm5lci1tb2JpbGUtdGltZVwiLCB0eXBlOiBcInRpbWVcIiB9KTtcbiAgICBpbnB1dC5zdGVwID0gXCI2MFwiO1xuICAgIGlucHV0LnZhbHVlID0gdmFsdWU7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IG9uQ2hhbmdlKGlucHV0LnZhbHVlKSk7XG4gIH1cbn1cblxuY2xhc3MgTWFudWFsVGFza01vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG1vZGU6IFBsYW5Nb2RlID0gXCJzdHVkeVwiO1xuICBwcml2YXRlIGRhdGUgPSBsb2NhbERhdGUoKTtcbiAgcHJpdmF0ZSBwbGFuVGl0bGUgPSBcIlwiO1xuICBwcml2YXRlIHRpdGxlID0gXCJcIjtcbiAgcHJpdmF0ZSBjYXRlZ29yeSA9IFwiXCI7XG4gIHByaXZhdGUgbWludXRlcyA9IDMwO1xuICBwcml2YXRlIHN0YXJ0VGltZSA9IFwiXCI7XG4gIHByaXZhdGUgZW5kVGltZSA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBBSVBsYW5uZXJQbHVnaW4sIHByaXZhdGUgcmVhZG9ubHkgZmlsZT86IFRGaWxlKSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dCh0aGlzLmZpbGUgPyBcIlx1NkRGQlx1NTJBMFx1OEJBMVx1NTIxMlx1NEVGQlx1NTJBMSAvIEFkZCB0YXNrXCIgOiBcIlx1NjVCMFx1NUVGQVx1NjI0Qlx1NTJBOFx1OEJBMVx1NTIxMiAvIENyZWF0ZSBtYW51YWwgcGxhblwiKTtcbiAgICBpZiAoIXRoaXMuZmlsZSkge1xuICAgICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTZBMjFcdTVGMEYgLyBNb2RlXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IGRyb3Bkb3duLmFkZE9wdGlvbihcInN0dWR5XCIsIFwiXHU0RjVDXHU0RTFBXHU0RTBFXHU1QjY2XHU0RTYwIC8gSG9tZXdvcmsgJiBzdHVkeVwiKS5hZGRPcHRpb24oXCJ3b3JrXCIsIFwiXHU1REU1XHU0RjVDIC8gV29ya1wiKS5zZXRWYWx1ZSh0aGlzLm1vZGUpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMubW9kZSA9IHZhbHVlIGFzIFBsYW5Nb2RlKSk7XG4gICAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1OEJBMVx1NTIxMlx1NjVFNVx1NjcxRiAvIFBsYW4gZGF0ZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMuZGF0ZSkub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5kYXRlID0gdmFsdWUpKTtcbiAgICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU4QkExXHU1MjEyXHU2ODA3XHU5ODk4IC8gUGxhbiB0aXRsZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMucGxhblRpdGxlKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLnBsYW5UaXRsZSA9IHZhbHVlKSk7XG4gICAgfVxuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU0RUZCXHU1MkExIC8gVGFza1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMudGl0bGUpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMudGl0bGUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU1MjA2XHU3QzdCIC8gQ2F0ZWdvcnlcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZSh0aGlzLmNhdGVnb3J5KS5zZXRQbGFjZWhvbGRlcihcIlx1NjU3MFx1NUI2NiAvIFByb2plY3RcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5jYXRlZ29yeSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTk4ODRcdThCQTFcdTUyMDZcdTk0OUYgLyBFc3RpbWF0ZWQgbWludXRlc1wiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLm1pbnV0ZXMpKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLm1pbnV0ZXMgPSBNYXRoLm1heCgxLCBOdW1iZXIodmFsdWUpIHx8IDMwKSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU1RjAwXHU1OUNCXHU2NUY2XHU5NUY0IC8gU3RhcnQgdGltZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMuc3RhcnRUaW1lKS5zZXRQbGFjZWhvbGRlcihcIjE5OjAwXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuc3RhcnRUaW1lID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1N0VEM1x1Njc1Rlx1NjVGNlx1OTVGNCAvIEVuZCB0aW1lXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUodGhpcy5lbmRUaW1lKS5zZXRQbGFjZWhvbGRlcihcIjE5OjMwXCIpLm9uQ2hhbmdlKHZhbHVlID0+IHRoaXMuZW5kVGltZSA9IHZhbHVlKSk7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGFsLWJ1dHRvbi1jb250YWluZXJcIiB9KTtcbiAgICBjb25zdCBzdWJtaXQgPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiB0aGlzLmZpbGUgPyBcIlx1NkRGQlx1NTJBMFx1NEVGQlx1NTJBMSAvIEFkZCB0YXNrXCIgOiBcIlx1NTIxQlx1NUVGQVx1OEJBMVx1NTIxMiAvIENyZWF0ZSBwbGFuXCIsIGNsczogXCJtb2QtY3RhXCIgfSk7XG4gICAgc3VibWl0LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gICAgICBpZiAoIXRoaXMudGl0bGUudHJpbSgpKSByZXR1cm4gbmV3IE5vdGljZShcIlx1OEJGN1x1NTg2Qlx1NTE5OVx1NEVGQlx1NTJBMSAvIEVudGVyIGEgdGFzayBmaXJzdC5cIik7XG4gICAgICBzdWJtaXQuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uYWRkTWFudWFsVGFzayh0aGlzLmZpbGUsIHsgdGl0bGU6IHRoaXMudGl0bGUudHJpbSgpLCBjYXRlZ29yeTogdGhpcy5jYXRlZ29yeS50cmltKCksIGVzdGltYXRlZE1pbnV0ZXM6IHRoaXMubWludXRlcywgc3RhcnRUaW1lOiB0aGlzLnN0YXJ0VGltZS50cmltKCksIGVuZFRpbWU6IHRoaXMuZW5kVGltZS50cmltKCkgfSwgdGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMucGxhblRpdGxlLnRyaW0oKSk7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkNvdWxkIG5vdCBzYXZlIHRoZSB0YXNrLlwiKTtcbiAgICAgICAgc3VibWl0LmRpc2FibGVkID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgUGxhbklucHV0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbW9kZTogUGxhbk1vZGUgPSBcInN0dWR5XCI7XG4gIHByaXZhdGUgZGF0ZSA9IGxvY2FsRGF0ZSgpO1xuICBwcml2YXRlIHN0YXJ0VGltZSA9IFwiXCI7XG4gIHByaXZhdGUgZW5kVGltZSA9IFwiXCI7XG4gIHByaXZhdGUgaW5wdXQgPSBcIlwiO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dChcIkFJIFBsYW5uZXIgLyBBSSBcdThCQTFcdTUyMTJcIik7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTZBMjFcdTVGMEYgLyBNb2RlXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IGRyb3Bkb3duXG4gICAgICAuYWRkT3B0aW9uKFwic3R1ZHlcIiwgXCJcdTRGNUNcdTRFMUFcdTRFMEVcdTVCNjZcdTRFNjAgLyBIb21ld29yayAmIHN0dWR5XCIpXG4gICAgICAuYWRkT3B0aW9uKFwid29ya1wiLCBcIlx1NURFNVx1NEY1QyAvIFdvcmtcIilcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLm1vZGUpXG4gICAgICAub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5tb2RlID0gdmFsdWUgYXMgUGxhbk1vZGUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1OEJBMVx1NTIxMlx1NjVFNVx1NjcxRiAvIFBsYW4gZGF0ZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0XG4gICAgICAuc2V0VmFsdWUodGhpcy5kYXRlKS5zZXRQbGFjZWhvbGRlcihcIllZWVktTU0tRERcIikub25DaGFuZ2UodmFsdWUgPT4gdGhpcy5kYXRlID0gdmFsdWUpKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbCkuc2V0TmFtZShcIlx1NUYwMFx1NTlDQlx1NjVGNlx1OTVGNCAvIFN0YXJ0IHRpbWVcIikuc2V0RGVzYyhcIlx1NEY4Qlx1NTk4MiAvIEV4YW1wbGU6IDE5OjAwXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXRcbiAgICAgIC5zZXRWYWx1ZSh0aGlzLnN0YXJ0VGltZSkuc2V0UGxhY2Vob2xkZXIoXCIxOTowMFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLnN0YXJ0VGltZSA9IHZhbHVlKSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpLnNldE5hbWUoXCJcdTY3MDBcdTY2NUFcdTdFRDNcdTY3NUYgLyBMYXRlc3QgZmluaXNoXCIpLnNldERlc2MoXCJcdTUzRUZcdTkwMDkgLyBPcHRpb25hbC5cIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dFxuICAgICAgLnNldFZhbHVlKHRoaXMuZW5kVGltZSkuc2V0UGxhY2Vob2xkZXIoXCIyMTowMFwiKS5vbkNoYW5nZSh2YWx1ZSA9PiB0aGlzLmVuZFRpbWUgPSB2YWx1ZSkpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKS5zZXROYW1lKFwiXHU0RUZCXHU1MkExXHU2MjE2XHU0RjVDXHU0RTFBIC8gVGFza3Mgb3IgaG9tZXdvcmtcIikuc2V0RGVzYyhcIlx1NTg2Qlx1NTE5OVx1NzlEMVx1NzZFRS9cdTk4NzlcdTc2RUVcdTMwMDFcdTRFRkJcdTUyQTFcdTkxQ0ZcdTMwMDFcdTYyMkFcdTZCNjJcdTY1RjZcdTk1RjRcdTU0OENcdTk2NTBcdTUyMzZcdTY3NjFcdTRFRjZcdTMwMDJcIik7XG4gICAgY29uc3Qgc291cmNlQmFyID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItc291cmNlXCIgfSk7XG4gICAgY29uc3Qgc291cmNlTGFiZWwgPSBzb3VyY2VCYXIuY3JlYXRlU3Bhbih7IHRleHQ6IFwiXHU2NzY1XHU2RTkwIC8gU291cmNlOiBcdTYyNEJcdTUyQThcdThGOTNcdTUxNjUgLyBtYW51YWwgaW5wdXRcIiB9KTtcbiAgICBjb25zdCB1c2VBY3RpdmVCdXR0b24gPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NEY3Rlx1NzUyOFx1NUY1M1x1NTI0RFx1N0IxNFx1OEJCMCAvIFVzZSBjdXJyZW50IG5vdGVcIiB9KTtcbiAgICBjb25zdCBjaG9vc2VCdXR0b24gPSBzb3VyY2VCYXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1OTAwOVx1NjJFOSBNYXJrZG93biBcdTdCMTRcdThCQjAgLyBDaG9vc2Ugbm90ZVwiIH0pO1xuICAgIGNvbnN0IGFyZWEgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInRleHRhcmVhXCIsIHsgY2xzOiBcImFpLXBsYW5uZXItaW5wdXRcIiB9KTtcbiAgICBhcmVhLnJvd3MgPSA4O1xuICAgIGFyZWEucGxhY2Vob2xkZXIgPSBcIkV4YW1wbGU6IE1hdGggd29ya2Jvb2sgcGFnZXMgMTItMTQ7IG1lbW9yaXplIDIwIEVuZ2xpc2ggd29yZHM7IENoaW5lc2UgcmVhZGluZyBhbG91ZC5cIjtcbiAgICBhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoKSA9PiB0aGlzLmlucHV0ID0gYXJlYS52YWx1ZSk7XG4gICAgY29uc3QgbG9hZFNvdXJjZSA9IGFzeW5jIChmaWxlOiBURmlsZSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICB0aGlzLmlucHV0ID0gY29udGVudDtcbiAgICAgIGFyZWEudmFsdWUgPSBjb250ZW50O1xuICAgICAgc291cmNlTGFiZWwuc2V0VGV4dChgXHU2NzY1XHU2RTkwIC8gU291cmNlOiAke2ZpbGUucGF0aH1gKTtcbiAgICB9O1xuICAgIHVzZUFjdGl2ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgYWN0aXZlRmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICBpZiAoIWFjdGl2ZUZpbGUgfHwgYWN0aXZlRmlsZS5leHRlbnNpb24gIT09IFwibWRcIikgcmV0dXJuIG5ldyBOb3RpY2UoXCJcdThCRjdcdTUxNDhcdTYyNTNcdTVGMDBcdTRFMDBcdTRFMkEgTWFya2Rvd24gXHU3QjE0XHU4QkIwIC8gT3BlbiBhIE1hcmtkb3duIG5vdGUgZmlyc3QuXCIpO1xuICAgICAgdHJ5IHsgYXdhaXQgbG9hZFNvdXJjZShhY3RpdmVGaWxlKTsgfSBjYXRjaCB7IG5ldyBOb3RpY2UoXCJDb3VsZCBub3QgcmVhZCB0aGUgY3VycmVudCBub3RlLlwiKTsgfVxuICAgIH0pO1xuICAgIGNob29zZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gbmV3IE1hcmtkb3duRmlsZVBpY2tlck1vZGFsKHRoaXMuYXBwLCBhc3luYyBmaWxlID0+IHtcbiAgICAgIHRyeSB7IGF3YWl0IGxvYWRTb3VyY2UoZmlsZSk7IH0gY2F0Y2ggeyBuZXcgTm90aWNlKFwiQ291bGQgbm90IHJlYWQgdGhhdCBub3RlLlwiKTsgfVxuICAgIH0pLm9wZW4oKSk7XG4gICAgY29uc3QgYWN0aW9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm1vZGFsLWJ1dHRvbi1jb250YWluZXJcIiB9KTtcbiAgICBjb25zdCBidXR0b24gPSBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlx1NzUxRlx1NjIxMFx1OTg4NFx1ODlDOCAvIEdlbmVyYXRlIHByZXZpZXdcIiwgY2xzOiBcIm1vZC1jdGFcIiB9KTtcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5pbnB1dC50cmltKCkpIHJldHVybiBuZXcgTm90aWNlKFwiXHU4QkY3XHU4MUYzXHU1QzExXHU1ODZCXHU1MTk5XHU0RTAwXHU5ODc5XHU0RUZCXHU1MkExIC8gRW50ZXIgYXQgbGVhc3Qgb25lIHRhc2sgZmlyc3QuXCIpO1xuICAgICAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgIGJ1dHRvbi5zZXRUZXh0KFwiXHU2QjYzXHU1NzI4XHU3NTFGXHU2MjEwIC8gR2VuZXJhdGluZy4uLlwiKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBsYW4gPSBhd2FpdCB0aGlzLnBsdWdpbi5nZW5lcmF0ZVBsYW4odGhpcy5tb2RlLCB0aGlzLmRhdGUsIHRoaXMuc3RhcnRUaW1lLCB0aGlzLmVuZFRpbWUsIHRoaXMuaW5wdXQpO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICAgIG5ldyBQbGFuUHJldmlld01vZGFsKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgdGhpcy5tb2RlLCB0aGlzLmRhdGUsIHBsYW4pLm9wZW4oKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkNvdWxkIG5vdCBnZW5lcmF0ZSBwbGFuLlwiKTtcbiAgICAgICAgYnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIGJ1dHRvbi5zZXRUZXh0KFwiXHU3NTFGXHU2MjEwXHU5ODg0XHU4OUM4IC8gR2VuZXJhdGUgcHJldmlld1wiKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5jbGFzcyBNYXJrZG93bkZpbGVQaWNrZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBxdWVyeSA9IFwiXCI7XG4gIHByaXZhdGUgcmVhZG9ubHkgZmlsZXM6IFRGaWxlW107XG4gIHByaXZhdGUgcmVzdWx0c0VsOiBIVE1MRWxlbWVudDtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBvbkNob29zZTogKGZpbGU6IFRGaWxlKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPikge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy5maWxlcyA9IGFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XG4gICAgdGhpcy5yZXN1bHRzRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIHRoaXMubW9kYWxFbC5hZGRDbGFzcyhcImFpLXBsYW5uZXItbW9kYWxcIiwgXCJhaS1wbGFubmVyLWZpbGUtcGlja2VyXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiXHU5MDA5XHU2MkU5IE1hcmtkb3duIFx1N0IxNFx1OEJCMCAvIENob29zZSBub3RlXCIpO1xuICAgIGNvbnN0IHNlYXJjaCA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyB0eXBlOiBcInNlYXJjaFwiLCBwbGFjZWhvbGRlcjogXCJcdTY0MUNcdTdEMjJcdTdCMTRcdThCQjAgLyBTZWFyY2ggbm90ZXMuLi5cIiwgY2xzOiBcImFpLXBsYW5uZXItZmlsZS1zZWFyY2hcIiB9KTtcbiAgICBzZWFyY2guYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHsgdGhpcy5xdWVyeSA9IHNlYXJjaC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgdGhpcy5yZW5kZXJSZXN1bHRzKCk7IH0pO1xuICAgIHRoaXMucmVzdWx0c0VsID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImFpLXBsYW5uZXItZmlsZS1yZXN1bHRzXCIgfSk7XG4gICAgdGhpcy5yZW5kZXJSZXN1bHRzKCk7XG4gICAgc2VhcmNoLmZvY3VzKCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlclJlc3VsdHMoKTogdm9pZCB7XG4gICAgdGhpcy5yZXN1bHRzRWwuZW1wdHkoKTtcbiAgICBjb25zdCBtYXRjaGVzID0gdGhpcy5maWxlcy5maWx0ZXIoZmlsZSA9PiBmaWxlLnBhdGgudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0aGlzLnF1ZXJ5KSkuc2xpY2UoMCwgMTAwKTtcbiAgICBpZiAoIW1hdGNoZXMubGVuZ3RoKSB7IHRoaXMucmVzdWx0c0VsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiTm8gTWFya2Rvd24gbm90ZXMgZm91bmQuXCIgfSk7IHJldHVybjsgfVxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBtYXRjaGVzKSB7XG4gICAgICBjb25zdCBidXR0b24gPSB0aGlzLnJlc3VsdHNFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJhaS1wbGFubmVyLWZpbGUtaXRlbVwiIH0pO1xuICAgICAgYnV0dG9uLmNyZWF0ZUVsKFwic3Ryb25nXCIsIHsgdGV4dDogZmlsZS5iYXNlbmFtZSB9KTtcbiAgICAgIGJ1dHRvbi5jcmVhdGVFbChcInNtYWxsXCIsIHsgdGV4dDogZmlsZS5wYXRoIH0pO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7IGF3YWl0IHRoaXMub25DaG9vc2UoZmlsZSk7IHRoaXMuY2xvc2UoKTsgfSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIFBsYW5QcmV2aWV3TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luLCBwcml2YXRlIHJlYWRvbmx5IG1vZGU6IFBsYW5Nb2RlLCBwcml2YXRlIHJlYWRvbmx5IGRhdGU6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSBwbGFuOiBQbGFuUmVzdWx0KSB7IHN1cGVyKGFwcCk7IH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwiYWktcGxhbm5lci1tb2RhbFwiKTtcbiAgICB0aGlzLnRpdGxlRWwuc2V0VGV4dCh0aGlzLnBsYW4udGl0bGUgfHwgXCJQbGFuIHByZXZpZXdcIik7XG4gICAgaWYgKHRoaXMucGxhbi5zdW1tYXJ5KSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiB0aGlzLnBsYW4uc3VtbWFyeSB9KTtcbiAgICByZW5kZXJQcmV2aWV3VGFza3ModGhpcy5jb250ZW50RWwsIFwiUGxhblwiLCB0aGlzLnBsYW4udGFza3MpO1xuICAgIGlmICh0aGlzLm1vZGUgPT09IFwic3R1ZHlcIikgcmVuZGVyUHJldmlld1Rhc2tzKHRoaXMuY29udGVudEVsLCBcIlJldmlld1wiLCB0aGlzLnBsYW4ucmV2aWV3VGFza3MgPz8gW10pO1xuICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJtb2RhbC1idXR0b24tY29udGFpbmVyXCIgfSk7XG4gICAgYWN0aW9uLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDYW5jZWxcIiB9KS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICBhY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIldyaXRlIHBsYW5cIiwgY2xzOiBcIm1vZC1jdGFcIiB9KS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGF3YWl0IHRoaXMucGx1Z2luLndyaXRlUGxhbih0aGlzLm1vZGUsIHRoaXMuZGF0ZSwgdGhpcy5wbGFuKTtcbiAgICAgICAgbmV3IE5vdGljZShgUGxhbiB3cml0dGVuOiAke3BhdGh9YCk7XG4gICAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIG5ldyBOb3RpY2UoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkNvdWxkIG5vdCB3cml0ZSBwbGFuLlwiKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5jbGFzcyBBSVBsYW5uZXJTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogQUlQbGFubmVyUGx1Z2luKSB7IHN1cGVyKGFwcCwgcGx1Z2luKTsgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgdGhpcy5jb250YWluZXJFbC5lbXB0eSgpO1xuICAgIHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQUkgUGxhbm5lciBcdThCQkVcdTdGNkUgLyBTZXR0aW5nc1wiIH0pO1xuICAgIHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJDbGF1ZGUgXHU0RTBFIEdlbWluaSBcdTRGN0ZcdTc1MjhcdTUzOUZcdTc1MUZcdTYzQTVcdTUzRTNcdUZGMUJcdTUxNzZcdTVCODNcdTk4ODRcdThCQkVcdTRGN0ZcdTc1MjggT3BlbkFJLWNvbXBhdGlibGUgXHU2M0E1XHU1M0UzXHUzMDAyQ2xhdWRlIGFuZCBHZW1pbmkgdXNlIG5hdGl2ZSBBUEkgZm9ybWF0cy5cIiB9KTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU3NTRDXHU5NzYyXHU4QkVEXHU4QTAwIC8gSW50ZXJmYWNlIGxhbmd1YWdlXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IGRyb3Bkb3duXG4gICAgICAuYWRkT3B0aW9uKFwiYXV0b1wiLCBcIlx1OERERlx1OTY4Rlx1N0NGQlx1N0VERiAvIEZvbGxvdyBzeXN0ZW1cIilcbiAgICAgIC5hZGRPcHRpb24oXCJ6aFwiLCBcIlx1NEUyRFx1NjU4N1wiKVxuICAgICAgLmFkZE9wdGlvbihcImVuXCIsIFwiRW5nbGlzaFwiKVxuICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmludGVyZmFjZUxhbmd1YWdlKVxuICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaW50ZXJmYWNlTGFuZ3VhZ2UgPSB2YWx1ZSBhcyBJbnRlcmZhY2VMYW5ndWFnZTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2NzBEXHU1MkExXHU1NTQ2XHU5ODg0XHU4QkJFIC8gUHJvdmlkZXIgcHJlc2V0XCIpLnNldERlc2MoXCJcdTkwMDlcdTYyRTlcdTU0MEVcdTRGMUFcdTU4NkJcdTUxNjVcdTYzQThcdTgzNTBcdTU3MzBcdTU3NDBcdTRFMEVcdTZBMjFcdTU3OEJcdUZGMENcdTUzRUZcdTdFRTdcdTdFRURcdTYyNEJcdTUyQThcdTRGRUVcdTY1MzlcdTMwMDJcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4ge1xuICAgICAgZm9yIChjb25zdCBbaWQsIHByZXNldF0gb2YgT2JqZWN0LmVudHJpZXMoUFJPVklERVJTKSkgZHJvcGRvd24uYWRkT3B0aW9uKGlkLCBwcmVzZXQubGFiZWwpO1xuICAgICAgZHJvcGRvd24uc2V0VmFsdWUodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MucHJvdmlkZXIpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcbiAgICAgICAgY29uc3QgcHJvdmlkZXIgPSB2YWx1ZSBhcyBQcm92aWRlcklkO1xuICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5wcm92aWRlciA9IHByb3ZpZGVyO1xuICAgICAgICBpZiAocHJvdmlkZXIgIT09IFwiY3VzdG9tXCIpIHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy5hcGlCYXNlVXJsID0gUFJPVklERVJTW3Byb3ZpZGVyXS5iYXNlVXJsO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLm1vZGVsID0gUFJPVklERVJTW3Byb3ZpZGVyXS5tb2RlbDtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiQVBJIFx1NTczMFx1NTc0MCAvIEFQSSBiYXNlIFVSTFwiLCBcIlx1NEY4Qlx1NTk4MiAvIEV4YW1wbGU6IGh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjFcIiwgXCJhcGlCYXNlVXJsXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJBUEkgXHU1QkM2XHU5NEE1IC8gQVBJIGtleVwiKS5zZXREZXNjKFwiU3RvcmVkIGluIHRoaXMgcGx1Z2luJ3MgZGF0YS5qc29uLlwiKS5hZGRUZXh0KGlucHV0ID0+IHtcbiAgICAgIGlucHV0LnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmFwaUtleSkuc2V0UGxhY2Vob2xkZXIoXCJzay0uLi5cIik7XG4gICAgICBpbnB1dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG4gICAgICBpbnB1dC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmFwaUtleSA9IHZhbHVlOyBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTsgfSk7XG4gICAgfSk7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1NkEyMVx1NTc4QiAvIE1vZGVsXCIsIFwiXHU0RjhCXHU1OTgyIC8gRXhhbXBsZTogZ3B0LTQuMS1taW5pLCBkZWVwc2Vlay1jaGF0LCBnbG0tNC1mbGFzaFwiLCBcIm1vZGVsXCIpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTgxRUFcdTVCOUFcdTRFNDlcdThCRjdcdTZDNDJcdTU5MzQgLyBDdXN0b20gaGVhZGVyc1wiLCBcIkpTT04gb2JqZWN0LCBvcHRpb25hbC5cIiwgXCJjdXN0b21IZWFkZXJzXCIpO1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTZFMjlcdTVFQTYgLyBUZW1wZXJhdHVyZVwiKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5wbHVnaW5TZXR0aW5ncy50ZW1wZXJhdHVyZSkpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MudGVtcGVyYXR1cmUgPSBOdW1iZXIodmFsdWUpIHx8IDA7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgbmV3IFNldHRpbmcodGhpcy5jb250YWluZXJFbCkuc2V0TmFtZShcIlx1NjcwMFx1NTkyN1x1OEY5M1x1NTFGQVx1OTU3Rlx1NUVBNiAvIE1heCBvdXRwdXQgdG9rZW5zXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLm1heFRva2VucykpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MubWF4VG9rZW5zID0gTnVtYmVyKHZhbHVlKSB8fCBERUZBVUxUX1NFVFRJTkdTLm1heFRva2VuczsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU1Mzg2XHU1M0YyXHU2ODIxXHU1MUM2XHU1OTI5XHU2NTcwIC8gSGlzdG9yeSBkYXlzXCIpLnNldERlc2MoXCJcdTc1MUZcdTYyMTBcdThCQTFcdTUyMTJcdTY1RjZcdThCRkJcdTUzRDZcdThGRDFcdTY3MUZcdTc3MUZcdTVCOUVcdTc1MjhcdTY1RjZcdUZGMENcdTVFRkFcdThCQUUgNy0zMCBcdTU5MjlcdTMwMDJcIikuYWRkVGV4dChpbnB1dCA9PiBpbnB1dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuaGlzdG9yeURheXMpKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7IHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmhpc3RvcnlEYXlzID0gTWF0aC5tYXgoMSwgTnVtYmVyKHZhbHVlKSB8fCBERUZBVUxUX1NFVFRJTkdTLmhpc3RvcnlEYXlzKTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU5RUQ4XHU4QkE0XHU0RTEzXHU2Q0U4XHU1MjA2XHU5NDlGIC8gRGVmYXVsdCBmb2N1cyBtaW51dGVzXCIpLmFkZFRleHQoaW5wdXQgPT4gaW5wdXQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzLmZvY3VzTWludXRlcykpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3MuZm9jdXNNaW51dGVzID0gTWF0aC5tYXgoMSwgTnVtYmVyKHZhbHVlKSB8fCBERUZBVUxUX1NFVFRJTkdTLmZvY3VzTWludXRlcyk7IGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpOyB9KSk7XG4gICAgdGhpcy50ZXh0U2V0dGluZyhcIlx1NUI2Nlx1NEU2MFx1OEY5M1x1NTFGQVx1NzZFRVx1NUY1NSAvIFN0dWR5IG91dHB1dCBmb2xkZXJcIiwgXCJWYXVsdC1yZWxhdGl2ZSBwYXRoLlwiLCBcInN0dWR5Rm9sZGVyXCIpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJcdTVERTVcdTRGNUNcdThGOTNcdTUxRkFcdTc2RUVcdTVGNTUgLyBXb3JrIG91dHB1dCBmb2xkZXJcIiwgXCJWYXVsdC1yZWxhdGl2ZSBwYXRoLlwiLCBcIndvcmtGb2xkZXJcIik7XG4gIH1cblxuICBwcml2YXRlIHRleHRTZXR0aW5nKG5hbWU6IHN0cmluZywgZGVzYzogc3RyaW5nLCBrZXk6IFwiYXBpQmFzZVVybFwiIHwgXCJtb2RlbFwiIHwgXCJjdXN0b21IZWFkZXJzXCIgfCBcInN0dWR5Rm9sZGVyXCIgfCBcIndvcmtGb2xkZXJcIik6IHZvaWQge1xuICAgIG5ldyBTZXR0aW5nKHRoaXMuY29udGFpbmVyRWwpLnNldE5hbWUobmFtZSkuc2V0RGVzYyhkZXNjKS5hZGRUZXh0KGlucHV0ID0+IGlucHV0LnNldFZhbHVlKHRoaXMucGx1Z2luLnBsdWdpblNldHRpbmdzW2tleV0pLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHsgdGhpcy5wbHVnaW4ucGx1Z2luU2V0dGluZ3Nba2V5XSA9IHZhbHVlLnRyaW0oKTsgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7IH0pKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwYXJzZVBsYW4oY29udGVudDogc3RyaW5nKTogUGxhblJlc3VsdCB7XG4gIGNvbnN0IGpzb24gPSBjb250ZW50LnRyaW0oKS5yZXBsYWNlKC9eYGBgKD86anNvbik/XFxzKi9pLCBcIlwiKS5yZXBsYWNlKC9cXHMqYGBgJC8sIFwiXCIpO1xuICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb24pIGFzIFBsYW5SZXN1bHQ7XG4gIGlmICghcGFyc2VkLnRpdGxlIHx8ICFBcnJheS5pc0FycmF5KHBhcnNlZC50YXNrcykpIHRocm93IG5ldyBFcnJvcihcIlRoZSBtb2RlbCByZXR1cm5lZCBhbiBpbnZhbGlkIHBsYW4gZm9ybWF0LlwiKTtcbiAgcGFyc2VkLnRhc2tzID0gcGFyc2VkLnRhc2tzLm1hcChub3JtYWxpemVUYXNrKS5maWx0ZXIoQm9vbGVhbikgYXMgUGxhblRhc2tbXTtcbiAgcGFyc2VkLnJldmlld1Rhc2tzID0gQXJyYXkuaXNBcnJheShwYXJzZWQucmV2aWV3VGFza3MpID8gcGFyc2VkLnJldmlld1Rhc2tzLm1hcChub3JtYWxpemVUYXNrKS5maWx0ZXIoQm9vbGVhbikgYXMgUGxhblRhc2tbXSA6IFtdO1xuICBpZiAoIXBhcnNlZC50YXNrcy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcihcIlRoZSBtb2RlbCBkaWQgbm90IHJldHVybiBhbnkgdGFza3MuXCIpO1xuICByZXR1cm4gcGFyc2VkO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVUYXNrKHZhbHVlOiB1bmtub3duKTogUGxhblRhc2sgfCBudWxsIHtcbiAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09IFwib2JqZWN0XCIpIHJldHVybiBudWxsO1xuICBjb25zdCB0YXNrID0gdmFsdWUgYXMgUGFydGlhbDxQbGFuVGFzaz47XG4gIGlmICghdGFzay50aXRsZSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7IHRpdGxlOiBTdHJpbmcodGFzay50aXRsZSksIGNhdGVnb3J5OiB0YXNrLmNhdGVnb3J5ID8gU3RyaW5nKHRhc2suY2F0ZWdvcnkpIDogXCJcIiwgc3RhcnRUaW1lOiB0YXNrLnN0YXJ0VGltZSA/IFN0cmluZyh0YXNrLnN0YXJ0VGltZSkgOiBcIlwiLCBlbmRUaW1lOiB0YXNrLmVuZFRpbWUgPyBTdHJpbmcodGFzay5lbmRUaW1lKSA6IFwiXCIsIGVzdGltYXRlZE1pbnV0ZXM6IE1hdGgubWF4KDEsIE51bWJlcih0YXNrLmVzdGltYXRlZE1pbnV0ZXMpIHx8IDMwKSwgZGVzY3JpcHRpb246IHRhc2suZGVzY3JpcHRpb24gPyBTdHJpbmcodGFzay5kZXNjcmlwdGlvbikgOiBcIlwiIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlclBsYW4obW9kZTogUGxhbk1vZGUsIGRhdGU6IHN0cmluZywgcGxhbjogUGxhblJlc3VsdCk6IHN0cmluZyB7XG4gIGNvbnN0IGFsbFRhc2tzID0gWy4uLnBsYW4udGFza3MsIC4uLihwbGFuLnJldmlld1Rhc2tzID8/IFtdKV07XG4gIGNvbnN0IGZyb250bWF0dGVyID0gYWxsVGFza3MuZmxhdE1hcCgodGFzaywgaW5kZXgpID0+IHtcbiAgICBjb25zdCBpZCA9IGB0YXNrJHtTdHJpbmcoaW5kZXggKyAxKS5wYWRTdGFydCgyLCBcIjBcIil9YDtcbiAgICByZXR1cm4gW2Ake2lkfU5hbWU6ICR7eWFtbFF1b3RlKHRhc2sudGl0bGUpfWAsIGAke2lkfUNhdGVnb3J5OiAke3lhbWxRdW90ZSh0YXNrLmNhdGVnb3J5IHx8IFwiXHU1MTc2XHU1QjgzXCIpfWAsIGAke2lkfUVzdGltYXRlZE1pbnV0ZXM6ICR7dGFzay5lc3RpbWF0ZWRNaW51dGVzfWAsIGAke2lkfUFjdHVhbFN0YXJ0OmAsIGAke2lkfUFjdHVhbEVuZDpgLCBgJHtpZH1BY3R1YWxNaW51dGVzOiAwYCwgYCR7aWR9Rm9jdXNTZXNzaW9uczogMGBdO1xuICB9KTtcbiAgY29uc3QgdGFza0NhcmRzID0gKGxhYmVsOiBzdHJpbmcsIHRhc2tzOiBQbGFuVGFza1tdLCBvZmZzZXQ6IG51bWJlcikgPT4gdGFza3MubGVuZ3RoID8gYCMjICR7bGFiZWx9XFxuXFxuJHt0YXNrcy5tYXAoKHRhc2ssIGluZGV4KSA9PiByZW5kZXJUYXNrKHRhc2ssIGRhdGUsIG9mZnNldCArIGluZGV4ICsgMSkpLmpvaW4oXCJcXG5cXG5cIil9YCA6IGAjIyAke2xhYmVsfVxcblxcblx1NjY4Mlx1NjVFMFx1NUI4OVx1NjM5Mlx1MzAwMmA7XG4gIHJldHVybiBgLS0tXFxudHlwZTogJHttb2RlID09PSBcInN0dWR5XCIgPyBcIlx1NkJDRlx1NjVFNVx1NEY1Q1x1NEUxQVx1OEJBMVx1NTIxMlwiIDogXCJcdTZCQ0ZcdTY1RTVcdTVERTVcdTRGNUNcdThCQTFcdTUyMTJcIn1cXG5wbGFuRGF0ZTogJHtkYXRlfVxcbnRhZ3M6XFxuICAtIEFJXHU4QkExXHU1MjEyXFxuJHtmcm9udG1hdHRlci5qb2luKFwiXFxuXCIpfVxcbi0tLVxcblxcbiMgJHtwbGFuLnRpdGxlfVxcblxcbj4gWyFhYnN0cmFjdF0gXHU2OTgyXHU4OUM4XFxuPiAke3BsYW4uc3VtbWFyeSB8fCBcIlx1NzUzMSBBSSBQbGFubmVyIFx1NzUxRlx1NjIxMFx1RkYwQ1x1NjI2N1x1ODg0Q1x1NTQwRVx1NTg2Qlx1NTE5OVx1NkJDRlx1OTg3OVx1NUI5RVx1OTY0NVx1NUYwMFx1NTlDQlx1NTQ4Q1x1NUI4Q1x1NjIxMFx1NjVGNlx1OTVGNFx1MzAwMlwifVxcblxcbjwhLS0gQUktUExBTk5FUi1TVU1NQVJZOlNUQVJUIC0tPlxcbj4gWyFzdW1tYXJ5XSBcdTYyNjdcdTg4NENcdTYwM0JcdTdFRDMgLyBFeGVjdXRpb24gc3VtbWFyeVxcbj4gLSBcdTUyMURcdTU5Q0JcdThCQTFcdTUyMTJcdTVERjJcdTUyMUJcdTVFRkFcdUZGMUJcdTVCOENcdTYyMTBcdTRFRkJcdTUyQTFcdTMwMDFcdTRFMTNcdTZDRThcdTYyMTZcdTg4NjVcdTUxNDVcdTRFRkJcdTUyQTFcdTU0MEVcdThGRDBcdTg4NENcdTIwMUNcdTUyMzdcdTY1QjBcdTVGNTNcdTUyNERcdThCQTFcdTUyMTJcdTYwM0JcdTdFRDNcdTIwMURcdTMwMDJcXG48IS0tIEFJLVBMQU5ORVItU1VNTUFSWTpFTkQgLS0+XFxuXFxuJHt0YXNrQ2FyZHMobW9kZSA9PT0gXCJzdHVkeVwiID8gXCJcdTRGNUNcdTRFMUFcdThCQTFcdTUyMTJcdTg4NjhcIiA6IFwiXHU1REU1XHU0RjVDXHU4QkExXHU1MjEyXHU4ODY4XCIsIHBsYW4udGFza3MsIDApfVxcblxcbiR7bW9kZSA9PT0gXCJzdHVkeVwiID8gdGFza0NhcmRzKFwiXHU1OTBEXHU0RTYwXHU4QkExXHU1MjEyXHU4ODY4XCIsIHBsYW4ucmV2aWV3VGFza3MgPz8gW10sIHBsYW4udGFza3MubGVuZ3RoKSA6IFwiXCJ9XFxuYDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFzayh0YXNrOiBQbGFuVGFzaywgZGF0ZTogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcbiAgY29uc3QgcHJlZml4ID0gdGFzay5jYXRlZ29yeSA/IGAke3Rhc2suY2F0ZWdvcnl9IFx1MDBCNyBgIDogXCJcIjtcbiAgY29uc3QgdGltZSA9IHRhc2suc3RhcnRUaW1lICYmIHRhc2suZW5kVGltZSA/IGAke3Rhc2suc3RhcnRUaW1lfS0ke3Rhc2suZW5kVGltZX1gIDogXCJcdTVGODVcdTVCODlcdTYzOTJcIjtcbiAgY29uc3Qgbm90ZSA9IHRhc2suZGVzY3JpcHRpb24gPyBgXFxuPiAke3Rhc2suZGVzY3JpcHRpb259YCA6IFwiXCI7XG4gIHJldHVybiBgPiBbIXRvZG9dKyAke3ByZWZpeH0ke3Rhc2sudGl0bGV9XFxuPiBcdTY1RjZcdTZCQjVcdUZGMUEke3RpbWV9IFx1MDBCNyAke3Rhc2suZXN0aW1hdGVkTWludXRlc30gXHU1MjA2XHU5NDlGXFxuPiBcdTVCOUVcdTk2NDVcdTVGMDBcdTU5Q0JcdUZGMUFfX19fIFx1MDBCNyBcdTVCOUVcdTk2NDVcdTVCOENcdTYyMTBcdUZGMUFfX19fJHtub3RlfVxcbj4gLSBbIF0gJHt0YXNrLnRpdGxlfSBcdUQ4M0RcdURDQzUgJHtkYXRlfSAjXHU4QkExXHU1MjEyYDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUHJldmlld1Rhc2tzKHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHRhc2tzOiBQbGFuVGFza1tdKTogdm9pZCB7XG4gIHBhcmVudC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogbGFiZWwgfSk7XG4gIGlmICghdGFza3MubGVuZ3RoKSB7IHBhcmVudC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIk5vbmVcIiB9KTsgcmV0dXJuOyB9XG4gIGNvbnN0IGxpc3QgPSBwYXJlbnQuY3JlYXRlRWwoXCJ1bFwiKTtcbiAgZm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSBsaXN0LmNyZWF0ZUVsKFwibGlcIiwgeyB0ZXh0OiBgJHt0YXNrLnN0YXJ0VGltZSB8fCBcIlwifSR7dGFzay5lbmRUaW1lID8gYC0ke3Rhc2suZW5kVGltZX1gIDogXCJcIn0gJHt0YXNrLnRpdGxlfSAoJHt0YXNrLmVzdGltYXRlZE1pbnV0ZXN9IG1pbilgLnRyaW0oKSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZW5zdXJlRm9sZGVyKGFwcDogQXBwLCBmb2xkZXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBwYXJ0cyA9IG5vcm1hbGl6ZVBhdGgoZm9sZGVyKS5zcGxpdChcIi9cIikuZmlsdGVyKEJvb2xlYW4pO1xuICBmb3IgKGxldCBpID0gMTsgaSA8PSBwYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHBhdGggPSBwYXJ0cy5zbGljZSgwLCBpKS5qb2luKFwiL1wiKTtcbiAgICBpZiAoIWFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCkpIGF3YWl0IGFwcC52YXVsdC5jcmVhdGVGb2xkZXIocGF0aCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2FmZUZpbGVuYW1lKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgeyByZXR1cm4gdmFsdWUucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdL2csIFwiLVwiKS50cmltKCkuc2xpY2UoMCwgODApIHx8IFwiQUlcdThCQTFcdTUyMTJcIjsgfVxuZnVuY3Rpb24geWFtbFF1b3RlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpOyB9XG5mdW5jdGlvbiB0aW1lT2ZEYXkoZGF0ZTogRGF0ZSk6IHN0cmluZyB7IHJldHVybiBgJHtTdHJpbmcoZGF0ZS5nZXRIb3VycygpKS5wYWRTdGFydCgyLCBcIjBcIil9OiR7U3RyaW5nKGRhdGUuZ2V0TWludXRlcygpKS5wYWRTdGFydCgyLCBcIjBcIil9YDsgfVxuZnVuY3Rpb24gZm9ybWF0RHVyYXRpb24obWlsbGlzZWNvbmRzOiBudW1iZXIpOiBzdHJpbmcgeyBjb25zdCB0b3RhbCA9IE1hdGguY2VpbChtaWxsaXNlY29uZHMgLyAxMDAwKTsgcmV0dXJuIGAke1N0cmluZyhNYXRoLmZsb29yKHRvdGFsIC8gNjApKS5wYWRTdGFydCgyLCBcIjBcIil9OiR7U3RyaW5nKHRvdGFsICUgNjApLnBhZFN0YXJ0KDIsIFwiMFwiKX1gOyB9XG5mdW5jdGlvbiBsb2NhbERhdGUoKTogc3RyaW5nIHsgY29uc3Qgbm93ID0gbmV3IERhdGUoKTsgY29uc3Qgb2Zmc2V0ID0gbm93LmdldFRpbWV6b25lT2Zmc2V0KCkgKiA2MDAwMDsgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgLSBvZmZzZXQpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApOyB9XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFBMkk7QUFNM0ksSUFBTSwwQkFBMEI7QUFDaEMsSUFBTSxpQ0FBaUM7QUE4Q3ZDLElBQU0sbUJBQW9DO0FBQUEsRUFDeEMsVUFBVTtBQUFBLEVBQ1YsbUJBQW1CO0FBQUEsRUFDbkIsWUFBWTtBQUFBLEVBQ1osUUFBUTtBQUFBLEVBQ1IsT0FBTztBQUFBLEVBQ1AsZUFBZTtBQUFBLEVBQ2YsYUFBYTtBQUFBLEVBQ2IsV0FBVztBQUFBLEVBQ1gsYUFBYTtBQUFBLEVBQ2IsY0FBYztBQUFBLEVBQ2QsYUFBYTtBQUFBLEVBQ2IsWUFBWTtBQUNkO0FBRUEsSUFBTSxZQUFtRjtBQUFBLEVBQ3ZGLFFBQVEsRUFBRSxPQUFPLHlFQUFzQyxTQUFTLElBQUksT0FBTyxHQUFHO0FBQUEsRUFDOUUsUUFBUSxFQUFF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
