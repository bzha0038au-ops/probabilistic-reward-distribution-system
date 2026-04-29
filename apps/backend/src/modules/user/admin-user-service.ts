import {
  authEvents,
  deposits,
  drawRecords,
  kycProfiles,
  prizes,
  userWallets,
  users,
  withdrawals,
} from '@reward/database';
import { and, desc, eq, ilike, inArray, or } from '@reward/database/orm';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import type { KycTier } from '@reward/shared-types/kyc';

import { db } from '../../db';
import { notFoundError } from '../../shared/errors';
import { getConfigView } from '../../shared/config';
import { sendPasswordResetNotification } from '../auth/notification-service';
import { issueAuthToken } from '../auth/token-service';
import {
  getActiveUserFreezeScopes,
  getUserAssociationGraph,
  listUserFreezeRecords,
} from '../risk/service';
import { getUserJurisdictionState } from '../risk/jurisdiction-service';
import { revokeAuthSessions } from '../session/service';

const config = getConfigView();
const DETAIL_LIMIT = 10;

const buildPublicUrl = (baseUrl: string, path: string, token: string) => {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('token', token);
  return url.toString();
};

const deriveKycTier = (
  user: {
    emailVerifiedAt: Date | string | null;
    phoneVerifiedAt: Date | string | null;
  },
  profileTier: KycTier | null
) => {
  if (profileTier) {
    return {
      kycTier: profileTier,
      kycTierSource: 'kyc_profile',
    };
  }

  if (user.phoneVerifiedAt) {
    return {
      kycTier: 'tier_2',
      kycTierSource: 'derived_contact_verification',
    };
  }

  if (user.emailVerifiedAt) {
    return {
      kycTier: 'tier_1',
      kycTierSource: 'derived_contact_verification',
    };
  }

  return {
    kycTier: 'tier_0',
    kycTierSource: 'derived_contact_verification',
  };
};

export async function searchUsersForAdmin(query: string, limit = 20) {
  const normalizedQuery = query.trim();
  if (normalizedQuery === '') {
    return {
      query: normalizedQuery,
      limit,
      items: [],
    };
  }

  const parsedUserId = Number(normalizedQuery);
  const searchConditions = [
    ilike(users.email, `%${normalizedQuery}%`),
    ilike(users.phone, `%${normalizedQuery}%`),
  ];

  if (Number.isFinite(parsedUserId) && parsedUserId > 0) {
    searchConditions.unshift(eq(users.id, Math.trunc(parsedUserId)));
  }

  const matchedUsers = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
    })
    .from(users)
    .where(and(eq(users.role, 'user'), or(...searchConditions)))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(limit);

  const matchedUserIds = matchedUsers.map((user) => user.id);
  const kycTierByUserId = new Map<number, KycTier>();
  if (matchedUserIds.length > 0) {
    const kycRows = await db
      .select({
        userId: kycProfiles.userId,
        currentTier: kycProfiles.currentTier,
      })
      .from(kycProfiles)
      .where(inArray(kycProfiles.userId, matchedUserIds));

    for (const row of kycRows) {
      kycTierByUserId.set(row.userId, row.currentTier);
    }
  }

  const freezeScopeMap = new Map<number, string[]>();
  await Promise.all(
    matchedUsers.map(async (user) => {
      freezeScopeMap.set(user.id, await getActiveUserFreezeScopes(user.id));
    })
  );

  return {
    query: normalizedQuery,
    limit,
    items: matchedUsers.map((user) => {
      const kyc = deriveKycTier(user, kycTierByUserId.get(user.id) ?? null);

      return {
        id: user.id,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
        emailVerifiedAt: user.emailVerifiedAt,
        phoneVerifiedAt: user.phoneVerifiedAt,
        kycTier: kyc.kycTier,
        activeScopes: freezeScopeMap.get(user.id) ?? [],
      };
    }),
  };
}

export async function getAdminUserDetail(userId: number) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'user')))
    .limit(1);

  if (!user) {
    return null;
  }

  const [
    wallet,
    kycProfile,
    jurisdiction,
    freezeRecords,
    recentDraws,
    depositRows,
    withdrawalRows,
    recentLoginIps,
  ] =
    await Promise.all([
      db
        .select({
          withdrawableBalance: userWallets.withdrawableBalance,
          bonusBalance: userWallets.bonusBalance,
          lockedBalance: userWallets.lockedBalance,
          wageredAmount: userWallets.wageredAmount,
          updatedAt: userWallets.updatedAt,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          id: kycProfiles.id,
          currentTier: kycProfiles.currentTier,
        })
        .from(kycProfiles)
        .where(eq(kycProfiles.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getUserJurisdictionState(userId),
      listUserFreezeRecords(userId, 50),
      db
        .select({
          id: drawRecords.id,
          prizeId: drawRecords.prizeId,
          prizeName: prizes.name,
          status: drawRecords.status,
          drawCost: drawRecords.drawCost,
          rewardAmount: drawRecords.rewardAmount,
          createdAt: drawRecords.createdAt,
        })
        .from(drawRecords)
        .leftJoin(prizes, eq(drawRecords.prizeId, prizes.id))
        .where(eq(drawRecords.userId, userId))
        .orderBy(desc(drawRecords.createdAt), desc(drawRecords.id))
        .limit(DETAIL_LIMIT),
      db
        .select({
          id: deposits.id,
          amount: deposits.amount,
          status: deposits.status,
          channelType: deposits.channelType,
          assetType: deposits.assetType,
          assetCode: deposits.assetCode,
          network: deposits.network,
          createdAt: deposits.createdAt,
          updatedAt: deposits.updatedAt,
        })
        .from(deposits)
        .where(eq(deposits.userId, userId))
        .orderBy(desc(deposits.createdAt), desc(deposits.id))
        .limit(DETAIL_LIMIT),
      db
        .select({
          id: withdrawals.id,
          amount: withdrawals.amount,
          status: withdrawals.status,
          channelType: withdrawals.channelType,
          assetType: withdrawals.assetType,
          assetCode: withdrawals.assetCode,
          network: withdrawals.network,
          createdAt: withdrawals.createdAt,
          updatedAt: withdrawals.updatedAt,
        })
        .from(withdrawals)
        .where(eq(withdrawals.userId, userId))
        .orderBy(desc(withdrawals.createdAt), desc(withdrawals.id))
        .limit(DETAIL_LIMIT),
      db
        .select({
          id: authEvents.id,
          eventType: authEvents.eventType,
          ip: authEvents.ip,
          userAgent: authEvents.userAgent,
          createdAt: authEvents.createdAt,
        })
        .from(authEvents)
        .where(
          and(
            eq(authEvents.userId, userId),
            or(
              eq(authEvents.eventType, 'user_login_success'),
              eq(authEvents.eventType, 'user_login_anomaly'),
              eq(authEvents.eventType, 'user_login_blocked')
            )
          )
        )
        .orderBy(desc(authEvents.createdAt), desc(authEvents.id))
        .limit(DETAIL_LIMIT),
    ]);

  const { kycTier, kycTierSource } = deriveKycTier(
    user,
    kycProfile?.currentTier ?? null
  );
  const activeScopes = [...new Set(
    freezeRecords
      .filter((record) => record.status === 'active')
      .map((record) => record.scope)
  )];

  const recentPayments = [
    ...depositRows.map((row) => ({ ...row, flow: 'deposit' as const })),
    ...withdrawalRows.map((row) => ({ ...row, flow: 'withdrawal' as const })),
  ]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )
    .slice(0, DETAIL_LIMIT);

  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      birthDate: user.birthDate ?? null,
      registrationCountryCode: user.registrationCountryCode ?? null,
      countryTier: user.countryTier,
      countryResolvedAt: user.countryResolvedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      userPoolBalance: user.userPoolBalance,
      pityStreak: user.pityStreak,
      lastDrawAt: user.lastDrawAt,
      lastWinAt: user.lastWinAt,
      kycProfileId: kycProfile?.id ?? null,
      kycTier,
      kycTierSource,
      activeScopes,
      jurisdiction,
    },
    wallet: wallet ?? {
      withdrawableBalance: '0',
      bonusBalance: '0',
      lockedBalance: '0',
      wageredAmount: '0',
      updatedAt: null,
    },
    freezes: freezeRecords,
    recentDraws,
    recentPayments,
    recentLoginIps,
  };
}

export async function getAdminUserAssociations(
  userId: number,
  options: {
    days?: number;
    signalLimit?: number;
  } = {}
) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'user')))
    .limit(1);

  if (!user) {
    return null;
  }

  return getUserAssociationGraph(userId, options);
}

export async function forceLogoutUserByAdmin(userId: number) {
  return revokeAuthSessions({
    userId,
    kind: 'user',
    reason: 'admin_logout',
    eventType: 'user_sessions_revoked_all',
    metadata: {
      initiatedBy: 'admin_operator',
    },
  });
}

export async function triggerUserPasswordResetByAdmin(userId: number) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'user')))
    .limit(1);

  if (!user) {
    throw notFoundError('User not found.', {
      code: API_ERROR_CODES.USER_NOT_FOUND,
    });
  }

  const issued = await issueAuthToken({
    tokenType: 'password_reset',
    userId: user.id,
    email: user.email,
    ttlMinutes: config.passwordResetTtlMinutes,
  });

  await sendPasswordResetNotification({
    email: user.email,
    resetUrl: buildPublicUrl(config.webBaseUrl, '/reset-password', issued.rawToken),
    expiresAt: issued.expiresAt,
  });

  return {
    userId: user.id,
    email: user.email,
    expiresAt: issued.expiresAt,
  };
}
