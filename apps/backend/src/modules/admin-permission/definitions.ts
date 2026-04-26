export const ADMIN_PERMISSION_KEYS = {
  ANALYTICS_READ: 'analytics.read',
  AUDIT_EXPORT: 'audit.export',
  AUDIT_READ: 'audit.read',
  CONFIG_READ: 'config.read',
  CONFIG_RELEASE_BONUS: 'config.release_bonus',
  CONFIG_UPDATE: 'config.update',
  FINANCE_APPROVE_DEPOSIT: 'finance.approve_deposit',
  FINANCE_APPROVE_WITHDRAWAL: 'finance.approve_withdrawal',
  FINANCE_FAIL_DEPOSIT: 'finance.fail_deposit',
  FINANCE_PAY_WITHDRAWAL: 'finance.pay_withdrawal',
  FINANCE_READ: 'finance.read',
  FINANCE_REJECT_WITHDRAWAL: 'finance.reject_withdrawal',
  PRIZES_CREATE: 'prizes.create',
  PRIZES_DELETE: 'prizes.delete',
  PRIZES_READ: 'prizes.read',
  PRIZES_TOGGLE: 'prizes.toggle',
  PRIZES_UPDATE: 'prizes.update',
  RISK_FREEZE_USER: 'risk.freeze_user',
  RISK_READ: 'risk.read',
  RISK_RELEASE_USER: 'risk.release_user',
} as const;

export type AdminPermissionKey =
  (typeof ADMIN_PERMISSION_KEYS)[keyof typeof ADMIN_PERMISSION_KEYS];

export const LEGACY_ADMIN_PERMISSION_GRANTS = {
  'config.manage': [
    ADMIN_PERMISSION_KEYS.ANALYTICS_READ,
    ADMIN_PERMISSION_KEYS.CONFIG_READ,
    ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS,
    ADMIN_PERMISSION_KEYS.CONFIG_UPDATE,
  ],
  'finance.manage': [
    ADMIN_PERMISSION_KEYS.FINANCE_READ,
    ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT,
    ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT,
    ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
    ADMIN_PERMISSION_KEYS.FINANCE_REJECT_WITHDRAWAL,
    ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL,
  ],
  'prizes.manage': [
    ADMIN_PERMISSION_KEYS.ANALYTICS_READ,
    ADMIN_PERMISSION_KEYS.PRIZES_READ,
    ADMIN_PERMISSION_KEYS.PRIZES_CREATE,
    ADMIN_PERMISSION_KEYS.PRIZES_UPDATE,
    ADMIN_PERMISSION_KEYS.PRIZES_TOGGLE,
    ADMIN_PERMISSION_KEYS.PRIZES_DELETE,
  ],
  'security.manage': [
    ADMIN_PERMISSION_KEYS.AUDIT_READ,
    ADMIN_PERMISSION_KEYS.AUDIT_EXPORT,
    ADMIN_PERMISSION_KEYS.RISK_READ,
    ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
    ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
  ],
} as const satisfies Record<string, readonly AdminPermissionKey[]>;

export const STEP_UP_ADMIN_PERMISSIONS = new Set<AdminPermissionKey>([
  ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS,
  ADMIN_PERMISSION_KEYS.CONFIG_UPDATE,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_REJECT_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
  ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
]);

export const MFA_SENSITIVE_ADMIN_PERMISSIONS = new Set<AdminPermissionKey>([
  ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS,
  ADMIN_PERMISSION_KEYS.CONFIG_UPDATE,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_REJECT_WITHDRAWAL,
]);

export const expandAdminPermissions = (permissionKeys: Iterable<string>) => {
  const expanded = new Set<string>();

  for (const permissionKey of permissionKeys) {
    expanded.add(permissionKey);

    const mapped = LEGACY_ADMIN_PERMISSION_GRANTS[
      permissionKey as keyof typeof LEGACY_ADMIN_PERMISSION_GRANTS
    ];
    if (!mapped) continue;

    for (const granted of mapped) {
      expanded.add(granted);
    }
  }

  return [...expanded];
};

export const hasAdminPermission = (
  permissionKeys: Iterable<string>,
  requiredPermission: AdminPermissionKey
) => expandAdminPermissions(permissionKeys).includes(requiredPermission);

export const adminPermissionsRequireMfa = (permissionKeys: Iterable<string>) => {
  for (const permissionKey of expandAdminPermissions(permissionKeys)) {
    if (MFA_SENSITIVE_ADMIN_PERMISSIONS.has(permissionKey as AdminPermissionKey)) {
      return true;
    }
  }

  return false;
};
