import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/(engine)/permissions/+page.server"

const makeRequest = (entries: Record<string, string | string[]> = {}) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(key, item)
      }
      continue
    }
    formData.set(key, value)
  }

  return new Request("http://localhost/actions", {
    method: "POST",
    body: formData,
  })
}

describe("permissions page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads admin scope assignments and defaults selection to the first admin", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        admins: [
          {
            adminId: 7,
            userId: 17,
            email: "ops@example.com",
            displayName: "Ops",
            isActive: true,
            mfaEnabled: true,
            managedScopes: ["engine:*"],
            legacyPermissions: ["config.read"],
          },
        ],
        scopePool: [
          {
            key: "engine:*",
            group: "engine",
            label: "Engine full access",
            description: "Union scope.",
          },
        ],
      },
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: {
        admin: {
          adminId: 1,
          userId: 2,
          email: "viewer@example.com",
          role: "admin",
          mfaEnabled: true,
          mfaRecoveryMode: "none",
          sessionId: "session-1",
          permissions: ["config.read"],
          requiresMfa: false,
        },
      },
      url: new URL("http://localhost/permissions"),
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/engine/permissions",
    )
    expect(result).toMatchObject({
      error: null,
      selectedAdminId: 7,
      admins: [
        expect.objectContaining({
          adminId: 7,
          managedScopes: ["engine:*"],
        }),
      ],
    })
  })

  it("submits the selected scopes with confirmation text and MFA code", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        admin: {
          adminId: 7,
          userId: 17,
          email: "ops@example.com",
          displayName: "Ops",
          isActive: true,
          mfaEnabled: true,
          managedScopes: ["engine:*", "b:billing"],
          legacyPermissions: ["config.read"],
        },
        addedScopes: ["b:billing"],
        removedScopes: [],
      },
    })

    const result = await actions.save({
      request: makeRequest({
        adminId: "7",
        confirmationText: "APPLY ENGINE SCOPES 7",
        totpCode: "123456",
        scopeKeys: ["engine:*", "b:billing"],
      }),
      fetch: vi.fn(),
      cookies: {},
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/engine/permissions/7",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeKeys: ["engine:*", "b:billing"],
          confirmationText: "APPLY ENGINE SCOPES 7",
          totpCode: "123456",
        }),
      },
    )
    expect(result).toMatchObject({
      success: true,
      selectedAdminId: 7,
      scopeUpdate: {
        addedScopes: ["b:billing"],
      },
    })
  })
})
