import { describe, expect, it } from 'vitest';

import {
  buildBrowserBackendUrl,
  normalizeBackendPath,
  resolveBackendProxyRoute,
} from '@/lib/api/proxy';

describe('api proxy helpers', () => {
  it('normalizes backend paths before building browser urls', () => {
    expect(normalizeBackendPath('wallet')).toBe('/wallet');
    expect(normalizeBackendPath('//draw')).toBe('/draw');
    expect(buildBrowserBackendUrl('wallet')).toBe('/api/backend/wallet');
  });

  it('allows only whitelisted browser routes', () => {
    expect(resolveBackendProxyRoute('GET', '/wallet')).toEqual({
      matched: true,
      normalizedPath: '/wallet',
      requiresAuth: true,
      methods: ['GET'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/draw')).toEqual({
      matched: true,
      normalizedPath: '/draw',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/auth/user/session')).toEqual({
      matched: false,
      normalizedPath: '/auth/user/session',
    });
  });

  it('exposes method mismatch for matched routes', () => {
    expect(resolveBackendProxyRoute('POST', '/wallet')).toEqual({
      matched: true,
      normalizedPath: '/wallet',
      requiresAuth: true,
      methods: ['GET'],
      methodAllowed: false,
    });
  });
});
