/**
 * @fileoverview Parser moderno de comandos do GaBot
 * Suporta novos prefixos (+, -, ?, !, .) e mantém compatibilidade com comandos legados
 * 
 * @module commandParser
 */

/**
 * Mapeamento de aliases legacy para novos comandos
 * Mantém compatibilidade com sistema anterior
 */
const LEGACY_ALIASES = {
  // Sequencial global
  c1: "/menu",
  c2: "/cadastro",
  c3: "/add",
  c4: "/remover",
  c5: "/meusfiltros",
  c6: "/cupons",
  c7: "/cupom",
  c8: "/seguircupom",
  c9: "/pararcupom",
  c10: "/meuscupons",
  c11: "/sugerirgrupo",
  c12: "/sugerir",

  // Categoria filtros
  cf1: "/add",
  cf2: "/remover",
  cf3: "/meusfiltros",

  // Categoria cupons
  cc1: "/cupons",
  cc2: "/cupom",
  cc3: "/seguircupom",
  cc4: "/pararcupom",
  cc5: "/meuscupons",

  // Categoria sugestoes
  cs1: "/sugerirgrupo",
  cs2: "/sugerir",
};

/**
 * Mapeamento de atalhos para comandos
 */
const SHORTCUTS = {
  menu: "/menu",
  ajuda: "/help",
  help: "/help",
  cadastro: "/cadastro",
  alerta: "/alerta",
  compacto: "/alerta",
  detalhado: "/alerta",
  filtros: "/meusfiltros",
  cupons: "/cupons",
  lojas: "/meuscupons",
  now: "/cupons",
  stats: "/adm stats",
  ia: "/adm ia",
};

/**
 * Prefixos de ação rápida (single-char)
 * Esses comandos suportam processamento em lote via vírgula
 */
const ACTION_PREFIXES = {
  "+": "/add",
  "-": "/remover",
  "?": "/cupom",
  "!": "/sugerir",
  ".": "/adm ia ask",
  g: "/sugerirgrupo",
  seguir: "/seguircupom",
  parar: "/pararcupom",
};

/**
 * Normaliza um texto removendo espaços extras e convertendo para lowercase
 * 
 * @param {string} text - Texto a normalizar
 * @returns {string} Texto normalizado
 */
export const normalizeText = (text) => {
  return text.trim().toLowerCase();
};

/**
 * Extrai o primeiro token de um texto
 * 
 * @param {string} text - Texto a processar
 * @returns {string} Primeiro token
 */
export const getFirstToken = (text) => {
  const trimmed = String(text || "").trim();
  const tokens = trimmed.split(/\s+/);
  return tokens[0] || "";
};

/**
 * Extrai argumentos após o primeiro token
 * 
 * @param {string} text - Texto a processar
 * @returns {string} Argumentos restantes
 */
export const getArguments = (text) => {
  const trimmed = String(text || "").trim();
  const tokens = trimmed.split(/\s+/);
  return tokens.slice(1).join(" ");
};

/**
 * Verifica se o texto começa com um prefixo de ação
 * 
 * @param {string} text - Texto a verificar
 * @returns {string|null} Prefixo encontrado ou null
 */
export const getActionPrefix = (text) => {
  const trimmed = normalizeText(text);
  if (!trimmed) return null;

  if (trimmed.startsWith("g ")) {
    return "g";
  }

  const firstChar = trimmed[0];

  if (["+", "-", "?", "!", "."].includes(firstChar)) {
    return firstChar;
  }

  // Verifica para "seguir" e "parar" que começam com letra
  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord === "seguir" || firstWord === "parar") {
    return firstWord;
  }

  return null;
};

/**
 * Parse principal - converte qualquer mensagem em comando estruturado
 * Suporta:
 * - Prefixos legacy (c1-12, cf*, cc*, cs*)
 * - Comandos com / (legado)
 * - Atalhos diretos (menu, help, cupons, etc)
 * - Prefixos de ação (+, -, ?, !, ., g)
 * - Números 1-9 para menus
 * 
 * @param {string} text - Texto da mensagem
 * @returns {Object} Objeto estruturado com {command, argsText, type, actionPrefix}
 * @returns {null} Se a mensagem não for um comando válido
 */
export const parseCommand = (text) => {
  if (!text || typeof text !== "string") {
    return null;
  }

  const rawTrimmed = text.trim();
  const normalizedTrimmed = normalizeText(text);
  const firstToken = getFirstToken(normalizedTrimmed);
  const argsText = getArguments(rawTrimmed);

  // Verifica prefixos de ação (+, -, ?, !, ., g, seguir, parar)
  const actionPrefix = getActionPrefix(normalizedTrimmed);
  if (actionPrefix) {
    let actionArgs = argsText;
    if (["+", "-", "?", "!", "."].includes(actionPrefix)) {
      actionArgs = rawTrimmed.substring(1).trim();
    } else if (actionPrefix === "g") {
      actionArgs = rawTrimmed.substring(1).trim();
    } else if (actionPrefix === "seguir" || actionPrefix === "parar") {
      actionArgs = getArguments(rawTrimmed);
    }

    return {
      command: ACTION_PREFIXES[actionPrefix] || `/${actionPrefix}`,
      argsText: actionArgs,
      type: "action",
      actionPrefix,
      isBatchSupported: ["+", "-", "?", "!", "ok", "no"].includes(actionPrefix),
    };
  }

  // Verifica alias legacy
  const tokenNoSlash = firstToken.replace(/^\//, "");
  if (LEGACY_ALIASES[tokenNoSlash]) {
    return {
      command: LEGACY_ALIASES[tokenNoSlash],
      argsText,
      type: "legacy",
      aliasUsed: tokenNoSlash,
    };
  }

  // Verifica números 1-9
  if (/^[1-9]$/.test(normalizedTrimmed)) {
    return {
      command: `menu_${normalizedTrimmed}`,
      argsText: "",
      type: "numeric",
    };
  }

  // Verifica atalhos
  if (SHORTCUTS[firstToken]) {
    let shortcutArgs = argsText;
    if (firstToken === "compacto" && !shortcutArgs) {
      shortcutArgs = "compact";
    }
    if (firstToken === "detalhado" && !shortcutArgs) {
      shortcutArgs = "full";
    }

    return {
      command: SHORTCUTS[firstToken],
      argsText: shortcutArgs,
      type: "shortcut",
    };
  }

  // Verifica comandos com /
  if (rawTrimmed.startsWith("/")) {
    const [rawCommand, ...rest] = rawTrimmed.split(/\s+/);
    return {
      command: rawCommand.toLowerCase(),
      argsText: rest.join(" "),
      type: "slash",
    };
  }

  // Se nada corresponder, retorna null
  return null;
};

/**
 * Extrai emojis de reação baseado no tipo de comando
 * Usado para feedback imediato ao usuário
 * 
 * @param {string} actionPrefix - Prefixo da ação (+, -, ?, !, .)
 * @returns {string} Emoji apropriado
 */
export const getReactionEmoji = (actionPrefix) => {
  const reactions = {
    "+": "✅",
    "-": "✅",
    "?": "🔍",
    "!": "💭",
    ".": "🤖",
    g: "👥",
    ok: "✅",
    no: "❌",
  };

  return reactions[actionPrefix] || "⏳";
};
