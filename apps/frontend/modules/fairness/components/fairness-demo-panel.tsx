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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { browserUserApiClient } from "@/lib/api/user-client";

const copy = {
  en: {
    title: "Fairness verifier",
    description:
      "Standalone commit-reveal demo for the prize engine. Reveal a closed epoch and verify locally that SHA-256(seed) matches the published commit hash.",
    currentCommit: "Current commit",
    currentCommitBody:
      "The backend publishes this hash before the epoch resolves. Results in the same epoch must derive from the unrevealed seed behind this hash.",
    currentEpoch: "Current epoch",
    revealAfter: "Reveal after",
    verifiedDays: "Continuous auto-audit days",
    lastAutoAudit: "Last auto-audit",
    autoAuditHealthy: "Passing",
    autoAuditIssue: "Issue detected",
    noAuditYet: "No closed epoch has been auto-audited yet.",
    auditedThrough: (epoch: number, auditedAt: string) =>
      `Auto-reveal verified through epoch ${epoch} at ${auditedAt}.`,
    refresh: "Refresh commit",
    refreshing: "Refreshing...",
    revealCard: "Reveal closed epoch",
    revealCardBody:
      "Only epochs older than the current one can reveal. This mirrors the backend gate that prevents revealing the active seed early.",
    epochInput: "Epoch number",
    revealButton: "Reveal and verify",
    revealing: "Revealing...",
    noPreviousEpoch:
      "No previous epoch is available yet. Wait for the first epoch rollover.",
    resultTitle: "Verification result",
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
    explainTitle: "How to read this",
    explainSteps: [
      "1. Fetch the live commit for the current epoch.",
      "2. Reveal any older epoch once it is closed.",
      "3. Recompute SHA-256(seed) locally and compare it to the published commit hash.",
    ],
    loadFailed: "Failed to load the fairness commit.",
    revealFailed: "Failed to reveal the selected epoch.",
    invalidEpoch: "Enter a valid epoch number first.",
    epochLabel: "Epoch",
  },
  "zh-CN": {
    title: "公平性验证器",
    description:
      "把 commit-reveal 拆成独立 demo：先拿当前 commit，再 reveal 已结束的 epoch，并在前端本地验证 `SHA-256(seed)` 是否等于已公布的 commit 哈希。",
    currentCommit: "当前 Commit",
    currentCommitBody:
      "后端会在 epoch 开始时先公开这条哈希；同一 epoch 内的结果都必须来自这条哈希背后的未公开 seed。",
    currentEpoch: "当前 Epoch",
    revealAfter: "可 Reveal 时间",
    verifiedDays: "连续自动校验天数",
    lastAutoAudit: "最近自动校验",
    autoAuditHealthy: "校验通过",
    autoAuditIssue: "发现异常",
    noAuditYet: "当前还没有已结束 epoch 的自动校验记录。",
    auditedThrough: (epoch: number, auditedAt: string) =>
      `后台自动 reveal 已经校验到 epoch ${epoch}，最近一次时间是 ${auditedAt}。`,
    refresh: "刷新 Commit",
    refreshing: "刷新中...",
    revealCard: "Reveal 已结束 Epoch",
    revealCardBody:
      "只有早于当前 epoch 的数据才能 reveal，这和后端 gate 一致，避免当前 seed 被提前看到。",
    epochInput: "Epoch 编号",
    revealButton: "Reveal 并验证",
    revealing: "Reveal 中...",
    noPreviousEpoch:
      "当前还没有可用的上一轮 epoch，等下一次 epoch rollover 后再验证。",
    resultTitle: "验证结果",
    revealedAt: "Reveal 时间",
    seed: "Seed",
    publishedCommit: "已公布 Commit",
    computedCommit: "本地计算 SHA-256(seed)",
    verified: "验证通过",
    mismatch: "校验不通过",
    verifiedBody:
      "本地验证通过。reveal 出来的 seed 计算出的哈希，和 epoch 关闭前公开的 commit 完全一致。",
    mismatchBody:
      "本地验证失败。当前 reveal 出来的 seed 与已公布 commit 哈希不一致。",
    explainTitle: "怎么看这个页面",
    explainSteps: [
      "1. 先读取当前 epoch 的公开 commit。",
      "2. 对任何已结束的 epoch 发起 reveal。",
      "3. 在本地重新计算 `SHA-256(seed)`，并对比已公布 commit 哈希。",
    ],
    loadFailed: "加载公平性 Commit 失败。",
    revealFailed: "Reveal 指定 epoch 失败。",
    invalidEpoch: "请先输入合法的 epoch 编号。",
    epochLabel: "Epoch",
  },
} as const;

function formatTimestamp(value: string | Date | null) {
  if (!value) {
    return "Unknown";
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    return "Unknown";
  }

  return timestamp.toLocaleString();
}

function shortenHash(value: string) {
  return value.length > 22
    ? `${value.slice(0, 14)}...${value.slice(-8)}`
    : value;
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

  async function loadCommit() {
    setLoadingCommit(true);
    setError(null);

    const response = await browserUserApiClient.getFairnessCommit();
    if (!response.ok) {
      setError(response.error?.message ?? c.loadFailed);
      setLoadingCommit(false);
      return;
    }

    setCommit(response.data);
    setLoadingCommit(false);
  }

  async function handleReveal() {
    const epoch = Number(revealEpoch.trim());
    if (!Number.isFinite(epoch) || epoch < 0) {
      setError(c.invalidEpoch);
      return;
    }

    setRevealing(true);
    setError(null);

    const response = await browserUserApiClient.revealFairnessSeed(epoch);

    if (!response.ok) {
      setError(response.error?.message ?? c.revealFailed);
      setRevealing(false);
      return;
    }

    setReveal(response.data);
    setRevealing(false);
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

  const revealAt = formatTimestamp(getFairnessRevealDate(commit));
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
          formatTimestamp(audit.lastAuditedAt),
        );

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
      <Card className="border-slate-800 bg-slate-950/90 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
        <CardHeader className="space-y-3">
          <CardTitle className="text-xl">{c.title}</CardTitle>
          <CardDescription className="text-slate-400">
            {c.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-100">
                  {c.currentCommit}
                </p>
                <p className="text-sm text-slate-400">{c.currentCommitBody}</p>
              </div>
              <Button
                type="button"
                onClick={() => void loadCommit()}
                disabled={loadingCommit}
                className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                {loadingCommit ? c.refreshing : c.refresh}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {c.currentEpoch}
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {commit?.epoch ?? "--"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {c.revealAfter}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-100">
                  {revealAt}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Commit
                </p>
                <p className="mt-2 font-mono text-sm text-cyan-200">
                  {commit ? shortenHash(commit.commitHash) : "--"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {c.verifiedDays}
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {audit?.consecutiveVerifiedDays ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {c.lastAutoAudit}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-100">
                  {auditStatus}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-400">{auditDetail}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-sm font-medium text-slate-100">
              {c.explainTitle}
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {c.explainSteps.map((step) => (
                <p key={step}>{step}</p>
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-950/90 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">{c.revealCard}</CardTitle>
            <CardDescription className="text-slate-400">
              {c.revealCardBody}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-100"
                htmlFor="fairness-epoch"
              >
                {c.epochInput}
              </label>
              <Input
                id="fairness-epoch"
                value={revealEpoch}
                onChange={(event) => setRevealEpoch(event.target.value)}
                inputMode="numeric"
                className="border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>

            {commit?.epoch === 0 ? (
              <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {c.noPreviousEpoch}
              </p>
            ) : null}

            <Button
              type="button"
              onClick={() => void handleReveal()}
              disabled={revealing}
              className="w-full bg-amber-300 text-slate-950 hover:bg-amber-200"
            >
              {revealing ? c.revealing : c.revealButton}
            </Button>
          </CardContent>
        </Card>

        {reveal ? (
          <Card className="border-slate-800 bg-slate-950/90 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{c.resultTitle}</CardTitle>
                  <CardDescription className="mt-1 text-slate-400">
                    {c.epochLabel} {reveal.epoch} · {c.revealedAt}{" "}
                    {formatTimestamp(reveal.revealedAt)}
                  </CardDescription>
                </div>
                <div
                  className={`rounded-full border px-3 py-1 text-sm font-medium ${
                    verification?.matches
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                      : "border-rose-400/30 bg-rose-400/10 text-rose-100"
                  }`}
                >
                  {verification?.matches ? c.verified : c.mismatch}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {c.seed}
                  </p>
                  <p className="mt-2 break-all font-mono text-sm text-slate-100">
                    {reveal.seed}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {c.publishedCommit}
                  </p>
                  <p className="mt-2 break-all font-mono text-sm text-cyan-200">
                    {reveal.commitHash}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {c.computedCommit}
                  </p>
                  <p className="mt-2 break-all font-mono text-sm text-amber-200">
                    {verification?.computedHash ?? "--"}
                  </p>
                </div>
              </div>

              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  verification?.matches
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-rose-400/30 bg-rose-400/10 text-rose-100"
                }`}
              >
                {verification?.matches ? c.verifiedBody : c.mismatchBody}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
