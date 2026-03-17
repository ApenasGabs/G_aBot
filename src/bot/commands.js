/**
 * @fileoverview Manipulador de comandos privados do GaBot
 * Suporta novos prefixos (+, -, ?, !, .) e compatibilidade com legacy
 */

import {
    processBatch,
    splitByComma,
    validateBatchSize
} from "./batchProcessor.js";
import {
    getReactionEmoji,
    parseCommand as parseCommandNew
} from "./commandParser.js";
import * as templates from "./menuTemplates.js";

// Rastreia estado do usuário (menu aguardando input)
const userSessions = new Map();

/**
 * Parser de comando novo (delegado ao commandParser.js)
 * Mantém assinatura original para compatibilidade
 * 
 * @deprecated Use parseCommandNew do commandParser.js diretamente
 * @param {string} text - Texto do comando
 * @returns {Object} Objeto estruturado do comando
 */
export const parseCommand = (text)=> {
  return parseCommandNew(text);
};

/**
 * Extrai código de convite do link do WhatsApp
 * 
 * @param {string} link - Link do grupo
 * @returns {string|null} Código de convite ou null
 */
const extractInviteCode = (link) => {
  const match = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i);
  return match ? match[1] : null;
};

/**
 * Converte status de sugestão para label em português
 * 
 * @param {string} status - Status da sugestão
 * @returns {string} Label legível
 */
const suggestionStatusLabel = (status) => {
  const statusMap = {
    pending: "⏳ pendente",
    read: "👁️ lida",
    approved: "✅ aprovada",
    rejected: "❌ rejeitada",
  };
  return statusMap[status] || status || "desconhecido";
};

/**
 * Manipulador de comando /add com suporte a lote
 * 
 * @param {Object} options - Configurações
 */
const handleAddCommand = async ({ chatId, name, argsText, repo, reply }) => {
  if (!argsText) {
    await reply("❌ Contexto incompleto. Uso: `+ termo1, termo2`");
    return;
  }

  repo.upsertUser(chatId, name);

  // Valida tamanho do lote
  const validation = validateBatchSize(argsText, 20);
  if (!validation.valid) {
    await reply(`❌ ${validation.error}`);
    return;
  }

  const items = splitByComma(argsText);
  const result = await processBatch({
    text: argsText,
    action: "add",
    handler: async ({ item }) => ({
      success: repo.addKeyword(chatId, item),
    }),
  });

  if (!result.success) {
    await reply(`❌ ${result.error}`);
    return;
  }

  if (items.length === 1) {
    const [single] = result.processed;
    await reply(
      single?.success
        ? templates.getFilterAddedMessage(items[0])
        : templates.getFilterDuplicateError(items[0])
    );
    return;
  }

  const successful = result.processed.filter((entry) => entry.success).map((entry) => entry.item);
  const duplicates = result.processed.filter((entry) => !entry.success).map((entry) => entry.item);

  let message = "";
  if (successful.length > 0) {
    message += templates.getFilterAddedMessage(successful) + "\n";
  }
  if (duplicates.length > 0) {
    message += `⚠️ Ja existiam (${duplicates.length}): ${duplicates.join(", ")}`;
  }

  await reply(message.trim());
};

/**
 * Manipulador de comando /remover com suporte a lote
 */
const handleRemoveCommand = async ({ chatId, argsText, repo, reply }) => {
  if (!argsText) {
    await reply("❌ Contexto incompleto. Uso: `- termo1, termo2`");
    return;
  }

  const validation = validateBatchSize(argsText, 20);
  if (!validation.valid) {
    await reply(`❌ ${validation.error}`);
    return;
  }

  const items = splitByComma(argsText);

  const result = await processBatch({
    text: argsText,
    action: "remove",
    handler: async ({ item }) => ({
      success: repo.removeKeyword(chatId, item),
    }),
  });

  if (!result.success) {
    await reply(`❌ ${result.error}`);
    return;
  }

  if (items.length === 1) {
    const [single] = result.processed;
    await reply(
      single?.success
        ? templates.getFilterRemovedMessage(items[0])
        : templates.getFilterNotFoundError(items[0])
    );
    return;
  }

  const successful = result.processed.filter((entry) => entry.success).map((entry) => entry.item);
  const notFound = result.processed.filter((entry) => !entry.success).map((entry) => entry.item);

  let message = "";
  if (successful.length > 0) {
    message += templates.getFilterRemovedMessage(successful) + "\n";
  }
  if (notFound.length > 0) {
    message += `⚠️ Nao encontrados (${notFound.length}): ${notFound.join(", ")}`;
  }

  await reply(message.trim());
};

/**
 * Manipulador principal de comandos privados
 * Processa novos comandos e mantém compatibilidade com legacy
 * 
 * @async
 * @param {Object} options - Configurações
 */
export const handlePrivateCommand = async ({
  client,
  repo,
  chatId,
  name,
  text,
  sendPrivateReply,
  resolveInviteGroupName,
  notifyAdminSuggestion,
  handleUnmappedPrivateMessage,
  handleAdminCommand,
})=> {
  const reply = async (messageText) => {
    if (sendPrivateReply) {
      await sendPrivateReply(chatId, messageText);
      return;
    }
    await client.sendMessage(chatId, { text: messageText });
  };

  // Função auxiliar para aplicar reação (feedback imediato)
  const react = async (emoji) => {
    try {
      if (client?.sendMessage) {
        // Reação via Baileys quando disponível
        // await client.sendReaction(chatId, emoji);
      }
    } catch (e) {
      // Silenciosamente ignora erros de reação
    }
  };

  // Verifica se usuário está em uma sessão aguardando input
  const session = userSessions.get(chatId);
  
  // Se está aguardando link de grupo e a mensagem contém link
  if (session?.context === "suggest_group" && text.includes("chat.whatsapp.com")) {
    const inviteCode = extractInviteCode(text);
    if (inviteCode) {
      const duplicate = repo.findGroupSuggestionByInviteCode(inviteCode);
      if (duplicate) {
        const statusText = suggestionStatusLabel(duplicate.status);
        await reply(
          [
            "⚠️ Esse grupo ja foi sugerido antes.",
            `Status atual: ${statusText}`,
            `ID: g${duplicate.id}`,
          ].join("\n")
        );
        userSessions.delete(chatId);
        return;
      }

      let groupName = null;
      if (resolveInviteGroupName) {
        groupName = await resolveInviteGroupName(inviteCode);
      }

      const suggestionId = repo.addGroupSuggestion({
        userId: chatId,
        userName: name,
        groupLink: text,
        inviteCode,
        groupName,
      });

      if (notifyAdminSuggestion) {
        await notifyAdminSuggestion({
          suggestionId,
          userId: chatId,
          userName: name,
          groupLink: text,
          groupName,
        });
      }

      await reply("✅ Sugestão recebida! Vou encaminhar para o admin.");
      userSessions.delete(chatId);
      return;
    }
  }

  // Se está aguardando sugestão geral
  if (session?.context === "suggest_general" && text.length > 5) {
    const suggestionId = repo.addGeneralSuggestion({
      userId: chatId,
      userName: name,
      suggestionText: text,
      suggestionType: 'general',
    });

    if (notifyAdminSuggestion) {
      await notifyAdminSuggestion({
        suggestionId,
        userId: chatId,
        userName: name,
        suggestionText: text,
        suggestionType: 'general',
      });
    }

    await reply("✅ Sugestão recebida! Obrigado pelo feedback.");
    userSessions.delete(chatId);
    return;
  }

  const parsed = parseCommand(text);
  
  // Se não for comando reconhecido, ignora
  if (!parsed) {
    if (handleUnmappedPrivateMessage) {
      await handleUnmappedPrivateMessage({ chatId, name, text, reply });
    }
    return;
  }

  let { command, argsText, actionPrefix } = parsed;

  // ========== NOVOS COMANDOS COM PREFIXOS (+ - ? ! . g) ==========
  
  // Comando: + (adicionar filtro com suporte a lote)
  if (command === "/add" && actionPrefix === "+") {
    await react(getReactionEmoji("+"));
    await handleAddCommand({ chatId, name, argsText, repo, reply });
    return;
  }

  // Comando: - (remover filtro com suporte a lote)
  if (command === "/remover" && actionPrefix === "-") {
    await react(getReactionEmoji("-"));
    await handleRemoveCommand({ chatId, argsText, repo, reply });
    return;
  }

  // Comando: ? (buscar cupom por loja)
  if (command === "/cupom" && actionPrefix === "?") {
    await react(getReactionEmoji("?"));
    if (!argsText) {
      await reply(templates.getMissingArgumentError("?", "? amazon"));
      return;
    }
    // Mantém fluxo no handler padrão /cupom abaixo
  }

  // Comando: ! (sugerir/feedback)
  if (command === "/sugerir" && actionPrefix === "!") {
    await react(getReactionEmoji("!"));
    if (!argsText) {
      await reply(templates.getMissingArgumentError("!", "! o bot podia ter X funcionalidade"));
      return;
    }
    // Mantém fluxo no handler padrão /sugerir abaixo
  }

  // Comando: . (chat com IA)
  if (command === "/adm ia ask" && actionPrefix === ".") {
    await react(getReactionEmoji("."));
    if (!argsText) {
      await reply(templates.getMissingArgumentError(".", ". analise esta promocao"));
      return;
    }

    if (handleAdminCommand) {
      await handleAdminCommand({
        client,
        repo,
        chatId,
        text: `ia ask ${argsText}`,
      });
      return;
    }

    await reply("❌ Comando de IA indisponivel no momento.");
    return;
  }

  // Comando: g (sugerir grupo)
  if (command === "/sugerirgrupo" && actionPrefix === "g") {
    await react(getReactionEmoji("g"));
    if (!argsText) {
      await reply(templates.getMissingArgumentError("g", "g chat.whatsapp.com/SEUCODIGO"));
      return;
    }
    // Mantém fluxo no handler padrão /sugerirgrupo abaixo
  }

  // ========== COMANDOS TRADICIONAIS (LEGADO + NOVOS) ==========

  // Menu numérico
  if (command === "menu_1") {
    const { isNew } = repo.upsertUser(chatId, name);
    await reply(
      isNew
        ? [
            "✅ Cadastro concluido!",
            "",
            "Adicione filtros para receber alertas:",
            "+ notebook, ssd, rtx 4060",
            "",
            "Para cupons automaticos por loja:",
            "seguir amazon",
          ].join("\n")
        : "✅ Voce ja estava cadastrado. Use + termo para adicionar filtros."
    );
    await showFiltersMenu(reply);
    userSessions.set(chatId, { context: "filters" });
    return;
  }

  if (command === "menu_2") {
    await showFiltersMenu(reply);
    userSessions.set(chatId, { context: "filters" });
    return;
  }

  if (command === "menu_3") {
    await showCouponsMenu(reply);
    userSessions.set(chatId, { context: "coupons" });
    return;
  }

  if (command === "menu_4") {
    await reply("Envie o link do grupo no formato:\nhttps://chat.whatsapp.com/CODIGO");
    userSessions.set(chatId, { context: "suggest_group" });
    return;
  }

  if (command === "menu_5") {
    await reply("Digite sua sugestão:\n(Pode ser sobre funcionalidades, melhorias, etc)");
    userSessions.set(chatId, { context: "suggest_general" });
    return;
  }

  if (command === "/help") {
    await showHelpMenu(reply);
    return;
  }

  if (command === "/" || command === "/menu" || command === "/ajuda") {
    await showMainMenu(reply);
    return;
  }

  if (command === "/cadastro") {
    const { isNew } = repo.upsertUser(chatId, name);
    await reply(
      isNew
        ? [
            "✅ Cadastro concluido!",
            "",
            "Adicione filtros para receber alertas:",
            "+ notebook, ssd, rtx 4060",
            "",
            "Para cupons automaticos por loja:",
            "seguir amazon",
          ].join("\n")
        : "✅ Voce ja esta cadastrado! Use + termo para monitorar ofertas e seguir loja para cupons."
    );
    return;
  }

  if (command === "/alerta") {
    const normalizedArg = String(argsText || "").trim().toLowerCase();

    if (!normalizedArg) {
      const currentMode = repo.getUserAlertMode(chatId);
      const currentLabel = currentMode === "compact" ? "compacto" : "detalhado";
      await reply(
        [
          `Seu modo atual de alerta de cupom: ${currentLabel}.`,
          "Use: alerta compacto  ou  alerta detalhado",
        ].join("\n")
      );
      return;
    }

    const compactAliases = ["compact", "compacto", "resumido", "on", "ligar"];
    const fullAliases = ["full", "detalhado", "normal", "off", "desligar"];

    let targetMode = null;
    if (compactAliases.includes(normalizedArg)) {
      targetMode = "compact";
    } else if (fullAliases.includes(normalizedArg)) {
      targetMode = "full";
    }

    if (!targetMode) {
      await reply("Uso correto: alerta compacto  |  alerta detalhado");
      return;
    }

    repo.upsertUser(chatId, name);
    const result = repo.setUserAlertMode(chatId, targetMode);
    if (!result.updated) {
      await reply("Nao consegui atualizar seu modo de alerta agora. Tente novamente.");
      return;
    }

    const modeLabel = result.mode === "compact" ? "compacto" : "detalhado";
    await reply(`✅ Modo de alerta atualizado para: ${modeLabel}.`);
    return;
  }

  if (command === "/add") {
    if (!argsText) {
      await reply("Uso correto: /add [termo]");
      return;
    }

    repo.upsertUser(chatId, name);
    const inserted = repo.addKeyword(chatId, argsText);
    await reply(
      inserted
        ? `Filtro adicionado: ${argsText}`
        : `Esse filtro ja existe: ${argsText}`
    );
    return;
  }

  if (command === "/remover") {
    if (!argsText) {
      await reply("Uso correto: /remover [termo]");
      return;
    }

    const removed = repo.removeKeyword(chatId, argsText);
    await reply(
      removed
        ? `Filtro removido: ${argsText}`
        : `Nao encontrei esse filtro: ${argsText}`
    );
    return;
  }

  if (
    command === "/meusfiltros" ||
    command === "/filtros" ||
    command === "/meuscadastros"
  ) {
    const keywords = repo.listKeywords(chatId);
    if (keywords.length === 0) {
      await reply("Voce ainda nao tem filtros cadastrados. Use /add [termo].");
      return;
    }

    const lines = keywords.map(({ term }) => `- ${term}`);
    await reply(`Seus filtros:\n${lines.join("\n")}`);
    return;
  }

  if (command === "/sugerirgrupo") {
    if (!argsText) {
      await reply("Uso correto: /sugerirgrupo [link-do-grupo]");
      return;
    }

    const inviteCode = extractInviteCode(argsText);
    if (!inviteCode) {
      await reply("Nao consegui identificar um link valido do WhatsApp. Exemplo: https://chat.whatsapp.com/SEUCODIGO");
      return;
    }

    const duplicate = repo.findGroupSuggestionByInviteCode(inviteCode);
    if (duplicate) {
      const statusText = suggestionStatusLabel(duplicate.status);
      await reply(
        [
          "⚠️ Esse grupo ja foi sugerido antes.",
          `Status atual: ${statusText}`,
          `ID: g${duplicate.id}`,
        ].join("\n")
      );
      return;
    }

    let groupName = null;
    if (resolveInviteGroupName) {
      groupName = await resolveInviteGroupName(inviteCode);
    }

    const suggestionId = repo.addGroupSuggestion({
      userId: chatId,
      userName: name,
      groupLink: argsText,
      inviteCode,
      groupName,
    });

    if (notifyAdminSuggestion) {
      await notifyAdminSuggestion({
        suggestionId,
        userId: chatId,
        userName: name,
        groupLink: argsText,
        groupName,
      });
    }

    await reply("Sugestao recebida com sucesso. Vou encaminhar para avaliacao do admin.");
    return;
  }

  if (command === "/sugerir") {
    if (!argsText) {
      await reply("Uso correto: /sugerir [sua sugestão]\n\nExemplo: /sugerir Adicionar filtro por preço");
      return;
    }

    const suggestionId = repo.addGeneralSuggestion({
      userId: chatId,
      userName: name,
      suggestionText: argsText,
      suggestionType: 'general',
    });

    if (notifyAdminSuggestion) {
      await notifyAdminSuggestion({
        suggestionId,
        userId: chatId,
        userName: name,
        suggestionText: argsText,
        suggestionType: 'general',
      });
    }

    await reply("Sugestao recebida! Obrigado pelo feedback.");
    return;
  }

  // Comandos de cupom
  if (command === "/cupons") {
    const recentCoupons = repo.listRecentCoupons(15);
    if (recentCoupons.length === 0) {
      await reply("Nenhum cupom recente disponivel no momento.");
      return;
    }

    const {
      calculateRecencyEmoji,
      detectStoreFromText,
    } = await import("../services/couponExtractor.js");
    const lines = recentCoupons
      .map((c) => {
      const emoji = calculateRecencyEmoji(Number(c.last_seen_timestamp));
      const store = detectStoreFromText(c.message_text || "", c.group_name || "");
      if (store === "Loja nao identificada") {
        return null;
      }
      return `${emoji} ${c.code} | ${store}`;
      })
      .filter(Boolean);

    if (lines.length === 0) {
      await reply("Nenhum cupom com loja identificada no momento.");
      return;
    }

    await reply(`Cupons recentes:\n\n${lines.join("\n")}`);
    return;
  }

  if (command === "/cupom") {
    if (!argsText) {
      await reply("Uso correto: /cupom [nome-da-loja]");
      return;
    }

    const results = repo.searchCouponsByStore(argsText);
    if (results.length === 0) {
      await reply(`Nenhum cupom encontrado para "${argsText}".`);
      return;
    }

    const {
      calculateRecencyEmoji,
      detectStoreFromText,
    } = await import("../services/couponExtractor.js");
    const lines = results
      .map((c) => {
      const emoji = calculateRecencyEmoji(Number(c.last_seen_timestamp));
      const store = detectStoreFromText(c.message_text || "", c.group_name || "");
      if (store === "Loja nao identificada") {
        return null;
      }
      return `${emoji} ${c.code} | ${store}`;
      })
      .filter(Boolean);

    if (lines.length === 0) {
      await reply(`Nao encontrei cupons com loja identificada para "${argsText}".`);
      return;
    }

    await reply(`Cupons para "${argsText}":\n\n${lines.join("\n")}`);
    return;
  }

  if (command === "/seguircupom") {
    if (!argsText) {
      await reply("Uso correto: /seguircupom [nome-da-loja]");
      return;
    }

    repo.upsertUser(chatId, name);
    const inserted = repo.addCouponInterest(chatId, argsText);
    await reply(
      inserted
        ? `Agora voce segue cupons de: ${argsText}`
        : `Voce ja segue cupons de: ${argsText}`
    );
    return;
  }

  if (command === "/pararcupom") {
    if (!argsText) {
      await reply("Uso correto: /pararcupom [nome-da-loja]");
      return;
    }

    const removed = repo.removeCouponInterest(chatId, argsText);
    await reply(
      removed
        ? `Voce parou de seguir cupons de: ${argsText}`
        : `Voce nao estava seguindo cupons de: ${argsText}`
    );
    return;
  }

  if (command === "/meuscupons") {
    const interests = repo.listCouponInterests(chatId);
    if (interests.length === 0) {
      await reply("Voce nao esta seguindo cupons de nenhuma loja. Use /seguircupom [loja].");
      return;
    }

    const lines = interests.map(({ store_name }) => `- ${store_name}`);
    await reply(`Voce segue cupons de:\n${lines.join("\n")}`);
    return;
  }

  await showMainMenu(reply);
};

// ========== FUNÇÕES AUXILIARES DE MENU ==========

/**
 * Exibe o menu principal
 */
const showMainMenu = async (reply) => {
  await reply(templates.getMainMenu());
};

/**
 * Exibe o menu de filtros
 */
const showFiltersMenu = async (reply) => {
  await reply(templates.getFiltersMenu());
};

/**
 * Exibe o menu de cupons
 */
const showCouponsMenu = async (reply) => {
  await reply(templates.getCouponsMenu());
};

/**
 * Exibe menu de ajuda
 */
const showHelpMenu = async (reply) => {
  await reply(templates.getHelpMenu());
};
