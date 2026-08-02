import { buildSummaryPrompt } from "./lib/summarize.js";
import { summarizeWithProvider, testOllama, testOpenAI, testMLX } from "./lib/llm.js";

const ALARM_NAME = "oiCheck";
const TRENDING_OI_URL = "https://oipulse.com/app/options-analysis/trending-oi";
const TRENDING_OI_MATCH = "oipulse.com/app/options-analysis/trending-oi";
const HISTORY_CAP = 500;
const SETTLE_MS = 2500;
const OFFSCREEN_URL = "offscreen.html";

const DEFAULT_SETTINGS = {
  llmProvider: "mlx",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5-coder:1.5b-base",
  mlxUrl: "http://localhost:8080",
  mlxModel: "mlx-community/Qwen3-14B-4bit",
  mlxReasoning: true,
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  strengthHigh: 40,
  strengthLow: -40,
  monitoringEnabled: true,
  alertsEnabled: true,
  autoOpenTab: false,
  alertSoundEnabled: true,
  autoDownloadJson: false
};

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function ensureAlarm(enabled) {
  if (enabled) {
    // periodInMinutes minimum granularity is 1; use 3 for this monitor loop.
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 3 });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for tab to finish loading."));
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function reloadTabAndWait(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for tab to finish loading."));
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId).catch((err) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(err);
    });
  });
}

async function findTrendingOiTab() {
  const tabs = await chrome.tabs.query({ url: ["https://oipulse.com/*"] });
  return tabs.find((tab) => tab.url && tab.url.includes(TRENDING_OI_MATCH)) || null;
}

async function ensureTrendingOiTab(settings) {
  let tab = await findTrendingOiTab();
  if (tab) return tab;

  if (!settings.autoOpenTab) {
    throw new Error(
      "OIPulse Trending OI tab is not open. Open the page while logged in, or enable auto-open in Options."
    );
  }

  tab = await chrome.tabs.create({ url: TRENDING_OI_URL, active: false });
  await waitForTabComplete(tab.id);
  await wait(SETTLE_MS);
  return tab;
}

async function sendScrapeMessage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "SCRAPE_TABLE" });
  } catch (_err) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lib/parse.js", "content.js"]
    });
    await wait(500);
    return chrome.tabs.sendMessage(tabId, { type: "SCRAPE_TABLE" });
  }
}

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) return false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play an audible alert when Strength crosses the threshold."
  });
  await wait(150);
}

async function playAlertSound() {
  try {
    await ensureOffscreenDocument();
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "PLAY_ALERT_SOUND" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.ok === false) {
          reject(new Error(response.error || "Sound playback failed"));
          return;
        }
        resolve(response);
      });
    });
  } catch (_err) {
    // Sound is best-effort; notification still shows.
  }
}

function stampForFilename(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function downloadJson(rows, scrapedAt, { saveAs = true } = {}) {
  if (!rows?.length) {
    return { ok: false, error: "No scraped rows to download." };
  }

  const payload = {
    source: TRENDING_OI_URL,
    scrapedAt: scrapedAt || new Date().toISOString(),
    rowCount: rows.length,
    rows
  };
  // Service workers do not support URL.createObjectURL — use a data URL instead.
  const text = JSON.stringify(payload, null, 2);
  const url = `data:application/json;charset=utf-8;base64,${toBase64Utf8(text)}`;
  const filename = `oipulse-trending-oi-${stampForFilename(scrapedAt)}.json`;

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs,
      conflictAction: "uniquify"
    });
    await chrome.storage.local.set({
      lastDownloadFilename: filename,
      lastDownloadAt: new Date().toISOString()
    });
    return { ok: true, downloadId, filename };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function persistSnapshot(result, settings) {
  const rows = result.rows || [];
  const first = rows[0] || null;
  const snapshot = {
    scrapedAt: result.scrapedAt || new Date().toISOString(),
    rowCount: rows.length,
    firstRow: first,
    strength: first?.strength ?? null,
    sentiment: first?.sentiment ?? null,
    rows,
    storageNote:
      "Rows are stored in chrome.storage.local (not a disk file). Use Download JSON to save a .json file."
  };

  const { history = [] } = await chrome.storage.local.get(["history"]);
  const byKey = new Map();
  for (const row of history) {
    const key = `${row.date || ""}|${row.time || ""}`;
    byKey.set(key, row);
  }
  for (const row of rows) {
    const key = `${row.date || ""}|${row.time || ""}`;
    byKey.set(key, row);
  }
  const nextHistory = Array.from(byKey.values()).slice(-HISTORY_CAP);

  await chrome.storage.local.set({
    lastSnapshot: snapshot,
    lastRows: rows,
    history: nextHistory,
    lastError: result.ok ? null : result.error || "Scrape failed"
  });

  if (settings.autoDownloadJson && rows.length) {
    await downloadJson(rows, snapshot.scrapedAt, { saveAs: false });
  }

  return snapshot;
}

function alertKey(row) {
  if (!row) return null;
  return `${row.date || ""}|${row.time || ""}|${row.strength ?? ""}`;
}

async function maybeNotify(snapshot, settings) {
  // Master switch: when off, never notify (monitoring scrape can continue).
  if (settings.alertsEnabled === false) return;

  const strength = snapshot.strength;
  if (typeof strength !== "number") return;

  const high = Number(settings.strengthHigh ?? 40);
  const low = Number(settings.strengthLow ?? -40);
  const outside = strength > high || strength < low;
  if (!outside) return;

  // Re-alert every monitoring cycle (every 3 min) while condition stays true.
  const key = alertKey(snapshot.firstRow);
  const direction = strength > high ? "above" : "below";
  const threshold = strength > high ? high : low;
  const title = "OIPulse Strength Alert";
  const message = `First-row Strength is ${strength}% (${direction} ${threshold}%). Sentiment: ${
    snapshot.sentiment || "n/a"
  }`;

  await chrome.notifications.create(`oi-strength-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 2,
    requireInteraction: true,
    silent: false
  });

  if (settings.alertSoundEnabled !== false) {
    await playAlertSound();
  }

  await chrome.storage.local.set({
    lastAlertKey: key,
    lastAlertAt: new Date().toISOString(),
    lastAlertMessage: message
  });
}

async function runCheck({ reload = true } = {}) {
  const settings = await getSettings();
  if (!settings.monitoringEnabled && reload) {
    return { ok: false, error: "Monitoring is disabled." };
  }

  try {
    const tab = await ensureTrendingOiTab(settings);

    if (reload) {
      await reloadTabAndWait(tab.id);
      await wait(SETTLE_MS);
    }

    const scrape = await sendScrapeMessage(tab.id);
    if (!scrape?.ok) {
      const error = scrape?.error || "Scrape returned no rows.";
      await chrome.storage.local.set({ lastError: error });
      return { ok: false, error };
    }

    const snapshot = await persistSnapshot(scrape, settings);
    if (settings.monitoringEnabled) {
      await maybeNotify(snapshot, settings);
    }

    return { ok: true, snapshot };
  } catch (err) {
    const error = err?.message || String(err);
    await chrome.storage.local.set({ lastError: error });
    return { ok: false, error };
  }
}

async function getStatus() {
  const settings = await getSettings();
  const data = await chrome.storage.local.get([
    "lastSnapshot",
    "lastError",
    "lastAlertAt",
    "lastAlertMessage",
    "lastSummary",
    "lastDataframe",
    "lastDownloadFilename",
    "lastDownloadAt"
  ]);

  return {
    monitoringEnabled: settings.monitoringEnabled,
    alertsEnabled: settings.alertsEnabled !== false,
    settings,
    extensionId: chrome.runtime.id,
    lastSnapshot: data.lastSnapshot || null,
    lastError: data.lastError || null,
    lastAlertAt: data.lastAlertAt || null,
    lastAlertMessage: data.lastAlertMessage || null,
    lastSummary: data.lastSummary || null,
    lastDataframe: data.lastDataframe || null,
    lastDownloadFilename: data.lastDownloadFilename || null,
    lastDownloadAt: data.lastDownloadAt || null,
    storageInfo:
      "Scraped JSON is kept in chrome.storage.local inside the browser profile (not a project folder file). Use Download JSON to export a .json file to your Downloads folder."
  };
}

async function summarizeTwoHours() {
  const settings = await getSettings();
  let { lastRows, history, lastSnapshot } = await chrome.storage.local.get([
    "lastRows",
    "history",
    "lastSnapshot"
  ]);

  let sourceRows =
    (lastRows?.length && lastRows) ||
    (lastSnapshot?.rows?.length && lastSnapshot.rows) ||
    (history?.length && history) ||
    [];

  if (!sourceRows.length) {
    const scrapeResult = await runCheck({ reload: false });
    if (!scrapeResult.ok) {
      return { ok: false, error: scrapeResult.error };
    }
    ({ lastRows, history, lastSnapshot } = await chrome.storage.local.get([
      "lastRows",
      "history",
      "lastSnapshot"
    ]));
    sourceRows =
      (lastRows?.length && lastRows) ||
      (lastSnapshot?.rows?.length && lastSnapshot.rows) ||
      (history?.length && history) ||
      [];
  }

  if (!sourceRows.length) {
    return { ok: false, error: "No table rows available to summarize. Click Scrape now first." };
  }

  // Send full scraped rows to the LLM. Phase splitting is handled by SYSTEM_PROMPT only.
  const prompt = buildSummaryPrompt(null, sourceRows);

  try {
    const result = await summarizeWithProvider(settings, prompt);
    const payload = {
      text: result.text,
      provider: result.provider,
      model: result.model,
      createdAt: new Date().toISOString(),
      sourceRowCount: sourceRows.length
    };
    await chrome.storage.local.set({
      lastSummary: payload,
      lastError: null
    });
    return { ok: true, summary: payload };
  } catch (err) {
    const error = err?.message || String(err);
    await chrome.storage.local.set({ lastError: error });
    return { ok: false, error };
  }
}

async function testLlm() {
  const settings = await getSettings();
  try {
    if (settings.llmProvider === "openai") {
      const result = await testOpenAI(settings.openaiApiKey);
      return { ok: true, provider: "openai", models: result.models };
    }
    if (settings.llmProvider === "mlx") {
      const result = await testMLX(settings.mlxUrl);
      return { ok: true, provider: "mlx", models: result.models };
    }
    const result = await testOllama(settings.ollamaUrl);
    return { ok: true, provider: "ollama", models: result.models };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function exportLastJson({ saveAs = true } = {}) {
  const { lastRows, lastSnapshot } = await chrome.storage.local.get(["lastRows", "lastSnapshot"]);
  return downloadJson(lastRows || lastSnapshot?.rows || [], lastSnapshot?.scrapedAt, { saveAs });
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set(settings);
  await ensureAlarm(settings.monitoringEnabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await ensureAlarm(settings.monitoringEnabled);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const settings = await getSettings();
  if (!settings.monitoringEnabled) return;
  await runCheck({ reload: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Offscreen sound handler lives in offscreen.js; ignore here.
  if (message?.type === "PLAY_ALERT_SOUND") return false;

  (async () => {
    switch (message?.type) {
      case "GET_STATUS":
        sendResponse(await getStatus());
        break;
      case "SET_MONITORING": {
        const enabled = Boolean(message.enabled);
        await chrome.storage.local.set({ monitoringEnabled: enabled });
        await ensureAlarm(enabled);
        sendResponse({ ok: true, monitoringEnabled: enabled });
        break;
      }
      case "SET_ALERTS": {
        const enabled = Boolean(message.enabled);
        await chrome.storage.local.set({ alertsEnabled: enabled });
        sendResponse({ ok: true, alertsEnabled: enabled });
        break;
      }
      case "SCRAPE_NOW":
        sendResponse(await runCheck({ reload: Boolean(message.reload) }));
        break;
      case "SUMMARIZE_2H":
        sendResponse(await summarizeTwoHours());
        break;
      case "TEST_LLM":
        sendResponse(await testLlm());
        break;
      case "DOWNLOAD_JSON":
        sendResponse(await exportLastJson({ saveAs: message.saveAs !== false }));
        break;
      case "TEST_ALERT_SOUND": {
        const settings = await getSettings();
        if (settings.alertSoundEnabled === false) {
          sendResponse({ ok: false, error: "Alert sound is disabled in Options." });
          break;
        }
        await playAlertSound();
        sendResponse({ ok: true });
        break;
      }
      case "SAVE_SETTINGS": {
        const next = { ...(message.settings || {}) };
        await chrome.storage.local.set(next);
        if (Object.prototype.hasOwnProperty.call(next, "monitoringEnabled")) {
          await ensureAlarm(Boolean(next.monitoringEnabled));
        }
        sendResponse({ ok: true, settings: await getSettings() });
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();
  return true;
});
