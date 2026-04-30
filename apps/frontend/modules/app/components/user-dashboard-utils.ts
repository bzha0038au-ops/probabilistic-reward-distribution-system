import type {
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
} from "@reward/shared-types/finance";
import type { Locale } from "@/lib/i18n/messages";

type BadgeVariant = "default" | "destructive" | "secondary" | "outline";

export function formatUserDashboardActivityType(
  locale: Locale,
  entryType: string,
) {
  const zh = locale === "zh-CN";

  const labels = zh
    ? {
        prediction_market_stake: "预测市场下注",
        prediction_market_sell: "预测市场卖出",
        prediction_market_payout: "预测市场派奖",
        prediction_market_refund: "预测市场退款",
        gift_send: "赠送",
        gift_receive: "收礼",
        draw_cost: "抽奖消耗",
        draw_reward: "抽奖奖励",
        gamification_reward: "任务奖励",
        deposit_credit: "充值入账",
        deposit_reversed: "充值冲正",
        withdraw_request: "提现申请",
        withdraw_rejected_refund: "提现退回",
        withdraw_reversed_refund: "提现冲正",
        withdraw_paid: "提现打款",
      }
    : {
        prediction_market_stake: "Prediction market stake",
        prediction_market_sell: "Prediction market exit",
        prediction_market_payout: "Prediction market payout",
        prediction_market_refund: "Prediction market refund",
        gift_send: "Gift sent",
        gift_receive: "Gift received",
        draw_cost: "Draw stake",
        draw_reward: "Draw reward",
        gamification_reward: "Mission reward",
        deposit_credit: "Deposit credited",
        deposit_reversed: "Deposit reversed",
        withdraw_request: "Withdrawal requested",
        withdraw_rejected_refund: "Withdrawal refunded",
        withdraw_reversed_refund: "Withdrawal reversed",
        withdraw_paid: "Withdrawal paid",
      };

  if (entryType in labels) {
    return labels[entryType as keyof typeof labels];
  }

  return entryType
    .split("_")
    .map((part) =>
      part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

export function formatUserDashboardActivitySource(
  locale: Locale,
  source: "legacy" | "economy",
) {
  if (source === "economy") {
    return locale === "zh-CN" ? "经济账本" : "Economy";
  }

  return locale === "zh-CN" ? "旧钱包账本" : "Legacy";
}

export function formatUserDashboardAmount(
  locale: Locale,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    return "0.00";
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

export function formatUserDashboardDateTime(
  locale: Locale,
  unknownLabel: string,
  value: string | Date | null | undefined,
) {
  if (!value) {
    return unknownLabel;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function formatUserDashboardStatus(
  locale: Locale,
  unknownLabel: string,
  value: string | null | undefined,
) {
  if (!value) {
    return unknownLabel;
  }

  const predefined =
    locale === "zh-CN"
      ? {
          pending: "待处理",
          requested: "已申请",
          provider_pending: "渠道处理中",
          provider_succeeded: "已结算",
          provider_failed: "失败",
          provider_submitted: "打款中",
          provider_processing: "打款中",
          settled: "已结算",
          credited: "已入账",
          success: "成功",
          failed: "失败",
          approved: "已审核",
          paying: "打款中",
          rejected: "已拒绝",
          paid: "已打款",
          reversed: "已冲正",
          active: "有效",
          user: "用户",
          admin: "管理员",
        }
      : {
          pending: "Pending",
          requested: "Requested",
          provider_pending: "Provider Pending",
          provider_succeeded: "Settled",
          provider_failed: "Failed",
          provider_submitted: "Paying",
          provider_processing: "Paying",
          settled: "Settled",
          credited: "Credited",
          success: "Success",
          failed: "Failed",
          approved: "Approved",
          paying: "Paying",
          rejected: "Rejected",
          paid: "Paid",
          reversed: "Reversed",
          active: "Active",
          user: "User",
          admin: "Admin",
        };

  return (
    predefined[value as keyof typeof predefined] ??
    value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function resolveUserDashboardBadgeVariant(
  value: string | boolean,
): BadgeVariant {
  if (
    value === true ||
    value === "success" ||
    value === "credited" ||
    value === "approved" ||
    value === "paid"
  ) {
    return "default";
  }
  if (value === "failed" || value === "rejected" || value === "reversed") {
    return "destructive";
  }
  if (
    value === "pending" ||
    value === "requested" ||
    value === "provider_pending" ||
    value === "provider_succeeded" ||
    value === "provider_submitted" ||
    value === "provider_processing" ||
    value === "settled" ||
    value === "paying"
  ) {
    return "secondary";
  }
  return "outline";
}

export function readVisibleFinanceStatus(
  entry:
    | {
        status?: string | null;
        metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined,
) {
  if (!entry) {
    return null;
  }

  const metadata =
    entry.metadata &&
    typeof entry.metadata === "object" &&
    !Array.isArray(entry.metadata)
      ? entry.metadata
      : null;
  const projected =
    typeof metadata?.userVisibleStatus === "string"
      ? metadata.userVisibleStatus
      : typeof metadata?.financeSemanticStatus === "string"
        ? metadata.financeSemanticStatus
        : null;

  return projected ?? entry.status ?? null;
}

export function bankCardLabel(card: BankCardRecord) {
  const parts = [
    card.bankName,
    card.brand,
    card.last4 ? `•••• ${card.last4}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : card.cardholderName;
}

export function cryptoChannelLabel(channel: CryptoDepositChannelRecord) {
  return `${channel.token} · ${channel.network}`;
}

export function cryptoAddressViewLabel(
  address: CryptoWithdrawAddressViewRecord,
) {
  const headline =
    address.label?.trim() || `${address.token} · ${address.network}`;
  return `${headline} · ${address.address.slice(0, 10)}...${address.address.slice(-6)}`;
}
