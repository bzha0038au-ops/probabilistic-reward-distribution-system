import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import type {
  DrawCatalogResponse,
  DrawPlayResponse,
  DrawPrizePresentation,
  DrawPrizeRarity,
} from "@reward/shared-types/draw";
import type { PlayModeCopy } from "../ui";
import type { PlayModeType } from "@reward/shared-types/play-mode";

import { getHighlightDrawResult } from "../app-support";
import { GameStatusPanel } from "../game-domain-ui";
import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import {
  getSymbolById,
  type SlotFinale,
  type SlotReelWindow,
} from "../slot-machine";
import {
  mobileChromeTheme,
  mobileGameTheme,
  mobileLayoutTheme,
  mobileOverlayTheme,
  mobilePalette as palette,
  mobileRadii,
  mobileSpacing,
  mobileSurfaceTheme,
  mobileTypography,
  mobileTypeScale,
} from "../theme";
import { ActionButton, PlayModeSelector, SectionCard, TextLink } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import { gachaRouteScreenStyles as styles } from "./gacha-route-screen.styles";
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
  playModeCopy: PlayModeCopy;
  drawCatalog: DrawCatalogResponse | null;
  featuredPrizes: readonly DrawPrizePresentation[];
  multiDrawCount: number;
  lastDrawPlay: DrawPlayResponse | null;
  highlightPrize: DrawPrizePresentation | null;
  playingDrawCount: number | null;
  playingQuickEight: boolean;
  loadingDrawCatalog: boolean;
  updatingDrawPlayMode: boolean;
  submitting: boolean;
  emailVerified: boolean;
  gachaReels: [SlotReelWindow, SlotReelWindow, SlotReelWindow];
  gachaLockedReels: number;
  gachaAnimating: boolean;
  gachaTone: "idle" | SlotFinale["tone"];
  formatAmount: (value: string) => string;
  shortenCommitHash: (value: string) => string;
  onChangeDrawPlayMode: (type: PlayModeType) => void;
  onPlayDraw: (count: number) => void;
  onRefreshDrawCatalog: () => void;
  drawRarityLabels: Record<DrawPrizeRarity, string>;
  drawRarityTones: GachaToneMap;
  drawStockLabels: Record<
    DrawPrizePresentation["stockState"],
    string
  >;
  drawStatusLabels: Record<
    DrawPlayResponse["results"][number]["status"],
    string
  >;
};

export function GachaRouteScreen(props: GachaRouteScreenProps) {
  const [bigWinOpen, setBigWinOpen] = useState(false);
  const [lastBigWinKey, setLastBigWinKey] = useState<string | null>(null);
  const slotToneBorder =
    props.gachaTone === "win"
      ? mobileGameTheme.slot.toneBorder.win
      : props.gachaTone === "blocked"
        ? mobileGameTheme.slot.toneBorder.blocked
        : mobileGameTheme.slot.toneBorder.ready;
  const pityState = props.lastDrawPlay?.pity ?? props.drawCatalog?.pity ?? null;
  const pityHeadline = pityState
    ? pityState.active
      ? props.screenCopy.pityBoostActive
      : props.screenCopy.pityPullsToBoost(pityState.drawsUntilBoost ?? 0)
    : props.screenCopy.summarySecondaryLoading;
  const centerSymbols = props.gachaReels.map((reel) => getSymbolById(reel[1]));
  const latestTitle = props.lastDrawPlay
    ? props.lastDrawPlay.results.length <= 1
      ? props.screenCopy.latestSinglePull
      : props.screenCopy.latestBatchPull(props.lastDrawPlay.count)
    : props.screenCopy.latestSinglePull;
  const latestSubtitle = props.lastDrawPlay
    ? `${props.screenCopy.rewardLabel} ${props.formatAmount(props.lastDrawPlay.totalReward)} | ${props.screenCopy.summaryBalance} ${props.formatAmount(props.lastDrawPlay.endingBalance)}`
    : props.screenCopy.noPullYet;
  const featuredSubtitle = props.drawCatalog
    ? props.screenCopy.summarySecondaryValue(props.featuredPrizes.length)
    : props.screenCopy.summarySecondaryLoading;
  const drawCost = props.drawCatalog?.drawCost ?? "0.00";
  const drawEnabled = Boolean(props.drawCatalog?.drawEnabled) && props.emailVerified;
  const drawBusy =
    props.submitting ||
    props.loadingDrawCatalog ||
    props.playingDrawCount !== null ||
    props.playingQuickEight;
  const singleDrawDisabled = drawBusy || !drawEnabled;
  const batchDrawDisabled =
    drawBusy || !drawEnabled || props.multiDrawCount <= 1;
  const refreshDisabled =
    props.loadingDrawCatalog ||
    props.playingDrawCount !== null ||
    props.submitting;
  const showSlotLanding =
    Boolean(props.drawCatalog) && !props.lastDrawPlay && !props.gachaAnimating;
  const landingPrize =
    props.featuredPrizes[0] ?? props.drawCatalog?.prizes[0] ?? null;
  const landingModeLabel = props.drawCatalog?.playMode
    ? props.playModeCopy.modes[props.drawCatalog.playMode.type]
    : props.playModeCopy.modes.standard;
  const stageHintText = showSlotLanding
    ? props.screenCopy.slotToneReady
    : props.gachaAnimating
      ? props.screenCopy.slotHintAnimating
      : props.screenCopy.slotHintSettled;
  const highlightResult = props.lastDrawPlay
    ? getHighlightDrawResult(props.lastDrawPlay.results)
    : null;
  const bigWinPrize =
    props.highlightPrize &&
    (props.highlightPrize.displayRarity === "epic" ||
      props.highlightPrize.displayRarity === "legendary")
      ? props.highlightPrize
      : null;
  const bigWinKey =
    bigWinPrize && highlightResult ? `${highlightResult.id}` : null;
  const bigWinTone = bigWinPrize
    ? props.drawRarityTones[bigWinPrize.displayRarity]
    : null;
  const revealStatus = highlightResult?.status ?? "miss";
  const revealProtected =
    revealStatus === "out_of_stock" ||
    revealStatus === "budget_exhausted" ||
    revealStatus === "payout_limited";
  const revealTone = props.highlightPrize
    ? props.drawRarityTones[props.highlightPrize.displayRarity]
    : revealProtected
      ? {
          backgroundColor: "#301519",
          borderColor: palette.border,
          tintColor: palette.danger,
        }
      : {
          backgroundColor: "#171f31",
          borderColor: palette.border,
          tintColor: palette.warning,
        };
  const revealTitle = props.highlightPrize
    ? props.screenCopy.revealWinTitle(
        props.drawRarityLabels[props.highlightPrize.displayRarity],
      )
    : revealProtected
      ? props.screenCopy.revealProtectedTitle
      : props.screenCopy.revealMissTitle;
  const revealBody = props.highlightPrize
    ? props.screenCopy.revealWinBody(props.highlightPrize.name)
    : revealProtected
      ? props.screenCopy.revealProtectedBody
      : props.screenCopy.revealMissBody;
  const revealBadgeLabel = props.highlightPrize
    ? props.drawRarityLabels[props.highlightPrize.displayRarity]
    : highlightResult
      ? props.drawStatusLabels[highlightResult.status]
      : props.drawStatusLabels.miss;
  const revealTopHitReward = props.highlightPrize
    ? props.formatAmount(props.highlightPrize.rewardAmount)
    : props.formatAmount(props.lastDrawPlay?.totalReward ?? "0.00");
  const revealReplayCount = props.multiDrawCount > 1 ? props.multiDrawCount : 1;
  const revealReplayLabel =
    revealReplayCount > 1
      ? props.screenCopy.revealReplayMany(revealReplayCount)
      : props.screenCopy.revealReplaySingle;
  const revealReplayDisabled = batchDrawDisabled;
  const activeEpoch =
    props.lastDrawPlay?.results[0]?.fairness?.epoch ??
    props.drawCatalog?.fairness.epoch ??
    null;

  useEffect(() => {
    if (!bigWinKey || bigWinKey === lastBigWinKey) {
      return;
    }

    setBigWinOpen(true);
    setLastBigWinKey(bigWinKey);
  }, [bigWinKey, lastBigWinKey]);

  return (
    <>
      <Modal
        visible={bigWinOpen && Boolean(bigWinPrize) && Boolean(bigWinTone)}
        transparent
        animationType="fade"
        onRequestClose={() => setBigWinOpen(false)}
      >
        <View style={styles.bigWinOverlay}>
          <Pressable
            style={styles.bigWinBackdrop}
            onPress={() => setBigWinOpen(false)}
          />
          {bigWinPrize && bigWinTone ? (
            <View style={styles.bigWinCard}>
              <View
                style={[
                  styles.bigWinBurst,
                  { backgroundColor: bigWinTone.tintColor },
                ]}
              />
              <View
                style={[
                  styles.bigWinBurstEcho,
                  {
                    borderColor: bigWinTone.tintColor,
                    backgroundColor: `${bigWinTone.tintColor}22`,
                  },
                ]}
              />
              <View style={styles.bigWinHeader}>
                <View
                  style={[
                    styles.bigWinRarityBadge,
                    { backgroundColor: bigWinTone.tintColor },
                  ]}
                >
                  <Text style={styles.bigWinRarityBadgeText}>
                    {props.drawRarityLabels[bigWinPrize.displayRarity]}
                  </Text>
                </View>
                <Text style={styles.bigWinTitle}>
                  {props.screenCopy.bigWinTitle}
                </Text>
                <Text style={styles.bigWinBody}>
                  {props.screenCopy.bigWinBody(bigWinPrize.name)}
                </Text>
              </View>

              <View style={styles.bigWinRewardPanel}>
                <Text style={styles.bigWinRewardLabel}>
                  {props.screenCopy.bigWinRewardLabel}
                </Text>
                <Text style={styles.bigWinRewardValue}>
                  {props.formatAmount(props.lastDrawPlay?.totalReward ?? "0.00")}
                </Text>
                <Text style={styles.bigWinRewardMeta}>
                  {props.screenCopy.highlight} {bigWinPrize.name}
                </Text>
              </View>

              <View style={styles.bigWinActionStack}>
                <ActionButton
                  label={props.screenCopy.bigWinPrimaryAction}
                  onPress={() => {
                    setBigWinOpen(false);
                    props.onOpenRoute("wallet");
                  }}
                  fullWidth
                />
                <ActionButton
                  label={props.screenCopy.bigWinSecondaryAction}
                  onPress={() => {
                    setBigWinOpen(false);
                    props.onPlayDraw(1);
                  }}
                  variant="gold"
                  disabled={singleDrawDisabled}
                  fullWidth
                />
                <TextLink
                  label={props.screenCopy.bigWinDismissAction}
                  onPress={() => setBigWinOpen(false)}
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <SectionCard title={props.screenCopy.routeTitle}>
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
            <Text style={props.styles.routeSummaryValue}>{featuredSubtitle}</Text>
          </View>
        </View>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard title={props.screenCopy.sectionTitle}>
        <PlayModeSelector
          copy={props.playModeCopy}
          gameKey="draw"
          snapshot={props.drawCatalog?.playMode ?? null}
          disabled={
            props.submitting ||
            props.loadingDrawCatalog ||
            props.updatingDrawPlayMode
          }
          onSelect={props.onChangeDrawPlayMode}
        />

        <View style={styles.streakBanner}>
          <View style={styles.streakCopy}>
            <Text style={styles.streakLabel}>{props.screenCopy.metaPity}</Text>
            <Text style={styles.streakValue}>
              {pityState ? `${pityState.currentStreak}` : "0"}
            </Text>
            <Text style={styles.streakMeta}>{pityHeadline}</Text>
          </View>
          <View style={styles.streakRewardCard}>
            <Text style={styles.streakRewardText}>
              {pityState?.active
                ? props.screenCopy.pityBoostActive
                : props.screenCopy.pityPullsToBoost(
                    pityState?.drawsUntilBoost ?? 0,
                  )}
            </Text>
          </View>
        </View>

        {showSlotLanding ? (
          <View style={styles.slotLandingShell}>
            <View style={styles.slotLandingBanner}>
              <Text style={styles.slotLandingBannerLabel}>
                {props.screenCopy.slotLandingBannerLabel}
              </Text>
              <Text style={styles.slotLandingBannerValue}>
                {props.formatAmount(landingPrize?.rewardAmount ?? "0.00")}
              </Text>
              <View style={styles.slotLandingBannerBadge}>
                <Text style={styles.slotLandingBannerBadgeText}>
                  {landingPrize
                    ? props.drawRarityLabels[landingPrize.displayRarity]
                    : props.screenCopy.summarySecondaryLoading}
                </Text>
              </View>
            </View>

            <View style={styles.slotLandingCabinet}>
              <View style={styles.slotLandingMarquee}>
                <Text style={styles.slotLandingMarqueeText}>
                  {props.screenCopy.slotLandingMarquee}
                </Text>
              </View>

              <Text style={styles.slotLandingTitle}>
                {props.screenCopy.slotLandingTitle}
              </Text>
              <Text style={styles.slotLandingBody}>
                {props.screenCopy.slotLandingBody}
              </Text>

              <View style={styles.slotLandingReelRow}>
                {centerSymbols.map((symbol, index) => (
                  <View
                    key={`landing-symbol-${index}`}
                    style={styles.slotLandingReel}
                  >
                    <View
                      style={[
                        styles.slotLandingSymbolPlate,
                        {
                          backgroundColor: symbol.backgroundColor,
                          borderColor: symbol.borderColor,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotLandingSymbolGlyph,
                          { color: symbol.tintColor },
                        ]}
                      >
                        {symbol.glyph}
                      </Text>
                    </View>
                    <Text style={styles.slotLandingSymbolLabel}>
                      {symbol.shortLabel}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.slotLandingMetricRow}>
                <View
                  style={[
                    styles.slotLandingMetricCard,
                    styles.slotLandingMetricCardPaper,
                  ]}
                >
                  <Text style={styles.slotLandingMetricLabel}>
                    {props.screenCopy.metaCostPerPull}
                  </Text>
                  <Text style={styles.slotLandingMetricValue}>
                    {props.formatAmount(drawCost)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.slotLandingMetricCard,
                    styles.slotLandingMetricCardGold,
                  ]}
                >
                  <Text style={styles.slotLandingMetricLabel}>
                    {props.screenCopy.slotLandingFeaturedLabel}
                  </Text>
                  <Text style={styles.slotLandingMetricValue}>
                    {props.featuredPrizes.length}
                  </Text>
                </View>
                <View
                  style={[
                    styles.slotLandingMetricCard,
                    styles.slotLandingMetricCardBlue,
                  ]}
                >
                  <Text style={styles.slotLandingMetricLabel}>
                    {props.screenCopy.slotLandingBatchLabel}
                  </Text>
                  <Text style={styles.slotLandingMetricValue}>
                    {props.multiDrawCount}
                  </Text>
                </View>
              </View>

              <View style={styles.slotLandingModeCard}>
                <Text style={styles.slotLandingModeLabel}>
                  {props.screenCopy.slotLandingModeLabel}
                </Text>
                <Text style={styles.slotLandingModeValue}>{landingModeLabel}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.capsuleCard,
              {
                borderColor: slotToneBorder,
                backgroundColor:
                  props.gachaTone === "win"
                    ? "#2b220f"
                    : props.gachaTone === "blocked"
                      ? "#34181b"
                      : palette.panel,
              },
            ]}
          >
            <View style={styles.capsuleHeader}>
              <Text style={styles.capsuleTitle}>
                {props.screenCopy.slotRevealTitle}
              </Text>
              <View style={styles.costPill}>
                <Text style={styles.costPillText}>
                  {props.screenCopy.costPillLabel} {props.formatAmount(drawCost)}
                </Text>
              </View>
            </View>

            <View style={styles.capsuleStage}>
              <View style={styles.capsuleStageHalo} />
              <View
                style={[
                  styles.capsuleOrb,
                  styles.capsuleOrbLeft,
                  {
                    backgroundColor: centerSymbols[0].backgroundColor,
                    borderColor: centerSymbols[0].borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.capsuleOrbGlyph,
                    { color: centerSymbols[0].tintColor },
                  ]}
                >
                  {centerSymbols[0].glyph}
                </Text>
              </View>
              <View
                style={[
                  styles.capsuleOrb,
                  styles.capsuleOrbCenter,
                  {
                    backgroundColor: centerSymbols[1].backgroundColor,
                    borderColor: centerSymbols[1].borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.capsuleOrbGlyphCenter,
                    { color: centerSymbols[1].tintColor },
                  ]}
                >
                  {centerSymbols[1].glyph}
                </Text>
              </View>
              <View
                style={[
                  styles.capsuleOrb,
                  styles.capsuleOrbRight,
                  {
                    backgroundColor: centerSymbols[2].backgroundColor,
                    borderColor: centerSymbols[2].borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.capsuleOrbGlyph,
                    { color: centerSymbols[2].tintColor },
                  ]}
                >
                  {centerSymbols[2].glyph}
                </Text>
              </View>
            </View>

            <View style={styles.reelPreviewRow}>
              {props.gachaReels.map((reel, reelIndex) => (
                <View
                  key={`reel-${reelIndex}`}
                  style={[
                    styles.reelPreview,
                    reelIndex < props.gachaLockedReels
                      ? styles.reelPreviewLocked
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
                          styles.reelCell,
                          {
                            backgroundColor: symbol.backgroundColor,
                            borderColor: symbol.borderColor,
                          },
                          centerCell
                            ? styles.reelCellCenter
                            : styles.reelCellSide,
                        ]}
                      >
                        <Text
                          style={[
                            styles.reelCellGlyph,
                            { color: symbol.tintColor },
                          ]}
                        >
                          {symbol.glyph}
                        </Text>
                        <Text
                          style={[
                            styles.reelCellLabel,
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
          </View>
        )}

        <View style={styles.stageStatusGrid}>
          <View style={[styles.stageStatusCard, styles.stageStatusCardPaper]}>
            <Text style={styles.stageStatusLabel}>
              {props.screenCopy.slotLandingModeLabel}
            </Text>
            <Text style={styles.stageStatusValue}>{landingModeLabel}</Text>
          </View>
          <View
            style={[
              styles.stageStatusCard,
              props.gachaAnimating
                ? styles.stageStatusCardBlue
                : styles.stageStatusCardGold,
            ]}
          >
            <Text style={styles.stageStatusLabel}>
              {props.screenCopy.slotLandingBatchLabel}
            </Text>
            <Text style={styles.stageStatusValue}>{props.multiDrawCount}</Text>
          </View>
          <View style={[styles.stageStatusCard, styles.stageStatusCardPeach]}>
            <Text style={styles.stageStatusLabel}>
              {props.screenCopy.epochLabel}
            </Text>
            <Text style={styles.stageStatusValue}>
              {activeEpoch === null ? "--" : activeEpoch}
            </Text>
          </View>
        </View>

        <View style={styles.stageActionStack}>
          <ActionButton
            label={
              props.playingDrawCount === 1
                ? props.screenCopy.pulling
                : props.screenCopy.pullOnce
            }
            onPress={() => props.onPlayDraw(1)}
            disabled={singleDrawDisabled}
            fullWidth
          />
          <View style={styles.stageActionRow}>
            <View style={styles.stageActionCell}>
              <ActionButton
                label={
                  props.playingDrawCount === props.multiDrawCount
                    ? props.screenCopy.pulling
                    : props.screenCopy.pullMany(props.multiDrawCount)
                }
                onPress={() => props.onPlayDraw(props.multiDrawCount)}
                disabled={batchDrawDisabled}
                variant="gold"
                fullWidth
              />
            </View>
            <View style={styles.stageActionCell}>
              <ActionButton
                label={
                  props.loadingDrawCatalog
                    ? props.fairnessRefreshingLabel
                    : props.screenCopy.refreshBanner
                }
                onPress={props.onRefreshDrawCatalog}
                disabled={refreshDisabled}
                variant="secondary"
                fullWidth
              />
            </View>
          </View>
          <View style={styles.stageHintCard}>
            <Text style={styles.stageHintText}>{stageHintText}</Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={[styles.metaCard, styles.metaCardWarm]}>
            <Text style={styles.metaCardLabel}>
              {props.screenCopy.metaCostPerPull}
            </Text>
            <Text style={styles.metaCardValue}>
              {props.formatAmount(drawCost)}
            </Text>
          </View>
          <View style={[styles.metaCard, styles.metaCardBlue]}>
            <Text style={styles.metaCardLabel}>{props.screenCopy.metaPity}</Text>
            <Text style={styles.metaCardValue}>{pityHeadline}</Text>
          </View>
          <View style={[styles.metaCard, styles.metaCardPaper]}>
            <Text style={styles.metaCardLabel}>
              {props.screenCopy.metaFairness}
            </Text>
            <Text style={styles.metaCardValue}>
              {props.drawCatalog
                ? `${props.screenCopy.epochLabel} ${props.drawCatalog.fairness.epoch}`
                : props.screenCopy.summarySecondaryLoading}
            </Text>
            {props.drawCatalog ? (
              <Text style={styles.metaCardHash}>
                {props.shortenCommitHash(props.drawCatalog.fairness.commitHash)}
              </Text>
            ) : null}
          </View>
        </View>

        {!props.drawCatalog?.drawEnabled && props.drawCatalog ? (
          <GameStatusPanel tone="warning">
            {props.screenCopy.disabledBySystem}
          </GameStatusPanel>
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
      </SectionCard>

      <SectionCard title={props.screenCopy.summarySecondary}>
        {props.featuredPrizes.length > 0 ? (
          <View style={styles.featuredGrid}>
            {props.featuredPrizes.map((prize) => {
              const tone = props.drawRarityTones[prize.displayRarity];
              return (
                <View
                  key={prize.id}
                  style={[
                    styles.featuredCard,
                    {
                      backgroundColor: tone.backgroundColor,
                      borderColor: tone.borderColor,
                    },
                  ]}
                >
                  <View style={styles.featuredHeader}>
                    <View
                      style={[
                        styles.rarityBadge,
                        { borderColor: tone.borderColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.rarityBadgeText,
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
                  <Text style={styles.featuredName}>{prize.name}</Text>
                  <Text style={styles.featuredReward}>
                    {props.screenCopy.rewardLabel}{" "}
                    {props.formatAmount(prize.rewardAmount)}
                  </Text>
                  <Text style={styles.featuredStock}>
                    {props.screenCopy.stockLabel} {prize.stock}
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
      </SectionCard>

      <SectionCard title={latestTitle} subtitle={latestSubtitle}>
        {props.lastDrawPlay ? (
          <View style={styles.resultsStack}>
            <View style={styles.latestSummaryGrid}>
              <View style={[styles.latestSummaryCard, styles.latestSummaryCardGold]}>
                <Text style={styles.latestSummaryLabel}>
                  {props.screenCopy.revealOutcomeLabel}
                </Text>
                <Text style={styles.latestSummaryValue}>
                  {props.screenCopy.winCountSummary(props.lastDrawPlay.winCount)}
                </Text>
              </View>
              <View style={[styles.latestSummaryCard, styles.latestSummaryCardWarm]}>
                <Text style={styles.latestSummaryLabel}>
                  {props.screenCopy.rewardLabel}
                </Text>
                <Text style={styles.latestSummaryValue}>
                  {props.formatAmount(props.lastDrawPlay.totalReward)}
                </Text>
              </View>
              <View style={[styles.latestSummaryCard, styles.latestSummaryCardBlue]}>
                <Text style={styles.latestSummaryLabel}>
                  {props.screenCopy.summaryBalance}
                </Text>
                <Text style={styles.latestSummaryValue}>
                  {props.formatAmount(props.lastDrawPlay.endingBalance)}
                </Text>
              </View>
            </View>

            {highlightResult ? (
              <View
                style={[
                  styles.revealCard,
                  {
                    backgroundColor: revealTone.backgroundColor,
                    borderColor: revealTone.borderColor,
                  },
                ]}
              >
                <View style={styles.revealHero}>
                  <View
                    style={[
                      styles.revealBurst,
                      { backgroundColor: revealTone.tintColor },
                    ]}
                  />
                  <View
                    style={[
                      styles.revealBurstEcho,
                      {
                        borderColor: revealTone.tintColor,
                        backgroundColor: `${revealTone.tintColor}22`,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.revealRarityBadge,
                      { backgroundColor: revealTone.tintColor },
                    ]}
                  >
                    <Text style={styles.revealRarityBadgeText}>
                      {revealBadgeLabel}
                    </Text>
                  </View>
                  <Text style={styles.revealKicker}>
                    {props.screenCopy.revealKicker}
                  </Text>
                  <Text style={styles.revealTitle}>{revealTitle}</Text>
                  <Text style={styles.revealBody}>{revealBody}</Text>

                  <View style={styles.revealRewardPanel}>
                    <Text style={styles.revealRewardLabel}>
                      {props.screenCopy.rewardLabel}
                    </Text>
                    <Text style={styles.revealRewardValue}>
                      {props.formatAmount(props.lastDrawPlay.totalReward)}
                    </Text>
                  </View>
                </View>

                <View style={styles.revealBodyPanel}>
                  <View style={styles.revealMetaGrid}>
                    <View style={[styles.revealMetaCard, styles.revealMetaWarm]}>
                      <Text style={styles.revealMetaLabel}>
                        {props.highlightPrize
                          ? props.screenCopy.highlight
                          : props.screenCopy.revealOutcomeLabel}
                      </Text>
                      <Text style={styles.revealMetaValue}>
                        {props.highlightPrize?.name ??
                          props.drawStatusLabels[revealStatus]}
                      </Text>
                      <Text style={styles.revealMetaCaption}>
                        {props.screenCopy.rewardLabel} {revealTopHitReward}
                      </Text>
                    </View>
                    <View style={[styles.revealMetaCard, styles.revealMetaBlue]}>
                      <Text style={styles.revealMetaLabel}>
                        {props.screenCopy.summaryBalance}
                      </Text>
                      <Text style={styles.revealMetaValue}>
                        {props.formatAmount(props.lastDrawPlay.endingBalance)}
                      </Text>
                      <Text style={styles.revealMetaCaption}>
                        {props.screenCopy.revealSettledCount(
                          props.lastDrawPlay.count,
                        )}
                      </Text>
                    </View>
                    <View
                      style={[styles.revealMetaCard, styles.revealMetaPaper]}
                    >
                      <Text style={styles.revealMetaLabel}>
                        {props.screenCopy.epochLabel}
                      </Text>
                      <Text style={styles.revealMetaValue}>
                        {props.lastDrawPlay.results[0]?.fairness?.epoch ??
                          props.drawCatalog?.fairness.epoch ??
                          "--"}
                      </Text>
                      <Text style={styles.revealMetaCaption}>
                        {revealProtected
                          ? props.drawStatusLabels[revealStatus]
                          : props.screenCopy.slotToneSettled}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.revealActionStack}>
                    <ActionButton
                      label={props.screenCopy.revealVerifyAction}
                      onPress={() => props.onOpenRoute("fairness")}
                      variant="secondary"
                      fullWidth
                    />
                    <ActionButton
                      label={
                        props.playingDrawCount === revealReplayCount
                          ? props.screenCopy.pulling
                          : revealReplayLabel
                      }
                      onPress={() => props.onPlayDraw(revealReplayCount)}
                      variant="gold"
                      disabled={revealReplayDisabled}
                      fullWidth
                    />
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.resultGrid}>
              {props.lastDrawPlay.results.map((result) => {
                const tone =
                  props.drawRarityTones[
                    result.prize?.displayRarity ?? "common"
                  ];
                return (
                  <View
                    key={result.id}
                    style={[
                      styles.resultCard,
                      {
                        backgroundColor: tone.backgroundColor,
                        borderColor: tone.borderColor,
                      },
                    ]}
                  >
                    <Text style={styles.resultStatus}>
                      {props.drawStatusLabels[result.status]}
                    </Text>
                    <Text style={styles.resultName}>
                      {result.prize?.name ?? props.screenCopy.noFeaturedReward}
                    </Text>
                    <Text style={styles.resultReward}>
                      {props.screenCopy.rewardLabel}{" "}
                      {props.formatAmount(result.rewardAmount)}
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
