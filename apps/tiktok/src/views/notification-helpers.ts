import type { NotificationFilter } from "../app-types";
import type {
  NotificationChannel,
  NotificationKind,
  NotificationPreferenceRecord,
  NotificationRecord,
} from "@reward/shared-types/notification";

export type NotificationCategory = Exclude<NotificationFilter, "all">;

const rewardKinds = new Set<NotificationKind>([
  "aml_review",
  "saas_tenant_invite",
  "saas_onboarding_complete",
  "saas_billing_budget_alert",
  "kyc_reverification",
  "kyc_status_changed",
  "withdrawal_status_changed",
]);

const gameKinds = new Set<NotificationKind>(["holdem_table_invite"]);
const marketKinds = new Set<NotificationKind>(["prediction_market_settled"]);
const securityKinds = new Set<NotificationKind>([
  "password_reset",
  "email_verification",
  "phone_verification",
  "security_alert",
]);

export const notificationFilterOrder: NotificationFilter[] = [
  "all",
  "rewards",
  "games",
  "market",
  "security",
];

export const notificationKindOrder: NotificationKind[] = [
  "security_alert",
  "email_verification",
  "phone_verification",
  "withdrawal_status_changed",
  "prediction_market_settled",
  "holdem_table_invite",
];

export const notificationChannelOrder: NotificationChannel[] = ["email", "sms", "in_app", "push"];

export function getNotificationCategory(kind: NotificationKind): NotificationCategory {
  if (securityKinds.has(kind)) {
    return "security";
  }
  if (marketKinds.has(kind)) {
    return "market";
  }
  if (gameKinds.has(kind)) {
    return "games";
  }
  if (rewardKinds.has(kind)) {
    return "rewards";
  }
  return "rewards";
}

export function getNotificationCounts(items: NotificationRecord[]): Record<NotificationFilter, number> {
  const counts: Record<NotificationFilter, number> = {
    all: items.length,
    rewards: 0,
    games: 0,
    market: 0,
    security: 0,
  };

  for (const item of items) {
    counts[getNotificationCategory(item.kind)] += 1;
  }

  return counts;
}

export function filterNotifications(
  items: NotificationRecord[],
  filter: NotificationFilter,
  unreadOnly: boolean,
): NotificationRecord[] {
  return items.filter((item) => {
    if (unreadOnly && item.readAt) {
      return false;
    }
    if (filter === "all") {
      return true;
    }
    return getNotificationCategory(item.kind) === filter;
  });
}

export function getNotificationKindLabel(kind: NotificationKind): string {
  switch (kind) {
    case "password_reset":
      return "Password Reset";
    case "email_verification":
      return "Email Verification";
    case "phone_verification":
      return "Phone Verification";
    case "security_alert":
      return "Security Alert";
    case "aml_review":
      return "AML Review";
    case "saas_tenant_invite":
      return "Tenant Invite";
    case "saas_onboarding_complete":
      return "Onboarding Complete";
    case "saas_billing_budget_alert":
      return "Budget Alert";
    case "kyc_reverification":
      return "KYC Reverification";
    case "kyc_status_changed":
      return "KYC Status";
    case "withdrawal_status_changed":
      return "Withdrawal Status";
    case "prediction_market_settled":
      return "Market Settled";
    case "holdem_table_invite":
      return "Table Invite";
  }
}

export function getNotificationChannelLabel(channel: NotificationChannel): string {
  switch (channel) {
    case "email":
      return "Email";
    case "sms":
      return "SMS";
    case "push":
      return "Push";
    case "in_app":
      return "In-App";
  }
}

export function groupNotificationPreferences(
  items: NotificationPreferenceRecord[],
): Array<{ kind: NotificationKind; items: NotificationPreferenceRecord[] }> {
  return notificationKindOrder
    .map((kind) => ({
      kind,
      items: items
        .filter((entry) => entry.kind === kind && entry.channel !== "push")
        .sort(
          (left, right) =>
            notificationChannelOrder.indexOf(left.channel) -
            notificationChannelOrder.indexOf(right.channel),
        ),
    }))
    .filter((group) => group.items.length > 0);
}
