import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nextNavigationMocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: nextNavigationMocks.usePathname,
  useSearchParams: nextNavigationMocks.useSearchParams,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PortalNav } from "@/modules/portal/components/portal-nav";

describe("PortalNav", () => {
  it("builds scoped section links from pathname and search params", () => {
    nextNavigationMocks.usePathname.mockReturnValue("/portal/keys");
    nextNavigationMocks.useSearchParams.mockReturnValue(
      new URLSearchParams(
        "tenant=10&project=101&invite=invite-1&billingSetup=ready",
      ),
    );

    const html = renderToStaticMarkup(<PortalNav />);

    expect(html).toContain(
      'href="/portal?tenant=10&amp;project=101&amp;invite=invite-1&amp;billingSetup=ready"',
    );
    expect(html).toContain(
      'href="/portal/keys?tenant=10&amp;project=101&amp;invite=invite-1&amp;billingSetup=ready"',
    );
    expect(html).toContain("API keys");
    expect(html).toContain("bg-slate-950 text-white");
  });
});
