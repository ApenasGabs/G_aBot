import assert from "node:assert/strict";
import test from "node:test";
import { handlePrivateCommand } from "../src/bot/commands.js";

function createMockRepo() {
  let mode = "full";
  let upsertCalled = 0;

  return {
    repo: {
      getUserAlertMode() {
        return mode;
      },
      upsertUser() {
        upsertCalled += 1;
        return { isNew: false };
      },
      setUserAlertMode(_chatId, nextMode) {
        mode = nextMode;
        return { updated: true, mode: nextMode };
      },
    },
    getUpsertCalled() {
      return upsertCalled;
    },
    getMode() {
      return mode;
    },
  };
}

async function runCommand({ text, repo }) {
  const replies = [];
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

test("comando alerta sem argumento mostra modo atual", async () => {
  const mock = createMockRepo();
  const replies = await runCommand({ text: "alerta", repo: mock.repo });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /modo atual de alerta de cupom: detalhado/i);
});

test("atalho compacto atualiza modo de alerta", async () => {
  const mock = createMockRepo();
  const replies = await runCommand({ text: "compacto", repo: mock.repo });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /modo de alerta atualizado para: compacto/i);
  assert.equal(mock.getMode(), "compact");
  assert.equal(mock.getUpsertCalled(), 1);
});

test("comando alerta invalido retorna uso correto", async () => {
  const mock = createMockRepo();
  const replies = await runCommand({ text: "alerta abc", repo: mock.repo });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /uso correto: alerta compacto/i);
});
