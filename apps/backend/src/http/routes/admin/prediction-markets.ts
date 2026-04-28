import type { AppInstance } from "../types";
import {
  CancelPredictionMarketRequestSchema,
  CreatePredictionMarketRequestSchema,
  SettlePredictionMarketRequestSchema,
} from "@reward/shared-types/prediction-market";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import {
  cancelPredictionMarket,
  createPredictionMarket,
  listPredictionMarkets,
  settlePredictionMarket,
} from "../../../modules/prediction-market/service";
import { recordAdminAction } from "../../../modules/admin/audit";
import { parseSchema } from "../../../shared/validation";
import { withAdminAuditContext } from "../../admin-audit";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from "./common";

export async function registerAdminPredictionMarketRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.get(
    "/admin/markets",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)] },
    async (_request, reply) => {
      const markets = await listPredictionMarkets();
      return sendSuccess(reply, markets);
    },
  );

  protectedRoutes.post(
    "/admin/markets",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        CreatePredictionMarketRequestSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const market = await createPredictionMarket(parsed.data);
        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "prediction_market_create",
            targetType: "prediction_market",
            targetId: market.id,
            metadata: {
              slug: market.slug,
              roundKey: market.roundKey,
              outcomeKeys: market.outcomes.map((outcome) => outcome.key),
            },
          }),
        );
        return sendSuccess(reply, market, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create prediction market.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/markets/:marketId/cancel",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const marketId = parseIdParam(request.params, "marketId");
      if (!marketId) {
        return sendError(
          reply,
          400,
          "Invalid market id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        CancelPredictionMarketRequestSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const market = await cancelPredictionMarket(marketId, parsed.data);
        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "prediction_market_cancel",
            targetType: "prediction_market",
            targetId: market.id,
            metadata: {
              slug: market.slug,
              roundKey: market.roundKey,
              finalStatus: market.status,
              reason: parsed.data.reason,
              oracleSource: parsed.data.oracle?.source ?? null,
              oracleExternalRef: parsed.data.oracle?.externalRef ?? null,
              metadata: parsed.data.metadata ?? null,
            },
          }),
        );
        return sendSuccess(reply, market);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to cancel prediction market.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/markets/:marketId/settle",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const marketId = parseIdParam(request.params, "marketId");
      if (!marketId) {
        return sendError(
          reply,
          400,
          "Invalid market id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        SettlePredictionMarketRequestSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const market = await settlePredictionMarket(marketId, parsed.data);
        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "prediction_market_settle",
            targetType: "prediction_market",
            targetId: market.id,
            metadata: {
              winningOutcomeKey: parsed.data.winningOutcomeKey,
              oracleSource: parsed.data.oracle.source,
              oracleExternalRef: parsed.data.oracle.externalRef ?? null,
            },
          }),
        );
        return sendSuccess(reply, market);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to settle prediction market.",
        );
      }
    },
  );
}
