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
import { DashboardFeedbackNotice } from "./user-dashboard-domain-ui";
import { UserDashboardAccountSection } from "./user-dashboard-account-section";
import { userDashboardCopy } from "./user-dashboard-copy";
import { UserDashboardProfilePage } from "./user-dashboard-profile-page";
import { UserDashboardSecurityPage } from "./user-dashboard-security-page";
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
  | "profile"
  | "rewards"
  | "wallet"
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
    view,
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
    handleClaimReward,
  } = controller;

  const formatAmount = (value: string | number | null | undefined) =>
    formatUserDashboardAmount(locale, value);

  const formatDateTime = (value: string | Date | null | undefined) =>
    formatUserDashboardDateTime(locale, c.unknown, value);

  const formatStatus = (value: string | null | undefined) =>
    formatUserDashboardStatus(locale, c.unknown, value);
  const showOverviewHub = view === "overview";
  const showProfileCenter = view === "profile";
  const showRewards = view === "rewards";
  const showSecurityPage = view === "security";
  const showWalletSection = view === "wallet";

  useFeedbackToast({
    notice,
    noticeTitle: t("common.dashboard"),
    error,
    errorTitle: c.loadFailed,
  });

  if (dashboardLoading) {
    if (view === "profile") {
      return (
        <div className="space-y-6">
          <Card className="retro-panel-dark rounded-[1.95rem] border-none">
            <CardHeader>
              <CardTitle className="text-[1.9rem] text-white">
                {c.profileWalletEyebrow}
              </CardTitle>
              <CardDescription className="text-slate-300">
                {t("common.loading")}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="retro-panel-dark rounded-[1.95rem] border-none">
            <CardHeader>
              <CardTitle className="text-[1.7rem] text-white">
                {c.profileAccountEyebrow}
              </CardTitle>
              <CardDescription className="text-slate-300">
                {t("common.loading")}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    if (view === "overview") {
      return (
        <div className="space-y-6">
          <Card className="retro-panel-dark rounded-[1.9rem] border-none">
            <CardHeader>
              <CardTitle className="text-[1.9rem] text-white">
                {c.overviewHeroEyebrow}
              </CardTitle>
              <CardDescription className="text-slate-300">
                {t("common.loading")}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="retro-panel-featured rounded-[1.8rem] border-none">
            <CardHeader>
              <CardTitle className="text-[1.7rem] text-[var(--retro-ink)]">
                {c.lobbyTitle}
              </CardTitle>
              <CardDescription className="text-[rgba(15,17,31,0.62)]">
                {t("common.loading")}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }

    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="retro-panel-featured rounded-[1.8rem] border-none">
          <CardHeader>
            <CardTitle className="text-[1.9rem] text-[var(--retro-ink)]">
              {c.accountTitle}
            </CardTitle>
            <CardDescription className="text-[rgba(15,17,31,0.62)]">
              {t("common.loading")}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="retro-panel rounded-[1.8rem] border-none">
          <CardHeader>
            <CardTitle className="text-[1.9rem] text-[var(--retro-ink)]">
              {c.walletTitle}
            </CardTitle>
            <CardDescription className="text-[rgba(15,17,31,0.62)]">
              {t("common.loading")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <DashboardFeedbackNotice tone="success" testId="dashboard-notice">
          {notice}
        </DashboardFeedbackNotice>
      ) : null}
      {error ? (
        <DashboardFeedbackNotice tone="danger" testId="dashboard-error">
          {error}
        </DashboardFeedbackNotice>
      ) : null}

      {showOverviewHub ? (
        <UserDashboardAccountSection
          copy={c}
          emailVerified={emailVerified}
          phoneVerified={phoneVerified}
          showGameplayRoutes
          t={t}
        />
      ) : null}

      {showProfileCenter ? (
        <UserDashboardProfilePage
          copy={c}
          controller={controller}
          emailVerified={emailVerified}
          formatAmount={formatAmount}
          formatDateTime={formatDateTime}
          locale={locale}
          phoneVerified={phoneVerified}
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

      {showWalletSection ? (
        <section className="grid gap-6 xl:grid-cols-1">
          <UserDashboardWalletSection
            controller={controller}
            copy={c}
            locale={locale}
            formatAmount={formatAmount}
            formatDateTime={formatDateTime}
            loadingLabel={t("common.loading")}
          />
        </section>
      ) : null}

      {showSecurityPage ? (
        <UserDashboardSecurityPage
          controller={controller}
          copy={c}
          emailVerified={emailVerified}
          phoneVerified={phoneVerified}
          formatDateTime={formatDateTime}
          formatStatus={formatStatus}
          t={t}
        />
      ) : null}
    </div>
  );
}
