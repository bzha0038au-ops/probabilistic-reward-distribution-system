import { describe, expect, it, vi } from "vitest";

const portalPageMocks = vi.hoisted(() => ({
  PortalRoutePage: vi.fn(() => null),
}));

vi.mock("@/modules/portal/components/portal-route-page", () => ({
  PortalRoutePage: portalPageMocks.PortalRoutePage,
}));

import PortalPage from "../app/portal/page";

describe("app/portal/page", () => {
  it("routes the index page through the overview portal view", async () => {
    const searchParams = Promise.resolve({
      tenant: "10",
      project: "101",
    });

    const element = await PortalPage({
      searchParams,
    });

    expect((element as { props: Record<string, unknown> }).props).toMatchObject(
      {
        view: "overview",
        searchParams,
      },
    );
  });
});
