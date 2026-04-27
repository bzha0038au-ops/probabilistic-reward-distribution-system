import { describe, expect, it } from 'vitest';

import {
  ADMIN_PERMISSION_KEYS,
  CONFIG_ADMIN_PERMISSION_KEYS,
  DEFAULT_ADMIN_PERMISSION_KEYS,
  FINANCE_ADMIN_PERMISSION_KEYS,
  MFA_SENSITIVE_ADMIN_PERMISSIONS,
  PRIZES_ADMIN_PERMISSION_KEYS,
  SECURITY_ADMIN_PERMISSION_KEYS,
  STEP_UP_ADMIN_PERMISSIONS,
  adminPermissionsRequireMfa,
} from './definitions';

describe('admin permission definitions', () => {
  it('requires MFA for canonical grant bundles that include MFA-sensitive permissions', () => {
    expect(adminPermissionsRequireMfa(FINANCE_ADMIN_PERMISSION_KEYS)).toBe(true);
    expect(adminPermissionsRequireMfa(CONFIG_ADMIN_PERMISSION_KEYS)).toBe(true);
    expect(adminPermissionsRequireMfa(SECURITY_ADMIN_PERMISSION_KEYS)).toBe(true);
    expect(adminPermissionsRequireMfa(PRIZES_ADMIN_PERMISSION_KEYS)).toBe(false);
  });

  it('keeps every MFA-sensitive permission inside the step-up set', () => {
    for (const permission of MFA_SENSITIVE_ADMIN_PERMISSIONS) {
      expect(STEP_UP_ADMIN_PERMISSIONS.has(permission)).toBe(true);
    }
  });

  it('limits step-up-only permissions to risk actions', () => {
    const stepUpOnlyPermissions = [...STEP_UP_ADMIN_PERMISSIONS].filter(
      (permission) => !MFA_SENSITIVE_ADMIN_PERMISSIONS.has(permission)
    );

    expect(stepUpOnlyPermissions).toEqual([
      ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
      ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
    ]);
  });

  it('keeps risk permissions in the security bundle without marking them MFA-sensitive on their own', () => {
    expect(SECURITY_ADMIN_PERMISSION_KEYS).toEqual(
      expect.arrayContaining([
        ADMIN_PERMISSION_KEYS.AUDIT_RETRY_NOTIFICATION,
        ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
        ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
      ])
    );
    expect(adminPermissionsRequireMfa([ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER])).toBe(false);
  });

  it('defines a full-access bundle with every canonical permission exactly once', () => {
    const allPermissionKeys = Object.values(ADMIN_PERMISSION_KEYS);

    expect(DEFAULT_ADMIN_PERMISSION_KEYS).toHaveLength(allPermissionKeys.length);
    expect(DEFAULT_ADMIN_PERMISSION_KEYS).toEqual(expect.arrayContaining(allPermissionKeys));
  });
});
