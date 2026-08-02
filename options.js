const form = document.getElementById("settingsForm");
const statusEl = document.getElementById("optionsStatus");
const testBtn = document.getElementById("testBtn");
const testSoundBtn = document.getElementById("testSoundBtn");
const mlxFields = document.getElementById("mlxFields");
const ollamaFields = document.getElementById("ollamaFields");
const openaiFields = document.getElementById("openaiFields");
const ollamaCommand = document.getElementById("ollamaCommand");
const mlxCommand = document.getElementById("mlxCommand");
const extensionIdEl = document.getElementById("extensionId");

const fields = {
  strengthHigh: document.getElementById("strengthHigh"),
  strengthLow: document.getElementById("strengthLow"),
  monitoringEnabled: document.getElementById("monitoringEnabled"),
  alertsEnabled: document.getElementById("alertsEnabled"),
  autoOpenTab: document.getElementById("autoOpenTab"),
  alertSoundEnabled: document.getElementById("alertSoundEnabled"),
  autoDownloadJson: document.getElementById("autoDownloadJson"),
  mlxUrl: document.getElementById("mlxUrl"),
  mlxModel: document.getElementById("mlxModel"),
  mlxReasoning: document.getElementById("mlxReasoning"),
  ollamaUrl: document.getElementById("ollamaUrl"),
  ollamaModel: document.getElementById("ollamaModel"),
  openaiApiKey: document.getElementById("openaiApiKey"),
  openaiModel: document.getElementById("openaiModel")
};

function setStatus(message, kind = "") {
  statusEl.textContent = message || "";
  statusEl.classList.remove("error", "ok");
  if (kind) statusEl.classList.add(kind);
}

function selectedProvider() {
  const checked = form.querySelector('input[name="llmProvider"]:checked');
  return checked?.value || "ollama";
}

function syncProviderFields() {
  const provider = selectedProvider();
  mlxFields.style.display = provider === "mlx" ? "block" : "none";
  ollamaFields.style.display = provider === "ollama" ? "block" : "none";
  openaiFields.style.display = provider === "openai" ? "block" : "none";
}

function updateOllamaCommand(extensionId) {
  const id = extensionId || chrome.runtime.id;
  extensionIdEl.textContent = id;
  ollamaCommand.textContent = `OLLAMA_ORIGINS="chrome-extension://${id},chrome-extension://*" ollama serve`;
}

function updateMlxCommand() {
  const model = fields.mlxModel.value.trim() || "mlx-community/Qwen3-14B-4bit";
  mlxCommand.textContent = `~/.mlx-oipulse/venv/bin/mlx_lm.server --model ${model} --port 8080`;
}

function readFormSettings() {
  return {
    strengthHigh: Number(fields.strengthHigh.value),
    strengthLow: Number(fields.strengthLow.value),
    monitoringEnabled: fields.monitoringEnabled.checked,
    alertsEnabled: fields.alertsEnabled.checked,
    autoOpenTab: fields.autoOpenTab.checked,
    alertSoundEnabled: fields.alertSoundEnabled.checked,
    autoDownloadJson: fields.autoDownloadJson.checked,
    llmProvider: selectedProvider(),
    mlxUrl: fields.mlxUrl.value.trim() || "http://localhost:8080",
    mlxModel: fields.mlxModel.value.trim() || "mlx-community/Qwen3-14B-4bit",
    mlxReasoning: fields.mlxReasoning.checked,
    ollamaUrl: fields.ollamaUrl.value.trim() || "http://localhost:11434",
    ollamaModel: fields.ollamaModel.value.trim() || "qwen3:8b",
    openaiApiKey: fields.openaiApiKey.value.trim(),
    openaiModel: fields.openaiModel.value.trim() || "gpt-4o-mini"
  };
}

function fillForm(settings, extensionId) {
  fields.strengthHigh.value = settings.strengthHigh ?? 40;
  fields.strengthLow.value = settings.strengthLow ?? -40;
  fields.monitoringEnabled.checked = Boolean(settings.monitoringEnabled);
  fields.alertsEnabled.checked = settings.alertsEnabled !== false;
  fields.autoOpenTab.checked = Boolean(settings.autoOpenTab);
  fields.alertSoundEnabled.checked = settings.alertSoundEnabled !== false;
  fields.autoDownloadJson.checked = Boolean(settings.autoDownloadJson);
  fields.mlxUrl.value = settings.mlxUrl || "http://localhost:8080";
  fields.mlxModel.value = settings.mlxModel || "mlx-community/Qwen3-14B-4bit";
  fields.mlxReasoning.checked = settings.mlxReasoning !== false;
  fields.ollamaUrl.value = settings.ollamaUrl || "http://localhost:11434";
  fields.ollamaModel.value = settings.ollamaModel || "qwen3:8b";
  fields.openaiApiKey.value = settings.openaiApiKey || "";
  fields.openaiModel.value = settings.openaiModel || "gpt-4o-mini";

  const provider = settings.llmProvider || "mlx";
  const radio = form.querySelector(`input[name="llmProvider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  syncProviderFields();
  updateOllamaCommand(extensionId);
  updateMlxCommand();
}

async function loadSettings() {
  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  fillForm(status.settings || {}, status.extensionId);
}

form.querySelectorAll('input[name="llmProvider"]').forEach((input) => {
  input.addEventListener("change", syncProviderFields);
});

fields.mlxModel.addEventListener("input", updateMlxCommand);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = readFormSettings();
  const result = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  if (result?.ok) {
    setStatus("Settings saved.", "ok");
    fillForm(result.settings, chrome.runtime.id);
  } else {
    setStatus(result?.error || "Failed to save settings.", "error");
  }
});

testBtn.addEventListener("click", async () => {
  const settings = readFormSettings();
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  setStatus("Testing connection…");
  testBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "TEST_LLM" });
    if (!result?.ok) {
      setStatus(result?.error || "Connection test failed.", "error");
      return;
    }
    const preview = (result.models || []).slice(0, 5).join(", ");
    setStatus(
      `Connected to ${result.provider}. Models: ${preview || "(none listed)"}`,
      "ok"
    );
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    testBtn.disabled = false;
  }
});

testSoundBtn.addEventListener("click", async () => {
  const settings = readFormSettings();
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  setStatus("Playing alert sound…");
  const result = await chrome.runtime.sendMessage({ type: "TEST_ALERT_SOUND" });
  if (!result?.ok) {
    setStatus(result?.error || "Could not play sound.", "error");
  } else {
    setStatus("Alert sound played.", "ok");
  }
});

loadSettings();
