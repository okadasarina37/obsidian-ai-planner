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
  studyFolder: string;
  workFolder: string;
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

  async onload(): Promise<void> {
    this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new AIPlannerSettingTab(this.app, this));
    this.addCommand({
      id: "create-ai-plan",
      name: "Create AI plan",
      callback: () => new PlanInputModal(this.app, this).open()
    });
    this.addRibbonIcon("calendar-plus", "Create AI plan", () => new PlanInputModal(this.app, this).open());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.pluginSettings);
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
    const user = `Plan date: ${date}\nStart time: ${startTime || "not specified"}\nLatest finish: ${endTime || "not specified"}\nItems:\n${input}\n\nReturn JSON only, with this shape: {"title":"short title","summary":"one sentence","tasks":[{"title":"task","category":"subject or project","startTime":"HH:mm","endTime":"HH:mm","estimatedMinutes":30,"description":"optional"}],"reviewTasks":[same task shape]}. Use [] for reviewTasks when none are justified.`;
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
    return [`${id}Name: ${yamlQuote(task.title)}`, `${id}EstimatedMinutes: ${task.estimatedMinutes}`, `${id}ActualStart:`, `${id}ActualEnd:`];
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
function localDate(): string { const now = new Date(); const offset = now.getTimezoneOffset() * 60000; return new Date(now.getTime() - offset).toISOString().slice(0, 10); }
