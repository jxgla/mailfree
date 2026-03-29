/**
 * 后台设置接口
 * @module api/adminSettings
 */

import { errorResponse, isAdminUser } from './helpers.js';
import { getMailboxAddressingSettings, updateMailboxAddressingSettings } from '../db/index.js';

export async function handleAdminSettingsApi(request, db, url, path, options) {
  if (!isAdminUser(request, options)) return null;

  if (path === '/api/admin/settings/mailbox-addressing' && request.method === 'GET') {
    try {
      return Response.json(await getMailboxAddressingSettings(db));
    } catch (error) {
      return errorResponse('读取邮箱格式设置失败', 500);
    }
  }

  if (path === '/api/admin/settings/mailbox-addressing' && (request.method === 'PUT' || request.method === 'PATCH')) {
    try {
      const body = await request.json();
      return Response.json(await updateMailboxAddressingSettings(db, body || {}));
    } catch (error) {
      return errorResponse(String(error?.message || '保存邮箱格式设置失败'), 400);
    }
  }

  return null;
}
