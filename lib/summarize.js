/**
 * Bucket OIPulse rows into NSE-aligned 2-hour windows and aggregate metrics.
 */

const NSE_WINDOWS = [
  { label: "09:15–11:15", startMin: 9 * 60 + 15, endMin: 11 * 60 + 15 },
  { label: "11:15–13:15", startMin: 11 * 60 + 15, endMin: 13 * 60 + 15 },
  { label: "13:15–15:30", startMin: 13 * 60 + 15, endMin: 15 * 60 + 30 }
];

function pickTimeRaw(row) {
  if (!row || typeof row !== "object") return null;
  return (
    row.time ??
    row.Time ??
    row.TIME ??
    row["time"] ??
    null
  );
}

function pickDateRaw(row) {
  if (!row || typeof row !== "object") return null;
  return row.date ?? row.Date ?? row.DATE ?? null;
}

export function normalizeTime(time) {
  if (time === null || time === undefined) return null;
  let text = String(time).replace(/\s+/g, " ").trim();
  if (!text || text === "-" || text === "—") return null;

  const upper = text.toUpperCase();
  if (upper === "EOD" || upper.includes("EOD")) return "15:30:00";

  // Strip timezone / trailing labels: "15:30:00 IST", "15:30 hrs"
  text = text.replace(/\b(IST|UTC|GMT|HRS?|HOURS?)\b/gi, "").trim();

  // 12-hour clock: "3:30:00 PM" / "03:30 pm"
  const ampm = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (ampm) {
    let hh = Number(ampm[1]);
    const mm = ampm[2];
    const ss = ampm[3] || "00";
    const meridiem = ampm[4].toUpperCase();
    if (meridiem === "PM" && hh < 12) hh += 12;
    if (meridiem === "AM" && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${mm}:${ss}`;
  }

  // Embedded time anywhere in the cell
  const embedded = text.match(/(\d{1,2})[:.](\d{2})(?::(\d{2}))?/);
  if (!embedded) return null;
  const hh = String(embedded[1]).padStart(2, "0");
  const mm = embedded[2];
  const ss = embedded[3] || "00";
  return `${hh}:${mm}:${ss}`;
}

export function timeToMinutes(time) {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const [hh, mm] = normalized.split(":").map(Number);
  return hh * 60 + mm;
}

export function windowForTime(time) {
  const minutes = timeToMinutes(time);
  if (minutes === null) return "unparsed-time";
  for (const win of NSE_WINDOWS) {
    if (minutes >= win.startMin && minutes <= win.endMin) return win.label;
  }
  if (minutes < NSE_WINDOWS[0].startMin) return NSE_WINDOWS[0].label;
  return NSE_WINDOWS[NSE_WINDOWS.length - 1].label;
}

function avg(nums) {
  if (!nums.length) return null;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}

function dominant(values) {
  const counts = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  let best = null;
  let bestCount = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function sortRowsChronologically(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = String(pickDateRaw(a) || "").localeCompare(String(pickDateRaw(b) || ""));
    if (dateCmp !== 0) return dateCmp;
    return (timeToMinutes(pickTimeRaw(a)) ?? 0) - (timeToMinutes(pickTimeRaw(b)) ?? 0);
  });
}

/**
 * Build a 2-hour dataframe of aggregates from scraped rows.
 */
export function buildTwoHourDataframe(rows) {
  const buckets = new Map();

  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    const label = windowForTime(pickTimeRaw(row));
    const date = pickDateRaw(row) || "unknown";
    const key = `${date}|${label}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        date,
        period: label,
        rows: []
      });
    }
    buckets.get(key).rows.push(row);
  }

  const dataframe = [];
  for (const bucket of buckets.values()) {
    const ordered = sortRowsChronologically(bucket.rows);
    const strengths = ordered
      .map((r) => r.strength ?? r.Strength)
      .filter((v) => typeof v === "number");
    const diffs = ordered
      .map((r) => r.diffInOI ?? r.diffInOi)
      .filter((v) => typeof v === "number");
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const firstStrength = first?.strength ?? first?.Strength ?? null;
    const lastStrength = last?.strength ?? last?.Strength ?? null;
    const firstNetPCR = first?.netPCR ?? first?.netPcr ?? null;
    const lastNetPCR = last?.netPCR ?? last?.netPcr ?? null;

    dataframe.push({
      date: bucket.date,
      period: bucket.period,
      rowCount: ordered.length,
      avgStrength: avg(strengths),
      minStrength: strengths.length ? Math.min(...strengths) : null,
      maxStrength: strengths.length ? Math.max(...strengths) : null,
      firstStrength,
      lastStrength,
      strengthDelta:
        typeof firstStrength === "number" && typeof lastStrength === "number"
          ? Number((lastStrength - firstStrength).toFixed(2))
          : null,
      dominantSentiment: dominant(ordered.map((r) => r.sentiment ?? r.Sentiment)),
      firstNetPCR,
      lastNetPCR,
      netPCRDelta:
        typeof firstNetPCR === "number" && typeof lastNetPCR === "number"
          ? Number((lastNetPCR - firstNetPCR).toFixed(2))
          : null,
      avgDiffInOI: avg(diffs),
      oiDiffDirection:
        typeof last?.diffInOI === "number"
          ? last.diffInOI > 0
            ? "positive"
            : last.diffInOI < 0
              ? "negative"
              : "flat"
          : null,
      lastLtp: last?.ltp ?? last?.LTP ?? null,
      sampleTimes: ordered.map((r) => normalizeTime(pickTimeRaw(r))).filter(Boolean).slice(0, 8)
    });
  }

  dataframe.sort((a, b) => {
    const dateCmp = String(a.date).localeCompare(String(b.date));
    if (dateCmp !== 0) return dateCmp;
    return a.period.localeCompare(b.period);
  });

  return dataframe;
}

function compactRowsForPrompt(rows, limit = 250) {
  return (rows || []).slice(0, limit).map((row) => ({
    date: pickDateRaw(row),
    time: pickTimeRaw(row),
    ltp: row.ltp ?? row.LTP ?? null,
    dayHLBreak: row.dayHLBreak ?? null,
    chngInCallOI: row.chngInCallOI ?? null,
    chngInPutOI: row.chngInPutOI ?? null,
    diffInOI: row.diffInOI ?? null,
    strength: row.strength ?? row.Strength ?? null,
    directionOfChng: row.directionOfChng ?? null,
    chngInDirection: row.chngInDirection ?? null,
    chngInDirectionPct: row.chngInDirectionPct ?? null,
    netPCR: row.netPCR ?? row.netPcr ?? null,
    dayHighLowDiffInOI: row.dayHighLowDiffInOI ?? null,
    sentiment: row.sentiment ?? row.Sentiment ?? null
  }));
}

/**
 * User message = scraped OI rows only.
 * Phase / analysis instructions live entirely in SYSTEM_PROMPT (llm.js) — do not restate them here.
 */
export function buildSummaryPrompt(_dataframe, sourceRows = []) {
  const rows = compactRowsForPrompt(sourceRows);
  return [
    "Here is the complete Trending OI dataset as JSON rows (as scraped from the table).",
    "Follow your system instructions to analyze it.",
    "",
    `rowCount: ${rows.length}`,
    "",
    "Trending OI data:",
    JSON.stringify(rows, null, 2)
  ].join("\n");
}

export { NSE_WINDOWS };
