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
import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import { mobileGameTheme, mobilePalette as palette } from "../theme";
import { ActionButton, SectionCard } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import type { MobileAppRoute, MobileStyles } from "./types";

const quickEightBoardNumbers = Array.from(
  { length: QUICK_EIGHT_CONFIG.boardSize },
  (_, index) => index + 1,
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
  return (
    <>
      <SectionCard
        title={props.screenCopy.routeTitle}
        subtitle={props.screenCopy.routeSubtitle}
      >
        <RouteSwitcher
          styles={props.styles}
          currentRoute={props.currentRoute}
          labels={props.routeLabels}
          navigationLocked={props.routeNavigationLocked}
          onOpenRoute={props.onOpenRoute}
        />
        <View style={props.styles.routeSummaryRow}>
          <View style={props.styles.routeSummaryCard}>
            <Text style={props.styles.routeSummaryLabel}>
              {props.screenCopy.summaryBalance}
            </Text>
            <Text style={props.styles.routeSummaryValue}>
              {props.formatAmount(props.balance)}
            </Text>
          </View>
          <View style={props.styles.routeSummaryCard}>
            <Text style={props.styles.routeSummaryLabel}>
              {props.screenCopy.summarySelection}
            </Text>
            <Text style={props.styles.routeSummaryValue}>
              {props.quickEightSelection.length}/{QUICK_EIGHT_CONFIG.pickCount}
            </Text>
          </View>
        </View>
        <Text style={props.styles.gachaHint}>
          {props.screenCopy.routeHint(
            QUICK_EIGHT_CONFIG.pickCount,
            QUICK_EIGHT_CONFIG.boardSize,
            QUICK_EIGHT_CONFIG.drawCount,
          )}
        </Text>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard
        title={props.screenCopy.sectionTitle}
        subtitle={props.screenCopy.sectionSubtitle}
      >
        <View style={styles.quickEightSelectionPanel}>
          <View style={styles.quickEightSelectionHeader}>
            <Text style={styles.quickEightSelectionTitle}>
              {props.screenCopy.selectionTitle}
            </Text>
            <Text style={styles.quickEightSelectionMeta}>
              {props.quickEightSelection.length === QUICK_EIGHT_CONFIG.pickCount
                ? props.screenCopy.selectionLocked
                : props.screenCopy.selectionLeft(
                    QUICK_EIGHT_CONFIG.pickCount -
                      props.quickEightSelection.length,
                  )}
            </Text>
          </View>
          <View style={styles.quickEightSelectedNumbers}>
            {props.quickEightSelection.length > 0 ? (
              props.quickEightSelection.map((value) => (
                <View
                  key={`selected-${value}`}
                  style={styles.quickEightSelectedChip}
                >
                  <Text style={styles.quickEightSelectedChipText}>{value}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.quickEightHint}>
                {props.screenCopy.noSelection}
              </Text>
            )}
          </View>
          <View style={props.styles.inlineActions}>
            <ActionButton
              label={props.screenCopy.clear}
              onPress={props.onClearSelection}
              variant="secondary"
              compact
            />
          </View>
        </View>

        <View style={styles.quickEightBoard}>
          {quickEightBoardNumbers.map((value) => {
            const selected = props.quickEightSelection.includes(value);
            const disabled =
              props.playingQuickEight ||
              (!selected &&
                props.quickEightSelection.length >=
                  QUICK_EIGHT_CONFIG.pickCount);
            return (
              <Pressable
                key={`board-${value}`}
                onPress={() => props.onToggleNumber(value)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${selected ? "Selected" : "Pick"} number ${value}`}
                accessibilityHint={
                  selected
                    ? "Double tap to remove this number from the Quick Eight selection."
                    : "Double tap to add this number to the Quick Eight selection."
                }
                accessibilityState={{ disabled, selected }}
                hitSlop={4}
                style={[
                  styles.quickEightNumberCell,
                  selected ? styles.quickEightNumberCellActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.quickEightNumberLabel,
                    selected ? styles.quickEightNumberLabelActive : null,
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.quickEightStakePanel}>
          <Text style={props.styles.fieldLabel}>
            {props.screenCopy.stakeAmount}
          </Text>
          <TextInput
            value={props.quickEightStakeAmount}
            onChangeText={props.onChangeStakeAmount}
            style={props.styles.input}
            keyboardType="decimal-pad"
            autoCorrect={false}
            placeholder={QUICK_EIGHT_CONFIG.minStake}
            placeholderTextColor={palette.textMuted}
          />
          <Text style={styles.quickEightHint}>
            {props.screenCopy.stakeRange(
              QUICK_EIGHT_CONFIG.minStake,
              QUICK_EIGHT_CONFIG.maxStake,
            )}
          </Text>
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
          />
        </View>

        <View style={styles.quickEightPaytable}>
          {QUICK_EIGHT_CONFIG.payoutTable.map((rule) => (
            <View
              key={`rule-${rule.hits}`}
              style={styles.quickEightPaytableCard}
            >
              <Text style={styles.quickEightPaytableLabel}>
                {rule.hits} hits
              </Text>
              <Text style={styles.quickEightPaytableValue}>
                {rule.multiplier}x
              </Text>
            </View>
          ))}
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
          <View style={styles.quickEightResultPanel}>
            <View style={styles.quickEightResultHeader}>
              <View>
                <Text style={styles.quickEightResultTitle}>
                  {props.screenCopy.latestRound}
                </Text>
                <Text style={styles.quickEightResultSubtitle}>
                  {props.quickEightStatusLabels[props.quickEightResult.status]}{" "}
                  · {props.quickEightResult.hitCount} hits
                </Text>
              </View>
              <View style={styles.quickEightResultSummary}>
                <Text style={styles.quickEightResultPayout}>
                  {props.formatAmount(props.quickEightResult.payoutAmount)}
                </Text>
                <Text style={styles.quickEightResultMeta}>
                  {props.screenCopy.payout}
                </Text>
              </View>
            </View>

            <MobileFairnessCompactSummary
              locale={props.fairnessLocale}
              fairness={props.quickEightResult.fairness}
              clientNonce={props.quickEightResult.fairness.clientNonce}
              eyebrow={props.fairnessEyebrow}
            />

            <View style={styles.quickEightDrawnSection}>
              <Text style={styles.quickEightSectionLabel}>
                {props.screenCopy.drawnNumbers(
                  props.visibleQuickEightDrawnNumbers.length,
                  QUICK_EIGHT_CONFIG.drawCount,
                )}
              </Text>
              <View style={styles.quickEightDrawnGrid}>
                {props.visibleQuickEightDrawnNumbers.map((value) => (
                  <View
                    key={`drawn-${value}`}
                    style={[
                      styles.quickEightDrawnChip,
                      props.quickEightMatchedSet.has(value)
                        ? styles.quickEightDrawnChipHit
                        : null,
                    ]}
                  >
                    <Text style={styles.quickEightDrawnChipText}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.quickEightMatchedSection}>
              <Text style={styles.quickEightSectionLabel}>
                {props.screenCopy.matchedNumbers}
              </Text>
              <View style={styles.quickEightDrawnGrid}>
                {props.quickEightResult.matchedNumbers.length > 0 ? (
                  props.quickEightResult.matchedNumbers.map((value) => (
                    <View
                      key={`match-${value}`}
                      style={styles.quickEightMatchedChip}
                    >
                      <Text style={styles.quickEightMatchedChipText}>
                        {value}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.quickEightHint}>
                    {props.screenCopy.noMatches}
                  </Text>
                )}
              </View>
            </View>
          </View>
        ) : (
          <Text style={props.styles.gachaHint}>
            {props.screenCopy.noRoundYet}
          </Text>
        )}
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  quickEightSelectionPanel: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  quickEightSelectionHeader: {
    gap: 10,
  },
  quickEightSelectionTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  quickEightSelectionMeta: {
    color: palette.accentMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  quickEightSelectedNumbers: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickEightSelectedChip: {
    minWidth: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileGameTheme.quickEight.selected.borderColor,
    backgroundColor: mobileGameTheme.quickEight.selected.backgroundColor,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickEightSelectedChipText: {
    color: mobileGameTheme.quickEight.selected.accentColor,
    fontSize: 13,
    fontWeight: "700",
  },
  quickEightHint: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  quickEightBoard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickEightNumberCell: {
    width: "14%",
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
  },
  quickEightNumberCellActive: {
    borderColor: mobileGameTheme.quickEight.selected.borderColor,
    backgroundColor: mobileGameTheme.quickEight.selected.backgroundColor,
  },
  quickEightNumberLabel: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  quickEightNumberLabelActive: {
    color: mobileGameTheme.quickEight.selected.accentColor,
  },
  quickEightStakePanel: {
    gap: 10,
  },
  quickEightPaytable: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickEightPaytableCard: {
    width: "31%",
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickEightPaytableLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quickEightPaytableValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  quickEightResultPanel: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  quickEightResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  quickEightResultTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  quickEightResultSubtitle: {
    color: palette.textMuted,
    fontSize: 13,
  },
  quickEightResultSummary: {
    alignItems: "flex-end",
    gap: 2,
  },
  quickEightResultPayout: {
    color: palette.success,
    fontSize: 20,
    fontWeight: "800",
  },
  quickEightResultMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  quickEightDrawnSection: {
    gap: 8,
  },
  quickEightSectionLabel: {
    color: palette.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  quickEightDrawnGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickEightDrawnChip: {
    minWidth: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickEightDrawnChipHit: {
    borderColor: mobileGameTheme.quickEight.hit.borderColor,
    backgroundColor: mobileGameTheme.quickEight.hit.backgroundColor,
  },
  quickEightDrawnChipText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "600",
  },
  quickEightMatchedSection: {
    gap: 8,
  },
  quickEightMatchedChip: {
    minWidth: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileGameTheme.quickEight.hit.borderColor,
    backgroundColor: mobileGameTheme.quickEight.hit.backgroundColor,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickEightMatchedChipText: {
    color: palette.success,
    fontSize: 13,
    fontWeight: "700",
  },
});
