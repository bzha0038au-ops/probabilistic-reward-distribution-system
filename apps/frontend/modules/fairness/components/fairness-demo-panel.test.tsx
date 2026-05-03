// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  FairnessCommit,
  FairnessReveal,
} from "@reward/shared-types/fairness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { FairnessDemoPanel } from "./fairness-demo-panel";

const messages = getMessages("en");

const browserUserApiClientMock = vi.hoisted(() => ({
  getFairnessCommit: vi.fn(),
  revealFairnessSeed: vi.fn(),
}));

vi.mock("@/lib/api/user-client", () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const commit: FairnessCommit = {
  epoch: 12,
  epochSeconds: 30,
  commitHash: "3ee883ec0b0e4f37f7289af4708f8f7ab0cab4f7069b39f6b1c7f4bf390ee307",
  audit: {
    latestAuditedEpoch: 11,
    lastAuditPassed: true,
    lastAuditedAt: "2026-05-03T09:15:00.000Z",
    consecutiveVerifiedEpochs: 64,
    consecutiveVerifiedDays: 8,
  },
};

const reveal: FairnessReveal = {
  epoch: 11,
  epochSeconds: 30,
  commitHash: "a695b11d144abaf46eb460d141f2894c8317fc9a653a4cdc28d25f4491772112",
  seed: "reward-seed-42",
  revealedAt: "2026-05-03T09:20:00.000Z",
};

function renderFairnessDemoPanel() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <FairnessDemoPanel />
    </I18nProvider>,
  );
}

describe("FairnessDemoPanel", () => {
  beforeEach(() => {
    browserUserApiClientMock.getFairnessCommit.mockResolvedValue(ok(commit));
    browserUserApiClientMock.revealFairnessSeed.mockResolvedValue(ok(reveal));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("prefills the latest closed epoch after loading the live commit", async () => {
    renderFairnessDemoPanel();

    await waitFor(() => {
      expect(browserUserApiClientMock.getFairnessCommit).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByDisplayValue("11")).not.toBeNull();
    });

    expect(screen.queryAllByText("Verification lab").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("8").length).toBeGreaterThan(0);
  });

  it("reveals a closed epoch and shows a verified local hash match", async () => {
    const user = userEvent.setup();

    renderFairnessDemoPanel();

    await waitFor(() => {
      expect(screen.queryByDisplayValue("11")).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Reveal and verify" }));

    await waitFor(() => {
      expect(browserUserApiClientMock.revealFairnessSeed).toHaveBeenCalledWith(11);
    });

    await waitFor(() => {
      expect(screen.queryAllByText("Verified").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("reward-seed-42").length).toBeGreaterThan(0);
      expect(
        screen.queryAllByText(
          "a695b11d144abaf46eb460d141f2894c8317fc9a653a4cdc28d25f4491772112",
        ).length,
      ).toBe(2);
    });
  });
});
