import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { BOT_CONFIG } from "../config.js";

const execAsync = promisify(execCallback);

function getInstanceConfig(instanceName) {
  return BOT_CONFIG.ollamaInstances?.[instanceName] || null;
}

function getDefaultInstanceName() {
  return BOT_CONFIG.ollamaDefaultInstance || "local";
}

function getFallbackModels() {
  const configured = BOT_CONFIG.ollamaFallbackModels || [];
  return configured.filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getOllamaInstanceStatus(instanceName = getDefaultInstanceName()) {
  const config = getInstanceConfig(instanceName);
  if (!config) {
    return {
      ok: false,
      online: false,
      instanceName,
      baseUrl: null,
      models: [],
      error: `Instancia '${instanceName}' nao configurada`,
    };
  }

  const baseUrl = (config.baseUrl || "").replace(/\/$/, "");

  try {
    const tagsResponse = await fetchWithTimeout(`${baseUrl}/api/tags`, 5000);
    if (tagsResponse.ok) {
      const payload = await tagsResponse.json();
      const models = Array.isArray(payload.models)
        ? payload.models.map((m) => m.name).filter(Boolean)
        : [];

      return {
        ok: true,
        online: true,
        instanceName,
        baseUrl,
        models,
        modelCount: models.length,
      };
    }
  } catch {
    // fallback para endpoint OpenAI-compatible
  }

  try {
    const modelsResponse = await fetchWithTimeout(`${baseUrl}/v1/models`, 5000);
    if (modelsResponse.ok) {
      const payload = await modelsResponse.json();
      const models = Array.isArray(payload.data)
        ? payload.data.map((m) => m.id).filter(Boolean)
        : [];

      return {
        ok: true,
        online: true,
        instanceName,
        baseUrl,
        models,
        modelCount: models.length,
      };
    }

    return {
      ok: false,
      online: false,
      instanceName,
      baseUrl,
      models: [],
      error: `HTTP ${modelsResponse.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      online: false,
      instanceName,
      baseUrl,
      models: [],
      error: error.message,
    };
  }
}

export async function listOllamaInstancesStatus() {
  const instanceNames = Object.keys(BOT_CONFIG.ollamaInstances || {});
  const statuses = await Promise.all(instanceNames.map((name) => getOllamaInstanceStatus(name)));
  return statuses;
}

async function runControlCommand(command, timeoutMs = 25000) {
  if (!command) {
    return { ok: false, stdout: "", stderr: "Comando nao configurado" };
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || "Erro ao executar comando",
    };
  }
}

export async function controlOllamaInstance(action, instanceName = getDefaultInstanceName()) {
  const config = getInstanceConfig(instanceName);
  if (!config) {
    return {
      ok: false,
      action,
      instanceName,
      error: `Instancia '${instanceName}' nao configurada`,
    };
  }

  const map = {
    start: config.startCommand,
    stop: config.stopCommand,
    restart: config.restartCommand,
  };

  const command = map[action];
  if (!command) {
    return {
      ok: false,
      action,
      instanceName,
      error: `Comando de '${action}' nao configurado para a instancia '${instanceName}'`,
    };
  }

  const runResult = await runControlCommand(command);
  const statusAfter = await getOllamaInstanceStatus(instanceName);

  if (action === "stop") {
    return {
      ok: runResult.ok,
      action,
      instanceName,
      statusAfter,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
    };
  }

  return {
    ok: runResult.ok && statusAfter.online,
    action,
    instanceName,
    statusAfter,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
  };
}

export async function ensureOllamaOnline(instanceName = getDefaultInstanceName()) {
  const initialStatus = await getOllamaInstanceStatus(instanceName);
  if (initialStatus.online) {
    return {
      ok: true,
      changed: false,
      instanceName,
      status: initialStatus,
      message: "Instancia ja estava online",
    };
  }

  const startResult = await controlOllamaInstance("start", instanceName);

  for (let i = 0; i < 10; i += 1) {
    const status = await getOllamaInstanceStatus(instanceName);
    if (status.online) {
      return {
        ok: true,
        changed: true,
        instanceName,
        status,
        message: "Instancia iniciada automaticamente",
        startResult,
      };
    }
    await sleep(1500);
  }

  return {
    ok: false,
    changed: true,
    instanceName,
    status: await getOllamaInstanceStatus(instanceName),
    message: "Instancia nao ficou online apos tentativa de start",
    startResult,
  };
}

export function listConfiguredInstanceNames() {
  return Object.keys(BOT_CONFIG.ollamaInstances || {});
}

export async function askOllamaInstance({
  prompt,
  instanceName = getDefaultInstanceName(),
  model,
  system,
}) {
  const config = getInstanceConfig(instanceName);
  if (!config) {
    return {
      ok: false,
      instanceName,
      error: `Instancia '${instanceName}' nao configurada`,
    };
  }

  const baseUrl = (config.baseUrl || "").replace(/\/$/, "");
  const selectedModel =
    model ||
    config.defaultModel ||
    process.env.COUPON_AI_MODEL ||
    "qwen2.5:1.5b";

  const fallbackModels = [
    selectedModel,
    ...getFallbackModels().filter((m) => m !== selectedModel),
  ];

  if (!prompt || !prompt.trim()) {
    return {
      ok: false,
      instanceName,
      model: selectedModel,
      error: "Prompt vazio",
    };
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/generate`, 45000);
    if (response && response.ok) {
      // endpoint existe, segue fluxo normal abaixo
    }
  } catch {
    // validação opcional de conectividade, segue para chamada principal
  }

  const errors = [];

  for (const currentModel of fallbackModels) {
    const ensureResult = await ensureModelAvailable({
      baseUrl,
      modelName: currentModel,
      enablePull: BOT_CONFIG.ollamaAutoPullModels,
    });

    if (!ensureResult.ok) {
      errors.push(`[${currentModel}] ${ensureResult.error}`);
      continue;
    }

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: currentModel,
          prompt: prompt.trim(),
          system: system || undefined,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        errors.push(`[${currentModel}] HTTP ${response.status}: ${errorText}`);
        continue;
      }

      const data = await response.json();
      const answer = (data.response || "").trim();

      if (!answer) {
        errors.push(`[${currentModel}] resposta vazia do modelo`);
        continue;
      }

      return {
        ok: true,
        instanceName,
        model: currentModel,
        answer,
        promptEvalCount: data.prompt_eval_count || null,
        evalCount: data.eval_count || null,
      };
    } catch (error) {
      errors.push(`[${currentModel}] ${error.message}`);
    }
  }

  return {
    ok: false,
    instanceName,
    model: selectedModel,
    error: errors.length > 0
      ? `Nao foi possivel responder com nenhum modelo. Detalhes: ${errors.join(" | ")}`
      : "Falha ao consultar modelo",
  };
}

async function ensureModelAvailable({ baseUrl, modelName, enablePull }) {
  const tagsStatus = await getModelsFromTags(baseUrl);
  if (!tagsStatus.ok) {
    return {
      ok: false,
      error: tagsStatus.error || "nao foi possivel consultar modelos",
    };
  }

  if (tagsStatus.models.includes(modelName)) {
    return { ok: true, pulled: false };
  }

  if (!enablePull) {
    return {
      ok: false,
      error: `modelo '${modelName}' nao encontrado e auto-pull desabilitado`,
    };
  }

  const pullResult = await pullModel(baseUrl, modelName);
  if (!pullResult.ok) {
    return {
      ok: false,
      error: pullResult.error || `falha ao fazer pull de '${modelName}'`,
    };
  }

  return { ok: true, pulled: true };
}

async function getModelsFromTags(baseUrl) {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, 8000);
    if (!response.ok) {
      return { ok: false, models: [], error: `HTTP ${response.status}` };
    }

    const payload = await response.json();
    const models = Array.isArray(payload.models)
      ? payload.models.map((m) => m.name).filter(Boolean)
      : [];

    return { ok: true, models };
  } catch (error) {
    return { ok: false, models: [], error: error.message };
  }
}

async function pullModel(baseUrl, modelName) {
  try {
    console.log(`[Ollama] Modelo '${modelName}' ausente. Tentando pull automatico...`);
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: modelName,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}
