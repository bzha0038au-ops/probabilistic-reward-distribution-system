import {
  ADMIN_SESSION_COOKIE,
  authNotificationCaptures,
  buildAdminCookieHeaders,
  describeIntegrationSuite,
  extractTokenFromUrl,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  loginAdmin,
  loginUser,
  registerUser,
  seedAdminAccount,
} from './integration-test-support';
import { and, asc, desc, eq } from '@reward/database/orm';
import { expect, vi } from 'vitest';
import {
  adminActions,
  admins,
  authEvents,
  authSessions,
  authTokens,
  users,
  userWallets,
} from '@reward/database';

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
      },
    });

    expect(firstResponse.statusCode).toBe(503);
    expect(firstResponse.json().error.code).toBe('AUTH_NOTIFICATION_ENQUEUE_FAILED');
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
