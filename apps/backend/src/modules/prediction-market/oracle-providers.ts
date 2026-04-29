import { createHash } from "node:crypto";
import {
  type PredictionMarketApiPullOracleConfig,
  type PredictionMarketAppealReason,
  type PredictionMarketOracle,
  PredictionMarketOracleBindingRequestSchema,
  type PredictionMarketOracleBindingRequest,
  type PredictionMarketOracleBindingStatus,
  type PredictionMarketOracleNumericComparison,
  type PredictionMarketUmaOracleConfig,
} from "@reward/shared-types/prediction-market";

import { toDecimal } from "../../shared/money";

type MarketSnapshot = {
  id: number;
  slug: string;
  title: string;
  locksAt: Date | string | null;
  resolvesAt: Date | string | null;
};

type OracleBindingRecord = {
  id: number;
  provider: PredictionMarketOracleBindingRequest["provider"];
  name: string | null;
  config: unknown;
  metadata: unknown;
};

type EvaluationBase = {
  bindingStatus: PredictionMarketOracleBindingStatus;
  reportedAt: Date | null;
  payload: Record<string, unknown> | null;
  payloadHash: string | null;
};

export type PredictionMarketOracleEvaluationResult =
  | (EvaluationBase & {
      status: "pending";
      note: string;
    })
  | (EvaluationBase & {
      status: "resolved";
      winningOutcomeKey: string;
      oracle: PredictionMarketOracle;
    })
  | (EvaluationBase & {
      status: "appeal";
      reason: PredictionMarketAppealReason;
      title: string;
      description: string;
      metadata: Record<string, unknown>;
    });

const CHAINLINK_DECIMALS_SELECTOR = "0x313ce567";
const CHAINLINK_LATEST_ROUND_DATA_SELECTOR = "0xfeaf968c";
const UMA_GET_ASSERTION_SELECTOR = "0x88302884";
const UMA_SETTLE_AND_GET_RESULT_SELECTOR = "0x8ea2f2ab";

const normalizeRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(
      ([key, nestedValue]) =>
        `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
    )
    .join(",")}}`;
};

const hashPayload = (payload: Record<string, unknown> | null) => {
  if (!payload) {
    return null;
  }

  return `sha256:${createHash("sha256").update(stableStringify(payload)).digest("hex")}`;
};

const parseDateLike = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis =
      value > 1_000_000_000_000 ? Math.trunc(value) : Math.trunc(value * 1_000);
    const parsed = new Date(millis);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }

  if (typeof value !== "string") {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== "") {
    return parseDateLike(numeric);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const toIsoString = (value: Date | null) => (value ? value.toISOString() : null);

const getPathTokens = (path: string) =>
  path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

const getPathValue = (value: unknown, path: string): unknown => {
  let current: unknown = value;
  for (const token of getPathTokens(path)) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    current = Reflect.get(current, token);
  }

  return current;
};

const normalizeValueKey = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return null;
};

const evaluateNumericComparison = (
  comparison: PredictionMarketOracleNumericComparison,
  value: string,
) => {
  const observed = toDecimal(value);
  const threshold = toDecimal(comparison.threshold);
  switch (comparison.operator) {
    case "gt":
      return observed.gt(threshold)
        ? comparison.outcomeKeyIfTrue
        : comparison.outcomeKeyIfFalse;
    case "gte":
      return observed.gte(threshold)
        ? comparison.outcomeKeyIfTrue
        : comparison.outcomeKeyIfFalse;
    case "lt":
      return observed.lt(threshold)
        ? comparison.outcomeKeyIfTrue
        : comparison.outcomeKeyIfFalse;
    case "lte":
      return observed.lte(threshold)
        ? comparison.outcomeKeyIfTrue
        : comparison.outcomeKeyIfFalse;
    case "eq":
      return observed.eq(threshold)
        ? comparison.outcomeKeyIfTrue
        : comparison.outcomeKeyIfFalse;
    case "neq":
      return !observed.eq(threshold)
        ? comparison.outcomeKeyIfTrue
        : comparison.outcomeKeyIfFalse;
  }
};

const padHexValue = (value: string) => value.replace(/^0x/, "").padStart(64, "0");

const encodeBytes32Param = (value: string) => padHexValue(value);

const buildCallData = (selector: string, params: string[] = []) =>
  `${selector}${params.join("")}`;

const parseWords = (hex: string) => {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length === 0 || normalized.length % 64 !== 0) {
    throw new Error("Oracle RPC returned malformed ABI data.");
  }

  return normalized.match(/.{64}/g) ?? [];
};

const decodeUintWord = (word: string) => BigInt(`0x${word}`);

const decodeBoolWord = (word: string) => decodeUintWord(word) !== 0n;

const decodeAddressWord = (word: string) => `0x${word.slice(24)}`;

const decodeIntWord = (word: string) => {
  const unsigned = decodeUintWord(word);
  const signBoundary = 1n << 255n;
  return unsigned >= signBoundary ? unsigned - (1n << 256n) : unsigned;
};

const formatSignedFixed = (value: bigint, decimals: number) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const fractionString =
    decimals === 0 ? "" : `.${fraction.toString().padStart(decimals, "0")}`;
  return `${negative ? "-" : ""}${whole.toString()}${fractionString}`;
};

const fetchJson = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Oracle request failed with status ${response.status}.`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
};

const ethCall = async (params: {
  rpcUrl: string;
  to: string;
  data: string;
  timeoutMs: number;
}) => {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [
      {
        to: params.to,
        data: params.data,
      },
      "latest",
    ],
  };
  const response = normalizeRecord(
    await fetchJson(
      params.rpcUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      params.timeoutMs,
    ),
  );

  if (!response) {
    throw new Error("Oracle RPC returned an invalid response.");
  }

  const error = normalizeRecord(Reflect.get(response, "error"));
  if (error) {
    const message =
      typeof Reflect.get(error, "message") === "string"
        ? String(Reflect.get(error, "message"))
        : "Oracle RPC call failed.";
    throw new Error(message);
  }

  const result = Reflect.get(response, "result");
  if (typeof result !== "string" || !result.startsWith("0x")) {
    throw new Error("Oracle RPC returned an invalid result payload.");
  }

  return result;
};

const decodeChainlinkRoundData = (hex: string) => {
  const words = parseWords(hex);
  if (words.length < 5) {
    throw new Error("Chainlink latestRoundData returned too few words.");
  }

  return {
    roundId: decodeUintWord(words[0] ?? "0").toString(),
    answer: decodeIntWord(words[1] ?? "0"),
    startedAt: Number(decodeUintWord(words[2] ?? "0")),
    updatedAt: Number(decodeUintWord(words[3] ?? "0")),
    answeredInRound: decodeUintWord(words[4] ?? "0").toString(),
  };
};

const decodeUmaAssertion = (hex: string) => {
  const words = parseWords(hex);
  if (words.length < 16) {
    throw new Error("UMA getAssertion returned too few words.");
  }

  return {
    arbitrateViaEscalationManager: decodeBoolWord(words[0] ?? "0"),
    discardOracle: decodeBoolWord(words[1] ?? "0"),
    validateDisputers: decodeBoolWord(words[2] ?? "0"),
    assertingCaller: decodeAddressWord(words[3] ?? "0"),
    escalationManager: decodeAddressWord(words[4] ?? "0"),
    asserter: decodeAddressWord(words[5] ?? "0"),
    assertionTime: Number(decodeUintWord(words[6] ?? "0")),
    settled: decodeBoolWord(words[7] ?? "0"),
    currency: decodeAddressWord(words[8] ?? "0"),
    expirationTime: Number(decodeUintWord(words[9] ?? "0")),
    settlementResolution: decodeBoolWord(words[10] ?? "0"),
    domainId: `0x${words[11] ?? ""}`,
    identifier: `0x${words[12] ?? ""}`,
    bond: decodeUintWord(words[13] ?? "0").toString(),
    callbackRecipient: decodeAddressWord(words[14] ?? "0"),
    disputer: decodeAddressWord(words[15] ?? "0"),
  };
};

const decodeBooleanResult = (hex: string) => {
  const words = parseWords(hex);
  if (words.length < 1) {
    throw new Error("Oracle boolean result payload was empty.");
  }

  return decodeBoolWord(words[0] ?? "0");
};

const buildOracle = (params: {
  source: PredictionMarketOracle["source"];
  externalRef: string | null;
  reportedAt: Date | null;
  payload: Record<string, unknown> | null;
}) => ({
  source: params.source,
  externalRef: params.externalRef,
  reportedAt: toIsoString(params.reportedAt) ?? undefined,
  payloadHash: hashPayload(params.payload) ?? undefined,
  payload: params.payload ?? undefined,
});

const buildAppeal = (params: {
  reason: PredictionMarketAppealReason;
  provider: PredictionMarketOracleBindingRequest["provider"];
  market: MarketSnapshot;
  bindingStatus?: PredictionMarketOracleBindingStatus;
  title: string;
  description: string;
  payload?: Record<string, unknown> | null;
  reportedAt?: Date | null;
  metadata?: Record<string, unknown>;
}): PredictionMarketOracleEvaluationResult => ({
  status: "appeal",
  bindingStatus: params.bindingStatus ?? "appealed",
  reason: params.reason,
  title: params.title,
  description: params.description,
  payload: params.payload ?? null,
  payloadHash: hashPayload(params.payload ?? null),
  reportedAt: params.reportedAt ?? null,
  metadata: {
    marketId: params.market.id,
    marketSlug: params.market.slug,
    ...params.metadata,
  },
});

const buildPending = (params: {
  bindingStatus: PredictionMarketOracleBindingStatus;
  note: string;
  payload?: Record<string, unknown> | null;
  reportedAt?: Date | null;
}): PredictionMarketOracleEvaluationResult => ({
  status: "pending",
  bindingStatus: params.bindingStatus,
  note: params.note,
  payload: params.payload ?? null,
  payloadHash: hashPayload(params.payload ?? null),
  reportedAt: params.reportedAt ?? null,
});

const buildResolved = (params: {
  bindingStatus?: PredictionMarketOracleBindingStatus;
  winningOutcomeKey: string;
  oracle: PredictionMarketOracle;
  payload?: Record<string, unknown> | null;
  reportedAt?: Date | null;
}): PredictionMarketOracleEvaluationResult => ({
  status: "resolved",
  bindingStatus: params.bindingStatus ?? "resolved",
  winningOutcomeKey: params.winningOutcomeKey,
  oracle: params.oracle,
  payload: params.payload ?? null,
  payloadHash: hashPayload(params.payload ?? null),
  reportedAt: params.reportedAt ?? null,
});

const evaluateApiPullOracle = async (params: {
  market: MarketSnapshot;
  binding: OracleBindingRecord;
  config: PredictionMarketApiPullOracleConfig;
  timeoutMs: number;
}) => {
  const response = await fetchJson(
    params.config.url,
    {
      method: params.config.method ?? "GET",
      headers: params.config.headers,
      body:
        params.config.method === "POST" && params.config.body
          ? JSON.stringify(params.config.body)
          : undefined,
    },
    params.timeoutMs,
  );

  const reportedAt = params.config.reportedAtPath
    ? parseDateLike(getPathValue(response, params.config.reportedAtPath))
    : null;
  const observedValue = getPathValue(response, params.config.valuePath);
  const payload = {
    provider: "api_pull",
    value: observedValue ?? null,
    reportedAt: toIsoString(reportedAt),
    response: response,
  };

  if (observedValue === undefined) {
    return buildAppeal({
      reason: "oracle_response_invalid",
      provider: "api_pull",
      market: params.market,
      title: "API oracle response did not contain the configured value path.",
      description: `Expected path "${params.config.valuePath}" for market ${params.market.slug}.`,
      payload,
      reportedAt,
      metadata: {
        bindingId: params.binding.id,
        url: params.config.url,
        valuePath: params.config.valuePath,
      },
    });
  }

  let winningOutcomeKey: string | null = null;
  if (params.config.outcomeValueMap) {
    const mappedKey = normalizeValueKey(observedValue);
    winningOutcomeKey =
      mappedKey === null
        ? null
        : (params.config.outcomeValueMap[mappedKey] ?? null);
  } else if (params.config.comparison) {
    try {
      const numericValue = normalizeValueKey(observedValue);
      winningOutcomeKey =
        numericValue === null
          ? null
          : evaluateNumericComparison(params.config.comparison, numericValue);
    } catch {
      winningOutcomeKey = null;
    }
  }

  if (!winningOutcomeKey) {
    return buildAppeal({
      reason: "oracle_value_unmapped",
      provider: "api_pull",
      market: params.market,
      title: "API oracle value could not be mapped to a market outcome.",
      description: `Received value "${String(observedValue)}" for market ${params.market.slug}.`,
      payload,
      reportedAt,
      metadata: {
        bindingId: params.binding.id,
        url: params.config.url,
      },
    });
  }

  const oracle = buildOracle({
    source: "api_pull",
    externalRef: params.config.url,
    reportedAt,
    payload,
  });

  return buildResolved({
    winningOutcomeKey,
    oracle,
    payload,
    reportedAt,
  });
};

const evaluateChainlinkOracle = async (params: {
  market: MarketSnapshot;
  binding: OracleBindingRecord;
  config: {
    rpcUrl: string;
    network: string;
    feedAddress: string;
    decimals?: number;
    maxAgeSeconds?: number;
    comparison: PredictionMarketOracleNumericComparison;
  };
  timeoutMs: number;
}) => {
  const decimals =
    params.config.decimals ??
    Number(
      decodeUintWord(
        parseWords(
          await ethCall({
            rpcUrl: params.config.rpcUrl,
            to: params.config.feedAddress,
            data: CHAINLINK_DECIMALS_SELECTOR,
            timeoutMs: params.timeoutMs,
          }),
        )[0] ?? "0",
      ),
    );

  const roundData = decodeChainlinkRoundData(
    await ethCall({
      rpcUrl: params.config.rpcUrl,
      to: params.config.feedAddress,
      data: CHAINLINK_LATEST_ROUND_DATA_SELECTOR,
      timeoutMs: params.timeoutMs,
    }),
  );

  const reportedAt =
    roundData.updatedAt > 0 ? new Date(roundData.updatedAt * 1_000) : null;
  const normalizedValue = formatSignedFixed(roundData.answer, decimals);
  const payload = {
    provider: "chainlink",
    network: params.config.network,
    feedAddress: params.config.feedAddress,
    decimals,
    roundId: roundData.roundId,
    answer: normalizedValue,
    rawAnswer: roundData.answer.toString(),
    startedAt:
      roundData.startedAt > 0
        ? new Date(roundData.startedAt * 1_000).toISOString()
        : null,
    updatedAt: toIsoString(reportedAt),
    answeredInRound: roundData.answeredInRound,
  };

  if (!reportedAt) {
    return buildAppeal({
      reason: "oracle_response_invalid",
      provider: "chainlink",
      market: params.market,
      title: "Chainlink oracle response did not provide an updated timestamp.",
      description: `Feed ${params.config.feedAddress} on ${params.config.network} returned updatedAt=0.`,
      payload,
      metadata: {
        bindingId: params.binding.id,
      },
    });
  }

  if (
    params.config.maxAgeSeconds &&
    Date.now() - reportedAt.getTime() > params.config.maxAgeSeconds * 1_000
  ) {
    return buildAppeal({
      reason: "oracle_value_stale",
      provider: "chainlink",
      market: params.market,
      title: "Chainlink oracle data is older than the allowed freshness window.",
      description: `Feed ${params.config.feedAddress} on ${params.config.network} last updated at ${reportedAt.toISOString()}.`,
      payload,
      reportedAt,
      metadata: {
        bindingId: params.binding.id,
        maxAgeSeconds: params.config.maxAgeSeconds,
      },
    });
  }

  const winningOutcomeKey = evaluateNumericComparison(
    params.config.comparison,
    normalizedValue,
  );
  const oracle = buildOracle({
    source: "chainlink",
    externalRef: `${params.config.network}:${params.config.feedAddress}`,
    reportedAt,
    payload,
  });

  return buildResolved({
    winningOutcomeKey,
    oracle,
    payload,
    reportedAt,
  });
};

const evaluateUmaOracle = async (params: {
  market: MarketSnapshot;
  binding: OracleBindingRecord;
  config: PredictionMarketUmaOracleConfig;
  timeoutMs: number;
}) => {
  const assertion = decodeUmaAssertion(
    await ethCall({
      rpcUrl: params.config.rpcUrl,
      to: params.config.oracleAddress,
      data: buildCallData(UMA_GET_ASSERTION_SELECTOR, [
        encodeBytes32Param(params.config.assertionId),
      ]),
      timeoutMs: params.timeoutMs,
    }),
  );

  const expirationAt =
    assertion.expirationTime > 0
      ? new Date(assertion.expirationTime * 1_000)
      : null;
  const payload = {
    provider: "uma_oracle",
    network: params.config.network,
    oracleAddress: params.config.oracleAddress,
    assertionId: params.config.assertionId,
    settled: assertion.settled,
    settlementResolution: assertion.settlementResolution,
    assertionTime:
      assertion.assertionTime > 0
        ? new Date(assertion.assertionTime * 1_000).toISOString()
        : null,
    expirationTime: toIsoString(expirationAt),
    disputer: assertion.disputer,
    asserter: assertion.asserter,
    identifier: assertion.identifier,
    bond: assertion.bond,
  };

  let resolution: boolean | null = assertion.settled
    ? assertion.settlementResolution
    : null;

  if (!assertion.settled && expirationAt && Date.now() >= expirationAt.getTime()) {
    try {
      resolution = decodeBooleanResult(
        await ethCall({
          rpcUrl: params.config.rpcUrl,
          to: params.config.oracleAddress,
          data: buildCallData(UMA_SETTLE_AND_GET_RESULT_SELECTOR, [
            encodeBytes32Param(params.config.assertionId),
          ]),
          timeoutMs: params.timeoutMs,
        }),
      );
    } catch {
      resolution = null;
    }
  }

  if (resolution === null) {
    const pendingAgeSeconds =
      expirationAt === null
        ? 0
        : Math.max(0, Math.trunc((Date.now() - expirationAt.getTime()) / 1_000));
    if (
      expirationAt &&
      params.config.maxPendingSeconds &&
      pendingAgeSeconds > params.config.maxPendingSeconds
    ) {
      return buildAppeal({
        reason: "oracle_dispute_pending_too_long",
        provider: "uma_oracle",
        market: params.market,
        title: "UMA assertion is still unresolved past the allowed waiting window.",
        description: `Assertion ${params.config.assertionId} for market ${params.market.slug} is still pending after expiry.`,
        payload,
        reportedAt: expirationAt,
        metadata: {
          bindingId: params.binding.id,
          maxPendingSeconds: params.config.maxPendingSeconds,
          pendingAgeSeconds,
        },
      });
    }

    return buildPending({
      bindingStatus: "pending",
      note: assertion.settled
        ? "UMA assertion already settled but the result was not readable."
        : "UMA assertion is still within liveness or awaiting dispute resolution.",
      payload,
      reportedAt: expirationAt,
    });
  }

  const winningOutcomeKey = resolution
    ? params.config.outcomeKeyIfTrue
    : (params.config.outcomeKeyIfFalse ?? null);
  if (!winningOutcomeKey) {
    return buildAppeal({
      reason: "manual_intervention_required",
      provider: "uma_oracle",
      market: params.market,
      title: "UMA assertion resolved false but the oracle binding has no fallback outcome.",
      description: `Assertion ${params.config.assertionId} resolved false for market ${params.market.slug}.`,
      payload,
      reportedAt: expirationAt,
      metadata: {
        bindingId: params.binding.id,
        resolution,
      },
    });
  }

  const oracle = buildOracle({
    source: "uma_oracle",
    externalRef: params.config.assertionId,
    reportedAt: expirationAt,
    payload,
  });

  return buildResolved({
    winningOutcomeKey,
    oracle,
    payload,
    reportedAt: expirationAt,
  });
};

export const evaluatePredictionMarketOracle = async (params: {
  market: MarketSnapshot;
  binding: OracleBindingRecord;
  timeoutMs: number;
}): Promise<PredictionMarketOracleEvaluationResult> => {
  const parsedBinding = PredictionMarketOracleBindingRequestSchema.safeParse({
    provider: params.binding.provider,
    name: params.binding.name ?? undefined,
    config: params.binding.config,
    metadata: params.binding.metadata,
  });

  if (!parsedBinding.success) {
    return buildAppeal({
      reason: "oracle_response_invalid",
      provider: params.binding.provider,
      market: params.market,
      title: "Stored oracle binding is invalid.",
      description: `Oracle binding ${params.binding.id} for market ${params.market.slug} could not be parsed.`,
      metadata: {
        bindingId: params.binding.id,
        issues: parsedBinding.error.issues.map((issue) => issue.message),
      },
    });
  }

  const binding = parsedBinding.data;
  switch (binding.provider) {
    case "manual_admin":
      return buildPending({
        bindingStatus: "manual_only",
        note: "Manual admin oracle bindings do not auto-settle.",
      });
    case "api_pull":
      return evaluateApiPullOracle({
        market: params.market,
        binding: params.binding,
        config: binding.config,
        timeoutMs: params.timeoutMs,
      });
    case "chainlink":
      return evaluateChainlinkOracle({
        market: params.market,
        binding: params.binding,
        config: binding.config,
        timeoutMs: params.timeoutMs,
      });
    case "uma_oracle":
      return evaluateUmaOracle({
        market: params.market,
        binding: params.binding,
        config: binding.config,
        timeoutMs: params.timeoutMs,
      });
  }
};
