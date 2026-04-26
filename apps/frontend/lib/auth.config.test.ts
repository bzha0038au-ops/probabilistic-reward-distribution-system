import { describe, expect, it } from 'vitest';

import { authConfig } from '@/lib/auth.config';

describe('authConfig callbacks', () => {
  it('stores the backend token on the server JWT state', async () => {
    const token = await authConfig.callbacks.jwt?.({
      token: {},
      user: {
        id: '42',
        role: 'admin',
        backendToken: 'server-only-token',
      },
    } as never);

    expect(token).toMatchObject({
      backendToken: 'server-only-token',
      role: 'admin',
      userId: 42,
    });
  });

  it('keeps the session payload free of the backend token', async () => {
    const session = await authConfig.callbacks.session?.({
      session: {
        expires: '2099-01-01T00:00:00.000Z',
        user: {},
      },
      token: {
        backendToken: 'server-only-token',
        role: 'admin',
        userId: 42,
      },
    } as never);

    expect(session).toMatchObject({
      user: {
        id: 42,
        role: 'admin',
      },
    });
    expect(session).not.toHaveProperty('backendToken');
  });
});
