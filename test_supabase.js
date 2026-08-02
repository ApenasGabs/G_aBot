/**
 * Script de teste para verificar a conexão com o Supabase.
 * Roda: node test_supabase.js
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

console.log("=== Teste de Conexão Supabase ===\n");

// 1. Verificar se as variáveis existem
console.log(`SUPABASE_URL: ${url ? url : "❌ NÃO CONFIGURADA"}`);
console.log(`SUPABASE_KEY: ${key ? key.substring(0, 15) + "..." : "❌ NÃO CONFIGURADA"}`);

if (!url || !key) {
  console.error("\n❌ Variáveis de ambiente faltando. Configure SUPABASE_URL e SUPABASE_KEY no .env");
  process.exit(1);
}

// 2. Verificar formato da key
if (key.startsWith("sb_secret_")) {
  console.log("🔑 Tipo da key: secret (service_role) ✅ — Correta para uso no servidor");
} else if (key.startsWith("sb_publishable_")) {
  console.log("🔑 Tipo da key: publishable (anon) ⚠️ — Funciona, mas service_role é mais seguro para server-side");
} else if (key.startsWith("eyJ")) {
  console.log("🔑 Tipo da key: JWT (formato antigo do Supabase) ✅");
} else {
  console.log("🔑 Tipo da key: formato desconhecido ⚠️");
}

// 3. Testar conexão
const NoopWebSocket = class {
  constructor() { this.readyState = 3; }
  close() {} send() {} addEventListener() {} removeEventListener() {}
};

const supabase = createClient(url, key, {
  realtime: {
    transport: typeof globalThis.WebSocket !== "undefined" ? globalThis.WebSocket : NoopWebSocket
  }
});

try {
  // Testar leitura da tabela users
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("chat_id")
    .limit(3);

  if (usersErr) {
    console.error(`\n❌ Erro ao consultar tabela 'users': ${usersErr.message}`);
    console.error(`   Código: ${usersErr.code}`);
    
    if (usersErr.message.includes("relation") && usersErr.message.includes("does not exist")) {
      console.error("\n💡 A tabela 'users' não existe. Rode o supabase_schema.sql no SQL Editor do Supabase Dashboard.");
    }
    if (usersErr.code === "PGRST301" || usersErr.message.includes("JWT")) {
      console.error("\n💡 Key inválida ou expirada. Vá no Supabase Dashboard > Settings > API e copie a service_role key.");
    }
  } else {
    console.log(`\n✅ Tabela 'users' acessível — ${users.length} registro(s) encontrados`);
    if (users.length > 0) {
      console.log(`   Exemplo: ${users[0].chat_id}`);
    }
  }

  // Testar tabela keywords
  const { data: keywords, error: kwErr } = await supabase
    .from("keywords")
    .select("id")
    .limit(1);

  if (kwErr) {
    console.error(`❌ Tabela 'keywords': ${kwErr.message}`);
  } else {
    console.log(`✅ Tabela 'keywords' acessível — ${keywords.length} registro(s)`);
  }

  // Testar tabela coupon_interests
  const { data: interests, error: intErr } = await supabase
    .from("coupon_interests")
    .select("id")
    .limit(1);

  if (intErr) {
    console.error(`❌ Tabela 'coupon_interests': ${intErr.message}`);
  } else {
    console.log(`✅ Tabela 'coupon_interests' acessível — ${interests.length} registro(s)`);
  }

  console.log("\n=== Resultado ===");
  if (!usersErr && !kwErr && !intErr) {
    console.log("🎉 Tudo OK! Supabase conectado e tabelas acessíveis.");
  } else {
    console.log("⚠️  Há problemas. Verifique os erros acima.");
  }

} catch (err) {
  console.error(`\n❌ Erro de conexão: ${err.message}`);
  if (err.message.includes("fetch") || err.message.includes("ENOTFOUND")) {
    console.error("💡 URL do Supabase parece incorreta ou sem acesso à internet.");
  }
}
