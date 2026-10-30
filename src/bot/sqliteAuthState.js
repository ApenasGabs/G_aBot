import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";

/**
 * Custom authentication state for Baileys using SQLite (better-sqlite3).
 *
 * @param {import("better-sqlite3").Database} db - The better-sqlite3 database instance
 * @returns {Promise<{state: import("@whiskeysockets/baileys").AuthenticationState, saveCreds: () => Promise<void>}>}
 */
export const useSqliteAuthState = async (db) => {
  // Prepared statements for creds
  const getCredsStmt = db.prepare("SELECT data FROM wa_auth_creds WHERE id = 1");
  const setCredsStmt = db.prepare("INSERT INTO wa_auth_creds (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data");

  // Prepared statements for keys
  const getKeyStmt = db.prepare("SELECT data FROM wa_auth_keys WHERE type = ? AND key_id = ?");
  const setKeyStmt = db.prepare("INSERT INTO wa_auth_keys (type, key_id, data) VALUES (?, ?, ?) ON CONFLICT(type, key_id) DO UPDATE SET data = excluded.data");
  const deleteKeyStmt = db.prepare("DELETE FROM wa_auth_keys WHERE type = ? AND key_id = ?");

  const setBatchTx = db.transaction((entries) => {
    for (const { category, id, value } of entries) {
      const cleanCategory = String(category || "").replace(/\0/g, "");
      const cleanId = String(id || "").replace(/\0/g, "");
      if (value) {
        const serialized = JSON.stringify(value, BufferJSON.replacer).replace(/\0/g, "");
        setKeyStmt.run(cleanCategory, cleanId, serialized);
      } else {
        deleteKeyStmt.run(cleanCategory, cleanId);
      }
    }
  });

  let creds;
  const row = getCredsStmt.get();
  if (row && row.data) {
    creds = JSON.parse(row.data, BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    try {
      const serialized = JSON.stringify(creds, BufferJSON.replacer).replace(/\0/g, "");
      setCredsStmt.run(serialized);
    } catch (err) {
      console.error(`[SQLite Auth] Erro ao salvar credenciais: ${err.message}`, {
        message: err.message,
        stack: err.stack,
        code: err.code,
      });
      throw err;
    }
  };

  const keys = {
    get: async (type, ids) => {
      try {
        const data = {};
        const cleanType = String(type || "").replace(/\0/g, "");
        for (const id of ids) {
          const cleanId = String(id || "").replace(/\0/g, "");
          let value = getKeyStmt.get(cleanType, cleanId);
          if (value) {
            value = JSON.parse(value.data, BufferJSON.reviver);
            if (cleanType === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
        }
        return data;
      } catch (err) {
        console.error(`[SQLite Auth] Erro no get(${type}, ${ids}): ${err.message}`, {
          message: err.message,
          stack: err.stack,
          code: err.code,
        });
        throw err;
      }
    },
    set: async (data) => {
      try {
        if (!data || typeof data !== "object") return;
        const entries = [];
        for (const category in data) {
          const categoryObj = data[category];
          if (!categoryObj || typeof categoryObj !== "object") continue;
          for (const id in categoryObj) {
            entries.push({
              category,
              id,
              value: categoryObj[id],
            });
          }
        }
        if (entries.length > 0) {
          setBatchTx(entries);
        }
      } catch (err) {
        console.error(`[SQLite Auth] Erro na transação set(): ${err.message}`, {
          message: err.message,
          stack: err.stack,
          code: err.code,
        });
        throw err;
      }
    },
  };

  const clearState = () => {
    try {
      db.prepare("DELETE FROM wa_auth_creds").run();
      db.prepare("DELETE FROM wa_auth_keys").run();
      console.log("[SQLite Auth] Sessão apagada com sucesso do banco de dados.");
    } catch (err) {
      console.error("[SQLite Auth] Erro ao limpar sessão:", err);
    }
  };

  return {
    state: {
      creds,
      keys,
    },
    saveCreds,
    clearState,
  };
};
