import { compactText } from "../utils/text.js";

export function findMatches(normalizedOfferText, allKeywords) {
  const matched = new Map();
  const compactOfferText = compactText(normalizedOfferText);

  for (const row of allKeywords) {
    if (!row.term_normalized) continue;
    const normalizedTerm = row.term_normalized;
    const compactTerm = compactText(normalizedTerm);

    const hasDirectMatch = normalizedOfferText.includes(normalizedTerm);
    const hasCompactMatch = compactOfferText.includes(compactTerm);
    if (!hasDirectMatch && !hasCompactMatch) continue;

    const existing = matched.get(row.user_id);
    if (existing) {
      existing.push(row.term);
    } else {
      matched.set(row.user_id, [row.term]);
    }
  }

  return matched;
}
