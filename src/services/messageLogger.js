import { appendFile } from "node:fs/promises";
import path from "node:path";
import { BOT_CONFIG } from "../config.js";
import { sanitizeFileName } from "../utils/text.js";

/**
 * Salva log de mensagem enviada ou recebida em grupo.
 *
 * @param {string} groupsLogsDir - Diretorio de logs de grupo.
 * @param {object} msgData - Dados da mensagem do grupo.
 * @returns {Promise<void>}
 */
export const logGroupMessage = async (groupsLogsDir, msgData) => {
  if (!BOT_CONFIG.logsEnabled) {
    return;
  }

  try {
    const safeGroupId = sanitizeFileName(msgData.groupId);
    const logFilePath = path.join(groupsLogsDir, `${safeGroupId}.jsonl`);

    const logEntry =
      JSON.stringify({
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
    console.error("Erro ao salvar log de grupo:", error.message);
  }
};

/**
 * Salva log de mensagem privada de usuario.
 *
 * @param {string} usersLogsDir - Diretorio de logs de usuario.
 * @param {object} msgData - Dados da mensagem de usuario.
 * @returns {Promise<void>}
 */
export const logUserMessage = async (usersLogsDir, msgData) => {
  if (!BOT_CONFIG.logsEnabled) {
    return;
  }

  try {
    const safeUserId = sanitizeFileName(msgData.userId);
    const logFilePath = path.join(usersLogsDir, `${safeUserId}.jsonl`);

    const logEntry =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        userId: msgData.userId,
        userName: msgData.userName,
        direction: msgData.direction,
        context: msgData.context ?? null,
        messageType: msgData.messageType,
        text: msgData.text,
      }) + "\n";

    await appendFile(logFilePath, logEntry, "utf8");
  } catch (error) {
    console.error("Erro ao salvar log de usuario:", error.message);
  }
};
