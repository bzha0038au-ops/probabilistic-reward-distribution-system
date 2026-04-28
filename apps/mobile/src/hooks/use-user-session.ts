import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { Linking } from "react-native";
import type {
  AuthSessionSummary,
  UserSessionResponse,
} from "@reward/shared-types/auth";
import { createUserApiClient, type UserApiOverrides } from "@reward/user-core";

import {
  buildCurrentSessionFallback,
  SESSION_RESTORE_TIMEOUT_MS,
  type ScreenMode,
  withTimeout,
} from "../app-support";
import {
  clearStoredUserSession,
  readStoredUserSession,
  writeStoredUserSession,
} from "../session-storage";

type UserSessionApi = Pick<
  ReturnType<typeof createUserApiClient>,
  | "deleteCurrentSession"
  | "getCurrentSession"
  | "listSessions"
  | "revokeAllSessions"
  | "revokeSession"
>;

type UseUserSessionOptions = {
  api: UserSessionApi;
  authTokenRef: MutableRefObject<string | null>;
  applyAuthLink: (url: string) => boolean;
  onResetSessionExperience: () => void;
  resetFeedback: () => void;
  setScreen: (screen: ScreenMode) => void;
  setMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
  setSubmitting: (value: boolean) => void;
};

type ReconcileSessionOverrides = {
  sessionId?: string;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
  legal?: UserSessionResponse["legal"];
};

export function useUserSession(options: UseUserSessionOptions) {
  const {
    api,
    authTokenRef,
    applyAuthLink,
    onResetSessionExperience,
    resetFeedback,
    setScreen,
    setMessage,
    setError,
    setSubmitting,
  } = options;

  const [session, setSession] = useState<UserSessionResponse | null>(null);
  const [currentSession, setCurrentSession] =
    useState<AuthSessionSummary | null>(null);
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);

  const updateSession = useCallback(
    (nextSession: UserSessionResponse | null) => {
      authTokenRef.current = nextSession?.token ?? null;
      setSession(nextSession);
    },
    [authTokenRef],
  );

  const persistSession = useCallback(
    async (nextSession: UserSessionResponse) => {
      try {
        await writeStoredUserSession(nextSession);
      } catch {
        setError("Failed to persist the secure session on this device.");
      }
    },
    [setError],
  );

  const startAuthenticatedSession = useCallback(
    async (nextSession: UserSessionResponse) => {
      updateSession(nextSession);
      setCurrentSession(buildCurrentSessionFallback(nextSession));
      setSessions([]);
      await persistSession(nextSession);
    },
    [persistSession, updateSession],
  );

  const clearSession = useCallback(
    async (nextMessage?: string) => {
      try {
        await clearStoredUserSession();
      } finally {
        onResetSessionExperience();
        updateSession(null);
        setCurrentSession(null);
        setSessions([]);
        setLoadingSessions(false);
        setRestoringSession(false);
        setScreen("login");
        setError(null);
        setMessage(nextMessage ?? null);
      }
    },
    [onResetSessionExperience, setError, setMessage, setScreen, updateSession],
  );

  const handleUnauthorized = useCallback(
    async (nextMessage: string) => {
      await clearSession(nextMessage);
      return true;
    },
    [clearSession],
  );

  const reconcileSession = useCallback(
    async (
      baseSession: UserSessionResponse,
      overrides: ReconcileSessionOverrides = {},
    ) => {
      const nextSession: UserSessionResponse = {
        ...baseSession,
        sessionId: overrides.sessionId ?? baseSession.sessionId,
        legal: overrides.legal ?? baseSession.legal,
        user: {
          ...baseSession.user,
          emailVerifiedAt:
            overrides.emailVerifiedAt !== undefined
              ? overrides.emailVerifiedAt
              : baseSession.user.emailVerifiedAt,
          phoneVerifiedAt:
            overrides.phoneVerifiedAt !== undefined
              ? overrides.phoneVerifiedAt
              : baseSession.user.phoneVerifiedAt,
        },
      };

      updateSession(nextSession);
      await persistSession(nextSession);
      return nextSession;
    },
    [persistSession, updateSession],
  );

  const refreshCurrentSession = useCallback(
    async (
      baseSession: UserSessionResponse,
      overrides: UserApiOverrides = {},
    ) => {
      const response = await api.getCurrentSession(overrides);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized(
            "Session expired or was revoked. Sign in again.",
          );
          return null;
        }

        setError(
          response.error?.message ?? "Failed to restore the current session.",
        );
        return null;
      }

      const nextSession = await reconcileSession(baseSession, {
        sessionId: response.data.session.sessionId,
        emailVerifiedAt: response.data.user.emailVerifiedAt,
        phoneVerifiedAt: response.data.user.phoneVerifiedAt,
        legal: response.data.legal,
      });
      setCurrentSession(response.data.session);

      return nextSession;
    },
    [api, handleUnauthorized, reconcileSession, setError],
  );

  const refreshSessions = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setLoadingSessions(true);
      const response = await api.listSessions(overrides);

      if (!response.ok) {
        setLoadingSessions(false);

        if (response.status === 401) {
          await handleUnauthorized(
            "Session expired or was revoked. Sign in again.",
          );
          return false;
        }

        setError(response.error?.message ?? "Failed to load active sessions.");
        return false;
      }

      setSessions(response.data.items);
      setLoadingSessions(false);
      return true;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const signOut = useCallback(async () => {
    if (!authTokenRef.current) {
      await clearSession("Signed out.");
      return;
    }

    resetFeedback();
    setSubmitting(true);
    const response = await api.deleteCurrentSession();
    const remoteLogoutFailed = !response.ok && response.status !== 401;
    setSubmitting(false);
    await clearSession(
      remoteLogoutFailed ? undefined : "Signed out on this device.",
    );

    if (remoteLogoutFailed) {
      setError(
        response.error?.message
          ? `Signed out on this device, but remote logout failed: ${response.error.message}`
          : "Signed out on this device, but the server could not confirm remote logout.",
      );
    }
  }, [api, authTokenRef, clearSession, resetFeedback, setError, setSubmitting]);

  const revokeSession = useCallback(
    async (targetSession: AuthSessionSummary) => {
      if (!authTokenRef.current) {
        return;
      }

      resetFeedback();
      setLoadingSessions(true);
      const response = await api.revokeSession(targetSession.sessionId);

      if (!response.ok) {
        setLoadingSessions(false);

        if (response.status === 401) {
          await handleUnauthorized(
            "Session expired or was revoked. Sign in again.",
          );
          return;
        }

        setError(response.error?.message ?? "Failed to revoke session.");
        return;
      }

      setLoadingSessions(false);

      if (targetSession.current) {
        await clearSession("Current session revoked.");
        return;
      }

      setMessage("Session revoked.");
      await refreshSessions();
    },
    [
      api,
      authTokenRef,
      clearSession,
      handleUnauthorized,
      refreshSessions,
      resetFeedback,
      setError,
      setMessage,
    ],
  );

  const revokeAllSessions = useCallback(async () => {
    if (!authTokenRef.current) {
      return;
    }

    resetFeedback();
    setLoadingSessions(true);
    const response = await api.revokeAllSessions();

    if (!response.ok) {
      setLoadingSessions(false);

      if (response.status === 401) {
        await handleUnauthorized(
          "Session expired or was revoked. Sign in again.",
        );
        return;
      }

      setError(response.error?.message ?? "Failed to revoke sessions.");
      return;
    }

    setLoadingSessions(false);
    await clearSession(
      `Signed out everywhere. Revoked ${response.data.revokedCount} active sessions.`,
    );
  }, [
    api,
    authTokenRef,
    clearSession,
    handleUnauthorized,
    resetFeedback,
    setError,
  ]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const initialUrl = await Linking.getInitialURL();
      const initialLinkLoaded = initialUrl ? applyAuthLink(initialUrl) : false;

      const storedSession = await readStoredUserSession();
      if (!active) {
        return;
      }

      if (!storedSession) {
        if (!initialLinkLoaded) {
          setScreen("login");
        }
        setRestoringSession(false);
        return;
      }

      if (storedSession.expiresAt <= Math.floor(Date.now() / 1000)) {
        await clearStoredUserSession();
        if (!active) {
          return;
        }

        if (!initialLinkLoaded) {
          setScreen("login");
        }
        setMessage("Saved session expired. Sign in again.");
        setRestoringSession(false);
        return;
      }

      let response;
      try {
        response = await withTimeout(
          api.getCurrentSession({
            authToken: storedSession.token,
          }),
          SESSION_RESTORE_TIMEOUT_MS,
          "Saved session check timed out. Sign in again.",
        );
      } catch (error) {
        await clearStoredUserSession();
        if (!active) {
          return;
        }

        if (!initialLinkLoaded) {
          setScreen("login");
        }
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to restore the saved session. Sign in again.",
        );
        setRestoringSession(false);
        return;
      }

      if (!active) {
        return;
      }

      if (!response.ok) {
        if (response.status === 401) {
          await clearStoredUserSession();
        }
        if (!active) {
          return;
        }

        if (!initialLinkLoaded) {
          setScreen("login");
        }
        if (response.status === 401) {
          setMessage("Saved session was revoked or expired. Sign in again.");
        } else {
          setError(
            response.error?.message ?? "Failed to restore the saved session.",
          );
        }
        setRestoringSession(false);
        return;
      }

      const restoredSession: UserSessionResponse = {
        ...storedSession,
        sessionId: response.data.session.sessionId,
        legal: response.data.legal,
        user: response.data.user,
      };

      updateSession(restoredSession);
      setCurrentSession(response.data.session);
      if (!initialLinkLoaded) {
        setScreen("app");
      }
      setRestoringSession(false);
      void persistSession(restoredSession);
    };

    const subscription = Linking.addEventListener("url", ({ url }) => {
      applyAuthLink(url);
    });

    void bootstrap();

    return () => {
      active = false;
      subscription.remove();
    };
  }, [
    api,
    applyAuthLink,
    persistSession,
    setError,
    setMessage,
    setScreen,
    updateSession,
  ]);

  return {
    session,
    currentSession,
    sessions,
    loadingSessions,
    restoringSession,
    visibleSessions:
      sessions.length > 0 ? sessions : currentSession ? [currentSession] : [],
    startAuthenticatedSession,
    clearSession,
    handleUnauthorized,
    reconcileSession,
    refreshCurrentSession,
    refreshSessions,
    revokeAllSessions,
    revokeSession,
    signOut,
  };
}
