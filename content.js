(() => {
  if (globalThis.__OIPulseStrengthAlertLoaded) return;
  globalThis.__OIPulseStrengthAlertLoaded = true;

  const { headerToKey, buildRow } = globalThis.OIPulseParse;

  const TABLE_SELECTORS = [
    "table",
    "[role='table']",
    ".ag-root-wrapper",
    ".MuiDataGrid-root",
    "[class*='table']",
    "[class*='Table']"
  ];

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findNativeTable() {
    const tables = Array.from(document.querySelectorAll("table"));
    let best = null;
    let bestScore = 0;

    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll("thead th, tr th")).map(textOf);
      const headerBlob = headers.join(" ").toLowerCase();
      let score = 0;
      if (headerBlob.includes("strength")) score += 5;
      if (headerBlob.includes("sentiment")) score += 3;
      if (headerBlob.includes("ltp")) score += 2;
      if (headerBlob.includes("pcr")) score += 2;
      if (headerBlob.includes("call oi") || headerBlob.includes("put oi")) score += 2;
      const rows = table.querySelectorAll("tbody tr, tr").length;
      score += Math.min(rows, 20) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = table;
      }
    }

    return bestScore >= 5 ? best : null;
  }

  function scrapeNativeTable(table) {
    let headerCells = Array.from(table.querySelectorAll("thead th"));
    if (!headerCells.length) {
      const firstRow = table.querySelector("tr");
      headerCells = firstRow ? Array.from(firstRow.querySelectorAll("th, td")) : [];
    }

    const keys = headerCells.map((cell) => headerToKey(textOf(cell)));
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    const rowsSource = bodyRows.length
      ? bodyRows
      : Array.from(table.querySelectorAll("tr")).slice(1);

    return rowsSource
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td, th")).map(textOf);
        if (!cells.length || cells.every((c) => !c)) return null;
        return buildRow(keys, cells);
      })
      .filter(Boolean)
      .filter((row) => row.date || row.time || row.strength !== undefined);
  }

  function scrapeGridFallback() {
    for (const selector of TABLE_SELECTORS) {
      const root = document.querySelector(selector);
      if (!root || root.tagName === "TABLE") continue;

      const headerEls = root.querySelectorAll(
        "[role='columnheader'], .ag-header-cell-text, .MuiDataGrid-columnHeaderTitle, th"
      );
      const keys = Array.from(headerEls).map((el) => headerToKey(textOf(el)));
      if (!keys.some((k) => k === "strength")) continue;

      const rowEls = root.querySelectorAll(
        "[role='row']:not([aria-rowindex='1']), .ag-row, .MuiDataGrid-row, tr"
      );
      const rows = [];
      for (const rowEl of rowEls) {
        const cells = Array.from(
          rowEl.querySelectorAll("[role='gridcell'], .ag-cell, .MuiDataGrid-cell, td, th")
        ).map(textOf);
        if (!cells.length) continue;
        const row = buildRow(keys.length ? keys : [], cells);
        if (row.date || row.time || row.strength !== undefined) rows.push(row);
      }
      if (rows.length) return rows;
    }
    return [];
  }

  function scrapeTable() {
    const table = findNativeTable();
    let rows = table ? scrapeNativeTable(table) : [];
    if (!rows.length) rows = scrapeGridFallback();
    return {
      ok: rows.length > 0,
      rows,
      scrapedAt: new Date().toISOString(),
      error: rows.length ? null : "Could not find Trending OI table on the page."
    };
  }

  function getFirstStrength() {
    const result = scrapeTable();
    const row = result.rows[0] || null;
    return {
      ok: Boolean(row),
      strength: row?.strength ?? null,
      row,
      scrapedAt: result.scrapedAt,
      error: result.error
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return false;

    if (message.type === "SCRAPE_TABLE") {
      sendResponse(scrapeTable());
      return true;
    }

    if (message.type === "GET_FIRST_STRENGTH") {
      sendResponse(getFirstStrength());
      return true;
    }

    return false;
  });
})();
