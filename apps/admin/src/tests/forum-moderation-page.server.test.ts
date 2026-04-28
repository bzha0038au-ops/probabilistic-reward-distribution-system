import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { actions, load } from "../routes/(admin)/(c)/forum/moderation/+page.server"

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

describe("forum moderation page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads the moderation overview", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: {
        queue: [],
        activeMutes: [],
      },
    })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
      url: new URL("http://localhost/forum/moderation"),
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/forum/moderation/overview",
    )
    expect(result).toMatchObject({
      error: null,
      overview: {
        queue: [],
        activeMutes: [],
      },
    })
  })

  it("validates bulk delete selection before submitting", async () => {
    const result = await actions.bulkDeletePosts({
      request: makeRequest({ reason: "" }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "Select at least one reported post and provide a reason.",
      },
    })
  })

  it("submits gameplay mute requests with step-up", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 9, userId: 42, status: "active" },
    })

    const result = await actions.muteUser({
      request: makeRequest({
        userId: "42",
        totpCode: "123456",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/forum/moderation/mutes",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: 42,
          reason: "forum_moderation",
          totpCode: "123456",
          breakGlassCode: null,
        }),
      },
    )
    expect(result).toMatchObject({
      success: true,
      message: "Gameplay mute applied.",
    })
  })

  it("submits mute release requests with step-up", async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      data: { id: 7, userId: 42, status: "released" },
    })

    const result = await actions.releaseMute({
      request: makeRequest({
        freezeRecordId: "7",
        reason: "appeal accepted",
        totpCode: "654321",
      }),
      fetch: vi.fn(),
      cookies: {},
      locals: { locale: "en" },
    } as never)

    expect(apiRequest).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      "/admin/forum/moderation/mutes/release",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freezeRecordId: 7,
          reason: "appeal accepted",
          totpCode: "654321",
          breakGlassCode: null,
        }),
      },
    )
    expect(result).toMatchObject({
      success: true,
      message: "Gameplay mute released.",
    })
  })
})
