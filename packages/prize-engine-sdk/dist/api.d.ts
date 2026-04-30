import type { ApiResponse } from "@reward/shared-types/api";
import { type PrizeEngineDrawRequest, type PrizeEngineObservabilityDistributionQuery, type PrizeEngineRewardRequest, type PrizeEngineRewardResponse, type SaaSEnvironment } from "@reward/shared-types/saas";
export type PrizeEngineApiResult<T> = ApiResponse<T>;
export declare const PRIZE_ENGINE_API_ROUTES: {
    readonly overview: "/v1/engine/overview";
    readonly fairnessCommit: "/v1/engine/fairness/commit";
    readonly fairnessReveal: "/v1/engine/fairness/reveal";
    readonly observabilityDistribution: "/v1/engine/observability/distribution";
    readonly rewards: "/v1/engine/rewards";
    readonly draws: "/v1/engine/draws";
    readonly ledger: "/v1/engine/ledger";
};
export declare const PRIZE_ENGINE_AGENT_ID_HEADER = "X-Agent-Id";
type AsyncValue<T> = T | Promise<T>;
type PrizeEngineSleep = (delayMs: number) => Promise<void>;
type PrizeEngineObservabilityDistributionInput = Omit<PrizeEngineObservabilityDistributionQuery, "environment">;
export type PrizeEngineRetryOptions = {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
    retryableStatusCodes: readonly number[];
    respectRetryAfter: boolean;
};
export type PrizeEngineRuntime = {
    baseUrl: string;
    environment: SaaSEnvironment;
    fetchImpl?: typeof fetch;
    getApiKey?: () => AsyncValue<string | null | undefined>;
    getHeaders?: () => AsyncValue<Record<string, string> | undefined>;
    retry?: Partial<PrizeEngineRetryOptions> | false;
    sleep?: PrizeEngineSleep;
    random?: () => number;
};
export type PrizeEngineRequestOverrides = {
    baseUrl?: string;
    apiKey?: string | null;
    agentId?: string | null;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
    retry?: Partial<PrizeEngineRetryOptions> | false;
    idempotencyKey?: string;
};
export declare const createPrizeEngineIdempotencyKey: () => string;
export declare function parsePrizeEngineResponse<T>(response: Response): Promise<PrizeEngineApiResult<T>>;
export declare function requestPrizeEngineApi<T>(runtime: PrizeEngineRuntime, path: string, init?: RequestInit, overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<T>>;
export declare function createPrizeEngineClient(runtime: PrizeEngineRuntime): {
    request: <T>(path: string, init?: RequestInit, overrides?: PrizeEngineRequestOverrides) => Promise<PrizeEngineApiResult<T>>;
    getOverview(overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<{
        fairness: {
            epoch: number;
            epochSeconds: number;
            commitHash: string;
        };
        prizes: {
            id: number;
            name: string;
            rewardAmount: string;
            displayRarity: "common" | "rare" | "epic" | "legendary";
            stock: number;
            stockState: "available" | "low" | "sold_out";
            isFeatured: boolean;
        }[];
        featuredPrizes: {
            id: number;
            name: string;
            rewardAmount: string;
            displayRarity: "common" | "rare" | "epic" | "legendary";
            stock: number;
            stockState: "available" | "low" | "sold_out";
            isFeatured: boolean;
        }[];
        project: {
            status: "active" | "suspended" | "archived";
            id: number;
            name: string;
            drawCost: string;
            maxDrawCount: number;
            currency: string;
            slug: string;
            tenantId: number;
            environment: "sandbox" | "live";
            prizePoolBalance: string;
            strategy: "weighted_gacha" | "epsilon_greedy" | "softmax" | "thompson";
            strategyParams: Record<string, unknown>;
            fairnessEpochSeconds: number;
            missWeight: number;
        };
    }>>;
    getFairnessCommit(overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<{
        epoch: number;
        epochSeconds: number;
        commitHash: string;
    }>>;
    revealFairnessSeed(epoch: number, overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<{
        epoch: number;
        epochSeconds: number;
        commitHash: string;
        seed: string;
        revealedAt: string | Date;
    }>>;
    reward(payload: PrizeEngineRewardRequest, overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<PrizeEngineRewardResponse>>;
    /**
     * @deprecated Use `client.reward()` so agent/behavior context, idempotency,
     * and retry semantics stay aligned.
     */
    draw(payload: PrizeEngineDrawRequest, overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<{
        agent: {
            status: "active" | "suspended" | "archived";
            id: number;
            createdAt: string | Date;
            projectId: number;
            agentId: string;
            fingerprint?: string | null | undefined;
            groupId?: string | null | undefined;
            ownerMetadata?: Record<string, unknown> | null | undefined;
        };
        player: {
            id: number;
            createdAt: string | Date;
            balance: string;
            updatedAt: string | Date;
            projectId: number;
            externalPlayerId: string;
            displayName: string | null;
            pityStreak: number;
            metadata?: Record<string, unknown> | null | undefined;
        };
        result: {
            status: string;
            id: number;
            rewardAmount: string;
            prizeId: number | null;
            drawCost: string;
            createdAt: string | Date;
            fairness: {
                clientNonce?: string | null | undefined;
                epoch?: number | undefined;
                epochSeconds?: number | undefined;
                commitHash?: string | undefined;
                nonceSource?: "client" | "server" | undefined;
                rngDigest?: string | null | undefined;
                totalWeight?: number | null | undefined;
                randomPick?: number | null | undefined;
                algorithm?: string | undefined;
                strategy?: "weighted_gacha" | "epsilon_greedy" | "softmax" | "thompson" | undefined;
                risk?: {
                    inputRisk: number;
                    previousAccumulatedRisk: number;
                    decayedAccumulatedRisk: number;
                    effectiveRisk: number;
                    weightDecayAlpha: number;
                    riskStateHalfLifeSeconds: number;
                    weightMultiplier: number;
                    basePrizeWeightTotal: number;
                    adjustedPrizeWeightTotal: number;
                } | null | undefined;
                serverNonce?: string | null | undefined;
                epsilon?: number | null | undefined;
                temperature?: number | null | undefined;
                decision?: "explore" | "exploit" | null | undefined;
                selectionDigest?: string | null | undefined;
                candidateCount?: number | null | undefined;
                selectedArmId?: number | null | undefined;
                selectedArmKind?: "miss" | "prize" | null | undefined;
                selectedArmScore?: number | null | undefined;
                selectedArmProbability?: number | null | undefined;
                priorAlpha?: number | null | undefined;
                priorBeta?: number | null | undefined;
                priorStrength?: number | null | undefined;
                scoreNormalizationMax?: number | null | undefined;
            } | null;
            playerId: number;
            prize?: {
                id: number;
                name: string;
                rewardAmount: string;
                displayRarity: "common" | "rare" | "epic" | "legendary";
                stock: number;
                stockState: "available" | "low" | "sold_out";
                isFeatured: boolean;
            } | null | undefined;
            selectionStrategy?: string | undefined;
            envelope?: {
                mode: "mute" | "normal";
                triggered: {
                    window: "minute" | "hour" | "day";
                    strategy: "reject" | "mute";
                    reason: "budget_cap" | "variance_cap" | "anti_exploit";
                    scope: "tenant" | "project" | "group" | "agent";
                }[];
            } | undefined;
        };
        legacy?: {
            mode: "legacy_gacha";
            route: "/v1/engine/draws";
            deprecated: true;
            sunsetAt: string | Date;
        } | undefined;
    }>>;
    getLedger(playerId: string, limit?: number, overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<{
        entries: {
            id: number;
            createdAt: string | Date;
            amount: string;
            environment: "sandbox" | "live";
            projectId: number;
            playerId: number;
            entryType: string;
            balanceBefore: string;
            balanceAfter: string;
            metadata?: Record<string, unknown> | null | undefined;
            referenceType?: string | null | undefined;
            referenceId?: number | null | undefined;
        }[];
        agent: {
            status: "active" | "suspended" | "archived";
            id: number;
            createdAt: string | Date;
            projectId: number;
            agentId: string;
            fingerprint?: string | null | undefined;
            groupId?: string | null | undefined;
            ownerMetadata?: Record<string, unknown> | null | undefined;
        };
        player: {
            id: number;
            createdAt: string | Date;
            balance: string;
            updatedAt: string | Date;
            projectId: number;
            externalPlayerId: string;
            displayName: string | null;
            pityStreak: number;
            metadata?: Record<string, unknown> | null | undefined;
        };
    }>>;
    observability: {
        distribution(query?: PrizeEngineObservabilityDistributionInput, overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<{
            project: {
                status: "active" | "suspended" | "archived";
                id: number;
                name: string;
                drawCost: string;
                maxDrawCount: number;
                currency: string;
                slug: string;
                tenantId: number;
                environment: "sandbox" | "live";
                prizePoolBalance: string;
                fairnessEpochSeconds: number;
                missWeight: number;
            };
            window: {
                days: number;
                startedAt: string | Date;
                endedAt: string | Date;
                baseline: "current_catalog";
            };
            summary: {
                winCount: number;
                actualRewardAmount: string;
                totalDrawCount: number;
                uniquePlayerCount: number;
                missCount: number;
                hitRate: number;
                expectedHitRate: number;
                hitRateDrift: number;
                actualDrawCostAmount: string;
                expectedRewardAmount: string;
                actualPayoutRate: number;
                expectedPayoutRate: number;
                payoutRateDrift: number;
            };
            distribution: {
                prizeId: number | null;
                label: string;
                bucketKey: string;
                kind: "miss" | "prize" | "retired_prize";
                configuredWeight: number;
                configuredRewardAmount: string | null;
                expectedProbability: number;
                actualDrawCount: number;
                actualProbability: number;
                actualRewardAmount: string;
                probabilityDrift: number;
                expectedPayoutRateContribution: number;
                actualPayoutRateContribution: number;
            }[];
        }>>;
    };
    /**
     * @deprecated Use `client.observability.distribution()` instead.
     */
    getObservabilityDistribution(query?: PrizeEngineObservabilityDistributionInput, overrides?: PrizeEngineRequestOverrides): Promise<PrizeEngineApiResult<{
        project: {
            status: "active" | "suspended" | "archived";
            id: number;
            name: string;
            drawCost: string;
            maxDrawCount: number;
            currency: string;
            slug: string;
            tenantId: number;
            environment: "sandbox" | "live";
            prizePoolBalance: string;
            fairnessEpochSeconds: number;
            missWeight: number;
        };
        window: {
            days: number;
            startedAt: string | Date;
            endedAt: string | Date;
            baseline: "current_catalog";
        };
        summary: {
            winCount: number;
            actualRewardAmount: string;
            totalDrawCount: number;
            uniquePlayerCount: number;
            missCount: number;
            hitRate: number;
            expectedHitRate: number;
            hitRateDrift: number;
            actualDrawCostAmount: string;
            expectedRewardAmount: string;
            actualPayoutRate: number;
            expectedPayoutRate: number;
            payoutRateDrift: number;
        };
        distribution: {
            prizeId: number | null;
            label: string;
            bucketKey: string;
            kind: "miss" | "prize" | "retired_prize";
            configuredWeight: number;
            configuredRewardAmount: string | null;
            expectedProbability: number;
            actualDrawCount: number;
            actualProbability: number;
            actualRewardAmount: string;
            probabilityDrift: number;
            expectedPayoutRateContribution: number;
            actualPayoutRateContribution: number;
        }[];
    }>>;
};
export type PrizeEngineClient = ReturnType<typeof createPrizeEngineClient>;
export {};
