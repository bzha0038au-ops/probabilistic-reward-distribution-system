import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { getConfig } from '../shared/config';
import { ADMIN_SESSION_COOKIE } from '../shared/admin-session';
import { USER_SESSION_COOKIE } from '../shared/user-session';
import { sendError } from './respond';

export const CSRF_COOKIE = 'reward_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const getHeaderValue = (request: FastifyRequest, name: string) => {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
};

const resolveOrigin = (request: FastifyRequest) => {
  const origin = getHeaderValue(request, 'origin');
  if (origin) return origin;

  const referer = getHeaderValue(request, 'referer');
  if (!referer) return undefined;

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
};

const hasCookieAuth = (request: FastifyRequest) => {
  const hasBearer = Boolean(
    request.headers.authorization?.startsWith('Bearer ')
  );
  if (hasBearer) return false;
  return Boolean(
    request.cookies[ADMIN_SESSION_COOKIE] ||
      request.cookies[USER_SESSION_COOKIE]
  );
};

export const CsrfPlugin = fastifyPlugin(async (app: FastifyInstance) => {
  const config = getConfig();
  const allowedOrigins = new Set([config.webBaseUrl, config.adminBaseUrl]);

  app.addHook('preHandler', async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (!hasCookieAuth(request)) return;

    const origin = resolveOrigin(request);
    if (!origin) {
      return sendError(reply, 403, 'Missing request origin.');
    }
    if (!allowedOrigins.has(origin)) {
      return sendError(reply, 403, 'Invalid request origin.');
    }

    const csrfCookie = request.cookies[CSRF_COOKIE];
    const csrfHeader = getHeaderValue(request, CSRF_HEADER);
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return sendError(reply, 403, 'CSRF token missing or invalid.');
    }

    const contentType = getHeaderValue(request, 'content-type');
    if (contentType && !contentType.startsWith('application/json')) {
      return sendError(reply, 415, 'Unsupported content type.');
    }
  });
});
