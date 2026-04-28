import type { AppInstance } from '../types';
import type { ReconciliationAlertStatus } from '@reward/shared-types/finance';
import { API_ERROR_CODES } from '@reward/shared-types/api';

import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { recordAdminAction } from '../../../modules/admin/audit';
import {
  getReconciliationAlertSummary,
  listReconciliationAlerts,
  updateReconciliationAlertStatus,
} from '../../../modules/engine-reconciliation/service';
import { requireAdminPermission } from '../../guards';
import { sendError, sendErrorForException, sendSuccess } from '../../respond';
import { withAdminAuditContext } from '../../admin-audit';
import {
  adminRateLimit,
  enforceAdminLimit,
  escapeCsv,
  parseIdParam,
  parseLimitFromQuery,
  readStringValue,
  toObject,
} from './common';
import { parseFinanceReviewPayload, requireOperatorNote } from './finance-support';

const RECONCILIATION_ALERT_STATUSES = new Set<ReconciliationAlertStatus>([
  'open',
  'acknowledged',
  'require_engineering',
  'resolved',
]);

const parseExportLimit = (query: unknown) => {
  const rawLimit = Number(readStringValue(query, 'limit') ?? 1000);
  return Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 5000)
    : 1000;
};

const parseAlertStatus = (
  value: unknown,
): ReconciliationAlertStatus | null => {
  const status = typeof value === 'string' ? value.trim() : '';
  return RECONCILIATION_ALERT_STATUSES.has(status as ReconciliationAlertStatus)
    ? (status as ReconciliationAlertStatus)
    : null;
};

export async function registerAdminEngineReconciliationRoutes(
  protectedRoutes: AppInstance,
) {
  protectedRoutes.get(
    '/admin/engine/reconciliation-alerts',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (request, reply) => {
      const limit = parseLimitFromQuery(request.query);
      const alerts = await listReconciliationAlerts(limit);
      return sendSuccess(reply, alerts);
    },
  );

  protectedRoutes.get(
    '/admin/engine/reconciliation-alerts/summary',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (_request, reply) => {
      const summary = await getReconciliationAlertSummary();
      return sendSuccess(reply, summary);
    },
  );

  protectedRoutes.patch(
    '/admin/engine/reconciliation-alerts/:alertId/status',
    {
      config: { rateLimit: adminRateLimit },
      preHandler: [
        requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_RECONCILE),
        enforceAdminLimit,
      ],
    },
    async (request, reply) => {
      const alertId = parseIdParam(request.params, 'alertId');
      if (!alertId) {
        return sendError(
          reply,
          400,
          'Invalid reconciliation alert id.',
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      const source = toObject(request.body);
      const status = parseAlertStatus(readStringValue(source, 'status'));
      if (!status) {
        return sendError(
          reply,
          400,
          'Invalid reconciliation alert status.',
          undefined,
          API_ERROR_CODES.INVALID_REQUEST,
        );
      }

      try {
        const review = parseFinanceReviewPayload(request.body);
        const updated = await updateReconciliationAlertStatus({
          alertId,
          status,
          adminId: request.admin?.adminId ?? null,
          statusNote: requireOperatorNote(review, 'Operator note'),
        });

        if (!updated) {
          return sendError(
            reply,
            404,
            'Reconciliation alert not found.',
            undefined,
            API_ERROR_CODES.NOT_FOUND,
          );
        }

        await recordAdminAction(
          withAdminAuditContext(request, {
            adminId: request.admin?.adminId ?? null,
            action: 'engine_reconciliation_alert_status_update',
            targetType: 'reconciliation_alert',
            targetId: alertId,
            metadata: {
              status,
              operatorNote: review.operatorNote,
              userId: updated.userId,
              deltaAmount: updated.deltaAmount,
            },
          }),
        );

        return sendSuccess(reply, updated);
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to update reconciliation alert status.',
        );
      }
    },
  );

  protectedRoutes.get(
    '/admin/engine/reconciliation-alerts/export',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.FINANCE_READ)] },
    async (request, reply) => {
      const alerts = await listReconciliationAlerts(
        parseExportLimit(request.query),
      );

      const header = [
        'id',
        'user_id',
        'user_email',
        'status',
        'delta_amount',
        'status_note',
        'last_detected_at',
        'resolved_at',
        'ledger_snapshot',
        'wallet_snapshot',
        'updated_at',
      ];
      const rows = alerts.map((alert) => [
        String(alert.id),
        String(alert.userId),
        escapeCsv(alert.userEmail ?? ''),
        alert.status,
        alert.deltaAmount,
        escapeCsv(alert.statusNote ?? ''),
        alert.lastDetectedAt
          ? new Date(alert.lastDetectedAt).toISOString()
          : '',
        alert.resolvedAt ? new Date(alert.resolvedAt).toISOString() : '',
        escapeCsv(JSON.stringify(alert.ledgerSnapshot ?? {})),
        escapeCsv(JSON.stringify(alert.walletSnapshot ?? {})),
        alert.updatedAt ? new Date(alert.updatedAt).toISOString() : '',
      ]);

      const csv = [header.join(','), ...rows.map((row) => row.join(','))].join(
        '\n',
      );

      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        'attachment; filename="reconciliation-alerts.csv"',
      );
      return reply.send(csv);
    },
  );
}
