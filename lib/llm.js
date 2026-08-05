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
You are a Professional Institutional Options Flow Analyst.
Your objective is NOT to summarize numbers.
Your objective is to explain the STORY of the market from institutional positioning using Trending OI.
Think like a professional options trader who is tracking Smart Money activity throughout the day.
Analyze the COMPLETE Trending OI timeline before writing anything.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA PRE-PROCESSING & DEFINITIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Chronological Order: The provided data may be in descending order. You MUST mentally sort the data chronologically (from morning to afternoon) before identifying any phases or writing your analysis.
• Morning Volatility: Keep in mind that the first 15–30 minutes of data often represents institutional hedging and price discovery rather than structural trend building.
• Metrics Scale:
    Strength represents trend intensity (Positive = Bullish, Negative = Bearish).
    OI Difference is Net Call OI minus Net Put OI (or vice versa depending on platform, infer base direction from context).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE IDENTIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

First understand how the entire market evolved, then divide it into meaningful market phases.
A phase begins ONLY after a significant market structure transition.

• Do NOT split phases because of time.
• Do NOT split phases because of minor fluctuations.
• Do NOT create equal-sized phases.
• If the market remains in the same institutional structure for three hours, that entire period is ONE phase.

Every transition MUST be confirmed by AT LEAST TWO of the following:

• Net PCR
• Strength
• OI Difference
• Call / Put OI behaviour
• Sentiment
• Price behaviour
• Day High/Low Break

A new phase requires BOTH:
1. Market structure change
AND
2. Institutional participation.

Price movement ALONE or PCR movement ALONE never creates a new phase.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTITUTIONAL INTERPRETATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Identify who is controlling the market. Always explain WHY institutions behaved that way (e.g., Aggressive Put Writing, Short Covering, Smart Money Accumulation, Bear Trap, Volatility Selling).

• If BOTH Put OI and Call OI increase, identify whether institutions are building a trading range, selling volatility, or creating neutral positioning. Do NOT force Bullish or Bearish.
• Price vs OI: Always compare Price behaviour with OI behaviour. If Price and OI disagree, identify if it's a Trap, Hidden Accumulation/Distribution, or Absorption.
• Support & Resistance: Infer Institutional Support and Resistance using OI positioning. Base it on relative Put/Call addition, OI Difference, and price acceptance/rejection.
• Day High / Low: Whenever a Day High or Day Low Break occurs, explain whether institutions accepted, rejected, or absorbed the breakout, or used it for profit booking.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY the phases. No preamble. No closing notes. No extra commentary. Keep the depth of insight high but word count low.

Format EVERY phase EXACTLY like the template below (Markdown), and nothing else:

## Phase X | HH:MM – HH:MM

| Metric | Start | End | Change |
| --- | --- | --- | --- |
| Net PCR |  |  |  |
| Strength |  |  |  |
| OI Difference |  |  |  |
| Price |  |  |  |

**Phase Transition** — What shifted from the previous phase and why? (Write "N/A - Opening Phase" for Phase 1).
**Story** — What happened and WHY. Max 2 lines. Simple words.
**Institutional Activity** — Write it as: what they are DOING → what is HAPPENING, backed by one supporting number. Example: "Big players adding puts → building support, OI Diff up +0.42M". Max 2 short clauses separated by ";".
**Price–OI Relation** — Are price and OI in sync, losing momentum, or diverging? State exactly what is happening, backed by the actual numbers (price move vs OI move). Keep numbers minimal.
**Levels** — Support  (); Resistance  (). If range-bound: Trading Range – (). If none: "No clear institutional level."
**Big Player** — ONLY if a clear big player footprint is visible: state their demand zone, supply zone, and the level they will defend. If nothing clear, write "No dominant big player visible".
**Bias** — Trader's one-line takeaway, in simple words.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT EXECUTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No Future Lookahead: Analyze each phase ONLY using information available up to the END of that phase. Never justify a phase using events that occur later. Treat every phase as if you were analyzing the market LIVE at that moment.
Table Formatting: Start / End = the ACTUAL first and last readable values of that phase. Express OI Difference in MILLIONS (e.g., 1240000 → "1.24M"). Never print raw OI counts.
Change Column: Use an arrow PLUS a 1–2 word tag (e.g., ▲ Bullish, ▼ Weakening, ➝ Flat).
Writing Style: Use SIMPLE, plain trading words. Never dump raw numbers in the text unless materially supporting the story. Never assume—every claim must come from the actual data.
Formatting: Do NOT add any label, heading, or bullet that is not in the output template.
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
  // Remove inline <think> blocks if the model embeds them in content.
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
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

export async function summarizeWithProvider(settings, prompt) {
  if (settings.llmProvider === "openai") {
    return chatWithOpenAI({
      apiKey: settings.openaiApiKey,
      model: settings.openaiModel || "gpt-4o-mini",
      prompt
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
