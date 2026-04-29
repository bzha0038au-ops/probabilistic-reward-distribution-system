import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import type {
  EconomyLedgerEntryRecord,
  GiftEnergyAccountRecord,
  GiftTransferRecord,
} from "@reward/shared-types/economy";
import { createUserApiClient, type UserApiOverrides } from "@reward/user-core";

type UnauthorizedHandler = (message: string) => Promise<boolean>;

type EconomyApi = Pick<
  ReturnType<typeof createUserApiClient>,
  "createGift" | "getEconomyLedger" | "getGiftEnergy" | "listGifts"
>;

type UseEconomyOptions = {
  api: EconomyApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  refreshBalance: () => Promise<boolean>;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
  sessionToken: string | null;
};

export function useEconomy(options: UseEconomyOptions) {
  const {
    api,
    authTokenRef,
    handleUnauthorizedRef,
    refreshBalance,
    setError,
    setMessage,
    sessionToken,
  } = options;

  const [giftEnergy, setGiftEnergy] = useState<GiftEnergyAccountRecord | null>(null);
  const [giftTransfers, setGiftTransfers] = useState<GiftTransferRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<EconomyLedgerEntryRecord[]>(
    [],
  );
  const [loadingEconomy, setLoadingEconomy] = useState(false);
  const [sendingGift, setSendingGift] = useState(false);

  const resetEconomy = useCallback(() => {
    setGiftEnergy(null);
    setGiftTransfers([]);
    setLedgerEntries([]);
    setLoadingEconomy(false);
    setSendingGift(false);
  }, []);

  const handleUnauthorized = useCallback(async () => {
    const onUnauthorized = handleUnauthorizedRef.current;
    if (onUnauthorized) {
      await onUnauthorized("Session expired or was revoked. Sign in again.");
    }
  }, [handleUnauthorizedRef]);

  const refreshEconomy = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setLoadingEconomy(true);
      const [giftEnergyResponse, giftTransfersResponse, ledgerResponse] =
        await Promise.all([
          api.getGiftEnergy(overrides),
          api.listGifts({ limit: 8 }, overrides),
          api.getEconomyLedger({ limit: 8 }, overrides),
        ]);
      setLoadingEconomy(false);

      if (
        giftEnergyResponse.status === 401 ||
        giftTransfersResponse.status === 401 ||
        ledgerResponse.status === 401
      ) {
        await handleUnauthorized();
        return false;
      }

      if (giftEnergyResponse.ok) {
        setGiftEnergy(giftEnergyResponse.data);
      }
      if (giftTransfersResponse.ok) {
        setGiftTransfers(giftTransfersResponse.data);
      }
      if (ledgerResponse.ok) {
        setLedgerEntries(ledgerResponse.data);
      }

      const firstFailure = [
        giftEnergyResponse,
        giftTransfersResponse,
        ledgerResponse,
      ].find((response) => !response.ok);
      if (firstFailure && !firstFailure.ok) {
        setError(firstFailure.error?.message ?? "Failed to load economy data.");
        return false;
      }

      return true;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const sendGift = useCallback(
    async (payload: { receiverUserId: number; amount: string }) => {
      if (!authTokenRef.current) {
        setError("Sign in before sending gifts.");
        return false;
      }

      setSendingGift(true);
      const response = await api.createGift({
        receiverUserId: payload.receiverUserId,
        amount: payload.amount,
        idempotencyKey: `mobile-gift:${payload.receiverUserId}:${Date.now()}`,
      });
      setSendingGift(false);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(response.error?.message ?? "Failed to send gift.");
        return false;
      }

      await Promise.all([refreshBalance(), refreshEconomy()]);
      setMessage("Gift sent.");
      return true;
    },
    [api, authTokenRef, handleUnauthorized, refreshBalance, refreshEconomy, setError, setMessage],
  );

  useEffect(() => {
    if (!sessionToken) {
      resetEconomy();
      return;
    }

    void refreshEconomy();
  }, [refreshEconomy, resetEconomy, sessionToken]);

  return {
    giftEnergy,
    giftTransfers,
    ledgerEntries,
    loadingEconomy,
    refreshEconomy,
    resetEconomy,
    sendGift,
    sendingGift,
  };
}
