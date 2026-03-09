import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('$lib/server/api', () => ({
  apiRequest,
}));

import { actions, load } from '../routes/(admin)/security/+page.server';

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

describe('security admin page server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads cursor-based audit data and freeze records with query params', async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [],
          limit: 25,
          hasNext: false,
          hasPrevious: false,
          nextCursor: null,
          prevCursor: null,
          direction: 'next',
          sort: 'desc',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [],
          page: 2,
          limit: 10,
          hasNext: true,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [],
          limit: 25,
          hasNext: false,
          hasPrevious: false,
          nextCursor: null,
          prevCursor: null,
          direction: 'next',
          sort: 'desc',
        },
      });

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      url: new URL(
        'http://localhost/security?email=user@example.com&authLimit=25&freezePage=2&freezeLimit=10'
      ),
    } as never);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {},
      '/admin/auth-events?email=user%40example.com&limit=25'
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {},
      '/admin/freeze-records?limit=10&page=2'
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      expect.any(Function),
      {},
      '/admin/admin-actions?'
    );
    expect(result).toMatchObject({
      error: null,
      authEvents: {
        items: [],
        limit: 25,
      },
      freezeRecords: {
        items: [],
        page: 2,
        limit: 10,
        hasNext: true,
      },
      adminActions: {
        items: [],
        limit: 25,
      },
    });
  });

  it('returns an action failure when createFreeze is missing a user id', async () => {
    const result = await actions.createFreeze({
      request: makeRequest({ reason: 'manual review' }),
      fetch: vi.fn(),
      cookies: {},
    } as never);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 400,
      data: { error: 'Missing user id.' },
    });
  });

  it('calls the release endpoint when releasing a freeze record', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { userId: 88, status: 'released' },
    });

    const result = await actions.releaseFreeze({
      request: makeRequest({ userId: '88' }),
      fetch: vi.fn(),
      cookies: {},
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/freeze-records/88/release',
      { method: 'POST' }
    );
    expect(result).toEqual({ success: true });
  });
});
