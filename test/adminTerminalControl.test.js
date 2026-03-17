import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminTerminalAction } from "../src/services/adminTerminalControl.js";

test("sys sem argumentos retorna uso", () => {
  const parsed = parseAdminTerminalAction("", false);
  assert.equal(parsed.ok, false);
  assert.match(parsed.usage, /Comandos de sistema/);
});

test("sys npm update pacote gera comando seguro", () => {
  const parsed = parseAdminTerminalAction("npm update better-sqlite3", false);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "npm");
  assert.deepEqual(parsed.args, ["update", "better-sqlite3"]);
});

test("bloqueia nome de pacote malicioso", () => {
  const parsed = parseAdminTerminalAction("npm install lodash;rm -rf /", false);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /pacote invalido/i);
});

test("reboot exige confirmacao explicita", () => {
  const parsed = parseAdminTerminalAction("pc reboot", true);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /confirmar/i);
});

test("reboot bloqueado sem flag de ambiente", () => {
  const parsed = parseAdminTerminalAction("pc reboot confirmar", false);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /BOT_ALLOW_SYSTEM_REBOOT/);
});

test("sys bot restart mapeia para pm2", () => {
  const parsed = parseAdminTerminalAction("bot restart", false);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "pm2");
  assert.deepEqual(parsed.args, ["restart", "ecosystem.config.cjs"]);
});
