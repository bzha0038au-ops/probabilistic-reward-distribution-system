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
  mobileFeedbackTheme,
  mobileGameTheme,
  mobilePalette,
  mobileTypography,
} from "./theme";
import { ActionButton, Field, SectionCard } from "./ui";

export type MobileFairnessLocale = "en" | "zh-CN";

const fairnessCopy = {
  en: {
    verifierTitle: "Fairness verifier",
    verifierDescription:
      "Standalone commit-reveal demo for the prize engine, split away from the gameplay routes.",
    currentCommit: "Current commit",
    currentCommitBody:
      "The backend publishes this hash before the epoch resolves. Results in the same epoch must derive from the unrevealed seed behind this hash.",
    commitLive: "Commit live",
    currentEpoch: "Current epoch",
    revealAfter: "Reveal after",
    revealStatus: "Reveal status",
    revealLocked: "Locked until the active epoch closes",
    revealReady: "Closed epochs can now be revealed",
    opensIn: "Opens in",
    refresh: "Refresh commit",
    refreshing: "Refreshing...",
    backHome: "Back to home",
    howToRead: "How to read this",
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
    verifierTitle: "公平性验证器",
    verifierDescription:
      "把奖池引擎的 commit-reveal 独立做成演示页，不再和具体玩法页面混在一起。",
    currentCommit: "当前 Commit",
    currentCommitBody:
      "后端会在 epoch 结算前先公开这条哈希；同一 epoch 内的结果都必须来自这条哈希背后的未公开 seed。",
    commitLive: "当前 Commit",
    currentEpoch: "当前 Epoch",
    revealAfter: "可 Reveal 时间",
    revealStatus: "Reveal 状态",
    revealLocked: "当前活跃 Epoch 结束前不可 Reveal",
    revealReady: "已结束的 Epoch 现在可以 Reveal",
    opensIn: "倒计时",
    refresh: "刷新 Commit",
    refreshing: "刷新中...",
    backHome: "返回首页",
    howToRead: "怎么读这个页面",
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
  fairness:
    | Pick<FairnessCommit, "commitHash" | "epoch" | "epochSeconds">
    | null
    | undefined;
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
      <View style={styles.summaryHero}>
        <Text style={styles.summaryEyebrow}>
          {props.eyebrow ?? c.currentCommit}
        </Text>
        <Text style={styles.summaryCommit}>
          {props.fairness ? truncateHash(props.fairness.commitHash) : "--"}
        </Text>
        {props.body ? (
          <Text style={styles.summaryBody}>{props.body}</Text>
        ) : null}
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{c.currentEpoch}</Text>
          <Text style={styles.metricValue}>
            {props.fairness?.epoch ?? "--"}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{c.revealAfter}</Text>
          <Text style={styles.metricValue}>{revealAfter}</Text>
        </View>
      </View>

      {props.clientNonce ? (
        <View style={styles.hashRow}>
          <Text style={styles.hashLabel}>{c.clientNonce}</Text>
          <Text style={styles.hashValue}>
            {truncateHash(props.clientNonce)}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.revealStatusCard,
          revealReady
            ? styles.revealStatusCardReady
            : styles.revealStatusCardWaiting,
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

  return (
    <>
      <SectionCard title={c.verifierTitle} subtitle={c.verifierDescription}>
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

        <MobileFairnessCompactSummary
          locale={props.locale}
          fairness={props.commit}
          eyebrow={c.currentCommit}
          body={c.currentCommitBody}
        />

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>{c.howToRead}</Text>
          {c.steps.map((step) => (
            <Text key={step} style={styles.stepText}>
              {step}
            </Text>
          ))}
        </View>
      </SectionCard>

      <SectionCard title={c.revealCardTitle} subtitle={c.revealCardBody}>
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
          <View style={styles.warningPanel}>
            <Text style={styles.warningText}>{c.noPreviousEpoch}</Text>
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
            compact
          />
        </View>
      </SectionCard>

      {props.reveal ? (
        <SectionCard
          title={c.resultTitle}
          subtitle={`${c.currentEpoch} ${props.reveal.epoch} · ${c.revealedAt} ${formatLocaleTimestamp(
            props.reveal.revealedAt,
            props.locale,
          )}`}
        >
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.statusBadge,
                props.verification?.matches
                  ? styles.statusBadgeSuccess
                  : styles.statusBadgeDanger,
              ]}
            >
              <Text style={styles.statusBadgeLabel}>
                {props.verification?.matches ? c.verified : c.mismatch}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statusPanel,
              props.verification?.matches
                ? styles.statusPanelSuccess
                : styles.statusPanelDanger,
            ]}
          >
            <Text
              style={[
                styles.statusPanelText,
                props.verification?.matches
                  ? styles.statusPanelTextSuccess
                  : styles.statusPanelTextDanger,
              ]}
            >
              {props.verification?.matches ? c.verifiedBody : c.mismatchBody}
            </Text>
          </View>

          <View style={styles.resultStack}>
            <View style={styles.hashCard}>
              <Text style={styles.hashLabel}>{c.seed}</Text>
              <Text style={styles.hashValueFull}>{props.reveal.seed}</Text>
            </View>
            <View style={styles.hashCard}>
              <Text style={styles.hashLabel}>{c.publishedCommit}</Text>
              <Text style={styles.hashValueFull}>
                {props.reveal.commitHash}
              </Text>
            </View>
            <View style={styles.hashCard}>
              <Text style={styles.hashLabel}>{c.computedCommit}</Text>
              <Text style={styles.hashValueFull}>
                {props.verification?.computedHash ?? c.unknown}
              </Text>
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
  summaryShell: {
    gap: 12,
  },
  summaryHero: {
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileGameTheme.fairness.hero.borderColor,
    backgroundColor: mobileGameTheme.fairness.hero.backgroundColor,
    padding: 16,
  },
  summaryEyebrow: {
    color: mobileGameTheme.fairness.hero.accentColor,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  summaryCommit: {
    color: mobilePalette.text,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: mobileTypography.mono,
  },
  summaryBody: {
    color: mobilePalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 140,
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
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
    fontSize: 15,
    fontWeight: "700",
  },
  revealStatusCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  revealStatusCardReady: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  revealStatusCardWaiting: {
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
  },
  revealStatusHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
  revealStatusBody: {
    color: mobilePalette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  stepsCard: {
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileGameTheme.fairness.stepsPanel.borderColor,
    backgroundColor: mobileGameTheme.fairness.stepsPanel.backgroundColor,
    padding: 16,
  },
  stepsTitle: {
    color: mobilePalette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  stepText: {
    color: mobilePalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  warningPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileFeedbackTheme.warningSoft.borderColor,
    backgroundColor: mobileFeedbackTheme.warningSoft.backgroundColor,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningText: {
    color: mobilePalette.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeSuccess: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  statusBadgeDanger: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  statusBadgeLabel: {
    color: mobilePalette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  statusPanel: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusPanelSuccess: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  statusPanelDanger: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  statusPanelText: {
    fontSize: 14,
    lineHeight: 20,
  },
  statusPanelTextSuccess: {
    color: mobilePalette.success,
  },
  statusPanelTextDanger: {
    color: mobilePalette.danger,
  },
  resultStack: {
    gap: 12,
  },
  hashCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  hashRow: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  hashLabel: {
    color: mobilePalette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  hashValue: {
    color: mobileGameTheme.fairness.hashAccent,
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
});
