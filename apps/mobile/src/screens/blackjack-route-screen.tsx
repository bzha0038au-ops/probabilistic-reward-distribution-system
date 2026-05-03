import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BLACKJACK_CONFIG } from "@reward/shared-types/blackjack";
import type {
  BlackjackAction,
  BlackjackCardView,
  BlackjackGame,
  BlackjackGameStatus,
  BlackjackOverviewResponse,
} from "@reward/shared-types/blackjack";
import type { PlayModeType } from "@reward/shared-types/play-mode";

import {
  MobileFairnessCompactSummary,
  type MobileFairnessLocale,
} from "../fairness";
import type { PlayModeCopy } from "../ui";
import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import {
  mobileChromeTheme,
  mobileGameTheme,
  mobilePalette as palette,
} from "../theme";
import { ActionButton, PlayModeSelector, SectionCard } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import type { MobileAppRoute, MobileStyles } from "./types";

const blackjackSuitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

type BlackjackRouteScreenProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  verificationCallout: ReactNode;
  screenCopy: MobileRouteScreens["blackjack"];
  balance: string;
  playModeCopy: PlayModeCopy;
  formatAmount: (value: string) => string;
  loadingBlackjack: boolean;
  updatingBlackjackPlayMode: boolean;
  actingBlackjack: BlackjackAction | "start" | null;
  emailVerified: boolean;
  fairnessLocale: MobileFairnessLocale;
  fairnessEyebrow: string;
  blackjackOverview: BlackjackOverviewResponse | null;
  blackjackStakeAmount: string;
  onChangeStakeAmount: (value: string) => void;
  onChangeBlackjackPlayMode: (type: PlayModeType) => void;
  onStartBlackjack: () => void;
  onRefreshBlackjackOverview: () => void;
  onBlackjackAction: (gameId: number, action: BlackjackAction) => void;
  blackjackStatusLabels: Record<BlackjackGameStatus, string>;
};

export function BlackjackRouteScreen(props: BlackjackRouteScreenProps) {
  const activeGames = props.blackjackOverview
    ? props.blackjackOverview.activeGames.length > 0
      ? props.blackjackOverview.activeGames
      : props.blackjackOverview.activeGame
        ? [props.blackjackOverview.activeGame]
        : []
    : [];
  const blackjackConfig = props.blackjackOverview?.config ?? BLACKJACK_CONFIG;
  const effectiveStakePreview = (() => {
    const numericStake = Number(props.blackjackStakeAmount || "0");
    const multiplier = props.blackjackOverview?.playMode.appliedMultiplier ?? 1;
    if (!Number.isFinite(numericStake) || multiplier <= 1) {
      return null;
    }

    return props.formatAmount((numericStake * multiplier).toFixed(2));
  })();

  const getPlayerHandStateLabel = (
    state: BlackjackGame["playerHands"][number]["state"],
  ) => {
    switch (state) {
      case "active":
        return props.screenCopy.activeHand;
      case "waiting":
        return props.screenCopy.waitingHand;
      case "stood":
        return props.screenCopy.stoodHand;
      case "bust":
        return props.screenCopy.bustHand;
      case "win":
        return props.screenCopy.winHand;
      case "lose":
        return props.screenCopy.loseHand;
      default:
        return props.screenCopy.pushHand;
    }
  };

  const formatPlayerTotals = (game: {
    playerTotals?: number[];
    playerTotal: number;
  }) =>
    Array.isArray(game.playerTotals) && game.playerTotals.length > 0
      ? game.playerTotals.join(" / ")
      : String(game.playerTotal);
  const getHandDisplayTotal = (
    hand: Pick<
      BlackjackGame["playerHands"][number],
      "total" | "visibleTotal"
    >,
  ) => hand.total ?? hand.visibleTotal ?? "—";
  const starterStakeDisplay = props.formatAmount(
    props.blackjackStakeAmount || blackjackConfig.minStake,
  );
  const starterPreviewDealer: BlackjackCardView[] = [
    { rank: "10", suit: "hearts", hidden: false },
    { rank: null, suit: null, hidden: true },
  ];
  const starterPreviewHero: BlackjackCardView[] = [
    { rank: "K", suit: "clubs", hidden: false },
    { rank: "A", suit: "diamonds", hidden: false },
  ];
  const getActionButtonLabel = (
    game: BlackjackGame,
    action: BlackjackAction,
  ) => {
    const focusHand =
      game.playerHands.find((hand) => hand.active) ?? game.playerHands[0] ?? null;
    if (props.actingBlackjack === action) {
      return props.screenCopy.settling;
    }

    switch (action) {
      case "hit":
        return focusHand
          ? `${props.screenCopy.hit}\n${props.screenCopy.total} ${getHandDisplayTotal(
              focusHand,
            )}`
          : props.screenCopy.hit;
      case "stand":
        return focusHand
          ? `${props.screenCopy.stand}\n${props.screenCopy.total} ${getHandDisplayTotal(
              focusHand,
            )}`
          : props.screenCopy.stand;
      case "double":
        return `${props.screenCopy.double}\n+${props.formatAmount(game.totalStake)}`;
      default:
        return `${props.screenCopy.split}\n2 ${props.screenCopy.hand}`;
    }
  };
  const getActionVariant = (action: BlackjackAction) => {
    switch (action) {
      case "stand":
        return "secondary" as const;
      case "double":
        return "gold" as const;
      case "split":
        return "secondary" as const;
      default:
        return "primary" as const;
    }
  };

  const renderCard = (
    card: BlackjackCardView,
    index: number,
    size: "default" | "hero" = "default",
  ) => {
    const hidden = card.hidden || !card.rank || !card.suit;
    const suit = card.suit ? blackjackSuitSymbols[card.suit] : "•";

    return (
      <View
        key={`${card.rank ?? "hidden"}-${card.suit ?? "unknown"}-${index}`}
        style={[
          styles.blackjackPlayingCard,
          size === "hero" ? styles.blackjackPlayingCardHero : null,
          hidden ? styles.blackjackPlayingCardHidden : null,
        ]}
      >
        {hidden ? (
          <Text style={styles.blackjackPlayingCardBack}>HIDE</Text>
        ) : (
          <>
            <Text
              style={[
                styles.blackjackPlayingCardLabel,
                size === "hero" ? styles.blackjackPlayingCardLabelHero : null,
                card.suit === "hearts" || card.suit === "diamonds"
                  ? styles.blackjackPlayingCardLabelRed
                  : null,
              ]}
            >
              {card.rank}
            </Text>
            <Text
              style={[
                styles.blackjackPlayingCardSuit,
                size === "hero" ? styles.blackjackPlayingCardSuitHero : null,
                card.suit === "hearts" || card.suit === "diamonds"
                  ? styles.blackjackPlayingCardLabelRed
                  : null,
              ]}
            >
              {suit}
            </Text>
          </>
        )}
      </View>
    );
  };

  const renderDealerHand = (
    hand: BlackjackGame["dealerHand"],
    size: "default" | "hero" = "default",
  ) => (
    <View style={styles.blackjackDealerStage}>
      <View style={styles.blackjackDealerScorePill}>
        <Text style={styles.blackjackDealerScoreText}>
          {props.screenCopy.dealerHand}:{" "}
          {hand.total === null
            ? hand.visibleTotal ?? props.screenCopy.visible
            : hand.total}
        </Text>
      </View>

      <View style={styles.blackjackDealerRow}>
        {hand.cards.map((card, index) => (
          <View
            key={`dealer-card-${index}`}
            style={
              index === 0 ? styles.blackjackTiltLeft : styles.blackjackTiltRight
            }
          >
            {renderCard(card, index, size)}
          </View>
        ))}
      </View>
    </View>
  );

  const getTableSeatLabel = (
    seat: BlackjackGame["table"]["seats"][number],
  ) => {
    const occupant =
      seat.role === "dealer" && seat.participantType === "ai_robot"
        ? props.screenCopy.aiDealer
        : seat.isSelf
          ? props.screenCopy.you
          : props.screenCopy.playerHand;

    return `${occupant} · ${props.screenCopy.seat} ${seat.seatIndex + 1}`;
  };

  const renderPlayerHand = (hand: BlackjackGame["playerHands"][number]) => (
    <View
      key={`player-hand-${hand.index}`}
      style={[
        styles.blackjackHandCard,
        hand.active ? styles.blackjackHandCardActive : null,
      ]}
    >
      <View style={styles.blackjackHandHeader}>
        <View style={styles.blackjackHandHeaderCopy}>
          <Text style={styles.blackjackHandTitle}>
            {props.screenCopy.hand} {hand.index + 1}
          </Text>
          <View style={props.styles.badgeRow}>
            <View
              style={[
                props.styles.badge,
                hand.active
                  ? props.styles.badgeSuccess
                  : hand.state === "win"
                    ? props.styles.badgeSuccess
                    : hand.state === "bust" || hand.state === "lose"
                      ? props.styles.badgeWarning
                      : props.styles.badgeMuted,
              ]}
            >
              <Text style={props.styles.badgeText}>
                {getPlayerHandStateLabel(hand.state)}
              </Text>
            </View>
            <View style={[props.styles.badge, props.styles.badgeMuted]}>
              <Text style={props.styles.badgeText}>
                {props.screenCopy.stakeLabel}{" "}
                {props.formatAmount(hand.stakeAmount)}
              </Text>
            </View>
          </View>
        </View>
        <View style={[props.styles.badge, props.styles.badgeMuted]}>
          <Text style={props.styles.badgeText}>
            {props.screenCopy.total} {getHandDisplayTotal(hand)}
          </Text>
        </View>
      </View>
      <View style={styles.blackjackHeroCardRow}>
        {hand.cards.map((card, index) => (
          <View
            key={`player-hand-card-${hand.index}-${index}`}
            style={
              index === 0 ? styles.blackjackHeroTiltLeft : styles.blackjackHeroTiltRight
            }
          >
            {renderCard(card, index, "hero")}
          </View>
        ))}
      </View>
    </View>
  );

  const renderRuleCard = (label: string, value: string) => (
    <View key={label} style={styles.ruleCard}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text style={styles.ruleValue}>{value}</Text>
    </View>
  );

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
        {props.verificationCallout}
      </SectionCard>

      <PlayModeSelector
        copy={props.playModeCopy}
        gameKey="blackjack"
        snapshot={props.blackjackOverview?.playMode ?? null}
        disabled={
          props.loadingBlackjack ||
          props.updatingBlackjackPlayMode ||
          activeGames.length > 0
        }
        onSelect={props.onChangeBlackjackPlayMode}
      />

      <SectionCard title={props.screenCopy.sectionTitle}>
        <View style={styles.ruleGrid}>
          {renderRuleCard(
            props.screenCopy.metaStakeRange,
            `${props.formatAmount(blackjackConfig.minStake)} - ${props.formatAmount(
              blackjackConfig.maxStake,
            )}`,
          )}
          {renderRuleCard(
            props.screenCopy.metaNaturalPayout,
            `${blackjackConfig.naturalPayoutMultiplier}x`,
          )}
          {renderRuleCard(
            props.screenCopy.metaDealer,
            blackjackConfig.dealerHitsSoft17
              ? props.screenCopy.dealerHitsSoft17
              : props.screenCopy.dealerStandAll17,
          )}
          {renderRuleCard(
            props.screenCopy.metaDouble,
            blackjackConfig.doubleDownAllowed
              ? props.screenCopy.doubleEnabled
              : props.screenCopy.doubleDisabled,
          )}
          {renderRuleCard(
            props.screenCopy.metaSplitAces,
            blackjackConfig.splitAcesAllowed
              ? props.screenCopy.doubleEnabled
              : props.screenCopy.doubleDisabled,
          )}
          {renderRuleCard(
            props.screenCopy.metaResplit,
            blackjackConfig.resplitAllowed
              ? props.screenCopy.doubleEnabled
              : props.screenCopy.doubleDisabled,
          )}
        </View>

        <MobileFairnessCompactSummary
          locale={props.fairnessLocale}
          fairness={activeGames[0]?.fairness ?? props.blackjackOverview?.fairness}
          clientNonce={activeGames[0]?.fairness.clientNonce ?? null}
          eyebrow={props.fairnessEyebrow}
        />

        {activeGames.length === 0 ? (
          <View style={styles.blackjackStarterCard}>
            <View style={styles.blackjackStarterSummaryRow}>
              <View style={styles.blackjackStarterSummaryCard}>
                <Text style={styles.blackjackStarterSummaryLabel}>
                  {props.screenCopy.summaryBalance}
                </Text>
                <Text style={styles.blackjackStarterSummaryValue}>
                  {props.formatAmount(props.balance)}
                </Text>
              </View>
              <View
                style={[
                  styles.blackjackStarterSummaryCard,
                  styles.blackjackStarterSummaryCardGold,
                ]}
              >
                <Text style={styles.blackjackStarterSummaryLabel}>
                  {props.screenCopy.currentBet}
                </Text>
                <Text style={styles.blackjackStarterSummaryValue}>
                  {starterStakeDisplay}
                </Text>
              </View>
            </View>

            <View style={styles.blackjackStarterTable}>
              <View style={styles.blackjackStarterFairnessPill}>
                <Text style={styles.blackjackStarterFairnessLabel}>
                  {props.screenCopy.summaryFairnessEpoch}
                </Text>
                <Text style={styles.blackjackStarterFairnessValue}>
                  {props.blackjackOverview?.fairness.epoch ??
                    props.screenCopy.summaryLoading}
                </Text>
              </View>

              {renderDealerHand(
                {
                  blackjack: null,
                  bust: null,
                  cards: starterPreviewDealer,
                  soft: null,
                  total: null,
                  visibleTotal: 10,
                },
                "hero",
              )}

              <View style={styles.blackjackBetStack}>
                <View style={styles.blackjackBetChipOuter}>
                  <View style={styles.blackjackBetChipInner}>
                    <Text style={styles.blackjackBetChipValue}>
                      {starterStakeDisplay}
                    </Text>
                  </View>
                </View>
                <View style={styles.blackjackBetLabelPill}>
                  <Text style={styles.blackjackBetLabelText}>
                    {props.screenCopy.currentBet}
                  </Text>
                </View>
              </View>

              <View style={styles.blackjackHeroPreviewBlock}>
                <View style={styles.blackjackHeroCardRow}>
                  {starterPreviewHero.map((card, index) => (
                    <View
                      key={`starter-hero-card-${index}`}
                      style={
                        index === 0
                          ? styles.blackjackHeroTiltLeft
                          : styles.blackjackHeroTiltRight
                      }
                    >
                      {renderCard(card, index, "hero")}
                    </View>
                  ))}
                </View>
                <View style={styles.blackjackHeroTotalPill}>
                  <Text style={styles.blackjackHeroTotalText}>
                    {props.screenCopy.you}: 21
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.blackjackStarterControlCard}>
              <View style={styles.blackjackStarterHeader}>
                <Text style={styles.blackjackStarterTitle}>
                  {props.screenCopy.startHand}
                </Text>
                <View style={[props.styles.badge, props.styles.badgeMuted]}>
                  <Text style={props.styles.badgeText}>
                    {props.screenCopy.aiDealer}
                  </Text>
                </View>
              </View>

              <View style={props.styles.field}>
                <Text style={props.styles.fieldLabel}>
                  {props.screenCopy.stakeAmount}
                </Text>
                <TextInput
                  value={props.blackjackStakeAmount}
                  onChangeText={props.onChangeStakeAmount}
                  style={props.styles.input}
                  placeholder={blackjackConfig.minStake}
                  placeholderTextColor={palette.textMuted}
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.blackjackStakeHint}>
                  {props.screenCopy.stakeHint(
                    props.formatAmount(blackjackConfig.minStake),
                    props.formatAmount(blackjackConfig.maxStake),
                  )}
                </Text>
                {effectiveStakePreview ? (
                  <Text style={props.styles.gachaHint}>
                    {props.screenCopy.effectiveStakePreview(effectiveStakePreview)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.blackjackStarterActions}>
                <ActionButton
                  label={
                    props.actingBlackjack === "start"
                      ? props.screenCopy.dealing
                      : props.screenCopy.startHand
                  }
                  onPress={props.onStartBlackjack}
                  disabled={
                    props.actingBlackjack !== null ||
                    props.loadingBlackjack ||
                    !props.emailVerified
                  }
                  fullWidth
                />
                <ActionButton
                  label={
                    props.loadingBlackjack
                      ? props.screenCopy.refreshingHand
                      : props.screenCopy.refreshHand
                  }
                  onPress={props.onRefreshBlackjackOverview}
                  disabled={
                    props.actingBlackjack !== null || props.loadingBlackjack
                  }
                  variant="secondary"
                  fullWidth
                />
              </View>

              <Text style={props.styles.gachaHint}>
                {props.screenCopy.noActiveHand}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.blackjackRouteStack}>
            {activeGames.map((game) => (
              <View key={game.id} style={styles.blackjackGameStack}>
                <View style={styles.blackjackGameBadgeRow}>
                  {game.linkedGroup ? (
                    <View style={[props.styles.badge, props.styles.badgeMuted]}>
                      <Text style={props.styles.badgeText}>
                        {props.screenCopy.hand} {game.linkedGroup.executionIndex}/
                        {game.linkedGroup.executionCount}
                      </Text>
                    </View>
                  ) : null}
                  <View style={[props.styles.badge, props.styles.badgeSuccess]}>
                    <Text style={props.styles.badgeText}>
                      {props.blackjackStatusLabels[game.status]}
                    </Text>
                  </View>
                  <View style={[props.styles.badge, props.styles.badgeMuted]}>
                    <Text style={props.styles.badgeText}>
                      {props.screenCopy.stakeLabel}{" "}
                      {props.formatAmount(game.totalStake)}
                    </Text>
                  </View>
                  <View style={[props.styles.badge, props.styles.badgeMuted]}>
                    <Text style={props.styles.badgeText}>
                      {props.screenCopy.payoutLabel}{" "}
                      {props.formatAmount(game.payoutAmount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.blackjackTableCard}>
                  <View style={styles.blackjackStageChipRow}>
                    <View style={[styles.blackjackStageChip, styles.blackjackStageChipGold]}>
                      <Text style={styles.blackjackStageChipText}>
                        {props.screenCopy.tableId} {game.table.tableId}
                      </Text>
                    </View>
                    <View style={styles.blackjackStageChip}>
                      <Text style={styles.blackjackStageChipText}>
                        {props.screenCopy.metaDealer}:{" "}
                        {blackjackConfig.dealerHitsSoft17
                          ? props.screenCopy.dealerHitsSoft17
                          : props.screenCopy.dealerStandAll17}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.blackjackTableStage}>
                    <View style={styles.blackjackTableInner} />
                    {renderDealerHand(game.dealerHand, "hero")}

                    <View style={styles.blackjackBetStack}>
                      <View style={styles.blackjackBetChipOuter}>
                        <View style={styles.blackjackBetChipInner}>
                          <Text style={styles.blackjackBetChipValue}>
                            {props.formatAmount(game.totalStake)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.blackjackBetLabelPill}>
                        <Text style={styles.blackjackBetLabelText}>
                          {props.screenCopy.currentBet}
                        </Text>
                      </View>
                    </View>

                    {(() => {
                      const focusHand =
                        game.playerHands.find((hand) => hand.active) ??
                        game.playerHands[0] ??
                        null;
                      return focusHand ? (
                        <View style={styles.blackjackHeroPreviewBlock}>
                          <View style={styles.blackjackHeroCardRow}>
                            {focusHand.cards.map((card, index) => (
                              <View
                                key={`focus-hand-card-${game.id}-${focusHand.index}-${index}`}
                                style={
                                  index === 0
                                    ? styles.blackjackHeroTiltLeft
                                    : styles.blackjackHeroTiltRight
                                }
                              >
                                {renderCard(card, index, "hero")}
                              </View>
                            ))}
                          </View>
                          <View style={styles.blackjackHeroTotalPill}>
                            <Text style={styles.blackjackHeroTotalText}>
                              {props.screenCopy.you}: {getHandDisplayTotal(focusHand)}
                            </Text>
                          </View>
                        </View>
                      ) : null;
                    })()}
                  </View>

                  <View style={styles.blackjackSeatChipRow}>
                    {game.table.seats.map((seat) => (
                      <View
                        key={`${game.table.tableId}-${seat.participantId}-${seat.seatIndex}`}
                        style={[
                          styles.blackjackSeatChip,
                          seat.role === "dealer"
                            ? styles.blackjackSeatChipDealer
                            : seat.isSelf
                              ? styles.blackjackSeatChipHero
                              : null,
                        ]}
                      >
                        <Text style={styles.blackjackSeatChipText}>
                          {getTableSeatLabel(seat)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {game.playerHands.length > 1 ? (
                    <View style={styles.blackjackHandsGrid}>
                      {game.playerHands.map((hand) => renderPlayerHand(hand))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.blackjackActionPanel}>
                  <View style={styles.blackjackActionSummaryRow}>
                    <View style={styles.blackjackActionSummaryCard}>
                      <Text style={styles.blackjackActionSummaryLabel}>
                        {props.screenCopy.summaryBalance}
                      </Text>
                      <Text style={styles.blackjackActionSummaryValue}>
                        {props.formatAmount(props.balance)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.blackjackActionSummaryCard,
                        styles.blackjackActionSummaryCardGold,
                      ]}
                    >
                      <Text style={styles.blackjackActionSummaryLabel}>
                        {props.screenCopy.currentBet}
                      </Text>
                      <Text
                        style={[
                          styles.blackjackActionSummaryValue,
                          styles.blackjackActionSummaryValueGold,
                        ]}
                      >
                        {props.formatAmount(game.totalStake)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.blackjackActionGrid}>
                    {game.availableActions.map((action) => (
                      <View
                        key={`${game.id}-${action}`}
                        style={[
                          styles.blackjackActionCell,
                          action === "double" || action === "split"
                            ? styles.blackjackActionCellWide
                            : null,
                        ]}
                      >
                        <ActionButton
                          label={getActionButtonLabel(game, action)}
                          onPress={() => props.onBlackjackAction(game.id, action)}
                          disabled={
                            props.actingBlackjack !== null ||
                            props.loadingBlackjack ||
                            !props.emailVerified
                          }
                          variant={getActionVariant(action)}
                          fullWidth
                        />
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {props.loadingBlackjack ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>
              {props.screenCopy.loadingState}
            </Text>
          </View>
        ) : null}

        <View style={styles.blackjackHistoryList}>
          <Text style={styles.blackjackHistoryTitle}>
            {props.screenCopy.recentHands}
          </Text>
          {props.blackjackOverview?.recentGames.length ? (
            props.blackjackOverview.recentGames.map((game) => (
              <View key={game.id} style={styles.blackjackHistoryCard}>
                <View style={props.styles.badgeRow}>
                  <View style={[props.styles.badge, props.styles.badgeMuted]}>
                    <Text style={props.styles.badgeText}>
                      {props.blackjackStatusLabels[game.status]}
                    </Text>
                  </View>
                  <View style={[props.styles.badge, props.styles.badgeMuted]}>
                    <Text style={props.styles.badgeText}>
                      {props.screenCopy.stakeLabel}{" "}
                      {props.formatAmount(game.totalStake)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.blackjackHistoryBody}>
                  P {formatPlayerTotals(game)} / D {game.dealerTotal}
                </Text>
                <Text style={styles.blackjackHistoryBody}>
                  {props.screenCopy.payoutLabel}{" "}
                  {props.formatAmount(game.payoutAmount)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={props.styles.gachaHint}>
              {props.screenCopy.noRecentHands}
            </Text>
          )}
        </View>
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  blackjackActionCell: {
    width: "47%",
  },
  blackjackActionCellWide: {
    width: "100%",
  },
  blackjackActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  blackjackActionPanel: {
    gap: 18,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    padding: 18,
    ...mobileChromeTheme.cardShadow,
  },
  blackjackActionSummaryCard: {
    flex: 1,
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff8ef",
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackActionSummaryCardGold: {
    backgroundColor: "#ffe58b",
  },
  blackjackActionSummaryLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  blackjackActionSummaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  blackjackActionSummaryValue: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "800",
  },
  blackjackActionSummaryValueGold: {
    color: palette.warning,
  },
  blackjackCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  blackjackDealerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  blackjackDealerScorePill: {
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#efebea",
    paddingHorizontal: 18,
    paddingVertical: 10,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackDealerScoreText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  blackjackDealerStage: {
    alignItems: "center",
    gap: 16,
  },
  blackjackGameBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  blackjackGameStack: {
    gap: 16,
  },
  blackjackHandCard: {
    gap: 12,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobileGameTheme.blackjack.hand.borderColor,
    backgroundColor: "#fffdfb",
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackHandCardActive: {
    backgroundColor: "#ffe58b",
  },
  blackjackHandHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  blackjackHandHeaderCopy: {
    flex: 1,
    gap: 8,
  },
  blackjackHandTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  blackjackHandsGrid: {
    gap: 12,
  },
  blackjackHeroPreviewBlock: {
    alignItems: "center",
    gap: 12,
  },
  blackjackHeroCardRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  blackjackHeroTiltLeft: {
    marginRight: -12,
    transform: [{ rotate: "-7deg" }],
  },
  blackjackHeroTiltRight: {
    transform: [{ rotate: "7deg" }],
  },
  blackjackHeroTotalPill: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#ffe58b",
    paddingHorizontal: 22,
    paddingVertical: 10,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackHeroTotalText: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  blackjackHistoryBody: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  blackjackHistoryCard: {
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff8ef",
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackHistoryList: {
    gap: 10,
  },
  blackjackHistoryTitle: {
    color: palette.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  blackjackPlayingCard: {
    width: 62,
    height: 92,
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: mobileGameTheme.blackjack.card.backgroundColor,
    paddingHorizontal: 10,
    paddingVertical: 9,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackPlayingCardBack: {
    color: palette.accentMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  blackjackPlayingCardHero: {
    width: 84,
    height: 122,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...mobileChromeTheme.cardShadow,
  },
  blackjackPlayingCardHidden: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff0e5",
  },
  blackjackPlayingCardLabel: {
    color: mobileGameTheme.blackjack.card.inkColor,
    fontSize: 15,
    fontWeight: "800",
  },
  blackjackPlayingCardLabelHero: {
    fontSize: 21,
  },
  blackjackPlayingCardLabelRed: {
    color: mobileGameTheme.blackjack.card.dangerInkColor,
  },
  blackjackPlayingCardSuit: {
    alignSelf: "flex-end",
    color: mobileGameTheme.blackjack.card.inkColor,
    fontSize: 20,
    fontWeight: "700",
  },
  blackjackPlayingCardSuitHero: {
    fontSize: 30,
  },
  blackjackRouteStack: {
    gap: 16,
  },
  blackjackSeatChip: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackSeatChipDealer: {
    backgroundColor: "#dfe1ff",
  },
  blackjackSeatChipHero: {
    backgroundColor: "#ffe58b",
  },
  blackjackSeatChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  blackjackSeatChipText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  blackjackStageChip: {
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackStageChipGold: {
    backgroundColor: "#ffe58b",
  },
  blackjackStageChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  blackjackStageChipText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "800",
  },
  blackjackStageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  blackjackStageTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "800",
  },
  blackjackStarterActions: {
    gap: 10,
  },
  blackjackStarterCard: {
    gap: 16,
  },
  blackjackStarterControlCard: {
    gap: 14,
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    padding: 16,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackStarterFairnessLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  blackjackStarterFairnessPill: {
    position: "absolute",
    top: -16,
    right: 12,
    gap: 2,
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#ffe58b",
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackStarterFairnessValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
  },
  blackjackStarterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  blackjackStarterSummaryCard: {
    flex: 1,
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  blackjackStarterSummaryCardGold: {
    backgroundColor: "#ffe58b",
  },
  blackjackStarterSummaryLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  blackjackStarterSummaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  blackjackStarterSummaryValue: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "800",
  },
  blackjackStarterTable: {
    gap: 20,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: palette.border,
    backgroundColor: "#fcf9f8",
    minHeight: 620,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 20,
    ...mobileChromeTheme.cardShadow,
  },
  blackjackStarterTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  blackjackStakeHint: {
    borderRadius: 14,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff8ef",
    color: palette.textMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  blackjackTableCard: {
    gap: 16,
    borderRadius: 24,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fffdfb",
    padding: 18,
    ...mobileChromeTheme.cardShadow,
  },
  blackjackTableStage: {
    gap: 20,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: palette.border,
    backgroundColor: "#fcf9f8",
    minHeight: 620,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 20,
    ...mobileChromeTheme.cardShadow,
  },
  blackjackTableInner: {
    position: "absolute",
    top: 18,
    right: 18,
    bottom: 18,
    left: 18,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#d2cdca",
  },
  blackjackBetChipOuter: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 48,
    borderWidth: 4,
    borderColor: palette.border,
    backgroundColor: "#5f58ef",
    ...mobileChromeTheme.cardShadow,
  },
  blackjackBetChipInner: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 32,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: palette.accent,
  },
  blackjackBetChipValue: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  blackjackBetLabelPill: {
    borderRadius: 10,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#1c1b1b",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  blackjackBetLabelText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  blackjackBetStack: {
    alignItems: "center",
    gap: 10,
  },
  blackjackTiltLeft: {
    marginRight: -14,
    transform: [{ rotate: "-5deg" }],
  },
  blackjackTiltRight: {
    transform: [{ rotate: "5deg" }],
  },
  ruleCard: {
    width: "48%",
    gap: 6,
    borderRadius: 18,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: palette.border,
    backgroundColor: "#fff8ef",
    padding: 14,
    ...mobileChromeTheme.cardShadowSm,
  },
  ruleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  ruleLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  ruleValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
});
