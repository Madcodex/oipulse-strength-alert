/**
 * Shared parsing helpers for OIPulse table cells (classic script for content.js).
 */
(function (global) {
  // More-specific aliases must win over shorter substring aliases.
  const HEADER_ALIASES = {
    date: ["date"],
    time: ["time"],
    ltp: ["ltp"],
    dayHLBreak: ["day h/l break", "day hl break"],
    chngInCallOI: ["chng. in call oi", "chng in call oi", "change in call oi"],
    chngInPutOI: ["chng. in put oi", "chng in put oi", "change in put oi"],
    dayHighLowDiffInOI: [
      "day high/low diff. in oi",
      "day high/low diff in oi",
      "day high low diff. in oi",
      "day high low diff in oi"
    ],
    diffInOI: ["diff. in oi", "diff in oi", "difference in oi"],
    strength: ["strength"],
    chngInDirectionPct: [
      "direction of chng. %",
      "direction of chng %",
      "direction of change %",
      "chng. in direction %",
      "chng in direction %",
      "change in direction %"
    ],
    chngInDirection: ["chng. in direction", "chng in direction", "change in direction"],
    directionOfChng: [
      "direction of chng.",
      "direction of chng",
      "direction of change"
    ],
    netPCR: ["net pcr"],
    sentiment: ["sentiment"]
  };

  const SENTIMENT_RE = /^(bullish|bearish|neutral|sideways)$/i;
  const TIME_RE = /^(eod|\d{1,2}[:.]\d{2}(?::\d{2})?(\s*[ap]m)?)$/i;
  const DATE_RE = /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/;

  const CANONICAL_KEYS = [
    "date",
    "time",
    "ltp",
    "dayHLBreak",
    "chngInCallOI",
    "chngInPutOI",
    "diffInOI",
    "strength",
    "directionOfChng",
    "chngInDirection",
    "chngInDirectionPct",
    "netPCR",
    "dayHighLowDiffInOI",
    "sentiment"
  ];

  function normalizeHeader(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function headerToKey(headerText) {
    const normalized = normalizeHeader(headerText);
    if (
      !normalized ||
      normalized === "#" ||
      normalized === "s.no" ||
      normalized === "sno" ||
      normalized === "s no" ||
      /^\d+$/.test(normalized)
    ) {
      return null;
    }

    // 1) Exact alias match
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((alias) => normalized === alias)) return key;
    }

    // 2) Longest substring alias match (prevents "diff. in oi" stealing
    //    "day high/low diff. in oi", and "direction of chng" stealing "... %")
    let bestKey = null;
    let bestLen = 0;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      for (const alias of aliases) {
        if (alias.length > bestLen && normalized.includes(alias)) {
          bestKey = key;
          bestLen = alias.length;
        }
      }
    }
    if (bestKey) return bestKey;

    return null;
  }

  function parseNumber(raw) {
    if (raw === null || raw === undefined) return null;
    let text = String(raw).trim();
    if (!text || text === "-" || text === "—") return null;

    text = text.replace(/%/g, "").replace(/,/g, "").replace(/\s+/g, "");
    if (!text || text === "-") return null;

    const value = Number(text);
    if (Number.isNaN(value)) return null;
    return value;
  }

  function parseStrength(raw) {
    return parseNumber(raw);
  }

  function parseCellValue(key, raw) {
    const text = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!text || text === "-" || text === "—") return null;

    switch (key) {
      case "date":
      case "time":
      case "dayHLBreak":
      case "sentiment":
        return text;
      case "strength":
        return parseStrength(text);
      case "ltp":
      case "chngInCallOI":
      case "chngInPutOI":
      case "diffInOI":
      case "directionOfChng":
      case "chngInDirection":
      case "chngInDirectionPct":
      case "netPCR":
      case "dayHighLowDiffInOI":
        return parseNumber(text);
      default:
        return parseNumber(text) ?? text;
    }
  }

  function looksLikeSentiment(value) {
    return typeof value === "string" && SENTIMENT_RE.test(value.trim());
  }

  function looksLikeTime(value) {
    return typeof value === "string" && TIME_RE.test(value.trim());
  }

  function looksLikeDate(value) {
    return typeof value === "string" && DATE_RE.test(value.trim());
  }

  /**
   * Build a row from header keys. Duplicate keys keep the first non-null value
   * instead of silently overwriting (which caused Sentiment → time).
   */
  function cellsToRow(keys, cellTexts) {
    const row = {};
    const seen = new Set();

    keys.forEach((key, index) => {
      if (!key) return;
      const value = parseCellValue(key, cellTexts[index]);
      if (!seen.has(key)) {
        row[key] = value;
        seen.add(key);
        return;
      }
      // Duplicate header mapping: only fill if previous value is empty.
      if (row[key] === null || row[key] === undefined || row[key] === "") {
        row[key] = value;
      }
    });

    return repairRow(row, cellTexts);
  }

  function repairRow(row, cellTexts) {
    const fixed = { ...row };

    // Sentiment landed in time
    if (looksLikeSentiment(fixed.time) && !looksLikeSentiment(fixed.sentiment)) {
      fixed.sentiment = fixed.time;
      fixed.time = null;
    }

    // Recover time/date/sentiment from raw cells if missing
    const rawCells = (cellTexts || []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim());

    if (!looksLikeTime(fixed.time)) {
      const timeCell = rawCells.find((c) => looksLikeTime(c));
      if (timeCell) fixed.time = timeCell;
    }

    if (!looksLikeDate(fixed.date)) {
      const dateCell = rawCells.find((c) => looksLikeDate(c));
      if (dateCell) fixed.date = dateCell;
    }

    if (!looksLikeSentiment(fixed.sentiment)) {
      const sentimentCell = rawCells.find((c) => looksLikeSentiment(c));
      if (sentimentCell) fixed.sentiment = sentimentCell;
    }

    // Percent field swapped into directionOfChng (large OI delta vs small %)
    const dir = fixed.directionOfChng;
    const dirPct = fixed.chngInDirectionPct;
    const chngDir = fixed.chngInDirection;

    if (
      dirPct == null &&
      typeof dir === "number" &&
      Math.abs(dir) <= 100 &&
      typeof chngDir === "number" &&
      Math.abs(chngDir) > 1000
    ) {
      // directionOfChng holds %, chngInDirection holds the OI direction value
      fixed.chngInDirectionPct = dir;
      fixed.directionOfChng = chngDir;
      fixed.chngInDirection = null;
    } else if (
      dirPct == null &&
      typeof dir === "number" &&
      Math.abs(dir) <= 100 &&
      (chngDir == null || chngDir === "")
    ) {
      fixed.chngInDirectionPct = dir;
      // Keep directionOfChng only if it still looks like an OI number
      if (Math.abs(dir) <= 100) fixed.directionOfChng = null;
    }

    // If diffInOI missing, try to recover a large integer from raw cells that
    // isn't already used as call/put OI.
    if (fixed.diffInOI == null) {
      const used = new Set(
        [fixed.chngInCallOI, fixed.chngInPutOI, fixed.directionOfChng, fixed.chngInDirection]
          .filter((v) => typeof v === "number")
          .map((v) => v)
      );
      for (const cell of rawCells) {
        const num = parseNumber(cell);
        if (typeof num === "number" && Math.abs(num) > 1000 && !used.has(num)) {
          // Prefer values near call/put magnitude as Diff. in OI
          if (
            typeof fixed.chngInCallOI === "number" &&
            typeof fixed.chngInPutOI === "number" &&
            Math.abs(Math.abs(fixed.chngInPutOI - fixed.chngInCallOI) - Math.abs(num)) < 1
          ) {
            fixed.diffInOI = num;
            break;
          }
        }
      }
      if (fixed.diffInOI == null && typeof fixed.chngInCallOI === "number" && typeof fixed.chngInPutOI === "number") {
        fixed.diffInOI = fixed.chngInPutOI - fixed.chngInCallOI;
      }
    }

    return fixed;
  }

  /**
   * When headers are messy, map by canonical OIPulse column order.
   * Skips leading serial-number cell if present.
   */
  function rowFromCanonicalOrder(cellTexts) {
    let cells = (cellTexts || []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
    if (cells.length && /^\d+$/.test(cells[0])) cells = cells.slice(1);

    // Need at least date/time/ltp/strength/sentiment-ish width
    if (cells.length < 8) return null;

    const row = {};
    CANONICAL_KEYS.forEach((key, index) => {
      if (index < cells.length) row[key] = parseCellValue(key, cells[index]);
    });
    return repairRow(row, cellTexts);
  }

  function buildRow(keys, cellTexts) {
    const mapped = cellsToRow(keys, cellTexts);
    const headerQuality =
      keys.includes("time") &&
      keys.includes("sentiment") &&
      keys.includes("strength") &&
      keys.filter((k) => k === "diffInOI").length <= 1 &&
      keys.filter((k) => k === "directionOfChng").length <= 1;

    if (headerQuality && looksLikeTime(mapped.time) && !looksLikeSentiment(mapped.time)) {
      return mapped;
    }

    // Fallback: positional mapping for known OIPulse layout
    const positional = rowFromCanonicalOrder(cellTexts);
    if (!positional) return mapped;

    // Prefer positional when mapped time is clearly wrong
    if (looksLikeSentiment(mapped.time) || !looksLikeTime(mapped.time)) {
      return positional;
    }
    return mapped;
  }

  global.OIPulseParse = {
    HEADER_ALIASES,
    CANONICAL_KEYS,
    normalizeHeader,
    headerToKey,
    parseNumber,
    parseStrength,
    parseCellValue,
    cellsToRow,
    buildRow,
    repairRow,
    rowFromCanonicalOrder
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
