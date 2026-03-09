/**
 * @fileoverview Processador de operações em lote do GaBot
 * Permite separação por vírgula para múltiplas operações
 * 
 * @module batchProcessor
 */

/**
 * Divide um texto por vírgulas e limpa cada item
 * Exemplo: "notebook, rtx 4060, monitor" → ["notebook", "rtx 4060", "monitor"]
 * 
 * @param {string} text - Texto com itens separados por vírgula
 * @returns {string[]} Array de itens processados
 */
export function splitByComma(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  return text
    .split(",")
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Processa um comando com suporte a lote (múltiplos itens via vírgula)
 * Útil para: + notebook, rtx, mouse
 * 
 * @param {Object} options - Configurações do processamento
 * @param {string} options.text - Texto com itens (pode ter vírgulas)
 * @param {string} options.action - Ação a executar (add, remove, etc)
 * @param {Function} options.handler - Função para processar cada item
 * @param {Object} options.context - Contexto (repo, user, etc)
 * @returns {Promise<Object>} Resultado do processamento
 */
export async function processBatch({
  text,
  action,
  handler,
  context = {},
}) {
  if (!text || !handler) {
    return {
      success: false,
      error: "Texto ou manipulador ausente",
      processed: [],
    };
  }

  const items = splitByComma(text);

  if (items.length === 0) {
    return {
      success: false,
      error: "Nenhum item válido encontrado",
      processed: [],
    };
  }

  const results = {
    success: true,
    action,
    processed: [],
    failed: [],
    totalItems: items.length,
  };

  for (const item of items) {
    try {
      const result = await handler({
        item,
        action,
        context,
      });

      results.processed.push({
        item,
        success: result.success !== false,
        message: result.message,
      });
    } catch (error) {
      results.failed.push({
        item,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Formata resultado do lote em mensagem legível
 * 
 * @param {Object} result - Resultado do processBatch
 * @param {string} resultType - Tipo de resultado (filter, suggest, etc)
 * @returns {string} Mensagem formatada
 */
export function formatBatchResult(result, resultType = "item") {
  if (!result.success && result.error) {
    return `❌ Erro: ${result.error}`;
  }

  const lines = [];

  if (result.processed && result.processed.length > 0) {
    const successes = result.processed.filter(p => p.success);
    if (successes.length > 0) {
      lines.push(`✅ Sucesso (${successes.length}):`);
      successes.forEach(p => {
        lines.push(`  • ${p.item}${p.message ? ` - ${p.message}` : ""}`);
      });
    }
  }

  if (result.failed && result.failed.length > 0) {
    lines.push(`❌ Falhas (${result.failed.length}):`);
    result.failed.forEach(f => {
      lines.push(`  • ${f.item} - ${f.error}`);
    });
  }

  return lines.join("\n") || "Nenhum resultado";
}

/**
 * Processa comando com wildcard (*) para operações em lote
 * Útil para: ok g* (aprovar todos os grupos)
 * 
 * @param {Object} options - Configurações
 * @param {string} options.pattern - Padrão com wildcard (ex: g*, s*)
 * @param {Array} options.items - Array de itens para filtrar
 * @param {Function} options.handler - Função a executar para cada match
 * @returns {Promise<Object>} Resultado do processamento
 */
export async function processWildcardBatch({
  pattern,
  items = [],
  handler,
}) {
  if (!pattern || !handler) {
    return {
      success: false,
      error: "Padrão ou manipulador ausente",
      matched: [],
    };
  }

  // Remove o * do padrão
  const prefix = pattern.replace(/\*/g, "");

  // Filtra itens que correspondem ao padrão
  const matched = items.filter(item => {
    const itemId = String(item.id || item);
    return itemId.startsWith(prefix);
  });

  if (matched.length === 0) {
    return {
      success: false,
      error: `Nenhum item corresponde ao padrão "${pattern}"`,
      matched: [],
    };
  }

  const results = {
    success: true,
    pattern,
    matched: [],
    failed: [],
    totalMatches: matched.length,
  };

  for (const item of matched) {
    try {
      const result = await handler(item);
      results.matched.push({
        item,
        success: result.success !== false,
        message: result.message,
      });
    } catch (error) {
      results.failed.push({
        item,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Valida se um texto contém múltiplos itens (separados por vírgula)
 * 
 * @param {string} text - Texto a validar
 * @returns {boolean} True se houver múltiplos itens
 */
export function hasMultipleItems(text) {
  if (!text || typeof text !== "string") {
    return false;
  }

  return text.includes(",");
}

/**
 * Valida se um padrão contém wildcard
 * 
 * @param {string} pattern - Padrão a validar
 * @returns {boolean} True se contiver *
 */
export function hasWildcard(pattern) {
  return typeof pattern === "string" && pattern.includes("*");
}

/**
 * Limita a quantidade de itens em um lote para evitar abuso
 * 
 * @param {string} text - Texto com itens
 * @param {number} maxItems - Quantidade máxima permitida (default: 10)
 * @returns {Object} {valid: boolean, itemCount: number, error?: string}
 */
export function validateBatchSize(text, maxItems = 10) {
  if (!text || typeof text !== "string") {
    return { valid: false, itemCount: 0, error: "Texto vazio" };
  }

  const items = splitByComma(text);
  const itemCount = items.length;

  if (itemCount > maxItems) {
    return {
      valid: false,
      itemCount,
      error: `Máximo de ${maxItems} itens permitidos, você enviou ${itemCount}`,
    };
  }

  return { valid: true, itemCount };
}
