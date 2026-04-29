import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_REALTIME_TEST_USER,
  resetRealtimeTestEnvMocks,
  realtimeTestEnvMocks,
} from './test-support';

const {
  bindActorObservability,
  bindRealtimeActorContext,
  sendError,
  sendErrorForException,
} = vi.hoisted(() => ({
  bindActorObservability: vi.fn(),
  bindRealtimeActorContext: vi.fn(),
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
  sendErrorForException: vi.fn(
    (_reply, error: { statusCode?: number; code?: string; message?: string }) => ({
      status: error.statusCode ?? 500,
      message: error.message ?? 'Request failed.',
      code: error.code,
    })
  ),
}));

vi.mock('../shared/telemetry', () => ({
  bindActorObservability,
}));

vi.mock('../http/respond', () => ({
  sendError,
  sendErrorForException,
}));

vi.mock('./service', () => ({
  bindRealtimeActorContext,
}));

import { requireRealtimeUserGuard } from './auth';

describe('realtime auth guard', () => {
  beforeEach(() => {
    resetRealtimeTestEnvMocks();
    bindActorObservability.mockReset();
    bindRealtimeActorContext.mockReset();
    sendError.mockReset();
    sendErrorForException.mockReset();
  });

  it('blocks realtime access when the current legal documents are not accepted', async () => {
    const request = {
      headers: { authorization: 'Bearer realtime-token' },
      cookies: {},
    };
    const reply = {};
    realtimeTestEnvMocks.verifyUserRealtimeToken.mockResolvedValue(
      ACTIVE_REALTIME_TEST_USER
    );
    realtimeTestEnvMocks.verifyUserSessionToken.mockResolvedValue(null);
    const legalError = {
      statusCode: 403,
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      message: 'Accept the current legal documents to continue.',
    };
    realtimeTestEnvMocks.assertCurrentLegalAcceptanceForUser.mockRejectedValue(
      legalError
    );

    const result = await requireRealtimeUserGuard(request as never, reply as never);

    expect(realtimeTestEnvMocks.assertCurrentLegalAcceptanceForUser).toHaveBeenCalledWith(42);
    expect(sendErrorForException).toHaveBeenCalledWith(
      reply,
      legalError,
      'Accept the current legal documents to continue.'
    );
    expect(result).toEqual({
      status: 403,
      message: 'Accept the current legal documents to continue.',
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
    });
  });

  it('attaches the realtime user after the legal gate passes', async () => {
    const request = {
      headers: { authorization: 'Bearer realtime-token' },
      cookies: {},
    };
    const reply = {};
    const user = {
      userId: 9,
      email: 'user@example.com',
      role: 'user' as const,
      sessionId: 'session-9',
    };
    realtimeTestEnvMocks.verifyUserRealtimeToken.mockResolvedValue(user);
    realtimeTestEnvMocks.verifyUserSessionToken.mockResolvedValue(null);

    await requireRealtimeUserGuard(request as never, reply as never);

    expect(sendError).not.toHaveBeenCalled();
    expect(sendErrorForException).not.toHaveBeenCalled();
    expect(realtimeTestEnvMocks.assertCurrentLegalAcceptanceForUser).toHaveBeenCalledWith(9);
    expect((request as { user?: unknown }).user).toEqual(user);
    expect(bindRealtimeActorContext).toHaveBeenCalledWith({
      userId: 9,
      role: 'user',
    });
    expect(bindActorObservability).toHaveBeenCalledWith({
      userId: 9,
      role: 'user',
    });
  });
});
