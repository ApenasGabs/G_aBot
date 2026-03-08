import { normalizeText } from "../utils/text.js";

export function createRepo(db) {
  const upsertUserStmt = db.prepare(`
    INSERT INTO users (chat_id, name, is_active)
    VALUES (?, ?, 1)
    ON CONFLICT(chat_id) DO UPDATE SET
      name = excluded.name,
      is_active = 1
  `);

  const addKeywordStmt = db.prepare(`
    INSERT INTO keywords (user_id, term, term_normalized)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, term_normalized) DO NOTHING
  `);

  const removeKeywordStmt = db.prepare(`
    DELETE FROM keywords
    WHERE user_id = ? AND term_normalized = ?
  `);

  const listKeywordsStmt = db.prepare(`
    SELECT term FROM keywords
    WHERE user_id = ?
    ORDER BY term COLLATE NOCASE
  `);

  const listAllKeywordsStmt = db.prepare(`
    SELECT k.user_id, k.term, k.term_normalized
    FROM keywords k
    INNER JOIN users u ON u.chat_id = k.user_id
    WHERE u.is_active = 1
  `);

  const insertProcessedOfferStmt = db.prepare(`
    INSERT INTO processed_offers (hash_id)
    VALUES (?)
    ON CONFLICT(hash_id) DO NOTHING
  `);

  const addGroupSuggestionStmt = db.prepare(`
    INSERT INTO group_suggestions (
      user_id,
      user_name,
      group_link,
      invite_code,
      group_name,
      status
    )
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const findGroupSuggestionByInviteCodeStmt = db.prepare(`
    SELECT
      id,
      user_id,
      user_name,
      group_link,
      invite_code,
      group_name,
      status,
      created_at
    FROM group_suggestions
    WHERE invite_code = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const addGeneralSuggestionStmt = db.prepare(`
    INSERT INTO general_suggestions (
      user_id,
      user_name,
      suggestion_text,
      suggestion_type,
      status
    )
    VALUES (?, ?, ?, ?, 'pending')
  `);

  const listPendingGroupSuggestionsStmt = db.prepare(`
    SELECT
      id,
      user_id,
      user_name,
      group_link,
      invite_code,
      group_name,
      status,
      created_at
    FROM group_suggestions
    WHERE status IN ('pending', 'read')
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listPendingGeneralSuggestionsStmt = db.prepare(`
    SELECT
      id,
      user_id,
      user_name,
      suggestion_text,
      suggestion_type,
      status,
      created_at
    FROM general_suggestions
    WHERE status IN ('pending', 'read')
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listPendingGroupSuggestionsToMarkReadStmt = db.prepare(`
    SELECT id, user_id, user_name, group_name
    FROM group_suggestions
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listPendingGeneralSuggestionsToMarkReadStmt = db.prepare(`
    SELECT id, user_id, user_name, suggestion_text
    FROM general_suggestions
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const markGroupSuggestionAsReadByIdStmt = db.prepare(`
    UPDATE group_suggestions
    SET status = 'read'
    WHERE id = ? AND status = 'pending'
  `);

  const markGeneralSuggestionAsReadByIdStmt = db.prepare(`
    UPDATE general_suggestions
    SET status = 'read'
    WHERE id = ? AND status = 'pending'
  `);

  const markPendingGroupSuggestionsAsReadTx = db.transaction((limit) => {
    const rows = listPendingGroupSuggestionsToMarkReadStmt.all(limit);
    for (const row of rows) {
      markGroupSuggestionAsReadByIdStmt.run(row.id);
    }
    return rows;
  });

  const markPendingGeneralSuggestionsAsReadTx = db.transaction((limit) => {
    const rows = listPendingGeneralSuggestionsToMarkReadStmt.all(limit);
    for (const row of rows) {
      markGeneralSuggestionAsReadByIdStmt.run(row.id);
    }
    return rows;
  });

  const updateGroupSuggestionStatusStmt = db.prepare(`
    UPDATE group_suggestions
    SET status = ?
    WHERE id = ?
  `);

  const updateGeneralSuggestionStatusStmt = db.prepare(`
    UPDATE general_suggestions
    SET status = ?
    WHERE id = ?
  `);

  const getGroupSuggestionByIdStmt = db.prepare(`
    SELECT
      id,
      user_id,
      user_name,
      group_link,
      invite_code,
      group_name,
      status,
      created_at
    FROM group_suggestions
    WHERE id = ?
    LIMIT 1
  `);

  const getGeneralSuggestionByIdStmt = db.prepare(`
    SELECT
      id,
      user_id,
      user_name,
      suggestion_text,
      suggestion_type,
      status,
      created_at
    FROM general_suggestions
    WHERE id = ?
    LIMIT 1
  `);

  const listAllKeywordRowsStmt = db.prepare(`
    SELECT id, user_id, term
    FROM keywords
    ORDER BY user_id, id
  `);

  const updateKeywordNormalizedStmt = db.prepare(`
    UPDATE keywords
    SET term_normalized = ?
    WHERE id = ?
  `);

  const deleteKeywordByIdStmt = db.prepare(`
    DELETE FROM keywords
    WHERE id = ?
  `);

  const normalizeStoredKeywordsTx = db.transaction(() => {
    const rows = listAllKeywordRowsStmt.all();
    const seen = new Set();
    let updated = 0;
    let removedDuplicates = 0;

    for (const row of rows) {
      const normalized = normalizeText(row.term || "");
      if (!normalized) {
        deleteKeywordByIdStmt.run(row.id);
        removedDuplicates += 1;
        continue;
      }

      const dedupeKey = `${row.user_id}::${normalized}`;
      if (seen.has(dedupeKey)) {
        deleteKeywordByIdStmt.run(row.id);
        removedDuplicates += 1;
        continue;
      }

      seen.add(dedupeKey);
      updateKeywordNormalizedStmt.run(normalized, row.id);
      updated += 1;
    }

    return { updated, removedDuplicates };
  });

  const upsertCouponStmt = db.prepare(`
    INSERT INTO coupons (
      code,
      code_normalized,
      group_id,
      group_name,
      message_text,
      is_exhausted,
      first_seen_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(code_normalized, group_id) DO UPDATE SET
      last_seen_at = CURRENT_TIMESTAMP,
      is_exhausted = excluded.is_exhausted,
      message_text = excluded.message_text
  `);

  const findCouponByKeyStmt = db.prepare(`
    SELECT id
    FROM coupons
    WHERE code_normalized = ? AND group_id = ?
    LIMIT 1
  `);

  const listRecentCouponsStmt = db.prepare(`
    SELECT
      code,
      group_name,
      message_text,
      is_exhausted,
      strftime('%s', last_seen_at) * 1000 as last_seen_timestamp
    FROM coupons
    WHERE is_exhausted = 0
    ORDER BY last_seen_at DESC
    LIMIT ?
  `);

  const searchCouponsByStoreStmt = db.prepare(`
    SELECT
      code,
      group_name,
      message_text,
      is_exhausted,
      strftime('%s', last_seen_at) * 1000 as last_seen_timestamp
    FROM coupons
    WHERE is_exhausted = 0
      AND (
        LOWER(group_name) LIKE LOWER(?)
        OR LOWER(message_text) LIKE LOWER(?)
      )
    ORDER BY last_seen_at DESC
    LIMIT 20
  `);

  const addCouponInterestStmt = db.prepare(`
    INSERT INTO coupon_interests (user_id, store_name, store_normalized)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, store_normalized) DO NOTHING
  `);

  const removeCouponInterestStmt = db.prepare(`
    DELETE FROM coupon_interests
    WHERE user_id = ? AND store_normalized = ?
  `);

  const listCouponInterestsStmt = db.prepare(`
    SELECT store_name FROM coupon_interests
    WHERE user_id = ?
    ORDER BY store_name COLLATE NOCASE
  `);

  const listAllCouponInterestsStmt = db.prepare(`
    SELECT ci.user_id, ci.store_name, ci.store_normalized
    FROM coupon_interests ci
    INNER JOIN users u ON u.chat_id = ci.user_id
    WHERE u.is_active = 1
  `);

  return {
    upsertUser(chatId, name) {
      upsertUserStmt.run(chatId, name || null);
    },
    addKeyword(chatId, term) {
      const normalized = normalizeText(term);
      const result = addKeywordStmt.run(chatId, term.trim(), normalized);
      return result.changes > 0;
    },
    removeKeyword(chatId, term) {
      const result = removeKeywordStmt.run(chatId, normalizeText(term));
      return result.changes > 0;
    },
    listKeywords(chatId) {
      return listKeywordsStmt.all(chatId);
    },
    listAllKeywords() {
      return listAllKeywordsStmt.all();
    },
    markOfferAsProcessed(hashId) {
      const result = insertProcessedOfferStmt.run(hashId);
      return result.changes > 0;
    },
    addGroupSuggestion({ userId, userName, groupLink, inviteCode, groupName }) {
      const result = addGroupSuggestionStmt.run(
        userId,
        userName || null,
        groupLink,
        inviteCode,
        groupName || null
      );
      return Number(result.lastInsertRowid);
    },
    findGroupSuggestionByInviteCode(inviteCode) {
      return findGroupSuggestionByInviteCodeStmt.get(inviteCode) || null;
    },
    addGeneralSuggestion({ userId, userName, suggestionText, suggestionType = 'general' }) {
      const result = addGeneralSuggestionStmt.run(
        userId,
        userName || null,
        suggestionText,
        suggestionType
      );
      return Number(result.lastInsertRowid);
    },
    listPendingGroupSuggestions(limit = 20) {
      return listPendingGroupSuggestionsStmt.all(limit);
    },
    listPendingGeneralSuggestions(limit = 20) {
      return listPendingGeneralSuggestionsStmt.all(limit);
    },
    markPendingGroupSuggestionsAsRead(limit = 20) {
      return markPendingGroupSuggestionsAsReadTx(limit);
    },
    markPendingGeneralSuggestionsAsRead(limit = 20) {
      return markPendingGeneralSuggestionsAsReadTx(limit);
    },
    getGroupSuggestionById(id) {
      return getGroupSuggestionByIdStmt.get(id) || null;
    },
    getGeneralSuggestionById(id) {
      return getGeneralSuggestionByIdStmt.get(id) || null;
    },
    updateGroupSuggestionStatus(id, status) {
      const result = updateGroupSuggestionStatusStmt.run(status, id);
      return result.changes > 0;
    },
    updateGeneralSuggestionStatus(id, status) {
      const result = updateGeneralSuggestionStatusStmt.run(status, id);
      return result.changes > 0;
    },
    normalizeStoredKeywords() {
      return normalizeStoredKeywordsTx();
    },
    upsertCoupon({ code, groupId, groupName, messageText, isExhausted }) {
      const normalized = normalizeText(code);
      const existing = findCouponByKeyStmt.get(normalized, groupId);
      upsertCouponStmt.run(
        code,
        normalized,
        groupId,
        groupName || null,
        messageText || null,
        isExhausted ? 1 : 0
      );
      return { isNew: !existing };
    },
    listRecentCoupons(limit = 10) {
      return listRecentCouponsStmt.all(limit);
    },
    searchCouponsByStore(storeName) {
      const pattern = `%${storeName}%`;
      return searchCouponsByStoreStmt.all(pattern, pattern);
    },
    addCouponInterest(chatId, storeName) {
      const normalized = normalizeText(storeName);
      const result = addCouponInterestStmt.run(chatId, storeName.trim(), normalized);
      return result.changes > 0;
    },
    removeCouponInterest(chatId, storeName) {
      const result = removeCouponInterestStmt.run(chatId, normalizeText(storeName));
      return result.changes > 0;
    },
    listCouponInterests(chatId) {
      return listCouponInterestsStmt.all(chatId);
    },
    listAllCouponInterests() {
      return listAllCouponInterestsStmt.all();
    },
  };
}
