import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type {
  FairnessCommit,
  FairnessReveal,
} from "@reward/shared-types/fairness";
import {
  getFairnessRevealDate,
  type FairnessVerificationResult,
} from "@reward/user-core";

import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette,
  mobileTypography,
} from "./theme";
import { ActionButton, Field, SectionCard } from "./ui";

export type MobileFairnessLocale = "en" | "zh-CN";

const fairnessCopy = {
  en: {
    verifierTitle: "Fairness verification",
    verifierDescription:
      "Inspect the live commit, understand the seed protocol, and reveal any closed epoch to verify it locally.",
    protocolTitle: "The Seed Protocol",
    protocolBody:
      "Every result starts with a published commit, then unlocks the real seed only after the epoch closes. That keeps randomness transparent and tamper-evident.",
    activeSeedsTitle: "Active seeds",
    activeSeedsBody:
      "Use the live commit before a round starts, then reveal a closed epoch afterwards and compare the computed hash locally.",
    auditMetricsTitle: "Audit metrics",
    auditMetricsBody:
      "Track the live epoch, reveal window, and how far the background auto-audit has already verified.",
    currentCommit: "Current commit",
    currentCommitBody:
      "The backend publishes this hash before the epoch resolves. Results in the same epoch must derive from the unrevealed seed behind this hash.",
    commitLive: "Commit live",
    currentEpoch: "Current epoch",
    revealAfter: "Reveal after",
    verifiedDays: "Continuous auto-audit days",
    lastAutoAudit: "Last auto-audit",
    auditStatus: "Audit status",
    autoAuditHealthy: "Passing",
    autoAuditIssue: "Issue detected",
    noAuditYet: "No closed epoch has been auto-audited yet.",
    auditedThrough: (epoch: number, auditedAt: string) =>
      `Auto-reveal verified through epoch ${epoch} at ${auditedAt}.`,
    revealStatus: "Reveal status",
    revealLocked: "Locked until the active epoch closes",
    revealReady: "Closed epochs can now be revealed",
    opensIn: "Opens in",
    refresh: "Refresh commit",
    refreshing: "Refreshing...",
    backHome: "Back to home",
    howToRead: "How verification works",
    steps: [
      "1. Fetch the live commit for the current epoch.",
      "2. Reveal any older epoch once it is closed.",
      "3. Recompute SHA-256(seed) locally and compare it to the published hash.",
    ],
    revealCardTitle: "Reveal closed epoch",
    revealCardBody:
      "The backend blocks active epochs, so this page proves fairness only after the epoch has ended.",
    epochInput: "Epoch number",
    revealButton: "Reveal and verify",
    revealing: "Revealing...",
    noPreviousEpoch:
      "No previous epoch is available yet. Wait for the first epoch rollover.",
    resultTitle: "Verification result",
    resultBody:
      "Compare the published commit against the revealed seed and your locally computed SHA-256 result.",
    resultKicker: "Verification receipt",
    resultVerificationLabel: "Verification",
    resultHashBundleTitle: "Hash bundle",
    resultHashBundleBody:
      "Review the revealed seed, the published commit, and the locally computed SHA-256 output side by side.",
    resultHashMatchSuccess: "Published and computed commits match exactly.",
    resultHashMatchFailure: "Published and computed commits do not match.",
    revealedAt: "Revealed at",
    seed: "Seed",
    publishedCommit: "Published commit",
    computedCommit: "Computed SHA-256(seed)",
    verified: "Verified",
    mismatch: "Mismatch",
    verifiedBody:
      "Local verification passed. The revealed seed hashes to the same commit published before the epoch closed.",
    mismatchBody:
      "Local verification failed. The revealed seed does not match the published commit hash.",
    unknown: "Unknown",
    fairnessTitle: "Fairness",
    fairnessSubtitle:
      "Public commit now, reveal only after the current epoch closes.",
    clientNonce: "Client nonce",
    loadFailed: "Failed to load the fairness commit.",
    invalidEpoch: "Enter a valid fairness epoch first.",
    revealFailed: "Failed to reveal the selected fairness epoch.",
    revealedSuccess: (epoch: number) =>
      `Revealed fairness epoch ${epoch}. Local SHA-256 verification is ready.`,
  },
  "zh-CN": {
    verifierTitle: "公平性验证",
    verifierDescription:
      "查看实时 commit、理解 seed protocol，并对任意已结束 epoch 做本地校验。",
    protocolTitle: "Seed Protocol",
    protocolBody:
      "每一轮结果都会先公开 commit，等 epoch 结束后再公开真实 seed，这样随机性既透明又不可篡改。",
    activeSeedsTitle: "当前种子",
    activeSeedsBody:
      "先记录开局前的实时 commit，等已结束 epoch reveal 后，再在本地重算哈希做比对。",
    auditMetricsTitle: "校验指标",
    auditMetricsBody:
      "这里集中显示当前 epoch、可 reveal 时间，以及后台自动审计已经校验到哪里。",
    currentCommit: "当前 Commit",
    currentCommitBody:
      "后端会在 epoch 结算前先公开这条哈希；同一 epoch 内的结果都必须来自这条哈希背后的未公开 seed。",
    commitLive: "当前 Commit",
    currentEpoch: "当前 Epoch",
    revealAfter: "可 Reveal 时间",
    verifiedDays: "连续自动校验天数",
    lastAutoAudit: "最近自动校验",
    auditStatus: "审计状态",
    autoAuditHealthy: "校验通过",
    autoAuditIssue: "发现异常",
    noAuditYet: "当前还没有已结束 epoch 的自动校验记录。",
    auditedThrough: (epoch: number, auditedAt: string) =>
      `后台自动 reveal 已经校验到 epoch ${epoch}，最近一次时间是 ${auditedAt}。`,
    revealStatus: "Reveal 状态",
    revealLocked: "当前活跃 Epoch 结束前不可 Reveal",
    revealReady: "已结束的 Epoch 现在可以 Reveal",
    opensIn: "倒计时",
    refresh: "刷新 Commit",
    refreshing: "刷新中...",
    backHome: "返回首页",
    howToRead: "验证流程",
    steps: [
      "1. 先读取当前 epoch 已公开的 commit。",
      "2. 对任意已结束的 epoch 发起 reveal。",
      "3. 在本地重新计算 `SHA-256(seed)`，再与已公布 hash 对比。",
    ],
    revealCardTitle: "Reveal 已结束 Epoch",
    revealCardBody:
      "后端会阻止当前活跃 epoch 被提前 reveal，所以这个页面只能在 epoch 结束后证明公平性。",
    epochInput: "Epoch 编号",
    revealButton: "Reveal 并验证",
    revealing: "Reveal 中...",
    noPreviousEpoch:
      "当前还没有上一轮可验证的 epoch，等第一次 rollover 后再试。",
    resultTitle: "验证结果",
    resultBody: "对照已公布 commit、reveal 出来的 seed，以及本地重新计算的 SHA-256 结果。",
    resultKicker: "校验回执",
    resultVerificationLabel: "校验结论",
    resultHashBundleTitle: "哈希对照",
    resultHashBundleBody:
      "把 reveal 出来的 seed、已公布 commit，以及本地计算的 SHA-256 结果放在一起逐项比对。",
    resultHashMatchSuccess: "已公布 commit 与本地计算结果完全一致。",
    resultHashMatchFailure: "已公布 commit 与本地计算结果不一致。",
    revealedAt: "Reveal 时间",
    seed: "Seed",
    publishedCommit: "已公布 Commit",
    computedCommit: "本地计算 SHA-256(seed)",
    verified: "验证通过",
    mismatch: "校验不通过",
    verifiedBody:
      "本地验证通过。reveal 出来的 seed 计算后的哈希，与 epoch 结束前公布的 commit 完全一致。",
    mismatchBody:
      "本地验证失败。当前 reveal 出来的 seed 与已公布的 commit 哈希不一致。",
    unknown: "未知",
    fairnessTitle: "公平性",
    fairnessSubtitle:
      "当前只公开 commit，必须等到本轮 epoch 结束后才能 reveal。",
    clientNonce: "客户端随机串",
    loadFailed: "加载公平性 Commit 失败。",
    invalidEpoch: "请先输入合法的公平性 Epoch。",
    revealFailed: "Reveal 指定公平性 Epoch 失败。",
    revealedSuccess: (epoch: number) =>
      `公平性 Epoch ${epoch} 已 reveal，本地 SHA-256 校验已经就绪。`,
  },
} as const;

export function resolveMobileFairnessLocale(): MobileFairnessLocale {
  const fallback = "en";

  try {
    const locale =
      Intl.DateTimeFormat().resolvedOptions().locale ||
      (typeof navigator !== "undefined" ? navigator.language : fallback);
    return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  } catch {
    return "en";
  }
}

export function getMobileFairnessCopy(locale: MobileFairnessLocale) {
  return fairnessCopy[locale];
}

function formatLocaleTimestamp(
  value: string | Date | null | undefined,
  locale: MobileFairnessLocale,
) {
  if (!value) {
    return fairnessCopy[locale].unknown;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    return fairnessCopy[locale].unknown;
  }

  return timestamp.toLocaleString(locale);
}

function truncateHash(value: string) {
  return value.length > 20
    ? `${value.slice(0, 12)}...${value.slice(-8)}`
    : value;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

type MobileFairnessCompactSummaryProps = {
  locale: MobileFairnessLocale;
  fairness: FairnessCommit | null | undefined;
  clientNonce?: string | null;
  eyebrow?: string;
  body?: string;
};

export function MobileFairnessCompactSummary(
  props: MobileFairnessCompactSummaryProps,
) {
  const c = fairnessCopy[props.locale];
  const [nowMs, setNowMs] = useState(() => Date.now());
  const revealAt = getFairnessRevealDate(props.fairness);
  const revealAfter = formatLocaleTimestamp(revealAt, props.locale);
  const remainingMs = revealAt ? Math.max(revealAt.getTime() - nowMs, 0) : null;
  const revealReady = remainingMs !== null ? remainingMs === 0 : false;
  const audit = props.fairness?.audit;
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
          formatLocaleTimestamp(audit.lastAuditedAt, props.locale),
        );

  useEffect(() => {
    if (!revealAt) {
      return;
    }

    if (revealAt.getTime() <= Date.now()) {
      setNowMs(Date.now());
      return;
    }

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [revealAt?.getTime()]);

  return (
    <View style={styles.summaryShell}>
      <View style={styles.summaryCommitCard}>
        <Text style={styles.summaryEyebrow}>
          {props.eyebrow ?? c.currentCommit}
        </Text>
        <Text style={styles.summaryCommit}>
          {props.fairness ? truncateHash(props.fairness.commitHash) : "--"}
        </Text>
        <Text style={styles.summaryBody}>
          {props.body ?? c.currentCommitBody}
        </Text>
      </View>

      {props.clientNonce ? (
        <View style={styles.hashRow}>
          <Text style={styles.hashLabel}>{c.clientNonce}</Text>
          <Text style={styles.hashValue}>{truncateHash(props.clientNonce)}</Text>
        </View>
      ) : null}

      <View style={styles.metricGrid}>
        <View style={[styles.metricCard, styles.metricCardPaper]}>
          <Text style={styles.metricLabel}>{c.currentEpoch}</Text>
          <Text style={styles.metricValue}>{props.fairness?.epoch ?? "--"}</Text>
        </View>
        <View style={[styles.metricCard, styles.metricCardBlue]}>
          <Text style={styles.metricLabel}>{c.revealAfter}</Text>
          <Text style={styles.metricValue}>{revealAfter}</Text>
        </View>
        <View style={[styles.metricCard, styles.metricCardGold]}>
          <Text style={styles.metricLabel}>{c.verifiedDays}</Text>
          <Text style={styles.metricValue}>
            {audit?.consecutiveVerifiedDays ?? 0}
          </Text>
        </View>
        <View style={[styles.metricCard, styles.metricCardPeach]}>
          <Text style={styles.metricLabel}>{c.auditStatus}</Text>
          <Text style={styles.metricValue}>{auditStatus}</Text>
        </View>
      </View>

      <View
        style={[
          styles.revealWindowCard,
          revealReady
            ? styles.revealWindowCardReady
            : styles.revealWindowCardWaiting,
        ]}
      >
        <View style={styles.revealStatusHeader}>
          <Text style={styles.hashLabel}>{c.revealStatus}</Text>
          <Text
            style={[
              styles.revealStatusValue,
              revealReady
                ? styles.revealStatusValueReady
                : styles.revealStatusValueWaiting,
            ]}
          >
            {revealReady ? c.revealReady : c.revealLocked}
          </Text>
        </View>
        <Text style={styles.revealStatusBody}>
          {remainingMs !== null && remainingMs > 0
            ? `${c.opensIn} ${formatCountdown(remainingMs)}`
            : revealAfter}
        </Text>
        <Text style={styles.revealStatusMeta}>
          {c.lastAutoAudit}: {auditStatus}
        </Text>
        <Text style={styles.revealStatusMeta}>{auditDetail}</Text>
      </View>
    </View>
  );
}

type MobileFairnessVerifierProps = {
  locale: MobileFairnessLocale;
  commit: FairnessCommit | null;
  reveal: FairnessReveal | null;
  verification: FairnessVerificationResult | null;
  revealEpoch: string;
  onChangeRevealEpoch: (value: string) => void;
  onBack: () => void;
  onRefresh: () => void;
  onReveal: () => void;
  loadingCommit: boolean;
  revealing: boolean;
  navigationLocked: boolean;
};

export function MobileFairnessVerifier(props: MobileFairnessVerifierProps) {
  const c = fairnessCopy[props.locale];
  const [nowMs, setNowMs] = useState(() => Date.now());
  const verificationPassed = props.verification?.matches === true;
  const revealAt = getFairnessRevealDate(props.commit);
  const targetEpoch =
    props.commit && props.commit.epoch > 0 ? props.commit.epoch - 1 : null;
  const remainingMs = revealAt ? Math.max(revealAt.getTime() - nowMs, 0) : null;
  const revealReady =
    targetEpoch !== null && remainingMs !== null ? remainingMs === 0 : false;
  const revealTimingLabel =
    remainingMs !== null && remainingMs > 0
      ? `${c.opensIn} ${formatCountdown(remainingMs)}`
      : formatLocaleTimestamp(revealAt, props.locale);

  useEffect(() => {
    if (!revealAt) {
      return;
    }

    if (revealAt.getTime() <= Date.now()) {
      setNowMs(Date.now());
      return;
    }

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [revealAt?.getTime()]);

  return (
    <>
      <SectionCard title={c.verifierTitle}>
        <View style={styles.actionRow}>
          <ActionButton
            label={c.backHome}
            onPress={props.onBack}
            disabled={props.navigationLocked}
            variant="secondary"
            compact
          />
          <ActionButton
            label={props.loadingCommit ? c.refreshing : c.refresh}
            onPress={props.onRefresh}
            disabled={props.loadingCommit || props.revealing}
            variant="secondary"
            compact
          />
        </View>

        <View style={styles.protocolCard}>
          <View style={styles.protocolHero}>
            <Text style={styles.protocolTitle}>{c.protocolTitle}</Text>
            <Text style={styles.protocolBody}>{c.verifierDescription}</Text>
          </View>
          <View style={styles.protocolStepStack}>
            {c.steps.map((step) => (
              <View key={step} style={styles.protocolStepCard}>
                <Text style={styles.protocolStepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <MobileFairnessCompactSummary
          locale={props.locale}
          fairness={props.commit}
          eyebrow={c.currentCommit}
          body={c.activeSeedsBody}
        />
      </SectionCard>

      <SectionCard title={c.revealCardTitle}>
        <View
          style={[
            styles.revealHeroCard,
            revealReady
              ? styles.revealHeroCardReady
              : styles.revealHeroCardWaiting,
          ]}
        >
          <View style={styles.revealHeroHeader}>
            <View style={styles.revealHeroBadge}>
              <Text style={styles.revealHeroBadgeText}>
                {revealReady ? "OK" : "..."}
              </Text>
            </View>
            <View style={styles.revealHeroCopy}>
              <Text style={styles.revealHeroTitle}>
                {revealReady ? c.revealReady : c.revealLocked}
              </Text>
              <Text style={styles.revealHeroBody}>{c.revealCardBody}</Text>
            </View>
          </View>

          <View style={styles.revealHeroMetricRow}>
            <View style={styles.revealHeroMetricCard}>
              <Text style={styles.revealHeroMetricLabel}>{c.currentEpoch}</Text>
              <Text style={styles.revealHeroMetricValue}>
                {targetEpoch ?? "--"}
              </Text>
            </View>
            <View style={styles.revealHeroMetricCard}>
              <Text style={styles.revealHeroMetricLabel}>{c.revealAfter}</Text>
              <Text style={styles.revealHeroMetricValue}>
                {revealTimingLabel}
              </Text>
            </View>
          </View>
        </View>

        <Field
          label={c.epochInput}
          value={props.revealEpoch}
          onChangeText={props.onChangeRevealEpoch}
          keyboardType="numeric"
          placeholder={
            props.commit && props.commit.epoch > 0
              ? String(props.commit.epoch - 1)
              : "0"
          }
        />

        {props.commit?.epoch === 0 ? (
          <View style={[styles.inlineNotice, styles.inlineNoticeWarning]}>
            <Text style={styles.inlineNoticeText}>{c.noPreviousEpoch}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <ActionButton
            label={props.revealing ? c.revealing : c.revealButton}
            onPress={props.onReveal}
            disabled={
              props.revealing ||
              props.loadingCommit ||
              props.commit?.epoch === 0
            }
            fullWidth
          />
        </View>

        {!props.reveal ? (
          <View
            style={[
              styles.resultPlaceholderCard,
              revealReady
                ? styles.resultPlaceholderCardReady
                : styles.resultPlaceholderCardWaiting,
            ]}
          >
            <Text style={styles.resultPlaceholderTitle}>{c.resultTitle}</Text>
            <Text style={styles.resultPlaceholderBody}>
              {revealReady ? c.resultBody : c.revealCardBody}
            </Text>
          </View>
        ) : null}
      </SectionCard>

      {props.reveal ? (
        <SectionCard
          title={c.resultTitle}
          subtitle={`${c.currentEpoch} ${props.reveal.epoch} · ${c.revealedAt} ${formatLocaleTimestamp(
            props.reveal.revealedAt,
            props.locale,
          )}`}
        >
          <View style={styles.resultShell}>
            <View
              style={[
                styles.resultBanner,
                verificationPassed
                  ? styles.resultBannerSuccess
                  : styles.resultBannerDanger,
              ]}
            >
              <View
                style={[
                  styles.resultStamp,
                  verificationPassed
                    ? styles.resultStampSuccess
                    : styles.resultStampDanger,
                ]}
              >
                <Text style={styles.resultStampText}>
                  {verificationPassed ? "OK" : "ERR"}
                </Text>
              </View>
              <View style={styles.resultBannerCopy}>
                <Text style={styles.resultKicker}>{c.resultKicker}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    verificationPassed
                      ? styles.statusBadgeSuccess
                      : styles.statusBadgeDanger,
                  ]}
                >
                  <Text style={styles.statusBadgeLabel}>
                    {verificationPassed ? c.verified : c.mismatch}
                  </Text>
                </View>
                <Text style={styles.resultHeadline}>
                  {verificationPassed ? c.verified : c.mismatch}
                </Text>
                <Text style={styles.resultLead}>
                  {verificationPassed ? c.verifiedBody : c.mismatchBody}
                </Text>
              </View>
            </View>

            <View style={styles.resultMetricGrid}>
              <View
                style={[styles.resultMetricCard, styles.resultMetricCardPaper]}
              >
                <Text style={styles.resultMetricLabel}>{c.currentEpoch}</Text>
                <Text style={styles.resultMetricValue}>{props.reveal.epoch}</Text>
              </View>
              <View
                style={[styles.resultMetricCard, styles.resultMetricCardBlue]}
              >
                <Text style={styles.resultMetricLabel}>{c.revealedAt}</Text>
                <Text style={styles.resultMetricValue}>
                  {formatLocaleTimestamp(props.reveal.revealedAt, props.locale)}
                </Text>
              </View>
              <View
                style={[
                  styles.resultMetricCard,
                  verificationPassed
                    ? styles.resultMetricCardSuccess
                    : styles.resultMetricCardDanger,
                ]}
              >
                <Text style={styles.resultMetricLabel}>
                  {c.resultVerificationLabel}
                </Text>
                <Text style={styles.resultMetricValue}>
                  {verificationPassed ? c.verified : c.mismatch}
                </Text>
                <Text style={styles.resultMetricCaption}>
                  {verificationPassed
                    ? c.resultHashMatchSuccess
                    : c.resultHashMatchFailure}
                </Text>
              </View>
            </View>

            <View style={styles.resultStack}>
              <View style={styles.hashCard}>
                <Text style={styles.hashLabel}>{c.seed}</Text>
                <Text style={styles.hashValueFull}>{props.reveal.seed}</Text>
              </View>
              <View style={[styles.hashCard, styles.hashCardBlue]}>
                <Text style={styles.hashLabel}>{c.publishedCommit}</Text>
                <Text style={styles.hashValueFull}>{props.reveal.commitHash}</Text>
              </View>
              <View style={[styles.hashCard, styles.hashCardGold]}>
                <Text style={styles.hashLabel}>{c.computedCommit}</Text>
                <Text style={styles.hashValueFull}>
                  {props.verification?.computedHash ?? c.unknown}
                </Text>
              </View>
            </View>
          </View>
        </SectionCard>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  hashCard: {
    gap: 8,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  hashCardBlue: {
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  hashCardGold: {
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  hashLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  hashRow: {
    gap: 6,
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  hashValue: {
    color: mobileFeedbackTheme.info.accentColor,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: mobileTypography.mono,
  },
  hashValueFull: {
    color: mobilePalette.text,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: mobileTypography.mono,
  },
  inlineNotice: {
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inlineNoticeText: {
    color: mobilePalette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  inlineNoticeWarning: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  metricCard: {
    width: "48%",
    gap: 8,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  metricCardBlue: {
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  metricCardGold: {
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  metricCardPaper: {
    backgroundColor: mobilePalette.panel,
  },
  metricCardPeach: {
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  metricValue: {
    color: mobilePalette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  protocolBody: {
    color: mobilePalette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  protocolCard: {
    overflow: "hidden",
    gap: 0,
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    ...mobileChromeTheme.cardShadow,
  },
  protocolHero: {
    gap: 8,
    backgroundColor: "#35270e",
    padding: 16,
  },
  protocolStepCard: {
    borderRadius: 14,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 10,
    ...mobileChromeTheme.cardShadowSm,
  },
  protocolStepStack: {
    gap: 8,
    padding: 12,
  },
  protocolStepText: {
    color: mobilePalette.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  protocolTitle: {
    color: mobilePalette.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    padding: 16,
    ...mobileChromeTheme.cardShadow,
  },
  resultBannerDanger: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  resultBannerSuccess: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  resultBannerCopy: {
    flex: 1,
    gap: 6,
  },
  resultHeadline: {
    color: mobilePalette.text,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
  },
  resultKicker: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  resultLead: {
    color: mobilePalette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  resultMetricCaption: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  resultMetricCard: {
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  resultMetricCardBlue: {
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  resultMetricCardDanger: {
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  resultMetricCardPaper: {
    backgroundColor: mobilePalette.panel,
  },
  resultMetricCardSuccess: {
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  resultMetricGrid: {
    gap: 12,
  },
  resultMetricLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  resultMetricValue: {
    color: mobilePalette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  resultPlaceholderBody: {
    color: mobilePalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  resultPlaceholderCard: {
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  resultPlaceholderCardReady: {
    borderColor: mobileFeedbackTheme.info.borderColor,
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
  },
  resultPlaceholderCardWaiting: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  resultPlaceholderTitle: {
    color: mobilePalette.text,
    fontSize: 15,
    fontWeight: "800",
  },
  resultShell: {
    gap: 14,
  },
  resultStamp: {
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 39,
    borderWidth: 6,
    backgroundColor: mobilePalette.panel,
  },
  resultStampDanger: {
    borderColor: mobileFeedbackTheme.danger.accentColor,
  },
  resultStampSuccess: {
    borderColor: mobileFeedbackTheme.success.accentColor,
  },
  resultStampText: {
    color: mobilePalette.text,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  resultStack: {
    gap: 12,
  },
  revealStatusBody: {
    color: mobilePalette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  revealStatusHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  revealStatusMeta: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  revealStatusValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  revealStatusValueReady: {
    color: mobilePalette.success,
  },
  revealStatusValueWaiting: {
    color: mobilePalette.warning,
  },
  revealHeroBadge: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
    borderWidth: 4,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    ...mobileChromeTheme.cardShadowSm,
  },
  revealHeroBadgeText: {
    color: mobilePalette.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  revealHeroBody: {
    color: mobilePalette.text,
    fontSize: 14,
    lineHeight: 20,
  },
  revealHeroCard: {
    gap: 12,
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  revealHeroCardReady: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  revealHeroCardWaiting: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  revealHeroCopy: {
    flex: 1,
    gap: 6,
  },
  revealHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  revealHeroMetricCard: {
    flex: 1,
    gap: 4,
    borderRadius: 16,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 12,
    ...mobileChromeTheme.cardShadowSm,
  },
  revealHeroMetricLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  revealHeroMetricRow: {
    flexDirection: "row",
    gap: 10,
  },
  revealHeroMetricValue: {
    color: mobilePalette.text,
    fontSize: 15,
    fontWeight: "800",
  },
  revealHeroTitle: {
    color: mobilePalette.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
  },
  revealWindowCard: {
    gap: 8,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  revealWindowCardReady: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  revealWindowCardWaiting: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...mobileChromeTheme.cardShadowSm,
  },
  statusBadgeDanger: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  statusBadgeLabel: {
    color: mobilePalette.text,
    fontSize: 13,
    fontWeight: "800",
  },
  statusBadgeSuccess: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  summaryBody: {
    color: mobilePalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryCommit: {
    color: mobilePalette.text,
    fontSize: 18,
    fontWeight: "800",
    fontFamily: mobileTypography.mono,
  },
  summaryCommitCard: {
    gap: 10,
    borderRadius: 20,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: 14,
    ...mobileChromeTheme.cardShadow,
  },
  summaryEyebrow: {
    color: mobileFeedbackTheme.info.accentColor,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  summaryShell: {
    gap: 12,
  },
});
