import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import { act } from "react";

import { useEconomy } from "../src/hooks/use-economy";
import { cleanupHooks, installTestDom, renderTestHook } from "./test-dom";

const teardownDom = installTestDom();

after(() => {
  teardownDom();
});

afterEach(() => {
  cleanupHooks();
});

const giftEnergy = {
  userId: 42,
  currentEnergy: 4,
  maxEnergy: 5,
  refillPolicy: {
    type: "daily_reset" as const,
    intervalHours: 24,
    refillAmount: 5,
  },
  lastRefillAt: "2026-04-30T00:00:00.000Z",
};

const giftTransfer = {
  id: 7,
  senderUserId: 42,
  receiverUserId: 99,
  assetCode: "B_LUCK" as const,
  amount: "3.00",
  energyCost: 1,
  status: "completed" as const,
  idempotencyKey: "gift-7",
  metadata: null,
  createdAt: "2026-04-30T00:00:01.000Z",
};

const ledgerEntry = {
  id: 9,
  userId: 42,
  assetCode: "B_LUCK" as const,
  entryType: "gift_sent",
  amount: "-3.00",
  balanceBefore: "15.00",
  balanceAfter: "12.00",
  metadata: null,
  createdAt: "2026-04-30T00:00:02.000Z",
};

test("useEconomy keeps successful slices and surfaces the first failure", async () => {
  const errors: Array<string | null> = [];
  const messages: Array<string | null> = [];
  const unauthorizedMessages: string[] = [];
  const api = {
    createGift: async () => ({
      ok: false as const,
      error: { message: "unused" },
      status: 500,
    }),
    getEconomyLedger: async () => ({
      ok: true as const,
      data: [ledgerEntry],
      status: 200,
    }),
    getGiftEnergy: async () => ({
      ok: true as const,
      data: giftEnergy,
      status: 200,
    }),
    listGifts: async () => ({
      ok: false as const,
      error: { message: "Gift list failed." },
      status: 500,
    }),
  };
  const authTokenRef = { current: "token-1" };
  const handleUnauthorizedRef = {
    current: async (message: string) => {
      unauthorizedMessages.push(message);
      return true;
    },
  };
  const refreshBalance = async () => true;
  const setError = (message: string | null) => {
    errors.push(message);
  };
  const setMessage = (message: string | null) => {
    messages.push(message);
  };
  const sessionToken = null;

  const { result } = renderTestHook(() =>
    useEconomy({
      api,
      authTokenRef,
      handleUnauthorizedRef,
      refreshBalance,
      setError,
      setMessage,
      sessionToken,
    }),
  );

  await act(async () => {
    const refreshed = await result.current.refreshEconomy();
    assert.equal(refreshed, false);
  });

  assert.equal(result.current.giftEnergy?.currentEnergy, 4);
  assert.equal(result.current.ledgerEntries[0]?.entryType, "gift_sent");
  assert.deepEqual(result.current.giftTransfers, []);
  assert.equal(result.current.loadingEconomy, false);
  assert.deepEqual(unauthorizedMessages, []);
  assert.deepEqual(errors, ["Gift list failed."]);
  assert.deepEqual(messages, []);
});

test("useEconomy sendGift issues an idempotent mutation and refreshes dependent state", async () => {
  const errors: Array<string | null> = [];
  const messages: Array<string | null> = [];
  let refreshBalanceCalls = 0;
  let capturedGiftPayload: unknown = null;
  const api = {
    createGift: async (payload: unknown) => {
      capturedGiftPayload = payload;
      return {
        ok: true as const,
        data: giftTransfer,
        status: 200,
      };
    },
    getEconomyLedger: async () => ({
      ok: true as const,
      data: [ledgerEntry],
      status: 200,
    }),
    getGiftEnergy: async () => ({
      ok: true as const,
      data: giftEnergy,
      status: 200,
    }),
    listGifts: async () => ({
      ok: true as const,
      data: [giftTransfer],
      status: 200,
    }),
  };
  const authTokenRef = { current: "token-1" };
  const handleUnauthorizedRef = { current: null };
  const refreshBalance = async () => {
    refreshBalanceCalls += 1;
    return true;
  };
  const setError = (message: string | null) => {
    errors.push(message);
  };
  const setMessage = (message: string | null) => {
    messages.push(message);
  };
  const sessionToken = null;

  const { result } = renderTestHook(() =>
    useEconomy({
      api,
      authTokenRef,
      handleUnauthorizedRef,
      refreshBalance,
      setError,
      setMessage,
      sessionToken,
    }),
  );

  await act(async () => {
    const sent = await result.current.sendGift({
      receiverUserId: 99,
      amount: "3.00",
    });
    assert.equal(sent, true);
  });

  assert.equal(refreshBalanceCalls, 1);
  assert.equal(result.current.sendingGift, false);
  assert.equal(result.current.giftTransfers[0]?.receiverUserId, 99);
  assert.equal(result.current.ledgerEntries[0]?.balanceAfter, "12.00");
  assert.deepEqual(errors, []);
  assert.deepEqual(messages, ["Gift sent."]);
  assert.equal(
    (capturedGiftPayload as { receiverUserId?: unknown }).receiverUserId,
    99,
  );
  assert.equal(
    (capturedGiftPayload as { amount?: unknown }).amount,
    "3.00",
  );
  assert.equal(
    typeof (capturedGiftPayload as { idempotencyKey?: unknown }).idempotencyKey,
    "string",
  );
  assert.match(
    (capturedGiftPayload as { idempotencyKey: string }).idempotencyKey,
    /^mobile-gift:99:\d+$/,
  );
});
