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

function calloutClass(title) {
  const t = title.toLowerCase();
  if (t.includes("strength") || t.includes("trend")) return "strength";
  if (t.includes("pcr")) return "pcr";
  if (t.includes("takeaway") || t.includes("key")) return "takeaway";
  return "generic";
}

function calloutEmoji(title) {
  const t = title.toLowerCase();
  if (t.includes("strength") || t.includes("trend")) return "📈";
  if (t.includes("pcr")) return "📊";
  if (t.includes("takeaway") || t.includes("key")) return "📌";
  return "✦";
}

function renderMarkdown(raw) {
  if (!raw || !String(raw).trim()) {
    return `<div class="summary-placeholder"><p>Run <strong>Summarize 2h</strong> to generate a terminal-grade market brief from the latest OI table.</p></div>`;
  }

  const lines = String(raw).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let listItems = [];
  let paragraph = [];
  let callout = null;

  const flushList = () => {
    if (!listItems.length) return;
    const items = listItems
      .map((item) => `<li>${decorateInline(item)}</li>`)
      .join("");
    const html = `<ul>${items}</ul>`;
    if (callout) callout.body.push(html);
    else blocks.push(html);
    listItems = [];
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    const html = `<p>${decorateInline(text)}</p>`;
    if (callout) callout.body.push(html);
    else blocks.push(html);
    paragraph = [];
  };

  const flushCallout = () => {
    if (!callout) return;
    flushList();
    flushParagraph();
    const cls = calloutClass(callout.title);
    const emoji = calloutEmoji(callout.title);
    blocks.push(
      `<div class="callout ${cls}"><div class="callout-title">${emoji} ${escapeHtml(
        callout.title
      )}</div>${callout.body.join("")}</div>`
    );
    callout = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || /^[━─=\-]{3,}$/.test(trimmed)) {
      flushList();
      flushParagraph();
      continue;
    }

    const headingMatch =
      trimmed.match(/^#{1,3}\s+(.+)$/) ||
      trimmed.match(/^\*\*(.+?)\*\*:?\s*$/) ||
      trimmed.match(/^(?:📈|📊|📌|✦)\s*(.+)$/) ||
      trimmed.match(/^([A-Z][\w\s/&-]{2,40})$/);

    const looksLikeHeading =
      headingMatch &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("*") &&
      (trimmed.startsWith("#") ||
        trimmed.startsWith("**") ||
        /^(?:📈|📊|📌)/.test(trimmed) ||
        /^(Strength|PCR|Key Takeaway|Sentiment|OI|Trend|Summary)/i.test(trimmed));

    if (looksLikeHeading) {
      flushList();
      flushParagraph();
      flushCallout();
      const title = (headingMatch[1] || trimmed)
        .replace(/^\*\*|\*\*$/g, "")
        .replace(/:$/, "")
        .trim();
      callout = { title, body: [] };
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      let item = escapeHtml(bullet[1]);
      item = item.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      listItems.push(item);
      continue;
    }

    flushList();
    let text = escapeHtml(trimmed);
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    paragraph.push(text);
  }

  flushList();
  flushParagraph();
  flushCallout();

  if (!blocks.length) {
    const fallback = decorateInline(
      escapeHtml(raw).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")
    );
    return `<p>${fallback}</p>`;
  }

  return blocks.join("");
}

function renderSummary(summary) {
  if (!summary?.text) {
    els.summaryText.innerHTML = `<div class="summary-placeholder"><p>Run <strong>Summarize 2h</strong> to generate a terminal-grade market brief from the latest OI table.</p></div>`;
    els.summaryMeta.textContent = "Awaiting data";
    els.summaryMeta.classList.remove("ready");
    return;
  }

  const model = summary.model || summary.provider || "LLM";
  const shortModel = String(model).split("/").pop();
  els.summaryMeta.textContent = `Generated by ${shortModel}`;
  els.summaryMeta.classList.add("ready");
  els.summaryMeta.title = [summary.provider, summary.model, formatTime(summary.createdAt)]
    .filter(Boolean)
    .join(" · ");
  els.summaryText.innerHTML = renderMarkdown(summary.text);
}

function renderStatus(status) {
  const snap = status.lastSnapshot;
  const strength = snap?.strength;

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

  if (status.lastDownloadFilename) {
    els.storageInfo.textContent = `Exported: ${status.lastDownloadFilename}`;
  } else {
    els.storageInfo.textContent = "Stored in chrome.storage.local";
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
      setStatus(`Scraped ${result.snapshot.rowCount} rows (saved in chrome.storage.local).`);
    }
    await refresh();
  } catch (err) {
    setStatus(err?.message || String(err), true);
  } finally {
    els.scrapeBtn.disabled = false;
  }
});

els.summarizeBtn.addEventListener("click", async () => {
  els.summarizeBtn.disabled = true;
  setStatus("Summarizing 2h dataframe…");
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
    const result = await chrome.runtime.sendMessage({ type: "DOWNLOAD_JSON", saveAs: true });
    if (!result?.ok) {
      setStatus(result?.error || "Download failed.", true);
    } else {
      setStatus(`Downloaded ${result.filename} (check your Downloads folder).`);
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
