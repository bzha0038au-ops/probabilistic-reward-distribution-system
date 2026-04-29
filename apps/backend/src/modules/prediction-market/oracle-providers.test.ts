import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluatePredictionMarketOracle } from "./oracle-providers";

const encodeUintWord = (value: bigint | number) =>
  BigInt(value).toString(16).padStart(64, "0");

const encodeIntWord = (value: bigint) => {
  const normalized = value >= 0n ? value : (1n << 256n) + value;
  return normalized.toString(16).padStart(64, "0");
};

const encodeBoolWord = (value: boolean) => encodeUintWord(value ? 1n : 0n);

const encodeAddressWord = (value: string) =>
  value.replace(/^0x/, "").padStart(64, "0");

const encodeBytes32Word = (value: string) =>
  value.replace(/^0x/, "").padStart(64, "0");

const encodeResult = (...words: string[]) => `0x${words.join("")}`;

const market = {
  id: 42,
  slug: "btc-above-100k",
  title: "BTC settles above 100k",
  locksAt: new Date("2026-04-29T12:00:00Z"),
  resolvesAt: new Date("2026-04-29T12:30:00Z"),
};

describe("prediction market oracle providers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a chainlink binding by reading decimals and latestRoundData", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as { params?: Array<{ data?: string }> })
          : null;
      const selector = body?.params?.[0]?.data;

      if (selector === "0x313ce567") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: encodeResult(encodeUintWord(8)),
          }),
        );
      }

      if (selector === "0xfeaf968c") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: encodeResult(
              encodeUintWord(12),
              encodeIntWord(10_012_345_000_000n),
              encodeUintWord(1_777_500_000),
              encodeUintWord(1_777_500_060),
              encodeUintWord(12),
            ),
          }),
        );
      }

      throw new Error(`Unexpected selector: ${String(selector)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluatePredictionMarketOracle({
      market,
      binding: {
        id: 7,
        provider: "chainlink",
        name: "BTC feed",
        metadata: null,
        config: {
          rpcUrl: "https://rpc.example.com",
          network: "ethereum",
          feedAddress: "0x1111111111111111111111111111111111111111",
          comparison: {
            operator: "gte",
            threshold: "100000",
            outcomeKeyIfTrue: "yes",
            outcomeKeyIfFalse: "no",
          },
        },
      },
      timeoutMs: 5_000,
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("expected resolved result");
    }

    expect(result.winningOutcomeKey).toBe("yes");
    expect(result.oracle).toMatchObject({
      source: "chainlink",
      externalRef:
        "ethereum:0x1111111111111111111111111111111111111111",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves a UMA binding after expiry by simulating settleAndGetAssertionResult", async () => {
    const expirationTime = Math.trunc(Date.now() / 1_000) - 30;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as { params?: Array<{ data?: string }> })
          : null;
      const data = body?.params?.[0]?.data ?? "";

      if (typeof data === "string" && data.startsWith("0x88302884")) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: encodeResult(
              encodeBoolWord(false),
              encodeBoolWord(false),
              encodeBoolWord(false),
              encodeAddressWord("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
              encodeAddressWord("0x0000000000000000000000000000000000000000"),
              encodeAddressWord("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
              encodeUintWord(1_777_500_000),
              encodeBoolWord(false),
              encodeAddressWord("0xcccccccccccccccccccccccccccccccccccccccc"),
              encodeUintWord(expirationTime),
              encodeBoolWord(false),
              encodeBytes32Word("0x00"),
              encodeBytes32Word(
                "0x4153534552545f54525554483200000000000000000000000000000000000000",
              ),
              encodeUintWord(0),
              encodeAddressWord("0x0000000000000000000000000000000000000000"),
              encodeAddressWord("0x0000000000000000000000000000000000000000"),
            ),
          }),
        );
      }

      if (typeof data === "string" && data.startsWith("0x8ea2f2ab")) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: encodeResult(encodeBoolWord(true)),
          }),
        );
      }

      throw new Error(`Unexpected call data: ${String(data)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluatePredictionMarketOracle({
      market,
      binding: {
        id: 8,
        provider: "uma_oracle",
        name: "UMA assertion",
        metadata: null,
        config: {
          rpcUrl: "https://rpc.example.com",
          network: "optimism",
          oracleAddress: "0x2222222222222222222222222222222222222222",
          assertionId:
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          outcomeKeyIfTrue: "yes",
          outcomeKeyIfFalse: "no",
        },
      },
      timeoutMs: 5_000,
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") {
      throw new Error("expected resolved result");
    }

    expect(result.winningOutcomeKey).toBe("yes");
    expect(result.oracle).toMatchObject({
      source: "uma_oracle",
      externalRef:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
