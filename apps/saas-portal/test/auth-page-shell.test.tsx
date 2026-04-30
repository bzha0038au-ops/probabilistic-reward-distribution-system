import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { AuthPageShell } from "../components/auth-page-shell";

describe("AuthPageShell", () => {
  it("renders the shared portal auth frame around children", () => {
    const html = renderToStaticMarkup(
      <AuthPageShell>
        <section data-testid="auth-child">Portal Login</section>
      </AuthPageShell>,
    );

    expect(html).toMatch(/min-h-app-screen/);
    expect(html).toMatch(/max-w-6xl/);
    expect(html).toMatch(/Portal Login/);
    expect(html).toMatch(/data-testid="auth-child"/);
  });
});
