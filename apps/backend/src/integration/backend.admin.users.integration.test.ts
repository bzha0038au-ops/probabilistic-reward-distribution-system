import {
  authNotificationCaptures,
  buildAdminCookieHeaders,
  describeIntegrationSuite,
  enrollAdminMfa,
  expect,
  getApp,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  loginUser,
  registerUser,
  SECURITY_ADMIN_PERMISSION_KEYS,
  seedAdminAccount,
} from './integration-test-support';
import {
  adminActions,
  authSessions,
  authTokens,
  freezeRecords,
  userWallets,
  users,
} from '@reward/database';
import { and, desc, eq } from '@reward/database/orm';

describeIntegrationSuite('backend admin users integration', () => {
  it('searches users, loads detail, and manages scoped freeze, logout, and password reset actions', async () => {
    const adminEmail = 'admin-users-operator@example.com';
    const userEmail = 'admin-users-target@example.com';
    const userPassword = 'secret-123';
    const phone = '+15551234567';
    const now = new Date();

    const { admin, password } = await seedAdminAccount({ email: adminEmail });
    await grantAdminPermissions(admin.id, SECURITY_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({
      email: adminEmail,
      password,
    });

    const user = await registerUser(userEmail, userPassword);
    await getDb()
      .update(users)
      .set({
        phone,
        emailVerifiedAt: now,
        phoneVerifiedAt: now,
      })
      .where(eq(users.id, user.id));
    await getDb()
      .update(userWallets)
      .set({
        withdrawableBalance: '8.00',
        bonusBalance: '4.00',
        lockedBalance: '1.00',
        wageredAmount: '20.00',
      })
      .where(eq(userWallets.userId, user.id));

    const userSession = await loginUser(userEmail, userPassword);
    const headers = buildAdminCookieHeaders(adminSession.token);

    const freezeResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/users/${user.id}/freeze`,
      headers,
      payload: {
        category: 'support',
        reason: 'manual_admin',
        scope: 'gameplay_lock',
        totpCode: adminSession.totpCode,
      },
    });

    expect(freezeResponse.statusCode).toBe(201);
    const freezeRecord = freezeResponse.json().data as {
      id: number;
      category: string;
      reason: string;
      scope: string;
      status: string;
    };
    expect(freezeRecord).toMatchObject({
      category: 'support',
      reason: 'manual_admin',
      scope: 'gameplay_lock',
      status: 'active',
    });

    const searchResponse = await getApp().inject({
      method: 'GET',
      url: `/admin/users?query=${encodeURIComponent(userEmail)}`,
      headers,
    });

    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().data).toMatchObject({
      query: userEmail,
      items: [
        expect.objectContaining({
          id: user.id,
          email: userEmail,
          phone,
          kycTier: 'tier_2',
          activeScopes: ['gameplay_lock'],
        }),
      ],
    });

    const detailResponse = await getApp().inject({
      method: 'GET',
      url: `/admin/users/${user.id}`,
      headers,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().data).toMatchObject({
      user: expect.objectContaining({
        id: user.id,
        email: userEmail,
        phone,
        kycTier: 'tier_2',
        activeScopes: ['gameplay_lock'],
      }),
      wallet: expect.objectContaining({
        withdrawableBalance: '8.00',
        bonusBalance: '4.00',
        lockedBalance: '1.00',
        wageredAmount: '20.00',
      }),
      freezes: [
        expect.objectContaining({
          id: freezeRecord.id,
          category: 'support',
          reason: 'manual_admin',
          scope: 'gameplay_lock',
          status: 'active',
        }),
      ],
      recentLoginIps: [
        expect.objectContaining({
          eventType: 'user_login_success',
        }),
      ],
    });

    const reclassifyResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/users/${user.id}/freeze`,
      headers,
      payload: {
        category: 'community',
        reason: 'forum_moderation',
        scope: 'gameplay_lock',
        totpCode: adminSession.totpCode,
      },
    });

    expect(reclassifyResponse.statusCode).toBe(201);
    expect(reclassifyResponse.json().data).toMatchObject({
      id: freezeRecord.id,
      category: 'community',
      reason: 'forum_moderation',
      scope: 'gameplay_lock',
      status: 'active',
    });

    const activeScopeRecords = await getDb()
      .select({
        id: freezeRecords.id,
        category: freezeRecords.category,
        reason: freezeRecords.reason,
        status: freezeRecords.status,
      })
      .from(freezeRecords)
      .where(
        and(
          eq(freezeRecords.userId, user.id),
          eq(freezeRecords.scope, 'gameplay_lock'),
          eq(freezeRecords.status, 'active')
        )
      );

    expect(activeScopeRecords).toEqual([
      expect.objectContaining({
        id: freezeRecord.id,
        category: 'community',
        reason: 'forum_moderation',
        status: 'active',
      }),
    ]);

    const unfreezeResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/users/${user.id}/unfreeze`,
      headers,
      payload: {
        scope: 'gameplay_lock',
        reason: 'review complete',
        totpCode: adminSession.totpCode,
      },
    });

    expect(unfreezeResponse.statusCode).toBe(200);
    expect(unfreezeResponse.json().data).toMatchObject({
      id: freezeRecord.id,
      status: 'released',
      scope: 'gameplay_lock',
    });

    const forceLogoutResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/users/${user.id}/force-logout`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
      },
    });

    expect(forceLogoutResponse.statusCode).toBe(200);
    expect(forceLogoutResponse.json().data).toMatchObject({
      userId: user.id,
      revokedCount: 1,
    });

    const walletAfterLogout = await getApp().inject({
      method: 'GET',
      url: '/wallet',
      headers: {
        authorization: `Bearer ${userSession.token}`,
      },
    });
    expect(walletAfterLogout.statusCode).toBe(401);

    const resetPasswordResponse = await getApp().inject({
      method: 'POST',
      url: `/admin/users/${user.id}/reset-password`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
      },
    });

    expect(resetPasswordResponse.statusCode).toBe(200);
    expect(resetPasswordResponse.json().data).toMatchObject({
      userId: user.id,
      email: userEmail,
    });

    expect(authNotificationCaptures.passwordReset).toHaveLength(1);
    expect(authNotificationCaptures.passwordReset[0]).toMatchObject({
      email: userEmail,
      resetUrl: expect.stringContaining('/reset-password?token='),
    });

    const [passwordResetToken] = await getDb()
      .select({
        userId: authTokens.userId,
        tokenType: authTokens.tokenType,
        consumedAt: authTokens.consumedAt,
      })
      .from(authTokens)
      .where(eq(authTokens.userId, user.id))
      .orderBy(desc(authTokens.id))
      .limit(1);

    expect(passwordResetToken).toMatchObject({
      userId: user.id,
      tokenType: 'password_reset',
      consumedAt: null,
    });

    const [revokedSession] = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(desc(authSessions.id))
      .limit(1);

    expect(revokedSession).toMatchObject({
      status: 'revoked',
      revokedReason: 'admin_logout',
    });

    const auditActions = await getDb()
      .select({
        action: adminActions.action,
      })
      .from(adminActions)
      .where(eq(adminActions.adminId, admin.id))
      .orderBy(desc(adminActions.id));

    expect(auditActions.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'user_scope_freeze',
        'user_scope_unfreeze',
        'user_force_logout',
        'user_password_reset_requested',
      ])
    );
  });
});
