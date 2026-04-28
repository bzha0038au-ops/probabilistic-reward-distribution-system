import type { AppInstance } from "./types";
import {
  AcceptCurrentLegalDocumentsRequestSchema,
  LegalAcceptanceCreateSchema,
  LegalCurrentDocumentsQuerySchema,
} from "@reward/shared-types/legal";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import {
  acceptCurrentLegalDocuments,
  acceptLegalDocument,
  getCurrentLegalDocumentsResponse,
  listCurrentLegalDocuments,
} from "../../modules/legal/service";
import { requireUserGuard } from "../guards";
import { sendError, sendErrorForException, sendSuccess } from "../respond";
import { parseSchema } from "../../shared/validation";
import { toObject } from "../utils";

const resolveUserAgent = (request: {
  headers: { [key: string]: unknown };
}) => {
  const value = request.headers["user-agent"];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
};

export async function registerLegalRoutes(app: AppInstance) {
  app.get("/legal/current", async (_request, reply) => {
    const documents = await getCurrentLegalDocumentsResponse();
    return sendSuccess(reply, documents);
  });

  app.get("/legal/documents/current", async (request, reply) => {
    const parsed = parseSchema(
      LegalCurrentDocumentsQuerySchema,
      toObject(request.query),
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

    const documents = await listCurrentLegalDocuments({
      documentKey: parsed.data.documentKey ?? null,
      locale: parsed.data.locale ?? null,
      audienceId: parsed.data.audienceId ?? null,
    });
    return sendSuccess(reply, { documents });
  });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", requireUserGuard);

    protectedRoutes.get("/legal/documents/me", async (request, reply) => {
      const documents = await listCurrentLegalDocuments({
        userId: request.user!.userId,
      });
      return sendSuccess(reply, { documents });
    });

    protectedRoutes.post("/legal/acceptances", async (request, reply) => {
      const currentParsed = parseSchema(
        AcceptCurrentLegalDocumentsRequestSchema,
        toObject(request.body),
      );
      if (currentParsed.isValid) {
        try {
          const accepted = await acceptCurrentLegalDocuments({
            userId: request.user!.userId,
            acceptances: currentParsed.data.acceptances,
            ip: request.ip,
            userAgent: resolveUserAgent(request),
          });
          return sendSuccess(reply, accepted);
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            "Failed to accept legal documents.",
          );
        }
      }

      const parsed = parseSchema(
        LegalAcceptanceCreateSchema,
        toObject(request.body),
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          "Invalid request.",
          currentParsed.errors.length > 0 ? currentParsed.errors : parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const accepted = await acceptLegalDocument({
          userId: request.user!.userId,
          documentId: parsed.data.documentId,
          ip: request.ip,
          userAgent: resolveUserAgent(request),
        });
        return sendSuccess(reply, accepted, 201);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          "Failed to accept legal document.",
        );
      }
    });
  });
}
