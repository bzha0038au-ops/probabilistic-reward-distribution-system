"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TbCards, TbChecklist, TbHome2, TbRosetteDiscountCheck, TbShieldCheck, TbWallet } from "react-icons/tb";

import { useLocale } from "@/components/i18n-provider";
import { LocaleSwitcher } from "@/components/locale-switcher";

const copy = {
  en: {
    brand: "Prize Pool Engine",
    eyebrow: "Player Access",
    title: "Wallet, rewards, tables, and security in one player console.",
    description:
      "Use the same account to move between login, account recovery, legal acceptance, and the live reward-driven game product.",
    overviewTitle: "Access lane",
    overviewDescription:
      "Every step routes back into the same player hub, wallet ledger, fairness proofs, and community surface.",
    metrics: [
      { label: "Reward wallet", value: "Ledger-backed" },
      { label: "Live tables", value: "Blackjack · Hold'em" },
      { label: "Trust path", value: "Email · Legal · Security" },
    ],
    steps: [
      "Create or recover the account.",
      "Verify the mailbox used for security and recovery.",
      "Accept current legal documents when the product requires it.",
      "Return to the player hub with wallet, missions, and game access intact.",
    ],
    home: "Back to home",
  },
  "zh-CN": {
    brand: "奖池引擎",
    eyebrow: "玩家入口",
    title: "把钱包、奖励、牌桌和账户安全收进同一个玩家控制台。",
    description:
      "登录、找回密码、邮箱验证和条款签署都走同一条账户路径，回到的也是同一个奖励驱动游戏产品。",
    overviewTitle: "进入路径",
    overviewDescription:
      "每一步最终都会回到同一个玩家中心、钱包账本、公平性证明和社区界面。",
    metrics: [
      { label: "奖励钱包", value: "账本驱动" },
      { label: "实时牌桌", value: "二十一点 · 德州" },
      { label: "信任链路", value: "邮箱 · 条款 · 安全" },
    ],
    steps: [
      "创建账号或恢复访问。",
      "验证用于安全通知和恢复的邮箱。",
      "在产品要求时接受当前生效条款。",
      "带着钱包、任务和玩法权限回到玩家中心。",
    ],
    home: "返回首页",
  },
} as const;

export function AuthPageShell({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const c = copy[locale === "zh-CN" ? "zh-CN" : "en"];
  const metricIcons = [TbWallet, TbCards, TbShieldCheck];

  return (
    <div className="min-h-app-screen overflow-hidden bg-[var(--retro-ivory)] text-[var(--retro-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(97,88,255,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(184,75,9,0.12),transparent_32%)]" />

      <div className="page-safe-x page-safe-y relative mx-auto flex min-h-app-screen w-full max-w-7xl flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 sm:pb-8">
          <Link
            href="/"
            className="retro-brand-mark inline-flex rounded-[1rem] px-4 py-2 text-[1.05rem] sm:text-[1.2rem]"
          >
            {c.brand}
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,17,31,0.14)] bg-white/86 px-4 py-2 text-sm font-semibold text-[var(--retro-ink)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)] transition hover:text-[var(--retro-orange)]"
            >
              <TbHome2 className="h-4 w-4" />
              {c.home}
            </Link>
            <LocaleSwitcher
              buttonClassName="!rounded-full !border-2 !px-4"
              activeButtonClassName="!border-[var(--retro-ink)] !bg-[var(--retro-gold)] !text-[var(--retro-ink)] !shadow-[3px_3px_0px_0px_rgba(15,17,31,0.94)]"
              inactiveButtonClassName="!border-[rgba(15,17,31,0.18)] !bg-white/86 !text-[var(--retro-ink)] !shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)] hover:!text-[var(--retro-orange)]"
            />
          </div>
        </div>

        <div className="grid flex-1 items-center gap-8 xl:grid-cols-[0.96fr,1.04fr]">
          <aside className="hidden xl:flex xl:flex-col xl:gap-5">
            <div className="retro-panel-dark rounded-[2rem] border-none p-6">
              <span className="retro-badge retro-badge-gold border-none">
                <TbRosetteDiscountCheck className="h-4 w-4" />
                {c.eyebrow}
              </span>
              <h1 className="mt-4 text-[3.1rem] font-semibold leading-[0.94] tracking-[-0.05em] text-slate-50">
                {c.title}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
                {c.description}
              </p>

              <div className="mt-6 grid gap-3">
                {c.metrics.map((metric, index) => {
                  const Icon = metricIcons[index];
                  return (
                  <div
                    key={metric.label}
                    className="rounded-[1.35rem] border-2 border-[#202745] bg-[rgba(255,255,255,0.04)] px-4 py-4"
                  >
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--retro-gold)]">
                      <Icon className="h-4 w-4" />
                      {metric.label}
                    </p>
                    <p className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-50">
                      {metric.value}
                    </p>
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="retro-panel rounded-[1.85rem] border-none p-5">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                <TbChecklist className="h-4 w-4" />
                {c.overviewTitle}
              </p>
              <p className="mt-3 text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                {c.overviewDescription}
              </p>
              <div className="mt-5 space-y-3">
                {c.steps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-start gap-3 rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/84 px-4 py-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-gold)] text-sm font-black text-[var(--retro-ink)]">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-[var(--retro-ink)]">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 items-center justify-center xl:justify-end">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
