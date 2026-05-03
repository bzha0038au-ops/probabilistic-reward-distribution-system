// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RewardCenterResponse } from "@reward/shared-types/gamification";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n-provider";
import { getMessages } from "@/lib/i18n/messages";
import { RewardCenter } from "./reward-center";

const messages = getMessages("en");

const rewardCenterFixture: RewardCenterResponse = {
  summary: {
    bonusBalance: "37.50",
    streakDays: 7,
    todayDailyClaimed: true,
    availableMissionCount: 1,
    claimedMissionCount: 1,
  },
  missions: [
    {
      id: "daily_checkin",
      title: "",
      description: "",
      cadence: "daily",
      status: "claimed",
      rewardAmount: "5.00",
      progressCurrent: 1,
      progressTarget: 1,
      claimable: false,
      autoAwarded: true,
      claimedAt: "2026-05-01T09:00:00.000Z",
      resetsAt: "2026-05-02T00:00:00.000Z",
    },
    {
      id: "first_draw",
      title: "",
      description: "",
      cadence: "one_time",
      status: "ready",
      rewardAmount: "12.50",
      progressCurrent: 1,
      progressTarget: 1,
      claimable: true,
      autoAwarded: false,
      claimedAt: null,
      resetsAt: null,
    },
    {
      id: "draw_streak_daily",
      title: "",
      description: "",
      cadence: "daily",
      status: "in_progress",
      rewardAmount: "7.25",
      progressCurrent: 2,
      progressTarget: 3,
      claimable: false,
      autoAwarded: false,
      claimedAt: null,
      resetsAt: "2026-05-03T00:00:00.000Z",
    },
  ],
};

function renderRewardCenter(onClaim = vi.fn()) {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <RewardCenter center={rewardCenterFixture} onClaim={onClaim} />
    </I18nProvider>,
  );
}

describe("RewardCenter", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the progress rail and recent claim rail from live reward data", () => {
    renderRewardCenter();

    expect(screen.getByTestId("reward-hero").textContent).toContain(
      "Reward center",
    );
    expect(screen.getByTestId("reward-progress-rail").textContent).toContain(
      "Mission cadence",
    );
    expect(screen.getByTestId("reward-progress-rail").textContent).toContain(
      "Daily loops",
    );
    expect(screen.getByTestId("reward-recent-claims").textContent).toContain(
      "Daily check-in",
    );
  });

  it("keeps manual claim missions actionable after the layout refresh", async () => {
    const user = userEvent.setup();
    const onClaim = vi.fn();

    renderRewardCenter(onClaim);

    const readyMissionCard = screen.getByTestId("reward-mission-card-first_draw");
    await user.click(
      within(readyMissionCard).getByRole("button", { name: "Claim reward" }),
    );

    expect(onClaim).toHaveBeenCalledWith("first_draw");
  });
});
