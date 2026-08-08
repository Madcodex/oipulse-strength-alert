const els = {
  monitoringToggle: document.getElementById("monitoringToggle"),
  monitorLabel: document.getElementById("monitorLabel"),
  livePill: document.getElementById("livePill"),
  alertsToggle: document.getElementById("alertsToggle"),
  alertsLabel: document.getElementById("alertsLabel"),
  alertsPill: document.getElementById("alertsPill"),
  strengthValue: document.getElementById("strengthValue"),
  sentimentValue: document.getElementById("sentimentValue"),
  scrapedAt: document.getElementById("scrapedAt"),
  rowCount: document.getElementById("rowCount"),
  scrapeBtn: document.getElementById("scrapeBtn"),
  exportCursorBtn: document.getElementById("exportCursorBtn"),
  loadAnalysisBtn: document.getElementById("loadAnalysisBtn"),
  analysisFileInput: document.getElementById("analysisFileInput"),
  summarizeBtn: document.getElementById("summarizeBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  openTabBtn: document.getElementById("openTabBtn"),
  lastAlert: document.getElementById("lastAlert"),
  storageInfo: document.getElementById("storageInfo"),
  statusMessage: document.getElementById("statusMessage"),
  summaryText: document.getElementById("summaryText"),
  summaryMeta: document.getElementById("summaryMeta"),
  optionsLink: document.getElementById("optionsLink")
};

const params = new URLSearchParams(location.search);
const isFullPage =
  params.get("view") === "full" ||
  params.get("view") === "tab" ||
  window.innerWidth > 820;

if (isFullPage) {
  document.documentElement.classList.add("fullpage");
}

function setStatus(message, isError = false) {
  els.statusMessage.textContent = message || "";
  els.statusMessage.classList.toggle("error", Boolean(isError));
}

function formatStrength(value) {
  if (typeof value !== "number") return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch (_err) {
    return iso;
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function animateNumber(el, nextText) {
  el.textContent = nextText;
  el.style.transform = "scale(1.04)";
  el.style.transition = "transform 0.2s ease";
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.style.transform = "scale(1)";
    }, 40);
  });
}

function sentimentClass(sentiment) {
  const s = String(sentiment || "").toLowerCase();
  if (s.includes("bull")) return "pill-bullish";
  if (s.includes("bear")) return "pill-bearish";
  return "pill-neutral";
}

function setMonitorUi(enabled) {
  els.monitoringToggle.checked = Boolean(enabled);
  els.livePill.classList.toggle("on", Boolean(enabled));
  els.monitorLabel.textContent = enabled ? "Monitoring ON" : "Monitoring OFF";
}

function setAlertsUi(enabled) {
  els.alertsToggle.checked = Boolean(enabled);
  els.alertsPill.classList.toggle("on", Boolean(enabled));
  els.alertsLabel.textContent = enabled ? "Alerts ON" : "Alerts OFF";
}

function parseAlertDetails(message, alertAt) {
  const text = message || "";
  const strengthMatch = text.match(/Strength is\s+([+\-]?\d+(?:\.\d+)?)%/i);
  const sentimentMatch = text.match(/Sentiment:\s*([^.(]+)/i);
  return {
    strength: strengthMatch ? `${Number(strengthMatch[1]) > 0 ? "+" : ""}${strengthMatch[1]}%` : "—",
    sentiment: sentimentMatch ? sentimentMatch[1].trim() : "—",
    time: formatTime(alertAt),
    message: text
  };
}

function renderAlert(status) {
  if (!status.lastAlertMessage) {
    els.lastAlert.innerHTML = `<div class="alert-empty">No alerts yet</div>`;
    return;
  }

  const details = parseAlertDetails(status.lastAlertMessage, status.lastAlertAt);
  const sentimentPill = sentimentClass(details.sentiment);
  const shortTime = details.time === "—" ? "—" : details.time.replace(/,\s*/, " ");
  els.lastAlert.innerHTML = `
    <div class="alert-row" title="${escapeHtml(details.message)}">
      <span class="alert-chip"><span class="k">Str</span><span class="v">${escapeHtml(details.strength)}</span></span>
      <span class="alert-chip"><span class="k">Sent</span><span class="v"><span class="pill ${sentimentPill}">${escapeHtml(details.sentiment)}</span></span></span>
      <span class="alert-chip time"><span class="k">Time</span><span class="v">${escapeHtml(shortTime)}</span></span>
      <span class="alert-chip interval"><span class="k">Every</span><span class="v">3m</span></span>
    </div>
  `;
}

function decorateInline(html) {
  let out = html;

  // Colour the change arrows used in the phase tables / labels.
  out = out
    .replace(/▲/g, '<span class="chg up">▲</span>')
    .replace(/▼/g, '<span class="chg down">▼</span>')
    .replace(/(?:➝|→)/g, '<span class="chg flat">➝</span>');

  out = out.replace(
    /\b(\d+(?:\.\d+)?%|\d+\.\d+(?:\s*delta)?|[+\-]\d+(?:\.\d+)?%)\b/gi,
    '<span class="num">$1</span>'
  );

  const words = [
    { re: /\bBullish\b/g, cls: "badge-bullish" },
    { re: /\bBearish\b/g, cls: "badge-bearish" },
    { re: /\bStrong\b/g, cls: "badge-strong" },
    { re: /\bWeak\b/g, cls: "badge-weak" },
    { re: /\bIncrease[ds]?\b/g, cls: "badge-increase" },
    { re: /\bDecrease[ds]?\b/g, cls: "badge-decrease" }
  ];

  for (const { re, cls } of words) {
    out = out.replace(re, (match) => `<span class="badge ${cls}">${match}</span>`);
  }

  return out;
}

/** Escape then apply inline decoration (bold, numbers, arrows, badges). */
function decorateValue(text) {
  const escaped = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return decorateInline(escaped);
}

function matchPhaseHeader(line) {
  const cleaned = line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*+/, "")
    .replace(/\*+$/, "")
    .trim();
  const m = cleaned.match(
    /^(?:🟥|🟩|🟦|🟨|✦|▪|■|●)?\s*Phase\s+([0-9]+|[IVXLC]+)\b\s*(.*)$/i
  );
  if (!m) return null;
  const time = m[2].replace(/^[|:–—\-\s]+/, "").replace(/\*+$/, "").trim();
  return { num: m[1], time };
}

function isTableRow(line) {
  return line.startsWith("|") && (line.match(/\|/g) || []).length >= 2;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");
}

function renderTable(rows) {
  const parsed = rows.map(splitRow).filter((r) => !isSeparatorRow(r));
  if (!parsed.length) return "";

  const [header, ...body] = parsed;
  const changeIdx = header.findIndex((h) => /change|chg|δ|delta/i.test(h));

  const thead = `<thead><tr>${header
    .map((c) => `<th>${decorateValue(c)}</th>`)
    .join("")}</tr></thead>`;

  const tbody = `<tbody>${body
    .map((r) => {
      const cells = r
        .map((c, i) => {
          let tone = "";
          if (/▲/.test(c)) tone = "up";
          else if (/▼/.test(c)) tone = "down";
          else if (/➝|→/.test(c)) tone = "flat";
          const changeCls = i === changeIdx ? "chg-cell " : "";
          const metricCls = i === 0 ? "metric " : "";
          const cls = `${metricCls}${changeCls}${tone}`.trim();
          return `<td${cls ? ` class="${cls}"` : ""}>${decorateValue(c)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("")}</tbody>`;

  return `<div class="table-wrap"><table class="phase-table">${thead}${tbody}</table></div>`;
}

function renderLabeledRow(key, value) {
  let valHtml;
  if (/;/.test(value)) {
    const parts = value
      .split(/;\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    valHtml = `<span class="phase-val stacked">${parts
      .map((p) => `<span class="sub">${decorateValue(p)}</span>`)
      .join("")}</span>`;
  } else {
    valHtml = `<span class="phase-val">${decorateValue(value)}</span>`;
  }
  return `<div class="phase-row"><span class="phase-key">${escapeHtml(
    key
  )}</span>${valHtml}</div>`;
}

function renderPhaseBody(lines) {
  const blocks = [];
  let listItems = [];
  let paragraph = [];
  let tableRows = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((i) => `<li>${i}</li>`).join("")}</ul>`);
    listItems = [];
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.join(" ")}</p>`);
    paragraph = [];
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    blocks.push(renderTable(tableRows));
    tableRows = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (isTableRow(trimmed)) {
      flushList();
      flushParagraph();
      tableRows.push(trimmed);
      continue;
    }
    flushTable();

    if (!trimmed || /^[━─=]{3,}$/.test(trimmed)) {
      flushList();
      flushParagraph();
      continue;
    }

    const labeled = trimmed.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (labeled) {
      flushList();
      flushParagraph();
      const key = labeled[1].replace(/:$/, "").trim();
      const value = labeled[2].replace(/^[—:–\-\s]+/, "").trim();
      if (!value) blocks.push(`<div class="phase-subhead">${escapeHtml(key)}</div>`);
      else blocks.push(renderLabeledRow(key, value));
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(decorateValue(bullet[1]));
      continue;
    }

    flushList();
    paragraph.push(decorateValue(trimmed));
  }

  flushList();
  flushParagraph();
  flushTable();
  return blocks.join("");
}

function detectTone(text) {
  const t = String(text).toLowerCase();
  const bull = (t.match(/bull/g) || []).length;
  const bear = (t.match(/bear/g) || []).length;
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

function renderMarkdown(raw) {
  if (!raw || !String(raw).trim()) {
    return `<div class="summary-placeholder"><p>Run <strong>Summarize 2h</strong> to generate a terminal-grade market brief from the latest OI table.</p></div>`;
  }

  const lines = String(raw).replace(/\r\n/g, "\n").split("\n");
  const phases = [];
  const intro = [];
  let current = null;

  for (const line of lines) {
    const header = matchPhaseHeader(line.trim());
    if (header) {
      current = { num: header.num, time: header.time, lines: [] };
      phases.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else intro.push(line);
  }

  if (!phases.length) {
    const body = renderPhaseBody(lines);
    return body || `<p>${decorateValue(raw)}</p>`;
  }

  let html = "";
  const introBody = renderPhaseBody(intro);
  if (introBody.trim()) html += `<div class="phase-intro">${introBody}</div>`;

  for (const phase of phases) {
    const tone = detectTone(phase.lines.join(" "));
    const body = renderPhaseBody(phase.lines);
    const time = phase.time
      ? `<span class="phase-time">${escapeHtml(phase.time)}</span>`
      : "";
    html += `<section class="phase-card tone-${tone}"><header class="phase-head"><span class="phase-badge"><span class="phase-dot" aria-hidden="true"></span>Phase ${escapeHtml(
      String(phase.num)
    )}</span>${time}</header><div class="phase-body">${body}</div></section>`;
  }

  return html;
}

function renderSummary(summary) {
  if (!summary?.text) {
    els.summaryText.innerHTML = `<div class="summary-placeholder"><p><strong>Export for Cursor</strong>, analyze with <code>@data/prompt.md</code> + latest snapshot in Cursor chat, then <strong>Load analysis</strong> from <code>data/predictions/latest.md</code>.</p></div>`;
    els.summaryMeta.textContent = "Awaiting data";
    els.summaryMeta.classList.remove("ready");
    return;
  }

  const model = summary.model || summary.provider || "Cursor";
  const shortModel = String(model).split("/").pop();
  const label =
    summary.provider === "cursor" || summary.source === "file-import"
      ? `Loaded ${shortModel}`
      : `Generated by ${shortModel}`;
  els.summaryMeta.textContent = label;
  els.summaryMeta.classList.add("ready");
  els.summaryMeta.title = [summary.provider, summary.model, formatTime(summary.createdAt)]
    .filter(Boolean)
    .join(" · ");
  els.summaryText.innerHTML = renderMarkdown(summary.text);
}

function renderStatus(status) {
  const snap = status.lastSnapshot;
  const strength = snap?.strength;
  const llmEnabled = Boolean(status.settings?.enableInExtensionLlm);

  setMonitorUi(status.monitoringEnabled);
  setAlertsUi(status.alertsEnabled !== false);
  animateNumber(els.strengthValue, formatStrength(strength));
  els.strengthValue.classList.toggle("hot", typeof strength === "number" && strength > 40);
  els.strengthValue.classList.toggle("cold", typeof strength === "number" && strength < -40);

  const sentiment = snap?.sentiment || "—";
  els.sentimentValue.textContent = sentiment;
  els.sentimentValue.className = `pill ${sentimentClass(sentiment)}`;

  els.scrapedAt.textContent = formatTime(snap?.scrapedAt);
  animateNumber(els.rowCount, snap?.rowCount != null ? String(snap.rowCount) : "—");

  renderAlert(status);

  if (els.summarizeBtn) {
    els.summarizeBtn.hidden = !llmEnabled;
  }

  if (status.lastDownloadFilename) {
    els.storageInfo.textContent = `Exported: ${status.lastDownloadFilename}`;
  } else {
    els.storageInfo.textContent = "Hybrid: Downloads/oipulse-data/snapshots/";
  }

  renderSummary(status.lastSummary);

  if (status.lastError) {
    setStatus(status.lastError, true);
  } else if (!snap) {
    setStatus("Open the Trending OI page, then click Scrape now.");
  } else {
    if (!status.monitoringEnabled) {
      setStatus("Monitoring paused.");
    } else if (status.alertsEnabled === false) {
      setStatus("Monitoring every 3 minutes. Alerts OFF.");
    } else {
      setStatus("Monitoring every 3 minutes. Alerts ON when Strength breaches thresholds.");
    }
  }
}

async function refresh() {
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  renderStatus(status);
}

els.monitoringToggle.addEventListener("change", async () => {
  const enabled = els.monitoringToggle.checked;
  setMonitorUi(enabled);
  await chrome.runtime.sendMessage({ type: "SET_MONITORING", enabled });
  setStatus(enabled ? "Monitoring enabled (every 3 minutes)." : "Monitoring paused.");
});

els.alertsToggle.addEventListener("change", async () => {
  const enabled = els.alertsToggle.checked;
  setAlertsUi(enabled);
  await chrome.runtime.sendMessage({ type: "SET_ALERTS", enabled });
  setStatus(
    enabled
      ? "Alerts ON — notify every 3 minutes while Strength is outside thresholds."
      : "Alerts OFF — monitoring can continue without notifications."
  );
});

els.scrapeBtn.addEventListener("click", async () => {
  els.scrapeBtn.disabled = true;
  setStatus("Scraping…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "SCRAPE_NOW", reload: false });
    if (!result?.ok) {
      setStatus(result?.error || "Scrape failed.", true);
    } else {
      setStatus(
        `Scraped ${result.snapshot.rowCount} rows. JSON exports to Downloads/oipulse-data/snapshots/.`
      );
    }
    await refresh();
  } catch (err) {
    setStatus(err?.message || String(err), true);
  } finally {
    els.scrapeBtn.disabled = false;
  }
});

els.exportCursorBtn.addEventListener("click", async () => {
  els.exportCursorBtn.disabled = true;
  setStatus("Exporting JSON for Cursor…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "EXPORT_FOR_CURSOR" });
    if (!result?.ok) {
      setStatus(result?.error || "Export failed.", true);
    } else {
      setStatus(`Exported ${result.filename}. Analyze in Cursor, then Load analysis.`);
    }
    await refresh();
  } catch (err) {
    setStatus(err?.message || String(err), true);
  } finally {
    els.exportCursorBtn.disabled = false;
  }
});

els.loadAnalysisBtn.addEventListener("click", () => {
  els.analysisFileInput.value = "";
  els.analysisFileInput.click();
});

els.analysisFileInput.addEventListener("change", async () => {
  const file = els.analysisFileInput.files?.[0];
  if (!file) return;
  els.loadAnalysisBtn.disabled = true;
  setStatus(`Loading ${file.name}…`);
  try {
    const text = await file.text();
    const result = await chrome.runtime.sendMessage({
      type: "IMPORT_SUMMARY",
      text,
      filename: file.name
    });
    if (!result?.ok) {
      setStatus(result?.error || "Failed to load analysis.", true);
    } else {
      setStatus(`Loaded analysis from ${file.name}.`);
    }
    await refresh();
  } catch (err) {
    setStatus(err?.message || String(err), true);
  } finally {
    els.loadAnalysisBtn.disabled = false;
  }
});

els.summarizeBtn?.addEventListener("click", async () => {
  els.summarizeBtn.disabled = true;
  setStatus("Summarizing with in-extension LLM…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "SUMMARIZE_2H" });
    if (!result?.ok) {
      setStatus(result?.error || "Summarization failed.", true);
    } else {
      setStatus(`Summary ready (${result.summary.provider}).`);
    }
    await refresh();
  } catch (err) {
    setStatus(err?.message || String(err), true);
  } finally {
    els.summarizeBtn.disabled = false;
  }
});

els.downloadBtn.addEventListener("click", async () => {
  els.downloadBtn.disabled = true;
  setStatus("Preparing JSON download…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_JSON", saveAs: false });
    if (!result?.ok) {
      setStatus(result?.error || "Download failed.", true);
    } else {
      setStatus(`Downloaded ${result.filename}`);
    }
    await refresh();
  } catch (err) {
    setStatus(err?.message || String(err), true);
  } finally {
    els.downloadBtn.disabled = false;
  }
});

els.optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

els.openTabBtn?.addEventListener("click", async () => {
  const url = chrome.runtime.getURL("popup.html?view=full");
  await chrome.tabs.create({ url });
});

refresh();
