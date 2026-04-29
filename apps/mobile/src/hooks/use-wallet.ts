import { useCallback, useState, type MutableRefObject } from 'react';
import type { WalletBalanceResponse } from '@reward/shared-types/user';
import { createUserApiClient, type UserApiOverrides } from '@reward/user-core';

type UnauthorizedHandler = (message: string) => Promise<boolean>;

type WalletApi = Pick<
  ReturnType<typeof createUserApiClient>,
  'getWalletBalance'
>;

type UseWalletOptions = {
  api: WalletApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  setError: (message: string | null) => void;
};

export function useWallet(options: UseWalletOptions) {
  const { api, authTokenRef, handleUnauthorizedRef, setError } = options;

  const [balance, setBalance] = useState('0');
  const [wallet, setWallet] = useState<WalletBalanceResponse | null>(null);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  const resetWallet = useCallback(() => {
    setBalance('0');
    setWallet(null);
    setRefreshingBalance(false);
  }, []);

  const syncBalance = useCallback((nextBalance: string) => {
    setBalance(nextBalance);
  }, []);

  const refreshBalance = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setRefreshingBalance(true);
      const response = await api.getWalletBalance(overrides);

      if (!response.ok) {
        setRefreshingBalance(false);

        if (response.status === 401) {
          const onUnauthorized = handleUnauthorizedRef.current;
          if (onUnauthorized) {
            await onUnauthorized('Session expired or was revoked. Sign in again.');
          }
          return false;
        }

        setError(response.error?.message ?? 'Failed to refresh wallet balance.');
        return false;
      }

      setWallet(response.data);
      setBalance(response.data.balance.withdrawableBalance);
      setRefreshingBalance(false);
      return true;
    },
    [api, authTokenRef, handleUnauthorizedRef, setError]
  );

  return {
    balance,
    wallet,
    refreshingBalance,
    refreshBalance,
    resetWallet,
    syncBalance,
  };
}
