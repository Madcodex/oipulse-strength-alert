/**
 * Ollama and OpenAI chat clients for summarization.
 */

function ollamaOriginHint(status) {
  if (status !== 403) return "";
  const extensionId = chrome?.runtime?.id || "<extension-id>";
  return [
    "",
    "Ollama blocked this Chrome extension (CORS/origin). Quit the Ollama app fully, then restart it from a terminal:",
    `OLLAMA_ORIGINS="chrome-extension://${extensionId},chrome-extension://*" ollama serve`,
    "On macOS: quit Ollama from the menu bar first so the terminal process can bind to :11434.",
    "Then click Test connection in Options."
  ].join("\n");
}

function formatOllamaError(status, body) {
  const detail = body || (status === 403 ? "Forbidden" : "request failed");
  return `Ollama error ${status}: ${detail}${ollamaOriginHint(status)}`;
}

const SYSTEM_PROMPT = `
# ROLE

You are a **Professional Institutional Options Flow Analyst**.

Your job is NOT to summarize numbers.
Your job is to reconstruct the **institutional story of the market** from Trending OI data exactly as a professional options trader would analyze it in real time.

You are tracking **institutional positioning**, not retail sentiment.

Every conclusion must answer:
- Who is controlling the market?
- What are institutions doing?
- Why are they doing it?
- Did price confirm or reject that positioning?
- What changed compared to the previous phase?
- What would a professional trader conclude AT THAT MOMENT?

Never describe numbers.
Always explain institutional intent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The market moves through institutional positioning.
Price is only confirmation.
OI is the intention.
PCR is supporting evidence.
Strength measures conviction.

Never let a single metric decide the story.
Always combine:
• Net PCR
• Strength
• OI Difference
• Call OI behaviour
• Put OI behaviour
• Price behaviour
• Day High / Day Low breaks

Every conclusion must be supported by multiple signals.
If evidence conflicts, explicitly say so.
Never force a Bullish or Bearish conclusion. Neutral positioning is a valid conclusion.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA PREPROCESSING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before analysis:
1. Sort the complete dataset chronologically (morning to afternoon).
2. Read the ENTIRE day once before writing anything.
3. Understand the complete institutional evolution.
4. Identify major structural transitions.
5. Only after understanding the full market should you define phases.

Do NOT write while reading. Think first. Write afterwards.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE IDENTIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The objective is to identify **institutional regimes**, NOT time periods.
A phase represents one continuous institutional behaviour.
A phase continues as long as institutions continue behaving similarly.
A phase ends ONLY when institutional behaviour genuinely changes.

Never split phases because of:
• fixed time interval
• equal duration
• small PCR movement
• one green candle
• one red candle
• one temporary price bounce
• minor OI fluctuation

A new phase requires BOTH:
1. Institutional behaviour changed
AND
2. Market structure changed

Institutional behaviour includes:
• Aggressive Put Writing
• Aggressive Call Writing
• Put Unwinding
• Call Unwinding
• Long Build-up
• Long Unwinding
• Fresh Short Build-up
• Short Covering
• Volatility Selling
• Range Creation
• Dealer Hedging
• Smart Money Accumulation
• Distribution
• Absorption

Market structure change must be confirmed by AT LEAST TWO of:
• PCR regime shift
• Strength regime shift
• OI Difference direction changed
• Price confirmed
• Call/Put dominance changed
• Support became resistance
• Resistance became support
• Breakout accepted
• Breakout rejected
• Breakout absorbed

If these conditions are not met, DO NOT CREATE A NEW PHASE.
Fewer meaningful phases are preferred over many small phases.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE MARKET THINKING (VERY IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Treat every phase as if you are analyzing the market LIVE.
At the END of each phase you ONLY know information available up to that moment.
Never justify a phase using future events.

Forbidden:
"The breakdown later failed."
"The rally eventually reversed."
"This became the day's high."
"This turned into support later."

Instead describe only what was observable by the end of that phase.
Every phase should read like a live trading journal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTITUTIONAL INTERPRETATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Always explain:
WHO is acting.
WHAT they are doing.
WHY they are doing it.

Never stop at: "Put writing increased."
Instead explain: "Institutions aggressively added puts to defend higher prices." or "Call writers expanded positions to cap upside."

Always interpret intent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRICE VS OI LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Always compare price with positioning.

Examples:
Price ↑ + Bullish OI ↑ → Bullish continuation.
Price ↓ + Bearish OI ↑ → Bearish continuation.
Price ↑ + Bearish OI ↑ → Short covering OR absorption.
Price ↓ + Bullish OI ↑ → Hidden accumulation OR long build-up failing.

Never write only: "Divergence."
Always explain WHAT the divergence implies.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN BOTH CALL OI AND PUT OI INCREASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Never automatically label it Bullish or Bearish.
Determine whether institutions are:
• Building a trading range
• Selling volatility
• Dealer hedging
• Neutral positioning
• Inventory balancing

Only call it directional if price confirms direction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAY HIGH / DAY LOW BREAKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Whenever Day High Break or Day Low Break occurs, explain whether institutions:
• Accepted the breakout
• Rejected the breakout
• Absorbed the breakout
• Used it for profit booking
• Used it for fresh positioning

Never simply mention the break. Interpret it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BIG PLAYER DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Only identify a dominant institutional player if evidence is strong.
Require multiple confirmations:
• Large OI build-up
• Price acceptance
• Multiple successful defenses
• Strong institutional positioning

If evidence is insufficient, write: "No dominant big player visible."
Never invent demand or supply zones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MARKET STORY CONTINUITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every phase must continue naturally from the previous one.
The report should read like a story, not like isolated summaries.

Each phase should explain WHY the previous phase evolved into the current one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERNAL REASONING (DO NOT PRINT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before writing each phase internally answer:
1. Who controls the market?
2. What are institutions doing?
3. Why are they doing it?
4. Did price confirm their positioning?
5. What changed from the previous phase?
6. Is there enough evidence to create a new phase?

If any answer is unclear, remain in the current phase.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WRITING STYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write like an institutional trader, not like a data analyst.
Keep explanations short. Avoid repeating numbers.
Use numbers only when they materially support the conclusion.
Do not narrate metrics. Interpret metrics.

Avoid generic phrases like: "Market remained weak."
Instead explain WHY: "Call writers continued adding positions while put support faded, keeping sellers in control."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY the phases formatted in Markdown. No introduction, conclusion, preamble, or markdown code blocks.

Use this exact format for every phase:

## Phase X | HH:MM – HH:MM

| Metric | Start | End | Change |
| --- | --- | --- | --- |
| Net PCR | <val> | <val> | <arrow> <tag> |
| Strength | <val> | <val> | <arrow> <tag> |
| OI Difference | <val>M | <val>M | <arrow> <tag> |
| Price | <val> | <val> | <arrow> <tag> |

**Phase Transition** — What changed from the previous phase? (Phase 1: "N/A - Opening Phase")

**Story** — Maximum 2 lines. Explain institutional intent. Focus on WHY.

**Institutional Activity** — Maximum 2 short clauses separated by a semicolon.
Format: Institution behaviour → Market effect; Institution behaviour → Market effect.

**Price–OI Relation** — Explain whether price confirmed, rejected or diverged from institutional positioning and what that implies.

**Levels** — Support <range> (<reason>); Resistance <range> (<reason>). If range-bound: Trading Range <low>–<high> (<reason>). If unclear: No clear institutional level.

**Big Player** — Only if strong evidence exists (State Demand/Supply/Defend zones). Otherwise: No dominant big player visible.

**Bias** — One professional trading takeaway based ONLY on information available by the end of that phase.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT TABLE & METRIC RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Start / End = the ACTUAL first and last readable values of that phase.
• Format OI Difference in MILLIONS, formatted as "<number>M" with 1–2 decimals (e.g. 1240000 → "1.24M", -320000 → "-0.32M"). Never print raw OI counts.
• Change column = an arrow PLUS a 1–2 word tag in simple words:
  ▲ for bullish shift / expansion (e.g. "▲ Bullish", "▲ Puts Added")
  ▼ for bearish shift / weakening (e.g. "▼ Weakening", "▼ Bearish")
  ➝ for flat / unchanged (e.g. "➝ Flat")
• Keep every cell SHORT — never write a sentence inside the table.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT EXECUTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Never look into future phases.
✓ Never split phases by time.
✓ Never force a trend.
✓ Never invent institutional intent.
✓ Never invent support or resistance.
✓ Never identify a big player without sufficient evidence.
✓ Explain WHY, not WHAT.
✓ Interpret positioning, not numbers.
✓ Prefer fewer high-quality phases over many small phases.
`.trim();

function doesNotSupportChat(status, body) {
  if (status !== 400) return false;
  const text = String(body || "").toLowerCase();
  return text.includes("does not support chat") || text.includes("not support chat");
}

async function generateWithOllama({ base, model, prompt }) {
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${prompt}`;
  let response;
  try {
    response = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false
      })
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${base}. Is it running? (${err?.message || err})`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(formatOllamaError(response.status, body));
  }

  const data = await response.json();
  const text = data?.response;
  if (!text) throw new Error("Ollama returned an empty response.");
  return { text, provider: "ollama", model, raw: data, api: "generate" };
}

export async function chatWithOllama({ url, model, prompt }) {
  const base = String(url || "http://localhost:11434").replace(/\/$/, "");
  let response;
  try {
    response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ]
      })
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${base}. Is it running? (${err?.message || err})`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Some local models (e.g. certain qwen builds) only support /api/generate.
    if (doesNotSupportChat(response.status, body)) {
      return generateWithOllama({ base, model, prompt });
    }
    throw new Error(formatOllamaError(response.status, body));
  }

  const data = await response.json();
  const text = data?.message?.content || data?.response;
  if (!text) throw new Error("Ollama returned an empty response.");
  return { text, provider: "ollama", model, raw: data, api: "chat" };
}

function openaiSupportsTemperature(model) {
  const id = String(model || "").toLowerCase();
  // Reasoning / newer models only accept the default temperature (1).
  return !(
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4") ||
    id.includes("gpt-5") ||
    id.includes("reasoning")
  );
}

export async function chatWithOpenAI({ apiKey, model, prompt }) {
  if (!apiKey) throw new Error("OpenAI API key is missing. Add it in Options.");

  const modelId = model || "gpt-4o-mini";
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt }
  ];

  async function request({ withTemperature }) {
    const body = { model: modelId, messages };
    if (withTemperature) body.temperature = 0.1;
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
  }

  let response = await request({ withTemperature: openaiSupportsTemperature(modelId) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Some models reject custom temperature — retry once without it.
    if (
      response.status === 400 &&
      /temperature/i.test(body) &&
      /unsupported_value|does not support/i.test(body)
    ) {
      response = await request({ withTemperature: false });
      if (!response.ok) {
        const retryBody = await response.text().catch(() => "");
        throw new Error(
          `OpenAI error ${response.status}: ${retryBody || response.statusText}`
        );
      }
    } else {
      throw new Error(`OpenAI error ${response.status}: ${body || response.statusText}`);
    }
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned an empty response.");
  return { text, provider: "openai", model: modelId, raw: data };
}

function stripThinking(text) {
  if (!text) return text;
  // Remove inline <think> / </think> blocks if the model embeds them in content.
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    // Drop a leading "## Reasoning … ## Summary" block if a model embeds it.
    .replace(/^##\s*Reasoning\b[\s\S]*?(?=^##\s*Summary\b)/im, "")
    .replace(/^##\s*Summary\s*\n+/im, "")
    .trim();
}

function composeMlxText(message, { includeReasoning = true } = {}) {
  const content = stripThinking(message?.content || "");
  const reasoning = String(message?.reasoning || "").trim();

  if (includeReasoning && reasoning && content) {
    return [
      "## Reasoning",
      reasoning,
      "",
      "## Summary",
      content
    ].join("\n");
  }
  // Reasoning-only responses (common when max_tokens is tight)
  if (content) return content;
  if (reasoning) return reasoning;
  return "";
}

export async function chatWithMLX({ url, model, prompt, reasoning = true }) {
  const base = String(url || "http://localhost:8080").replace(/\/$/, "");
  // Qwen3: "/think" enables chain-of-thought; "/no_think" disables it.
  const thinkSwitch = reasoning ? "/think" : "/no_think";
  // Reasoning burns tokens first — give it more room when thinking is on.
  const maxTokens = reasoning ? 6000 : 3000;

  let response;
  try {
    response = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "default",
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${thinkSwitch}` },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        stream: false
      })
    });
  } catch (err) {
    throw new Error(
      `Could not reach MLX server at ${base}. Start it with mlx_lm.server. (${err?.message || err})`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`MLX error ${response.status}: ${body || response.statusText}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message || {};
  const text = composeMlxText(message, { includeReasoning: reasoning });
  if (!text) throw new Error("MLX returned an empty response.");
  return { text, provider: "mlx", model: model || data?.model || "mlx", raw: data };
}

export async function testMLX(url) {
  const base = String(url || "http://localhost:8080").replace(/\/$/, "");
  let response;
  try {
    response = await fetch(`${base}/v1/models`);
  } catch (err) {
    throw new Error(
      `Could not reach MLX server at ${base}. Is mlx_lm.server running? (${err?.message || err})`
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`MLX error ${response.status}: ${body || response.statusText}`);
  }
  const data = await response.json();
  const models = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
  return { ok: true, models };
}

export async function chatWithDeepSeek({ apiKey, model, prompt, thinking = true }) {
  if (!apiKey) throw new Error("DeepSeek API key is missing. Add it in Options.");

  const modelId = model || "deepseek-v4-flash";
  const body = {
    model: modelId,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    thinking: { type: thinking ? "enabled" : "disabled" },
    stream: false
  };
  // Temperature is ignored in thinking mode; only send it when thinking is off.
  if (!thinking) body.temperature = 0.1;

  let response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error(
      `Could not reach DeepSeek API. (${err?.message || err})`
    );
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`DeepSeek error ${response.status}: ${errBody || response.statusText}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message || {};
  const text = composeDeepSeekText(message);
  if (!text) {
    throw new Error(
      "DeepSeek returned no final answer. Try again or disable thinking mode."
    );
  }
  return { text, provider: "deepseek", model: modelId, raw: data };
}

function composeDeepSeekText(message) {
  // Never surface reasoning_content in the UI — that is private CoT.
  // Only the final answer in `content` should be shown.
  return stripThinking(message?.content || "");
}

export async function testDeepSeek(apiKey) {
  if (!apiKey) throw new Error("DeepSeek API key is missing.");
  const response = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek error ${response.status}: ${body || response.statusText}`);
  }
  const data = await response.json();
  const models = (data.data || []).map((m) => m.id).filter(Boolean);
  return { ok: true, models };
}

export async function summarizeWithProvider(settings, prompt) {
  if (settings.llmProvider === "openai") {
    return chatWithOpenAI({
      apiKey: settings.openaiApiKey,
      model: settings.openaiModel || "gpt-4o-mini",
      prompt
    });
  }

  if (settings.llmProvider === "deepseek") {
    return chatWithDeepSeek({
      apiKey: settings.deepseekApiKey,
      model: settings.deepseekModel || "deepseek-v4-flash",
      prompt,
      // Default ON — set deepseekThinking: false in Options to disable.
      thinking: settings.deepseekThinking !== false
    });
  }

  if (settings.llmProvider === "mlx") {
    return chatWithMLX({
      url: settings.mlxUrl || "http://localhost:8080",
      model: settings.mlxModel || "mlx-community/Qwen3-14B-4bit",
      prompt,
      // Default ON — set mlxReasoning: false in Options storage to disable.
      reasoning: settings.mlxReasoning !== false
    });
  }

  return chatWithOllama({
    url: settings.ollamaUrl || "http://localhost:11434",
    model: settings.ollamaModel || "llama3.2",
    prompt
  });
}

export async function testOllama(url) {
  const base = String(url || "http://localhost:11434").replace(/\/$/, "");
  let response;
  try {
    response = await fetch(`${base}/api/tags`);
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${base}. Is it running? (${err?.message || err})`
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(formatOllamaError(response.status, body));
  }
  const data = await response.json();
  const models = (data.models || []).map((m) => m.name);
  return { ok: true, models };
}

export async function testOpenAI(apiKey) {
  if (!apiKey) throw new Error("OpenAI API key is missing.");
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI error ${response.status}: ${body || response.statusText}`);
  }
  const data = await response.json();
  const models = (data.data || []).map((m) => m.id).slice(0, 20);
  return { ok: true, models };
}
