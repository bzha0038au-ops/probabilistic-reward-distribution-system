import { describe, expect, it } from "vitest";

import { deriveWalletLedgerEffects } from "./invariant-service";

describe("deriveWalletLedgerEffects", () => {
  it("maps stake entries into withdrawable debit plus wagered accrual", () => {
    const effect = deriveWalletLedgerEffects({
      entryType: "draw_cost",
      amount: "-10.00",
      metadata: null,
    });

    expect(effect.withdrawable.toFixed(2)).toBe("-10.00");
    expect(effect.bonus.toFixed(2)).toBe("0.00");
    expect(effect.locked.toFixed(2)).toBe("0.00");
    expect(effect.wagered.toFixed(2)).toBe("10.00");
  });

  it("maps bonus auto release into withdrawable credit, bonus debit, and wagered release", () => {
    const effect = deriveWalletLedgerEffects({
      entryType: "bonus_release_auto",
      amount: "5.00",
      metadata: { unlockRatio: "3" },
    });

    expect(effect.withdrawable.toFixed(2)).toBe("5.00");
    expect(effect.bonus.toFixed(2)).toBe("-5.00");
    expect(effect.locked.toFixed(2)).toBe("0.00");
    expect(effect.wagered.toFixed(2)).toBe("-15.00");
  });

  it("maps withdrawal request entries into withdrawable-to-locked transfers", () => {
    const effect = deriveWalletLedgerEffects({
      entryType: "withdraw_request",
      amount: "-12.50",
      metadata: {},
    });

    expect(effect.withdrawable.toFixed(2)).toBe("-12.50");
    expect(effect.bonus.toFixed(2)).toBe("0.00");
    expect(effect.locked.toFixed(2)).toBe("12.50");
    expect(effect.wagered.toFixed(2)).toBe("0.00");
  });

  it("maps prediction market sell entries into withdrawable credit and locked release", () => {
    const effect = deriveWalletLedgerEffects({
      entryType: "prediction_market_sell",
      amount: "15.00",
      metadata: {
        lockedBalanceBefore: "15.00",
        lockedBalanceAfter: "0.00",
      },
    });

    expect(effect.withdrawable.toFixed(2)).toBe("15.00");
    expect(effect.bonus.toFixed(2)).toBe("0.00");
    expect(effect.locked.toFixed(2)).toBe("-15.00");
    expect(effect.wagered.toFixed(2)).toBe("0.00");
  });

  it("maps deferred play-mode payouts into withdrawable deltas", () => {
    const effect = deriveWalletLedgerEffects({
      entryType: "play_mode_payout_deferred",
      amount: "-10.00",
      metadata: {
        balanceType: "withdrawable",
      },
    });

    expect(effect.withdrawable.toFixed(2)).toBe("-10.00");
    expect(effect.bonus.toFixed(2)).toBe("0.00");
    expect(effect.locked.toFixed(2)).toBe("0.00");
    expect(effect.wagered.toFixed(2)).toBe("0.00");
  });

  it("maps deferred play-mode payouts into bonus and locked deltas when metadata says so", () => {
    const effect = deriveWalletLedgerEffects({
      entryType: "play_mode_payout_released",
      amount: "12.50",
      metadata: {
        balanceType: "bonus",
        lockedBalanceBefore: "12.50",
        lockedBalanceAfter: "0.00",
      },
    });

    expect(effect.withdrawable.toFixed(2)).toBe("0.00");
    expect(effect.bonus.toFixed(2)).toBe("12.50");
    expect(effect.locked.toFixed(2)).toBe("-12.50");
    expect(effect.wagered.toFixed(2)).toBe("0.00");
  });
});
