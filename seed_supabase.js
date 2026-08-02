/**
 * Script para fazer upload inicial dos dados locais para o Supabase.
 * Roda: node seed_supabase.js
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error("❌ SUPABASE_URL e SUPABASE_KEY precisam estar configuradas no .env");
  process.exit(1);
}

const NoopWebSocket = class {
  constructor() { this.readyState = 3; }
  close() {} send() {} addEventListener() {} removeEventListener() {}
};

const supabase = createClient(url, key, {
  realtime: {
    transport: typeof globalThis.WebSocket !== "undefined" ? globalThis.WebSocket : NoopWebSocket
  }
});
const db = new Database("./data/bot.db", { readonly: true });

async function seed() {
  console.log("=== Seed: SQLite Local → Supabase ===\n");

  // 1. Ler dados locais
  const users = db.prepare("SELECT * FROM users").all();
  const keywords = db.prepare("SELECT * FROM keywords").all();
  const interests = db.prepare("SELECT * FROM coupon_interests").all();

  console.log(`Local: ${users.length} users, ${keywords.length} keywords, ${interests.length} interests\n`);

  // 2. Upload users
  if (users.length > 0) {
    const usersPayload = users.map((u) => ({
      chat_id: u.chat_id,
      name: u.name,
      is_active: u.is_active,
      alert_mode: u.alert_mode || "full",
      created_at: u.created_at || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("users")
      .upsert(usersPayload, { onConflict: "chat_id" });

    if (error) {
      console.error(`❌ Erro ao enviar users: ${error.message}`);
      db.close();
      process.exit(1);
    }
    console.log(`✅ ${users.length} users enviados`);
  }

  // 3. Upload keywords
  if (keywords.length > 0) {
    // Limpar existentes primeiro
    const { error: delErr } = await supabase
      .from("keywords")
      .delete()
      .neq("id", 0); // delete all

    if (delErr) {
      console.error(`❌ Erro ao limpar keywords: ${delErr.message}`);
    }

    const kwPayload = keywords.map((k) => ({
      user_id: k.user_id,
      term: k.term,
      term_normalized: k.term_normalized,
      max_price_cents: k.max_price_cents,
    }));

    const { error } = await supabase.from("keywords").insert(kwPayload);

    if (error) {
      console.error(`❌ Erro ao enviar keywords: ${error.message}`);
    } else {
      console.log(`✅ ${keywords.length} keywords enviados`);
    }
  }

  // 4. Upload coupon_interests
  if (interests.length > 0) {
    const { error: delErr } = await supabase
      .from("coupon_interests")
      .delete()
      .neq("id", 0);

    if (delErr) {
      console.error(`❌ Erro ao limpar interests: ${delErr.message}`);
    }

    const intPayload = interests.map((i) => ({
      user_id: i.user_id,
      store_name: i.store_name,
      store_normalized: i.store_normalized,
    }));

    const { error } = await supabase.from("coupon_interests").insert(intPayload);

    if (error) {
      console.error(`❌ Erro ao enviar interests: ${error.message}`);
    } else {
      console.log(`✅ ${interests.length} interests enviados`);
    }
  }

  // 5. Verificar no Supabase
  console.log("\n--- Verificação no Supabase ---");
  const { data: u } = await supabase.from("users").select("chat_id");
  const { data: k } = await supabase.from("keywords").select("id");
  const { data: i } = await supabase.from("coupon_interests").select("id");

  console.log(`Supabase: ${u?.length || 0} users, ${k?.length || 0} keywords, ${i?.length || 0} interests`);
  console.log("\n🎉 Seed concluído!");

  db.close();
}

seed().catch((err) => {
  console.error("Erro fatal:", err.message);
  db.close();
  process.exit(1);
});
