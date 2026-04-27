import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppInstance } from "./types";
import { PrizeEngineDrawRequestSchema } from "@reward/shared-types/saas";

import {
  authenticateProjectApiKey,
  createPrizeEngineDraw,
  getPrizeEngineFairnessCommit,
  getPrizeEngineLedger,
  getPrizeEngineOverview,
  revealPrizeEngineFairnessSeed,
} from "../../modules/saas/service";
import { consumePrizeEngineApiRateLimit } from "../../modules/saas/prize-engine-rate-limit";
import { recordAuthEvent } from "../../modules/audit/service";
import { getConfig } from "../../shared/config";
import { createRateLimiter } from "../../shared/rate-limit";
import { resolveUserAgent } from "./auth/support";
import { parseSchema } from "../../shared/validation";
import { sendError, sendErrorForException, sendSuccess } from "../respond";
import { parseLimit, readStringValue, toObject } from "../utils";

let prizeEngineAuthFailureRateLimiter: ReturnType<typeof createRateLimiter> | null =
  null;

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

const deriveApiKeyHint = (apiKey: string) => {
  const separatorIndex = apiKey.lastIndexOf("_");
  if (separatorIndex > 0) {
    return apiKey.slice(0, separatorIndex);
  }

  return apiKey.slice(0, 16);
};

const recordApiKeyAuthFailure = async (payload: {
  request: FastifyRequest;
  eventType: "saas_api_key_auth_missing" | "saas_api_key_auth_failed";
  apiKey?: string | null;
  reason: string;
}) => {
  const routePath = payload.request.url.split("?")[0] ?? payload.request.url;

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

  reply.header("Retry-After", String(result.retryAfterSeconds));
  return sendError(
    reply,
    429,
    "API rate limit exceeded.",
    result.blockedWindows.map((window) => `${window} quota exceeded`),
    "API_RATE_LIMIT_EXCEEDED",
  );
};

const prizeEngineRouteConfig = { config: { rateLimit: false } } as const;

export async function registerPrizeEngineRoutes(app: AppInstance) {
  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", requirePrizeEngineProjectGuard);
    protectedRoutes.addHook("preHandler", enforcePrizeEngineProjectRateLimit);

    protectedRoutes.get(
      "/v1/engine/overview",
      prizeEngineRouteConfig,
      async (request, reply) => {
        try {
          const overview = await getPrizeEngineOverview(
            request.prizeEngineProject!,
          );
          return sendSuccess(reply, overview);
        } catch (error) {
          return sendErrorForException(
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
        try {
          const commit = await getPrizeEngineFairnessCommit(
            request.prizeEngineProject!,
          );
          return sendSuccess(reply, commit);
        } catch (error) {
          return sendErrorForException(
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
        const epoch = Number(readStringValue(request.query, "epoch"));
        if (!Number.isFinite(epoch)) {
          return sendError(reply, 400, "Invalid epoch.");
        }

        try {
          const reveal = await revealPrizeEngineFairnessSeed(
            request.prizeEngineProject!,
            epoch,
          );
          return sendSuccess(reply, reveal);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to reveal fairness seed.",
          );
        }
      },
    );

    protectedRoutes.post(
      "/v1/engine/draws",
      prizeEngineRouteConfig,
      async (request, reply) => {
        const parsed = parseSchema(
          PrizeEngineDrawRequestSchema,
          toObject(request.body),
        );
        if (!parsed.isValid) {
          return sendError(reply, 400, "Invalid request.", parsed.errors);
        }

        try {
          const result = await createPrizeEngineDraw(
            request.prizeEngineProject!,
            parsed.data,
          );
          return sendSuccess(reply, result, 201);
        } catch (error) {
          return sendErrorForException(reply, error, "Draw failed.");
        }
      },
    );

    protectedRoutes.get(
      "/v1/engine/ledger",
      prizeEngineRouteConfig,
      async (request, reply) => {
        const playerId = readStringValue(request.query, "playerId");
        if (!playerId) {
          return sendError(reply, 400, "playerId is required.");
        }

        try {
          const ledger = await getPrizeEngineLedger(
            request.prizeEngineProject!,
            playerId,
            parseLimit(readStringValue(request.query, "limit")),
          );
          return sendSuccess(reply, ledger);
        } catch (error) {
          return sendErrorForException(reply, error, "Failed to load ledger.");
        }
      },
    );
  });
}
