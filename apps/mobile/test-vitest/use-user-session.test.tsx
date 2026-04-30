import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

import { cleanupHooks, installTestDom, renderTestHook } from "../test/test-dom";

const reactNativeMock = vi.hoisted(() => ({
  getInitialURL: vi.fn(),
  addEventListener: vi.fn(),
}));

const sessionStorageMock = vi.hoisted(() => ({
  clearStoredUserSession: vi.fn(),
  readStoredUserSession: vi.fn(),
  writeStoredUserSession: vi.fn(),
}));

const appSupportMock = vi.hoisted(() => ({
  SESSION_RESTORE_TIMEOUT_MS: 8_000,
  buildCurrentSessionFallback: vi.fn((session: { sessionId?: string; user: { role: "user" | "admin" }; expiresAt: number }) => ({
    sessionId: session.sessionId ?? "unknown",
    kind: "user" as const,
    role: session.user.role,
    ip: null,
    userAgent: null,
    createdAt: null,
    lastSeenAt: null,
    expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
    current: true,
  })),
  withTimeout: vi.fn(async <T,>(promise: Promise<T>) => promise),
}));

vi.mock("react-native", () => ({
  Linking: {
    getInitialURL: reactNativeMock.getInitialURL,
    addEventListener: reactNativeMock.addEventListener,
  },
}));

vi.mock("../src/session-storage", () => ({
  clearStoredUserSession: sessionStorageMock.clearStoredUserSession,
  readStoredUserSession: sessionStorageMock.readStoredUserSession,
  writeStoredUserSession: sessionStorageMock.writeStoredUserSession,
}));

vi.mock("../src/app-support", () => ({
  SESSION_RESTORE_TIMEOUT_MS: appSupportMock.SESSION_RESTORE_TIMEOUT_MS,
  buildCurrentSessionFallback: appSupportMock.buildCurrentSessionFallback,
  withTimeout: appSupportMock.withTimeout,
}));

import { useUserSession } from "../src/hooks/use-user-session";

const teardownDom = installTestDom();

const storedSession = {
  token: "stored-token-1",
  expiresAt: Math.floor(Date.now() / 1000) + 3_600,
  sessionId: "stored-session",
  user: {
    id: 42,
    email: "user@example.com",
    role: "user" as const,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
  },
  legal: {
    requiresAcceptance: false,
    items: [],
  },
};

const restoredCurrentSession = {
  sessionId: "server-session-42",
  kind: "user" as const,
  role: "user" as const,
  ip: null,
  userAgent: null,
  createdAt: "2026-04-30T00:00:00.000Z",
  lastSeenAt: "2026-04-30T00:05:00.000Z",
  expiresAt: "2026-05-30T00:00:00.000Z",
  current: true,
};

const flushEffects = async (times = 3) => {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

afterAll(() => {
  teardownDom();
});

afterEach(() => {
  cleanupHooks();
  vi.clearAllMocks();
});

describe("useUserSession", () => {
  beforeEach(() => {
    reactNativeMock.getInitialURL.mockResolvedValue(null);
    reactNativeMock.addEventListener.mockReturnValue({
      remove: vi.fn(),
    });
    sessionStorageMock.clearStoredUserSession.mockResolvedValue(undefined);
    sessionStorageMock.writeStoredUserSession.mockResolvedValue(undefined);
    appSupportMock.withTimeout.mockImplementation(async <T,>(promise: Promise<T>) => promise);
  });

  it("falls back to the login screen when there is no stored session", async () => {
    sessionStorageMock.readStoredUserSession.mockResolvedValue(null);
    const setScreen = vi.fn();
    const setMessage = vi.fn();
    const setError = vi.fn();
    const options = {
      api: {
        deleteCurrentSession: vi.fn(),
        getCurrentSession: vi.fn(),
        listSessions: vi.fn(),
        revokeAllSessions: vi.fn(),
        revokeSession: vi.fn(),
      },
      authTokenRef: { current: null as string | null },
      applyAuthLink: vi.fn(() => false),
      onResetSessionExperience: vi.fn(),
      resetFeedback: vi.fn(),
      setScreen,
      setMessage,
      setError,
      setSubmitting: vi.fn(),
    };

    const { result } = renderTestHook(() => useUserSession(options));

    await flushEffects();

    expect(reactNativeMock.getInitialURL).toHaveBeenCalledTimes(1);
    expect(sessionStorageMock.readStoredUserSession).toHaveBeenCalledTimes(1);
    expect(setScreen).toHaveBeenCalledWith("login");
    expect(result.current.restoringSession).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.visibleSessions).toEqual([]);
    expect(setMessage).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it("restores a valid stored session and persists the refreshed server snapshot", async () => {
    sessionStorageMock.readStoredUserSession.mockResolvedValue(storedSession);
    const getCurrentSession = vi.fn(async () => ({
      ok: true as const,
      data: {
        session: restoredCurrentSession,
        user: {
          ...storedSession.user,
          emailVerifiedAt: "2026-04-30T00:01:00.000Z",
        },
        legal: {
          requiresAcceptance: false,
          items: [],
        },
      },
      status: 200,
    }));
    const authTokenRef = { current: null as string | null };
    const setScreen = vi.fn();
    const options = {
      api: {
        deleteCurrentSession: vi.fn(),
        getCurrentSession,
        listSessions: vi.fn(),
        revokeAllSessions: vi.fn(),
        revokeSession: vi.fn(),
      },
      authTokenRef,
      applyAuthLink: vi.fn(() => false),
      onResetSessionExperience: vi.fn(),
      resetFeedback: vi.fn(),
      setScreen,
      setMessage: vi.fn(),
      setError: vi.fn(),
      setSubmitting: vi.fn(),
    };

    const { result } = renderTestHook(() => useUserSession(options));

    await flushEffects(5);

    expect(getCurrentSession).toHaveBeenCalledWith({
      authToken: "stored-token-1",
    });
    expect(authTokenRef.current).toBe("stored-token-1");
    expect(result.current.restoringSession).toBe(false);
    expect(result.current.session).toEqual({
      ...storedSession,
      sessionId: "server-session-42",
      legal: {
        requiresAcceptance: false,
        items: [],
      },
      user: {
        ...storedSession.user,
        emailVerifiedAt: "2026-04-30T00:01:00.000Z",
      },
    });
    expect(result.current.currentSession).toEqual(restoredCurrentSession);
    expect(result.current.visibleSessions).toEqual([restoredCurrentSession]);
    expect(setScreen).toHaveBeenCalledWith("app");
    expect(sessionStorageMock.writeStoredUserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "server-session-42",
      }),
    );
  });
});
