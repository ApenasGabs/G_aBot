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

  let creds;
  const row = getCredsStmt.get();
  if (row && row.data) {
    creds = JSON.parse(row.data, BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    setCredsStmt.run(JSON.stringify(creds, BufferJSON.replacer));
  };

  const keys = {
    get: async (type, ids) => {
      try {
        const data = {};
        for (const id of ids) {
          let value = getKeyStmt.get(type, id);
          if (value) {
            value = JSON.parse(value.data, BufferJSON.reviver);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
        }
        return data;
      } catch (err) {
        console.error(`[SQLite Auth] Erro no get(${type}, ${ids}):`, err);
        throw err;
      }
    },
    set: async (data) => {
      try {
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            if (value) {
              setKeyStmt.run(category, id, JSON.stringify(value, BufferJSON.replacer));
            } else {
              deleteKeyStmt.run(category, id);
            }
          }
        }
      } catch (err) {
        console.error(`[SQLite Auth] Erro no set():`, err);
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
