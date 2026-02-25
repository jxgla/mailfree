/**
 * Freemail 主入口文件
 * * 本文件作为 Cloudflare Worker 的入口点，负责：
 * 1. 处理 HTTP 请求（通过 fetch 处理器）
 * 2. 处理邮件接收（通过 email 处理器）
 * 3. 定时清理过期数据（通过 scheduled 处理器）
 * * @module server
 */

import { initDatabase, getInitializedDatabase } from './db/index.js';
import { createRouter, authMiddleware } from './routes/index.js';
import { createAssetManager } from './assets/index.js';
import { extractEmail } from './utils/common.js';
import { forwardByLocalPart, forwardByMailboxConfig } from './email/forwarder.js';
import { parseEmailBody, extractVerificationCode } from './email/parser.js';
import { getForwardTarget } from './db/mailboxes.js';

// ── 新增：CORS 响应包装器 ──
function addCorsHeaders(response) {
    if (!response) return response; 
    
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

export default {
  /**
   * HTTP请求处理器
   */
  async fetch(request, env, ctx) {
    // 👇 放行浏览器的 OPTIONS 跨域预检
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    // 获取数据库连接
    let DB;
    try {
      DB = await getInitializedDatabase(env);
    } catch (error) {
      console.error('数据库连接失败:', error.message);
      return addCorsHeaders(new Response('数据库连接失败，请检查配置', { status: 500 }));
    }

    // 解析邮件域名
    const MAIL_DOMAINS = (env.MAIL_DOMAIN || 'temp.example.com')
      .split(/[,\s]+/)
      .map(d => d.trim())
      .filter(Boolean);

    // 创建路由器并添加认证中间件
    const router = createRouter();
    router.use(authMiddleware);

    // 👇 修改：用 CORS 包装路由响应
    const routeResponse = await router.handle(request, { request, env, ctx });
    if (routeResponse) {
      return addCorsHeaders(routeResponse);
    }

    // 👇 修改：用 CORS 包装静态资源响应
    const assetManager = createAssetManager();
    return addCorsHeaders(await assetManager.handleAssetRequest(request, env, MAIL_DOMAINS));
  },

  /**
   * 邮件接收处理器
   */
  async email(message, env, ctx) {
    let DB;
    try {
      DB = await getInitializedDatabase(env);
    } catch (error) {
      console.error('邮件处理时数据库连接失败:', error.message);
      return;
    }

    try {
      const headers = message.headers;
      const toHeader = headers.get('to') || headers.get('To') || '';
      const fromHeader = headers.get('from') || headers.get('From') || '';
      const subject = headers.get('subject') || headers.get('Subject') || '(无主题)';

      let envelopeTo = '';
      try {
        const toValue = message.to;
        if (Array.isArray(toValue) && toValue.length > 0) {
          envelopeTo = typeof toValue[0] === 'string' ? toValue[0] : (toValue[0].address || '');
        } else if (typeof toValue === 'string') {
          envelopeTo = toValue;
        }
      } catch (_) { }

      const resolvedRecipient = (envelopeTo || toHeader || '').toString();
      const resolvedRecipientAddr = extractEmail(resolvedRecipient);
      const localPart = (resolvedRecipientAddr.split('@')[0] || '').toLowerCase();

      const mailboxForwardTo = await getForwardTarget(DB, resolvedRecipientAddr);
      if (mailboxForwardTo) {
        forwardByMailboxConfig(message, mailboxForwardTo, ctx);
      } else {
        forwardByLocalPart(message, localPart, ctx, env);
      }

      let textContent = '';
      let htmlContent = '';
      let rawBuffer = null;
      try {
        const resp = new Response(message.raw);
        rawBuffer = await resp.arrayBuffer();
        const rawText = await new Response(rawBuffer).text();
        const parsed = parseEmailBody(rawText);
        textContent = parsed.text || '';
        htmlContent = parsed.html || '';
        if (!textContent && !htmlContent) textContent = (rawText || '').slice(0, 100000);
      } catch (_) {
        textContent = '';
        htmlContent = '';
      }

      const mailbox = extractEmail(resolvedRecipient || toHeader);
      const sender = extractEmail(fromHeader);

      const r2 = env.MAIL_EML;
      let objectKey = '';
      try {
        const now = new Date();
        const y = now.getUTCFullYear();
        const m = String(now.getUTCMonth() + 1).padStart(2, '0');
        const d = String(now.getUTCDate()).padStart(2, '0');
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(now.getUTCMinutes()).padStart(2, '0');
        const ss = String(now.getUTCSeconds()).padStart(2, '0');
        const keyId = (globalThis.crypto?.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const safeMailbox = (mailbox || 'unknown').toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
        objectKey = `${y}/${m}/${d}/${safeMailbox}/${hh}${mm}${ss}-${keyId}.eml`;
        if (r2 && rawBuffer) {
          await r2.put(objectKey, new Uint8Array(rawBuffer), { httpMetadata: { contentType: 'message/rfc822' } });
        }
      } catch (e) {
        console.error('R2 put failed:', e);
      }

      const preview = (() => {
        const plain = textContent && textContent.trim() ? textContent : (htmlContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return String(plain || '').slice(0, 120);
      })();
      let verificationCode = '';
      try {
        verificationCode = extractVerificationCode({ subject, text: textContent, html: htmlContent });
      } catch (_) { }

      const resMb = await DB.prepare('SELECT id FROM mailboxes WHERE address = ?').bind(mailbox.toLowerCase()).all();
      let mailboxId;
      if (Array.isArray(resMb?.results) && resMb.results.length) {
        mailboxId = resMb.results[0].id;
      } else {
        const [localPartMb, domain] = (mailbox || '').toLowerCase().split('@');
        if (localPartMb && domain) {
          await DB.prepare('INSERT INTO mailboxes (address, local_part, domain, password_hash, last_accessed_at) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)')
            .bind((mailbox || '').toLowerCase(), localPartMb, domain).run();
          const created = await DB.prepare('SELECT id FROM mailboxes WHERE address = ?').bind((mailbox || '').toLowerCase()).all();
          mailboxId = created?.results?.[0]?.id;
        }
      }
      if (!mailboxId) throw new Error('无法解析或创建 mailbox 记录');

      let toAddrs = '';
      try {
        const toValue = message.to;
        if (Array.isArray(toValue)) {
          toAddrs = toValue.map(v => (typeof v === 'string' ? v : (v?.address || ''))).filter(Boolean).join(',');
        } else if (typeof toValue === 'string') {
          toAddrs = toValue;
        } else {
          toAddrs = resolvedRecipient || toHeader || '';
        }
      } catch (_) {
        toAddrs = resolvedRecipient || toHeader || '';
      }

      await DB.prepare(`
        INSERT INTO messages (mailbox_id, sender, to_addrs, subject, verification_code, preview, r2_bucket, r2_object_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        mailboxId,
        sender,
        String(toAddrs || ''),
        subject || '(无主题)',
        verificationCode || null,
        preview || null,
        'mail-eml',
        objectKey || ''
      ).run();
    } catch (err) {
      console.error('Email event handling error:', err);
    }
  }, // 注意：这里必须有一个逗号，连接下一个处理器

  /**
   * 👇 新增：定时任务处理器（阅后即焚）
   */
  async scheduled(event, env, ctx) {
    let DB;
    try {
        // 直接复用项目中已经封装好的数据库获取方法，极其稳定
        DB = await getInitializedDatabase(env);
    } catch (e) {
        console.error('Scheduled Task: 数据库连接失败', e.message);
        return;
    }

    const EXPIRE_MINUTES = 30; // 过期时间：30分钟

    try {
        // 1. 查出过期的 R2 对象 Key（用于清理 EML 附件文件）
        const expiredMessages = await DB.prepare(`
            SELECT m.id, m.r2_object_key
            FROM messages m
            JOIN mailboxes mb ON m.mailbox_id = mb.id
            WHERE mb.created_at <= datetime('now', '-${EXPIRE_MINUTES} minutes')
              AND m.r2_object_key != ''
        `).all();

        // 2. 异步批量删除 R2 实体文件，不阻塞主线程
        const r2 = env.MAIL_EML; // 假设你的 R2 绑定名是 MAIL_EML，如果在控制台看到不一样，可以在这改
        if (r2 && expiredMessages?.results?.length) {
            const keys = expiredMessages.results.map(r => r.r2_object_key).filter(Boolean);
            for (const key of keys) {
                ctx.waitUntil(r2.delete(key).catch(e => console.error('R2 delete failed:', key, e)));
            }
        }

        // 3. 删数据库消息记录 (Delete Messages)
        await DB.prepare(`
            DELETE FROM messages
            WHERE mailbox_id IN (
              SELECT id FROM mailboxes
              WHERE created_at <= datetime('now', '-${EXPIRE_MINUTES} minutes')
            )
        `).run();

        // 4. 删数据库邮箱记录 (Delete Mailboxes)
        // 保护机制：不删除那些被用户手动置顶 (is_pinned) 或收藏 (is_favorite) 的长期邮箱
        await DB.prepare(`
            DELETE FROM mailboxes
            WHERE created_at <= datetime('now', '-${EXPIRE_MINUTES} minutes')
              AND is_pinned = 0
              AND is_favorite = 0
        `).run();

        console.log(`阅后即焚清理完成，清空了 ${EXPIRE_MINUTES} 分钟前的数据`);
    } catch (e) {
        console.error('Scheduled Task: 清理失败', e);
    }
  }
};
