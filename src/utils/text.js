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

export function createOfferHash(text) {
  return createHash("md5").update(text).digest("hex");
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
