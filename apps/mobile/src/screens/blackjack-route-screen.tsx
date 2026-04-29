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
import { mobileGameTheme, mobilePalette as palette } from "../theme";
import { ActionButton, PlayModeSelector, SectionCard } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import type { MobileAppRoute, MobileStyles } from "./types";

const blackjackSuitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

const styles = StyleSheet.create({
  blackjackControls: {
    gap: 12,
  },
  blackjackStakeHint: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    color: palette.textMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  blackjackRouteStack: {
    gap: 14,
  },
  blackjackHandsGrid: {
    gap: 12,
  },
  blackjackHandCard: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileGameTheme.blackjack.hand.borderColor,
    backgroundColor: mobileGameTheme.blackjack.hand.backgroundColor,
    padding: 14,
  },
  blackjackHandCardActive: {
    borderColor: mobileGameTheme.blackjack.activeHand.borderColor,
    backgroundColor: mobileGameTheme.blackjack.activeHand.backgroundColor,
  },
  blackjackHandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  blackjackHandTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  blackjackCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  blackjackPlayingCard: {
    width: 62,
    height: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: mobileGameTheme.blackjack.card.backgroundColor,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "space-between",
  },
  blackjackPlayingCardHidden: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.input,
  },
  blackjackPlayingCardBack: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  blackjackPlayingCardLabel: {
    color: mobileGameTheme.blackjack.card.inkColor,
    fontSize: 15,
    fontWeight: "800",
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
  blackjackHistoryList: {
    gap: 10,
  },
  blackjackHistoryTitle: {
    color: palette.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  blackjackHistoryCard: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  blackjackHistoryBody: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  blackjackTableCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
});

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
  onBlackjackAction: (action: BlackjackAction) => void;
  blackjackStatusLabels: Record<BlackjackGameStatus, string>;
};

export function BlackjackRouteScreen(props: BlackjackRouteScreenProps) {
  const activeGame = props.blackjackOverview?.activeGame ?? null;
  const blackjackConfig = props.blackjackOverview?.config ?? BLACKJACK_CONFIG;

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

  const renderCard = (card: BlackjackCardView, index: number) => {
    const hidden = card.hidden || !card.rank || !card.suit;
    const suit = card.suit ? blackjackSuitSymbols[card.suit] : "•";

    return (
      <View
        key={`${card.rank ?? "hidden"}-${card.suit ?? "unknown"}-${index}`}
        style={[
          styles.blackjackPlayingCard,
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

  const renderHand = (label: string, hand: BlackjackGame["dealerHand"]) => (
    <View style={styles.blackjackHandCard}>
      <View style={styles.blackjackHandHeader}>
        <Text style={styles.blackjackHandTitle}>{label}</Text>
        <View style={[props.styles.badge, props.styles.badgeMuted]}>
          <Text style={props.styles.badgeText}>
            {hand.total === null
              ? props.screenCopy.visible
              : props.screenCopy.total}{" "}
            {hand.total ?? hand.visibleTotal ?? "—"}
          </Text>
        </View>
      </View>
      <View style={styles.blackjackCardRow}>
        {hand.cards.map((card, index) => renderCard(card, index))}
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
        <View style={{ gap: 8, flex: 1 }}>
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
                {props.screenCopy.currentBet}{" "}
                {props.formatAmount(hand.stakeAmount)}
              </Text>
            </View>
          </View>
        </View>
        <View style={[props.styles.badge, props.styles.badgeMuted]}>
          <Text style={props.styles.badgeText}>
            {props.screenCopy.total} {hand.total ?? hand.visibleTotal ?? "—"}
          </Text>
        </View>
      </View>
      <View style={styles.blackjackCardRow}>
        {hand.cards.map((card, index) => renderCard(card, index))}
      </View>
    </View>
  );

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
              {props.screenCopy.summaryFairnessEpoch}
            </Text>
            <Text style={props.styles.routeSummaryValue}>
              {props.blackjackOverview
                ? props.blackjackOverview.fairness.epoch
                : props.screenCopy.summaryLoading}
            </Text>
          </View>
        </View>
        {props.verificationCallout}
      </SectionCard>

      <PlayModeSelector
        copy={props.playModeCopy}
        snapshot={props.blackjackOverview?.playMode ?? null}
        disabled={
          props.loadingBlackjack ||
          props.updatingBlackjackPlayMode ||
          Boolean(props.blackjackOverview?.activeGame)
        }
        onSelect={props.onChangeBlackjackPlayMode}
      />

      <SectionCard
        title={props.screenCopy.sectionTitle}
        subtitle={props.screenCopy.sectionSubtitle}
      >
        <View style={props.styles.gachaMetaCard}>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaStakeRange}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {props.formatAmount(blackjackConfig.minStake)} -{" "}
              {props.formatAmount(blackjackConfig.maxStake)}
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaNaturalPayout}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.naturalPayoutMultiplier}x
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaDealer}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.dealerHitsSoft17
                ? props.screenCopy.dealerHitsSoft17
                : props.screenCopy.dealerStandAll17}
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaDouble}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.doubleDownAllowed
                ? props.screenCopy.doubleEnabled
                : props.screenCopy.doubleDisabled}
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaSplitAces}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.splitAcesAllowed
                ? props.screenCopy.doubleEnabled
                : props.screenCopy.doubleDisabled}
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaHitSplitAces}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.hitSplitAcesAllowed
                ? props.screenCopy.doubleEnabled
                : props.screenCopy.doubleDisabled}
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaResplit}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.resplitAllowed
                ? props.screenCopy.doubleEnabled
                : props.screenCopy.doubleDisabled}
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaMaxSplitHands}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.maxSplitHands}
            </Text>
          </View>
          <View style={props.styles.gachaMetaRow}>
            <Text style={props.styles.gachaMetaLabel}>
              {props.screenCopy.metaTenValueSplit}
            </Text>
            <Text style={props.styles.gachaMetaValue}>
              {blackjackConfig.splitTenValueCardsAllowed
                ? props.screenCopy.doubleEnabled
                : props.screenCopy.doubleDisabled}
            </Text>
          </View>
        </View>

        <MobileFairnessCompactSummary
          locale={props.fairnessLocale}
          fairness={activeGame?.fairness ?? props.blackjackOverview?.fairness}
          clientNonce={activeGame?.fairness.clientNonce ?? null}
          eyebrow={props.fairnessEyebrow}
        />

        {!activeGame ? (
          <View style={styles.blackjackControls}>
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
            </View>
            <View style={props.styles.inlineActions}>
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
                compact
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
                compact
              />
            </View>
            <Text style={props.styles.gachaHint}>
              {props.screenCopy.noActiveHand}
            </Text>
          </View>
        ) : (
          <View style={styles.blackjackRouteStack}>
            <View style={props.styles.badgeRow}>
              <View style={[props.styles.badge, props.styles.badgeSuccess]}>
                <Text style={props.styles.badgeText}>
                  {props.blackjackStatusLabels[activeGame.status]}
                </Text>
              </View>
              <View style={[props.styles.badge, props.styles.badgeMuted]}>
                <Text style={props.styles.badgeText}>
                  Stake {props.formatAmount(activeGame.totalStake)}
                </Text>
              </View>
              <View style={[props.styles.badge, props.styles.badgeMuted]}>
                <Text style={props.styles.badgeText}>
                  Payout {props.formatAmount(activeGame.payoutAmount)}
                </Text>
              </View>
            </View>

            <View style={styles.blackjackTableCard}>
              <Text style={styles.blackjackHandTitle}>
                {props.screenCopy.tableTitle}
              </Text>
              <Text style={styles.blackjackHistoryBody}>
                {props.screenCopy.tableId} {activeGame.table.tableId}
              </Text>
              <View style={props.styles.badgeRow}>
                {activeGame.table.seats.map((seat) => (
                  <View
                    key={`${activeGame.table.tableId}-${seat.participantId}-${seat.seatIndex}`}
                    style={[
                      props.styles.badge,
                      seat.role === "dealer"
                        ? props.styles.badgeSuccess
                        : props.styles.badgeMuted,
                    ]}
                  >
                    <Text style={props.styles.badgeText}>
                      {getTableSeatLabel(seat)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.blackjackHandsGrid}>
              {renderHand(props.screenCopy.dealerHand, activeGame.dealerHand)}
              <View style={styles.blackjackHandsGrid}>
                {activeGame.playerHands.map((hand) => renderPlayerHand(hand))}
              </View>
            </View>

            <View style={props.styles.inlineActions}>
              {activeGame.availableActions.map((action) => (
                <ActionButton
                  key={action}
                  label={
                    props.actingBlackjack === action
                      ? props.screenCopy.settling
                      : action === "hit"
                        ? props.screenCopy.hit
                        : action === "stand"
                          ? props.screenCopy.stand
                          : action === "double"
                            ? props.screenCopy.double
                            : props.screenCopy.split
                  }
                  onPress={() => props.onBlackjackAction(action)}
                  disabled={
                    props.actingBlackjack !== null ||
                    props.loadingBlackjack ||
                    !props.emailVerified
                  }
                  variant={action === "double" ? "secondary" : "primary"}
                  compact
                />
              ))}
            </View>
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
                      Stake {props.formatAmount(game.totalStake)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.blackjackHistoryBody}>
                  P {formatPlayerTotals(game)} / D {game.dealerTotal}
                </Text>
                <Text style={styles.blackjackHistoryBody}>
                  Payout {props.formatAmount(game.payoutAmount)}
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
