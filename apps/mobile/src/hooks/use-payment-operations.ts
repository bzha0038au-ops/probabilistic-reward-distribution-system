import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import type {
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  DepositRecord,
  WithdrawalRecord,
} from "@reward/shared-types/finance";
import {
  createUserApiClient,
  type BankCardCreateRequest,
  type CryptoDepositCreateRequest,
  type CryptoWithdrawAddressCreateRequest,
  type TopUpCreateRequest,
  type UserApiOverrides,
  type WithdrawalCreateRequest,
} from "@reward/user-core";

type UnauthorizedHandler = (message: string) => Promise<boolean>;

type PaymentsApi = Pick<
  ReturnType<typeof createUserApiClient>,
  | "createBankCard"
  | "createCryptoDeposit"
  | "createCryptoWithdrawAddress"
  | "createCryptoWithdrawal"
  | "createTopUp"
  | "createWithdrawal"
  | "listBankCards"
  | "listCryptoDepositChannels"
  | "listCryptoWithdrawAddresses"
  | "listTopUps"
  | "listWithdrawals"
  | "setDefaultBankCard"
  | "setDefaultCryptoWithdrawAddress"
>;

type UsePaymentOperationsOptions = {
  api: PaymentsApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  refreshBalance: () => Promise<boolean>;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
  sessionToken: string | null;
};

const UNAUTHORIZED_MESSAGE = "Session expired or was revoked. Sign in again.";

export function usePaymentOperations(options: UsePaymentOperationsOptions) {
  const {
    api,
    authTokenRef,
    handleUnauthorizedRef,
    refreshBalance,
    setError,
    setMessage,
    sessionToken,
  } = options;

  const [bankCards, setBankCards] = useState<BankCardRecord[]>([]);
  const [cryptoChannels, setCryptoChannels] = useState<CryptoDepositChannelRecord[]>([]);
  const [cryptoAddresses, setCryptoAddresses] = useState<
    CryptoWithdrawAddressViewRecord[]
  >([]);
  const [topUps, setTopUps] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [activePaymentAction, setActivePaymentAction] = useState<string | null>(null);
  const [hasLoadedPayments, setHasLoadedPayments] = useState(false);

  const handleUnauthorized = useCallback(async () => {
    const onUnauthorized = handleUnauthorizedRef.current;
    if (onUnauthorized) {
      await onUnauthorized(UNAUTHORIZED_MESSAGE);
    }
  }, [handleUnauthorizedRef]);

  const resetPaymentOperations = useCallback(() => {
    setBankCards([]);
    setCryptoChannels([]);
    setCryptoAddresses([]);
    setTopUps([]);
    setWithdrawals([]);
    setLoadingPayments(false);
    setActivePaymentAction(null);
    setHasLoadedPayments(false);
  }, []);

  const refreshPaymentOperations = useCallback(
    async (overrides: UserApiOverrides = {}) => {
      if (!(overrides.authToken ?? authTokenRef.current)) {
        return false;
      }

      setLoadingPayments(true);
      const [
        bankCardsResponse,
        cryptoChannelsResponse,
        cryptoAddressesResponse,
        topUpsResponse,
        withdrawalsResponse,
      ] = await Promise.all([
        api.listBankCards(overrides),
        api.listCryptoDepositChannels(overrides),
        api.listCryptoWithdrawAddresses(overrides),
        api.listTopUps(6, overrides),
        api.listWithdrawals(6, overrides),
      ]);
      setLoadingPayments(false);

      if (
        bankCardsResponse.status === 401 ||
        cryptoChannelsResponse.status === 401 ||
        cryptoAddressesResponse.status === 401 ||
        topUpsResponse.status === 401 ||
        withdrawalsResponse.status === 401
      ) {
        await handleUnauthorized();
        return false;
      }

      if (bankCardsResponse.ok) {
        setBankCards(bankCardsResponse.data);
      }
      if (cryptoChannelsResponse.ok) {
        setCryptoChannels(cryptoChannelsResponse.data);
      }
      if (cryptoAddressesResponse.ok) {
        setCryptoAddresses(cryptoAddressesResponse.data);
      }
      if (topUpsResponse.ok) {
        setTopUps(topUpsResponse.data);
      }
      if (withdrawalsResponse.ok) {
        setWithdrawals(withdrawalsResponse.data);
      }

      const firstFailure = [
        bankCardsResponse,
        cryptoChannelsResponse,
        cryptoAddressesResponse,
        topUpsResponse,
        withdrawalsResponse,
      ].find((response) => !response.ok);
      if (firstFailure && !firstFailure.ok) {
        setError(firstFailure.error?.message ?? "Failed to load payment operations.");
        return false;
      }

      setHasLoadedPayments(true);
      return true;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const runPaymentAction = useCallback(
    async (
      actionKey: string,
      successMessage: string,
      action: () => Promise<{
        ok: boolean;
        status?: number;
        error?: { message?: string };
      }>,
      options: { refreshBalanceAfter?: boolean } = {},
    ) => {
      if (!authTokenRef.current) {
        setError("Sign in before editing payment operations.");
        return false;
      }

      setActivePaymentAction(actionKey);
      const response = await action();
      setActivePaymentAction(null);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(response.error?.message ?? "Payment action failed.");
        return false;
      }

      await refreshPaymentOperations();
      if (options.refreshBalanceAfter) {
        await refreshBalance();
      }
      setMessage(successMessage);
      return true;
    },
    [
      authTokenRef,
      handleUnauthorized,
      refreshBalance,
      refreshPaymentOperations,
      setError,
      setMessage,
    ],
  );

  const createTopUp = useCallback(
    async (payload: TopUpCreateRequest, successMessage: string) =>
      runPaymentAction("top-up", successMessage, () => api.createTopUp(payload)),
    [api, runPaymentAction],
  );

  const createCryptoDeposit = useCallback(
    async (payload: CryptoDepositCreateRequest, successMessage: string) =>
      runPaymentAction(
        "crypto-deposit",
        successMessage,
        () => api.createCryptoDeposit(payload),
      ),
    [api, runPaymentAction],
  );

  const createBankCard = useCallback(
    async (payload: BankCardCreateRequest, successMessage: string) =>
      runPaymentAction(
        "bank-card",
        successMessage,
        () => api.createBankCard(payload),
      ),
    [api, runPaymentAction],
  );

  const setDefaultBankCard = useCallback(
    async (bankCardId: number, successMessage: string) =>
      runPaymentAction(
        `bank-default:${bankCardId}`,
        successMessage,
        () => api.setDefaultBankCard(bankCardId),
      ),
    [api, runPaymentAction],
  );

  const createWithdrawal = useCallback(
    async (payload: WithdrawalCreateRequest, successMessage: string) =>
      runPaymentAction(
        "bank-withdrawal",
        successMessage,
        () => api.createWithdrawal(payload),
        { refreshBalanceAfter: true },
      ),
    [api, runPaymentAction],
  );

  const createCryptoWithdrawAddress = useCallback(
    async (payload: CryptoWithdrawAddressCreateRequest, successMessage: string) =>
      runPaymentAction(
        "crypto-address",
        successMessage,
        () => api.createCryptoWithdrawAddress(payload),
      ),
    [api, runPaymentAction],
  );

  const setDefaultCryptoWithdrawAddress = useCallback(
    async (payoutMethodId: number, successMessage: string) =>
      runPaymentAction(
        `crypto-default:${payoutMethodId}`,
        successMessage,
        () => api.setDefaultCryptoWithdrawAddress(payoutMethodId),
      ),
    [api, runPaymentAction],
  );

  const createCryptoWithdrawal = useCallback(
    async (payload: WithdrawalCreateRequest, successMessage: string) =>
      runPaymentAction(
        "crypto-withdrawal",
        successMessage,
        () => api.createCryptoWithdrawal(payload),
        { refreshBalanceAfter: true },
      ),
    [api, runPaymentAction],
  );

  useEffect(() => {
    if (!sessionToken) {
      resetPaymentOperations();
    }
  }, [resetPaymentOperations, sessionToken]);

  return {
    activePaymentAction,
    bankCards,
    createBankCard,
    createCryptoDeposit,
    createCryptoWithdrawAddress,
    createCryptoWithdrawal,
    createTopUp,
    createWithdrawal,
    cryptoAddresses,
    cryptoChannels,
    hasLoadedPayments,
    loadingPayments,
    refreshPaymentOperations,
    resetPaymentOperations,
    setDefaultBankCard,
    setDefaultCryptoWithdrawAddress,
    topUps,
    withdrawals,
  };
}
