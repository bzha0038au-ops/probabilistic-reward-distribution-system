import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://postgres:postgres@127.0.0.1:5432/reward_test';
process.env.USER_JWT_SECRET ||= 'realtime-user-secret-1234567890';

export const VALID_REALTIME_TEST_TOKEN = 'valid-token';

export const ACTIVE_REALTIME_TEST_USER = {
  userId: 42,
  email: 'player@example.com',
  role: 'user' as const,
  sessionId: 'session-42',
};

// Import this module before realtime code under test so these environment
// mocks are always registered consistently for auth and transport suites.
const sharedRealtimeTestEnvMocks = vi.hoisted(() => ({
  verifyUserRealtimeToken: vi.fn(),
  verifyUserSessionToken: vi.fn(),
  validateAuthSession: vi.fn(),
  getSystemFlags: vi.fn(),
  isUserFrozen: vi.fn(),
  assertCurrentLegalAcceptanceForUser: vi.fn(),
  dbListen: vi.fn(),
  dbNotify: vi.fn(),
  getRedis: vi.fn(),
  closeRedis: vi.fn(),
}));

export const realtimeTestEnvMocks = sharedRealtimeTestEnvMocks;

vi.mock('../db', () => ({
  db: {} as Record<string, never>,
  client: {
    listen: realtimeTestEnvMocks.dbListen,
    notify: realtimeTestEnvMocks.dbNotify,
  },
}));

vi.mock('../shared/user-session', () => ({
  USER_SESSION_COOKIE: 'reward_user_session',
  verifyUserRealtimeToken: realtimeTestEnvMocks.verifyUserRealtimeToken,
  verifyUserSessionToken: realtimeTestEnvMocks.verifyUserSessionToken,
}));

vi.mock('../modules/session/service', () => ({
  validateAuthSession: realtimeTestEnvMocks.validateAuthSession,
}));

vi.mock('../modules/system/service', () => ({
  getSystemFlags: realtimeTestEnvMocks.getSystemFlags,
}));

vi.mock('../modules/risk/service', () => ({
  isUserFrozen: realtimeTestEnvMocks.isUserFrozen,
}));

vi.mock('../modules/legal/service', () => ({
  assertCurrentLegalAcceptanceForUser:
    realtimeTestEnvMocks.assertCurrentLegalAcceptanceForUser,
}));

vi.mock('../shared/redis', () => ({
  closeRedis: realtimeTestEnvMocks.closeRedis,
  getRedis: realtimeTestEnvMocks.getRedis,
}));

export const resetRealtimeTestEnvMocks = () => {
  realtimeTestEnvMocks.verifyUserRealtimeToken.mockReset();
  realtimeTestEnvMocks.verifyUserSessionToken.mockReset();
  realtimeTestEnvMocks.validateAuthSession.mockReset();
  realtimeTestEnvMocks.getSystemFlags.mockReset();
  realtimeTestEnvMocks.isUserFrozen.mockReset();
  realtimeTestEnvMocks.assertCurrentLegalAcceptanceForUser.mockReset();
  realtimeTestEnvMocks.dbListen.mockReset();
  realtimeTestEnvMocks.dbNotify.mockReset();
  realtimeTestEnvMocks.getRedis.mockReset();
  realtimeTestEnvMocks.closeRedis.mockReset();

  realtimeTestEnvMocks.verifyUserRealtimeToken.mockResolvedValue(null);
  realtimeTestEnvMocks.verifyUserSessionToken.mockImplementation(
    async (token?: string | null) =>
      token === VALID_REALTIME_TEST_TOKEN ? ACTIVE_REALTIME_TEST_USER : null
  );
  realtimeTestEnvMocks.validateAuthSession.mockResolvedValue({
    jti: ACTIVE_REALTIME_TEST_USER.sessionId,
  });
  realtimeTestEnvMocks.getSystemFlags.mockResolvedValue({
    maintenanceMode: false,
  });
  realtimeTestEnvMocks.isUserFrozen.mockResolvedValue(false);
  realtimeTestEnvMocks.assertCurrentLegalAcceptanceForUser.mockResolvedValue({
    requiresAcceptance: false,
    items: [],
  });
  realtimeTestEnvMocks.dbListen.mockResolvedValue(undefined);
  realtimeTestEnvMocks.dbNotify.mockResolvedValue(undefined);
  realtimeTestEnvMocks.getRedis.mockReturnValue(null);
  realtimeTestEnvMocks.closeRedis.mockResolvedValue(undefined);
};
