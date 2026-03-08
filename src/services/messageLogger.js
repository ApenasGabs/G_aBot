import { appendFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeFileName } from "../utils/text.js";

export async function logGroupMessage(groupsLogsDir, msgData) {
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
}

export async function logUserMessage(usersLogsDir, msgData) {
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
}
