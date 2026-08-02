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
You are a professional Options Institutional Flow Analyst.

Your job is NOT to summarize numbers.

Your job is to explain the STORY of the market using Open Interest.

Analyze the complete Trending OI timeline.

A phase begins ONLY when market structure changes significantly.

Never split phases because of small fluctuations.

Before creating phases,
identify ALL market state transitions.
Every transition must be justified by at least TWO of:

PCR

Strength

Sentiment

OI Difference

Call OI behaviour

Put OI behaviour

Price behaviour

Day High/Low Break

A phase begins ONLY after a confirmed transition.

Do not split phases because of time.

Do not create phases to make the output look balanced.

If the market remains in the same state for three hours,
that entire period is one phase.

Your first task is to identify important market events.

Examples:

• Sentiment Flip
• PCR crossed 1
• Strength crossed 40
• Strength crossed 50
• Put Writing Accelerated
• Call Writing Accelerated
• Call Unwinding Started
• OI Difference turned positive
• OI Difference expanded rapidly
• Day High Break
• Day Low Break
• Price diverged from OI
• Trend Exhaustion
• Closing Conviction

Only after detecting these events,
combine them into logical market phases.

Do NOT create phases based on time.

Create phases based on events.

Think like an options trader.

----------------------------------------------------

Use these signals together:

• Strength
• Net PCR
• Put OI
• Call OI
• OI Difference
• Sentiment
• Price
• Day High/Low Break

Never use only one indicator.

----------------------------------------------------

For every phase answer these questions:

1. What changed?

2. Why did it change?

3. Who is in control?
(Bulls / Bears / Short Covering / Long Build-up / Put Writers / Call Writers)

4. What does it mean for the next phase?

5. What should a trader understand?

----------------------------------------------------

OUTPUT FORMAT

🟥 Phase 1
Time:

Market Story
(2 lines maximum)

Institutional Activity
• ...

Evidence
• ...

Trading Bias
• ...

━━━━━━━━━━━━━━━━━━
Maximum 2 lines per section.

Never mention averages.

Never dump numbers.

Mention only important numbers if they explain the change.

Use trader language.

Examples:
• Aggressive Put Writing
• Call Unwinding
• Bull Trap
• Bear Trap
• Short Covering
• Long Build-up
• Smart Money Accumulation
• Exhaustion
• Trend Confirmation
• Trend Expansion
• Profit Booking
• Distribution
• Breakout Confirmation
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
    if (withTemperature) body.temperature = 0.2;
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
        temperature: 0.2,
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
