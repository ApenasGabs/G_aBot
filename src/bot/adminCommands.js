/**
 * @fileoverview Manipulador de comandos administrativos do GaBot
 * Suporta novos comandos simplificados: ok, no, stats, ia
 */

import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BOT_CONFIG, PATHS } from "../config.js";
import {
  parseAdminTerminalAction,
  runTerminalCommand,
} from "../services/adminTerminalControl.js";
import {
  askOllamaInstance,
  controlOllamaInstance,
  getOllamaInstanceStatus,
  listConfiguredInstanceNames,
  listOllamaInstancesStatus,
} from "../services/ollamaManager.js";
import {
  hasWildcard,
  processWildcardBatch,
  splitByComma,
} from "./batchProcessor.js";
import { getArguments, getFirstToken, normalizeText } from "./commandParser.js";
import * as templates from "./menuTemplates.js";

const pendingSysConfirmations = new Map();
const SYS_CONFIRM_TTL_MS = 60 * 1000;

/**
 * Manipulador principal de comandos admin
 * Suporta novos atalhos: ok, no, stats, ia
 * Mantém compatibilidade com /adm [comando]
 *
 * @async
 */
export const handleAdminCommand = async ({ client, repo, chatId, text }) => {
  console.log(`[ADMIN CMD] Recebeu comando: "${text}"`);

  const reply = async (messageText) => {
    console.log(
      `[ADMIN CMD] Enviando resposta: ${messageText.substring(0, 100)}...`,
    );
    await client.sendMessage(chatId, { text: messageText });
    console.log(`[ADMIN CMD] Resposta enviada com sucesso`);
  };

  const rawTrimmed = text.trim();
  const trimmed = normalizeText(rawTrimmed);
  const firstToken = getFirstToken(trimmed);
  const argsText = getArguments(trimmed);

  // ========== NOVOS COMANDOS SIMPLIFICADOS ==========

  // Comando: ok [id] - Aprovar sugestão
  if (firstToken === "ok") {
    if (!argsText) {
      await reply("❌ Uso: ok [id]\nExemplo: ok g1 ou ok g1,g2 ou ok g*");
      return;
    }

    // Suporta wildcards: ok g*
    if (hasWildcard(argsText)) {
      const prefix = argsText.replace("*", "");
      await handleApproveWildcard(reply, repo, client, prefix);
      return;
    }

    // Suporta lote: ok g1,g2,g3
    if (argsText.includes(",")) {
      const ids = splitByComma(argsText);
      await handleApproveBatch(reply, repo, client, ids);
      return;
    }

    // Aprovação única
    const match = argsText.match(/^([gs])(\d+)$/);
    if (match) {
      const [, type, id] = match;
      await updateSuggestionStatus(reply, repo, client, type, id, "approved");
      return;
    }

    await reply("❌ Formato inválido. Use: ok g1 ou ok g1,g2 ou ok g*");
    return;
  }

  // Comando: no [id] - Rejeitar sugestão
  if (firstToken === "no") {
    if (!argsText) {
      await reply("❌ Uso: no [id]\nExemplo: no s1 ou no s1,s2 ou no s*");
      return;
    }

    if (hasWildcard(argsText)) {
      const prefix = argsText.replace("*", "");
      await handleRejectWildcard(reply, repo, client, prefix);
      return;
    }

    if (argsText.includes(",")) {
      const ids = splitByComma(argsText);
      await handleRejectBatch(reply, repo, client, ids);
      return;
    }

    const match = argsText.match(/^([gs])(\d+)$/);
    if (match) {
      const [, type, id] = match;
      await updateSuggestionStatus(reply, repo, client, type, id, "rejected");
      return;
    }

    await reply("❌ Formato inválido. Use: no s1 ou no s1,s2 ou no s*");
    return;
  }

  // Comando: stats - Status do bot
  if (firstToken === "stats") {
    await showBotStatus(reply, repo);
    return;
  }

  // Comando: sys - controle seguro de terminal
  if (firstToken === "sys" || firstToken === "terminal") {
    await handleTerminalControl(reply, argsText, chatId);
    return;
  }

  // Comando: ia - Gerenciar Ollama
  if (firstToken === "ia") {
    if (!argsText) {
      await showOllamaMenu(reply);
      return;
    }

    // ia reset [nome]
    const resetMatch = argsText.match(/^reset\s+(\S+)$/);
    if (resetMatch) {
      const [, modelName] = resetMatch;
      await handleOllamaControl(reply, "restart", modelName);
      return;
    }

    // ia status [nome]
    const statusMatch = argsText.match(/^status(?:\s+(\S+))?$/);
    if (statusMatch) {
      await handleOllamaStatus(reply, statusMatch[1]);
      return;
    }

    await showOllamaMenu(reply);
    return;
  }

  // Comando: . [pergunta] - prompt IA direto
  if (firstToken === ".") {
    if (!argsText) {
      await reply(
        "❌ Uso: . [pergunta]\nExemplo: . extraia cupom e loja desta mensagem",
      );
      return;
    }
    await handleOllamaAsk(reply, argsText);
    return;
  }

  // Comando: logs - últimos logs consolidados
  if (firstToken === "logs") {
    await handleRecentLogs(reply);
    return;
  }

  // Comando: gruposbot - lista todos os grupos onde o bot participa
  if (firstToken === "gruposbot") {
    await listBotGroups(reply, client);
    return;
  }

  // ========== COMANDOS LEGACY (COMPATIBILIDADE) ==========

  const tokens = trimmed.split(/\s+/);
  const firstTokenNoSlash = firstToken.replace(/^\//, "");
  const restArgs = argsText;

  let normalizedCommand = trimmed;

  const adminAliases = {
    adm0: "/adm",
    adm1: "/adm status",
    adm2: "/adm sugestoes",
    adm3: "/adm grupos",
    adm4: "/adm gerais",
    adms: "/adm sugestoes",
    admg: "/adm grupos",
    adm7: "/adm lidas",
    adm8: "/adm ia",
    adm9: "/adm ia status",
    adm10: "/adm ia start",
    adm11: "/adm ia stop",
    adm12: "/adm ia restart",
    adm13: "/adm ia instancias",
    adm14: "/adm ia ask",
    adm15: "/adm gruposbot",
  };

  if (adminAliases[firstTokenNoSlash]) {
    normalizedCommand = restArgs
      ? `${adminAliases[firstTokenNoSlash]} ${restArgs}`
      : adminAliases[firstTokenNoSlash];
  } else if (firstTokenNoSlash === "adm5") {
    normalizedCommand = restArgs ? `/adm aprovar ${restArgs}` : "/adm aprovar";
  } else if (firstTokenNoSlash === "adm6") {
    normalizedCommand = restArgs
      ? `/adm rejeitar ${restArgs}`
      : "/adm rejeitar";
  }

  console.log(`[ADMIN CMD] Comando normalizado: "${normalizedCommand}"`);

  // Comando /adm ou /admin - mostra menu
  if (
    normalizedCommand === "/adm" ||
    normalizedCommand === "/admin" ||
    firstToken === "adm"
  ) {
    console.log(`[ADMIN CMD] Mostrando menu admin`);
    await showAdminMenu(reply);
    return;
  }

  // Comando /adm sugestoes - lista todas as sugestões pendentes
  if (
    normalizedCommand === "/adm sugestoes" ||
    normalizedCommand === "/adm sugestões"
  ) {
    console.log(`[ADMIN CMD] Listando todas sugestões`);
    await listAllSuggestions(reply, repo, client);
    return;
  }

  // Comando /adm grupos - lista apenas sugestões de grupos
  if (normalizedCommand === "/adm grupos") {
    await listGroupSuggestions(reply, repo, client);
    return;
  }

  // Comando /adm gerais - lista apenas sugestões gerais
  if (normalizedCommand === "/adm gerais") {
    await listGeneralSuggestions(reply, repo, client);
    return;
  }

  // Comando /adm status - mostra status do bot
  if (
    normalizedCommand === "/adm status" ||
    normalizedCommand === "/adm health"
  ) {
    console.log(`[ADMIN CMD] Mostrando status do bot`);
    await showBotStatus(reply, repo);
    return;
  }

  if (normalizedCommand === "/adm lidas") {
    await showReadSuggestions(reply, repo);
    return;
  }

  if (normalizedCommand === "/adm logs") {
    await handleRecentLogs(reply);
    return;
  }

  if (normalizedCommand === "/adm gruposbot") {
    await listBotGroups(reply, client);
    return;
  }

  if (normalizedCommand === "/adm ia") {
    await showOllamaMenu(reply);
    return;
  }

  const sysMatch = normalizedCommand.match(/^\/adm\s+(?:sys|terminal)\s*(.*)$/);
  if (sysMatch) {
    await handleTerminalControl(reply, (sysMatch[1] || "").trim(), chatId);
    return;
  }

  const iaStatusMatch = normalizedCommand.match(
    /^\/adm\s+ia\s+status(?:\s+(\S+))?$/,
  );
  if (iaStatusMatch) {
    await handleOllamaStatus(reply, iaStatusMatch[1]);
    return;
  }

  const iaStartMatch = normalizedCommand.match(
    /^\/adm\s+ia\s+start(?:\s+(\S+))?$/,
  );
  if (iaStartMatch) {
    await handleOllamaControl(reply, "start", iaStartMatch[1]);
    return;
  }

  const iaStopMatch = normalizedCommand.match(
    /^\/adm\s+ia\s+stop(?:\s+(\S+))?$/,
  );
  if (iaStopMatch) {
    await handleOllamaControl(reply, "stop", iaStopMatch[1]);
    return;
  }

  const iaRestartMatch = normalizedCommand.match(
    /^\/adm\s+ia\s+restart(?:\s+(\S+))?$/,
  );
  if (iaRestartMatch) {
    await handleOllamaControl(reply, "restart", iaRestartMatch[1]);
    return;
  }

  if (normalizedCommand === "/adm ia instancias") {
    await handleListInstances(reply);
    return;
  }

  const askArgs = extractAskArgs(rawTrimmed);
  if (askArgs) {
    await handleOllamaAsk(reply, askArgs);
    return;
  }

  // Comando /adm aprovar [id] ou /adm rejeitar [id]
  const approveMatch = normalizedCommand.match(
    /^\/adm\s+aprovar\s+([gs])\s*(\d+)$/,
  );
  if (approveMatch) {
    const [, type, id] = approveMatch;
    await updateSuggestionStatus(reply, repo, client, type, id, "approved");
    return;
  }

  const rejectMatch = normalizedCommand.match(
    /^\/adm\s+rejeitar\s+([gs])\s*(\d+)$/,
  );
  if (rejectMatch) {
    const [, type, id] = rejectMatch;
    await updateSuggestionStatus(reply, repo, client, type, id, "rejected");
    return;
  }
};

const statusLabel = (status) => {
  if (status === "pending") return "pendente";
  if (status === "read") return "lida";
  if (status === "approved") return "aprovada";
  if (status === "rejected") return "rejeitada";
  return status || "desconhecido";
};

const notifySuggestionStatusChange = async (
  client,
  suggestionType,
  suggestion,
  status,
) => {
  if (!client || !suggestion?.user_id) return;

  const idPrefix = suggestionType === "g" ? "g" : "s";
  const statusText = statusLabel(status);

  let message;
  if (suggestionType === "g") {
    message = [
      `📌 Atualizacao da sua sugestao ${idPrefix}${suggestion.id}`,
      `Status: ${statusText}`,
      `Grupo: ${suggestion.group_name || "Nao identificado"}`,
    ].join("\n");
  } else {
    message = [
      `📌 Atualizacao da sua sugestao ${idPrefix}${suggestion.id}`,
      `Status: ${statusText}`,
      `Sugestao: ${(suggestion.suggestion_text || "").substring(0, 120)}`,
    ].join("\n");
  }

  try {
    await client.sendMessage(suggestion.user_id, { text: message });
  } catch (error) {
    console.log(
      `[ADMIN CMD] Nao foi possivel notificar ${suggestion.user_id}: ${error.message}`,
    );
  }
};

const showAdminMenu = async (reply) => {
  await reply(templates.getAdminMenu());
};

const showOllamaMenu = async (reply) => {
  await reply(
    [
      "🤖 *Painel IA / Ollama*",
      "",
      "ia - menu IA",
      "ia status [instancia] - status",
      "ia reset [instancia] - restart",
      ". [pergunta] - prompt rapido na IA",
      "",
      "Exemplos:",
      "ia",
      "ia status",
      "ia reset local",
      ". qual o melhor cupom da mensagem X?",
      ". local::extraia cupom e loja desta mensagem: ...",
    ].join("\n"),
  );
};

const executeTerminalAction = async (reply, parsed) => {
  await reply(`Executando: ${parsed.summary}...`);

  if (parsed.useSudo && !BOT_CONFIG.sudoPassword) {
    await reply(
      "❌ Senha sudo nao configurada. Defina BOT_SUDO_PASSWORD no .env.",
    );
    return;
  }

  const result = await runTerminalCommand({
    command: parsed.command,
    args: parsed.args,
    cwd: PATHS.root,
    timeoutMs: parsed.timeoutMs,
    useSudo: parsed.useSudo,
    sudoPassword: BOT_CONFIG.sudoPassword,
  });

  const commandLine = `${parsed.command} ${parsed.args.join(" ")}`.trim();
  const statusLabel = result.ok ? "✅ Concluido" : "❌ Falhou";
  const lines = [
    `${statusLabel}: ${parsed.summary}`,
    `Comando: ${commandLine}`,
  ];

  if (result.timedOut) {
    lines.push("Tempo limite atingido.");
  }

  if (result.stdout && result.stdout !== "(sem saida)") {
    lines.push("", "Saida (terminal):", result.stdout);
  }

  if (result.stderr && result.stderr !== "(sem saida)") {
    lines.push("", "Stderr (terminal):", result.stderr);
  }

  await reply(lines.join("\n"));
};

const handleTerminalControl = async (reply, argsText, chatId) => {
  const normalizedArgs = String(argsText || "")
    .trim()
    .toLowerCase();

  if (normalizedArgs === "confirmar" || normalizedArgs === "sim") {
    const pending = pendingSysConfirmations.get(chatId);
    if (!pending) {
      await reply("⚠️ Nao ha comando pendente para confirmar.");
      return;
    }

    if (Date.now() - pending.createdAt > SYS_CONFIRM_TTL_MS) {
      pendingSysConfirmations.delete(chatId);
      await reply("⚠️ Confirmacao expirada. Envie o comando novamente.");
      return;
    }

    pendingSysConfirmations.delete(chatId);
    await executeTerminalAction(reply, pending.parsed);
    return;
  }

  if (normalizedArgs === "cancelar" || normalizedArgs === "nao") {
    pendingSysConfirmations.delete(chatId);
    await reply("✅ Comando cancelado.");
    return;
  }

  const parsed = parseAdminTerminalAction(argsText, {
    allowSystemReboot: BOT_CONFIG.allowSystemReboot,
    allowSudoCommands: BOT_CONFIG.allowSudoCommands,
  });

  if (!parsed.ok) {
    if (parsed.usage) {
      await reply(parsed.usage);
      return;
    }

    await reply(`❌ ${parsed.error}`);
    return;
  }

  if (parsed.requiresConfirmation) {
    pendingSysConfirmations.set(chatId, {
      parsed,
      createdAt: Date.now(),
    });

    await reply(
      [
        `⚠️ Tem certeza que deseja executar: ${parsed.summary}?`,
        "Responda com: sys confirmar",
        "Para cancelar: sys cancelar",
      ].join("\n"),
    );
    return;
  }

  await executeTerminalAction(reply, parsed);
};

const extractAskArgs = (rawText) => {
  const dotShortcut = rawText.match(/^\.\s+([\s\S]+)$/i);
  if (dotShortcut?.[1]) {
    return dotShortcut[1].trim();
  }

  const iaAsk = rawText.match(/^ia\s+(?:ask|perguntar|prompt)\s+([\s\S]+)$/i);
  if (iaAsk?.[1]) {
    return iaAsk[1].trim();
  }

  const directAlias = rawText.match(/^\/?adm14\s+([\s\S]+)$/i);
  if (directAlias?.[1]) {
    return directAlias[1].trim();
  }

  const full = rawText.match(
    /^\/?adm(?:in)?\s+ia\s+(?:ask|perguntar|prompt)\s+([\s\S]+)$/i,
  );
  if (full?.[1]) {
    return full[1].trim();
  }

  return null;
};

const parseAskPayload = (input) => {
  const value = (input || "").trim();
  if (!value) {
    return { instanceName: "local", prompt: "" };
  }

  if (value.includes("::")) {
    const [left, ...rest] = value.split("::");
    const maybeInstance = left.trim();
    const prompt = rest.join("::").trim();
    if (maybeInstance && prompt) {
      return { instanceName: maybeInstance, prompt };
    }
  }

  return { instanceName: "local", prompt: value };
};

const handleOllamaAsk = async (reply, askInput) => {
  const { instanceName, prompt } = parseAskPayload(askInput);

  if (!prompt) {
    await reply(
      "Uso: . [instancia::]pergunta\nEx: . local::extraia cupom e loja desta mensagem",
    );
    return;
  }

  await reply(`Enviando pergunta para o modelo (${instanceName})...`);

  const result = await askOllamaInstance({
    instanceName,
    prompt,
  });

  if (!result.ok) {
    await reply(`❌ Falha na consulta ao modelo: ${result.error}`);
    return;
  }

  const answer =
    result.answer.length > 1500
      ? `${result.answer.slice(0, 1500)}\n...[resposta truncada]`
      : result.answer;

  await reply(
    [
      `✅ Resposta do modelo (${result.instanceName} | ${result.model})`,
      "",
      answer,
    ].join("\n"),
  );
};

const handleListInstances = async (reply) => {
  const instances = listConfiguredInstanceNames();
  if (instances.length === 0) {
    await reply("Nenhuma instancia Ollama configurada.");
    return;
  }

  await reply(`Instancias configuradas: ${instances.join(", ")}`);
};

const handleOllamaStatus = async (reply, instanceName) => {
  if (instanceName) {
    const status = await getOllamaInstanceStatus(instanceName);
    await reply(formatOllamaStatus(status));
    return;
  }

  const statuses = await listOllamaInstancesStatus();
  const lines = ["🤖 *Status das Instancias Ollama*", ""];
  for (const status of statuses) {
    lines.push(formatOllamaStatus(status));
    lines.push("");
  }
  await reply(lines.join("\n").trim());
};

const handleOllamaControl = async (reply, action, instanceName) => {
  const target = instanceName || "local";
  await reply(`Executando '${action}' na instancia '${target}'...`);

  const result = await controlOllamaInstance(action, target);
  const statusMessage = formatOllamaStatus(
    result.statusAfter || {
      instanceName: target,
      online: false,
      error: result.error || "sem status",
      models: [],
      baseUrl: "",
    },
  );

  if (result.ok) {
    await reply(
      [`✅ Acao '${action}' concluida para '${target}'.`, statusMessage].join(
        "\n\n",
      ),
    );
    return;
  }

  const errorText = result.error || result.stderr || "falha ao executar acao";
  await reply(
    [
      `❌ Falha em '${action}' para '${target}': ${errorText}`,
      statusMessage,
    ].join("\n\n"),
  );
};

const formatOllamaStatus = (status) => {
  const instance = status.instanceName || "desconhecida";
  const baseUrl = status.baseUrl || "-";
  const onlineLabel = status.online ? "online" : "offline";
  const modelCount = status.modelCount || 0;
  const modelsText =
    status.models && status.models.length > 0
      ? status.models.slice(0, 5).join(", ")
      : "nenhum";

  const lines = [
    `Instancia: ${instance}`,
    `Status: ${onlineLabel}`,
    `Endpoint: ${baseUrl}`,
    `Modelos: ${modelCount} (${modelsText})`,
  ];

  if (status.error) {
    lines.push(`Erro: ${status.error}`);
  }

  return lines.join("\n");
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const readCpuSnapshot = async () => {
  try {
    const stat = await readFile("/proc/stat", "utf8");
    const cpuLine = stat.split("\n").find((line) => line.startsWith("cpu "));
    if (!cpuLine) return null;

    const parts = cpuLine
      .trim()
      .split(/\s+/)
      .slice(1)
      .map((v) => Number(v));

    if (parts.some((v) => Number.isNaN(v))) return null;

    const idle = (parts[3] || 0) + (parts[4] || 0);
    const total = parts.reduce((acc, cur) => acc + cur, 0);
    return { idle, total };
  } catch {
    return null;
  }
};

const readCpuUsagePercent = async (sampleMs = 250) => {
  const first = await readCpuSnapshot();
  if (!first) return null;

  await new Promise((resolve) => setTimeout(resolve, sampleMs));

  const second = await readCpuSnapshot();
  if (!second) return null;

  const totalDelta = second.total - first.total;
  const idleDelta = second.idle - first.idle;

  if (totalDelta <= 0) return null;
  const usage = (1 - idleDelta / totalDelta) * 100;
  if (!Number.isFinite(usage)) return null;
  return Math.max(0, Math.min(100, usage));
};

const readSystemTemperatureC = async () => {
  try {
    const entries = await readdir("/sys/class/thermal");
    const zones = entries.filter((name) => name.startsWith("thermal_zone"));
    if (zones.length === 0) return null;

    const values = [];
    for (const zone of zones) {
      try {
        const raw = await readFile(
          path.join("/sys/class/thermal", zone, "temp"),
          "utf8",
        );
        const parsed = Number(String(raw).trim());
        if (!Number.isFinite(parsed) || parsed <= 0) continue;

        const celsius = parsed > 200 ? parsed / 1000 : parsed;
        if (celsius < 0 || celsius > 150) continue;
        values.push(celsius);
      } catch {
        // Ignora zonas sem permissão ou sem valor legível.
      }
    }

    if (values.length === 0) return null;
    const avg = values.reduce((acc, cur) => acc + cur, 0) / values.length;
    return avg;
  } catch {
    return null;
  }
};

const showBotStatus = async (reply, repo) => {
  const uptime = process.uptime();
  const uptimeMinutes = Math.floor(uptime / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  const memoryUsage = process.memoryUsage();
  const processHeapMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramUsagePercent = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model || "desconhecido";
  const cpuCores = cpus.length || 0;
  const loadAvg = os.loadavg();
  const cpuUsage = await readCpuUsagePercent();
  const temperatureC = await readSystemTemperatureC();

  const systemUptimeSec = os.uptime();
  const sysDays = Math.floor(systemUptimeSec / 86400);
  const sysHours = Math.floor((systemUptimeSec % 86400) / 3600);
  const sysMinutes = Math.floor((systemUptimeSec % 3600) / 60);

  const timestamp = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const metrics = repo?.listCouponStoreMetrics
    ? repo.listCouponStoreMetrics(5)
    : [];

  const metricsLines = [];
  if (metrics.length > 0) {
    metricsLines.push("", "Top lojas (telemetria de cupom):");
    for (const row of metrics) {
      const detected = Number(row.detected_count || 0);
      const matched = Number(row.matched_count || 0);
      const falsePositive = Number(row.false_positive_count || 0);
      const matchRate =
        detected > 0 ? Math.round((matched / detected) * 100) : 0;
      const falsePositiveRate =
        detected + falsePositive > 0
          ? Math.round((falsePositive / (detected + falsePositive)) * 100)
          : 0;

      metricsLines.push(
        `- ${row.store_name}: match ${matchRate}% (${matched}/${detected}) | falso+ ${falsePositiveRate}% (${falsePositive})`,
      );
    }
  }

  await reply(
    [
      "✅ *Status do Bot*",
      "",
      `Horário: ${timestamp}`,
      `Uptime: ${uptimeMinutes}m ${uptimeSeconds}s`,
      `Memória do bot (heap): ${processHeapMB} MB`,
      "",
      "🖥️ *Host*",
      `Sistema: ${os.type()} ${os.release()} (${os.arch()})`,
      `Uptime do host: ${sysDays}d ${sysHours}h ${sysMinutes}m`,
      `CPU: ${cpuModel} (${cpuCores} cores)`,
      `Uso de CPU: ${cpuUsage == null ? "indisponível" : `${cpuUsage.toFixed(1)}%`}`,
      `Carga (1/5/15m): ${loadAvg.map((v) => v.toFixed(2)).join(" / ")}`,
      `RAM: ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${ramUsagePercent.toFixed(1)}%)`,
      `Temperatura: ${temperatureC == null ? "indisponível" : `${temperatureC.toFixed(1)}°C`}`,
      "",
      `Versão: gabot-ofertas v0.0.1`,
      `Node.js: ${process.version}`,
      ...metricsLines,
      "",
      "Bot operacional 🟢",
    ].join("\n"),
  );
};

const listAllSuggestions = async (reply, repo, client) => {
  const justReadGroups = repo.markPendingGroupSuggestionsAsRead(10);
  const justReadGeneral = repo.markPendingGeneralSuggestionsAsRead(10);

  for (const s of justReadGroups) {
    await notifySuggestionStatusChange(client, "g", s, "read");
  }
  for (const s of justReadGeneral) {
    await notifySuggestionStatusChange(client, "s", s, "read");
  }

  const groupSuggestions = repo.listPendingGroupSuggestions(10);
  const generalSuggestions = repo.listPendingGeneralSuggestions(10);

  if (groupSuggestions.length === 0 && generalSuggestions.length === 0) {
    await reply("Nenhuma sugestão pendente no momento.");
    return;
  }

  const lines = ["📋 *Sugestões Pendentes*", ""];

  if (groupSuggestions.length > 0) {
    lines.push("*Grupos:*");
    groupSuggestions.forEach((s) => {
      lines.push(
        `[g${s.id}] ${s.group_name || "Sem nome"}`,
        `  Status: ${statusLabel(s.status)}`,
        `  Usuario: ${s.user_name || "Desconhecido"}`,
        `  Link: ${s.group_link}`,
        "",
      );
    });
  }

  if (generalSuggestions.length > 0) {
    lines.push("*Sugestões Gerais:*");
    generalSuggestions.forEach((s) => {
      lines.push(
        `[s${s.id}] ${s.suggestion_text.substring(0, 60)}${s.suggestion_text.length > 60 ? "..." : ""}`,
        `  Status: ${statusLabel(s.status)}`,
        `  Usuario: ${s.user_name || "Desconhecido"}`,
        "",
      );
    });
  }

  lines.push("Use: /adm aprovar [tipo][id] ou /adm rejeitar [tipo][id]");
  await reply(lines.join("\n"));
};

const listGroupSuggestions = async (reply, repo, client) => {
  const justReadGroups = repo.markPendingGroupSuggestionsAsRead(15);
  for (const s of justReadGroups) {
    await notifySuggestionStatusChange(client, "g", s, "read");
  }

  const suggestions = repo.listPendingGroupSuggestions(15);

  if (suggestions.length === 0) {
    await reply("Nenhuma sugestão de grupo pendente.");
    return;
  }

  const lines = ["📋 *Sugestões de Grupos Pendentes*", ""];

  suggestions.forEach((s) => {
    lines.push(
      `[g${s.id}] ${s.group_name || "Sem nome"}`,
      `  Status: ${statusLabel(s.status)}`,
      `  Usuario: ${s.user_name || "Desconhecido"}`,
      `  Link: ${s.group_link}`,
      `  Data: ${new Date(s.created_at).toLocaleDateString("pt-BR")}`,
      "",
    );
  });

  lines.push("Use: /adm aprovar g[id] ou /adm rejeitar g[id]");
  await reply(lines.join("\n"));
};

const listGeneralSuggestions = async (reply, repo, client) => {
  const justReadGeneral = repo.markPendingGeneralSuggestionsAsRead(15);
  for (const s of justReadGeneral) {
    await notifySuggestionStatusChange(client, "s", s, "read");
  }

  const suggestions = repo.listPendingGeneralSuggestions(15);

  if (suggestions.length === 0) {
    await reply("Nenhuma sugestão geral pendente.");
    return;
  }

  const lines = ["📋 *Sugestões Gerais Pendentes*", ""];

  suggestions.forEach((s) => {
    lines.push(
      `[s${s.id}] ${s.suggestion_text}`,
      `  Status: ${statusLabel(s.status)}`,
      `  Usuario: ${s.user_name || "Desconhecido"}`,
      `  Data: ${new Date(s.created_at).toLocaleDateString("pt-BR")}`,
      "",
    );
  });

  lines.push("Use: /adm aprovar s[id] ou /adm rejeitar s[id]");
  await reply(lines.join("\n"));
};

const showReadSuggestions = async (reply, repo) => {
  const groupSuggestions = repo
    .listPendingGroupSuggestions(20)
    .filter((s) => s.status === "read");
  const generalSuggestions = repo
    .listPendingGeneralSuggestions(20)
    .filter((s) => s.status === "read");

  if (groupSuggestions.length === 0 && generalSuggestions.length === 0) {
    await reply("Nenhuma sugestao marcada como lida no momento.");
    return;
  }

  const lines = ["👁️ *Sugestoes Lidas*", ""];

  for (const s of groupSuggestions) {
    lines.push(`[g${s.id}] ${s.group_name || "Sem nome"}`);
    lines.push(`  Usuario: ${s.user_name || "Desconhecido"}`);
    lines.push("  Status: lida");
    lines.push("");
  }

  for (const s of generalSuggestions) {
    lines.push(
      `[s${s.id}] ${s.suggestion_text.substring(0, 60)}${s.suggestion_text.length > 60 ? "..." : ""}`,
    );
    lines.push(`  Usuario: ${s.user_name || "Desconhecido"}`);
    lines.push("  Status: lida");
    lines.push("");
  }

  await reply(lines.join("\n"));
};

/**
 * Manipula aprovação em lote (ex: ok g1,g2,g3)
 */
const handleSuggestionBatch = async (reply, repo, client, ids, action) => {
  const successIds = [];
  const failedIds = [];

  for (const id of ids) {
    const match = id.match(/^([gs])(\d+)$/);
    if (!match) {
      failedIds.push(id);
      continue;
    }

    const [, type, numId] = match;
    const numIdParsed = parseInt(numId, 10);

    let success = false;
    let suggestion = null;

    if (type === "g") {
      suggestion = repo.getGroupSuggestionById(numIdParsed);
      success = repo.updateGroupSuggestionStatus(numIdParsed, action);
    } else if (type === "s") {
      suggestion = repo.getGeneralSuggestionById(numIdParsed);
      success = repo.updateGeneralSuggestionStatus(numIdParsed, action);
    }

    if (success) {
      successIds.push(id);
      if (suggestion) {
        await notifySuggestionStatusChange(client, type, suggestion, action);
      }
    } else {
      failedIds.push(id);
    }
  }

  const actionLabel = action === "approved" ? "Aprovadas" : "Rejeitadas";
  let message = `✅ ${actionLabel} (${successIds.length}): ${successIds.join(", ")}\n`;
  if (failedIds.length > 0) {
    message += `❌ Falhas (${failedIds.length}): ${failedIds.join(", ")}`;
  }

  await reply(message.trim());
};

/**
 * Manipula aprovação em lote (ex: ok g1,g2,g3)
 */
const handleApproveBatch = async (reply, repo, client, ids) => {
  await handleSuggestionBatch(reply, repo, client, ids, "approved");
};

/**
 * Manipula rejeição em lote (ex: no s1,s2,s3)
 */
const handleRejectBatch = async (reply, repo, client, ids) => {
  await handleSuggestionBatch(reply, repo, client, ids, "rejected");
};

const handleWildcardSuggestions = async (
  reply,
  repo,
  client,
  prefix,
  action,
) => {
  try {
    const cleanedPrefix = (prefix || "").trim();
    if (!["g", "s"].includes(cleanedPrefix)) {
      await reply("❌ Prefixo inválido para wildcard. Use g* ou s*");
      return;
    }

    const suggestions =
      cleanedPrefix === "g"
        ? repo.listPendingGroupSuggestions(200)
        : repo.listPendingGeneralSuggestions(200);

    const pendingSuggestions = suggestions.filter(
      (s) => s.status === "pending",
    );

    if (pendingSuggestions.length === 0) {
      await reply(
        `⚠️ Nenhuma sugestão pendente com prefixo '${cleanedPrefix}'`,
      );
      return;
    }

    const wildcardItems = pendingSuggestions.map((suggestion) => ({
      id: `${cleanedPrefix}${suggestion.id}`,
      suggestion,
    }));

    const result = await processWildcardBatch({
      pattern: `${cleanedPrefix}*`,
      items: wildcardItems,
      handler: async (item) => {
        const currentSuggestion = item.suggestion;
        const success =
          cleanedPrefix === "g"
            ? repo.updateGroupSuggestionStatus(currentSuggestion.id, action)
            : repo.updateGeneralSuggestionStatus(currentSuggestion.id, action);

        if (success) {
          await notifySuggestionStatusChange(
            client,
            cleanedPrefix,
            currentSuggestion,
            action,
          );
        }

        return { success };
      },
    });

    if (!result.success) {
      await reply(`❌ ${result.error}`);
      return;
    }

    const processed = result.matched.filter((item) => item.success).length;

    const actionLabel = action === "approved" ? "aprovadas" : "rejeitadas";
    await reply(
      `✅ ${processed}/${pendingSuggestions.length} sugestões ${actionLabel}`,
    );
  } catch (error) {
    console.error("[ADMIN] Erro ao processar wildcard:", error);
    await reply("❌ Erro ao processar wildcards");
  }
};

/**
 * Manipula aprovação com wildcard (ex: ok g* - aprova todos os grupos)
 */
const handleApproveWildcard = async (reply, repo, client, prefix) => {
  await handleWildcardSuggestions(reply, repo, client, prefix, "approved");
};

/**
 * Manipula rejeição com wildcard (ex: no s* - rejeita todas as sugestões)
 */
const handleRejectWildcard = async (reply, repo, client, prefix) => {
  await handleWildcardSuggestions(reply, repo, client, prefix, "rejected");
};

const updateSuggestionStatus = async (
  reply,
  repo,
  client,
  type,
  id,
  status,
) => {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    await reply("ID inválido.");
    return;
  }

  let success = false;
  let suggestion = null;
  if (type === "g") {
    suggestion = repo.getGroupSuggestionById(numId);
    success = repo.updateGroupSuggestionStatus(numId, status);
  } else if (type === "s") {
    suggestion = repo.getGeneralSuggestionById(numId);
    success = repo.updateGeneralSuggestionStatus(numId, status);
  } else {
    await reply("Tipo inválido. Use 'g' para grupo ou 's' para sugestão.");
    return;
  }

  if (success) {
    const statusText = status === "approved" ? "aprovada" : "rejeitada";
    await reply(`✅ Sugestão ${type}${id} ${statusText} com sucesso.`);

    if (suggestion) {
      await notifySuggestionStatusChange(client, type, suggestion, status);
    }
  } else {
    await reply(`❌ Não foi possível atualizar a sugestão ${type}${id}.`);
  }
};

const handleRecentLogs = async (reply) => {
  const sections = [];
  const groupsSection = await buildLogsSection(
    PATHS.logsGroupsDir,
    "Grupos",
    2,
    2,
  );
  const usersSection = await buildLogsSection(
    PATHS.logsUsersDir,
    "Privado",
    2,
    2,
  );

  if (groupsSection) sections.push(groupsSection);
  if (usersSection) sections.push(usersSection);

  if (sections.length === 0) {
    await reply("⚠️ Nenhum log encontrado em data/logs.");
    return;
  }

  await reply(["📜 *Últimos logs*", "", ...sections].join("\n"));
};

const listBotGroups = async (reply, client) => {
  try {
    const groupsMap = await client.groupFetchAllParticipating();
    const groups = Object.values(groupsMap || {});

    if (groups.length === 0) {
      await reply("⚠️ Nenhum grupo encontrado para o bot.");
      return;
    }

    const sorted = groups
      .map((group) => ({
        id: group?.id || "",
        name: group?.subject || "Sem nome",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const lines = [
      "📚 *Grupos do Bot*",
      `Total: ${sorted.length}`,
      "",
      ...sorted.map(
        (group, index) => `${index + 1}. ${group.name} (${group.id})`,
      ),
    ];

    await reply(lines.join("\n"));
  } catch (error) {
    console.error("[ADMIN] Erro ao listar grupos do bot:", error);
    await reply("❌ Nao foi possivel listar os grupos do bot.");
  }
};

const buildLogsSection = async (dirPath, label, maxFiles, maxLinesPerFile) => {
  try {
    const files = await readdir(dirPath);
    const jsonlFiles = files.filter((name) => name.endsWith(".jsonl"));

    if (jsonlFiles.length === 0) {
      return `*${label}:* sem arquivos de log`;
    }

    const filesWithMtime = await Promise.all(
      jsonlFiles.map(async (name) => {
        const fullPath = path.join(dirPath, name);
        const content = await readFile(fullPath, "utf8");
        const lines = content.split("\n").filter(Boolean);
        const lastLine = lines[lines.length - 1] || "";
        let timestamp = 0;
        try {
          const parsed = JSON.parse(lastLine);
          timestamp = Date.parse(parsed.timestamp || "") || 0;
        } catch {
          timestamp = 0;
        }
        return { name, lines, timestamp };
      }),
    );

    const latestFiles = filesWithMtime
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxFiles);

    const sectionLines = [`*${label}:*`];
    for (const entry of latestFiles) {
      const tailLines = entry.lines.slice(-maxLinesPerFile);
      sectionLines.push(`- ${entry.name}`);
      for (const line of tailLines) {
        try {
          const parsed = JSON.parse(line);
          const text = String(parsed.text || "")
            .replace(/\s+/g, " ")
            .slice(0, 90);
          sectionLines.push(`  ${parsed.timestamp || "sem-data"} | ${text}`);
        } catch {
          sectionLines.push(`  ${line.slice(0, 90)}`);
        }
      }
    }

    return sectionLines.join("\n");
  } catch {
    return `*${label}:* indisponível`;
  }
};
