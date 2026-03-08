export async function handleAdminCommand({ client, repo, chatId, text }) {
  console.log(`[ADMIN CMD] Recebeu comando: "${text}"`);
  
  const reply = async (messageText) => {
    console.log(`[ADMIN CMD] Enviando resposta: ${messageText.substring(0, 100)}...`);
    await client.sendMessage(chatId, { text: messageText });
    console.log(`[ADMIN CMD] Resposta enviada com sucesso`);
  };

  const trimmed = text.trim().toLowerCase();
  console.log(`[ADMIN CMD] Comando normalizado: "${trimmed}"`);

  // Comando /adm ou /admin - mostra menu
  if (trimmed === "/adm" || trimmed === "/admin") {
    console.log(`[ADMIN CMD] Mostrando menu admin`);
    await showAdminMenu(reply);
    return;
  }

  // Comando /adm sugestoes - lista todas as sugestões pendentes
  if (trimmed === "/adm sugestoes" || trimmed === "/adm sugestões") {
    console.log(`[ADMIN CMD] Listando todas sugestões`);
    await listAllSuggestions(reply, repo);
    return;
  }

  // Comando /adm grupos - lista apenas sugestões de grupos
  if (trimmed === "/adm grupos") {
    await listGroupSuggestions(reply, repo);
    return;
  }

  // Comando /adm gerais - lista apenas sugestões gerais
  if (trimmed === "/adm gerais") {
    await listGeneralSuggestions(reply, repo);
    return;
  }

  // Comando /adm status - mostra status do bot
  if (trimmed === "/adm status" || trimmed === "/adm health") {
    console.log(`[ADMIN CMD] Mostrando status do bot`);
    await showBotStatus(reply);
    return;
  }

  // Comando /adm aprovar [id] ou /adm rejeitar [id]
  const approveMatch = trimmed.match(/^\/adm\s+aprovar\s+(\w+)(\d+)$/);
  if (approveMatch) {
    const [, type, id] = approveMatch;
    await updateSuggestionStatus(reply, repo, type, id, 'approved');
    return;
  }

  const rejectMatch = trimmed.match(/^\/adm\s+rejeitar\s+(\w+)(\d+)$/);
  if (rejectMatch) {
    const [, type, id] = rejectMatch;
    await updateSuggestionStatus(reply, repo, type, id, 'rejected');
    return;
  }
}

async function showAdminMenu(reply) {
  await reply(
    [
      "👮 *Painel de Administração*",
      "",
      "Comandos disponíveis:",
      "",
      "/adm status - verificar status do bot",
      "/adm sugestoes - listar todas sugestões",
      "/adm grupos - listar sugestões de grupos",
      "/adm gerais - listar sugestões gerais",
      "",
      "Gerenciar:",
      "/adm aprovar [tipo][id]",
      "/adm rejeitar [tipo][id]",
      "",
      "Tipos: g (grupo) ou s (sugestão)",
      "Exemplo: /adm aprovar g5",
    ].join("\n")
  );
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

async function listAllSuggestions(reply, repo) {
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
        `  Usuario: ${s.user_name || 'Desconhecido'}`,
        ""
      );
    });
  }

  lines.push("Use: /adm aprovar [tipo][id] ou /adm rejeitar [tipo][id]");
  await reply(lines.join("\n"));
}

async function listGroupSuggestions(reply, repo) {
  const suggestions = repo.listPendingGroupSuggestions(15);

  if (suggestions.length === 0) {
    await reply("Nenhuma sugestão de grupo pendente.");
    return;
  }

  const lines = ["📋 *Sugestões de Grupos Pendentes*", ""];

  suggestions.forEach((s) => {
    lines.push(
      `[g${s.id}] ${s.group_name || 'Sem nome'}`,
      `  Usuario: ${s.user_name || 'Desconhecido'}`,
      `  Link: ${s.group_link}`,
      `  Data: ${new Date(s.created_at).toLocaleDateString('pt-BR')}`,
      ""
    );
  });

  lines.push("Use: /adm aprovar g[id] ou /adm rejeitar g[id]");
  await reply(lines.join("\n"));
}

async function listGeneralSuggestions(reply, repo) {
  const suggestions = repo.listPendingGeneralSuggestions(15);

  if (suggestions.length === 0) {
    await reply("Nenhuma sugestão geral pendente.");
    return;
  }

  const lines = ["📋 *Sugestões Gerais Pendentes*", ""];

  suggestions.forEach((s) => {
    lines.push(
      `[s${s.id}] ${s.suggestion_text}`,
      `  Usuario: ${s.user_name || 'Desconhecido'}`,
      `  Data: ${new Date(s.created_at).toLocaleDateString('pt-BR')}`,
      ""
    );
  });

  lines.push("Use: /adm aprovar s[id] ou /adm rejeitar s[id]");
  await reply(lines.join("\n"));
}

async function updateSuggestionStatus(reply, repo, type, id, status) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    await reply("ID inválido.");
    return;
  }

  let success = false;
  if (type === 'g') {
    success = repo.updateGroupSuggestionStatus(numId, status);
  } else if (type === 's') {
    success = repo.updateGeneralSuggestionStatus(numId, status);
  } else {
    await reply("Tipo inválido. Use 'g' para grupo ou 's' para sugestão.");
    return;
  }

  if (success) {
    const statusText = status === 'approved' ? 'aprovada' : 'rejeitada';
    await reply(`✅ Sugestão ${type}${id} ${statusText} com sucesso.`);
  } else {
    await reply(`❌ Não foi possível atualizar a sugestão ${type}${id}.`);
  }
}
