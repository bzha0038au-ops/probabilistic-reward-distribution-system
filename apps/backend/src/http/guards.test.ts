import { beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';

const {
  canAdminAccess,
  getUserById,
  getAdminAccessProfileByUserId,
  getSystemFlags,
  getWithdrawalRiskConfig,
  isUserMfaEnabled,
  isUserFrozen,
  resolveRequestCountryCode,
  sendError,
  store,
  syncUserJurisdictionState,
  verifyAdminMfaBreakGlassCode,
  verifyAdminMfaChallenge,
  verifyScopedAdminAccessToken,
  verifyUserMfaChallenge,
  verifyAdminSessionToken,
  verifyUserSessionToken,
} = vi.hoisted(() => ({
  store: {} as { userId?: number; role?: 'user' | 'admin' },
  verifyUserSessionToken: vi.fn(),
  verifyAdminSessionToken: vi.fn(),
  verifyScopedAdminAccessToken: vi.fn(),
  getUserById: vi.fn(),
  getAdminAccessProfileByUserId: vi.fn(),
  canAdminAccess: vi.fn(),
  verifyAdminMfaBreakGlassCode: vi.fn(),
  verifyAdminMfaChallenge: vi.fn(),
  verifyUserMfaChallenge: vi.fn(),
  isUserMfaEnabled: vi.fn(),
  isUserFrozen: vi.fn(),
  resolveRequestCountryCode: vi.fn(),
  syncUserJurisdictionState: vi.fn(),
  getSystemFlags: vi.fn(),
  getWithdrawalRiskConfig: vi.fn(),
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
  ADMIN_ACCESS_TOKEN_SCOPES: {
    TABLE_MONITORING_WS: 'table_monitoring_ws',
  },
  ADMIN_SESSION_COOKIE: 'reward_admin_session',
  verifyAdminSessionToken,
  verifyScopedAdminAccessToken,
}));

vi.mock('../modules/risk/service', () => ({
  isUserFrozen,
}));

vi.mock('../modules/risk/jurisdiction-service', () => ({
  resolveRequestCountryCode,
  syncUserJurisdictionState,
}));

vi.mock('../modules/system/service', () => ({
  getSystemFlags,
  getWithdrawalRiskConfig,
}));

vi.mock('../modules/user/service', () => ({
  getUserById,
}));

vi.mock('../modules/admin-permission/service', () => ({
  canAdminAccess,
  getAdminAccessProfileByUserId,
}));

vi.mock('../modules/admin-mfa/service', () => ({
  verifyAdminMfaBreakGlassCode,
  verifyAdminMfaChallenge,
}));

vi.mock('../modules/user-mfa/service', () => ({
  isUserMfaEnabled,
  verifyUserMfaChallenge,
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
  requireUserFreezeScope,
  requireVerifiedUser,
  requireUser,
  requireUserGuard,
  requireUserMfaStepUp,
} from './guards';
import { ADMIN_PERMISSION_KEYS } from '../modules/admin-permission/definitions';

describe('auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete store.userId;
    delete store.role;
    getSystemFlags.mockResolvedValue({ maintenanceMode: false });
    isUserFrozen.mockResolvedValue(false);
    resolveRequestCountryCode.mockResolvedValue(null);
    syncUserJurisdictionState.mockResolvedValue({
      registrationCountryCode: null,
      birthDate: '1990-01-01',
      countryTier: 'unknown',
      minimumAge: 18,
      userAge: 34,
      isOfAge: true,
      allowedFeatures: ['real_money_gameplay', 'topup', 'withdrawal'],
      blockedScopes: [],
      restrictionReasons: [],
      countryResolvedAt: null,
    });
    verifyAdminMfaBreakGlassCode.mockReturnValue(true);
    verifyScopedAdminAccessToken.mockResolvedValue(null);
    getUserById.mockResolvedValue({
      id: 11,
      email: 'user@example.com',
      role: 'user',
      emailVerifiedAt: new Date('2024-01-01T00:00:00.000Z'),
      phoneVerifiedAt: new Date('2024-01-02T00:00:00.000Z'),
    });
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
    verifyAdminMfaChallenge.mockResolvedValue({
      valid: false,
      method: null,
      recoveryCodesRemaining: 0,
    });
    verifyUserMfaChallenge.mockResolvedValue({
      valid: false,
      method: null,
    });
    isUserMfaEnabled.mockResolvedValue(false);
    getWithdrawalRiskConfig.mockResolvedValue({
      largeAmountSecondApprovalThreshold: new Decimal(500),
    });
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
    expect(isUserFrozen).toHaveBeenCalledWith(9, { scope: 'account_lock' });
    expect((request as { user?: unknown }).user).toEqual(user);
  });

  it('blocks scoped user actions when the matching freeze is active', async () => {
    const reply = {};
    const request = {
      headers: { 'cf-ipcountry': 'US' },
      ip: '203.0.113.9',
      user: {
        userId: 9,
        email: 'user@example.com',
        role: 'user' as const,
        sessionId: 'user-session-9',
      },
    };
    isUserFrozen.mockResolvedValue(true);
    resolveRequestCountryCode.mockResolvedValueOnce('US');

    const guard = requireUserFreezeScope('withdrawal_lock');
    const result = await guard(request as never, reply as never);

    expect(resolveRequestCountryCode).toHaveBeenCalledWith({
      headers: request.headers,
      ip: request.ip,
    });
    expect(syncUserJurisdictionState).toHaveBeenCalledWith({
      userId: 9,
      countryCodeOverride: 'US',
    });
    expect(isUserFrozen).toHaveBeenCalledWith(9, { scope: 'withdrawal_lock' });
    expect(sendError).toHaveBeenCalledWith(reply, 423, 'Withdrawals locked.');
    expect(result).toEqual({
      status: 423,
      message: 'Withdrawals locked.',
    });
  });

  it('blocks high-risk user actions when email verification is missing', async () => {
    const reply = {};
    const request = {
      user: {
        userId: 9,
        email: 'user@example.com',
        role: 'user' as const,
        sessionId: 'user-session-9',
      },
    };
    getUserById.mockResolvedValue({
      id: 9,
      email: 'user@example.com',
      role: 'user',
      emailVerifiedAt: null,
      phoneVerifiedAt: new Date('2024-01-02T00:00:00.000Z'),
    });

    const guard = requireVerifiedUser({ email: true });
    const result = await guard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(
      reply,
      403,
      'Email verification required.',
      undefined,
      'EMAIL_VERIFICATION_REQUIRED'
    );
    expect(result).toEqual({
      status: 403,
      message: 'Email verification required.',
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });
  });

  it('blocks high-risk finance actions when phone verification is missing', async () => {
    const reply = {};
    const request = {
      user: {
        userId: 9,
        email: 'user@example.com',
        role: 'user' as const,
        sessionId: 'user-session-9',
      },
    };
    getUserById.mockResolvedValue({
      id: 9,
      email: 'user@example.com',
      role: 'user',
      emailVerifiedAt: new Date('2024-01-01T00:00:00.000Z'),
      phoneVerifiedAt: null,
    });

    const guard = requireVerifiedUser({ email: true, phone: true });
    const result = await guard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(
      reply,
      403,
      'Phone verification required.',
      undefined,
      'PHONE_VERIFICATION_REQUIRED'
    );
    expect(result).toEqual({
      status: 403,
      message: 'Phone verification required.',
      code: 'PHONE_VERIFICATION_REQUIRED',
    });
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
      mfaRecoveryMode: 'none',
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
      mfaRecoveryMode: 'none',
      sessionId: 'admin-session-11',
      permissions: [],
      requiresMfa: false,
    });
    expect(verifyAdminSessionToken).toHaveBeenCalledWith('admin-token');
    expect(getAdminAccessProfileByUserId).toHaveBeenCalledWith(11);
    expect(isUserFrozen).toHaveBeenCalledWith(11, { scope: 'account_lock' });
    expect(sendError).toHaveBeenCalledWith(reply, 423, 'Account locked.');
    expect(result).toEqual({ status: 423, message: 'Account locked.' });
    expect(store).toEqual({ userId: 11, role: 'admin' });
  });

  it('accepts a scoped admin access token for the table-monitoring websocket route', async () => {
    const request = {
      url: '/admin/ws/table-monitoring?accessToken=ws-scope-token',
      query: { accessToken: 'ws-scope-token' },
      headers: {},
      cookies: {},
    };
    const reply = {};

    verifyAdminSessionToken.mockResolvedValue(null);
    verifyScopedAdminAccessToken.mockResolvedValue({
      adminId: 101,
      userId: 11,
      email: 'admin@example.com',
      role: 'admin',
      mfaEnabled: false,
      mfaRecoveryMode: 'none',
      sessionId: 'admin-session-11',
    });

    await requireAdminGuard(request as never, reply as never);

    expect(verifyScopedAdminAccessToken).toHaveBeenCalledWith(
      'ws-scope-token',
      { scope: 'table_monitoring_ws' }
    );
    expect((request as { admin?: unknown }).admin).toMatchObject({
      adminId: 101,
      userId: 11,
      permissions: [],
      requiresMfa: false,
    });
  });

  it('rejects scoped admin access tokens outside the websocket route', async () => {
    const request = {
      url: '/admin/mfa/status?accessToken=ws-scope-token',
      query: { accessToken: 'ws-scope-token' },
      headers: {},
      cookies: {},
    };
    const reply = {};

    verifyAdminSessionToken.mockResolvedValue(null);

    const result = await requireAdminGuard(request as never, reply as never);

    expect(verifyScopedAdminAccessToken).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(reply, 401, 'Unauthorized');
    expect(result).toEqual({ status: 401, message: 'Unauthorized' });
  });

  it('requires MFA to be enabled for high-value user withdrawals', async () => {
    const reply = {};
    const request = {
      user: {
        userId: 9,
        email: 'user@example.com',
        role: 'user' as const,
        sessionId: 'user-session-9',
      },
      headers: {},
      body: { amount: '600' },
    };

    const guard = requireUserMfaStepUp();
    const result = await guard(request as never, reply as never);

    expect(isUserMfaEnabled).toHaveBeenCalledWith(9);
    expect(sendError).toHaveBeenCalledWith(
      reply,
      403,
      'User MFA must be enabled for high-value withdrawals.',
      undefined,
      'USER_MFA_REQUIRED'
    );
    expect(result).toEqual({
      status: 403,
      message: 'User MFA must be enabled for high-value withdrawals.',
      code: 'USER_MFA_REQUIRED',
    });
  });

  it('requires a step-up code once user MFA is enabled for high-value withdrawals', async () => {
    const reply = {};
    const request = {
      user: {
        userId: 9,
        email: 'user@example.com',
        role: 'user' as const,
        sessionId: 'user-session-9',
      },
      headers: {},
      body: { amount: '600' },
    };
    isUserMfaEnabled.mockResolvedValue(true);

    const guard = requireUserMfaStepUp();
    const result = await guard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(
      reply,
      401,
      'User step-up code required.',
      undefined,
      'USER_STEP_UP_REQUIRED'
    );
    expect(result).toEqual({
      status: 401,
      message: 'User step-up code required.',
      code: 'USER_STEP_UP_REQUIRED',
    });
  });

  it('allows a high-value user withdrawal with a valid step-up code', async () => {
    const reply = {};
    const request = {
      user: {
        userId: 9,
        email: 'user@example.com',
        role: 'user' as const,
        sessionId: 'user-session-9',
      },
      headers: {},
      body: { amount: '600', totpCode: '123456' },
    };
    isUserMfaEnabled.mockResolvedValue(true);
    verifyUserMfaChallenge.mockResolvedValue({
      valid: true,
      method: 'totp',
    });

    const guard = requireUserMfaStepUp();
    const result = await guard(request as never, reply as never);

    expect(verifyUserMfaChallenge).toHaveBeenCalledWith({
      userId: 9,
      code: '123456',
    });
    expect(sendError).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect((request as { userStepUp?: unknown }).userStepUp).toEqual({
      verified: true,
      method: 'totp',
      verifiedAt: expect.any(String),
      amountThreshold: '500.00',
    });
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
        mfaRecoveryMode: 'none' as const,
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
        mfaRecoveryMode: 'none' as const,
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
        mfaRecoveryMode: 'none' as const,
        sessionId: 'admin-session-11',
        permissions: [ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL],
        requiresMfa: true,
      },
      headers: {},
      body: { totpCode: '123456' },
    };
    canAdminAccess.mockReturnValue(true);
    verifyAdminMfaChallenge.mockResolvedValue({
      valid: true,
      method: 'totp',
      recoveryCodesRemaining: 0,
    });

    const guard = requireAdminPermission(
      ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL
    );
    const result = await guard(request as never, reply as never);

    expect(verifyAdminMfaChallenge).toHaveBeenCalledWith({
      adminId: 101,
      code: '123456',
    });
    expect(sendError).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('requires a break-glass code when the permission opts into it', async () => {
    const reply = {};
    const request = {
      admin: {
        adminId: 101,
        userId: 11,
        email: 'admin@example.com',
        role: 'admin' as const,
        mfaEnabled: true,
        mfaRecoveryMode: 'none' as const,
        sessionId: 'admin-session-11',
        permissions: [ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL],
        requiresMfa: true,
      },
      headers: {},
      body: { totpCode: '123456' },
    };
    canAdminAccess.mockReturnValue(true);
    verifyAdminMfaChallenge.mockResolvedValue({
      valid: true,
      method: 'totp',
      recoveryCodesRemaining: 0,
    });

    const guard = requireAdminPermission(
      ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
      { requireBreakGlass: true }
    );
    const result = await guard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(
      reply,
      401,
      'Admin break-glass code required.',
      undefined,
      'ADMIN_BREAK_GLASS_REQUIRED'
    );
    expect(result).toEqual({
      status: 401,
      message: 'Admin break-glass code required.',
      code: 'ADMIN_BREAK_GLASS_REQUIRED',
    });
  });

  it('rejects an invalid break-glass code', async () => {
    const reply = {};
    const request = {
      admin: {
        adminId: 101,
        userId: 11,
        email: 'admin@example.com',
        role: 'admin' as const,
        mfaEnabled: true,
        mfaRecoveryMode: 'none' as const,
        sessionId: 'admin-session-11',
        permissions: [ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL],
        requiresMfa: true,
      },
      headers: {},
      body: { totpCode: '123456', breakGlassCode: 'wrong-secret' },
    };
    canAdminAccess.mockReturnValue(true);
    verifyAdminMfaChallenge.mockResolvedValue({
      valid: true,
      method: 'totp',
      recoveryCodesRemaining: 0,
    });
    verifyAdminMfaBreakGlassCode.mockReturnValue(false);

    const guard = requireAdminPermission(
      ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
      { requireBreakGlass: true }
    );
    const result = await guard(request as never, reply as never);

    expect(sendError).toHaveBeenCalledWith(
      reply,
      401,
      'Invalid admin break-glass code.',
      undefined,
      'ADMIN_BREAK_GLASS_INVALID'
    );
    expect(result).toEqual({
      status: 401,
      message: 'Invalid admin break-glass code.',
      code: 'ADMIN_BREAK_GLASS_INVALID',
    });
  });

  it('allows a high-risk action with MFA and break-glass', async () => {
    const reply = {};
    const request = {
      admin: {
        adminId: 101,
        userId: 11,
        email: 'admin@example.com',
        role: 'admin' as const,
        mfaEnabled: true,
        mfaRecoveryMode: 'none' as const,
        sessionId: 'admin-session-11',
        permissions: [ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL],
        requiresMfa: true,
      },
      headers: {},
      body: { totpCode: '123456', breakGlassCode: 'break-glass-secret' },
    };
    canAdminAccess.mockReturnValue(true);
    verifyAdminMfaChallenge.mockResolvedValue({
      valid: true,
      method: 'totp',
      recoveryCodesRemaining: 0,
    });

    const guard = requireAdminPermission(
      ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
      { requireBreakGlass: true }
    );
    const result = await guard(request as never, reply as never);

    expect(verifyAdminMfaBreakGlassCode).toHaveBeenCalledWith(
      'break-glass-secret'
    );
    expect(sendError).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect((request as { adminStepUp?: unknown }).adminStepUp).toMatchObject({
      verified: true,
      method: 'totp',
      breakGlassVerified: true,
    });
  });
});
