import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppInstance } from "./types";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import {
  PrizeEngineDrawRequestSchema,
  PrizeEngineEnvironmentQuerySchema,
  PrizeEngineFairnessRevealQuerySchema,
  PrizeEngineLedgerQuerySchema,
  PrizeEngineObservabilityDistributionQuerySchema,
  PrizeEngineRewardRequestSchema,
  type PrizeEngineDrawRequest,
  type PrizeEngineRewardRequest,
  type PrizeEngineApiKeyScope,
} from "@reward/shared-types/saas";

import {
  applyProjectAgentControl,
  authenticateProjectApiKey,
  createPrizeEngineDraw,
  createPrizeEngineReward,
  getPrizeEngineFairnessCommit,
  getPrizeEngineLedger,
  getPrizeEngineObservabilityDistribution,
  getPrizeEngineOverview,
  recordPrizeEngineUsageEvent,
  revealPrizeEngineFairnessSeed,
} from "../../modules/saas/service";
import { PRIZE_ENGINE_WRITE_SCOPE_ALIASES } from "../../modules/saas/prize-engine-domain";
import { recordSaasStatusApiRequest } from "../../modules/saas-status/service";
import {
  mergePrizeEngineAgentSignals,
  consumePrizeEngineApiRateLimit,
  runPrizeEngineAntiExploitPipeline,
} from "../../modules/saas/prize-engine-rate-limit";
import {
  enterPrizeEngineExecutionGovernor,
  readPrizeEngineGovernorRetryAfterSeconds,
} from "../../modules/saas/prize-engine-governor";
import { recordAuthEvent } from "../../modules/audit/service";
import { getConfig } from "../../shared/config";
import { createRateLimiter } from "../../shared/rate-limit";
import { resolveUserAgent } from "./auth/support";
import { parseSchema } from "../../shared/validation";
import { sendError, sendErrorForException, sendSuccess } from "../respond";
import { toObject } from "../utils";

let prizeEngineAuthFailureRateLimiter: ReturnType<typeof createRateLimiter> | null =
  null;

const SANDBOX_WARNING_HEADER =
  '299 reward "Sandbox environment: non-billable and isolated from live distribution."';
const LEGACY_DRAWS_SUNSET_AT = "Tue, 28 Oct 2026 00:00:00 GMT";
const PRIZE_ENGINE_REWARD_ROUTE = "/v1/engine/rewards";
const PRIZE_ENGINE_DRAW_ROUTE = "/v1/engine/draws";

const getPrizeEngineAuthFailureRateLimiter = () => {
  if (!prizeEngineAuthFailureRateLimiter) {
    const config = getConfig();
    prizeEngineAuthFailureRateLimiter = createRateLimiter({
      limit: config.rateLimitGlobalMax,
      windowMs: config.rateLimitGlobalWindowMs,
      prefix: "prize-engine:auth-failure",
    });
  }

  return prizeEngineAuthFailureRateLimiter;
};

const readApiKey = (request: FastifyRequest) => {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const apiKeyHeader = request.headers["x-api-key"];
  if (Array.isArray(apiKeyHeader)) {
    return apiKeyHeader[0]?.trim() || null;
  }

  return typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : null;
};

const readAgentIdValue = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 128) {
    throw new RangeError("INVALID_AGENT_ID");
  }

  return trimmed;
};

const readAgentId = (request: FastifyRequest) => {
  const agentIdHeader = request.headers["x-agent-id"];
  const rawAgentId = Array.isArray(agentIdHeader)
    ? agentIdHeader[0]
    : agentIdHeader;

  return readAgentIdValue(rawAgentId);
};

const readRewardAgentIdFromBody = (request: FastifyRequest) => {
  const agent = Reflect.get(toObject(request.body), "agent");
  return readAgentIdValue(Reflect.get(toObject(agent), "agentId"));
};

const readLegacyRewardContextAgentIdFromBody = (request: FastifyRequest) => {
  const rewardContext = Reflect.get(toObject(request.body), "rewardContext");
  const agent = Reflect.get(toObject(rewardContext), "agent");
  return readAgentIdValue(Reflect.get(toObject(agent), "agentId"));
};

const readLegacyPlayerIdFromBody = (request: FastifyRequest) => {
  const player = Reflect.get(toObject(request.body), "player");
  return readAgentIdValue(Reflect.get(toObject(player), "playerId"));
};

const resolvePrizeEngineRequestAgentId = (request: FastifyRequest) => {
  const headerAgentId = readAgentId(request);
  const routePath = resolvePrizeEngineRoutePath(request);

  if (routePath === PRIZE_ENGINE_REWARD_ROUTE) {
    const bodyAgentId = readRewardAgentIdFromBody(request);
    if (bodyAgentId && headerAgentId && bodyAgentId !== headerAgentId) {
      throw new RangeError("MISMATCH_AGENT_ID");
    }

    return bodyAgentId ?? headerAgentId;
  }

  if (routePath === PRIZE_ENGINE_DRAW_ROUTE) {
    return (
      headerAgentId ??
      readLegacyRewardContextAgentIdFromBody(request) ??
      readLegacyPlayerIdFromBody(request)
    );
  }

  return headerAgentId;
};

const readHeaderValue = (
  request: FastifyRequest,
  headerName: string,
): string | null => {
  const headerValue = request.headers[headerName.toLowerCase()];
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  return trimmed ? trimmed : null;
};

const deriveApiKeyHint = (apiKey: string) => {
  const separatorIndex = apiKey.lastIndexOf("_");
  if (separatorIndex > 0) {
    return apiKey.slice(0, separatorIndex);
  }

  return apiKey.slice(0, 16);
};

const resolvePrizeEngineEnvironmentFromSource = (
  source: unknown,
) => {
  const environment = Reflect.get(toObject(source), "environment");
  if (typeof environment !== "string") {
    return undefined;
  }

  const trimmed = environment.trim();
  return trimmed || undefined;
};

const resolvePrizeEngineEnvironment = (
  request: FastifyRequest,
  environment: "sandbox" | "live" | undefined,
) => environment ?? request.prizeEngineProject!.environment;

const resolvePrizeEngineRoutePath = (request: FastifyRequest) =>
  request.url.split("?")[0] ?? request.url;

const resolvePrizeEngineScopeFromRoute = (
  request: FastifyRequest,
): PrizeEngineApiKeyScope | null => {
  const routePath = resolvePrizeEngineRoutePath(request);

  if (routePath === "/v1/engine/overview") {
    return "catalog:read";
  }

  if (
    routePath === "/v1/engine/fairness/commit" ||
    routePath === "/v1/engine/fairness/reveal"
  ) {
    return "fairness:read";
  }

  if (routePath === PRIZE_ENGINE_REWARD_ROUTE) {
    return "reward:write";
  }

  if (routePath === PRIZE_ENGINE_DRAW_ROUTE) {
    return "draw:write";
  }

  if (routePath === "/v1/engine/ledger") {
    return "ledger:read";
  }

  if (routePath === "/v1/engine/observability/distribution") {
    return "ledger:read";
  }

  return null;
};

const recordApiKeyAuthFailure = async (payload: {
  request: FastifyRequest;
  eventType: "saas_api_key_auth_missing" | "saas_api_key_auth_failed";
  apiKey?: string | null;
  reason: string;
}) => {
  const routePath = resolvePrizeEngineRoutePath(payload.request);

  try {
    await recordAuthEvent({
      eventType: payload.eventType,
      ip: payload.request.ip,
      userAgent: resolveUserAgent(payload.request) ?? null,
      metadata: {
        reason: payload.reason,
        method: payload.request.method,
        route: routePath,
        path: payload.request.url,
        apiKeyHint: payload.apiKey ? deriveApiKeyHint(payload.apiKey) : null,
      },
    });
  } catch {
    // Auth probing telemetry must not change the request outcome.
  }
};

const enforcePrizeEngineAuthFailureRateLimit = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const result = await getPrizeEngineAuthFailureRateLimiter().consume(request.ip);
  if (result.allowed) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    Math.ceil((result.resetAt - Date.now()) / 1000),
    1,
  );
  reply.header("Retry-After", String(retryAfterSeconds));
  return sendError(
    reply,
    429,
    "Too many invalid API key attempts.",
    undefined,
    "API_KEY_AUTH_RATE_LIMIT_EXCEEDED",
  );
};

const requirePrizeEngineProjectGuard = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const apiKey = readApiKey(request);
  if (!apiKey) {
    const rateLimitedReply = await enforcePrizeEngineAuthFailureRateLimit(
      request,
      reply,
    );
    if (rateLimitedReply) {
      return rateLimitedReply;
    }

    await recordApiKeyAuthFailure({
      request,
      eventType: "saas_api_key_auth_missing",
      reason: "missing_api_key",
    });
    return sendError(
      reply,
      401,
      "API key required.",
      undefined,
      "API_KEY_REQUIRED",
    );
  }

  try {
    request.prizeEngineProject = await authenticateProjectApiKey(apiKey);
  } catch (error) {
    const rateLimitedReply = await enforcePrizeEngineAuthFailureRateLimit(
      request,
      reply,
    );
    if (rateLimitedReply) {
      return rateLimitedReply;
    }

    await recordApiKeyAuthFailure({
      request,
      eventType: "saas_api_key_auth_failed",
      apiKey,
      reason: "authentication_rejected",
    });
    return sendErrorForException(reply, error, "API key validation failed.");
  }
};

const enforcePrizeEngineProjectRateLimit = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const project = request.prizeEngineProject;
  if (!project) {
    return;
  }

  const result = await consumePrizeEngineApiRateLimit(project.apiKeyId, project);
  if (result.allowed) {
    return;
  }

  const eventType = resolvePrizeEngineScopeFromRoute(request);
  if (eventType) {
    try {
      await recordPrizeEngineUsageEvent({
        tenantId: project.tenantId,
        projectId: project.projectId,
        apiKeyId: project.apiKeyId,
        environment: project.environment,
        eventType,
        amount: "0",
        currency: project.billingCurrency,
        metadata: {
          route: resolvePrizeEngineRoutePath(request),
          antiExploitBlocked: true,
          billable: false,
          blockedWindows: result.blockedWindows,
          retryAfterSeconds: result.retryAfterSeconds,
        },
      });
    } catch {
      // Usage telemetry must not change the request outcome.
    }
  }

  reply.header("Retry-After", String(result.retryAfterSeconds));
  return sendError(
    reply,
    429,
    "API rate limit exceeded.",
    result.blockedWindows.map((window: string) => `${window} quota exceeded`),
    "API_RATE_LIMIT_EXCEEDED",
  );
};

const enforcePrizeEngineAgentControl = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const project = request.prizeEngineProject;
  if (!project) {
    return;
  }

  let agentId: string | null;
  try {
    agentId = resolvePrizeEngineRequestAgentId(request);
  } catch {
    return sendError(
      reply,
      400,
      "Invalid agent id.",
      undefined,
      API_ERROR_CODES.INVALID_AGENT_ID,
    );
  }

  if (!agentId) {
    return;
  }

  try {
    request.prizeEngineProject = await applyProjectAgentControl(project, agentId);
  } catch (error) {
    return sendErrorForException(reply, error, "Agent control rejected request.");
  }
};

const enforcePrizeEngineExecutionGovernor = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const project = request.prizeEngineProject;
  const scope = resolvePrizeEngineScopeFromRoute(request);
  if (
    !project ||
    !scope ||
    !PRIZE_ENGINE_WRITE_SCOPE_ALIASES.includes(scope)
  ) {
    return;
  }

  try {
    request.prizeEngineExecutionLease = await enterPrizeEngineExecutionGovernor(
      project,
    );
  } catch (error) {
    const retryAfterSeconds =
      readPrizeEngineGovernorRetryAfterSeconds(error);
    if (retryAfterSeconds) {
      reply.header("Retry-After", String(retryAfterSeconds));
    }
    return sendErrorForException(
      reply,
      error,
      "Prize engine admission control rejected request.",
    );
  }
};

const releasePrizeEngineExecutionGovernorLease = async (
  request: FastifyRequest,
) => {
  const lease = request.prizeEngineExecutionLease;
  if (!lease) {
    return;
  }

  request.prizeEngineExecutionLease = undefined;
  await lease.release();
};

const applyPrizeEngineEnvironmentHeaders = (
  reply: FastifyReply,
  environment: "sandbox" | "live",
) => {
  reply.header("X-Prize-Engine-Environment", environment);
  if (environment !== "sandbox") {
    return;
  }

  reply.header("X-Prize-Engine-Sandbox", "true");
  reply.header(
    "X-Prize-Engine-Warning",
    "SANDBOX - non-billable and isolated from live distribution",
  );
  reply.header("Warning", SANDBOX_WARNING_HEADER);
};

const applyLegacyDrawDeprecationHeaders = (reply: FastifyReply) => {
  reply.header("Deprecation", "true");
  reply.header("Sunset", LEGACY_DRAWS_SUNSET_AT);
  reply.header(
    "Link",
    `<${PRIZE_ENGINE_REWARD_ROUTE}>; rel="successor-version"`,
  );
};

const isRequestConnectionClosed = (
  request: FastifyRequest,
  reply: FastifyReply,
) =>
  request.raw.aborted ||
  request.raw.destroyed ||
  request.raw.socket.destroyed ||
  reply.raw.destroyed;

const sendPrizeEngineRouteError = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
) => {
  if (isRequestConnectionClosed(request, reply)) {
    return reply;
  }

  return sendErrorForException(reply, error, fallbackMessage);
};

const buildPrizeEngineAgentSignals = (request: FastifyRequest) =>
  mergePrizeEngineAgentSignals({
    idempotencyKey:
      readHeaderValue(request, "x-prize-engine-idempotency-key") ??
      readHeaderValue(request, "x-idempotency-key") ??
      readHeaderValue(request, "idempotency-key"),
    requestSignature:
      readHeaderValue(request, "x-prize-engine-request-signature") ??
      readHeaderValue(request, "x-request-signature"),
    fingerprint:
      readHeaderValue(request, "x-prize-engine-fingerprint") ??
      readHeaderValue(request, "x-agent-fingerprint"),
    behaviorTemplate:
      readHeaderValue(request, "x-prize-engine-behavior-template") ??
      readHeaderValue(request, "x-agent-behavior-template"),
    correlationGroup:
      readHeaderValue(request, "x-prize-engine-correlation-group") ??
      readHeaderValue(request, "x-agent-correlation-group"),
    occurredAt: readHeaderValue(request, "x-prize-engine-occurred-at"),
  });

const buildRewardAntiExploitPayload = (
  payload: PrizeEngineRewardRequest & { environment: "sandbox" | "live" },
): PrizeEngineDrawRequest => ({
  environment: payload.environment,
  player: {
    playerId: payload.agent.agentId,
    metadata: payload.agent.metadata,
  },
  clientNonce: payload.clientNonce ?? null,
  ...(typeof payload.behavior.risk === "number"
    ? { risk: payload.behavior.risk }
    : {}),
  groupId: payload.agent.groupId ?? null,
  agent: {
    idempotencyKey: payload.idempotencyKey,
    behaviorTemplate: payload.behavior.actionType,
    correlationGroup: payload.agent.groupId ?? null,
    metadata: payload.agent.metadata,
  },
  ...(payload.riskEnvelope ? { riskEnvelope: payload.riskEnvelope } : {}),
  rewardContext: {
    agent: payload.agent,
    behavior: payload.behavior,
    ...(payload.riskEnvelope ? { riskEnvelope: payload.riskEnvelope } : {}),
    ...(payload.budget ? { budget: payload.budget } : {}),
  },
  idempotencyKey: payload.idempotencyKey,
});

const prizeEngineRouteConfig = { config: { rateLimit: false } } as const;

export async function registerPrizeEngineRoutes(app: AppInstance) {
  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", requirePrizeEngineProjectGuard);
    protectedRoutes.addHook("preHandler", enforcePrizeEngineAgentControl);
    protectedRoutes.addHook("preHandler", enforcePrizeEngineProjectRateLimit);
    protectedRoutes.addHook("preHandler", enforcePrizeEngineExecutionGovernor);
    protectedRoutes.addHook("onSend", async (request, reply, payload) => {
      const environment = request.prizeEngineProject?.environment;
      if (environment) {
        applyPrizeEngineEnvironmentHeaders(reply, environment);
      }
      if (request.prizeEngineExecutionLease) {
        reply.header(
          "X-Prize-Engine-Queue-Wait-Ms",
          String(request.prizeEngineExecutionLease.queuedMs),
        );
      }
      return payload;
    });
    protectedRoutes.addHook("onResponse", async (request) => {
      await releasePrizeEngineExecutionGovernorLease(request);
    });
    protectedRoutes.addHook("onError", async (request) => {
      await releasePrizeEngineExecutionGovernorLease(request);
    });
    protectedRoutes.addHook("onTimeout", async (request) => {
      await releasePrizeEngineExecutionGovernorLease(request);
    });
    protectedRoutes.addHook("onRequestAbort", async (request) => {
      await releasePrizeEngineExecutionGovernorLease(request);
    });
    protectedRoutes.addHook("onResponse", async (request, reply) => {
      const project = request.prizeEngineProject;
      const eventType = resolvePrizeEngineScopeFromRoute(request);

      if (!project || !eventType) {
        return;
      }

      void recordSaasStatusApiRequest({
        tenantId: project.tenantId,
        projectId: project.projectId,
        apiKeyId: project.apiKeyId,
        environment: project.environment,
        eventType,
        route: resolvePrizeEngineRoutePath(request),
        method: request.method,
        statusCode: reply.statusCode,
        latencyMs: reply.elapsedTime,
      }).catch(() => {
        // Status telemetry must not change the request outcome.
      });
    });

    protectedRoutes.get(
      "/v1/engine/overview",
      prizeEngineRouteConfig,
      async (request, reply) => {
        const parsed = parseSchema(
          PrizeEngineEnvironmentQuerySchema,
          {
            ...toObject(request.query),
            environment: resolvePrizeEngineEnvironmentFromSource(request.query),
          },
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const environment = resolvePrizeEngineEnvironment(
            request,
            parsed.data.environment,
          );
          const overview = await getPrizeEngineOverview({
            auth: request.prizeEngineProject!,
            environment,
          });
          return sendSuccess(reply, overview);
        } catch (error) {
          return sendPrizeEngineRouteError(
            request,
            reply,
            error,
            "Failed to load engine overview.",
          );
        }
      },
    );

    protectedRoutes.get(
      "/v1/engine/fairness/commit",
      prizeEngineRouteConfig,
      async (request, reply) => {
        const parsed = parseSchema(
          PrizeEngineEnvironmentQuerySchema,
          {
            ...toObject(request.query),
            environment: resolvePrizeEngineEnvironmentFromSource(request.query),
          },
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const environment = resolvePrizeEngineEnvironment(
            request,
            parsed.data.environment,
          );
          const commit = await getPrizeEngineFairnessCommit({
            auth: request.prizeEngineProject!,
            environment,
          });
          return sendSuccess(reply, commit);
        } catch (error) {
          return sendPrizeEngineRouteError(
            request,
            reply,
            error,
            "Failed to load fairness commit.",
          );
        }
      },
    );

    protectedRoutes.get(
      "/v1/engine/fairness/reveal",
      prizeEngineRouteConfig,
      async (request, reply) => {
        const parsed = parseSchema(
          PrizeEngineFairnessRevealQuerySchema,
          {
            ...toObject(request.query),
            environment: resolvePrizeEngineEnvironmentFromSource(request.query),
          },
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const environment = resolvePrizeEngineEnvironment(
            request,
            parsed.data.environment,
          );
          const reveal = await revealPrizeEngineFairnessSeed({
            auth: request.prizeEngineProject!,
            environment,
            epoch: parsed.data.epoch,
          });
          return sendSuccess(reply, reveal);
        } catch (error) {
          return sendPrizeEngineRouteError(
            request,
            reply,
            error,
            "Failed to reveal fairness seed.",
          );
        }
      },
    );

    protectedRoutes.post(
      PRIZE_ENGINE_REWARD_ROUTE,
      prizeEngineRouteConfig,
      async (request, reply) => {
        const parsed = parseSchema(
          PrizeEngineRewardRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const environment = resolvePrizeEngineEnvironment(
            request,
            parsed.data.environment,
          );
          const payload = {
            ...parsed.data,
            environment,
          } satisfies PrizeEngineRewardRequest;
          const routePath = resolvePrizeEngineRoutePath(request);
          const antiExploit = await runPrizeEngineAntiExploitPipeline({
            auth: request.prizeEngineProject!,
            payload: buildRewardAntiExploitPayload(payload),
            requestPath: routePath,
            requestMethod: request.method,
            ip: request.ip,
            userAgent: resolveUserAgent(request) ?? null,
            allowIdempotentReplay: true,
            agentSignals: buildPrizeEngineAgentSignals(request),
          });
          const result = await createPrizeEngineReward({
            auth: request.prizeEngineProject!,
            environment,
            payload,
            antiExploitTrace: antiExploit.trace,
          });
          return sendSuccess(reply, result, result.replayed ? 200 : 201);
        } catch (error) {
          return sendPrizeEngineRouteError(
            request,
            reply,
            error,
            "Reward creation failed.",
          );
        }
      },
    );

    protectedRoutes.post(
      "/v1/engine/draws",
      prizeEngineRouteConfig,
      async (request, reply) => {
        applyLegacyDrawDeprecationHeaders(reply);
        const parsed = parseSchema(
          PrizeEngineDrawRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const environment = resolvePrizeEngineEnvironment(
            request,
            parsed.data.environment,
          );
          const payload = {
            ...parsed.data,
            environment,
          } satisfies PrizeEngineDrawRequest;
          const routePath = resolvePrizeEngineRoutePath(request);
          const antiExploit = await runPrizeEngineAntiExploitPipeline({
            auth: request.prizeEngineProject!,
            payload,
            requestPath: routePath,
            requestMethod: request.method,
            ip: request.ip,
            userAgent: resolveUserAgent(request) ?? null,
            agentSignals: buildPrizeEngineAgentSignals(request),
          });
          const result = await createPrizeEngineDraw({
            auth: request.prizeEngineProject!,
            environment,
            payload,
            antiExploitTrace: antiExploit.trace,
          });
          return sendSuccess(reply, result);
        } catch (error) {
          return sendPrizeEngineRouteError(
            request,
            reply,
            error,
            "Draw failed.",
          );
        }
      },
    );

    protectedRoutes.get(
      "/v1/engine/observability/distribution",
      prizeEngineRouteConfig,
      async (request, reply) => {
        const parsed = parseSchema(
          PrizeEngineObservabilityDistributionQuerySchema,
          {
            ...toObject(request.query),
            environment: resolvePrizeEngineEnvironmentFromSource(request.query),
          },
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const environment = resolvePrizeEngineEnvironment(
            request,
            parsed.data.environment,
          );
          const observability = await getPrizeEngineObservabilityDistribution({
            auth: request.prizeEngineProject!,
            environment,
            query: parsed.data,
          });
          return sendSuccess(reply, observability);
        } catch (error) {
          return sendPrizeEngineRouteError(
            request,
            reply,
            error,
            "Failed to load distribution observability.",
          );
        }
      },
    );

    protectedRoutes.get(
      "/v1/engine/ledger",
      prizeEngineRouteConfig,
      async (request, reply) => {
        const parsed = parseSchema(
          PrizeEngineLedgerQuerySchema,
          {
            ...toObject(request.query),
            environment: resolvePrizeEngineEnvironmentFromSource(request.query),
          },
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const environment = resolvePrizeEngineEnvironment(
            request,
            parsed.data.environment,
          );
          const ledger = await getPrizeEngineLedger({
            auth: request.prizeEngineProject!,
            environment,
            externalPlayerId: parsed.data.playerId,
            limit: parsed.data.limit,
          });
          return sendSuccess(reply, ledger);
        } catch (error) {
          return sendPrizeEngineRouteError(
            request,
            reply,
            error,
            "Failed to load ledger.",
          );
        }
      },
    );
  });
}
