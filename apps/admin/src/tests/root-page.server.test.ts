import { describe, expect, it } from "vitest"

import { load } from "../routes/+page.server"

const createAdmin = (overrides: {
  permissions?: string[]
  managedScopes?: string[]
} = {}) => ({
  adminId: 1,
  userId: 2,
  email: "admin@example.com",
  role: "admin" as const,
  mfaEnabled: true,
  mfaRecoveryMode: "none" as const,
  sessionId: "session-1",
  permissions: [],
  requiresMfa: false,
  managedScopes: [],
  ...overrides,
})

describe("root page server", () => {
  it("redirects consumer finance ops into finance", async () => {
    await expect(
      load({
        locals: {
          admin: createAdmin({
            managedScopes: ["c:withdraw"],
            permissions: ["finance.read"],
          }),
        },
      } as never),
    ).rejects.toMatchObject({ status: 303, location: "/finance" })
  })

  it("redirects unauthenticated users to login", async () => {
    await expect(
      load({
        locals: {
          admin: null,
        },
      } as never),
    ).rejects.toMatchObject({ status: 303, location: "/login" })
  })
})
