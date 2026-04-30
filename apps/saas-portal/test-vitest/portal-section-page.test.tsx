import { describe, expect, it, vi } from "vitest";

const portalSectionMocks = vi.hoisted(() => {
  const notFoundError = new Error("notFound");

  return {
    notFound: vi.fn(() => {
      throw notFoundError;
    }),
    notFoundError,
    PortalRoutePage: vi.fn(() => null),
  };
});

vi.mock("next/navigation", () => ({
  notFound: portalSectionMocks.notFound,
}));

vi.mock("@/modules/portal/components/portal-route-page", () => ({
  PortalRoutePage: portalSectionMocks.PortalRoutePage,
}));

import PortalSectionPage from "../app/portal/[view]/page";

describe("app/portal/[view]/page", () => {
  it("forwards valid non-overview views into the shared portal route page", async () => {
    const params = Promise.resolve({
      view: "billing",
    });
    const searchParams = Promise.resolve({
      tenant: "44",
      billingSetup: "ready",
    });

    const element = await PortalSectionPage({
      params,
      searchParams,
    });

    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "billing",
        searchParams,
      },
    );
  });

  it("rejects overview aliases and unknown views with notFound", async () => {
    await expect(
      PortalSectionPage({
        params: Promise.resolve({
          view: "overview",
        }),
        searchParams: Promise.resolve(undefined),
      }),
    ).rejects.toBe(portalSectionMocks.notFoundError);

    await expect(
      PortalSectionPage({
        params: Promise.resolve({
          view: "unknown",
        }),
        searchParams: Promise.resolve(undefined),
      }),
    ).rejects.toBe(portalSectionMocks.notFoundError);

    expect(portalSectionMocks.notFound).toHaveBeenCalledTimes(2);
  });
});
