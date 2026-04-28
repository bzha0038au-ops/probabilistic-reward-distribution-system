import { useCallback, useState, type MutableRefObject } from "react";
import type { KycUserProfile } from "@reward/shared-types/kyc";
import { createUserApiClient, type UserApiOverrides } from "@reward/user-core";

type UnauthorizedHandler = (message: string) => Promise<boolean>;

type KycApi = Pick<ReturnType<typeof createUserApiClient>, "getKycProfile">;

type UseKycProfileOptions = {
  api: KycApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  setError: (message: string | null) => void;
};

export function useKycProfile(options: UseKycProfileOptions) {
  const { api, authTokenRef, handleUnauthorizedRef, setError } = options;

  const [kycProfile, setKycProfile] = useState<KycUserProfile | null>(null);
  const [loadingKycProfile, setLoadingKycProfile] = useState(false);

  const resetKycProfile = useCallback(() => {
    setKycProfile(null);
    setLoadingKycProfile(false);
  }, []);

  const refreshKycProfile = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setLoadingKycProfile(true);
      const response = await api.getKycProfile(overrides);

      if (!response.ok) {
        setLoadingKycProfile(false);

        if (response.status === 401) {
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized("Session expired or was revoked. Sign in again.");
          }
          return false;
        }

        setError(response.error?.message ?? "Failed to load KYC profile.");
        return false;
      }

      setKycProfile(response.data);
      setLoadingKycProfile(false);
      return true;
    },
    [api, authTokenRef, handleUnauthorizedRef, setError],
  );

  return {
    kycProfile,
    loadingKycProfile,
    refreshKycProfile,
    resetKycProfile,
  };
}
