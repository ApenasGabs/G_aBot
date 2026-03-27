/**
 * @fileoverview Templates dos menus do GaBot
 * Centraliza todos os textos dos menus para fácil manutenção
 * 
 * @module menuTemplates
 */

/**
 * Template do menu principal
 * Mostra ao usuário os comandos rápidos disponíveis
 * 
 * @returns {string} Texto formatado do menu principal
 */
export function getMainMenu() {
  return `🤖 *GaBot Ofertas*
━━━━━━━━━━━━━━━
Olá! Use os atalhos rápidos:

🔍 *FILTROS*
↳ \`+ termo\` : Adicionar (ex: + tv, pc)
↳ \`+ termo ate 3500\` : Alertar ate valor maximo
↳ \`- termo\` : Remover filtro
↳ \`filtros\` : Meus filtros ativos

🎟️ *CUPONS*
↳ \`now\` : Ver cupons de hoje
↳ \`? loja\` : Buscar (ex: ? amazon)
↳ \`seguir loja\` : Alertas de novos cupons
↳ \`lojas\` : Ver lojas seguidas
↳ \`compacto\` : Alertas em modo resumido

💡 *OUTROS*
↳ \`! texto\` : Enviar sugestão
↳ \`g link\` : Sugerir novo grupo

❓ Digite *help* para o guia completo.
━━━━━━━━━━━━━━━`;
}

/**
 * Template do menu de ajuda completa
 * Guia detalhado de todos os comandos
 * 
 * @returns {string} Texto formatado do menu de ajuda
 */
export function getHelpMenu() {
  return `🤖 *GaBot - Guia de Comandos*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠️ *FILTROS (Lote suportado)*
• \`+ item1, item2\` : Adiciona vários
• \`+ item ate 3500\` : Adiciona com preco maximo
• \`- item1\` : Remove um filtro
• \`list\` ou \`filtros\` : Lista o que você segue

🛒 *CUPONS & LOJAS*
• \`now\` ou \`cupons\` : Todos os cupons recentes
• \`? [loja]\` : Procura cupons da loja
• \`seguir [loja]\` : Ativa alertas
• \`parar [loja]\` : Desativa alertas
• \`lojas\` : Suas lojas favoritas
• \`alerta compacto\` : Reduz detalhes dos alertas
• \`alerta detalhado\` : Volta ao formato completo

📢 *COLABORAÇÃO*
• \`! [texto]\` : Sugestão/Feedback
• \`g [link]\` : Indicar grupo de ofertas

⏮️ *LEGADO* (ainda funciona)
• \`c1\` a \`c12\` : Comandos numerados
• \`/add\`, \`/remover\`, etc : Comandos com /

━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Template do menu admin
 * Lista comandos administrativos
 * 
 * @returns {string} Texto formatado do menu admin
 */
export function getAdminMenu() {
  return `👮 *GaBot Admin Panel*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *GESTÃO DE FILA*
• \`ok [id]\` : Aprovar (ex: ok g1, g2)
• \`no [id]\` : Rejeitar (ex: no s*)
• \`adm2\` ou \`ok ?\` : Ver pendências

🧠 *IA (OLLAMA)*
• \`. [pergunta]\` : Conversar com a IA
• \`ia\` : Status das instâncias
• \`ia reset [nome]\` : Reiniciar modelo

📊 *SISTEMA*
• \`stats\` : Status e Versão
• \`logs\` : Ver últimos erros
• \`sys help\` : Comandos de terminal
• \`sys ls\` : Listar arquivos do servidor
• \`sys bot restart\` : Reiniciar bot via PM2
• \`sys confirmar\` : Confirma acao critica

━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Template do menu de filtros (legacy)
 * Mantido para compatibilidade
 * 
 * @returns {string} Texto formatado do menu de filtros
 */
export function getFiltersMenu() {
  return `📋 *Menu de Filtros*
━━━━━━━━━━━━━━━
Use os comandos:
• \`+ termo\` : Adicionar filtro
• \`+ termo ate 3500\` : Adicionar com limite de preco
• \`- termo\` : Remover filtro
• \`list\` : Ver seus filtros

Digite \`menu\` para voltar`;
}

/**
 * Template do menu de cupons (legacy)
 * Mantido para compatibilidade
 * 
 * @returns {string} Texto formatado do menu de cupons
 */
export function getCouponsMenu() {
  return `🎫 *Menu de Cupons*
━━━━━━━━━━━━━━━
Use os comandos:
• \`now\` : Cupons recentes
• \`? [loja]\` : Buscar por loja
• \`seguir [loja]\` : Ficar de olho nos cupons da loja
• \`parar [loja]\` : Parar de seguir
• \`lojas\` : Suas lojas
• \`compacto\` : Ativar alerta resumido
• \`detalhado\` : Ativar alerta completo

Digite \`menu\` para voltar`;
}

/**
 * Template de erro - comando não reconhecido
 * 
 * @returns {string} Mensagem de erro
 */
export function getCommandNotFoundError() {
  return `❌ Comando não reconhecido.\n\nDigite \`help\` para ver os comandos disponíveis.`;
}

/**
 * Template de erro - argumento ausente
 * 
 * @param {string} command - Comando que requer argumento
 * @param {string} example - Exemplo de uso
 * @returns {string} Mensagem de erro com exemplo
 */
export function getMissingArgumentError(command, example) {
  return `❌ Comando incompleto.\n\n✅ Uso correto: \`${example}\``;
}

/**
 * Template de sucesso - filtro adicionado
 * 
 * @param {string|Array} terms - Termo(s) adicionado(s)
 * @returns {string} Mensagem de sucesso
 */
export function getFilterAddedMessage(terms) {
  if (Array.isArray(terms)) {
    const count = terms.length;
    return `✅ ${count} filtro(s) adicionado(s):\n${terms.map(t => `  • ${t}`).join("\n")}`;
  }
  return `✅ Filtro adicionado: "${terms}"`;
}

/**
 * Template de sucesso - filtro removido
 * 
 * @param {string|Array} terms - Termo(s) removido(s)
 * @returns {string} Mensagem de sucesso
 */
export function getFilterRemovedMessage(terms) {
  if (Array.isArray(terms)) {
    const count = terms.length;
    return `✅ ${count} filtro(s) removido(s):\n${terms.map(t => `  • ${t}`).join("\n")}`;
  }
  return `✅ Filtro removido: "${terms}"`;
}

/**
 * Template de erro - filtro duplicado
 * 
 * @param {string} term - Termo que já existe
 * @returns {string} Mensagem de erro
 */
export function getFilterDuplicateError(term) {
  return `⚠️ Esse filtro já existe: "${term}"`;
}

/**
 * Template de erro - filtro não encontrado
 * 
 * @param {string} term - Termo que não foi encontrado
 * @returns {string} Mensagem de erro
 */
export function getFilterNotFoundError(term) {
  return `❌ Filtro não encontrado: "${term}"`;
}

/**
 * Template de lista vazia - nenhum filtro
 * 
 * @returns {string} Mensagem
 */
export function getNoFiltersMessage() {
  return `📭 Você ainda não tem filtros cadastrados.\n\nUse \`+ termo\` para adicionar um!`;
}

/**
 * Template para exibir lista de filtros
 * 
 * @param {Array<{term: string}>} keywords - Lista de filtros
 * @returns {string} Mensagem formatada
 */
export function getFiltersListMessage(keywords) {
  if (!keywords || keywords.length === 0) {
    return getNoFiltersMessage();
  }

  const list = keywords
    .map(({ term }) => `• ${term}`)
    .join("\n");

  return `📋 *Seus Filtros Ativos* (${keywords.length}):\n\n${list}\n\n_Use \`- termo\` para remover_`;
}

/**
 * Template para sugestão de grupo duplicada
 * 
 * @param {number} id - ID da sugestão anterior
 * @param {string} status - Status da sugestão
 * @returns {string} Mensagem
 */
export function getGroupDuplicateMessage(id, status) {
  return `⚠️ Esse grupo já foi sugerido antes.\nStatus: ${status}\nID: g${id}`;
}

/**
 * Template para sugestão recebida
 * 
 * @returns {string} Mensagem de confirmação
 */
export function getSuggestionReceivedMessage() {
  return `✅ Sugestão recebida! Vou encaminhar para o admin avaliar.`;
}

/**
 * Template para erro de link inválido
 * 
 * @returns {string} Mensagem de erro
 */
export function getInvalidLinkError() {
  return `❌ Não consegui identificar um link válido do WhatsApp.\n\nExemplo correto:\nhttps://chat.whatsapp.com/SEUCODIGO`;
}

/**
 * Template para mensagem de boas-vindas
 * 
 * @param {string} userName - Nome do usuário
 * @returns {string} Mensagem personalizada
 */
export function getWelcomeMessage(userName) {
  return `👋 Olá ${userName}! Bem-vindo ao GaBot.\n\nDigite \`help\` para ver os comandos disponíveis.`;
}

/**
 * Template para status do bot
 * 
 * @param {Object} stats - Estatísticas do bot
 * @param {string} stats.version - Versão
 * @param {string} stats.uptime - Tempo online
 * @param {number} stats.connectedUsers - Usuários conectados
 * @param {number} stats.totalCoupons - Total de cupons
 * @returns {string} Mensagem formatada
 */
export function getBotStatusMessage(stats) {
  return `📊 *Status do GaBot*
━━━━━━━━━━━━━━━
✅ Versão: ${stats.version}
⏱️ Uptime: ${stats.uptime}
👥 Usuários: ${stats.connectedUsers}
🎟️ Cupons: ${stats.totalCoupons}

_Sistema operacional_`;
}

/**
 * Formata múltiplas linhas com padrão consistente
 * 
 * @param {string} title - Título da seção
 * @param {Array<string>} items - Items a exibir
 * @param {string} emoji - Emoji para o título
 * @returns {string} Mensagem formatada
 */
export function formatSection(title, items, emoji = "📋") {
  if (!items || items.length === 0) {
    return `${emoji} ${title}\n_Nada para exibir_`;
  }

  const list = items.map(item => `• ${item}`).join("\n");
  return `${emoji} *${title}* (${items.length}):\n\n${list}`;
}
