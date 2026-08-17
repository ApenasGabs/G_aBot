import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { useSqliteAuthState } from "./sqliteAuthState.js";
import path from "node:path";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { BOT_CONFIG } from "../config.js";
import {
  detectStoreFromText,
  extractCoupons,
} from "../services/couponExtractor.js";
import { logGroupMessage, logUserMessage } from "../services/messageLogger.js";
import { createDispatchQueue } from "../utils/queue.js";
import {
  createOfferHash,
  detectMessageType,
  extractMessageText,
  normalizeText,
} from "../utils/text.js";
import { handlePrivateCommand } from "./commands.js";
import { buildCouponAlertMessage } from "./couponAlertMessage.js";
import { findMatches } from "./matching.js";
import { handleUnmappedPrivateMessage } from "./unmappedMessageHandler.js";

const disconnectTimestamps = [];

const baileysLogger = pino({ level: "warn" });

const RECONNECT_BASE_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 120000;
const FAST_RECONNECT_DELAY_MS = 2000;

const formatCurrencyBRL = (cents) => {
  if (!Number.isFinite(cents) || cents <= 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
};

const connLog = (message, ...args) => {
  const ts = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`[CONN ${ts}] ${message}`, ...args);
};



/**
 * Calcula delay de reconexão com backoff exponencial
 *
 * @param {number} attempt - Número da tentativa (0-based)
 * @returns {number} Delay em ms
 */
const getReconnectDelay = (attempt) => {
  return Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt), RECONNECT_MAX_DELAY_MS);
};

/**
 * Mapeia status code do Baileys para descrição legível
 *
 * @param {number} code - Status code
 * @returns {string} Descrição
 */
const describeStatusCode = (code) => {
  const descriptions = {
    [DisconnectReason.loggedOut]: "Sessão deslogada pelo WhatsApp (401)",
    [DisconnectReason.connectionClosed]: "Conexão fechada (428)",
    [DisconnectReason.connectionLost]: "Conexão perdida (408)",
    [DisconnectReason.connectionReplaced]: "Conexão substituída por outro dispositivo (440)",
    [DisconnectReason.timedOut]: "Timeout de conexão (408)",
    [DisconnectReason.badSession]: "Sessão inválida (500)",
    [DisconnectReason.restartRequired]: "Restart obrigatório (515)",
    [DisconnectReason.multideviceMismatch]: "Incompatibilidade de multi-device (411)",
  };
  return descriptions[code] || `Código desconhecido (${code})`;
};

export async function initWhatsappBot({
  repo,
  db,
  authDir,
  logsGroupsDir,
  logsUsersDir,
}) {
  let client = null;
  let ready = false;
  let reconnectAttempt = 0;
  const groupNameCache = new Map();
  const privateUserNameCache = new Map();

  const connect = async () => {
    // Carregar auth state do SQLite
    const { state, saveCreds, clearState } = await useSqliteAuthState(db);
    const { version } = await fetchLatestBaileysVersion();

    connLog(`Iniciando conexão (tentativa ${reconnectAttempt + 1}, versão WA: ${version.join(".")})`);

    client = makeWASocket({
      auth: state,
      version,
      logger: baileysLogger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: BOT_CONFIG.browserIdentity,
      syncFullHistory: false,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,

      shouldIgnoreJid: (jid) => jid?.endsWith("@broadcast"),
      getMessage: async () => undefined,
    });

    // Verifica me.id ao invés de registered — registered fica false após desconexão longa
    const isNewDevice = !state.creds.me?.id;
    if (isNewDevice) {
      connLog("Device novo detectado. Escaneie o QR Code que aparecerá a seguir.");
    } else {
      connLog(`Sessão existente encontrada (${state.creds.me.id}). Reconectando...`);
    }

    const dispatchQueue = createDispatchQueue(async (job) => {
      await client.sendMessage(job.chatId, { text: job.text });

      await logUserMessage(logsUsersDir, {
        userId: job.chatId,
        userName: privateUserNameCache.get(job.chatId) ?? null,
        direction: "out",
        context: job.context ?? "offer_alert",
        messageType: "text",
        text: job.text,
      });

      console.log(`Alerta enviado para ${job.chatId}`);
    }, BOT_CONFIG.dispatchIntervalMs);

    client.ev.on("creds.update", saveCreds);

    client.ev.on("connection.update", async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr && !state.creds.me?.id) {
        console.log("Escaneie o QR code com seu WhatsApp:");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        ready = true;
        reconnectAttempt = 0; // Reset backoff ao conectar com sucesso
        connLog("✅ Conexão estabelecida com sucesso");

        // Notifica grupo admin que o bot iniciou
        if (BOT_CONFIG.adminGroupId) {
          setTimeout(async () => {
            try {
              const timestamp = new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              });

              let msg = `✅ Bot online\nHorário: ${timestamp}\nVersão: gabot-ofertas v0.3.3`;
              
              if (reconnectAttempt === 0) {
                const fs = await import("fs");
                const flagPath = authDir + "/loop_crash.flag";
                if (fs.existsSync(flagPath)) {
                  msg = `⚠️ Bot recuperado de um loop de falhas (reinício forçado pelo sistema após 3 quedas)\nHorário: ${timestamp}`;
                  fs.unlinkSync(flagPath);
                }
              }

              await client.sendMessage(BOT_CONFIG.adminGroupId, {
                text: msg,
              });
            } catch (error) {
              console.log(
                "Erro ao enviar notificação de inicialização:",
                error.message,
              );
            }
          }, 3000); // Aguarda 3s para garantir que está pronto
        }
      }

      if (connection === "close") {
        ready = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || "desconhecido";
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        connLog(`Desconectado | Status: ${describeStatusCode(statusCode)} | Motivo: ${errorMessage}`);

        // Notifica grupo admin sobre desconexão (só se for logout definitivo)
        if (BOT_CONFIG.adminGroupId && !shouldReconnect) {
          try {
            const timestamp = new Date().toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            });
            await client.sendMessage(BOT_CONFIG.adminGroupId, {
              text: `⚠️ Bot desconectado (logout)\nHorário: ${timestamp}\nStatus: ${describeStatusCode(statusCode)}`,
            });
          } catch (error) {
            console.log(
              "Erro ao enviar notificação de desconexão:",
              error.message,
            );
          }
        }

        if (shouldReconnect) {
          const now = Date.now();
          disconnectTimestamps.push(now);
          // Manter apenas nos ultimos 3 minutos
          while (disconnectTimestamps.length > 0 && now - disconnectTimestamps[0] > 180000) {
            disconnectTimestamps.shift();
          }

          if (disconnectTimestamps.length >= 3) {
             connLog("Detectado loop de reconexão (3 falhas em 3min). Reiniciando processo via PM2.");
             import("fs").then(fs => {
               fs.writeFileSync(authDir + "/loop_crash.flag", "1");
               process.exit(1);
             });
             return;
          }

          // Calcular delay baseado no tipo de erro
          let delay;
          if (statusCode === DisconnectReason.connectionLost || statusCode === DisconnectReason.timedOut) {
            // Timeout/perda de rede: reconectar rápido
            delay = FAST_RECONNECT_DELAY_MS;
          } else if (statusCode === DisconnectReason.restartRequired) {
            // Restart obrigatório: recarregar auth com delay moderado
            delay = getReconnectDelay(Math.min(reconnectAttempt, 2)); // max ~20s
            connLog("Restart obrigatório detectado. Auth será recarregado na próxima tentativa.");
          } else if (statusCode === DisconnectReason.connectionReplaced) {
            // Conexão substituída: delay longo para evitar conflito
            delay = getReconnectDelay(3); // ~40s
            connLog("Conexão substituída por outro dispositivo. Aguardando antes de reconectar.");
          } else {
            // Default: backoff exponencial
            delay = getReconnectDelay(reconnectAttempt);
          }

          connLog(`Reconectando em ${(delay / 1000).toFixed(0)}s... (tentativa ${reconnectAttempt + 1})`);
          reconnectAttempt++;
          setTimeout(connect, delay);
        } else {
          connLog("❌ Sessão deslogada pelo WhatsApp. É necessário parear novamente via QR Code.");
          clearState(); // Limpa as chaves automaticamente do banco de dados
          connLog("A sessão antiga foi excluída automaticamente do banco de dados. Reinicie o bot para gerar um novo QR Code: pm2 restart gabot");
        }
      }
    });

    client.ev.on("messages.upsert", async ({ messages, type }) => {
      if (!ready) return;
      if (type !== "notify" && type !== "append") return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const chatId = msg.key.remoteJid ?? "";
        const isGroup = chatId.endsWith("@g.us");

        if (isGroup && chatId !== BOT_CONFIG.adminGroupId) {
          const messageTimestamp = typeof msg.messageTimestamp === "number"
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp);
          const nowSeconds = Math.floor(Date.now() / 1000);
          const MESSAGE_AGE_LIMIT_SECONDS = 60;

          if (nowSeconds - messageTimestamp > MESSAGE_AGE_LIMIT_SECONDS) {
            console.warn(
              `[AVISO] Mensagem antiga ignorada (grupo ${chatId}, atraso de ${nowSeconds - messageTimestamp}s)`
            );
            continue;
          }
        }

        const isBroadcast = chatId.endsWith("@broadcast");
        const isNewsletter = chatId.endsWith("@newsletter");
        const isMonitoredChannel = isGroup || isNewsletter;
        const isPrivate = !isGroup && !isBroadcast && !isNewsletter;

        const text = extractMessageText(msg.message).trim();
        if (!text) continue;

        try {
          if (isPrivate) {
            const senderName = msg.pushName || "Desconhecido";
            privateUserNameCache.set(chatId, senderName);

            await logUserMessage(logsUsersDir, {
              userId: chatId,
              userName: senderName,
              direction: "in",
              context: "private_message",
              messageType: detectMessageType(msg.message),
              text,
            });

            const sendPrivateReply = async (targetChatId, messageText) => {
              await client.sendMessage(targetChatId, { text: messageText });
              await logUserMessage(logsUsersDir, {
                userId: targetChatId,
                userName: privateUserNameCache.get(targetChatId) ?? senderName,
                direction: "out",
                context: "command_reply",
                messageType: "text",
                text: messageText,
              });
            };

            const resolveInviteGroupName = async (inviteCode) => {
              try {
                const info = await client.groupGetInviteInfo(inviteCode);
                return info?.subject || null;
              } catch {
                return null;
              }
            };

            const notifyAdminSuggestion = async ({
              suggestionId,
              userId,
              userName,
              groupLink,
              groupName,
              suggestionText,
              suggestionType,
            }) => {
              if (!BOT_CONFIG.adminGroupId) {
                console.log(
                  "BOT_ADMIN_GROUP_ID nao configurado. Sugestao salva sem notificacao ao admin.",
                );
                return;
              }

              let message;
              if (suggestionType === "general") {
                message = [
                  "💡 Nova sugestao geral",
                  `ID: s${suggestionId}`,
                  `Usuario: ${userName || "Desconhecido"}`,
                  `Contato: ${userId}`,
                  "",
                  `Sugestao: ${suggestionText}`,
                  "",
                  "Use: ok s" + suggestionId + " ou no s" + suggestionId,
                ].join("\n");
              } else {
                message = [
                  "🔗 Nova sugestao de grupo",
                  `ID: g${suggestionId}`,
                  `Usuario: ${userName || "Desconhecido"}`,
                  `Contato: ${userId}`,
                  `Nome do grupo: ${groupName || "Nao identificado"}`,
                  `Link: ${groupLink}`,
                  "",
                  "Use: ok g" + suggestionId + " ou no g" + suggestionId,
                ].join("\n");
              }

              await client.sendMessage(BOT_CONFIG.adminGroupId, {
                text: message,
              });
            };

            await handlePrivateCommand({
              client,
              repo,
              chatId,
              name: senderName,
              text,
              sendPrivateReply,
              resolveInviteGroupName,
              notifyAdminSuggestion,
              handleUnmappedPrivateMessage,
              handleAdminCommand: async (payload) => {
                const { handleAdminCommand } =
                  await import("./adminCommands.js");
                return handleAdminCommand(payload);
              },
            });
            continue;
          }

          if (!isMonitoredChannel) continue;

          const senderName = msg.pushName || "Desconhecido";
          const authorId = msg.key.participant || chatId;

          let groupName = groupNameCache.get(chatId) ?? chatId;
          if (!groupNameCache.has(chatId)) {
            try {
              if (isGroup) {
                const groupMeta = await client.groupMetadata(chatId);
                groupName = groupMeta.subject || chatId;
              } else {
                groupName = msg.pushName || chatId;
              }
              groupNameCache.set(chatId, groupName);
            } catch {
              groupName = chatId;
            }
          }

          await logGroupMessage(logsGroupsDir, {
            groupId: chatId,
            groupName,
            author: authorId,
            authorName: senderName,
            messageType: detectMessageType(msg.message),
            text,
          });

          // Processa comandos admin se for o grupo admin configurado
          if (BOT_CONFIG.adminGroupId && chatId === BOT_CONFIG.adminGroupId) {
            const textLower = text.toLowerCase().trim();
            console.log(`[ADMIN DEBUG] Mensagem no grupo admin: "${text}"`);
            console.log(
              `[ADMIN DEBUG] Admin Group ID configurado: ${BOT_CONFIG.adminGroupId}`,
            );
            console.log(`[ADMIN DEBUG] Chat ID atual: ${chatId}`);
            console.log(
              `[ADMIN DEBUG] IDs são iguais: ${chatId === BOT_CONFIG.adminGroupId}`,
            );

            const isAdminCommand =
              textLower.startsWith("/adm") ||
              textLower.startsWith("/admin") ||
              /^adm[0-9a-z]/.test(textLower) ||
              /^ok\s+/.test(textLower) ||
              /^no\s+/.test(textLower) ||
              textLower === "stats" ||
              textLower === "ia" ||
              textLower.startsWith("ia ") ||
              textLower === "sys" ||
              textLower.startsWith("sys ") ||
              textLower === "terminal" ||
              textLower.startsWith("terminal ") ||
              textLower === "logs" ||
              textLower === "gruposbot" ||
              textLower.startsWith(".");

            if (isAdminCommand) {
              console.log(
                `[ADMIN DEBUG] Comando admin detectado: "${textLower}"`,
              );
              const { handleAdminCommand } = await import("./adminCommands.js");
              await handleAdminCommand({
                client,
                repo,
                chatId,
                text,
              });
              console.log(`[ADMIN DEBUG] Comando admin processado com sucesso`);
              continue;
            } else {
              console.log(`[ADMIN DEBUG] Mensagem não é comando admin`);
            }
          } else if (BOT_CONFIG.adminGroupId) {
            console.log(
              `[ADMIN DEBUG] Mensagem em grupo diferente do admin (${chatId} !== ${BOT_CONFIG.adminGroupId})`,
            );
          } else {
            console.log(`[ADMIN DEBUG] BOT_ADMIN_GROUP_ID não configurado`);
          }

          // Extrair cupons da mensagem (com suporte a IA)
          const extractionResult = await extractCoupons(text, groupName);
          const {
            coupons,
            isExhausted,
            source,
            aiStore,
            summaryWithAI,
            summaryWithoutAI,
            telemetry,
          } = extractionResult;

          const detectedStore = detectStoreFromText(text, groupName, aiStore);

          if (coupons.length > 0) {
            console.log(
              `[Cupom] Método de extração: ${source}${aiStore ? ` | Loja (IA): ${aiStore}` : ""}`,
            );
            if (summaryWithAI) {
              console.log(`[Cupom] ${summaryWithAI}`);
            }
            if (summaryWithoutAI) {
              console.log(`[Cupom] ${summaryWithoutAI}`);
            }

            const allCouponInterests = repo.listAllCouponInterests();
            const contextNormalized = normalizeText(`${groupName} ${text}`);
            const normalizedDetectedStore = normalizeText(detectedStore);

            for (const couponItem of coupons) {
              const result = repo.upsertCoupon({
                code: couponItem.code,
                groupId: chatId,
                groupName,
                messageText: text.substring(0, 500),
                isExhausted,
              });

              // Dispara somente quando o cupom eh novo globalmente e ainda ativo
              if (!result.isNewGlobal || isExhausted) {
                continue;
              }

              repo.incrementCouponStoreMetric(detectedStore, "detected", 1);

              const interestedUsers = allCouponInterests.filter((interest) => {
                const byContext = contextNormalized.includes(
                  interest.store_normalized,
                );
                const byDetectedStore =
                  normalizedDetectedStore !== "loja nao identificada" &&
                  interest.store_normalized === normalizedDetectedStore;
                return byContext || byDetectedStore;
              });

              if (interestedUsers.length > 0) {
                repo.incrementCouponStoreMetric(detectedStore, "matched", 1);
              }

              for (const interest of interestedUsers) {
                const couponAlert = buildCouponAlertMessage({
                  couponItem,
                  groupName,
                  detectedStore,
                  interestStoreName: interest.store_name,
                  alertMode: interest.alert_mode,
                });

                dispatchQueue.enqueue({
                  chatId: interest.user_id,
                  text: couponAlert,
                  context: "coupon_alert",
                });
              }
            }

            console.log(
              `Cupons detectados em ${groupName}: ${coupons
                .map((c) => `${c.code}(${c.confidence}%)`)
                .join(", ")} ${isExhausted ? "(esgotado)" : ""}`,
            );
          } else if (telemetry?.isFalsePositive) {
            repo.incrementCouponStoreMetric(detectedStore, "false_positive", 1);
          }

          const normalizedOfferText = normalizeText(text);
          if (!normalizedOfferText) continue;

          const hashId = createOfferHash(text);
          const isNewOffer = repo.markOfferAsProcessed(hashId);
          if (!isNewOffer) continue;

          const allKeywords = repo.listAllKeywords();
          const matches = findMatches(normalizedOfferText, allKeywords, text);
          if (matches.size === 0) continue;

          for (const [userId, terms] of matches.entries()) {
            const uniqueTerms = [
              ...new Set(
                terms.map((entry) => {
                  if (
                    Number.isFinite(entry.maxPriceCents) &&
                    entry.maxPriceCents > 0
                  ) {
                    return `${entry.term} (<= ${formatCurrencyBRL(entry.maxPriceCents)})`;
                  }
                  return entry.term;
                }),
              ),
            ];

            const offerPriceCents = terms.find((entry) =>
              Number.isFinite(entry.offerPriceCents),
            )?.offerPriceCents;
            const alertText = [
              "Oferta encontrada!",
              `Filtros: ${uniqueTerms.join(", ")}`,
              offerPriceCents
                ? `Preco detectado: ${formatCurrencyBRL(offerPriceCents)}`
                : null,
              `De: ${senderName}`,
              `Grupo: ${groupName}`,
              "",
              text,
            ]
              .filter(Boolean)
              .join("\n");

            dispatchQueue.enqueue({
              chatId: userId,
              text: alertText,
              context: "offer_alert",
            });
          }
        } catch (error) {
          console.error("Erro ao processar mensagem:", error.message);
        }
      }
    });
  };

  await connect();

  // Retorna o cliente para uso externo (notificações de shutdown, etc)
  return new Promise((resolve) => {
    const checkReady = setInterval(() => {
      if (ready && client) {
        clearInterval(checkReady);
        resolve(client);
      }
    }, 100);

    // Timeout de 30s (aumentado de 30s para dar tempo ao pairing code)
    setTimeout(() => {
      clearInterval(checkReady);
      resolve(client);
    }, 30000);
  });
}
