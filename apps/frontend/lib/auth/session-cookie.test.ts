import { describe, expect, it, vi } from 'vitest';

import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
  resolveAuthSessionCookieName,
} from '@/lib/auth/session-cookie';

describe('auth session cookie helpers', () => {
  it('prefers the cookie name found on the incoming request', () => {
    expect(
      resolveAuthSessionCookieName(
        `${SECURE_AUTH_SESSION_COOKIE_NAME}.0=abc; other=value`
      )
    ).toBe(SECURE_AUTH_SESSION_COOKIE_NAME);

    expect(
      resolveAuthSessionCookieName(`${AUTH_SESSION_COOKIE_NAME}=abc`)
    ).toBe(AUTH_SESSION_COOKIE_NAME);
  });

  it('falls back to the non-secure cookie name outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');

    expect(resolveAuthSessionCookieName(null)).toBe(AUTH_SESSION_COOKIE_NAME);
  });
});
