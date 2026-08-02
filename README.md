# OIPulse Strength Alert

Chrome extension (Manifest V3) that:

1. Scrapes the [OIPulse Trending OI](https://oipulse.com/app/options-analysis/trending-oi) table into JSON
2. Every 3 minutes: refreshes the page, re-scrapes, and notifies when first-row **Strength** is above `+40%` or below `-40%`
3. Summarizes the table into a **2-hour dataframe** using **MLX** (local, default), **Ollama**, or **OpenAI**

## Install (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. Open [Trending OI](https://oipulse.com/app/options-analysis/trending-oi) while logged in
5. Click the extension icon → **Scrape now**

## MLX setup (default, Apple Silicon)

MLX runs the model locally with an OpenAI-compatible server. One-time install has already been done in a dedicated venv at `~/.mlx-oipulse/venv` with model `mlx-community/Qwen3-14B-4bit` (~8 GB, cached in `~/.cache/huggingface`).

Start the server (keep this terminal open while you use the extension):

```bash
./start-mlx.sh
# or explicitly:
~/.mlx-oipulse/venv/bin/mlx_lm.server --model mlx-community/Qwen3-14B-4bit --port 8080
```

Then in the extension **Options** → provider **MLX** → **Test connection** → **Summarize 2h**.

Notes:
- The server exposes `http://localhost:8080/v1/...` (OpenAI-compatible). No CORS/origin flag needed.
- Qwen3 is a reasoning model; the extension sends `/no_think` so the summary is concise and doesn't waste tokens on chain-of-thought.
- First request after startup loads the model into memory (a few seconds).
- To re-create the venv from scratch:

```bash
python3 -m venv ~/.mlx-oipulse/venv
~/.mlx-oipulse/venv/bin/python -m pip install -U mlx-lm
```

## Ollama setup (fixes 403 Forbidden)

Chrome extensions send an `Origin: chrome-extension://…` header. Ollama rejects that with **403** unless you allow it.

1. Quit the Ollama menu-bar app completely (macOS).
2. Start Ollama from a terminal (copy the exact command from **Options**):

```bash
OLLAMA_ORIGINS="chrome-extension://coffpkiglohjgngmecicphekhfkgneil//*" ollama serve
```

3. Pull/run your model, e.g. `ollama pull qwen3:8b`
4. In **Options** → **Test connection**

## Alert sound

On Strength breach the extension shows a Chrome notification and plays a short beep (via an offscreen document). Toggle this in Options; use **Test alert sound** to verify. Also allow notifications for Chrome in macOS System Settings if banners are silent.

## Where is the scraped JSON saved?

By default it is **not** written as a file in this project folder. It is stored in **`chrome.storage.local`** inside the browser profile.

To get a real `.json` file:

- Click **Download JSON** in the popup (saves under your Downloads folder), or
- Enable **Auto-download JSON after each successful scrape** in Options

## OpenAI setup

1. Open **Options**
2. Select **OpenAI**
3. Paste your API key (stored only in `chrome.storage.local` on this device)
4. Choose a model (default `gpt-4o-mini`)
5. Click **Test connection**, then **Save settings**

## Usage

| Control | What it does |
|--------|----------------|
| Monitoring toggle | Enables/disables the 3-minute reload + scrape + alert loop |
| Scrape now | Scrapes the open tab without waiting for the alarm |
| Summarize 2h | Buckets rows into NSE 2h windows and asks the selected LLM for a summary |
| Options | Thresholds, auto-open tab, LLM provider settings |

## Alert behavior

- Checks the **first table row** Strength value
- Default thresholds: `> 40` or `< -40` (configurable)
- Dedupes with `date|time|strength` so the same bar does not spam every minute

## Manual test checklist

- [ ] Load unpacked extension
- [ ] Open Trending OI logged in; **Scrape now** returns a row count
- [ ] First-row Strength outside ±40% → one notification; same row does not repeat
- [ ] After ~3 minutes with monitoring on: tab reloads and scrape updates
- [ ] MLX server running (`./start-mlx.sh`) → 2h summary appears
- [ ] Ollama running → 2h summary appears
- [ ] OpenAI with key → summary works; bad key shows a clear error

## Project layout

```
manifest.json
background.js
content.js
popup.html / popup.js / popup.css
options.html / options.js / options.css
lib/parse.js
lib/summarize.js
lib/llm.js
icons/
start-mlx.sh
plan.md
```

## Notes

- Keep the Trending OI tab open and authenticated (content-script scrape)
- MV3 uses `chrome.alarms` (not `setInterval`) so checks survive service-worker sleep
- If OIPulse changes their DOM, adjust selectors in `content.js`
