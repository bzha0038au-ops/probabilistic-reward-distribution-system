"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FairnessCommit,
  FairnessReveal,
} from "@reward/shared-types/fairness";
import { getFairnessRevealDate, verifyFairnessReveal } from "@reward/user-core";

import { useLocale } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  GameMetricTile,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";

const copy = {
  en: {
    eyebrow: "Transparency first",
    title: "Provably fair system",
    description:
      "The reward engine publishes a commit hash before an epoch resolves. Once the round closes, the seed becomes revealable so you can recompute SHA-256 locally and confirm the backend could not swap outcomes after the fact.",
    summaryBody:
      "This page is a standalone verifier for the same commit-reveal pipeline used across tables, reward draws, and market settlement.",
    liveCommit: "Live commit",
    localVerifier: "Local verifier",
    auditTrail: "Audit trail",
    verificationLab: "Verification lab",
    verificationLabBody:
      "Keep the current epoch, reveal target, and auto-audit posture in one place while you check a closed round.",
    currentCommit: "Current commit",
    currentCommitBody:
      "The backend publishes this hash before the epoch resolves. Any result inside the same epoch must derive from the unrevealed seed behind this hash.",
    currentEpoch: "Current epoch",
    revealAfter: "Reveal after",
    commitHash: "Commit hash",
    epochDuration: "Epoch duration",
    verifiedDays: "Continuous auto-audit days",
    verifiedEpochs: "Verified epochs",
    lastAutoAudit: "Last auto-audit",
    latestAuditedEpoch: "Latest audited epoch",
    recommendedEpoch: "Suggested closed epoch",
    recommendationPending: "Wait for rollover",
    autoAuditHealthy: "Passing",
    autoAuditIssue: "Issue detected",
    noAuditYet: "No closed epoch has been auto-audited yet.",
    auditedThrough: (epoch: number, auditedAt: string) =>
      `Auto-reveal verification is currently validated through epoch ${epoch} at ${auditedAt}.`,
    refresh: "Refresh commit",
    refreshing: "Refreshing...",
    trioTitle: "The verification trio",
    publishTitle: "1. Publish commit",
    publishBody:
      "A public hash is posted while the seed stays private, locking the server into one outcome space for the full epoch.",
    revealTitle: "2. Reveal closed epoch",
    revealBody:
      "Only older epochs can reveal. The active seed stays hidden until the next rollover completes.",
    verifyTitle: "3. Verify locally",
    verifyBody:
      "The browser recomputes SHA-256(seed) and checks it against the original commit without relying on the server response.",
    revealCard: "Reveal closed epoch",
    revealCardBody:
      "Enter an older epoch to fetch its seed, then run the same local hash comparison a player or auditor would use.",
    epochInput: "Epoch number",
    revealButton: "Reveal and verify",
    revealing: "Revealing...",
    noPreviousEpoch:
      "No previous epoch is available yet. Wait for the first rollover to complete.",
    resultTitle: "Verification result",
    resultPendingTitle: "No reveal yet",
    resultPendingBody:
      "Run a closed-epoch reveal to compare the published commit with the locally computed SHA-256 hash.",
    revealedAt: "Revealed at",
    seed: "Seed",
    publishedCommit: "Published commit",
    computedCommit: "Computed SHA-256(seed)",
    verified: "Verified",
    mismatch: "Mismatch",
    verifiedBody:
      "Local verification passed. The revealed seed hashes to the same commit that was published before the epoch closed.",
    mismatchBody:
      "Local verification failed. The revealed seed does not match the published commit hash.",
    toolFlowTitle: "Audit flow",
    stepFetchTitle: "Fetch live commit",
    stepFetchBody:
      "Pull the public epoch hash and its reveal schedule from the backend.",
    stepRevealTitle: "Reveal closed seed",
    stepRevealBody:
      "Pick an earlier epoch after rollover so the original seed is safe to expose.",
    stepCompareTitle: "Compare both hashes",
    stepCompareBody:
      "Hash the seed in-browser and compare it to the published commit with no server trust required.",
    postureTitle: "Auto-audit posture",
    postureBody:
      "The backend also runs continuous reveal checks. Use this summary to spot whether the automated audit loop is keeping up.",
    emptyValue: "Unknown",
    loadFailed: "Failed to load the fairness commit.",
    revealFailed: "Failed to reveal the selected epoch.",
    invalidEpoch: "Enter a valid epoch number first.",
    epochLabel: "Epoch",
    secondsShort: (seconds: number) => `${seconds}s`,
    minutesShort: (minutes: number) => `${minutes} min`,
  },
  "zh-CN": {
    eyebrow: "透明优先",
    title: "可验证公平系统",
    description:
      "奖励引擎会在 epoch 结束前先公开 commit 哈希。等这一轮关闭后，seed 才能被 reveal；此时前端会本地重算 SHA-256，确认后端无法在结果落地后再替换种子。",
    summaryBody:
      "这个页面把 tables、reward draw 和 market settlement 共用的 commit-reveal 流程单独拆成可审计工具页。",
    liveCommit: "实时 Commit",
    localVerifier: "本地验证",
    auditTrail: "审计轨迹",
    verificationLab: "验证实验室",
    verificationLabBody:
      "把当前 epoch、可 reveal 目标和自动审计状态收在一起，方便你检查任意已结束轮次。",
    currentCommit: "当前 Commit",
    currentCommitBody:
      "后端会在 epoch 结束前先公布这条哈希；同一 epoch 内的结果都必须来自这条哈希背后的未公开 seed。",
    currentEpoch: "当前 Epoch",
    revealAfter: "可 Reveal 时间",
    commitHash: "Commit 哈希",
    epochDuration: "Epoch 时长",
    verifiedDays: "连续自动校验天数",
    verifiedEpochs: "连续校验 Epoch",
    lastAutoAudit: "最近自动校验",
    latestAuditedEpoch: "最近审计到的 Epoch",
    recommendedEpoch: "建议验证的已结束 Epoch",
    recommendationPending: "等待 rollover",
    autoAuditHealthy: "校验通过",
    autoAuditIssue: "发现异常",
    noAuditYet: "当前还没有已结束 epoch 的自动校验记录。",
    auditedThrough: (epoch: number, auditedAt: string) =>
      `后台自动 reveal 校验目前已经覆盖到 epoch ${epoch}，最近一次发生在 ${auditedAt}。`,
    refresh: "刷新 Commit",
    refreshing: "刷新中...",
    trioTitle: "验证三件套",
    publishTitle: "1. 先公开 Commit",
    publishBody:
      "先把哈希公开，seed 仍然保密；这样整轮 epoch 的结果空间就被提前锁定。",
    revealTitle: "2. Reveal 已结束 Epoch",
    revealBody:
      "只有更早的 epoch 才能 reveal，当前正在运行的 seed 会一直保密到 rollover 完成。",
    verifyTitle: "3. 前端本地校验",
    verifyBody:
      "浏览器直接重算 SHA-256(seed)，再和最初公布的 commit 比对，不依赖服务端口头解释。",
    revealCard: "Reveal 已结束 Epoch",
    revealCardBody:
      "输入一个更早的 epoch，拉回它的 seed，然后运行和玩家、审计员一致的本地哈希比对。",
    epochInput: "Epoch 编号",
    revealButton: "Reveal 并验证",
    revealing: "Reveal 中...",
    noPreviousEpoch:
      "当前还没有上一轮已结束 epoch，等第一次 rollover 完成后再验证。",
    resultTitle: "验证结果",
    resultPendingTitle: "还没有 Reveal 结果",
    resultPendingBody:
      "先对一个已结束 epoch 发起 reveal，再把已公布的 commit 和本地计算出来的 SHA-256 哈希对比。",
    revealedAt: "Reveal 时间",
    seed: "Seed",
    publishedCommit: "已公布 Commit",
    computedCommit: "本地计算 SHA-256(seed)",
    verified: "验证通过",
    mismatch: "校验不通过",
    verifiedBody:
      "本地验证通过。reveal 出来的 seed 计算出的哈希，与 epoch 关闭前公开的 commit 完全一致。",
    mismatchBody:
      "本地验证失败。当前 reveal 出来的 seed 与已公布 commit 哈希不一致。",
    toolFlowTitle: "审计流程",
    stepFetchTitle: "读取当前 Commit",
    stepFetchBody: "先从后端拉取当前 epoch 的公开哈希和它的 reveal 时机。",
    stepRevealTitle: "Reveal 已结束 Seed",
    stepRevealBody:
      "选择一个 rollover 完成后的旧 epoch，拿到当时真正使用过的 seed。",
    stepCompareTitle: "比较两条哈希",
    stepCompareBody:
      "在浏览器内重算 seed 哈希，并和最初公开的 commit 比较，不依赖服务端兜底。",
    postureTitle: "自动审计状态",
    postureBody:
      "后端也会持续执行 reveal 校验。这个摘要用来确认自动审计循环是否健康、是否跟上了最新关闭轮次。",
    emptyValue: "未知",
    loadFailed: "加载公平性 Commit 失败。",
    revealFailed: "Reveal 指定 epoch 失败。",
    invalidEpoch: "请先输入合法的 epoch 编号。",
    epochLabel: "Epoch",
    secondsShort: (seconds: number) => `${seconds} 秒`,
    minutesShort: (minutes: number) => `${minutes} 分钟`,
  },
} as const;

type FairnessCopy = (typeof copy)[keyof typeof copy];

type AccentTone = "gold" | "violet" | "orange";

type IntegritySignalCardProps = {
  title: string;
  body: string;
  step: string;
  tone: AccentTone;
};

type RailDatumProps = {
  label: string;
  value: string | number;
  valueClassName?: string;
};

type HashLedgerRowProps = {
  label: string;
  value: string;
  tone?: "ink" | "violet" | "orange";
};

const signalToneClasses: Record<AccentTone, string> = {
  gold:
    "border-[rgba(255,213,61,0.32)] bg-[linear-gradient(180deg,rgba(255,249,220,0.92),rgba(255,243,191,0.94))] text-[var(--retro-ink)]",
  violet:
    "border-[rgba(97,88,255,0.24)] bg-[linear-gradient(180deg,rgba(239,237,255,0.96),rgba(229,225,255,0.92))] text-[var(--retro-ink)]",
  orange:
    "border-[rgba(184,75,9,0.22)] bg-[linear-gradient(180deg,rgba(255,241,232,0.96),rgba(255,228,210,0.94))] text-[var(--retro-ink)]",
};

const signalStepClasses: Record<AccentTone, string> = {
  gold: "bg-[var(--retro-gold)] text-[var(--retro-ink)]",
  violet: "bg-[var(--retro-violet)] text-white",
  orange: "bg-[var(--retro-orange)] text-[var(--retro-ivory)]",
};

const hashToneClasses: Record<NonNullable<HashLedgerRowProps["tone"]>, string> = {
  ink: "text-[var(--retro-ink)]",
  violet: "text-[var(--retro-violet)]",
  orange: "text-[var(--retro-orange)]",
};

function formatTimestamp(
  value: string | Date | null | undefined,
  fallback: string,
) {
  if (!value) {
    return fallback;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    return fallback;
  }

  return timestamp.toLocaleString();
}

function shortenHash(value: string) {
  return value.length > 22
    ? `${value.slice(0, 14)}...${value.slice(-8)}`
    : value;
}

function formatEpochDuration(
  seconds: number | null | undefined,
  c: FairnessCopy,
) {
  if (!seconds || seconds < 60) {
    return c.secondsShort(seconds ?? 0);
  }

  const wholeMinutes = seconds / 60;
  if (Number.isInteger(wholeMinutes)) {
    return c.minutesShort(wholeMinutes);
  }

  return c.secondsShort(seconds);
}

function getRecommendedEpoch(commit: FairnessCommit | null) {
  if (!commit || commit.epoch <= 0) {
    return null;
  }

  return commit.epoch - 1;
}

function IntegritySignalCard({
  title,
  body,
  step,
  tone,
}: IntegritySignalCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] border-2 p-5 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.12)]",
        signalToneClasses[tone],
      )}
    >
      <span
        className={cn(
          "inline-flex h-10 min-w-10 items-center justify-center rounded-full border-2 border-[rgba(15,17,31,0.94)] px-3 text-sm font-black",
          signalStepClasses[tone],
        )}
      >
        {step}
      </span>
      <div className="mt-4 space-y-2">
        <h3 className="text-base font-black tracking-[-0.02em] text-[var(--retro-ink)]">
          {title}
        </h3>
        <p className="text-sm leading-7 text-[rgba(15,17,31,0.7)]">{body}</p>
      </div>
    </div>
  );
}

function RailDatum({ label, value, valueClassName }: RailDatumProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-[rgba(226,232,240,0.58)]">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold text-slate-50",
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function HashLedgerRow({
  label,
  value,
  tone = "ink",
}: HashLedgerRowProps) {
  return (
    <div className="rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/82 p-4">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-[rgba(15,17,31,0.54)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 break-all font-mono text-sm leading-6",
          hashToneClasses[tone],
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function FairnessDemoPanel() {
  const locale = useLocale();
  const c = copy[locale];
  const [commit, setCommit] = useState<FairnessCommit | null>(null);
  const [reveal, setReveal] = useState<FairnessReveal | null>(null);
  const [revealEpoch, setRevealEpoch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const verification = useMemo(
    () => (reveal ? verifyFairnessReveal(reveal) : null),
    [reveal],
  );

  const suggestedEpoch = getRecommendedEpoch(commit);
  const revealAt = formatTimestamp(
    getFairnessRevealDate(commit),
    c.emptyValue,
  );
  const audit = commit?.audit;
  const auditStatus =
    audit?.lastAuditPassed == null
      ? "--"
      : audit.lastAuditPassed
        ? c.autoAuditHealthy
        : c.autoAuditIssue;
  const auditDetail =
    audit?.latestAuditedEpoch === null || audit?.latestAuditedEpoch === undefined
      ? c.noAuditYet
      : c.auditedThrough(
          audit.latestAuditedEpoch,
          formatTimestamp(audit.lastAuditedAt, c.emptyValue),
        );

  async function loadCommit() {
    setLoadingCommit(true);
    setError(null);

    try {
      const response = await browserUserApiClient.getFairnessCommit();
      if (!response.ok) {
        setError(response.error?.message ?? c.loadFailed);
        return;
      }

      setCommit(response.data);
    } catch {
      setError(c.loadFailed);
    } finally {
      setLoadingCommit(false);
    }
  }

  async function handleReveal() {
    const epoch = Number(revealEpoch.trim());
    if (!Number.isFinite(epoch) || epoch < 0) {
      setError(c.invalidEpoch);
      return;
    }

    setRevealing(true);
    setError(null);

    try {
      const response = await browserUserApiClient.revealFairnessSeed(epoch);
      if (!response.ok) {
        setError(response.error?.message ?? c.revealFailed);
        return;
      }

      setReveal(response.data);
    } catch {
      setError(c.revealFailed);
    } finally {
      setRevealing(false);
    }
  }

  useEffect(() => {
    void loadCommit();
  }, []);

  useEffect(() => {
    if (!commit || revealEpoch) {
      return;
    }

    if (commit.epoch > 0) {
      setRevealEpoch(String(commit.epoch - 1));
    }
  }, [commit, revealEpoch]);

  return (
    <div className="space-y-6">
      <GameSurfaceCard tone="light" className="overflow-hidden">
        <div className="grid xl:grid-cols-[1.08fr,0.92fr]">
          <div className="retro-ivory-surface relative overflow-hidden px-6 py-7 md:px-8 md:py-8">
            <div className="absolute inset-0 retro-dot-overlay opacity-35" />
            <div className="absolute inset-y-0 right-0 hidden w-24 bg-gradient-to-r from-transparent via-[rgba(97,88,255,0.08)] to-[rgba(97,88,255,0.16)] xl:block" />
            <div className="relative space-y-6">
              <div className="space-y-4">
                <span className="retro-kicker">{c.eyebrow}</span>
                <div className="space-y-3">
                  <h1 className="retro-section-title text-[var(--retro-ink)]">
                    {c.title}
                  </h1>
                  <p className="retro-subtitle max-w-3xl">{c.description}</p>
                  <p className="max-w-2xl text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                    {c.summaryBody}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="retro-stat-chip">{c.liveCommit}</span>
                  <span className="retro-stat-chip">{c.localVerifier}</span>
                  <span className="retro-stat-chip">{c.auditTrail}</span>
                </div>
              </div>

              <GameSectionBlock
                tone="light"
                className="space-y-4 bg-white/82 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--retro-orange)]">
                      {c.currentCommit}
                    </p>
                    <p className="max-w-2xl text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                      {c.currentCommitBody}
                    </p>
                  </div>
                  <GamePill
                    tone={audit?.lastAuditPassed ? "success" : "info"}
                    surface="light"
                  >
                    {audit?.lastAuditPassed ? c.autoAuditHealthy : c.localVerifier}
                  </GamePill>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <GameMetricTile
                    tone="light"
                    label={c.currentEpoch}
                    value={commit?.epoch ?? "--"}
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.revealAfter}
                    value={revealAt}
                    valueClassName="mt-2 text-sm font-semibold text-[var(--retro-ink)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.commitHash}
                    value={commit ? shortenHash(commit.commitHash) : "--"}
                    valueClassName="mt-2 font-mono text-sm text-[var(--retro-violet)]"
                  />
                  <GameMetricTile
                    tone="light"
                    label={c.epochDuration}
                    value={formatEpochDuration(commit?.epochSeconds, c)}
                    valueClassName="mt-2 text-sm font-semibold text-[var(--retro-ink)]"
                  />
                </div>
              </GameSectionBlock>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="retro-badge retro-badge-gold">{c.trioTitle}</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <IntegritySignalCard
                    tone="gold"
                    step="01"
                    title={c.publishTitle}
                    body={c.publishBody}
                  />
                  <IntegritySignalCard
                    tone="violet"
                    step="02"
                    title={c.revealTitle}
                    body={c.revealBody}
                  />
                  <IntegritySignalCard
                    tone="orange"
                    step="03"
                    title={c.verifyTitle}
                    body={c.verifyBody}
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            className="retro-panel-dark relative flex h-full flex-col justify-between gap-5 px-6 py-7 md:px-8 md:py-8"
            data-testid="fairness-lab-panel"
          >
            <div className="space-y-5">
              <div className="space-y-3">
                <span className="retro-badge retro-badge-gold">
                  {c.verificationLab}
                </span>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-[-0.03em] text-white">
                    {c.verificationLab}
                  </h2>
                  <p className="max-w-xl text-sm leading-7 text-slate-300">
                    {c.verificationLabBody}
                  </p>
                </div>
              </div>

              <GameSectionBlock tone="dark" className="space-y-4">
                <RailDatum
                  label={c.currentEpoch}
                  value={commit?.epoch ?? "--"}
                  valueClassName="text-2xl font-black tracking-[-0.04em] text-white"
                />
                <RailDatum label={c.recommendedEpoch} value={suggestedEpoch ?? c.recommendationPending} />
                <RailDatum
                  label={c.revealAfter}
                  value={revealAt}
                  valueClassName="leading-6 text-slate-200"
                />
                <RailDatum
                  label={c.commitHash}
                  value={commit ? shortenHash(commit.commitHash) : "--"}
                  valueClassName="font-mono text-[0.92rem] text-[var(--retro-gold)]"
                />
              </GameSectionBlock>

              <GameSectionBlock tone="dark" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <RailDatum
                    label={c.verifiedDays}
                    value={audit?.consecutiveVerifiedDays ?? 0}
                    valueClassName="text-xl font-black text-white"
                  />
                  <RailDatum
                    label={c.verifiedEpochs}
                    value={audit?.consecutiveVerifiedEpochs ?? 0}
                    valueClassName="text-xl font-black text-white"
                  />
                  <RailDatum label={c.lastAutoAudit} value={auditStatus} />
                  <RailDatum
                    label={c.latestAuditedEpoch}
                    value={audit?.latestAuditedEpoch ?? "--"}
                  />
                </div>

                <GameStatusNotice
                  tone={
                    audit?.lastAuditPassed == null
                      ? "neutral"
                      : audit.lastAuditPassed
                        ? "success"
                        : "danger"
                  }
                  surface="dark"
                  className="leading-7"
                >
                  {auditDetail}
                </GameStatusNotice>
              </GameSectionBlock>
            </div>

            <Button
              type="button"
              onClick={() => void loadCommit()}
              disabled={loadingCommit}
              variant="arcadeDark"
              size="xl"
              className="w-full"
            >
              {loadingCommit ? c.refreshing : c.refresh}
            </Button>
          </div>
        </div>
      </GameSurfaceCard>

      <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
        <GameSurfaceCard tone="light">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl text-[var(--retro-ink)]">
              {c.revealCard}
            </CardTitle>
            <CardDescription className="max-w-2xl text-[rgba(15,17,31,0.68)]">
              {c.revealCardBody}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[0.86fr,1.14fr]">
              <GameSectionBlock tone="light" className="space-y-4">
                <div className="space-y-2">
                  <label
                    className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--retro-ink)]"
                    htmlFor="fairness-epoch"
                  >
                    {c.epochInput}
                  </label>
                  <Input
                    id="fairness-epoch"
                    value={revealEpoch}
                    onChange={(event) => setRevealEpoch(event.target.value)}
                    inputMode="numeric"
                    className="retro-field h-12 text-base"
                    data-testid="fairness-reveal-input"
                  />
                </div>

                {commit?.epoch === 0 ? (
                  <GameStatusNotice tone="warning" surface="light">
                    {c.noPreviousEpoch}
                  </GameStatusNotice>
                ) : null}

                <Button
                  type="button"
                  onClick={() => void handleReveal()}
                  disabled={revealing}
                  variant="arcade"
                  size="xl"
                  className="w-full"
                >
                  {revealing ? c.revealing : c.revealButton}
                </Button>
              </GameSectionBlock>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="retro-badge retro-badge-violet">
                    {c.toolFlowTitle}
                  </span>
                </div>
                <div className="grid gap-4">
                  <IntegritySignalCard
                    tone="gold"
                    step="A"
                    title={c.stepFetchTitle}
                    body={c.stepFetchBody}
                  />
                  <IntegritySignalCard
                    tone="violet"
                    step="B"
                    title={c.stepRevealTitle}
                    body={c.stepRevealBody}
                  />
                  <IntegritySignalCard
                    tone="orange"
                    step="C"
                    title={c.stepCompareTitle}
                    body={c.stepCompareBody}
                  />
                </div>
              </div>
            </div>

            {error ? (
              <GameStatusNotice tone="danger" surface="light">
                {error}
              </GameStatusNotice>
            ) : null}
          </CardContent>
        </GameSurfaceCard>

        <div className="space-y-6">
          <GameSurfaceCard tone="light">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl text-[var(--retro-ink)]">
                    {reveal ? c.resultTitle : c.resultPendingTitle}
                  </CardTitle>
                  <CardDescription className="mt-1 text-[rgba(15,17,31,0.62)]">
                    {reveal
                      ? `${c.epochLabel} ${reveal.epoch} · ${c.revealedAt} ${formatTimestamp(
                          reveal.revealedAt,
                          c.emptyValue,
                        )}`
                      : c.resultPendingBody}
                  </CardDescription>
                </div>
                {reveal ? (
                  <GamePill
                    tone={verification?.matches ? "success" : "danger"}
                    surface="light"
                  >
                    {verification?.matches ? c.verified : c.mismatch}
                  </GamePill>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {reveal ? (
                <>
                  <HashLedgerRow label={c.seed} value={reveal.seed} />
                  <HashLedgerRow
                    label={c.publishedCommit}
                    value={reveal.commitHash}
                    tone="violet"
                  />
                  <HashLedgerRow
                    label={c.computedCommit}
                    value={verification?.computedHash ?? "--"}
                    tone="orange"
                  />

                  <GameStatusNotice
                    tone={verification?.matches ? "success" : "danger"}
                    surface="light"
                    className="leading-7"
                  >
                    {verification?.matches ? c.verifiedBody : c.mismatchBody}
                  </GameStatusNotice>
                </>
              ) : (
                <div className="rounded-[1.5rem] border-2 border-dashed border-[rgba(15,17,31,0.14)] bg-[rgba(255,255,255,0.72)] px-5 py-8 text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                  {c.resultPendingBody}
                </div>
              )}
            </CardContent>
          </GameSurfaceCard>

          <GameSurfaceCard tone="light">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl text-[var(--retro-ink)]">
                {c.postureTitle}
              </CardTitle>
              <CardDescription className="text-[rgba(15,17,31,0.66)]">
                {c.postureBody}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <GameMetricTile
                tone="light"
                label={c.verifiedDays}
                value={audit?.consecutiveVerifiedDays ?? 0}
              />
              <GameMetricTile
                tone="light"
                label={c.verifiedEpochs}
                value={audit?.consecutiveVerifiedEpochs ?? 0}
              />
              <GameMetricTile
                tone="light"
                label={c.lastAutoAudit}
                value={auditStatus}
                valueClassName="mt-2 text-sm font-semibold text-[var(--retro-ink)]"
              />
              <GameMetricTile
                tone="light"
                label={c.latestAuditedEpoch}
                value={audit?.latestAuditedEpoch ?? "--"}
              />
            </CardContent>
          </GameSurfaceCard>
        </div>
      </div>
    </div>
  );
}
