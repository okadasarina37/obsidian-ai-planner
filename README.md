# AI Planner for Obsidian

[中文](#中文说明) | [English](#english)

An open-source Obsidian plugin for creating practical study and work plans with your own AI provider. It can read a note as source material, generate a reviewable plan, track focus sessions, and use recorded time to improve future estimates.

## 中文说明

### 功能

- 作业/学习与工作两种计划模式，输出目录可自行设置。
- 输入可手动粘贴、读取当前笔记，或搜索选择库内 Markdown 笔记。
- AI 先生成预览，确认后才写入原生 Markdown 任务卡。
- 内置中英双语界面标签。
- API 服务商预设：OpenAI、Claude、DeepSeek、智谱 GLM、Kimi、Gemini，以及自定义 OpenAI-compatible 接口。
- Claude 与 Gemini 使用原生 API；DeepSeek、GLM、Kimi 使用兼容的 `chat/completions` API。
- 专注模式：从当前计划笔记中选择任务，支持 25/50/90 分钟或自定义时长，暂停、继续和结束。
- 专注结束后自动写入实际开始/结束、累计专注分钟数和专注次数。
- 历史时间校准：生成计划时读取近期记录，按任务分类比较预计/实际时长；同类至少两条有效记录才用于调整新任务时长和缓冲。

### 安装

**BRAT（推荐）**

1. 安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 在 BRAT 中添加仓库：`okadasarina37/obsidian-ai-planner`。
3. 启用 `AI Planner`，之后可在 BRAT 的已安装插件列表更新版本。

**手动安装**

从最新 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`，放入：

```text
<你的库>/.obsidian/plugins/ai-planner/
```

重启 Obsidian 或在社区插件页面重新加载插件。

### 配置 API

打开 `设置 -> 社区插件 -> AI Planner`：

1. 选择“服务商预设”。它会填写推荐 API 地址和默认模型。
2. 输入自己的 API Key；模型名可以按账户权限自行修改。
3. 自建服务、OpenRouter、Ollama、LM Studio 等选择“自定义兼容接口”，填写兼容 OpenAI 的 Base URL、模型和可选 Header。

提示：Claude 与 Gemini 选择各自预设后无需手动改请求路径。API Key 保存在插件的 `data.json` 中；若 `.obsidian` 会同步到不可信远端，请使用代理 API 或将该文件排除同步。

### 生成计划

1. 命令面板运行 `AI Planner: Create AI plan`。
2. 选择作业/学习或工作，填写日期、开始时间和可选的最晚结束时间。
3. 手动填写任务，或使用“使用当前笔记 / Use current note”“选择 Markdown 笔记 / Choose note”读取原始内容。
4. 点击“生成预览 / Generate preview”，检查任务、时段和预计分钟数。
5. 点击“写入计划 / Write plan”。计划会写入设置中的学习或工作目录。

### 专注与时间校准

在生成后的计划笔记中运行命令 `AI Planner: Start focus session`，选择任务和时长。开始时会立即写入任务的实际开始时间。关闭专注窗口只会最小化，不会结束会话；点击右下角悬浮迷你计时条可恢复窗口，桌面端也可点击底部状态栏。插件重启后会从保存的开始时间和累计时长恢复会话。结束专注后，插件会回写结束时间和累计专注分钟数。

#### 后台与系统限制

- 桌面版最小化 Obsidian 后，计时会按经过时间继续计算。
- 手机切换到其它 App 后，恢复时显示的是经过的**墙上时间估算**，不是已验证的专注或阅读时长。
- iPhone/iPad 的 iOS 可能暂停或回收后台的 Obsidian。插件会保留已保存的会话并在返回后尝试恢复，但无法保证后台脚本持续运行，也无法确认外部电子书 App 中的实际阅读行为。

新计划会读取设置中“历史校准天数”范围内的同目录计划。每个任务分类至少积累两条有效的预计/实际时长后，才会调整后续估时，避免少量偶然记录影响安排。

## English

### Features

- Study/homework and work planning modes with configurable output folders.
- Paste content, use the active note, or search Markdown notes in the vault as input.
- Preview every AI plan before it writes native Markdown task cards.
- Bilingual Chinese/English interface labels.
- Provider presets for OpenAI, Claude, DeepSeek, Zhipu GLM, Kimi, Gemini, and custom OpenAI-compatible APIs.
- Native Claude Messages and Gemini GenerateContent adapters.
- Focus sessions with task selection, 25/50/90-minute presets, custom duration, pause, resume, and finish.
- Focus sessions write actual time and focused minutes back to the plan.
- Historical calibration improves future estimates from recent planned versus actual time records.

### Install

Use [BRAT](https://github.com/TfTHacker/obsidian42-brat) and add:

```text
okadasarina37/obsidian-ai-planner
```

Alternatively, download `main.js`, `manifest.json`, and `styles.css` from the latest release into `<vault>/.obsidian/plugins/ai-planner/`.

### Use

Run `AI Planner: Create AI plan` from the command palette. Configure a provider, choose a mode, provide source content, review the generated plan, and write it to your vault. Open a generated plan and run `AI Planner: Start focus session` to record focused time.

### Background and system limits

Starting a focus session writes the actual start time immediately. Closing the focus window minimizes it without ending the session. Click the floating mini timer in the lower-right corner to reopen it; on desktop, the status-bar item also restores it. The session is saved and can be restored after Obsidian restarts.

- On desktop, minimizing Obsidian continues the timer based on elapsed time.
- On mobile, time shown after switching to another app is a **wall-clock estimate**, not verified focus or reading time.
- iOS may suspend or terminate Obsidian in the background. The plugin restores saved session data when possible, but cannot guarantee background execution or verify reading performed in an external ebook app.

## Development

```bash
npm install
npm run dev
```

Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/ai-planner/` to test.

## License

[MIT](LICENSE)
