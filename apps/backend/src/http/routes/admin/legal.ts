import type { AppInstance } from "../types";
import {
  LegalAdminOverviewSchema,
  LegalDocumentCreateSchema,
  LegalDocumentPublishDraftSchema,
  LegalDocumentUpdateSchema,
} from "@reward/shared-types/legal";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { ADMIN_PERMISSION_KEYS } from "../../../modules/admin-permission/definitions";
import { recordAdminAction } from "../../../modules/admin/audit";
import { createLegalDocumentPublishDraft } from "../../../modules/control/service";
import {
  createLegalDocument,
  deleteLegalDocument,
  listLegalDocumentsForAdmin,
  updateLegalDocument,
} from "../../../modules/legal/service";
import { withAdminAuditContext } from "../../admin-audit";
import { requireAdminPermission } from "../../guards";
import { sendError, sendErrorForException, sendSuccess } from "../../respond";
import { parseSchema } from "../../../shared/validation";
import {
  adminRateLimit,
  enforceAdminLimit,
  parseIdParam,
  toObject,
} from "./common";

export async function registerAdminLegalRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    "/admin/legal-documents",
    {
      preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)],
    },
    async (_request, reply) => {
      const documents = await listLegalDocumentsForAdmin();
      const items = documents.map((document) => ({
        id: document.id,
        slug: document.documentKey,
        version: String(document.version),
        html: document.htmlContent,
        effectiveAt: new Date(
          document.activePublication?.activatedAt ??
            document.latestPublication?.activatedAt ??
            document.createdAt,
        ).toISOString(),
        createdAt: new Date(document.createdAt).toISOString(),
        isCurrent: document.activePublication !== null,
      }));

      return sendSuccess(reply, { items });
    },
  );

  protectedRoutes.get(
    "/admin/legal/overview",
    {
      preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_READ)],
    },
    async (_request, reply) => {
      const documents = await listLegalDocumentsForAdmin();
      const payload = LegalAdminOverviewSchema.parse({ documents });
      return sendSuccess(reply, payload);
    },
  );

  protectedRoutes.post(
    "/admin/legal/documents",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const parsed = parseSchema(
        LegalDocumentCreateSchema,
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
        const document = await createLegalDocument({
          adminId: request.admin?.adminId ?? 0,
          ...parsed.data,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "legal_document_created",
            targetType: "legal_document",
            targetId: document.id,
            metadata: {
              documentKey: document.documentKey,
              locale: document.locale,
              version: document.version,
            },
          }),
        );

        return sendSuccess(reply, document, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create legal document.",
        );
      }
    },
  );

  protectedRoutes.patch(
    "/admin/legal/documents/:documentId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const documentId = parseIdParam(request.params, "documentId");
      if (!documentId) {
        return sendError(
          reply,
          400,
          "Invalid legal document id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        LegalDocumentUpdateSchema,
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
        const document = await updateLegalDocument({
          documentId,
          ...parsed.data,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "legal_document_updated",
            targetType: "legal_document",
            targetId: document.id,
            metadata: {
              documentKey: document.documentKey,
              locale: document.locale,
              version: document.version,
            },
          }),
        );

        return sendSuccess(reply, document);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to update legal document.",
        );
      }
    },
  );

  protectedRoutes.delete(
    "/admin/legal/documents/:documentId",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const documentId = parseIdParam(request.params, "documentId");
      if (!documentId) {
        return sendError(
          reply,
          400,
          "Invalid legal document id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const deleted = await deleteLegalDocument(documentId);
        if (!deleted) {
          return sendError(
            reply,
            404,
            "Legal document not found.",
            undefined,
            API_ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
          );
        }

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "legal_document_deleted",
            targetType: "legal_document",
            targetId: deleted.id,
            metadata: {
              documentKey: deleted.documentKey,
              locale: deleted.locale,
              version: deleted.version,
            },
          }),
        );

        return sendSuccess(reply, deleted);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to delete legal document.",
        );
      }
    },
  );

  protectedRoutes.post(
    "/admin/legal/documents/:documentId/publish-drafts",
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.CONFIG_UPDATE, {
          requireStepUp: false,
        }),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const documentId = parseIdParam(request.params, "documentId");
      if (!documentId) {
        return sendError(
          reply,
          400,
          "Invalid legal document id.",
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const parsed = parseSchema(
        LegalDocumentPublishDraftSchema,
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
        const changeRequest = await createLegalDocumentPublishDraft({
          adminId: request.admin?.adminId ?? 0,
          documentId,
          rolloutPercent: parsed.data.rolloutPercent,
          reason: parsed.data.reason,
        });

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: "legal_change_request_created",
            targetType: "config_change_request",
            targetId: changeRequest.id,
            metadata: {
              changeType: changeRequest.changeType,
              summary: changeRequest.summary,
              targetDocumentId: documentId,
            },
          }),
        );

        return sendSuccess(reply, changeRequest, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to create legal publish draft.",
        );
      }
    },
  );
}
