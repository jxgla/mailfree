/**
 * API Key 管理接口
 * @module api/apiKeys
 */

import { errorResponse } from './helpers.js';
import {
  ALLOWED_API_KEY_SCOPES,
  createApiKey,
  listApiKeys,
  revokeApiKey
} from '../db/index.js';

export async function handleApiKeysApi(request, db, url, path, options) {
  if (!options?.strictAdmin) return null;

  if (path === '/api/admin/api-keys/meta' && request.method === 'GET') {
    return Response.json({ scopes: ALLOWED_API_KEY_SCOPES });
  }

  if (path === '/api/admin/api-keys' && request.method === 'GET') {
    try {
      const keys = await listApiKeys(db);
      return Response.json({ list: keys });
    } catch (error) {
      return errorResponse('查询 API Keys 失败', 500);
    }
  }

  if (path === '/api/admin/api-keys' && request.method === 'POST') {
    try {
      const body = await request.json();
      const name = String(body.name || '').trim();
      const scopes = Array.isArray(body.scopes) ? body.scopes : [];
      const expiresAt = body.expires_at || null;
      const createdBy = options?.authPayload?.userId || null;

      const created = await createApiKey(db, { name, scopes, expiresAt, createdBy });
      return Response.json({
        success: true,
        item: {
          id: created.id,
          name: created.name,
          scopes: created.scopes,
          is_active: created.is_active,
          created_at: created.created_at,
          last_used_at: created.last_used_at,
          expires_at: created.expires_at,
          created_by: created.created_by
        },
        key: created.key
      });
    } catch (error) {
      return errorResponse(String(error?.message || '创建 API Key 失败'), 400);
    }
  }

  if (request.method === 'DELETE' && path.startsWith('/api/admin/api-keys/')) {
    const keyId = Number(path.split('/')[4]);
    if (!keyId) return errorResponse('无效的 API Key ID', 400);

    try {
      const revoked = await revokeApiKey(db, keyId);
      if (!revoked) return errorResponse('API Key 不存在', 404);
      return Response.json({ success: true, revoked: true });
    } catch (error) {
      return errorResponse('撤销 API Key 失败', 500);
    }
  }

  return null;
}
