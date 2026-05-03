"use client";

import { useEffect, useState, type FormEvent } from "react";
import type {
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  DepositRecord,
  WithdrawalRecord,
} from "@reward/shared-types/finance";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

import { useLocale } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserUserApiClient } from "@/lib/api/user-client";
import { cn } from "@/lib/utils";
import {
  GameMetricTile,
  GamePill,
  GameSectionBlock,
  GameStatusNotice,
  GameSurfaceCard,
} from "@/modules/game/components/game-domain-ui";
import { useCurrentUserSession } from "./current-session-provider";
import { userDashboardCopy } from "./user-dashboard-copy";
import {
  bankCardLabel,
  cryptoAddressViewLabel,
  cryptoChannelLabel,
  formatUserDashboardAmount,
  formatUserDashboardDateTime,
  formatUserDashboardStatus,
  readVisibleFinanceStatus,
  resolveUserDashboardBadgeVariant,
} from "./user-dashboard-utils";

const pageCopy = {
  en: {
    eyebrow: "Cashier route",
    title: "Payout operations",
    description:
      "Run top-up intake, chain deposit claims, payout methods, and withdrawal requests from a dedicated operations desk instead of the wallet treasury.",
    liquidityLane: "Liquidity lane",
    liquidityDescription:
      "Treat this route like the cashier desk. Inbound claims queue for review, outbound requests reserve funds, and payout methods stay separated from the live treasury.",
    payoutDeck: "Payout deck",
    payoutDeckDescription:
      "Keep one verified bank lane and one crypto lane ready before you request higher-trust withdrawals.",
    paymentPulse: "Payment pulse",
    inflowDesk: "Inflow desk",
    inflowDescription:
      "Create fiat top-up requests and submit crypto transfer evidence for manual review.",
    payoutDesk: "Fiat payout desk",
    payoutDescription:
      "Save bank cards, choose the default payout route, and reserve funds for withdrawal review.",
    cryptoDesk: "Crypto payout deck",
    cryptoDeskDescription:
      "Store payout addresses by chain and token before triggering crypto withdrawals.",
    depositTimeline: "Recent deposits",
    depositTimelineDescription:
      "Recent top-up and chain claim intake visible to the player-facing cashier route.",
    withdrawalTimeline: "Recent withdrawals",
    withdrawalTimelineDescription:
      "Track requested, approved, paying, and reversed withdrawal states without leaving the route.",
    bankCardsTitle: "Bank payout lanes",
    cryptoAddressesTitle: "Crypto payout routes",
    activeChannels: "Active deposit channels",
    payoutRoutes: "Saved payout methods",
    reviewQueue: "Review queue",
    lockedShare: "Locked share",
    bankFormTitle: "Add bank card",
    withdrawalFormTitle: "Request bank withdrawal",
    topUpFormTitle: "Create top-up request",
    cryptoDepositFormTitle: "Submit crypto deposit claim",
    cryptoAddressFormTitle: "Save crypto payout address",
    cryptoWithdrawalFormTitle: "Request crypto withdrawal",
    laneReady: "Lane ready",
    lanePending: "Verification needed",
    noBankCardsHint: "Add a bank card before requesting a fiat withdrawal.",
    noCryptoAddressesHint:
      "Save a crypto payout address before requesting an on-chain withdrawal.",
    noTopUpsHint: "No top-up requests have been submitted yet.",
    noWithdrawalsHint: "No withdrawal requests are visible yet.",
    noRoutes: "No routes saved yet.",
    noChannelsHint: "No active crypto deposit channels are available yet.",
    verificationReady: "Higher-trust payout actions enabled.",
    verificationBlocked:
      "Phone verification is still required before higher-trust payout actions.",
    paymentSafety:
      "Withdrawals reserve funds first and continue through approval or provider stages before they settle.",
    paymentReview:
      "Crypto deposit claims remain reviewable until the transfer hash and source address are confirmed.",
    defaultRoute: "Default route",
    currentReviewState: "Current review state",
    lastUpdated: "Last updated",
    createdAt: "Created",
    methodStatus: "Method status",
    depositAmountClaimed: "Claimed amount",
    defaultReady: "Default ready",
    refreshing: "Refreshing...",
    saving: "Saving...",
    requesting: "Requesting...",
    submitting: "Submitting...",
  },
  "zh-CN": {
    eyebrow: "支付工作台",
    title: "出款操作",
    description:
      "把充值申请、链上入金申报、出款方式管理和提现申请，从金库页里拆到独立的支付操作台中。",
    liquidityLane: "流动性通道",
    liquidityDescription:
      "把这条路由当成 cashier desk。入金会先进入审核队列，出金会先冻结资金，出款方式也会和实时金库分开管理。",
    payoutDeck: "出款卡组",
    payoutDeckDescription:
      "先准备好一条已验证的银行卡路径和一条加密路径，再发起更高信任级别的提现。",
    paymentPulse: "支付脉冲",
    inflowDesk: "入金工作台",
    inflowDescription:
      "创建法币充值申请，并提交链上转账凭证以进入人工审核。",
    payoutDesk: "法币出款台",
    payoutDescription:
      "保存银行卡、设置默认出款路径，并为提现审核先保留资金。",
    cryptoDesk: "加密出款区",
    cryptoDeskDescription:
      "按链和代币保存出款地址，再发起链上提现申请。",
    depositTimeline: "最近充值",
    depositTimelineDescription:
      "展示玩家在当前支付路由下可见的充值申请与链上申报节奏。",
    withdrawalTimeline: "最近提现",
    withdrawalTimelineDescription:
      "在当前路由内追踪 requested、approved、paying 和 reversed 等提现状态。",
    bankCardsTitle: "银行卡出款路径",
    cryptoAddressesTitle: "加密出款路径",
    activeChannels: "活跃充值通道",
    payoutRoutes: "已保存出款方式",
    reviewQueue: "审核队列",
    lockedShare: "锁定占比",
    bankFormTitle: "添加银行卡",
    withdrawalFormTitle: "提交银行卡提现",
    topUpFormTitle: "创建充值申请",
    cryptoDepositFormTitle: "提交加密充值申报",
    cryptoAddressFormTitle: "保存加密出款地址",
    cryptoWithdrawalFormTitle: "提交加密提现申请",
    laneReady: "路径就绪",
    lanePending: "需要验证",
    noBankCardsHint: "请先添加银行卡，再提交法币提现。",
    noCryptoAddressesHint: "请先保存加密出款地址，再提交链上提现。",
    noTopUpsHint: "还没有充值申请记录。",
    noWithdrawalsHint: "还没有可见的提现申请。",
    noRoutes: "还没有保存任何路径。",
    noChannelsHint: "当前还没有可用的加密充值通道。",
    verificationReady: "更高信任级别的出款操作已开启。",
    verificationBlocked: "手机号还未验证，暂时不能执行更高信任级别的出款操作。",
    paymentSafety: "提现会先保留资金，再继续进入审核或打款阶段。",
    paymentReview: "链上充值申报在确认交易哈希和来源地址前，都会保留人工审核能力。",
    defaultRoute: "默认路径",
    currentReviewState: "当前审核状态",
    lastUpdated: "最近更新",
    createdAt: "创建时间",
    methodStatus: "路径状态",
    depositAmountClaimed: "申报金额",
    defaultReady: "默认路径已就绪",
    refreshing: "刷新中...",
    saving: "保存中...",
    requesting: "提交中...",
    submitting: "发送中...",
  },
} as const;

const isPendingFinanceStatus = (status: string | null) =>
  status === "requested" ||
  status === "provider_pending" ||
  status === "provider_succeeded" ||
  status === "approved" ||
  status === "provider_submitted" ||
  status === "provider_processing";

const statusBadgeClass = (status: string | null) => {
  const variant = resolveUserDashboardBadgeVariant(status ?? "outline");

  if (variant === "default") {
    return "retro-badge retro-badge-green border-none";
  }
  if (variant === "destructive") {
    return "retro-badge retro-badge-red border-none";
  }
  if (variant === "secondary") {
    return "retro-badge retro-badge-gold border-none";
  }
  return "retro-badge retro-badge-ink border-none";
};

const parseNumericBalance = (value: string | number | null | undefined) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(typeof value === "string" ? value : "0");

  return Number.isFinite(parsed) ? parsed : 0;
};

export function PaymentsOperationsPage() {
  const locale = useLocale();
  const c = userDashboardCopy[locale];
  const p = pageCopy[locale];
  const currentSession = useCurrentUserSession();
  const { showToast } = useToast();

  const formatAmount = (value: string | number | null | undefined) =>
    formatUserDashboardAmount(locale, value);
  const formatDateTime = (value: string | Date | null | undefined) =>
    formatUserDashboardDateTime(locale, c.unknown, value);
  const formatStatus = (value: string | null | undefined) =>
    formatUserDashboardStatus(locale, c.unknown, value);

  const [wallet, setWallet] = useState<WalletBalanceResponse | null>(null);
  const [bankCards, setBankCards] = useState<BankCardRecord[]>([]);
  const [cryptoChannels, setCryptoChannels] = useState<CryptoDepositChannelRecord[]>(
    [],
  );
  const [cryptoAddresses, setCryptoAddresses] = useState<
    CryptoWithdrawAddressViewRecord[]
  >([]);
  const [topUps, setTopUps] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpReference, setTopUpReference] = useState("");
  const [depositChannelId, setDepositChannelId] = useState("");
  const [depositAmountClaimed, setDepositAmountClaimed] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [depositFromAddress, setDepositFromAddress] = useState("");

  const [cardholderName, setCardholderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [selectedBankCardId, setSelectedBankCardId] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");

  const [cryptoChain, setCryptoChain] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("");
  const [cryptoToken, setCryptoToken] = useState("");
  const [cryptoAddress, setCryptoAddress] = useState("");
  const [cryptoLabel, setCryptoLabel] = useState("");
  const [selectedCryptoAddressId, setSelectedCryptoAddressId] = useState("");
  const [cryptoWithdrawalAmount, setCryptoWithdrawalAmount] = useState("");

  useEffect(() => {
    void loadPayments(true);
    // This route owns its own cashier state and refresh cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    if (cryptoChannels.length === 0) {
      setDepositChannelId("");
      return;
    }

    setDepositChannelId((current) => {
      if (current && cryptoChannels.some((channel) => String(channel.id) === current)) {
        return current;
      }
      return String(cryptoChannels[0].id);
    });
  }, [cryptoChannels]);

  useEffect(() => {
    if (bankCards.length === 0) {
      setSelectedBankCardId("");
      return;
    }

    const preferredCardId =
      bankCards.find((card) => card.isDefault)?.id ?? bankCards[0]?.id;

    setSelectedBankCardId((current) => {
      if (current && bankCards.some((card) => String(card.id) === current)) {
        return current;
      }
      return preferredCardId ? String(preferredCardId) : "";
    });
  }, [bankCards]);

  useEffect(() => {
    if (cryptoAddresses.length === 0) {
      setSelectedCryptoAddressId("");
      return;
    }

    const preferredAddressId =
      cryptoAddresses.find((address) => address.isDefault)?.payoutMethodId ??
      cryptoAddresses[0]?.payoutMethodId;

    setSelectedCryptoAddressId((current) => {
      if (
        current &&
        cryptoAddresses.some(
          (address) => String(address.payoutMethodId) === current,
        )
      ) {
        return current;
      }
      return preferredAddressId ? String(preferredAddressId) : "";
    });
  }, [cryptoAddresses]);

  async function loadPayments(showSpinner: boolean) {
    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const [
        walletResponse,
        bankCardsResponse,
        depositChannelsResponse,
        cryptoAddressesResponse,
        topUpsResponse,
        withdrawalsResponse,
      ] = await Promise.all([
        browserUserApiClient.getWalletBalance(),
        browserUserApiClient.listBankCards(),
        browserUserApiClient.listCryptoDepositChannels(),
        browserUserApiClient.listCryptoWithdrawAddresses(),
        browserUserApiClient.listTopUps(6),
        browserUserApiClient.listWithdrawals(6),
      ]);

      const responses = [
        walletResponse,
        bankCardsResponse,
        depositChannelsResponse,
        cryptoAddressesResponse,
        topUpsResponse,
        withdrawalsResponse,
      ];
      const firstFailure = responses.find((response) => !response.ok);

      if (walletResponse.ok) {
        setWallet(walletResponse.data);
      }
      if (bankCardsResponse.ok) {
        setBankCards(bankCardsResponse.data);
      }
      if (depositChannelsResponse.ok) {
        setCryptoChannels(depositChannelsResponse.data);
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

      if (firstFailure && !firstFailure.ok) {
        setError(firstFailure.error?.message ?? c.loadFailed);
      }
    } catch {
      setError(c.loadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const handleRefresh = async () => {
    await loadPayments(false);
  };

  const totalBalance = wallet?.balance.totalBalance ?? "0";
  const withdrawableBalance = wallet?.balance.withdrawableBalance ?? "0";
  const lockedBalance = wallet?.balance.lockedBalance ?? "0";
  const topUpPendingCount = topUps.filter((entry) =>
    isPendingFinanceStatus(readVisibleFinanceStatus(entry)),
  ).length;
  const withdrawalPendingCount = withdrawals.filter((entry) =>
    isPendingFinanceStatus(readVisibleFinanceStatus(entry)),
  ).length;
  const payoutMethodCount = bankCards.length + cryptoAddresses.length;
  const activeReviewCount = topUpPendingCount + withdrawalPendingCount;
  const phoneVerified = Boolean(currentSession.user.phoneVerifiedAt);
  const emailVerified = Boolean(currentSession.user.emailVerifiedAt);
  const lockedSharePercent = (() => {
    const total = parseNumericBalance(totalBalance);
    if (total <= 0) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(
        100,
        Math.round((parseNumericBalance(lockedBalance) / total) * 100),
      ),
    );
  })();

  const runAction = async <T,>(
    actionId: string,
    action: () => Promise<{ ok: boolean; data?: T; error?: { message?: string } }>,
    successMessage: string,
    reset?: () => void,
  ) => {
    setActiveAction(actionId);
    setError(null);

    const response = await action();

    if (!response.ok) {
      const message = response.error?.message ?? c.loadFailed;
      setError(message);
      showToast({
        title: p.title,
        description: message,
        tone: "error",
      });
      setActiveAction(null);
      return;
    }

    reset?.();
    showToast({
      title: p.title,
      description: successMessage,
      tone: "success",
    });
    await loadPayments(false);
    setActiveAction(null);
  };

  const handleCreateTopUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!topUpAmount.trim()) {
      setError(c.submitMissing);
      return;
    }

    await runAction(
      "topup",
      () =>
        browserUserApiClient.createTopUp({
          amount: topUpAmount.trim(),
          referenceId: topUpReference.trim() || null,
        }),
      c.topUpCreated,
      () => {
        setTopUpAmount("");
        setTopUpReference("");
      },
    );
  };

  const handleCreateCryptoDeposit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !depositChannelId ||
      !depositAmountClaimed.trim() ||
      !depositTxHash.trim()
    ) {
      setError(c.submitMissing);
      return;
    }

    await runAction(
      "crypto-deposit",
      () =>
        browserUserApiClient.createCryptoDeposit({
          channelId: Number(depositChannelId),
          amountClaimed: depositAmountClaimed.trim(),
          txHash: depositTxHash.trim(),
          fromAddress: depositFromAddress.trim() || null,
        }),
      c.cryptoDepositCreated,
      () => {
        setDepositAmountClaimed("");
        setDepositTxHash("");
        setDepositFromAddress("");
      },
    );
  };

  const handleCreateBankCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cardholderName.trim()) {
      setError(c.submitMissing);
      return;
    }

    await runAction(
      "bank-card",
      () =>
        browserUserApiClient.createBankCard({
          cardholderName: cardholderName.trim(),
          bankName: bankName.trim() || null,
          brand: cardBrand.trim() || null,
          last4: cardLast4.trim() || null,
        }),
      c.cardSaved,
      () => {
        setCardholderName("");
        setBankName("");
        setCardBrand("");
        setCardLast4("");
      },
    );
  };

  const handleSetDefaultBankCard = async (bankCardId: number) => {
    await runAction(
      `default-bank-${bankCardId}`,
      () => browserUserApiClient.setDefaultBankCard(bankCardId),
      c.defaultCardUpdated,
    );
  };

  const handleCreateWithdrawal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!withdrawalAmount.trim() || !selectedBankCardId) {
      setError(c.submitMissing);
      return;
    }

    await runAction(
      "withdrawal",
      () =>
        browserUserApiClient.createWithdrawal({
          amount: withdrawalAmount.trim(),
          payoutMethodId: Number(selectedBankCardId),
          bankCardId: Number(selectedBankCardId),
        }),
      c.withdrawalCreated,
      () => {
        setWithdrawalAmount("");
      },
    );
  };

  const handleCreateCryptoAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cryptoAddress.trim()) {
      setError(c.submitMissing);
      return;
    }

    await runAction(
      "crypto-address",
      () =>
        browserUserApiClient.createCryptoWithdrawAddress({
          chain: cryptoChain.trim() || null,
          network: cryptoNetwork.trim() || null,
          token: cryptoToken.trim() || null,
          address: cryptoAddress.trim(),
          label: cryptoLabel.trim() || null,
        }),
      c.cryptoAddressSaved,
      () => {
        setCryptoChain("");
        setCryptoNetwork("");
        setCryptoToken("");
        setCryptoAddress("");
        setCryptoLabel("");
      },
    );
  };

  const handleSetDefaultCryptoAddress = async (payoutMethodId: number) => {
    await runAction(
      `default-crypto-${payoutMethodId}`,
      () => browserUserApiClient.setDefaultCryptoWithdrawAddress(payoutMethodId),
      c.defaultCryptoAddressUpdated,
    );
  };

  const handleCreateCryptoWithdrawal = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!cryptoWithdrawalAmount.trim() || !selectedCryptoAddressId) {
      setError(c.submitMissing);
      return;
    }

    await runAction(
      "crypto-withdrawal",
      () =>
        browserUserApiClient.createCryptoWithdrawal({
          amount: cryptoWithdrawalAmount.trim(),
          payoutMethodId: Number(selectedCryptoAddressId),
        }),
      c.cryptoWithdrawalCreated,
      () => {
        setCryptoWithdrawalAmount("");
      },
    );
  };

  return (
    <div className="space-y-6">
      {error ? (
        <GameStatusNotice tone="danger" surface="light">
          {error}
        </GameStatusNotice>
      ) : null}

      <div data-testid="payments-hero">
        <GameSurfaceCard tone="light" className="overflow-hidden">
          <CardContent className="retro-ivory-surface relative overflow-hidden px-6 py-7 md:px-8 md:py-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_top_right,rgba(97,88,255,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(255,213,61,0.16),transparent_38%)]" />
            <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_320px]">
              <div className="space-y-6">
                <div className="space-y-4">
                  <Badge className="retro-badge retro-badge-gold border-none">
                    {p.eyebrow}
                  </Badge>
                  <div className="space-y-3">
                    <h2 className="text-[2rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)] md:text-[2.6rem]">
                      {p.title}
                    </h2>
                    <p className="max-w-3xl text-base leading-7 text-[rgba(15,17,31,0.72)]">
                      {p.description}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <GameMetricTile
                    tone="light"
                    label={c.withdrawalAmount}
                    value={formatAmount(withdrawableBalance)}
                  />
                  <GameMetricTile
                    tone="light"
                    label={p.reviewQueue}
                    value={activeReviewCount}
                  />
                  <GameMetricTile
                    tone="light"
                    label={p.activeChannels}
                    value={cryptoChannels.length}
                  />
                  <GameMetricTile
                    tone="light"
                    label={p.payoutRoutes}
                    value={payoutMethodCount}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <GameStatusNotice
                    surface="light"
                    tone={phoneVerified ? "success" : "warning"}
                  >
                    <p className="font-semibold text-[var(--retro-ink)]">
                      {phoneVerified ? p.laneReady : p.lanePending}
                    </p>
                    <p className="mt-1 text-[rgba(15,17,31,0.68)]">
                      {phoneVerified ? p.verificationReady : p.verificationBlocked}
                    </p>
                  </GameStatusNotice>
                  <GameStatusNotice surface="light" tone="info">
                    <p className="font-semibold text-[var(--retro-ink)]">
                      {p.paymentPulse}
                    </p>
                    <p className="mt-1 text-[rgba(15,17,31,0.68)]">
                      {p.paymentSafety}
                    </p>
                  </GameStatusNotice>
                </div>
              </div>

              <GameSectionBlock tone="dark" className="space-y-5 self-stretch">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                    {p.liquidityLane}
                  </p>
                  <h3 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-white">
                    {p.payoutDeck}
                  </h3>
                  <p className="text-sm leading-6 text-slate-300">
                    {p.payoutDeckDescription}
                  </p>
                </div>

                <div className="grid gap-3">
                  <GameMetricTile
                    label={c.walletTitle}
                    value={formatAmount(wallet?.balance.totalBalance ?? "0")}
                    className="border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)]"
                  />
                  <GameMetricTile
                    label={p.currentReviewState}
                    value={activeReviewCount}
                    className="border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)]"
                  />
                  <GameMetricTile
                    label={p.lockedShare}
                    value={`${lockedSharePercent}%`}
                    className="border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.06)]"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <GamePill surface="dark" tone={emailVerified ? "success" : "warning"}>
                    {emailVerified ? c.emailVerified : c.emailPending}
                  </GamePill>
                  <GamePill surface="dark" tone={phoneVerified ? "success" : "warning"}>
                    {phoneVerified ? c.phoneVerified : c.phonePending}
                  </GamePill>
                </div>
              </GameSectionBlock>
            </div>
          </CardContent>
        </GameSurfaceCard>
      </div>

      {loading ? (
        <GameStatusNotice tone="info" surface="light">
          {p.refreshing}
        </GameStatusNotice>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <GameSurfaceCard tone="light" className="overflow-hidden">
            <CardContent className="retro-ivory-surface space-y-6 px-6 py-6 md:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                    {p.inflowDesk}
                  </p>
                  <h3 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                    {p.liquidityLane}
                  </h3>
                  <p className="max-w-2xl text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                    {p.inflowDescription}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="arcadeOutline"
                  size="sm"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                >
                  {refreshing ? p.refreshing : c.refresh}
                </Button>
              </div>

              <div className="grid gap-4">
                <GameSectionBlock tone="light" className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-lg font-semibold text-[var(--retro-ink)]">
                      {p.topUpFormTitle}
                    </h4>
                    <p className="text-sm text-[rgba(15,17,31,0.62)]">
                      {c.topUpSectionLabel}
                    </p>
                  </div>
                  <form
                    className="grid gap-4 md:grid-cols-[1fr,1fr,auto]"
                    onSubmit={handleCreateTopUp}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="payments-topup-amount">{c.topUpAmount}</Label>
                      <Input
                        id="payments-topup-amount"
                        data-testid="payments-topup-amount"
                        value={topUpAmount}
                        onChange={(event) => setTopUpAmount(event.target.value)}
                        inputMode="decimal"
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-topup-reference">{c.referenceId}</Label>
                      <Input
                        id="payments-topup-reference"
                        value={topUpReference}
                        onChange={(event) => setTopUpReference(event.target.value)}
                        className="retro-field h-12"
                        placeholder={c.referencePlaceholder}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="submit"
                        variant="arcade"
                        disabled={activeAction === "topup"}
                      >
                        {activeAction === "topup" ? p.requesting : c.createTopUp}
                      </Button>
                    </div>
                  </form>
                </GameSectionBlock>

                <GameSectionBlock tone="light" className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-lg font-semibold text-[var(--retro-ink)]">
                      {p.cryptoDepositFormTitle}
                    </h4>
                    <p className="text-sm text-[rgba(15,17,31,0.62)]">
                      {p.paymentReview}
                    </p>
                  </div>

                  {cryptoChannels.length === 0 ? (
                    <GameStatusNotice tone="neutral" surface="light">
                      {c.noCryptoChannels}
                    </GameStatusNotice>
                  ) : null}

                  <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateCryptoDeposit}>
                    <div className="space-y-2">
                      <Label htmlFor="payments-deposit-channel">{c.depositChannel}</Label>
                      <select
                        id="payments-deposit-channel"
                        value={depositChannelId}
                        onChange={(event) => setDepositChannelId(event.target.value)}
                        className="retro-field h-12 w-full appearance-none px-4 text-sm"
                      >
                        <option value="">{c.depositChannelPlaceholder}</option>
                        {cryptoChannels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {cryptoChannelLabel(channel)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-deposit-amount">
                        {p.depositAmountClaimed}
                      </Label>
                      <Input
                        id="payments-deposit-amount"
                        value={depositAmountClaimed}
                        onChange={(event) => setDepositAmountClaimed(event.target.value)}
                        inputMode="decimal"
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-deposit-txhash">{c.depositTxHash}</Label>
                      <Input
                        id="payments-deposit-txhash"
                        value={depositTxHash}
                        onChange={(event) => setDepositTxHash(event.target.value)}
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-deposit-from-address">
                        {c.depositFromAddress}
                      </Label>
                      <Input
                        id="payments-deposit-from-address"
                        value={depositFromAddress}
                        onChange={(event) => setDepositFromAddress(event.target.value)}
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {cryptoChannels.slice(0, 3).map((channel) => (
                          <span
                            key={`channel-${channel.id}`}
                            className="retro-badge retro-badge-violet border-none"
                          >
                            {cryptoChannelLabel(channel)}
                          </span>
                        ))}
                      </div>
                      <Button
                        type="submit"
                        variant="arcade"
                        disabled={
                          activeAction === "crypto-deposit" || cryptoChannels.length === 0
                        }
                      >
                        {activeAction === "crypto-deposit"
                          ? p.submitting
                          : c.submitCryptoDeposit}
                      </Button>
                    </div>
                  </form>
                </GameSectionBlock>
              </div>
            </CardContent>
          </GameSurfaceCard>

          <GameSurfaceCard className="overflow-hidden" data-testid="payments-topups-panel">
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                  {p.depositTimeline}
                </p>
                <h3 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-slate-50">
                  {c.recentTopUps}
                </h3>
                <p className="text-sm text-slate-300">
                  {p.depositTimelineDescription}
                </p>
              </div>

              <div className="space-y-3">
                {topUps.length === 0 ? (
                  <GameStatusNotice tone="neutral">{p.noTopUpsHint}</GameStatusNotice>
                ) : (
                  topUps.map((entry) => {
                    const visibleStatus = readVisibleFinanceStatus(entry);
                    return (
                      <GameSectionBlock
                        key={`topup-${entry.id}`}
                        className="space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-50">
                              {formatAmount(entry.amount)}
                            </p>
                            <p className="mt-1 text-sm text-slate-300">
                              {entry.referenceId ?? cryptoChannelLabel({
                                id: 0,
                                providerId: null,
                                chain: entry.network ?? "fiat",
                                network: entry.network ?? "manual",
                                token: entry.assetCode ?? "CASH",
                                receiveAddress: "",
                                qrCodeUrl: null,
                                memoRequired: false,
                                memoValue: null,
                                minConfirmations: 0,
                                isActive: true,
                                createdAt: null,
                                updatedAt: null,
                              })}
                            </p>
                          </div>
                          <span className={statusBadgeClass(visibleStatus)}>
                            {formatStatus(visibleStatus)}
                          </span>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-300">
                          <p>
                            {p.createdAt}: {formatDateTime(entry.createdAt)}
                          </p>
                          <p>
                            {p.lastUpdated}: {formatDateTime(entry.updatedAt)}
                          </p>
                        </div>
                      </GameSectionBlock>
                    );
                  })
                )}
              </div>
            </CardContent>
          </GameSurfaceCard>
        </div>

        <div className="space-y-6">
          <GameSurfaceCard className="overflow-hidden" data-testid="payments-bank-panel">
            <CardContent className="space-y-6 p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-gold)]">
                  {p.payoutDesk}
                </p>
                <h3 className="text-[1.5rem] font-semibold tracking-[-0.03em] text-slate-50">
                  {p.bankCardsTitle}
                </h3>
                <p className="text-sm text-slate-300">{p.payoutDescription}</p>
              </div>

              <div className="space-y-3">
                {bankCards.length === 0 ? (
                  <GameStatusNotice tone="neutral">{p.noBankCardsHint}</GameStatusNotice>
                ) : (
                  bankCards.map((card) => (
                    <GameSectionBlock
                      key={`bank-card-${card.id}`}
                      className="space-y-3"
                      data-testid={`payments-bank-card-${card.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-50">
                            {bankCardLabel(card)}
                          </p>
                          <p className="mt-1 text-sm text-slate-300">
                            {card.cardholderName}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={statusBadgeClass(card.status)}>
                            {formatStatus(card.status)}
                          </span>
                          {card.isDefault ? (
                            <span className="retro-badge retro-badge-green border-none">
                              {p.defaultRoute}
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="arcadeOutline"
                              disabled={activeAction === `default-bank-${card.id}`}
                              onClick={() => void handleSetDefaultBankCard(card.id)}
                            >
                              {activeAction === `default-bank-${card.id}`
                                ? p.saving
                                : c.setDefault}
                            </Button>
                          )}
                        </div>
                      </div>
                    </GameSectionBlock>
                  ))
                )}
              </div>

              <GameSectionBlock className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-lg font-semibold text-slate-50">
                    {p.bankFormTitle}
                  </h4>
                </div>
                <form
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={handleCreateBankCard}
                >
                  <div className="space-y-2">
                    <Label htmlFor="payments-cardholder" className="text-slate-200">
                      {c.cardholderName}
                    </Label>
                    <Input
                      id="payments-cardholder"
                      value={cardholderName}
                      onChange={(event) => setCardholderName(event.target.value)}
                      className="retro-field-dark h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payments-bank-name" className="text-slate-200">
                      {c.bankName}
                    </Label>
                    <Input
                      id="payments-bank-name"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      className="retro-field-dark h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payments-card-brand" className="text-slate-200">
                      {c.cardBrand}
                    </Label>
                    <Input
                      id="payments-card-brand"
                      value={cardBrand}
                      onChange={(event) => setCardBrand(event.target.value)}
                      className="retro-field-dark h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payments-card-last4" className="text-slate-200">
                      {c.last4}
                    </Label>
                    <Input
                      id="payments-card-last4"
                      value={cardLast4}
                      onChange={(event) => setCardLast4(event.target.value)}
                      inputMode="numeric"
                      className="retro-field-dark h-12"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      type="submit"
                      variant="arcadeDark"
                      disabled={activeAction === "bank-card"}
                    >
                      {activeAction === "bank-card" ? p.saving : c.saveCard}
                    </Button>
                  </div>
                </form>
              </GameSectionBlock>

              <GameSectionBlock className="space-y-4" data-testid="payments-withdraw-form">
                <div className="space-y-1">
                  <h4 className="text-lg font-semibold text-slate-50">
                    {p.withdrawalFormTitle}
                  </h4>
                  <p className="text-sm text-slate-300">
                    {c.withdrawalSectionLabel}
                  </p>
                </div>
                <form
                  className="grid gap-4 md:grid-cols-[1fr,1fr,auto]"
                  onSubmit={handleCreateWithdrawal}
                >
                  <div className="space-y-2">
                    <Label htmlFor="payments-withdraw-amount" className="text-slate-200">
                      {c.withdrawalAmount}
                    </Label>
                    <Input
                      id="payments-withdraw-amount"
                      data-testid="payments-withdraw-amount"
                      value={withdrawalAmount}
                      onChange={(event) => setWithdrawalAmount(event.target.value)}
                      inputMode="decimal"
                      className="retro-field-dark h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payments-withdraw-card" className="text-slate-200">
                      {c.payoutCard}
                    </Label>
                    <select
                      id="payments-withdraw-card"
                      value={selectedBankCardId}
                      onChange={(event) => setSelectedBankCardId(event.target.value)}
                      className="retro-field-dark h-12 w-full appearance-none px-4 text-sm"
                    >
                      <option value="">{c.payoutCardPlaceholder}</option>
                      {bankCards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {bankCardLabel(card)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      data-testid="payments-withdraw-submit"
                      variant="arcadeDark"
                      disabled={activeAction === "withdrawal" || bankCards.length === 0}
                    >
                      {activeAction === "withdrawal"
                        ? p.requesting
                        : c.requestWithdrawal}
                    </Button>
                  </div>
                </form>
              </GameSectionBlock>
            </CardContent>
          </GameSurfaceCard>

          <GameSurfaceCard tone="light" className="overflow-hidden" data-testid="payments-crypto-panel">
            <CardContent className="retro-ivory-surface space-y-6 px-6 py-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                  {p.cryptoDesk}
                </p>
                <h3 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                  {p.cryptoAddressesTitle}
                </h3>
                <p className="text-sm leading-6 text-[rgba(15,17,31,0.68)]">
                  {p.cryptoDeskDescription}
                </p>
              </div>

              <div className="space-y-3">
                {cryptoAddresses.length === 0 ? (
                  <GameStatusNotice tone="neutral" surface="light">
                    {p.noCryptoAddressesHint}
                  </GameStatusNotice>
                ) : (
                  cryptoAddresses.map((address) => (
                    <GameSectionBlock
                      key={`crypto-address-${address.payoutMethodId}`}
                      tone="light"
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--retro-ink)]">
                            {cryptoAddressViewLabel(address)}
                          </p>
                          <p className="mt-1 text-sm text-[rgba(15,17,31,0.62)]">
                            {address.chain} · {address.network} · {address.token}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={statusBadgeClass(address.status)}>
                            {formatStatus(address.status)}
                          </span>
                          {address.isDefault ? (
                            <span className="retro-badge retro-badge-green border-none">
                              {p.defaultRoute}
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="arcadeOutline"
                              disabled={
                                activeAction ===
                                `default-crypto-${address.payoutMethodId}`
                              }
                              onClick={() =>
                                void handleSetDefaultCryptoAddress(
                                  address.payoutMethodId,
                                )
                              }
                            >
                              {activeAction ===
                              `default-crypto-${address.payoutMethodId}`
                                ? p.saving
                                : c.setDefaultAddress}
                            </Button>
                          )}
                        </div>
                      </div>
                    </GameSectionBlock>
                  ))
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <GameSectionBlock tone="light" className="space-y-4">
                  <h4 className="text-lg font-semibold text-[var(--retro-ink)]">
                    {p.cryptoAddressFormTitle}
                  </h4>
                  <form className="grid gap-4" onSubmit={handleCreateCryptoAddress}>
                    <div className="space-y-2">
                      <Label htmlFor="payments-crypto-chain">{c.cryptoChain}</Label>
                      <Input
                        id="payments-crypto-chain"
                        value={cryptoChain}
                        onChange={(event) => setCryptoChain(event.target.value)}
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-crypto-network">{c.cryptoNetwork}</Label>
                      <Input
                        id="payments-crypto-network"
                        value={cryptoNetwork}
                        onChange={(event) => setCryptoNetwork(event.target.value)}
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-crypto-token">{c.cryptoToken}</Label>
                      <Input
                        id="payments-crypto-token"
                        value={cryptoToken}
                        onChange={(event) => setCryptoToken(event.target.value)}
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-crypto-address">{c.cryptoAddress}</Label>
                      <Input
                        id="payments-crypto-address"
                        value={cryptoAddress}
                        onChange={(event) => setCryptoAddress(event.target.value)}
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-crypto-label">{c.cryptoLabel}</Label>
                      <Input
                        id="payments-crypto-label"
                        value={cryptoLabel}
                        onChange={(event) => setCryptoLabel(event.target.value)}
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="arcade"
                        disabled={activeAction === "crypto-address"}
                      >
                        {activeAction === "crypto-address" ? p.saving : c.saveCryptoAddress}
                      </Button>
                    </div>
                  </form>
                </GameSectionBlock>

                <GameSectionBlock tone="light" className="space-y-4">
                  <h4 className="text-lg font-semibold text-[var(--retro-ink)]">
                    {p.cryptoWithdrawalFormTitle}
                  </h4>
                  <form
                    className="grid gap-4"
                    onSubmit={handleCreateCryptoWithdrawal}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="payments-crypto-withdraw-amount">
                        {c.cryptoWithdrawalAmount}
                      </Label>
                      <Input
                        id="payments-crypto-withdraw-amount"
                        value={cryptoWithdrawalAmount}
                        onChange={(event) =>
                          setCryptoWithdrawalAmount(event.target.value)
                        }
                        inputMode="decimal"
                        className="retro-field h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payments-crypto-withdraw-address">
                        {c.cryptoWithdrawalAddress}
                      </Label>
                      <select
                        id="payments-crypto-withdraw-address"
                        value={selectedCryptoAddressId}
                        onChange={(event) =>
                          setSelectedCryptoAddressId(event.target.value)
                        }
                        className="retro-field h-12 w-full appearance-none px-4 text-sm"
                      >
                        <option value="">{c.cryptoWithdrawalAddressPlaceholder}</option>
                        {cryptoAddresses.map((address) => (
                          <option
                            key={address.payoutMethodId}
                            value={address.payoutMethodId}
                          >
                            {cryptoAddressViewLabel(address)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="arcade"
                        disabled={
                          activeAction === "crypto-withdrawal" ||
                          cryptoAddresses.length === 0
                        }
                      >
                        {activeAction === "crypto-withdrawal"
                          ? p.requesting
                          : c.requestCryptoWithdrawal}
                      </Button>
                    </div>
                  </form>
                </GameSectionBlock>
              </div>
            </CardContent>
          </GameSurfaceCard>

          <GameSurfaceCard tone="light" className="overflow-hidden" data-testid="payments-withdrawals-panel">
            <CardContent className="retro-ivory-surface space-y-4 px-6 py-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--retro-orange)]">
                  {p.withdrawalTimeline}
                </p>
                <h3 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[var(--retro-ink)]">
                  {c.recentWithdrawals}
                </h3>
                <p className="text-sm text-[rgba(15,17,31,0.68)]">
                  {p.withdrawalTimelineDescription}
                </p>
              </div>

              <div className="space-y-3">
                {withdrawals.length === 0 ? (
                  <GameStatusNotice tone="neutral" surface="light">
                    {p.noWithdrawalsHint}
                  </GameStatusNotice>
                ) : (
                  withdrawals.map((entry) => {
                    const visibleStatus = readVisibleFinanceStatus(entry);
                    const channelTone =
                      entry.channelType === "crypto"
                        ? "retro-badge retro-badge-violet border-none"
                        : "retro-badge retro-badge-gold border-none";

                    return (
                      <GameSectionBlock
                        key={`withdrawal-${entry.id}`}
                        tone="light"
                        className="space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-[var(--retro-ink)]">
                              {formatAmount(entry.amount)}
                            </p>
                            <p className="mt-1 text-sm text-[rgba(15,17,31,0.62)]">
                              {entry.channelType === "crypto"
                                ? `${entry.assetCode ?? "TOKEN"} · ${entry.network ?? c.unknown}`
                                : c.payoutCard}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={channelTone}>
                              {entry.channelType === "crypto" ? "Crypto" : "Fiat"}
                            </span>
                            <span className={statusBadgeClass(visibleStatus)}>
                              {formatStatus(visibleStatus)}
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-2 text-sm text-[rgba(15,17,31,0.68)]">
                          <p>
                            {p.createdAt}: {formatDateTime(entry.createdAt)}
                          </p>
                          <p>
                            {p.lastUpdated}: {formatDateTime(entry.updatedAt)}
                          </p>
                        </div>
                      </GameSectionBlock>
                    );
                  })
                )}
              </div>
            </CardContent>
          </GameSurfaceCard>
        </div>
      </section>
    </div>
  );
}
