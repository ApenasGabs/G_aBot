/**
 * Serviço de parsing de cupons usando IA (Ollama)
 * 
 * Analisa mensagens de texto e extrai informações estruturadas sobre cupons de desconto:
 * - Identifica se há cupons válidos na mensagem
 * - Extrai códigos dos cupons com precisão
 * - Identifica a loja/marketplace corretamente
 * - Determina confiança da extração
 * - Detecta cupons expirados/esgotados
 */

/**
 * Configuração da API Ollama
 * 
 * Suporta:
 * - Ollama local (http://localhost:11434)
 * - Qualquer API compatível com OpenAI (via BASE_URL)
 * 
 * MODELOS RECOMENDADOS por uso de recursos:
 * 
 * CPU/RAM (10GB+ disponível):
 *   - qwen2.5:1.5b (934MB) - MELHOR CUSTO/BENEFÍCIO - rápido e preciso
 *   - llama3.2:1b (1.3GB) - Muito rápido, ótimo para parsing
 *   - phi3:mini (3.8GB) - Excelente qualidade, boa velocidade
 *   - gemma2:2b (1.6GB) - Balanceado
 * 
 * GPU (800MB VRAM disponível):
 *   - Nenhum modelo cabe confortavelmente
 *   - Ollama automaticamente usa CPU se GPU estiver cheia
 * 
 * RECOMENDAÇÃO PARA SEU SETUP:
 *   - Use qwen2.5:1.5b ou llama3.2:1b rodando em CPU
 *   - Latência: 1-4 segundos por análise (aceitável)
 *   - Precisão: 85-90% (suficiente para cupons)
 */
const AI_CONFIG = {
  enabled: process.env.COUPON_AI_ENABLED === 'true',
  baseUrl: process.env.COUPON_AI_BASE_URL || 'http://localhost:11434',
  model: process.env.COUPON_AI_MODEL || 'qwen2.5:1.5b', // Mudado para modelo mais leve
  timeout: parseInt(process.env.COUPON_AI_TIMEOUT || '20000', 10), // 20s para CPU
};

/**
 * Prompt system para extração estruturada de cupons
 */
const SYSTEM_PROMPT = `Você é um assistente especializado em extrair informações de cupons de desconto de mensagens do WhatsApp.

Sua tarefa é analisar a mensagem fornecida e identificar:
1. Se há cupons/códigos de desconto válidos
2. Qual é o código exato do cupom
3. Qual é a loja/marketplace (Amazon, Mercado Livre, Shopee, Magazine Luiza, Casas Bahia, Kabum, AliExpress, Ponto Frio, Carrefour, Americanas, etc)
4. Se o cupom está expirado/esgotado
5. Nível de confiança (0-100)

IMPORTANTE:
- Retorne APENAS um objeto JSON válido, sem texto adicional
- Se não houver cupom, retorne is_coupon: false
- Seja preciso ao identificar o código do cupom (letras, números, símbolos exatos)
- Normalize o nome da loja para nomes conhecidos do Brasil
- Considere contexto do grupo/mensagem para identificar a loja

TRATAMENTO DOS DADOS (obrigatório):
1. Limpar ruído textual (emojis, quebras, pontuação excessiva) sem alterar o código do cupom.
2. Identificar candidatos a cupom e escolher o mais provável.
3. Detectar loja primeiro por menção explícita; se não houver, usar contexto do grupo.
4. Classificar status do cupom (ativo/esgotado/expirado) com base no texto.
5. Gerar resumo curto da decisão tomada no campo summary_with_ai.

Formato de resposta EXATO:
{
  "is_coupon": true/false,
    "coupon_codes": ["CODIGO123", "CODIGO456"] ou [],
  "store_name": "Nome da Loja" ou null,
  "confidence": 0-100,
  "is_exhausted": true/false,
  "reasoning": "Breve explicação da análise",
  "summary_with_ai": "Resumo curto com contexto e interpretação"
}`;

function buildSummaryWithoutAI({ couponCode, storeName, isExhausted }) {
  const code = couponCode || "nao identificado";
  const store = storeName || "Loja nao identificada";
  const status = isExhausted ? "esgotado/expirado" : "ativo";
  return `Resumo sem IA: codigo=${code}, loja=${store}, status=${status}.`;
}

/**
 * Chama a API Ollama para análise de cupom
 * 
 * @param {string} messageText - Texto da mensagem a ser analisada
 * @param {string} groupName - Nome do grupo (contexto adicional)
 * @returns {Promise<Object|null>} Dados estruturados do cupom ou null em caso de erro
 */
async function callOllamaAPI(messageText, groupName = '') {
  if (!AI_CONFIG.enabled) {
    return null;
  }

  try {
    const userPrompt = [
      `Mensagem: ${messageText}`,
      groupName ? `Grupo/Contexto: ${groupName}` : '',
      '',
      'Analise e retorne o JSON:',
    ].filter(Boolean).join('\n');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.timeout);

    // Formato OpenAI-compatible (usado por Ollama)
    const response = await fetch(`${AI_CONFIG.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // Baixa temperatura para respostas consistentes
        max_tokens: 300,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI Parser] Erro HTTP ${response.status}: ${errorText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[AI Parser] Resposta vazia da API');
      return null;
    }

    // Tenta extrair JSON da resposta (pode vir com texto ao redor)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI Parser] Resposta não contém JSON válido:', content);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validação básica do schema
    if (typeof parsed.is_coupon !== 'boolean') {
      console.error('[AI Parser] Schema inválido - falta is_coupon boolean');
      return null;
    }

    console.log('[AI Parser] Análise concluída:', {
      is_coupon: parsed.is_coupon,
      store: parsed.store_name,
      confidence: parsed.confidence,
    });

    return parsed;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[AI Parser] Timeout após ${AI_CONFIG.timeout}ms`);
    } else {
      console.error('[AI Parser] Erro ao chamar API:', error.message);
    }
    return null;
  }
}

/**
 * Analisa mensagem usando IA e retorna dados estruturados do cupom
 * 
 * @param {string} messageText - Texto completo da mensagem
 * @param {string} groupName - Nome do grupo de origem
 * @returns {Promise<Object|null>} Resultado da análise ou null se falhar/desabilitado
 * 
 * Retorno esperado:
 * {
 *   is_coupon: boolean,
 *   coupon_codes: string[],
 *   store_name: string|null,
 *   confidence: number (0-100),
 *   is_exhausted: boolean,
 *   reasoning: string,
 *   summary_with_ai: string,
 *   summary_without_ai: string
 * }
 */
export async function parseWithAI(messageText, groupName = '') {
  if (!AI_CONFIG.enabled) {
    console.log('[AI Parser] Desabilitado via COUPON_AI_ENABLED=false');
    return null;
  }

  if (!messageText || messageText.trim().length === 0) {
    return null;
  }

  console.log(`[AI Parser] Analisando mensagem (${messageText.length} chars) do grupo: ${groupName}`);

  const result = await callOllamaAPI(messageText, groupName);

  if (!result) {
    console.log('[AI Parser] Falha na análise, usando fallback regex');
    return null;
  }

  // Normaliza confiança para range 0-100
  if (typeof result.confidence === 'number') {
    result.confidence = Math.max(0, Math.min(100, Math.round(result.confidence)));
  } else {
    result.confidence = 50; // Default se não vier
  }

  result.summary_with_ai =
    typeof result.summary_with_ai === 'string' && result.summary_with_ai.trim().length > 0
      ? result.summary_with_ai.trim()
      : (result.reasoning || "Resumo com IA indisponivel");

  // Compatibilidade: aceita schema legado com coupon_code (singular).
  const normalizedCodes = Array.isArray(result.coupon_codes)
    ? result.coupon_codes
    : (result.coupon_code ? [result.coupon_code] : []);

  result.coupon_codes = [...new Set(
    normalizedCodes
      .map((code) => String(code || "").trim().toUpperCase())
      .filter((code) => /^[A-Z0-9]{3,20}$/.test(code))
  )];

  result.summary_without_ai = buildSummaryWithoutAI({
    couponCode: result.coupon_codes[0] || null,
    storeName: result.store_name,
    isExhausted: !!result.is_exhausted,
  });

  return result;
}

/**
 * Verifica se o serviço de IA está habilitado
 * @returns {boolean}
 */
export function isAIEnabled() {
  return AI_CONFIG.enabled;
}

/**
 * Retorna configuração atual (útil para debugging)
 * @returns {Object}
 */
export function getAIConfig() {
  return {
    enabled: AI_CONFIG.enabled,
    baseUrl: AI_CONFIG.baseUrl,
    model: AI_CONFIG.model,
    timeout: AI_CONFIG.timeout,
  };
}
