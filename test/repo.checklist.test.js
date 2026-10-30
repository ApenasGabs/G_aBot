import Database from "better-sqlite3";
import assert from "node:assert/strict";
import test from "node:test";
import pino from "pino";
import { createRepo } from "../src/db/repo.js";
import { setupDatabase } from "../src/db/schema.js";

function createInMemoryRepo() {
  const db = new Database(":memory:");
  setupDatabase(db);
  return {
    db,
    repo: createRepo(db),
  };
}

test("schema cria coluna alert_mode para usuarios", () => {
  const { db } = createInMemoryRepo();
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const hasAlertMode = columns.some((column) => column.name === "alert_mode");
  assert.equal(hasAlertMode, true);
  db.close();
});

test("repo controla modo de alerta por usuario", () => {
  const { db, repo } = createInMemoryRepo();

  repo.upsertUser("u1", "Ana");
  assert.equal(repo.getUserAlertMode("u1"), "full");

  const compactResult = repo.setUserAlertMode("u1", "compact");
  assert.equal(compactResult.updated, true);
  assert.equal(compactResult.mode, "compact");
  assert.equal(repo.getUserAlertMode("u1"), "compact");

  const invalidModeResult = repo.setUserAlertMode("u1", "qualquer-coisa");
  assert.equal(invalidModeResult.mode, "full");
  assert.equal(repo.getUserAlertMode("u1"), "full");

  db.close();
});

test("repo aplica deduplicacao de cupom por grupo e global", () => {
  const { db, repo } = createInMemoryRepo();

  const first = repo.upsertCoupon({
    code: "PROMO123",
    groupId: "g1",
    groupName: "Grupo 1",
    messageText: "Cupom PROMO123",
    isExhausted: false,
  });
  assert.deepEqual(first, { isNewGroup: true, isNewGlobal: true });

  const sameGroup = repo.upsertCoupon({
    code: "PROMO123",
    groupId: "g1",
    groupName: "Grupo 1",
    messageText: "Cupom PROMO123 novamente",
    isExhausted: false,
  });
  assert.deepEqual(sameGroup, { isNewGroup: false, isNewGlobal: false });

  const otherGroup = repo.upsertCoupon({
    code: "PROMO123",
    groupId: "g2",
    groupName: "Grupo 2",
    messageText: "Cupom PROMO123 em outro grupo",
    isExhausted: false,
  });
  assert.deepEqual(otherGroup, { isNewGroup: true, isNewGlobal: false });

  db.close();
});

test("repo registra metricas de cupom por loja", () => {
  const { db, repo } = createInMemoryRepo();

  repo.incrementCouponStoreMetric("Amazon", "detected", 2);
  repo.incrementCouponStoreMetric("Amazon", "matched", 1);
  repo.incrementCouponStoreMetric("Amazon", "false_positive", 3);

  const metrics = repo.listCouponStoreMetrics(5);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].store_name, "Amazon");
  assert.equal(metrics[0].detected_count, 2);
  assert.equal(metrics[0].matched_count, 1);
  assert.equal(metrics[0].false_positive_count, 3);

  db.close();
});

test("repo limpa processed_offers por TTL", () => {
  const { db, repo } = createInMemoryRepo();

  db.prepare(
    "INSERT INTO processed_offers (hash_id, created_at) VALUES (?, datetime('now', '-10 days'))"
  ).run("old_hash");

  db.prepare(
    "INSERT INTO processed_offers (hash_id, created_at) VALUES (?, datetime('now'))"
  ).run("new_hash");

  const removed = repo.cleanupProcessedOffers(7);
  assert.equal(removed, 1);

  const remaining = db.prepare("SELECT hash_id FROM processed_offers ORDER BY hash_id").all();
  assert.deepEqual(remaining, [{ hash_id: "new_hash" }]);

  db.close();
});

test("repo remove todos os filtros de um usuario", () => {
  const { db, repo } = createInMemoryRepo();

  repo.upsertUser("u1", "Ana");
  repo.addKeyword("u1", "notebook");
  repo.addKeyword("u1", "ssd");

  const removed = repo.removeAllKeywords("u1");
  assert.equal(removed, 2);
  assert.deepEqual(repo.listKeywords("u1"), []);

  db.close();
});

test("repo.upsertCoupon trata mensagens sem chave esperada ou com codigo vazio/nulo sem lancar excecao", () => {
  const { db, repo } = createInMemoryRepo();

  // Payload nulo ou nao-objeto
  const nullResult = repo.upsertCoupon(null);
  assert.equal(nullResult.skipped, true);
  assert.equal(nullResult.reason, "invalid_payload");

  // Sem codigo
  const noCodeResult = repo.upsertCoupon({ groupId: "g1", groupName: "Grupo 1" });
  assert.equal(noCodeResult.skipped, true);
  assert.equal(noCodeResult.reason, "empty_code");

  // Codigo nulo ou vazio
  const emptyCodeResult = repo.upsertCoupon({ code: null, groupId: "g1" });
  assert.equal(emptyCodeResult.skipped, true);
  assert.equal(emptyCodeResult.reason, "empty_code");

  // Codigo apenas espacos
  const whitespaceCodeResult = repo.upsertCoupon({ code: "   ", groupId: "g1" });
  assert.equal(whitespaceCodeResult.skipped, true);
  assert.equal(whitespaceCodeResult.reason, "empty_code");

  // Sem groupId
  const noGroupResult = repo.upsertCoupon({ code: "CUPOM10" });
  assert.equal(noGroupResult.skipped, true);
  assert.equal(noGroupResult.reason, "empty_group_id");

  // Nenhum cupom deve ter sido inserido
  const recent = repo.listRecentCoupons(10);
  assert.equal(recent.length, 0);

  db.close();
});

test("repo.upsertCoupon e repo.markOfferAsProcessed tratam caracteres nulos sem quebrar o SQLite", () => {
  const { db, repo } = createInMemoryRepo();

  // Cupom com bytes nulos \0 no codigo, grupo e texto
  const couponWithNullBytes = repo.upsertCoupon({
    code: "CUPOM\0SAFE10",
    groupId: "group\0_123",
    groupName: "Grupo\0 VIP",
    messageText: "Use o cupom CUPOM\0SAFE10 com desconto\0!",
    isExhausted: false,
    storeName: "Amazon\0 Brasil",
  });

  assert.equal(couponWithNullBytes.isNewGroup, true);
  assert.equal(couponWithNullBytes.isNewGlobal, true);

  // Consulta do cupom persistido
  const recent = repo.listRecentCoupons(1);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].code, "CUPOMSAFE10");
  assert.equal(recent[0].store_name, "Amazon Brasil");

  // Marcar oferta processada com byte nulo
  const marked = repo.markOfferAsProcessed("hash\0_teste_123");
  assert.equal(marked, true);

  // Segunda inserção deve ignorar (deduplicação) sem lançar erro
  const markedAgain = repo.markOfferAsProcessed("hash\0_teste_123");
  assert.equal(markedAgain, false);

  db.close();
});

test("repo.incrementCouponStoreMetric trata caracteres nulos sem falhar a transacao", () => {
  const { db, repo } = createInMemoryRepo();

  // Metrica com caractere nulo no nome da loja
  repo.incrementCouponStoreMetric("Shopee\0 Oficial", "detected", 1);
  repo.incrementCouponStoreMetric("Shopee\0 Oficial", "matched", 1);

  const metrics = repo.listCouponStoreMetrics(5);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].store_name, "Shopee Oficial");
  assert.equal(metrics[0].detected_count, 1);
  assert.equal(metrics[0].matched_count, 1);

  db.close();
});

test("logger com serializer de error serializa message e stack em vez de objeto vazio", () => {
  let loggedOutput = "";
  const customStream = {
    write: (chunk) => {
      loggedOutput += chunk;
    },
  };

  const testLogger = pino(
    {
      level: "warn",
      serializers: {
        err: pino.stdSerializers.err,
        error: (err) => {
          if (!err) return err;
          if (err instanceof Error) {
            return pino.stdSerializers.err(err);
          }
          if (typeof err === "object") {
            return {
              message: err.message || String(err),
              stack: err.stack,
              code: err.code,
              ...err,
            };
          }
          return { message: String(err) };
        },
      },
    },
    customStream
  );

  const testErr = new Error("transaction failed, rolling back");
  testLogger.error({ error: testErr }, "transaction failed, rolling back");

  const parsed = JSON.parse(loggedOutput.trim());
  assert.equal(parsed.msg, "transaction failed, rolling back");
  assert.ok(parsed.error);
  assert.equal(parsed.error.message, "transaction failed, rolling back");
  assert.ok(parsed.error.stack.includes("Error: transaction failed, rolling back"));
});
