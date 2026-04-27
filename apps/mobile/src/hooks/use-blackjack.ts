import {
  startTransition,
  useCallback,
  useState,
  type MutableRefObject,
} from "react";
import {
  BLACKJACK_CONFIG,
  type BlackjackAction,
  type BlackjackOverviewResponse,
} from "@reward/shared-types/blackjack";
import { createUserApiClient, type UserApiOverrides } from "@reward/user-core";

import { blackjackStatusLabels } from "../app-support";

type UnauthorizedHandler = (message: string) => Promise<boolean>;

type BlackjackApi = Pick<
  ReturnType<typeof createUserApiClient>,
  "actOnBlackjack" | "getBlackjackOverview" | "startBlackjack"
>;

type UseBlackjackOptions = {
  api: BlackjackApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  refreshRewardCenter: () => Promise<boolean>;
  resetFeedback: () => void;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
  syncBalance: (nextBalance: string) => void;
};

export function useBlackjack(options: UseBlackjackOptions) {
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

  const [blackjackOverview, setBlackjackOverview] =
    useState<BlackjackOverviewResponse | null>(null);
  const [blackjackStakeAmount, setBlackjackStakeAmount] = useState(
    BLACKJACK_CONFIG.minStake,
  );
  const [loadingBlackjack, setLoadingBlackjack] = useState(false);
  const [actingBlackjack, setActingBlackjack] = useState<
    BlackjackAction | "start" | null
  >(null);

  const resetBlackjack = useCallback(() => {
    setBlackjackOverview(null);
    setBlackjackStakeAmount(BLACKJACK_CONFIG.minStake);
    setLoadingBlackjack(false);
    setActingBlackjack(null);
  }, []);

  const refreshBlackjackOverview = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setLoadingBlackjack(true);
      const response = await api.getBlackjackOverview(overrides);

      if (!response.ok) {
        setLoadingBlackjack(false);

        if (response.status === 401) {
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized(
              "Session expired or was revoked. Sign in again.",
            );
          }
          return false;
        }

        setError(response.error?.message ?? "Failed to load blackjack.");
        return false;
      }

      setBlackjackOverview(response.data);
      setBlackjackStakeAmount((current) =>
        current.trim() === "" || current === BLACKJACK_CONFIG.minStake
          ? response.data.config.minStake
          : current,
      );
      syncBalance(response.data.balance);
      setLoadingBlackjack(false);
      return true;
    },
    [api, authTokenRef, handleUnauthorizedRef, setError, syncBalance],
  );

  const startBlackjack = useCallback(async () => {
    const stakeValue = blackjackStakeAmount.trim();
    const numericStake = Number(stakeValue);
    if (!stakeValue || !Number.isFinite(numericStake) || numericStake <= 0) {
      setError("Enter a valid blackjack stake.");
      return;
    }

    resetFeedback();
    setActingBlackjack("start");

    const response = await api.startBlackjack({
      stakeAmount: stakeValue,
    });

    if (!response.ok) {
      setActingBlackjack(null);

      if (response.status === 401) {
        const onUnauthorized = handleUnauthorizedRef.current;
        if (onUnauthorized) {
          await onUnauthorized(
            "Session expired or was revoked. Sign in again.",
          );
        }
        return;
      }

      setError(response.error?.message ?? "Blackjack start failed.");
      return;
    }

    startTransition(() => {
      syncBalance(response.data.balance);
      setBlackjackOverview((current) =>
        current
          ? {
              ...current,
              balance: response.data.balance,
              activeGame:
                response.data.game.status === "active"
                  ? response.data.game
                  : null,
            }
          : current,
      );
    });

    setMessage(
      response.data.game.status === "active"
        ? "Blackjack hand dealt."
        : `Blackjack settled: ${blackjackStatusLabels[response.data.game.status]}.`,
    );
    setActingBlackjack(null);
    await refreshBlackjackOverview();
    await refreshRewardCenter();
  }, [
    api,
    blackjackStakeAmount,
    handleUnauthorizedRef,
    refreshBlackjackOverview,
    refreshRewardCenter,
    resetFeedback,
    setError,
    setMessage,
    syncBalance,
  ]);

  const actOnBlackjack = useCallback(
    async (action: BlackjackAction) => {
      const activeGame = blackjackOverview?.activeGame;
      if (!activeGame) {
        return;
      }

      resetFeedback();
      setActingBlackjack(action);

      const response = await api.actOnBlackjack(activeGame.id, { action });

      if (!response.ok) {
        setActingBlackjack(null);

        if (response.status === 401) {
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized(
              "Session expired or was revoked. Sign in again.",
            );
          }
          return;
        }

        setError(response.error?.message ?? "Blackjack action failed.");
        return;
      }

      setMessage(
        response.data.game.status === "active"
          ? `Blackjack action: ${action}.`
          : `Blackjack settled: ${blackjackStatusLabels[response.data.game.status]}.`,
      );
      setActingBlackjack(null);
      await refreshBlackjackOverview();
      await refreshRewardCenter();
    },
    [
      api,
      blackjackOverview,
      handleUnauthorizedRef,
      refreshBlackjackOverview,
      refreshRewardCenter,
      resetFeedback,
      setError,
      setMessage,
    ],
  );

  return {
    actingBlackjack,
    actOnBlackjack,
    blackjackOverview,
    blackjackStakeAmount,
    loadingBlackjack,
    refreshBlackjackOverview,
    resetBlackjack,
    setBlackjackStakeAmount,
    startBlackjack,
  };
}
