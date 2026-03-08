import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, "auth_info");
const DATA_DIR = path.join(__dirname, "data");
const LOGS_DIR = path.join(DATA_DIR, "logs");
const DB_PATH = path.join(DATA_DIR, "bot.db");
const DISPATCH_INTERVAL_MS = 1300;

let wppClient = null;
let wppReady = false;

function extractMessageText(message) {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
    ""
  );
}

function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createOfferHash(text) {
  return createHash("md5").update(text).digest("hex");
}

function createDispatchQueue(sendFn, intervalMs) {
  const queue = [];
  let isProcessing = false;

  const run = async () => {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      const item = queue.shift();
      try {
        await sendFn(item);
      } catch (error) {
        console.error("Erro ao enviar mensagem da fila:", error.message);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    isProcessing = false;
  };

  return {
    enqueue(item) {
      queue.push(item);
      run().catch((error) => {
        console.error("Erro inesperado na fila:", error.message);
      });
    },
  };
}

async function logMessage(groupId, msgData) {
  try {
    // Sanitizar o groupId para nome de arquivo seguro
    const safeGroupId = groupId.replace(/[^a-zA-Z0-9@._-]/g, "_");
    const logFilePath = path.join(LOGS_DIR, `${safeGroupId}.jsonl`);
    
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      groupId: msgData.groupId,
      groupName: msgData.groupName,
      author: msgData.author,
      authorName: msgData.authorName,
      messageType: msgData.messageType,
      text: msgData.text,
    }) + "\n";
    
    await appendFile(logFilePath, logEntry, "utf8");
  } catch (error) {
    console.error("Erro ao salvar log de mensagem:", error.message);
  }
}

function setupDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      term TEXT NOT NULL,
      term_normalized TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(chat_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_user_term
    ON keywords(user_id, term_normalized);

    CREATE TABLE IF NOT EXISTS processed_offers (
      hash_id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function createRepo(db) {
  const upsertUserStmt = db.prepare(`
    INSERT INTO users (chat_id, name, is_active)
    VALUES (?, ?, 1)
    ON CONFLICT(chat_id) DO UPDATE SET
      name = excluded.name,
      is_active = 1
  `);

  const addKeywordStmt = db.prepare(`
    INSERT INTO keywords (user_id, term, term_normalized)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, term_normalized) DO NOTHING
  `);

  const removeKeywordStmt = db.prepare(`
    DELETE FROM keywords
    WHERE user_id = ? AND term_normalized = ?
  `);

  const listKeywordsStmt = db.prepare(`
    SELECT term FROM keywords
    WHERE user_id = ?
    ORDER BY term COLLATE NOCASE
  `);

  const listAllKeywordsStmt = db.prepare(`
    SELECT k.user_id, k.term, k.term_normalized
    FROM keywords k
    INNER JOIN users u ON u.chat_id = k.user_id
    WHERE u.is_active = 1
  `);

  const insertProcessedOfferStmt = db.prepare(`
    INSERT INTO processed_offers (hash_id)
    VALUES (?)
    ON CONFLICT(hash_id) DO NOTHING
  `);

  return {
    upsertUser(chatId, name) {
      upsertUserStmt.run(chatId, name || null);
    },
    addKeyword(chatId, term) {
      const normalized = normalizeText(term);
      const result = addKeywordStmt.run(chatId, term.trim(), normalized);
      return result.changes > 0;
    },
    removeKeyword(chatId, term) {
      const result = removeKeywordStmt.run(chatId, normalizeText(term));
      return result.changes > 0;
    },
    listKeywords(chatId) {
      return listKeywordsStmt.all(chatId);
    },
    listAllKeywords() {
      return listAllKeywordsStmt.all();
    },
    markOfferAsProcessed(hashId) {
      const result = insertProcessedOfferStmt.run(hashId);
      return result.changes > 0;
    },
  };
}

function parseCommand(text) {
  if (!text.startsWith("/")) return null;

  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  return {
    command: rawCommand.toLowerCase(),
    argsText: rest.join(" ").trim(),
  };
}

async function sendHelp(chatId) {
  const help = [
    "Menu de comandos:",
    "/ ou /menu ou /ajuda - mostra este menu",
    "/cadastro - ativa seu cadastro para receber alertas",
    "/add [termo] - adiciona um filtro",
    "/remover [termo] - remove um filtro",
    "/meusfiltros - lista seus filtros",
  ].join("\n");

  await wppClient.sendMessage(chatId, { text: help });
}

async function handlePrivateCommand(repo, chatId, name, text) {
  const parsed = parseCommand(text);
  if (!parsed) return;

  const { command, argsText } = parsed;

  if (command === "/" || command === "/menu" || command === "/ajuda") {
    await sendHelp(chatId);
    return;
  }

  if (command === "/cadastro") {
    repo.upsertUser(chatId, name);
    await wppClient.sendMessage(chatId, {
      text: "Cadastro concluido. Agora use /add [termo] para monitorar ofertas.",
    });
    return;
  }

  if (command === "/add") {
    if (!argsText) {
      await wppClient.sendMessage(chatId, {
        text: "Uso correto: /add [termo]",
      });
      return;
    }

    repo.upsertUser(chatId, name);
    const inserted = repo.addKeyword(chatId, argsText);
    await wppClient.sendMessage(chatId, {
      text: inserted
        ? `Filtro adicionado: ${argsText}`
        : `Esse filtro ja existe: ${argsText}`,
    });
    return;
  }

  if (command === "/remover") {
    if (!argsText) {
      await wppClient.sendMessage(chatId, {
        text: "Uso correto: /remover [termo]",
      });
      return;
    }

    const removed = repo.removeKeyword(chatId, argsText);
    await wppClient.sendMessage(chatId, {
      text: removed
        ? `Filtro removido: ${argsText}`
        : `Nao encontrei esse filtro: ${argsText}`,
    });
    return;
  }

  if (
    command === "/meusfiltros" ||
    command === "/filtros" ||
    command === "/meuscadastros"
  ) {
    const keywords = repo.listKeywords(chatId);
    if (keywords.length === 0) {
      await wppClient.sendMessage(chatId, {
        text: "Voce ainda nao tem filtros cadastrados. Use /add [termo].",
      });
      return;
    }

    const lines = keywords.map(({ term }) => `- ${term}`);
    await wppClient.sendMessage(chatId, {
      text: `Seus filtros:\n${lines.join("\n")}`,
    });
    return;
  }

  await sendHelp(chatId);
}

function findMatches(normalizedOfferText, allKeywords) {
  const matched = new Map();

  for (const row of allKeywords) {
    if (!row.term_normalized) continue;
    if (!normalizedOfferText.includes(row.term_normalized)) continue;

    const existing = matched.get(row.user_id);
    if (existing) {
      existing.push(row.term);
    } else {
      matched.set(row.user_id, [row.term]);
    }
  }

  return matched;
}

async function initWpp(repo) {
  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  wppClient = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    browser: ["G_aBot", "Chrome", "1.0.0"],
  });

  const dispatchQueue = createDispatchQueue(async (job) => {
    await wppClient.sendMessage(job.chatId, { text: job.text });
    console.log(`Alerta enviado para ${job.chatId}`);
  }, DISPATCH_INTERVAL_MS);

  wppClient.ev.on("creds.update", saveCreds);

  wppClient.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("Escaneie o QR code com seu WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      wppReady = true;
      console.log("WhatsApp conectado. Bot em execucao.");
    }

    if (connection === "close") {
      wppReady = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Conexao encerrada.");

      if (shouldReconnect) {
        console.log("Tentando reconectar em 5s...");
        setTimeout(() => {
          initWpp(repo).catch((error) => {
            console.error("Erro na reconexao:", error.message);
          });
        }, 5000);
      } else {
        console.log("Sessao deslogada. Escaneie o QR novamente.");
      }
    }
  });

  wppClient.ev.on("messages.upsert", async ({ messages, type }) => {
    if (!wppReady || type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const chatId = msg.key.remoteJid ?? "";
      const isGroup = chatId.endsWith("@g.us");
      const isBroadcast = chatId.endsWith("@broadcast");
      const isNewsletter = chatId.endsWith("@newsletter");
      // Any non-group, non-broadcast, non-newsletter chat is treated as private.
      const isPrivate = !isGroup && !isBroadcast && !isNewsletter;
      const text = extractMessageText(msg.message).trim();

      if (!text) continue;

      try {
        if (isPrivate) {
          await handlePrivateCommand(repo, chatId, msg.pushName, text);
          continue;
        }

        if (!isGroup) continue;

        // Coletar dados da mensagem para análise futura
        const senderName = msg.pushName || "Desconhecido";
        const authorId = msg.key.participant || chatId;
        
        // Buscar nome do grupo (usa cache se já buscou antes)
        let groupName = chatId;
        try {
          const groupMeta = await wppClient.groupMetadata(chatId);
          groupName = groupMeta.subject || chatId;
        } catch (err) {
          // Se falhar, usa o chatId mesmo
        }

        // Identificar tipo de mensagem
        let messageType = "text";
        if (msg.message.imageMessage) messageType = "image";
        else if (msg.message.videoMessage) messageType = "video";
        else if (msg.message.documentMessage) messageType = "document";
        else if (msg.message.audioMessage) messageType = "audio";
        else if (msg.message.stickerMessage) messageType = "sticker";

        // Salvar log da mensagem
        await logMessage(chatId, {
          groupId: chatId,
          groupName: groupName,
          author: authorId,
          authorName: senderName,
          messageType: messageType,
          text: text,
        });

        const normalizedOfferText = normalizeText(text);
        if (!normalizedOfferText) continue;

        const hashId = createOfferHash(normalizedOfferText);
        const isNewOffer = repo.markOfferAsProcessed(hashId);
        if (!isNewOffer) {
          continue;
        }

        const allKeywords = repo.listAllKeywords();
        const matches = findMatches(normalizedOfferText, allKeywords);
        if (matches.size === 0) {
          continue;
        }

        // Usar os dados já coletados para a mensagem de alerta
        for (const [userId, terms] of matches.entries()) {
          const uniqueTerms = [...new Set(terms)];
          const alertText = [
            "✅ Oferta encontrada!",
            `Filtros: ${uniqueTerms.join(", ")}`,
            `De: ${senderName}`,
            `Grupo: ${groupName}`,
            "",
            text,
          ].join("\n");

          dispatchQueue.enqueue({ chatId: userId, text: alertText });
        }
      } catch (error) {
        console.error("Erro ao processar mensagem:", error.message);
      }
    }
  });
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(LOGS_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  setupDatabase(db);

  const repo = createRepo(db);
  await initWpp(repo);
}

main().catch((error) => {
  console.error("Erro fatal:", error.message);
  process.exit(1);
});
