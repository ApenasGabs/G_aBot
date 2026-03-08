import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { BOT_CONFIG } from "../config.js";
import { detectStoreFromText, extractCoupons } from "../services/couponExtractor.js";
import { logGroupMessage, logUserMessage } from "../services/messageLogger.js";
import { createDispatchQueue } from "../utils/queue.js";
import {
  createOfferHash,
  detectMessageType,
  extractMessageText,
  normalizeText,
} from "../utils/text.js";
import { handlePrivateCommand } from "./commands.js";
import { findMatches } from "./matching.js";
import { handleUnmappedPrivateMessage } from "./unmappedMessageHandler.js";

export async function initWhatsappBot({
  repo,
  authDir,
  logsGroupsDir,
  logsUsersDir,
}) {
  let client = null;
  let ready = false;
  const groupNameCache = new Map();
  const privateUserNameCache = new Map();

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const connect = () => {
    client = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: BOT_CONFIG.browserIdentity,
    });

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

      if (qr) {
        console.log("Escaneie o QR code com seu WhatsApp:");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        ready = true;
        console.log("WhatsApp conectado. Bot em execucao.");
        
        // Notifica grupo admin que o bot iniciou
        if (BOT_CONFIG.adminGroupId) {
          setTimeout(async () => {
            try {
              const timestamp = new Date().toLocaleString('pt-BR', { 
                timeZone: 'America/Sao_Paulo' 
              });
              await client.sendMessage(BOT_CONFIG.adminGroupId, {
                text: `✅ Bot online\nHorário: ${timestamp}\nVersão: gabot-ofertas v0.0.1`
              });
            } catch (error) {
              console.log("Erro ao enviar notificação de inicialização:", error.message);
            }
          }, 3000); // Aguarda 3s para garantir que está pronto
        }
      }

      if (connection === "close") {
        ready = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log("Conexao encerrada.");

        // Notifica grupo admin sobre desconexão
        if (BOT_CONFIG.adminGroupId && !shouldReconnect) {
          try {
            const timestamp = new Date().toLocaleString('pt-BR', { 
              timeZone: 'America/Sao_Paulo' 
            });
            await client.sendMessage(BOT_CONFIG.adminGroupId, {
              text: `⚠️ Bot desconectado (logout)\nHorário: ${timestamp}`
            });
          } catch (error) {
            console.log("Erro ao enviar notificação de desconexão:", error.message);
          }
        }

        if (shouldReconnect) {
          console.log("Tentando reconectar em 5s...");
          setTimeout(connect, 5000);
        } else {
          console.log("Sessao deslogada. Escaneie o QR novamente.");
        }
      }
    });

    client.ev.on("messages.upsert", async ({ messages, type }) => {
      if (!ready || type !== "notify") return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const chatId = msg.key.remoteJid ?? "";
        const isGroup = chatId.endsWith("@g.us");
        const isBroadcast = chatId.endsWith("@broadcast");
        const isNewsletter = chatId.endsWith("@newsletter");
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
                  "BOT_ADMIN_GROUP_ID nao configurado. Sugestao salva sem notificacao ao admin."
                );
                return;
              }

              let message;
              if (suggestionType === 'general') {
                message = [
                  "💡 Nova sugestao geral",
                  `ID: s${suggestionId}`,
                  `Usuario: ${userName || "Desconhecido"}`,
                  `Contato: ${userId}`,
                  "",
                  `Sugestao: ${suggestionText}`,
                  "",
                  "Use: adm5 s" + suggestionId + " ou adm6 s" + suggestionId,
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
                  "Use: adm5 g" + suggestionId + " ou adm6 g" + suggestionId,
                ].join("\n");
              }

              await client.sendMessage(BOT_CONFIG.adminGroupId, { text: message });
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
            });
            continue;
          }

          if (!isGroup) continue;

          const senderName = msg.pushName || "Desconhecido";
          const authorId = msg.key.participant || chatId;

          let groupName = groupNameCache.get(chatId) ?? chatId;
          if (!groupNameCache.has(chatId)) {
            try {
              const groupMeta = await client.groupMetadata(chatId);
              groupName = groupMeta.subject || chatId;
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
            console.log(`[ADMIN DEBUG] Admin Group ID configurado: ${BOT_CONFIG.adminGroupId}`);
            console.log(`[ADMIN DEBUG] Chat ID atual: ${chatId}`);
            console.log(`[ADMIN DEBUG] IDs são iguais: ${chatId === BOT_CONFIG.adminGroupId}`);
            
            const isAdminCommand =
              textLower.startsWith("/adm") ||
              textLower.startsWith("/admin") ||
              /^adm[0-9a-z]/.test(textLower);

            if (isAdminCommand) {
              console.log(`[ADMIN DEBUG] Comando admin detectado: "${textLower}"`);
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
            console.log(`[ADMIN DEBUG] Mensagem em grupo diferente do admin (${chatId} !== ${BOT_CONFIG.adminGroupId})`);
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
          } = extractionResult;
          
          if (coupons.length > 0) {
            console.log(`[Cupom] Método de extração: ${source}${aiStore ? ` | Loja (IA): ${aiStore}` : ''}`);
            if (summaryWithAI) {
              console.log(`[Cupom] ${summaryWithAI}`);
            }
            if (summaryWithoutAI) {
              console.log(`[Cupom] ${summaryWithoutAI}`);
            }
            
            const allCouponInterests = repo.listAllCouponInterests();
            const contextNormalized = normalizeText(`${groupName} ${text}`);
            const detectedStore = detectStoreFromText(text, groupName, aiStore);
            const normalizedDetectedStore = normalizeText(detectedStore);

            for (const couponItem of coupons) {
              const result = repo.upsertCoupon({
                code: couponItem.code,
                groupId: chatId,
                groupName,
                messageText: text.substring(0, 500),
                isExhausted,
              });

              // Dispara somente quando o cupom eh novo e ainda ativo
              if (!result.isNew || isExhausted) {
                continue;
              }

              const interestedUsers = allCouponInterests.filter((interest) => {
                const byContext = contextNormalized.includes(interest.store_normalized);
                const byDetectedStore =
                  normalizedDetectedStore !== "loja nao identificada" &&
                  interest.store_normalized === normalizedDetectedStore;
                return byContext || byDetectedStore;
              });

              for (const interest of interestedUsers) {
                const couponAlert = [
                  "Novo cupom detectado!",
                  `Loja: ${detectedStore}`,
                  `Codigo: ${couponItem.code}`,
                  `Grupo: ${groupName}`,
                  `Confianca: ${couponItem.confidence}%`,
                ].join("\n");

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
                .join(", ")} ${isExhausted ? "(esgotado)" : ""}`
            );
          }

          const normalizedOfferText = normalizeText(text);
          if (!normalizedOfferText) continue;

          const hashId = createOfferHash(normalizedOfferText);
          const isNewOffer = repo.markOfferAsProcessed(hashId);
          if (!isNewOffer) continue;

          const allKeywords = repo.listAllKeywords();
          const matches = findMatches(normalizedOfferText, allKeywords);
          if (matches.size === 0) continue;

          for (const [userId, terms] of matches.entries()) {
            const uniqueTerms = [...new Set(terms)];
            const alertText = [
              "Oferta encontrada!",
              `Filtros: ${uniqueTerms.join(", ")}`,
              `De: ${senderName}`,
              `Grupo: ${groupName}`,
              "",
              text,
            ].join("\n");

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

  connect();
  
  // Retorna o cliente para uso externo (notificações de shutdown, etc)
  return new Promise((resolve) => {
    const checkReady = setInterval(() => {
      if (ready && client) {
        clearInterval(checkReady);
        resolve(client);
      }
    }, 100);
    
    // Timeout de 30s, retorna mesmo se não estiver pronto
    setTimeout(() => {
      clearInterval(checkReady);
      resolve(client);
    }, 30000);
  });
}
