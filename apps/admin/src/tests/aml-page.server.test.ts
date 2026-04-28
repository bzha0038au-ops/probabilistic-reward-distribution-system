import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('$lib/server/api', () => ({
  apiRequest,
}));

import { actions, load } from '../routes/(admin)/(c)/aml/+page.server';

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

describe('aml admin page server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the AML queue with query params', async () => {
    apiRequest.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [],
        page: 2,
        limit: 10,
        hasNext: true,
        summary: {
          pendingCount: 3,
          overdueCount: 1,
          slaMinutes: 60,
          oldestPendingAt: null,
        },
      },
    });

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      url: new URL('http://localhost/aml?page=2&limit=10&sort=asc'),
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/aml-checks?limit=10&page=2&sort=asc'
    );
    expect(result).toMatchObject({
      error: null,
      queue: {
        items: [],
        page: 2,
        limit: 10,
        hasNext: true,
        summary: {
          pendingCount: 3,
          overdueCount: 1,
        },
      },
    });
  });

  it('returns an action failure when confirmHit is missing a case id', async () => {
    const result = await actions.confirmHit({
      request: makeRequest({ totpCode: '123456' }),
      fetch: vi.fn(),
      cookies: {},
    } as never);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 400,
      data: { error: 'Missing AML check id.' },
    });
  });

  it('calls the confirm endpoint with note and step-up code', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { amlCheckId: 18, reviewStatus: 'confirmed' },
    });

    const result = await actions.confirmHit({
      request: makeRequest({
        amlCheckId: '18',
        totpCode: '123456',
        note: 'confirmed sanctions match',
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/aml-checks/18/confirm',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totpCode: '123456',
          note: 'confirmed sanctions match',
        }),
      }
    );
    expect(result).toEqual({ success: true, successAction: 'confirm' });
  });
});
