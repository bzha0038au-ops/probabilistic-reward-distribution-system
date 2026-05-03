"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  AuthSessionSummary,
  CurrentUserSessionResponse,
  User,
} from "@reward/shared-types/auth";
import type { EconomyLedgerEntryRecord } from "@reward/shared-types/economy";
import type { WalletBalanceResponse } from "@reward/shared-types/user";
import type {
  RewardCenterResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import { readBluckAvailableBalance } from "@/lib/economy-wallet";
import { browserUserApiClient } from "@/lib/api/user-client";
import { userDashboardCopy } from "./user-dashboard-copy";

type UserDashboardCopy =
  (typeof userDashboardCopy)[keyof typeof userDashboardCopy];

type UseUserDashboardOptions = {
  initialCurrentSession: CurrentUserSessionResponse;
  copy: UserDashboardCopy;
  view?: "overview" | "profile" | "rewards" | "wallet" | "security";
};

export type UserDashboardActivityEntry = {
  id: string;
  entryType: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: number | null;
  createdAt: string | Date | null | undefined;
  source: "legacy" | "economy";
  assetCode: string | null;
};

const ACTIVITY_LIMIT = 8;

const toActivityTimestamp = (
  value: string | Date | null | undefined,
) => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const normalizeEconomyActivityEntry = (
  entry: EconomyLedgerEntryRecord,
): UserDashboardActivityEntry => ({
  id: `economy:${entry.id}`,
  entryType: entry.entryType,
  amount: entry.amount,
  balanceBefore: entry.balanceBefore,
  balanceAfter: entry.balanceAfter,
  referenceType: entry.referenceType ?? null,
  referenceId: entry.referenceId ?? null,
  createdAt: entry.createdAt,
  source: "economy",
  assetCode: entry.assetCode ?? null,
});

const sortActivityEntries = (
  left: UserDashboardActivityEntry,
  right: UserDashboardActivityEntry,
) => {
  const timestampDifference =
    toActivityTimestamp(right.createdAt) - toActivityTimestamp(left.createdAt);
  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return right.id.localeCompare(left.id);
};

const normalizeActivityEntries = (economyEntries: EconomyLedgerEntryRecord[]) =>
  economyEntries
    .map(normalizeEconomyActivityEntry)
    .sort(sortActivityEntries)
    .slice(0, ACTIVITY_LIMIT);

export function useUserDashboard(options: UseUserDashboardOptions) {
  const {
    initialCurrentSession,
    copy: c,
    view = "overview",
  } = options;

  const [currentUser, setCurrentUser] = useState<User>(
    initialCurrentSession.user,
  );
  const [currentSession, setCurrentSession] = useState<AuthSessionSummary>(
    initialCurrentSession.session,
  );
  const [wallet, setWallet] = useState<WalletBalanceResponse | null>(null);
  const [activityEntries, setActivityEntries] = useState<
    UserDashboardActivityEntry[]
  >([]);
  const [rewardCenter, setRewardCenter] = useState<RewardCenterResponse | null>(
    null,
  );
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([
    initialCurrentSession.session,
  ]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [phoneRequestSubmitting, setPhoneRequestSubmitting] = useState(false);
  const [phoneConfirmSubmitting, setPhoneConfirmSubmitting] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(false);
  const [claimingMissionId, setClaimingMissionId] =
    useState<RewardMissionId | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const needsWalletData = view === "wallet" || view === "profile";
  const needsActivityData = view === "wallet" || view === "profile";
  const needsRewardCenter = view === "rewards";
  const needsSessions = view === "security" || view === "profile";
  const walletBalance = readBluckAvailableBalance(wallet);
  const emailVerified = Boolean(currentUser.emailVerifiedAt);
  const phoneVerified = Boolean(currentUser.phoneVerifiedAt);

  useEffect(() => {
    void loadDashboard();
    // Each account page mounts its own dashboard instance, so the initial load
    // intentionally stays mount-scoped instead of tracking the local helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveDashboardLoadError = (
    failures: Array<{ status?: number; error?: { message?: string } }>,
  ) => {
    const unauthorizedFailure = failures.find(
      (failure) =>
        failure.status === 401 && failure.error?.message?.trim().length,
    );

    if (unauthorizedFailure?.error?.message) {
      return unauthorizedFailure.error.message;
    }

    return c.loadFailed;
  };

  async function loadDashboard(showSpinner = true) {
    if (showSpinner) {
      setDashboardLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const walletPromise = needsWalletData
        ? browserUserApiClient.getWalletBalance()
        : Promise.resolve(null);
      const economyLedgerPromise = needsActivityData
        ? browserUserApiClient.getEconomyLedger({ limit: ACTIVITY_LIMIT })
        : Promise.resolve(null);
      const rewardCenterPromise = needsRewardCenter
        ? browserUserApiClient.getRewardCenter()
        : Promise.resolve(null);
      const sessionsPromise = needsSessions
        ? browserUserApiClient.listSessions()
        : Promise.resolve(null);

      const [
        currentSessionResponse,
        walletResponse,
        economyLedgerResponse,
        rewardCenterResponse,
        sessionsResponse,
      ] = await Promise.all([
        browserUserApiClient.getCurrentSession(),
        walletPromise,
        economyLedgerPromise,
        rewardCenterPromise,
        sessionsPromise,
      ]);

      const failures: Array<{ status?: number; error?: { message?: string } }> =
        [];
      const collectFailure = (
        response:
          | {
              ok: boolean;
              status?: number;
              error?: { message?: string };
            }
          | null,
      ) => {
        if (response && !response.ok) {
          failures.push(response);
        }
      };

      collectFailure(currentSessionResponse);
      collectFailure(walletResponse);
      collectFailure(economyLedgerResponse);
      collectFailure(rewardCenterResponse);
      collectFailure(sessionsResponse);

      if (currentSessionResponse.ok) {
        setCurrentUser(currentSessionResponse.data.user);
        setCurrentSession(currentSessionResponse.data.session);
      }

      if (walletResponse?.ok) {
        setWallet(walletResponse.data);
      } else if (!needsWalletData) {
        setWallet(null);
      }

      if (economyLedgerResponse?.ok) {
        setActivityEntries(normalizeActivityEntries(economyLedgerResponse.data));
      } else if (needsActivityData) {
        setActivityEntries([]);
      } else if (!needsActivityData) {
        setActivityEntries([]);
      }

      if (rewardCenterResponse?.ok) {
        setRewardCenter(rewardCenterResponse.data);
      } else if (!needsRewardCenter) {
        setRewardCenter(null);
      }

      if (sessionsResponse?.ok) {
        setSessions(sessionsResponse.data.items);
      } else if (!needsSessions) {
        setSessions([
          currentSessionResponse.ok
            ? currentSessionResponse.data.session
            : initialCurrentSession.session,
        ]);
      }

      if (failures.length > 0) {
        setError(resolveDashboardLoadError(failures));
      }
    } catch {
      setError(c.loadFailed);
    } finally {
      setDashboardLoading(false);
      setRefreshing(false);
    }
  }

  function setFeedback(
    nextNotice: string | null,
    nextError: string | null = null,
  ) {
    setNotice(nextNotice);
    setError(nextError);
  }

  async function handleRefresh() {
    await loadDashboard(false);
  }

  async function handleClaimReward(missionId: RewardMissionId) {
    setClaimingMissionId(missionId);
    setFeedback(null, null);

    const response = await browserUserApiClient.claimRewardMission(missionId);

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setClaimingMissionId(null);
      return;
    }

    setFeedback(c.rewardClaimed);
    await loadDashboard(false);
    setClaimingMissionId(null);
  }

  async function handleSendVerificationEmail() {
    setEmailSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.requestEmailVerification({
      resend: true,
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
    } else {
      setFeedback(c.verificationEmailSent);
    }

    setEmailSubmitting(false);
  }

  async function handleSendPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim()) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setPhoneRequestSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.requestPhoneVerification({
      phone: phone.trim(),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
    } else {
      setFeedback(c.phoneCodeSent);
    }

    setPhoneRequestSubmitting(false);
  }

  async function handleConfirmPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim() || !phoneCode.trim()) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setPhoneConfirmSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.confirmPhoneVerification({
      phone: phone.trim(),
      code: phoneCode.trim(),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setPhoneConfirmSubmitting(false);
      return;
    }

    setPhoneCode("");
    setFeedback(c.phoneVerifiedNotice);
    await loadDashboard(false);
    setPhoneConfirmSubmitting(false);
  }

  async function handleRevokeSession(sessionId: string, current: boolean) {
    setSessionLoading(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.revokeSession(sessionId);

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setSessionLoading(false);
      return;
    }

    if (current) {
      window.location.assign("/login");
      return;
    }

    setFeedback(c.sessionRevoked);
    await loadDashboard(false);
    setSessionLoading(false);
  }

  async function handleRevokeAllSessions() {
    setSessionLoading(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.revokeAllSessions();

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setSessionLoading(false);
      return;
    }

    setFeedback(c.allSessionsRevoked);
    window.location.assign("/login");
  }

  return {
    currentUser,
    currentSession,
    wallet,
    activityEntries,
    walletBalance,
    rewardCenter,
    sessions,
    dashboardLoading,
    notice,
    error,
    phone,
    setPhone,
    phoneCode,
    setPhoneCode,
    emailSubmitting,
    phoneRequestSubmitting,
    phoneConfirmSubmitting,
    sessionLoading,
    claimingMissionId,
    refreshing,
    emailVerified,
    phoneVerified,
    handleRefresh,
    handleClaimReward,
    handleSendVerificationEmail,
    handleSendPhoneCode,
    handleConfirmPhone,
    handleRevokeSession,
    handleRevokeAllSessions,
  };
}

export type UserDashboardController = ReturnType<typeof useUserDashboard>;
