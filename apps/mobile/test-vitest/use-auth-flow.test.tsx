import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { UserSessionResponse } from "@reward/shared-types/auth";

import { cleanupHooks, installTestDom, renderTestHook } from "../test/test-dom";

const appSupportMock = vi.hoisted(() => ({
  isExplicitLinkInput: vi.fn((value: string) => value.includes("://")),
  seededEmail: "seeded@example.com",
  seededPassword: "Seeded123!",
}));

vi.mock("../src/app-support", () => ({
  isExplicitLinkInput: appSupportMock.isExplicitLinkInput,
  seededEmail: appSupportMock.seededEmail,
  seededPassword: appSupportMock.seededPassword,
}));

import { useAuthFlow, type AuthFlowSessionBridge } from "../src/hooks/use-auth-flow";

const teardownDom = installTestDom();

const baseSession: UserSessionResponse = {
  token: "user-token-1",
  expiresAt: Math.floor(Date.now() / 1000) + 3_600,
  sessionId: "session-1",
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

afterAll(() => {
  teardownDom();
});

afterEach(() => {
  cleanupHooks();
  vi.clearAllMocks();
});

describe("useAuthFlow", () => {
  beforeEach(() => {
    appSupportMock.isExplicitLinkInput.mockImplementation((value: string) =>
      value.includes("://"),
    );
  });

  it("loads reset-password auth links into the hook state", async () => {
    const resetFeedback = vi.fn();
    const setScreen = vi.fn();
    const setMessage = vi.fn();
    const setError = vi.fn();
    const setSubmitting = vi.fn();
    const refreshRewardCenter = vi.fn(async () => true);
    const sessionBridgeRef = {
      current: null,
    } as { current: AuthFlowSessionBridge | null };

    const { result } = renderTestHook(() =>
      useAuthFlow({
        api: {
          confirmEmailVerification: vi.fn(),
          confirmPasswordReset: vi.fn(),
          createSession: vi.fn(),
          register: vi.fn(),
          requestEmailVerification: vi.fn(),
          requestPasswordReset: vi.fn(),
        },
        sessionBridgeRef,
        refreshRewardCenter,
        onResetSessionExperience: vi.fn(),
        resetFeedback,
        setScreen,
        setMessage,
        setError,
        setSubmitting,
      }),
    );

    await act(async () => {
      expect(
        result.current.applyAuthLink(
          "reward://reset-password?token=reset-token-123",
        ),
      ).toBe(true);
    });

    expect(resetFeedback).toHaveBeenCalledTimes(1);
    expect(result.current.resetTokenInput).toBe("reset-token-123");
    expect(setScreen).toHaveBeenCalledWith("resetPassword");
    expect(setMessage).toHaveBeenCalledWith(
      "Recovery link loaded. Set a new password to continue.",
    );
    expect(setError).not.toHaveBeenCalled();
  });

  it("reconciles an active session after email verification succeeds", async () => {
    const confirmEmailVerification = vi.fn(async () => ({
      ok: true as const,
      data: {
        email: "user@example.com",
        verified: true as const,
      },
      status: 200,
    }));
    const reconcileSession = vi.fn(
      async (_session: typeof baseSession, overrides?: { emailVerifiedAt?: string | null }) => ({
        ...baseSession,
        user: {
          ...baseSession.user,
          emailVerifiedAt: overrides?.emailVerifiedAt ?? null,
        },
      }),
    );
    const refreshCurrentSession = vi.fn(async (session: typeof baseSession) => session);
    const refreshRewardCenter = vi.fn(async () => true);
    const setScreen = vi.fn();
    const setMessage = vi.fn();
    const setError = vi.fn();
    const setSubmitting = vi.fn();
    const sessionBridgeRef = {
      current: {
        session: baseSession,
        startAuthenticatedSession: vi.fn(),
        clearSession: vi.fn(),
        reconcileSession,
        refreshCurrentSession,
        handleUnauthorized: vi.fn(async () => true),
      },
    } as { current: AuthFlowSessionBridge | null };

    const { result } = renderTestHook(() =>
      useAuthFlow({
        api: {
          confirmEmailVerification,
          confirmPasswordReset: vi.fn(),
          createSession: vi.fn(),
          register: vi.fn(),
          requestEmailVerification: vi.fn(),
          requestPasswordReset: vi.fn(),
        },
        sessionBridgeRef,
        refreshRewardCenter,
        onResetSessionExperience: vi.fn(),
        resetFeedback: vi.fn(),
        setScreen,
        setMessage,
        setError,
        setSubmitting,
      }),
    );

    await act(async () => {
      result.current.setVerificationTokenInput("verify-token-1");
    });

    await act(async () => {
      await result.current.handleConfirmEmailVerification();
    });

    expect(confirmEmailVerification).toHaveBeenCalledWith({
      token: "verify-token-1",
    });
    expect(reconcileSession).toHaveBeenCalledTimes(1);
    const reconcileOverrides = reconcileSession.mock.calls[0]?.[1];
    expect(typeof reconcileOverrides?.emailVerifiedAt).toBe("string");
    expect(refreshCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          emailVerifiedAt: reconcileOverrides?.emailVerifiedAt,
        }),
      }),
    );
    expect(refreshRewardCenter).toHaveBeenCalledTimes(1);
    expect(setScreen).toHaveBeenCalledWith("app");
    expect(setMessage).toHaveBeenCalledWith(
      "Email verified for user@example.com.",
    );
    expect(setSubmitting).toHaveBeenLastCalledWith(false);
    expect(result.current.verificationTokenInput).toBe("");
    expect(setError).not.toHaveBeenCalled();
  });

  it("signs in with the seeded account and moves back into the app shell", async () => {
    const createSession = vi.fn(async () => ({
      ok: true as const,
      data: baseSession,
      status: 200,
    }));
    const startAuthenticatedSession = vi.fn(async () => undefined);
    const onResetSessionExperience = vi.fn();
    const setScreen = vi.fn();
    const setMessage = vi.fn();
    const setError = vi.fn();
    const setSubmitting = vi.fn();
    const sessionBridgeRef = {
      current: {
        session: null,
        startAuthenticatedSession,
        clearSession: vi.fn(),
        reconcileSession: vi.fn(),
        refreshCurrentSession: vi.fn(),
        handleUnauthorized: vi.fn(),
      },
    } as { current: AuthFlowSessionBridge | null };

    const { result } = renderTestHook(() =>
      useAuthFlow({
        api: {
          confirmEmailVerification: vi.fn(),
          confirmPasswordReset: vi.fn(),
          createSession,
          register: vi.fn(),
          requestEmailVerification: vi.fn(),
          requestPasswordReset: vi.fn(),
        },
        sessionBridgeRef,
        refreshRewardCenter: vi.fn(async () => true),
        onResetSessionExperience,
        resetFeedback: vi.fn(),
        setScreen,
        setMessage,
        setError,
        setSubmitting,
      }),
    );

    await act(async () => {
      await result.current.handleSeededLogin();
    });

    expect(createSession).toHaveBeenCalledWith({
      email: "seeded@example.com",
      password: "Seeded123!",
    });
    expect(result.current.email).toBe("seeded@example.com");
    expect(result.current.password).toBe("Seeded123!");
    expect(onResetSessionExperience).toHaveBeenCalledTimes(1);
    expect(startAuthenticatedSession).toHaveBeenCalledWith(baseSession);
    expect(setScreen).toHaveBeenNthCalledWith(1, "login");
    expect(setScreen).toHaveBeenLastCalledWith("app");
    expect(setMessage).toHaveBeenCalledWith(
      "Signed in with the seeded test user.",
    );
    expect(setSubmitting).toHaveBeenNthCalledWith(1, true);
    expect(setSubmitting).toHaveBeenLastCalledWith(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("accepts reset links, clears session state, and wipes reset inputs after a password reset", async () => {
    const confirmPasswordReset = vi.fn(async () => ({
      ok: true as const,
      data: {
        completed: true as const,
      },
      status: 200,
    }));
    const clearSession = vi.fn(async () => undefined);
    const setError = vi.fn();
    const setSubmitting = vi.fn();
    const sessionBridgeRef = {
      current: {
        session: baseSession,
        startAuthenticatedSession: vi.fn(),
        clearSession,
        reconcileSession: vi.fn(),
        refreshCurrentSession: vi.fn(),
        handleUnauthorized: vi.fn(),
      },
    } as { current: AuthFlowSessionBridge | null };

    const { result } = renderTestHook(() =>
      useAuthFlow({
        api: {
          confirmEmailVerification: vi.fn(),
          confirmPasswordReset,
          createSession: vi.fn(),
          register: vi.fn(),
          requestEmailVerification: vi.fn(),
          requestPasswordReset: vi.fn(),
        },
        sessionBridgeRef,
        refreshRewardCenter: vi.fn(async () => true),
        onResetSessionExperience: vi.fn(),
        resetFeedback: vi.fn(),
        setScreen: vi.fn(),
        setMessage: vi.fn(),
        setError,
        setSubmitting,
      }),
    );

    await act(async () => {
      result.current.setResetTokenInput(
        "reward://reset-password?token=reset-token-456",
      );
      result.current.setNewPassword("NextPassword123!");
    });

    await act(async () => {
      await result.current.handleConfirmPasswordReset();
    });

    expect(confirmPasswordReset).toHaveBeenCalledWith({
      token: "reset-token-456",
      password: "NextPassword123!",
    });
    expect(clearSession).toHaveBeenCalledWith(
      "Password updated. Sign in with the new password.",
    );
    expect(result.current.resetTokenInput).toBe("");
    expect(result.current.newPassword).toBe("");
    expect(setSubmitting).toHaveBeenNthCalledWith(1, true);
    expect(setSubmitting).toHaveBeenLastCalledWith(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("routes email verification back to login when no active session is present", async () => {
    const confirmEmailVerification = vi.fn(async () => ({
      ok: true as const,
      data: {
        email: "fresh@example.com",
        verified: true as const,
      },
      status: 200,
    }));
    const refreshRewardCenter = vi.fn(async () => true);
    const setScreen = vi.fn();
    const setMessage = vi.fn();
    const setError = vi.fn();
    const setSubmitting = vi.fn();
    const sessionBridgeRef = {
      current: null,
    } as { current: AuthFlowSessionBridge | null };

    const { result } = renderTestHook(() =>
      useAuthFlow({
        api: {
          confirmEmailVerification,
          confirmPasswordReset: vi.fn(),
          createSession: vi.fn(),
          register: vi.fn(),
          requestEmailVerification: vi.fn(),
          requestPasswordReset: vi.fn(),
        },
        sessionBridgeRef,
        refreshRewardCenter,
        onResetSessionExperience: vi.fn(),
        resetFeedback: vi.fn(),
        setScreen,
        setMessage,
        setError,
        setSubmitting,
      }),
    );

    await act(async () => {
      result.current.setVerificationTokenInput("verify-token-standalone");
    });

    await act(async () => {
      await result.current.handleConfirmEmailVerification();
    });

    expect(confirmEmailVerification).toHaveBeenCalledWith({
      token: "verify-token-standalone",
    });
    expect(refreshRewardCenter).not.toHaveBeenCalled();
    expect(setScreen).toHaveBeenCalledWith("login");
    expect(setMessage).toHaveBeenCalledWith(
      "Email verified for fresh@example.com. You can sign in now.",
    );
    expect(result.current.verificationTokenInput).toBe("");
    expect(setSubmitting).toHaveBeenLastCalledWith(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("delegates 401 email verification resend failures to the session bridge", async () => {
    const requestEmailVerification = vi.fn(async () => ({
      ok: false as const,
      status: 401,
      error: {
        message: "Expired.",
      },
    }));
    const handleUnauthorized = vi.fn(async () => true);
    const setError = vi.fn();
    const sessionBridgeRef = {
      current: {
        session: baseSession,
        startAuthenticatedSession: vi.fn(),
        clearSession: vi.fn(),
        reconcileSession: vi.fn(),
        refreshCurrentSession: vi.fn(),
        handleUnauthorized,
      },
    } as { current: AuthFlowSessionBridge | null };

    const { result } = renderTestHook(() =>
      useAuthFlow({
        api: {
          confirmEmailVerification: vi.fn(),
          confirmPasswordReset: vi.fn(),
          createSession: vi.fn(),
          register: vi.fn(),
          requestEmailVerification,
          requestPasswordReset: vi.fn(),
        },
        sessionBridgeRef,
        refreshRewardCenter: vi.fn(async () => true),
        onResetSessionExperience: vi.fn(),
        resetFeedback: vi.fn(),
        setScreen: vi.fn(),
        setMessage: vi.fn(),
        setError,
        setSubmitting: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleRequestEmailVerification();
    });

    expect(requestEmailVerification).toHaveBeenCalledTimes(1);
    expect(handleUnauthorized).toHaveBeenCalledWith(
      "Session expired or was revoked. Sign in again.",
    );
    expect(result.current.sendingVerification).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
