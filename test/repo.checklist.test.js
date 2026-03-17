import Database from "better-sqlite3";
import assert from "node:assert/strict";
import test from "node:test";
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
