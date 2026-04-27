import { useCallback, useEffect, useState } from "react";
import type {
  FairnessCommit,
  FairnessReveal,
} from "@reward/shared-types/fairness";
import { createUserApiClient, verifyFairnessReveal } from "@reward/user-core";

import type { getMobileFairnessCopy } from "../fairness";

type FairnessApi = Pick<
  ReturnType<typeof createUserApiClient>,
  "getFairnessCommit" | "revealFairnessSeed"
>;

type UseFairnessOptions = {
  api: FairnessApi;
  copy: ReturnType<typeof getMobileFairnessCopy>;
  resetFeedback: () => void;
  setMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
};

export function useFairness(options: UseFairnessOptions) {
  const { api, copy, resetFeedback, setMessage, setError } = options;

  const [fairnessCommit, setFairnessCommit] = useState<FairnessCommit | null>(
    null,
  );
  const [fairnessReveal, setFairnessReveal] = useState<FairnessReveal | null>(
    null,
  );
  const [fairnessRevealEpoch, setFairnessRevealEpoch] = useState("");
  const [loadingFairnessCommit, setLoadingFairnessCommit] = useState(false);
  const [revealingFairness, setRevealingFairness] = useState(false);

  const fairnessVerification = fairnessReveal
    ? verifyFairnessReveal(fairnessReveal)
    : null;

  const resetFairness = useCallback(() => {
    setFairnessCommit(null);
    setFairnessReveal(null);
    setFairnessRevealEpoch("");
    setLoadingFairnessCommit(false);
    setRevealingFairness(false);
  }, []);

  const refreshFairnessCommit = useCallback(async () => {
    setLoadingFairnessCommit(true);
    const response = await api.getFairnessCommit({ auth: false });

    if (!response.ok) {
      setLoadingFairnessCommit(false);
      setError(response.error?.message ?? copy.loadFailed);
      return false;
    }

    setFairnessCommit(response.data);
    setLoadingFairnessCommit(false);
    return true;
  }, [api, copy.loadFailed, setError]);

  const revealFairness = useCallback(async () => {
    resetFeedback();

    const epoch = Number(fairnessRevealEpoch.trim());
    if (!Number.isFinite(epoch) || epoch < 0) {
      setError(copy.invalidEpoch);
      return;
    }

    setRevealingFairness(true);
    const response = await api.revealFairnessSeed(epoch, { auth: false });

    if (!response.ok) {
      setRevealingFairness(false);
      setError(response.error?.message ?? copy.revealFailed);
      return;
    }

    setFairnessReveal(response.data);
    setMessage(copy.revealedSuccess(response.data.epoch));
    setRevealingFairness(false);
  }, [api, copy, fairnessRevealEpoch, resetFeedback, setError, setMessage]);

  useEffect(() => {
    if (!fairnessCommit || fairnessRevealEpoch) {
      return;
    }

    if (fairnessCommit.epoch > 0) {
      setFairnessRevealEpoch(String(fairnessCommit.epoch - 1));
    }
  }, [fairnessCommit, fairnessRevealEpoch]);

  return {
    fairnessCommit,
    fairnessReveal,
    fairnessRevealEpoch,
    fairnessVerification,
    loadingFairnessCommit,
    revealingFairness,
    refreshFairnessCommit,
    revealFairness,
    resetFairness,
    setFairnessRevealEpoch,
  };
}
