/**
 * 系统设置数据库操作
 * @module db/settings
 */

import {
  MAILBOX_ADDRESSING_KEY,
  DEFAULT_MAILBOX_ADDRESSING_SETTINGS,
  normalizeMailboxAddressingSettings,
  buildDefaultMailboxAddressingSettingsJson
} from '../utils/mailboxAddressing.js';

let systemSettingsEnsured = false;

async function ensureSystemSettingsStorage(db) {
  if (systemSettingsEnsured) return;
  await db.exec("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);");
  await db.prepare(`
    INSERT INTO system_settings (key, value)
    SELECT ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = ?)
  `).bind(
    MAILBOX_ADDRESSING_KEY,
    buildDefaultMailboxAddressingSettingsJson(),
    MAILBOX_ADDRESSING_KEY
  ).run();
  systemSettingsEnsured = true;
}

function parseMailboxAddressingSettings(raw) {
  if (!raw) return null;
  try {
    return normalizeMailboxAddressingSettings(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

export async function getSystemSetting(db, key) {
  const row = await db.prepare('SELECT value FROM system_settings WHERE key = ? LIMIT 1').bind(String(key || '')).first();
  return row?.value ?? null;
}

export async function setSystemSetting(db, key, value) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) throw new Error('设置键不能为空');
  const normalizedValue = typeof value === 'string' ? value : JSON.stringify(value);
  await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(normalizedKey, normalizedValue).run();
  return normalizedValue;
}

export async function getMailboxAddressingSettings(db) {
  await ensureSystemSettingsStorage(db);
  const raw = await getSystemSetting(db, MAILBOX_ADDRESSING_KEY);
  const parsed = parseMailboxAddressingSettings(raw);
  if (parsed) return parsed;
  await setSystemSetting(db, MAILBOX_ADDRESSING_KEY, buildDefaultMailboxAddressingSettingsJson());
  return DEFAULT_MAILBOX_ADDRESSING_SETTINGS;
}

export async function updateMailboxAddressingSettings(db, partial = {}) {
  const current = await getMailboxAddressingSettings(db);
  const next = normalizeMailboxAddressingSettings({
    ...current,
    ...(partial && typeof partial === 'object' ? partial : {}),
    defaults: {
      ...(current.defaults || {}),
      ...((partial && partial.defaults && typeof partial.defaults === 'object') ? partial.defaults : {})
    },
    limits: {
      ...(current.limits || {}),
      ...((partial && partial.limits && typeof partial.limits === 'object') ? partial.limits : {})
    }
  });
  await setSystemSetting(db, MAILBOX_ADDRESSING_KEY, JSON.stringify(next));
  return next;
}
