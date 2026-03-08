import {
  controlOllamaInstance,
  getOllamaInstanceStatus,
  listConfiguredInstanceNames,
  listOllamaInstancesStatus,
} from "../services/ollamaManager.js";

export async function handleAdminCommand({ client, repo, chatId, text }) {
  console.log(`[ADMIN CMD] Recebeu comando: "${text}"`);
  
  const reply = async (messageText) => {
    console.log(`[ADMIN CMD] Enviando resposta: ${messageText.substring(0, 100)}...`);
    await client.sendMessage(chatId, { text: messageText });
    console.log(`[ADMIN CMD] Resposta enviada com sucesso`);
  };

  const trimmed = text.trim().toLowerCase();

  const tokens = trimmed.split(/\s+/);
  const firstTokenNoSlash = (tokens[0] || "").replace(/^\//, "");
  const restArgs = tokens.slice(1).join(" ").trim();

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
  };

  if (adminAliases[firstTokenNoSlash]) {
    normalizedCommand = restArgs
      ? `${adminAliases[firstTokenNoSlash]} ${restArgs}`
      : adminAliases[firstTokenNoSlash];
  } else if (firstTokenNoSlash === "adm5") {
    normalizedCommand = restArgs ? `/adm aprovar ${restArgs}` : "/adm aprovar";
  } else if (firstTokenNoSlash === "adm6") {
    normalizedCommand = restArgs ? `/adm rejeitar ${restArgs}` : "/adm rejeitar";
  }

  console.log(`[ADMIN CMD] Comando normalizado: "${normalizedCommand}"`);

  // Comando /adm ou /admin - mostra menu
  if (normalizedCommand === "/adm" || normalizedCommand === "/admin") {
    console.log(`[ADMIN CMD] Mostrando menu admin`);
    await showAdminMenu(reply);
    return;
  }

  // Comando /adm sugestoes - lista todas as sugestões pendentes
  if (normalizedCommand === "/adm sugestoes" || normalizedCommand === "/adm sugestões") {
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
  if (normalizedCommand === "/adm status" || normalizedCommand === "/adm health") {
    console.log(`[ADMIN CMD] Mostrando status do bot`);
    await showBotStatus(reply);
    return;
  }

  if (normalizedCommand === "/adm lidas") {
    await showReadSuggestions(reply, repo);
    return;
  }

  if (normalizedCommand === "/adm ia") {
    await showOllamaMenu(reply);
    return;
  }

  const iaStatusMatch = normalizedCommand.match(/^\/adm\s+ia\s+status(?:\s+(\S+))?$/);
  if (iaStatusMatch) {
    await handleOllamaStatus(reply, iaStatusMatch[1]);
    return;
  }

  const iaStartMatch = normalizedCommand.match(/^\/adm\s+ia\s+start(?:\s+(\S+))?$/);
  if (iaStartMatch) {
    await handleOllamaControl(reply, "start", iaStartMatch[1]);
    return;
  }

  const iaStopMatch = normalizedCommand.match(/^\/adm\s+ia\s+stop(?:\s+(\S+))?$/);
  if (iaStopMatch) {
    await handleOllamaControl(reply, "stop", iaStopMatch[1]);
    return;
  }

  const iaRestartMatch = normalizedCommand.match(/^\/adm\s+ia\s+restart(?:\s+(\S+))?$/);
  if (iaRestartMatch) {
    await handleOllamaControl(reply, "restart", iaRestartMatch[1]);
    return;
  }

  if (normalizedCommand === "/adm ia instancias") {
    await handleListInstances(reply);
    return;
  }

  // Comando /adm aprovar [id] ou /adm rejeitar [id]
  const approveMatch = normalizedCommand.match(/^\/adm\s+aprovar\s+([gs])\s*(\d+)$/);
  if (approveMatch) {
    const [, type, id] = approveMatch;
    await updateSuggestionStatus(reply, repo, client, type, id, 'approved');
    return;
  }

  const rejectMatch = normalizedCommand.match(/^\/adm\s+rejeitar\s+([gs])\s*(\d+)$/);
  if (rejectMatch) {
    const [, type, id] = rejectMatch;
    await updateSuggestionStatus(reply, repo, client, type, id, 'rejected');
    return;
  }
}

function statusLabel(status) {
  if (status === "pending") return "pendente";
  if (status === "read") return "lida";
  if (status === "approved") return "aprovada";
  if (status === "rejected") return "rejeitada";
  return status || "desconhecido";
}

async function notifySuggestionStatusChange(client, suggestionType, suggestion, status) {
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
    console.log(`[ADMIN CMD] Nao foi possivel notificar ${suggestion.user_id}: ${error.message}`);
  }
}

async function showAdminMenu(reply) {
  await reply(
    [
      "👮 *Painel de Administração*",
      "",
      "Comandos disponíveis:",
      "",
      "adm1 /adm status - verificar status do bot",
      "adm2 /adm sugestoes - listar todas sugestoes",
      "adm3 /adm grupos - listar sugestoes de grupos",
      "adm4 /adm gerais - listar sugestoes gerais",
      "adm7 /adm lidas - listar sugestoes lidas",
      "adm8 /adm ia - menu IA/Ollama",
      "adm9 /adm ia status [instancia]",
      "adm10 /adm ia start [instancia]",
      "adm11 /adm ia stop [instancia]",
      "adm12 /adm ia restart [instancia]",
      "adm13 /adm ia instancias",
      "",
      "Gerenciar:",
      "adm5 [tipo][id] /adm aprovar [tipo][id]",
      "adm6 [tipo][id] /adm rejeitar [tipo][id]",
      "",
      "Tipos: g (grupo) ou s (sugestao)",
      "Exemplo: adm5 g5",
    ].join("\n")
  );
}

async function showOllamaMenu(reply) {
  await reply(
    [
      "🤖 *Painel IA / Ollama*",
      "",
      "adm9 [instancia] - status",
      "adm10 [instancia] - start",
      "adm11 [instancia] - stop",
      "adm12 [instancia] - restart",
      "adm13 - listar instancias",
      "",
      "Exemplos:",
      "adm9",
      "adm10 local",
      "adm12 local",
    ].join("\n")
  );
}

async function handleListInstances(reply) {
  const instances = listConfiguredInstanceNames();
  if (instances.length === 0) {
    await reply("Nenhuma instancia Ollama configurada.");
    return;
  }

  await reply(`Instancias configuradas: ${instances.join(", ")}`);
}

async function handleOllamaStatus(reply, instanceName) {
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
}

async function handleOllamaControl(reply, action, instanceName) {
  const target = instanceName || "local";
  await reply(`Executando '${action}' na instancia '${target}'...`);

  const result = await controlOllamaInstance(action, target);
  const statusMessage = formatOllamaStatus(result.statusAfter || {
    instanceName: target,
    online: false,
    error: result.error || "sem status",
    models: [],
    baseUrl: "",
  });

  if (result.ok) {
    await reply([`✅ Acao '${action}' concluida para '${target}'.`, statusMessage].join("\n\n"));
    return;
  }

  const errorText = result.error || result.stderr || "falha ao executar acao";
  await reply([`❌ Falha em '${action}' para '${target}': ${errorText}`, statusMessage].join("\n\n"));
}

function formatOllamaStatus(status) {
  const instance = status.instanceName || "desconhecida";
  const baseUrl = status.baseUrl || "-";
  const onlineLabel = status.online ? "online" : "offline";
  const modelCount = status.modelCount || 0;
  const modelsText = status.models && status.models.length > 0
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
}

async function showBotStatus(reply) {
  const uptime = process.uptime();
  const uptimeMinutes = Math.floor(uptime / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  const memoryUsage = process.memoryUsage();
  const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  
  const timestamp = new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo' 
  });

  await reply(
    [
      "✅ *Status do Bot*",
      "",
      `Horário: ${timestamp}`,
      `Uptime: ${uptimeMinutes}m ${uptimeSeconds}s`,
      `Memória: ${memoryMB} MB`,
      `Versão: gabot-ofertas v0.0.1`,
      `Node.js: ${process.version}`,
      "",
      "Bot operacional 🟢",
    ].join("\n")
  );
}

async function listAllSuggestions(reply, repo, client) {
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
        `[g${s.id}] ${s.group_name || 'Sem nome'}`,
        `  Status: ${statusLabel(s.status)}`,
        `  Usuario: ${s.user_name || 'Desconhecido'}`,
        `  Link: ${s.group_link}`,
        ""
      );
    });
  }

  if (generalSuggestions.length > 0) {
    lines.push("*Sugestões Gerais:*");
    generalSuggestions.forEach((s) => {
      lines.push(
        `[s${s.id}] ${s.suggestion_text.substring(0, 60)}${s.suggestion_text.length > 60 ? '...' : ''}`,
        `  Status: ${statusLabel(s.status)}`,
        `  Usuario: ${s.user_name || 'Desconhecido'}`,
        ""
      );
    });
  }

  lines.push("Use: /adm aprovar [tipo][id] ou /adm rejeitar [tipo][id]");
  await reply(lines.join("\n"));
}

async function listGroupSuggestions(reply, repo, client) {
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
      `[g${s.id}] ${s.group_name || 'Sem nome'}`,
      `  Status: ${statusLabel(s.status)}`,
      `  Usuario: ${s.user_name || 'Desconhecido'}`,
      `  Link: ${s.group_link}`,
      `  Data: ${new Date(s.created_at).toLocaleDateString('pt-BR')}`,
      ""
    );
  });

  lines.push("Use: /adm aprovar g[id] ou /adm rejeitar g[id]");
  await reply(lines.join("\n"));
}

async function listGeneralSuggestions(reply, repo, client) {
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
      `  Usuario: ${s.user_name || 'Desconhecido'}`,
      `  Data: ${new Date(s.created_at).toLocaleDateString('pt-BR')}`,
      ""
    );
  });

  lines.push("Use: /adm aprovar s[id] ou /adm rejeitar s[id]");
  await reply(lines.join("\n"));
}

async function showReadSuggestions(reply, repo) {
  const groupSuggestions = repo.listPendingGroupSuggestions(20).filter((s) => s.status === "read");
  const generalSuggestions = repo.listPendingGeneralSuggestions(20).filter((s) => s.status === "read");

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
    lines.push(`[s${s.id}] ${s.suggestion_text.substring(0, 60)}${s.suggestion_text.length > 60 ? "..." : ""}`);
    lines.push(`  Usuario: ${s.user_name || "Desconhecido"}`);
    lines.push("  Status: lida");
    lines.push("");
  }

  await reply(lines.join("\n"));
}

async function updateSuggestionStatus(reply, repo, client, type, id, status) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    await reply("ID inválido.");
    return;
  }

  let success = false;
  let suggestion = null;
  if (type === 'g') {
    suggestion = repo.getGroupSuggestionById(numId);
    success = repo.updateGroupSuggestionStatus(numId, status);
  } else if (type === 's') {
    suggestion = repo.getGeneralSuggestionById(numId);
    success = repo.updateGeneralSuggestionStatus(numId, status);
  } else {
    await reply("Tipo inválido. Use 'g' para grupo ou 's' para sugestão.");
    return;
  }

  if (success) {
    const statusText = status === 'approved' ? 'aprovada' : 'rejeitada';
    await reply(`✅ Sugestão ${type}${id} ${statusText} com sucesso.`);

    if (suggestion) {
      await notifySuggestionStatusChange(client, type, suggestion, status);
    }
  } else {
    await reply(`❌ Não foi possível atualizar a sugestão ${type}${id}.`);
  }
}
