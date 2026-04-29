import {
  ADMIN_SESSION_COOKIE,
  buildAdminBreakGlassHeaders,
  buildAdminCookieHeaders,
  buildUserAuthHeaders,
  CONFIG_ADMIN_PERMISSION_KEYS,
  describeIntegrationSuite,
  enrollAdminMfa,
  FINANCE_ADMIN_PERMISSION_KEYS,
  findBlackjackClientNonce,
  getApp,
  getDb,
  getCreateUserSessionToken,
  getRiskModule,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  loginUser,
  registerUser,
  SECURITY_ADMIN_PERMISSION_KEYS,
  seedAdminAccount,
  seedBlackjackScenario,
  seedUserWithWallet,
  verifyUserContacts,
} from './integration-test-support';
import { and, asc, desc, eq, sql } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  adminActions,
  economyLedgerEntries,
  adminPermissions,
  authSessions,
  blackjackGames,
  deviceFingerprints,
  fiatPayoutMethods,
  freezeRecords,
  giftEnergyAccounts,
  giftTransfers,
  iapProducts,
  kycDocuments,
  kycProfiles,
  kycReviewEvents,
  ledgerEntries,
  missions,
  notificationDeliveries,
  payoutMethods,
  predictionMarkets,
  reconciliationAlerts,
  securityEvents,
  suspiciousAccounts,
  riskTableInteractionEvents,
  riskTableInteractionPairs,
  storePurchaseOrders,
  userWallets,
  userAssetBalances,
  walletReconciliationRuns,
} from '@reward/database';
import { runKycReverificationSweep } from '../modules/kyc/service';
import { runWalletReconciliation } from '../modules/wallet/reconciliation-service';

describeIntegrationSuite('backend admin integration', () => {
  it(
    'forces timeout on overdue blackjack tables and records the admin action',
    { timeout: 15000 },
    async () => {
      const user = await seedBlackjackScenario({
        email: 'admin-table-timeout-user@example.com',
      });
      await verifyUserContacts(user.id, { email: true });
      const clientNonce = await findBlackjackClientNonce({
        userId: user.id,
        prefix: 'integration-admin-table-timeout',
        attempts: 5000,
        predicate: (preview, { scoreBlackjackCards }) => {
          const playerScore = scoreBlackjackCards([preview.deck[0], preview.deck[2]]);
          const dealerScore = scoreBlackjackCards([preview.deck[1], preview.deck[3]]);
          return !playerScore.blackjack && !dealerScore.blackjack;
        },
      });
      const { token: userToken } = await getCreateUserSessionToken()({
        userId: user.id,
        email: user.email,
        role: 'user',
      });

      const startResponse = await getApp().inject({
        method: 'POST',
        url: '/blackjack/start',
        headers: buildUserAuthHeaders(userToken),
        payload: {
          stakeAmount: '10.00',
          clientNonce,
        },
      });

      expect(startResponse.statusCode).toBe(200);
      const startPayload = startResponse.json();
      expect(startPayload.ok).toBe(true);
      const gameId = Number(startPayload.data.game.id);
      const tableId = String(startPayload.data.game.table.tableId);

      await getDb()
        .update(blackjackGames)
        .set({
          turnDeadlineAt: new Date(Date.now() - 1_000),
        })
        .where(eq(blackjackGames.id, gameId));

      const { admin, password } = await seedAdminAccount({
        email: 'admin-table-timeout-operator@example.com',
      });
      await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
      const adminSession = await enrollAdminMfa({
        email: 'admin-table-timeout-operator@example.com',
        password,
      });

      const forceTimeoutResponse = await getApp().inject({
        method: 'POST',
        url: `/admin/table-monitoring/blackjack/${tableId}/force-timeout`,
        headers: buildAdminCookieHeaders(adminSession.token),
        payload: {
          totpCode: adminSession.totpCode,
          reason: 'integration overdue timeout',
        },
      });

      expect(forceTimeoutResponse.statusCode).toBe(200);
      expect(forceTimeoutResponse.json()).toMatchObject({
        ok: true,
        data: {
          sourceKind: 'blackjack',
          tableId,
          action: 'force_timeout',
          seatIndex: 1,
          removed: true,
        },
      });

      const [storedGame] = await getDb()
        .select({
          status: blackjackGames.status,
          settledAt: blackjackGames.settledAt,
        })
        .from(blackjackGames)
        .where(eq(blackjackGames.id, gameId))
        .limit(1);

      expect(storedGame?.status).not.toBe('active');
      expect(storedGame?.settledAt).not.toBeNull();

      const [auditRecord] = await getDb()
        .select({
          action: adminActions.action,
          metadata: adminActions.metadata,
        })
        .from(adminActions)
        .where(eq(adminActions.action, 'table_force_timeout'))
        .orderBy(desc(adminActions.id))
        .limit(1);

      expect(auditRecord).toMatchObject({
        action: 'table_force_timeout',
        metadata: expect.objectContaining({
          tableId,
          sourceKind: 'blackjack',
          reason: 'integration overdue timeout',
          removed: true,
        }),
      });
    }
  );

  it('requests KYC reverification from admin and downgrades the active tier', async () => {
    const user = await seedUserWithWallet({
      email: 'kyc-reverify-user@example.com',
    });
    const email = 'kyc-reverify-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });

    const [profile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: user.id,
        currentTier: 'tier_2',
        requestedTier: null,
        status: 'approved',
        submissionVersion: 2,
        activeSubmissionVersion: 2,
        legalName: 'Reverify User',
        documentType: 'passport',
        documentNumberLast4: '2222',
        countryCode: 'SG',
        riskFlags: [],
        submittedAt: new Date('2026-04-10T00:00:00.000Z'),
        reviewedAt: new Date('2026-04-12T00:00:00.000Z'),
      })
      .returning();

    const response = await getApp().inject({
      method: 'POST',
      url: `/admin/kyc-profiles/${profile.id}/request-reverification`,
      headers: {
        ...buildAdminCookieHeaders(adminSession.token),
        'content-type': 'application/json',
      },
      payload: {
        totpCode: adminSession.totpCode,
        reason: 'Policy update requires a fresh identity document set.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: profile.id,
      currentTier: 'tier_0',
      requestedTier: 'tier_2',
      status: 'more_info_required',
    });

    const [storedProfile] = await getDb()
      .select({
        currentTier: kycProfiles.currentTier,
        requestedTier: kycProfiles.requestedTier,
        activeSubmissionVersion: kycProfiles.activeSubmissionVersion,
        status: kycProfiles.status,
        freezeRecordId: kycProfiles.freezeRecordId,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.id, profile.id))
      .limit(1);

    expect(storedProfile).toMatchObject({
      currentTier: 'tier_0',
      requestedTier: 'tier_2',
      activeSubmissionVersion: null,
      status: 'more_info_required',
    });
    expect(storedProfile?.freezeRecordId).toBeTruthy();

    const [reviewEvent] = await getDb()
      .select({
        action: kycReviewEvents.action,
        fromStatus: kycReviewEvents.fromStatus,
        toStatus: kycReviewEvents.toStatus,
        reason: kycReviewEvents.reason,
        metadata: kycReviewEvents.metadata,
      })
      .from(kycReviewEvents)
      .where(eq(kycReviewEvents.profileId, profile.id))
      .orderBy(desc(kycReviewEvents.id))
      .limit(1);

    expect(reviewEvent).toMatchObject({
      action: 'reverification_requested',
      fromStatus: 'approved',
      toStatus: 'more_info_required',
      reason: 'Policy update requires a fresh identity document set.',
    });
    expect(reviewEvent?.metadata).toMatchObject({
      trigger: 'policy_update',
      previousTier: 'tier_2',
    });

    const [delivery] = await getDb()
      .select({
        kind: notificationDeliveries.kind,
        payload: notificationDeliveries.payload,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.recipient, 'kyc-reverify-user@example.com'))
      .orderBy(desc(notificationDeliveries.id))
      .limit(1);

    expect(delivery?.kind).toBe('kyc_reverification');
    expect(delivery?.payload).toMatchObject({
      reverificationType: 'policy_update',
      targetTier: 'tier_2',
    });
  });

  it('sweeps expiring KYC documents, queues reminders, and forces reverification for expired documents', async () => {
    const expiringUser = await seedUserWithWallet({
      email: 'kyc-expiring-user@example.com',
    });
    const expiredUser = await seedUserWithWallet({
      email: 'kyc-expired-user@example.com',
    });

    const [expiringProfile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: expiringUser.id,
        currentTier: 'tier_2',
        requestedTier: null,
        status: 'approved',
        submissionVersion: 1,
        activeSubmissionVersion: 1,
        legalName: 'Expiring User',
        documentType: 'passport',
        documentNumberLast4: '1111',
        countryCode: 'US',
        riskFlags: [],
        submittedAt: new Date('2026-04-01T00:00:00.000Z'),
        reviewedAt: new Date('2026-04-02T00:00:00.000Z'),
      })
      .returning();

    await getDb().insert(kycDocuments).values([
      {
        profileId: expiringProfile.id,
        userId: expiringUser.id,
        submissionVersion: 1,
        kind: 'identity_front',
        fileName: 'expiring-front.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        storagePath: 'data:image/png;base64,AA==',
        expiresAt: new Date('2026-05-05T23:59:59.999Z'),
      },
      {
        profileId: expiringProfile.id,
        userId: expiringUser.id,
        submissionVersion: 1,
        kind: 'selfie',
        fileName: 'expiring-selfie.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        storagePath: 'data:image/png;base64,AA==',
        expiresAt: null,
      },
    ]);

    const [expiredProfile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: expiredUser.id,
        currentTier: 'tier_1',
        requestedTier: 'tier_2',
        status: 'rejected',
        submissionVersion: 4,
        activeSubmissionVersion: 3,
        legalName: 'Expired User',
        documentType: 'national_id',
        documentNumberLast4: '3333',
        countryCode: 'CA',
        riskFlags: [],
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        reviewedAt: new Date('2026-03-03T00:00:00.000Z'),
      })
      .returning();

    await getDb().insert(kycDocuments).values([
      {
        profileId: expiredProfile.id,
        userId: expiredUser.id,
        submissionVersion: 3,
        kind: 'identity_front',
        fileName: 'expired-front.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        storagePath: 'data:image/png;base64,AA==',
        expiresAt: new Date('2026-04-15T23:59:59.999Z'),
      },
      {
        profileId: expiredProfile.id,
        userId: expiredUser.id,
        submissionVersion: 4,
        kind: 'identity_front',
        fileName: 'newer-but-rejected-front.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        storagePath: 'data:image/png;base64,AA==',
        expiresAt: new Date('2026-12-31T23:59:59.999Z'),
      },
    ]);

    const result = await runKycReverificationSweep(
      new Date('2026-04-29T00:00:00.000Z'),
    );

    expect(result).toMatchObject({
      scannedProfiles: 2,
      expiryRemindersQueued: 1,
      reverificationRequested: 1,
    });

    const [expiringDocument] = await getDb()
      .select({
        metadata: kycDocuments.metadata,
      })
      .from(kycDocuments)
      .where(
        and(
          eq(kycDocuments.profileId, expiringProfile.id),
          eq(kycDocuments.submissionVersion, 1),
          eq(kycDocuments.kind, 'identity_front'),
        ),
      )
      .limit(1);

    expect(expiringDocument?.metadata).toMatchObject({
      expiryNoticeSentAt: expect.any(String),
    });

    const [expiredProfileAfterSweep] = await getDb()
      .select({
        currentTier: kycProfiles.currentTier,
        requestedTier: kycProfiles.requestedTier,
        activeSubmissionVersion: kycProfiles.activeSubmissionVersion,
        status: kycProfiles.status,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.id, expiredProfile.id))
      .limit(1);

    expect(expiredProfileAfterSweep).toMatchObject({
      currentTier: 'tier_0',
      requestedTier: 'tier_1',
      activeSubmissionVersion: null,
      status: 'more_info_required',
    });

    const deliveries = await getDb()
      .select({
        recipient: notificationDeliveries.recipient,
        payload: notificationDeliveries.payload,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.kind, 'kyc_reverification'))
      .orderBy(asc(notificationDeliveries.id));

    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient: 'kyc-expiring-user@example.com',
          payload: expect.objectContaining({
            reverificationType: 'document_expiring_soon',
          }),
        }),
        expect.objectContaining({
          recipient: 'kyc-expired-user@example.com',
          payload: expect.objectContaining({
            reverificationType: 'document_expired',
          }),
        }),
      ]),
    );
  });

  it(
    'lists and updates engine reconciliation alerts with finance permissions',
    { timeout: 15000 },
    async () => {
    const reconciledUser = await seedUserWithWallet({
      email: 'reconciliation-alert-user@example.com',
      withdrawableBalance: '6.75',
    });
    const { admin, password } = await seedAdminAccount({
      email: 'reconciliation-admin@example.com',
    });
    await grantAdminPermissions(admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({
      email: 'reconciliation-admin@example.com',
      password,
    });

    const [alert] = await getDb()
      .insert(reconciliationAlerts)
      .values({
        runId: null,
        userId: reconciledUser.id,
        fingerprint: `wallet_balance_drift:user:${String(reconciledUser.id)}`,
        alertType: 'wallet_balance_drift',
        severity: 'critical',
        status: 'open',
        expectedWithdrawableBalance: '0.00',
        actualWithdrawableBalance: '6.75',
        expectedBonusBalance: '0.00',
        actualBonusBalance: '0.00',
        expectedLockedBalance: '0.00',
        actualLockedBalance: '0.00',
        expectedWageredAmount: '0.00',
        actualWageredAmount: '0.00',
        expectedTotal: '0.00',
        actualTotal: '6.75',
        metadata: {
          deltas: {
            withdrawable: { expected: '0.00', actual: '6.75' },
            bonus: { expected: '0.00', actual: '0.00' },
            locked: { expected: '0.00', actual: '0.00' },
            wagered: { expected: '0.00', actual: '0.00' },
            total: { expected: '0.00', actual: '6.75' },
          },
          unknownEntryTypes: [],
        },
      })
      .returning();

    const listResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/engine/reconciliation-alerts',
      headers: buildAdminCookieHeaders(adminSession.token),
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: alert.id,
          userId: reconciledUser.id,
          userEmail: 'reconciliation-alert-user@example.com',
          status: 'open',
          deltaAmount: '6.75',
        }),
      ]),
    );

    const updateResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/engine/reconciliation-alerts/${alert.id}/status`,
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        status: 'require_engineering',
        totpCode: adminSession.totpCode,
        operatorNote: 'needs ledger replay before wallet can be corrected',
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data).toMatchObject({
      id: alert.id,
      status: 'require_engineering',
      statusNote: 'needs ledger replay before wallet can be corrected',
    });

    const [storedAlert] = await getDb()
      .select({
        status: reconciliationAlerts.status,
        metadata: reconciliationAlerts.metadata,
      })
      .from(reconciliationAlerts)
      .where(eq(reconciliationAlerts.id, alert.id))
      .limit(1);

    const storedMetadata =
      typeof storedAlert?.metadata === 'object' && storedAlert.metadata !== null
        ? (storedAlert.metadata as Record<string, unknown>)
        : {};
    const workflow =
      typeof storedMetadata.workflow === 'object' && storedMetadata.workflow !== null
        ? (storedMetadata.workflow as Record<string, unknown>)
        : {};

    expect(storedAlert?.status).toBe('require_engineering');
    expect(workflow).toMatchObject({
      operatorNote: 'needs ledger replay before wallet can be corrected',
      status: 'require_engineering',
      statusUpdatedByAdminId: admin.id,
    });

    await runWalletReconciliation('manual');

    const [rerunAlert] = await getDb()
      .select({
        status: reconciliationAlerts.status,
        resolvedAt: reconciliationAlerts.resolvedAt,
        metadata: reconciliationAlerts.metadata,
      })
      .from(reconciliationAlerts)
      .where(eq(reconciliationAlerts.id, alert.id))
      .limit(1);

    const rerunMetadata =
      typeof rerunAlert?.metadata === 'object' && rerunAlert.metadata !== null
        ? (rerunAlert.metadata as Record<string, unknown>)
        : {};
    const rerunWorkflow =
      typeof rerunMetadata.workflow === 'object' && rerunMetadata.workflow !== null
        ? (rerunMetadata.workflow as Record<string, unknown>)
        : {};

    expect(rerunAlert).toMatchObject({
      status: 'resolved',
    });
    expect(rerunAlert?.resolvedAt).not.toBeNull();
    expect(rerunWorkflow).toMatchObject({
      operatorNote: 'needs ledger replay before wallet can be corrected',
      status: 'require_engineering',
      statusUpdatedByAdminId: admin.id,
    });

    const summaryResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/engine/reconciliation-alerts/summary',
      headers: buildAdminCookieHeaders(adminSession.token),
    });
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json().data).toMatchObject({
      openCount: 0,
      requireEngineeringCount: 0,
      resolvedCount: 1,
      unresolvedCount: 0,
    });
    }
  );

  it(
    'auto-escalates overdue wallet alerts, auto-resolves recovered alerts, and reports zero-drift streaks',
    { timeout: 15000 },
    async () => {
      const overdueUser = await seedUserWithWallet({
        email: 'reconciliation-overdue@example.com',
      });
      const recoveredUser = await seedUserWithWallet({
        email: 'reconciliation-recovered@example.com',
      });
      const { admin, password } = await seedAdminAccount({
        email: 'reconciliation-summary-admin@example.com',
      });
      await grantAdminPermissions(admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
      const adminSession = await enrollAdminMfa({
        email: 'reconciliation-summary-admin@example.com',
        password,
      });

      const now = new Date();
      const overdueFirstDetectedAt = new Date(now.getTime() - 26 * 60 * 60 * 1000);
      const previousDay = new Date(now);
      previousDay.setUTCHours(12, 0, 0, 0);
      previousDay.setUTCDate(previousDay.getUTCDate() - 1);
      const twoDaysAgo = new Date(previousDay);
      twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 1);

      await getDb()
        .update(userWallets)
        .set({
          withdrawableBalance: '4.00',
          updatedAt: now,
        })
        .where(eq(userWallets.userId, overdueUser.id));

      await getDb().insert(walletReconciliationRuns).values([
        {
          trigger: 'scheduled',
          status: 'completed',
          scannedUsers: 10,
          mismatchedUsers: 0,
          summary: { scannedUsers: 10, mismatchedUsers: 0 },
          startedAt: new Date(previousDay.getTime() - 60_000),
          completedAt: previousDay,
          createdAt: previousDay,
          updatedAt: previousDay,
        },
        {
          trigger: 'scheduled',
          status: 'completed',
          scannedUsers: 9,
          mismatchedUsers: 0,
          summary: { scannedUsers: 9, mismatchedUsers: 0 },
          startedAt: new Date(twoDaysAgo.getTime() - 60_000),
          completedAt: twoDaysAgo,
          createdAt: twoDaysAgo,
          updatedAt: twoDaysAgo,
        },
      ]);

      const [overdueAlert] = await getDb()
        .insert(reconciliationAlerts)
        .values({
          runId: null,
          userId: overdueUser.id,
          fingerprint: `wallet_balance_drift:user:${String(overdueUser.id)}`,
          alertType: 'wallet_balance_drift',
          severity: 'critical',
          status: 'open',
          expectedWithdrawableBalance: '0.00',
          actualWithdrawableBalance: '4.00',
          expectedBonusBalance: '0.00',
          actualBonusBalance: '0.00',
          expectedLockedBalance: '0.00',
          actualLockedBalance: '0.00',
          expectedWageredAmount: '0.00',
          actualWageredAmount: '0.00',
          expectedTotal: '0.00',
          actualTotal: '4.00',
          metadata: {
            deltas: {
              withdrawable: { expected: '0.00', actual: '4.00' },
              bonus: { expected: '0.00', actual: '0.00' },
              locked: { expected: '0.00', actual: '0.00' },
              wagered: { expected: '0.00', actual: '0.00' },
              total: { expected: '0.00', actual: '4.00' },
            },
            unknownEntryTypes: [],
          },
          firstDetectedAt: overdueFirstDetectedAt,
          lastDetectedAt: overdueFirstDetectedAt,
          createdAt: overdueFirstDetectedAt,
          updatedAt: overdueFirstDetectedAt,
        })
        .returning();

      const [recoveredAlert] = await getDb()
        .insert(reconciliationAlerts)
        .values({
          runId: null,
          userId: recoveredUser.id,
          fingerprint: `wallet_balance_drift:user:${String(recoveredUser.id)}`,
          alertType: 'wallet_balance_drift',
          severity: 'critical',
          status: 'acknowledged',
          expectedWithdrawableBalance: '3.00',
          actualWithdrawableBalance: '0.00',
          expectedBonusBalance: '0.00',
          actualBonusBalance: '0.00',
          expectedLockedBalance: '0.00',
          actualLockedBalance: '0.00',
          expectedWageredAmount: '0.00',
          actualWageredAmount: '0.00',
          expectedTotal: '3.00',
          actualTotal: '0.00',
          metadata: {
            workflow: {
              status: 'acknowledged',
              operatorNote: 'triaged by finance',
              statusUpdatedByAdminId: admin.id,
              statusUpdatedAt: now.toISOString(),
            },
          },
          firstDetectedAt: overdueFirstDetectedAt,
          lastDetectedAt: overdueFirstDetectedAt,
          createdAt: overdueFirstDetectedAt,
          updatedAt: overdueFirstDetectedAt,
        })
        .returning();

      await runWalletReconciliation('manual');

      const [storedOverdueAlert] = await getDb()
        .select({
          status: reconciliationAlerts.status,
          metadata: reconciliationAlerts.metadata,
        })
        .from(reconciliationAlerts)
        .where(eq(reconciliationAlerts.id, overdueAlert.id))
        .limit(1);
      const [storedRecoveredAlert] = await getDb()
        .select({
          status: reconciliationAlerts.status,
          resolvedAt: reconciliationAlerts.resolvedAt,
        })
        .from(reconciliationAlerts)
        .where(eq(reconciliationAlerts.id, recoveredAlert.id))
        .limit(1);

      const overdueMetadata =
        typeof storedOverdueAlert?.metadata === 'object' &&
        storedOverdueAlert.metadata !== null
          ? (storedOverdueAlert.metadata as Record<string, unknown>)
          : {};
      const overdueWorkflow =
        typeof overdueMetadata.workflow === 'object' &&
        overdueMetadata.workflow !== null
          ? (overdueMetadata.workflow as Record<string, unknown>)
          : {};

      expect(storedOverdueAlert?.status).toBe('require_engineering');
      expect(overdueWorkflow).toMatchObject({
        status: 'require_engineering',
        systemEscalationReason: 'sla_breach_24h',
      });
      expect(storedRecoveredAlert?.status).toBe('resolved');
      expect(storedRecoveredAlert?.resolvedAt).not.toBeNull();

      const summaryResponse = await getApp().inject({
        method: 'GET',
        url: '/admin/engine/reconciliation-alerts/summary',
        headers: buildAdminCookieHeaders(adminSession.token),
      });
      expect(summaryResponse.statusCode).toBe(200);
      expect(summaryResponse.json().data).toMatchObject({
        requireEngineeringCount: 1,
        resolvedCount: 1,
        unresolvedCount: 1,
        overdueCount: 1,
        slaHours: 24,
        zeroDriftStreakDays: 0,
      });
    }
  );

  it(
    'reports consecutive zero-drift days in reconciliation summary',
    { timeout: 15000 },
    async () => {
      const { admin, password } = await seedAdminAccount({
        email: 'reconciliation-streak-admin@example.com',
      });
      await grantAdminPermissions(admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
      const adminSession = await enrollAdminMfa({
        email: 'reconciliation-streak-admin@example.com',
        password,
      });

      const today = new Date();
      today.setUTCHours(12, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);

      await getDb().insert(walletReconciliationRuns).values([
        {
          trigger: 'scheduled',
          status: 'completed',
          scannedUsers: 8,
          mismatchedUsers: 0,
          summary: { scannedUsers: 8, mismatchedUsers: 0 },
          startedAt: new Date(today.getTime() - 60_000),
          completedAt: today,
          createdAt: today,
          updatedAt: today,
        },
        {
          trigger: 'scheduled',
          status: 'completed',
          scannedUsers: 8,
          mismatchedUsers: 0,
          summary: { scannedUsers: 8, mismatchedUsers: 0 },
          startedAt: new Date(yesterday.getTime() - 60_000),
          completedAt: yesterday,
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          trigger: 'scheduled',
          status: 'completed',
          scannedUsers: 8,
          mismatchedUsers: 2,
          summary: { scannedUsers: 8, mismatchedUsers: 2 },
          startedAt: new Date(twoDaysAgo.getTime() - 60_000),
          completedAt: twoDaysAgo,
          createdAt: twoDaysAgo,
          updatedAt: twoDaysAgo,
        },
      ]);

      const summaryResponse = await getApp().inject({
        method: 'GET',
        url: '/admin/engine/reconciliation-alerts/summary',
        headers: buildAdminCookieHeaders(adminSession.token),
      });
      expect(summaryResponse.statusCode).toBe(200);
      expect(summaryResponse.json().data).toMatchObject({
        zeroDriftStreakDays: 2,
      });
    }
  );

  it('emits wallet reconciliation findings into the unified security event stream', async () => {
    const user = await seedUserWithWallet({
      email: 'security-reconciliation-user@example.com',
      withdrawableBalance: '6.75',
    });

    await getDb()
      .update(userWallets)
      .set({
        withdrawableBalance: '0.00',
      })
      .where(eq(userWallets.userId, user.id));

    await runWalletReconciliation('manual');

    const [securityEvent] = await getDb()
      .select({
        category: securityEvents.category,
        eventType: securityEvents.eventType,
        metadata: securityEvents.metadata,
      })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.userId, user.id),
          eq(securityEvents.eventType, 'wallet_reconciliation_alert_opened'),
        ),
      )
      .orderBy(desc(securityEvents.id))
      .limit(1);

    expect(securityEvent).toMatchObject({
      category: 'reconciliation_alert',
      eventType: 'wallet_reconciliation_alert_opened',
      metadata: expect.objectContaining({
        alertType: 'wallet_balance_drift',
        deltaAmount: '-6.75',
      }),
    });
  });

  it('stores admin mission params as jsonb objects on create and update', async () => {
    const { admin, password } = await seedAdminAccount({
      email: 'missions-admin@example.com',
    });
    await grantAdminPermissions(admin.id, [
      'analytics.read',
      'missions.read',
      'missions.create',
      'missions.update',
    ]);
    const adminSession = await enrollAdminMfa({
      email: 'missions-admin@example.com',
      password,
    });

    const missionId = 'integration_admin_mission';
    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/missions',
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        id: missionId,
        type: 'metric_threshold',
        reward: '9.50',
        isActive: true,
        params: {
          title: 'Integration create',
          description: 'Created during admin integration test.',
          metric: 'draw_count_all',
          target: 2,
          cadence: 'one_time',
          sortOrder: 410,
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().data).toMatchObject({
      id: missionId,
      type: 'metric_threshold',
      reward: '9.50',
      params: {
        title: 'Integration create',
        description: 'Created during admin integration test.',
        metric: 'draw_count_all',
        target: 2,
        cadence: 'one_time',
        sortOrder: 410,
      },
    });

    const updateResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/missions/${missionId}`,
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        type: 'metric_threshold',
        reward: '12.00',
        isActive: false,
        params: {
          title: 'Integration update',
          description: 'Updated during admin integration test.',
          metric: 'deposit_count',
          target: 3,
          cadence: 'daily',
          sortOrder: 420,
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data).toMatchObject({
      id: missionId,
      type: 'metric_threshold',
      reward: '12.00',
      isActive: false,
      params: {
        title: 'Integration update',
        description: 'Updated during admin integration test.',
        metric: 'deposit_count',
        target: 3,
        cadence: 'daily',
        sortOrder: 420,
      },
    });

    const [storedMission] = await getDb()
      .select({
        params: missions.params,
        paramsKind: sql<string>`jsonb_typeof(${missions.params})`,
      })
      .from(missions)
      .where(eq(missions.id, missionId))
      .limit(1);

    expect(storedMission?.paramsKind).toBe('object');
    expect(storedMission?.params).toMatchObject({
      title: 'Integration update',
      description: 'Updated during admin integration test.',
      metric: 'deposit_count',
      target: 3,
      cadence: 'daily',
      sortOrder: 420,
    });
  });

  it('marks claimed missions and admin metrics from reward claim ledger metadata', async () => {
    const { admin, password } = await seedAdminAccount({
      email: 'missions-claim-admin@example.com',
    });
    await grantAdminPermissions(admin.id, [
      'analytics.read',
      'missions.read',
      'missions.create',
    ]);
    const adminSession = await enrollAdminMfa({
      email: 'missions-claim-admin@example.com',
      password,
    });

    const missionId = 'integration_claim_mission';
    const createResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/missions',
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        id: missionId,
        type: 'metric_threshold',
        reward: '6.66',
        isActive: true,
        params: {
          title: 'Integration claim mission',
          description: 'Claim path should persist metadata as jsonb object.',
          metric: 'verified_contacts',
          target: 1,
          cadence: 'one_time',
          sortOrder: 430,
        },
      },
    });

    expect(createResponse.statusCode).toBe(201);

    const email = 'mission-claim-user@example.com';
    const passwordText = 'User123!';
    const user = await registerUser(email, passwordText);
    await verifyUserContacts(user.id, { email: true });
    const userSession = await loginUser(email, passwordText);

    const readyResponse = await getApp().inject({
      method: 'GET',
      url: '/rewards/center',
      headers: {
        authorization: `Bearer ${userSession.token}`,
      },
    });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json().data.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missionId,
          status: 'ready',
          claimable: true,
          claimedAt: null,
        }),
      ]),
    );

    const claimResponse = await getApp().inject({
      method: 'POST',
      url: '/rewards/claim',
      headers: {
        authorization: `Bearer ${userSession.token}`,
        'content-type': 'application/json',
      },
      payload: {
        missionId,
      },
    });
    expect(claimResponse.statusCode).toBe(200);
    expect(claimResponse.json().data).toMatchObject({
      missionId,
      grantedAmount: '6.66',
    });

    const [storedLedger] = await getDb()
      .select({
        entryType: sql<string>`${economyLedgerEntries.entryType}`,
        assetCode: sql<string>`${economyLedgerEntries.assetCode}`,
        metadataKind: sql<string>`jsonb_typeof(${economyLedgerEntries.metadata})`,
        missionId: sql<string>`${economyLedgerEntries.metadata} ->> 'missionId'`,
      })
      .from(economyLedgerEntries)
      .where(
        and(
          eq(economyLedgerEntries.userId, user.id),
          eq(economyLedgerEntries.assetCode, 'B_LUCK'),
          eq(economyLedgerEntries.entryType, 'gamification_reward'),
        ),
      )
      .orderBy(desc(economyLedgerEntries.id))
      .limit(1);

    expect(storedLedger).toMatchObject({
      entryType: 'gamification_reward',
      assetCode: 'B_LUCK',
      metadataKind: 'object',
      missionId,
    });

    const claimedResponse = await getApp().inject({
      method: 'GET',
      url: '/rewards/center',
      headers: {
        authorization: `Bearer ${userSession.token}`,
      },
    });
    expect(claimedResponse.statusCode).toBe(200);
    expect(claimedResponse.json().data.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missionId,
          status: 'claimed',
          claimable: false,
          claimedAt: expect.any(String),
        }),
      ]),
    );

    const adminListResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/missions',
      headers: buildAdminCookieHeaders(adminSession.token),
    });
    expect(adminListResponse.statusCode).toBe(200);
    expect(adminListResponse.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missionId,
          metrics: expect.objectContaining({
            claimedUsers: 1,
            grantedAmountTotal: '6.66',
          }),
        }),
      ]),
    );
  });

  it('records table interaction events and accumulates pair suspicion signals', async () => {
    const firstUser = await seedUserWithWallet({
      email: 'table-risk-user-1@example.com',
    });
    const secondUser = await seedUserWithWallet({
      email: 'table-risk-user-2@example.com',
    });
    const thirdUser = await seedUserWithWallet({
      email: 'table-risk-user-3@example.com',
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await getDb().insert(authSessions).values([
      {
        userId: firstUser.id,
        sessionKind: 'user',
        subjectRole: 'user',
        jti: 'table-risk-session-1',
        status: 'active',
        ip: '203.0.113.10',
        userAgent: 'TableRiskDevice/1.0',
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: secondUser.id,
        sessionKind: 'user',
        subjectRole: 'user',
        jti: 'table-risk-session-2',
        status: 'active',
        ip: '203.0.113.10',
        userAgent: 'TableRiskDevice/1.0',
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: thirdUser.id,
        sessionKind: 'user',
        subjectRole: 'user',
        jti: 'table-risk-session-3',
        status: 'active',
        ip: '203.0.113.30',
        userAgent: 'TableRiskDevice/3.0',
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const firstCapture = await getRiskModule().recordTableInteraction(
      [secondUser.id, thirdUser.id, firstUser.id, firstUser.id],
      'cash-table-7'
    );
    expect(firstCapture).toMatchObject({
      tableId: 'cash-table-7',
      participantUserIds: [firstUser.id, secondUser.id, thirdUser.id],
      pairCount: 3,
      signaledPairCount: 1,
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await getRiskModule().recordTableInteraction(
        [firstUser.id, secondUser.id, thirdUser.id],
        'cash-table-7'
      );
    }

    const pairRows = await getDb()
      .select({
        tableId: riskTableInteractionPairs.tableId,
        userAId: riskTableInteractionPairs.userAId,
        userBId: riskTableInteractionPairs.userBId,
        interactionCount: riskTableInteractionPairs.interactionCount,
        sharedIpCount: riskTableInteractionPairs.sharedIpCount,
        sharedDeviceCount: riskTableInteractionPairs.sharedDeviceCount,
        suspicionScore: riskTableInteractionPairs.suspicionScore,
      })
      .from(riskTableInteractionPairs)
      .orderBy(
        asc(riskTableInteractionPairs.userAId),
        asc(riskTableInteractionPairs.userBId)
      );

    expect(pairRows).toEqual([
      {
        tableId: 'cash-table-7',
        userAId: firstUser.id,
        userBId: secondUser.id,
        interactionCount: 5,
        sharedIpCount: 5,
        sharedDeviceCount: 5,
        suspicionScore: 16,
      },
      {
        tableId: 'cash-table-7',
        userAId: firstUser.id,
        userBId: thirdUser.id,
        interactionCount: 5,
        sharedIpCount: 0,
        sharedDeviceCount: 0,
        suspicionScore: 1,
      },
      {
        tableId: 'cash-table-7',
        userAId: secondUser.id,
        userBId: thirdUser.id,
        interactionCount: 5,
        sharedIpCount: 0,
        sharedDeviceCount: 0,
        suspicionScore: 1,
      },
    ]);

    const eventRows = await getDb()
      .select({
        id: riskTableInteractionEvents.id,
        pairCount: riskTableInteractionEvents.pairCount,
        metadata: riskTableInteractionEvents.metadata,
      })
      .from(riskTableInteractionEvents)
      .where(eq(riskTableInteractionEvents.tableId, 'cash-table-7'))
      .orderBy(asc(riskTableInteractionEvents.id));

    expect(eventRows).toHaveLength(5);
    expect(eventRows[0]).toMatchObject({
      pairCount: 3,
    });

    const lastEventMetadata = eventRows.at(-1)?.metadata as
      | {
          participants?: Array<{ userId: number; ipFingerprint: string | null }>;
          pairSignals?: Array<{
            userAId: number;
            userBId: number;
            sharedIp: boolean;
            sharedDevice: boolean;
            repeatedTable: boolean;
          }>;
        }
      | null
      | undefined;

    expect(lastEventMetadata?.participants).toHaveLength(3);
    expect(lastEventMetadata?.participants?.[0]).toMatchObject({
      userId: firstUser.id,
      ipFingerprint: expect.any(String),
    });
    expect(lastEventMetadata?.pairSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userAId: firstUser.id,
          userBId: secondUser.id,
          sharedIp: true,
          sharedDevice: true,
          repeatedTable: true,
        }),
        expect.objectContaining({
          userAId: firstUser.id,
          userBId: thirdUser.id,
          repeatedTable: true,
        }),
      ])
    );
  });

  it('builds the collusion dashboard with user, device, and cluster aggregates', async () => {
    const firstUser = await seedUserWithWallet({
      email: 'collusion-dashboard-user-1@example.com',
    });
    const secondUser = await seedUserWithWallet({
      email: 'collusion-dashboard-user-2@example.com',
    });
    const thirdUser = await seedUserWithWallet({
      email: 'collusion-dashboard-user-3@example.com',
    });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await getDb().insert(authSessions).values([
      {
        userId: firstUser.id,
        sessionKind: 'user',
        subjectRole: 'user',
        jti: 'collusion-dashboard-session-1',
        status: 'active',
        ip: '198.51.100.10',
        userAgent: 'CollusionDashboardDevice/1.0',
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: secondUser.id,
        sessionKind: 'user',
        subjectRole: 'user',
        jti: 'collusion-dashboard-session-2',
        status: 'active',
        ip: '198.51.100.10',
        userAgent: 'CollusionDashboardDevice/1.0',
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: thirdUser.id,
        sessionKind: 'user',
        subjectRole: 'user',
        jti: 'collusion-dashboard-session-3',
        status: 'active',
        ip: '198.51.100.30',
        userAgent: 'CollusionDashboardDevice/3.0',
        expiresAt,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await getRiskModule().recordTableInteraction(
        [firstUser.id, secondUser.id, thirdUser.id],
        'collusion-room-9'
      );
    }

    const dashboard = await getRiskModule().getCollusionDashboard({ days: 30 });

    expect(dashboard).toMatchObject({
      windowDays: 30,
      userSeries: expect.arrayContaining([
        expect.objectContaining({
          entityType: 'user',
          totalScore: 17,
          user: expect.objectContaining({
            userId: firstUser.id,
            email: 'collusion-dashboard-user-1@example.com',
          }),
        }),
      ]),
      deviceSeries: expect.arrayContaining([
        expect.objectContaining({
          entityType: 'device',
          totalScore: 18,
        }),
      ]),
      sharedIpTop: expect.arrayContaining([
        expect.objectContaining({
          pairEventCount: 5,
          totalScore: 16,
        }),
      ]),
      frequentTablePairs: expect.arrayContaining([
        expect.objectContaining({
          tableId: 'collusion-room-9',
          interactionCount: 5,
          sharedIpCount: 5,
          sharedDeviceCount: 5,
          suspicionScore: 16,
        }),
      ]),
    });
  });

  it('returns device, IP, and payout associations for a suspicious user cluster', async () => {
    const sharedIp = '198.51.100.77';
    const sharedUserAgent = 'AssociationGraphDevice/1.0';
    const sharedFingerprint = 'shared-browser-seed';
    const sharedLast4 = '4242';
    const sharedAccountName = 'Shared Device Ring';
    const sharedBankName = 'Test Bank';
    const sharedBrand = 'visa';

    const focusUser = await registerUser('association-focus@example.com');
    const relatedUser = await registerUser('association-related@example.com');

    for (const email of [focusUser.email, relatedUser.email]) {
      const response = await getApp().inject({
        method: 'POST',
        url: '/auth/user/session',
        remoteAddress: sharedIp,
        headers: {
          'content-type': 'application/json',
          'user-agent': sharedUserAgent,
          'x-device-fingerprint': sharedFingerprint,
        },
        payload: {
          email,
          password: 'secret-123',
        },
      });

      expect(response.statusCode).toBe(200);
    }

    const [focusPayoutMethod] = await getDb()
      .insert(payoutMethods)
      .values({
        userId: focusUser.id,
        methodType: 'bank_account',
        channelType: 'fiat',
        assetType: 'fiat',
        displayName: 'Focus test card',
        status: 'active',
      })
      .returning({ id: payoutMethods.id });
    const [relatedPayoutMethod] = await getDb()
      .insert(payoutMethods)
      .values({
        userId: relatedUser.id,
        methodType: 'bank_account',
        channelType: 'fiat',
        assetType: 'fiat',
        displayName: 'Related test card',
        status: 'active',
      })
      .returning({ id: payoutMethods.id });

    await getDb().insert(fiatPayoutMethods).values([
      {
        payoutMethodId: focusPayoutMethod.id,
        accountName: sharedAccountName,
        bankName: sharedBankName,
        brand: sharedBrand,
        accountLast4: sharedLast4,
      },
      {
        payoutMethodId: relatedPayoutMethod.id,
        accountName: sharedAccountName,
        bankName: sharedBankName,
        brand: sharedBrand,
        accountLast4: sharedLast4,
      },
    ]);

    const [latestSuspiciousRecord] = await getDb()
      .select({
        status: suspiciousAccounts.status,
        metadata: suspiciousAccounts.metadata,
      })
      .from(suspiciousAccounts)
      .where(eq(suspiciousAccounts.userId, relatedUser.id))
      .orderBy(desc(suspiciousAccounts.id))
      .limit(1);

    expect(latestSuspiciousRecord).toMatchObject({
      status: 'open',
      metadata: expect.objectContaining({
        associations: expect.objectContaining({
          summary: expect.objectContaining({
            relatedUserCount: 1,
          }),
        }),
      }),
    });

    const [deviceRow] = await getDb()
      .select({
        fingerprint: deviceFingerprints.fingerprint,
      })
      .from(deviceFingerprints)
      .where(eq(deviceFingerprints.userId, focusUser.id))
      .orderBy(desc(deviceFingerprints.id))
      .limit(1);

    expect(deviceRow?.fingerprint).toBeTruthy();

    const adminEmail = 'association-graph-admin@example.com';
    const { admin, password } = await seedAdminAccount({
      email: adminEmail,
    });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await loginAdmin(adminEmail, password);

    const response = await getApp().inject({
      method: 'GET',
      url: `/admin/users/${focusUser.id}/associations?days=90&signalLimit=12`,
      headers: buildAdminCookieHeaders(adminSession.token),
    });

    expect(response.statusCode).toBe(200);
    const graph = response.json().data;

    expect(graph.summary.relatedUserCount).toBe(1);
    expect(graph.summary.payoutCount).toBe(1);

    expect(graph.relatedUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: relatedUser.id,
          relationTypes: expect.arrayContaining(['device', 'ip', 'payout']),
          sharedIps: expect.arrayContaining([sharedIp]),
          sharedPayouts: expect.arrayContaining(['Card ****4242']),
        }),
      ]),
    );

    expect(graph.deviceSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityTypes: expect.arrayContaining(['user_login_success']),
          userCount: 2,
          relatedUsers: expect.arrayContaining([
            expect.objectContaining({ userId: relatedUser.id }),
          ]),
        }),
      ]),
    );
    expect(graph.ipSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: sharedIp,
          userCount: 2,
          relatedUsers: expect.arrayContaining([
            expect.objectContaining({ userId: relatedUser.id }),
          ]),
        }),
      ]),
    );
    expect(graph.payoutSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Card ****4242',
          userCount: 2,
          relatedUsers: expect.arrayContaining([
            expect.objectContaining({ userId: relatedUser.id }),
          ]),
        }),
      ]),
    );
    expect(graph.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `user:${focusUser.id}`, type: 'focus_user' }),
        expect.objectContaining({ id: `user:${relatedUser.id}`, type: 'user' }),
      ]),
    );
    expect(graph.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'focus_device' }),
        expect.objectContaining({
          type: 'shared_device',
          target: `user:${relatedUser.id}`,
        }),
        expect.objectContaining({
          type: 'shared_ip',
          target: `user:${relatedUser.id}`,
        }),
        expect.objectContaining({
          type: 'shared_payout',
          target: `user:${relatedUser.id}`,
        }),
      ]),
    );
  });

  it('creates and clears manual collusion flags in the risk service', async () => {
    const targetUser = await seedUserWithWallet({
      email: 'collusion-manual-flag-user@example.com',
    });
    const { admin } = await seedAdminAccount({
      email: 'collusion-manual-flag-admin@example.com',
    });
    const created = await getRiskModule().upsertManualCollusionFlag({
      userId: targetUser.id,
      adminId: admin.id,
      reason: 'shared device ring',
    });

    expect(created?.id).toBeTruthy();

    const [createdFlag] = await getDb()
      .select({
        id: suspiciousAccounts.id,
        status: suspiciousAccounts.status,
        reason: suspiciousAccounts.reason,
        metadata: suspiciousAccounts.metadata,
      })
      .from(suspiciousAccounts)
      .where(eq(suspiciousAccounts.userId, targetUser.id))
      .orderBy(desc(suspiciousAccounts.id))
      .limit(1);

    expect(createdFlag).toMatchObject({
      status: 'open',
      reason: 'shared device ring',
    });
    expect(createdFlag?.metadata).toMatchObject({
      manualFlagged: true,
      manualFlagSource: 'admin_collusion_dashboard',
      manualFlagReason: 'shared device ring',
      manualFlaggedBy: admin.id,
    });

    const cleared = await getRiskModule().clearManualCollusionFlag({
      userId: targetUser.id,
      adminId: admin.id,
      reason: 'review complete',
    });

    expect(cleared?.id).toBe(created?.id);

    const [clearedFlag] = await getDb()
      .select({
        status: suspiciousAccounts.status,
        resolvedAt: suspiciousAccounts.resolvedAt,
        metadata: suspiciousAccounts.metadata,
      })
      .from(suspiciousAccounts)
      .where(eq(suspiciousAccounts.userId, targetUser.id))
      .orderBy(desc(suspiciousAccounts.id))
      .limit(1);

    expect(clearedFlag).toMatchObject({
      status: 'resolved',
      resolvedAt: expect.any(Date),
    });
    expect(clearedFlag?.metadata).toMatchObject({
      manualFlagged: false,
      manualResolveReason: 'review complete',
      manualResolvedBy: admin.id,
    });
  });

  it('freeze FSM keeps a single active record and allows re-freeze after release', async () => {
    const user = await seedUserWithWallet({
      email: 'freeze-fsm@example.com',
    });

    const first = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'manual_admin',
      scope: 'account_lock',
    });
    expect(first?.id).toBeTruthy();

    const duplicate = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'manual_admin',
      scope: 'account_lock',
    });
    expect(duplicate?.id).toBe(first?.id);

    const released = await getRiskModule().releaseUserFreeze({
      freezeRecordId: first?.id ?? 0,
    });
    expect(released?.status).toBe('released');
    expect(released?.releasedAt).toBeTruthy();

    const releasedAgain = await getRiskModule().releaseUserFreeze({
      freezeRecordId: first?.id ?? 0,
    });
    expect(releasedAgain).toBeNull();

    const recreated = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'manual_admin',
      scope: 'account_lock',
    });
    expect(recreated?.id).toBeTruthy();
    expect(recreated?.id).not.toBe(first?.id);

    const records = await getDb()
      .select({
        id: freezeRecords.id,
        status: freezeRecords.status,
        reason: freezeRecords.reason,
        scope: freezeRecords.scope,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.userId, user.id))
      .orderBy(asc(freezeRecords.id));

    expect(records).toEqual([
      {
        id: first?.id ?? 0,
        status: 'released',
        reason: 'manual_admin',
        scope: 'account_lock',
      },
      {
        id: recreated?.id ?? 0,
        status: 'active',
        reason: 'manual_admin',
        scope: 'account_lock',
      },
    ]);
  });

  it('scoped freezes only block matching user operations', async () => {
    const userEmail = 'scoped-freeze-user@example.com';
    const userPassword = 'secret-123';
    const user = await registerUser(userEmail, userPassword);
    const initialSession = await loginUser(userEmail, userPassword);

    const gameplayFreeze = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'gameplay_lock',
      scope: 'gameplay_lock',
    });
    expect(gameplayFreeze?.id).toBeTruthy();

    const sessionAfterGameplayFreeze = await loginUser(userEmail, userPassword);

    const walletDuringGameplayFreeze = await getApp().inject({
      method: 'GET',
      url: '/wallet',
      headers: {
        authorization: `Bearer ${initialSession.token}`,
      },
    });
    expect(walletDuringGameplayFreeze.statusCode).toBe(200);

    const drawDuringGameplayFreeze = await getApp().inject({
      method: 'POST',
      url: '/draw',
      headers: {
        authorization: `Bearer ${sessionAfterGameplayFreeze.token}`,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(drawDuringGameplayFreeze.statusCode).toBe(423);

    const blackjackDuringGameplayFreeze = await getApp().inject({
      method: 'POST',
      url: '/blackjack/start',
      headers: {
        authorization: `Bearer ${sessionAfterGameplayFreeze.token}`,
        'content-type': 'application/json',
      },
      payload: {
        stakeAmount: '10.00',
      },
    });
    expect(blackjackDuringGameplayFreeze.statusCode).toBe(423);

    const withdrawalFreeze = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'withdrawal_lock',
      scope: 'withdrawal_lock',
    });
    expect(withdrawalFreeze?.id).toBeTruthy();

    const walletDuringWithdrawalFreeze = await getApp().inject({
      method: 'GET',
      url: '/wallet',
      headers: {
        authorization: `Bearer ${sessionAfterGameplayFreeze.token}`,
      },
    });
    expect(walletDuringWithdrawalFreeze.statusCode).toBe(200);

    const withdrawalDuringWithdrawalFreeze = await getApp().inject({
      method: 'POST',
      url: '/withdrawals',
      headers: {
        authorization: `Bearer ${sessionAfterGameplayFreeze.token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: '10.00',
      },
    });
    expect(withdrawalDuringWithdrawalFreeze.statusCode).toBe(423);
  });

  it('admin security freeze routes lock and release a user account with step-up MFA', { tag: 'critical' }, async () => {
    const email = 'security-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });

    const userEmail = 'security-route-user@example.com';
    const userPassword = 'secret-123';
    const user = await registerUser(userEmail, userPassword);
    const { token } = await loginUser(userEmail, userPassword);

    const auditUserAgent = 'FreezeAuditTest/1.0';
    const headers = {
      ...buildAdminBreakGlassHeaders(adminSession.token),
      'user-agent': auditUserAgent,
    };

    const freezeResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/freeze-records',
      headers,
      payload: {
        userId: user.id,
        reason: 'manual_admin',
        scope: 'account_lock',
        totpCode: adminSession.totpCode,
      },
    });
    expect(freezeResponse.statusCode).toBe(201);
    const freezeRecordId = Number(freezeResponse.json().data.id);

    const frozenWallet = await getApp().inject({
      method: 'GET',
      url: '/wallet',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(frozenWallet.statusCode).toBe(401);

    const frozenLogin = await getApp().inject({
      method: 'POST',
      url: '/auth/user/session',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        email: userEmail,
        password: userPassword,
      },
    });
    expect(frozenLogin.statusCode).toBe(423);

    const releaseResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/freeze-records/${freezeRecordId}/release`,
      headers,
      payload: {
        reason: 'review_cleared',
        totpCode: adminSession.totpCode,
      },
    });
    expect(releaseResponse.statusCode).toBe(200);

    const restoredSession = await loginUser(userEmail, userPassword);

    const releasedWallet = await getApp().inject({
      method: 'GET',
      url: '/wallet',
      headers: {
        authorization: `Bearer ${restoredSession.token}`,
      },
    });
    expect(releasedWallet.statusCode).toBe(200);

    const [freezeCreateAction] = await getDb()
      .select({
        action: adminActions.action,
        sessionId: adminActions.sessionId,
        userAgent: adminActions.userAgent,
        metadata: adminActions.metadata,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'freeze_create'),
        ),
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(freezeCreateAction).toMatchObject({
      action: 'freeze_create',
      sessionId: expect.any(String),
      userAgent: auditUserAgent,
    });
    expect(freezeCreateAction?.metadata).toMatchObject({
      freezeRecordId,
      reason: 'manual_admin',
      scope: 'account_lock',
      stepUpVerified: true,
      stepUpMethod: 'totp',
      stepUpVerifiedAt: expect.any(String),
    });

    const [freezeReleaseAction] = await getDb()
      .select({
        action: adminActions.action,
        sessionId: adminActions.sessionId,
        userAgent: adminActions.userAgent,
        metadata: adminActions.metadata,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, admin.id),
          eq(adminActions.action, 'freeze_release'),
        ),
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(freezeReleaseAction).toMatchObject({
      action: 'freeze_release',
      sessionId: expect.any(String),
      userAgent: auditUserAgent,
    });
    expect(freezeReleaseAction?.metadata).toMatchObject({
      freezeRecordId,
      previousReason: 'manual_admin',
      previousScope: 'account_lock',
      reason: 'review_cleared',
      stepUpVerified: true,
      stepUpMethod: 'totp',
      stepUpVerifiedAt: expect.any(String),
    });
  });

  it('lists pending KYC reviews, signs document previews, and syncs freeze state on review', async () => {
    const reviewUser = await seedUserWithWallet({
      email: 'kyc-review-user@example.com',
    });
    const approvedUser = await seedUserWithWallet({
      email: 'kyc-approve-user@example.com',
    });
    const email = 'kyc-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });

    const now = new Date();
    const pngBody =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9VE4KJ0AAAAASUVORK5CYII=';

    const [pendingProfile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: reviewUser.id,
        currentTier: 'tier_1',
        requestedTier: 'tier_2',
        status: 'pending',
        submissionVersion: 1,
        legalName: 'Review User',
        documentType: 'passport',
        documentNumberLast4: '1234',
        countryCode: 'US',
        submittedData: {
          occupation: 'Engineer',
          incomeBand: 'mid',
        },
        riskFlags: ['enhanced_tier_review', 'phone_unverified'],
        submittedAt: now,
      })
      .returning();

    await getDb().insert(kycDocuments).values([
      {
        profileId: pendingProfile.id,
        userId: reviewUser.id,
        submissionVersion: 1,
        kind: 'identity_front',
        label: 'Passport Front',
        fileName: 'passport-front.png',
        mimeType: 'image/png',
        sizeBytes: 68,
        storagePath: `data:image/png;base64,${pngBody}`,
      },
      {
        profileId: pendingProfile.id,
        userId: reviewUser.id,
        submissionVersion: 1,
        kind: 'selfie',
        label: 'Selfie',
        fileName: 'selfie.png',
        mimeType: 'image/png',
        sizeBytes: 68,
        storagePath: `data:image/png;base64,${pngBody}`,
      },
    ]);

    const queueResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/kyc-profiles?tier=tier_2',
      headers: buildAdminCookieHeaders(adminSession.token),
    });
    expect(queueResponse.statusCode).toBe(200);
    expect(queueResponse.json().data).toMatchObject({
      page: 1,
      limit: 50,
      hasNext: false,
      items: [
        expect.objectContaining({
          id: pendingProfile.id,
          userId: reviewUser.id,
          userEmail: 'kyc-review-user@example.com',
          currentTier: 'tier_1',
          requestedTier: 'tier_2',
          tier: 'tier_2',
          status: 'pending',
          documentCount: 2,
        }),
      ],
    });

    const detailResponse = await getApp().inject({
      method: 'GET',
      url: `/admin/kyc-profiles/${pendingProfile.id}`,
      headers: buildAdminCookieHeaders(adminSession.token),
    });
    expect(detailResponse.statusCode).toBe(200);
    const detailPayload = detailResponse.json().data as {
      documents: Array<{ previewUrl: string }>;
    };
    expect(detailPayload.documents).toHaveLength(2);
    expect(detailPayload.documents[0]?.previewUrl).toContain(
      '/admin/kyc-document-previews',
    );

    const previewUrl = new URL(detailPayload.documents[0]!.previewUrl);
    const previewResponse = await getApp().inject({
      method: 'GET',
      url: `${previewUrl.pathname}${previewUrl.search}`,
    });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.headers['content-type']).toContain('image/png');
    expect(previewResponse.body.length).toBeGreaterThan(0);

    const moreInfoResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/kyc-profiles/${pendingProfile.id}/request-more-info`,
      headers: {
        ...buildAdminCookieHeaders(adminSession.token),
        'content-type': 'application/json',
      },
      payload: {
        totpCode: adminSession.totpCode,
        reason: 'Need a clearer proof of address.',
      },
    });
    expect(moreInfoResponse.statusCode).toBe(200);
    expect(moreInfoResponse.json().data).toMatchObject({
      id: pendingProfile.id,
      status: 'more_info_required',
    });

    const [storedMoreInfoProfile] = await getDb()
      .select({
        status: kycProfiles.status,
        freezeRecordId: kycProfiles.freezeRecordId,
        reviewedByAdminId: kycProfiles.reviewedByAdminId,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.id, pendingProfile.id))
      .limit(1);

    expect(storedMoreInfoProfile).toMatchObject({
      status: 'more_info_required',
      reviewedByAdminId: admin.id,
    });
    expect(storedMoreInfoProfile?.freezeRecordId).toBeTruthy();

    const [moreInfoFreeze] = await getDb()
      .select({
        userId: freezeRecords.userId,
        category: freezeRecords.category,
        reason: freezeRecords.reason,
        scope: freezeRecords.scope,
        status: freezeRecords.status,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.id, Number(storedMoreInfoProfile?.freezeRecordId)))
      .limit(1);

    expect(moreInfoFreeze).toMatchObject({
      userId: reviewUser.id,
      category: 'compliance',
      reason: 'pending_kyc',
      scope: 'withdrawal_lock',
      status: 'active',
    });

    const [moreInfoEvent] = await getDb()
      .select({
        action: kycReviewEvents.action,
        fromStatus: kycReviewEvents.fromStatus,
        toStatus: kycReviewEvents.toStatus,
        reason: kycReviewEvents.reason,
      })
      .from(kycReviewEvents)
      .where(eq(kycReviewEvents.profileId, pendingProfile.id))
      .orderBy(desc(kycReviewEvents.id))
      .limit(1);

    expect(moreInfoEvent).toMatchObject({
      action: 'request_more_info',
      fromStatus: 'pending',
      toStatus: 'more_info_required',
      reason: 'Need a clearer proof of address.',
    });

    const [approvalFreeze] = await getDb()
      .insert(freezeRecords)
      .values({
        userId: approvedUser.id,
        category: 'compliance',
        reason: 'pending_kyc',
        scope: 'withdrawal_lock',
        status: 'active',
        metadata: {
          seeded: true,
        },
      })
      .returning();

    const [approvableProfile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: approvedUser.id,
        currentTier: 'tier_1',
        requestedTier: 'tier_2',
        status: 'pending',
        submissionVersion: 1,
        legalName: 'Approved User',
        documentType: 'passport',
        documentNumberLast4: '5678',
        countryCode: 'SG',
        riskFlags: [],
        freezeRecordId: approvalFreeze.id,
        submittedAt: now,
      })
      .returning();

    const approveResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/kyc-profiles/${approvableProfile.id}/approve`,
      headers: {
        ...buildAdminCookieHeaders(adminSession.token),
        'content-type': 'application/json',
      },
      payload: {
        totpCode: adminSession.totpCode,
        reason: 'Documents verified.',
      },
    });
    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json().data).toMatchObject({
      id: approvableProfile.id,
      status: 'approved',
      freezeRecordId: approvalFreeze.id,
    });

    const [storedApprovedProfile] = await getDb()
      .select({
        currentTier: kycProfiles.currentTier,
        requestedTier: kycProfiles.requestedTier,
        status: kycProfiles.status,
        freezeRecordId: kycProfiles.freezeRecordId,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.id, approvableProfile.id))
      .limit(1);

    expect(storedApprovedProfile).toMatchObject({
      currentTier: 'tier_2',
      requestedTier: null,
      status: 'approved',
      freezeRecordId: approvalFreeze.id,
    });

    const [releasedFreeze] = await getDb()
      .select({
        status: freezeRecords.status,
        releasedAt: freezeRecords.releasedAt,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.id, approvalFreeze.id))
      .limit(1);

    expect(releasedFreeze?.status).toBe('released');
    expect(releasedFreeze?.releasedAt).toBeTruthy();
  });

  it(
    'rejects pending KYC reviews and releases linked freeze',
    { timeout: 15000 },
    async () => {
    const rejectedUser = await seedUserWithWallet({
      email: 'kyc-reject-user@example.com',
    });
    const email = 'kyc-reject-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });

    const [linkedFreeze] = await getDb()
      .insert(freezeRecords)
      .values({
        userId: rejectedUser.id,
        category: 'compliance',
        reason: 'pending_kyc',
        scope: 'withdrawal_lock',
        status: 'active',
        metadata: {
          seeded: true,
        },
      })
      .returning();

    const [pendingProfile] = await getDb()
      .insert(kycProfiles)
      .values({
        userId: rejectedUser.id,
        currentTier: 'tier_1',
        requestedTier: 'tier_2',
        status: 'pending',
        submissionVersion: 1,
        legalName: 'Reject User',
        documentType: 'passport',
        documentNumberLast4: '9876',
        countryCode: 'CA',
        riskFlags: ['enhanced_tier_review'],
        freezeRecordId: linkedFreeze.id,
        submittedAt: new Date(),
      })
      .returning();

    const rejectionReason = 'Document number does not match the submission.';
    const rejectResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/kyc-profiles/${pendingProfile.id}/reject`,
      headers: {
        ...buildAdminCookieHeaders(adminSession.token),
        'content-type': 'application/json',
      },
      payload: {
        totpCode: adminSession.totpCode,
        reason: rejectionReason,
      },
    });
    expect(rejectResponse.statusCode).toBe(200);
    expect(rejectResponse.json().data).toMatchObject({
      id: pendingProfile.id,
      status: 'rejected',
      freezeRecordId: linkedFreeze.id,
    });

    const [storedRejectedProfile] = await getDb()
      .select({
        currentTier: kycProfiles.currentTier,
        requestedTier: kycProfiles.requestedTier,
        status: kycProfiles.status,
        rejectionReason: kycProfiles.rejectionReason,
        freezeRecordId: kycProfiles.freezeRecordId,
        reviewedByAdminId: kycProfiles.reviewedByAdminId,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.id, pendingProfile.id))
      .limit(1);

    expect(storedRejectedProfile).toMatchObject({
      currentTier: 'tier_1',
      requestedTier: 'tier_2',
      status: 'rejected',
      rejectionReason,
      freezeRecordId: linkedFreeze.id,
      reviewedByAdminId: admin.id,
    });

    const [releasedFreeze] = await getDb()
      .select({
        status: freezeRecords.status,
        releasedAt: freezeRecords.releasedAt,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.id, linkedFreeze.id))
      .limit(1);

    expect(releasedFreeze?.status).toBe('released');
    expect(releasedFreeze?.releasedAt).toBeTruthy();

    const [rejectionEvent] = await getDb()
      .select({
        action: kycReviewEvents.action,
        fromStatus: kycReviewEvents.fromStatus,
        toStatus: kycReviewEvents.toStatus,
        reason: kycReviewEvents.reason,
        metadata: kycReviewEvents.metadata,
      })
      .from(kycReviewEvents)
      .where(eq(kycReviewEvents.profileId, pendingProfile.id))
      .orderBy(desc(kycReviewEvents.id))
      .limit(1);

    expect(rejectionEvent).toMatchObject({
      action: 'rejected',
      fromStatus: 'pending',
      toStatus: 'rejected',
      reason: rejectionReason,
    });
    expect(rejectionEvent?.metadata).toMatchObject({
      freezeRecordId: linkedFreeze.id,
    });
    },
  );

  it(
    'filters pending KYC queue by risk flag',
    { timeout: 15000 },
    async () => {
      const arrayUser = await seedUserWithWallet({
        email: 'kyc-risk-array-user@example.com',
      });
      const approvedUser = await seedUserWithWallet({
        email: 'kyc-risk-approved-user@example.com',
      });
      const otherUser = await seedUserWithWallet({
        email: 'kyc-risk-other-user@example.com',
      });
    const email = 'kyc-risk-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });

    const now = Date.now();
      const [arrayProfile] = await getDb()
        .insert(kycProfiles)
        .values({
          userId: arrayUser.id,
        currentTier: 'tier_1',
        requestedTier: 'tier_2',
        status: 'pending',
        submissionVersion: 1,
        legalName: 'Risk Array User',
        documentType: 'passport',
        documentNumberLast4: '1111',
        countryCode: 'US',
        riskFlags: ['phone_unverified', 'enhanced_tier_review'],
        submittedAt: new Date(now - 120_000),
        })
        .returning();
      await getDb()
        .insert(kycProfiles)
        .values({
          userId: approvedUser.id,
          currentTier: 'tier_1',
          requestedTier: 'tier_2',
          status: 'approved',
          submissionVersion: 1,
          legalName: 'Risk Approved User',
          documentType: 'passport',
          documentNumberLast4: '2222',
          countryCode: 'GB',
          riskFlags: ['phone_unverified'],
          submittedAt: new Date(now - 60_000),
        });

      await getDb().insert(kycProfiles).values({
        userId: otherUser.id,
        currentTier: 'tier_1',
      requestedTier: 'tier_2',
      status: 'pending',
      submissionVersion: 1,
      legalName: 'Risk Other User',
      documentType: 'passport',
      documentNumberLast4: '3333',
      countryCode: 'SG',
      riskFlags: ['source_of_funds_required'],
      submittedAt: new Date(now),
    });

    const queueResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/kyc-profiles?riskFlag=phone_unverified',
      headers: buildAdminCookieHeaders(adminSession.token),
    });
    expect(queueResponse.statusCode).toBe(200);

    const queuePayload = queueResponse.json().data as {
      page: number;
      limit: number;
      hasNext: boolean;
      items: Array<{
        id: number;
        userEmail: string;
        riskFlags: string[];
        status: string;
      }>;
    };

      expect(queuePayload).toMatchObject({
        page: 1,
        limit: 50,
        hasNext: false,
      });
      expect(queuePayload.items).toHaveLength(1);
      expect(queuePayload.items.map((item) => item.id)).toEqual([
        arrayProfile.id,
      ]);
      expect(queuePayload.items.map((item) => item.userEmail)).toEqual([
        'kyc-risk-array-user@example.com',
      ]);
      expect(queuePayload.items.map((item) => item.status)).toEqual([
        'pending',
      ]);
      expect(queuePayload.items[0]?.riskFlags).toEqual([
        'phone_unverified',
      'enhanced_tier_review',
    ]);
    },
  );

  it('admin control-center system config flow creates, approves, and publishes a config change', { tag: 'critical' }, async () => {
    const requesterEmail = 'config-requester@example.com';
    const approverEmail = 'config-approver@example.com';
    const requester = await seedAdminAccount({ email: requesterEmail });
    const approver = await seedAdminAccount({ email: approverEmail });
    await grantAdminPermissions(requester.admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
    await grantAdminPermissions(approver.admin.id, CONFIG_ADMIN_PERMISSION_KEYS);

    const requesterSession = await loginAdmin(requesterEmail, requester.password);
    const approverSession = await enrollAdminMfa({
      email: approverEmail,
      password: approver.password,
    });

    const requesterHeaders = {
      ...buildAdminCookieHeaders(requesterSession.token),
      'user-agent': 'ControlRequester/1.0',
    };
    const approverUserAgent = 'ControlApprover/1.0';
    const approverHeaders = {
      ...buildAdminCookieHeaders(approverSession.token),
      'user-agent': approverUserAgent,
    };

    const createDraftResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/control-center/system-config/drafts',
      headers: requesterHeaders,
      payload: {
        drawCost: '11',
        authFailureWindowMinutes: '21',
        paymentWithdrawEnabled: false,
        reason: 'integration-test',
      },
    });
    expect(createDraftResponse.statusCode).toBe(201);
    expect(createDraftResponse.json().data.requiresMfa).toBe(true);
    const requestId = Number(createDraftResponse.json().data.id);

    const submitResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/control-center/change-requests/${requestId}/submit`,
      headers: requesterHeaders,
      payload: {
        confirmationText: `SUBMIT ${requestId}`,
      },
    });
    expect(submitResponse.statusCode).toBe(200);

    const approveResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/control-center/change-requests/${requestId}/approve`,
      headers: approverHeaders,
      payload: {},
    });
    expect(approveResponse.statusCode).toBe(200);

    const publishResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/control-center/change-requests/${requestId}/publish`,
      headers: approverHeaders,
      payload: {
        confirmationText: `PUBLISH ${requestId}`,
        totpCode: approverSession.totpCode,
      },
    });
    expect(publishResponse.statusCode).toBe(200);

    const configResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/config',
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(approverSession.token)}`,
      },
    });
    expect(configResponse.statusCode).toBe(200);
    expect(configResponse.json().data).toMatchObject({
      drawCost: '11.00',
      authFailureWindowMinutes: '21.00',
      paymentWithdrawEnabled: false,
    });

    const [publishAction] = await getDb()
      .select({
        action: adminActions.action,
        sessionId: adminActions.sessionId,
        userAgent: adminActions.userAgent,
        metadata: adminActions.metadata,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, approver.admin.id),
          eq(adminActions.action, 'config_change_request_published'),
        ),
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(publishAction).toMatchObject({
      action: 'config_change_request_published',
      sessionId: expect.any(String),
      userAgent: approverUserAgent,
    });
    expect(publishAction?.metadata).toMatchObject({
      changeType: 'system_config_update',
      publishStepUpRequired: true,
      stepUpVerified: true,
      stepUpMethod: 'totp',
      stepUpVerifiedAt: expect.any(String),
      changedKeys: expect.arrayContaining([
        'drawCost',
        'authFailureWindowMinutes',
        'paymentWithdrawEnabled',
      ]),
      fieldDiff: expect.arrayContaining([
        expect.objectContaining({
          key: 'drawCost',
          from: expect.any(String),
          to: '11.00',
        }),
        expect.objectContaining({
          key: 'authFailureWindowMinutes',
          from: expect.any(String),
          to: '21.00',
        }),
        expect.objectContaining({
          key: 'paymentWithdrawEnabled',
          from: expect.any(Boolean),
          to: false,
        }),
      ]),
      reviewNotes: 'integration-test',
    });
  });

  it('engine permission routes update managed scopes without overwriting legacy admin permissions', async () => {
    const actorEmail = 'engine-scope-actor@example.com';
    const targetEmail = 'engine-scope-target@example.com';

    const actor = await seedAdminAccount({
      email: actorEmail,
      displayName: 'Engine Scope Operator',
    });
    const target = await seedAdminAccount({
      email: targetEmail,
      displayName: 'Engine Scope Target',
    });

    await grantAdminPermissions(actor.admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
    await grantAdminPermissions(target.admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
    await getDb()
      .insert(adminPermissions)
      .values({
        adminId: target.admin.id,
        permissionKey: 'c:withdraw',
      })
      .onConflictDoNothing();

    await loginAdmin(targetEmail, target.password);
    const actorSession = await enrollAdminMfa({
      email: actorEmail,
      password: actor.password,
    });

    const overviewResponse = await getApp().inject({
      method: 'GET',
      url: '/admin/engine/permissions',
      headers: buildAdminCookieHeaders(actorSession.token),
    });

    expect(overviewResponse.statusCode).toBe(200);
    const overviewTarget = (
      overviewResponse.json().data.admins as Array<{
        adminId: number;
        managedScopes: string[];
        legacyPermissions: string[];
      }>
    ).find((item) => item.adminId === target.admin.id);

    expect(overviewTarget).toMatchObject({
      adminId: target.admin.id,
      managedScopes: ['c:withdraw'],
      legacyPermissions: expect.arrayContaining(['config.read', 'config.update']),
    });

    const updateResponse = await getApp().inject({
      method: 'PUT',
      url: `/admin/engine/permissions/${target.admin.id}`,
      headers: {
        ...buildAdminCookieHeaders(actorSession.token),
        'user-agent': 'EnginePermissionOperator/1.0',
      },
      payload: {
        scopeKeys: ['engine:*', 'b:billing'],
        confirmationText: `APPLY ENGINE SCOPES ${target.admin.id}`,
        totpCode: actorSession.totpCode,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data).toMatchObject({
      addedScopes: ['engine:*', 'b:billing'],
      removedScopes: ['c:withdraw'],
      admin: {
        adminId: target.admin.id,
        email: targetEmail,
        managedScopes: ['engine:*', 'b:billing'],
        legacyPermissions: expect.arrayContaining(['config.read', 'config.update']),
      },
    });

    const targetPermissionKeys = (
      await getDb()
        .select({
          permissionKey: adminPermissions.permissionKey,
        })
        .from(adminPermissions)
        .where(eq(adminPermissions.adminId, target.admin.id))
        .orderBy(asc(adminPermissions.permissionKey))
    ).map((row) => row.permissionKey);

    expect(targetPermissionKeys).toEqual(
      expect.arrayContaining([
        'analytics.read',
        'config.read',
        'config.release_bonus',
        'config.update',
        'engine:*',
        'b:billing',
      ])
    );
    expect(targetPermissionKeys).not.toContain('c:withdraw');

    const targetAdminSessions = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, target.user.id),
          eq(authSessions.sessionKind, 'admin')
        )
      )
      .orderBy(desc(authSessions.id));

    expect(targetAdminSessions[0]).toMatchObject({
      status: 'revoked',
      revokedReason: 'admin_permission_changed',
    });

    const [auditAction] = await getDb()
      .select({
        action: adminActions.action,
        targetId: adminActions.targetId,
        metadata: adminActions.metadata,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.adminId, actor.admin.id),
          eq(adminActions.action, 'engine_permission_scopes_updated')
        )
      )
      .orderBy(desc(adminActions.id))
      .limit(1);

    expect(auditAction).toMatchObject({
      action: 'engine_permission_scopes_updated',
      targetId: target.admin.id,
    });
    expect(auditAction?.metadata).toMatchObject({
      targetAdminEmail: targetEmail,
      addedScopes: ['engine:*', 'b:billing'],
      removedScopes: ['c:withdraw'],
      managedScopes: ['engine:*', 'b:billing'],
      stepUpVerified: true,
      stepUpMethod: 'totp',
      stepUpVerifiedAt: expect.any(String),
    });
  });

  it('rejects prediction market creates when explicit rule fields are missing or invalid', async () => {
    const { admin, password } = await seedAdminAccount({
      email: 'prediction-market-admin@example.com',
    });
    await grantAdminPermissions(admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({
      email: 'prediction-market-admin@example.com',
      password,
    });

    const missingRulesResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/markets',
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        slug: 'btc-above-100k-admin-missing',
        roundKey: 'btc-2026-04-29-close-admin-missing',
        title: 'BTC closes above 100k on 2026-04-29 UTC',
        totpCode: adminSession.totpCode,
        outcomes: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
        locksAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    expect(missingRulesResponse.statusCode).toBe(400);
    expect(missingRulesResponse.json().error.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^resolutionRules /),
        expect.stringMatching(/^sourceOfTruth /),
        expect.stringMatching(/^category /),
        expect.stringMatching(/^tags /),
        expect.stringMatching(/^invalidPolicy /),
        expect.stringMatching(/^vigBps /),
      ])
    );

    const invalidRulesResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/markets',
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        slug: 'btc-above-100k-admin-invalid',
        roundKey: 'btc-2026-04-29-close-admin-invalid',
        title: 'BTC closes above 100k on 2026-04-29 UTC',
        totpCode: adminSession.totpCode,
        resolutionRules: 'too short',
        sourceOfTruth: 'ok',
        category: 'news',
        tags: [],
        invalidPolicy: 'void',
        vigBps: -1,
        outcomes: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
        locksAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });

    expect(invalidRulesResponse.statusCode).toBe(400);
    expect(invalidRulesResponse.json().error.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^resolutionRules /),
        expect.stringMatching(/^sourceOfTruth /),
        expect.stringMatching(/^category /),
        expect.stringMatching(/^tags /),
        expect.stringMatching(/^invalidPolicy /),
        expect.stringMatching(/^vigBps /),
      ])
    );

    const storedMarkets = await getDb()
      .select({ id: predictionMarkets.id })
      .from(predictionMarkets)
      .orderBy(desc(predictionMarkets.id));

    expect(storedMarkets).toEqual([]);
  });

  it('admin economy overview returns aggregated asset, gift, order, and risk data', async () => {
    const email = 'economy-overview-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });

    const sender = await seedUserWithWallet({
      email: 'economy-overview-sender@example.com',
      bonusBalance: '125.00',
    });
    const recipient = await seedUserWithWallet({
      email: 'economy-overview-recipient@example.com',
      bonusBalance: '15.00',
    });

    await getDb().insert(giftEnergyAccounts).values({
      userId: sender.id,
      currentEnergy: 0,
      maxEnergy: 10,
      refillPolicy: {
        type: 'daily_reset',
        intervalHours: 24,
        refillAmount: 10,
      },
    });

    const [product] = await getDb()
      .insert(iapProducts)
      .values({
        sku: 'reward.ios.gift-pack.admin-overview',
        storeChannel: 'ios',
        deliveryType: 'gift_pack',
        isActive: true,
      })
      .returning({
        id: iapProducts.id,
      });

    await getDb().insert(storePurchaseOrders).values({
      userId: sender.id,
      recipientUserId: recipient.id,
      iapProductId: product!.id,
      storeChannel: 'ios',
      status: 'verified',
      idempotencyKey: 'admin-economy-overview-order-1',
      sourceApp: 'mobile',
    });

    await getDb().insert(giftTransfers).values({
      senderUserId: sender.id,
      receiverUserId: recipient.id,
      assetCode: 'B_LUCK',
      amount: '60.00',
      energyCost: 3,
      status: 'completed',
      idempotencyKey: 'admin-economy-overview-gift-1',
      sourceApp: 'web',
      deviceFingerprint: 'shared-device',
      metadata: {
        requestIp: '203.0.113.10',
      },
    });

    await getDb().insert(freezeRecords).values({
      userId: recipient.id,
      category: 'operations',
      reason: 'manual_admin',
      scope: 'gift_lock',
      status: 'active',
    });

    const response = await getApp().inject({
      method: 'GET',
      url: '/admin/economy/overview',
      headers: buildAdminCookieHeaders(adminSession.token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        assetTotals: expect.arrayContaining([
          expect.objectContaining({
            assetCode: 'B_LUCK',
            userCount: 2,
            availableBalance: '140.00',
          }),
        ]),
        giftSummary: expect.objectContaining({
          sentTodayCount: 1,
          sentTodayAmount: '60.00',
          sentLast24hCount: 1,
          sentLast24hAmount: '60.00',
        }),
        energySummary: expect.objectContaining({
          exhaustedCount: 1,
          belowMaxCount: 1,
          accountCount: 1,
        }),
        orderSummary: expect.arrayContaining([
          expect.objectContaining({
            status: 'verified',
            count: 1,
          }),
        ]),
        recentGifts: expect.arrayContaining([
          expect.objectContaining({
            senderUserId: sender.id,
            receiverUserId: recipient.id,
            amount: '60.00',
            status: 'completed',
          }),
        ]),
        recentOrders: expect.arrayContaining([
          expect.objectContaining({
            userId: sender.id,
            recipientUserId: recipient.id,
            status: 'verified',
            sku: 'reward.ios.gift-pack.admin-overview',
            deliveryType: 'gift_pack',
          }),
        ]),
        activeGiftLocks: expect.arrayContaining([
          expect.objectContaining({
            userId: recipient.id,
            scope: 'gift_lock',
            status: 'active',
          }),
        ]),
        riskSignals: expect.arrayContaining([
          expect.objectContaining({
            senderUserId: sender.id,
            receiverUserId: recipient.id,
            transferCount: 1,
            totalAmount: '60.00',
            sharedDeviceCount: 1,
            sharedIpCount: 1,
          }),
        ]),
      },
    });
  });

  it('admin economy routes can inspect and reverse a fulfilled voucher order', async () => {
    const email = 'economy-reverse-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });

    await getDb().insert(iapProducts).values({
      sku: 'reward.ios.voucher.admin-reverse',
      storeChannel: 'ios',
      deliveryType: 'voucher',
      assetCode: 'IAP_VOUCHER',
      assetAmount: '12.50',
      isActive: true,
    });

    const user = await seedUserWithWallet({
      email: 'economy-reverse-user@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const verifyResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/purchases/verify',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: 'admin-economy-reverse-verify-1',
        storeChannel: 'ios',
        sku: 'reward.ios.voucher.admin-reverse',
        receipt: {
          externalTransactionId: 'admin-economy-reverse-transaction-1',
          rawPayload: {
            environment: 'Sandbox',
          },
        },
      },
    });

    expect(verifyResponse.statusCode).toBe(201);
    const orderId = Number(verifyResponse.json().data.order.id);

    const detailResponse = await getApp().inject({
      method: 'GET',
      url: `/admin/economy/orders/${orderId}`,
      headers: buildAdminCookieHeaders(adminSession.token),
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      ok: true,
      data: {
        order: expect.objectContaining({
          id: orderId,
          userId: user.id,
          status: 'fulfilled',
          sku: 'reward.ios.voucher.admin-reverse',
          deliveryType: 'voucher',
        }),
        receipt: expect.objectContaining({
          externalTransactionId: 'admin-economy-reverse-transaction-1',
        }),
      },
    });

    const reverseResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/economy/orders/${orderId}/reverse`,
      headers: {
        ...buildAdminCookieHeaders(adminSession.token),
        'content-type': 'application/json',
      },
      payload: {
        totpCode: adminSession.totpCode,
        targetStatus: 'refunded',
        reason: 'manual_refund',
      },
    });

    expect(reverseResponse.statusCode).toBe(200);
    expect(reverseResponse.json()).toMatchObject({
      ok: true,
      data: {
        order: expect.objectContaining({
          id: orderId,
          status: 'refunded',
        }),
      },
    });

    const [voucherBalance] = await getDb()
      .select({
        availableBalance: userAssetBalances.availableBalance,
      })
      .from(userAssetBalances)
      .where(
        and(
          eq(userAssetBalances.userId, user.id),
          eq(userAssetBalances.assetCode, 'IAP_VOUCHER'),
        ),
      )
      .limit(1);

    expect(voucherBalance?.availableBalance).toBe('0.00');

    const ledgerRows = await getDb()
      .select({
        entryType: economyLedgerEntries.entryType,
        amount: economyLedgerEntries.amount,
      })
      .from(economyLedgerEntries)
      .where(eq(economyLedgerEntries.userId, user.id))
      .orderBy(asc(economyLedgerEntries.id));

    expect(ledgerRows).toEqual([
      {
        entryType: 'iap_purchase_fulfill',
        amount: '12.50',
      },
      {
        entryType: 'iap_purchase_refund_reversal',
        amount: '-12.50',
      },
    ]);
  });
});
