"use client";
import type { CurrentUserSessionResponse } from "@reward/shared-types/auth";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLocale, useTranslations } from "@/components/i18n-provider";
import { RewardCenter } from "@/modules/app/components/reward-center";
import { UserDashboardAccountSection } from "./user-dashboard-account-section";
import { UserDashboardActivitySection } from "./user-dashboard-activity-section";
import { userDashboardCopy } from "./user-dashboard-copy";
import { UserDashboardPaymentsSection } from "./user-dashboard-payments-section";
import { useFeedbackToast } from "./use-feedback-toast";
import { useUserDashboard } from "./use-user-dashboard";
import { UserDashboardWalletSection } from "./user-dashboard-wallet-section";
import {
  formatUserDashboardAmount,
  formatUserDashboardDateTime,
  formatUserDashboardStatus,
} from "./user-dashboard-utils";

export type UserDashboardView =
  | "overview"
  | "rewards"
  | "wallet"
  | "payments"
  | "security";

type UserDashboardProps = {
  initialCurrentSession: CurrentUserSessionResponse;
  view?: UserDashboardView;
};

export function UserDashboard({
  initialCurrentSession,
  view = "overview",
}: UserDashboardProps) {
  const locale = useLocale();
  const t = useTranslations();
  const c = userDashboardCopy[locale];
  const controller = useUserDashboard({
    initialCurrentSession,
    copy: c,
  });
  const {
    dashboardLoading,
    rewardCenter,
    claimingMissionId,
    refreshing,
    notice,
    error,
    emailVerified,
    phoneVerified,
    financeUnlocked,
    handleClaimReward,
  } = controller;

  const formatAmount = (value: string | number | null | undefined) =>
    formatUserDashboardAmount(locale, value);

  const formatDateTime = (value: string | Date | null | undefined) =>
    formatUserDashboardDateTime(locale, c.unknown, value);

  const formatStatus = (value: string | null | undefined) =>
    formatUserDashboardStatus(locale, c.unknown, value);
  const showAccountSection = view === "overview" || view === "security";
  const showGameplayRoutes = view === "overview";
  const showAccountRoutes = view === "overview";
  const showRewards = view === "rewards";
  const showWalletSection = view === "wallet";
  const showPaymentsSection = view === "payments";
  const showTransactionsSection = view === "wallet";
  const showSessionsSection = view === "security";

  useFeedbackToast({
    notice,
    noticeTitle: t("common.dashboard"),
    error,
    errorTitle: c.loadFailed,
  });

  if (dashboardLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{c.accountTitle}</CardTitle>
            <CardDescription>{t("common.loading")}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{c.walletTitle}</CardTitle>
            <CardDescription>{t("common.loading")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          data-testid="dashboard-notice"
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          data-testid="dashboard-error"
        >
          {error}
        </div>
      ) : null}

      {showAccountSection ? (
        <UserDashboardAccountSection
          copy={c}
          controller={controller}
          emailVerified={emailVerified}
          financeUnlocked={financeUnlocked}
          phoneVerified={phoneVerified}
          showAccountRoutes={showAccountRoutes}
          showGameplayRoutes={showGameplayRoutes}
          t={t}
        />
      ) : null}

      {showRewards ? (
        <RewardCenter
          center={rewardCenter}
          loading={dashboardLoading || refreshing}
          claimingMissionId={claimingMissionId}
          onClaim={handleClaimReward}
        />
      ) : null}

      {showWalletSection || showPaymentsSection ? (
        <section
          className={`grid gap-6 ${
            showWalletSection && showPaymentsSection
              ? "xl:grid-cols-[0.95fr,1.05fr]"
              : "xl:grid-cols-1"
          }`}
        >
          {showWalletSection ? (
            <UserDashboardWalletSection
              controller={controller}
              copy={c}
              locale={locale}
              formatAmount={formatAmount}
              formatDateTime={formatDateTime}
              formatStatus={formatStatus}
              t={t}
            />
          ) : null}

          {showPaymentsSection ? (
            <UserDashboardPaymentsSection
              controller={controller}
              copy={c}
              financeUnlocked={financeUnlocked}
              formatAmount={formatAmount}
              formatDateTime={formatDateTime}
              formatStatus={formatStatus}
              t={t}
            />
          ) : null}
        </section>
      ) : null}

      {showTransactionsSection || showSessionsSection ? (
        <UserDashboardActivitySection
          controller={controller}
          copy={c}
          formatAmount={formatAmount}
          formatDateTime={formatDateTime}
          formatStatus={formatStatus}
          showSessionsSection={showSessionsSection}
          showTransactionsSection={showTransactionsSection}
          t={t}
        />
      ) : null}
    </div>
  );
}
