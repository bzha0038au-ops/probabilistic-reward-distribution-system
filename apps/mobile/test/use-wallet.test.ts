import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import { act } from "react";

import { useWallet } from "../src/hooks/use-wallet";
import { cleanupHooks, installTestDom, renderTestHook } from "./test-dom";

const teardownDom = installTestDom();

after(() => {
  teardownDom();
});

afterEach(() => {
  cleanupHooks();
});

const walletResponse = {
  balance: {
    withdrawableBalance: "12.34",
    bonusBalance: "1.11",
    lockedBalance: "0.55",
    totalBalance: "14.00",
  },
  assets: [],
  legacy: {
    withdrawableBalance: "12.34",
    bonusBalance: "1.11",
    lockedBalance: "0.55",
    totalBalance: "14.00",
  },
};

test("useWallet hydrates balances on success and supports local sync/reset", async () => {
  const errors: Array<string | null> = [];
  let capturedOverrides: unknown = null;
  const api = {
    getWalletBalance: async (overrides: unknown) => {
      capturedOverrides = overrides;
      return {
        ok: true as const,
        data: walletResponse,
        status: 200,
      };
    },
  };
  const authTokenRef = { current: "token-1" };
  const handleUnauthorizedRef = { current: null };
  const setError = (message: string | null) => {
    errors.push(message);
  };

  const { result } = renderTestHook(() =>
    useWallet({
      api,
      authTokenRef,
      handleUnauthorizedRef,
      setError,
    }),
  );

  await act(async () => {
    const refreshed = await result.current.refreshBalance({ authToken: "token-2" });
    assert.equal(refreshed, true);
  });

  assert.deepEqual(capturedOverrides, { authToken: "token-2" });
  assert.equal(result.current.balance, "12.34");
  assert.equal(result.current.wallet?.balance.totalBalance, "14.00");
  assert.equal(result.current.refreshingBalance, false);
  assert.deepEqual(errors, []);

  await act(async () => {
    result.current.syncBalance("99.99");
  });
  assert.equal(result.current.balance, "99.99");

  await act(async () => {
    result.current.resetWallet();
  });
  assert.equal(result.current.balance, "0");
  assert.equal(result.current.wallet, null);
  assert.equal(result.current.refreshingBalance, false);
});

test("useWallet delegates 401 responses to the unauthorized handler", async () => {
  const unauthorizedMessages: string[] = [];
  const errors: Array<string | null> = [];
  const api = {
    getWalletBalance: async () => ({
      ok: false as const,
      error: { message: "expired" },
      status: 401,
    }),
  };
  const authTokenRef = { current: "token-1" };
  const handleUnauthorizedRef = {
    current: async (message: string) => {
      unauthorizedMessages.push(message);
      return true;
    },
  };
  const setError = (message: string | null) => {
    errors.push(message);
  };

  const { result } = renderTestHook(() =>
    useWallet({
      api,
      authTokenRef,
      handleUnauthorizedRef,
      setError,
    }),
  );

  await act(async () => {
    const refreshed = await result.current.refreshBalance();
    assert.equal(refreshed, false);
  });

  assert.deepEqual(unauthorizedMessages, [
    "Session expired or was revoked. Sign in again.",
  ]);
  assert.deepEqual(errors, []);
  assert.equal(result.current.refreshingBalance, false);
});
