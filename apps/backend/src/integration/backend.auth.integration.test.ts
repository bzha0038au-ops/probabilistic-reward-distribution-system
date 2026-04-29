import { createHash, randomUUID } from "node:crypto";

import {
  ADMIN_SESSION_COOKIE,
  authNotificationCaptures,
  buildAdminCookieHeaders,
  describeIntegrationSuite,
  enrollAdminMfa,
  extractTokenFromUrl,
  getApp,
  getCreateUserSessionToken,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  loginUser,
  registerUser,
  seedAdminAccount,
  verifyUserContacts,
} from './integration-test-support';
import { and, asc, desc, eq } from '@reward/database/orm';
import { expect, vi } from 'vitest';
import { ADMIN_PERMISSION_KEYS } from '../modules/admin-permission/definitions';
import {
  adminActions,
  amlChecks,
  admins,
  authEvents,
  authSessions,
  authTokens,
  deviceFingerprints,
  freezeRecords,
  jurisdictionRules,
  kycProfiles,
  ledgerEntries,
  missions,
  notificationDeliveries,
  notificationRecords,
  referrals,
  securityEvents,
  users,
  userMfaSecrets,
  userWallets,
} from '@reward/database';

const insertUserAuthSession = async (
  userId: number,
  ip: string,
  userAgent: string,
) => {
  const now = new Date();

  await getDb().insert(authSessions).values({
    userId,
    sessionKind: 'user',
    subjectRole: 'user',
    jti: randomUUID(),
    status: 'active',
    ip,
    userAgent,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
};

const registerUserViaHttp = async (params: {
  email: string;
  password?: string;
  birthDate: string;
  countryCode?: string;
}) => {
  const currentLegalResponse = await getApp().inject({
    method: 'GET',
    url: '/legal/current',
  });

  expect(currentLegalResponse.statusCode).toBe(200);
  const currentLegalDocuments = currentLegalResponse.json().data as {
    items: Array<{ slug: string; version: string }>;
  };

  return getApp().inject({
    method: 'POST',
    url: '/auth/register',
    headers: {
      'content-type': 'application/json',
      ...(params.countryCode ? { 'cf-ipcountry': params.countryCode } : {}),
    },
    payload: {
      email: params.email,
      password: params.password ?? 'secret-123',
      birthDate: params.birthDate,
      legalAcceptances: currentLegalDocuments.items.map((document) => ({
        slug: document.slug,
        version: document.version,
      })),
    },
  });
};

const loadUserByEmail = async (email: string) => {
  const [user] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      countryTier: users.countryTier,
      registrationCountryCode: users.registrationCountryCode,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  expect(user).toBeDefined();
  return user!;
};

const listActiveFreezes = async (userId: number) =>
  getDb()
    .select({
      scope: freezeRecords.scope,
      reason: freezeRecords.reason,
      metadata: freezeRecords.metadata,
    })
    .from(freezeRecords)
    .where(
      and(
        eq(freezeRecords.userId, userId),
        eq(freezeRecords.status, 'active'),
      ),
    )
    .orderBy(asc(freezeRecords.id));

const expectQueuedAmlAdminNotification = async (params: {
  adminUserId: number;
  adminEmail: string;
  subjectUserId: number;
  subjectEmail: string;
  checkpoint: string;
  riskLevel: string;
  providerKey: string;
}) => {
  const [record] = await getDb()
    .select({
      userId: notificationRecords.userId,
      kind: notificationRecords.kind,
      title: notificationRecords.title,
      data: notificationRecords.data,
    })
    .from(notificationRecords)
    .where(
      and(
        eq(notificationRecords.userId, params.adminUserId),
        eq(notificationRecords.kind, 'aml_review'),
      ),
    )
    .orderBy(desc(notificationRecords.id))
    .limit(1);

  expect(record).toMatchObject({
    userId: params.adminUserId,
    kind: 'aml_review',
    title: `AML review required for user #${params.subjectUserId}`,
    data: expect.objectContaining({
      userId: params.subjectUserId,
      userEmail: params.subjectEmail,
      checkpoint: params.checkpoint,
      riskLevel: params.riskLevel,
      providerKey: params.providerKey,
    }),
  });

  const deliveries = await getDb()
    .select({
      channel: notificationDeliveries.channel,
      recipient: notificationDeliveries.recipient,
      subject: notificationDeliveries.subject,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.userId, params.adminUserId),
        eq(notificationDeliveries.kind, 'aml_review'),
      ),
    )
    .orderBy(asc(notificationDeliveries.id));

  expect(deliveries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        channel: 'email',
        recipient: params.adminEmail,
        subject: `AML review required for user #${params.subjectUserId}`,
      }),
      expect.objectContaining({
        channel: 'in_app',
        recipient: `user:${params.adminUserId}`,
      }),
    ]),
  );
};

describeIntegrationSuite('backend auth integration', () => {
  it('POST /auth/register creates a user and wallet via HTTP', async () => {
    const response = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'new-user@example.com',
        password: 'secret-123',
        birthDate: '1990-01-01',
      },
    });

    expect(response.statusCode).toBe(201);

    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      email: 'new-user@example.com',
    });

    const [user] = await getDb()
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, 'new-user@example.com'))
      .limit(1);

    expect(user).toMatchObject({
      email: 'new-user@example.com',
    });

    const [wallet] = await getDb()
      .select({ userId: userWallets.userId })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet?.userId).toBe(user.id);
  });

  it('applies underage jurisdiction freezes during registration and blocks top-ups', async () => {
    await getDb().insert(jurisdictionRules).values({
      countryCode: 'US',
      minimumAge: 21,
      allowedFeatures: [
        'real_money_gameplay',
        'topup',
        'withdrawal',
      ],
      notes: 'integration-underage',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const registerResponse = await registerUserViaHttp({
      email: 'underage-jurisdiction@example.com',
      birthDate: '2010-01-01',
      countryCode: 'US',
    });

    expect(registerResponse.statusCode).toBe(201);

    const user = await loadUserByEmail('underage-jurisdiction@example.com');
    expect(user.registrationCountryCode).toBe('US');
    expect(user.countryTier).toBe('blocked');

    const freezes = await listActiveFreezes(user.id);
    expect(freezes).toEqual([
      expect.objectContaining({
        scope: 'gameplay_lock',
        reason: 'underage_restriction',
      }),
      expect.objectContaining({
        scope: 'topup_lock',
        reason: 'underage_restriction',
      }),
      expect.objectContaining({
        scope: 'withdrawal_lock',
        reason: 'underage_restriction',
      }),
    ]);

    const { token } = await loginUser(
      'underage-jurisdiction@example.com',
      'secret-123',
    );
    const topUpResponse = await getApp().inject({
      method: 'POST',
      url: '/top-ups',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 25.5,
      },
    });

    expect(topUpResponse.statusCode).toBe(423);
  });

  it('applies blocked-country jurisdiction freezes during registration and blocks top-ups', async () => {
    await getDb().insert(jurisdictionRules).values({
      countryCode: 'CN',
      minimumAge: 18,
      allowedFeatures: [],
      notes: 'integration-blocked-country',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const registerResponse = await registerUserViaHttp({
      email: 'cn-jurisdiction-user@example.com',
      birthDate: '1990-01-01',
      countryCode: 'CN',
    });

    expect(registerResponse.statusCode).toBe(201);

    const user = await loadUserByEmail('cn-jurisdiction-user@example.com');
    expect(user.registrationCountryCode).toBe('CN');
    expect(user.countryTier).toBe('blocked');

    const freezes = await listActiveFreezes(user.id);
    expect(freezes).toEqual([
      expect.objectContaining({
        scope: 'gameplay_lock',
        reason: 'jurisdiction_restriction',
      }),
      expect.objectContaining({
        scope: 'topup_lock',
        reason: 'jurisdiction_restriction',
      }),
      expect.objectContaining({
        scope: 'withdrawal_lock',
        reason: 'jurisdiction_restriction',
      }),
    ]);

    const { token } = await loginUser(
      'cn-jurisdiction-user@example.com',
      'secret-123',
    );
    const topUpResponse = await getApp().inject({
      method: 'POST',
      url: '/top-ups',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 25.5,
      },
    });

    expect(topUpResponse.statusCode).toBe(423);
  });

  it('re-syncs existing users when an admin updates jurisdiction rules', async () => {
    const registerResponse = await registerUserViaHttp({
      email: 'rule-resync-user@example.com',
      birthDate: '1990-01-01',
      countryCode: 'AU',
    });

    expect(registerResponse.statusCode).toBe(201);

    const user = await loadUserByEmail('rule-resync-user@example.com');
    expect(user.countryTier).toBe('full');
    expect(await listActiveFreezes(user.id)).toHaveLength(0);

    const { admin, password } = await seedAdminAccount({
      email: 'jurisdiction-admin@example.com',
    });
    await grantAdminPermissions(admin.id, [
      ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
    ]);
    const adminSession = await enrollAdminMfa({
      email: 'jurisdiction-admin@example.com',
      password,
    });

    const upsertResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/jurisdiction-rules',
      headers: {
        ...buildAdminCookieHeaders(adminSession.token),
        'x-admin-totp-code': adminSession.totpCode,
        'content-type': 'application/json',
      },
      payload: {
        countryCode: 'AU',
        minimumAge: 18,
        allowedFeatures: ['real_money_gameplay'],
        notes: 'integration-resync',
      },
    });

    expect(upsertResponse.statusCode).toBe(200);
    expect(upsertResponse.json().data).toMatchObject({
      countryCode: 'AU',
      minimumAge: 18,
      allowedFeatures: ['real_money_gameplay'],
    });

    const refreshedUser = await loadUserByEmail('rule-resync-user@example.com');
    expect(refreshedUser.countryTier).toBe('restricted');

    const freezes = await listActiveFreezes(user.id);
    expect(freezes).toEqual([
      expect.objectContaining({
        scope: 'topup_lock',
        reason: 'jurisdiction_restriction',
      }),
      expect.objectContaining({
        scope: 'withdrawal_lock',
        reason: 'jurisdiction_restriction',
      }),
    ]);

    const { token } = await loginUser(
      'rule-resync-user@example.com',
      'secret-123',
    );
    const topUpResponse = await getApp().inject({
      method: 'POST',
      url: '/top-ups',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: 25.5,
      },
    });

    expect(topUpResponse.statusCode).toBe(423);
  });

  it(
    'stores pending referrals instead of paying the referrer immediately',
    { timeout: 60_000 },
    async () => {
    const referrer = await registerUser('referrer-pending@example.com');
    const referred = await registerUser(
      'referred-pending@example.com',
      'secret-123',
      referrer.id,
    );

    const [referral] = await getDb()
      .select({
        referrerId: referrals.referrerId,
        referredId: referrals.referredId,
        status: referrals.status,
        rewardId: referrals.rewardId,
      })
      .from(referrals)
      .where(eq(referrals.referredId, referred.id))
      .limit(1);

    expect(referral).toMatchObject({
      referrerId: referrer.id,
      referredId: referred.id,
      status: 'pending',
      rewardId: 'referral_program',
    });

    const immediateReferralEntries = await getDb()
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.entryType, 'referral_bonus'));

    expect(immediateReferralEntries).toHaveLength(0);
    },
  );

  it(
    'qualifies distinct-device referrals into a claimable reward mission after tier 1 approval',
    { timeout: 60_000 },
    async () => {
    const missionId = 'referral_growth_test';
    const { reviewKycProfile } = await import('../modules/kyc/service');

    await getDb().insert(missions).values({
      id: missionId,
      type: 'metric_threshold',
      params: {
        title: 'Invite a friend',
        description: 'Invite one friend who completes Tier 1 KYC.',
        metric: 'referral_success_count',
        target: 1,
        cadence: 'one_time',
        rewardId: 'referral_program',
        sortOrder: 90,
      },
      reward: '7.00',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const referrer = await registerUser('referrer-qualified@example.com');
    const referred = await registerUser(
      'referred-qualified@example.com',
      'secret-123',
      referrer.id,
    );

    await insertUserAuthSession(
      referrer.id,
      '198.51.100.10',
      'ReferralReferrer/1.0',
    );
    await insertUserAuthSession(
      referred.id,
      '198.51.100.11',
      'ReferralReferred/1.0',
    );

    const [profile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: referred.id,
        currentTier: 'tier_0',
        requestedTier: 'tier_1',
        status: 'pending',
        submissionVersion: 1,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: kycProfiles.id });

    const { admin } = await seedAdminAccount({
      email: 'referral-review-admin@example.com',
    });

    await reviewKycProfile({
      profileId: profile.id,
      adminId: admin.id,
      decision: 'approved',
    });

    const [referral] = await getDb()
      .select({
        status: referrals.status,
        qualifiedAt: referrals.qualifiedAt,
      })
      .from(referrals)
      .where(eq(referrals.referredId, referred.id))
      .limit(1);

    expect(referral?.status).toBe('qualified');
    expect(referral?.qualifiedAt).not.toBeNull();

    const { token } = await getCreateUserSessionToken()({
      userId: referrer.id,
      email: referrer.email,
      role: 'user',
    });

    const readyResponse = await getApp().inject({
      method: 'GET',
      url: '/rewards/center',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json().data.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missionId,
          status: 'ready',
          claimable: true,
          progressCurrent: 1,
          progressTarget: 1,
        }),
      ]),
    );

    const claimResponse = await getApp().inject({
      method: 'POST',
      url: '/rewards/claim',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        missionId,
      },
    });

    expect(claimResponse.statusCode).toBe(200);
    expect(claimResponse.json().data).toMatchObject({
      missionId,
      grantedAmount: '7.00',
    });

    const [rewardLedger] = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        metadata: ledgerEntries.metadata,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, referrer.id),
          eq(ledgerEntries.entryType, 'gamification_reward'),
        ),
      )
      .orderBy(desc(ledgerEntries.id))
      .limit(1);

    const rewardMetadata =
      typeof rewardLedger?.metadata === 'object' && rewardLedger.metadata !== null
        ? (rewardLedger.metadata as Record<string, unknown>)
        : {};

    expect(rewardLedger?.entryType).toBe('gamification_reward');
    expect(rewardMetadata.missionId).toBe(missionId);
    },
  );

  it(
    'rejects referrals when the referrer and referred share a device fingerprint',
    { timeout: 60_000 },
    async () => {
    const missionId = 'referral_shared_device_test';
    const { reviewKycProfile } = await import('../modules/kyc/service');

    await getDb().insert(missions).values({
      id: missionId,
      type: 'metric_threshold',
      params: {
        title: 'Invite a friend',
        description: 'Invite one friend who completes Tier 1 KYC.',
        metric: 'referral_success_count',
        target: 1,
        cadence: 'one_time',
        rewardId: 'referral_program',
        sortOrder: 91,
      },
      reward: '7.00',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const referrer = await registerUser('referrer-shared-device@example.com');
    const referred = await registerUser(
      'referred-shared-device@example.com',
      'secret-123',
      referrer.id,
    );

    await insertUserAuthSession(
      referrer.id,
      '198.51.100.20',
      'ReferralSharedDevice/1.0',
    );
    await insertUserAuthSession(
      referred.id,
      '198.51.100.20',
      'ReferralSharedDevice/1.0',
    );

    const [profile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: referred.id,
        currentTier: 'tier_0',
        requestedTier: 'tier_1',
        status: 'pending',
        submissionVersion: 1,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: kycProfiles.id });

    const { admin } = await seedAdminAccount({
      email: 'referral-shared-device-admin@example.com',
    });

    await reviewKycProfile({
      profileId: profile.id,
      adminId: admin.id,
      decision: 'approved',
    });

    const [referral] = await getDb()
      .select({
        status: referrals.status,
        rejectedAt: referrals.rejectedAt,
      })
      .from(referrals)
      .where(eq(referrals.referredId, referred.id))
      .limit(1);

    expect(referral?.status).toBe('rejected');
    expect(referral?.rejectedAt).not.toBeNull();

    const { token } = await getCreateUserSessionToken()({
      userId: referrer.id,
      email: referrer.email,
      role: 'user',
    });

    const centerResponse = await getApp().inject({
      method: 'GET',
      url: '/rewards/center',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(centerResponse.statusCode).toBe(200);
    expect(centerResponse.json().data.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missionId,
          status: 'in_progress',
          claimable: false,
          progressCurrent: 0,
          progressTarget: 1,
        }),
      ]),
    );
    },
  );

  it('blocks registration with an AML review freeze and notifies active admins', async () => {
    const { user: adminUser } = await seedAdminAccount({
      email: 'aml-review-admin@example.com',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'aml-watchlist-user@example.com',
        password: 'secret-123',
        birthDate: '1990-01-01',
      },
    });

    expect(response.statusCode).toBe(423);
    expect(response.json().error.code).toBe('AML_REVIEW_REQUIRED');
    expect(authNotificationCaptures.emailVerification).toHaveLength(0);

    const [user] = await getDb()
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, 'aml-watchlist-user@example.com'))
      .limit(1);

    expect(user?.email).toBe('aml-watchlist-user@example.com');

    const [freeze] = await getDb()
      .select({
        status: freezeRecords.status,
        reason: freezeRecords.reason,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.userId, user!.id))
      .limit(1);

    expect(freeze).toMatchObject({
      status: 'active',
      reason: 'aml_review',
    });

    const [check] = await getDb()
      .select({
        checkpoint: amlChecks.checkpoint,
        result: amlChecks.result,
        riskLevel: amlChecks.riskLevel,
      })
      .from(amlChecks)
      .where(eq(amlChecks.userId, user!.id))
      .limit(1);

    expect(check).toMatchObject({
      checkpoint: 'registration',
      result: 'hit',
      riskLevel: 'high',
    });

    await expectQueuedAmlAdminNotification({
      adminUserId: adminUser.id,
      adminEmail: 'aml-review-admin@example.com',
      subjectUserId: user!.id,
      subjectEmail: 'aml-watchlist-user@example.com',
      checkpoint: 'registration',
      riskLevel: 'high',
      providerKey: 'mock',
    });

    const [securityEvent] = await getDb()
      .select({
        category: securityEvents.category,
        eventType: securityEvents.eventType,
        metadata: securityEvents.metadata,
      })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.userId, user!.id),
          eq(securityEvents.eventType, 'aml_hit_detected'),
        ),
      )
      .orderBy(desc(securityEvents.id))
      .limit(1);

    expect(securityEvent).toMatchObject({
      category: 'aml',
      eventType: 'aml_hit_detected',
      metadata: expect.objectContaining({
        checkpoint: 'registration',
        riskLevel: 'high',
        providerKey: 'mock',
        reviewStatus: 'pending',
      }),
    });
  });

  it('aggregates admin auth failures and success into the unified security event stream', async () => {
    const email = 'siem-admin@example.com';
    const password = 'secret-123';
    const remoteAddress = '203.0.113.10';
    await seedAdminAccount({ email, password });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await getApp().inject({
        method: 'POST',
        url: '/auth/admin/login',
        remoteAddress,
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          email,
          password: `wrong-${String(attempt)}`,
        },
      });

      expect(response.statusCode).toBe(401);
    }

    const successResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/admin/login',
      remoteAddress,
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password,
      },
    });

    expect(successResponse.statusCode).toBe(200);

    const events = await getDb()
      .select({
        category: securityEvents.category,
        eventType: securityEvents.eventType,
        ip: securityEvents.ip,
        metadata: securityEvents.metadata,
      })
      .from(securityEvents)
      .where(eq(securityEvents.ip, remoteAddress))
      .orderBy(desc(securityEvents.id));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'auth',
          eventType: 'admin_login_failed',
        }),
        expect.objectContaining({
          category: 'auth',
          eventType: 'admin_login_success',
        }),
        expect.objectContaining({
          category: 'admin_action',
          eventType: 'admin_login_success',
        }),
        expect.objectContaining({
          category: 'correlation_alert',
          eventType: 'admin_failed_then_success_same_ip',
          metadata: expect.objectContaining({
            failedCount: 3,
            ruleId: 'admin_failed_then_success_same_ip',
          }),
        }),
      ]),
    );
  });

  it('retries email verification delivery when registration already created the user', async () => {
    const email = 'register-retry@example.com';
    const notificationModule = await import('../modules/auth/notification-service');

    vi.mocked(
      notificationModule.sendEmailVerificationNotification
    ).mockRejectedValueOnce(new Error('queue failed'));

    const firstResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: 'secret-123',
        birthDate: '1990-01-01',
      },
    });

    expect(firstResponse.statusCode).toBe(503);
    expect(firstResponse.json().error.code).toBeUndefined();
    expect(authNotificationCaptures.emailVerification).toHaveLength(0);

    const usersWithEmailAfterFirstAttempt = await getDb()
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.email, email));

    expect(usersWithEmailAfterFirstAttempt).toHaveLength(1);

    const retryResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: 'secret-123',
        birthDate: '1990-01-01',
      },
    });

    expect(retryResponse.statusCode).toBe(201);
    expect(retryResponse.json().data).toMatchObject({ email });
    expect(authNotificationCaptures.emailVerification).toHaveLength(1);

    const verificationTokens = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, usersWithEmailAfterFirstAttempt[0]!.id),
          eq(authTokens.tokenType, 'email_verification')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(verificationTokens).toHaveLength(1);
    expect(verificationTokens[0]?.consumedAt).toBeNull();
  });

  it('revokes the current user session on logout', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'session-user@example.com',
        password: 'secret-123',
        birthDate: '1990-01-01',
      },
    });

    const loginResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'session-user@example.com',
        password: 'secret-123',
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginPayload = loginResponse.json();
    const token = loginPayload.data?.token as string;
    const sessionId = loginPayload.data?.sessionId as string;

    const [session] = await getDb()
      .select({ jti: authSessions.jti, status: authSessions.status })
      .from(authSessions)
      .where(eq(authSessions.jti, sessionId))
      .limit(1);
    expect(session).toMatchObject({
      jti: sessionId,
      status: 'active',
    });

    const currentResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(currentResponse.statusCode).toBe(200);
    expect(currentResponse.json().data).toMatchObject({
      user: {
        email: 'session-user@example.com',
        role: 'user',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      },
      session: {
        sessionId,
        kind: 'user',
        role: 'user',
        current: true,
      },
    });

    const logoutResponse = await getApp().inject({
      method: 'DELETE',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(logoutResponse.statusCode).toBe(200);

    const revokedResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(revokedResponse.statusCode).toBe(401);
  });

  it('stores login device fingerprints and mirrors them into auth events', async () => {
    const email = 'fingerprint-login@example.com';
    const password = 'secret-123';
    const remoteAddress = '198.51.100.88';
    const userAgent = 'RiskFingerprintBrowser/1.0';
    const rawFingerprint = 'browser-seed-123';
    const expectedFingerprint = createHash('sha256')
      .update(`client::${rawFingerprint}`)
      .digest('hex');

    await registerUser(email, password);

    const response = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      remoteAddress,
      headers: {
        'content-type': 'application/json',
        'user-agent': userAgent,
        'x-device-fingerprint': rawFingerprint,
      },
      payload: {
        email,
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    const sessionId = payload.data?.sessionId as string;

    const [fingerprintRow] = await getDb()
      .select({
        fingerprint: deviceFingerprints.fingerprint,
        entrypoint: deviceFingerprints.entrypoint,
        activityType: deviceFingerprints.activityType,
        sessionId: deviceFingerprints.sessionId,
        ip: deviceFingerprints.ip,
        userAgent: deviceFingerprints.userAgent,
        eventCount: deviceFingerprints.eventCount,
        metadata: deviceFingerprints.metadata,
      })
      .from(deviceFingerprints)
      .where(eq(deviceFingerprints.sessionId, sessionId))
      .orderBy(desc(deviceFingerprints.id))
      .limit(1);

    expect(fingerprintRow).toMatchObject({
      fingerprint: expectedFingerprint,
      entrypoint: 'login',
      activityType: 'user_login_success',
      sessionId,
      ip: remoteAddress,
      userAgent,
      eventCount: 1,
      metadata: expect.objectContaining({
        source: 'client_header',
      }),
    });

    const [authEvent] = await getDb()
      .select({
        eventType: authEvents.eventType,
        ip: authEvents.ip,
        userAgent: authEvents.userAgent,
        metadata: authEvents.metadata,
      })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.email, email),
          eq(authEvents.eventType, 'user_login_success'),
        ),
      )
      .orderBy(desc(authEvents.id))
      .limit(1);

    expect(authEvent).toMatchObject({
      eventType: 'user_login_success',
      ip: remoteAddress,
      userAgent,
      metadata: expect.objectContaining({
        sessionId,
        sessionKind: 'user',
        deviceFingerprint: expectedFingerprint,
        deviceFingerprintSource: 'client_header',
      }),
    });
  });

  it('revokes active sessions after a password change', async () => {
    const registerResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'password-change@example.com',
        password: 'secret-123',
        birthDate: '1990-01-01',
      },
    });
    expect(registerResponse.statusCode).toBe(201);

    const [user] = await getDb()
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, 'password-change@example.com'))
      .limit(1);

    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const { updateUserPassword } = await import('../modules/user/service');
    await updateUserPassword(user.id, 'new-secret-456');

    const response = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('lists and revokes active user sessions', async () => {
    await getApp().inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: 'multi-session@example.com',
        password: 'secret-123',
        birthDate: '1990-01-01',
      },
    });

    const firstSession = await loginUser('multi-session@example.com', 'secret-123');
    const secondSession = await loginUser('multi-session@example.com', 'secret-123');

    const listResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/sessions',
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: firstSession.sessionId,
          kind: 'user',
          role: 'user',
          current: true,
        }),
        expect.objectContaining({
          sessionId: secondSession.sessionId,
          kind: 'user',
          role: 'user',
          current: false,
        }),
      ])
    );

    const revokeResponse = await getApp().inject({
      method: 'DELETE',
      url: `/auth/user/sessions/${secondSession.sessionId}`,
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json().data).toMatchObject({
      revoked: true,
      scope: 'single',
      sessionId: secondSession.sessionId,
    });

    const secondSessionCurrentResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
      },
    });

    expect(secondSessionCurrentResponse.statusCode).toBe(401);
  });

  it('completes password reset via HTTP and revokes existing user sessions', async () => {
    const email = 'password-reset@example.com';
    const originalPassword = 'secret-123';
    const nextPassword = 'new-secret-456';
    const user = await registerUser(email, originalPassword);
    const firstSession = await loginUser(email, originalPassword);
    const secondSession = await loginUser(email, originalPassword);

    const requestResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
      },
    });

    expect(requestResponse.statusCode).toBe(202);
    expect(authNotificationCaptures.passwordReset).toHaveLength(1);

    const resetToken = extractTokenFromUrl(
      authNotificationCaptures.passwordReset[0]!.resetUrl
    );

    const confirmResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        token: resetToken,
        password: nextPassword,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().data).toEqual({ completed: true });

    const resetTokens = await getDb()
      .select({
        tokenType: authTokens.tokenType,
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'password_reset')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(resetTokens).toHaveLength(1);
    expect(resetTokens[0]?.consumedAt).not.toBeNull();

    const sessions = await getDb()
      .select({
        jti: authSessions.jti,
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(asc(authSessions.id));

    expect(sessions).toEqual([
      {
        jti: firstSession.sessionId,
        status: 'revoked',
        revokedReason: 'password_changed',
      },
      {
        jti: secondSession.sessionId,
        status: 'revoked',
        revokedReason: 'password_changed',
      },
    ]);

    const firstSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });
    expect(firstSessionCheck.statusCode).toBe(401);

    const secondSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
      },
    });
    expect(secondSessionCheck.statusCode).toBe(401);

    const staleLoginResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: originalPassword,
      },
    });
    expect(staleLoginResponse.statusCode).toBe(401);

    const freshLoginResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password: nextPassword,
      },
    });
    expect(freshLoginResponse.statusCode).toBe(200);

    const passwordResetEvents = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(eq(authEvents.email, email))
      .orderBy(desc(authEvents.id));

    expect(
      passwordResetEvents.map((event) => event.eventType)
    ).toContain('password_reset_requested');
    expect(
      passwordResetEvents.map((event) => event.eventType)
    ).toContain('password_reset_success');
  });

  it('requests and confirms email verification through the HTTP flow', async () => {
    const email = 'verify-email@example.com';
    const password = 'secret-123';
    const user = await registerUser(email, password);
    const session = await loginUser(email, password);

    expect(authNotificationCaptures.emailVerification).toHaveLength(1);

    const requestResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/email-verification/request',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {
        resend: true,
      },
    });

    expect(requestResponse.statusCode).toBe(200);
    expect(requestResponse.json().data).toEqual({ accepted: true });
    expect(authNotificationCaptures.emailVerification).toHaveLength(2);

    const verificationTokensBeforeConfirm = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'email_verification')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(verificationTokensBeforeConfirm).toHaveLength(2);
    expect(verificationTokensBeforeConfirm[0]?.consumedAt).toBeNull();
    expect(verificationTokensBeforeConfirm[1]?.consumedAt).not.toBeNull();

    const emailVerificationToken = extractTokenFromUrl(
      authNotificationCaptures.emailVerification[1]!.verificationUrl
    );

    const confirmResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/email-verification/confirm',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        token: emailVerificationToken,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().data).toEqual({
      verified: true,
      email,
    });

    const [verifiedUser] = await getDb()
      .select({
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(verifiedUser?.emailVerifiedAt).not.toBeNull();

    const verificationTokensAfterConfirm = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'email_verification')
        )
      )
      .orderBy(desc(authTokens.id));

    expect(
      verificationTokensAfterConfirm.every((token) => token.consumedAt !== null)
    ).toBe(true);

    const emailVerificationEvents = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(eq(authEvents.email, email))
      .orderBy(desc(authEvents.id));

    expect(
      emailVerificationEvents.map((event) => event.eventType)
    ).toContain('email_verification_success');
  });

  it('requests and confirms phone verification through the HTTP flow', async () => {
    const email = 'verify-phone@example.com';
    const password = 'secret-123';
    const phone = '+61400111222';
    const user = await registerUser(email, password);
    const session = await loginUser(email, password);

    const requestResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/phone-verification/request',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {
        phone,
      },
    });

    expect(requestResponse.statusCode).toBe(200);
    expect(requestResponse.json().data).toEqual({ accepted: true });
    expect(authNotificationCaptures.phoneVerification).toHaveLength(1);

    const code = authNotificationCaptures.phoneVerification[0]!.code;
    const [issuedPhoneToken] = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
        phone: authTokens.phone,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'phone_verification')
        )
      )
      .orderBy(desc(authTokens.id))
      .limit(1);

    expect(issuedPhoneToken).toEqual({
      consumedAt: null,
      phone,
    });

    const confirmResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/phone-verification/confirm',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {
        phone,
        code,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json().data).toEqual({
      verified: true,
      phone,
    });

    const [verifiedUser] = await getDb()
      .select({
        phone: users.phone,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(verifiedUser).toEqual({
      phone,
      phoneVerifiedAt: expect.any(Date),
    });

    const [consumedPhoneToken] = await getDb()
      .select({
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, user.id),
          eq(authTokens.tokenType, 'phone_verification')
        )
      )
      .orderBy(desc(authTokens.id))
      .limit(1);

    expect(consumedPhoneToken?.consumedAt).not.toBeNull();

    const phoneVerificationEvents = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(eq(authEvents.email, email))
      .orderBy(desc(authEvents.id));

    expect(
      phoneVerificationEvents.map((event) => event.eventType)
    ).toContain('phone_verification_success');
  });

  it('enrolls user MFA through the HTTP flow and exposes status', async () => {
    const email = 'user-mfa@example.com';
    const password = 'secret-123';
    const user = await registerUser(email, password);
    await verifyUserContacts(user.id, { email: true, phone: true });
    const session = await loginUser(email, password);

    const initialStatusResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/mfa/status',
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });

    expect(initialStatusResponse.statusCode).toBe(200);
    expect(initialStatusResponse.json().data).toEqual({
      mfaEnabled: false,
      largeWithdrawalThreshold: '500.00',
    });

    const enrollmentResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/mfa/enrollment',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(enrollmentResponse.statusCode).toBe(201);
    const enrollmentPayload = enrollmentResponse.json().data as {
      secret: string;
      enrollmentToken: string;
      otpauthUrl: string;
    };
    expect(enrollmentPayload.secret).toBeTruthy();
    expect(enrollmentPayload.enrollmentToken).toBeTruthy();
    expect(enrollmentPayload.otpauthUrl).toContain('otpauth://totp/');

    const { generateTotpCode } = await import('../modules/mfa/totp');
    const verifyResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/mfa/verify',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      payload: {
        enrollmentToken: enrollmentPayload.enrollmentToken,
        totpCode: generateTotpCode(enrollmentPayload.secret),
      },
    });

    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json().data).toEqual({
      mfaEnabled: true,
    });

    const [storedSecret] = await getDb()
      .select({
        userId: userMfaSecrets.userId,
        secretCiphertext: userMfaSecrets.secretCiphertext,
      })
      .from(userMfaSecrets)
      .where(eq(userMfaSecrets.userId, user.id))
      .limit(1);

    expect(storedSecret).toEqual({
      userId: user.id,
      secretCiphertext: expect.any(String),
    });

    const enabledStatusResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/user/mfa/status',
      headers: {
        authorization: `Bearer ${session.token}`,
      },
    });

    expect(enabledStatusResponse.statusCode).toBe(200);
    expect(enabledStatusResponse.json().data).toEqual({
      mfaEnabled: true,
      largeWithdrawalThreshold: '500.00',
    });

    const [enabledEvent] = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.userId, user.id),
          eq(authEvents.eventType, 'user_mfa_enabled')
        )
      )
      .orderBy(desc(authEvents.id))
      .limit(1);

    expect(enabledEvent?.eventType).toBe('user_mfa_enabled');
  });

  it('enrolls admin MFA end-to-end and rotates admin sessions', { tag: 'critical' }, async () => {
    const email = 'admin-mfa@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    const initialSession = await loginAdmin(email, password);
    const secondarySession = await loginAdmin(email, password);

    const enrollmentResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/mfa/enrollment',
      headers: buildAdminCookieHeaders(initialSession.token),
      payload: {},
    });

    expect(enrollmentResponse.statusCode).toBe(201);
    const enrollmentPayload = enrollmentResponse.json().data as {
      secret: string;
      enrollmentToken: string;
    };
    expect(enrollmentPayload.secret).toBeTruthy();
    expect(enrollmentPayload.enrollmentToken).toBeTruthy();

    const { generateTotpCode } = await import('../modules/admin-mfa/service');
    const verifyResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/mfa/verify',
      headers: buildAdminCookieHeaders(initialSession.token),
      payload: {
        enrollmentToken: enrollmentPayload.enrollmentToken,
        totpCode: generateTotpCode(enrollmentPayload.secret),
      },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const verifyPayload = verifyResponse.json().data as {
      token: string;
      mfaEnabled: boolean;
    };
    expect(verifyPayload.mfaEnabled).toBe(true);
    expect(verifyPayload.token).toBeTruthy();

    const [storedAdmin] = await getDb()
      .select({
        mfaEnabled: admins.mfaEnabled,
        mfaSecretCiphertext: admins.mfaSecretCiphertext,
      })
      .from(admins)
      .where(eq(admins.id, admin.id))
      .limit(1);

    expect(storedAdmin).toEqual({
      mfaEnabled: true,
      mfaSecretCiphertext: expect.any(String),
    });

    const [mfaAction] = await getDb()
      .select({
        action: adminActions.action,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'admin_mfa_enable')
        )
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(mfaAction?.action).toBe('admin_mfa_enable');

    const initialSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(initialSession.token)}`,
      },
    });
    expect(initialSessionCheck.statusCode).toBe(401);

    const secondarySessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(secondarySession.token)}`,
      },
    });
    expect(secondarySessionCheck.statusCode).toBe(401);

    const rotatedSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(verifyPayload.token)}`,
      },
    });
    expect(rotatedSessionCheck.statusCode).toBe(200);

    const loginWithoutTotpResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/admin/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password,
      },
    });
    expect(loginWithoutTotpResponse.statusCode).toBe(401);

    const loginWithTotpResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/admin/login',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email,
        password,
        totpCode: generateTotpCode(enrollmentPayload.secret),
      },
    });
    expect(loginWithTotpResponse.statusCode).toBe(200);
  });

  it('revokes all user sessions from the self-service endpoint', async () => {
    const email = 'user-revoke-all@example.com';
    const password = 'secret-123';
    const user = await registerUser(email, password);
    const firstSession = await loginUser(email, password);
    const secondSession = await loginUser(email, password);

    const revokeAllResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/user/sessions/revoke-all',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(revokeAllResponse.statusCode).toBe(200);
    expect(revokeAllResponse.json().data).toEqual({
      revokedCount: 2,
      scope: 'all',
    });

    const sessions = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(asc(authSessions.id));

    expect(sessions).toEqual([
      { status: 'revoked', revokedReason: 'logout_all' },
      { status: 'revoked', revokedReason: 'logout_all' },
    ]);

    const firstSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${firstSession.token}`,
      },
    });
    expect(firstSessionCheck.statusCode).toBe(401);

    const secondSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/user/session',
      headers: {
        authorization: `Bearer ${secondSession.token}`,
      },
    });
    expect(secondSessionCheck.statusCode).toBe(401);

    const [revokeAllEvent] = await getDb()
      .select({
        eventType: authEvents.eventType,
      })
      .from(authEvents)
      .where(
        and(
          eq(authEvents.email, email),
          eq(authEvents.eventType, 'user_sessions_revoked_all')
        )
      )
      .orderBy(desc(authEvents.id))
      .limit(1);

    expect(revokeAllEvent?.eventType).toBe('user_sessions_revoked_all');
  });

  it('revokes the current admin session through the HTTP endpoint', async () => {
    const email = 'admin-logout@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    const session = await loginAdmin(email, password);

    const logoutResponse = await getApp().inject({
      method: 'DELETE',
      url: '/auth/admin/session',
      headers: buildAdminCookieHeaders(session.token),
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json().data).toEqual({
      revoked: true,
      scope: 'current',
    });

    const [storedSession] = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.jti, session.sessionId))
      .limit(1);

    expect(storedSession).toEqual({
      status: 'revoked',
      revokedReason: 'logout',
    });

    const revokedResponse = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(session.token)}`,
      },
    });
    expect(revokedResponse.statusCode).toBe(401);

    const [logoutAction] = await getDb()
      .select({
        action: adminActions.action,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'admin_logout')
        )
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(logoutAction?.action).toBe('admin_logout');
  });

  it('revokes all admin sessions through the HTTP endpoint', async () => {
    const email = 'admin-revoke-all@example.com';
    const { admin, user, password } = await seedAdminAccount({ email });
    const firstSession = await loginAdmin(email, password);
    const secondSession = await loginAdmin(email, password);

    const revokeAllResponse = await getApp().inject({
      method: 'POST',
      url: '/auth/admin/sessions/revoke-all',
      headers: buildAdminCookieHeaders(secondSession.token),
      payload: {},
    });

    expect(revokeAllResponse.statusCode).toBe(200);
    expect(revokeAllResponse.json().data).toEqual({
      revokedCount: 2,
      scope: 'all',
    });

    const sessions = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(asc(authSessions.id));

    expect(sessions).toEqual([
      { status: 'revoked', revokedReason: 'logout_all' },
      { status: 'revoked', revokedReason: 'logout_all' },
    ]);

    const firstSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(firstSession.token)}`,
      },
    });
    expect(firstSessionCheck.statusCode).toBe(401);

    const secondSessionCheck = await getApp().inject({
      method: 'GET',
      url: '/auth/admin/session',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(secondSession.token)}`,
      },
    });
    expect(secondSessionCheck.statusCode).toBe(401);

    const [revokeAllAction] = await getDb()
      .select({
        action: adminActions.action,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'admin_sessions_revoked_all')
        )
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(revokeAllAction?.action).toBe('admin_sessions_revoked_all');
  });
});
