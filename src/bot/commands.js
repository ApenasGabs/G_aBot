// Rastreia estado do usuário (menu aguardando input)
const userSessions = new Map();

export function parseCommand(text) {
  const trimmed = text.trim();
  
  // Aceita números simples (1-9)
  if (/^[1-9]$/.test(trimmed)) {
    return {
      command: `menu_${trimmed}`,
      argsText: "",
      isNumeric: true,
    };
  }

  // Aceita comandos sem / (menu, ajuda, cadastro, etc)
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  const shortcuts = {
    'menu': '/menu',
    'ajuda': '/ajuda',
    'cadastro': '/cadastro',
    'filtros': '/meusfiltros',
    'cupons': '/cupons',
  };

  if (shortcuts[firstWord]) {
    const [, ...rest] = trimmed.split(/\s+/);
    return {
      command: shortcuts[firstWord],
      argsText: rest.join(" ").trim(),
      isShortcut: true,
    };
  }

  // Comandos com /
  if (trimmed.startsWith("/")) {
    const [rawCommand, ...rest] = trimmed.split(/\s+/);
    return {
      command: rawCommand.toLowerCase(),
      argsText: rest.join(" ").trim(),
    };
  }

  return null;
}

function extractInviteCode(link) {
  const match = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i);
  return match ? match[1] : null;
}

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

  // Verifica se usuário está em uma sessão aguardando input
  const session = userSessions.get(chatId);
  
  // Se está aguardando link de grupo e a mensagem contém link
  if (session?.context === "suggest_group" && text.includes("chat.whatsapp.com")) {
    const inviteCode = extractInviteCode(text);
    if (inviteCode) {
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

  const { command, argsText } = parsed;

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
    const lines = recentCoupons.map((c) => {
      const emoji = calculateRecencyEmoji(Number(c.last_seen_timestamp));
      const store = detectStoreFromText(c.message_text || "", c.group_name || "");
      return `${emoji} ${c.code} | ${store}`;
    });

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
    const lines = results.map((c) => {
      const emoji = calculateRecencyEmoji(Number(c.last_seen_timestamp));
      const store = detectStoreFromText(c.message_text || "", c.group_name || "");
      return `${emoji} ${c.code} | ${store}`;
    });

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

// Funções auxiliares de menu
async function showMainMenu(reply) {
  await reply(
    [
      "🤖 *Menu Principal*",
      "",
      "Envie apenas o número da opção:",
      "",
      "1 - Ativar cadastro",
      "2 - Gerenciar filtros",
      "3 - Buscar cupons",
      "4 - Sugerir grupo",
      "5 - Enviar sugestão",
      "",
      "Ou use comandos:",
      "/add [termo] - adicionar filtro",
      "/remover [termo] - remover filtro",
      "/meusfiltros - ver seus filtros",
      "/cupons - ver cupons recentes",
      "/sugerir [texto] - enviar sugestão",
    ].join("\n")
  );
}

async function showFiltersMenu(reply) {
  await reply(
    [
      "📋 *Menu de Filtros*",
      "",
      "Use os comandos:",
      "/add [termo] - adicionar filtro",
      "/remover [termo] - remover filtro",
      "/meusfiltros - ver seus filtros",
      "",
      "Digite 'menu' para voltar",
    ].join("\n")
  );
}

async function showCouponsMenu(reply) {
  await reply(
    [
      "🎫 *Menu de Cupons*",
      "",
      "Use os comandos:",
      "/cupons - cupons recentes",
      "/cupom [loja] - buscar por loja",
      "/seguircupom [loja] - seguir loja",
      "/pararcupom [loja] - parar de seguir",
      "/meuscupons - lojas que você segue",
      "",
      "Digite 'menu' para voltar",
    ].join("\n")
  );
}
