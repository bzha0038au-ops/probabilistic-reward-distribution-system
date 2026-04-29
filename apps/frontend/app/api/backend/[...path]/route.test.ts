import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getBackendAccessToken } = vi.hoisted(() => ({
  getBackendAccessToken: vi.fn<() => Promise<string | null>>(
    async () => "signed-backend-token",
  ),
}));

vi.mock("@/lib/auth/server-token", () => ({
  getBackendAccessToken,
}));

import { DELETE, GET, POST } from "@/app/api/backend/[...path]/route";
import { getBackendTokenCookieName } from "@/lib/auth/backend-token-cookie";
import {
  AUTH_SESSION_COOKIE_NAME,
  SECURE_AUTH_SESSION_COOKIE_NAME,
} from "@/lib/auth/session-cookie";

const buildRouteContext = (path: string[]) => ({
  params: Promise.resolve({ path }),
});

describe("backend proxy route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getBackendAccessToken).mockResolvedValue("signed-backend-token");
  });

  it("clears frontend auth cookies when an authenticated upstream request returns 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: { message: "Unauthorized" } }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const response = await GET(
      new NextRequest("https://example.com/api/backend/wallet"),
      buildRouteContext(["wallet"]),
    );

    expect(response.status).toBe(401);
    expect(response.cookies.get(getBackendTokenCookieName())?.maxAge).toBe(0);
    expect(response.cookies.get(AUTH_SESSION_COOKIE_NAME)?.maxAge).toBe(0);
    expect(response.cookies.get(SECURE_AUTH_SESSION_COOKIE_NAME)?.maxAge).toBe(
      0,
    );
  });

  it("forwards valid whitelisted routes to the backend with the original query string", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: [{ id: 1 }] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await GET(
      new NextRequest("https://example.com/api/backend/transactions?limit=8"),
      buildRouteContext(["transactions"]),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("http://localhost:4000/transactions?limit=8"),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );
  });

  it("forwards community thread list queries for authenticated browser routes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { items: [] } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await GET(
      new NextRequest(
        "https://example.com/api/backend/community/threads?page=2&limit=12",
      ),
      buildRouteContext(["community", "threads"]),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("http://localhost:4000/community/threads?page=2&limit=12"),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );
  });

  it("forwards market position submissions for authenticated browser routes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { id: 7 } }), {
        status: 201,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await POST(
      new NextRequest("https://example.com/api/backend/markets/42/positions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          outcomeKey: "yes",
          stakeAmount: "12.50",
        }),
      }),
      buildRouteContext(["markets", "42", "positions"]),
    );

    expect(response.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("http://localhost:4000/markets/42/positions"),
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.any(Headers),
        body: expect.any(ArrayBuffer),
      }),
    );
  });

  it("forwards market sell submissions for authenticated browser routes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { id: 7 } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await POST(
      new NextRequest(
        "https://example.com/api/backend/markets/42/positions/17/sell",
        {
          method: "POST",
        },
      ),
      buildRouteContext(["markets", "42", "positions", "17", "sell"]),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("http://localhost:4000/markets/42/positions/17/sell"),
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );
  });

  it("forwards play-mode updates for authenticated browser routes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            snapshot: {
              gameKey: "holdem",
              type: "snowball",
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const response = await POST(
      new NextRequest("https://example.com/api/backend/play-modes/holdem", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "snowball",
        }),
      }),
      buildRouteContext(["play-modes", "holdem"]),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("http://localhost:4000/play-modes/holdem"),
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.any(Headers),
        body: expect.any(ArrayBuffer),
      }),
    );
  });

  it("forwards community reply submissions for authenticated browser routes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { id: 17 } }), {
        status: 202,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await POST(
      new NextRequest(
        "https://example.com/api/backend/community/threads/42/posts",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            body: "Reply body",
            captchaToken: "token-123",
          }),
        },
      ),
      buildRouteContext(["community", "threads", "42", "posts"]),
    );

    expect(response.status).toBe(202);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL("http://localhost:4000/community/threads/42/posts"),
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.any(Headers),
        body: expect.any(ArrayBuffer),
      }),
    );
  });

  it("forwards portfolio history queries for authenticated browser routes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { items: [] } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const response = await GET(
      new NextRequest(
        "https://example.com/api/backend/markets/history?status=resolved&page=2&limit=10",
      ),
      buildRouteContext(["markets", "history"]),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(
        "http://localhost:4000/markets/history?status=resolved&page=2&limit=10",
      ),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );
  });

  it("forwards device fingerprint headers to the backend", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { balance: { withdrawableBalance: "0.00" } },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const response = await GET(
      new NextRequest("https://example.com/api/backend/wallet", {
        headers: {
          "x-device-fingerprint": "browser-seed-xyz",
        },
      }),
      buildRouteContext(["wallet"]),
    );

    expect(response.status).toBe(200);
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const headers = init?.headers as Headers;
    expect(headers.get("x-device-fingerprint")).toBe("browser-seed-xyz");
  });

  it("returns 404 for backend routes that are not exposed to the browser", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET(
      new NextRequest("https://example.com/api/backend/admin/deposits"),
      buildRouteContext(["admin", "deposits"]),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { message: "Not found.", code: "NOT_FOUND" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 405 with an allow header when the route exists but the method is wrong", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new NextRequest("https://example.com/api/backend/wallet", {
        method: "POST",
      }),
      buildRouteContext(["wallet"]),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({
      ok: false,
      error: { message: "Method not allowed.", code: "METHOD_NOT_ALLOWED" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 and clears cookies when an authenticated browser route has no backend token", async () => {
    vi.mocked(getBackendAccessToken).mockResolvedValueOnce(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await DELETE(
      new NextRequest("https://example.com/api/backend/auth/user/session", {
        method: "DELETE",
      }),
      buildRouteContext(["auth", "user", "session"]),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { message: "Unauthorized", code: "UNAUTHORIZED" },
    });
    expect(response.cookies.get(getBackendTokenCookieName())?.maxAge).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
