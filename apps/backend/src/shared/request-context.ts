import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { context } from './context';
import { resolveLocaleFromRequest } from './i18n';
import { ensureTraceId, TRACE_ID_HEADER } from './trace';

const REQUEST_ID_HEADER = 'x-request';

function requestContextPlugin(
  app: FastifyInstance,
  _options: unknown,
  done: () => void
) {
  app.addHook(
    'onRequest',
    (request: FastifyRequest, reply: FastifyReply, hookDone) => {
      let requestId: string | undefined;
      const header = request.headers[REQUEST_ID_HEADER];

      if (Array.isArray(header)) {
        requestId = header[0];
      } else {
        requestId = header;
      }

      if (!requestId) {
        requestId = randomUUID();
        request.headers[REQUEST_ID_HEADER] = requestId;
      }

      const traceHeader = request.headers[TRACE_ID_HEADER];
      const traceId = ensureTraceId(
        Array.isArray(traceHeader) ? traceHeader[0] : traceHeader ?? requestId
      );

      reply.header(REQUEST_ID_HEADER, requestId);
      reply.header(TRACE_ID_HEADER, traceId);

      const locale = resolveLocaleFromRequest(request);
      const store = context().getStore();
      if (store) {
        store.requestId = requestId;
        store.traceId = traceId;
        store.locale = locale;
        hookDone();
        return;
      }

      context().run({ requestId, traceId, locale }, hookDone);
    }
  );

  done();
}

export const RequestContextPlugin = fastifyPlugin(requestContextPlugin);
