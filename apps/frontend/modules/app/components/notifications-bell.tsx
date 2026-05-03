"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useTranslations } from "@/components/i18n-provider";
import { buttonVariants } from "@/components/ui/button";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";

export function NotificationsBell({
  className,
  badgeClassName,
}: {
  className?: string;
  badgeClassName?: string;
}) {
  const t = useTranslations();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const response = await browserUserApiClient.getNotificationSummary();
      if (!response.ok || cancelled) {
        return;
      }

      setUnreadCount(response.data.unreadCount);
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <Link
      href="/app/notifications"
      aria-label={t("app.notificationBellLabel")}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "relative rounded-full border border-white/10 bg-white/[0.03] px-4 text-slate-200 hover:bg-white/[0.08] hover:text-white",
        className,
      )}
    >
      <span className="text-base leading-none">🔔</span>
      {unreadCount > 0 ? (
        <span
          className={cn(
            "ml-2 rounded-full bg-cyan-400 px-2 py-0.5 text-[11px] font-semibold text-slate-950",
            badgeClassName,
          )}
        >
          {unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
