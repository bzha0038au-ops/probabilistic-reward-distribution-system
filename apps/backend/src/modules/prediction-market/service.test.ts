import { describe, expect, it } from "vitest";
import { resolvePariMutuelSettlement } from "./settlement";

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5433/reward_test";

describe("prediction market settlement helpers", () => {
  it("distributes the full pari-mutuel pool with deterministic cent rounding", () => {
    const settlement = resolvePariMutuelSettlement({
      winningOutcomeKey: "yes",
      vigBps: 0,
      positions: [
        { id: 1, userId: 1, outcomeKey: "yes", stakeAmount: "1.00" },
        { id: 2, userId: 2, outcomeKey: "yes", stakeAmount: "1.00" },
        { id: 3, userId: 3, outcomeKey: "yes", stakeAmount: "1.00" },
        { id: 4, userId: 4, outcomeKey: "no", stakeAmount: "1.00" },
      ],
    });

    expect(settlement).toMatchObject({
      mode: "payout",
      vigBps: 0,
      totalPoolAmount: "4.00",
      winningPoolAmount: "3.00",
      feeAmount: "0.00",
      payoutPoolAmount: "4.00",
    });
    expect(settlement.positionResults).toEqual([
      { id: 1, userId: 1, payoutAmount: "1.34", status: "won" },
      { id: 2, userId: 2, payoutAmount: "1.33", status: "won" },
      { id: 3, userId: 3, payoutAmount: "1.33", status: "won" },
      { id: 4, userId: 4, payoutAmount: "0.00", status: "lost" },
    ]);
  });

  it("refunds all stakes when nobody backed the winning outcome", () => {
    const settlement = resolvePariMutuelSettlement({
      winningOutcomeKey: "draw",
      vigBps: 500,
      positions: [
        { id: 1, userId: 11, outcomeKey: "home", stakeAmount: "12.50" },
        { id: 2, userId: 12, outcomeKey: "away", stakeAmount: "7.50" },
      ],
    });

    expect(settlement).toEqual({
      mode: "refund_no_winners",
      vigBps: 500,
      totalPoolAmount: "20.00",
      winningPoolAmount: "0.00",
      feeAmount: "0.00",
      payoutPoolAmount: "20.00",
      positionResults: [
        { id: 1, userId: 11, payoutAmount: "12.50", status: "refunded" },
        { id: 2, userId: 12, payoutAmount: "7.50", status: "refunded" },
      ],
    });
  });

  it("applies vig before distributing the payout pool to winners", () => {
    const settlement = resolvePariMutuelSettlement({
      winningOutcomeKey: "yes",
      vigBps: 500,
      positions: [
        { id: 1, userId: 1, outcomeKey: "yes", stakeAmount: "30.00" },
        { id: 2, userId: 2, outcomeKey: "yes", stakeAmount: "10.00" },
        { id: 3, userId: 3, outcomeKey: "no", stakeAmount: "10.00" },
      ],
    });

    expect(settlement).toMatchObject({
      mode: "payout",
      vigBps: 500,
      totalPoolAmount: "50.00",
      winningPoolAmount: "40.00",
      feeAmount: "2.50",
      payoutPoolAmount: "47.50",
    });
    expect(settlement.positionResults).toEqual([
      { id: 1, userId: 1, payoutAmount: "35.63", status: "won" },
      { id: 2, userId: 2, payoutAmount: "11.87", status: "won" },
      { id: 3, userId: 3, payoutAmount: "0.00", status: "lost" },
    ]);
  });
});
