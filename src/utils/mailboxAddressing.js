/**
 * 邮箱地址格式工具模块
 * @module utils/mailboxAddressing
 */

import { generateRandomId } from './common.js';

export const MAILBOX_ADDRESSING_KEY = 'mailbox_addressing';

export const DEFAULT_MAILBOX_ADDRESSING_SETTINGS = {
  version: 'v2',
  defaults: {
    localRandomLength: 8,
    subdomainRandomLength: 3
  },
  limits: {
    localRandomMin: 8,
    localRandomMax: 30,
    subdomainRandomMin: 3,
    subdomainRandomMax: 30
  }
};

export function normalizeMailboxAddressingSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const defaults = source.defaults && typeof source.defaults === 'object' ? source.defaults : {};
  const limits = source.limits && typeof source.limits === 'object' ? source.limits : {};

  const localRandomMin = clampInteger(limits.localRandomMin, 1, 64, DEFAULT_MAILBOX_ADDRESSING_SETTINGS.limits.localRandomMin);
  const localRandomMax = clampInteger(limits.localRandomMax, localRandomMin, 64, DEFAULT_MAILBOX_ADDRESSING_SETTINGS.limits.localRandomMax);
  const subdomainRandomMin = clampInteger(limits.subdomainRandomMin, 1, 63, DEFAULT_MAILBOX_ADDRESSING_SETTINGS.limits.subdomainRandomMin);
  const subdomainRandomMax = clampInteger(limits.subdomainRandomMax, subdomainRandomMin, 63, DEFAULT_MAILBOX_ADDRESSING_SETTINGS.limits.subdomainRandomMax);

  return {
    version: source.version === 'v1' ? 'v1' : 'v2',
    defaults: {
      localRandomLength: clampInteger(defaults.localRandomLength, localRandomMin, localRandomMax, DEFAULT_MAILBOX_ADDRESSING_SETTINGS.defaults.localRandomLength),
      subdomainRandomLength: clampInteger(defaults.subdomainRandomLength, subdomainRandomMin, subdomainRandomMax, DEFAULT_MAILBOX_ADDRESSING_SETTINGS.defaults.subdomainRandomLength)
    },
    limits: {
      localRandomMin,
      localRandomMax,
      subdomainRandomMin,
      subdomainRandomMax
    }
  };
}

export function buildDefaultMailboxAddressingSettingsJson() {
  return JSON.stringify(DEFAULT_MAILBOX_ADDRESSING_SETTINGS);
}

export function clampInteger(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const int = Math.floor(num);
  return Math.max(min, Math.min(max, int));
}

export function normalizeAllowedDomains(mailDomains, fallback = 'temp.example.com') {
  const list = Array.isArray(mailDomains) ? mailDomains : [mailDomains || fallback];
  const normalized = list.map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
  return normalized.length ? normalized : [String(fallback || 'temp.example.com').trim().toLowerCase()];
}

export function validateLocalPart(local) {
  const normalized = String(local || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,64}$/i.test(normalized)) {
    throw new Error('邮箱前缀格式无效');
  }
  return normalized;
}

export function validateSubdomainLabel(subdomain) {
  const normalized = String(subdomain || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,63}$/.test(normalized)) {
    throw new Error('邮箱子域格式无效');
  }
  if (normalized.startsWith('-') || normalized.endsWith('-')) {
    throw new Error('邮箱子域格式无效');
  }
  return normalized;
}

export function splitMailboxAddress(address) {
  const normalized = String(address || '').trim().toLowerCase();
  const at = normalized.indexOf('@');
  if (at <= 0 || at >= normalized.length - 1) {
    throw new Error('邮箱地址格式无效');
  }
  return {
    address: normalized,
    local: normalized.slice(0, at),
    domain: normalized.slice(at + 1)
  };
}

export function buildMailboxAddress({ local, baseDomain, version = 'v2', subdomain = '' }) {
  const normalizedLocal = validateLocalPart(local);
  const normalizedBaseDomain = String(baseDomain || '').trim().toLowerCase();
  if (!normalizedBaseDomain) {
    throw new Error('当前没有可用邮箱域名');
  }
  if (version === 'v1') {
    return `${normalizedLocal}@${normalizedBaseDomain}`;
  }
  const normalizedSubdomain = validateSubdomainLabel(subdomain);
  return `${normalizedLocal}@${normalizedSubdomain}.${normalizedBaseDomain}`;
}

export function generateRandomSubdomain(length = 3) {
  const size = clampInteger(length, 1, 63, 3);
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function resolveDomainIndex(domains, value) {
  if (!Array.isArray(domains) || !domains.length) {
    throw new Error('当前没有可用邮箱域名');
  }
  if (value === null || value === undefined || value === '') {
    return Math.floor(Math.random() * domains.length);
  }
  const idx = Number(value || 0);
  if (!Number.isFinite(idx) || idx < 0) return Math.floor(Math.random() * domains.length);
  return Math.max(0, Math.min(domains.length - 1, Math.floor(idx)));
}

export function resolveFormatVersion(requestedVersion, settings) {
  if (requestedVersion === 'v1' || requestedVersion === 'v2') return requestedVersion;
  return normalizeMailboxAddressingSettings(settings).version;
}

export function resolveLocalRandomLength(requestedLength, settings) {
  const normalized = normalizeMailboxAddressingSettings(settings);
  return clampInteger(
    requestedLength,
    normalized.limits.localRandomMin,
    normalized.limits.localRandomMax,
    normalized.defaults.localRandomLength
  );
}

export function resolveSubdomainRandomLength(requestedLength, settings) {
  const normalized = normalizeMailboxAddressingSettings(settings);
  return clampInteger(
    requestedLength,
    normalized.limits.subdomainRandomMin,
    normalized.limits.subdomainRandomMax,
    normalized.defaults.subdomainRandomLength
  );
}

export function resolveSubdomainValue({
  version,
  subdomain,
  subdomainMode,
  subdomainLength,
  settings
}) {
  if (version === 'v1') return '';
  if (subdomainMode === 'custom') {
    return validateSubdomainLabel(subdomain);
  }
  const length = resolveSubdomainRandomLength(subdomainLength, settings);
  return generateRandomSubdomain(length);
}

export function buildGeneratedMailboxAddress({
  settings,
  domains,
  domainIndex,
  localLength,
  local,
  formatVersion,
  subdomainMode,
  subdomain,
  subdomainLength
}) {
  const normalizedSettings = normalizeMailboxAddressingSettings(settings);
  const resolvedDomains = normalizeAllowedDomains(domains);
  const chosenDomain = resolvedDomains[resolveDomainIndex(resolvedDomains, domainIndex)] || resolvedDomains[0];
  const version = resolveFormatVersion(formatVersion, normalizedSettings);
  const normalizedLocal = local
    ? validateLocalPart(local)
    : generateRandomId(resolveLocalRandomLength(localLength, normalizedSettings));
  const resolvedSubdomain = resolveSubdomainValue({
    version,
    subdomain,
    subdomainMode,
    subdomainLength,
    settings: normalizedSettings
  });

  const address = buildMailboxAddress({
    local: normalizedLocal,
    baseDomain: chosenDomain,
    version,
    subdomain: resolvedSubdomain
  });

  return {
    address,
    local: normalizedLocal,
    domain: version === 'v1' ? chosenDomain : `${resolvedSubdomain}.${chosenDomain}`,
    baseDomain: chosenDomain,
    subdomain: resolvedSubdomain,
    version
  };
}

export function parseConfiguredMailboxAddress(address, allowedDomains) {
  const { address: normalized, local, domain } = splitMailboxAddress(address);
  validateLocalPart(local);
  const domains = normalizeAllowedDomains(allowedDomains);
  for (const allowed of domains) {
    if (domain === allowed) {
      return {
        address: normalized,
        local,
        domain,
        baseDomain: allowed,
        subdomain: '',
        version: 'v1'
      };
    }
    if (domain.endsWith(`.${allowed}`)) {
      const prefix = domain.slice(0, -(allowed.length + 1));
      if (prefix && !prefix.includes('.')) {
        return {
          address: normalized,
          local,
          domain,
          baseDomain: allowed,
          subdomain: validateSubdomainLabel(prefix),
          version: 'v2'
        };
      }
    }
  }
  throw new Error('邮箱域名不在允许列表中');
}
