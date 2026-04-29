import Decimal from "decimal.js";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  SaasBillingBudgetAlertState,
  SaasBillingBudgetPolicy,
  SaasBillingBudgetPolicyPatch,
} from "@reward/shared-types/saas";

import { badRequestError } from "../../shared/errors";
import { toMoneyString } from "../../shared/money";

type BillingBudgetPolicyStored = {
  monthlyBudget: string | null;
  alertThresholdPct: number | null;
  hardCap: string | null;
  alertEmailEnabled: boolean;
  alertWebhookUrl: string | null;
  alertWebhookSecret: string | null;
};

export type BillingBudgetAlertKind =
  | "threshold"
  | "forecast7d"
  | "forecast30d"
  | "hardCap";

const BILLING_BUDGET_POLICY_METADATA_KEY = "budgetPolicy";
const BILLING_BUDGET_STATE_METADATA_KEY = "budgetState";

const toRecord = (value: unknown): Record<string, unknown> | null => {
  let current = value;

  while (typeof current === "string" && current.trim() !== "") {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return null;
    }
  }

  if (
    typeof current === "object" &&
    current !== null &&
    !Array.isArray(current)
  ) {
    return Object.fromEntries(Object.entries(current)) as Record<
      string,
      unknown
    >;
  }

  return null;
};

const toTrimmedStringOrNull = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toPercentOrNull = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 0 || value > 100) {
    return null;
  }

  return Number(value.toFixed(2));
};

const toDateLikeOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

const emptyBudgetState = (): SaasBillingBudgetAlertState => ({
  month: null,
  thresholdAlertedAt: null,
  forecast7dAlertedAt: null,
  forecast30dAlertedAt: null,
  hardCapReachedAt: null,
  hardCapAlertedAt: null,
});

export const resolveBillingBudgetMonthKey = (now = new Date()) =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

export const readSaasBillingBudgetState = (
  metadata: unknown,
): SaasBillingBudgetAlertState => {
  const source = toRecord(metadata);
  const node = source
    ? toRecord(Reflect.get(source, BILLING_BUDGET_STATE_METADATA_KEY))
    : null;

  return {
    month: toTrimmedStringOrNull(node?.month),
    thresholdAlertedAt: toDateLikeOrNull(node?.thresholdAlertedAt),
    forecast7dAlertedAt: toDateLikeOrNull(node?.forecast7dAlertedAt),
    forecast30dAlertedAt: toDateLikeOrNull(node?.forecast30dAlertedAt),
    hardCapReachedAt: toDateLikeOrNull(node?.hardCapReachedAt),
    hardCapAlertedAt: toDateLikeOrNull(node?.hardCapAlertedAt),
  };
};

export const readStoredSaasBillingBudgetPolicy = (
  metadata: unknown,
): BillingBudgetPolicyStored => {
  const source = toRecord(metadata);
  const node = source
    ? toRecord(Reflect.get(source, BILLING_BUDGET_POLICY_METADATA_KEY))
    : null;

  return {
    monthlyBudget: toTrimmedStringOrNull(node?.monthlyBudget),
    alertThresholdPct: toPercentOrNull(node?.alertThresholdPct),
    hardCap: toTrimmedStringOrNull(node?.hardCap),
    alertEmailEnabled:
      typeof node?.alertEmailEnabled === "boolean"
        ? node.alertEmailEnabled
        : true,
    alertWebhookUrl: toTrimmedStringOrNull(node?.alertWebhookUrl),
    alertWebhookSecret: toTrimmedStringOrNull(node?.alertWebhookSecret),
  };
};

export const readSaasBillingBudgetPolicy = (
  metadata: unknown,
): SaasBillingBudgetPolicy => {
  const policy = readStoredSaasBillingBudgetPolicy(metadata);
  return {
    monthlyBudget: policy.monthlyBudget,
    alertThresholdPct: policy.alertThresholdPct,
    hardCap: policy.hardCap,
    alertEmailEnabled: policy.alertEmailEnabled,
    alertWebhookUrl: policy.alertWebhookUrl,
    alertWebhookConfigured: Boolean(
      policy.alertWebhookUrl && policy.alertWebhookSecret,
    ),
    state: readSaasBillingBudgetState(metadata),
  };
};

export const redactBillingMetadata = (
  metadata: unknown,
): Record<string, unknown> | null => {
  const source = toRecord(metadata);
  if (!source) {
    return null;
  }

  const redacted = Object.fromEntries(Object.entries(source)) as Record<
    string,
    unknown
  >;
  const budgetPolicy = toRecord(redacted[BILLING_BUDGET_POLICY_METADATA_KEY]);
  if (!budgetPolicy) {
    return redacted;
  }

  const nextBudgetPolicy = {
    ...budgetPolicy,
  };
  delete nextBudgetPolicy.alertWebhookSecret;
  redacted[BILLING_BUDGET_POLICY_METADATA_KEY] = nextBudgetPolicy;

  return redacted;
};

const normalizeMoneyOrNull = (value: string | null) =>
  value === null ? null : toMoneyString(value);

const validateStoredPolicy = (policy: BillingBudgetPolicyStored) => {
  const monthlyBudget = normalizeMoneyOrNull(policy.monthlyBudget);
  const hardCap = normalizeMoneyOrNull(policy.hardCap);

  if (policy.alertThresholdPct !== null && monthlyBudget === null) {
    throw badRequestError(
      "Monthly budget is required when an alert threshold is configured.",
      {
        code: API_ERROR_CODES.INVALID_REQUEST,
      },
    );
  }

  if (
    monthlyBudget !== null &&
    hardCap !== null &&
    new Decimal(hardCap).lt(monthlyBudget)
  ) {
    throw badRequestError(
      "Hard cap must be greater than or equal to the monthly budget target.",
      {
        code: API_ERROR_CODES.INVALID_REQUEST,
      },
    );
  }

  if (policy.alertWebhookUrl && !policy.alertWebhookSecret) {
    throw badRequestError(
      "Webhook secret is required when a billing alert webhook URL is configured.",
      {
        code: API_ERROR_CODES.INVALID_REQUEST,
      },
    );
  }

  return {
    ...policy,
    monthlyBudget,
    hardCap,
  };
};

const mergeBudgetMetadata = (
  existingMetadata: unknown,
  policy: BillingBudgetPolicyStored,
  state: SaasBillingBudgetAlertState,
) => {
  const source = toRecord(existingMetadata) ?? {};
  const nextMetadata = {
    ...source,
    [BILLING_BUDGET_POLICY_METADATA_KEY]: {
      monthlyBudget: policy.monthlyBudget,
      alertThresholdPct: policy.alertThresholdPct,
      hardCap: policy.hardCap,
      alertEmailEnabled: policy.alertEmailEnabled,
      alertWebhookUrl: policy.alertWebhookUrl,
      alertWebhookSecret: policy.alertWebhookSecret,
    },
    [BILLING_BUDGET_STATE_METADATA_KEY]: state,
  } satisfies Record<string, unknown>;

  return nextMetadata;
};

export const applySaasBillingBudgetPolicyPatch = (
  existingMetadata: unknown,
  patch: Omit<SaasBillingBudgetPolicyPatch, "tenantId">,
) => {
  const current = readStoredSaasBillingBudgetPolicy(existingMetadata);
  const state = readSaasBillingBudgetState(existingMetadata);
  const normalizedMonthlyBudget =
    patch.monthlyBudget === undefined
      ? undefined
      : patch.monthlyBudget === null
        ? null
        : toMoneyString(patch.monthlyBudget);
  const normalizedHardCap =
    patch.hardCap === undefined
      ? undefined
      : patch.hardCap === null
        ? null
        : toMoneyString(patch.hardCap);
  const next = {
    ...current,
    ...(normalizedMonthlyBudget !== undefined
      ? { monthlyBudget: normalizedMonthlyBudget }
      : {}),
    ...(patch.alertThresholdPct !== undefined
      ? { alertThresholdPct: patch.alertThresholdPct }
      : {}),
    ...(normalizedHardCap !== undefined ? { hardCap: normalizedHardCap } : {}),
    ...(patch.alertEmailEnabled !== undefined
      ? { alertEmailEnabled: patch.alertEmailEnabled }
      : {}),
    ...(patch.alertWebhookUrl !== undefined
      ? { alertWebhookUrl: patch.alertWebhookUrl }
      : {}),
  } satisfies BillingBudgetPolicyStored;

  if (patch.clearAlertWebhook) {
    next.alertWebhookUrl = null;
    next.alertWebhookSecret = null;
  } else if (patch.alertWebhookSecret !== undefined) {
    next.alertWebhookSecret = patch.alertWebhookSecret;
  }

  if (!next.alertWebhookUrl) {
    next.alertWebhookSecret = null;
  }

  const validated = validateStoredPolicy(next);
  return mergeBudgetMetadata(existingMetadata, validated, state);
};

const resetBudgetStateForMonth = (month: string): SaasBillingBudgetAlertState => ({
  ...emptyBudgetState(),
  month,
});

const setBudgetStateField = (
  field:
    | "thresholdAlertedAt"
    | "forecast7dAlertedAt"
    | "forecast30dAlertedAt"
    | "hardCapReachedAt"
    | "hardCapAlertedAt",
  metadata: unknown,
  month: string,
  at: Date,
) => {
  const currentState = readSaasBillingBudgetState(metadata);
  const state =
    currentState.month === month
      ? {
          ...currentState,
        }
      : resetBudgetStateForMonth(month);
  state[field] = at.toISOString();

  return mergeBudgetMetadata(
    metadata,
    validateStoredPolicy(readStoredSaasBillingBudgetPolicy(metadata)),
    state,
  );
};

export const markSaasBillingBudgetAlertSent = (
  metadata: unknown,
  kind: BillingBudgetAlertKind,
  at = new Date(),
) => {
  const month = resolveBillingBudgetMonthKey(at);
  const field =
    kind === "threshold"
      ? "thresholdAlertedAt"
      : kind === "forecast7d"
        ? "forecast7dAlertedAt"
        : kind === "forecast30d"
          ? "forecast30dAlertedAt"
          : "hardCapAlertedAt";

  return setBudgetStateField(field, metadata, month, at);
};

export const markSaasBillingHardCapReached = (
  metadata: unknown,
  at = new Date(),
) => {
  const month = resolveBillingBudgetMonthKey(at);
  return setBudgetStateField("hardCapReachedAt", metadata, month, at);
};

export const isSaasBillingHardCapActive = (
  metadata: unknown,
  now = new Date(),
) => {
  const policy = readStoredSaasBillingBudgetPolicy(metadata);
  if (!policy.hardCap) {
    return false;
  }

  const state = readSaasBillingBudgetState(metadata);
  return (
    state.month === resolveBillingBudgetMonthKey(now) &&
    Boolean(state.hardCapReachedAt)
  );
};

export const hasSaasBillingBudgetAlertBeenSent = (
  metadata: unknown,
  kind: BillingBudgetAlertKind,
  now = new Date(),
) => {
  const state = readSaasBillingBudgetState(metadata);
  if (state.month !== resolveBillingBudgetMonthKey(now)) {
    return false;
  }

  if (kind === "threshold") {
    return Boolean(state.thresholdAlertedAt);
  }
  if (kind === "forecast7d") {
    return Boolean(state.forecast7dAlertedAt);
  }
  if (kind === "forecast30d") {
    return Boolean(state.forecast30dAlertedAt);
  }

  return Boolean(state.hardCapAlertedAt);
};

export const readSaasBillingBudgetWebhookSecret = (metadata: unknown) =>
  readStoredSaasBillingBudgetPolicy(metadata).alertWebhookSecret;
