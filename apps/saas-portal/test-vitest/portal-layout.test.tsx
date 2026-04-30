import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const portalLayoutMocks = vi.hoisted(() => ({
  requireCurrentUserSession: vi.fn(),
}));

vi.mock("@/lib/current-user-session", () => ({
  requireCurrentUserSession: portalLayoutMocks.requireCurrentUserSession,
}));

vi.mock("@/components/logout-form", () => ({
  LogoutForm: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/modules/portal/components/portal-nav", () => ({
  PortalNav: () => <nav>Portal navigation</nav>,
}));

import PortalLayout from "../app/portal/layout";

describe("app/portal/layout", () => {
  it("loads the current user session and renders the portal shell", async () => {
    portalLayoutMocks.requireCurrentUserSession.mockResolvedValue({
      user: {
        email: "operator@example.com",
      },
    });

    const element = await PortalLayout({
      children: <section>Portal content</section>,
    } as LayoutProps<"/portal">);
    const html = renderToStaticMarkup(element);

    expect(portalLayoutMocks.requireCurrentUserSession).toHaveBeenCalledWith({
      allowPendingLegal: true,
      returnTo: "/portal",
    });
    expect(html).toContain("SaaS Portal");
    expect(html).toContain("Tenant-scoped control plane");
    expect(html).toContain("operator@example.com");
    expect(html).toContain("Portal navigation");
    expect(html).toContain("Sign out");
    expect(html).toContain("Portal content");
  });
});
