import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { initWhatsappBot } from "./src/bot/whatsapp.js";
import { BACKUP_CONFIG, BOT_CONFIG, PATHS } from "./src/config.js";
import { createRepo } from "./src/db/repo.js";
import { setupDatabase } from "./src/db/schema.js";
import { getAIConfig, isAIEnabled } from "./src/services/aiCouponParser.js";
import { startBackupScheduler } from "./src/services/backupService.js";
import { ensureOllamaOnline, getOllamaInstanceStatus } from "./src/services/ollamaManager.js";

let wppClient = null;

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
