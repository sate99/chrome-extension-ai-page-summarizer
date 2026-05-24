# Page Summarizer

A Chrome extension that summarizes any web page instantly using AI — supports Claude (Anthropic), ChatGPT (OpenAI), or any custom/self-hosted endpoint.

**Author:** Satendra

---

## Features

- One-click page summarization
- Supports Claude, OpenAI, and custom AI endpoints (Ollama, LM Studio, Groq, corporate gateways, etc.)
- Multiple models per custom endpoint — switch instantly from the popup
- API keys stored locally on your device, never shared with anyone
- Renders markdown-formatted summaries (bold, lists, headings)
- Copy summary to clipboard
- Clean, minimal popup UI

---

## Installation

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- An API key from one of the supported providers

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/your-username/page-summarizer.git
cd page-summarizer
```

**2. Generate icons**

```bash
python3 generate_icons.py
```

**3. Load the extension in Chrome**

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `page-summarizer` folder

**4. Configure your API key**

The settings page opens automatically on first install.

- Select your **AI Provider** (Claude, OpenAI, or Custom)
- Enter your **API key**
- Click **Save**

**5. Use it**

- Navigate to any webpage
- Click the **Page Summarizer** icon in the toolbar
- Click **Summarize This Page**

---

## Provider Setup

### Claude (Anthropic)

| Field | Value |
|---|---|
| API Key | Get from [console.anthropic.com/keys](https://console.anthropic.com/keys) — starts with `sk-ant-` |
| Model | `claude-sonnet-4-6` (recommended), `claude-opus-4-7`, `claude-haiku-4-5-20251001` |

### ChatGPT (OpenAI)

| Field | Value |
|---|---|
| API Key | Get from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Model | `gpt-4o` (recommended), `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` |

### Custom / Self-hosted

For corporate gateways, Ollama, LM Studio, Groq, Azure OpenAI, or any OpenAI/Anthropic-compatible endpoint.

| Field | Value |
|---|---|
| API Format | **Anthropic-compatible** for Claude proxies · **OpenAI-compatible** for everything else |
| Auth Header | **Bearer** for corporate gateways · **x-api-key** for standard Anthropic API |
| Base URL | e.g. `https://llm-gateway.company.com/anthropic` or `https://localhost:11434/v1` |
| API Key | Your token or API key |
| Model Names | Comma-separated — e.g. `vertex/claude-sonnet-4-6, vertex/claude-haiku-4-5` |

When multiple models are entered, a **Model** switcher appears in the popup for quick switching.

---

## Project Structure

```
page-summarizer/
├── manifest.json        # Chrome extension config (MV3)
├── background.js        # Service worker — all API calls run here (no CORS issues)
├── popup.html/css/js    # Extension popup UI
├── options.html/css/js  # Settings page (API keys, provider config)
├── icons/               # Extension icons (16, 48, 128px)
└── generate_icons.py    # One-time script to generate PNG icons
```

---

## Security

- API keys are stored in `chrome.storage.local` — **device only**, never synced to Google servers
- All API calls run in the **background service worker** — bypasses CORS, no data leaks through browser
- Content Security Policy enforced via `manifest.json` — no external scripts can run
- No analytics, telemetry, or third-party requests of any kind
- Keys are sent **only** to the endpoint URL you configure

---

## License

MIT
