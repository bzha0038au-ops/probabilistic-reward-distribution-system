import { and, desc, eq, inArray, sql } from "@reward/database/orm";
import {
  notificationPreferences,
  notificationPushDevices,
  notificationRecords,
  users,
} from "@reward/database";
import type {
  NotificationChannel,
  NotificationKind,
  NotificationListQuery,
  NotificationPushDeviceRegisterRequest,
  NotificationPushPlatform,
  NotificationPreferencesUpdateRequest,
  NotificationSummary,
} from "@reward/shared-types/notification";
import type { WithdrawalStatus } from "@reward/shared-types/finance";
import type { KycStatus } from "@reward/shared-types/kyc";

import { db, type DbTransaction } from "../../db";
import { logger } from "../../shared/logger";
import {
  normalizeEmail,
  normalizePhone,
  queueNotificationDelivery,
} from "../auth/notification-service";

type NotificationDb = typeof db | DbTransaction;
type NotificationData = Record<string, unknown>;

type UserContact = {
  email: string | null;
  phone: string | null;
};

type PushDeviceRow = {
  token: string;
  platform: NotificationPushPlatform;
};

type SendUserNotificationInput = {
  userId: number;
  kind: NotificationKind;
  title: string;
  body: string;
  subject?: string;
  data?: NotificationData | null;
  channels?: NotificationChannel[];
  email?: string | null;
  phone?: string | null;
  pushRecipient?: string | null;
};

const missingNotificationTableWarnings = new Set<string>();
const DEFAULT_USER_CHANNELS: readonly NotificationChannel[] = ["in_app"];
const WITHDRAWAL_EMAIL_STATUSES = new Set<WithdrawalStatus>([
  "approved",
  "provider_failed",
  "paid",
  "rejected",
  "reversed",
]);

const uniqueChannels = (channels: readonly NotificationChannel[]) => [
  ...new Set(channels),
];

const unwrapDatabaseError = (error: unknown): Record<string, unknown> | null => {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate =
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null
      ? error.cause
      : error;

  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null;
};

const isMissingRelationError = (error: unknown, tableName: string) => {
  const candidate = unwrapDatabaseError(error);
  if (!candidate) {
    return false;
  }

  if (candidate.code === "42P01") {
    return true;
  }

  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return (
    message.includes(`relation "${tableName}" does not exist`) ||
    message.includes(`relation '${tableName}' does not exist`)
  );
};

const logMissingNotificationTableFallback = (tableName: string) => {
  if (missingNotificationTableWarnings.has(tableName)) {
    return;
  }

  missingNotificationTableWarnings.add(tableName);
  logger.debug("notification relation unavailable; using compatibility fallback", {
    tableName,
  });
};

const loadUserContact = async (
  executor: NotificationDb,
  userId: number,
): Promise<UserContact> => {
  const [user] = await executor
    .select({
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    email: user?.email ?? null,
    phone: user?.phone ?? null,
  };
};

const loadActivePushRecipients = async (
  executor: NotificationDb,
  userId: number,
): Promise<PushDeviceRow[]> => {
  let rows: Array<{
    token: string;
    platform: string;
  }>;
  try {
    rows = await executor
      .select({
        token: notificationPushDevices.token,
        platform: notificationPushDevices.platform,
      })
      .from(notificationPushDevices)
      .where(
        and(
          eq(notificationPushDevices.userId, userId),
          eq(notificationPushDevices.active, true),
        ),
      )
      .orderBy(
        desc(notificationPushDevices.updatedAt),
        desc(notificationPushDevices.id),
      );
  } catch (error) {
    if (isMissingRelationError(error, "notification_push_devices")) {
      logMissingNotificationTableFallback("notification_push_devices");
      return [];
    }
    throw error;
  }

  return rows.map((row) => ({
    token: row.token,
    platform: row.platform as NotificationPushPlatform,
  }));
};

const resolveEnabledChannels = async (
  executor: NotificationDb,
  userId: number,
  kind: NotificationKind,
  channels: readonly NotificationChannel[],
) => {
  const requested = uniqueChannels(channels);
  if (requested.length === 0) {
    return [];
  }

  let rows: Array<{
    channel: string;
    enabled: boolean;
  }>;
  try {
    rows = await executor
      .select({
        channel: notificationPreferences.channel,
        enabled: notificationPreferences.enabled,
      })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.kind, kind),
          inArray(notificationPreferences.channel, requested),
        ),
      );
  } catch (error) {
    if (isMissingRelationError(error, "notification_preferences")) {
      logMissingNotificationTableFallback("notification_preferences");
      return requested;
    }
    throw error;
  }

  const overrides = new Map<NotificationChannel, boolean>();
  for (const row of rows) {
    overrides.set(row.channel as NotificationChannel, row.enabled);
  }

  return requested.filter((channel) => overrides.get(channel) ?? true);
};

const createNotificationRecord = async (
  executor: NotificationDb,
  payload: {
    userId: number;
    kind: NotificationKind;
    title: string;
    body: string;
    data?: NotificationData | null;
  },
) => {
  let record:
    | {
        id: number;
      }
    | null
    | undefined;
  try {
    [record] = await executor
      .insert(notificationRecords)
      .values({
        userId: payload.userId,
        kind: payload.kind,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? null,
        updatedAt: new Date(),
      })
      .returning();
  } catch (error) {
    if (isMissingRelationError(error, "notification_records")) {
      logMissingNotificationTableFallback("notification_records");
      return null;
    }
    throw error;
  }

  return record ?? null;
};

const resolveChannelRecipient = (
  channel: NotificationChannel,
  payload: {
    userId: number;
    email?: string | null;
    phone?: string | null;
    pushRecipient?: string | null;
  },
) => {
  if (channel === "email") {
    return payload.email ? normalizeEmail(payload.email) : null;
  }
  if (channel === "sms") {
    return payload.phone ? normalizePhone(payload.phone) : null;
  }
  if (channel === "push") {
    return payload.pushRecipient?.trim() || null;
  }
  return `user:${payload.userId}`;
};

export async function sendUserNotification(
  payload: SendUserNotificationInput,
) {
  return db.transaction(async (tx) => {
    const requestedChannels =
      payload.channels && payload.channels.length > 0
        ? payload.channels
        : DEFAULT_USER_CHANNELS;
    const enabledChannels = await resolveEnabledChannels(
      tx,
      payload.userId,
      payload.kind,
      requestedChannels,
    );
    if (enabledChannels.length === 0) {
      return {
        notification: null,
        deliveries: [],
      };
    }

    const needsUserContact = enabledChannels.some(
      (channel) =>
        (channel === "email" && !payload.email) ||
        (channel === "sms" && !payload.phone),
    );
    const contact = needsUserContact
      ? await loadUserContact(tx, payload.userId)
      : null;
    const pushRecipients = enabledChannels.includes("push")
      ? payload.pushRecipient
        ? [{ token: payload.pushRecipient, platform: "ios" as const }]
        : await loadActivePushRecipients(tx, payload.userId)
      : [];

    const record = enabledChannels.includes("in_app")
      ? await createNotificationRecord(tx, {
          userId: payload.userId,
          kind: payload.kind,
          title: payload.title,
          body: payload.body,
          data: payload.data ?? null,
        })
      : null;
    const deliveries = [];

    for (const channel of enabledChannels) {
      const recipients =
        channel === "push"
          ? pushRecipients.map((recipient) => ({
              recipient: recipient.token,
              metadata: {
                pushPlatform: recipient.platform,
              },
            }))
          : [
              {
                recipient: resolveChannelRecipient(channel, {
                  userId: payload.userId,
                  email: payload.email ?? contact?.email ?? null,
                  phone: payload.phone ?? contact?.phone ?? null,
                  pushRecipient: payload.pushRecipient ?? null,
                }),
                metadata: {},
              },
            ];

      for (const item of recipients) {
        if (!item.recipient) {
          continue;
        }

        try {
          const delivery = await queueNotificationDelivery(
            {
              userId: payload.userId,
              notificationRecordId: record?.id ?? null,
              kind: payload.kind,
              channel,
              recipient: item.recipient,
              subject: payload.subject ?? payload.title,
              body: payload.body,
              metadata: {
                ...(payload.data ?? {}),
                ...item.metadata,
              },
            },
            tx,
          );
          deliveries.push(delivery);
        } catch (error) {
          logger.warning("failed to queue user notification delivery", {
            userId: payload.userId,
            kind: payload.kind,
            channel,
            recipient: item.recipient,
            err: error,
          });
        }
      }
    }

    return {
      notification: record,
      deliveries,
    };
  });
}

export async function listUserNotifications(
  userId: number,
  query: NotificationListQuery = {},
) {
  const conditions = [eq(notificationRecords.userId, userId)];
  if (query.unreadOnly) {
    conditions.push(sql`${notificationRecords.readAt} is null`);
  }

  const rows = await db
    .select()
    .from(notificationRecords)
    .where(and(...conditions))
    .orderBy(
      desc(notificationRecords.createdAt),
      desc(notificationRecords.id),
    )
    .limit(query.limit ?? 50);

  return {
    items: rows,
  };
}

export async function getUserNotificationSummary(
  userId: number,
): Promise<NotificationSummary> {
  const [row] = await db
    .select({
      unreadCount:
        sql<number>`count(*) filter (where ${notificationRecords.readAt} is null)`,
      latestCreatedAt: sql<Date | null>`max(${notificationRecords.createdAt})`,
    })
    .from(notificationRecords)
    .where(eq(notificationRecords.userId, userId));

  return {
    unreadCount: Number(row?.unreadCount ?? 0),
    latestCreatedAt: row?.latestCreatedAt ?? null,
  };
}

export async function markUserNotificationRead(userId: number, notificationId: number) {
  const [record] = await db
    .update(notificationRecords)
    .set({
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationRecords.id, notificationId),
        eq(notificationRecords.userId, userId),
      ),
    )
    .returning();

  return record ?? null;
}

export async function markAllUserNotificationsRead(userId: number) {
  const rows = await db
    .update(notificationRecords)
    .set({
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationRecords.userId, userId),
        sql`${notificationRecords.readAt} is null`,
      ),
    )
    .returning({
      id: notificationRecords.id,
    });

  return {
    updatedCount: rows.length,
  };
}

export async function listUserNotificationPreferences(userId: number) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .orderBy(
      notificationPreferences.kind,
      notificationPreferences.channel,
      notificationPreferences.id,
    );

  return {
    items: rows,
  };
}

export async function updateUserNotificationPreferences(
  userId: number,
  payload: NotificationPreferencesUpdateRequest,
) {
  await db
    .insert(notificationPreferences)
    .values(
      payload.items.map((item) => ({
        userId,
        kind: item.kind,
        channel: item.channel,
        enabled: item.enabled,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.kind,
        notificationPreferences.channel,
      ],
      set: {
        enabled: sql`excluded.enabled`,
        updatedAt: new Date(),
      },
    });

  return listUserNotificationPreferences(userId);
}

export async function registerUserNotificationPushDevice(
  userId: number,
  payload: NotificationPushDeviceRegisterRequest,
  options?: {
    deviceFingerprint?: string | null;
  },
) {
  const [device] = await db
    .insert(notificationPushDevices)
    .values({
      userId,
      token: payload.token.trim(),
      platform: payload.platform,
      deviceFingerprint: options?.deviceFingerprint ?? null,
      active: true,
      lastRegisteredAt: new Date(),
      lastError: null,
      deactivatedAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [notificationPushDevices.token],
      set: {
        userId,
        platform: payload.platform,
        deviceFingerprint: options?.deviceFingerprint ?? null,
        active: true,
        lastRegisteredAt: new Date(),
        lastError: null,
        deactivatedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return device ?? null;
}

export async function unregisterUserNotificationPushDevice(
  userId: number,
  token: string,
) {
  const [device] = await db
    .update(notificationPushDevices)
    .set({
      active: false,
      deactivatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationPushDevices.userId, userId),
        eq(notificationPushDevices.token, token.trim()),
      ),
    )
    .returning();

  return device ?? null;
}

export async function sendKycStatusChangedNotification(payload: {
  userId: number;
  status: KycStatus;
  targetTier?: string | null;
  rejectionReason?: string | null;
}) {
  const title =
    payload.status === "approved"
      ? "KYC approved"
      : payload.status === "rejected"
        ? "KYC rejected"
        : "KYC needs more information";
  const body =
    payload.status === "approved"
      ? `Your KYC review has been approved${payload.targetTier ? ` for ${payload.targetTier}` : ""}.`
      : payload.status === "rejected"
        ? `Your KYC review has been rejected.${payload.rejectionReason ? ` Reason: ${payload.rejectionReason}` : ""}`
        : `Your KYC review needs more information.${payload.rejectionReason ? ` ${payload.rejectionReason}` : ""}`;

  return sendUserNotification({
    userId: payload.userId,
    kind: "kyc_status_changed",
    title,
    body,
    channels: ["in_app", "email", "push"],
    data: {
      status: payload.status,
      targetTier: payload.targetTier ?? null,
      rejectionReason: payload.rejectionReason ?? null,
    },
  });
}

export async function sendWithdrawalStatusChangedNotification(payload: {
  userId: number;
  withdrawalId: number;
  amount: string;
  status: WithdrawalStatus;
}) {
  const statusLabel = payload.status.replace(/_/g, ' ');
  const channels: NotificationChannel[] = ["in_app", "push"];
  if (WITHDRAWAL_EMAIL_STATUSES.has(payload.status)) {
    channels.push("email");
  }

  return sendUserNotification({
    userId: payload.userId,
    kind: "withdrawal_status_changed",
    title: `Withdrawal #${payload.withdrawalId} updated`,
    body: `Withdrawal #${payload.withdrawalId} for ${payload.amount} is now ${statusLabel}.`,
    channels,
    data: {
      withdrawalId: payload.withdrawalId,
      amount: payload.amount,
      status: payload.status,
    },
  });
}

export async function sendPredictionMarketSettledNotification(payload: {
  userId: number;
  marketId: number;
  marketTitle: string;
  winningOutcomeLabel: string;
  positionCount: number;
  payoutAmount: string;
}) {
  return sendUserNotification({
    userId: payload.userId,
    kind: "prediction_market_settled",
    title: "Prediction market settled",
    body: `${payload.marketTitle} settled on ${payload.winningOutcomeLabel}. ${payload.positionCount} position(s) were finalized with ${payload.payoutAmount} returned to your wallet.`,
    channels: ["in_app", "email", "push"],
    data: {
      marketId: payload.marketId,
      marketTitle: payload.marketTitle,
      winningOutcomeLabel: payload.winningOutcomeLabel,
      positionCount: payload.positionCount,
      payoutAmount: payload.payoutAmount,
    },
  });
}

export async function sendAmlHitAdminNotification(payload: {
  adminUserId: number;
  adminEmail: string;
  subjectUserId: number;
  subjectEmail: string;
  subjectPhone?: string | null;
  checkpoint: string;
  riskLevel: string;
  providerKey: string;
  summary?: string | null;
}) {
  return sendUserNotification({
    userId: payload.adminUserId,
    email: payload.adminEmail,
    kind: "aml_review",
    title: `AML review required for user #${payload.subjectUserId}`,
    body:
      payload.summary?.trim() ||
      `Checkpoint ${payload.checkpoint} triggered a ${payload.riskLevel} AML hit for ${payload.subjectEmail}.`,
    channels: ["in_app", "email"],
    data: {
      userId: payload.subjectUserId,
      userEmail: payload.subjectEmail,
      userPhone: payload.subjectPhone ?? null,
      checkpoint: payload.checkpoint,
      riskLevel: payload.riskLevel,
      providerKey: payload.providerKey,
      summary: payload.summary ?? null,
    },
  });
}

export async function sendHoldemTableInviteNotification(payload: {
  userId: number;
  tableId: number;
  tableName: string;
  invitedByUserId: number;
}) {
  return sendUserNotification({
    userId: payload.userId,
    kind: "holdem_table_invite",
    title: "Hold'em table invite",
    body: `You have been invited to join ${payload.tableName}.`,
    channels: ["in_app", "push"],
    data: {
      tableId: payload.tableId,
      tableName: payload.tableName,
      invitedByUserId: payload.invitedByUserId,
    },
  });
}
