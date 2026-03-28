import assert from "node:assert/strict";
import test from "node:test";
import { handlePrivateCommand } from "../src/bot/commands.js";

async function runCommand({ text, removedCount }) {
  const replies = [];
  const repo = {
    removeAllKeywords() {
      return removedCount;
    },
  };

  await handlePrivateCommand({
    client: {
      async sendMessage() {},
    },
    repo,
    chatId: "u1",
    name: "Ana",
    text,
    sendPrivateReply: async (_chatId, messageText) => {
      replies.push(messageText);
    },
  });

  return replies;
}

test("/limparfiltros remove todos os filtros e confirma quantidade", async () => {
  const replies = await runCommand({ text: "/limparfiltros", removedCount: 3 });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /removi todos os seus filtros \(3\)/i);
});

test("atalho limpar informa quando nao ha filtros", async () => {
  const replies = await runCommand({ text: "limpar", removedCount: 0 });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /nao tem filtros cadastrados/i);
});
