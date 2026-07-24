import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG } from "../config.js";

let supabase = null;

if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.key) {
  supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
}

const debounceTimers = new Map();

/**
 * Função chamada na inicialização do bot para sobrescrever o banco local
 * com os dados mais recentes do Supabase.
 * @param {Object} repo Instância do repositório
 */
export async function syncFromSupabaseOnBoot(repo) {
  if (!supabase) {
    console.log(
      "[Supabase Sync] Credentials not configured, skipping boot sync.",
    );
    return;
  }

  console.log(
    "[Supabase Sync] Starting boot sync from cloud to local SQLite...",
  );

  try {
    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("*");
    if (usersErr) throw usersErr;

    const { data: keywords, error: keywordsErr } = await supabase
      .from("keywords")
      .select("*");
    if (keywordsErr) throw keywordsErr;

    const { data: interests, error: interestsErr } = await supabase
      .from("coupon_interests")
      .select("*");
    if (interestsErr) throw interestsErr;

    console.log(
      `[Supabase Sync] Found ${users?.length || 0} users, ${keywords?.length || 0} keywords, ${interests?.length || 0} interests.`,
    );

    repo.bulkSyncFromCloud(users || [], keywords || [], interests || []);

    console.log("[Supabase Sync] Boot sync completed successfully.");
  } catch (error) {
    console.error("[Supabase Sync] Error during boot sync:", error.message);
  }
}

/**
 * Puxa as informações recentes de um usuário para garantir integridade.
 */
async function pullUserIntegrity(chatId, repo) {
  if (!supabase) return;

  try {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("chat_id", chatId)
      .single();
    if (!user) return;

    const { data: keywords } = await supabase
      .from("keywords")
      .select("*")
      .eq("user_id", chatId);
    const { data: interests } = await supabase
      .from("coupon_interests")
      .select("*")
      .eq("user_id", chatId);

    repo.syncUserFromCloud(user, keywords || [], interests || []);
  } catch (error) {
    console.error(
      `[Supabase Sync] Integrity pull failed for ${chatId}:`,
      error.message,
    );
  }
}

/**
 * Função responsável por enviar os dados locais de um usuário para a nuvem.
 */
async function flushUserDataToCloud(chatId, repo) {
  if (!supabase) return;

  try {
    const user = repo.getUserRaw(chatId);
    if (!user) return;

    const keywords = repo.listKeywordsRaw(chatId);
    const interests = repo.listCouponInterestsRaw(chatId);

    const { error: userErr } = await supabase.from("users").upsert(
      {
        chat_id: user.chat_id,
        name: user.name,
        is_active: user.is_active,
        alert_mode: user.alert_mode,
        created_at: user.created_at || new Date().toISOString(),
      },
      { onConflict: "chat_id" },
    );

    if (userErr) throw userErr;

    const { error: delKwErr } = await supabase
      .from("keywords")
      .delete()
      .eq("user_id", chatId);
    if (delKwErr) throw delKwErr;

    if (keywords.length > 0) {
      const kwPayload = keywords.map((k) => ({
        user_id: chatId,
        term: k.term,
        term_normalized: k.term_normalized,
        max_price_cents: k.max_price_cents,
      }));
      const { error: insKwErr } = await supabase
        .from("keywords")
        .insert(kwPayload);
      if (insKwErr) throw insKwErr;
    }

    const { error: delIntErr } = await supabase
      .from("coupon_interests")
      .delete()
      .eq("user_id", chatId);
    if (delIntErr) throw delIntErr;

    if (interests.length > 0) {
      const intPayload = interests.map((i) => ({
        user_id: chatId,
        store_name: i.store_name,
        store_normalized: i.store_normalized,
      }));
      const { error: insIntErr } = await supabase
        .from("coupon_interests")
        .insert(intPayload);
      if (insIntErr) throw insIntErr;
    }

    // Opcional: puxar dados pós escrita para confirmar integridade, como sugerido na issue
    await pullUserIntegrity(chatId, repo);
  } catch (error) {
    console.error(
      `[Supabase Sync] Flush failed for user ${chatId}:`,
      error.message,
    );
  }
}

/**
 * Registra uma alteração local e inicia/reinicia o timer do debouncer.
 *
 * @param {string} chatId ID do chat
 * @param {Object} repo Instância do repositório local
 */
export function triggerDebouncedSync(chatId, repo) {
  if (!supabase) return;

  if (debounceTimers.has(chatId)) {
    clearTimeout(debounceTimers.get(chatId));
  }

  const timer = setTimeout(() => {
    debounceTimers.delete(chatId);
    flushUserDataToCloud(chatId, repo);
  }, SUPABASE_CONFIG.debounceMs);

  debounceTimers.set(chatId, timer);
}
