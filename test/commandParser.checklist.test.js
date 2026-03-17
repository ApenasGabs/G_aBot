import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../src/bot/commandParser.js";

test("atalho compacto vira comando de alerta compact", () => {
  const parsed = parseCommand("compacto");
  assert.equal(parsed.command, "/alerta");
  assert.equal(parsed.argsText, "compact");
  assert.equal(parsed.type, "shortcut");
});

test("atalho detalhado vira comando de alerta full", () => {
  const parsed = parseCommand("detalhado");
  assert.equal(parsed.command, "/alerta");
  assert.equal(parsed.argsText, "full");
  assert.equal(parsed.type, "shortcut");
});

test("atalho alerta preserva argumento informado", () => {
  const parsed = parseCommand("alerta compacto");
  assert.equal(parsed.command, "/alerta");
  assert.equal(parsed.argsText, "compacto");
  assert.equal(parsed.type, "shortcut");
});
