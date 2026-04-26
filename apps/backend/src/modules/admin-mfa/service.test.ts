import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({
  db: {},
}));

import {
  generateTotpCode,
  normalizeTotpCode,
  verifyTotpCode,
} from './service';

describe('admin MFA TOTP helpers', () => {
  it('normalizes a 6-digit code', () => {
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('abc')).toBeNull();
  });

  it('generates and verifies a TOTP code for the same time slice', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = Date.UTC(2026, 3, 26, 10, 0, 0);

    const code = generateTotpCode(secret, now);

    expect(code).toHaveLength(6);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
  });

  it('rejects a code outside the allowed drift window', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = Date.UTC(2026, 3, 26, 10, 0, 0);
    const code = generateTotpCode(secret, now);

    expect(verifyTotpCode(secret, code, now + 90_000)).toBe(false);
  });
});
