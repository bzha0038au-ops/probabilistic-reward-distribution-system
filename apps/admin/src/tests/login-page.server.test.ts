import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions } from "../routes/login/+page.server"

const makeRequest = (entries: Record<string, string>) => {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value)
  }

  return new Request("http://localhost/login", {
    method: "POST",
    body: formData,
  })
}

describe("login page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("forwards the optional break-glass code to the admin login endpoint", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        token: "admin-token",
      },
    })

    const cookies = {
      set: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
    }

    await expect(
      actions.default({
        request: makeRequest({
          email: "admin@example.com",
          password: "Password123!",
          breakGlassCode: "emergency-secret",
        }),
        cookies,
        fetch: vi.fn(),
      } as never),
    ).rejects.toMatchObject({ status: 303, location: "/admin" })

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      cookies,
      "/auth/admin/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "Password123!",
          breakGlassCode: "emergency-secret",
        }),
      },
    )
  })
})
