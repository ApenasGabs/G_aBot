import { normalizeText } from "../utils/text.js";
import { isAIEnabled, parseWithAI } from "./aiCouponParser.js";

const STORE_PATTERNS = [
  { name: "Amazon", regex: /(amazon\.com|amzn\.to|amazon)/i },
  { name: "Mercado Livre", regex: /(mercadolivre|meli\.uz|ml\.com)/i },
  { name: "Shopee", regex: /(shopee\.com|s\.shopee)/i },
  { name: "Magazine Luiza", regex: /(magalu|magazineluiza|magalu\.com)/i },
  { name: "Casas Bahia", regex: /(casasbahia|casas bahia)/i },
  { name: "Kabum", regex: /(kabum|kabum\.com)/i },
  { name: "AliExpress", regex: /(aliexpress|ali\.s)/i },
  { name: "Ponto", regex: /(pontofrio|ponto\.com|ponto frio)/i },
  { name: "Carrefour", regex: /(carrefour)/i },
  { name: "Americanas", regex: /(americanas)/i },
];

const COUPON_PATTERNS = [
  { regex: /cupom\s*:?\s*([A-Z0-9]{4,20})/gi, baseScore: 65 },
  { regex: /c[óo]digo\s*:?\s*([A-Z0-9]{4,20})/gi, baseScore: 65 },
  { regex: /use\s+o?\s*cupom\s+([A-Z0-9]{4,20})/gi, baseScore: 70 },
  { regex: /c[óo]digo\s+de\s+desconto\s*:?\s*([A-Z0-9]{4,20})/gi, baseScore: 70 },
  { regex: /promo\s*:?\s*([A-Z0-9]{4,20})/gi, baseScore: 40 },
  { regex: /(?:aproveite|desconto|oferta)\s*:?\s*([A-Z0-9]{4,20})/gi, baseScore: 35 },
];

const COMMON_WORD_BLOCKLIST = new Set([
  "AGORA",
  "HOJE",
  "AMANHA",
  "PROMO",
  "OFERTA",
  "DESCONTO",
  "CUPOM",
  "CODIGO",
  "LINK",
  "GRUPO",
  "SITE",
  "LOJA",
]);

function scoreCoupon(code, baseScore) {
  let score = baseScore;
  const upper = code.toUpperCase();

  const hasLetter = /[A-Z]/.test(upper);
  const hasDigit = /\d/.test(upper);

  if (hasLetter && hasDigit) score += 20;
  if (hasDigit) score += 5;
  if (upper.length >= 6) score += 5;
  if (COMMON_WORD_BLOCKLIST.has(upper)) score -= 60;
  if (!hasDigit && upper.length <= 5) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// Padrões que indicam cupom esgotado/expirado
const EXHAUSTED_PATTERNS = [
  /cupom\s+(esgotado|expirado|encerrado|acabou)/i,
  /c[óo]digo\s+(esgotado|expirado|encerrado|acabou)/i,
  /(esgotado|expirado|encerrado)\s+o\s+cupom/i,
  /j[áa]\s+(esgotou|expirou)/i,
];

/**
 * Extração de cupons usando REGEX (método tradicional)
 * Mantido para compatibilidade e fallback
 */
function extractCouponsRegex(text) {
  const normalizedText = normalizeText(text);
  const candidates = [];

  // Verificar se mensagem indica esgotamento
  const isExhausted = EXHAUSTED_PATTERNS.some((pattern) =>
    pattern.test(normalizedText)
  );

  for (const pattern of COUPON_PATTERNS) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      if (match[1]) {
        const code = match[1].toUpperCase();
        const confidence = scoreCoupon(code, pattern.baseScore);
        candidates.push({ code, confidence });
      }
    }
  }

  // Mantém o melhor score por código
  const bestByCode = new Map();
  for (const item of candidates) {
    const prev = bestByCode.get(item.code);
    if (!prev || item.confidence > prev.confidence) {
      bestByCode.set(item.code, item);
    }
  }

  const coupons = [...bestByCode.values()].filter((c) => c.confidence >= 50);

  const summaryWithoutAI = coupons.length > 0
    ? `Resumo sem IA: ${coupons
        .map((c) => `codigo=${c.code}, confianca=${c.confidence}%`)
        .join(" | ")}.`
    : "Resumo sem IA: nenhum cupom valido encontrado.";

  return {
    coupons,
    isExhausted,
    source: 'regex',
    summaryWithAI: null,
    summaryWithoutAI,
  };
}

/**
 * Extração de cupons com suporte a IA (Ollama/LLM)
 * 
 * Fluxo:
 * 1. Se AI habilitada → tenta parsing com IA
 * 2. Se AI retornar resultado válido → usa resultado da IA
 * 3. Se AI falhar ou desabilitada → fallback para regex
 * 
 * @param {string} text - Texto da mensagem
 * @param {string} groupName - Nome do grupo (contexto)
 * @returns {Promise<Object>} { coupons: [], isExhausted: boolean, source: string, aiStore?: string }
 */
export async function extractCoupons(text, groupName = '') {
  // Tenta usar IA primeiro (se habilitado)
  if (isAIEnabled()) {
    console.log('[Coupon Extractor] Tentando parsing com IA...');
    
    try {
      const aiResult = await parseWithAI(text, groupName);
      
      if (aiResult && aiResult.is_coupon && aiResult.coupon_code) {
        console.log('[Coupon Extractor] IA detectou cupom:', {
          code: aiResult.coupon_code,
          store: aiResult.store_name,
          confidence: aiResult.confidence,
        });
        
        return {
          coupons: [{
            code: aiResult.coupon_code.toUpperCase(),
            confidence: aiResult.confidence,
          }],
          isExhausted: aiResult.is_exhausted || false,
          source: 'ai',
          aiStore: aiResult.store_name, // Loja identificada pela IA
          aiReasoning: aiResult.reasoning,
          summaryWithAI: aiResult.summary_with_ai || null,
          summaryWithoutAI: aiResult.summary_without_ai || null,
        };
      }
      
      // IA não detectou cupom ou retornou resultado inválido
      console.log('[Coupon Extractor] IA não detectou cupom válido, usando fallback regex');
      
    } catch (error) {
      console.error('[Coupon Extractor] Erro ao usar IA, usando fallback regex:', error.message);
    }
  }

  // Fallback para regex tradicional
  console.log('[Coupon Extractor] Usando extração regex');
  return extractCouponsRegex(text);
}

/**
 * Versão síncrona da extração (apenas regex)
 * Útil quando não é possível usar async/await
 */
export function extractCouponsSync(text) {
  return extractCouponsRegex(text);
}

/**
 * Detecta loja a partir do texto
 * Se o resultado da IA contém uma loja, ela tem prioridade
 * 
 * @param {string} text - Texto da mensagem
 * @param {string} fallbackGroupName - Nome do grupo como contexto
 * @param {string} aiStore - Loja identificada pela IA (opcional)
 * @returns {string} Nome da loja ou "Loja nao identificada"
 */
export function detectStoreFromText(text, fallbackGroupName = "", aiStore = null) {
  // Se a IA identificou uma loja, usa ela
  if (aiStore && aiStore !== "Loja nao identificada") {
    console.log('[Store Detection] Usando loja identificada pela IA:', aiStore);
    return aiStore;
  }

  // Fallback para regex tradicional
  const haystack = `${text} ${fallbackGroupName}`;
  for (const store of STORE_PATTERNS) {
    if (store.regex.test(haystack)) {
      return store.name;
    }
  }
  return "Loja nao identificada";
}

export function calculateRecencyEmoji(timestampMs) {
  const now = Date.now();
  const ageMs = now - timestampMs;
  const ageMinutes = ageMs / (1000 * 60);

  if (ageMinutes < 5) return "🔥🔥🔥"; // Menos de 5min
  if (ageMinutes < 15) return "🔥🔥"; // Menos de 15min
  if (ageMinutes < 30) return "🔥"; // Menos de 30min
  if (ageMinutes < 120) return "⏰"; // Menos de 2h
  if (ageMinutes < 360) return "🕐"; // Menos de 6h
  if (ageMinutes < 1440) return "📅"; // Menos de 24h
  return "🧊"; // Mais de 24h
}
