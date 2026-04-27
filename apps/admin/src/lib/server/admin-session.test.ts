import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
  env: new Proxy(
    {},
    {
      get: (_, property) => process.env[String(property)],
    }
  ),
}));

import { verifyAdminSessionToken } from './admin-session';

const encoder = new TextEncoder();

const createAdminToken = async (secret: string) =>
  new SignJWT({
    adminId: 9,
    userId: 9,
    email: 'admin@example.com',
    role: 'admin',
    mfaEnabled: true,
    mfaRecoveryMode: 'none',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('9')
    .setJti('admin-session-9')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(encoder.encode(secret));

describe('verifyAdminSessionToken', () => {
  beforeEach(() => {
    process.env.ADMIN_JWT_SECRET = 'admin-secret-current-1234567890';
    delete process.env.ADMIN_JWT_SECRET_PREVIOUS;
  });

  afterEach(() => {
    delete process.env.ADMIN_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET_PREVIOUS;
  });

  it('accepts tokens signed with the previous admin secret during rotation', async () => {
    process.env.ADMIN_JWT_SECRET_PREVIOUS = 'admin-secret-previous-1234567890';

    const session = await verifyAdminSessionToken(
      await createAdminToken(process.env.ADMIN_JWT_SECRET_PREVIOUS)
    );

    expect(session).toMatchObject({
      adminId: 9,
      userId: 9,
      email: 'admin@example.com',
      role: 'admin',
      mfaEnabled: true,
      mfaRecoveryMode: 'none',
      sessionId: 'admin-session-9',
    });
  });
});
