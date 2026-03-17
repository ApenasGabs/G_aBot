import { createHash } from "node:crypto";

export function extractMessageText(message) {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
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
  if (message?.imageMessage) return "image";
  if (message?.videoMessage) return "video";
  if (message?.documentMessage) return "document";
  if (message?.audioMessage) return "audio";
  if (message?.stickerMessage) return "sticker";
  return "text";
}

export function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9@._-]/g, "_");
}
