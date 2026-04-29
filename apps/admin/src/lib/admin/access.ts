import type { AdminSessionPayload } from "$lib/server/admin-session-core"

export const ADMIN_PERMISSION_KEYS = {
  ANALYTICS_READ: "analytics.read",
  AUDIT_EXPORT: "audit.export",
  AUDIT_READ: "audit.read",
  AUDIT_RETRY_NOTIFICATION: "audit.retry_notification",
  COMMUNITY_MODERATE: "community.moderate",
  CONFIG_READ: "config.read",
  CONFIG_RELEASE_BONUS: "config.release_bonus",
  CONFIG_UPDATE: "config.update",
  FINANCE_APPROVE_DEPOSIT: "finance.approve_deposit",
  FINANCE_APPROVE_WITHDRAWAL: "finance.approve_withdrawal",
  FINANCE_FAIL_DEPOSIT: "finance.fail_deposit",
  FINANCE_PAY_WITHDRAWAL: "finance.pay_withdrawal",
  FINANCE_READ: "finance.read",
  FINANCE_RECONCILE: "finance.reconcile",
  FINANCE_REJECT_WITHDRAWAL: "finance.reject_withdrawal",
  KYC_READ: "kyc.read",
  KYC_REVIEW: "kyc.review",
  MISSIONS_CREATE: "missions.create",
  MISSIONS_DELETE: "missions.delete",
  MISSIONS_READ: "missions.read",
  MISSIONS_UPDATE: "missions.update",
  PRIZES_CREATE: "prizes.create",
  PRIZES_DELETE: "prizes.delete",
  PRIZES_READ: "prizes.read",
  PRIZES_TOGGLE: "prizes.toggle",
  PRIZES_UPDATE: "prizes.update",
  RISK_FREEZE_USER: "risk.freeze_user",
  RISK_READ: "risk.read",
  RISK_RELEASE_USER: "risk.release_user",
  TABLES_MANAGE: "tables.manage",
  TABLES_READ: "tables.read",
} as const

type AdminAccessSession =
  | Pick<AdminSessionPayload, "permissions" | "managedScopes">
  | null
  | undefined

export type AdminScopeId =
  | "financeOps"
  | "saasOps"
  | "engineerOnCall"
  | "controlCenter"
  | "mixedAccess"
  | "restricted"

export type AdminNavItemId =
  | "config"
  | "legal"
  | "providers"
  | "prizes"
  | "changeRequests"
  | "permissions"
  | "economy"
  | "markets"
  | "finance"
  | "forum"
  | "kyc"
  | "aml"
  | "users"
  | "tables"
  | "missions"
  | "saas"
  | "reconciliation"
  | "security"
  | "audit"
  | "collusion"

export type AdminNavGroupId = "engine" | "consumer" | "business" | "security"

export type AdminNavItem = {
  id: AdminNavItemId
  href: string
  labelKey: string
}

export type AdminNavGroup = {
  id: AdminNavGroupId
  labelKey: string
  items: AdminNavItem[]
}

const CONTROL_CENTER_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.ANALYTICS_READ,
  ADMIN_PERMISSION_KEYS.CONFIG_READ,
  ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS,
  ADMIN_PERMISSION_KEYS.CONFIG_UPDATE,
  ADMIN_PERMISSION_KEYS.PRIZES_CREATE,
  ADMIN_PERMISSION_KEYS.PRIZES_DELETE,
  ADMIN_PERMISSION_KEYS.PRIZES_READ,
  ADMIN_PERMISSION_KEYS.PRIZES_TOGGLE,
  ADMIN_PERMISSION_KEYS.PRIZES_UPDATE,
] as const

const SAAS_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.CONFIG_READ,
  ADMIN_PERMISSION_KEYS.CONFIG_RELEASE_BONUS,
  ADMIN_PERMISSION_KEYS.CONFIG_UPDATE,
] as const

const FINANCE_PAGE_PERMISSIONS = [ADMIN_PERMISSION_KEYS.FINANCE_READ] as const

const FORUM_PAGE_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE,
] as const

const TABLES_PAGE_PERMISSIONS = [ADMIN_PERMISSION_KEYS.TABLES_READ] as const

const MISSIONS_PAGE_PERMISSIONS = [ADMIN_PERMISSION_KEYS.MISSIONS_READ] as const

const MARKETS_PAGE_PERMISSIONS = [ADMIN_PERMISSION_KEYS.CONFIG_READ] as const

const FINANCE_MUTATION_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_FAIL_DEPOSIT,
  ADMIN_PERMISSION_KEYS.FINANCE_APPROVE_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_REJECT_WITHDRAWAL,
  ADMIN_PERMISSION_KEYS.FINANCE_PAY_WITHDRAWAL,
] as const

const RECONCILIATION_PAGE_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.FINANCE_READ,
  ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE,
] as const

const RECONCILIATION_RUN_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE,
] as const

const SECURITY_PAGE_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.AUDIT_EXPORT,
  ADMIN_PERMISSION_KEYS.AUDIT_READ,
  ADMIN_PERMISSION_KEYS.AUDIT_RETRY_NOTIFICATION,
  ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE,
  ADMIN_PERMISSION_KEYS.KYC_READ,
  ADMIN_PERMISSION_KEYS.KYC_REVIEW,
  ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
  ADMIN_PERMISSION_KEYS.RISK_READ,
  ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
] as const

const AUDIT_PAGE_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.AUDIT_EXPORT,
  ADMIN_PERMISSION_KEYS.AUDIT_READ,
  ADMIN_PERMISSION_KEYS.AUDIT_RETRY_NOTIFICATION,
] as const

const COLLUSION_PAGE_PERMISSIONS = [
  ADMIN_PERMISSION_KEYS.COMMUNITY_MODERATE,
  ADMIN_PERMISSION_KEYS.KYC_READ,
  ADMIN_PERMISSION_KEYS.KYC_REVIEW,
  ADMIN_PERMISSION_KEYS.RISK_FREEZE_USER,
  ADMIN_PERMISSION_KEYS.RISK_READ,
  ADMIN_PERMISSION_KEYS.RISK_RELEASE_USER,
] as const

const NAV_ITEMS: Record<AdminNavItemId, AdminNavItem> = {
  config: {
    id: "config",
    href: "/config",
    labelKey: "workspace.items.config",
  },
  legal: {
    id: "legal",
    href: "/legal",
    labelKey: "workspace.items.legal",
  },
  providers: {
    id: "providers",
    href: "/providers",
    labelKey: "workspace.items.providers",
  },
  prizes: {
    id: "prizes",
    href: "/prizes",
    labelKey: "workspace.items.prizes",
  },
  changeRequests: {
    id: "changeRequests",
    href: "/change-requests",
    labelKey: "workspace.items.changeRequests",
  },
  permissions: {
    id: "permissions",
    href: "/permissions",
    labelKey: "workspace.items.permissions",
  },
  economy: {
    id: "economy",
    href: "/economy",
    labelKey: "workspace.items.economy",
  },
  markets: {
    id: "markets",
    href: "/markets",
    labelKey: "workspace.items.markets",
  },
  finance: {
    id: "finance",
    href: "/finance",
    labelKey: "workspace.items.finance",
  },
  forum: {
    id: "forum",
    href: "/forum/moderation",
    labelKey: "workspace.items.forum",
  },
  kyc: {
    id: "kyc",
    href: "/kyc",
    labelKey: "workspace.items.kyc",
  },
  aml: {
    id: "aml",
    href: "/aml",
    labelKey: "AML",
  },
  users: {
    id: "users",
    href: "/users",
    labelKey: "workspace.items.users",
  },
  tables: {
    id: "tables",
    href: "/tables",
    labelKey: "workspace.items.tables",
  },
  missions: {
    id: "missions",
    href: "/missions",
    labelKey: "workspace.items.missions",
  },
  saas: {
    id: "saas",
    href: "/saas",
    labelKey: "workspace.items.saas",
  },
  reconciliation: {
    id: "reconciliation",
    href: "/reconciliation",
    labelKey: "workspace.items.reconciliation",
  },
  security: {
    id: "security",
    href: "/security",
    labelKey: "workspace.items.security",
  },
  audit: {
    id: "audit",
    href: "/audit",
    labelKey: "workspace.items.audit",
  },
  collusion: {
    id: "collusion",
    href: "/risk/collusion",
    labelKey: "workspace.items.collusion",
  },
}

const readScopeKeys = (admin: AdminAccessSession) => {
  const explicitScopes = admin?.managedScopes?.filter(Boolean) ?? []
  if (explicitScopes.length > 0) {
    return explicitScopes
  }

  return (admin?.permissions ?? []).filter(
    (permission: string) =>
      permission === "engine:*" ||
      permission.startsWith("c:") ||
      permission.startsWith("b:"),
  )
}

const hasAnyPermission = (
  admin: AdminAccessSession,
  permissions: readonly string[],
) => {
  const grantedPermissions = new Set(admin?.permissions ?? [])
  return permissions.some((permission) => grantedPermissions.has(permission))
}

const hasScope = (admin: AdminAccessSession, scopeKey: string) =>
  new Set(readScopeKeys(admin)).has(scopeKey)

const hasScopePrefix = (admin: AdminAccessSession, prefix: string) =>
  readScopeKeys(admin).some((scopeKey: string) => scopeKey.startsWith(prefix))

export const canAccessControlCenter = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, CONTROL_CENTER_PERMISSIONS)

export const canAccessFinance = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, FINANCE_PAGE_PERMISSIONS)

export const canAccessEconomy = (admin: AdminAccessSession) =>
  canAccessFinance(admin)

export const canAccessForum = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, FORUM_PAGE_PERMISSIONS)

export const canAccessTables = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, TABLES_PAGE_PERMISSIONS)

export const canAccessMissions = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, MISSIONS_PAGE_PERMISSIONS)

export const canAccessMarkets = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, MARKETS_PAGE_PERMISSIONS)

export const canAccessSaas = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, SAAS_PERMISSIONS)

export const canAccessReconciliation = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, RECONCILIATION_PAGE_PERMISSIONS)

export const canRunReconciliation = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, RECONCILIATION_RUN_PERMISSIONS)

export const canAccessSecurity = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, SECURITY_PAGE_PERMISSIONS)

export const canAccessAudit = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, AUDIT_PAGE_PERMISSIONS)

export const canAccessCollusion = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, COLLUSION_PAGE_PERMISSIONS)

const hasFinanceMutationAccess = (admin: AdminAccessSession) =>
  hasAnyPermission(admin, FINANCE_MUTATION_PERMISSIONS)

const resolveFirstAccessibleRoute = (admin: AdminAccessSession) => {
  if (canAccessControlCenter(admin)) return NAV_ITEMS.config.href
  if (canAccessEconomy(admin)) return NAV_ITEMS.economy.href
  if (canAccessFinance(admin)) return NAV_ITEMS.finance.href
  if (canAccessForum(admin)) return NAV_ITEMS.forum.href
  if (canAccessTables(admin)) return NAV_ITEMS.tables.href
  if (canAccessMissions(admin)) return NAV_ITEMS.missions.href
  if (canAccessSaas(admin)) return NAV_ITEMS.saas.href
  if (canAccessReconciliation(admin)) return NAV_ITEMS.reconciliation.href
  if (canAccessSecurity(admin)) return NAV_ITEMS.security.href
  if (canAccessAudit(admin)) return NAV_ITEMS.audit.href
  if (canAccessCollusion(admin)) return NAV_ITEMS.collusion.href
  return "/login"
}

export const resolveAdminScope = (admin: AdminAccessSession): AdminScopeId => {
  const hasEngineScope = hasScope(admin, "engine:*")
  const hasConsumerScope = hasScopePrefix(admin, "c:")
  const hasBusinessScope = hasScopePrefix(admin, "b:")

  if (hasConsumerScope && !hasEngineScope && !hasBusinessScope) {
    return "financeOps"
  }

  if (hasBusinessScope && !hasEngineScope && !hasConsumerScope) {
    return "saasOps"
  }

  if (hasEngineScope && !hasConsumerScope && !hasBusinessScope) {
    return "engineerOnCall"
  }

  const hasControlCenterAccess = canAccessControlCenter(admin)
  const hasSaasAccess = canAccessSaas(admin)
  const hasFinanceAccess = canAccessFinance(admin)
  const hasMissionAccess = canAccessMissions(admin)
  const hasSecurityAccess = canAccessSecurity(admin)
  const hasFinanceOpsAccess = hasFinanceMutationAccess(admin)
  const hasReconciliationAccess = canAccessReconciliation(admin)
  const hasReconciliationRunAccess = canRunReconciliation(admin)

  if (
    hasFinanceOpsAccess &&
    hasFinanceAccess &&
    !hasMissionAccess &&
    !hasControlCenterAccess &&
    !hasSaasAccess &&
    !hasSecurityAccess
  ) {
    return "financeOps"
  }

  if (
    hasSaasAccess &&
    !hasFinanceAccess &&
    !hasControlCenterAccess &&
    !hasSecurityAccess
  ) {
    return "saasOps"
  }

  if (
    hasReconciliationAccess &&
    hasReconciliationRunAccess &&
    hasSecurityAccess &&
    !hasFinanceOpsAccess &&
    !hasControlCenterAccess &&
    !hasSaasAccess
  ) {
    return "engineerOnCall"
  }

  if (hasControlCenterAccess) {
    return "controlCenter"
  }

  if (resolveFirstAccessibleRoute(admin) !== "/login") {
    return "mixedAccess"
  }

  return "restricted"
}

export const resolveAdminDefaultRoute = (admin: AdminAccessSession) => {
  const scope = resolveAdminScope(admin)

  if (scope === "financeOps") return NAV_ITEMS.finance.href
  if (scope === "saasOps") return NAV_ITEMS.saas.href
  if (scope === "engineerOnCall") return NAV_ITEMS.reconciliation.href

  return resolveFirstAccessibleRoute(admin)
}

export const buildAdminNavGroups = (
  admin: AdminAccessSession,
): AdminNavGroup[] => {
  const scope = resolveAdminScope(admin)

  if (scope === "financeOps") {
    return canAccessFinance(admin)
      ? [
          {
            id: "consumer",
            labelKey: "workspace.groups.consumer",
            items: [NAV_ITEMS.finance, NAV_ITEMS.economy],
          },
        ]
      : []
  }

  if (scope === "saasOps") {
    return canAccessSaas(admin)
      ? [
          {
            id: "business",
            labelKey: "workspace.groups.business",
            items: [NAV_ITEMS.saas],
          },
        ]
      : []
  }

  if (scope === "engineerOnCall") {
    const groups: AdminNavGroup[] = []

    if (canAccessReconciliation(admin)) {
      groups.push({
        id: "engine",
        labelKey: "workspace.groups.engine",
        items: [NAV_ITEMS.reconciliation],
      })
    }

    const securityItems = [
      canAccessForum(admin) ? NAV_ITEMS.forum : null,
      canAccessSecurity(admin) ? NAV_ITEMS.kyc : null,
      canAccessSecurity(admin) ? NAV_ITEMS.users : null,
      canAccessSecurity(admin) ? NAV_ITEMS.security : null,
      canAccessAudit(admin) ? NAV_ITEMS.audit : null,
      canAccessCollusion(admin) ? NAV_ITEMS.collusion : null,
    ].filter((item): item is AdminNavItem => item !== null)

    if (securityItems.length > 0) {
      groups.push({
        id: "security",
        labelKey: "workspace.groups.security",
        items: [
          ...securityItems,
          canAccessSecurity(admin) ? NAV_ITEMS.aml : null,
        ].filter((item): item is AdminNavItem => item !== null),
      })
    }

    return groups
  }

  const groups: AdminNavGroup[] = [
    {
      id: "engine",
      labelKey: "workspace.groups.engine",
      items: [
        canAccessControlCenter(admin) ? NAV_ITEMS.config : null,
        canAccessControlCenter(admin) ? NAV_ITEMS.legal : null,
        canAccessControlCenter(admin) ? NAV_ITEMS.providers : null,
        canAccessControlCenter(admin) ? NAV_ITEMS.prizes : null,
        canAccessControlCenter(admin) ? NAV_ITEMS.changeRequests : null,
        canAccessControlCenter(admin) ? NAV_ITEMS.permissions : null,
        canAccessReconciliation(admin) ? NAV_ITEMS.reconciliation : null,
      ].filter((item): item is AdminNavItem => item !== null),
    },
    {
      id: "consumer",
      labelKey: "workspace.groups.consumer",
      items: [
        canAccessFinance(admin) ? NAV_ITEMS.finance : null,
        canAccessEconomy(admin) ? NAV_ITEMS.economy : null,
        canAccessForum(admin) ? NAV_ITEMS.forum : null,
        canAccessSecurity(admin) ? NAV_ITEMS.kyc : null,
        canAccessSecurity(admin) ? NAV_ITEMS.users : null,
        canAccessMarkets(admin) ? NAV_ITEMS.markets : null,
        canAccessTables(admin) ? NAV_ITEMS.tables : null,
        canAccessMissions(admin) ? NAV_ITEMS.missions : null,
      ].filter((item): item is AdminNavItem => item !== null),
    },
    {
      id: "business",
      labelKey: "workspace.groups.business",
      items: [canAccessSaas(admin) ? NAV_ITEMS.saas : null].filter(
        (item): item is AdminNavItem => item !== null,
      ),
    },
    {
      id: "security",
      labelKey: "workspace.groups.security",
      items: [
        canAccessSecurity(admin) ? NAV_ITEMS.kyc : null,
        canAccessSecurity(admin) ? NAV_ITEMS.users : null,
        canAccessSecurity(admin) ? NAV_ITEMS.security : null,
        canAccessSecurity(admin) ? NAV_ITEMS.aml : null,
        canAccessAudit(admin) ? NAV_ITEMS.audit : null,
        canAccessCollusion(admin) ? NAV_ITEMS.collusion : null,
      ].filter((item): item is AdminNavItem => item !== null),
    },
  ]

  return groups.filter((group) => group.items.length > 0)
}

export const canAccessAdminPath = (
  admin: AdminAccessSession,
  pathname: string,
) => {
  if (pathname === "/logout") return true
  if (pathname === "/account" || pathname.startsWith("/account/")) return false

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return true
  }

  if (pathname === "/config" || pathname.startsWith("/config/")) {
    return canAccessControlCenter(admin)
  }

  if (pathname === "/legal" || pathname.startsWith("/legal/")) {
    return canAccessControlCenter(admin)
  }

  if (pathname === "/providers" || pathname.startsWith("/providers/")) {
    return canAccessControlCenter(admin)
  }

  if (pathname === "/prizes" || pathname.startsWith("/prizes/")) {
    return canAccessControlCenter(admin)
  }

  if (
    pathname === "/change-requests" ||
    pathname.startsWith("/change-requests/")
  ) {
    return canAccessControlCenter(admin)
  }

  if (pathname === "/permissions" || pathname.startsWith("/permissions/")) {
    return canAccessControlCenter(admin)
  }

  if (pathname === "/finance" || pathname.startsWith("/finance/")) {
    return canAccessFinance(admin)
  }

  if (pathname === "/economy" || pathname.startsWith("/economy/")) {
    return canAccessEconomy(admin)
  }

  if (pathname === "/markets" || pathname.startsWith("/markets/")) {
    return canAccessMarkets(admin)
  }

  if (pathname === "/forum" || pathname.startsWith("/forum/")) {
    return canAccessForum(admin)
  }

  if (pathname === "/aml" || pathname.startsWith("/aml/")) {
    return canAccessSecurity(admin)
  }

  if (pathname === "/users" || pathname.startsWith("/users/")) {
    return canAccessSecurity(admin)
  }

  if (pathname === "/kyc" || pathname.startsWith("/kyc/")) {
    return canAccessSecurity(admin)
  }

  if (pathname === "/tables" || pathname.startsWith("/tables/")) {
    return canAccessTables(admin)
  }

  if (pathname === "/missions" || pathname.startsWith("/missions/")) {
    return canAccessMissions(admin)
  }

  if (pathname === "/saas" || pathname.startsWith("/saas/")) {
    return canAccessSaas(admin)
  }

  if (
    pathname === "/reconciliation" ||
    pathname.startsWith("/reconciliation/")
  ) {
    return canAccessReconciliation(admin)
  }

  if (pathname === "/security" || pathname.startsWith("/security/")) {
    return canAccessSecurity(admin)
  }

  if (pathname === "/kyc" || pathname.startsWith("/kyc/")) {
    return canAccessSecurity(admin)
  }

  if (pathname === "/audit" || pathname.startsWith("/audit/")) {
    return canAccessAudit(admin)
  }

  if (pathname === "/risk" || pathname.startsWith("/risk/")) {
    return canAccessCollusion(admin)
  }

  return true
}
