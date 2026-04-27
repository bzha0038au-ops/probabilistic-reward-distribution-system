import { describe, expect, it } from 'vitest';

import {
  buildBrowserBackendUrl,
  normalizeBackendPath,
  resolveBackendProxyRoute,
} from '@/lib/api/proxy';
import { USER_API_ROUTES } from '@/lib/api/user';

const browserRouteExpectations = [
  ['GET', USER_API_ROUTES.auth.session],
  ['DELETE', USER_API_ROUTES.auth.session],
  ['GET', '/transactions'],
  ['GET', '/bank-cards'],
  ['POST', '/bank-cards'],
  ['GET', '/crypto-deposit-channels'],
  ['POST', '/crypto-deposits'],
  ['GET', '/crypto-withdraw-addresses'],
  ['POST', '/crypto-withdraw-addresses'],
  ['PATCH', '/crypto-withdraw-addresses/42/default'],
  ['GET', '/top-ups'],
  ['POST', '/top-ups'],
  ['GET', '/withdrawals'],
  ['POST', '/withdrawals'],
  ['POST', '/crypto-withdrawals'],
  ['POST', '/auth/phone-verification/request'],
  ['POST', '/auth/phone-verification/confirm'],
  ['GET', '/rewards/center'],
  ['POST', '/rewards/claim'],
  ['GET', USER_API_ROUTES.blackjack],
  ['POST', USER_API_ROUTES.blackjackStart],
  ['POST', '/blackjack/12/action'],
  ['GET', USER_API_ROUTES.drawOverview],
  ['GET', USER_API_ROUTES.drawCatalog],
  ['POST', USER_API_ROUTES.drawPlay],
  ['POST', USER_API_ROUTES.quickEight],
  ['GET', '/fairness/commit'],
  ['GET', '/fairness/reveal'],
] as const;

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

    expect(resolveBackendProxyRoute('GET', '/rewards/center')).toEqual({
      matched: true,
      normalizedPath: '/rewards/center',
      requiresAuth: true,
      methods: ['GET'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/rewards/claim')).toEqual({
      matched: true,
      normalizedPath: '/rewards/claim',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/draw')).toEqual({
      matched: true,
      normalizedPath: '/draw',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/quick-eight')).toEqual({
      matched: true,
      normalizedPath: '/quick-eight',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('GET', '/blackjack')).toEqual({
      matched: true,
      normalizedPath: '/blackjack',
      requiresAuth: true,
      methods: ['GET'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/blackjack/start')).toEqual({
      matched: true,
      normalizedPath: '/blackjack/start',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/blackjack/12/action')).toEqual({
      matched: true,
      normalizedPath: '/blackjack/12/action',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('GET', '/draw/overview')).toEqual({
      matched: true,
      normalizedPath: '/draw/overview',
      requiresAuth: true,
      methods: ['GET'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('GET', '/draw/catalog')).toEqual({
      matched: true,
      normalizedPath: '/draw/catalog',
      requiresAuth: true,
      methods: ['GET'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/draw/play')).toEqual({
      matched: true,
      normalizedPath: '/draw/play',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('GET', '/auth/user/sessions')).toEqual({
      matched: true,
      normalizedPath: '/auth/user/sessions',
      requiresAuth: true,
      methods: ['GET'],
      methodAllowed: true,
    });

    expect(
      resolveBackendProxyRoute('POST', '/auth/phone-verification/request')
    ).toEqual({
      matched: true,
      normalizedPath: '/auth/phone-verification/request',
      requiresAuth: true,
      methods: ['POST'],
      methodAllowed: true,
    });

    expect(resolveBackendProxyRoute('POST', '/auth/user/session')).toEqual({
      matched: true,
      normalizedPath: '/auth/user/session',
      requiresAuth: true,
      methods: ['GET', 'DELETE'],
      methodAllowed: false,
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

  it('covers every browser-side api route currently used by the web app', () => {
    for (const [method, path] of browserRouteExpectations) {
      const resolved = resolveBackendProxyRoute(method, path);
      expect(resolved).toMatchObject({
        matched: true,
        methodAllowed: true,
      });
    }
  });

  it('rejects backend-only or malformed browser routes', () => {
    expect(resolveBackendProxyRoute('GET', '/admin/deposits')).toEqual({
      matched: false,
      normalizedPath: '/admin/deposits',
    });

    expect(resolveBackendProxyRoute('POST', '/payments/webhooks/stripe')).toEqual({
      matched: false,
      normalizedPath: '/payments/webhooks/stripe',
    });

    expect(resolveBackendProxyRoute('GET', '/v1/engine/overview')).toEqual({
      matched: false,
      normalizedPath: '/v1/engine/overview',
    });

    expect(resolveBackendProxyRoute('POST', '/blackjack/not-a-number/action')).toEqual({
      matched: false,
      normalizedPath: '/blackjack/not-a-number/action',
    });

    expect(resolveBackendProxyRoute('PATCH', '/bank-cards/abc/default')).toEqual({
      matched: false,
      normalizedPath: '/bank-cards/abc/default',
    });
  });
});
