/**
 * 管理员页面
 * @module admin
 */

import { api, getUsers, createUser, updateUser, deleteUser, getUserMailboxes, assignMailbox, unassignMailbox, getApiKeys, getApiKeyMeta, createApiKey, revokeApiKey, getMailboxAddressingSettings, updateMailboxAddressingSettings } from './modules/admin/api.js';
import { formatTime, renderUserRow, renderUserList, generateSkeletonRows, renderPagination } from './modules/admin/user-list.js';
import { fillEditForm, collectEditFormData, validateEditForm, resetEditState } from './modules/admin/user-edit.js';

// showToast 由 toast-utils.js 全局提供
const showToast = window.showToast || ((msg, type) => console.log(`[${type}] ${msg}`));

// 分页状态
let currentPage = 1, pageSize = 20, totalUsers = 0;
let currentViewingUser = null;
let mailboxPage = 1, mailboxPageSize = 20, totalMailboxes = 0;
let apiKeyScopes = [];
let apiKeys = [];
let mailboxAddressingSettings = null;
let sessionInfo = null;

// DOM 元素
const els = {
  back: document.getElementById('back'),
  logout: document.getElementById('logout'),
  demoBanner: document.getElementById('demo-banner'),
  usersTbody: document.getElementById('users-tbody'),
  usersRefresh: document.getElementById('users-refresh'),
  usersLoading: document.getElementById('users-loading'),
  usersCount: document.getElementById('users-count'),
  usersPagination: document.getElementById('users-pagination'),
  pageInfo: document.getElementById('page-info'),
  prevPage: document.getElementById('prev-page'),
  nextPage: document.getElementById('next-page'),

  uOpen: document.getElementById('u-open'),
  uModal: document.getElementById('u-modal'),
  uClose: document.getElementById('u-close'),
  uCancel: document.getElementById('u-cancel'),
  uCreate: document.getElementById('u-create'),
  uName: document.getElementById('u-name'),
  uPass: document.getElementById('u-pass'),
  uRole: document.getElementById('u-role'),

  aOpen: document.getElementById('a-open'),
  aModal: document.getElementById('a-modal'),
  aClose: document.getElementById('a-close'),
  aCancel: document.getElementById('a-cancel'),
  aAssign: document.getElementById('a-assign'),
  aName: document.getElementById('a-name'),
  aMail: document.getElementById('a-mail'),

  // 取消分配模态框
  unassignOpen: document.getElementById('unassign-open'),
  unassignModal: document.getElementById('unassign-modal'),
  unassignClose: document.getElementById('unassign-close'),
  unassignCancel: document.getElementById('unassign-cancel'),
  unassignSubmit: document.getElementById('unassign-submit'),
  unassignName: document.getElementById('unassign-name'),
  unassignMail: document.getElementById('unassign-mail'),

  editModal: document.getElementById('edit-modal'),
  editClose: document.getElementById('edit-close'),
  editCancel: document.getElementById('edit-cancel'),
  editSave: document.getElementById('edit-save'),
  editName: document.getElementById('edit-name'),
  editUserDisplay: document.getElementById('edit-user-display'),
  editNewName: document.getElementById('edit-new-name'),
  editRoleCheck: document.getElementById('edit-role-check'),
  editLimit: document.getElementById('edit-limit'),
  editSendCheck: document.getElementById('edit-send-check'),
  editPass: document.getElementById('edit-pass'),
  editDelete: document.getElementById('edit-delete'),

  userMailboxes: document.getElementById('user-mailboxes'),
  userMailboxesLoading: document.getElementById('user-mailboxes-loading'),
  mailboxesCount: document.getElementById('mailboxes-count'),
  mailboxesPagination: document.getElementById('mailboxes-pagination'),
  mailboxesPageInfo: document.getElementById('mailboxes-page-info'),
  mailboxesPrevPage: document.getElementById('mailboxes-prev-page'),
  mailboxesNextPage: document.getElementById('mailboxes-next-page'),

  apiKeysBody: document.getElementById('api-keys-body'),
  apiKeysRefresh: document.getElementById('api-keys-refresh'),
  apiKeysLoading: document.getElementById('api-keys-loading'),
  apiKeyCount: document.getElementById('api-key-count'),
  apiKeyEmpty: document.getElementById('api-key-empty'),
  apiKeyCreateOpen: document.getElementById('api-key-create-open'),
  apiKeyCreateModal: document.getElementById('api-key-create-modal'),
  apiKeyCreateClose: document.getElementById('api-key-create-close'),
  apiKeyCreateCancel: document.getElementById('api-key-create-cancel'),
  apiKeyCreateSubmit: document.getElementById('api-key-create-submit'),
  apiKeyName: document.getElementById('api-key-name'),
  apiKeyExpiresAt: document.getElementById('api-key-expires-at'),
  apiKeyScopes: document.getElementById('api-key-scopes'),
  apiKeyResultModal: document.getElementById('api-key-result-modal'),
  apiKeyResultClose: document.getElementById('api-key-result-close'),
  apiKeyResultOk: document.getElementById('api-key-result-ok'),
  apiKeyValue: document.getElementById('api-key-value'),
  apiKeyCopy: document.getElementById('api-key-copy'),
  mailboxSettingsCard: document.getElementById('mailbox-settings-card'),
  mailboxFormatV1: document.getElementById('mailbox-format-v1'),
  mailboxFormatV2: document.getElementById('mailbox-format-v2'),
  mailboxSubLen: document.getElementById('mailbox-sub-len'),
  mailboxSettingsSave: document.getElementById('mailbox-settings-save'),
  mailboxSettingsStatus: document.getElementById('mailbox-settings-status'),
  confirmModal: document.getElementById('admin-confirm-modal'),
  confirmMessage: document.getElementById('admin-confirm-message'),
  confirmClose: document.getElementById('admin-confirm-close'),
  confirmCancel: document.getElementById('admin-confirm-cancel'),
  confirmOk: document.getElementById('admin-confirm-ok')
};

// 自定义确认对话框
let confirmResolver = null;
function showConfirm(message) {
  return new Promise(resolve => {
    confirmResolver = resolve;
    if (els.confirmMessage) els.confirmMessage.textContent = message;
    els.confirmModal?.classList.add('show');
  });
}

function initConfirmEvents() {
  if (els._confirmInitialized) return;
  els._confirmInitialized = true;

  const closeConfirm = (result) => {
    els.confirmModal?.classList.remove('show');
    if (confirmResolver) {
      confirmResolver(result);
      confirmResolver = null;
    }
  };

  els.confirmOk?.addEventListener('click', () => closeConfirm(true));
  els.confirmCancel?.addEventListener('click', () => closeConfirm(false));
  els.confirmClose?.addEventListener('click', () => closeConfirm(false));
  els.confirmModal?.addEventListener('click', (e) => {
    if (e.target === els.confirmModal) closeConfirm(false);
  });
}
initConfirmEvents();

function formatApiKeyTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

async function loadSessionInfo() {
  try {
    const res = await api('/api/session');
    if (!res.ok) return null;
    sessionInfo = await res.json();
    return sessionInfo;
  } catch (_) {
    sessionInfo = null;
    return null;
  }
}

function renderApiKeyScopes() {
  if (!els.apiKeyScopes) return;
  els.apiKeyScopes.innerHTML = apiKeyScopes.map(scope => `
    <label class="toggle api-scope-item">
      <input type="checkbox" value="${scope}" checked />
      <span>${scope}</span>
    </label>
  `).join('');
}

function renderMailboxAddressingSettings() {
  const settings = mailboxAddressingSettings || { version: 'v2', defaults: { subdomainRandomLength: 3 } };
  if (els.mailboxFormatV1 && els.mailboxFormatV2) {
    els.mailboxFormatV1.checked = settings.version === 'v1';
    els.mailboxFormatV2.checked = settings.version !== 'v1';
  }
  if (els.mailboxSubLen) {
    els.mailboxSubLen.value = String(settings?.defaults?.subdomainRandomLength || 3);
  }
  if (els.mailboxSettingsStatus) {
    els.mailboxSettingsStatus.textContent = settings.version === 'v1'
      ? '当前默认：原版 xxx@域名'
      : `当前默认：新版 xxx@yyy.域名（yyy 默认 ${settings?.defaults?.subdomainRandomLength || 3} 位）`;
  }
}

async function loadMailboxAddressingSettings() {
  if (sessionInfo?.role !== 'admin') {
    if (els.mailboxSettingsCard) els.mailboxSettingsCard.style.display = 'none';
    return;
  }
  if (els.mailboxSettingsCard) els.mailboxSettingsCard.style.display = '';
  try {
    mailboxAddressingSettings = await getMailboxAddressingSettings();
    renderMailboxAddressingSettings();
  } catch (error) {
    console.error('加载邮箱格式设置失败:', error);
    if (els.mailboxSettingsCard) els.mailboxSettingsCard.style.display = 'none';
  }
}

async function saveMailboxAddressingSettings() {
  if (sessionInfo?.role !== 'admin') return;
  try {
    const version = els.mailboxFormatV1?.checked ? 'v1' : 'v2';
    const subdomainRandomLength = Math.max(3, Math.min(30, Number(els.mailboxSubLen?.value || 3)));
    mailboxAddressingSettings = await updateMailboxAddressingSettings({
      version,
      defaults: {
        subdomainRandomLength
      }
    });
    renderMailboxAddressingSettings();
    showToast('邮箱格式设置已保存', 'success');
  } catch (error) {
    showToast('保存邮箱格式设置失败', 'error');
  }
}

function getSelectedApiKeyScopes() {
  return Array.from(els.apiKeyScopes?.querySelectorAll('input[type="checkbox"]:checked') || []).map(input => input.value);
}

function renderApiKeys() {
  if (!els.apiKeysBody) return;
  if (!apiKeys.length) {
    els.apiKeysBody.innerHTML = '';
    if (els.apiKeyEmpty) els.apiKeyEmpty.style.display = 'block';
    if (els.apiKeyCount) els.apiKeyCount.textContent = '（0 Keys）';
    return;
  }

  if (els.apiKeyEmpty) els.apiKeyEmpty.style.display = 'none';
  if (els.apiKeyCount) els.apiKeyCount.textContent = `（${apiKeys.length} Keys）`;
  els.apiKeysBody.innerHTML = apiKeys.map(item => `
    <tr>
      <td>${item.name}</td>
      <td><span class="api-scope-badges">${(item.scopes || []).map(scope => `<span class="api-scope-badge">${scope}</span>`).join('')}</span></td>
      <td>${item.is_active ? '<span class="status-active">启用</span>' : '<span class="status-inactive">已停用</span>'}</td>
      <td>${formatApiKeyTime(item.last_used_at)}</td>
      <td>${formatApiKeyTime(item.expires_at)}</td>
      <td>${formatApiKeyTime(item.created_at)}</td>
      <td><button class="btn btn-sm danger" data-action="revoke-api-key" data-key-id="${item.id}" ${item.is_active ? '' : 'disabled'}>撤销</button></td>
    </tr>
  `).join('');

  els.apiKeysBody.querySelectorAll('[data-action="revoke-api-key"]').forEach(btn => {
    btn.onclick = async () => {
      const keyId = btn.dataset.keyId;
      const confirmed = await showConfirm('确定撤销这个 API Key 吗？撤销后将立即失效。');
      if (!confirmed) return;
      try {
        await revokeApiKey(keyId);
        showToast('API Key 已撤销', 'success');
        await loadApiKeys();
      } catch (_) {
        showToast('撤销 API Key 失败', 'error');
      }
    };
  });
}

async function loadApiKeys() {
  if (els.apiKeysLoading) els.apiKeysLoading.style.display = 'flex';
  try {
    const [meta, data] = await Promise.all([getApiKeyMeta(), getApiKeys()]);
    apiKeyScopes = Array.isArray(meta?.scopes) ? meta.scopes : [];
    apiKeys = Array.isArray(data?.list) ? data.list : [];
    renderApiKeyScopes();
    renderApiKeys();
  } catch (error) {
    console.error('加载 API Keys 失败:', error);
    showToast('加载 API Keys 失败', 'error');
  } finally {
    if (els.apiKeysLoading) els.apiKeysLoading.style.display = 'none';
  }
}

function openApiKeyResultModal(rawKey) {
  if (els.apiKeyValue) els.apiKeyValue.value = rawKey || '';
  els.apiKeyResultModal?.classList.add('show');
}

async function handleCreateApiKey() {
  const name = els.apiKeyName?.value.trim();
  const scopes = getSelectedApiKeyScopes();
  const expires_at = els.apiKeyExpiresAt?.value || null;

  if (!name) {
    showToast('请输入 API Key 名称', 'error');
    return;
  }
  if (!scopes.length) {
    showToast('至少选择一个权限范围', 'error');
    return;
  }

  try {
    const result = await createApiKey({ name, scopes, expires_at });
    if (!result?.success || !result?.key) {
      throw new Error('创建失败');
    }
    els.apiKeyCreateModal?.classList.remove('show');
    if (els.apiKeyName) els.apiKeyName.value = '';
    if (els.apiKeyExpiresAt) els.apiKeyExpiresAt.value = '';
    renderApiKeyScopes();
    await loadApiKeys();
    openApiKeyResultModal(result?.key || '');
    showToast('API Key 创建成功', 'success');
  } catch (error) {
    showToast('创建 API Key 失败', 'error');
  }
}

// 加载用户列表
async function loadUsers() {
  if (els.usersLoading) els.usersLoading.style.display = 'flex';
  if (els.usersTbody) els.usersTbody.innerHTML = generateSkeletonRows(5);

  try {
    const data = await getUsers({ page: currentPage, size: pageSize });
    const users = Array.isArray(data) ? data : (data.list || []);
    totalUsers = data.total || users.length;

    renderUserList(users, els.usersTbody);
    updatePagination();
    if (els.usersCount) els.usersCount.textContent = totalUsers;

    bindUserEvents();
  } catch (e) {
    console.error('加载用户失败:', e);
    showToast('加载失败', 'error');
  } finally {
    if (els.usersLoading) els.usersLoading.style.display = 'none';
  }
}

// 更新分页
function updatePagination() {
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  if (els.pageInfo) els.pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
  if (els.prevPage) els.prevPage.disabled = currentPage <= 1;
  if (els.nextPage) els.nextPage.disabled = currentPage >= totalPages;
}

// 绑定用户操作事件
function bindUserEvents() {
  els.usersTbody?.querySelectorAll('.user-row.clickable').forEach(row => {
    row.onclick = async (e) => {
      if (e.target.closest('[data-action]')) return;

      const userId = row.dataset.userId;
      if (userId) {
        els.usersTbody.querySelectorAll('.user-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        await openMailboxesPanel(userId);
      }
    };
  });

  els.usersTbody?.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      await openEditModal(userId);
    };
  });
}

async function openEditModal(userId) {
  try {
    const data = await getUsers({ page: 1, size: 100 });
    const users = Array.isArray(data) ? data : (data.list || []);
    const user = users.find(u => u.id == userId);
    if (!user) { showToast('用户不存在', 'error'); return; }

    currentViewingUser = user;
    fillEditForm(els, user);
    els.editModal?.classList.add('show');
  } catch(e) {
    showToast('加载用户信息失败', 'error');
  }
}

async function saveEdit() {
  if (!currentViewingUser) return;

  const formData = collectEditFormData(els);
  const validation = validateEditForm(formData, false);
  if (!validation.valid) {
    showToast(validation.error, 'error');
    return;
  }

  try {
    await updateUser(currentViewingUser.id, formData);
    showToast('保存成功', 'success');
    els.editModal?.classList.remove('show');
    loadUsers();
  } catch(e) {
    showToast('保存失败', 'error');
  }
}

async function openMailboxesPanel(userId) {
  try {
    const data = await getUsers({ page: 1, size: 100 });
    const users = Array.isArray(data) ? data : (data.list || []);
    const user = users.find(u => u.id == userId);
    if (!user) { showToast('用户不存在', 'error'); return; }

    currentViewingUser = user;
    mailboxPage = 1;
    await loadUserMailboxes();

    if (els.userMailboxes) els.userMailboxes.style.display = 'block';
    if (els.aName) els.aName.value = user.username;
  } catch(e) {
    showToast('加载失败', 'error');
  }
}

async function loadUserMailboxes() {
  if (!currentViewingUser) return;
  if (els.userMailboxesLoading) els.userMailboxesLoading.style.display = 'flex';

  try {
    const data = await getUserMailboxes(currentViewingUser.id, { page: mailboxPage, size: mailboxPageSize });
    const list = Array.isArray(data) ? data : (data.list || []);
    totalMailboxes = data.total || list.length;

    if (els.mailboxesCount) els.mailboxesCount.textContent = totalMailboxes;

    const container = els.userMailboxes?.querySelector('.mailbox-list');
    if (container) {
      container.innerHTML = list.length ? list.map(m => `
        <div class="mailbox-item clickable" data-address="${m.address}" data-href="/?mailbox=${encodeURIComponent(m.address)}">
          <span class="address">${m.address}</span>
          <button class="btn btn-sm danger" data-action="unassign">取消分配</button>
        </div>
      `).join('') : '<div class="empty">暂无邮箱</div>';

      container.querySelectorAll('.mailbox-item.clickable').forEach(item => {
        item.onclick = (e) => {
          if (e.target.closest('[data-action]')) return;
          const href = item.dataset.href;
          if (href) location.href = href;
        };
      });

      container.querySelectorAll('[data-action="unassign"]').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const address = btn.closest('[data-address]')?.dataset.address;
          if (!address) return;

          const confirmed = await showConfirm(`确定取消分配邮箱 ${address}？`);
          if (!confirmed) return;

          try {
            await unassignMailbox(currentViewingUser.username, address);
            showToast('已取消分配', 'success');
            loadUserMailboxes();
          } catch(e) { showToast('取消分配失败', 'error'); }
        };
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalMailboxes / mailboxPageSize));
    if (els.mailboxesPageInfo) els.mailboxesPageInfo.textContent = `${mailboxPage} / ${totalPages}`;
    if (els.mailboxesPrevPage) els.mailboxesPrevPage.disabled = mailboxPage <= 1;
    if (els.mailboxesNextPage) els.mailboxesNextPage.disabled = mailboxPage >= totalPages;
  } catch(e) {
    showToast('加载邮箱失败', 'error');
  } finally {
    if (els.userMailboxesLoading) els.userMailboxesLoading.style.display = 'none';
  }
}

async function handleCreateUser() {
  const username = els.uName?.value.trim();
  const password = els.uPass?.value.trim();
  const role = els.uRole?.value || 'user';

  if (!username || !password) {
    showToast('用户名和密码不能为空', 'error');
    return;
  }

  try {
    await createUser({ username, password, role });
    showToast('用户创建成功', 'success');
    els.uModal?.classList.remove('show');
    els.uName.value = '';
    els.uPass.value = '';
    loadUsers();
  } catch(e) {
    showToast('创建失败', 'error');
  }
}

async function handleAssignMailbox() {
  const username = els.aName?.value.trim();
  const addressText = els.aMail?.value.trim();

  if (!username) {
    showToast('请输入用户名', 'error');
    return;
  }

  if (!addressText) {
    showToast('请输入邮箱地址', 'error');
    return;
  }

  const addresses = addressText.split('\n').map(a => a.trim()).filter(a => a);
  if (addresses.length === 0) {
    showToast('请输入有效的邮箱地址', 'error');
    return;
  }

  try {
    let successCount = 0;
    let failCount = 0;
    for (const address of addresses) {
      try {
        await assignMailbox(username, address);
        successCount++;
      } catch(e) {
        failCount++;
      }
    }

    if (successCount > 0 && failCount === 0) {
      showToast(`成功分配 ${successCount} 个邮箱`, 'success');
    } else if (successCount > 0 && failCount > 0) {
      showToast(`成功 ${successCount} 个，失败 ${failCount} 个`, 'warning');
    } else {
      showToast('分配失败', 'error');
    }

    els.aModal?.classList.remove('show');
    els.aMail.value = '';
    els.aName.value = '';

    if (currentViewingUser && currentViewingUser.username === username) {
      loadUserMailboxes();
    }
  } catch(e) {
    showToast('分配失败', 'error');
  }
}

async function handleUnassignMailbox() {
  const username = els.unassignName?.value.trim();
  const addressText = els.unassignMail?.value.trim();

  if (!username) {
    showToast('请输入用户名', 'error');
    return;
  }

  if (!addressText) {
    showToast('请输入邮箱地址', 'error');
    return;
  }

  const addresses = addressText.split('\n').map(a => a.trim()).filter(a => a);
  if (addresses.length === 0) {
    showToast('请输入有效的邮箱地址', 'error');
    return;
  }

  try {
    let successCount = 0;
    let failCount = 0;
    for (const address of addresses) {
      try {
        await unassignMailbox(username, address);
        successCount++;
      } catch(e) {
        failCount++;
      }
    }

    if (successCount > 0 && failCount === 0) {
      showToast(`成功取消分配 ${successCount} 个邮箱`, 'success');
    } else if (successCount > 0 && failCount > 0) {
      showToast(`成功 ${successCount} 个，失败 ${failCount} 个`, 'warning');
    } else {
      showToast('取消分配失败', 'error');
    }

    els.unassignModal?.classList.remove('show');
    els.unassignMail.value = '';
    els.unassignName.value = '';

    if (currentViewingUser && currentViewingUser.username === username) {
      loadUserMailboxes();
    }
  } catch(e) {
    showToast('取消分配失败', 'error');
  }
}

// 事件绑定
els.back?.addEventListener('click', () => history.back());
els.logout?.addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST' }); } catch(_) {} location.replace('/html/login.html'); });
els.usersRefresh?.addEventListener('click', loadUsers);
els.prevPage?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadUsers(); }});
els.nextPage?.addEventListener('click', () => { const totalPages = Math.ceil(totalUsers / pageSize); if (currentPage < totalPages) { currentPage++; loadUsers(); }});

els.uOpen?.addEventListener('click', () => els.uModal?.classList.add('show'));
els.uClose?.addEventListener('click', () => els.uModal?.classList.remove('show'));
els.uCancel?.addEventListener('click', () => els.uModal?.classList.remove('show'));
els.uCreate?.addEventListener('click', handleCreateUser);

els.aOpen?.addEventListener('click', () => els.aModal?.classList.add('show'));
els.aClose?.addEventListener('click', () => els.aModal?.classList.remove('show'));
els.aCancel?.addEventListener('click', () => els.aModal?.classList.remove('show'));
els.aAssign?.addEventListener('click', handleAssignMailbox);

els.unassignOpen?.addEventListener('click', () => els.unassignModal?.classList.add('show'));
els.unassignClose?.addEventListener('click', () => els.unassignModal?.classList.remove('show'));
els.unassignCancel?.addEventListener('click', () => els.unassignModal?.classList.remove('show'));
els.unassignSubmit?.addEventListener('click', handleUnassignMailbox);

els.editClose?.addEventListener('click', () => els.editModal?.classList.remove('show'));
els.editCancel?.addEventListener('click', () => els.editModal?.classList.remove('show'));
els.editSave?.addEventListener('click', saveEdit);
els.editDelete?.addEventListener('click', async () => {
  if (!currentViewingUser) return;
  const confirmed = await showConfirm(`确定删除用户 ${currentViewingUser.username}？`);
  if (!confirmed) return;
  try {
    await deleteUser(currentViewingUser.id);
    showToast('删除成功', 'success');
    els.editModal?.classList.remove('show');
    loadUsers();
  } catch (_) {
    showToast('删除失败', 'error');
  }
});

els.mailboxesPrevPage?.addEventListener('click', () => {
  if (mailboxPage > 1) {
    mailboxPage--;
    loadUserMailboxes();
  }
});
els.mailboxesNextPage?.addEventListener('click', () => {
  const totalPages = Math.ceil(totalMailboxes / mailboxPageSize);
  if (mailboxPage < totalPages) {
    mailboxPage++;
    loadUserMailboxes();
  }
});

els.apiKeysRefresh?.addEventListener('click', loadApiKeys);
els.apiKeyCreateOpen?.addEventListener('click', () => els.apiKeyCreateModal?.classList.add('show'));
els.apiKeyCreateClose?.addEventListener('click', () => els.apiKeyCreateModal?.classList.remove('show'));
els.apiKeyCreateCancel?.addEventListener('click', () => els.apiKeyCreateModal?.classList.remove('show'));
els.apiKeyCreateSubmit?.addEventListener('click', handleCreateApiKey);
els.apiKeyResultClose?.addEventListener('click', () => els.apiKeyResultModal?.classList.remove('show'));
els.apiKeyResultOk?.addEventListener('click', () => els.apiKeyResultModal?.classList.remove('show'));
els.apiKeyCopy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.apiKeyValue?.value || '');
    showToast('已复制 API Key', 'success');
  } catch (_) {
    showToast('复制失败', 'error');
  }
});
els.mailboxSettingsSave?.addEventListener('click', saveMailboxAddressingSettings);

(async function init() {
  await loadSessionInfo();
  await Promise.all([
    loadUsers(),
    loadApiKeys(),
    loadMailboxAddressingSettings()
  ]);
})();
