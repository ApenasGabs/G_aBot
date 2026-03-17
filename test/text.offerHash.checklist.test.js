import assert from "node:assert/strict";
import test from "node:test";
import { createOfferHash } from "../src/utils/text.js";

test("hash ignora URL e emoji", () => {
  const a = createOfferHash("🔥 Monitor gamer 32 pol R$ 1.299,90 https://a.co/abc");
  const b = createOfferHash("Monitor gamer 32 polegadas R$1299.90 https://outra.url/oferta");

  assert.equal(a, b);
});

test("hash muda para preco diferente", () => {
  const a = createOfferHash("Notebook i5 R$ 2.999,00");
  const b = createOfferHash("Notebook i5 R$ 3.499,00");

  assert.notEqual(a, b);
});
