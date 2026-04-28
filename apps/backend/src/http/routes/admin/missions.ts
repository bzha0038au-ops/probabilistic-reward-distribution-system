import type { AppInstance } from "../types";
import {
  RewardMissionCreateSchema,
  RewardMissionUpdateSchema,
} from "@reward/shared-types/gamification";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../modules/admin/audit";
import {
  createMission,
  deleteMission,
  listMissionsForAdmin,
  updateMission,
} from "../../../modules/gamification/admin-service";
import { parseSchema } from "../../../shared/validation";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import {
  adminRateLimit,
  enforceAdminLimit,
  readStringValue,
  toObject,
} from "./common";

const parseMissionIdParam = (params: unknown) => {
  const missionId = readStringValue(params, "missionId");
  return missionId && missionId.trim() !== "" ? missionId.trim() : null;
};

export async function registerAdminMissionRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/missions",
    {
      preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.MISSIONS_READ)],
    },
    async (_request, reply) => {
      const missionList = await listMissionsForAdmin();
      return sendSuccess(reply, missionList);
    },
  );

  protectedRoutes.post(
    "/admin/missions",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.MISSIONS_CREATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(RewardMissionCreateSchema, toObject(request.body));
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
        const created = await createMission({
          id: parsed.data.id,
          type: parsed.data.type,
          params: parsed.data.params,
          reward: String(parsed.data.reward),
          isActive: parsed.data.isActive ?? true,
        });

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "mission_create",
          targetType: "mission",
          targetId: null,
          metadata: created,
          ip: request.ip,
        });

        return sendSuccess(reply, created, 201);
      } catch (error) {
        return sendErrorForException(reply, error, "Mission create failed.");
      }
    },
  );

  protectedRoutes.patch(
    "/admin/missions/:missionId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.MISSIONS_UPDATE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const missionId = parseMissionIdParam(request.params);
      if (!missionId) {
        return sendError(
          reply,
          400,
          "Invalid mission id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(RewardMissionUpdateSchema, toObject(request.body));
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
        const updated = await updateMission(missionId, {
          type: parsed.data.type,
          params: parsed.data.params,
          reward: String(parsed.data.reward),
          isActive: parsed.data.isActive ?? true,
        });

        if (!updated) {
          return sendError(reply, 404, "Reward mission not found.");
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "mission_update",
          targetType: "mission",
          targetId: null,
          metadata: {
            missionId,
            ...updated,
          },
          ip: request.ip,
        });

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(reply, error, "Mission update failed.");
      }
    },
  );

  protectedRoutes.delete(
    "/admin/missions/:missionId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.MISSIONS_DELETE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const missionId = parseMissionIdParam(request.params);
      if (!missionId) {
        return sendError(
          reply,
          400,
          "Invalid mission id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const deleted = await deleteMission(missionId);
        if (!deleted) {
          return sendError(reply, 404, "Reward mission not found.");
        }

        await recordAdminAction({
          adminId: request.admin?.adminId ?? null,
          action: "mission_delete",
          targetType: "mission",
          targetId: null,
          metadata: { missionId },
          ip: request.ip,
        });

        return sendSuccess(reply, deleted);
      } catch (error) {
        return sendErrorForException(reply, error, "Mission delete failed.");
      }
    },
  );
}
