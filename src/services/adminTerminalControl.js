import { spawn } from "node:child_process";

const PACKAGE_NAME_REGEX = /^[a-z0-9@/._-]+$/i;

const trimOutput = (text, maxLen = 1200) => {
  const raw = String(text || "").trim();
  if (!raw) return "(sem saida)";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}\n...[saida truncada]`;
};

const validatePackageName = (name) => PACKAGE_NAME_REGEX.test(String(name || ""));

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
    "sys pc reboot confirmar",
    "",
    "Obs: reboot exige BOT_ALLOW_SYSTEM_REBOOT=true no .env",
  ].join("\n");
};

export const parseAdminTerminalAction = (argsText, allowSystemReboot) => {
  const tokens = String(argsText || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "help") {
    return { ok: false, usage: usageText() };
  }

  if (tokens[0] === "status") {
    return {
      ok: true,
      command: "uptime",
      args: [],
      summary: "Status da maquina",
      timeoutMs: 10000,
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
      };
    }

    return { ok: false, error: "Acao npm invalida. Use update ou install." };
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
    };
  }

  if (tokens[0] === "pc" && tokens[1] === "reboot") {
    const confirmation = tokens[2];
    if (confirmation !== "confirmar") {
      return {
        ok: false,
        error: "Para reiniciar o PC, use: sys pc reboot confirmar",
      };
    }

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
    };
  }

  return { ok: false, error: "Comando de sistema invalido. Use: sys help" };
};

export const runTerminalCommand = ({ command, args, cwd, timeoutMs }) => {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
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
