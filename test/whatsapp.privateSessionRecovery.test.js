/**
 * @fileoverview Cobertura completa de testes automatizados (node --test) para
 * recuperacao de sessao Signal 1:1 em stubs CIPHERTEXT de novos contatos.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  handlePrivateCiphertextStub,
  PRIVATE_SESSION_RECOVERY_MESSAGE,
} from "../src/bot/whatsapp.js";

test("handlePrivateCiphertextStub renegocia sessao Signal e envia aviso com cooldown anti-loop", async () => {
  const asserted = [];
  const sent = [];
  const cooldownMap = new Map();
  const nowMs = 1_795_804_800_000;
  const nowSec = Math.floor(nowMs / 1000);

  const mockClient = {
    assertSessions: async (jids, force) => {
      asserted.push({ jids, force });
      return true;
    },
    sendMessage: async (jid, payload) => {
      sent.push({ jid, payload });
    },
  };

  const stubMsg = {
    key: {
      remoteJid: "105518773317706@lid",
      remoteJidAlt: "5511981640373@s.whatsapp.net",
      fromMe: false,
      id: "MSG_1",
    },
    messageStubType: 2, // CIPHERTEXT
    messageStubParameters: ["Message absent from node"],
    messageTimestamp: nowSec - 5,
    pushName: "Aline Ayrão",
  };

  // 1a ocorrencia -> recupera sessao e envia aviso
  const first = await handlePrivateCiphertextStub({
    msg: stubMsg,
    chatId: "105518773317706@lid",
    client: mockClient,
    cooldownMap,
    nowMs,
  });

  assert.equal(first.recovered, true);
  assert.equal(first.targetJid, "105518773317706@lid");
  assert.equal(asserted.length, 1);
  assert.deepEqual(asserted[0], {
    jids: ["105518773317706@lid", "5511981640373@s.whatsapp.net"],
    force: true,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, "105518773317706@lid");
  assert.equal(sent[0].payload.text, PRIVATE_SESSION_RECOVERY_MESSAGE);

  // 2a ocorrencia imediata -> bloqueada pelo cooldown de 5 min
  const second = await handlePrivateCiphertextStub({
    msg: { ...stubMsg, key: { ...stubMsg.key, id: "MSG_2" } },
    chatId: "105518773317706@lid",
    client: mockClient,
    cooldownMap,
    nowMs: nowMs + 10_000,
  });

  assert.equal(second.recovered, false);
  assert.equal(second.reason, "cooldown");
  assert.equal(sent.length, 1);
});

test("handlePrivateCiphertextStub faz fallback para remoteJidAlt quando envio para @lid falha e ignora grupos/antigas", async () => {
  const sent = [];
  const nowMs = 1_795_804_800_000;
  const nowSec = Math.floor(nowMs / 1000);

  const mockClient = {
    assertSessions: async () => true,
    sendMessage: async (jid, payload) => {
      if (jid.endsWith("@lid")) {
        throw new Error("LID session unavailable");
      }
      sent.push({ jid, payload });
    },
  };

  const fallbackRes = await handlePrivateCiphertextStub({
    msg: {
      key: {
        remoteJid: "105518773317706@lid",
        remoteJidAlt: "5511981640373@s.whatsapp.net",
        fromMe: false,
      },
      messageStubType: 2,
      messageTimestamp: nowSec - 2,
    },
    chatId: "105518773317706@lid",
    client: mockClient,
    cooldownMap: new Map(),
    nowMs,
  });

  assert.equal(fallbackRes.recovered, true);
  assert.equal(fallbackRes.targetJid, "5511981640373@s.whatsapp.net");
  assert.equal(sent.length, 1);

  // Ignora grupos
  const groupRes = await handlePrivateCiphertextStub({
    msg: {
      key: { remoteJid: "120363424459533668@g.us", fromMe: false },
      messageStubType: 2,
      messageTimestamp: nowSec,
    },
    chatId: "120363424459533668@g.us",
    client: mockClient,
    cooldownMap: new Map(),
    nowMs,
  });
  assert.equal(groupRes.recovered, false);
  assert.equal(groupRes.reason, "not_private");

  // Ignora stubs offline antigos (> 120s)
  const staleRes = await handlePrivateCiphertextStub({
    msg: {
      key: { remoteJid: "5511981640373@s.whatsapp.net", fromMe: false },
      messageStubType: 2,
      messageTimestamp: nowSec - 600,
    },
    chatId: "5511981640373@s.whatsapp.net",
    client: mockClient,
    cooldownMap: new Map(),
    nowMs,
  });
  assert.equal(staleRes.recovered, false);
  assert.equal(staleRes.reason, "stale_message");
});
