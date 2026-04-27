import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type {
  DrawCatalogResponse,
  DrawOverviewResponse,
  DrawPlayResponse,
  DrawPrizePresentation,
  DrawResult,
} from "@reward/shared-types/draw";
import { createUserApiClient, type UserApiOverrides } from "@reward/user-core";

import { getHighlightPrize, getHighlightDrawResult } from "../app-support";
import {
  buildSlotFinale,
  createRollingReels,
  type SlotFinale,
  type SlotReelWindow,
} from "../slot-machine";

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;
type UnauthorizedHandler = (message: string) => Promise<boolean>;

type DrawApi = Pick<
  ReturnType<typeof createUserApiClient>,
  "getDrawOverview" | "playDraw" | "runDraw"
>;

type UseDrawOptions = {
  api: DrawApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  refreshRewardCenter: () => Promise<boolean>;
  resetFeedback: () => void;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
  syncBalance: (nextBalance: string) => void;
};

const calculateFallbackEndingBalance = (
  currentBalance: string | undefined,
  drawCost: string,
  rewardAmount: string,
) => {
  const nextValue =
    Number(currentBalance ?? "0") - Number(drawCost) + Number(rewardAmount);

  if (!Number.isFinite(nextValue)) {
    return currentBalance ?? "0.00";
  }

  return nextValue.toFixed(2);
};

const buildSingleDrawSummary = (
  result: DrawResult,
  overview: DrawOverviewResponse | null,
  currentCatalog: DrawCatalogResponse,
): DrawPlayResponse => ({
  count: 1,
  totalCost: result.drawCost,
  totalReward: result.rewardAmount,
  winCount: result.status === "won" ? 1 : 0,
  endingBalance:
    overview?.balance ??
    calculateFallbackEndingBalance(
      currentCatalog.balance,
      result.drawCost,
      result.rewardAmount,
    ),
  highestRarity: result.prize?.displayRarity ?? null,
  pity: overview?.pity ?? currentCatalog.pity,
  results: [result],
});

export function useDraw(options: UseDrawOptions) {
  const {
    api,
    authTokenRef,
    handleUnauthorizedRef,
    refreshRewardCenter,
    resetFeedback,
    setError,
    setMessage,
    syncBalance,
  } = options;

  const [drawCatalog, setDrawCatalog] = useState<DrawCatalogResponse | null>(
    null,
  );
  const [lastDrawPlay, setLastDrawPlay] = useState<DrawPlayResponse | null>(
    null,
  );
  const [loadingDrawCatalog, setLoadingDrawCatalog] = useState(false);
  const [playingDrawCount, setPlayingDrawCount] = useState<number | null>(null);
  const [gachaReels, setGachaReels] = useState<
    [SlotReelWindow, SlotReelWindow, SlotReelWindow]
  >(() => createRollingReels([]));
  const [gachaLockedReels, setGachaLockedReels] = useState(0);
  const [gachaAnimating, setGachaAnimating] = useState(false);
  const [gachaTone, setGachaTone] = useState<"idle" | SlotFinale["tone"]>(
    "idle",
  );

  const gachaIntervalRef = useRef<IntervalHandle | null>(null);
  const gachaTimeoutsRef = useRef<TimeoutHandle[]>([]);
  const gachaLockedReelsRef = useRef(0);
  const gachaFinaleRef = useRef<SlotFinale | null>(null);
  const gachaSpinStartedAtRef = useRef(0);

  const featuredPrizes = drawCatalog?.featuredPrizes.length
    ? drawCatalog.featuredPrizes
    : (drawCatalog?.prizes ?? []).slice(0, 4);
  const multiDrawCount = drawCatalog?.recommendedBatchCount ?? 1;
  const highlightPrize = lastDrawPlay
    ? getHighlightPrize(lastDrawPlay.results)
    : (featuredPrizes[0] ?? null);
  const drawPrizeSignature = (drawCatalog?.prizes ?? [])
    .map((prize) => prize.id)
    .join(":");

  const clearGachaAnimation = useCallback(() => {
    gachaTimeoutsRef.current.forEach(clearTimeout);
    gachaTimeoutsRef.current = [];

    if (gachaIntervalRef.current) {
      clearInterval(gachaIntervalRef.current);
      gachaIntervalRef.current = null;
    }
  }, []);

  const resetDraw = useCallback(() => {
    clearGachaAnimation();
    gachaLockedReelsRef.current = 0;
    gachaFinaleRef.current = null;
    gachaSpinStartedAtRef.current = 0;
    setDrawCatalog(null);
    setLastDrawPlay(null);
    setLoadingDrawCatalog(false);
    setPlayingDrawCount(null);
    setGachaReels(createRollingReels([]));
    setGachaLockedReels(0);
    setGachaAnimating(false);
    setGachaTone("idle");
  }, [clearGachaAnimation]);

  const startGachaSpin = useCallback(
    (prizes: readonly DrawPrizePresentation[]) => {
      clearGachaAnimation();
      gachaSpinStartedAtRef.current = Date.now();
      gachaLockedReelsRef.current = 0;
      gachaFinaleRef.current = null;

      setGachaAnimating(true);
      setGachaLockedReels(0);
      setGachaTone("idle");
      setGachaReels(createRollingReels(prizes));

      gachaIntervalRef.current = setInterval(() => {
        setGachaReels(
          createRollingReels(
            prizes,
            gachaFinaleRef.current,
            gachaLockedReelsRef.current,
          ),
        );
      }, 120);
    },
    [clearGachaAnimation],
  );

  const settleGachaSpin = useCallback(
    (response: DrawPlayResponse, prizes: readonly DrawPrizePresentation[]) => {
      const highlightResult = getHighlightDrawResult(response.results);
      const finale = highlightResult
        ? buildSlotFinale(highlightResult, prizes)
        : null;
      const minimumSpinMs = 1100;
      const remainingSpinMs = Math.max(
        0,
        minimumSpinMs - (Date.now() - gachaSpinStartedAtRef.current),
      );

      const finalizeWithoutReels = () => {
        clearGachaAnimation();
        setGachaAnimating(false);
        setGachaLockedReels(0);
        setGachaTone("idle");
      };

      if (!finale) {
        const timeoutHandle = setTimeout(finalizeWithoutReels, remainingSpinMs);
        gachaTimeoutsRef.current.push(timeoutHandle);
        return;
      }

      gachaFinaleRef.current = finale;

      const lockReel = (lockedCount: number) => {
        gachaLockedReelsRef.current = lockedCount;
        setGachaLockedReels(lockedCount);
        setGachaReels(createRollingReels(prizes, finale, lockedCount));

        if (lockedCount === 3) {
          clearGachaAnimation();
          setGachaTone(finale.tone);
          setGachaAnimating(false);
        }
      };

      [1, 2, 3].forEach((lockedCount, index) => {
        const timeoutHandle = setTimeout(
          () => {
            lockReel(lockedCount);
          },
          remainingSpinMs + 220 + index * 260,
        );
        gachaTimeoutsRef.current.push(timeoutHandle);
      });
    },
    [clearGachaAnimation],
  );

  const loadDrawOverview = useCallback(
    async (overrides: UserApiOverrides = {}) => api.getDrawOverview(overrides),
    [api],
  );

  const refreshDrawCatalog = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setLoadingDrawCatalog(true);
      const response = await loadDrawOverview(overrides);

      if (!response.ok) {
        setLoadingDrawCatalog(false);

        if (response.status === 401) {
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized(
              "Session expired or was revoked. Sign in again.",
            );
          }
          return false;
        }

        setError(response.error?.message ?? "Failed to load the slot machine.");
        return false;
      }

      setDrawCatalog(response.data);
      syncBalance(response.data.balance);
      setLoadingDrawCatalog(false);
      return true;
    },
    [
      authTokenRef,
      handleUnauthorizedRef,
      loadDrawOverview,
      setError,
      syncBalance,
    ],
  );

  const playDraw = useCallback(
    async (count: number) => {
      if (!drawCatalog) {
        return;
      }

      resetFeedback();
      startGachaSpin(drawCatalog.prizes);
      setPlayingDrawCount(count);

      if (count === 1) {
        const response = await api.runDraw({});

        if (!response.ok) {
          clearGachaAnimation();
          setGachaAnimating(false);
          setGachaLockedReels(0);
          setGachaTone("idle");
          setGachaReels(createRollingReels(drawCatalog.prizes));

          if (response.status === 401) {
            setPlayingDrawCount(null);
            const onUnauthorized = handleUnauthorizedRef.current;
            if (onUnauthorized) {
              await onUnauthorized(
                "Session expired or was revoked. Sign in again.",
              );
            }
            return;
          }

          setError(response.error?.message ?? "Slot spin failed.");
          setPlayingDrawCount(null);
          return;
        }

        const overviewResponse = await loadDrawOverview();
        const nextDrawPlay: DrawPlayResponse = buildSingleDrawSummary(
          response.data as DrawResult,
          overviewResponse.ok ? overviewResponse.data : null,
          drawCatalog,
        );

        settleGachaSpin(nextDrawPlay, drawCatalog.prizes);

        startTransition(() => {
          setLastDrawPlay(nextDrawPlay);
          syncBalance(nextDrawPlay.endingBalance);
          setDrawCatalog((current) =>
            current
              ? {
                  ...current,
                  balance: nextDrawPlay.endingBalance,
                  pity: nextDrawPlay.pity,
                }
              : current,
          );
        });

        setMessage("Spin completed.");
        setPlayingDrawCount(null);

        await Promise.all([refreshDrawCatalog(), refreshRewardCenter()]);
        return;
      }

      const response = await api.playDraw({ count });

      if (!response.ok) {
        clearGachaAnimation();
        setGachaAnimating(false);
        setGachaLockedReels(0);
        setGachaTone("idle");
        setGachaReels(createRollingReels(drawCatalog.prizes));

        if (response.status === 401) {
          setPlayingDrawCount(null);
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized(
              "Session expired or was revoked. Sign in again.",
            );
          }
          return;
        }

        setError(response.error?.message ?? "Slot spin failed.");
        setPlayingDrawCount(null);
        return;
      }

      const nextDrawPlay: DrawPlayResponse = response.data as DrawPlayResponse;

      settleGachaSpin(nextDrawPlay, drawCatalog.prizes);

      startTransition(() => {
        setLastDrawPlay(nextDrawPlay);
        syncBalance(nextDrawPlay.endingBalance);
        setDrawCatalog((current) =>
          current
            ? {
                ...current,
                balance: nextDrawPlay.endingBalance,
                pity: nextDrawPlay.pity,
              }
            : current,
        );
      });

      setMessage(count > 1 ? `${count}-spin completed.` : "Spin completed.");
      setPlayingDrawCount(null);

      await Promise.all([refreshDrawCatalog(), refreshRewardCenter()]);
    },
    [
      api,
      clearGachaAnimation,
      drawCatalog,
      handleUnauthorizedRef,
      loadDrawOverview,
      refreshDrawCatalog,
      refreshRewardCenter,
      resetFeedback,
      setError,
      setMessage,
      settleGachaSpin,
      startGachaSpin,
      syncBalance,
    ],
  );

  useEffect(() => {
    if (gachaAnimating) {
      return;
    }

    setGachaLockedReels(0);
    setGachaTone("idle");
    setGachaReels(createRollingReels(drawCatalog?.prizes ?? []));
  }, [drawPrizeSignature, drawCatalog?.fairness.commitHash, gachaAnimating]);

  useEffect(() => {
    return () => {
      clearGachaAnimation();
    };
  }, [clearGachaAnimation]);

  return {
    drawCatalog,
    featuredPrizes,
    gachaAnimating,
    gachaLockedReels,
    gachaReels,
    gachaTone,
    highlightPrize,
    lastDrawPlay,
    loadingDrawCatalog,
    multiDrawCount,
    playDraw,
    playingDrawCount,
    refreshDrawCatalog,
    resetDraw,
  };
}
