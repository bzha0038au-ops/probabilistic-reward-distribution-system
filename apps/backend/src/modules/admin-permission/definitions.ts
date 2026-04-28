export const ADMIN_PERMISSION_KEYS = {
  ANALYTICS_READ: 'analytics.read',
  AUDIT_EXPORT: 'audit.export',
  AUDIT_READ: 'audit.read',
  AUDIT_RETRY_NOTIFICATION: 'audit.retry_notification',
  COMMUNITY_MODERATE: 'community.moderate',
  CONFIG_READ: 'config.read',
  CONFIG_RELEASE_BONUS: 'config.release_bonus',
  CONFIG_UPDATE: 'config.update',
  FINANCE_APPROVE_DEPOSIT: 'finance.approve_deposit',
  FINANCE_APPROVE_WITHDRAWAL: 'finance.approve_withdrawal',
  FINANCE_FAIL_DEPOSIT: 'finance.fail_deposit',
  FINANCE_PAY_WITHDRAWAL: 'finance.pay_withdrawal',
  FINANCE_READ: 'finance.read',
  FINANCE_RECONCILE: 'finance.reconcile',
  FINANCE_REJECT_WITHDRAWAL: 'finance.reject_withdrawal',
  KYC_READ: 'kyc.read',
  KYC_REVIEW: 'kyc.review',
  MISSIONS_CREATE: 'missions.create',
  MISSIONS_DELETE: 'missions.delete',
  MISSIONS_READ: 'missions.read',
  MISSIONS_UPDATE: 'missions.update',
  PRIZES_CREATE: 'prizes.create',
  PRIZES_DELETE: 'prizes.delete',
  PRIZES_READ: 'prizes.read',
  PRIZES_TOGGLE: 'prizes.toggle',
  PRIZES_UPDATE: 'prizes.update',
  RISK_FREEZE_USER: 'risk.freeze_user',
  RISK_READ: 'risk.read',
  RISK_RELEASE_USER: 'risk.release_user',
  TABLES_MANAGE: 'tables.manage',
  TABLES_READ: 'tables.read',
} as const;

export type AdminPermissionKey =
  (typeof ADMIN_PERMISSION_KEYS)[keyof typeof ADMIN_PERMISSION_KEYS];

export const MANAGED_ADMIN_SCOPE_DEFINITIONS = [
  {
    key: 'engine:*',
    group: 'engine',
    label: 'Engine full access',
    description:
      'Union scope for engine operations that span consumer and business workflows.',
  },
  {
    key: 'c:withdraw',
    group: 'consumer',
    label: 'Consumer withdraw',
    description:
      'Allows manual handling of consumer withdrawals and related operator flows.',
  },
  {
    key: 'c:kyc',
    group: 'consumer',
    label: 'Consumer KYC',
    description:
      'Allows identity-review and KYC escalation work for consumer accounts.',
  },
  {
    key: 'c:freeze',
    group: 'consumer',
    label: 'Consumer freeze',
    description:
      'Allows account lock and release decisions for consumer-side risk incidents.',
  },
  {
    key: 'b:tenant',
    group: 'business',
    label: 'Business tenant',
    description:
      'Allows tenant-level engine administration for B-side customers.',
  },
  {
    key: 'b:project',
    group: 'business',
    label: 'Business project',
    description:
      'Allows project lifecycle changes such as environment, limits, and routing.',
  },
  {
    key: 'b:key',
    group: 'business',
    label: 'Business API key',
    description:
      'Allows issuing, rotating, and revoking B-side project API keys.',
  },
  {
    key: 'b:billing',
    group: 'business',
    label: 'Business billing',
    description:
      'Allows billing account, top-up, and settlement supervision for B-side tenants.',
  },
] as const;

export type ManagedAdminScopeDefinition =
  (typeof MANAGED_ADMIN_SCOPE_DEFINITIONS)[number];

export type ManagedAdminScopeKey = ManagedAdminScopeDefinition['key'];

export const MANAGED_ADMIN_SCOPE_KEYS = MANAGED_ADMIN_SCOPE_DEFINITIONS.map(
  (scope) => scope.key
) as readonly ManagedAdminScopeKey[];

const MANAGED_ADMIN_SCOPE_KEY_SET = new Set<string>(MANAGED_ADMIN_SCOPE_KEYS);

export const isManagedAdminScopeKey = (
  permissionKey: string
): permissionKey is ManagedAdminScopeKey =>
  MANAGED_ADMIN_SCOPE_KEY_SET.has(permissionKey);

export const CONFIG_ADMIN_PERMISSION_KEYS = [
  ADMIN_PERMISSION_KEYS.ANALYTICS_READ,
  ADMIN_PERMISSION_KEYS.CONFIG_READ,
  ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS,
  ADMIN_PERMISSION_KEYS.CONFIG_UPDATE,
] as const satisfies readonly AdminPermissionKey[];

export const FINANCE_ADMIN_PERMISSION_KEYS = [
  ADMIN_PERMISSION_KEYS.FINANCE_READ,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_REJECT_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE,
] as const satisfies readonly AdminPermissionKey[];

export const PRIZES_ADMIN_PERMISSION_KEYS = [
  ADMIN_PERMISSION_KEYS.ANALYTICS_READ,
  ADMIN_PERMISSION_KEYS.PRIZES_READ,
  ADMIN_PERMISSION_KEYS.PRIZES_CREATE,
  ADMIN_PERMISSION_KEYS.PRIZES_UPDATE,
  ADMIN_PERMISSION_KEYS.PRIZES_TOGGLE,
  ADMIN_PERMISSION_KEYS.PRIZES_DELETE,
] as const satisfies readonly AdminPermissionKey[];

export const MISSIONS_ADMIN_PERMISSION_KEYS = [
  ADMIN_PERMISSION_KEYS.ANALYTICS_READ,
  ADMIN_PERMISSION_KEYS.MISSIONS_READ,
  ADMIN_PERMISSION_KEYS.MISSIONS_CREATE,
  ADMIN_PERMISSION_KEYS.MISSIONS_UPDATE,
  ADMIN_PERMISSION_KEYS.MISSIONS_DELETE,
] as const satisfies readonly AdminPermissionKey[];

export const SECURITY_ADMIN_PERMISSION_KEYS = [
  ADMIN_PERMISSION_KEYS.AUDIT_READ,
  ADMIN_PERMISSION_KEYS.AUDIT_EXPORT,
  ADMIN_PERMISSION_KEYS.AUDIT_RETRY_NOTIFICATION,
  ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE,
  ADMIN_PERMISSION_KEYS.KYC_READ,
  ADMIN_PERMISSION_KEYS.KYC_REVIEW,
  ADMIN_PERMISSION_KEYS.RISK_READ,
  ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
  ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
  ADMIN_PERMISSION_KEYS.TABLES_READ,
  ADMIN_PERMISSION_KEYS.TABLES_MANAGE,
] as const satisfies readonly AdminPermissionKey[];

export const DEFAULT_ADMIN_PERMISSION_KEYS = [
  ...new Set<AdminPermissionKey>([
    ...PRIZES_ADMIN_PERMISSION_KEYS,
    ...MISSIONS_ADMIN_PERMISSION_KEYS,
    ...FINANCE_ADMIN_PERMISSION_KEYS,
    ...SECURITY_ADMIN_PERMISSION_KEYS,
    ...CONFIG_ADMIN_PERMISSION_KEYS,
  ]),
] as const satisfies readonly AdminPermissionKey[];

const MFA_SENSITIVE_ADMIN_PERMISSION_KEYS = [
  ADMIN_PERMISSION_KEYS.AUDIT_RETRY_NOTIFICATION,
  ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS,
  ADMIN_PERMISSION_KEYS.CONFIG_UPDATE,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE,
  ADMIN_PERMISSION_KEYS.FINANCE_REJECT_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.KYC_REVIEW,
] as const satisfies readonly AdminPermissionKey[];

const STEP_UP_ONLY_ADMIN_PERMISSION_KEYS = [
  ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
  ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
  ADMIN_PERMISSION_KEYS.TABLES_MANAGE,
] as const satisfies readonly AdminPermissionKey[];

export const MFA_SENSITIVE_ADMIN_PERMISSIONS = new Set<AdminPermissionKey>(
  MFA_SENSITIVE_ADMIN_PERMISSION_KEYS
);

export const STEP_UP_ADMIN_PERMISSIONS = new Set<AdminPermissionKey>([
  ...MFA_SENSITIVE_ADMIN_PERMISSION_KEYS,
  ...STEP_UP_ONLY_ADMIN_PERMISSION_KEYS,
]);

export const hasAdminPermission = (
  permissionKeys: Iterable<string>,
  requiredPermission: AdminPermissionKey
) => new Set(permissionKeys).has(requiredPermission);

export const adminPermissionsRequireMfa = (permissionKeys: Iterable<string>) => {
  const grantedPermissions = new Set(permissionKeys);

  for (const permissionKey of MFA_SENSITIVE_ADMIN_PERMISSIONS) {
    if (grantedPermissions.has(permissionKey)) {
      return true;
    }
  }

  return false;
};
