/**
 * 域名管理模块
 * @module modules/app/domains
 */

import { cacheGet, cacheSet, readPrefetch } from '../../storage.js';
import { isGuest } from './session.js';

// 域名列表
let domains = [];

export const DEFAULT_MAILBOX_CONFIG = {
  domains: ['example.com'],
  addressing: {
    version: 'v2',
    defaults: { localRandomLength: 8, subdomainRandomLength: 3 },
    limits: { localRandomMin: 8, localRandomMax: 30, subdomainRandomMin: 3, subdomainRandomMax: 30 }
  }
};

// 存储键
export const STORAGE_KEYS = {
  domain: 'mailfree:lastDomain',
  length: 'mailfree:lastLen',
  formatVersion: 'mailfree:formatVersion',
  subdomainMode: 'mailfree:subdomainMode',
  subdomainLength: 'mailfree:subdomainLen',
  subdomainCustom: 'mailfree:subdomainCustom'
};

/**
 * 获取域名列表
 * @returns {Array}
 */
export function getDomains() {
  return domains;
}

/**
 * 设置域名列表
 * @param {Array} list - 域名列表
 */
export function setDomains(list) {
  domains = Array.isArray(list) ? list : [];
}

/**
 * 填充域名下拉框
 * @param {Array} domainList - 域名列表
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 */
export function populateDomains(domainList, selectElement) {
  if (!selectElement) return;
  const list = Array.isArray(domainList) ? domainList : [];
  selectElement.innerHTML = list.map((d, i) => `<option value="${i}">${d}</option>`).join('');

  const stored = localStorage.getItem(STORAGE_KEYS.domain) || '';
  const idx = stored ? list.indexOf(stored) : -1;
  selectElement.selectedIndex = idx >= 0 ? idx : 0;

  selectElement.onchange = () => {
    const opt = selectElement.options[selectElement.selectedIndex];
    if (opt) localStorage.setItem(STORAGE_KEYS.domain, opt.textContent || '');
  };

  setDomains(list);
}

/**
 * 从 API 加载域名列表
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 * @param {Function} api - API 函数
 */
export async function loadDomains(selectElement, api) {
  if (isGuest()) {
    populateDomains(DEFAULT_MAILBOX_CONFIG.domains, selectElement);
    return DEFAULT_MAILBOX_CONFIG;
  }

  let domainList = null;

  try {
    const r = await api('/api/domains');
    const directDomains = await r.json();
    if (Array.isArray(directDomains) && directDomains.length) {
      populateDomains(directDomains, selectElement);
      domainList = directDomains;
    }
  } catch(_) {}

  if (!domainList) {
    try {
      const prefetched = readPrefetch('mf:prefetch:mailbox-config');
      if (prefetched && Array.isArray(prefetched.domains) && prefetched.domains.length) {
        populateDomains(prefetched.domains, selectElement);
        domainList = prefetched.domains;
      }
    } catch(_) {}
  }

  if (!domainList) {
    try {
      const cached = cacheGet('mailboxConfig', 24 * 60 * 60 * 1000);
      if (cached && Array.isArray(cached.domains) && cached.domains.length) {
        populateDomains(cached.domains, selectElement);
        domainList = cached.domains;
      }
    } catch(_) {}
  }

  let config = null;
  try {
    const r = await api('/api/mailbox/config');
    const mailboxConfig = await r.json();
    if (mailboxConfig && mailboxConfig.addressing) {
      if (!domainList && Array.isArray(mailboxConfig.domains) && mailboxConfig.domains.length) {
        populateDomains(mailboxConfig.domains, selectElement);
        domainList = mailboxConfig.domains;
      }
      cacheSet('mailboxConfig', mailboxConfig);
      config = mailboxConfig;
    }
  } catch(_) {}

  if (!domainList) {
    const meta = (document.querySelector('meta[name="mail-domains"]')?.getAttribute('content') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    domainList = [...new Set(meta)].filter(Boolean);
    populateDomains(domainList, selectElement);
  }

  return config || {
    domains: domainList,
    addressing: DEFAULT_MAILBOX_CONFIG.addressing
  };
}

/**
 * 获取存储的长度
 * @returns {number}
 */
export function getStoredLength() {
  const stored = Number(localStorage.getItem(STORAGE_KEYS.length) || '8');
  return Math.max(8, Math.min(30, isNaN(stored) ? 8 : stored));
}

export function getStoredFormatVersion() {
  const stored = localStorage.getItem(STORAGE_KEYS.formatVersion) || 'v2';
  return stored === 'v1' ? 'v1' : 'v2';
}

export function saveFormatVersion(version) {
  const next = version === 'v1' ? 'v1' : 'v2';
  if (localStorage.getItem(STORAGE_KEYS.formatVersion) !== next) {
    localStorage.setItem(STORAGE_KEYS.formatVersion, next);
  }
}

export function getStoredSubdomainMode() {
  const stored = localStorage.getItem(STORAGE_KEYS.subdomainMode) || 'random';
  return stored === 'custom' ? 'custom' : 'random';
}

export function saveSubdomainMode(mode) {
  const next = mode === 'custom' ? 'custom' : 'random';
  if (localStorage.getItem(STORAGE_KEYS.subdomainMode) !== next) {
    localStorage.setItem(STORAGE_KEYS.subdomainMode, next);
  }
}

export function getStoredSubdomainLength() {
  const stored = Number(localStorage.getItem(STORAGE_KEYS.subdomainLength) || '3');
  return Math.max(3, Math.min(30, isNaN(stored) ? 3 : stored));
}

export function saveSubdomainLength(length) {
  const clamped = Math.max(3, Math.min(30, isNaN(length) ? 3 : Number(length)));
  if (localStorage.getItem(STORAGE_KEYS.subdomainLength) !== String(clamped)) {
    localStorage.setItem(STORAGE_KEYS.subdomainLength, String(clamped));
  }
}

export function getStoredSubdomainCustom() {
  return (localStorage.getItem(STORAGE_KEYS.subdomainCustom) || '').trim().toLowerCase();
}

export function saveSubdomainCustom(value) {
  const next = String(value || '').trim().toLowerCase();
  if (localStorage.getItem(STORAGE_KEYS.subdomainCustom) !== next) {
    localStorage.setItem(STORAGE_KEYS.subdomainCustom, next);
  }
}

/**
 * 保存长度
 * @param {number} length - 长度
 */
export function saveLength(length) {
  const clamped = Math.max(8, Math.min(30, isNaN(length) ? 8 : length));
  localStorage.setItem(STORAGE_KEYS.length, String(clamped));
}

/**
 * 获取选中的域名索引
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 * @returns {number}
 */
export function getSelectedDomainIndex(selectElement) {
  return Number(selectElement?.value || 0);
}

/**
 * 更新范围滑块进度
 * @param {HTMLInputElement} input - 滑块元素
 */
export function updateRangeProgress(input) {
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const val = Number(input.value || min);
  const percent = ((val - min) * 100) / (max - min);
  input.style.background = `linear-gradient(to right, var(--primary) ${percent}%, var(--border-light) ${percent}%)`;
}

export default {
  getDomains,
  setDomains,
  populateDomains,
  loadDomains,
  getStoredLength,
  getStoredFormatVersion,
  saveFormatVersion,
  getStoredSubdomainMode,
  saveSubdomainMode,
  getStoredSubdomainLength,
  saveSubdomainLength,
  getStoredSubdomainCustom,
  saveSubdomainCustom,
  saveLength,
  getSelectedDomainIndex,
  updateRangeProgress,
  STORAGE_KEYS
};
