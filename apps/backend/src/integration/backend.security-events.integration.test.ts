import { amlChecks, securityEvents, userWallets } from '@reward/database'
import { desc, eq } from '@reward/database/orm'

import {
  describeIntegrationSuite,
  expect,
  getDb,
  itIntegration as it,
  seedAdminAccount,
  seedUserWithWallet,
} from './integration-test-support'
import { recordAdminAction } from '../modules/admin/audit'
import { reviewPendingAmlHit, screenUserRegistration } from '../modules/aml/service'
import { recordAuthEvent } from '../modules/audit/service'
import { runWalletReconciliation } from '../modules/wallet/reconciliation-service'

type StoredSecurityEvent = typeof securityEvents.$inferSelect

const listSecurityEventsByIp = async (ip: string) =>
  getDb()
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.ip, ip))
    .orderBy(desc(securityEvents.id))

const listSecurityEventsByUser = async (userId: number) =>
  getDb()
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.userId, userId))
    .orderBy(desc(securityEvents.id))

const expectEvent = (
  events: StoredSecurityEvent[],
  eventType: string,
): StoredSecurityEvent => {
  const event = events.find((candidate) => candidate.eventType === eventType)
  expect(event).toBeDefined()

  if (!event) {
    throw new Error(`Expected security event ${eventType} to be present.`)
  }

  return event
}

describeIntegrationSuite('backend security events integration', () => {
  it('writes auth and admin events into security_events and emits admin correlation alerts', async () => {
    const ip = '203.0.113.10'
    const userAgent = 'security-events-integration-smoke'
    const { user, admin } = await seedAdminAccount({
      email: 'security-events-admin@example.com',
    })

    for (let index = 0; index < 3; index += 1) {
      await recordAuthEvent({
        eventType: 'admin_login_failed',
        email: user.email,
        ip,
        userAgent,
      })
    }

    await recordAuthEvent({
      eventType: 'admin_login_success',
      email: user.email,
      userId: user.id,
      ip,
      userAgent,
      metadata: {
        adminId: admin.id,
        sessionId: 'security-session-1',
        sessionKind: 'admin',
      },
    })

    await recordAdminAction({
      adminId: admin.id,
      action: 'security_events_smoke_action',
      ip,
      sessionId: 'security-session-1',
      userAgent,
      metadata: {
        scope: 'security-events-smoke',
      },
    })

    const events = await listSecurityEventsByIp(ip)

    expect(events.filter((event) => event.eventType === 'admin_login_failed')).toHaveLength(3)

    const successEvent = expectEvent(events, 'admin_login_success')
    expect(successEvent).toMatchObject({
      category: 'auth',
      severity: 'info',
      sourceTable: 'auth_events',
      sourceRecordId: expect.any(Number),
      userId: user.id,
      adminId: admin.id,
      sessionId: 'security-session-1',
    })

    const adminActionEvent = expectEvent(events, 'security_events_smoke_action')
    expect(adminActionEvent).toMatchObject({
      category: 'admin_action',
      severity: 'info',
      sourceTable: 'admin_actions',
      sourceRecordId: expect.any(Number),
      adminId: admin.id,
      sessionId: 'security-session-1',
      metadata: expect.objectContaining({
        scope: 'security-events-smoke',
      }),
    })

    const correlationEvent = expectEvent(events, 'admin_failed_then_success_same_ip')
    expect(correlationEvent).toMatchObject({
      category: 'correlation_alert',
      severity: 'critical',
      ip,
      metadata: expect.objectContaining({
        ruleId: 'admin_failed_then_success_same_ip',
        failedCount: 3,
        windowMinutes: 60,
      }),
    })
  })

  it('writes aml hit and aml review decisions into security_events', async () => {
    const user = await seedUserWithWallet({
      email: 'security-watchlist-user@example.com',
    })

    await expect(screenUserRegistration(user.id)).rejects.toMatchObject({
      statusCode: 423,
    })

    const [amlCheck] = await getDb()
      .select({
        id: amlChecks.id,
        result: amlChecks.result,
        reviewStatus: amlChecks.reviewStatus,
      })
      .from(amlChecks)
      .where(eq(amlChecks.userId, user.id))
      .orderBy(desc(amlChecks.id))
      .limit(1)

    expect(amlCheck).toMatchObject({
      result: 'hit',
      reviewStatus: 'pending',
    })

    const { admin } = await seedAdminAccount({
      email: 'security-aml-review-admin@example.com',
    })

    await reviewPendingAmlHit({
      amlCheckId: amlCheck!.id,
      adminId: admin.id,
      action: 'confirm',
      note: 'integration smoke confirm',
    })

    const events = await listSecurityEventsByUser(user.id)

    const amlHitEvent = expectEvent(events, 'aml_hit_detected')
    expect(amlHitEvent).toMatchObject({
      category: 'aml',
      severity: 'critical',
      sourceTable: 'aml_checks',
      sourceRecordId: amlCheck!.id,
      userId: user.id,
      metadata: expect.objectContaining({
        amlCheckId: amlCheck!.id,
        reviewStatus: 'pending',
      }),
    })

    const amlReviewEvent = expectEvent(events, 'aml_review_confirmed')
    expect(amlReviewEvent).toMatchObject({
      category: 'aml',
      severity: 'critical',
      sourceTable: 'aml_checks',
      sourceRecordId: amlCheck!.id,
      userId: user.id,
      adminId: admin.id,
      metadata: expect.objectContaining({
        amlCheckId: amlCheck!.id,
        reviewStatus: 'confirmed',
        note: 'integration smoke confirm',
      }),
    })
  })

  it('writes reconciliation alerts into security_events and correlates them with aml hits', async () => {
    const user = await seedUserWithWallet({
      email: 'security-watchlist-reconciliation-user@example.com',
      withdrawableBalance: '6.75',
    })

    await expect(screenUserRegistration(user.id)).rejects.toMatchObject({
      statusCode: 423,
    })

    await getDb()
      .update(userWallets)
      .set({
        withdrawableBalance: '0.00',
      })
      .where(eq(userWallets.userId, user.id))

    await runWalletReconciliation('manual')

    const events = await listSecurityEventsByUser(user.id)

    const reconciliationEvent = expectEvent(
      events,
      'wallet_reconciliation_alert_opened',
    )
    expect(reconciliationEvent).toMatchObject({
      category: 'reconciliation_alert',
      severity: 'critical',
      sourceTable: 'reconciliation_alerts',
      userId: user.id,
      metadata: expect.objectContaining({
        alertType: 'wallet_balance_drift',
        deltaAmount: '-6.75',
      }),
    })

    const correlationEvent = expectEvent(events, 'aml_hit_and_wallet_drift_same_user')
    expect(correlationEvent).toMatchObject({
      category: 'correlation_alert',
      severity: 'high',
      userId: user.id,
      metadata: expect.objectContaining({
        ruleId: 'aml_hit_and_wallet_drift_same_user',
        amlHitCount: 1,
        reconciliationCount: 1,
        windowHours: 24,
      }),
    })
  })
})
