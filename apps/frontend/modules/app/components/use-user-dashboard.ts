"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  AuthSessionSummary,
  CurrentUserSessionResponse,
  User,
} from "@reward/shared-types/auth";
import type {
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  DepositRecord,
  LedgerEntryRecord,
  WithdrawalRecord,
} from "@reward/shared-types/finance";
import type {
  RewardCenterResponse,
  RewardMissionId,
} from "@reward/shared-types/gamification";

import { browserUserApiClient } from "@/lib/api/user-client";
import { userDashboardCopy } from "./user-dashboard-copy";

type BankCard = BankCardRecord;
type CryptoDepositChannel = CryptoDepositChannelRecord;
type CryptoWithdrawAddress = CryptoWithdrawAddressViewRecord;
type TopUp = DepositRecord;
type Withdrawal = WithdrawalRecord;
type LedgerEntry = LedgerEntryRecord;
type UserDashboardCopy =
  (typeof userDashboardCopy)[keyof typeof userDashboardCopy];

type UseUserDashboardOptions = {
  initialCurrentSession: CurrentUserSessionResponse;
  copy: UserDashboardCopy;
};

export function useUserDashboard(options: UseUserDashboardOptions) {
  const { initialCurrentSession, copy: c } = options;

  const [currentUser, setCurrentUser] = useState<User>(
    initialCurrentSession.user,
  );
  const [currentSession, setCurrentSession] = useState<AuthSessionSummary>(
    initialCurrentSession.session,
  );
  const [walletBalance, setWalletBalance] = useState("0");
  const [bankCards, setBankCards] = useState<BankCard[]>([]);
  const [cryptoDepositChannels, setCryptoDepositChannels] = useState<
    CryptoDepositChannel[]
  >([]);
  const [cryptoWithdrawAddresses, setCryptoWithdrawAddresses] = useState<
    CryptoWithdrawAddress[]
  >([]);
  const [topUps, setTopUps] = useState<TopUp[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [rewardCenter, setRewardCenter] = useState<RewardCenterResponse | null>(
    null,
  );
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([
    initialCurrentSession.session,
  ]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpReferenceId, setTopUpReferenceId] = useState("");
  const [topUpSubmitting, setTopUpSubmitting] = useState(false);
  const [selectedCryptoChannelId, setSelectedCryptoChannelId] = useState("");
  const [cryptoDepositAmount, setCryptoDepositAmount] = useState("");
  const [cryptoDepositTxHash, setCryptoDepositTxHash] = useState("");
  const [cryptoDepositFromAddress, setCryptoDepositFromAddress] = useState("");
  const [cryptoDepositSubmitting, setCryptoDepositSubmitting] = useState(false);

  const [cardholderName, setCardholderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cryptoChain, setCryptoChain] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("");
  const [cryptoToken, setCryptoToken] = useState("");
  const [cryptoAddressValue, setCryptoAddressValue] = useState("");
  const [cryptoAddressLabel, setCryptoAddressLabel] = useState("");
  const [cryptoAddressSubmitting, setCryptoAddressSubmitting] = useState(false);

  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [selectedBankCardId, setSelectedBankCardId] = useState("");
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);
  const [cryptoWithdrawalAmount, setCryptoWithdrawalAmount] = useState("");
  const [selectedCryptoWithdrawAddressId, setSelectedCryptoWithdrawAddressId] =
    useState("");
  const [cryptoWithdrawalSubmitting, setCryptoWithdrawalSubmitting] =
    useState(false);

  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [phoneRequestSubmitting, setPhoneRequestSubmitting] = useState(false);
  const [phoneConfirmSubmitting, setPhoneConfirmSubmitting] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(false);
  const [claimingMissionId, setClaimingMissionId] =
    useState<RewardMissionId | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const emailVerified = Boolean(currentUser.emailVerifiedAt);
  const phoneVerified = Boolean(currentUser.phoneVerifiedAt);
  const financeUnlocked = emailVerified && phoneVerified;
  const fiatTopUps = topUps.filter(
    (entry) => (entry.channelType ?? "fiat") === "fiat",
  );
  const cryptoTopUps = topUps.filter((entry) => entry.channelType === "crypto");
  const fiatWithdrawals = withdrawals.filter(
    (entry) => (entry.channelType ?? "fiat") === "fiat",
  );
  const cryptoWithdrawals = withdrawals.filter(
    (entry) => entry.channelType === "crypto",
  );

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard(showSpinner = true) {
    if (showSpinner) {
      setDashboardLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const [
        currentSessionResponse,
        walletResponse,
        transactionsResponse,
        bankCardsResponse,
        cryptoChannelsResponse,
        cryptoAddressesResponse,
        topUpsResponse,
        withdrawalsResponse,
        rewardCenterResponse,
        sessionsResponse,
      ] = await Promise.all([
        browserUserApiClient.getCurrentSession(),
        browserUserApiClient.getWalletBalance(),
        browserUserApiClient.getTransactionHistory(8),
        browserUserApiClient.listBankCards(),
        browserUserApiClient.listCryptoDepositChannels(),
        browserUserApiClient.listCryptoWithdrawAddresses(),
        browserUserApiClient.listTopUps(5),
        browserUserApiClient.listWithdrawals(5),
        browserUserApiClient.getRewardCenter(),
        browserUserApiClient.listSessions(),
      ]);

      const failures = [
        currentSessionResponse,
        walletResponse,
        transactionsResponse,
        bankCardsResponse,
        cryptoChannelsResponse,
        cryptoAddressesResponse,
        topUpsResponse,
        withdrawalsResponse,
        rewardCenterResponse,
        sessionsResponse,
      ].filter((response) => !response.ok);

      if (currentSessionResponse.ok) {
        setCurrentUser(currentSessionResponse.data.user);
        setCurrentSession(currentSessionResponse.data.session);
      }

      if (walletResponse.ok) {
        setWalletBalance(walletResponse.data.balance ?? "0");
      }

      if (transactionsResponse.ok) {
        setTransactions(transactionsResponse.data);
      }

      if (bankCardsResponse.ok) {
        syncBankCardSelection(bankCardsResponse.data);
        setBankCards(bankCardsResponse.data);
      }

      if (cryptoChannelsResponse.ok) {
        syncCryptoChannelSelection(cryptoChannelsResponse.data);
        setCryptoDepositChannels(cryptoChannelsResponse.data);
      }

      if (cryptoAddressesResponse.ok) {
        syncCryptoWithdrawSelection(cryptoAddressesResponse.data);
        setCryptoWithdrawAddresses(cryptoAddressesResponse.data);
      }

      if (topUpsResponse.ok) {
        setTopUps(topUpsResponse.data);
      }

      if (withdrawalsResponse.ok) {
        setWithdrawals(withdrawalsResponse.data);
      }

      if (rewardCenterResponse.ok) {
        setRewardCenter(rewardCenterResponse.data);
      }

      if (sessionsResponse.ok) {
        setSessions(sessionsResponse.data.items);
      }

      if (failures.length > 0) {
        setError(failures[0].error?.message ?? c.loadFailed);
      }
    } catch {
      setError(c.loadFailed);
    } finally {
      setDashboardLoading(false);
      setRefreshing(false);
    }
  }

  function syncBankCardSelection(cards: BankCard[]) {
    if (cards.length === 0) {
      setSelectedBankCardId("");
      return;
    }

    const currentSelection = cards.find(
      (card) => String(card.id) === selectedBankCardId,
    );
    if (currentSelection) {
      return;
    }

    const defaultCard = cards.find((card) => card.isDefault) ?? cards[0];
    setSelectedBankCardId(String(defaultCard.id));
  }

  function syncCryptoChannelSelection(channels: CryptoDepositChannel[]) {
    if (channels.length === 0) {
      setSelectedCryptoChannelId("");
      return;
    }

    const currentSelection = channels.find(
      (channel) => String(channel.id) === selectedCryptoChannelId,
    );
    if (currentSelection) {
      return;
    }

    setSelectedCryptoChannelId(String(channels[0].id));
  }

  function syncCryptoWithdrawSelection(addresses: CryptoWithdrawAddress[]) {
    if (addresses.length === 0) {
      setSelectedCryptoWithdrawAddressId("");
      return;
    }

    const currentSelection = addresses.find(
      (address) =>
        String(address.payoutMethodId) === selectedCryptoWithdrawAddressId,
    );
    if (currentSelection) {
      return;
    }

    const defaultAddress =
      addresses.find((address) => address.isDefault) ?? addresses[0];
    setSelectedCryptoWithdrawAddressId(String(defaultAddress.payoutMethodId));
  }

  function setFeedback(
    nextNotice: string | null,
    nextError: string | null = null,
  ) {
    setNotice(nextNotice);
    setError(nextError);
  }

  async function handleRefresh() {
    await loadDashboard(false);
  }

  async function handleClaimReward(missionId: RewardMissionId) {
    setClaimingMissionId(missionId);
    setFeedback(null, null);

    const response = await browserUserApiClient.claimRewardMission(missionId);

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setClaimingMissionId(null);
      return;
    }

    setFeedback(c.rewardClaimed);
    await loadDashboard(false);
    setClaimingMissionId(null);
  }

  async function handleSendVerificationEmail() {
    setEmailSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.requestEmailVerification({
      resend: true,
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
    } else {
      setFeedback(c.verificationEmailSent);
    }

    setEmailSubmitting(false);
  }

  async function handleSendPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim()) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setPhoneRequestSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.requestPhoneVerification({
      phone: phone.trim(),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
    } else {
      setFeedback(c.phoneCodeSent);
    }

    setPhoneRequestSubmitting(false);
  }

  async function handleConfirmPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim() || !phoneCode.trim()) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setPhoneConfirmSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.confirmPhoneVerification({
      phone: phone.trim(),
      code: phoneCode.trim(),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setPhoneConfirmSubmitting(false);
      return;
    }

    setPhoneCode("");
    setFeedback(c.phoneVerifiedNotice);
    await loadDashboard(false);
    setPhoneConfirmSubmitting(false);
  }

  async function handleCreateTopUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topUpAmount.trim()) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setTopUpSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.createTopUp({
      amount: topUpAmount.trim(),
      referenceId: topUpReferenceId.trim() || null,
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setTopUpSubmitting(false);
      return;
    }

    setTopUpAmount("");
    setTopUpReferenceId("");
    setFeedback(c.topUpCreated);
    await loadDashboard(false);
    setTopUpSubmitting(false);
  }

  async function handleCreateCryptoDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedCryptoChannelId ||
      !cryptoDepositAmount.trim() ||
      !cryptoDepositTxHash.trim()
    ) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setCryptoDepositSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.createCryptoDeposit({
      channelId: Number(selectedCryptoChannelId),
      amountClaimed: cryptoDepositAmount.trim(),
      txHash: cryptoDepositTxHash.trim(),
      fromAddress: cryptoDepositFromAddress.trim() || null,
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCryptoDepositSubmitting(false);
      return;
    }

    setCryptoDepositAmount("");
    setCryptoDepositTxHash("");
    setCryptoDepositFromAddress("");
    setFeedback(c.cryptoDepositCreated);
    await loadDashboard(false);
    setCryptoDepositSubmitting(false);
  }

  async function handleCreateBankCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cardholderName.trim()) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setCardSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.createBankCard({
      cardholderName: cardholderName.trim(),
      bankName: bankName.trim() || null,
      brand: cardBrand.trim() || null,
      last4: cardLast4.trim() || null,
      isDefault: bankCards.length === 0,
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCardSubmitting(false);
      return;
    }

    setCardholderName("");
    setBankName("");
    setCardBrand("");
    setCardLast4("");
    setFeedback(c.cardSaved);
    await loadDashboard(false);
    setCardSubmitting(false);
  }

  async function handleCreateCryptoWithdrawAddress(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!cryptoAddressValue.trim()) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setCryptoAddressSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.createCryptoWithdrawAddress({
      chain: cryptoChain.trim() || null,
      network: cryptoNetwork.trim() || null,
      token: cryptoToken.trim() || null,
      address: cryptoAddressValue.trim(),
      label: cryptoAddressLabel.trim() || null,
      isDefault: cryptoWithdrawAddresses.length === 0,
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCryptoAddressSubmitting(false);
      return;
    }

    setCryptoChain("");
    setCryptoNetwork("");
    setCryptoToken("");
    setCryptoAddressValue("");
    setCryptoAddressLabel("");
    setFeedback(c.cryptoAddressSaved);
    await loadDashboard(false);
    setCryptoAddressSubmitting(false);
  }

  async function handleSetDefaultCard(bankCardId: number) {
    setFeedback(null, null);

    const response = await browserUserApiClient.setDefaultBankCard(bankCardId);

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      return;
    }

    setFeedback(c.defaultCardUpdated);
    await loadDashboard(false);
  }

  async function handleSetDefaultCryptoAddress(payoutMethodId: number) {
    setFeedback(null, null);

    const response = await browserUserApiClient.setDefaultCryptoWithdrawAddress(
      payoutMethodId,
    );

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      return;
    }

    setFeedback(c.defaultCryptoAddressUpdated);
    await loadDashboard(false);
  }

  async function handleCreateWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!withdrawalAmount.trim() || !selectedBankCardId) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setWithdrawalSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.createWithdrawal({
      amount: withdrawalAmount.trim(),
      bankCardId: Number(selectedBankCardId),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setWithdrawalSubmitting(false);
      return;
    }

    setWithdrawalAmount("");
    setFeedback(c.withdrawalCreated);
    await loadDashboard(false);
    setWithdrawalSubmitting(false);
  }

  async function handleCreateCryptoWithdrawal(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!cryptoWithdrawalAmount.trim() || !selectedCryptoWithdrawAddressId) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setCryptoWithdrawalSubmitting(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.createCryptoWithdrawal({
      amount: cryptoWithdrawalAmount.trim(),
      payoutMethodId: Number(selectedCryptoWithdrawAddressId),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCryptoWithdrawalSubmitting(false);
      return;
    }

    setCryptoWithdrawalAmount("");
    setFeedback(c.cryptoWithdrawalCreated);
    await loadDashboard(false);
    setCryptoWithdrawalSubmitting(false);
  }

  async function handleRevokeSession(sessionId: string, current: boolean) {
    setSessionLoading(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.revokeSession(sessionId);

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setSessionLoading(false);
      return;
    }

    if (current) {
      window.location.assign("/login");
      return;
    }

    setFeedback(c.sessionRevoked);
    await loadDashboard(false);
    setSessionLoading(false);
  }

  async function handleRevokeAllSessions() {
    setSessionLoading(true);
    setFeedback(null, null);

    const response = await browserUserApiClient.revokeAllSessions();

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setSessionLoading(false);
      return;
    }

    setFeedback(c.allSessionsRevoked);
    window.location.assign("/login");
  }

  return {
    currentUser,
    currentSession,
    walletBalance,
    bankCards,
    cryptoDepositChannels,
    cryptoWithdrawAddresses,
    topUps,
    withdrawals,
    transactions,
    rewardCenter,
    sessions,
    dashboardLoading,
    notice,
    error,
    topUpAmount,
    setTopUpAmount,
    topUpReferenceId,
    setTopUpReferenceId,
    topUpSubmitting,
    selectedCryptoChannelId,
    setSelectedCryptoChannelId,
    cryptoDepositAmount,
    setCryptoDepositAmount,
    cryptoDepositTxHash,
    setCryptoDepositTxHash,
    cryptoDepositFromAddress,
    setCryptoDepositFromAddress,
    cryptoDepositSubmitting,
    cardholderName,
    setCardholderName,
    bankName,
    setBankName,
    cardBrand,
    setCardBrand,
    cardLast4,
    setCardLast4,
    cardSubmitting,
    cryptoChain,
    setCryptoChain,
    cryptoNetwork,
    setCryptoNetwork,
    cryptoToken,
    setCryptoToken,
    cryptoAddressValue,
    setCryptoAddressValue,
    cryptoAddressLabel,
    setCryptoAddressLabel,
    cryptoAddressSubmitting,
    withdrawalAmount,
    setWithdrawalAmount,
    selectedBankCardId,
    setSelectedBankCardId,
    withdrawalSubmitting,
    cryptoWithdrawalAmount,
    setCryptoWithdrawalAmount,
    selectedCryptoWithdrawAddressId,
    setSelectedCryptoWithdrawAddressId,
    cryptoWithdrawalSubmitting,
    phone,
    setPhone,
    phoneCode,
    setPhoneCode,
    emailSubmitting,
    phoneRequestSubmitting,
    phoneConfirmSubmitting,
    sessionLoading,
    claimingMissionId,
    refreshing,
    emailVerified,
    phoneVerified,
    financeUnlocked,
    fiatTopUps,
    cryptoTopUps,
    fiatWithdrawals,
    cryptoWithdrawals,
    handleRefresh,
    handleClaimReward,
    handleSendVerificationEmail,
    handleSendPhoneCode,
    handleConfirmPhone,
    handleCreateTopUp,
    handleCreateCryptoDeposit,
    handleCreateBankCard,
    handleCreateCryptoWithdrawAddress,
    handleSetDefaultCard,
    handleSetDefaultCryptoAddress,
    handleCreateWithdrawal,
    handleCreateCryptoWithdrawal,
    handleRevokeSession,
    handleRevokeAllSessions,
  };
}

export type UserDashboardController = ReturnType<typeof useUserDashboard>;
