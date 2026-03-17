import { spawn } from "node:child_process";

const PACKAGE_NAME_REGEX = /^[a-z0-9@/._-]+$/i;
const SAFE_ARG_REGEX = /^[a-z0-9_./:@=,+%-]+$/i;
const READ_ONLY_COMMANDS = new Set(["ls", "pwd", "whoami", "date", "uname", "uptime"]);

const trimOutput = (text, maxLen = 1200) => {
  const raw = String(text || "").trim();
  if (!raw) return "(sem saida)";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}\n...[saida truncada]`;
};

const validatePackageName = (name) => PACKAGE_NAME_REGEX.test(String(name || ""));
const validateSafeArgs = (args) => args.every((arg) => SAFE_ARG_REGEX.test(String(arg || "")));

const usageText = () => {
  return [
    "🖥️ *Comandos de sistema (admin)*",
    "",
    "sys status",
    "sys npm update",
    "sys npm update [pacote]",
    "sys npm install [pacote]",
    "sys bot restart",
    "sys bot stop",
    "sys bot start",
    "sys apt update",
    "sys apt install [pacote]",
    "sys pc reboot",
    "sys ls",
    "sys ls -la src",
    "sys pwd",
    "",
    "Confirmacao: para comandos criticos o bot pergunta 'tem certeza?'",
    "Responda com: sys confirmar | sys cancelar",
    "",
    "Obs: comandos sudo exigem BOT_ALLOW_SUDO_COMMANDS=true e BOT_SUDO_PASSWORD no .env",
    "Obs: reboot exige BOT_ALLOW_SYSTEM_REBOOT=true no .env",
  ].join("\n");
};

export const parseAdminTerminalAction = (argsText, options = {}) => {
  const {
    allowSystemReboot = false,
    allowSudoCommands = false,
  } = options;

  const tokens = String(argsText || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "help") {
    return { ok: false, usage: usageText() };
  }

  if (READ_ONLY_COMMANDS.has(tokens[0])) {
    if (!validateSafeArgs(tokens.slice(1))) {
      return { ok: false, error: "Argumentos invalidos para comando de leitura." };
    }

    return {
      ok: true,
      command: tokens[0],
      args: tokens.slice(1),
      summary: `Executar ${tokens.join(" ")}`,
      timeoutMs: 15000,
      useSudo: false,
      requiresConfirmation: false,
    };
  }

  if (tokens[0] === "status") {
    return {
      ok: true,
      command: "uptime",
      args: [],
      summary: "Status da maquina",
      timeoutMs: 10000,
      useSudo: false,
      requiresConfirmation: false,
    };
  }

  if (tokens[0] === "npm") {
    const action = tokens[1];
    if (action === "update") {
      if (tokens.length === 2) {
        return {
          ok: true,
          command: "npm",
          args: ["update"],
          summary: "Atualizar dependencias npm",
          timeoutMs: 180000,
          useSudo: false,
          requiresConfirmation: true,
        };
      }

      const pkgName = tokens[2];
      if (!validatePackageName(pkgName)) {
        return { ok: false, error: "Nome de pacote invalido." };
      }

      return {
        ok: true,
        command: "npm",
        args: ["update", pkgName],
        summary: `Atualizar pacote ${pkgName}`,
        timeoutMs: 180000,
        useSudo: false,
        requiresConfirmation: true,
      };
    }

    if (action === "install") {
      const pkgName = tokens[2];
      if (!pkgName) {
        return { ok: false, error: "Informe o pacote. Ex: sys npm install lodash" };
      }
      if (!validatePackageName(pkgName)) {
        return { ok: false, error: "Nome de pacote invalido." };
      }

      return {
        ok: true,
        command: "npm",
        args: ["install", pkgName],
        summary: `Instalar pacote ${pkgName}`,
        timeoutMs: 180000,
        useSudo: false,
        requiresConfirmation: true,
      };
    }

    return { ok: false, error: "Acao npm invalida. Use update ou install." };
  }

  if (tokens[0] === "apt") {
    if (!allowSudoCommands) {
      return {
        ok: false,
        error: "Comandos apt bloqueados. Defina BOT_ALLOW_SUDO_COMMANDS=true no .env.",
      };
    }

    const action = tokens[1];
    if (action === "update") {
      return {
        ok: true,
        command: "apt",
        args: ["update"],
        summary: "Atualizar indices apt",
        timeoutMs: 180000,
        useSudo: true,
        requiresConfirmation: true,
      };
    }

    if (action === "install") {
      const pkgName = tokens[2];
      if (!pkgName || !validatePackageName(pkgName)) {
        return { ok: false, error: "Informe um pacote valido. Ex: sys apt install htop" };
      }

      return {
        ok: true,
        command: "apt",
        args: ["install", "-y", pkgName],
        summary: `Instalar pacote do sistema ${pkgName}`,
        timeoutMs: 300000,
        useSudo: true,
        requiresConfirmation: true,
      };
    }

    return { ok: false, error: "Acao apt invalida. Use update ou install." };
  }

  if (tokens[0] === "bot") {
    const action = tokens[1];
    if (!["start", "stop", "restart"].includes(action)) {
      return { ok: false, error: "Acao bot invalida. Use start, stop ou restart." };
    }

    return {
      ok: true,
      command: "pm2",
      args: [action, "ecosystem.config.cjs"],
      summary: `Bot ${action}`,
      timeoutMs: 30000,
      useSudo: false,
      requiresConfirmation: true,
    };
  }

  if (tokens[0] === "pc" && tokens[1] === "reboot") {
    if (!allowSystemReboot) {
      return {
        ok: false,
        error: "Reboot bloqueado. Defina BOT_ALLOW_SYSTEM_REBOOT=true no .env.",
      };
    }

    return {
      ok: true,
      command: "reboot",
      args: [],
      summary: "Reiniciar maquina",
      timeoutMs: 15000,
      useSudo: true,
      requiresConfirmation: true,
    };
  }

  return { ok: false, error: "Comando de sistema invalido. Use: sys help" };
};

export const runTerminalCommand = ({ command, args, cwd, timeoutMs, useSudo = false, sudoPassword = "" }) => {
  return new Promise((resolve) => {
    const cmd = useSudo ? "sudo" : command;
    const finalArgs = useSudo ? ["-S", "-k", command, ...args] : args;

    const child = spawn(cmd, finalArgs, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    if (useSudo) {
      child.stdin.write(`${sudoPassword}\n`);
      child.stdin.end();
    }

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        code,
        timedOut,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: -1,
        timedOut,
        stdout: trimOutput(stdout),
        stderr: trimOutput(error.message || stderr || "erro ao executar comando"),
      });
    });
  });
};
