import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { initWhatsappBot } from "./src/bot/whatsapp.js";
import { BACKUP_CONFIG, BOT_CONFIG, PATHS } from "./src/config.js";
import { createRepo } from "./src/db/repo.js";
import { setupDatabase } from "./src/db/schema.js";
import { getAIConfig, isAIEnabled } from "./src/services/aiCouponParser.js";
import { startBackupScheduler } from "./src/services/backupService.js";
import { ensureOllamaOnline, getOllamaInstanceStatus } from "./src/services/ollamaManager.js";
import { syncFromSupabaseOnBoot } from "./src/services/supabaseSync.js";

const BAILEYS_JSON_ERROR_PATTERN = "Unexpected non-whitespace character after JSON";
const ERROR_STACK_MAX_LENGTH = 500;

let wppClient = null;

/**
 * Envia notificacao de erro critico ao grupo admin via WhatsApp
 *
 * @param {string} origin - Origem do erro (ex: "uncaughtException")
 * @param {Error | unknown} error - O erro capturado
 */
const notifyAdminError = (origin, error) => {
  if (!wppClient || !BOT_CONFIG.adminGroupId) return;

  const timestamp = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error && error.stack
    ? error.stack.substring(0, ERROR_STACK_MAX_LENGTH)
    : "Stack indisponivel";

  const text = [
    `[ERRO CRITICO] ${origin}`,
    `Horario: ${timestamp}`,
    `Mensagem: ${errorMessage}`,
    "",
    `Stack:\n${errorStack}`,
  ].join("\n");

  wppClient
    .sendMessage(BOT_CONFIG.adminGroupId, { text })
    .catch((sendError) => {
      console.error("Falha ao notificar grupo admin sobre erro critico:", sendError.message);
    });
};

process.on("uncaughtException", (error) => {
  if (error instanceof SyntaxError && error.message.includes(BAILEYS_JSON_ERROR_PATTERN)) {
    console.warn("[AVISO] No offline ignorado (JSON malformado do Baileys):", error.message);
    return;
  }
  console.error("[uncaughtException]", error);
  notifyAdminError("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes(BAILEYS_JSON_ERROR_PATTERN)) {
    console.warn("[AVISO] Rejeicao de no offline ignorada (JSON malformado do Baileys):", message);
    return;
  }
  console.error("[unhandledRejection]", reason);
  notifyAdminError("unhandledRejection", reason);
});

async function notifyShutdown() {
  if (wppClient && BOT_CONFIG.adminGroupId) {
    try {
      const timestamp = new Date().toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo' 
      });
      await wppClient.sendMessage(BOT_CONFIG.adminGroupId, {
        text: `🔄 Bot reiniciando...\nHorário: ${timestamp}`
      });
      console.log("Notificação de reinício enviada ao grupo admin");
      // Aguarda 1s para garantir envio
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log("Erro ao enviar notificação de reinício:", error.message);
    }
  }
}

async function main() {
  await mkdir(PATHS.dataDir, { recursive: true });
  await mkdir(PATHS.logsDir, { recursive: true });
  await mkdir(PATHS.logsGroupsDir, { recursive: true });
  await mkdir(PATHS.logsUsersDir, { recursive: true });
  await mkdir(PATHS.backupsDir, { recursive: true });

  const db = new Database(PATHS.dbPath);
  db.pragma("journal_mode = WAL");
  setupDatabase(db);

  const repo = createRepo(db);
  await syncFromSupabaseOnBoot(repo);
  const normalizedStats = repo.normalizeStoredKeywords();
  if (normalizedStats.removedDuplicates > 0) {
    console.log(
      `Normalizacao de filtros concluida: ${normalizedStats.updated} atualizados, ${normalizedStats.removedDuplicates} duplicados removidos.`
    );
  }

  startBackupScheduler({
    dbPath: PATHS.dbPath,
    backupsDir: PATHS.backupsDir,
    intervalMs: BACKUP_CONFIG.intervalMs,
    maxFiles: BACKUP_CONFIG.maxFiles,
    cleanupProcessedOffers: (maxAgeDays) => repo.cleanupProcessedOffers(maxAgeDays),
    processedOffersTtlDays: BACKUP_CONFIG.processedOffersTtlDays,
  });

  if (isAIEnabled()) {
    const aiConfig = getAIConfig();
    console.log(`[AI Startup] Parser IA habilitado. Base URL: ${aiConfig.baseUrl}`);

    if (BOT_CONFIG.ollamaAutoStart) {
      const ensured = await ensureOllamaOnline(BOT_CONFIG.ollamaDefaultInstance);
      if (ensured.ok) {
        console.log(`[AI Startup] ${ensured.message} (${ensured.instanceName})`);
      } else {
        console.log(`[AI Startup] Falha ao iniciar instancia ${ensured.instanceName}: ${ensured.message}`);
      }
    } else {
      const status = await getOllamaInstanceStatus(BOT_CONFIG.ollamaDefaultInstance);
      if (status.online) {
        console.log(`[AI Startup] Instancia ${status.instanceName} online com ${status.modelCount || 0} modelo(s).`);
      } else {
        console.log(`[AI Startup] Instancia ${status.instanceName} offline e OLLAMA_AUTO_START=false.`);
      }
    }
  }

  wppClient = await initWhatsappBot({
    repo,
    authDir: PATHS.authDir,
    logsGroupsDir: PATHS.logsGroupsDir,
    logsUsersDir: PATHS.logsUsersDir,
  });
}

// Handlers para encerramento gracioso
process.on('SIGINT', async () => {
  console.log('\nSIGINT recebido, encerrando...');
  await notifyShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nSIGTERM recebido, encerrando...');
  await notifyShutdown();
  process.exit(0);
});

main().catch((error) => {
  console.error("Erro fatal:", error.message);
  process.exit(1);
});
