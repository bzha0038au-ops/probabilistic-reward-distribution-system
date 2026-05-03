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

  it("renders keys drawer links in sidebar mode", () => {
    nextNavigationMocks.usePathname.mockReturnValue("/portal/keys/handoff");
    nextNavigationMocks.useSearchParams.mockReturnValue(
      new URLSearchParams("tenant=10&project=101"),
    );

    const html = renderToStaticMarkup(<PortalNav orientation="sidebar" />);

    expect(html).toContain('href="/portal/keys?tenant=10&amp;project=101"');
    expect(html).toContain(
      'href="/portal/keys/guardrails?tenant=10&amp;project=101"',
    );
    expect(html).toContain(
      'href="/portal/keys/handoff?tenant=10&amp;project=101"',
    );
    expect(html).toContain("Issue keys");
    expect(html).toContain("Read limits");
    expect(html).toContain("Share handoff");
  });

  it("renders tenants drawer links in sidebar mode", () => {
    nextNavigationMocks.usePathname.mockReturnValue("/portal/tenants/risk");
    nextNavigationMocks.useSearchParams.mockReturnValue(
      new URLSearchParams("tenant=10&project=101"),
    );

    const html = renderToStaticMarkup(<PortalNav orientation="sidebar" />);

    expect(html).toContain('href="/portal/tenants?tenant=10&amp;project=101"');
    expect(html).toContain(
      'href="/portal/tenants/access?tenant=10&amp;project=101"',
    );
    expect(html).toContain(
      'href="/portal/tenants/invites?tenant=10&amp;project=101"',
    );
    expect(html).toContain(
      'href="/portal/tenants/risk?tenant=10&amp;project=101"',
    );
    expect(html).toContain("Browse tenants");
    expect(html).toContain("Manage access");
    expect(html).toContain("Send invites");
    expect(html).toContain("Review risk");
  });

  it("renders overview drawer links in sidebar mode", () => {
    nextNavigationMocks.usePathname.mockReturnValue("/portal/overview/snippet");
    nextNavigationMocks.useSearchParams.mockReturnValue(
      new URLSearchParams("tenant=10&project=101"),
    );

    const html = renderToStaticMarkup(<PortalNav orientation="sidebar" />);

    expect(html).toContain('href="/portal?tenant=10&amp;project=101"');
    expect(html).toContain(
      'href="/portal/overview/sandbox?tenant=10&amp;project=101"',
    );
    expect(html).toContain(
      'href="/portal/overview/snippet?tenant=10&amp;project=101"',
    );
    expect(html).toContain("Choose task");
    expect(html).toContain("Prep sandbox");
    expect(html).toContain("Copy snippet");
  });

  it("renders usage and reports drawer links with task-list labels", () => {
    nextNavigationMocks.usePathname.mockReturnValue("/portal/usage/quota");
    nextNavigationMocks.useSearchParams.mockReturnValue(
      new URLSearchParams("tenant=10&project=101"),
    );

    const usageHtml = renderToStaticMarkup(<PortalNav orientation="sidebar" />);

    expect(usageHtml).toContain('href="/portal/usage?tenant=10&amp;project=101"');
    expect(usageHtml).toContain(
      'href="/portal/usage/quota?tenant=10&amp;project=101"',
    );
    expect(usageHtml).toContain("Quota check");
    expect(usageHtml).toContain("30d drift");

    nextNavigationMocks.usePathname.mockReturnValue("/portal/reports/jobs");

    const reportsHtml = renderToStaticMarkup(
      <PortalNav orientation="sidebar" />,
    );

    expect(reportsHtml).toContain(
      'href="/portal/reports?tenant=10&amp;project=101"',
    );
    expect(reportsHtml).toContain(
      'href="/portal/reports/jobs?tenant=10&amp;project=101"',
    );
    expect(reportsHtml).toContain("Queue export");
    expect(reportsHtml).toContain("View jobs");
  });

  it("renders docs, billing, and prizes drawer links with compact labels", () => {
    nextNavigationMocks.usePathname.mockReturnValue("/portal/docs/snippet");
    nextNavigationMocks.useSearchParams.mockReturnValue(
      new URLSearchParams("tenant=10&project=101"),
    );

    const docsHtml = renderToStaticMarkup(<PortalNav orientation="sidebar" />);

    expect(docsHtml).toContain('href="/portal/docs?tenant=10&amp;project=101"');
    expect(docsHtml).toContain(
      'href="/portal/docs/handoff?tenant=10&amp;project=101"',
    );
    expect(docsHtml).toContain(
      'href="/portal/docs/snippet?tenant=10&amp;project=101"',
    );
    expect(docsHtml).toContain("Bootstrap");
    expect(docsHtml).toContain("SDK handoff");
    expect(docsHtml).toContain("Run snippet");

    nextNavigationMocks.usePathname.mockReturnValue("/portal/billing/disputes");

    const billingHtml = renderToStaticMarkup(
      <PortalNav orientation="sidebar" />,
    );

    expect(billingHtml).toContain(
      'href="/portal/billing?tenant=10&amp;project=101"',
    );
    expect(billingHtml).toContain(
      'href="/portal/billing/controls?tenant=10&amp;project=101"',
    );
    expect(billingHtml).toContain(
      'href="/portal/billing/credits?tenant=10&amp;project=101"',
    );
    expect(billingHtml).toContain(
      'href="/portal/billing/disputes?tenant=10&amp;project=101"',
    );
    expect(billingHtml).toContain("Spend view");
    expect(billingHtml).toContain("Budget caps");
    expect(billingHtml).toContain("Credits");
    expect(billingHtml).toContain("Disputes");

    nextNavigationMocks.usePathname.mockReturnValue("/portal/prizes/summary");

    const prizesHtml = renderToStaticMarkup(
      <PortalNav orientation="sidebar" />,
    );

    expect(prizesHtml).toContain(
      'href="/portal/prizes?tenant=10&amp;project=101"',
    );
    expect(prizesHtml).toContain(
      'href="/portal/prizes/envelope?tenant=10&amp;project=101"',
    );
    expect(prizesHtml).toContain(
      'href="/portal/prizes/summary?tenant=10&amp;project=101"',
    );
    expect(prizesHtml).toContain("Edit catalog");
    expect(prizesHtml).toContain("Reward cap");
    expect(prizesHtml).toContain("View counts");
  });
});
