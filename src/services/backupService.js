import { copyFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

function createBackupFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");

  return `bot-${stamp}.db`;
}

async function cleanupOldBackups(backupsDir, maxFiles) {
  const files = await readdir(backupsDir);
  const backupFiles = files
    .filter((name) => name.startsWith("bot-") && name.endsWith(".db"))
    .sort();

  if (backupFiles.length <= maxFiles) return;

  const filesToDelete = backupFiles.slice(0, backupFiles.length - maxFiles);
  await Promise.all(
    filesToDelete.map(async (name) => {
      const filePath = path.join(backupsDir, name);
      await unlink(filePath);
    })
  );
}

export async function runBackup({ dbPath, backupsDir, maxFiles }) {
  try {
    const filename = createBackupFilename();
    const targetPath = path.join(backupsDir, filename);

    await copyFile(dbPath, targetPath);
    await cleanupOldBackups(backupsDir, maxFiles);

    console.log(`Backup criado: ${filename}`);
  } catch (error) {
    console.error("Falha ao criar backup:", error.message);
  }
}

export function startBackupScheduler({
  dbPath,
  backupsDir,
  intervalMs,
  maxFiles,
  cleanupProcessedOffers,
  processedOffersTtlDays = 7,
}) {
  const run = async () => {
    await runBackup({ dbPath, backupsDir, maxFiles });

    if (typeof cleanupProcessedOffers === "function") {
      const removed = cleanupProcessedOffers(processedOffersTtlDays);
      if (removed > 0) {
        console.log(`Cleanup processed_offers: ${removed} registros removidos.`);
      }
    }
  };

  run().catch((error) => {
    console.error("Falha no backup inicial:", error.message);
  });

  const timer = setInterval(() => {
    run().catch((error) => {
      console.error("Falha no backup agendado:", error.message);
    });
  }, intervalMs);

  return () => clearInterval(timer);
}
