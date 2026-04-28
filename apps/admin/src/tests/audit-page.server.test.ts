import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("$lib/server/api", () => ({
  apiRequest,
}))

import { load } from "../routes/(admin)/(engine)/audit/+page.server"

describe("audit admin page server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads admin audit list and summary with query params", async () => {
    apiRequest
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [],
          limit: 25,
          hasNext: false,
          hasPrevious: false,
          nextCursor: null,
          prevCursor: null,
          direction: "next",
          sort: "desc",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          totalCount: 3,
          byAdmin: [],
          byAction: [],
          byUser: [],
          byDay: [],
        },
      })

    const result = await load({
      fetch: vi.fn(),
      cookies: {},
      url: new URL(
        "http://localhost/audit?adminId=7&userId=88&action=freeze_create&from=2026-04-01T00:00&limit=25&sort=desc",
      ),
    } as never)

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      {},
      "/admin/admin-actions?adminId=7&userId=88&action=freeze_create&from=2026-04-01T00%3A00&limit=25&sort=desc",
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      {},
      "/admin/admin-actions/summary?adminId=7&userId=88&action=freeze_create&from=2026-04-01T00%3A00&sort=desc",
    )
    expect(result).toMatchObject({
      error: null,
      adminActions: {
        items: [],
        limit: 25,
      },
      summary: {
        totalCount: 3,
      },
    })
  })
})
