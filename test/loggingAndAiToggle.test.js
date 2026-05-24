import assert from "node:assert/strict";
import test from "node:test";
import { BOT_CONFIG } from "../src/config.js";
import { isAIEnabled } from "../src/services/aiCouponParser.js";
import { logGroupMessage, logUserMessage } from "../src/services/messageLogger.js";

test("deve desativar IA por padrao", () => {
  assert.equal(isAIEnabled(), false);
});

test("deve possuir a flag logsEnabled na configuracao do bot", () => {
  assert.equal(typeof BOT_CONFIG.logsEnabled, "boolean");
});

test("logger nao deve escrever arquivos se logs estiverem desativados", async () => {
  const originalLogsEnabled = BOT_CONFIG.logsEnabled;
  BOT_CONFIG.logsEnabled = false;

  try {
    // Tenta fazer o log com caminhos inexistentes/invalidos.
    // Se estivesse ativado, causaria erro (ENOENT) ou criaria o arquivo.
    // Como esta desativado, retorna imediatamente sem tentar escrever.
    await logGroupMessage("/diretorio/inexistente/que/falharia", {
      groupId: "123",
      groupName: "Test Group",
      author: "456",
      authorName: "Test Author",
      messageType: "text",
      text: "test message",
    });

    await logUserMessage("/diretorio/inexistente/que/falharia", {
      userId: "123",
      userName: "Test User",
      direction: "in",
      messageType: "text",
      text: "test message",
    });

    assert.ok(true, "Loggers executados sem erros ao estarem desativados");
  } finally {
    BOT_CONFIG.logsEnabled = originalLogsEnabled;
  }
});
