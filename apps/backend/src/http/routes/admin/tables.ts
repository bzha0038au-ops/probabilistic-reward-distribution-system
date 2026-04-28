import type { AppInstance } from "../types";
import {
  CloseTableAdminRequestSchema,
  ForceTimeoutAdminRequestSchema,
  KickSeatAdminRequestSchema,
  TableMonitoringSourceKindSchema,
} from "@reward/shared-types/table-monitoring";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../modules/admin/audit";
import {
  closeTable,
  forceTimeoutTable,
  getTableMonitoringSnapshot,
  kickTableSeat,
} from "../../../modules/table-monitoring/service";
import { withAdminAuditContext } from "../../admin-audit";
import {
  ADMIN_ACCESS_TOKEN_SCOPES,
  createScopedAdminAccessToken,
} from "../../../shared/admin-session";
import { parseSchema } from "../../../shared/validation";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import {
  adminRateLimit,
  enforceAdminLimit,
  readStringValue,
  toObject,
} from "./common";

const parseSourceKind = (params: unknown) => {
  const parsed = TableMonitoringSourceKindSchema.safeParse(
    readStringValue(params, "sourceKind"),
  );
  return parsed.success ? parsed.data : null;
};

const parseTableId = (params: unknown) => {
  const tableId = readStringValue(params, "tableId")?.trim() ?? "";
  return tableId.length > 0 ? tableId : null;
};

const parseSeatIndex = (params: unknown) => {
  const raw = readStringValue(params, "seatIndex");
  const seatIndex = Number(raw);
  return Number.isInteger(seatIndex) && seatIndex >= 0 ? seatIndex : null;
};

export async function registerAdminTableRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/table-monitoring",
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.TABLES_READ)] },
    async (_request, reply) => {
      const snapshot = await getTableMonitoringSnapshot();
      return sendSuccess(reply, snapshot);
    },
  );

  protectedRoutes.get(
    "/admin/table-monitoring/ws-token",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.TABLES_READ)],
    },
    async (request, reply) => {
      const admin = request.admin;
      if (!admin) {
        return sendError(
          reply,
          401,
          "Unauthorized",
          undefined,
          API_ERROR_CODES.UNAUTHORIZED,
        );
      }

      const token = await createScopedAdminAccessToken(admin, {
        scope: ADMIN_ACCESS_TOKEN_SCOPES.TABLE_MONITORING_WS,
      });
      return sendSuccess(reply, token);
    },
  );

  protectedRoutes.post(
    "/admin/table-monitoring/:sourceKind/:tableId/force-timeout",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.TABLES_MANAGE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const sourceKind = parseSourceKind(request.params);
      const tableId = parseTableId(request.params);
      if (!sourceKind || !tableId) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        ForceTimeoutAdminRequestSchema,
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
        const result = await forceTimeoutTable({ sourceKind, tableId });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "table_force_timeout",
            targetType: `${sourceKind}_table`,
            metadata: {
              tableId,
              sourceKind,
              seatIndex: result.seatIndex,
              removed: result.removed,
              reason: parsed.data.reason ?? null,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to force table timeout.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/table-monitoring/:sourceKind/:tableId/close",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.TABLES_MANAGE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const sourceKind = parseSourceKind(request.params);
      const tableId = parseTableId(request.params);
      if (!sourceKind || !tableId) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        CloseTableAdminRequestSchema,
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
        const result = await closeTable({
          sourceKind,
          tableId,
          reason: parsed.data.reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "table_closed",
            targetType: `${sourceKind}_table`,
            metadata: {
              tableId,
              sourceKind,
              reason: parsed.data.reason,
              removed: result.removed,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to close table.");
      }
    },
  );

  protectedRoutes.post(
    "/admin/table-monitoring/:sourceKind/:tableId/seats/:seatIndex/kick",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.TABLES_MANAGE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const sourceKind = parseSourceKind(request.params);
      const tableId = parseTableId(request.params);
      const seatIndex = parseSeatIndex(request.params);
      if (!sourceKind || !tableId || seatIndex === null) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        KickSeatAdminRequestSchema,
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
        const result = await kickTableSeat({
          sourceKind,
          tableId,
          seatIndex,
          reason: parsed.data.reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "table_seat_kicked",
            targetType: `${sourceKind}_table`,
            metadata: {
              tableId,
              sourceKind,
              seatIndex,
              reason: parsed.data.reason,
              removed: result.removed,
            },
          }),
        );

        return sendSuccess(reply, result);
      } catch (error) {
        return sendErrorForException(reply, error, "Failed to kick seat.");
      }
    },
  );

  protectedRoutes.get(
    "/admin/ws/table-monitoring",
    {
      websocket: true,
      preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.TABLES_READ)],
    },
    (connection, request) => {
      let lastFingerprint = "";

      const sendEvent = (payload: Record<string, unknown>) => {
        if (connection.socket.readyState === 1) {
          connection.socket.send(JSON.stringify(payload));
        }
      };

      const pushSnapshot = async () => {
        const snapshot = await getTableMonitoringSnapshot();
        const fingerprint = JSON.stringify(snapshot.tables);
        if (fingerprint === lastFingerprint) {
          return;
        }
        lastFingerprint = fingerprint;
        sendEvent({
          type: "snapshot",
          snapshot,
        });
      };

      const pushError = (message: string) => {
        sendEvent({
          type: "error",
          message,
        });
      };

      const interval = setInterval(() => {
        void pushSnapshot().catch((error) => {
          request.log.error(
            { err: error },
            "admin table-monitoring websocket refresh failed",
          );
          pushError("Failed to refresh table monitoring snapshot.");
        });
      }, 2_000);

      connection.socket.on("close", () => {
        clearInterval(interval);
      });

      void pushSnapshot().catch((error) => {
        request.log.error(
          { err: error },
          "admin table-monitoring websocket initial snapshot failed",
        );
        pushError("Failed to load table monitoring snapshot.");
      });
    },
  );
}
