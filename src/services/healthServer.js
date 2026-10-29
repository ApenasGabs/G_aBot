import crypto from "node:crypto";
import http from "node:http";

const MAX_BODY_BYTES = 64 * 1024;
const APP_VERSION = "0.3.3";

/**
 * Compara tokens Bearer em tempo constante usando hash SHA-256
 * (evita vazamento de tamanho do segredo e excecoes de buffer).
 *
 * @param {string} provided
 * @param {string} expected
 * @returns {boolean}
 */
export function verifyBearerSecret(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Converte payloads do Status Hub ou Webhooks nativos do Uptime Kuma
 * em mensagem enxuta para o grupo WhatsApp ADM.
 *
 * @param {Record<string, any>} payload
 * @returns {{ skip: boolean, reason?: string, text?: string }}
 */
export function formatAdminNotificationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload JSON invalido.");
  }

  // 1. Formato nativo de Webhook do Uptime Kuma ({ heartbeat, monitor, msg })
  if (payload.monitor || payload.heartbeat) {
    const monitorName = payload.monitor?.name || "Servico Monitorado";
    const hb = payload.heartbeat;
    const nowBrt = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    if (hb && typeof hb.status === "number") {
      if (hb.status === 0) {
        return {
          skip: false,
          text: [
            "🔴 *Alerta de Queda — Status Hub*",
            `• Serviço: *${monitorName}*`,
            `• Detalhe: ${hb.msg || payload.msg || "Indisponível"}`,
            `• Horário: ${nowBrt}`,
          ].join("\n"),
        };
      }

      if (hb.status === 1) {
        if (payload.suppressRecovery === true) {
          return { skip: true, reason: "recovery_suppressed" };
        }
        const latency = hb.ping ? `${hb.ping}ms` : "OK";
        return {
          skip: false,
          text: [
            "🟢 *Serviço Recuperado — Status Hub*",
            `• Serviço: *${monitorName}*`,
            `• Resposta: ${latency}`,
            `• Horário: ${nowBrt}`,
          ].join("\n"),
        };
      }
    }

    if (payload.msg) {
      return {
        skip: false,
        text: `🔔 *Status Hub*\n${String(payload.msg).trim()}`,
      };
    }
  }

  // 2. Formato direto do Status Hub / SRE Watchtower
  const severity = String(payload.severity || "info").toLowerCase();
  const onlyImportant = payload.onlyImportant === true;
  const force = payload.force === true;

  if (onlyImportant && !force && (severity === "green" || severity === "ok")) {
    return { skip: true, reason: "green_suppressed" };
  }

  const rawText = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!rawText) {
    throw new Error("Campo 'text' obrigatorio na notificacao.");
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const formatted = title ? `*${title}*\n\n${rawText}` : rawText;

  return {
    skip: false,
    text: formatted.slice(0, 4000),
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        const err = new Error("Payload excede o limite de 64KB.");
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const err = new Error("Corpo da requisicao nao e um JSON valido.");
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Inicia servidor HTTP leve para /healthz, /readyz e POST /api/admin/notify.
 */
export function startHealthAndAdminServer({
  port = 3091,
  host = "0.0.0.0",
  webhookSecret = "",
  checkDatabase = () => ({ ok: true, latencyMs: 0 }),
  getWhatsappState = () => ({
    connected: false,
    loggedOut: false,
    reconnectAttempt: 0,
    recentDisconnects3m: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastDisconnectReason: null,
  }),
  sendAdminMessage = async () => ({ ok: false, error: "not_initialized" }),
  supabaseConfigured = false,
} = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    // 1. Liveness barato
    if (req.method === "GET" && (pathname === "/healthz" || pathname === "/api/healthz")) {
      return sendJson(res, 200, {
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Readiness detalhado (SQLite + Baileys + Supabase)
    if (req.method === "GET" && (pathname === "/readyz" || pathname === "/api/readyz")) {
      let dbCheck = { ok: false, latencyMs: 0, error: null };
      const t0 = performance.now();
      try {
        const resDb = checkDatabase();
        dbCheck = {
          ok: Boolean(resDb?.ok ?? true),
          latencyMs: Math.round(performance.now() - t0),
          error: null,
        };
      } catch (err) {
        dbCheck = {
          ok: false,
          latencyMs: Math.round(performance.now() - t0),
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const wpp = getWhatsappState() || {};
      const wppConnected = Boolean(wpp.connected);
      const wppLoggedOut = Boolean(wpp.loggedOut);

      let overallStatus = "ok";
      let httpCode = 200;

      if (!dbCheck.ok || wppLoggedOut) {
        overallStatus = "down";
        httpCode = 503;
      } else if (!wppConnected) {
        overallStatus = "degraded";
        httpCode = 200;
      }

      return sendJson(res, httpCode, {
        status: overallStatus,
        version: APP_VERSION,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: dbCheck.ok ? "ok" : "down",
            latencyMs: dbCheck.latencyMs,
            ...(dbCheck.error ? { error: dbCheck.error } : {}),
          },
          whatsapp: {
            status: wppLoggedOut ? "down" : wppConnected ? "ok" : "degraded",
            connected: wppConnected,
            loggedOut: wppLoggedOut,
            reconnectAttempt: wpp.reconnectAttempt ?? 0,
            recentDisconnects3m: wpp.recentDisconnects3m ?? 0,
            lastConnectedAt: wpp.lastConnectedAt ?? null,
            lastDisconnectedAt: wpp.lastDisconnectedAt ?? null,
            lastDisconnectReason: wpp.lastDisconnectReason ?? null,
          },
          supabase: {
            configured: Boolean(supabaseConfigured),
          },
          adminWebhook: {
            configured: Boolean(webhookSecret),
          },
        },
      });
    }

    // 3. Webhook autenticado para publicacao no grupo WhatsApp ADM
    if (req.method === "POST" && pathname === "/api/admin/notify") {
      if (!webhookSecret) {
        return sendJson(res, 503, {
          ok: false,
          error: "GABOT_WEBHOOK_SECRET nao configurado no servidor.",
        });
      }

      const authHeader = String(req.headers.authorization || "");
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";

      if (!verifyBearerSecret(token, webhookSecret)) {
        return sendJson(res, 401, {
          ok: false,
          error: "Token Bearer invalido ou ausente.",
        });
      }

      let payload;
      try {
        payload = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, {
          ok: false,
          error: err.message,
        });
      }

      let formatted;
      try {
        formatted = formatAdminNotificationPayload(payload);
      } catch (err) {
        return sendJson(res, 400, {
          ok: false,
          error: err.message,
        });
      }

      if (formatted.skip) {
        return sendJson(res, 200, {
          ok: true,
          skipped: true,
          reason: formatted.reason,
        });
      }

      try {
        const result = await sendAdminMessage(formatted.text);
        if (!result || result.ok === false) {
          return sendJson(res, 503, {
            ok: false,
            error: result?.error || "Cliente WhatsApp indisponivel para envio.",
          });
        }
        return sendJson(res, 200, {
          ok: true,
          delivered: true,
        });
      } catch (err) {
        return sendJson(res, 502, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return sendJson(res, 404, { error: "Not Found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const addr = server.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      console.log(`[HealthServer] Escutando em http://${host}:${boundPort} (/healthz, /readyz, /api/admin/notify)`);
      resolve({
        server,
        port: boundPort,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}
