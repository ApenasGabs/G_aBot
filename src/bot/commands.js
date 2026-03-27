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

const formatCurrencyBRL = (cents) => {
  if (!Number.isFinite(cents) || cents <= 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
};

const parsePriceToCents = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const normalized = value
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const parseFilterInput = (rawItem) => {
  const item = String(rawItem || "").trim();
  if (!item) {
    return { ok: false, error: "Item vazio" };
  }

  const withLimit = item.match(/^(.*?)(?:\s*(?:<=|ate|até|max|no maximo)\s*)r?\$?\s*([0-9][0-9.,]*)\s*$/i);
  if (!withLimit) {
    return { ok: true, term: item, maxPriceCents: null };
  }

  const term = String(withLimit[1] || "").trim();
  const maxPriceCents = parsePriceToCents(withLimit[2]);

  if (!term) {
    return { ok: false, error: "Termo do filtro ausente" };
  }

  if (!maxPriceCents) {
    return { ok: false, error: "Valor maximo invalido" };
  }

  return { ok: true, term, maxPriceCents };
};

const formatFilterLabel = (term, maxPriceCents) => {
  if (!Number.isFinite(maxPriceCents) || maxPriceCents <= 0) {
    return term;
  }
  return `${term} (ate ${formatCurrencyBRL(maxPriceCents)})`;
};

const RECENCY_LEGEND_LINES = [
  "",
  "Legenda de recencia:",
  "🔥🔥🔥 < 5min | 🔥🔥 < 15min | 🔥 < 30min",
  "⏰ < 2h | 🕐 < 6h | 📅 < 24h | 🧊 >= 24h",
];

const buildUniqueCouponLines = (coupons, calculateRecencyEmoji, detectStoreFromText) => {
  const seenCodes = new Set();
  const lines = [];

  for (const coupon of coupons) {
    const rawCode = String(coupon.code || "").trim();
    if (!rawCode) continue;

    const normalizedCode = rawCode.toUpperCase();
    if (seenCodes.has(normalizedCode)) continue;

    const store = detectStoreFromText(coupon.message_text || "", coupon.group_name || "");
    if (store === "Loja nao identificada") continue;

    const emoji = calculateRecencyEmoji(Number(coupon.last_seen_timestamp));
    lines.push(`${emoji} ${normalizedCode} | ${store}`);
    seenCodes.add(normalizedCode);
  }

  return lines;
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
  const processed = [];
  const invalid = [];

  for (const item of items) {
    const parsed = parseFilterInput(item);
    if (!parsed.ok) {
      invalid.push({ item, error: parsed.error });
      continue;
    }

    const saveResult = repo.addKeyword(chatId, parsed.term, parsed.maxPriceCents);
    const label = formatFilterLabel(parsed.term, parsed.maxPriceCents);
    processed.push({
      item,
      label,
      status: saveResult.status,
    });
  }

  if (items.length === 1) {
    if (invalid.length > 0) {
      await reply("❌ Formato inválido. Use: + notebook ate 3500  ou  + notebook <= 3500");
      return;
    }

    const single = processed[0];
    if (single.status === "added") {
      await reply(`✅ Filtro adicionado: ${single.label}`);
      return;
    }
    if (single.status === "updated") {
      await reply(`✅ Filtro atualizado: ${single.label}`);
      return;
    }

    await reply(`⚠️ Esse filtro ja existe: ${single.label}`);
    return;
  }

  const added = processed.filter((entry) => entry.status === "added").map((entry) => entry.label);
  const updated = processed.filter((entry) => entry.status === "updated").map((entry) => entry.label);
  const duplicates = processed.filter((entry) => entry.status === "duplicate").map((entry) => entry.label);

  const lines = [];
  if (added.length > 0) lines.push(`✅ Adicionados (${added.length}): ${added.join(", ")}`);
  if (updated.length > 0) lines.push(`🔁 Atualizados (${updated.length}): ${updated.join(", ")}`);
  if (duplicates.length > 0) lines.push(`⚠️ Sem alteração (${duplicates.length}): ${duplicates.join(", ")}`);
  if (invalid.length > 0) {
    lines.push(
      `❌ Invalidos (${invalid.length}): ${invalid.map((entry) => entry.item).join(", ")}`
    );
    lines.push("Formato de preço: termo ate 3500  ou  termo <= 3500");
  }

  await reply(lines.join("\n"));
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

    const parsed = parseFilterInput(argsText);
    if (!parsed.ok) {
      await reply("Formato inválido. Use: /add notebook ate 3500  ou  /add notebook <= 3500");
      return;
    }

    repo.upsertUser(chatId, name);
    const result = repo.addKeyword(chatId, parsed.term, parsed.maxPriceCents);
    const label = formatFilterLabel(parsed.term, parsed.maxPriceCents);
    if (result.status === "added") {
      await reply(`Filtro adicionado: ${label}`);
      return;
    }
    if (result.status === "updated") {
      await reply(`Filtro atualizado: ${label}`);
      return;
    }

    await reply(`Esse filtro ja existe: ${label}`);
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

    const lines = keywords.map(({ term, max_price_cents }) => `- ${formatFilterLabel(term, max_price_cents)}`);
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
    const lines = buildUniqueCouponLines(
      recentCoupons,
      calculateRecencyEmoji,
      detectStoreFromText
    );

    if (lines.length === 0) {
      await reply("Nenhum cupom com loja identificada no momento.");
      return;
    }

    await reply(`Cupons recentes:\n\n${lines.join("\n")}${RECENCY_LEGEND_LINES.join("\n")}`);
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
    const lines = buildUniqueCouponLines(
      results,
      calculateRecencyEmoji,
      detectStoreFromText
    );

    if (lines.length === 0) {
      await reply(`Nao encontrei cupons com loja identificada para "${argsText}".`);
      return;
    }

    await reply(`Cupons para "${argsText}":\n\n${lines.join("\n")}${RECENCY_LEGEND_LINES.join("\n")}`);
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
