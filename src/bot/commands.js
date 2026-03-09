/**
 * @fileoverview Manipulador de comandos privados do GaBot
 * Suporta novos prefixos (+, -, ?, !, .) e compatibilidade com legacy
 */

import {
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
export function parseCommand(text) {
  return parseCommandNew(text);
}

/**
 * Extrai código de convite do link do WhatsApp
 * 
 * @param {string} link - Link do grupo
 * @returns {string|null} Código de convite ou null
 */
function extractInviteCode(link) {
  const match = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i);
  return match ? match[1] : null;
}

/**
 * Converte status de sugestão para label em português
 * 
 * @param {string} status - Status da sugestão
 * @returns {string} Label legível
 */
function suggestionStatusLabel(status) {
  const statusMap = {
    pending: "⏳ pendente",
    read: "👁️ lida",
    approved: "✅ aprovada",
    rejected: "❌ rejeitada",
  };
  return statusMap[status] || status || "desconhecido";
}

/**
 * Manipulador de comando /add com suporte a lote
 * 
 * @param {Object} options - Configurações
 */
async function handleAddCommand({ chatId, name, argsText, repo, reply }) {
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
  
  if (items.length === 1) {
    // Comando único
    const inserted = repo.addKeyword(chatId, items[0]);
    await reply(
      inserted
        ? templates.getFilterAddedMessage(items[0])
        : templates.getFilterDuplicateError(items[0])
    );
  } else {
    // Processamento em lote
    const successful = [];
    const duplicates = [];

    for (const term of items) {
      if (repo.addKeyword(chatId, term)) {
        successful.push(term);
      } else {
        duplicates.push(term);
      }
    }

    let message = "";
    if (successful.length > 0) {
      message += templates.getFilterAddedMessage(successful) + "\n";
    }
    if (duplicates.length > 0) {
      message += `⚠️ Ja existiam (${duplicates.length}): ${duplicates.join(", ")}`;
    }

    await reply(message.trim());
  }
}

/**
 * Manipulador de comando /remover com suporte a lote
 */
async function handleRemoveCommand({ chatId, argsText, repo, reply }) {
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

  if (items.length === 1) {
    const removed = repo.removeKeyword(chatId, items[0]);
    await reply(
      removed
        ? templates.getFilterRemovedMessage(items[0])
        : templates.getFilterNotFoundError(items[0])
    );
  } else {
    const successful = [];
    const notFound = [];

    for (const term of items) {
      if (repo.removeKeyword(chatId, term)) {
        successful.push(term);
      } else {
        notFound.push(term);
      }
    }

    let message = "";
    if (successful.length > 0) {
      message += templates.getFilterRemovedMessage(successful) + "\n";
    }
    if (notFound.length > 0) {
      message += `⚠️ Nao encontrados (${notFound.length}): ${notFound.join(", ")}`;
    }

    await reply(message.trim());
  }
}

/**
 * Manipulador principal de comandos privados
 * Processa novos comandos e mantém compatibilidade com legacy
 * 
 * @async
 * @param {Object} options - Configurações
 */
export async function handlePrivateCommand({
  client,
  repo,
  chatId,
  name,
  text,
  sendPrivateReply,
  resolveInviteGroupName,
  notifyAdminSuggestion,
  handleUnmappedPrivateMessage,
}) {
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

  const { command, argsText, actionPrefix } = parsed;

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
    // Delegua para o comando /cupom
    command = "/cupom";
  }

  // Comando: ! (sugerir/feedback)
  if (command === "/sugerir" && actionPrefix === "!") {
    await react(getReactionEmoji("!"));
    if (!argsText) {
      await reply(templates.getMissingArgumentError("!", "! o bot podia ter X funcionalidade"));
      return;
    }
    // Delegua para o comando /sugerir
    command = "/sugerir";
  }

  // Comando: . (chat com IA)
  if (command === "/adm ia ask" && actionPrefix === ".") {
    await react(getReactionEmoji("."));
    // Será tratado em adminCommands.js
    return;
  }

  // Comando: g (sugerir grupo)
  if (command === "/sugerirgrupo" && actionPrefix === "g") {
    await react(getReactionEmoji("g"));
    if (!argsText) {
      await reply(templates.getMissingArgumentError("g", "g chat.whatsapp.com/SEUCODIGO"));
      return;
    }
    // Delegua para o comando /sugerirgrupo
    command = "/sugerirgrupo";
  }

  // ========== COMANDOS TRADICIONAIS (LEGADO + NOVOS) ==========

  // Menu numérico
  if (command === "menu_1") {
    repo.upsertUser(chatId, name);
    await reply("✅ Cadastro ativado! Agora você pode adicionar filtros.");
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

  if (command === "/" || command === "/menu" || command === "/ajuda") {
    await showMainMenu(reply);
    return;
  }

  if (command === "/cadastro") {
    repo.upsertUser(chatId, name);
    await reply("Cadastro concluido. Agora use /add [termo] para monitorar ofertas.");
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
}

// ========== FUNÇÕES AUXILIARES DE MENU ==========

/**
 * Exibe o menu principal
 */
async function showMainMenu(reply) {
  await reply(templates.getMainMenu());
}

/**
 * Exibe o menu de filtros
 */
async function showFiltersMenu(reply) {
  await reply(templates.getFiltersMenu());
}

/**
 * Exibe o menu de cupons
 */
async function showCouponsMenu(reply) {
  await reply(templates.getCouponsMenu());
}

/**
 * Exibe menu de ajuda
 */
async function showHelpMenu(reply) {
  await reply(templates.getHelpMenu());
}
