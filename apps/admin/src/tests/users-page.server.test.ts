import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('$lib/server/api', () => ({
  apiRequest,
}));

import { load as searchLoad } from '../routes/(admin)/(c)/users/+page.server';
import {
  actions as detailActions,
  load as detailLoad,
} from '../routes/(admin)/(c)/users/[userId]/+page.server';

const makeRequest = (entries: Record<string, string> = {}) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }

  return new Request('http://localhost/actions', {
    method: 'POST',
    body: formData,
  });
};

const detailFixture = {
  user: {
    id: 42,
    email: 'user@example.com',
    phone: '+15551234567',
    role: 'user',
    birthDate: null,
    registrationCountryCode: null,
    countryTier: 'full',
    countryResolvedAt: '2026-04-28T00:05:00.000Z',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T01:00:00.000Z',
    emailVerifiedAt: '2026-04-28T00:10:00.000Z',
    phoneVerifiedAt: '2026-04-28T00:20:00.000Z',
    userPoolBalance: '12.00',
    pityStreak: 3,
    lastDrawAt: '2026-04-28T02:00:00.000Z',
    lastWinAt: '2026-04-28T02:05:00.000Z',
    kycProfileId: 12,
    kycTier: 'tier_2',
    kycTierSource: 'kyc_profile',
    activeScopes: ['gameplay_lock'],
    jurisdiction: {
      registrationCountryCode: 'US',
      birthDate: null,
      countryTier: 'full',
      minimumAge: 18,
      userAge: 28,
      isOfAge: true,
      allowedFeatures: ['real_money_gameplay', 'topup', 'withdrawal'],
      blockedScopes: [],
      restrictionReasons: [],
      countryResolvedAt: '2026-04-28T00:05:00.000Z',
    },
  },
  wallet: {
    withdrawableBalance: '8.00',
    bonusBalance: '4.00',
    lockedBalance: '1.00',
    wageredAmount: '20.00',
    updatedAt: '2026-04-28T03:00:00.000Z',
  },
  freezes: [
    {
      id: 7,
      userId: 42,
      category: 'risk',
      reason: 'manual_admin',
      scope: 'gameplay_lock',
      status: 'active',
      metadata: null,
      createdAt: '2026-04-28T03:00:00.000Z',
      releasedAt: null,
    },
  ],
  recentDraws: [],
  recentPayments: [],
  recentLoginIps: [],
};

describe('users admin pages server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns idle search results when no query is provided', async () => {
    const result = await searchLoad({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      url: new URL('http://localhost/users'),
    } as never);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      query: '',
      error: null,
      results: {
        query: '',
        limit: 20,
        items: [],
      },
    });
  });

  it('loads search results from the backend users endpoint', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        query: 'user@example.com',
        limit: 20,
        items: [
          {
            id: 42,
            email: 'user@example.com',
            phone: '+15551234567',
            createdAt: '2026-04-28T00:00:00.000Z',
            emailVerifiedAt: '2026-04-28T00:10:00.000Z',
            phoneVerifiedAt: '2026-04-28T00:20:00.000Z',
            kycTier: 'tier_2',
            activeScopes: ['gameplay_lock'],
          },
        ],
      },
    });

    const result = await searchLoad({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      url: new URL('http://localhost/users?query=user@example.com'),
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/users?query=user%40example.com&limit=20'
    );
    expect(result).toMatchObject({
      query: 'user@example.com',
      error: null,
      results: {
        items: [
          expect.objectContaining({
            id: 42,
            email: 'user@example.com',
            kycTier: 'tier_2',
          }),
        ],
      },
    });
  });

  it('returns an error when the detail route receives an invalid user id', async () => {
    const result = await detailLoad({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      params: { userId: 'invalid' },
    } as never);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      detail: null,
      error: 'Invalid user id.',
    });
  });

  it('loads user detail from the backend users endpoint', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: detailFixture,
    });

    const result = await detailLoad({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      params: { userId: '42' },
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/users/42'
    );
    expect(result).toMatchObject({
      detail: expect.objectContaining({
        user: expect.objectContaining({
          id: 42,
          kycTier: 'tier_2',
        }),
      }),
      error: null,
    });
  });

  it('submits a scoped freeze with category, reason, and MFA step-up', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 7, status: 'active' },
    });

    const result = await detailActions.freezeScope({
      request: makeRequest({
        totpCode: '123456',
        category: 'support',
        reason: 'manual_admin',
        scope: 'gameplay_lock',
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      params: { userId: '42' },
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/users/42/freeze',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totpCode: '123456',
          breakGlassCode: null,
          scope: 'gameplay_lock',
          category: 'support',
          reason: 'manual_admin',
        }),
      }
    );
    expect(result).toMatchObject({
      success: true,
      action: 'freeze',
    });
  });

  it('submits a scoped unfreeze with release reason and MFA step-up', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 7, status: 'released' },
    });

    const result = await detailActions.unfreezeScope({
      request: makeRequest({
        totpCode: '123456',
        scope: 'gameplay_lock',
        releaseReason: 'review complete',
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      params: { userId: '42' },
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/users/42/unfreeze',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totpCode: '123456',
          breakGlassCode: null,
          scope: 'gameplay_lock',
          reason: 'review complete',
        }),
      }
    );
    expect(result).toMatchObject({
      success: true,
      action: 'unfreeze',
    });
  });

  it('submits force logout and password reset actions through the backend user endpoints', async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: { userId: 42, revokedCount: 2 },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          userId: 42,
          email: 'user@example.com',
          expiresAt: '2026-04-29T00:00:00.000Z',
        },
      });

    const logoutResult = await detailActions.forceLogout({
      request: makeRequest({
        totpCode: '123456',
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      params: { userId: '42' },
    } as never);

    const resetResult = await detailActions.resetPassword({
      request: makeRequest({
        totpCode: '123456',
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: 'en' },
      params: { userId: '42' },
    } as never);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {},
      '/admin/users/42/force-logout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totpCode: '123456',
          breakGlassCode: null,
        }),
      }
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {},
      '/admin/users/42/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totpCode: '123456',
          breakGlassCode: null,
        }),
      }
    );
    expect(logoutResult).toMatchObject({
      success: true,
      action: 'logout',
    });
    expect(resetResult).toMatchObject({
      success: true,
      action: 'reset',
    });
  });
});
