import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  PredictionMarketDetail,
  PredictionMarketHistoryResponse,
  PredictionMarketPortfolioFilter,
  PredictionMarketPortfolioItem,
  PredictionMarketPortfolioMarket,
  PredictionMarketPortfolioStatus,
  PredictionMarketStatus,
  PredictionPositionStatus,
  PredictionMarketSummary,
} from "@reward/shared-types/prediction-market";

import { mobileFeedbackTheme, mobilePalette as palette } from "../theme";
import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import { ActionButton, SectionCard } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import type { MobileAppRoute, MobileStyles } from "./types";

type PredictionMarketRouteScreenProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  verificationCallout: ReactNode;
  screenCopy: MobileRouteScreens["predictionMarket"];
  balance: string;
  formatAmount: (value: string) => string;
  formatOptionalTimestamp: (value: string | Date | null) => string | null;
  emailVerified: boolean;
  predictionMarkets: PredictionMarketSummary[] | null;
  selectedPredictionMarket: PredictionMarketDetail | null;
  selectedPredictionMarketId: number | null;
  selectedPredictionOutcomeKey: string | null;
  predictionMarketStakeAmount: string;
  predictionMarketHistory: PredictionMarketHistoryResponse | null;
  predictionMarketHistoryPage: number;
  predictionMarketHistoryStatus: PredictionMarketPortfolioFilter;
  predictionMarketPositionCount: number;
  loadingPredictionMarkets: boolean;
  loadingPredictionMarket: boolean;
  loadingPredictionMarketHistory: boolean;
  placingPredictionPosition: boolean;
  onRefreshPredictionMarkets: () => void;
  onRefreshPredictionMarketHistory: () => void;
  onSelectPredictionMarket: (marketId: number) => void;
  onSelectPredictionMarketHistoryStatus: (
    status: PredictionMarketPortfolioFilter,
  ) => void;
  onSelectPredictionOutcome: (outcomeKey: string) => void;
  onChangePredictionMarketStake: (value: string) => void;
  onPreviousPredictionMarketHistoryPage: () => void;
  onNextPredictionMarketHistoryPage: () => void;
  onPlacePredictionPosition: () => void;
};

const PORTFOLIO_FILTERS: readonly PredictionMarketPortfolioFilter[] = [
  "all",
  "open",
  "resolved",
  "refunded",
];

export function PredictionMarketRouteScreen(
  props: PredictionMarketRouteScreenProps,
) {
  const activeMarketTitle = props.selectedPredictionMarket?.title
    ? props.selectedPredictionMarket.title
    : props.loadingPredictionMarkets
      ? props.screenCopy.summaryLoading
      : props.screenCopy.summaryEmpty;
  const predictionMarketHistoryItems = props.predictionMarketHistory?.items ?? [];
  const hasPredictionMarketHistoryItems = predictionMarketHistoryItems.length > 0;

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
              {props.screenCopy.summaryActiveMarket}
            </Text>
            <Text style={props.styles.routeSummaryValue}>
              {activeMarketTitle}
            </Text>
          </View>
          <View style={props.styles.routeSummaryCard}>
            <Text style={props.styles.routeSummaryLabel}>
              {props.screenCopy.summaryHoldings}
            </Text>
            <Text style={props.styles.routeSummaryValue}>
              {props.predictionMarketPositionCount}
            </Text>
          </View>
        </View>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard
        title={props.screenCopy.sectionTitle}
        subtitle={props.screenCopy.sectionSubtitle}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>
            {props.screenCopy.marketListTitle}
          </Text>
          <ActionButton
            label={
              props.loadingPredictionMarkets
                ? props.screenCopy.refreshingMarkets
                : props.screenCopy.refreshMarkets
            }
            onPress={props.onRefreshPredictionMarkets}
            disabled={
              props.loadingPredictionMarkets || props.placingPredictionPosition
            }
            variant="secondary"
            compact
          />
        </View>

        {props.loadingPredictionMarkets && !props.predictionMarkets ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>
              {props.screenCopy.refreshingMarkets}
            </Text>
          </View>
        ) : props.predictionMarkets && props.predictionMarkets.length > 0 ? (
          <>
            <View style={styles.marketList}>
              {props.predictionMarkets.map((market) => {
                const selected = market.id === props.selectedPredictionMarketId;
                const secondaryTimeLabel =
                  market.status === "resolved"
                    ? props.screenCopy.resolvedAt
                    : market.status === "cancelled"
                      ? props.screenCopy.lastUpdated
                      : market.status === "open"
                        ? props.screenCopy.locksAt
                        : props.screenCopy.resolvesAt;
                const secondaryTimeValue =
                  market.status === "resolved"
                    ? market.resolvedAt
                    : market.status === "cancelled"
                      ? market.updatedAt
                      : market.status === "open"
                        ? market.locksAt
                        : market.resolvesAt;

                return (
                  <Pressable
                    key={market.id}
                    onPress={() => props.onSelectPredictionMarket(market.id)}
                    accessibilityRole="button"
                    accessibilityLabel={market.title}
                    accessibilityHint="Double tap to open this prediction market."
                    accessibilityState={{ selected }}
                    style={[
                      styles.marketCard,
                      selected ? styles.marketCardSelected : null,
                    ]}
                  >
                    <View style={styles.marketCardHeader}>
                      <Text style={styles.marketCardTitle}>{market.title}</Text>
                      <View
                        style={[
                          styles.statusPill,
                          getMarketStatusTone(market.status),
                        ]}
                      >
                        <Text style={styles.statusPillText}>
                          {props.screenCopy.marketStatusLabels[market.status]}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.marketCardBody}>
                      {market.description ?? props.screenCopy.noDescription}
                    </Text>
                    <View style={styles.marketCardMetaRow}>
                      <Text style={styles.marketCardMetaLabel}>
                        {props.screenCopy.totalPool}
                      </Text>
                      <Text style={styles.marketCardMetaValue}>
                        {props.formatAmount(market.totalPoolAmount)}
                      </Text>
                    </View>
                    <View style={styles.marketCardMetaRow}>
                      <Text style={styles.marketCardMetaLabel}>
                        {secondaryTimeLabel}
                      </Text>
                      <Text style={styles.marketCardMetaValue}>
                        {props.formatOptionalTimestamp(secondaryTimeValue) ??
                          props.screenCopy.summaryEmpty}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.marketDetailPanel}>
              <Text style={styles.sectionHeading}>
                {props.screenCopy.marketDetailTitle}
              </Text>
              {props.loadingPredictionMarket && !props.selectedPredictionMarket ? (
                <View style={props.styles.loaderRow}>
                  <ActivityIndicator color={palette.accent} />
                  <Text style={props.styles.loaderText}>
                    {props.screenCopy.refreshingMarkets}
                  </Text>
                </View>
              ) : props.selectedPredictionMarket ? (
                <PredictionMarketDetailPanel
                  market={props.selectedPredictionMarket}
                  selectedOutcomeKey={props.selectedPredictionOutcomeKey}
                  stakeAmount={props.predictionMarketStakeAmount}
                  placingPredictionPosition={props.placingPredictionPosition}
                  routeNavigationLocked={props.routeNavigationLocked}
                  emailVerified={props.emailVerified}
                  screenCopy={props.screenCopy}
                  styles={props.styles}
                  formatAmount={props.formatAmount}
                  formatOptionalTimestamp={props.formatOptionalTimestamp}
                  onSelectOutcome={props.onSelectPredictionOutcome}
                  onChangeStakeAmount={props.onChangePredictionMarketStake}
                  onPlacePredictionPosition={props.onPlacePredictionPosition}
                />
              ) : (
                <Text style={props.styles.gachaHint}>
                  {props.screenCopy.noMarketSelected}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={props.styles.gachaHint}>{props.screenCopy.noMarkets}</Text>
        )}
      </SectionCard>

      <SectionCard
        title={props.screenCopy.myHoldingsTitle}
        subtitle={props.screenCopy.myHoldingsSubtitle}
      >
        <View style={styles.exposureCallout}>
          <Text style={styles.exposureCalloutKicker}>
            {props.screenCopy.exposureOnlyTitle}
          </Text>
          <Text style={styles.exposureCalloutBody}>
            {props.screenCopy.exposureOnlyDescription}
          </Text>
        </View>

        <View style={styles.filterToolbar}>
          <View style={styles.filterRow}>
            {PORTFOLIO_FILTERS.map((status) => {
              const active = status === props.predictionMarketHistoryStatus;
              return (
                <Pressable
                  key={`portfolio-filter-${status}`}
                  onPress={() => props.onSelectPredictionMarketHistoryStatus(status)}
                  accessibilityRole="button"
                  accessibilityLabel={props.screenCopy.portfolioFilterLabels[status]}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.filterChip,
                    active ? styles.filterChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active ? styles.filterChipTextActive : null,
                    ]}
                  >
                    {props.screenCopy.portfolioFilterLabels[status]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <ActionButton
            label={
              props.loadingPredictionMarketHistory
                ? props.screenCopy.loadingHistory
                : props.screenCopy.refreshHistory
            }
            onPress={props.onRefreshPredictionMarketHistory}
            disabled={props.loadingPredictionMarketHistory}
            variant="secondary"
            compact
          />
        </View>

        {props.predictionMarketHistory ? (
          <View style={styles.metricGrid}>
            <MetricCard
              label={props.screenCopy.marketCountLabel}
              value={String(props.predictionMarketHistory.summary.marketCount)}
            />
            <MetricCard
              label={props.screenCopy.positionCountLabel}
              value={String(props.predictionMarketHistory.summary.positionCount)}
            />
            <MetricCard
              label={props.screenCopy.totalStake}
              value={props.formatAmount(
                props.predictionMarketHistory.summary.totalStakeAmount,
              )}
            />
            <MetricCard
              label={props.screenCopy.openExposure}
              value={props.formatAmount(
                props.predictionMarketHistory.summary.openStakeAmount,
              )}
            />
            <MetricCard
              label={props.screenCopy.settledPayout}
              value={props.formatAmount(
                props.predictionMarketHistory.summary.settledPayoutAmount,
              )}
            />
            <MetricCard
              label={props.screenCopy.refundedAmount}
              value={props.formatAmount(
                props.predictionMarketHistory.summary.refundedAmount,
              )}
            />
          </View>
        ) : null}

        {props.loadingPredictionMarketHistory && !props.predictionMarketHistory ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>
              {props.screenCopy.loadingHistory}
            </Text>
          </View>
        ) : hasPredictionMarketHistoryItems ? (
          <View style={styles.holdingsList}>
            {predictionMarketHistoryItems.map((item) => (
              <PredictionMarketPortfolioCard
                key={`holding-market-${item.market.id}`}
                item={item}
                screenCopy={props.screenCopy}
                formatAmount={props.formatAmount}
                formatOptionalTimestamp={props.formatOptionalTimestamp}
                onSelectPredictionMarket={props.onSelectPredictionMarket}
              />
            ))}
          </View>
        ) : props.predictionMarketHistory ? (
          <Text style={props.styles.gachaHint}>
            {props.predictionMarketHistoryStatus === "all"
              ? props.screenCopy.noHoldings
              : props.screenCopy.noFilteredHoldings}
          </Text>
        ) : (
          <Text style={props.styles.gachaHint}>{props.screenCopy.noHoldings}</Text>
        )}

        {props.predictionMarketHistory ? (
          <View style={styles.paginationRow}>
            <Text style={styles.paginationLabel}>
              {props.screenCopy.portfolioPageValue(
                props.predictionMarketHistory.page ?? props.predictionMarketHistoryPage,
              )}
            </Text>
            <View style={styles.paginationActions}>
              <ActionButton
                label={props.screenCopy.previousPage}
                onPress={props.onPreviousPredictionMarketHistoryPage}
                disabled={
                  props.loadingPredictionMarketHistory ||
                  props.predictionMarketHistory.page <= 1
                }
                variant="secondary"
                compact
              />
              <ActionButton
                label={props.screenCopy.nextPage}
                onPress={props.onNextPredictionMarketHistoryPage}
                disabled={
                  props.loadingPredictionMarketHistory ||
                  !props.predictionMarketHistory.hasNext
                }
                variant="secondary"
                compact
              />
            </View>
          </View>
        ) : null}
      </SectionCard>
    </>
  );
}

type PredictionMarketDetailPanelProps = {
  emailVerified: boolean;
  formatAmount: (value: string) => string;
  formatOptionalTimestamp: (value: string | Date | null) => string | null;
  market: PredictionMarketDetail;
  onChangeStakeAmount: (value: string) => void;
  onPlacePredictionPosition: () => void;
  onSelectOutcome: (outcomeKey: string) => void;
  routeNavigationLocked: boolean;
  screenCopy: MobileRouteScreens["predictionMarket"];
  selectedOutcomeKey: string | null;
  stakeAmount: string;
  placingPredictionPosition: boolean;
  styles: MobileStyles;
};

function PredictionMarketDetailPanel(props: PredictionMarketDetailPanelProps) {
  const totalExposure = props.market.userPositions.reduce(
    (total, position) => total + Number(position.stakeAmount),
    0,
  );
  const exposureLabel = Number.isFinite(totalExposure)
    ? totalExposure.toFixed(2)
    : "0.00";
  const selectedOutcome = props.market.outcomes.find(
    (outcome) => outcome.key === props.selectedOutcomeKey,
  );
  const marketOpen = props.market.status === "open";
  const selectedOutcomeLabel = selectedOutcome?.label ?? props.screenCopy.chooseOutcome;

  return (
    <View style={styles.detailStack}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderCopy}>
          <Text style={styles.detailTitle}>{props.market.title}</Text>
          <Text style={styles.detailDescription}>
            {props.market.description ?? props.screenCopy.noDescription}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            getMarketStatusTone(props.market.status),
          ]}
        >
          <Text style={styles.statusPillText}>
            {props.screenCopy.marketStatusLabels[props.market.status]}
          </Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard
          label={props.screenCopy.marketStatus}
          value={props.screenCopy.marketStatusLabels[props.market.status]}
        />
        <MetricCard
          label={props.screenCopy.settlementStatus}
          value={getSettlementLabel(props.screenCopy, props.market)}
        />
        <MetricCard
          label={props.screenCopy.totalPool}
          value={props.formatAmount(props.market.totalPoolAmount)}
        />
        <MetricCard
          label={props.screenCopy.yourExposure}
          value={props.formatAmount(exposureLabel)}
        />
        <MetricCard
          label={props.screenCopy.mechanism}
          value={props.screenCopy.mechanismPariMutuel}
        />
        <MetricCard
          label={props.screenCopy.openPositions}
          value={`${props.market.userPositions.filter((position) => position.status === "open").length}`}
        />
        <MetricCard
          label={props.screenCopy.opensAt}
          value={
            props.formatOptionalTimestamp(props.market.opensAt) ??
            props.screenCopy.summaryEmpty
          }
        />
        <MetricCard
          label={props.screenCopy.locksAt}
          value={
            props.formatOptionalTimestamp(props.market.locksAt) ??
            props.screenCopy.summaryEmpty
          }
        />
        <MetricCard
          label={props.screenCopy.resolvesAt}
          value={
            props.formatOptionalTimestamp(props.market.resolvesAt) ??
            props.screenCopy.summaryEmpty
          }
        />
        <MetricCard
          label={props.screenCopy.resolvedAt}
          value={
            props.formatOptionalTimestamp(props.market.resolvedAt) ??
            props.screenCopy.summaryEmpty
          }
        />
        <MetricCard
          label={props.screenCopy.lastUpdated}
          value={
            props.formatOptionalTimestamp(props.market.updatedAt) ??
            props.screenCopy.summaryEmpty
          }
        />
        <MetricCard
          label={props.screenCopy.winningOutcome}
          value={
            props.market.winningOutcomeKey
              ? getOutcomeLabel(props.market, props.market.winningOutcomeKey)
              : props.screenCopy.winningOutcomePending
          }
        />
      </View>

      <View style={styles.outcomeStack}>
        <Text style={styles.detailSubheading}>{props.screenCopy.selectOutcome}</Text>
        <View style={styles.outcomeList}>
          {props.market.outcomes.map((outcome) => {
            const pool = getOutcomePool(props.market, outcome.key);
            const selected = outcome.key === props.selectedOutcomeKey;
            const winning = props.market.winningOutcomeKey === outcome.key;
            const poolShare = formatPoolShare(
              pool.totalStakeAmount,
              props.market.totalPoolAmount,
            );

            return (
              <Pressable
                key={`market-outcome-${outcome.key}`}
                onPress={() => props.onSelectOutcome(outcome.key)}
                accessibilityRole="button"
                accessibilityLabel={outcome.label}
                accessibilityHint="Double tap to select this outcome."
                accessibilityState={{ selected }}
                style={[
                  styles.outcomeCard,
                  selected ? styles.outcomeCardSelected : null,
                ]}
              >
                <View style={styles.outcomeCardHeader}>
                  <Text style={styles.outcomeTitle}>{outcome.label}</Text>
                  {winning ? (
                    <View style={[styles.statusPill, styles.winnerPill]}>
                      <Text style={styles.statusPillText}>
                        {props.screenCopy.outcomeWinner}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.outcomeMeta}>
                  {pool.positionCount > 0
                    ? props.screenCopy.outcomePool(
                        props.formatAmount(pool.totalStakeAmount),
                        pool.positionCount,
                        poolShare,
                      )
                    : props.screenCopy.noOutcomePools}
                </Text>
                {winning && props.market.winningPoolAmount ? (
                  <Text style={styles.outcomeSecondaryMeta}>
                    {props.screenCopy.winningPool(
                      props.formatAmount(props.market.winningPoolAmount),
                    )}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.betPanel}>
        <Text style={props.styles.fieldLabel}>
          {props.screenCopy.selectedOutcome}
        </Text>
        <Text style={styles.selectedOutcomeValue}>{selectedOutcomeLabel}</Text>
        <Text style={props.styles.fieldLabel}>{props.screenCopy.stakeAmount}</Text>
        <TextInput
          value={props.stakeAmount}
          onChangeText={props.onChangeStakeAmount}
          style={props.styles.input}
          keyboardType="decimal-pad"
          autoCorrect={false}
          placeholder={props.stakeAmount}
          placeholderTextColor={palette.textMuted}
        />
        <Text style={styles.betHint}>
          {marketOpen ? props.screenCopy.stakeHint : props.screenCopy.marketClosed}
        </Text>
        <ActionButton
          label={
            props.placingPredictionPosition
              ? props.screenCopy.placingBet
              : props.screenCopy.placeBet
          }
          onPress={props.onPlacePredictionPosition}
          disabled={
            props.placingPredictionPosition ||
            props.routeNavigationLocked ||
            !props.emailVerified ||
            !marketOpen ||
            !props.selectedOutcomeKey
          }
        />
      </View>

      <View style={styles.positionSection}>
        <Text style={styles.detailSubheading}>{props.screenCopy.yourPositions}</Text>
        {props.market.userPositions.length > 0 ? (
          <View style={styles.positionList}>
            {props.market.userPositions.map((position) => (
              <PredictionMarketPositionCard
                key={`detail-position-${position.id}`}
                market={props.market}
                positionStatus={position.status}
                positionStatusLabel={
                  props.screenCopy.positionStatusLabels[position.status]
                }
                outcomeKey={position.outcomeKey}
                stakeAmount={position.stakeAmount}
                payoutAmount={position.payoutAmount}
                placedAt={position.createdAt}
                settledAt={position.settledAt}
                screenCopy={props.screenCopy}
                formatAmount={props.formatAmount}
                formatOptionalTimestamp={props.formatOptionalTimestamp}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.betHint}>{props.screenCopy.noPositions}</Text>
        )}
      </View>
    </View>
  );
}

type PredictionMarketPositionCardProps = {
  market: PredictionMarketDetail | PredictionMarketPortfolioMarket;
  positionStatus: PredictionPositionStatus;
  positionStatusLabel: string;
  outcomeKey: string;
  stakeAmount: string;
  payoutAmount: string;
  placedAt: string | Date;
  settledAt: string | Date | null;
  screenCopy: MobileRouteScreens["predictionMarket"];
  formatAmount: (value: string) => string;
  formatOptionalTimestamp: (value: string | Date | null) => string | null;
};

type PredictionMarketPortfolioCardProps = {
  item: PredictionMarketPortfolioItem;
  screenCopy: MobileRouteScreens["predictionMarket"];
  formatAmount: (value: string) => string;
  formatOptionalTimestamp: (value: string | Date | null) => string | null;
  onSelectPredictionMarket: (marketId: number) => void;
};

function PredictionMarketPortfolioCard(
  props: PredictionMarketPortfolioCardProps,
) {
  const { item } = props;

  return (
    <View style={styles.holdingCard}>
      <View style={styles.portfolioHeader}>
        <View style={styles.portfolioHeaderCopy}>
          <Text style={styles.marketCardTitle}>{item.market.title}</Text>
          <Text style={styles.marketCardBody}>
            {item.market.description ?? props.screenCopy.noDescription}
          </Text>
        </View>
        <View style={styles.portfolioBadgeStack}>
          <View
            style={[
              styles.statusPill,
              getPortfolioStatusTone(item.portfolioStatus),
            ]}
          >
            <Text style={styles.statusPillText}>
              {props.screenCopy.portfolioStatusLabels[item.portfolioStatus]}
            </Text>
          </View>
          <View style={[styles.statusPill, getMarketStatusTone(item.market.status)]}>
            <Text style={styles.statusPillText}>
              {props.screenCopy.marketStatusLabels[item.market.status]}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.portfolioMetaStack}>
        <View style={styles.marketCardMetaRow}>
          <Text style={styles.marketCardMetaLabel}>{props.screenCopy.roundKey}</Text>
          <Text style={styles.marketCardMetaValue}>{item.market.roundKey}</Text>
        </View>
        <View style={styles.marketCardMetaRow}>
          <Text style={styles.marketCardMetaLabel}>
            {props.screenCopy.lastActivity}
          </Text>
          <Text style={styles.marketCardMetaValue}>
            {props.formatOptionalTimestamp(item.lastActivityAt) ??
              props.screenCopy.summaryEmpty}
          </Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard
          label={props.screenCopy.positionCountLabel}
          value={String(item.positionCount)}
        />
        <MetricCard
          label={props.screenCopy.totalStake}
          value={props.formatAmount(item.totalStakeAmount)}
        />
        <MetricCard
          label={props.screenCopy.openExposure}
          value={props.formatAmount(item.openStakeAmount)}
        />
        <MetricCard
          label={props.screenCopy.settledPayout}
          value={props.formatAmount(item.settledPayoutAmount)}
        />
        <MetricCard
          label={props.screenCopy.refundedAmount}
          value={props.formatAmount(item.refundedAmount)}
        />
      </View>

      <ActionButton
        label={props.screenCopy.focusMarket}
        onPress={() => props.onSelectPredictionMarket(item.market.id)}
        variant="secondary"
        compact
      />

      <View style={styles.positionList}>
        {item.positions.map((position) => (
          <PredictionMarketPositionCard
            key={`holding-position-${position.id}`}
            market={item.market}
            positionStatus={position.status}
            positionStatusLabel={
              props.screenCopy.positionStatusLabels[position.status]
            }
            outcomeKey={position.outcomeKey}
            stakeAmount={position.stakeAmount}
            payoutAmount={position.payoutAmount}
            placedAt={position.createdAt}
            settledAt={position.settledAt}
            screenCopy={props.screenCopy}
            formatAmount={props.formatAmount}
            formatOptionalTimestamp={props.formatOptionalTimestamp}
          />
        ))}
      </View>
    </View>
  );
}

function PredictionMarketPositionCard(props: PredictionMarketPositionCardProps) {
  const outcomeLabel = getOutcomeLabel(props.market, props.outcomeKey);

  return (
    <View style={styles.positionCard}>
      <View style={styles.positionCardHeader}>
        <View>
          <Text style={styles.positionOutcome}>{outcomeLabel}</Text>
          <Text style={styles.positionTimestamp}>
            {props.screenCopy.positionPlacedAt}:{" "}
            {props.formatOptionalTimestamp(props.placedAt) ??
              props.screenCopy.summaryEmpty}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            getPositionStatusTone(props.positionStatus),
          ]}
        >
          <Text style={styles.statusPillText}>{props.positionStatusLabel}</Text>
        </View>
      </View>
      <View style={styles.positionMetaRow}>
        <Text style={styles.positionMetaLabel}>{props.screenCopy.stakeAmount}</Text>
        <Text style={styles.positionMetaValue}>
          {props.formatAmount(props.stakeAmount)}
        </Text>
      </View>
      <View style={styles.positionMetaRow}>
        <Text style={styles.positionMetaLabel}>
          {props.screenCopy.potentialPayout}
        </Text>
        <Text style={styles.positionMetaValue}>
          {props.formatAmount(props.payoutAmount)}
        </Text>
      </View>
      <View style={styles.positionMetaRow}>
        <Text style={styles.positionMetaLabel}>
          {props.screenCopy.positionSettledAt}
        </Text>
        <Text style={styles.positionMetaValue}>
          {props.formatOptionalTimestamp(props.settledAt) ??
            props.screenCopy.summaryEmpty}
        </Text>
      </View>
    </View>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
    </View>
  );
}

function getOutcomeLabel(
  market: PredictionMarketDetail | PredictionMarketPortfolioMarket,
  outcomeKey: string,
) {
  return (
    market.outcomes.find((outcome) => outcome.key === outcomeKey)?.label ??
    outcomeKey
  );
}

function getOutcomePool(market: PredictionMarketDetail, outcomeKey: string) {
  return (
    market.outcomePools.find((pool) => pool.outcomeKey === outcomeKey) ?? {
      outcomeKey,
      label: getOutcomeLabel(market, outcomeKey),
      totalStakeAmount: "0.00",
      positionCount: 0,
    }
  );
}

function getSettlementLabel(
  screenCopy: MobileRouteScreens["predictionMarket"],
  market: PredictionMarketSummary,
) {
  if (market.status === "resolved") {
    return screenCopy.settlementResolved;
  }

  if (market.status === "cancelled") {
    return screenCopy.settlementCancelled;
  }

  return screenCopy.settlementPending;
}

function formatPoolShare(poolStakeAmount: string, totalPoolAmount: string) {
  const pool = Number(poolStakeAmount);
  const total = Number(totalPoolAmount);
  if (!Number.isFinite(pool) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }

  const ratio = (pool / total) * 100;
  return `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}%`;
}

function getMarketStatusTone(status: PredictionMarketStatus) {
  switch (status) {
    case "open":
      return styles.statusPillActive;
    case "locked":
      return styles.statusPillWarning;
    case "resolved":
      return styles.statusPillSuccess;
    case "cancelled":
      return styles.statusPillDanger;
    default:
      return styles.statusPillMuted;
  }
}

function getPositionStatusTone(status: PredictionPositionStatus) {
  switch (status) {
    case "won":
      return styles.statusPillSuccess;
    case "lost":
      return styles.statusPillWarning;
    case "refunded":
      return styles.statusPillMuted;
    default:
      return styles.statusPillActive;
  }
}

function getPortfolioStatusTone(status: PredictionMarketPortfolioStatus) {
  switch (status) {
    case "resolved":
      return styles.statusPillSuccess;
    case "refunded":
      return styles.statusPillMuted;
    default:
      return styles.statusPillActive;
  }
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  exposureCallout: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileFeedbackTheme.info.borderColor,
    backgroundColor: mobileFeedbackTheme.info.backgroundColor,
    padding: 14,
  },
  exposureCalloutKicker: {
    color: mobileFeedbackTheme.info.accentColor,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  exposureCalloutBody: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionHeading: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  filterToolbar: {
    gap: 10,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: palette.accent,
    backgroundColor: "rgba(57, 208, 255, 0.14)",
  },
  filterChipText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterChipTextActive: {
    color: palette.text,
  },
  marketList: {
    gap: 10,
  },
  marketCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  marketCardSelected: {
    borderColor: palette.accent,
    backgroundColor: "rgba(57, 208, 255, 0.12)",
  },
  marketCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  marketCardTitle: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  marketCardBody: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  marketCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  marketCardMetaLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  marketCardMetaValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "600",
  },
  marketDetailPanel: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  detailStack: {
    gap: 14,
  },
  detailHeader: {
    gap: 12,
  },
  detailHeaderCopy: {
    gap: 8,
  },
  detailTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  detailDescription: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  detailSubheading: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  outcomeStack: {
    gap: 10,
  },
  outcomeList: {
    gap: 10,
  },
  outcomeCard: {
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    padding: 12,
  },
  outcomeCardSelected: {
    borderColor: palette.accent,
    backgroundColor: "rgba(57, 208, 255, 0.12)",
  },
  outcomeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  outcomeTitle: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  outcomeMeta: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  outcomeSecondaryMeta: {
    color: palette.success,
    fontSize: 12,
    fontWeight: "700",
  },
  betPanel: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    padding: 12,
  },
  selectedOutcomeValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  betHint: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  positionSection: {
    gap: 10,
  },
  positionList: {
    gap: 10,
  },
  positionCard: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.input,
    padding: 12,
  },
  positionCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  positionOutcome: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  positionTimestamp: {
    color: palette.textMuted,
    fontSize: 12,
  },
  positionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  positionMetaLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  positionMetaValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: "700",
  },
  statusPillMuted: {
    borderColor: palette.border,
    backgroundColor: palette.input,
  },
  statusPillActive: {
    borderColor: mobileFeedbackTheme.active.borderColor,
    backgroundColor: mobileFeedbackTheme.active.backgroundColor,
  },
  statusPillSuccess: {
    borderColor: mobileFeedbackTheme.success.borderColor,
    backgroundColor: mobileFeedbackTheme.success.backgroundColor,
  },
  statusPillWarning: {
    borderColor: mobileFeedbackTheme.warning.borderColor,
    backgroundColor: mobileFeedbackTheme.warning.backgroundColor,
  },
  statusPillDanger: {
    borderColor: mobileFeedbackTheme.danger.borderColor,
    backgroundColor: mobileFeedbackTheme.danger.backgroundColor,
  },
  winnerPill: {
    borderColor: "#b7791f",
    backgroundColor: "#3a2411",
  },
  holdingsList: {
    gap: 10,
  },
  holdingCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panelMuted,
    padding: 14,
  },
  portfolioHeader: {
    gap: 12,
  },
  portfolioHeaderCopy: {
    gap: 8,
  },
  portfolioBadgeStack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  portfolioMetaStack: {
    gap: 8,
  },
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  paginationLabel: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  paginationActions: {
    flexDirection: "row",
    gap: 8,
  },
});
