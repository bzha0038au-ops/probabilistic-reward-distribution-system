import {
  jurisdictionRules,
  users,
} from "@reward/database";
import { asc, eq } from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  countryTierValues,
  jurisdictionFeatureValues,
  type CountryTier,
  type JurisdictionFeature,
  type JurisdictionRuleUpsert,
  type JurisdictionRestrictionReason,
  type UserFreezeScope,
} from "@reward/shared-types/risk";

import type { DbClient, DbTransaction } from "../../db";
import { db } from "../../db";
import { forbiddenError, notFoundError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { ensureUserFreeze, releaseUserFreezeByFilter } from "./service";

type DbExecutor = DbClient | DbTransaction;

type UserJurisdictionRow = {
  id: number;
  birthDate: string | null;
  registrationCountryCode: string | null;
  countryTier: CountryTier;
  countryResolvedAt: Date | null;
};

type StoredJurisdictionRule = {
  id: number | null;
  countryCode: string | null;
  minimumAge: number;
  allowedFeatures: JurisdictionFeature[];
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type UserJurisdictionState = {
  registrationCountryCode: string | null;
  birthDate: string | null;
  countryTier: CountryTier;
  minimumAge: number;
  userAge: number | null;
  isOfAge: boolean;
  allowedFeatures: JurisdictionFeature[];
  blockedScopes: UserFreezeScope[];
  restrictionReasons: JurisdictionRestrictionReason[];
  countryResolvedAt: Date | null;
};

type CountryResolutionInput = {
  headers: Record<string, unknown>;
  ip?: string | null;
};

const DEFAULT_ALLOWED_FEATURES = [...jurisdictionFeatureValues];
const JURISDICTION_FREEZE_REASONS = [
  "jurisdiction_restriction",
  "underage_restriction",
] as const;
const GEOIP_MODULE_NAME = "geoip-lite";

const FEATURE_SCOPE_MAP: Record<JurisdictionFeature, UserFreezeScope> = {
  real_money_gameplay: "gameplay_lock",
  topup: "topup_lock",
  withdrawal: "withdrawal_lock",
};

const JURISDICTION_MESSAGES: Record<JurisdictionFeature, string> = {
  real_money_gameplay:
    "Real-money gameplay is not available from your jurisdiction.",
  topup: "Top-ups are not available from your jurisdiction.",
  withdrawal: "Withdrawals are not available from your jurisdiction.",
};

const UNDERAGE_MESSAGES: Record<JurisdictionFeature, string> = {
  real_money_gameplay:
    "You must meet the minimum age requirement for real-money gameplay.",
  topup: "You must meet the minimum age requirement for top-ups.",
  withdrawal: "You must meet the minimum age requirement for withdrawals.",
};

const COUNTRY_HEADER_NAMES = [
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "x-vercel-ip-country",
  "x-country-code",
] as const;

let geoipLookupLoaded = false;
let geoipLookup: ((ip: string) => string | null) | null = null;

const isCountryTier = (value: unknown): value is CountryTier =>
  typeof value === "string" && countryTierValues.some((tier) => tier === value);

const normalizeCountryCode = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }

  if (normalized === "XX" || normalized === "T1") {
    return null;
  }

  return normalized;
};

const normalizeAllowedFeatures = (
  value: readonly JurisdictionFeature[] | null | undefined,
) => {
  const seen = new Set<JurisdictionFeature>();
  const normalized: JurisdictionFeature[] = [];

  for (const feature of value ?? []) {
    if (!jurisdictionFeatureValues.includes(feature) || seen.has(feature)) {
      continue;
    }

    seen.add(feature);
    normalized.push(feature);
  }

  return normalized;
};

const deriveCountryTier = (
  countryCode: string | null,
  allowedFeatures: readonly JurisdictionFeature[],
): CountryTier => {
  if (!countryCode) {
    return "unknown";
  }

  if (allowedFeatures.length === 0) {
    return "blocked";
  }

  if (allowedFeatures.length === DEFAULT_ALLOWED_FEATURES.length) {
    return "full";
  }

  return "restricted";
};

const calculateAge = (birthDate: string | null) => {
  if (!birthDate) {
    return null;
  }

  const [year, month, day] = birthDate.split("-").map((part) => Number(part));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

const toUserJurisdictionRow = (
  value: typeof users.$inferSelect | null,
): UserJurisdictionRow | null => {
  if (!value) {
    return null;
  }

  const countryTier = isCountryTier(value.countryTier)
    ? value.countryTier
    : "unknown";

  return {
    id: value.id,
    birthDate: value.birthDate ?? null,
    registrationCountryCode: value.registrationCountryCode ?? null,
    countryTier,
    countryResolvedAt: value.countryResolvedAt ?? null,
  };
};

const readGeoipLookupCandidate = (value: unknown) => {
  if (typeof value === "function") {
    return value as (ip: string) => unknown;
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const lookup = Reflect.get(value, "lookup");
  return typeof lookup === "function" ? (lookup as (ip: string) => unknown) : null;
};

const getGeoipLookup = async () => {
  if (geoipLookupLoaded) {
    return geoipLookup;
  }

  geoipLookupLoaded = true;

  try {
    const geoipModule = (await import(GEOIP_MODULE_NAME)) as unknown;
    const lookup =
      readGeoipLookupCandidate(geoipModule) ??
      readGeoipLookupCandidate(Reflect.get(geoipModule as object, "default"));

    if (!lookup) {
      return null;
    }

    geoipLookup = (ip: string) => {
      const result = lookup(ip);
      if (typeof result !== "object" || result === null) {
        return null;
      }

      return normalizeCountryCode(
        typeof Reflect.get(result, "country") === "string"
          ? String(Reflect.get(result, "country"))
          : null,
      );
    };
  } catch (error) {
    logger.debug("geoip lookup module unavailable", {
      module: GEOIP_MODULE_NAME,
      error: error instanceof Error ? error.message : "unknown",
    });
    geoipLookup = null;
  }

  return geoipLookup;
};

const resolveCountryCodeFromHeaders = (headers: Record<string, unknown>) => {
  for (const headerName of COUNTRY_HEADER_NAMES) {
    const rawValue = headers[headerName];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value !== "string") {
      continue;
    }

    const countryCode = normalizeCountryCode(value);
    if (countryCode) {
      return countryCode;
    }
  }

  return null;
};

const loadUserJurisdictionRow = async (
  userId: number,
  executor: DbExecutor = db,
) => {
  const [row] = await executor
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = toUserJurisdictionRow(row ?? null);
  if (!user) {
    throw notFoundError("User not found.", {
      code: API_ERROR_CODES.USER_NOT_FOUND,
    });
  }

  return user;
};

const resolveStoredRule = async (
  countryCode: string | null,
  executor: DbExecutor = db,
): Promise<StoredJurisdictionRule> => {
  if (!countryCode) {
    return {
      id: null,
      countryCode: null,
      minimumAge: 18,
      allowedFeatures: [...DEFAULT_ALLOWED_FEATURES],
      notes: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  const [row] = await executor
    .select()
    .from(jurisdictionRules)
    .where(eq(jurisdictionRules.countryCode, countryCode))
    .limit(1);

  if (!row) {
    return {
      id: null,
      countryCode,
      minimumAge: 18,
      allowedFeatures: [...DEFAULT_ALLOWED_FEATURES],
      notes: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    countryCode: row.countryCode,
    minimumAge: row.minimumAge,
    allowedFeatures: normalizeAllowedFeatures(row.allowedFeatures),
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const buildJurisdictionState = (
  user: UserJurisdictionRow,
  rule: StoredJurisdictionRule,
  countryCodeOverride?: string | null,
): UserJurisdictionState => {
  const registrationCountryCode =
    countryCodeOverride ?? user.registrationCountryCode ?? null;
  const userAge = calculateAge(user.birthDate);
  const isOfAge = userAge === null || userAge >= rule.minimumAge;
  const allowedFeatureSet = new Set(
    isOfAge ? rule.allowedFeatures : ([] as JurisdictionFeature[]),
  );
  const allowedFeatures = DEFAULT_ALLOWED_FEATURES.filter((feature) =>
    allowedFeatureSet.has(feature),
  );
  const blockedScopes = DEFAULT_ALLOWED_FEATURES.filter(
    (feature) => !allowedFeatureSet.has(feature),
  ).map((feature) => FEATURE_SCOPE_MAP[feature]);
  const restrictionReasons: JurisdictionRestrictionReason[] = [];

  if (userAge !== null && !isOfAge) {
    restrictionReasons.push("underage_restriction");
  }
  if (isOfAge && blockedScopes.length > 0) {
    restrictionReasons.push("jurisdiction_restriction");
  }

  return {
    registrationCountryCode,
    birthDate: user.birthDate,
    countryTier: deriveCountryTier(registrationCountryCode, allowedFeatures),
    minimumAge: rule.minimumAge,
    userAge,
    isOfAge,
    allowedFeatures,
    blockedScopes: [...new Set(blockedScopes)],
    restrictionReasons,
    countryResolvedAt: user.countryResolvedAt,
  };
};

const resolveFreezeReason = (state: UserJurisdictionState) =>
  state.restrictionReasons.includes("underage_restriction")
    ? "underage_restriction"
    : "jurisdiction_restriction";

const buildFreezeMetadata = (state: UserJurisdictionState) => ({
  registrationCountryCode: state.registrationCountryCode,
  countryTier: state.countryTier,
  minimumAge: state.minimumAge,
  userAge: state.userAge,
  allowedFeatures: state.allowedFeatures,
  blockedScopes: state.blockedScopes,
  restrictionReasons: state.restrictionReasons,
});

export const resolveRequestCountryCode = async (
  input: CountryResolutionInput,
) => {
  const headerCountryCode = resolveCountryCodeFromHeaders(input.headers);
  if (headerCountryCode) {
    return headerCountryCode;
  }

  const lookup = await getGeoipLookup();
  if (!lookup || !input.ip) {
    return null;
  }

  return lookup(input.ip);
};

export async function getUserJurisdictionState(
  userId: number,
  options: {
    executor?: DbExecutor;
    countryCodeOverride?: string | null;
  } = {},
) {
  const executor = options.executor ?? db;
  const user = await loadUserJurisdictionRow(userId, executor);
  const countryCode =
    normalizeCountryCode(options.countryCodeOverride) ??
    user.registrationCountryCode;
  const rule = await resolveStoredRule(countryCode, executor);

  return buildJurisdictionState(user, rule, countryCode);
}

export async function syncUserJurisdictionState(
  params: {
    userId: number;
    countryCodeOverride?: string | null;
  },
  options: {
    executor?: DbExecutor;
  } = {},
) {
  const executor = options.executor ?? db;
  const user = await loadUserJurisdictionRow(params.userId, executor);
  const countryCode =
    normalizeCountryCode(params.countryCodeOverride) ??
    user.registrationCountryCode;
  const rule = await resolveStoredRule(countryCode, executor);
  const now = new Date();

  if (
    countryCode &&
    (user.registrationCountryCode !== countryCode || !user.countryResolvedAt)
  ) {
    await executor
      .update(users)
      .set({
        registrationCountryCode: countryCode,
        countryResolvedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    user.registrationCountryCode = countryCode;
    user.countryResolvedAt = now;
  }

  const state = buildJurisdictionState(user, rule, countryCode);
  if (user.countryTier !== state.countryTier) {
    await executor
      .update(users)
      .set({
        countryTier: state.countryTier,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
  }

  for (const scope of Object.values(FEATURE_SCOPE_MAP)) {
    if (state.blockedScopes.includes(scope)) {
      continue;
    }

    for (const reason of JURISDICTION_FREEZE_REASONS) {
      await releaseUserFreezeByFilter(
        {
          userId: user.id,
          reason,
          scope,
        },
        executor,
      );
    }
  }

  if (state.blockedScopes.length > 0 && state.restrictionReasons.length > 0) {
    const reason = resolveFreezeReason(state);

    for (const scope of state.blockedScopes) {
      await ensureUserFreeze(
        {
          userId: user.id,
          category: "compliance",
          reason,
          scope,
          metadata: buildFreezeMetadata(state),
        },
        { executor },
      );
    }
  }

  return state;
}

export async function assertUserJurisdictionFeatureAllowed(
  userId: number,
  feature: JurisdictionFeature,
  executor: DbExecutor = db,
) {
  const state = await getUserJurisdictionState(userId, { executor });
  if (state.allowedFeatures.includes(feature)) {
    return;
  }

  const underage = state.restrictionReasons.includes("underage_restriction");
  throw forbiddenError(
    underage ? UNDERAGE_MESSAGES[feature] : JURISDICTION_MESSAGES[feature],
    {
      code: underage
        ? API_ERROR_CODES.UNDERAGE_RESTRICTED
        : API_ERROR_CODES.JURISDICTION_RESTRICTED,
    },
  );
}

export async function listJurisdictionRules(executor: DbExecutor = db) {
  const rows = await executor
    .select()
    .from(jurisdictionRules)
    .orderBy(asc(jurisdictionRules.countryCode), asc(jurisdictionRules.id));

  return rows.map((row) => ({
    id: row.id,
    countryCode: row.countryCode,
    minimumAge: row.minimumAge,
    allowedFeatures: normalizeAllowedFeatures(row.allowedFeatures),
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function upsertJurisdictionRule(payload: JurisdictionRuleUpsert) {
  const countryCode = normalizeCountryCode(payload.countryCode);
  if (!countryCode) {
    throw forbiddenError("Country code must be a valid ISO alpha-2 code.", {
      code: API_ERROR_CODES.INVALID_REQUEST,
    });
  }

  const allowedFeatures = normalizeAllowedFeatures(payload.allowedFeatures);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(jurisdictionRules)
    .where(eq(jurisdictionRules.countryCode, countryCode))
    .limit(1);

  const [saved] = existing
    ? await db
        .update(jurisdictionRules)
        .set({
          minimumAge: payload.minimumAge,
          allowedFeatures,
          notes: payload.notes?.trim() || null,
          updatedAt: now,
        })
        .where(eq(jurisdictionRules.id, existing.id))
        .returning()
    : await db
        .insert(jurisdictionRules)
        .values({
          countryCode,
          minimumAge: payload.minimumAge,
          allowedFeatures,
          notes: payload.notes?.trim() || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

  const impactedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.registrationCountryCode, countryCode));

  for (const impactedUser of impactedUsers) {
    await syncUserJurisdictionState({ userId: impactedUser.id, countryCodeOverride: countryCode });
  }

  return {
    id: saved.id,
    countryCode: saved.countryCode,
    minimumAge: saved.minimumAge,
    allowedFeatures: normalizeAllowedFeatures(saved.allowedFeatures),
    notes: saved.notes ?? null,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}
