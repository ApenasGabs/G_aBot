import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminTerminalAction } from "../src/services/adminTerminalControl.js";

test("sys sem argumentos retorna uso", () => {
  const parsed = parseAdminTerminalAction("", {});
  assert.equal(parsed.ok, false);
  assert.match(parsed.usage, /Comandos de sistema/);
});

test("sys npm update pacote gera comando seguro", () => {
  const parsed = parseAdminTerminalAction("npm update better-sqlite3", {});
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "npm");
  assert.deepEqual(parsed.args, ["update", "better-sqlite3"]);
  assert.equal(parsed.requiresConfirmation, true);
});

test("bloqueia nome de pacote malicioso", () => {
  const parsed = parseAdminTerminalAction("npm install lodash;rm -rf /", {});
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /pacote invalido/i);
});

test("reboot permitido exige confirmacao em segunda etapa", () => {
  const parsed = parseAdminTerminalAction("pc reboot", {
    allowSystemReboot: true,
    allowSudoCommands: true,
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.useSudo, true);
  assert.equal(parsed.requiresConfirmation, true);
});

test("reboot bloqueado sem flag de ambiente", () => {
  const parsed = parseAdminTerminalAction("pc reboot", {
    allowSystemReboot: false,
    allowSudoCommands: true,
  });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /BOT_ALLOW_SYSTEM_REBOOT/);
});

test("sys bot restart mapeia para pm2", () => {
  const parsed = parseAdminTerminalAction("bot restart", {});
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "pm2");
  assert.deepEqual(parsed.args, ["restart", "ecosystem.config.cjs"]);
  assert.equal(parsed.requiresConfirmation, true);
});

test("sys ls permite comando de leitura", () => {
  const parsed = parseAdminTerminalAction("ls -la src", {});
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, "ls");
  assert.deepEqual(parsed.args, ["-la", "src"]);
  assert.equal(parsed.requiresConfirmation, false);
});

test("apt bloqueado sem flag de sudo", () => {
  const parsed = parseAdminTerminalAction("apt update", {
    allowSystemReboot: true,
    allowSudoCommands: false,
  });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /BOT_ALLOW_SUDO_COMMANDS/);
});
