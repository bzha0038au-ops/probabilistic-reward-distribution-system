import type { FastifyRequest } from 'fastify';

import type { AdminActionPayload } from '../modules/admin/audit';

const toMetadataRecord = (value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

export const resolveRequestUserAgent = (request: {
  headers: Record<string, unknown>;
}) => {
  const value = request.headers['user-agent'];
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
};

export const mergeAdminAuditMetadata = (
  request: FastifyRequest,
  metadata?: Record<string, unknown> | null
) => {
  const nextMetadata = toMetadataRecord(metadata);

  if (request.adminStepUp) {
    nextMetadata.stepUpVerified = true;
    nextMetadata.stepUpMethod = request.adminStepUp.method;
    nextMetadata.stepUpVerifiedAt = request.adminStepUp.verifiedAt;
    nextMetadata.stepUpRecoveryCodesRemaining =
      request.adminStepUp.recoveryCodesRemaining;
    nextMetadata.stepUpBreakGlassVerified =
      request.adminStepUp.breakGlassVerified === true;
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
};

export const withAdminAuditContext = (
  request: FastifyRequest,
  payload: Omit<AdminActionPayload, 'ip' | 'sessionId' | 'userAgent'> &
    Partial<Pick<AdminActionPayload, 'sessionId' | 'userAgent'>>
): AdminActionPayload => ({
  ...payload,
  ip: request.ip,
  sessionId: payload.sessionId ?? request.admin?.sessionId ?? null,
  userAgent: payload.userAgent ?? resolveRequestUserAgent(request) ?? null,
  metadata: mergeAdminAuditMetadata(request, payload.metadata),
});
