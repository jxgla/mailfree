/**
 * 邮箱渲染模块
 * @module modules/mailboxes/render
 */

function createElementFromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/**
 * 格式化时间
 * @param {string} ts - 时间戳
 * @returns {string}
 */
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(String(ts).replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(d);
}

/**
 * HTML 转义
 * @param {string} str - 字符串
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 生成骨架屏卡片
 * @returns {string}
 */
export function createSkeletonCard() {
  return `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line text"></div><div class="skeleton-line time"></div></div>`;
}

/**
 * 生成骨架屏列表项
 * @returns {string}
 */
export function createSkeletonListItem() {
  return `<div class="skeleton-list-item"><div class="skeleton-line skeleton-pin"></div><div class="skeleton-content"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div></div><div class="skeleton-actions"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>`;
}

/**
 * 生成骨架屏内容
 * @param {string} view - 视图模式
 * @param {number} count - 数量
 * @returns {string}
 */
export function generateSkeleton(view = 'grid', count = 8) {
  return Array(count).fill(null).map(() => view === 'grid' ? createSkeletonCard() : createSkeletonListItem()).join('');
}

/**
 * 渲染网格卡片（使用原始 CSS 类名）
 * 操作按钮：复制、置顶、设置转发、收藏（2x2 布局）
 * 点击卡片跳转邮箱
 * @param {object} m - 邮箱数据
 * @returns {string}
 */
export function renderCard(m) {
  const addr = escapeHtml(m.address);
  const time = formatTime(m.created_at);
  const forward = m.forward_to ? escapeHtml(m.forward_to) : '';

  return `
    <div class="mailbox-card" data-address="${addr}" data-id="${m.id}" data-action="jump">
      ${m.is_pinned ? '<div class="pin-badge" title="置顶">📌</div>' : ''}
      ${m.is_favorite ? '<div class="favorite-badge" title="收藏">⭐</div>' : ''}
      ${forward ? `<div class="forward-badge" title="转发到: ${forward}">📤</div>` : ''}
      <div class="line addr" title="${addr}">${addr}</div>
      <div class="line pwd">${m.password_is_default ? '🔓 默认密码' : '🔐 已设密码'}</div>
      <div class="line login">${m.can_login ? '✅ 可登录' : '🚫 禁止登录'}</div>
      <div class="line time">${time}</div>
      <div class="actions">
        <button class="btn-icon" data-action="copy" title="复制">📋</button>
        <button class="btn-icon" data-action="password" title="${m.password_is_default ? '设置密码' : '重置密码'}">🔑</button>
        <button class="btn-icon" data-action="forward" title="设置转发">📤</button>
        <button class="btn-icon ${m.is_favorite ? 'active' : ''}" data-action="favorite" title="${m.is_favorite ? '取消收藏' : '收藏'}">${m.is_favorite ? '⭐' : '☆'}</button>
      </div>
    </div>`;
}

/**
 * 渲染列表项（使用原始 CSS 类名）
 * @param {object} m - 邮箱数据
 * @returns {string}
 */
export function renderListItem(m) {
  const addr = escapeHtml(m.address);
  const time = formatTime(m.created_at);
  const forward = m.forward_to ? escapeHtml(m.forward_to) : '';

  return `
    <div class="mailbox-list-item" data-address="${addr}" data-id="${m.id}">
      <div class="pin-indicator">
        ${m.is_pinned ? '<span class="pin-icon">📌</span>' : '<span class="pin-placeholder"></span>'}
      </div>
      <div class="mailbox-info">
        <div class="addr" title="${addr}">${addr}</div>
        <div class="meta">
          <span class="meta-time">${time}</span>
          <span class="meta-status meta-pwd" title="${m.password_is_default ? '默认密码' : '已设密码'}">${m.password_is_default ? '🔓' : '🔐'}</span>
          <span class="meta-status meta-login ${m.can_login ? 'enabled' : 'disabled'}" title="${m.can_login ? '允许登录' : '禁止登录'}">${m.can_login ? '✅' : '🚫'}</span>
          <span class="meta-status meta-fav ${m.is_favorite ? 'active' : ''}" title="${m.is_favorite ? '已收藏' : '未收藏'}">${m.is_favorite ? '⭐' : '☆'}</span>
          ${forward
            ? `<span class="meta-forward" title="转发到: ${forward}">📤 ${forward.length > 20 ? forward.substring(0, 20) + '...' : forward}</span>`
            : '<span class="meta-status meta-forward-empty" title="未设置转发">—</span>'}
        </div>
      </div>
      <div class="list-actions">
        <button class="btn" data-action="copy" title="复制">📋</button>
        <button class="btn" data-action="jump" title="查看邮件">📧</button>
        <button class="btn" data-action="forward" title="转发设置">📤</button>
        <button class="btn ${m.is_favorite ? 'active' : ''}" data-action="favorite" title="${m.is_favorite ? '取消收藏' : '收藏'}">${m.is_favorite ? '⭐' : '☆'}</button>
        <button class="btn" data-action="login" title="${m.can_login ? '禁止登录' : '允许登录'}">${m.can_login ? '🔐' : '🔓'}</button>
        <button class="btn" data-action="password" title="${m.password_is_default ? '设置密码' : '重置密码'}">🔑</button>
        <button class="btn" data-action="delete" title="删除">🗑️</button>
      </div>
    </div>`;
}

/**
 * 渲染网格视图
 * @param {Array} list - 邮箱列表
 * @returns {string}
 */
export function renderGrid(list) {
  if (!list || !list.length) return '';
  return list.map(m => renderCard(m)).join('');
}

/**
 * 渲染列表视图
 * @param {Array} list - 邮箱列表
 * @returns {string}
 */
export function renderList(list) {
  if (!list || !list.length) return '';
  return list.map(m => renderListItem(m)).join('');
}

export function patchMailboxCollection(list, container, view = 'list') {
  if (!container) return false;
  const items = Array.isArray(list) ? list : [];

  if (!items.length) {
    if (container.innerHTML !== '') {
      container.innerHTML = '';
      return true;
    }
    return false;
  }

  const renderItem = view === 'grid' ? renderCard : renderListItem;
  const nodeClass = view === 'grid' ? '.mailbox-card[data-address]' : '.mailbox-list-item[data-address]';
  const existingNodes = new Map();
  Array.from(container.querySelectorAll(nodeClass)).forEach((node) => {
    existingNodes.set(String(node.dataset.address || ''), node);
  });

  let changed = false;
  const nextNodes = [];

  for (const item of items) {
    const key = String(item?.address || '');
    const expectedHtml = renderItem(item).trim();
    let node = existingNodes.get(key);

    if (!node) {
      node = createElementFromHtml(expectedHtml);
      changed = true;
    } else {
      existingNodes.delete(key);
      if (node.outerHTML.trim() !== expectedHtml) {
        const nextNode = createElementFromHtml(expectedHtml);
        node.replaceWith(nextNode);
        node = nextNode;
        changed = true;
      }
    }

    nextNodes.push(node);
  }

  if (existingNodes.size) {
    existingNodes.forEach((node) => node.remove());
    changed = true;
  }

  nextNodes.forEach((node, index) => {
    if (container.children[index] !== node) {
      container.insertBefore(node, container.children[index] || null);
      changed = true;
    }
  });

  return changed;
}

export function patchMailboxEmailPanel(list, container) {
  if (!container) return false;
  const items = Array.isArray(list) ? list : [];
  const nextHtml = items.map((mail) => {
    const sender = escapeHtml(mail?.sender || '未知发件人');
    const subject = escapeHtml(mail?.subject || '(无主题)');
    const preview = escapeHtml(mail?.preview || '');
    const time = formatTime(mail?.received_at || mail?.created_at || '');
    const code = escapeHtml(mail?.verification_code || '');

    return `<div class="mailbox-email-item" data-mail-id="${mail?.id ?? ''}">
      <div class="mailbox-email-meta">${time} · 发件人：${sender}${code ? ` · 验证码：${code}` : ''}</div>
      <div class="mailbox-email-subject">${subject}</div>
      ${preview ? `<div class="mailbox-email-preview">${preview}</div>` : ''}
    </div>`;
  }).join('');

  if (container.innerHTML !== nextHtml) {
    container.innerHTML = nextHtml;
    return true;
  }
  return false;
}

export default {
  formatTime, escapeHtml, createSkeletonCard, createSkeletonListItem,
  generateSkeleton, renderCard, renderListItem, renderGrid, renderList,
  patchMailboxCollection, patchMailboxEmailPanel
};
