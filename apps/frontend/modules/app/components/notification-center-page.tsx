"use client";

import { useEffect, useState } from "react";
import type { NotificationRecord } from "@reward/shared-types/notification";

import { useLocale, useTranslations } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { browserUserApiClient } from "@/lib/api/user-client";

const formatNotificationKind = (kind: string) =>
  kind.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());

export function NotificationCenterPage() {
  const locale = useLocale();
  const t = useTranslations();
  const [items, setItems] = useState<NotificationRecord[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(summaryResponse.error?.message ?? "Failed to load notifications.");
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
    const response = await browserUserApiClient.markNotificationRead(notificationId);
    setMutating(false);

    if (!response.ok) {
      setError(response.error?.message ?? "Failed to update notification.");
      return;
    }

    setItems((current) =>
      current?.map((item) => (item.id === notificationId ? response.data : item)) ?? current,
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

  return (
    <section className="space-y-6">
      <Card className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-3xl">{t("app.notificationsTitle")}</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6 text-slate-300">
              {t("app.notificationsDescription")}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100">
              {t("app.notificationsUnreadCount", { count: unreadCount })}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading || mutating}
              className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              {t("app.notificationsRefresh")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void markAllRead()}
              disabled={loading || mutating || unreadCount === 0}
              className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
            >
              {t("app.notificationsReadAll")}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-rose-300/30 bg-rose-400/12 text-rose-50">
          <CardContent className="pt-6 text-sm leading-6" role="alert">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {items && items.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-slate-100">
          <CardContent className="pt-6 text-sm text-slate-300">
            {t("app.notificationsEmpty")}
          </CardContent>
        </Card>
      ) : null}

      {items?.map((item) => {
        const createdAt = new Date(item.createdAt);
        const isUnread = !item.readAt;

        return (
          <Card
            key={item.id}
            className="border-white/10 bg-white/[0.04] text-slate-100 shadow-[0_20px_70px_rgba(15,23,42,0.22)]"
          >
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    {formatNotificationKind(item.kind)}
                  </span>
                  {isUnread ? (
                    <span className="rounded-full bg-cyan-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-950">
                      New
                    </span>
                  ) : null}
                </div>
                <CardTitle className="text-xl">{item.title}</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  {item.body}
                </CardDescription>
              </div>

              <div className="flex flex-col items-end gap-3 text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {Number.isNaN(createdAt.valueOf())
                    ? String(item.createdAt)
                    : createdAt.toLocaleString(locale)}
                </p>
                {isUnread ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void markRead(item.id)}
                    disabled={mutating}
                    className="rounded-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                  >
                    {t("app.notificationsMarkRead")}
                  </Button>
                ) : null}
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </section>
  );
}
