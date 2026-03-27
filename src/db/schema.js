export function setupDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id TEXT PRIMARY KEY,
      name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      term TEXT NOT NULL,
      term_normalized TEXT NOT NULL,
      max_price_cents INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(chat_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_user_term
    ON keywords(user_id, term_normalized);

    CREATE TABLE IF NOT EXISTS processed_offers (
      hash_id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT,
      group_link TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      group_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_group_suggestions_status_created
    ON group_suggestions(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS general_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT,
      suggestion_text TEXT NOT NULL,
      suggestion_type TEXT DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_general_suggestions_status_created
    ON general_suggestions(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      code_normalized TEXT NOT NULL,
      group_id TEXT NOT NULL,
      group_name TEXT,
      message_text TEXT,
      is_exhausted INTEGER DEFAULT 0,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_group
    ON coupons(code_normalized, group_id);

    CREATE INDEX IF NOT EXISTS idx_coupons_last_seen
    ON coupons(is_exhausted, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS coupon_interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      store_normalized TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(chat_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_interests_user_store
    ON coupon_interests(user_id, store_normalized);

    CREATE TABLE IF NOT EXISTS coupon_store_metrics (
      store_normalized TEXT PRIMARY KEY,
      store_name TEXT NOT NULL,
      detected_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      false_positive_count INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  const hasAlertMode = userColumns.some((column) => column.name === "alert_mode");
  if (!hasAlertMode) {
    db.exec("ALTER TABLE users ADD COLUMN alert_mode TEXT NOT NULL DEFAULT 'full';");
  }

  const keywordColumns = db.prepare("PRAGMA table_info(keywords)").all();
  const hasMaxPriceCents = keywordColumns.some((column) => column.name === "max_price_cents");
  if (!hasMaxPriceCents) {
    db.exec("ALTER TABLE keywords ADD COLUMN max_price_cents INTEGER;");
  }
}
