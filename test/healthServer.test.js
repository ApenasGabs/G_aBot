import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAdminNotificationPayload,
  normalizeDirectRecipientJid,
  startHealthAndAdminServer,
  verifyBearerSecret,
} from "../src/services/healthServer.js";

test("verifyBearerSecret compares secrets in constant time safely", () => {
  assert.equal(verifyBearerSecret("super_secret_123", "super_secret_123"), true);
  assert.equal(verifyBearerSecret("wrong", "super_secret_123"), false);
  assert.equal(verifyBearerSecret("", "super_secret_123"), false);
  assert.equal(verifyBearerSecret("super_secret_123", ""), false);
});

test("formatAdminNotificationPayload handles Status Hub SRE reports and Uptime Kuma webhooks", () => {
  // Suppresses routine green reports when onlyImportant=true
  const suppressed = formatAdminNotificationPayload({
    severity: "green",
    onlyImportant: true,
    text: "Tudo verde",
  });
  assert.equal(suppressed.skip, true);

  // Delivers yellow/red reports
  const delivered = formatAdminNotificationPayload({
    severity: "red",
    onlyImportant: true,
    text: "🔴 1 monitor DOWN",
  });
  assert.equal(delivered.skip, false);
  assert.match(delivered.text, /1 monitor DOWN/);

  // Formats native Uptime Kuma DOWN webhook
  const kumaDown = formatAdminNotificationPayload({
    monitor: { name: "Server 1 — Git Server Privado" },
    heartbeat: { status: 0, msg: "connect ECONNREFUSED" },
  });
  assert.equal(kumaDown.skip, false);
  assert.match(kumaDown.text, /🔴 \*Alerta de Queda — Status Hub\*/);
  assert.match(kumaDown.text, /Server 1 — Git Server Privado/);
});

test("HTTP server exposes /healthz, /readyz states, and authenticated POST /api/admin/notify", async () => {
  const sentMessages = [];
  let wppState = {
    connected: true,
    loggedOut: false,
    reconnectAttempt: 0,
    recentDisconnects3m: 0,
    lastConnectedAt: "2026-10-29T21:00:00.000Z",
  };
  let dbHealthy = true;

  const srv = await startHealthAndAdminServer({
    port: 0,
    host: "127.0.0.1",
    webhookSecret: "test_secret_token",
    checkDatabase: () => ({ ok: dbHealthy }),
    getWhatsappState: () => wppState,
    sendAdminMessage: async (text) => {
      sentMessages.push(text);
      return { ok: true };
    },
    supabaseConfigured: true,
  });

  const baseUrl = `http://127.0.0.1:${srv.port}`;

  try {
    // 1. /healthz -> 200 ok
    const hz = await fetch(`${baseUrl}/healthz`);
    assert.equal(hz.status, 200);
    const hzBody = await hz.json();
    assert.equal(hzBody.status, "ok");

    // 2. /readyz when connected -> 200 ok
    const rzOk = await fetch(`${baseUrl}/readyz`);
    assert.equal(rzOk.status, 200);
    const rzOkBody = await rzOk.json();
    assert.equal(rzOkBody.status, "ok");
    assert.equal(rzOkBody.checks.whatsapp.connected, true);

    // 3. /readyz when temporarily reconnecting -> 200 degraded
    wppState = { ...wppState, connected: false, reconnectAttempt: 1 };
    const rzDeg = await fetch(`${baseUrl}/readyz`);
    assert.equal(rzDeg.status, 200);
    const rzDegBody = await rzDeg.json();
    assert.equal(rzDegBody.status, "degraded");

    // 4. /readyz when loggedOut or DB down -> 503 down
    dbHealthy = false;
    const rzDown = await fetch(`${baseUrl}/readyz`);
    assert.equal(rzDown.status, 503);
    const rzDownBody = await rzDown.json();
    assert.equal(rzDownBody.status, "down");
    dbHealthy = true;
    wppState = { ...wppState, connected: true };

    // 5. POST /api/admin/notify without valid token -> 401
    const unauth = await fetch(`${baseUrl}/api/admin/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    assert.equal(unauth.status, 401);

    // 6. POST /api/admin/notify with valid Bearer token -> 200 delivered
    const authRes = await fetch(`${baseUrl}/api/admin/notify`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test_secret_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        severity: "yellow",
        onlyImportant: true,
        text: "🟡 Boletim SRE de teste",
      }),
    });
    assert.equal(authRes.status, 200);
    const authJson = await authRes.json();
    assert.equal(authJson.delivered, true);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0], "🟡 Boletim SRE de teste");
  } finally {
    await srv.close();
  }
});

test("normalizeDirectRecipientJid e POST /api/admin/send validam destino e entregam com autenticacao Bearer", async () => {
  assert.equal(
    normalizeDirectRecipientJid("+55 11 98164-0373"),
    "5511981640373@s.whatsapp.net"
  );
  assert.equal(
    normalizeDirectRecipientJid("105518773317706@lid"),
    "105518773317706@lid"
  );
  assert.throws(() => normalizeDirectRecipientJid("123"), /invalido/i);
  assert.throws(() => normalizeDirectRecipientJid("abc@invalid.domain"), /invalido/i);

  const directDeliveries = [];
  const srv = await startHealthAndAdminServer({
    port: 0,
    host: "127.0.0.1",
    webhookSecret: "test_secret_token",
    checkDatabase: () => ({ ok: true }),
    getWhatsappState: () => ({ connected: true, loggedOut: false }),
    sendDirectMessage: async (to, text) => {
      directDeliveries.push({ to, text });
      return { ok: true, to };
    },
  });

  const baseUrl = `http://127.0.0.1:${srv.port}`;

  try {
    const unauth = await fetch(`${baseUrl}/api/admin/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "+55 11 98164-0373", text: "Menu" }),
    });
    assert.equal(unauth.status, 401);

    const badReq = await fetch(`${baseUrl}/api/admin/send`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test_secret_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: "invalid", text: "Menu" }),
    });
    assert.equal(badReq.status, 400);

    const okRes = await fetch(`${baseUrl}/api/admin/send`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test_secret_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: "+55 11 98164-0373", text: "Olá! Digite menu." }),
    });
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.delivered, true);
    assert.equal(okJson.to, "5511981640373@s.whatsapp.net");
    assert.deepEqual(directDeliveries, [
      { to: "5511981640373@s.whatsapp.net", text: "Olá! Digite menu." },
    ]);
  } finally {
    await srv.close();
  }
});
