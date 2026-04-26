import type { AppInstance } from '../types';
import {
  AdminAuditQuerySchema,
  AuthEventQuerySchema,
} from '@reward/shared-types';

import { ADMIN_PERMISSION_KEYS } from '../../../modules/admin-permission/definitions';
import { listAdminActions } from '../../../modules/admin/audit';
import { listAuthEvents } from '../../../modules/audit/service';
import { parseSchema } from '../../../shared/validation';
import { requireAdminPermission } from '../../guards';
import { sendError, sendSuccess } from '../../respond';
import {
  buildCursorPage,
  decodeCursor,
  escapeCsv,
  parseDateFilter,
  readStringValue,
  toObject,
} from './common';

const parseExportLimit = (query: unknown) => {
  const rawLimit = Number(readStringValue(query, 'limit') ?? 500);
  return Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 2000) : 500;
};

export async function registerAdminAuditRoutes(protectedRoutes: AppInstance) {
  protectedRoutes.get(
    '/admin/analytics/summary',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.ANALYTICS_READ)] },
    async (_request, reply) => {
      const { getAnalyticsSummary } = await import('../../../modules/admin/service');
      const summary = await getAnalyticsSummary();
      return sendSuccess(reply, summary);
    }
  );

  protectedRoutes.get(
    '/admin/auth-events',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.AUDIT_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(AuthEventQuerySchema, toObject(request.query));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const query = parsed.data;
      const cursorToken = query.cursor ?? null;
      const cursor = decodeCursor(cursorToken);
      if (cursorToken && !cursor) {
        return sendError(reply, 400, 'Invalid cursor.');
      }

      const limit = query.limit ?? 50;
      const direction = query.direction ?? 'next';
      const sort = query.sort ?? 'desc';
      const items = await listAuthEvents({
        limit: limit + 1,
        cursor,
        direction,
        order: sort,
        email: query.email ? query.email.toLowerCase() : null,
        eventType: query.eventType ?? null,
        from: parseDateFilter(query.from),
        to: parseDateFilter(query.to),
      });

      return sendSuccess(
        reply,
        buildCursorPage({
          items,
          limit,
          direction,
          sort,
          cursor: cursorToken,
        })
      );
    }
  );

  protectedRoutes.get(
    '/admin/admin-actions',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.AUDIT_READ)] },
    async (request, reply) => {
      const parsed = parseSchema(AdminAuditQuerySchema, toObject(request.query));
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const query = parsed.data;
      const cursorToken = query.cursor ?? null;
      const cursor = decodeCursor(cursorToken);
      if (cursorToken && !cursor) {
        return sendError(reply, 400, 'Invalid cursor.');
      }

      const limit = query.limit ?? 50;
      const direction = query.direction ?? 'next';
      const sort = query.sort ?? 'desc';
      const items = await listAdminActions({
        limit: limit + 1,
        cursor,
        direction,
        order: sort,
        adminId: query.adminId ?? null,
        action: query.action ?? null,
        from: parseDateFilter(query.from),
        to: parseDateFilter(query.to),
      });

      return sendSuccess(
        reply,
        buildCursorPage({
          items,
          limit,
          direction,
          sort,
          cursor: cursorToken,
        })
      );
    }
  );

  protectedRoutes.get(
    '/admin/admin-actions/export',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.AUDIT_EXPORT)] },
    async (request, reply) => {
      const query = toObject(request.query);
      const sort = readStringValue(query, 'sort') === 'asc' ? 'asc' : 'desc';
      const adminIdRaw = Number(readStringValue(query, 'adminId'));
      const actions = await listAdminActions({
        limit: parseExportLimit(query),
        adminId: Number.isFinite(adminIdRaw) && adminIdRaw > 0 ? adminIdRaw : null,
        action: readStringValue(query, 'action') ?? null,
        from: parseDateFilter(readStringValue(query, 'from')),
        to: parseDateFilter(readStringValue(query, 'to')),
        order: sort,
      });

      const header = [
        'id',
        'admin_id',
        'action',
        'target_type',
        'target_id',
        'ip',
        'metadata',
        'created_at',
      ];
      const rows = actions.map((item) => [
        String(item.id),
        item.adminId ? String(item.adminId) : '',
        escapeCsv(item.action ?? ''),
        escapeCsv(item.targetType ?? ''),
        item.targetId ? String(item.targetId) : '',
        escapeCsv(item.ip ?? ''),
        escapeCsv(item.metadata ? JSON.stringify(item.metadata) : ''),
        item.createdAt ? new Date(item.createdAt).toISOString() : '',
      ]);

      const csv = [header.join(','), ...rows.map((row) => row.join(','))].join(
        '\n'
      );

      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        'attachment; filename="admin-actions.csv"'
      );
      return reply.send(csv);
    }
  );

  protectedRoutes.get(
    '/admin/auth-events/export',
    { preHandler: [requireAdminPermission(ADMIN_PERMISSION_KEYS.AUDIT_EXPORT)] },
    async (request, reply) => {
      const query = toObject(request.query);
      const sort = readStringValue(query, 'sort') === 'asc' ? 'asc' : 'desc';
      const events = await listAuthEvents({
        limit: parseExportLimit(query),
        email: readStringValue(query, 'email')?.toLowerCase() ?? null,
        eventType: readStringValue(query, 'eventType') ?? null,
        from: parseDateFilter(readStringValue(query, 'from')),
        to: parseDateFilter(readStringValue(query, 'to')),
        order: sort,
      });

      const header = [
        'id',
        'email',
        'user_id',
        'event_type',
        'ip',
        'user_agent',
        'created_at',
      ];
      const rows = events.map((event) => [
        String(event.id),
        escapeCsv(event.email ?? ''),
        event.userId ? String(event.userId) : '',
        escapeCsv(event.eventType ?? ''),
        escapeCsv(event.ip ?? ''),
        escapeCsv(event.userAgent ?? ''),
        event.createdAt ? new Date(event.createdAt).toISOString() : '',
      ]);

      const csv = [header.join(','), ...rows.map((row) => row.join(','))].join(
        '\n'
      );

      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header(
        'content-disposition',
        'attachment; filename="auth-events.csv"'
      );
      return reply.send(csv);
    }
  );
}
