import { useCallback, useState, type MutableRefObject } from "react";
import type {
  RewardCenterResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";
import { createUserApiClient, type UserApiOverrides } from "@reward/user-core";

import { formatAmount } from "../app-support";

type UnauthorizedHandler = (message: string) => Promise<boolean>;

type RewardCenterApi = Pick<
  ReturnType<typeof createUserApiClient>,
  "claimRewardMission" | "getRewardCenter"
>;

type UseRewardCenterOptions = {
  api: RewardCenterApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  resetFeedback: () => void;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
};

export function useRewardCenter(options: UseRewardCenterOptions) {
  const {
    api,
    authTokenRef,
    handleUnauthorizedRef,
    resetFeedback,
    setError,
    setMessage,
  } = options;

  const [rewardCenter, setRewardCenter] = useState<RewardCenterResponse | null>(
    null,
  );
  const [loadingRewardCenter, setLoadingRewardCenter] = useState(false);
  const [claimingMissionId, setClaimingMissionId] =
    useState<RewardMissionId | null>(null);

  const resetRewardCenter = useCallback(() => {
    setRewardCenter(null);
    setLoadingRewardCenter(false);
    setClaimingMissionId(null);
  }, []);

  const refreshRewardCenter = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setLoadingRewardCenter(true);
      const response = await api.getRewardCenter(overrides);

      if (!response.ok) {
        setLoadingRewardCenter(false);

        if (response.status === 401) {
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized(
              "Session expired or was revoked. Sign in again.",
            );
          }
          return false;
        }

        setError(
          response.error?.message ?? "Failed to load the reward center.",
        );
        return false;
      }

      setRewardCenter(response.data);
      setLoadingRewardCenter(false);
      return true;
    },
    [api, authTokenRef, handleUnauthorizedRef, setError],
  );

  const claimReward = useCallback(
    async (missionId: RewardMissionId) => {
      if (!authTokenRef.current) {
        return;
      }

      resetFeedback();
      setClaimingMissionId(missionId);
      const response = await api.claimRewardMission(missionId);

      if (!response.ok) {
        setClaimingMissionId(null);

        if (response.status === 401) {
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized(
              "Session expired or was revoked. Sign in again.",
            );
          }
          return;
        }

        setError(
          response.error?.message ?? "Failed to claim the reward mission.",
        );
        return;
      }

      setMessage(
        `Reward claimed: +${formatAmount(response.data.grantedAmount)} bonus.`,
      );
      await refreshRewardCenter();
      setClaimingMissionId(null);
    },
    [
      api,
      authTokenRef,
      handleUnauthorizedRef,
      refreshRewardCenter,
      resetFeedback,
      setError,
      setMessage,
    ],
  );

  return {
    claimingMissionId,
    claimReward,
    loadingRewardCenter,
    refreshRewardCenter,
    resetRewardCenter,
    rewardCenter,
  };
}
