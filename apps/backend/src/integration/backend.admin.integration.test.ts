import {
  ADMIN_SESSION_COOKIE,
  buildAdminCookieHeaders,
  CONFIG_ADMIN_PERMISSION_KEYS,
  describeIntegrationSuite,
  enrollAdminMfa,
  getApp,
  getDb,
  getRiskModule,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  loginUser,
  registerUser,
  SECURITY_ADMIN_PERMISSION_KEYS,
  seedAdminAccount,
  seedUserWithWallet,
} from './integration-test-support';
import { and, asc, desc, eq } from '@reward/database/orm';
import { expect } from 'vitest';
import { adminActions, freezeRecords } from '@reward/database';

describeIntegrationSuite('backend admin integration', () => {
  it('freeze FSM keeps a single active record and allows re-freeze after release', async () => {
    const user = await seedUserWithWallet({
      email: 'freeze-fsm@example.com',
    });

    const first = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'manual_review',
    });
    expect(first?.id).toBeTruthy();

    const duplicate = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'ignored',
    });
    expect(duplicate?.id).toBe(first?.id);

    const released = await getRiskModule().releaseUserFreeze({ userId: user.id });
    expect(released?.status).toBe('released');
    expect(released?.releasedAt).toBeTruthy();

    const releasedAgain = await getRiskModule().releaseUserFreeze({ userId: user.id });
    expect(releasedAgain).toBeNull();

    const recreated = await getRiskModule().ensureUserFreeze({
      userId: user.id,
      reason: 'manual_review_again',
    });
    expect(recreated?.id).toBeTruthy();
    expect(recreated?.id).not.toBe(first?.id);

    const records = await getDb()
      .select({
        id: freezeRecords.id,
        status: freezeRecords.status,
        reason: freezeRecords.reason,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.userId, user.id))
      .orderBy(asc(freezeRecords.id));

    expect(records).toEqual([
      {
        id: first?.id ?? 0,
        status: 'released',
        reason: 'manual_review',
      },
      {
        id: recreated?.id ?? 0,
        status: 'active',
        reason: 'manual_review_again',
      },
    ]);
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
      ...buildAdminCookieHeaders(adminSession.token),
      'user-agent': auditUserAgent,
    };

    const freezeResponse = await getApp().inject({
      method: 'POST',
      url: '/admin/freeze-records',
      headers,
      payload: {
        userId: user.id,
        reason: 'manual_review',
        totpCode: adminSession.totpCode,
      },
    });
    expect(freezeResponse.statusCode).toBe(201);

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
      url: `/admin/freeze-records/${user.id}/release`,
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
      reason: 'manual_review',
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
      previousReason: 'manual_review',
      reason: 'review_cleared',
      stepUpVerified: true,
      stepUpMethod: 'totp',
      stepUpVerifiedAt: expect.any(String),
    });
  });

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
        reason: 'integration-test',
      },
    });
    expect(createDraftResponse.statusCode).toBe(201);
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
      ]),
    });
  });
});
