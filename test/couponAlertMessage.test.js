import assert from "node:assert/strict";
import test from "node:test";
import { buildCouponAlertMessage } from "../src/bot/couponAlertMessage.js";

test("alerta detalhado inclui loja detectada", () => {
  const text = buildCouponAlertMessage({
    couponItem: { code: "PROMO10", confidence: 90 },
    groupName: "Grupo XPTO",
    detectedStore: "Amazon",
    interestStoreName: "amazon",
    alertMode: "full",
  });

  assert.match(text, /Loja: Amazon/);
  assert.match(text, /Codigo: PROMO10/);
});

test("alerta usa loja seguida quando deteccao falha", () => {
  const text = buildCouponAlertMessage({
    couponItem: { code: "PROMO10", confidence: 90 },
    groupName: "Grupo XPTO",
    detectedStore: "Loja nao identificada",
    interestStoreName: "Mercado Livre",
    alertMode: "full",
  });

  assert.match(text, /Loja: Mercado Livre/);
});

test("alerta compacto sempre inclui loja", () => {
  const text = buildCouponAlertMessage({
    couponItem: { code: "PROMO10", confidence: 90 },
    groupName: "Grupo XPTO",
    detectedStore: "Loja nao identificada",
    interestStoreName: "Shopee",
    alertMode: "compact",
  });

  assert.match(text, /Loja: Shopee/);
});
