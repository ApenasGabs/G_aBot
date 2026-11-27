import pino from "pino";

const TRANSIENT_SIGNAL_SESSION_REGEX =
  /No session found to decrypt message|No SenderKeyRecord found|Invalid PreKey ID|Bad MAC|MessageCounterError|Over 2000 messages into the future|No record for device/i;

const SIGNAL_ROLLBACK_OR_DECRYPT_MESSAGES = new Set([
  "transaction failed, rolling back",
  "failed to decrypt message",
  "failed to process sender key distribution message",
]);

/**
 * Verifica se um erro disparado dentro do Baileys corresponde a uma falha
 * transitória esperada de sessão/chave Signal (ex.: participante @lid enviando
 * skmsg antes do senderKeyDistributionMessage, resolvido automaticamente via retry receipt).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientSignalDecryptionError(err) {
  if (!err) return false;
  const message =
    typeof err === "string"
      ? err
      : typeof err === "object" && err !== null && "message" in err
        ? String(err.message || "")
        : String(err);
  return TRANSIENT_SIGNAL_SESSION_REGEX.test(message);
}

const serializeErrorObject = (err) => {
  if (!err) return err;
  if (err instanceof Error) {
    return pino.stdSerializers.err(err);
  }
  if (typeof err === "object") {
    return {
      message: err.message || String(err),
      stack: err.stack,
      code: err.code,
      ...err,
    };
  }
  return { message: String(err) };
};

/**
 * Identifica se um contexto de erro de decriptação pertence a uma conversa privada 1:1
 * (ex.: `@s.whatsapp.net` ou `@lid` fora de grupos/canais/broadcast).
 *
 * @param {Record<string, any> | null | undefined} context
 * @returns {boolean}
 */
export const isPrivateDirectDecryptionContext = (context) => {
  if (!context || typeof context !== "object") return false;
  const messageType = String(context.messageType || "").toLowerCase();
  if (messageType === "skmsg") return false;

  const remoteJid = String(context.key?.remoteJid || context.sender || "").trim();
  if (!remoteJid) return false;

  if (
    remoteJid.endsWith("@g.us") ||
    remoteJid.endsWith("@broadcast") ||
    remoteJid.endsWith("@newsletter")
  ) {
    return false;
  }

  return true;
}

/**
 * Cria instância do logger Pino configurada para o Baileys:
 * - Serializa tanto `err` quanto `error` com message, stack e code;
 * - Rebaixa de `error` (50) para `debug` (20) rollbacks e falhas de decriptação
 *   causados por ausência transitória de sessão Signal em grupos/canais (@g.us / skmsg);
 * - Em conversas privadas 1:1, rebaixa falhas de decriptação Signal apenas para `warn` (40),
 *   mantendo observabilidade nos logs sem disparar falso alerta de erro fatal (50);
 * - Preserva `level: 50` integral para falhas reais de SQLite ou exceções inesperadas.
 *
 * @param {import("pino").LoggerOptions} [options]
 * @param {import("pino").DestinationStream} [destination]
 */
export function createBaileysLogger(options = {}, destination = undefined) {
  const config = {
    level: "warn",
    ...options,
    serializers: {
      err: pino.stdSerializers.err,
      error: serializeErrorObject,
      ...(options.serializers || {}),
    },
    hooks: {
      logMethod(inputArgs, method, level) {
        if (
          level >= 50 &&
          inputArgs.length >= 2 &&
          typeof inputArgs[0] === "object" &&
          inputArgs[0] !== null
        ) {
          const context = inputArgs[0];
          const msg = typeof inputArgs[1] === "string" ? inputArgs[1] : "";
          const underlyingError = context.error ?? context.err;

          if (
            SIGNAL_ROLLBACK_OR_DECRYPT_MESSAGES.has(msg) &&
            isTransientSignalDecryptionError(underlyingError)
          ) {
            if (
              msg === "failed to decrypt message" &&
              isPrivateDirectDecryptionContext(context)
            ) {
              return this.warn(...inputArgs);
            }
            return this.debug(...inputArgs);
          }
        }
        return method.apply(this, inputArgs);
      },
      ...(options.hooks || {}),
    },
  };

  return destination ? pino(config, destination) : pino(config);
}
