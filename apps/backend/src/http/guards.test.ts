import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  canAdminAccess,
  getAdminAccessProfileByUserId,
  getSystemFlags,
  isUserFrozen,
  sendError,
  store,
  verifyAdminTotpCode,
  verifyAdminSessionToken,
  verifyUserSessionToken,
} = vi.hoisted(() => ({
  store: {} as { userId?: number; role?: 'user' | 'admin' },
  verifyUserSessionToken: vi.fn(),
  verifyAdminSessionToken: vi.fn(),
  getAdminAccessProfileByUserId: vi.fn(),
  canAdminAccess: vi.fn(),
  verifyAdminTotpCode: vi.fn(),
  isUserFrozen: vi.fn(),
  getSystemFlags: vi.fn(),
  sendError: vi.fn(
    (
      _reply,
      status: number,
      message: string,
      _details?: string[],
      code?: string
    ) => ({
      status,
      message,
      code,
    })
  ),
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

vi.mock('../modules/admin-permission/service', () => ({
  canAdminAccess,
  getAdminAccessProfileByUserId,
}));

vi.mock('../modules/admin-mfa/service', () => ({
  verifyAdminTotpCode,
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
  requireAdminPermission,
  requireUser,
  requireUserGuard,
} from './guards';
import { ADMIN_PERMISSION_KEYS } from '../modules/admin-permission/definitions';

describe('auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete store.userId;
    delete store.role;
    getSystemFlags.mockResolvedValue({ maintenanceMode: false });
    isUserFrozen.mockResolvedValue(false);
    getAdminAccessProfileByUserId.mockResolvedValue({
      adminId: 101,
      userId: 11,
      displayName: null,
      isActive: true,
      mfaEnabled: false,
      mfaSecretCiphertext: null,
      rawPermissions: [],
      permissions: [],
      requiresMfa: false,
    });
    canAdminAccess.mockReturnValue(false);
    verifyAdminTotpCode.mockResolvedValue(false);
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
      sessionId: 'user-session-42',
    });

    const user = await requireUser(request as never);

    expect(verifyUserSessionToken).toHaveBeenCalledWith('user-token');
    expect(user).toEqual({
      userId: 42,
      email: 'user@example.com',
      role: 'user',
      sessionId: 'user-session-42',
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
      sessionId: 'user-session-7',
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
      sessionId: 'user-session-9',
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
      adminId: 101,
      userId: 11,
      email: 'admin@example.com',
      role: 'admin',
      mfaEnabled: false,
      sessionId: 'admin-session-11',
    });
    isUserFrozen.mockResolvedValue(true);

    const admin = await requireAdmin(request as never);
    const result = await requireAdminGuard(request as never, reply as never);

    expect(admin).toEqual({
      adminId: 101,
      userId: 11,
      email: 'admin@example.com',
      role: 'admin',
      mfaEnabled: false,
      sessionId: 'admin-session-11',
      permissions: [],
      requiresMfa: false,
    });
    expect(verifyAdminSessionToken).toHaveBeenCalledWith('admin-token');
    expect(getAdminAccessProfileByUserId).toHaveBeenCalledWith(11);
    expect(sendError).toHaveBeenCalledWith(reply, 423, 'Account locked.');
    expect(result).toEqual({ status: 423, message: 'Account locked.' });
    expect(store).toEqual({ userId: 11, role: 'admin' });
  });

  it('blocks admin actions when the permission is missing', async () => {
    const reply = {};
    const request = {
      admin: {
        adminId: 101,
        userId: 11,
        email: 'admin@example.com',
        role: 'admin' as const,
        mfaEnabled: true,
        sessionId: 'admin-session-11',
        permissions: [],
        requiresMfa: false,
      },
      headers: {},
      body: {},
    };

    const guard = requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ);
    const result = await guard(request as never, reply as never);

    expect(canAdminAccess).toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(
      reply,
      403,
      'Forbidden',
      undefined,
      'ADMIN_PERMISSION_REQUIRED'
    );
    expect(result).toEqual({
      status: 403,
      message: 'Forbidden',
      code: 'ADMIN_PERMISSION_REQUIRED',
    });
  });

  it('requires a step-up code for high-risk permissions', async () => {
    const reply = {};
    const request = {
      admin: {
        adminId: 101,
        userId: 11,
        email: 'admin@example.com',
        role: 'admin' as const,
        mfaEnabled: true,
        sessionId: 'admin-session-11',
        permissions: [ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL],
        requiresMfa: true,
      },
      headers: {},
      body: {},
    };
    canAdminAccess.mockReturnValue(true);

    const guard = requireAdminPermission(
      ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL
    );
    const result = await guard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(
      reply,
      401,
      'Admin step-up code required.',
      undefined,
      'ADMIN_STEP_UP_REQUIRED'
    );
    expect(result).toEqual({
      status: 401,
      message: 'Admin step-up code required.',
      code: 'ADMIN_STEP_UP_REQUIRED',
    });
  });

  it('allows a high-risk action with a valid step-up code', async () => {
    const reply = {};
    const request = {
      admin: {
        adminId: 101,
        userId: 11,
        email: 'admin@example.com',
        role: 'admin' as const,
        mfaEnabled: true,
        sessionId: 'admin-session-11',
        permissions: [ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL],
        requiresMfa: true,
      },
      headers: {},
      body: { totpCode: '123456' },
    };
    canAdminAccess.mockReturnValue(true);
    verifyAdminTotpCode.mockResolvedValue(true);

    const guard = requireAdminPermission(
      ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL
    );
    const result = await guard(request as never, reply as never);

    expect(verifyAdminTotpCode).toHaveBeenCalledWith({
      adminId: 101,
      totpCode: '123456',
    });
    expect(sendError).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
