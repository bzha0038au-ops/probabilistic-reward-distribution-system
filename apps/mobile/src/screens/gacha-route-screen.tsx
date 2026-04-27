import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type {
  DrawCatalogResponse,
  DrawPlayResponse,
  DrawPrizePresentation,
  DrawPrizeRarity,
} from "@reward/shared-types/draw";

import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import {
  getSymbolById,
  type SlotFinale,
  type SlotReelWindow,
} from "../slot-machine";
import {
  mobileGameTheme,
  mobilePalette as palette,
  mobileSurfaceTheme,
  mobileTypography,
} from "../theme";
import { ActionButton, SectionCard } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import type { MobileAppRoute, MobileStyles } from "./types";

type GachaToneMap = Record<
  DrawPrizeRarity,
  { backgroundColor: string; borderColor: string; tintColor: string }
>;

type GachaRouteScreenProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  verificationCallout: ReactNode;
  screenCopy: MobileRouteScreens["gacha"];
  fairnessRefreshingLabel: string;
  balance: string;
  drawCatalog: DrawCatalogResponse | null;
  featuredPrizes: readonly DrawPrizePresentation[];
  multiDrawCount: number;
  lastDrawPlay: DrawPlayResponse | null;
  highlightPrize: DrawPrizePresentation | null;
  playingDrawCount: number | null;
  playingQuickEight: boolean;
  loadingDrawCatalog: boolean;
  submitting: boolean;
  emailVerified: boolean;
  gachaReels: [SlotReelWindow, SlotReelWindow, SlotReelWindow];
  gachaLockedReels: number;
  gachaAnimating: boolean;
  gachaTone: "idle" | SlotFinale["tone"];
  formatAmount: (value: string) => string;
  shortenCommitHash: (value: string) => string;
  onPlayDraw: (count: number) => void;
  onRefreshDrawCatalog: () => void;
  drawRarityLabels: Record<DrawPrizeRarity, string>;
  drawRarityTones: GachaToneMap;
  drawStockLabels: Record<DrawPrizePresentation["stockState"], string>;
  drawStatusLabels: Record<
    DrawPlayResponse["results"][number]["status"],
    string
  >;
};

export function GachaRouteScreen(props: GachaRouteScreenProps) {
  const slotToneBorder =
    props.gachaTone === "win"
      ? mobileGameTheme.slot.toneBorder.win
      : props.gachaTone === "blocked"
        ? mobileGameTheme.slot.toneBorder.blocked
        : mobileGameTheme.slot.toneBorder.ready;
  const slotToneCopy = props.gachaAnimating
    ? props.playingDrawCount && props.playingDrawCount > 1
      ? props.screenCopy.slotToneSpinningBatch(props.playingDrawCount)
      : props.screenCopy.slotToneSpinningSingle
    : props.gachaTone === "win"
      ? props.screenCopy.slotToneWin
      : props.gachaTone === "blocked"
        ? props.screenCopy.slotToneBlocked
        : props.lastDrawPlay
          ? props.screenCopy.slotToneSettled
          : props.screenCopy.slotToneReady;

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
              {props.screenCopy.summarySecondary}
            </Text>
            <Text style={props.styles.routeSummaryValue}>
              {props.drawCatalog
                ? props.screenCopy.summarySecondaryValue(
                    props.featuredPrizes.length,
                  )
                : props.screenCopy.summarySecondaryLoading}
            </Text>
          </View>
        </View>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard
        title={props.screenCopy.sectionTitle}
        subtitle={props.screenCopy.sectionSubtitle}
      >
        {props.drawCatalog ? (
          <View style={props.styles.gachaMetaCard}>
            <View style={props.styles.gachaMetaRow}>
              <Text style={props.styles.gachaMetaLabel}>
                {props.screenCopy.metaCostPerPull}
              </Text>
              <Text style={props.styles.gachaMetaValue}>
                {props.formatAmount(props.drawCatalog.drawCost)}
              </Text>
            </View>
            <View style={props.styles.gachaMetaRow}>
              <Text style={props.styles.gachaMetaLabel}>
                {props.screenCopy.metaPity}
              </Text>
              <Text style={props.styles.gachaMetaValue}>
                {props.drawCatalog.pity.enabled
                  ? props.drawCatalog.pity.active
                    ? props.screenCopy.pityBoostActive
                    : props.screenCopy.pityPullsToBoost(
                        props.drawCatalog.pity.drawsUntilBoost ?? 0,
                      )
                  : props.screenCopy.pityDisabled}
              </Text>
            </View>
            <View style={props.styles.gachaMetaRow}>
              <Text style={props.styles.gachaMetaLabel}>
                {props.screenCopy.metaFairness}
              </Text>
              <Text style={props.styles.gachaMetaValue}>
                Epoch {props.drawCatalog.fairness.epoch}
              </Text>
            </View>
            <Text style={styles.gachaCommitHash}>
              {props.shortenCommitHash(props.drawCatalog.fairness.commitHash)}
            </Text>
          </View>
        ) : null}

        <View style={[styles.slotMachineCard, { borderColor: slotToneBorder }]}>
          <View style={styles.slotMachineHeader}>
            <Text style={styles.slotMachineTitle}>
              {props.screenCopy.slotRevealTitle}
            </Text>
            <Text style={styles.slotMachineSubtitle}>{slotToneCopy}</Text>
          </View>
          <View style={styles.slotMachineRow}>
            {props.gachaReels.map((reel, reelIndex) => (
              <View
                key={`reel-${reelIndex}`}
                style={[
                  styles.slotReel,
                  reelIndex < props.gachaLockedReels
                    ? styles.slotReelLocked
                    : null,
                ]}
              >
                {reel.map((symbolId, windowIndex) => {
                  const symbol = getSymbolById(symbolId);
                  const centerCell = windowIndex === 1;

                  return (
                    <View
                      key={`${reelIndex}-${windowIndex}-${symbolId}`}
                      style={[
                        styles.slotCell,
                        {
                          backgroundColor: symbol.backgroundColor,
                          borderColor: symbol.borderColor,
                        },
                        centerCell
                          ? styles.slotCellCenter
                          : styles.slotCellSide,
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotCellGlyph,
                          { color: symbol.tintColor },
                        ]}
                      >
                        {symbol.glyph}
                      </Text>
                      <Text
                        style={[
                          styles.slotCellLabel,
                          {
                            color: centerCell
                              ? palette.text
                              : palette.textMuted,
                          },
                        ]}
                      >
                        {symbol.shortLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={styles.slotMachineHint}>
            {props.gachaAnimating
              ? props.screenCopy.slotHintAnimating
              : props.screenCopy.slotHintSettled}
          </Text>
        </View>

        <View style={props.styles.inlineActions}>
          <ActionButton
            label={
              props.playingDrawCount === 1
                ? props.screenCopy.pulling
                : props.screenCopy.pullOnce
            }
            onPress={() => props.onPlayDraw(1)}
            disabled={
              props.submitting ||
              props.loadingDrawCatalog ||
              props.playingDrawCount !== null ||
              props.playingQuickEight ||
              !props.drawCatalog?.drawEnabled ||
              !props.emailVerified
            }
            compact
          />
          <ActionButton
            label={
              props.playingDrawCount === props.multiDrawCount
                ? props.screenCopy.pulling
                : props.screenCopy.pullMany(props.multiDrawCount)
            }
            onPress={() => props.onPlayDraw(props.multiDrawCount)}
            disabled={
              props.submitting ||
              props.loadingDrawCatalog ||
              props.playingDrawCount !== null ||
              props.playingQuickEight ||
              !props.drawCatalog?.drawEnabled ||
              !props.emailVerified ||
              props.multiDrawCount <= 1
            }
            variant="secondary"
            compact
          />
          <ActionButton
            label={
              props.loadingDrawCatalog
                ? props.fairnessRefreshingLabel
                : props.screenCopy.refreshBanner
            }
            onPress={props.onRefreshDrawCatalog}
            disabled={
              props.loadingDrawCatalog ||
              props.playingDrawCount !== null ||
              props.submitting
            }
            variant="secondary"
            compact
          />
        </View>

        {!props.drawCatalog?.drawEnabled && props.drawCatalog ? (
          <Text style={props.styles.errorText}>
            {props.screenCopy.disabledBySystem}
          </Text>
        ) : null}

        {props.drawCatalog && props.drawCatalog.maxBatchCount <= 1 ? (
          <Text style={props.styles.gachaHint}>
            {props.screenCopy.multiLocked(props.drawCatalog.maxBatchCount)}
          </Text>
        ) : null}

        {props.loadingDrawCatalog ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>
              {props.playingDrawCount !== null
                ? props.screenCopy.loadingPlay(props.playingDrawCount)
                : props.screenCopy.loadingBanner}
            </Text>
          </View>
        ) : null}

        {props.featuredPrizes.length > 0 ? (
          <View style={styles.gachaPrizeGrid}>
            {props.featuredPrizes.map((prize) => {
              const tone = props.drawRarityTones[prize.displayRarity];
              return (
                <View
                  key={prize.id}
                  style={[
                    styles.gachaPrizeCard,
                    {
                      backgroundColor: tone.backgroundColor,
                      borderColor: tone.borderColor,
                    },
                  ]}
                >
                  <View style={styles.gachaPrizeHeader}>
                    <View
                      style={[
                        styles.gachaRarityBadge,
                        { borderColor: tone.borderColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.gachaRarityLabel,
                          { color: tone.tintColor },
                        ]}
                      >
                        {props.drawRarityLabels[prize.displayRarity]}
                      </Text>
                    </View>
                    <View
                      style={[
                        props.styles.badge,
                        prize.stockState === "available"
                          ? props.styles.badgeSuccess
                          : prize.stockState === "low"
                            ? props.styles.badgeWarning
                            : props.styles.badgeMuted,
                      ]}
                    >
                      <Text style={props.styles.badgeText}>
                        {props.drawStockLabels[prize.stockState]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.gachaPrizeName}>{prize.name}</Text>
                  <Text style={styles.gachaPrizeReward}>
                    Reward {props.formatAmount(prize.rewardAmount)}
                  </Text>
                  <Text style={styles.gachaPrizeStock}>
                    Stock {prize.stock}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : props.drawCatalog ? (
          <Text style={props.styles.gachaHint}>
            {props.screenCopy.noActivePrizes}
          </Text>
        ) : null}

        {props.lastDrawPlay ? (
          <View style={styles.gachaResultPanel}>
            <Text style={styles.gachaResultTitle}>
              {props.lastDrawPlay.results.length <= 1
                ? props.screenCopy.latestSinglePull
                : props.screenCopy.latestBatchPull(props.lastDrawPlay.count)}
            </Text>
            <View style={props.styles.badgeRow}>
              <View style={[props.styles.badge, props.styles.badgeSuccess]}>
                <Text style={props.styles.badgeText}>
                  {props.lastDrawPlay.winCount} wins
                </Text>
              </View>
              <View style={props.styles.badge}>
                <Text style={props.styles.badgeText}>
                  Reward {props.formatAmount(props.lastDrawPlay.totalReward)}
                </Text>
              </View>
              <View style={[props.styles.badge, props.styles.badgeMuted]}>
                <Text style={props.styles.badgeText}>
                  Balance {props.formatAmount(props.lastDrawPlay.endingBalance)}
                </Text>
              </View>
            </View>

            {props.highlightPrize ? (
              <View
                style={[
                  styles.gachaHighlightCard,
                  {
                    backgroundColor:
                      props.drawRarityTones[props.highlightPrize.displayRarity]
                        .backgroundColor,
                    borderColor:
                      props.drawRarityTones[props.highlightPrize.displayRarity]
                        .borderColor,
                  },
                ]}
              >
                <Text style={styles.gachaHighlightLabel}>
                  {props.screenCopy.highlight}
                </Text>
                <Text style={styles.gachaHighlightName}>
                  {props.highlightPrize.name}
                </Text>
                <Text style={styles.gachaHighlightMeta}>
                  {props.drawRarityLabels[props.highlightPrize.displayRarity]} ·
                  Reward {props.formatAmount(props.highlightPrize.rewardAmount)}
                </Text>
              </View>
            ) : null}

            <View style={styles.gachaResultGrid}>
              {props.lastDrawPlay.results.map((result) => {
                const tone =
                  props.drawRarityTones[
                    result.prize?.displayRarity ?? "common"
                  ];
                return (
                  <View
                    key={result.id}
                    style={[
                      styles.gachaResultCard,
                      {
                        backgroundColor: tone.backgroundColor,
                        borderColor: tone.borderColor,
                      },
                    ]}
                  >
                    <Text style={styles.gachaResultStatus}>
                      {props.drawStatusLabels[result.status]}
                    </Text>
                    <Text style={styles.gachaResultName}>
                      {result.prize?.name ?? props.screenCopy.noFeaturedReward}
                    </Text>
                    <Text style={styles.gachaResultReward}>
                      Reward {props.formatAmount(result.rewardAmount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : props.drawCatalog ? (
          <Text style={props.styles.gachaHint}>
            {props.screenCopy.noPullYet}
          </Text>
        ) : null}
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  gachaCommitHash: {
    color: palette.accentMuted,
    fontSize: 12,
    fontFamily: mobileTypography.mono,
  },
  slotMachineCard: {
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: mobileSurfaceTheme.gamePanel,
    padding: 14,
  },
  slotMachineHeader: {
    gap: 4,
  },
  slotMachineTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  slotMachineSubtitle: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  slotMachineRow: {
    flexDirection: "row",
    gap: 10,
  },
  slotReel: {
    flex: 1,
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: mobileSurfaceTheme.reelPanel,
    padding: 10,
  },
  slotReelLocked: {
    ...mobileGameTheme.slot.shadows.reelLocked,
  },
  slotCell: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  slotCellCenter: {
    transform: [{ scale: 1.04 }],
  },
  slotCellSide: {
    opacity: 0.78,
  },
  slotCellGlyph: {
    fontSize: 22,
    fontWeight: "800",
  },
  slotCellLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  slotMachineHint: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  gachaPrizeGrid: {
    gap: 12,
  },
  gachaPrizeCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  gachaPrizeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  gachaRarityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  gachaRarityLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  gachaPrizeName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  gachaPrizeReward: {
    color: palette.accentMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  gachaPrizeStock: {
    color: palette.textMuted,
    fontSize: 12,
  },
  gachaResultPanel: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  gachaResultTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  gachaHighlightCard: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  gachaHighlightLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  gachaHighlightName: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  gachaHighlightMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  gachaResultGrid: {
    gap: 10,
  },
  gachaResultCard: {
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  gachaResultStatus: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  gachaResultName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  gachaResultReward: {
    color: palette.accentMuted,
    fontSize: 13,
    fontWeight: "600",
  },
});
