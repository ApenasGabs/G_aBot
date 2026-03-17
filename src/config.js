import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

function buildOllamaInstances() {
  const defaultBaseUrl = process.env.COUPON_AI_BASE_URL || "http://localhost:11434";

  const defaultInstances = {
    local: {
      baseUrl: defaultBaseUrl,
      startCommand:
        process.env.OLLAMA_LOCAL_START_COMMAND ||
        "(systemctl start ollama >/dev/null 2>&1 || nohup ollama serve >/tmp/ollama-serve.log 2>&1 &)",
      stopCommand:
        process.env.OLLAMA_LOCAL_STOP_COMMAND ||
        "(systemctl stop ollama >/dev/null 2>&1 || pkill -f 'ollama serve')",
      restartCommand:
        process.env.OLLAMA_LOCAL_RESTART_COMMAND ||
        "(systemctl restart ollama >/dev/null 2>&1 || (pkill -f 'ollama serve'; nohup ollama serve >/tmp/ollama-serve.log 2>&1 &))",
    },
  };

  const rawJson = process.env.OLLAMA_INSTANCES_JSON;
  if (!rawJson) {
    return defaultInstances;
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object") {
      return defaultInstances;
    }

    return {
      ...defaultInstances,
      ...parsed,
    };
  } catch (error) {
    console.log("OLLAMA_INSTANCES_JSON invalido. Usando configuracao padrao.");
    return defaultInstances;
  }
}

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
  allowSystemReboot: process.env.BOT_ALLOW_SYSTEM_REBOOT === "true",
  ollamaAutoStart: process.env.OLLAMA_AUTO_START !== "false",
  ollamaAutoPullModels: process.env.OLLAMA_AUTO_PULL_MODELS !== "false",
  ollamaFallbackModels: (process.env.OLLAMA_FALLBACK_MODELS || "qwen2.5:1.5b,llama3.2:1b,gemma2:2b")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  ollamaDefaultInstance: process.env.OLLAMA_DEFAULT_INSTANCE || "local",
  ollamaInstances: buildOllamaInstances(),
};

export const BACKUP_CONFIG = {
  intervalMs: 24 * 60 * 60 * 1000,
  maxFiles: 30,
  processedOffersTtlDays: parseInt(process.env.PROCESSED_OFFERS_TTL_DAYS || "7", 10),
};
