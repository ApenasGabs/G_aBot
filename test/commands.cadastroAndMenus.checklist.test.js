import assert from "node:assert/strict";
import test from "node:test";
import { handlePrivateCommand } from "../src/bot/commands.js";
import {
  getCouponsMenu,
  getHelpMenu,
  getMainMenu,
} from "../src/bot/menuTemplates.js";

async function runPrivateCommandWithRepo({ text, upsertResult }) {
  const replies = [];
  const repo = {
    upsertUser() {
      return upsertResult;
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

test("/cadastro informa onboarding quando usuario e novo", async () => {
  const replies = await runPrivateCommandWithRepo({
    text: "/cadastro",
    upsertResult: { isNew: true },
  });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /cadastro concluido/i);
  assert.match(replies[0], /seguir amazon/i);
});

test("/cadastro informa quando usuario ja existe", async () => {
  const replies = await runPrivateCommandWithRepo({
    text: "/cadastro",
    upsertResult: { isNew: false },
  });

  assert.equal(replies.length, 1);
  assert.match(replies[0], /ja esta cadastrado/i);
});

test("menu principal reforca comandos de cupom por loja", () => {
  const menu = getMainMenu();

  assert.match(menu, /\? loja/i);
  assert.match(menu, /seguir loja/i);
  assert.match(menu, /lojas/i);
  assert.match(menu, /compacto/i);
});

test("menu de ajuda reforca alerta compacto e detalhado", () => {
  const help = getHelpMenu();

  assert.match(help, /alerta compacto/i);
  assert.match(help, /alerta detalhado/i);
  assert.match(help, /seguir \[loja\]/i);
  assert.match(help, /parar \[loja\]/i);
});

test("menu de cupons mostra atalhos de modo de alerta", () => {
  const menu = getCouponsMenu();

  assert.match(menu, /compacto/i);
  assert.match(menu, /detalhado/i);
});
