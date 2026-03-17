import assert from "node:assert/strict";
import test from "node:test";
import {
  detectStoreFromText,
  extractCouponsSync,
} from "../src/services/couponExtractor.js";

test("extractor extrai multiplos cupons em backticks", () => {
  const result = extractCouponsSync("CUPOM: `LOOK15` ou `BRAESC1` para hoje");
  const codes = result.coupons.map((item) => item.code).sort();

  assert.deepEqual(codes, ["BRAESC1", "LOOK15"]);
  assert.equal(result.source, "regex");
  assert.equal(result.telemetry.isFalsePositive, false);
});

test("extractor bloqueia falso positivo de palavra comum", () => {
  const result = extractCouponsSync("Cupom: PRIME");

  assert.equal(result.coupons.length, 0);
  assert.equal(result.telemetry.hasCouponIntent, true);
  assert.equal(result.telemetry.isFalsePositive, true);
  assert.equal(result.telemetry.reason, "no_valid_coupon_code");
});

test("extractor evita persistencia para cupom de pagina sem codigo", () => {
  const result = extractCouponsSync("Resgate cupom do anuncio para ativar desconto");

  assert.equal(result.coupons.length, 0);
  assert.equal(result.telemetry.isFalsePositive, true);
  assert.equal(result.telemetry.reason, "page_coupon_without_code");
});

test("detector de loja prioriza loja da IA", () => {
  const store = detectStoreFromText("texto sem loja", "grupo qualquer", "Amazon");
  assert.equal(store, "Amazon");
});

test("detector de loja usa regex quando IA nao informa", () => {
  const store = detectStoreFromText("Oferta imperdivel no magalu", "", null);
  assert.equal(store, "Magazine Luiza");
});
