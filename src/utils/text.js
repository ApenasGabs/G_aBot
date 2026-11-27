import { createHash } from "node:crypto";

const MAX_MESSAGE_UNWRAP_DEPTH = 5;

/**
 * Desembrulha envelopes aninhados do WhatsApp/Baileys (ex.: mensagens temporárias
 * `ephemeralMessage` no iOS/novas conversas, `viewOnceMessage`, `editedMessage`,
 * `documentWithCaptionMessage`, `deviceSentMessage`), limitando a profundidade
 * para evitar loops em payloads malformados.
 *
 * @param {Record<string, any> | null | undefined} message
 * @returns {Record<string, any> | null | undefined}
 */
export function unwrapMessageContent(message) {
  if (!message || typeof message !== "object") {
    return message;
  }

  let current = message;
  for (let depth = 0; depth < MAX_MESSAGE_UNWRAP_DEPTH; depth++) {
    const wrapper =
      current?.ephemeralMessage ||
      current?.viewOnceMessage ||
      current?.viewOnceMessageV2 ||
      current?.viewOnceMessageV2Extension ||
      current?.documentWithCaptionMessage ||
      current?.editedMessage ||
      current?.associatedChildMessage ||
      current?.groupStatusMessage ||
      current?.groupStatusMessageV2 ||
      current?.deviceSentMessage;

    const next =
      wrapper?.message ||
      current?.protocolMessage?.editedMessage ||
      null;

    if (!next || typeof next !== "object" || next === current) {
      break;
    }
    current = next;
  }

  return current;
}

export function extractMessageText(message) {
  const content = unwrapMessageContent(message);
  return (
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.imageMessage?.caption ??
    content?.videoMessage?.caption ??
    content?.documentMessage?.caption ??
    content?.buttonsResponseMessage?.selectedDisplayText ??
    content?.listResponseMessage?.title ??
    content?.templateButtonReplyMessage?.selectedDisplayText ??
    ""
  );
}

export function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

export function compactText(text) {
  return normalizeText(text).replace(/\s+/g, "");
}

function normalizeOfferForHash(text) {
  const withoutUrls = String(text || "").replace(/https?:\/\/\S+/gi, " ");
  const withoutEmojis = withoutUrls.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ");

  const normalizedBase = withoutEmojis
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const canonicalPrices = normalizedBase.replace(/r\$\s*[\d.,]+/gi, (raw) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return " preco0 ";
    return ` preco${digits} `;
  });

  const canonicalUnits = canonicalPrices
    .replace(/\b(\d+)\s*(gb|tb|mhz|hz|w)\b/gi, "$1$2")
    .replace(/\b(\d+)\s*(pol|polegada|polegadas)\b/gi, "$1pol");

  return normalizeText(canonicalUnits);
}

export function createOfferHash(text) {
  const normalized = normalizeOfferForHash(text);
  return createHash("md5").update(normalized).digest("hex");
}

export function detectMessageType(message) {
  const content = unwrapMessageContent(message);
  if (content?.imageMessage) return "image";
  if (content?.videoMessage) return "video";
  if (content?.documentMessage) return "document";
  if (content?.audioMessage) return "audio";
  if (content?.stickerMessage) return "sticker";
  return "text";
}

export function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9@._-]/g, "_");
}
