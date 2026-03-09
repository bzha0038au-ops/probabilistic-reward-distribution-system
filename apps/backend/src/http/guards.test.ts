import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSystemFlags,
  isUserFrozen,
  sendError,
  store,
  verifyAdminSessionToken,
  verifyUserSessionToken,
} = vi.hoisted(() => ({
  store: {} as { userId?: number; role?: 'user' | 'admin' },
  verifyUserSessionToken: vi.fn(),
  verifyAdminSessionToken: vi.fn(),
  isUserFrozen: vi.fn(),
  getSystemFlags: vi.fn(),
  sendError: vi.fn((_reply, status: number, message: string) => ({
    status,
    message,
  })),
}));

vi.mock('../shared/context', () => ({
  context: () => ({
    getStore: () => store,
  }),
}));

vi.mock('../shared/user-session', () => ({
  USER_SESSION_COOKIE: 'reward_user_session',
  verifyUserSessionToken,
}));

vi.mock('../shared/admin-session', () => ({
  ADMIN_SESSION_COOKIE: 'reward_admin_session',
  verifyAdminSessionToken,
}));

vi.mock('../modules/risk/service', () => ({
  isUserFrozen,
}));

vi.mock('../modules/system/service', () => ({
  getSystemFlags,
}));

vi.mock('./respond', () => ({
  sendError,
}));

vi.mock('../db', () => ({
  db: {},
}));

import {
  requireAdmin,
  requireAdminGuard,
  requireUser,
  requireUserGuard,
} from './guards';

describe('auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete store.userId;
    delete store.role;
    getSystemFlags.mockResolvedValue({ maintenanceMode: false });
    isUserFrozen.mockResolvedValue(false);
  });

  it('resolves a user from the bearer token and stores actor context', async () => {
    const request = {
      headers: { authorization: 'Bearer user-token' },
      cookies: {},
    } as const;
    verifyUserSessionToken.mockResolvedValue({
      userId: 42,
      email: 'user@example.com',
      role: 'user',
    });

    const user = await requireUser(request as never);

    expect(verifyUserSessionToken).toHaveBeenCalledWith('user-token');
    expect(user).toEqual({
      userId: 42,
      email: 'user@example.com',
      role: 'user',
    });
    expect(store).toEqual({ userId: 42, role: 'user' });
  });

  it('returns 401 when the user session is missing', async () => {
    const request = { headers: {}, cookies: {} };
    const reply = {};
    verifyUserSessionToken.mockResolvedValue(null);

    const result = await requireUserGuard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(reply, 401, 'Unauthorized');
    expect(result).toEqual({ status: 401, message: 'Unauthorized' });
  });

  it('blocks user requests during maintenance', async () => {
    const request = { headers: {}, cookies: { reward_user_session: 'cookie-token' } };
    const reply = {};
    verifyUserSessionToken.mockResolvedValue({
      userId: 7,
      email: 'user@example.com',
      role: 'user',
    });
    getSystemFlags.mockResolvedValue({ maintenanceMode: true });

    const result = await requireUserGuard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(reply, 503, 'System under maintenance.');
    expect(result).toEqual({
      status: 503,
      message: 'System under maintenance.',
    });
  });

  it('attaches the authenticated user when the request is allowed', async () => {
    const request = { headers: {}, cookies: { reward_user_session: 'cookie-token' } };
    const reply = {};
    const user = {
      userId: 9,
      email: 'user@example.com',
      role: 'user' as const,
    };
    verifyUserSessionToken.mockResolvedValue(user);

    await requireUserGuard(request as never, reply as never);

    expect(sendError).not.toHaveBeenCalled();
    expect((request as { user?: unknown }).user).toEqual(user);
  });

  it('blocks frozen admins and still resolves the session from cookies', async () => {
    const request = { headers: {}, cookies: { reward_admin_session: 'admin-token' } };
    const reply = {};
    verifyAdminSessionToken.mockResolvedValue({
      userId: 11,
      email: 'admin@example.com',
      role: 'admin',
    });
    isUserFrozen.mockResolvedValue(true);

    const admin = await requireAdmin(request as never);
    const result = await requireAdminGuard(request as never, reply as never);

    expect(admin).toEqual({
      userId: 11,
      email: 'admin@example.com',
      role: 'admin',
    });
    expect(verifyAdminSessionToken).toHaveBeenCalledWith('admin-token');
    expect(sendError).toHaveBeenCalledWith(reply, 423, 'Account locked.');
    expect(result).toEqual({ status: 423, message: 'Account locked.' });
    expect(store).toEqual({ userId: 11, role: 'admin' });
  });
});
