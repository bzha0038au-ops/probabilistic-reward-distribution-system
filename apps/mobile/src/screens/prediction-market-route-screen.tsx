import { type ReactNode, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  PredictionMarketCategory,
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

import {
  mobileChromeTheme,
  mobileFeedbackTheme,
  mobilePalette as palette,
} from "../theme";
import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import { buildTestId } from "../testing";
import { ActionButton, SectionCard } from "../ui";
import { predictionMarketRouteScreenStyles as styles } from "./prediction-market-route-screen.styles";
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

type CategoryFilter = "all" | PredictionMarketCategory;

const PORTFOLIO_FILTERS: readonly PredictionMarketPortfolioFilter[] = [
  "all",
  "open",
  "resolved",
  "refunded",
];

function formatCategoryLabel(category: PredictionMarketCategory) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatTagLabel(tag: string) {
  return tag.replaceAll("-", " ").toUpperCase();
}

function getMarketTimeLabel(
  copy: MobileRouteScreens["predictionMarket"],
  status: PredictionMarketStatus,
) {
  if (status === "resolved") {
    return copy.resolvedAt;
  }

  if (status === "cancelled") {
    return copy.lastUpdated;
  }

  if (status === "open") {
    return copy.locksAt;
  }

  return copy.resolvesAt;
}

function getMarketTimeValue(
  market: PredictionMarketSummary | PredictionMarketDetail,
) {
  if (market.status === "resolved") {
    return market.resolvedAt;
  }

  if (market.status === "cancelled") {
    return market.updatedAt;
  }

  if (market.status === "open") {
    return market.locksAt;
  }

  return market.resolvesAt;
}

function buildOutcomeSummaries(
  market: PredictionMarketSummary | PredictionMarketDetail,
) {
  return market.outcomes
    .map((outcome) => {
      const pool = getOutcomePool(market, outcome.key);
      const share = formatPoolShare(pool.totalStakeAmount, market.totalPoolAmount);

      return {
        key: outcome.key,
        label: outcome.label,
        totalStakeAmount: pool.totalStakeAmount,
        positionCount: pool.positionCount,
        share,
        numericShare: Number.parseFloat(share.replace("%", "")) || 0,
      };
    })
    .sort((left, right) => right.numericShare - left.numericShare);
}

export function PredictionMarketRouteScreen(
  props: PredictionMarketRouteScreenProps,
) {
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>("all");
  const predictionMarketHistoryItems = props.predictionMarketHistory?.items ?? [];
  const hasPredictionMarketHistoryItems = predictionMarketHistoryItems.length > 0;
  const predictionMarkets = props.predictionMarkets ?? [];
  const selectedMarketSummary =
    predictionMarkets.find((market) => market.id === props.selectedPredictionMarketId) ??
    null;
  const featuredMarket =
    props.selectedPredictionMarket ?? selectedMarketSummary ?? predictionMarkets[0] ?? null;
  const featuredOutcomes = featuredMarket
    ? buildOutcomeSummaries(featuredMarket)
    : [];
  const primaryOutcome = featuredOutcomes[0] ?? null;
  const categoryFilters = useMemo(
    () => Array.from(new Set(predictionMarkets.map((market) => market.category))),
    [predictionMarkets],
  );
  const filteredMarkets = useMemo(() => {
    if (selectedCategory === "all") {
      return predictionMarkets;
    }

    return predictionMarkets.filter((market) => market.category === selectedCategory);
  }, [predictionMarkets, selectedCategory]);
  const activeMarketTitle = featuredMarket?.title
    ? featuredMarket.title
    : props.loadingPredictionMarkets
      ? props.screenCopy.summaryLoading
      : props.screenCopy.summaryEmpty;
  const activeCategoryLabel =
    selectedCategory === "all"
      ? props.screenCopy.portfolioFilterLabels.all
      : formatCategoryLabel(selectedCategory);

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
            <Text style={styles.overviewBadgeText}>
              {featuredMarket?.title.trim().charAt(0).toUpperCase() ?? "?"}
            </Text>
          </View>
          <View style={styles.overviewTopRow}>
            <Text style={styles.overviewEyebrow}>
              {props.screenCopy.summaryActiveMarket}
            </Text>
            <View style={styles.overviewPill}>
              <Text style={styles.overviewPillText}>{activeCategoryLabel}</Text>
            </View>
          </View>
          <Text style={styles.overviewTitle}>{activeMarketTitle}</Text>
          <Text style={styles.overviewBody}>
            {featuredMarket?.description ?? props.screenCopy.noDescription}
          </Text>
          <View style={styles.overviewSummaryRow}>
            <View style={styles.overviewSummaryCard}>
              <Text style={styles.overviewSummaryLabel}>
                {props.screenCopy.totalPool}
              </Text>
              <Text style={styles.overviewSummaryValue}>
                {featuredMarket
                  ? props.formatAmount(featuredMarket.totalPoolAmount)
                  : props.screenCopy.summaryEmpty}
              </Text>
            </View>
            <View style={styles.overviewSummaryCard}>
              <Text style={styles.overviewSummaryLabel}>
                {props.screenCopy.summaryHoldings}
              </Text>
              <Text style={styles.overviewSummaryValue}>
                {props.predictionMarketPositionCount}
              </Text>
            </View>
            <View style={styles.overviewSummaryCard}>
              <Text style={styles.overviewSummaryLabel}>
                {props.screenCopy.selectOutcome}
              </Text>
              <Text style={styles.overviewSummaryValue}>
                {primaryOutcome?.label ?? props.screenCopy.chooseOutcome}
              </Text>
            </View>
          </View>
        </View>
        {props.verificationCallout}
      </SectionCard>

      <SectionCard title={props.screenCopy.sectionTitle}>
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
            testID="prediction-market-refresh-markets-button"
          />
        </View>

        {props.loadingPredictionMarkets && predictionMarkets.length === 0 ? (
          <View style={props.styles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.styles.loaderText}>
              {props.screenCopy.refreshingMarkets}
            </Text>
          </View>
        ) : featuredMarket ? (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroHalftone} />

              <View style={styles.heroContent}>
                <View style={styles.heroLeft}>
                  <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>
                      {featuredMarket.tags[0]
                        ? formatTagLabel(featuredMarket.tags[0])
                        : formatCategoryLabel(featuredMarket.category)}
                    </Text>
                  </View>

                  <Text style={styles.heroTitle}>{featuredMarket.title}</Text>
                  <Text style={styles.heroDescription}>
                    {featuredMarket.description ?? props.screenCopy.noDescription}
                  </Text>

                  <View style={styles.heroMetaRow}>
                    <Text style={styles.heroMetaText}>
                      {getMarketTimeLabel(props.screenCopy, featuredMarket.status)}{" "}
                      {props.formatOptionalTimestamp(getMarketTimeValue(featuredMarket)) ??
                        props.screenCopy.summaryEmpty}
                    </Text>
                    <Text style={styles.heroMetaText}>
                      {props.screenCopy.totalPool}{" "}
                      {props.formatAmount(featuredMarket.totalPoolAmount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.heroOddsCard}>
                  <View style={styles.heroOddsHeader}>
                    <Text style={styles.heroOddsLabel}>
                      {props.screenCopy.selectOutcome}
                    </Text>
                    <Text style={styles.heroOddsValue}>
                      {primaryOutcome ? `${primaryOutcome.share} ${primaryOutcome.label}` : "—"}
                    </Text>
                  </View>

                  <View style={styles.heroProgressTrack}>
                    {featuredOutcomes.slice(0, 2).map((outcome, index) => (
                      <View
                        key={`hero-progress-${outcome.key}`}
                        style={[
                          styles.heroProgressFill,
                          index === 0
                            ? styles.heroProgressFillPrimary
                            : styles.heroProgressFillSecondary,
                          { width: `${Math.max(outcome.numericShare, 8)}%` },
                        ]}
                      >
                        <Text style={styles.heroProgressText}>
                          {outcome.label.toUpperCase()}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.heroOutcomeButtonRow}>
                    {featuredOutcomes.slice(0, 2).map((outcome) => (
                      <Pressable
                        key={`hero-outcome-${outcome.key}`}
                        onPress={() => {
                          props.onSelectPredictionMarket(featuredMarket.id);
                          props.onSelectPredictionOutcome(outcome.key);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={outcome.label}
                        accessibilityState={{
                          selected:
                            props.selectedPredictionMarketId === featuredMarket.id &&
                            props.selectedPredictionOutcomeKey === outcome.key,
                        }}
                        style={[
                          styles.heroOutcomeButton,
                          props.selectedPredictionMarketId === featuredMarket.id &&
                          props.selectedPredictionOutcomeKey === outcome.key
                            ? styles.heroOutcomeButtonSelected
                            : null,
                        ]}
                      >
                        <Text style={styles.heroOutcomeButtonTitle}>
                          {outcome.label}
                        </Text>
                        <Text style={styles.heroOutcomeButtonMeta}>
                          {outcome.share} ·{" "}
                          {props.formatAmount(outcome.totalStakeAmount)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {featuredOutcomes.length > 2 ? (
                    <View style={styles.extraOutcomeList}>
                      {featuredOutcomes.slice(2).map((outcome) => (
                        <View
                          key={`extra-outcome-${outcome.key}`}
                          style={styles.extraOutcomeRow}
                        >
                          <Text style={styles.extraOutcomeLabel}>{outcome.label}</Text>
                          <Text style={styles.extraOutcomeValue}>{outcome.share}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.categoryRow}>
              <Pressable
                onPress={() => setSelectedCategory("all")}
                accessibilityRole="button"
                accessibilityLabel={props.screenCopy.portfolioFilterLabels.all}
                accessibilityState={{ selected: selectedCategory === "all" }}
                style={[
                  styles.categoryChip,
                  selectedCategory === "all" ? styles.categoryChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === "all" ? styles.categoryChipTextActive : null,
                  ]}
                >
                  {props.screenCopy.portfolioFilterLabels.all}
                </Text>
              </Pressable>
              {categoryFilters.map((category) => {
                const active = selectedCategory === category;

                return (
                  <Pressable
                    key={`prediction-category-${category}`}
                    onPress={() => setSelectedCategory(category)}
                    accessibilityRole="button"
                    accessibilityLabel={formatCategoryLabel(category)}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.categoryChip,
                      active ? styles.categoryChipActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        active ? styles.categoryChipTextActive : null,
                      ]}
                    >
                      {formatCategoryLabel(category)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.marketList}>
              {!filteredMarkets.length ? (
                <View style={styles.marketEmptyCard}>
                  <Text style={styles.marketEmptyTitle}>{activeCategoryLabel}</Text>
                  <Text style={styles.helperText}>{props.screenCopy.noMarkets}</Text>
                </View>
              ) : null}

              {filteredMarkets.map((market) => {
                const selected = market.id === props.selectedPredictionMarketId;
                const outcomes = buildOutcomeSummaries(market);

                return (
                  <Pressable
                    key={market.id}
                    onPress={() => props.onSelectPredictionMarket(market.id)}
                    accessibilityRole="button"
                    accessibilityLabel={market.title}
                    accessibilityHint="Double tap to open this prediction market."
                    accessibilityState={{ selected }}
                    testID={buildTestId("prediction-market-card", market.slug)}
                    style={[
                      styles.marketCard,
                      selected ? styles.marketCardSelected : null,
                    ]}
                  >
                    <View style={styles.marketCardAccent} />

                    <View style={styles.marketCardTopRow}>
                      <View style={styles.marketLabelChip}>
                        <Text style={styles.marketLabelChipText}>
                          {formatCategoryLabel(market.category)}
                        </Text>
                      </View>
                      <Text style={styles.marketTimeText}>
                        {getMarketTimeLabel(props.screenCopy, market.status)}{" "}
                        {props.formatOptionalTimestamp(getMarketTimeValue(market)) ??
                          props.screenCopy.summaryEmpty}
                      </Text>
                    </View>

                    <Text style={styles.marketCardTitle}>{market.title}</Text>
                    <Text style={styles.marketCardBody}>
                      {market.description ?? props.screenCopy.noDescription}
                    </Text>

                    {outcomes.length >= 2 ? (
                      <>
                        <View style={styles.marketShareHeader}>
                          <Text style={styles.marketSharePrimary}>
                            {outcomes[0]?.label} {outcomes[0]?.share}
                          </Text>
                          <Text style={styles.marketShareSecondary}>
                            {outcomes[1]?.label} {outcomes[1]?.share}
                          </Text>
                        </View>
                        <View style={styles.marketShareTrack}>
                          <View
                            style={[
                              styles.marketShareFillPrimary,
                              {
                                width: `${Math.max(outcomes[0]?.numericShare ?? 0, 8)}%`,
                              },
                            ]}
                          />
                          <View
                            style={[
                              styles.marketShareFillSecondary,
                              {
                                width: `${Math.max(outcomes[1]?.numericShare ?? 0, 8)}%`,
                              },
                            ]}
                          />
                        </View>
                      </>
                    ) : null}

                    {outcomes.length > 2 ? (
                      <View style={styles.marketOutcomeList}>
                        {outcomes.slice(0, 3).map((outcome) => (
                          <View
                            key={`market-outcome-list-${market.id}-${outcome.key}`}
                            style={styles.marketOutcomeRow}
                          >
                            <Text style={styles.marketOutcomeLabel}>
                              {outcome.label}
                            </Text>
                            <Text style={styles.marketOutcomeValue}>
                              {outcome.share}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.marketFooterRow}>
                      <Text style={styles.marketFooterPool}>
                        {props.screenCopy.totalPool}{" "}
                        {props.formatAmount(market.totalPoolAmount)}
                      </Text>
                      <Text style={styles.marketFooterAction}>
                        {selected
                          ? props.screenCopy.marketDetailTitle
                          : props.screenCopy.focusMarket}
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
                <Text style={styles.helperText}>
                  {props.screenCopy.noMarketSelected}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.helperText}>{props.screenCopy.noMarkets}</Text>
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
                  testID={buildTestId("prediction-market-portfolio-filter", status)}
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
            testID="prediction-market-refresh-history-button"
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
          <Text style={styles.helperText}>
            {props.predictionMarketHistoryStatus === "all"
              ? props.screenCopy.noHoldings
              : props.screenCopy.noFilteredHoldings}
          </Text>
        ) : (
          <Text style={styles.helperText}>{props.screenCopy.noHoldings}</Text>
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
                testID="prediction-market-previous-page-button"
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
                testID="prediction-market-next-page-button"
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
  const outcomes = buildOutcomeSummaries(props.market);

  return (
    <View style={styles.detailStack}>
      <View style={styles.detailHeroCard}>
        <View style={styles.detailHeader}>
          <View style={styles.detailHeaderCopy}>
            <Text style={styles.detailTitle}>{props.market.title}</Text>
            <Text style={styles.detailDescription}>
              {props.market.description ?? props.screenCopy.noDescription}
            </Text>
          </View>
          <View
            style={[styles.statusPill, getMarketStatusTone(props.market.status)]}
          >
            <Text style={styles.statusPillText}>
              {props.screenCopy.marketStatusLabels[props.market.status]}
            </Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard
            label={props.screenCopy.totalPool}
            value={props.formatAmount(props.market.totalPoolAmount)}
          />
          <MetricCard
            label={props.screenCopy.yourExposure}
            value={props.formatAmount(exposureLabel)}
          />
          <MetricCard
            label={props.screenCopy.settlementStatus}
            value={getSettlementLabel(props.screenCopy, props.market)}
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
      </View>

      <View style={styles.outcomeStack}>
        <Text style={styles.detailSubheading}>{props.screenCopy.selectOutcome}</Text>
        <View style={styles.outcomeList}>
          {outcomes.map((outcome) => {
            const selected = outcome.key === props.selectedOutcomeKey;
            const winning = props.market.winningOutcomeKey === outcome.key;

            return (
              <Pressable
                key={`market-outcome-${outcome.key}`}
                onPress={() => props.onSelectOutcome(outcome.key)}
                accessibilityRole="button"
                accessibilityLabel={outcome.label}
                accessibilityHint="Double tap to select this outcome."
                accessibilityState={{ selected }}
                testID={buildTestId("prediction-market-outcome-card", outcome.key)}
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
                  {outcome.positionCount > 0
                    ? props.screenCopy.outcomePool(
                        props.formatAmount(outcome.totalStakeAmount),
                        outcome.positionCount,
                        outcome.share,
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
        <Text style={styles.betPanelLabel}>
          {props.screenCopy.selectedOutcome}
        </Text>
        <Text style={styles.selectedOutcomeValue}>{selectedOutcomeLabel}</Text>
        <Text style={styles.betPanelLabel}>{props.screenCopy.stakeAmount}</Text>
        <TextInput
          value={props.stakeAmount}
          onChangeText={props.onChangeStakeAmount}
          style={styles.stakeInput}
          keyboardType="decimal-pad"
          autoCorrect={false}
          placeholder={props.stakeAmount}
          placeholderTextColor={palette.textMuted}
          testID="prediction-market-stake-input"
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
          fullWidth
          testID="prediction-market-place-position-button"
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
          <Text style={styles.helperText}>{props.screenCopy.noPositions}</Text>
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
    <View
      style={styles.holdingCard}
      testID={buildTestId("prediction-market-portfolio-card", item.market.slug)}
    >
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
        testID={buildTestId("prediction-market-focus-market-button", item.market.slug)}
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
    <View
      style={styles.positionCard}
      testID={buildTestId("prediction-market-position-card", props.outcomeKey)}
    >
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
          style={[styles.statusPill, getPositionStatusTone(props.positionStatus)]}
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
  market: PredictionMarketDetail | PredictionMarketPortfolioMarket | PredictionMarketSummary,
  outcomeKey: string,
) {
  return (
    market.outcomes.find((outcome) => outcome.key === outcomeKey)?.label ??
    outcomeKey
  );
}

function getOutcomePool(
  market: PredictionMarketDetail | PredictionMarketSummary,
  outcomeKey: string,
) {
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
