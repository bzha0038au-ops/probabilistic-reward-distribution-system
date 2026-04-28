import { describe, expect, it } from "vitest"

import {
  buildAdminNavGroups,
  canAccessAdminPath,
  resolveAdminDefaultRoute,
  resolveAdminScope,
} from "$lib/admin/access"

const createAdmin = (
  overrides: {
    permissions?: string[]
    managedScopes?: string[]
  } = {},
) => ({
  permissions: [],
  managedScopes: [],
  ...overrides,
})

describe("admin access helpers", () => {
  it("routes consumer finance operators into finance by managed scope", () => {
    const admin = createAdmin({
      managedScopes: ["c:withdraw"],
      permissions: ["finance.read", "finance.approve_withdrawal"],
    })

    expect(resolveAdminScope(admin)).toBe("financeOps")
    expect(resolveAdminDefaultRoute(admin)).toBe("/finance")
    expect(buildAdminNavGroups(admin)).toEqual([
      {
        id: "consumer",
        labelKey: "workspace.groups.consumer",
        items: [
          {
            id: "finance",
            href: "/finance",
            labelKey: "workspace.items.finance",
          },
        ],
      },
    ])
  })

  it("routes business operators into the saas workspace", () => {
    const admin = createAdmin({
      managedScopes: ["b:billing"],
      permissions: ["config.read"],
    })

    expect(resolveAdminScope(admin)).toBe("saasOps")
    expect(resolveAdminDefaultRoute(admin)).toBe("/saas")
  })

  it("routes engine on-call admins into reconciliation and security", () => {
    const admin = createAdmin({
      managedScopes: ["engine:*"],
      permissions: [
        "finance.read",
        "finance.reconcile",
        "audit.read",
        "risk.read",
      ],
    })

    expect(resolveAdminScope(admin)).toBe("engineerOnCall")
    expect(resolveAdminDefaultRoute(admin)).toBe("/reconciliation")
    expect(buildAdminNavGroups(admin)).toEqual([
      {
        id: "engine",
        labelKey: "workspace.groups.engine",
        items: [
          {
            id: "reconciliation",
            href: "/reconciliation",
            labelKey: "workspace.items.reconciliation",
          },
        ],
      },
      {
        id: "security",
        labelKey: "workspace.groups.security",
        items: [
          {
            id: "kyc",
            href: "/kyc",
            labelKey: "workspace.items.kyc",
          },
          {
            id: "users",
            href: "/users",
            labelKey: "workspace.items.users",
          },
          {
            id: "security",
            href: "/security",
            labelKey: "workspace.items.security",
          },
          {
            id: "audit",
            href: "/audit",
            labelKey: "workspace.items.audit",
          },
          {
            id: "collusion",
            href: "/risk/collusion",
            labelKey: "workspace.items.collusion",
          },
          {
            id: "aml",
            href: "/aml",
            labelKey: "AML",
          },
        ],
      },
    ])
  })

  it("falls back to config for broader control-center access", () => {
    const admin = createAdmin({
      permissions: ["analytics.read", "prizes.read"],
    })

    expect(resolveAdminScope(admin)).toBe("controlCenter")
    expect(resolveAdminDefaultRoute(admin)).toBe("/config")
  })

  it("grants the markets page to admins with config.read and exposes it in nav", () => {
    const admin = createAdmin({
      permissions: ["config.read"],
    })

    expect(canAccessAdminPath(admin, "/markets")).toBe(true)
    expect(buildAdminNavGroups(admin)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "consumer",
          items: expect.arrayContaining([
            expect.objectContaining({
              id: "markets",
              href: "/markets",
              labelKey: "workspace.items.markets",
            }),
          ]),
        }),
      ]),
    )
  })
})
