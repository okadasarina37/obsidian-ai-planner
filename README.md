# AI Planner for Obsidian

An open-source Obsidian plugin that creates study and work plans through any OpenAI-compatible API.

## Features

- Configurable API base URL, API key, model, custom headers, temperature, and output limit.
- Study and work modes, with configurable output folders.
- Preview before writing files.
- Native Markdown tasks and YAML fields for planned and actual times.
- No dependency on Dataview or Meta Bind.

## Development

```bash
npm install
npm run dev
```

Copy `main.js` and `manifest.json` to `<vault>/.obsidian/plugins/ai-planner/` to test.

## Security

Plugin settings are stored by Obsidian. Do not sync `data.json` to an untrusted remote if it contains an API key. A proxy endpoint can be used instead of a direct provider key.

## License

MIT
