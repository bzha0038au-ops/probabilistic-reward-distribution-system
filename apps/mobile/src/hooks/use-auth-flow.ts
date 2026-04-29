import { useCallback, useState, type MutableRefObject } from "react";
import type {
  RegisterRequest,
  UserSessionResponse,
} from "@reward/shared-types/auth";
import { createUserApiClient } from "@reward/user-core";

import { parseAuthLink, resolveAuthTokenInput } from "../auth-links";
import {
  isExplicitLinkInput,
  seededEmail,
  seededPassword,
  type ScreenMode,
} from "../app-support";

type AuthFlowApi = Pick<
  ReturnType<typeof createUserApiClient>,
  | "confirmEmailVerification"
  | "createSession"
  | "register"
  | "requestEmailVerification"
  | "requestPasswordReset"
  | "confirmPasswordReset"
>;

export type AuthFlowSessionBridge = {
  session: UserSessionResponse | null;
  startAuthenticatedSession: (session: UserSessionResponse) => Promise<void>;
  clearSession: (message?: string) => Promise<void>;
  reconcileSession: (
    baseSession: UserSessionResponse,
    overrides?: {
      sessionId?: string;
      emailVerifiedAt?: string | null;
      phoneVerifiedAt?: string | null;
      legal?: UserSessionResponse["legal"];
    },
  ) => Promise<UserSessionResponse>;
  refreshCurrentSession: (
    baseSession: UserSessionResponse,
  ) => Promise<UserSessionResponse | null>;
  handleUnauthorized: (message: string) => Promise<boolean>;
};

type UseAuthFlowOptions = {
  api: AuthFlowApi;
  sessionBridgeRef: MutableRefObject<AuthFlowSessionBridge | null>;
  refreshRewardCenter: () => Promise<boolean>;
  onResetSessionExperience: () => void;
  resetFeedback: () => void;
  setScreen: (screen: ScreenMode) => void;
  setMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
  setSubmitting: (value: boolean) => void;
};

export function useAuthFlow(options: UseAuthFlowOptions) {
  const {
    api,
    sessionBridgeRef,
    refreshRewardCenter,
    onResetSessionExperience,
    resetFeedback,
    setScreen,
    setMessage,
    setError,
    setSubmitting,
  } = options;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [resetTokenInput, setResetTokenInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verificationTokenInput, setVerificationTokenInput] = useState("");
  const [sendingVerification, setSendingVerification] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const resetAuthInputs = useCallback(() => {
    setPassword("");
    setBirthDate("");
    setResetTokenInput("");
    setNewPassword("");
    setVerificationTokenInput("");
    setSendingVerification(false);
  }, []);

  const resolveTokenForScreen = useCallback(
    (rawValue: string, expectedScreen: "resetPassword" | "verifyEmail") => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return "";
      }

      const linkIntent = parseAuthLink(trimmed);
      if (linkIntent) {
        if (linkIntent.screen !== expectedScreen) {
          setError(
            expectedScreen === "resetPassword"
              ? "This link opens email verification, not password reset."
              : "This link opens password reset, not email verification.",
          );
          return null;
        }

        return linkIntent.token;
      }

      if (isExplicitLinkInput(trimmed)) {
        setError("The link is missing a valid token.");
        return null;
      }

      return resolveAuthTokenInput(trimmed);
    },
    [setError],
  );

  const applyAuthLink = useCallback(
    (url: string) => {
      const intent = parseAuthLink(url);
      if (!intent) {
        return false;
      }

      resetFeedback();

      if (intent.screen === "resetPassword") {
        setResetTokenInput(intent.token);
        setScreen("resetPassword");
        setMessage("Recovery link loaded. Set a new password to continue.");
        return true;
      }

      setVerificationTokenInput(intent.token);
      setScreen("verifyEmail");
      setMessage(
        "Verification link loaded. Confirm the email to finish activation.",
      );
      return true;
    },
    [resetFeedback, setMessage, setScreen],
  );

  const applyAuthenticatedSession = useCallback(
    async (
      sessionResponse: UserSessionResponse,
      options?: {
        successMessage?: string;
      },
    ) => {
      const sessionBridge = sessionBridgeRef.current;
      if (!sessionBridge) {
        setError("Session coordinator is unavailable.");
        setSubmitting(false);
        return;
      }

      onResetSessionExperience();
      await sessionBridge.startAuthenticatedSession(sessionResponse);
      setScreen("app");
      setMessage(
        options?.successMessage ??
          "Signed in. Session is now stored securely on this device.",
      );
      setSubmitting(false);
    },
    [
      onResetSessionExperience,
      sessionBridgeRef,
      setError,
      setMessage,
      setScreen,
      setSubmitting,
    ],
  );

  const handleLogin = useCallback(async () => {
    resetFeedback();

    if (!normalizedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    setSubmitting(true);
    const response = await api.createSession({
      email: normalizedEmail,
      password,
    });

    if (!response.ok) {
      setError(response.error?.message ?? "Login failed.");
      setSubmitting(false);
      return;
    }

    await applyAuthenticatedSession(response.data);
  }, [
    api,
    applyAuthenticatedSession,
    normalizedEmail,
    password,
    resetFeedback,
    setError,
    setSubmitting,
  ]);

  const handleSeededLogin = useCallback(async () => {
    resetFeedback();
    setScreen("login");
    setEmail(seededEmail);
    setPassword(seededPassword);
    setSubmitting(true);

    const response = await api.createSession({
      email: seededEmail,
      password: seededPassword,
    });

    if (!response.ok) {
      setError(response.error?.message ?? "Seeded login failed.");
      setSubmitting(false);
      return;
    }

    await applyAuthenticatedSession(response.data, {
      successMessage: "Signed in with the seeded test user.",
    });
  }, [
    api,
    applyAuthenticatedSession,
    resetFeedback,
    setError,
    setScreen,
    setSubmitting,
  ]);

  const handleRegister = useCallback(
    async (legalAcceptances: RegisterRequest["legalAcceptances"] = []) => {
      resetFeedback();

      if (!normalizedEmail || !password || !birthDate.trim()) {
        setError("Email, password, and birth date are required.");
        return;
      }

      setSubmitting(true);
      const response = await api.register({
        email: normalizedEmail,
        password,
        birthDate: birthDate.trim(),
        legalAcceptances,
      });

      if (!response.ok) {
        setError(response.error?.message ?? "Registration failed.");
        setSubmitting(false);
        return;
      }

      setMessage("Account created. Check your inbox for the verification link.");
      setScreen("login");
      setSubmitting(false);
    },
    [
      api,
      normalizedEmail,
      password,
      birthDate,
      resetFeedback,
      setError,
      setMessage,
      setScreen,
      setSubmitting,
    ],
  );

  const handleRequestPasswordReset = useCallback(async () => {
    resetFeedback();

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    const response = await api.requestPasswordReset({ email: normalizedEmail });

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to request password reset.");
      setSubmitting(false);
      return;
    }

    setMessage("If the account exists, a reset link has been sent.");
    setScreen("forgotPassword");
    setSubmitting(false);
  }, [
    api,
    normalizedEmail,
    resetFeedback,
    setError,
    setMessage,
    setScreen,
    setSubmitting,
  ]);

  const handleConfirmPasswordReset = useCallback(async () => {
    resetFeedback();

    const token = resolveTokenForScreen(resetTokenInput, "resetPassword");
    if (!token || !newPassword) {
      if (!token) {
        return;
      }
      setError("A reset token and new password are required.");
      return;
    }

    setSubmitting(true);
    const response = await api.confirmPasswordReset({
      token,
      password: newPassword,
    });

    if (!response.ok) {
      setError(response.error?.message ?? "Password reset failed.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setResetTokenInput("");
    setNewPassword("");
    const sessionBridge = sessionBridgeRef.current;
    if (sessionBridge) {
      await sessionBridge.clearSession(
        "Password updated. Sign in with the new password.",
      );
    }
  }, [
    api,
    newPassword,
    resetFeedback,
    resetTokenInput,
    resolveTokenForScreen,
    sessionBridgeRef,
    setError,
    setSubmitting,
  ]);

  const handleConfirmEmailVerification = useCallback(async () => {
    resetFeedback();

    const token = resolveTokenForScreen(verificationTokenInput, "verifyEmail");
    if (!token) {
      if (verificationTokenInput.trim()) {
        return;
      }
      setError("A verification token is required.");
      return;
    }

    setSubmitting(true);
    const response = await api.confirmEmailVerification({ token });

    if (!response.ok) {
      setError(response.error?.message ?? "Email verification failed.");
      setSubmitting(false);
      return;
    }

    const sessionBridge = sessionBridgeRef.current;
    const session = sessionBridge?.session;

    if (session?.token && sessionBridge) {
      const nextEmailVerifiedAt = new Date().toISOString();
      await sessionBridge.reconcileSession(session, {
        emailVerifiedAt: nextEmailVerifiedAt,
      });
      await sessionBridge.refreshCurrentSession({
        ...session,
        user: {
          ...session.user,
          emailVerifiedAt: nextEmailVerifiedAt,
        },
      });
      await refreshRewardCenter();
      setScreen("app");
      setMessage(`Email verified for ${response.data.email}.`);
    } else {
      setScreen("login");
      setMessage(
        `Email verified for ${response.data.email}. You can sign in now.`,
      );
    }

    setVerificationTokenInput("");
    setSubmitting(false);
  }, [
    api,
    refreshRewardCenter,
    resetFeedback,
    resolveTokenForScreen,
    sessionBridgeRef,
    setError,
    setMessage,
    setScreen,
    setSubmitting,
    verificationTokenInput,
  ]);

  const handleRequestEmailVerification = useCallback(async () => {
    const sessionBridge = sessionBridgeRef.current;
    if (!sessionBridge?.session?.token) {
      setError("Sign in before requesting another verification email.");
      return;
    }

    resetFeedback();
    setSendingVerification(true);
    const response = await api.requestEmailVerification();

    if (!response.ok) {
      if (response.status === 401) {
        setSendingVerification(false);
        await sessionBridge.handleUnauthorized(
          "Session expired or was revoked. Sign in again.",
        );
        return;
      }

      setError(response.error?.message ?? "Failed to send verification email.");
      setSendingVerification(false);
      return;
    }

    setMessage("Verification email sent. Open it on this device to continue.");
    setSendingVerification(false);
  }, [api, resetFeedback, sessionBridgeRef, setError, setMessage]);

  return {
    applyAuthLink,
    email,
    password,
    birthDate,
    resetTokenInput,
    newPassword,
    verificationTokenInput,
    sendingVerification,
    normalizedEmail,
    setEmail,
    setPassword,
    setBirthDate,
    setResetTokenInput,
    setNewPassword,
    setVerificationTokenInput,
    resetAuthInputs,
    handleLogin,
    handleSeededLogin,
    handleRegister,
    handleRequestPasswordReset,
    handleConfirmPasswordReset,
    handleConfirmEmailVerification,
    handleRequestEmailVerification,
  };
}
