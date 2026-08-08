# Cursor Hybrid Analysis Workflow

Chrome cannot write into this git repo directly. The extension downloads scrape JSON under your Downloads folder; a symlink makes those files appear here for Cursor.

## One-time setup

1. Ensure these folders exist in the repo (already committed):
   - `data/snapshots/`
   - `data/predictions/`
   - `data/prompt.md`

2. Create the Downloads side and symlink **either**:

```bash
# Option A — repo data/ points at Downloads (recommended)
rm -rf ~/Documents/oipulse-strength-alert/data/snapshots
mkdir -p ~/Downloads/oipulse-data/snapshots ~/Downloads/oipulse-data/predictions
ln -s ~/Downloads/oipulse-data/snapshots ~/Documents/oipulse-strength-alert/data/snapshots

# Keep predictions in the repo (or symlink similarly if you prefer)
# mkdir -p ~/Downloads/oipulse-data/predictions
# ln -s ~/Downloads/oipulse-data/predictions ~/Documents/oipulse-strength-alert/data/predictions
```

```bash
# Option B — Downloads points at repo data/
mkdir -p ~/Documents/oipulse-strength-alert/data/snapshots \
         ~/Documents/oipulse-strength-alert/data/predictions
mkdir -p ~/Downloads/oipulse-data
ln -sfn ~/Documents/oipulse-strength-alert/data ~/Downloads/oipulse-data
```

3. In Chrome: turn **off** “Ask where to save each file before downloading” for this flow, so files land at:

`~/Downloads/oipulse-data/snapshots/oipulse-trending-oi-<timestamp>.json`

4. In the extension Options: enable **Auto-download JSON after each successful scrape** (recommended).

## Daily loop

### A. Scrape
1. Open the OIPulse Trending OI tab (logged in).
2. Click **Scrape now** (or wait for the 3-minute monitor).
3. Click **Export for Cursor** if you need a fresh JSON without waiting for auto-download.
4. Confirm a new file under `data/snapshots/` (via symlink).

### B. Analyze in Cursor chat
Paste a message like:

```text
Use @data/prompt.md and @data/snapshots/<latest-file>.json
and produce the institutional phase report in the exact output format
from the prompt. Write the result to data/predictions/latest.md
```

Tips:
- Prefer `@`-mentioning the **specific latest JSON**, not just the folder.
- Ask Cursor to **write the file**, not only paste markdown in chat.
- Optional archive: also save `data/predictions/prediction-YYYYMMDD-HHMM.md`.

### C. Load into the extension
1. Open the extension popup.
2. Click **Load analysis**.
3. Pick `data/predictions/latest.md`.
4. The **AI Market Summary** section renders the phases.

## Paths cheat sheet

| Role | Path |
| --- | --- |
| Prompt | `data/prompt.md` |
| Scrape JSON | `Downloads/oipulse-data/snapshots/*.json` → `data/snapshots/` |
| Cursor output | `data/predictions/latest.md` |
| Popup import | **Load analysis** file picker |
