const lastReplyByChat = new Map();

const REPLY_COOLDOWN_MS = 20 * 60 * 1000;
const REPLY_PROBABILITY = 0.35;

function isSkippableText(text) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("status")) return true;
  if (normalized.startsWith("/")) return true;
  if (/^[1-9]$/.test(normalized)) return true;

  const commandWords = new Set(["menu", "ajuda", "cadastro", "filtros", "cupons"]);
  const firstWord = normalized.split(/\s+/)[0];
  if (commandWords.has(firstWord)) return true;

  return false;
}

async function fetchReason() {
  try {
    const response = await fetch("https://naas.daniilmira.com/no");
    const data = await response.json();
    return (data.reason || "nao tenho um motivo especifico agora").toLowerCase();
  } catch {
    return "nao consegui definir um motivo agora";
  }
}

async function translateToPtBr(text) {
  try {
    const encoded = encodeURIComponent(text);
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encoded}&langpair=en|pt-BR`
    );
    const data = await response.json();
    if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    return text;
  } catch {
    return text;
  }
}

export async function handleUnmappedPrivateMessage({ chatId, text, reply }) {
  if (isSkippableText(text)) return false;

  const now = Date.now();
  const lastReplyAt = lastReplyByChat.get(chatId) || 0;
  if (now - lastReplyAt < REPLY_COOLDOWN_MS) return false;
  if (Math.random() > REPLY_PROBABILITY) return false;

  const reasonEn = await fetchReason();
  const reasonPt = await translateToPtBr(reasonEn);
  const message = `Nao consigo responder isso agora, ${reasonPt}`;

  await reply(message);
  lastReplyByChat.set(chatId, now);
  return true;
}
