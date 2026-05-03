import type { AppState } from "../app-types";
import { createBrowserUserApiClient, type BrowserUserApiClient } from "../api/user-client";
import { formatApiMoney } from "../game-utils";
import type {
  NotificationChannel,
  NotificationKind,
  NotificationListResponse,
  NotificationPreferencesResponse,
  NotificationSummary,
} from "@reward/shared-types/notification";
import type { ApiResult } from "@reward/user-core";

interface LiveDataControllerOptions {
  state: AppState;
  storage: Storage;
  authTokenStorageKey: string;
  rememberedEmailStorageKey: string;
  render: () => void;
  recordBeat: (message: string) => void;
  client?: BrowserUserApiClient;
}

export interface LiveDataController {
  start: () => Promise<void>;
  submitLogin: (email: string, password: string) => Promise<void>;
  refreshDashboard: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  logout: () => Promise<void>;
  revokeSession: (sessionId: string, current: boolean) => Promise<void>;
  revokeAllSessions: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  sendPhoneVerificationCode: (phone: string) => Promise<void>;
  confirmPhoneVerification: (code: string) => Promise<void>;
  beginMfaEnrollment: () => Promise<void>;
  verifyMfaEnrollment: (totpCode: string) => Promise<void>;
  disableMfa: (totpCode: string) => Promise<void>;
  markNotificationRead: (notificationId: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  updateNotificationPreference: (
    kind: NotificationKind,
    channel: NotificationChannel,
    enabled: boolean,
  ) => Promise<void>;
  claimRewardMission: (missionId: string) => Promise<void>;
  playLiveDraw: () => Promise<void>;
}

export function createLiveDataController(options: LiveDataControllerOptions): LiveDataController {
  const client =
    options.client ??
    createBrowserUserApiClient(() => options.state.live.authToken);

  const persistLiveSession = (): void => {
    if (options.state.live.authToken) {
      options.storage.setItem(options.authTokenStorageKey, options.state.live.authToken);
    } else {
      options.storage.removeItem(options.authTokenStorageKey);
    }

    if (options.state.live.rememberedEmail.trim()) {
      options.storage.setItem(
        options.rememberedEmailStorageKey,
        options.state.live.rememberedEmail.trim(),
      );
    } else {
      options.storage.removeItem(options.rememberedEmailStorageKey);
    }
  };

  const resetLivePayload = (): void => {
    options.state.live.session = null;
    options.state.live.wallet = null;
    options.state.live.drawOverview = null;
    options.state.live.activity = [];
    options.state.live.notifications = [];
    options.state.live.notificationSummary = null;
    options.state.live.notificationPreferences = [];
    options.state.live.notificationStatus = "idle";
    options.state.live.notificationMessage = "Sign in first before syncing alerts from the shared backend.";
    options.state.live.notificationMutating = false;
    options.state.live.rewardCenter = null;
    options.state.live.sessions = [];
    options.state.live.lastDraw = null;
    options.state.live.phoneDraft = "";
    options.state.live.phoneCodeDraft = "";
    options.state.live.phoneStatus = "idle";
    options.state.live.phoneMessage = "Sign in first, then add a phone number to unlock higher-trust actions.";
    options.state.live.phoneRequestSubmitting = false;
    options.state.live.phoneConfirmSubmitting = false;
    options.state.live.mfaSummary = null;
    options.state.live.mfaEnrollment = null;
    options.state.live.mfaCodeDraft = "";
    options.state.live.mfaStatus = "idle";
    options.state.live.mfaMessage = "Sign in first before opening a TOTP security lane.";
    options.state.live.mfaEnrollSubmitting = false;
    options.state.live.mfaVerifySubmitting = false;
    options.state.live.mfaDisableSubmitting = false;
  };

  const clearLiveSession = (message: string, status: "idle" | "error" = "idle"): void => {
    options.state.live.authToken = null;
    options.state.live.authStatus = status;
    options.state.live.authMessage = message;
    options.state.live.dashboardStatus = status === "error" ? "error" : "idle";
    options.state.live.dashboardMessage =
      status === "error" ? message : "No live account connected yet.";
    options.state.live.drawStatus = status === "error" ? "error" : "idle";
    options.state.live.drawMessage =
      status === "error" ? message : "The live draw engine is standing by.";
    resetLivePayload();
    persistLiveSession();
  };

  const applyNotificationSync = (payload: {
    list: ApiResult<NotificationListResponse>;
    summary: ApiResult<NotificationSummary>;
    preferences: ApiResult<NotificationPreferencesResponse>;
  }): void => {
    const notificationErrors = [payload.list, payload.summary, payload.preferences].filter(
      (result) => !result.ok,
    );

    options.state.live.notifications = payload.list.ok ? payload.list.data.items : [];
    options.state.live.notificationSummary = payload.summary.ok ? payload.summary.data : null;
    options.state.live.notificationPreferences = payload.preferences.ok
      ? payload.preferences.data.items
      : [];
    options.state.live.notificationMutating = false;

    if (notificationErrors.length > 0) {
      options.state.live.notificationStatus = "error";
      options.state.live.notificationMessage = notificationErrors[0].error.message;
      return;
    }

    const unreadCount = payload.summary.ok ? payload.summary.data.unreadCount : 0;
    options.state.live.notificationStatus = "ready";
    options.state.live.notificationMessage =
      unreadCount > 0
        ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"} waiting in the shared queue.`
        : "Notification queue is clean. Delivery rules are synced from the shared backend.";
  };

  const syncNotifications = async (
    loadingMessage: string,
    emptyMessage: string,
  ): Promise<boolean> => {
    if (!options.state.live.authToken) {
      options.state.live.notificationStatus = "error";
      options.state.live.notificationMessage = emptyMessage;
      options.state.live.notificationMutating = false;
      options.render();
      return false;
    }

    options.state.live.notificationStatus = "loading";
    options.state.live.notificationMessage = loadingMessage;
    options.state.live.notificationMutating = true;
    options.render();

    const [listResult, summaryResult, preferencesResult] = await Promise.all([
      client.listNotifications(6),
      client.getNotificationSummary(),
      client.listNotificationPreferences(),
    ]);

    applyNotificationSync({
      list: listResult,
      summary: summaryResult,
      preferences: preferencesResult,
    });
    options.render();
    return listResult.ok && summaryResult.ok && preferencesResult.ok;
  };

  const refreshDashboard = async (source: "restore" | "login" | "manual" | "draw" = "manual"): Promise<void> => {
    if (!options.state.live.authToken) {
      clearLiveSession("Sign in on the Profile tab to sync your real wallet and draw table.");
      options.render();
      return;
    }

    options.state.live.authStatus = "loading";
    options.state.live.dashboardStatus = "loading";
    options.state.live.authMessage =
      source === "restore"
        ? "Restoring your session from the house ledger."
        : "Checking your seat at the table.";
    options.state.live.dashboardMessage = "Fetching wallet, sessions, missions, ledger activity, and live draw odds.";
    options.state.live.notificationStatus = "loading";
    options.state.live.notificationMessage = "Loading the notification queue and delivery rules.";
    options.render();

    const [
      sessionResult,
      walletResult,
      activityResult,
      notificationsResult,
      notificationSummaryResult,
      notificationPreferencesResult,
      rewardCenterResult,
      sessionsResult,
      drawOverviewResult,
      mfaStatusResult,
    ] = await Promise.all([
      client.getCurrentSession(),
      client.getWalletBalance(),
      client.getEconomyLedger(8),
      client.listNotifications(6),
      client.getNotificationSummary(),
      client.listNotificationPreferences(),
      client.getRewardCenter(),
      client.listSessions(),
      client.getDrawOverview(),
      client.getUserMfaStatus(),
    ]);

    if (!sessionResult.ok) {
      clearLiveSession(sessionResult.error.message, "error");
      options.render();
      return;
    }

    options.state.live.session = sessionResult.data;
    options.state.live.authStatus = "ready";
    options.state.live.authMessage = `Signed in as ${sessionResult.data.user.email}.`;
    options.state.live.phoneStatus = sessionResult.data.user.phoneVerifiedAt ? "ready" : "idle";
    options.state.live.phoneMessage = sessionResult.data.user.phoneVerifiedAt
      ? "Phone verification completed. Higher-trust account actions are unlocked."
      : options.state.live.phoneDraft.trim()
        ? `A verification code can be sent to ${options.state.live.phoneDraft.trim()}.`
        : "Add a phone number to unlock higher-trust account actions.";
    options.state.live.phoneRequestSubmitting = false;
    options.state.live.phoneConfirmSubmitting = false;
    applyNotificationSync({
      list: notificationsResult,
      summary: notificationSummaryResult,
      preferences: notificationPreferencesResult,
    });
    options.state.live.mfaSummary = mfaStatusResult.ok ? mfaStatusResult.data : null;
    options.state.live.mfaStatus = mfaStatusResult.ok ? "ready" : "error";
    options.state.live.mfaMessage = mfaStatusResult.ok
      ? mfaStatusResult.data.mfaEnabled
        ? `MFA is enabled. Large withdrawals now require TOTP above ${formatApiMoney(mfaStatusResult.data.largeWithdrawalThreshold)}.`
        : `MFA is off. High-trust actions will step up at ${formatApiMoney(mfaStatusResult.data.largeWithdrawalThreshold)} unless you enable TOTP.`
      : mfaStatusResult.error.message;
    options.state.live.mfaEnrollSubmitting = false;
    options.state.live.mfaVerifySubmitting = false;
    options.state.live.mfaDisableSubmitting = false;

    const dashboardErrors = [
      walletResult,
      activityResult,
      rewardCenterResult,
      sessionsResult,
      drawOverviewResult,
      mfaStatusResult,
    ].filter((result) => !result.ok);

    options.state.live.wallet = walletResult.ok ? walletResult.data : null;
    options.state.live.activity = activityResult.ok ? activityResult.data : [];
    options.state.live.rewardCenter = rewardCenterResult.ok ? rewardCenterResult.data : null;
    options.state.live.sessions = sessionsResult.ok ? sessionsResult.data.items : [];
    options.state.live.drawOverview = drawOverviewResult.ok ? drawOverviewResult.data : null;

    if (dashboardErrors.length > 0) {
      options.state.live.dashboardStatus = "error";
      options.state.live.dashboardMessage = dashboardErrors[0].error.message;
    } else {
      options.state.live.dashboardStatus = "ready";
      options.state.live.dashboardMessage =
        source === "draw"
          ? "Wallet and draw odds resynced after the live pull."
          : "Wallet and draw odds are synced from the shared backend.";
      if (source === "login") {
        options.recordBeat(`Live account sync succeeded for ${sessionResult.data.user.email}.`);
      }
    }

    options.render();
  };

  return {
    start: async () => {
      if (!options.state.live.authToken) {
        return;
      }

      await refreshDashboard("restore");
    },
    submitLogin: async (email: string, password: string) => {
      const trimmedEmail = email.trim();
      options.state.live.rememberedEmail = trimmedEmail;
      persistLiveSession();

      if (!trimmedEmail || !password.trim()) {
        options.state.live.authStatus = "error";
        options.state.live.authMessage = "Email and password are both required.";
        options.render();
        return;
      }

      options.state.live.authStatus = "loading";
      options.state.live.authMessage = "The cat checks your name against the ledger.";
      options.state.live.dashboardStatus = "idle";
      options.state.live.dashboardMessage = "Waiting for session approval.";
      options.render();

      const sessionResult = await client.createSession({
        email: trimmedEmail,
        password,
      });

      if (!sessionResult.ok) {
        clearLiveSession(sessionResult.error.message, "error");
        options.state.live.rememberedEmail = trimmedEmail;
        persistLiveSession();
        options.render();
        return;
      }

      options.state.live.authToken = sessionResult.data.token;
      options.state.live.authStatus = "ready";
      options.state.live.authMessage = `Door opened for ${sessionResult.data.user.email}.`;
      options.state.live.drawStatus = "idle";
      options.state.live.drawMessage = "The live draw engine is standing by.";
      persistLiveSession();
      options.recordBeat(`Live session opened for ${sessionResult.data.user.email}.`);
      options.render();

      await refreshDashboard("login");
    },
    refreshDashboard: async () => {
      await refreshDashboard("manual");
    },
    refreshNotifications: async () => {
      await syncNotifications(
        "Refreshing the player-facing alert queue.",
        "Sign in before refreshing notification lanes.",
      );
    },
    logout: async () => {
      options.state.live.authStatus = "loading";
      options.state.live.authMessage = "Cashing out the live session.";
      options.render();

      if (options.state.live.authToken) {
        await client.deleteCurrentSession();
      }

      clearLiveSession("Live session cleared. Sign back in when you want the real wallet again.");
      options.recordBeat("Live session cleared and the room goes quiet again.");
      options.render();
    },
    revokeSession: async (sessionId, current) => {
      if (!options.state.live.authToken) {
        options.state.live.dashboardStatus = "error";
        options.state.live.dashboardMessage = "Sign in before revoking live sessions.";
        options.render();
        return;
      }

      options.state.live.dashboardStatus = "loading";
      options.state.live.dashboardMessage = current
        ? "Closing this device from the shared backend."
        : `Revoking session ${sessionId}.`;
      options.render();

      const result = await client.revokeSession(sessionId);

      if (!result.ok) {
        options.state.live.dashboardStatus = "error";
        options.state.live.dashboardMessage = result.error.message;
        options.render();
        return;
      }

      const shouldClearCurrentSession =
        current || options.state.live.session?.session.sessionId === sessionId;

      if (shouldClearCurrentSession) {
        clearLiveSession("This device was signed out from the shared backend. Sign back in when you want back in.");
        options.recordBeat("Current live session revoked from the profile security panel.");
        options.render();
        return;
      }

      options.recordBeat(`Live session ${sessionId} revoked from the profile security panel.`);
      await refreshDashboard("manual");
    },
    revokeAllSessions: async () => {
      if (!options.state.live.authToken) {
        options.state.live.dashboardStatus = "error";
        options.state.live.dashboardMessage = "Sign in before revoking all live sessions.";
        options.render();
        return;
      }

      options.state.live.dashboardStatus = "loading";
      options.state.live.dashboardMessage = "Signing out every visible live session.";
      options.render();

      const result = await client.revokeAllSessions();

      if (!result.ok) {
        options.state.live.dashboardStatus = "error";
        options.state.live.dashboardMessage = result.error.message;
        options.render();
        return;
      }

      clearLiveSession("All live sessions were revoked. Sign in again when you want to reopen the table.");
      options.recordBeat(
        `Revoked ${result.data.revokedCount} live session${result.data.revokedCount === 1 ? "" : "s"} from the profile security panel.`,
      );
      options.render();
    },
    sendVerificationEmail: async () => {
      if (!options.state.live.authToken) {
        options.state.live.authStatus = "error";
        options.state.live.authMessage = "Sign in first before asking for another verification email.";
        options.render();
        return;
      }

      options.state.live.authStatus = "loading";
      options.state.live.authMessage = "Asking the backend to resend the verification email.";
      options.render();

      const result = await client.requestEmailVerification({ resend: true });

      if (!result.ok) {
        options.state.live.authStatus = "error";
        options.state.live.authMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.authStatus = "ready";
      options.state.live.authMessage = "Verification email sent again. Check the bound inbox.";
      options.recordBeat("Verification email re-issued from the live profile panel.");
      options.render();
    },
    sendPhoneVerificationCode: async (phone) => {
      if (!options.state.live.authToken) {
        options.state.live.phoneStatus = "error";
        options.state.live.phoneMessage = "Sign in first before requesting a phone verification code.";
        options.render();
        return;
      }

      const trimmedPhone = phone.trim();
      options.state.live.phoneDraft = trimmedPhone;

      if (!trimmedPhone) {
        options.state.live.phoneStatus = "error";
        options.state.live.phoneMessage = "Enter a phone number before asking for an SMS code.";
        options.render();
        return;
      }

      options.state.live.phoneRequestSubmitting = true;
      options.state.live.phoneStatus = "loading";
      options.state.live.phoneMessage = `Requesting an SMS code for ${trimmedPhone}.`;
      options.render();

      const result = await client.requestPhoneVerification({ phone: trimmedPhone });

      options.state.live.phoneRequestSubmitting = false;

      if (!result.ok) {
        options.state.live.phoneStatus = "error";
        options.state.live.phoneMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.phoneStatus = "ready";
      options.state.live.phoneMessage = "Verification code sent. Enter the 6-digit SMS code to finish setup.";
      options.recordBeat(`Phone verification code sent to ${trimmedPhone}.`);
      options.render();
    },
    confirmPhoneVerification: async (code) => {
      if (!options.state.live.authToken) {
        options.state.live.phoneStatus = "error";
        options.state.live.phoneMessage = "Sign in first before confirming a phone verification code.";
        options.render();
        return;
      }

      const trimmedPhone = options.state.live.phoneDraft.trim();
      const trimmedCode = code.trim();
      options.state.live.phoneCodeDraft = trimmedCode;

      if (!trimmedPhone || !trimmedCode) {
        options.state.live.phoneStatus = "error";
        options.state.live.phoneMessage = "Add a phone number and the 6-digit SMS code before confirming.";
        options.render();
        return;
      }

      options.state.live.phoneConfirmSubmitting = true;
      options.state.live.phoneStatus = "loading";
      options.state.live.phoneMessage = "Confirming the SMS code with the shared backend.";
      options.render();

      const result = await client.confirmPhoneVerification({
        phone: trimmedPhone,
        code: trimmedCode,
      });

      options.state.live.phoneConfirmSubmitting = false;

      if (!result.ok) {
        options.state.live.phoneStatus = "error";
        options.state.live.phoneMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.phoneCodeDraft = "";
      options.state.live.phoneStatus = "ready";
      options.state.live.phoneMessage = "Phone verified. Higher-trust account actions are now unlocked.";
      options.recordBeat(`Phone verification completed for ${result.data.phone}.`);
      options.render();
      await refreshDashboard("manual");
    },
    beginMfaEnrollment: async () => {
      if (!options.state.live.authToken) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = "Sign in first before beginning MFA enrollment.";
        options.render();
        return;
      }

      options.state.live.mfaEnrollSubmitting = true;
      options.state.live.mfaStatus = "loading";
      options.state.live.mfaMessage = "Requesting a new authenticator enrollment secret.";
      options.render();

      const result = await client.createUserMfaEnrollment();
      options.state.live.mfaEnrollSubmitting = false;

      if (!result.ok) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.mfaEnrollment = result.data;
      options.state.live.mfaCodeDraft = "";
      options.state.live.mfaStatus = "ready";
      options.state.live.mfaMessage = "Scan the secret in your authenticator app, then confirm with a 6-digit TOTP code.";
      options.recordBeat("MFA enrollment secret issued from the profile security panel.");
      options.render();
    },
    verifyMfaEnrollment: async (totpCode) => {
      if (!options.state.live.authToken) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = "Sign in first before confirming MFA.";
        options.render();
        return;
      }

      const enrollmentToken = options.state.live.mfaEnrollment?.enrollmentToken?.trim() ?? "";
      const trimmedCode = totpCode.trim();
      options.state.live.mfaCodeDraft = trimmedCode;

      if (!enrollmentToken || !trimmedCode) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = "Start MFA enrollment first, then enter the current TOTP code.";
        options.render();
        return;
      }

      options.state.live.mfaVerifySubmitting = true;
      options.state.live.mfaStatus = "loading";
      options.state.live.mfaMessage = "Verifying the TOTP code with the shared backend.";
      options.render();

      const result = await client.verifyUserMfa({
        enrollmentToken,
        totpCode: trimmedCode,
      });
      options.state.live.mfaVerifySubmitting = false;

      if (!result.ok) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.mfaEnrollment = null;
      options.state.live.mfaCodeDraft = "";
      options.state.live.mfaStatus = "ready";
      options.state.live.mfaMessage = "MFA enabled. Future high-trust actions can now require TOTP confirmation.";
      options.recordBeat("MFA enabled from the profile security panel.");
      options.render();
      await refreshDashboard("manual");
    },
    disableMfa: async (totpCode) => {
      if (!options.state.live.authToken) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = "Sign in first before disabling MFA.";
        options.render();
        return;
      }

      const trimmedCode = totpCode.trim();
      options.state.live.mfaCodeDraft = trimmedCode;

      if (!trimmedCode) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = "Enter the current TOTP code before disabling MFA.";
        options.render();
        return;
      }

      options.state.live.mfaDisableSubmitting = true;
      options.state.live.mfaStatus = "loading";
      options.state.live.mfaMessage = "Disabling MFA through the shared backend.";
      options.render();

      const result = await client.disableUserMfa({
        totpCode: trimmedCode,
      });
      options.state.live.mfaDisableSubmitting = false;

      if (!result.ok) {
        options.state.live.mfaStatus = "error";
        options.state.live.mfaMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.mfaEnrollment = null;
      options.state.live.mfaCodeDraft = "";
      options.state.live.mfaStatus = "ready";
      options.state.live.mfaMessage = "MFA disabled. The account is back to email and phone verification only.";
      options.recordBeat("MFA disabled from the profile security panel.");
      options.render();
      await refreshDashboard("manual");
    },
    markNotificationRead: async (notificationId) => {
      if (!options.state.live.authToken) {
        options.state.live.notificationStatus = "error";
        options.state.live.notificationMessage = "Sign in before marking notifications as read.";
        options.render();
        return;
      }

      const existing = options.state.live.notifications.find((item) => item.id === notificationId);
      if (existing?.readAt) {
        return;
      }

      options.state.live.notificationMutating = true;
      options.state.live.notificationStatus = "loading";
      options.state.live.notificationMessage = `Marking notification ${notificationId} as read.`;
      options.render();

      const result = await client.markNotificationRead(notificationId);

      if (!result.ok) {
        options.state.live.notificationMutating = false;
        options.state.live.notificationStatus = "error";
        options.state.live.notificationMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.notifications = options.state.live.notifications.map((item) =>
        item.id === notificationId ? result.data : item,
      );
      options.state.live.notificationSummary = options.state.live.notificationSummary
        ? {
            ...options.state.live.notificationSummary,
            unreadCount:
              existing && !existing.readAt
                ? Math.max(options.state.live.notificationSummary.unreadCount - 1, 0)
                : options.state.live.notificationSummary.unreadCount,
          }
        : options.state.live.notificationSummary;
      options.state.live.notificationMutating = false;
      options.state.live.notificationStatus = "ready";
      options.state.live.notificationMessage = "Notification queue updated.";
      options.recordBeat(`Notification ${notificationId} marked as read from the live profile panel.`);
      options.render();
    },
    markAllNotificationsRead: async () => {
      if (!options.state.live.authToken) {
        options.state.live.notificationStatus = "error";
        options.state.live.notificationMessage = "Sign in before marking the queue as handled.";
        options.render();
        return;
      }

      options.state.live.notificationMutating = true;
      options.state.live.notificationStatus = "loading";
      options.state.live.notificationMessage = "Marking every visible notification as read.";
      options.render();

      const result = await client.markAllNotificationsRead();

      if (!result.ok) {
        options.state.live.notificationMutating = false;
        options.state.live.notificationStatus = "error";
        options.state.live.notificationMessage = result.error.message;
        options.render();
        return;
      }

      if (result.data.updatedCount > 0) {
        await syncNotifications(
          "Refreshing the queue after the bulk read action.",
          "Sign in before refreshing notification lanes.",
        );
      } else {
        options.state.live.notificationMutating = false;
        options.state.live.notificationStatus = "ready";
        options.state.live.notificationMessage = "All visible notifications were already handled.";
        options.render();
      }

      options.recordBeat(
        `Marked ${result.data.updatedCount} notification${result.data.updatedCount === 1 ? "" : "s"} as read from the live profile panel.`,
      );
    },
    updateNotificationPreference: async (kind, channel, enabled) => {
      if (!options.state.live.authToken) {
        options.state.live.notificationStatus = "error";
        options.state.live.notificationMessage = "Sign in before changing delivery rules.";
        options.render();
        return;
      }

      options.state.live.notificationMutating = true;
      options.state.live.notificationStatus = "loading";
      options.state.live.notificationMessage = `Updating ${channel} delivery for ${kind}.`;
      options.render();

      const result = await client.updateNotificationPreferences({
        items: [{ kind, channel, enabled }],
      });

      if (!result.ok) {
        options.state.live.notificationMutating = false;
        options.state.live.notificationStatus = "error";
        options.state.live.notificationMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.notificationPreferences = result.data.items;
      options.state.live.notificationMutating = false;
      options.state.live.notificationStatus = "ready";
      options.state.live.notificationMessage = `${channel.toUpperCase()} delivery for ${kind} is now ${enabled ? "enabled" : "paused"}.`;
      options.recordBeat(
        `Notification delivery for ${kind}/${channel} switched ${enabled ? "on" : "off"} from the live profile panel.`,
      );
      options.render();
    },
    claimRewardMission: async (missionId) => {
      if (!options.state.live.authToken) {
        options.state.live.dashboardStatus = "error";
        options.state.live.dashboardMessage = "Sign in before claiming live reward missions.";
        options.render();
        return;
      }

      options.state.live.dashboardStatus = "loading";
      options.state.live.dashboardMessage = `Claiming reward mission ${missionId}.`;
      options.render();

      const result = await client.claimRewardMission(missionId);

      if (!result.ok) {
        options.state.live.dashboardStatus = "error";
        options.state.live.dashboardMessage = result.error.message;
        options.render();
        return;
      }

      options.recordBeat(
        `Reward mission ${missionId} claimed for ${formatApiMoney(result.data.grantedAmount)}.`,
      );
      await refreshDashboard("manual");
    },
    playLiveDraw: async () => {
      if (!options.state.live.authToken) {
        options.state.live.drawStatus = "error";
        options.state.live.drawMessage = "Sign in on Profile before calling the live draw engine.";
        options.render();
        return;
      }

      options.state.live.drawStatus = "loading";
      options.state.live.drawMessage = "Spinning the shared draw engine.";
      options.render();

      const result = await client.playDraw({
        count: 1,
        clientNonce: `last-chance-${Date.now()}`,
      });

      if (!result.ok) {
        options.state.live.drawStatus = "error";
        options.state.live.drawMessage = result.error.message;
        options.render();
        return;
      }

      options.state.live.lastDraw = result.data;
      options.state.live.drawStatus = "ready";
      options.state.live.drawMessage = `${result.data.winCount} hit${result.data.winCount === 1 ? "" : "s"}, ending on ${formatApiMoney(result.data.endingBalance)}.`;

      if (options.state.live.drawOverview) {
        options.state.live.drawOverview = {
          ...options.state.live.drawOverview,
          balance: result.data.endingBalance,
          pity: result.data.pity,
        };
      }

      options.recordBeat(
        `Live draw settled ${result.data.winCount} win${result.data.winCount === 1 ? "" : "s"} for ${formatApiMoney(result.data.totalReward)}.`,
      );
      options.render();
      await refreshDashboard("draw");
    },
  };
}
