const UNKNOWN_STORE_LABEL = "Loja nao identificada";

function resolveStoreLabel(detectedStore, interestStoreName) {
  if (detectedStore && detectedStore !== UNKNOWN_STORE_LABEL) {
    return detectedStore;
  }

  const fallback = String(interestStoreName || "").trim();
  if (fallback) {
    return fallback;
  }

  return UNKNOWN_STORE_LABEL;
}

export function buildCouponAlertMessage({
  couponItem,
  groupName,
  detectedStore,
  interestStoreName,
  alertMode,
}) {
  const isCompact = alertMode === "compact";
  const storeLabel = resolveStoreLabel(detectedStore, interestStoreName);

  if (isCompact) {
    return [
      "🎟",
      couponItem.code,
      `| Loja: ${storeLabel}`,
      `| ${groupName}`,
    ].join(" ");
  }

  return [
    "Novo cupom detectado!",
    `Loja: ${storeLabel}`,
    `Codigo: ${couponItem.code}`,
    `Grupo: ${groupName}`,
    `Confianca: ${couponItem.confidence}%`,
  ].join("\n");
}
