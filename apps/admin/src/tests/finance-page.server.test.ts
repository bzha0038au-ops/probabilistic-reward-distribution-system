import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('$lib/server/api', () => ({
  apiRequest,
}));

import { actions, load } from '../routes/(admin)/finance/+page.server';

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

describe('finance admin page server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads deposits and withdrawals from the backend API', async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: [{ id: 1, userId: 10, amount: '25.00', status: 'pending' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [{ id: 2, userId: 11, amount: '40.00', status: 'approved' }],
      });

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
    } as never);

    expect(apiRequest).toHaveBeenNthCalledWith(1, expect.any(Function), {}, '/admin/deposits');
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {},
      '/admin/withdrawals'
    );
    expect(result).toEqual({
      deposits: [{ id: 1, userId: 10, amount: '25.00', status: 'pending' }],
      withdrawals: [{ id: 2, userId: 11, amount: '40.00', status: 'approved' }],
      error: null,
    });
  });

  it('returns an action failure when the deposit id is missing', async () => {
    const result = await actions.approveDeposit({
      request: makeRequest(),
      fetch: vi.fn(),
      cookies: {},
    } as never);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 400,
      data: { error: 'Missing deposit id.' },
    });
  });

  it('calls the backend approval endpoint for a valid deposit id', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 5, status: 'success' },
    });

    const result = await actions.approveDeposit({
      request: makeRequest({ id: '5', totpCode: '123456' }),
      fetch: vi.fn(),
      cookies: {},
    } as never);

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      '/admin/deposits/5/approve',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode: '123456' }),
      }
    );
    expect(result).toEqual({ success: true });
  });
});
