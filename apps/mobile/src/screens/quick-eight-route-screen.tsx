import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { QUICK_EIGHT_CONFIG } from "@reward/shared-types/quick-eight";
import type { QuickEightRound } from "@reward/shared-types/quick-eight";

import {
  MobileFairnessCompactSummary,
  type MobileFairnessLocale,
} from "../fairness";
import {
  GameInfoPanel,
  GameNumberChip,
  GameStatCard,
} from "../game-domain-ui";
import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette as palette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";
import { ActionButton, SectionCard } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import type { MobileAppRoute, MobileStyles } from "./types";

const quickEightBoardNumbers = Array.from(
  { length: QUICK_EIGHT_CONFIG.boardSize },
  (_, index) => index + 1,
);
const quickEightTicketSlots = Array.from(
  { length: QUICK_EIGHT_CONFIG.pickCount },
  (_, index) => index,
);

type QuickEightRouteScreenProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  verificationCallout: ReactNode;
  screenCopy: MobileRouteScreens["quickEight"];
  balance: string;
  formatAmount: (value: string) => string;
  emailVerified: boolean;
  playingQuickEight: boolean;
  playingDrawCount: number | null;
  quickEightSelection: number[];
  quickEightStakeAmount: string;
  quickEightResult: QuickEightRound | null;
  visibleQuickEightDrawnNumbers: number[];
  quickEightMatchedSet: Set<number>;
  fairnessLocale: MobileFairnessLocale;
  fairnessEyebrow: string;
  quickEightStatusLabels: Record<QuickEightRound["status"], string>;
  onToggleNumber: (value: number) => void;
  onClearSelection: () => void;
  onChangeStakeAmount: (value: string) => void;
  onPlayQuickEight: () => void;
};

export function QuickEightRouteScreen(props: QuickEightRouteScreenProps) {
  const selectionCount = props.quickEightSelection.length;
  const allNumbersSelected = selectionCount === QUICK_EIGHT_CONFIG.pickCount;
  const selectionProgress = selectionCount / QUICK_EIGHT_CONFIG.pickCount;
  const latestStatus = props.quickEightResult
    ? props.quickEightStatusLabels[props.quickEightResult.status]
    : allNumbersSelected
      ? props.screenCopy.selectionLocked
      : props.screenCopy.selectionLeft(
          QUICK_EIGHT_CONFIG.pickCount - selectionCount,
        );
  const formattedStakePreview = (() => {
    const numericStake = Number(props.quickEightStakeAmount);
    if (!Number.isFinite(numericStake) || props.quickEightStakeAmount.trim() === "") {
      return props.quickEightStakeAmount || QUICK_EIGHT_CONFIG.minStake;
    }

    return props.formatAmount(numericStake.toFixed(2));
  })();
  const latestMultiplier = props.quickEightResult
    ? `${props.quickEightResult.multiplier}x`
    : "—";
  const latestHitCount = props.quickEightResult
    ? String(props.quickEightResult.hitCount)
    : "—";
  const maxWinMultiplier = `${QUICK_EIGHT_CONFIG.payoutTable.at(-1)?.multiplier ?? "0.00"}x`;
  const howToPlaySteps = [
    {
      title: props.screenCopy.howToPlayStepOneTitle,
      body: props.screenCopy.howToPlayStepOneBody,
      tone: "indigo" as const,
    },
    {
      title: props.screenCopy.howToPlayStepTwoTitle,
      body: props.screenCopy.howToPlayStepTwoBody,
      tone: "peach" as const,
    },
    {
      title: props.screenCopy.howToPlayStepThreeTitle,
      body: props.screenCopy.howToPlayStepThreeBody,
      tone: "gold" as const,
    },
  ];

  return (
    <>
      <SectionCard title={props.screenCopy.routeTitle}>
        <RouteSwitcher
          styles={props.styles}
          currentRoute={props.currentRoute}
          labels={props.routeLabels}
          navigationLocked={props.routeNavigationLocked}
          onOpenRoute={props.onOpenRoute}
        />
        <View style={styles.overviewCard}>
          <View style={styles.overviewArtBand} />
          <View style={styles.overviewBadge}>
            <Text style={styles.overviewBadgeText}>8/80</Text>
          </View>
          <View style={styles.overviewTopRow}>
            <Text style={styles.overviewEyebrow}>{props.screenCopy.routeTitle}</Text>
            <View style={styles.overviewPill}>
              <Text style={styles.overviewPillText}>{latestStatus}</Text>
            </View>
          </View>
          <Text style={styles.overviewTitle}>{props.screenCopy.sectionTitle}</Text>
          <Text style={styles.overviewBody}>
            {props.screenCopy.routeHint(
              QUICK_EIGHT_CONFIG.pickCount,
              QUICK_EIGHT_CONFIG.boardSize,
              QUICK_EIGHT_CONFIG.drawCount,
            )}
          </Text>
          <View style={styles.overviewSummaryRow}>
            <View style={styles.overviewSummaryCard}>
              <Text style={styles.overviewSummaryLabel}>
                {props.screenCopy.summaryBalance}
              </Text>
              <Text style={styles.overviewSummaryValue}>
                {props.formatAmount(props.balance)}
              </Text>
            </View>
            <View style={styles.overviewSummaryCard}>
              <Text style={styles.overviewSummaryLabel}>
                {props.screenCopy.summarySelection}
              </Text>
              <Text style={styles.overviewSummaryValue}>
                {selectionCount}/{QUICK_EIGHT_CONFIG.pickCount}
              </Text>
            </View>
            <View style={styles.overviewSummaryCard}>
              <Text style={styles.overviewSummaryLabel}>
                {props.screenCopy.multiplierLabel}
              </Text>
              <Text style={styles.overviewSummaryValue}>{latestMultiplier}</Text>
            </View>
          </View>
        </View>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard title={props.screenCopy.sectionTitle}>
        <View style={styles.ticketStage}>
          <View style={styles.ticketStageHeader}>
            <View style={styles.ticketStageHeading}>
              <Text style={styles.ticketStageTitle}>
                {props.screenCopy.selectionTitle}
              </Text>
              <Text style={styles.ticketStageSubtitle}>{latestStatus}</Text>
            </View>
            <View style={props.styles.badgeRow}>
              <View
                style={[
                  props.styles.badge,
                  allNumbersSelected
                    ? props.styles.badgeSuccess
                    : props.styles.badgeMuted,
                ]}
              >
                <Text style={props.styles.badgeText}>
                  {selectionCount}/{QUICK_EIGHT_CONFIG.pickCount}
                </Text>
              </View>
              <View style={[props.styles.badge, props.styles.badgeMuted]}>
                <Text style={props.styles.badgeText}>{formattedStakePreview}</Text>
              </View>
            </View>
          </View>

          <View style={styles.ticketProgressRow}>
            <Text style={styles.ticketProgressLabel}>
              {props.screenCopy.selectionTitle}
            </Text>
            <Text style={styles.ticketProgressValue}>
              {selectionCount}/{QUICK_EIGHT_CONFIG.pickCount}
            </Text>
          </View>
          <View style={styles.ticketProgressTrack}>
            <View
              style={[
                styles.ticketProgressFill,
                {
                  width: `${Math.max(selectionProgress * 100, selectionCount > 0 ? 12 : 0)}%`,
                },
              ]}
            />
          </View>

          <View style={styles.ticketGrid}>
            {quickEightTicketSlots.map((slotIndex) => {
              const value = props.quickEightSelection[slotIndex];
              const filled = typeof value === "number";
              const matched = filled && props.quickEightMatchedSet.has(value);

              if (!filled) {
                return (
                  <View key={`slot-${slotIndex}`} style={styles.ticketSlotEmpty}>
                    <Text style={styles.ticketSlotEmptyMark}>?</Text>
                  </View>
                );
              }

              return (
                <Pressable
                  key={`slot-${slotIndex}`}
                  onPress={() => props.onToggleNumber(value)}
                  disabled={props.playingQuickEight}
                  accessibilityRole="button"
                  accessibilityLabel={`Selected number ${value}`}
                  accessibilityHint="Double tap to remove this number from the current Quick Eight ticket."
                  accessibilityState={{ disabled: props.playingQuickEight }}
                  style={[
                    styles.ticketSlotFilled,
                    matched
                      ? styles.ticketSlotMatched
                      : styles.ticketSlotSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.ticketSlotValue,
                      matched
                        ? styles.ticketSlotValueMatched
                        : styles.ticketSlotValueSelected,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.ticketHint}>
            {selectionCount > 0
              ? latestStatus
              : props.screenCopy.noSelection}
          </Text>
        </View>

        <View style={styles.summaryStatsGrid}>
          <GameStatCard
            label={props.screenCopy.statusLabel}
            value={latestStatus}
            valueTone="accent"
          />
          <GameStatCard
            label={props.screenCopy.multiplierLabel}
            value={latestMultiplier}
            valueTone="accent"
          />
          <GameStatCard
            label={props.screenCopy.hitCountLabel}
            value={latestHitCount}
            valueTone={
              props.quickEightResult && props.quickEightResult.hitCount > 0
                ? "success"
                : "default"
            }
          />
        </View>

        <GameInfoPanel>
          <View style={styles.stakeSpotlightCard}>
            <View style={styles.stakeSpotlightHeader}>
              <View style={styles.stakeSpotlightBadge}>
                <Text style={styles.stakeSpotlightBadgeText}>
                  {selectionCount}/{QUICK_EIGHT_CONFIG.pickCount}
                </Text>
              </View>
              <View style={styles.stakeSpotlightCopy}>
                <Text style={styles.stakeSpotlightTitle}>
                  {props.screenCopy.play}
                </Text>
                <Text style={styles.stakeSpotlightBody}>
                  {selectionCount === QUICK_EIGHT_CONFIG.pickCount
                    ? props.screenCopy.selectionLocked
                    : props.screenCopy.selectionLeft(
                        QUICK_EIGHT_CONFIG.pickCount - selectionCount,
                      )}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.stakeHeader}>
            <View style={styles.stakeHeaderCopy}>
              <Text style={styles.stakeTitle}>{props.screenCopy.stakeAmount}</Text>
              <Text style={styles.stakeSubtitle}>
                {props.screenCopy.stakeRange(
                  QUICK_EIGHT_CONFIG.minStake,
                  QUICK_EIGHT_CONFIG.maxStake,
                )}
              </Text>
            </View>
            <View style={[props.styles.badge, props.styles.badgeMuted]}>
              <Text style={props.styles.badgeText}>{formattedStakePreview}</Text>
            </View>
          </View>

          <TextInput
            value={props.quickEightStakeAmount}
            onChangeText={props.onChangeStakeAmount}
            style={props.styles.input}
            keyboardType="decimal-pad"
            autoCorrect={false}
            placeholder={QUICK_EIGHT_CONFIG.minStake}
            placeholderTextColor={palette.textMuted}
          />

          <View style={styles.stakeActionStack}>
            <ActionButton
              label={
                props.playingQuickEight
                  ? props.screenCopy.drawing
                  : props.screenCopy.play
              }
              onPress={props.onPlayQuickEight}
              disabled={
                props.playingQuickEight ||
                props.playingDrawCount !== null ||
                !props.emailVerified
              }
              variant="gold"
              fullWidth
            />
            <ActionButton
              label={props.screenCopy.clear}
              onPress={props.onClearSelection}
              disabled={props.playingQuickEight || selectionCount === 0}
              variant="secondary"
              fullWidth
            />
          </View>
        </GameInfoPanel>

        <View style={styles.numberBoardPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{props.screenCopy.numberBoardTitle}</Text>
            <Text style={styles.panelMeta}>
              {selectionCount}/{QUICK_EIGHT_CONFIG.pickCount}
            </Text>
          </View>

          <View style={styles.numberBoard}>
            {quickEightBoardNumbers.map((value) => {
              const selected = props.quickEightSelection.includes(value);
              const disabled =
                props.playingQuickEight ||
                (!selected &&
                  selectionCount >= QUICK_EIGHT_CONFIG.pickCount);

              return (
                <Pressable
                  key={`board-${value}`}
                  onPress={() => props.onToggleNumber(value)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${selected ? "Selected" : "Pick"} number ${value}`}
                  accessibilityHint={
                    selected
                      ? "Double tap to remove this number from the Quick Eight ticket."
                      : "Double tap to add this number to the Quick Eight ticket."
                  }
                  accessibilityState={{ disabled, selected }}
                  hitSlop={4}
                  style={[
                    styles.numberBoardCell,
                    selected ? styles.numberBoardCellSelected : null,
                    disabled && !selected ? styles.numberBoardCellDisabled : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.numberBoardCellLabel,
                      selected ? styles.numberBoardCellLabelSelected : null,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.payoutPanel}>
          <Text style={styles.panelTitle}>{props.screenCopy.payoutTableTitle}</Text>
          <View style={styles.summaryStatsGrid}>
            {QUICK_EIGHT_CONFIG.payoutTable.map((rule) => (
              <GameStatCard
                key={`rule-${rule.hits}`}
                label={props.screenCopy.payoutRuleLabel(rule.hits)}
                value={`${rule.multiplier}x`}
                valueTone={rule.hits >= 4 ? "accent" : "default"}
              />
            ))}
          </View>
        </View>

        {props.playingQuickEight ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>
              {props.screenCopy.loadingRequest}
            </Text>
          </View>
        ) : null}

        {props.quickEightResult ? (
          <GameInfoPanel>
            <View style={styles.resultHeader}>
              <View style={styles.resultHeading}>
                <Text style={styles.resultTitle}>
                  {props.screenCopy.latestRound}
                </Text>
                <Text style={styles.resultSubtitle}>
                  {props.quickEightStatusLabels[props.quickEightResult.status]} ·{" "}
                  {props.quickEightResult.hitCount} / {QUICK_EIGHT_CONFIG.pickCount}
                </Text>
              </View>
              <View style={styles.resultPayoutCard}>
                <Text style={styles.resultPayoutLabel}>
                  {props.screenCopy.payout}
                </Text>
                <Text style={styles.resultPayoutValue}>
                  {props.formatAmount(props.quickEightResult.payoutAmount)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryStatsGrid}>
              <GameStatCard
                label={props.screenCopy.statusLabel}
                value={
                  props.quickEightStatusLabels[props.quickEightResult.status]
                }
                valueTone="accent"
              />
              <GameStatCard
                label={props.screenCopy.multiplierLabel}
                value={`${props.quickEightResult.multiplier}x`}
                valueTone="accent"
              />
              <GameStatCard
                label={props.screenCopy.hitCountLabel}
                value={String(props.quickEightResult.hitCount)}
                valueTone={
                  props.quickEightResult.hitCount > 0 ? "success" : "default"
                }
              />
            </View>

            <MobileFairnessCompactSummary
              locale={props.fairnessLocale}
              fairness={props.quickEightResult.fairness}
              clientNonce={props.quickEightResult.fairness.clientNonce}
              eyebrow={props.fairnessEyebrow}
            />

            <View style={styles.resultSection}>
              <Text style={styles.resultSectionLabel}>
                {props.screenCopy.drawnNumbers(
                  props.visibleQuickEightDrawnNumbers.length,
                  QUICK_EIGHT_CONFIG.drawCount,
                )}
              </Text>
              <View style={styles.resultChipGrid}>
                {props.visibleQuickEightDrawnNumbers.map((value) => (
                  <GameNumberChip
                    key={`drawn-${value}`}
                    value={value}
                    tone={props.quickEightMatchedSet.has(value) ? "hit" : "default"}
                  />
                ))}
              </View>
            </View>

            <View style={styles.resultSection}>
              <Text style={styles.resultSectionLabel}>
                {props.screenCopy.matchedNumbers}
              </Text>
              <View style={styles.resultChipGrid}>
                {props.quickEightResult.matchedNumbers.length > 0 ? (
                  props.quickEightResult.matchedNumbers.map((value) => (
                    <GameNumberChip
                      key={`match-${value}`}
                      value={value}
                      tone="selected"
                    />
                  ))
                ) : (
                  <Text style={styles.ticketHint}>{props.screenCopy.noMatches}</Text>
                )}
              </View>
            </View>
          </GameInfoPanel>
        ) : (
          <View style={styles.resultPlaceholderCard}>
            <Text style={styles.resultPlaceholderTitle}>
              {props.screenCopy.latestRound}
            </Text>
            <Text style={styles.resultPlaceholderBody}>
              {props.screenCopy.noRoundYet}
            </Text>
          </View>
        )}
      </SectionCard>

      <SectionCard title={props.screenCopy.howToPlayTitle}>
        <View style={styles.howToPlayHero}>
          <View style={styles.howToPlayHeroHeader}>
            <View style={styles.howToPlayHeroCopy}>
              <Text style={styles.howToPlayHeroTitle}>
                {props.screenCopy.howToPlayTitle}
              </Text>
              <Text style={styles.howToPlayHeroBody}>
                {props.screenCopy.howToPlaySubtitle}
              </Text>
            </View>
            <View style={styles.howToPlayHeroBadge}>
              <Text style={styles.howToPlayHeroBadgeText}>8/80</Text>
            </View>
          </View>

          <View style={styles.howToPlayStepList}>
            {howToPlaySteps.map((step, index) => (
              <View key={step.title} style={styles.howToPlayStepRow}>
                <View
                  style={[
                    styles.howToPlayStepIndex,
                    step.tone === "indigo"
                      ? styles.howToPlayStepIndexIndigo
                      : step.tone === "peach"
                        ? styles.howToPlayStepIndexPeach
                        : styles.howToPlayStepIndexGold,
                  ]}
                >
                  <Text style={styles.howToPlayStepIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.howToPlayStepCopy}>
                  <Text style={styles.howToPlayStepTitle}>{step.title}</Text>
                  <Text style={styles.howToPlayStepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.summaryStatsGrid}>
          <GameStatCard
            label={props.screenCopy.howToPlayMaxWin}
            value={maxWinMultiplier}
            valueTone="accent"
          />
          <GameStatCard
            label={props.screenCopy.howToPlayBoard}
            value={`1-${QUICK_EIGHT_CONFIG.boardSize}`}
          />
          <GameStatCard
            label={props.screenCopy.howToPlayDraws}
            value={String(QUICK_EIGHT_CONFIG.drawCount)}
          />
        </View>

        <View style={styles.howToPlayFairnessCard}>
          <View style={styles.howToPlayFairnessIcon}>
            <Text style={styles.howToPlayFairnessIconText}>✓</Text>
          </View>
          <View style={styles.howToPlayFairnessCopy}>
            <Text style={styles.howToPlayFairnessTitle}>
              {props.screenCopy.howToPlayFairnessTitle}
            </Text>
            <Text style={styles.howToPlayFairnessBody}>
              {props.screenCopy.howToPlayFairnessBody}
            </Text>
          </View>
        </View>
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  overviewArtBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 118,
    borderTopLeftRadius: mobileRadii.xl,
    borderTopRightRadius: mobileRadii.xl,
    backgroundColor: "#ff5c00",
  },
  overviewBadge: {
    position: "absolute",
    top: 78,
    alignSelf: "center",
    minWidth: 90,
    height: 74,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 37,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#ffe58b",
    paddingHorizontal: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadow,
  },
  overviewBadgeText: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  overviewBody: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  overviewCard: {
    gap: mobileSpacing.md,
    overflow: "hidden",
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    paddingHorizontal: mobileSpacing.xl,
    paddingTop: 146,
    paddingBottom: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  overviewEyebrow: {
    color: "#fff2ea",
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.caps,
  },
  overviewPill: {
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  overviewPillText: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  overviewSummaryCard: {
    flex: 1,
    gap: mobileSpacing["2xs"],
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff8ef",
    paddingHorizontal: mobileSpacing.md,
    paddingVertical: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  overviewSummaryLabel: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  overviewSummaryRow: {
    flexDirection: "row",
    gap: mobileSpacing.md,
  },
  overviewSummaryValue: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  overviewTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  overviewTopRow: {
    position: "absolute",
    top: mobileSpacing.xl,
    left: mobileSpacing.xl,
    right: mobileSpacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  ticketStage: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff7ee",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  ticketStageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  ticketStageHeading: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  ticketStageTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  ticketStageSubtitle: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
  },
  ticketProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  ticketProgressLabel: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  ticketProgressValue: {
    color: palette.accentMuted,
    fontSize: mobileTypeScale.fontSize.body,
    fontWeight: "700",
  },
  ticketProgressTrack: {
    height: 18,
    overflow: "hidden",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#eadbd0",
  },
  ticketProgressFill: {
    height: "100%",
    borderRightWidth: mobileChromeTheme.borderWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.accent,
  },
  ticketGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  ticketSlotEmpty: {
    width: "22%",
    minWidth: 68,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#efe6df",
    ...mobileChromeTheme.cardShadowSm,
  },
  ticketSlotEmptyMark: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.metric,
    fontWeight: "800",
  },
  ticketSlotFilled: {
    width: "22%",
    minWidth: 68,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    ...mobileChromeTheme.cardShadow,
  },
  ticketSlotSelected: {
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  ticketSlotMatched: {
    backgroundColor: mobileFeedbackTheme.gold.backgroundColor,
  },
  ticketSlotValue: {
    fontSize: mobileTypeScale.fontSize.metric,
    fontWeight: "800",
  },
  ticketSlotValueSelected: {
    color: mobileFeedbackTheme.active.accentColor,
  },
  ticketSlotValueMatched: {
    color: mobileFeedbackTheme.gold.accentColor,
  },
  ticketHint: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  summaryStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.lg,
  },
  stakeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  stakeHeaderCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  stakeTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  stakeSubtitle: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  stakeActionStack: {
    gap: mobileSpacing.md,
  },
  stakeSpotlightBadge: {
    minWidth: 74,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#ffe58b",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.sm,
    ...mobileChromeTheme.cardShadowSm,
  },
  stakeSpotlightBadgeText: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "800",
  },
  stakeSpotlightBody: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  stakeSpotlightCard: {
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff8ef",
    padding: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  stakeSpotlightCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  stakeSpotlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpacing.md,
  },
  stakeSpotlightTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  numberBoardPanel: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  panelTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  panelMeta: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  numberBoard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.sm,
  },
  numberBoardCell: {
    width: "11%",
    minWidth: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.lg,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingVertical: mobileSpacing.sm,
  },
  numberBoardCellSelected: {
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  numberBoardCellDisabled: {
    opacity: 0.55,
  },
  numberBoardCellLabel: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.labelSm,
    fontWeight: "700",
  },
  numberBoardCellLabelSelected: {
    color: mobileFeedbackTheme.active.accentColor,
  },
  payoutPanel: {
    gap: mobileSpacing.lg,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  resultHeading: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  resultTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  resultSubtitle: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
  },
  resultPayoutCard: {
    minWidth: 120,
    gap: mobileSpacing["2xs"],
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#ffe8a6",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  resultPayoutLabel: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
  },
  resultPayoutValue: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  resultSection: {
    gap: mobileSpacing.md,
  },
  resultSectionLabel: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.body,
    fontWeight: "700",
  },
  resultPlaceholderBody: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  resultPlaceholderCard: {
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff8ef",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  resultPlaceholderTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  resultChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.sm,
  },
  howToPlayHero: {
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff1d9",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  howToPlayHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpacing.lg,
  },
  howToPlayHeroCopy: {
    flex: 1,
    gap: mobileSpacing.xs,
  },
  howToPlayHeroTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  howToPlayHeroBody: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  howToPlayHeroBadge: {
    minWidth: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: mobileSpacing.lg,
    paddingVertical: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  howToPlayHeroBadgeText: {
    color: palette.accentMuted,
    fontSize: mobileTypeScale.fontSize.titleSm,
    fontWeight: "800",
  },
  howToPlayStepList: {
    gap: mobileSpacing.md,
  },
  howToPlayStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: mobileSpacing.md,
  },
  howToPlayStepIndex: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    ...mobileChromeTheme.cardShadowSm,
  },
  howToPlayStepIndexIndigo: {
    backgroundColor: "#dfe1ff",
  },
  howToPlayStepIndexPeach: {
    backgroundColor: "#ffd9d2",
  },
  howToPlayStepIndexGold: {
    backgroundColor: "#ffe58b",
  },
  howToPlayStepIndexText: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  howToPlayStepCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  howToPlayStepTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  howToPlayStepBody: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  howToPlayFairnessCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpacing.lg,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#f6f3f2",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadowSm,
  },
  howToPlayFairnessIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.full,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
    ...mobileChromeTheme.cardShadowSm,
  },
  howToPlayFairnessIconText: {
    color: mobileFeedbackTheme.active.accentColor,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  howToPlayFairnessCopy: {
    flex: 1,
    gap: mobileSpacing["2xs"],
  },
  howToPlayFairnessTitle: {
    color: palette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  howToPlayFairnessBody: {
    color: palette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
});
