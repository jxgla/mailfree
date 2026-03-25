/**
 * 外部 API 接口
 * @module api/external
 */

import { errorResponse } from './helpers.js';
import { MOCK_DOMAINS } from './mock.js';
import {
  findApiKeyByRawKey,
  hasApiKeyScope,
  touchApiKeyUsage,
  getMailboxIdByAddress,
  getOrCreateMailboxId
} from '../db/index.js';
import { extractEmail, generateRandomId } from '../utils/common.js';

function getExternalApiKey(request) {
  const xApiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key') || '';
  if (xApiKey.trim()) return xApiKey.trim();

  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

async function requireApiKeyScope(request, db, requiredScope) {
  const rawKey = getExternalApiKey(request);
  if (!rawKey) {
    return { response: errorResponse('缺少 API Key', 401) };
  }

  const apiKey = await findApiKeyByRawKey(db, rawKey);
  if (!apiKey) {
    return { response: errorResponse('API Key 无效或已过期', 401) };
  }

  if (!hasApiKeyScope(apiKey, requiredScope)) {
    return { response: errorResponse('API Key 权限不足', 403) };
  }

  await touchApiKeyUsage(db, apiKey.id);
  return { apiKey };
}

function getDomains(mailDomains, isMock) {
  if (isMock) return MOCK_DOMAINS;
  if (Array.isArray(mailDomains) && mailDomains.length) return mailDomains;
  return [(mailDomains || 'temp.example.com')].filter(Boolean);
}

function normalizeMailboxInput(body, domains) {
  const fullAddress = String(body.address || '').trim().toLowerCase();
  if (fullAddress) {
    const normalized = extractEmail(fullAddress).trim().toLowerCase();
    const parts = normalized.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error('邮箱地址格式无效');
    }
    if (!domains.includes(parts[1])) {
      throw new Error('邮箱域名不在允许列表中');
    }
    if (!/^[a-z0-9._-]{1,64}$/i.test(parts[0])) {
      throw new Error('邮箱前缀格式无效');
    }
    return normalized;
  }

  const local = String(body.local || '').trim().toLowerCase();
  const domain = String(body.domain || '').trim().toLowerCase();

  if (local && domain) {
    if (!/^[a-z0-9._-]{1,64}$/i.test(local)) {
      throw new Error('邮箱前缀格式无效');
    }
    if (!domains.includes(domain)) {
      throw new Error('邮箱域名不在允许列表中');
    }
    return `${local}@${domain}`;
  }

  if (local && !domain) {
    if (!domains.length) {
      throw new Error('当前没有可用邮箱域名');
    }
    if (!/^[a-z0-9._-]{1,64}$/i.test(local)) {
      throw new Error('邮箱前缀格式无效');
    }
    const randomDomain = domains[Math.floor(Math.random() * domains.length)];
    return `${local}@${randomDomain}`;
  }

  if (!local && !domain) {
    if (!domains.length) {
      throw new Error('当前没有可用邮箱域名');
    }
    const randomLocal = generateRandomId(Math.floor(Math.random() * 6) + 8);
    const randomDomain = domains[Math.floor(Math.random() * domains.length)];
    return `${randomLocal}@${randomDomain}`;
  }

  throw new Error('缺少 address 或 local/domain 参数');
}

export async function handleExternalApi(request, db, mailDomains, url, path, options = {}) {
  if (!path.startsWith('/api/ext/')) return null;
  const isMock = !!options.mockOnly;
  const domains = getDomains(mailDomains, isMock);

  if (path === '/api/ext/domains' && request.method === 'GET') {
    const auth = await requireApiKeyScope(request, db, 'domains:read');
    if (auth.response) return auth.response;
    return Response.json({ domains });
  }

  if (path === '/api/ext/accounts' && request.method === 'POST') {
    const auth = await requireApiKeyScope(request, db, 'accounts:write');
    if (auth.response) return auth.response;

    try {
      const body = await request.json();
      const address = normalizeMailboxInput(body, domains);

      if (isMock) {
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        if (!globalThis.__MOCK_EXT_MAILBOXES__) globalThis.__MOCK_EXT_MAILBOXES__ = new Map();
        const existing = globalThis.__MOCK_EXT_MAILBOXES__.get(address);
        if (existing) {
          return Response.json({ ...existing, created: false }, { status: 200 });
        }
        const created = {
          id: 9999 + globalThis.__MOCK_EXT_MAILBOXES__.size,
          address,
          created: true,
          created_at: now
        };
        globalThis.__MOCK_EXT_MAILBOXES__.set(address, created);
        return Response.json(created, { status: 201 });
      }

      const existingId = await getMailboxIdByAddress(db, address);
      const mailboxId = await getOrCreateMailboxId(db, address);
      const row = await db.prepare(`
        SELECT id, address, created_at
        FROM mailboxes
        WHERE id = ?
        LIMIT 1
      `).bind(mailboxId).first();

      return Response.json({
        id: row?.id || mailboxId,
        address: row?.address || address,
        created: !existingId,
        created_at: row?.created_at || null
      }, { status: existingId ? 200 : 201 });
    } catch (error) {
      return errorResponse(String(error?.message || '创建邮箱失败'), 400);
    }
  }

  if (path === '/api/ext/messages/latest-code' && request.method === 'GET') {
    const auth = await requireApiKeyScope(request, db, 'messages:read');
    if (auth.response) return auth.response;

    const mailbox = extractEmail(String(url.searchParams.get('mailbox') || '')).trim().toLowerCase();
    if (!mailbox) return errorResponse('缺少 mailbox 参数', 400);

    if (isMock) {
      return Response.json({
        mailbox,
        verification_code: '123456',
        subject: '[演示数据] 您的验证码是 123456',
        sender: 'support@example.com',
        received_at: new Date().toISOString(),
        message_id: 1001
      });
    }

    try {
      const mailboxId = await getMailboxIdByAddress(db, mailbox);
      if (!mailboxId) return errorResponse('邮箱不存在', 404);

      const row = await db.prepare(`
        SELECT id, sender, subject, verification_code, received_at
        FROM messages
        WHERE mailbox_id = ?
          AND verification_code IS NOT NULL
          AND verification_code != ''
        ORDER BY received_at DESC, id DESC
        LIMIT 1
      `).bind(mailboxId).first();

      if (!row) return errorResponse('未找到验证码邮件', 404);

      return Response.json({
        mailbox,
        verification_code: row.verification_code,
        subject: row.subject,
        sender: row.sender,
        received_at: row.received_at,
        message_id: row.id
      });
    } catch (error) {
      return errorResponse('查询验证码失败', 500);
    }
  }

  return errorResponse('未找到外部 API 路径', 404);
}
