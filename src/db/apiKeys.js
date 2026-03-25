/**
 * API Key 数据库操作模块
 * @module db/apiKeys
 */

import { sha256Hex } from '../utils/common.js';

export const ALLOWED_API_KEY_SCOPES = ['domains:read', 'accounts:write', 'messages:read'];

function normalizeScopes(scopes = []) {
  if (!Array.isArray(scopes)) return [];
  return Array.from(new Set(scopes.filter(scope => ALLOWED_API_KEY_SCOPES.includes(scope))));
}

function generateRawApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `mf_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeExpiresAt(expiresAt) {
  if (!expiresAt) return null;
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('过期时间格式无效');
  }
  return parsed.toISOString();
}

function parseScopes(rawScopes) {
  try {
    const parsed = JSON.parse(String(rawScopes || '[]'));
    return normalizeScopes(parsed);
  } catch (_) {
    return [];
  }
}

export async function createApiKey(db, { name, scopes = [], expiresAt = null, createdBy = null }) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) throw new Error('名称不能为空');
  if (normalizedName.length > 80) throw new Error('名称长度不能超过80个字符');

  const normalizedScopes = normalizeScopes(scopes);
  if (!normalizedScopes.length) throw new Error('至少选择一个权限范围');

  const normalizedExpiresAt = normalizeExpiresAt(expiresAt);
  const rawKey = generateRawApiKey();
  const keyHash = await sha256Hex(rawKey);

  await db.prepare(`
    INSERT INTO api_keys (name, key_hash, scopes, is_active, expires_at, created_by)
    VALUES (?, ?, ?, 1, ?, ?)
  `).bind(
    normalizedName,
    keyHash,
    JSON.stringify(normalizedScopes),
    normalizedExpiresAt,
    createdBy ? Number(createdBy) : null
  ).run();

  const row = await db.prepare(`
    SELECT id, name, scopes, is_active, created_at, last_used_at, expires_at, created_by
    FROM api_keys
    WHERE key_hash = ?
    LIMIT 1
  `).bind(keyHash).first();

  return {
    ...(formatApiKeyRow(row) || {}),
    key: rawKey
  };
}

export async function listApiKeys(db) {
  const { results } = await db.prepare(`
    SELECT id, name, scopes, is_active, created_at, last_used_at, expires_at, created_by
    FROM api_keys
    ORDER BY created_at DESC, id DESC
  `).all();

  return (results || []).map(formatApiKeyRow).filter(Boolean);
}

export async function revokeApiKey(db, id) {
  const keyId = Number(id || 0);
  if (!keyId) throw new Error('无效的 API Key ID');

  const result = await db.prepare(`
    UPDATE api_keys
    SET is_active = 0
    WHERE id = ?
  `).bind(keyId).run();

  return (result?.meta?.changes || 0) > 0;
}

export async function findApiKeyByRawKey(db, rawKey) {
  const normalizedKey = String(rawKey || '').trim();
  if (!normalizedKey) return null;

  const keyHash = await sha256Hex(normalizedKey);
  const row = await db.prepare(`
    SELECT id, name, scopes, is_active, created_at, last_used_at, expires_at, created_by
    FROM api_keys
    WHERE key_hash = ?
    LIMIT 1
  `).bind(keyHash).first();

  const formatted = formatApiKeyRow(row);
  if (!formatted || !formatted.is_active) return null;

  if (formatted.expires_at) {
    const expiresTime = new Date(formatted.expires_at).getTime();
    if (!Number.isNaN(expiresTime) && expiresTime <= Date.now()) {
      return null;
    }
  }

  return formatted;
}

export async function touchApiKeyUsage(db, id) {
  const keyId = Number(id || 0);
  if (!keyId) return;
  await db.prepare(`
    UPDATE api_keys
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(keyId).run();
}

export function hasApiKeyScope(apiKey, requiredScope) {
  if (!apiKey || !requiredScope) return false;
  const scopes = Array.isArray(apiKey.scopes) ? apiKey.scopes : [];
  return scopes.includes(requiredScope);
}

export function formatApiKeyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    scopes: parseScopes(row.scopes),
    is_active: !!row.is_active,
    created_at: row.created_at || null,
    last_used_at: row.last_used_at || null,
    expires_at: row.expires_at || null,
    created_by: row.created_by || null
  };
}
