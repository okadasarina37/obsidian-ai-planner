import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath, requestUrl } from "obsidian";

type PlanMode = "study" | "work";
type ProviderId = "custom" | "openai" | "claude" | "deepseek" | "glm" | "kimi" | "gemini";
type InterfaceLanguage = "auto" | "zh" | "en";

interface PlannerSettings {
  provider: ProviderId;
  interfaceLanguage: InterfaceLanguage;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  customHeaders: string;
  temperature: number;
  maxTokens: number;
  historyDays: number;
  focusMinutes: number;
  studyFolder: string;
  workFolder: string;
  activeFocus?: ActiveFocusSession;
  focusMiniPosition?: { x: number; y: number };
}

interface ActiveFocusSession {
  filePath: string;
  taskId: string;
  taskName: string;
  category: string;
  durationMs: number;
  focusedMs: number;
  runningAt: number | null;
  startedAt: number;
}

interface PlanTask {
  title: string;
  category?: string;
  startTime?: string;
  endTime?: string;
  estimatedMinutes: number;
  description?: string;
}

interface PlanResult {
  title: string;
  summary?: string;
  tasks: PlanTask[];
  reviewTasks?: PlanTask[];
}

const DEFAULT_SETTINGS: PlannerSettings = {
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
  studyFolder: "06_Todo/学习",
  workFolder: "01_项目/工作计划"
};

const PROVIDERS: Record<ProviderId, { label: string; baseUrl: string; model: string }> = {
  custom: { label: "Custom OpenAI-compatible / 自定义兼容接口", baseUrl: "", model: "" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  claude: { label: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  glm: { label: "Zhipu GLM / 智谱", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  kimi: { label: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" }
};

async function requestPlanCompletion(
  settings: PlannerSettings,
  baseUrl: string,
  headers: Record<string, string>,
  system: string,
  user: string
): Promise<Awaited<ReturnType<typeof requestUrl>>> {
  if (settings.provider === "claude") {
    if (settings.apiKey) headers["x-api-key"] = settings.apiKey;
    headers["anthropic-version"] ??= "2023-06-01";
    return requestUrl({
      url: `${baseUrl}/messages`, method: "POST", headers,
      body: JSON.stringify({ model: settings.model, max_tokens: settings.maxTokens, temperature: settings.temperature, system, messages: [{ role: "user", content: user }] }), throw: false
    });
  }
  if (settings.provider === "gemini") {
    const key = settings.apiKey ? `?key=${encodeURIComponent(settings.apiKey)}` : "";
    return requestUrl({
      url: `${baseUrl}/models/${encodeURIComponent(settings.model)}:generateContent${key}`, method: "POST", headers,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: settings.temperature, maxOutputTokens: settings.maxTokens, responseMimeType: "application/json" } }), throw: false
    });
  }
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  return requestUrl({
    url: `${baseUrl}/chat/completions`, method: "POST", headers,
    body: JSON.stringify({ model: settings.model, temperature: settings.temperature, max_tokens: settings.maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }), throw: false
  });
}

function completionText(provider: ProviderId, response: unknown): string | undefined {
  const json = response as Record<string, unknown>;
  if (provider === "claude") {
    const content = json.content as Array<{ type?: string; text?: string }> | undefined;
    return content?.filter(part => part.type === "text").map(part => part.text ?? "").join("");
  }
  if (provider === "gemini") {
    const candidates = json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    return candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("");
  }
  const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content;
}

export default class AIPlannerPlugin extends Plugin {
  pluginSettings!: PlannerSettings;
  private focusStatusEl!: HTMLElement;
  private focusMiniEl!: HTMLButtonElement;
  private finishingFocus = false;
  private focusTimerOpen = false;
  private miniDragging = false;
  private miniMoved = false;
  private miniStartX = 0;
  private miniStartY = 0;
  private miniStartLeft = 0;
  private miniStartTop = 0;

  async onload(): Promise<void> {
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
    this.registerDomEvent(this.focusMiniEl, "click", event => {
      if (this.miniMoved) { event.preventDefault(); return; }
      void this.restoreFocusTimer();
    });
    this.registerDomEvent(this.focusMiniEl, "pointerdown", event => this.beginMiniDrag(event));
    this.registerDomEvent(window, "pointermove", event => this.moveMiniDrag(event));
    this.registerDomEvent(window, "pointerup", () => void this.endMiniDrag());
    this.register(() => this.focusMiniEl.remove());
    const updateVisibleHeight = (): void => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--ai-planner-visible-height", `${Math.round(height)}px`);
    };
    updateVisibleHeight();
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      viewport.addEventListener("resize", updateVisibleHeight);
      this.register(() => viewport.removeEventListener("resize", updateVisibleHeight));
    }
    this.registerDomEvent(document, "focusin", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select")) return;
      if (!target.closest(".ai-planner-modal")) return;
      window.setTimeout(() => target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }), 250);
    });
    this.registerInterval(window.setInterval(() => void this.refreshFocusStatus(), 500));
    await this.refreshFocusStatus();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.pluginSettings);
  }

  getActiveFocus(): ActiveFocusSession | undefined {
    return this.pluginSettings.activeFocus;
  }

  setFocusTimerOpen(open: boolean): void {
    this.focusTimerOpen = open;
    void this.refreshFocusStatus();
  }

  private beginMiniDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    const rect = this.focusMiniEl.getBoundingClientRect();
    this.miniDragging = true;
    this.miniMoved = false;
    this.miniStartX = event.clientX;
    this.miniStartY = event.clientY;
    this.miniStartLeft = rect.left;
    this.miniStartTop = rect.top;
  }

  private moveMiniDrag(event: PointerEvent): void {
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

  private async endMiniDrag(): Promise<void> {
    if (!this.miniDragging) return;
    this.miniDragging = false;
    if (!this.miniMoved) return;
    const rect = this.focusMiniEl.getBoundingClientRect();
    const width = Math.max(1, window.innerWidth - rect.width);
    const height = Math.max(1, window.innerHeight - rect.height);
    this.pluginSettings.focusMiniPosition = { x: rect.left / width, y: rect.top / height };
    await this.saveSettings();
    window.setTimeout(() => { this.miniMoved = false; }, 0);
  }

  private applyMiniPosition(): void {
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

  async openFocusForActiveNote(): Promise<void> {
    if (this.pluginSettings.activeFocus) {
      await this.restoreFocusTimer();
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice("请先打开一个计划笔记 / Open a plan note first."); return; }
    const tasks = extractFocusTasks(this.app, file);
    if (!tasks.length) { new Notice("当前笔记没有可专注的计划任务 / No plan tasks found."); return; }
    new FocusTaskPickerModal(this.app, this, file, tasks).open();
  }

  async startFocus(file: TFile, task: FocusTask, minutes: number): Promise<void> {
    if (this.pluginSettings.activeFocus) {
      new Notice("已有进行中的专注 / A focus session is already active.");
      await this.restoreFocusTimer();
      return;
    }
    const startedAt = Date.now();
    this.pluginSettings.activeFocus = {
      filePath: file.path,
      taskId: task.id,
      taskName: task.name,
      category: task.category,
      durationMs: Math.max(1, minutes) * 60000,
      focusedMs: 0,
      runningAt: startedAt,
      startedAt
    };
    await this.saveSettings();
    try {
      await this.app.fileManager.processFrontMatter(file, fm => {
        fm[`${task.id}ActualStart`] ??= timeOfDay(new Date(startedAt));
      });
    } catch {
      new Notice("无法立即写入开始时间，将在结束时重试 / Could not write the start time yet; it will retry on finish.");
    }
    await this.refreshFocusStatus();
    new FocusTimerModal(this.app, this).open();
  }

  async toggleFocusPause(): Promise<void> {
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

  async restoreFocusTimer(): Promise<void> {
    const session = this.pluginSettings.activeFocus;
    if (!session) return;
    const file = this.app.vault.getAbstractFileByPath(session.filePath);
    if (!(file instanceof TFile)) {
      new Notice("找不到原计划笔记，无法完成回写 / The plan note is missing.");
      return;
    }
    new FocusTimerModal(this.app, this).open();
  }

  async finishFocus(): Promise<void> {
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
      if (!(file instanceof TFile)) {
        new Notice("找不到原计划笔记，专注记录暂未写入 / Plan note missing; focus record was kept.");
        return;
      }
      const actualMinutes = Math.max(1, Math.round(session.focusedMs / 60000));
      await this.app.fileManager.processFrontMatter(file, fm => {
        fm[`${session.taskId}ActualStart`] ??= timeOfDay(new Date(session.startedAt));
        fm[`${session.taskId}ActualEnd`] = timeOfDay(new Date());
        fm[`${session.taskId}ActualMinutes`] = Number(fm[`${session.taskId}ActualMinutes`] ?? 0) + actualMinutes;
        fm[`${session.taskId}FocusSessions`] = Number(fm[`${session.taskId}FocusSessions`] ?? 0) + 1;
      });
      this.pluginSettings.activeFocus = undefined;
      await this.saveSettings();
      new Notice(`已记录 ${actualMinutes} 分钟专注 / Focus recorded.`);
    } finally {
      this.finishingFocus = false;
      await this.refreshFocusStatus();
    }
  }

  async refreshFocusStatus(): Promise<void> {
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
      this.focusStatusEl.setText(`Focus complete · ${session.taskName}`);
      this.focusMiniEl.setText("专注完成 / Focus complete");
      void this.finishFocus();
      return;
    }
    const state = session.runningAt === null ? "Focus paused" : formatDuration(Math.max(0, session.durationMs - elapsed));
    this.focusStatusEl.setText(`${state} · ${session.taskName}`);
    this.focusMiniEl.setText(`${state} · ${session.taskName}`);
    this.focusStatusEl.setAttribute("aria-label", "Restore focus timer");
    if (!this.focusTimerOpen) window.requestAnimationFrame(() => this.applyMiniPosition());
  }

  async generatePlan(mode: PlanMode, date: string, startTime: string, endTime: string, input: string): Promise<PlanResult> {
    if (!this.pluginSettings.apiBaseUrl || !this.pluginSettings.model) throw new Error("Please configure an API base URL and model first.");
    let customHeaders: Record<string, string> = {};
    try {
      customHeaders = JSON.parse(this.pluginSettings.customHeaders || "{}");
    } catch {
      throw new Error("Custom headers must be valid JSON.");
    }
    const system = mode === "study"
      ? "You create practical same-day homework plans for a child. Break tasks into a sensible order, include short breaks when helpful, and only add review tasks grounded in the given homework."
      : "You create practical same-day work plans. Prioritize by urgency and cognitive load, include buffers, and do not invent work items.";
    const folder = mode === "study" ? this.pluginSettings.studyFolder : this.pluginSettings.workFolder;
    const history = buildHistoryContext(this.app, folder, this.pluginSettings.historyDays);
    const user = `Plan date: ${date}\nStart time: ${startTime || "not specified"}\nLatest finish: ${endTime || "not specified"}\nItems:\n${input}\n\nHistorical timing calibration:\n${history}\n\nUse the calibration only when it has at least two comparable records. Return JSON only, with this shape: {"title":"short title","summary":"one sentence","tasks":[{"title":"task","category":"subject or project","startTime":"HH:mm","endTime":"HH:mm","estimatedMinutes":30,"description":"optional"}],"reviewTasks":[same task shape]}. Use [] for reviewTasks when none are justified.`;
    const baseUrl = this.pluginSettings.apiBaseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json", ...customHeaders };
    const response = await requestPlanCompletion(this.pluginSettings, baseUrl, headers, system, user);
    if (response.status < 200 || response.status >= 300) throw new Error(`API request failed (${response.status}): ${response.text.slice(0, 300)}`);
    const content = completionText(this.pluginSettings.provider, response.json);
    if (typeof content !== "string") throw new Error("The provider did not return a chat completion.");
    return parsePlan(content);
  }

  async writePlan(mode: PlanMode, date: string, plan: PlanResult): Promise<string> {
    const folder = mode === "study" ? this.pluginSettings.studyFolder : this.pluginSettings.workFolder;
    await ensureFolder(this.app, folder);
    const filename = `${date}-${safeFilename(plan.title || (mode === "study" ? "作业计划" : "工作计划"))}.md`;
    const path = normalizePath(`${folder}/${filename}`);
    const content = renderPlan(mode, date, plan);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modify(existing, content);
    else await this.app.vault.create(path, content);
    await this.app.workspace.openLinkText(path, "", true);
    return path;
  }
}

interface FocusTask { id: string; name: string; category: string; estimatedMinutes: number; }

function extractFocusTasks(app: App, file: TFile): FocusTask[] {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  return Object.keys(fm).filter(key => /^task\d+Name$/.test(key)).sort().map(key => {
    const id = key.replace("Name", "");
    return { id, name: String(fm[key] ?? id), category: String(fm[`${id}Category`] ?? ""), estimatedMinutes: Number(fm[`${id}EstimatedMinutes`] ?? 0) };
  });
}

function buildHistoryContext(app: App, folder: string, days: number): string {
  const cutoff = Date.now() - days * 86400000;
  const groups = new Map<string, { planned: number; actual: number; count: number }>();
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(`${normalizePath(folder)}/`) || file.stat.mtime < cutoff) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    for (const key of Object.keys(fm).filter(item => /^task\d+Name$/.test(item))) {
      const id = key.replace("Name", "");
      const planned = Number(fm[`${id}EstimatedMinutes`] ?? 0);
      const actual = Number(fm[`${id}ActualMinutes`] ?? 0) || durationFromTimes(fm[`${id}ActualStart`], fm[`${id}ActualEnd`]);
      if (planned <= 0 || actual <= 0) continue;
      const category = String(fm[`${id}Category`] ?? String(fm[key]).split("·")[0] ?? "其它").trim() || "其它";
      const item = groups.get(category) ?? { planned: 0, actual: 0, count: 0 };
      item.planned += planned; item.actual += actual; item.count += 1; groups.set(category, item);
    }
  }
  const lines = [...groups.entries()].filter(([, value]) => value.count >= 2).sort((a, b) => b[1].count - a[1].count).slice(0, 6).map(([category, value]) => {
    const percent = Math.round((value.actual / value.planned - 1) * 100);
    return `${category}: ${value.count} records, planned ${value.planned} min, actual ${value.actual} min, deviation ${percent >= 0 ? "+" : ""}${percent}%`;
  });
  return lines.length ? lines.join("\n") : "No reliable historical records yet. Use reasonable estimates and a small buffer.";
}

function durationFromTimes(start: unknown, end: unknown): number {
  const parse = (value: unknown): number | null => { const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})$/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
  const from = parse(start), to = parse(end);
  return from === null || to === null ? 0 : (to >= from ? to - from : to + 1440 - from);
}

class FocusTaskPickerModal extends Modal {
  private minutes: number;
  constructor(app: App, private readonly plugin: AIPlannerPlugin, private readonly file: TFile, private readonly tasks: FocusTask[]) { super(app); this.minutes = plugin.pluginSettings.focusMinutes; }
  onOpen(): void {
    this.modalEl.addClass("ai-planner-modal");
    this.titleEl.setText("专注模式 / Focus mode");
    new Setting(this.contentEl).setName("专注时长 / Focus duration").addDropdown(dropdown => dropdown.addOption("25", "25 min").addOption("50", "50 min").addOption("90", "90 min").setValue(String(this.minutes)).onChange(value => this.minutes = Number(value)));
    const custom = this.contentEl.createEl("input", { type: "number", placeholder: "Custom minutes / 自定义分钟" });
    custom.addEventListener("input", () => { const value = Number(custom.value); if (value > 0) this.minutes = value; });
    this.contentEl.createEl("h3", { text: "选择任务 / Choose a task" });
    for (const task of this.tasks) {
      const button = this.contentEl.createEl("button", { cls: "ai-planner-focus-task" });
      button.setText(`${task.category ? `${task.category} · ` : ""}${task.name} (${task.estimatedMinutes || "?"} min)`);
      button.addEventListener("click", () => { this.close(); void this.plugin.startFocus(this.file, task, this.minutes); });
    }
  }
}

class FocusTimerModal extends Modal {
  private interval: number | null = null;
  constructor(app: App, private readonly plugin: AIPlannerPlugin) { super(app); }

  onOpen(): void {
    const session = this.plugin.getActiveFocus();
    if (!session) { this.close(); return; }
    this.plugin.setFocusTimerOpen(true);
    this.modalEl.addClass("ai-planner-modal", "ai-planner-focus-timer");
    this.titleEl.setText("专注中 / Focusing");
    this.contentEl.createEl("p", { text: session.taskName, cls: "ai-planner-focus-title" });
    const clock = this.contentEl.createEl("div", { cls: "ai-planner-focus-clock" });
    this.contentEl.createEl("p", {
      text: "关闭此窗口只会最小化，计时会保留。手机切换到其它 App 后按经过的墙上时间估算；iOS 可能暂停或回收 Obsidian，因此这不代表已验证的专注或阅读时长。 / Closing only minimizes this timer. Mobile background time is a wall-clock estimate; iOS may suspend or terminate Obsidian, so it is not verified focus or reading time.",
      cls: "ai-planner-focus-disclaimer"
    });
    const action = this.contentEl.createDiv({ cls: "modal-button-container" });
    const pause = action.createEl("button", { text: "暂停 / Pause" });
    const finish = action.createEl("button", { text: "结束 / Finish", cls: "mod-cta" });
    const refresh = (): void => {
      const current = this.plugin.getActiveFocus();
      if (!current) { this.close(); return; }
      const elapsed = current.focusedMs + (current.runningAt === null ? 0 : Math.max(0, Date.now() - current.runningAt));
      const remaining = Math.max(0, current.durationMs - elapsed);
      clock.setText(formatDuration(remaining));
      pause.setText(current.runningAt === null ? "继续 / Resume" : "暂停 / Pause");
      if (remaining <= 0) void this.plugin.finishFocus();
    };
    pause.addEventListener("click", () => void this.plugin.toggleFocusPause().then(refresh));
    finish.addEventListener("click", () => void this.plugin.finishFocus().then(() => this.close()));
    this.interval = window.setInterval(refresh, 500); refresh();
  }
  onClose(): void {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.plugin.setFocusTimerOpen(false);
  }
}

class PlanInputModal extends Modal {
  private mode: PlanMode = "study";
  private date = localDate();
  private startTime = "";
  private endTime = "";
  private input = "";

  constructor(app: App, private readonly plugin: AIPlannerPlugin) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("ai-planner-modal");
    this.titleEl.setText("AI Planner / AI 计划");
    new Setting(this.contentEl).setName("模式 / Mode").addDropdown(dropdown => dropdown
      .addOption("study", "作业与学习 / Homework & study")
      .addOption("work", "工作 / Work")
      .setValue(this.mode)
      .onChange(value => this.mode = value as PlanMode));
    new Setting(this.contentEl).setName("计划日期 / Plan date").addText(input => input
      .setValue(this.date).setPlaceholder("YYYY-MM-DD").onChange(value => this.date = value));
    new Setting(this.contentEl).setName("开始时间 / Start time").setDesc("例如 / Example: 19:00").addText(input => input
      .setValue(this.startTime).setPlaceholder("19:00").onChange(value => this.startTime = value));
    new Setting(this.contentEl).setName("最晚结束 / Latest finish").setDesc("可选 / Optional.").addText(input => input
      .setValue(this.endTime).setPlaceholder("21:00").onChange(value => this.endTime = value));
    new Setting(this.contentEl).setName("任务或作业 / Tasks or homework").setDesc("填写科目/项目、任务量、截止时间和限制条件。");
    const sourceBar = this.contentEl.createDiv({ cls: "ai-planner-source" });
    const sourceLabel = sourceBar.createSpan({ text: "来源 / Source: 手动输入 / manual input" });
    const useActiveButton = sourceBar.createEl("button", { text: "使用当前笔记 / Use current note" });
    const chooseButton = sourceBar.createEl("button", { text: "选择 Markdown 笔记 / Choose note" });
    const area = this.contentEl.createEl("textarea", { cls: "ai-planner-input" });
    area.rows = 8;
    area.placeholder = "Example: Math workbook pages 12-14; memorize 20 English words; Chinese reading aloud.";
    area.addEventListener("input", () => this.input = area.value);
    const loadSource = async (file: TFile): Promise<void> => {
      const content = await this.app.vault.read(file);
      this.input = content;
      area.value = content;
      sourceLabel.setText(`来源 / Source: ${file.path}`);
    };
    useActiveButton.addEventListener("click", async () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile || activeFile.extension !== "md") return new Notice("请先打开一个 Markdown 笔记 / Open a Markdown note first.");
      try { await loadSource(activeFile); } catch { new Notice("Could not read the current note."); }
    });
    chooseButton.addEventListener("click", () => new MarkdownFilePickerModal(this.app, async file => {
      try { await loadSource(file); } catch { new Notice("Could not read that note."); }
    }).open());
    const action = this.contentEl.createDiv({ cls: "modal-button-container" });
    const button = action.createEl("button", { text: "生成预览 / Generate preview", cls: "mod-cta" });
    button.addEventListener("click", async () => {
      if (!this.input.trim()) return new Notice("请至少填写一项任务 / Enter at least one task first.");
      button.disabled = true;
      button.setText("正在生成 / Generating...");
      try {
        const plan = await this.plugin.generatePlan(this.mode, this.date, this.startTime, this.endTime, this.input);
        this.close();
        new PlanPreviewModal(this.app, this.plugin, this.mode, this.date, plan).open();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "Could not generate plan.");
        button.disabled = false;
        button.setText("生成预览 / Generate preview");
      }
    });
  }
}

class MarkdownFilePickerModal extends Modal {
  private query = "";
  private readonly files: TFile[];
  private resultsEl: HTMLElement;

  constructor(app: App, private readonly onChoose: (file: TFile) => void | Promise<void>) {
    super(app);
    this.files = app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    this.resultsEl = document.createElement("div");
  }

  onOpen(): void {
    this.modalEl.addClass("ai-planner-modal", "ai-planner-file-picker");
    this.titleEl.setText("选择 Markdown 笔记 / Choose note");
    const search = this.contentEl.createEl("input", { type: "search", placeholder: "搜索笔记 / Search notes...", cls: "ai-planner-file-search" });
    search.addEventListener("input", () => { this.query = search.value.trim().toLowerCase(); this.renderResults(); });
    this.resultsEl = this.contentEl.createDiv({ cls: "ai-planner-file-results" });
    this.renderResults();
    search.focus();
  }

  private renderResults(): void {
    this.resultsEl.empty();
    const matches = this.files.filter(file => file.path.toLowerCase().includes(this.query)).slice(0, 100);
    if (!matches.length) { this.resultsEl.createEl("p", { text: "No Markdown notes found." }); return; }
    for (const file of matches) {
      const button = this.resultsEl.createEl("button", { cls: "ai-planner-file-item" });
      button.createEl("strong", { text: file.basename });
      button.createEl("small", { text: file.path });
      button.addEventListener("click", async () => { await this.onChoose(file); this.close(); });
    }
  }
}

class PlanPreviewModal extends Modal {
  constructor(app: App, private readonly plugin: AIPlannerPlugin, private readonly mode: PlanMode, private readonly date: string, private readonly plan: PlanResult) { super(app); }

  onOpen(): void {
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
        new Notice(`Plan written: ${path}`);
        this.close();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "Could not write plan.");
      }
    });
  }
}

class AIPlannerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: AIPlannerPlugin) { super(app, plugin); }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "AI Planner 设置 / Settings" });
    this.containerEl.createEl("p", { text: "Claude 与 Gemini 使用原生接口；其它预设使用 OpenAI-compatible 接口。Claude and Gemini use native API formats." });
    new Setting(this.containerEl).setName("界面语言 / Interface language").addDropdown(dropdown => dropdown
      .addOption("auto", "跟随系统 / Follow system")
      .addOption("zh", "中文")
      .addOption("en", "English")
      .setValue(this.plugin.pluginSettings.interfaceLanguage)
      .onChange(async value => { this.plugin.pluginSettings.interfaceLanguage = value as InterfaceLanguage; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("服务商预设 / Provider preset").setDesc("选择后会填入推荐地址与模型，可继续手动修改。").addDropdown(dropdown => {
      for (const [id, preset] of Object.entries(PROVIDERS)) dropdown.addOption(id, preset.label);
      dropdown.setValue(this.plugin.pluginSettings.provider).onChange(async value => {
        const provider = value as ProviderId;
        this.plugin.pluginSettings.provider = provider;
        if (provider !== "custom") {
          this.plugin.pluginSettings.apiBaseUrl = PROVIDERS[provider].baseUrl;
          this.plugin.pluginSettings.model = PROVIDERS[provider].model;
        }
        await this.plugin.saveSettings();
        this.display();
      });
    });
    this.textSetting("API 地址 / API base URL", "例如 / Example: https://api.openai.com/v1", "apiBaseUrl");
    new Setting(this.containerEl).setName("API 密钥 / API key").setDesc("Stored in this plugin's data.json.").addText(input => {
      input.setValue(this.plugin.pluginSettings.apiKey).setPlaceholder("sk-...");
      input.inputEl.type = "password";
      input.onChange(async value => { this.plugin.pluginSettings.apiKey = value; await this.plugin.saveSettings(); });
    });
    this.textSetting("模型 / Model", "例如 / Example: gpt-4.1-mini, deepseek-chat, glm-4-flash", "model");
    this.textSetting("自定义请求头 / Custom headers", "JSON object, optional.", "customHeaders");
    new Setting(this.containerEl).setName("温度 / Temperature").addText(input => input.setValue(String(this.plugin.pluginSettings.temperature)).onChange(async value => { this.plugin.pluginSettings.temperature = Number(value) || 0; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("最大输出长度 / Max output tokens").addText(input => input.setValue(String(this.plugin.pluginSettings.maxTokens)).onChange(async value => { this.plugin.pluginSettings.maxTokens = Number(value) || DEFAULT_SETTINGS.maxTokens; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("历史校准天数 / History days").setDesc("生成计划时读取近期真实用时，建议 7-30 天。").addText(input => input.setValue(String(this.plugin.pluginSettings.historyDays)).onChange(async value => { this.plugin.pluginSettings.historyDays = Math.max(1, Number(value) || DEFAULT_SETTINGS.historyDays); await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("默认专注分钟 / Default focus minutes").addText(input => input.setValue(String(this.plugin.pluginSettings.focusMinutes)).onChange(async value => { this.plugin.pluginSettings.focusMinutes = Math.max(1, Number(value) || DEFAULT_SETTINGS.focusMinutes); await this.plugin.saveSettings(); }));
    this.textSetting("学习输出目录 / Study output folder", "Vault-relative path.", "studyFolder");
    this.textSetting("工作输出目录 / Work output folder", "Vault-relative path.", "workFolder");
  }

  private textSetting(name: string, desc: string, key: "apiBaseUrl" | "model" | "customHeaders" | "studyFolder" | "workFolder"): void {
    new Setting(this.containerEl).setName(name).setDesc(desc).addText(input => input.setValue(this.plugin.pluginSettings[key]).onChange(async value => { this.plugin.pluginSettings[key] = value.trim(); await this.plugin.saveSettings(); }));
  }
}

function parsePlan(content: string): PlanResult {
  const json = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(json) as PlanResult;
  if (!parsed.title || !Array.isArray(parsed.tasks)) throw new Error("The model returned an invalid plan format.");
  parsed.tasks = parsed.tasks.map(normalizeTask).filter(Boolean) as PlanTask[];
  parsed.reviewTasks = Array.isArray(parsed.reviewTasks) ? parsed.reviewTasks.map(normalizeTask).filter(Boolean) as PlanTask[] : [];
  if (!parsed.tasks.length) throw new Error("The model did not return any tasks.");
  return parsed;
}

function normalizeTask(value: unknown): PlanTask | null {
  if (!value || typeof value !== "object") return null;
  const task = value as Partial<PlanTask>;
  if (!task.title) return null;
  return { title: String(task.title), category: task.category ? String(task.category) : "", startTime: task.startTime ? String(task.startTime) : "", endTime: task.endTime ? String(task.endTime) : "", estimatedMinutes: Math.max(1, Number(task.estimatedMinutes) || 30), description: task.description ? String(task.description) : "" };
}

function renderPlan(mode: PlanMode, date: string, plan: PlanResult): string {
  const allTasks = [...plan.tasks, ...(plan.reviewTasks ?? [])];
  const frontmatter = allTasks.flatMap((task, index) => {
    const id = `task${String(index + 1).padStart(2, "0")}`;
    return [`${id}Name: ${yamlQuote(task.title)}`, `${id}Category: ${yamlQuote(task.category || "其它")}`, `${id}EstimatedMinutes: ${task.estimatedMinutes}`, `${id}ActualStart:`, `${id}ActualEnd:`, `${id}ActualMinutes: 0`, `${id}FocusSessions: 0`];
  });
  const taskCards = (label: string, tasks: PlanTask[], offset: number) => tasks.length ? `## ${label}\n\n${tasks.map((task, index) => renderTask(task, date, offset + index + 1)).join("\n\n")}` : `## ${label}\n\n暂无安排。`;
  return `---\ntype: ${mode === "study" ? "每日作业计划" : "每日工作计划"}\nplanDate: ${date}\ntags:\n  - AI计划\n${frontmatter.join("\n")}\n---\n\n# ${plan.title}\n\n> [!abstract] 概览\n> ${plan.summary || "由 AI Planner 生成，执行后填写每项实际开始和完成时间。"}\n\n${taskCards(mode === "study" ? "作业计划表" : "工作计划表", plan.tasks, 0)}\n\n${mode === "study" ? taskCards("复习计划表", plan.reviewTasks ?? [], plan.tasks.length) : ""}\n`;
}

function renderTask(task: PlanTask, date: string, index: number): string {
  const prefix = task.category ? `${task.category} · ` : "";
  const time = task.startTime && task.endTime ? `${task.startTime}-${task.endTime}` : "待安排";
  const note = task.description ? `\n> ${task.description}` : "";
  return `> [!todo]+ ${prefix}${task.title}\n> 时段：${time} · ${task.estimatedMinutes} 分钟\n> 实际开始：____ · 实际完成：____${note}\n> - [ ] ${task.title} 📅 ${date} #计划`;
}

function renderPreviewTasks(parent: HTMLElement, label: string, tasks: PlanTask[]): void {
  parent.createEl("h3", { text: label });
  if (!tasks.length) { parent.createEl("p", { text: "None" }); return; }
  const list = parent.createEl("ul");
  for (const task of tasks) list.createEl("li", { text: `${task.startTime || ""}${task.endTime ? `-${task.endTime}` : ""} ${task.title} (${task.estimatedMinutes} min)`.trim() });
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = normalizePath(folder).split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join("/");
    if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path);
  }
}

function safeFilename(value: string): string { return value.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 80) || "AI计划"; }
function yamlQuote(value: string): string { return JSON.stringify(value); }
function timeOfDay(date: Date): string { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
function formatDuration(milliseconds: number): string { const total = Math.ceil(milliseconds / 1000); return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function localDate(): string { const now = new Date(); const offset = now.getTimezoneOffset() * 60000; return new Date(now.getTime() - offset).toISOString().slice(0, 10); }
