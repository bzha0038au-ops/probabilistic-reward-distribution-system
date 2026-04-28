import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type {
  PredictionMarketDetail,
  PredictionMarketHistoryResponse,
  PredictionMarketPortfolioFilter,
  PredictionMarketSummary,
} from "@reward/shared-types/prediction-market";
import { createUserApiClient, type UserApiOverrides } from "@reward/user-core";

import { formatAmount } from "../app-support";

type UnauthorizedHandler = (message: string) => Promise<boolean>;
type IntervalHandle = ReturnType<typeof setInterval>;

type PredictionMarketApi = Pick<
  ReturnType<typeof createUserApiClient>,
  | "getPredictionMarket"
  | "getPredictionMarketHistory"
  | "listPredictionMarkets"
  | "placePredictionPosition"
>;

type UsePredictionMarketOptions = {
  api: PredictionMarketApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  enabled: boolean;
  refreshBalance: (overrides?: UserApiOverrides) => Promise<boolean>;
  resetFeedback: () => void;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
};

type RefreshPredictionMarketsOptions = {
  preferredMarketId?: number | null;
  background?: boolean;
  overrides?: UserApiOverrides;
};

type RefreshPredictionMarketHistoryOptions = {
  status?: PredictionMarketPortfolioFilter;
  page?: number;
  background?: boolean;
  overrides?: UserApiOverrides;
};

const DEFAULT_PREDICTION_STAKE = "10.00";
const DEFAULT_PREDICTION_MARKET_HISTORY_FILTER = "all";
const DEFAULT_PREDICTION_MARKET_HISTORY_PAGE = 1;
const PREDICTION_MARKET_HISTORY_PAGE_SIZE = 10;
const PREDICTION_MARKET_REFRESH_INTERVAL_MS = 20_000;
const PREDICTION_MARKET_UNAUTHORIZED_MESSAGE =
  "Session expired or was revoked. Sign in again.";

const toPredictionMarketSummary = (
  market: PredictionMarketDetail,
): PredictionMarketSummary => {
  const { userPositions: _userPositions, ...summary } = market;
  return summary;
};

const choosePreferredPredictionMarketId = (
  markets: readonly PredictionMarketSummary[],
  currentMarketId: number | null,
  preferredMarketId?: number | null,
) => {
  const availableIds = new Set(markets.map((market) => market.id));
  const candidates = [
    preferredMarketId,
    currentMarketId,
    markets.find((market) => market.status === "open")?.id,
    markets.find((market) => market.status === "locked")?.id,
    markets[0]?.id ?? null,
  ];

  for (const candidate of candidates) {
    if (
      candidate !== null &&
      candidate !== undefined &&
      availableIds.has(candidate)
    ) {
      return candidate;
    }
  }

  return null;
};

export function usePredictionMarket(options: UsePredictionMarketOptions) {
  const {
    api,
    authTokenRef,
    handleUnauthorizedRef,
    enabled,
    refreshBalance,
    resetFeedback,
    setError,
    setMessage,
  } = options;

  const [predictionMarkets, setPredictionMarkets] = useState<
    PredictionMarketSummary[] | null
  >(null);
  const [predictionMarketDetails, setPredictionMarketDetails] = useState<
    Record<number, PredictionMarketDetail>
  >({});
  const [selectedPredictionMarketId, setSelectedPredictionMarketId] = useState<
    number | null
  >(null);
  const [selectedPredictionOutcomeKey, setSelectedPredictionOutcomeKey] =
    useState<string | null>(null);
  const [predictionMarketStakeAmount, setPredictionMarketStakeAmount] =
    useState(DEFAULT_PREDICTION_STAKE);
  const [predictionMarketHistory, setPredictionMarketHistory] =
    useState<PredictionMarketHistoryResponse | null>(null);
  const [
    predictionMarketHistoryStatus,
    setPredictionMarketHistoryStatus,
  ] = useState<PredictionMarketPortfolioFilter>(
    DEFAULT_PREDICTION_MARKET_HISTORY_FILTER,
  );
  const [predictionMarketHistoryPage, setPredictionMarketHistoryPage] =
    useState(DEFAULT_PREDICTION_MARKET_HISTORY_PAGE);
  const [loadingPredictionMarkets, setLoadingPredictionMarkets] =
    useState(false);
  const [loadingPredictionMarket, setLoadingPredictionMarket] = useState(false);
  const [loadingPredictionMarketHistory, setLoadingPredictionMarketHistory] =
    useState(false);
  const [placingPredictionPosition, setPlacingPredictionPosition] =
    useState(false);

  const selectedPredictionMarketIdRef = useRef<number | null>(null);
  const refreshIntervalRef = useRef<IntervalHandle | null>(null);
  const predictionMarketHistoryStatusRef = useRef<PredictionMarketPortfolioFilter>(
    DEFAULT_PREDICTION_MARKET_HISTORY_FILTER,
  );
  const predictionMarketHistoryPageRef = useRef(
    DEFAULT_PREDICTION_MARKET_HISTORY_PAGE,
  );
  const predictionMarketHistoryRequestIdRef = useRef(0);

  const selectedPredictionMarket =
    selectedPredictionMarketId === null
      ? null
      : predictionMarketDetails[selectedPredictionMarketId] ?? null;
  const detailPredictionMarketHoldings =
    predictionMarkets
      ?.map((market) => predictionMarketDetails[market.id])
      .filter(
        (market): market is PredictionMarketDetail =>
          Boolean(market) && market.userPositions.length > 0,
      ) ?? [];
  const predictionMarketPositionCount =
    predictionMarketHistory?.summary.positionCount ??
    detailPredictionMarketHoldings.reduce(
      (total, market) => total + market.userPositions.length,
      0,
    );

  useEffect(() => {
    selectedPredictionMarketIdRef.current = selectedPredictionMarketId;
  }, [selectedPredictionMarketId]);

  useEffect(() => {
    predictionMarketHistoryStatusRef.current = predictionMarketHistoryStatus;
  }, [predictionMarketHistoryStatus]);

  useEffect(() => {
    predictionMarketHistoryPageRef.current = predictionMarketHistoryPage;
  }, [predictionMarketHistoryPage]);

  const handleUnauthorized = useCallback(async () => {
    const onUnauthorized = handleUnauthorizedRef.current;
    if (onUnauthorized) {
      await onUnauthorized(PREDICTION_MARKET_UNAUTHORIZED_MESSAGE);
    }
  }, [handleUnauthorizedRef]);

  const resetPredictionMarket = useCallback(() => {
    setPredictionMarkets(null);
    setPredictionMarketDetails({});
    setSelectedPredictionMarketId(null);
    setSelectedPredictionOutcomeKey(null);
    setPredictionMarketStakeAmount(DEFAULT_PREDICTION_STAKE);
    setPredictionMarketHistory(null);
    setPredictionMarketHistoryStatus(DEFAULT_PREDICTION_MARKET_HISTORY_FILTER);
    setPredictionMarketHistoryPage(DEFAULT_PREDICTION_MARKET_HISTORY_PAGE);
    setLoadingPredictionMarkets(false);
    setLoadingPredictionMarket(false);
    setLoadingPredictionMarketHistory(false);
    setPlacingPredictionPosition(false);
  }, []);

  const loadPredictionMarketDetails = useCallback(
    async (
      marketIds: readonly number[],
      overrides: UserApiOverrides = {},
    ) => {
      if (marketIds.length === 0) {
        return [] as PredictionMarketDetail[];
      }

      if (!(overrides.authToken ?? authTokenRef.current)) {
        return null;
      }

      const responses = await Promise.all(
        marketIds.map((marketId) => api.getPredictionMarket(marketId, overrides)),
      );
      const unauthorizedResponse = responses.find(
        (response) => !response.ok && response.status === 401,
      );
      if (unauthorizedResponse) {
        await handleUnauthorized();
        return null;
      }

      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        setError(
          failedResponse.error?.message ?? "Failed to load prediction market.",
        );
        return null;
      }

      const details: PredictionMarketDetail[] = [];
      for (const response of responses) {
        if (response.ok) {
          details.push(response.data);
        }
      }

      return details;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const refreshPredictionMarkets = useCallback(
    async (options: RefreshPredictionMarketsOptions = {}) => {
      const overrides = options.overrides ?? {};
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      if (!options.background) {
        setLoadingPredictionMarkets(true);
        setLoadingPredictionMarket(true);
      }

      const listResponse = await api.listPredictionMarkets(overrides);

      if (!options.background) {
        setLoadingPredictionMarkets(false);
      }

      if (!listResponse.ok) {
        if (!options.background) {
          setLoadingPredictionMarket(false);
        }

        if (listResponse.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(
          listResponse.error?.message ?? "Failed to load prediction markets.",
        );
        return false;
      }

      const nextMarkets = listResponse.data;
      const nextSelectedMarketId = choosePreferredPredictionMarketId(
        nextMarkets,
        selectedPredictionMarketIdRef.current,
        options.preferredMarketId,
      );

      startTransition(() => {
        setPredictionMarkets(nextMarkets);
        setSelectedPredictionMarketId(nextSelectedMarketId);

        if (nextMarkets.length === 0) {
          setPredictionMarketDetails({});
        }
      });

      if (nextMarkets.length === 0) {
        if (!options.background) {
          setLoadingPredictionMarket(false);
        }
        return true;
      }

      const details = await loadPredictionMarketDetails(
        nextMarkets.map((market) => market.id),
        overrides,
      );
      if (!details) {
        if (!options.background) {
          setLoadingPredictionMarket(false);
        }
        return false;
      }

      const nextDetails: Record<number, PredictionMarketDetail> = {};
      details.forEach((market) => {
        nextDetails[market.id] = market;
      });

      startTransition(() => {
        setPredictionMarketDetails(nextDetails);
      });

      if (!options.background) {
        setLoadingPredictionMarket(false);
      }

      return true;
    },
    [api, authTokenRef, handleUnauthorized, loadPredictionMarketDetails, setError],
  );

  const refreshPredictionMarketHistory = useCallback(
    async (options: RefreshPredictionMarketHistoryOptions = {}) => {
      const overrides = options.overrides ?? {};
      const status = options.status ?? predictionMarketHistoryStatusRef.current;
      const page = options.page ?? predictionMarketHistoryPageRef.current;
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      const requestId = predictionMarketHistoryRequestIdRef.current + 1;
      predictionMarketHistoryRequestIdRef.current = requestId;

      if (!options.background) {
        setLoadingPredictionMarketHistory(true);
      }

      const response = await api.getPredictionMarketHistory(
        {
          status,
          page,
          limit: PREDICTION_MARKET_HISTORY_PAGE_SIZE,
        },
        overrides,
      );

      if (predictionMarketHistoryRequestIdRef.current !== requestId) {
        return false;
      }

      if (!options.background) {
        setLoadingPredictionMarketHistory(false);
      }

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(
          response.error?.message ??
            "Failed to load prediction market history.",
        );
        return false;
      }

      startTransition(() => {
        setPredictionMarketHistory(response.data);
        setPredictionMarketHistoryStatus(status);
        setPredictionMarketHistoryPage(response.data.page);
      });

      return true;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const selectPredictionMarket = useCallback((marketId: number) => {
    setSelectedPredictionMarketId(marketId);
  }, []);

  const selectPredictionMarketHistoryStatus = useCallback(
    (status: PredictionMarketPortfolioFilter) => {
      setPredictionMarketHistoryStatus((currentStatus) => {
        if (currentStatus === status) {
          return currentStatus;
        }

        return status;
      });
      setPredictionMarketHistoryPage(DEFAULT_PREDICTION_MARKET_HISTORY_PAGE);
    },
    [],
  );

  const goToPreviousPredictionMarketHistoryPage = useCallback(() => {
    setPredictionMarketHistoryPage((currentPage) =>
      currentPage > 1 ? currentPage - 1 : currentPage,
    );
  }, []);

  const goToNextPredictionMarketHistoryPage = useCallback(() => {
    setPredictionMarketHistoryPage((currentPage) => currentPage + 1);
  }, []);

  const placePredictionPosition = useCallback(async () => {
    const market = selectedPredictionMarket;
    if (!market) {
      setError("Prediction market not loaded.");
      return false;
    }

    if (market.status !== "open") {
      setError("Prediction market is not accepting positions.");
      return false;
    }

    if (!selectedPredictionOutcomeKey) {
      setError("Choose an outcome before placing a position.");
      return false;
    }

    const selectedOutcome = market.outcomes.find(
      (outcome) => outcome.key === selectedPredictionOutcomeKey,
    );
    if (!selectedOutcome) {
      setError("Prediction market outcome is invalid.");
      return false;
    }

    const stakeAmount = predictionMarketStakeAmount.trim();
    const numericStake = Number(stakeAmount);
    if (!stakeAmount || !Number.isFinite(numericStake) || numericStake <= 0) {
      setError("Enter a valid prediction market stake.");
      return false;
    }

    resetFeedback();
    setPlacingPredictionPosition(true);

    const response = await api.placePredictionPosition(market.id, {
      outcomeKey: selectedOutcome.key,
      stakeAmount,
    });

    setPlacingPredictionPosition(false);

    if (!response.ok) {
      if (response.status === 401) {
        await handleUnauthorized();
        return false;
      }

      setError(
        response.error?.message ?? "Prediction market position failed.",
      );
      return false;
    }

    startTransition(() => {
      setPredictionMarketDetails((current) => ({
        ...current,
        [response.data.market.id]: response.data.market,
      }));
      setPredictionMarkets((current) =>
        current
          ? current.map((entry) =>
              entry.id === response.data.market.id
                ? toPredictionMarketSummary(response.data.market)
                : entry,
            )
          : current,
      );
      setSelectedPredictionMarketId(response.data.market.id);
    });

    setMessage(
      `Position placed on ${selectedOutcome.label} for ${formatAmount(
        response.data.position.stakeAmount,
      )}.`,
    );
    await Promise.all([
      refreshBalance(),
      refreshPredictionMarketHistory({ background: true }),
    ]);
    return true;
  }, [
    api,
    handleUnauthorized,
    predictionMarketStakeAmount,
    refreshPredictionMarketHistory,
    refreshBalance,
    resetFeedback,
    selectedPredictionMarket,
    selectedPredictionOutcomeKey,
    setError,
    setMessage,
  ]);

  useEffect(() => {
    if (!selectedPredictionMarket) {
      setSelectedPredictionOutcomeKey(null);
      return;
    }

    setSelectedPredictionOutcomeKey((current) => {
      if (
        current &&
        selectedPredictionMarket.outcomes.some((outcome) => outcome.key === current)
      ) {
        return current;
      }

      const openPositionOutcome = selectedPredictionMarket.userPositions.find(
        (position) => position.status === "open",
      )?.outcomeKey;
      if (
        openPositionOutcome &&
        selectedPredictionMarket.outcomes.some(
          (outcome) => outcome.key === openPositionOutcome,
        )
      ) {
        return openPositionOutcome;
      }

      return selectedPredictionMarket.outcomes[0]?.key ?? null;
    });
  }, [selectedPredictionMarket]);

  useEffect(() => {
    if (!enabled || predictionMarkets !== null) {
      return;
    }

    void refreshPredictionMarkets();
  }, [enabled, predictionMarkets, refreshPredictionMarkets]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refreshPredictionMarketHistory({
      status: predictionMarketHistoryStatus,
      page: predictionMarketHistoryPage,
    });
  }, [
    enabled,
    predictionMarketHistoryPage,
    predictionMarketHistoryStatus,
    refreshPredictionMarketHistory,
  ]);

  useEffect(() => {
    if (!enabled) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    refreshIntervalRef.current = setInterval(() => {
      void refreshPredictionMarkets({
        background: true,
        preferredMarketId: selectedPredictionMarketIdRef.current,
      });
      void refreshPredictionMarketHistory({
        background: true,
        status: predictionMarketHistoryStatusRef.current,
        page: predictionMarketHistoryPageRef.current,
      });
    }, PREDICTION_MARKET_REFRESH_INTERVAL_MS);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [enabled, refreshPredictionMarkets]);

  return {
    loadingPredictionMarket,
    loadingPredictionMarketHistory,
    loadingPredictionMarkets,
    placingPredictionPosition,
    goToNextPredictionMarketHistoryPage,
    goToPreviousPredictionMarketHistoryPage,
    placePredictionPosition,
    predictionMarketHistory,
    predictionMarketHistoryPage,
    predictionMarketHistoryStatus,
    predictionMarketPositionCount,
    predictionMarketStakeAmount,
    predictionMarkets,
    refreshPredictionMarketHistory,
    refreshPredictionMarkets,
    resetPredictionMarket,
    selectPredictionMarket,
    selectPredictionMarketHistoryStatus,
    selectedPredictionMarket,
    selectedPredictionMarketId,
    selectedPredictionOutcomeKey,
    setPredictionMarketStakeAmount,
    setSelectedPredictionOutcomeKey,
  };
}
