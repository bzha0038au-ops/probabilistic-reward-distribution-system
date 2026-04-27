import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  QUICK_EIGHT_CONFIG,
  type QuickEightRound,
} from "@reward/shared-types/quick-eight";
import { createUserApiClient } from "@reward/user-core";

import {
  formatAmount,
  isQuickEightStakeValid,
  normalizeQuickEightNumbers,
} from "../app-support";

type TimeoutHandle = ReturnType<typeof setTimeout>;
type UnauthorizedHandler = (message: string) => Promise<boolean>;

type QuickEightApi = Pick<
  ReturnType<typeof createUserApiClient>,
  "playQuickEight"
>;

type UseQuickEightOptions = {
  api: QuickEightApi;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  refreshBalance: () => Promise<boolean>;
  refreshRewardCenter: () => Promise<boolean>;
  resetFeedback: () => void;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
};

export function useQuickEight(options: UseQuickEightOptions) {
  const {
    api,
    handleUnauthorizedRef,
    refreshBalance,
    refreshRewardCenter,
    resetFeedback,
    setError,
    setMessage,
  } = options;

  const [quickEightSelection, setQuickEightSelection] = useState<number[]>([]);
  const [quickEightStakeAmount, setQuickEightStakeAmount] = useState(
    QUICK_EIGHT_CONFIG.minStake,
  );
  const [quickEightResult, setQuickEightResult] =
    useState<QuickEightRound | null>(null);
  const [playingQuickEight, setPlayingQuickEight] = useState(false);
  const [revealedQuickEightCount, setRevealedQuickEightCount] = useState(0);

  const quickEightRevealTimeoutsRef = useRef<TimeoutHandle[]>([]);

  const visibleQuickEightDrawnNumbers = quickEightResult
    ? quickEightResult.drawnNumbers.slice(0, revealedQuickEightCount)
    : [];
  const quickEightMatchedSet = new Set(quickEightResult?.matchedNumbers ?? []);

  const clearQuickEightReveal = useCallback(() => {
    quickEightRevealTimeoutsRef.current.forEach(clearTimeout);
    quickEightRevealTimeoutsRef.current = [];
  }, []);

  const resetQuickEight = useCallback(() => {
    clearQuickEightReveal();
    setPlayingQuickEight(false);
    setQuickEightSelection([]);
    setQuickEightStakeAmount(QUICK_EIGHT_CONFIG.minStake);
    setQuickEightResult(null);
    setRevealedQuickEightCount(0);
  }, [clearQuickEightReveal]);

  const revealQuickEightRound = useCallback(
    (round: QuickEightRound) => {
      clearQuickEightReveal();
      setQuickEightResult(round);
      setRevealedQuickEightCount(0);

      round.drawnNumbers.forEach((_, index) => {
        const timeoutHandle = setTimeout(
          () => {
            setRevealedQuickEightCount(index + 1);
          },
          120 + index * 70,
        );
        quickEightRevealTimeoutsRef.current.push(timeoutHandle);
      });
    },
    [clearQuickEightReveal],
  );

  const toggleQuickEightNumber = useCallback((value: number) => {
    setQuickEightSelection((current) => {
      if (current.includes(value)) {
        return current.filter((entry) => entry !== value);
      }

      if (current.length >= QUICK_EIGHT_CONFIG.pickCount) {
        return current;
      }

      return normalizeQuickEightNumbers([...current, value]);
    });
  }, []);

  const clearQuickEightSelection = useCallback(() => {
    setQuickEightSelection([]);
  }, []);

  const playQuickEight = useCallback(async () => {
    if (quickEightSelection.length !== QUICK_EIGHT_CONFIG.pickCount) {
      setError(`Select exactly ${QUICK_EIGHT_CONFIG.pickCount} numbers first.`);
      return;
    }

    if (!isQuickEightStakeValid(quickEightStakeAmount)) {
      setError(
        `Stake must be between ${QUICK_EIGHT_CONFIG.minStake} and ${QUICK_EIGHT_CONFIG.maxStake}.`,
      );
      return;
    }

    resetFeedback();
    clearQuickEightReveal();
    setPlayingQuickEight(true);

    const response = await api.playQuickEight({
      numbers: quickEightSelection,
      stakeAmount: quickEightStakeAmount.trim(),
    });

    if (!response.ok) {
      setPlayingQuickEight(false);

      if (response.status === 401) {
        const onUnauthorized = handleUnauthorizedRef.current;
        if (onUnauthorized) {
          await onUnauthorized(
            "Session expired or was revoked. Sign in again.",
          );
        }
        return;
      }

      setError(response.error?.message ?? "Quick Eight play failed.");
      return;
    }

    startTransition(() => {
      setQuickEightSelection(response.data.selectedNumbers);
      setQuickEightStakeAmount(response.data.stakeAmount);
      revealQuickEightRound(response.data);
    });

    setPlayingQuickEight(false);
    setMessage(
      response.data.status === "won"
        ? `Quick Eight paid ${formatAmount(response.data.payoutAmount)} on ${response.data.hitCount} hits.`
        : "Quick Eight settled with no payout.",
    );

    await Promise.all([refreshBalance(), refreshRewardCenter()]);
  }, [
    api,
    clearQuickEightReveal,
    handleUnauthorizedRef,
    quickEightSelection,
    quickEightStakeAmount,
    refreshBalance,
    refreshRewardCenter,
    resetFeedback,
    revealQuickEightRound,
    setError,
    setMessage,
  ]);

  useEffect(() => {
    return () => {
      clearQuickEightReveal();
    };
  }, [clearQuickEightReveal]);

  return {
    clearQuickEightSelection,
    playQuickEight,
    playingQuickEight,
    quickEightMatchedSet,
    quickEightResult,
    quickEightSelection,
    quickEightStakeAmount,
    resetQuickEight,
    setQuickEightStakeAmount,
    toggleQuickEightNumber,
    visibleQuickEightDrawnNumbers,
  };
}
