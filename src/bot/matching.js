import { compactText } from "../utils/text.js";

const parsePriceToCents = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const normalized = value
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const extractLowestOfferPriceCents = (originalOfferText) => {
  const text = String(originalOfferText || "");
  if (!text) return null;

  const prices = text.match(/r\$\s*\d[\d.\s]*(?:,\d{1,2})?/gi) || [];
  if (prices.length === 0) return null;

  let lowest = null;
  for (const rawPrice of prices) {
    const numericPart = rawPrice.replace(/r\$/i, "").trim();
    const cents = parsePriceToCents(numericPart);
    if (!Number.isFinite(cents)) continue;
    if (lowest == null || cents < lowest) {
      lowest = cents;
    }
  }

  return lowest;
};

export function findMatches(normalizedOfferText, allKeywords, originalOfferText = "") {
  const matched = new Map();
  const compactOfferText = compactText(normalizedOfferText);
  const offerPriceCents = extractLowestOfferPriceCents(originalOfferText);

  for (const row of allKeywords) {
    if (!row.term_normalized) continue;
    const normalizedTerm = row.term_normalized;
    const compactTerm = compactText(normalizedTerm);

    const hasDirectMatch = normalizedOfferText.includes(normalizedTerm);
    const hasCompactMatch = compactOfferText.includes(compactTerm);
    if (!hasDirectMatch && !hasCompactMatch) continue;

    const hasPriceLimit = Number.isFinite(row.max_price_cents) && row.max_price_cents > 0;
    if (hasPriceLimit) {
      if (!Number.isFinite(offerPriceCents) || offerPriceCents > row.max_price_cents) {
        continue;
      }
    }

    const existing = matched.get(row.user_id);
    const matchItem = {
      term: row.term,
      maxPriceCents: hasPriceLimit ? Number(row.max_price_cents) : null,
      offerPriceCents: Number.isFinite(offerPriceCents) ? offerPriceCents : null,
    };

    if (existing) {
      existing.push(matchItem);
    } else {
      matched.set(row.user_id, [matchItem]);
    }
  }

  return matched;
}
