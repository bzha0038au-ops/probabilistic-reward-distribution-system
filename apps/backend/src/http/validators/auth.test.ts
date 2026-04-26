import { describe, expect, it } from 'vitest';

import { validateAuth } from './auth';

describe('validateAuth', () => {
  it('accepts the admin login payload when a totpCode is present', () => {
    const result = validateAuth({
      email: 'admin@example.com',
      password: 'Password123!',
      totpCode: '123456',
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an explicitly empty totpCode', () => {
    const result = validateAuth({
      email: 'admin@example.com',
      password: 'Password123!',
      totpCode: '',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).not.toEqual([]);
  });
});
