import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath, requestUrl } from "obsidian";

type PlanMode = "study" | "work";

interface PlannerSettings {
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
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  customHeaders: "{}",
  temperature: 0.3,
  maxTokens: 1800,
  studyFolder: "06_Todo/学习",
  workFolder: "01_项目/工作计划"
};

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
    const endpoint = `${this.pluginSettings.apiBaseUrl.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json", ...customHeaders };
    if (this.pluginSettings.apiKey) headers.Authorization = `Bearer ${this.pluginSettings.apiKey}`;
    const response = await requestUrl({
      url: endpoint,
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.pluginSettings.model,
        temperature: this.pluginSettings.temperature,
        max_tokens: this.pluginSettings.maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: user }]
      }),
      throw: false
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`API request failed (${response.status}): ${response.text.slice(0, 300)}`);
    const content = response.json?.choices?.[0]?.message?.content;
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
    this.titleEl.setText("AI Planner");
    new Setting(this.contentEl).setName("Mode").addDropdown(dropdown => dropdown
      .addOption("study", "Homework / study")
      .addOption("work", "Work")
      .setValue(this.mode)
      .onChange(value => this.mode = value as PlanMode));
    new Setting(this.contentEl).setName("Plan date").addText(input => input
      .setValue(this.date).setPlaceholder("YYYY-MM-DD").onChange(value => this.date = value));
    new Setting(this.contentEl).setName("Start time").setDesc("For example, 19:00.").addText(input => input
      .setValue(this.startTime).setPlaceholder("19:00").onChange(value => this.startTime = value));
    new Setting(this.contentEl).setName("Latest finish").setDesc("Optional.").addText(input => input
      .setValue(this.endTime).setPlaceholder("21:00").onChange(value => this.endTime = value));
    new Setting(this.contentEl).setName("Tasks or homework").setDesc("Include subject/project, amount, deadline, and constraints.");
    const area = this.contentEl.createEl("textarea", { cls: "ai-planner-input" });
    area.rows = 8;
    area.placeholder = "Example: Math workbook pages 12-14; memorize 20 English words; Chinese reading aloud.";
    area.addEventListener("input", () => this.input = area.value);
    const action = this.contentEl.createDiv({ cls: "modal-button-container" });
    const button = action.createEl("button", { text: "Generate preview", cls: "mod-cta" });
    button.addEventListener("click", async () => {
      if (!this.input.trim()) return new Notice("Enter at least one task first.");
      button.disabled = true;
      button.setText("Generating...");
      try {
        const plan = await this.plugin.generatePlan(this.mode, this.date, this.startTime, this.endTime, this.input);
        this.close();
        new PlanPreviewModal(this.app, this.plugin, this.mode, this.date, plan).open();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "Could not generate plan.");
        button.disabled = false;
        button.setText("Generate preview");
      }
    });
  }
}

class PlanPreviewModal extends Modal {
  constructor(app: App, private readonly plugin: AIPlannerPlugin, private readonly mode: PlanMode, private readonly date: string, private readonly plan: PlanResult) { super(app); }

  onOpen(): void {
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
    this.containerEl.createEl("h2", { text: "AI Planner settings" });
    this.containerEl.createEl("p", { text: "Uses the OpenAI-compatible /chat/completions API. Keep API keys out of synced vault settings when possible." });
    this.textSetting("API base URL", "For example: https://api.openai.com/v1", "apiBaseUrl");
    new Setting(this.containerEl).setName("API key").setDesc("Stored in this plugin's data.json.").addText(input => {
      input.setValue(this.plugin.pluginSettings.apiKey).setPlaceholder("sk-...");
      input.inputEl.type = "password";
      input.onChange(async value => { this.plugin.pluginSettings.apiKey = value; await this.plugin.saveSettings(); });
    });
    this.textSetting("Model", "For example: gpt-4.1-mini, deepseek-chat, qwen-plus", "model");
    this.textSetting("Custom headers", "JSON object, optional.", "customHeaders");
    new Setting(this.containerEl).setName("Temperature").addText(input => input.setValue(String(this.plugin.pluginSettings.temperature)).onChange(async value => { this.plugin.pluginSettings.temperature = Number(value) || 0; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Max output tokens").addText(input => input.setValue(String(this.plugin.pluginSettings.maxTokens)).onChange(async value => { this.plugin.pluginSettings.maxTokens = Number(value) || DEFAULT_SETTINGS.maxTokens; await this.plugin.saveSettings(); }));
    this.textSetting("Study output folder", "Vault-relative path.", "studyFolder");
    this.textSetting("Work output folder", "Vault-relative path.", "workFolder");
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
