// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { GachaRoutePage } from "./gacha-route-page";

const messages = getMessages("en");

const accessState = {
  disabled: true,
  disabledReason: "Verify email first.",
};

let lastDrawPanelProps: Record<string, unknown> | null = null;

vi.mock("@/modules/app/components/use-verified-game-access", () => ({
  useVerifiedGameAccess: () => accessState,
}));

vi.mock("./draw-panel", () => ({
  DrawPanel: (props: Record<string, unknown>) => {
    lastDrawPanelProps = props;
    return <div data-testid="mock-draw-panel" />;
  },
}));

function renderPage() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <GachaRoutePage />
    </I18nProvider>,
  );
}

describe("GachaRoutePage", () => {
  afterEach(() => {
    cleanup();
    lastDrawPanelProps = null;
  });

  it("renders the dedicated gacha route and forwards gated access into the draw stage", () => {
    renderPage();

    expect(screen.queryByTestId("mock-draw-panel")).not.toBeNull();
    expect(lastDrawPanelProps).toEqual(
      expect.objectContaining({
        disabled: true,
        disabledReason: "Verify email first.",
        variant: "gacha",
      }),
    );
  });
});
