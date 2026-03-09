import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CursorDirection, SortOrder } from '@reward/shared-types';

import { getConfig } from '../../../shared/config';
import { createRateLimiter } from '../../../shared/rate-limit';
import { sendError } from '../../respond';
import { parseLimit } from '../../utils';

const config = getConfig();

export const adminRateLimit = {
  max: config.rateLimitAdminMax,
  timeWindow: config.rateLimitAdminWindowMs,
};

const adminLimiter = createRateLimiter({
  limit: config.rateLimitAdminMax,
  windowMs: config.rateLimitAdminWindowMs,
});

export const enforceAdminLimit = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const admin = request.admin;
  if (!admin) return;
  const result = await adminLimiter.consume(`admin:${admin.userId}`);
  if (!result.allowed) {
    return sendError(reply, 429, 'Too many requests.');
  }
};

export const toObject = (value: unknown) => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
};

export const readString = (value: unknown) =>
  typeof value === 'string' ? value : value === null || value === undefined ? undefined : String(value);

export const readStringValue = (source: unknown, key: string) => readString(Reflect.get(toObject(source), key));

export const parseIdParam = (source: unknown, key: string) => {
  const raw = readStringValue(source, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const parseDateFilter = (value: string | number | undefined) => {
  if (value === undefined) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

export const parseLimitFromQuery = (query: unknown) => parseLimit(readStringValue(query, 'limit'));

const encodeCursorPayload = (payload: { id: number; createdAt: string }) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

export const encodeCursor = (item: { id: number; createdAt: Date | string | null | undefined }) => {
  if (!item.createdAt) return null;
  const createdAt = new Date(item.createdAt);
  if (Number.isNaN(createdAt.valueOf())) return null;
  return encodeCursorPayload({
    id: item.id,
    createdAt: createdAt.toISOString(),
  });
};

export const decodeCursor = (cursor?: string | null) => {
  if (!cursor) return null;

  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = typeof raw === 'object' && raw !== null ? raw : {};
    const id = Number(Reflect.get(parsed, 'id'));
    const createdAtValue = Reflect.get(parsed, 'createdAt');
    const createdAt =
      typeof createdAtValue === 'string' ? new Date(createdAtValue) : null;

    if (!Number.isFinite(id) || !createdAt || Number.isNaN(createdAt.valueOf())) {
      return null;
    }

    return { id, createdAt };
  } catch {
    return null;
  }
};

export const buildCursorPage = <T extends { id: number; createdAt: Date | string | null | undefined }>(params: {
  items: T[];
  limit: number;
  direction: CursorDirection;
  sort: SortOrder;
  cursor: string | null;
}) => {
  const hasOverflow = params.items.length > params.limit;
  const pageItems = hasOverflow ? params.items.slice(0, params.limit) : params.items;
  const hasNext =
    params.direction === 'prev'
      ? Boolean(params.cursor && pageItems.length > 0)
      : hasOverflow;
  const hasPrevious =
    params.direction === 'next'
      ? Boolean(params.cursor && pageItems.length > 0)
      : hasOverflow;

  return {
    items: pageItems,
    limit: params.limit,
    hasNext,
    hasPrevious,
    nextCursor: hasNext && pageItems.length > 0 ? encodeCursor(pageItems[pageItems.length - 1]) : null,
    prevCursor: hasPrevious && pageItems.length > 0 ? encodeCursor(pageItems[0]) : null,
    direction: params.direction,
    sort: params.sort,
  };
};

export const escapeCsv = (value: string) => {
  if (value.includes('"')) {
    value = value.replace(/"/g, '""');
  }
  if (/[\n,]/.test(value)) {
    return `"${value}"`;
  }
  return value;
};
