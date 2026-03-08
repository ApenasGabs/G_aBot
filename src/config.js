import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

export const PATHS = {
  root: ROOT_DIR,
  authDir: path.join(ROOT_DIR, "auth_info"),
  dataDir: path.join(ROOT_DIR, "data"),
  logsDir: path.join(ROOT_DIR, "data", "logs"),
  logsGroupsDir: path.join(ROOT_DIR, "data", "logs", "groups"),
  logsUsersDir: path.join(ROOT_DIR, "data", "logs", "users"),
  backupsDir: path.join(ROOT_DIR, "data", "backups"),
  dbPath: path.join(ROOT_DIR, "data", "bot.db"),
};

export const BOT_CONFIG = {
  dispatchIntervalMs: 1300,
  browserIdentity: ["G_aBot", "Chrome", "1.0.0"],
  adminGroupId: process.env.BOT_ADMIN_GROUP_ID || "",
};

export const BACKUP_CONFIG = {
  intervalMs: 24 * 60 * 60 * 1000,
  maxFiles: 30,
};
