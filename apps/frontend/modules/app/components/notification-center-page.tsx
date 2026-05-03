"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  NotificationKind,
  NotificationRecord,
} from "@reward/shared-types/notification";
import type { IconType } from "react-icons";
import {
  TbBellFilled,
  TbCards,
  TbChartLine,
  TbCheck,
  TbGiftFilled,
  TbRefresh,
  TbShieldLock,
} from "react-icons/tb";

import { useLocale, useTranslations } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";

type NotificationCategory =
  | "all"
  | "rewards"
  | "games"
  | "market"
  | "security";

const rewardKinds = new Set<NotificationKind>([
  "aml_review",
  "saas_tenant_invite",
  "saas_onboarding_complete",
  "saas_billing_budget_alert",
  "kyc_reverification",
  "kyc_status_changed",
  "withdrawal_status_changed",
]);

const gameKinds = new Set<NotificationKind>(["holdem_table_invite"]);
const marketKinds = new Set<NotificationKind>(["prediction_market_settled"]);
const securityKinds = new Set<NotificationKind>([
  "password_reset",
  "email_verification",
  "phone_verification",
  "security_alert",
]);

const formatRelativeDate = (locale: string, value: string | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return String(value);
  }

  const diffMs = date.valueOf() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffDays = Math.round(diffMs / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  return formatter.format(diffDays, "day");
};

const getNotificationCategory = (kind: NotificationKind): NotificationCategory => {
  if (securityKinds.has(kind)) {
    return "security";
  }
  if (marketKinds.has(kind)) {
    return "market";
  }
  if (gameKinds.has(kind)) {
    return "games";
  }
  if (rewardKinds.has(kind)) {
    return "rewards";
  }
  return "rewards";
};

const getNotificationIcon = (kind: NotificationKind): IconType => {
  if (marketKinds.has(kind)) {
    return TbChartLine;
  }
  if (gameKinds.has(kind)) {
    return TbCards;
  }
  if (kind === "security_alert" || kind === "password_reset") {
    return TbShieldLock;
  }
  if (kind === "email_verification" || kind === "phone_verification") {
    return TbCheck;
  }
  return TbGiftFilled;
};

const getCategoryToneClass = (category: NotificationCategory) => {
  if (category === "market") {
    return "border-[rgba(108,118,255,0.24)] bg-[rgba(108,118,255,0.12)] text-[var(--retro-violet)]";
  }
  if (category === "games") {
    return "border-[rgba(68,151,103,0.28)] bg-[rgba(68,151,103,0.14)] text-[var(--retro-green)]";
  }
  if (category === "security") {
    return "border-[rgba(214,93,47,0.28)] bg-[rgba(214,93,47,0.12)] text-[var(--retro-orange)]";
  }
  return "border-[rgba(240,179,53,0.28)] bg-[rgba(240,179,53,0.14)] text-[var(--retro-gold)]";
};

const getRowAccentClass = (kind: NotificationKind) => {
  const category = getNotificationCategory(kind);
  return getCategoryToneClass(category);
};

export function NotificationCenterPage() {
  const locale = useLocale();
  const t = useTranslations();
  const [items, setItems] = useState<NotificationRecord[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<NotificationCategory>("all");

  const refresh = async () => {
    setLoading(true);
    setError(null);

    const [listResponse, summaryResponse] = await Promise.all([
      browserUserApiClient.listNotifications({ limit: 50 }),
      browserUserApiClient.getNotificationSummary(),
    ]);

    if (!listResponse.ok) {
      setError(listResponse.error?.message ?? "Failed to load notifications.");
      setLoading(false);
      return;
    }

    if (!summaryResponse.ok) {
      setError(
        summaryResponse.error?.message ?? "Failed to load notifications.",
      );
      setLoading(false);
      return;
    }

    setItems(listResponse.data.items);
    setUnreadCount(summaryResponse.data.unreadCount);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [locale]);

  const markRead = async (notificationId: number) => {
    setMutating(true);
    const response = await browserUserApiClient.markNotificationRead(
      notificationId,
    );
    setMutating(false);

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to update notification.");
      return;
    }

    setItems((current) =>
      current?.map((item) => (item.id === notificationId ? response.data : item)) ??
      current,
    );
    setUnreadCount((current) => Math.max(current - 1, 0));
  };

  const markAllRead = async () => {
    setMutating(true);
    const response = await browserUserApiClient.markAllNotificationsRead();
    setMutating(false);

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to update notifications.");
      return;
    }

    if (response.data.updatedCount > 0) {
      await refresh();
    }
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<NotificationCategory, number> = {
      all: items?.length ?? 0,
      rewards: 0,
      games: 0,
      market: 0,
      security: 0,
    };

    for (const item of items ?? []) {
      counts[getNotificationCategory(item.kind)] += 1;
    }

    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!items) {
      return null;
    }
    if (activeCategory === "all") {
      return items;
    }
    return items.filter(
      (item) => getNotificationCategory(item.kind) === activeCategory,
    );
  }, [activeCategory, items]);

  const categoryOptions: Array<{
    category: NotificationCategory;
    label: string;
  }> = [
    { category: "all", label: t("app.notificationsFilterAll") },
    { category: "rewards", label: t("app.notificationsFilterRewards") },
    { category: "games", label: t("app.notificationsFilterGames") },
    { category: "market", label: t("app.notificationsFilterMarket") },
    { category: "security", label: t("app.notificationsFilterSecurity") },
  ];

  return (
    <section className="space-y-6">
      <Card className="retro-panel-dark overflow-hidden rounded-[1.95rem] border-none">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-[2rem] font-black uppercase tracking-[-0.04em] text-[var(--retro-gold)] md:text-[2.35rem]">
                {t("app.notificationsTitle")}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6 text-slate-300">
                {t("app.notificationsDescription")}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="arcadeOutline"
                size="icon"
                onClick={() => void refresh()}
                disabled={loading || mutating}
                aria-label={t("app.notificationsRefresh")}
              >
                <TbRefresh className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="arcadeDark"
                size="icon"
                onClick={() => void markAllRead()}
                disabled={loading || mutating || unreadCount === 0}
                aria-label={t("app.notificationsReadAll")}
              >
                <TbBellFilled className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {categoryOptions.map((option) => {
              const active = activeCategory === option.category;
              return (
                <button
                  key={option.category}
                  type="button"
                  data-testid={`notifications-filter-${option.category}`}
                  onClick={() => setActiveCategory(option.category)}
                  className={cn(
                    "rounded-[1rem] border-2 px-4 py-2.5 text-sm font-bold tracking-[-0.02em] transition",
                    active
                      ? "border-[var(--retro-gold)] bg-[rgba(217,127,47,0.92)] text-[var(--retro-ivory)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.42)]"
                      : "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-slate-200 hover:border-[var(--retro-gold)] hover:text-[var(--retro-gold)]",
                  )}
                >
                  <span>{option.label}</span>
                  {option.category === "all" && unreadCount > 0 ? (
                    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--retro-red)] px-1.5 py-0.5 text-[0.68rem] font-black leading-none text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-[1.35rem] border-2 border-[var(--retro-red)] bg-[#ffebe6] px-4 py-4 text-sm text-[var(--retro-ink)]">
          {error}
        </div>
      ) : null}

      {filteredItems && filteredItems.length === 0 ? (
        <Card className="retro-panel rounded-[1.8rem] border-none">
          <CardContent className="space-y-2 p-5 text-sm text-[rgba(15,17,31,0.62)]">
            <p className="font-semibold text-[var(--retro-ink)]">
              {items && items.length > 0
                ? t("app.notificationsEmptyFiltered")
                : t("app.notificationsEmpty")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="retro-panel overflow-hidden rounded-[1.95rem] border-none">
        <CardContent className="px-0 py-0">
          {loading && !items ? (
            <div className="px-5 py-6 text-sm text-[rgba(15,17,31,0.62)]">
              {t("app.notificationsRefresh")}
            </div>
          ) : null}

          {filteredItems?.map((item, index) => {
            const unread = !item.readAt;
            const Icon = getNotificationIcon(item.kind);
            const category = getNotificationCategory(item.kind);

            return (
              <button
                key={item.id}
                type="button"
                data-testid={`notification-item-${item.id}`}
                onClick={() => {
                  if (unread && !mutating) {
                    void markRead(item.id);
                  }
                }}
                className={cn(
                  "flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-[rgba(15,17,31,0.03)]",
                  unread ? "bg-[rgba(255,248,231,0.42)]" : "bg-transparent",
                  index !== 0 ? "border-t border-[rgba(15,17,31,0.08)]" : "",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)]",
                    getRowAccentClass(item.kind),
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-base font-bold tracking-[-0.02em] text-[var(--retro-ink)]">
                        {item.title}
                      </p>
                      <p className="line-clamp-2 text-sm leading-6 text-[rgba(15,17,31,0.72)]">
                        {item.body}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-2 text-right">
                      <p className="text-xs text-[rgba(15,17,31,0.5)]">
                        {formatRelativeDate(locale, item.createdAt)}
                      </p>
                      <Badge
                        className={cn(
                          "border-none text-[0.62rem]",
                          category === "security"
                            ? "retro-badge retro-badge-red"
                            : category === "market"
                              ? "retro-badge retro-badge-violet"
                              : category === "games"
                                ? "retro-badge retro-badge-green"
                                : "retro-badge retro-badge-gold",
                        )}
                      >
                        {category === "market"
                          ? t("app.notificationsFilterMarket")
                          : category === "games"
                            ? t("app.notificationsFilterGames")
                            : category === "security"
                              ? t("app.notificationsFilterSecurity")
                              : t("app.notificationsFilterRewards")}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[rgba(15,17,31,0.5)]">
                    <span>{new Date(item.createdAt).toLocaleString(locale)}</span>
                    {unread ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[var(--retro-orange)]">
                        <span className="h-2 w-2 rounded-full bg-[var(--retro-orange)]" />
                        {t("app.notificationsUnreadBadge")}
                      </span>
                    ) : (
                      <span>{t("app.notificationsReadBadge")}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Badge className="retro-badge retro-badge-gold border-none">
          {t("app.notificationsUnreadCount", { count: unreadCount })}
        </Badge>
        <Badge className="retro-badge retro-badge-ink border-none">
          {t("app.notificationsFilterRewards")} {categoryCounts.rewards}
        </Badge>
        <Badge className="retro-badge retro-badge-violet border-none">
          {t("app.notificationsFilterMarket")} {categoryCounts.market}
        </Badge>
        <Badge className="retro-badge retro-badge-green border-none">
          {t("app.notificationsFilterGames")} {categoryCounts.games}
        </Badge>
      </div>
    </section>
  );
}
