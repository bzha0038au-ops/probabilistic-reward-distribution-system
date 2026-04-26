'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type {
  AcceptedResponse,
  AuthSessionSummary,
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  CurrentUserSessionResponse,
  DepositRecord,
  LedgerEntryRecord,
  SessionBulkRevocationResponse,
  SessionRevocationResponse,
  User,
  UserSessionsResponse,
  WalletBalanceResponse,
  WithdrawalRecord,
} from '@reward/shared-types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLocale, useTranslations } from '@/components/i18n-provider';
import { apiRequestClient } from '@/lib/api/client';
import { DrawPanel } from '@/modules/draw/components/draw-panel';

type BankCard = BankCardRecord;
type CryptoDepositChannel = CryptoDepositChannelRecord;
type CryptoWithdrawAddress = CryptoWithdrawAddressViewRecord;
type TopUp = DepositRecord;
type Withdrawal = WithdrawalRecord;
type LedgerEntry = LedgerEntryRecord;

const copy = {
  en: {
    accountTitle: 'Account readiness',
    accountDescription:
      'Unlock draw, payouts, and security self-service from one place.',
    emailVerified: 'Email verified',
    emailPending: 'Email verification required',
    phoneVerified: 'Phone verified',
    phonePending: 'Phone verification required',
    drawUnlocked: 'Draw enabled',
    drawLocked: 'Verify your email before running the draw flow.',
    financeUnlocked: 'Payout tools enabled',
    financeLocked:
      'Bank cards and withdrawals unlock after both email and phone verification.',
    sendEmail: 'Send verification email',
    phoneLabel: 'Phone number',
    phonePlaceholder: '+61 4xx xxx xxx',
    codeLabel: 'SMS code',
    codePlaceholder: '6-digit code',
    sendCode: 'Send code',
    confirmPhone: 'Confirm phone',
    verificationEmailSent:
      'Verification email requested. Check the inbox on file if the account still needs verification.',
    phoneCodeSent: 'Verification code sent. Enter the SMS code to finish setup.',
    phoneVerifiedNotice: 'Phone verified. Withdrawal tools are now available.',
    walletTitle: 'Wallet and top-ups',
    walletDescription:
      'Balance visibility, pending deposits, and the notes users need before funding.',
    currentBalance: 'Current balance',
    topUpAmount: 'Top-up amount',
    referenceId: 'Reference ID',
    referencePlaceholder: 'Optional remittance or payment reference',
    createTopUp: 'Create top-up request',
    topUpCreated:
      'Top-up request submitted. The order will move through provider settlement before crediting the wallet.',
    recentTopUps: 'Recent top-ups',
    noTopUps: 'No top-up requests yet.',
    cryptoDepositTitle: 'Crypto deposit channels',
    cryptoDepositDescription:
      'Use the configured wallet address, then submit the transfer hash for manual review.',
    depositChannel: 'Deposit channel',
    depositChannelPlaceholder: 'Select a crypto channel',
    depositTxHash: 'Transaction hash',
    depositFromAddress: 'From address',
    submitCryptoDeposit: 'Submit crypto deposit claim',
    cryptoDepositCreated:
      'Crypto deposit claim submitted. Finance will verify the chain transfer before crediting the wallet.',
    noCryptoChannels: 'No crypto deposit channels are active yet.',
    recentCryptoDeposits: 'Recent crypto deposits',
    noCryptoDeposits: 'No crypto deposit claims yet.',
    paymentsTitle: 'Bank cards and withdrawals',
    paymentsDescription:
      'Bind payout cards, set a default destination, and request withdrawals.',
    addCard: 'Add bank card',
    cardholderName: 'Cardholder name',
    bankName: 'Bank name',
    cardBrand: 'Card brand',
    last4: 'Last 4 digits',
    saveCard: 'Save bank card',
    cardSaved: 'Bank card saved.',
    noCards: 'No bank cards saved yet.',
    defaultCard: 'Default',
    setDefault: 'Set default',
    withdrawalAmount: 'Withdrawal amount',
    payoutCard: 'Payout card',
    payoutCardPlaceholder: 'Select a saved card',
    requestWithdrawal: 'Request withdrawal',
    withdrawalCreated:
      'Withdrawal request submitted. Funds are reserved while approval and payout progress.',
    recentWithdrawals: 'Recent withdrawals',
    noWithdrawals: 'No withdrawals yet.',
    cryptoAddressTitle: 'Crypto payout addresses',
    cryptoAddressDescription:
      'Save wallet destinations per chain and token before requesting a crypto payout.',
    cryptoChain: 'Chain',
    cryptoNetwork: 'Network',
    cryptoToken: 'Token',
    cryptoAddress: 'Wallet address',
    cryptoLabel: 'Address label',
    saveCryptoAddress: 'Save crypto address',
    cryptoAddressSaved: 'Crypto payout address saved.',
    noCryptoAddresses: 'No crypto payout addresses saved yet.',
    setDefaultAddress: 'Set default address',
    cryptoWithdrawalAmount: 'Crypto withdrawal amount',
    cryptoWithdrawalAddress: 'Crypto payout address',
    cryptoWithdrawalAddressPlaceholder: 'Select a saved crypto address',
    requestCryptoWithdrawal: 'Request crypto withdrawal',
    cryptoWithdrawalCreated:
      'Crypto withdrawal request submitted. Funds stay locked until the chain transfer is confirmed.',
    recentCryptoWithdrawals: 'Recent crypto withdrawals',
    noCryptoWithdrawals: 'No crypto withdrawals yet.',
    transactionsTitle: 'Ledger activity',
    transactionsDescription:
      'Immutable balance movements from draws, deposits, and payout operations.',
    noTransactions: 'No ledger entries yet.',
    sessionsTitle: 'Active sessions',
    sessionsDescription: 'Review active devices and revoke access if needed.',
    noSessions: 'No active sessions found.',
    refresh: 'Refresh',
    revoke: 'Revoke',
    signOutThisDevice: 'Sign out this device',
    signOutEverywhere: 'Sign out everywhere',
    currentDevice: 'Current device',
    activeSession: 'Active session',
    thisDeviceRevoked: 'This device was signed out. Redirecting to login.',
    sessionRevoked: 'Session revoked.',
    allSessionsRevoked: 'All active sessions were revoked. Redirecting to login.',
    createdAt: 'Created',
    status: 'Status',
    amount: 'Amount',
    type: 'Type',
    before: 'Before',
    after: 'After',
    reference: 'Reference',
    device: 'Device',
    expires: 'Expires',
    unknown: 'Unknown',
    noSelection: 'No default card selected.',
    submitMissing: 'Complete the required fields before submitting.',
    loadFailed: 'Failed to load dashboard data.',
    retry: 'Retry',
    verificationBanner:
      'Email verification unlocks draws. Phone verification unlocks bank cards and withdrawals.',
    verified: 'Verified',
    pending: 'Pending',
    topUpSectionLabel:
      'Top-ups move through requested, provider pending, settled, and credited states before the wallet changes.',
    withdrawalSectionLabel:
      'Withdrawals reserve funds first, then move through approval, paying, and paid or reversal states.',
  },
  'zh-CN': {
    accountTitle: '账户可用状态',
    accountDescription: '把抽奖、出款和安全自助入口收进一个用户中心里。',
    emailVerified: '邮箱已验证',
    emailPending: '需要完成邮箱验证',
    phoneVerified: '手机号已验证',
    phonePending: '需要完成手机号验证',
    drawUnlocked: '抽奖已解锁',
    drawLocked: '请先完成邮箱验证，再执行抽奖流程。',
    financeUnlocked: '出款工具已解锁',
    financeLocked: '银行卡和提现都需要邮箱、手机号双验证后才能使用。',
    sendEmail: '发送验证邮件',
    phoneLabel: '手机号',
    phonePlaceholder: '+86 13800138000',
    codeLabel: '短信验证码',
    codePlaceholder: '6 位验证码',
    sendCode: '发送验证码',
    confirmPhone: '确认手机号',
    verificationEmailSent: '验证邮件已重新发起。如果账号还未验证，请检查当前绑定邮箱。',
    phoneCodeSent: '验证码已发送，请输入短信中的 6 位验证码完成绑定。',
    phoneVerifiedNotice: '手机号验证完成，提现工具已可用。',
    walletTitle: '钱包与充值',
    walletDescription: '展示当前余额、充值申请，以及用户需要知道的账本说明。',
    currentBalance: '当前余额',
    topUpAmount: '充值金额',
    referenceId: '参考单号',
    referencePlaceholder: '可选，填写转账流水或支付参考号',
    createTopUp: '创建充值申请',
    topUpCreated: '充值申请已提交。该笔单据会先经过渠道与结算状态，再在入账后更新余额。',
    recentTopUps: '最近充值申请',
    noTopUps: '还没有充值申请。',
    cryptoDepositTitle: '加密货币充值通道',
    cryptoDepositDescription:
      '先按页面展示的钱包地址转账，再提交 txHash 进入人工审核。',
    depositChannel: '充值通道',
    depositChannelPlaceholder: '请选择加密充值通道',
    depositTxHash: '交易哈希',
    depositFromAddress: '付款地址',
    submitCryptoDeposit: '提交加密充值认领',
    cryptoDepositCreated:
      '加密充值认领已提交。财务会先核对链上转账，再把余额记入钱包。',
    noCryptoChannels: '当前还没有启用中的加密充值通道。',
    recentCryptoDeposits: '最近加密充值',
    noCryptoDeposits: '还没有加密充值认领。',
    paymentsTitle: '银行卡与提现',
    paymentsDescription: '绑定出款银行卡、设置默认卡，并提交提现申请。',
    addCard: '新增银行卡',
    cardholderName: '持卡人姓名',
    bankName: '银行名称',
    cardBrand: '卡组织/类型',
    last4: '卡号后四位',
    saveCard: '保存银行卡',
    cardSaved: '银行卡已保存。',
    noCards: '还没有保存任何银行卡。',
    defaultCard: '默认卡',
    setDefault: '设为默认',
    withdrawalAmount: '提现金额',
    payoutCard: '出款银行卡',
    payoutCardPlaceholder: '请选择已保存的银行卡',
    requestWithdrawal: '提交提现申请',
    withdrawalCreated: '提现申请已提交。对应金额会先保留，再进入审核与打款状态。',
    recentWithdrawals: '最近提现申请',
    noWithdrawals: '还没有提现申请。',
    cryptoAddressTitle: '加密提现地址',
    cryptoAddressDescription:
      '按链和币种保存收款地址，再发起加密提现申请。',
    cryptoChain: '链',
    cryptoNetwork: '网络',
    cryptoToken: '币种',
    cryptoAddress: '钱包地址',
    cryptoLabel: '地址备注',
    saveCryptoAddress: '保存加密地址',
    cryptoAddressSaved: '加密提现地址已保存。',
    noCryptoAddresses: '还没有保存任何加密提现地址。',
    setDefaultAddress: '设为默认地址',
    cryptoWithdrawalAmount: '加密提现金额',
    cryptoWithdrawalAddress: '加密收款地址',
    cryptoWithdrawalAddressPlaceholder: '请选择已保存的加密地址',
    requestCryptoWithdrawal: '提交加密提现申请',
    cryptoWithdrawalCreated:
      '加密提现申请已提交。对应金额会先锁定，待链上转账确认后再完成。',
    recentCryptoWithdrawals: '最近加密提现',
    noCryptoWithdrawals: '还没有加密提现申请。',
    transactionsTitle: '账本流水',
    transactionsDescription: '展示抽奖、充值和提现相关的不可变余额流水。',
    noTransactions: '还没有账本流水。',
    sessionsTitle: '活跃会话',
    sessionsDescription: '查看当前活跃设备，并在需要时撤销访问。',
    noSessions: '没有查询到活跃会话。',
    refresh: '刷新',
    revoke: '撤销',
    signOutThisDevice: '退出当前设备',
    signOutEverywhere: '全部设备退出',
    currentDevice: '当前设备',
    activeSession: '活跃会话',
    thisDeviceRevoked: '当前设备已退出，正在跳转登录页。',
    sessionRevoked: '会话已撤销。',
    allSessionsRevoked: '所有活跃会话都已撤销，正在跳转登录页。',
    createdAt: '创建时间',
    status: '状态',
    amount: '金额',
    type: '类型',
    before: '变更前',
    after: '变更后',
    reference: '关联单据',
    device: '设备',
    expires: '过期时间',
    unknown: '未知',
    noSelection: '还没有默认出款卡。',
    submitMissing: '请先补全必填字段。',
    loadFailed: '加载用户中心数据失败。',
    retry: '重试',
    verificationBanner: '邮箱验证会解锁抽奖，手机号验证会解锁银行卡和提现。',
    verified: '已验证',
    pending: '待处理',
    topUpSectionLabel: '充值会按 requested、provider pending、settled、credited 的顺序推进，真正入账前不会改余额。',
    withdrawalSectionLabel: '提现会先保留金额，再进入 approved、paying、paid 或 reversed 等状态。',
  },
} as const;

type UserDashboardProps = {
  initialCurrentSession: CurrentUserSessionResponse;
};

export function UserDashboard({ initialCurrentSession }: UserDashboardProps) {
  const locale = useLocale();
  const t = useTranslations();
  const c = copy[locale];
  const [currentUser, setCurrentUser] = useState<User>(initialCurrentSession.user);
  const [currentSession, setCurrentSession] = useState<AuthSessionSummary>(
    initialCurrentSession.session
  );
  const [walletBalance, setWalletBalance] = useState('0');
  const [bankCards, setBankCards] = useState<BankCard[]>([]);
  const [cryptoDepositChannels, setCryptoDepositChannels] = useState<CryptoDepositChannel[]>(
    []
  );
  const [cryptoWithdrawAddresses, setCryptoWithdrawAddresses] = useState<
    CryptoWithdrawAddress[]
  >([]);
  const [topUps, setTopUps] = useState<TopUp[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([
    initialCurrentSession.session,
  ]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpReferenceId, setTopUpReferenceId] = useState('');
  const [topUpSubmitting, setTopUpSubmitting] = useState(false);
  const [selectedCryptoChannelId, setSelectedCryptoChannelId] = useState('');
  const [cryptoDepositAmount, setCryptoDepositAmount] = useState('');
  const [cryptoDepositTxHash, setCryptoDepositTxHash] = useState('');
  const [cryptoDepositFromAddress, setCryptoDepositFromAddress] = useState('');
  const [cryptoDepositSubmitting, setCryptoDepositSubmitting] = useState(false);

  const [cardholderName, setCardholderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cryptoChain, setCryptoChain] = useState('');
  const [cryptoNetwork, setCryptoNetwork] = useState('');
  const [cryptoToken, setCryptoToken] = useState('');
  const [cryptoAddressValue, setCryptoAddressValue] = useState('');
  const [cryptoAddressLabel, setCryptoAddressLabel] = useState('');
  const [cryptoAddressSubmitting, setCryptoAddressSubmitting] = useState(false);

  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [selectedBankCardId, setSelectedBankCardId] = useState('');
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);
  const [cryptoWithdrawalAmount, setCryptoWithdrawalAmount] = useState('');
  const [selectedCryptoWithdrawAddressId, setSelectedCryptoWithdrawAddressId] =
    useState('');
  const [cryptoWithdrawalSubmitting, setCryptoWithdrawalSubmitting] =
    useState(false);

  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [phoneRequestSubmitting, setPhoneRequestSubmitting] = useState(false);
  const [phoneConfirmSubmitting, setPhoneConfirmSubmitting] = useState(false);

  const [sessionLoading, setSessionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const emailVerified = Boolean(currentUser.emailVerifiedAt);
  const phoneVerified = Boolean(currentUser.phoneVerifiedAt);
  const financeUnlocked = emailVerified && phoneVerified;
  const fiatTopUps = topUps.filter((entry) => (entry.channelType ?? 'fiat') === 'fiat');
  const cryptoTopUps = topUps.filter((entry) => entry.channelType === 'crypto');
  const fiatWithdrawals = withdrawals.filter(
    (entry) => (entry.channelType ?? 'fiat') === 'fiat'
  );
  const cryptoWithdrawals = withdrawals.filter(
    (entry) => entry.channelType === 'crypto'
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

    const [
      currentSessionResponse,
      walletResponse,
      transactionsResponse,
      bankCardsResponse,
      cryptoChannelsResponse,
      cryptoAddressesResponse,
      topUpsResponse,
      withdrawalsResponse,
      sessionsResponse,
    ] = await Promise.all([
      apiRequestClient<CurrentUserSessionResponse>('/auth/user/session'),
      apiRequestClient<WalletBalanceResponse>('/wallet'),
      apiRequestClient<LedgerEntry[]>('/transactions?limit=8'),
      apiRequestClient<BankCard[]>('/bank-cards'),
      apiRequestClient<CryptoDepositChannel[]>('/crypto-deposit-channels'),
      apiRequestClient<CryptoWithdrawAddress[]>('/crypto-withdraw-addresses'),
      apiRequestClient<TopUp[]>('/top-ups?limit=5'),
      apiRequestClient<Withdrawal[]>('/withdrawals?limit=5'),
      apiRequestClient<UserSessionsResponse>('/auth/user/sessions'),
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
      sessionsResponse,
    ].filter((response) => !response.ok);

    if (currentSessionResponse.ok) {
      setCurrentUser(currentSessionResponse.data.user);
      setCurrentSession(currentSessionResponse.data.session);
    }

    if (walletResponse.ok) {
      setWalletBalance(walletResponse.data.balance ?? '0');
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

    if (sessionsResponse.ok) {
      setSessions(sessionsResponse.data.items);
    }

    if (failures.length > 0) {
      setError(failures[0].error?.message ?? c.loadFailed);
    }

    setDashboardLoading(false);
    setRefreshing(false);
  }

  function syncBankCardSelection(cards: BankCard[]) {
    if (cards.length === 0) {
      setSelectedBankCardId('');
      return;
    }

    const currentSelection = cards.find((card) => String(card.id) === selectedBankCardId);
    if (currentSelection) {
      return;
    }

    const defaultCard = cards.find((card) => card.isDefault) ?? cards[0];
    setSelectedBankCardId(String(defaultCard.id));
  }

  function syncCryptoChannelSelection(channels: CryptoDepositChannel[]) {
    if (channels.length === 0) {
      setSelectedCryptoChannelId('');
      return;
    }

    const currentSelection = channels.find(
      (channel) => String(channel.id) === selectedCryptoChannelId
    );
    if (currentSelection) {
      return;
    }

    setSelectedCryptoChannelId(String(channels[0].id));
  }

  function syncCryptoWithdrawSelection(addresses: CryptoWithdrawAddress[]) {
    if (addresses.length === 0) {
      setSelectedCryptoWithdrawAddressId('');
      return;
    }

    const currentSelection = addresses.find(
      (address) => String(address.payoutMethodId) === selectedCryptoWithdrawAddressId
    );
    if (currentSelection) {
      return;
    }

    const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0];
    setSelectedCryptoWithdrawAddressId(String(defaultAddress.payoutMethodId));
  }

  function setFeedback(nextNotice: string | null, nextError: string | null = null) {
    setNotice(nextNotice);
    setError(nextError);
  }

  async function handleRefresh() {
    await loadDashboard(false);
  }

  async function handleSendVerificationEmail() {
    setEmailSubmitting(true);
    setFeedback(null, null);

    const response = await apiRequestClient<AcceptedResponse>(
      '/auth/email-verification/request',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resend: true }),
      }
    );

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

    const response = await apiRequestClient<AcceptedResponse>(
      '/auth/phone-verification/request',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      }
    );

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

    const response = await apiRequestClient<{ verified: true; phone: string }>(
      '/auth/phone-verification/confirm',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          code: phoneCode.trim(),
        }),
      }
    );

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setPhoneConfirmSubmitting(false);
      return;
    }

    setPhoneCode('');
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

    const response = await apiRequestClient<TopUp>('/top-ups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: topUpAmount.trim(),
        referenceId: topUpReferenceId.trim() || null,
      }),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setTopUpSubmitting(false);
      return;
    }

    setTopUpAmount('');
    setTopUpReferenceId('');
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

    const response = await apiRequestClient<TopUp>('/crypto-deposits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: Number(selectedCryptoChannelId),
        amountClaimed: cryptoDepositAmount.trim(),
        txHash: cryptoDepositTxHash.trim(),
        fromAddress: cryptoDepositFromAddress.trim() || null,
      }),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCryptoDepositSubmitting(false);
      return;
    }

    setCryptoDepositAmount('');
    setCryptoDepositTxHash('');
    setCryptoDepositFromAddress('');
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

    const response = await apiRequestClient<BankCard>('/bank-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardholderName: cardholderName.trim(),
        bankName: bankName.trim() || null,
        brand: cardBrand.trim() || null,
        last4: cardLast4.trim() || null,
        isDefault: bankCards.length === 0,
      }),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCardSubmitting(false);
      return;
    }

    setCardholderName('');
    setBankName('');
    setCardBrand('');
    setCardLast4('');
    setFeedback(c.cardSaved);
    await loadDashboard(false);
    setCardSubmitting(false);
  }

  async function handleCreateCryptoWithdrawAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !cryptoChain.trim() ||
      !cryptoNetwork.trim() ||
      !cryptoToken.trim() ||
      !cryptoAddressValue.trim()
    ) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setCryptoAddressSubmitting(true);
    setFeedback(null, null);

    const response = await apiRequestClient<CryptoWithdrawAddress>(
      '/crypto-withdraw-addresses',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: cryptoChain.trim(),
          network: cryptoNetwork.trim(),
          token: cryptoToken.trim(),
          address: cryptoAddressValue.trim(),
          label: cryptoAddressLabel.trim() || null,
          isDefault: cryptoWithdrawAddresses.length === 0,
        }),
      }
    );

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCryptoAddressSubmitting(false);
      return;
    }

    setCryptoChain('');
    setCryptoNetwork('');
    setCryptoToken('');
    setCryptoAddressValue('');
    setCryptoAddressLabel('');
    setFeedback(c.cryptoAddressSaved);
    await loadDashboard(false);
    setCryptoAddressSubmitting(false);
  }

  async function handleSetDefaultCard(bankCardId: number) {
    setFeedback(null, null);

    const response = await apiRequestClient<BankCard>(
      `/bank-cards/${bankCardId}/default`,
      {
        method: 'PATCH',
      }
    );

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      return;
    }

    setFeedback(c.cardSaved);
    await loadDashboard(false);
  }

  async function handleSetDefaultCryptoAddress(payoutMethodId: number) {
    setFeedback(null, null);

    const response = await apiRequestClient<CryptoWithdrawAddress>(
      `/crypto-withdraw-addresses/${payoutMethodId}/default`,
      {
        method: 'PATCH',
      }
    );

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      return;
    }

    setFeedback(c.cryptoAddressSaved);
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

    const response = await apiRequestClient<Withdrawal>('/withdrawals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: withdrawalAmount.trim(),
        payoutMethodId: Number(selectedBankCardId),
      }),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setWithdrawalSubmitting(false);
      return;
    }

    setWithdrawalAmount('');
    setFeedback(c.withdrawalCreated);
    await loadDashboard(false);
    setWithdrawalSubmitting(false);
  }

  async function handleCreateCryptoWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cryptoWithdrawalAmount.trim() || !selectedCryptoWithdrawAddressId) {
      setFeedback(null, c.submitMissing);
      return;
    }

    setCryptoWithdrawalSubmitting(true);
    setFeedback(null, null);

    const response = await apiRequestClient<Withdrawal>('/crypto-withdrawals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: cryptoWithdrawalAmount.trim(),
        payoutMethodId: Number(selectedCryptoWithdrawAddressId),
      }),
    });

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setCryptoWithdrawalSubmitting(false);
      return;
    }

    setCryptoWithdrawalAmount('');
    setFeedback(c.cryptoWithdrawalCreated);
    await loadDashboard(false);
    setCryptoWithdrawalSubmitting(false);
  }

  async function handleRevokeSession(sessionId: string, current: boolean) {
    setSessionLoading(true);
    setFeedback(null, null);

    const response = await apiRequestClient<SessionRevocationResponse>(
      `/auth/user/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setSessionLoading(false);
      return;
    }

    if (current) {
      setFeedback(c.thisDeviceRevoked);
      window.location.assign('/login');
      return;
    }

    setFeedback(c.sessionRevoked);
    await loadDashboard(false);
    setSessionLoading(false);
  }

  async function handleRevokeAllSessions() {
    setSessionLoading(true);
    setFeedback(null, null);

    const response = await apiRequestClient<SessionBulkRevocationResponse>(
      '/auth/user/sessions/revoke-all',
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      setFeedback(null, response.error?.message ?? c.loadFailed);
      setSessionLoading(false);
      return;
    }

    setFeedback(c.allSessionsRevoked);
    window.location.assign('/login');
  }

  function formatAmount(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return '0.00';
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return String(value);
    }

    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  function formatDateTime(value: string | Date | null | undefined) {
    if (!value) {
      return c.unknown;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }

  function formatStatus(value: string | null | undefined) {
    if (!value) {
      return c.unknown;
    }

    const predefined =
      locale === 'zh-CN'
        ? {
            pending: '待处理',
            requested: '已申请',
            provider_pending: '渠道处理中',
            provider_succeeded: '已结算',
            provider_failed: '失败',
            provider_submitted: '打款中',
            provider_processing: '打款中',
            settled: '已结算',
            credited: '已入账',
            success: '成功',
            failed: '失败',
            approved: '已审核',
            paying: '打款中',
            rejected: '已拒绝',
            paid: '已打款',
            reversed: '已冲正',
            active: '有效',
            user: '用户',
            admin: '管理员',
          }
        : {
            pending: 'Pending',
            requested: 'Requested',
            provider_pending: 'Provider Pending',
            provider_succeeded: 'Settled',
            provider_failed: 'Failed',
            provider_submitted: 'Paying',
            provider_processing: 'Paying',
            settled: 'Settled',
            credited: 'Credited',
            success: 'Success',
            failed: 'Failed',
            approved: 'Approved',
            paying: 'Paying',
            rejected: 'Rejected',
            paid: 'Paid',
            reversed: 'Reversed',
            active: 'Active',
            user: 'User',
            admin: 'Admin',
          };

    return (
      predefined[value as keyof typeof predefined] ??
      value
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    );
  }

  function badgeVariant(value: string | boolean) {
    if (
      value === true ||
      value === 'success' ||
      value === 'credited' ||
      value === 'approved' ||
      value === 'paid'
    ) {
      return 'default' as const;
    }
    if (value === 'failed' || value === 'rejected' || value === 'reversed') {
      return 'destructive' as const;
    }
    if (
      value === 'pending' ||
      value === 'requested' ||
      value === 'provider_pending' ||
      value === 'provider_succeeded' ||
      value === 'provider_submitted' ||
      value === 'provider_processing' ||
      value === 'settled' ||
      value === 'paying'
    ) {
      return 'secondary' as const;
    }
    return 'outline' as const;
  }

  function readVisibleFinanceStatus(
    entry: { status?: string | null; metadata?: Record<string, unknown> | null } | null | undefined
  ) {
    if (!entry) {
      return null;
    }

    const metadata =
      entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
        ? entry.metadata
        : null;
    const projected =
      typeof metadata?.userVisibleStatus === 'string'
        ? metadata.userVisibleStatus
        : typeof metadata?.financeSemanticStatus === 'string'
          ? metadata.financeSemanticStatus
          : null;

    return projected ?? entry.status ?? null;
  }

  function bankCardLabel(card: BankCard) {
    const parts = [card.bankName, card.brand, card.last4 ? `•••• ${card.last4}` : null].filter(
      Boolean
    );
    return parts.length > 0 ? parts.join(' · ') : card.cardholderName;
  }

  function cryptoChannelLabel(channel: CryptoDepositChannel) {
    return `${channel.token} · ${channel.network}`;
  }

  function cryptoAddressViewLabel(address: CryptoWithdrawAddress) {
    const headline =
      address.label?.trim() || `${address.token} · ${address.network}`;
    return `${headline} · ${address.address.slice(0, 10)}...${address.address.slice(-6)}`;
  }

  if (dashboardLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{c.accountTitle}</CardTitle>
            <CardDescription>{t('common.loading')}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{c.walletTitle}</CardTitle>
            <CardDescription>{t('common.loading')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          data-testid="dashboard-notice"
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          data-testid="dashboard-error"
        >
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{c.accountTitle}</CardTitle>
            <CardDescription>{c.accountDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant={badgeVariant(emailVerified)}>
                {emailVerified ? c.emailVerified : c.emailPending}
              </Badge>
              <Badge variant={badgeVariant(phoneVerified)}>
                {phoneVerified ? c.phoneVerified : c.phonePending}
              </Badge>
              <Badge variant={badgeVariant(emailVerified)}>
                {emailVerified ? c.drawUnlocked : c.drawLocked}
              </Badge>
              <Badge variant={badgeVariant(financeUnlocked)}>
                {financeUnlocked ? c.financeUnlocked : c.financeLocked}
              </Badge>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {c.verificationBanner}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {emailVerified ? c.emailVerified : c.emailPending}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{c.drawLocked}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSendVerificationEmail()}
                  disabled={emailSubmitting || emailVerified}
                >
                  {emailSubmitting ? t('common.loading') : c.sendEmail}
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {phoneVerified ? c.phoneVerified : c.phonePending}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{c.financeLocked}</p>
                </div>

                {!phoneVerified ? (
                  <div className="space-y-4">
                    <form className="space-y-3" onSubmit={handleSendPhoneCode}>
                      <div className="space-y-2">
                        <Label htmlFor="phone-number">{c.phoneLabel}</Label>
                        <Input
                          id="phone-number"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder={c.phonePlaceholder}
                          autoComplete="tel"
                        />
                      </div>
                      <Button type="submit" variant="outline" disabled={phoneRequestSubmitting}>
                        {phoneRequestSubmitting ? t('common.loading') : c.sendCode}
                      </Button>
                    </form>

                    <form className="space-y-3" onSubmit={handleConfirmPhone}>
                      <div className="space-y-2">
                        <Label htmlFor="phone-code">{c.codeLabel}</Label>
                        <Input
                          id="phone-code"
                          value={phoneCode}
                          onChange={(event) => setPhoneCode(event.target.value)}
                          placeholder={c.codePlaceholder}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                        />
                      </div>
                      <Button type="submit" disabled={phoneConfirmSubmitting}>
                        {phoneConfirmSubmitting ? t('common.loading') : c.confirmPhone}
                      </Button>
                    </form>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {c.phoneVerifiedNotice}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <DrawPanel
          disabled={!emailVerified}
          disabledReason={!emailVerified ? c.drawLocked : null}
          onBalanceChange={setWalletBalance}
          onDrawComplete={() => void loadDashboard(false)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>{c.walletTitle}</CardTitle>
            <CardDescription>{c.walletDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-sm text-slate-500">{c.currentBalance}</p>
              <p
                className="mt-2 text-3xl font-semibold text-slate-950"
                data-testid="wallet-current-balance"
              >
                {formatAmount(walletBalance)}
              </p>
            </div>

            <div className="grid gap-2 text-sm text-slate-600">
              <p>{c.topUpSectionLabel}</p>
              <p>{t('app.notes.0')}</p>
              <p>{t('app.notes.1')}</p>
              <p>{t('app.notes.2')}</p>
            </div>

            <form className="space-y-4" onSubmit={handleCreateTopUp}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="top-up-amount">{c.topUpAmount}</Label>
                  <Input
                    id="top-up-amount"
                    value={topUpAmount}
                    onChange={(event) => setTopUpAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="100.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="top-up-reference">{c.referenceId}</Label>
                  <Input
                    id="top-up-reference"
                    value={topUpReferenceId}
                    onChange={(event) => setTopUpReferenceId(event.target.value)}
                    placeholder={c.referencePlaceholder}
                  />
                </div>
              </div>
              <Button type="submit" disabled={topUpSubmitting}>
                {topUpSubmitting ? t('common.loading') : c.createTopUp}
              </Button>
            </form>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">{c.recentTopUps}</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                >
                  {refreshing ? t('common.loading') : c.refresh}
                </Button>
              </div>
              {fiatTopUps.length === 0 ? (
                <p className="text-sm text-slate-500">{c.noTopUps}</p>
              ) : (
                <div className="space-y-3">
                    {fiatTopUps.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-medium">{formatAmount(entry.amount)}</span>
                          <Badge variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}>
                            {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                          </Badge>
                        </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                        <span>
                          {c.createdAt}: {formatDateTime(entry.createdAt)}
                        </span>
                        <span>
                          {c.reference}: {entry.referenceId ?? c.unknown}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  {c.cryptoDepositTitle}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {c.cryptoDepositDescription}
                </p>
              </div>

              {cryptoDepositChannels.length === 0 ? (
                <p className="text-sm text-slate-500">{c.noCryptoChannels}</p>
              ) : (
                <div className="space-y-3">
                  {cryptoDepositChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-medium text-slate-950">
                          {cryptoChannelLabel(channel)}
                        </span>
                        <Badge variant={badgeVariant(channel.isActive)}>
                          {channel.isActive ? c.verified : c.pending}
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-1 text-slate-500">
                        <p>{channel.receiveAddress}</p>
                        <p>
                          {c.cryptoChain}: {channel.chain} · {c.cryptoNetwork}:{' '}
                          {channel.network}
                        </p>
                        {channel.memoRequired ? (
                          <p>
                            Memo/Tag:{' '}
                            {channel.memoValue ?? c.unknown}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form className="space-y-4" onSubmit={handleCreateCryptoDeposit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="crypto-channel">{c.depositChannel}</Label>
                    <select
                      id="crypto-channel"
                      value={selectedCryptoChannelId}
                      onChange={(event) => setSelectedCryptoChannelId(event.target.value)}
                      disabled={cryptoDepositChannels.length === 0 || cryptoDepositSubmitting}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">{c.depositChannelPlaceholder}</option>
                      {cryptoDepositChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {cryptoChannelLabel(channel)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crypto-deposit-amount">{c.amount}</Label>
                    <Input
                      id="crypto-deposit-amount"
                      value={cryptoDepositAmount}
                      onChange={(event) => setCryptoDepositAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="100.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crypto-deposit-tx">{c.depositTxHash}</Label>
                    <Input
                      id="crypto-deposit-tx"
                      value={cryptoDepositTxHash}
                      onChange={(event) => setCryptoDepositTxHash(event.target.value)}
                      placeholder="0x..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crypto-deposit-from">{c.depositFromAddress}</Label>
                    <Input
                      id="crypto-deposit-from"
                      value={cryptoDepositFromAddress}
                      onChange={(event) => setCryptoDepositFromAddress(event.target.value)}
                      placeholder="0x..."
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={cryptoDepositSubmitting || cryptoDepositChannels.length === 0}
                >
                  {cryptoDepositSubmitting
                    ? t('common.loading')
                    : c.submitCryptoDeposit}
                </Button>
              </form>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-950">
                  {c.recentCryptoDeposits}
                </h3>
                {cryptoTopUps.length === 0 ? (
                  <p className="text-sm text-slate-500">{c.noCryptoDeposits}</p>
                ) : (
                  <div className="space-y-3">
                    {cryptoTopUps.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-medium">
                            {formatAmount(entry.amount)} {entry.assetCode ?? ''}
                          </span>
                          <Badge variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}>
                            {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                          <span>
                            {c.createdAt}: {formatDateTime(entry.createdAt)}
                          </span>
                          <span>
                            {c.reference}: {entry.submittedTxHash ?? c.unknown}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{c.paymentsTitle}</CardTitle>
            <CardDescription>{c.paymentsDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!financeUnlocked ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {c.financeLocked}
              </div>
            ) : null}

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-950">{c.addCard}</h3>
              <form className="space-y-4" onSubmit={handleCreateBankCard}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cardholder-name">{c.cardholderName}</Label>
                    <Input
                      id="cardholder-name"
                      value={cardholderName}
                      onChange={(event) => setCardholderName(event.target.value)}
                      placeholder={c.cardholderName}
                      disabled={!financeUnlocked || cardSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank-name">{c.bankName}</Label>
                    <Input
                      id="bank-name"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      placeholder={c.bankName}
                      disabled={!financeUnlocked || cardSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card-brand">{c.cardBrand}</Label>
                    <Input
                      id="card-brand"
                      value={cardBrand}
                      onChange={(event) => setCardBrand(event.target.value)}
                      placeholder={c.cardBrand}
                      disabled={!financeUnlocked || cardSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card-last4">{c.last4}</Label>
                    <Input
                      id="card-last4"
                      value={cardLast4}
                      onChange={(event) => setCardLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
                      inputMode="numeric"
                      placeholder="1234"
                      disabled={!financeUnlocked || cardSubmitting}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={!financeUnlocked || cardSubmitting}>
                  {cardSubmitting ? t('common.loading') : c.saveCard}
                </Button>
              </form>

              {bankCards.length === 0 ? (
                <p className="text-sm text-slate-500">{c.noCards}</p>
              ) : (
                <div className="space-y-3">
                  {bankCards.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">{card.cardholderName}</p>
                          <p className="mt-1 text-slate-500">{bankCardLabel(card)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {card.isDefault ? (
                            <Badge>{c.defaultCard}</Badge>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleSetDefaultCard(card.id)}
                              disabled={!financeUnlocked}
                            >
                              {c.setDefault}
                            </Button>
                          )}
                          <Badge variant={badgeVariant(card.status)}>
                            {formatStatus(card.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{c.requestWithdrawal}</h3>
                <p className="mt-1 text-sm text-slate-500">{c.withdrawalSectionLabel}</p>
              </div>

              <form className="space-y-4" onSubmit={handleCreateWithdrawal}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="withdrawal-amount">{c.withdrawalAmount}</Label>
                    <Input
                      id="withdrawal-amount"
                      value={withdrawalAmount}
                      onChange={(event) => setWithdrawalAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="50.00"
                      disabled={!financeUnlocked || withdrawalSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payout-card">{c.payoutCard}</Label>
                    <select
                      id="payout-card"
                      value={selectedBankCardId}
                      onChange={(event) => setSelectedBankCardId(event.target.value)}
                      disabled={!financeUnlocked || bankCards.length === 0 || withdrawalSubmitting}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">{c.payoutCardPlaceholder}</option>
                      {bankCards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {bankCardLabel(card)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {!selectedBankCardId && bankCards.length > 0 ? (
                  <p className="text-sm text-slate-500">{c.noSelection}</p>
                ) : null}
                <Button
                  type="submit"
                  disabled={!financeUnlocked || bankCards.length === 0 || withdrawalSubmitting}
                >
                  {withdrawalSubmitting ? t('common.loading') : c.requestWithdrawal}
                </Button>
              </form>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-950">{c.recentWithdrawals}</h3>
                {fiatWithdrawals.length === 0 ? (
                  <p className="text-sm text-slate-500">{c.noWithdrawals}</p>
                ) : (
                  <div className="space-y-3">
                    {fiatWithdrawals.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-medium">{formatAmount(entry.amount)}</span>
                          <Badge variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}>
                            {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                          <span>
                            {c.createdAt}: {formatDateTime(entry.createdAt)}
                          </span>
                          <span>
                            {c.reference}:{' '}
                            {entry.payoutMethodId ?? entry.bankCardId
                              ? `Method #${entry.payoutMethodId ?? entry.bankCardId}`
                              : c.unknown}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  {c.cryptoAddressTitle}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {c.cryptoAddressDescription}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleCreateCryptoWithdrawAddress}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="crypto-chain">{c.cryptoChain}</Label>
                    <Input
                      id="crypto-chain"
                      value={cryptoChain}
                      onChange={(event) => setCryptoChain(event.target.value)}
                      placeholder="Ethereum"
                      disabled={!financeUnlocked || cryptoAddressSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crypto-network">{c.cryptoNetwork}</Label>
                    <Input
                      id="crypto-network"
                      value={cryptoNetwork}
                      onChange={(event) => setCryptoNetwork(event.target.value)}
                      placeholder="ERC20"
                      disabled={!financeUnlocked || cryptoAddressSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crypto-token">{c.cryptoToken}</Label>
                    <Input
                      id="crypto-token"
                      value={cryptoToken}
                      onChange={(event) => setCryptoToken(event.target.value)}
                      placeholder="USDT"
                      disabled={!financeUnlocked || cryptoAddressSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crypto-address">{c.cryptoAddress}</Label>
                    <Input
                      id="crypto-address"
                      value={cryptoAddressValue}
                      onChange={(event) => setCryptoAddressValue(event.target.value)}
                      placeholder="0x..."
                      disabled={!financeUnlocked || cryptoAddressSubmitting}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="crypto-address-label">{c.cryptoLabel}</Label>
                    <Input
                      id="crypto-address-label"
                      value={cryptoAddressLabel}
                      onChange={(event) => setCryptoAddressLabel(event.target.value)}
                      placeholder={c.cryptoLabel}
                      disabled={!financeUnlocked || cryptoAddressSubmitting}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={!financeUnlocked || cryptoAddressSubmitting}
                >
                  {cryptoAddressSubmitting
                    ? t('common.loading')
                    : c.saveCryptoAddress}
                </Button>
              </form>

              {cryptoWithdrawAddresses.length === 0 ? (
                <p className="text-sm text-slate-500">{c.noCryptoAddresses}</p>
              ) : (
                <div className="space-y-3">
                  {cryptoWithdrawAddresses.map((address) => (
                    <div
                      key={address.payoutMethodId}
                      className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">
                            {cryptoAddressViewLabel(address)}
                          </p>
                          <p className="mt-1 text-slate-500">
                            {address.chain} · {address.network} · {address.token}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {address.isDefault ? (
                            <Badge>{c.defaultCard}</Badge>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void handleSetDefaultCryptoAddress(address.payoutMethodId)
                              }
                              disabled={!financeUnlocked}
                            >
                              {c.setDefaultAddress}
                            </Button>
                          )}
                          <Badge variant={badgeVariant(address.status)}>
                            {formatStatus(address.status)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  {c.requestCryptoWithdrawal}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {c.withdrawalSectionLabel}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleCreateCryptoWithdrawal}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="crypto-withdrawal-amount">
                      {c.cryptoWithdrawalAmount}
                    </Label>
                    <Input
                      id="crypto-withdrawal-amount"
                      value={cryptoWithdrawalAmount}
                      onChange={(event) => setCryptoWithdrawalAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="50.00"
                      disabled={!financeUnlocked || cryptoWithdrawalSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="crypto-withdrawal-address">
                      {c.cryptoWithdrawalAddress}
                    </Label>
                    <select
                      id="crypto-withdrawal-address"
                      value={selectedCryptoWithdrawAddressId}
                      onChange={(event) =>
                        setSelectedCryptoWithdrawAddressId(event.target.value)
                      }
                      disabled={
                        !financeUnlocked ||
                        cryptoWithdrawAddresses.length === 0 ||
                        cryptoWithdrawalSubmitting
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">{c.cryptoWithdrawalAddressPlaceholder}</option>
                      {cryptoWithdrawAddresses.map((address) => (
                        <option
                          key={address.payoutMethodId}
                          value={address.payoutMethodId}
                        >
                          {cryptoAddressViewLabel(address)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={
                    !financeUnlocked ||
                    cryptoWithdrawAddresses.length === 0 ||
                    cryptoWithdrawalSubmitting
                  }
                >
                  {cryptoWithdrawalSubmitting
                    ? t('common.loading')
                    : c.requestCryptoWithdrawal}
                </Button>
              </form>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-950">
                  {c.recentCryptoWithdrawals}
                </h3>
                {cryptoWithdrawals.length === 0 ? (
                  <p className="text-sm text-slate-500">{c.noCryptoWithdrawals}</p>
                ) : (
                  <div className="space-y-3">
                    {cryptoWithdrawals.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-medium">
                            {formatAmount(entry.amount)} {entry.assetCode ?? ''}
                          </span>
                          <Badge variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}>
                            {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                          <span>
                            {c.createdAt}: {formatDateTime(entry.createdAt)}
                          </span>
                          <span>
                            {c.reference}: {entry.submittedTxHash ?? c.unknown}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>{c.transactionsTitle}</CardTitle>
            <CardDescription>{c.transactionsDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-slate-500">{c.noTransactions}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{c.type}</TableHead>
                    <TableHead>{c.amount}</TableHead>
                    <TableHead>{c.before}</TableHead>
                    <TableHead>{c.after}</TableHead>
                    <TableHead>{c.reference}</TableHead>
                    <TableHead>{c.createdAt}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatStatus(entry.entryType)}</TableCell>
                      <TableCell>{formatAmount(entry.amount)}</TableCell>
                      <TableCell>{formatAmount(entry.balanceBefore)}</TableCell>
                      <TableCell>{formatAmount(entry.balanceAfter)}</TableCell>
                      <TableCell>
                        {entry.referenceType && entry.referenceId
                          ? `${formatStatus(entry.referenceType)} #${entry.referenceId}`
                          : c.unknown}
                      </TableCell>
                      <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{c.sessionsTitle}</CardTitle>
                <CardDescription>{c.sessionsDescription}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                >
                  {refreshing ? t('common.loading') : c.refresh}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleRevokeAllSessions()}
                  disabled={sessionLoading}
                >
                  {sessionLoading ? t('common.loading') : c.signOutEverywhere}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-950">{c.currentDevice}</p>
              <p className="mt-1 break-all text-slate-500">
                {c.expires}: {formatDateTime(currentSession.expiresAt)}
              </p>
            </div>

            {sessions.length === 0 ? (
              <p className="text-sm text-slate-500">{c.noSessions}</p>
            ) : (
              sessions.map((entry) => (
                <div
                  key={entry.sessionId}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">
                        {entry.current ? c.currentDevice : c.activeSession}
                      </p>
                      <p className="mt-1 break-all text-slate-500">
                        {entry.userAgent ?? c.unknown}
                      </p>
                    </div>
                    <Badge variant={badgeVariant(entry.current)}>
                      {entry.current ? c.currentDevice : formatStatus(entry.kind)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-slate-500">
                    <p>
                      {c.device}: {entry.ip ?? c.unknown}
                    </p>
                    <p>
                      {c.createdAt}: {formatDateTime(entry.createdAt)}
                    </p>
                    <p>
                      {c.expires}: {formatDateTime(entry.expiresAt)}
                    </p>
                  </div>
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant={entry.current ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={() => void handleRevokeSession(entry.sessionId, entry.current)}
                      disabled={sessionLoading}
                    >
                      {sessionLoading
                        ? t('common.loading')
                        : entry.current
                          ? c.signOutThisDevice
                          : c.revoke}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
