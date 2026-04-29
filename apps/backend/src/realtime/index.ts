import { randomUUID } from 'node:crypto';

import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { AppInstance } from '../http/routes/types';
import type { RealtimeJsonValue } from '@reward/shared-types/realtime';

import { client } from '../db';
import { logger } from '../shared/logger';
import { recordRealtimePublishDuration } from '../shared/observability';
import { getRedis } from '../shared/redis';
import { captureException } from '../shared/telemetry';
import { registerRealtimeRoutes } from './routes';
import {
  RealtimeService,
  type RealtimeTopicAuthorizer,
  type RealtimeTransportOptions,
} from './service';

let activeRealtimeService: RealtimeService | null = null;
const pendingTopicAuthorizers = new Set<RealtimeTopicAuthorizer>();
const REALTIME_PG_NOTIFY_CHANNEL = 'reward_realtime_bus';
const REALTIME_PG_NOTIFY_MAX_PAYLOAD_BYTES = 7900;
const REALTIME_PG_NOTIFY_REFERENCE_TTL_SECONDS = 300;
const REALTIME_PG_NOTIFY_REDIS_PREFIX = 'realtime:bus:payload';
const realtimeProcessId = randomUUID();
let realtimeBusReady: Promise<void> | null = null;
const realtimeTracer = trace.getTracer('reward-backend.realtime');

type RealtimeBusInlineEnvelope =
  | {
      originId: string;
      scope: 'topic';
      topic: string;
      event: string;
      data: RealtimeJsonValue;
    }
  | {
      originId: string;
      scope: 'user';
      userId: number;
      event: string;
      data: RealtimeJsonValue;
    }
  | {
      originId: string;
      scope: 'session';
      sessionId: string;
      event: string;
      data: RealtimeJsonValue;
    };

type RealtimeBusRedisEnvelope = {
  originId: string;
  storage: 'redis';
  redisKey: string;
};

type RealtimeBusEnvelope = RealtimeBusInlineEnvelope | RealtimeBusRedisEnvelope;

type RealtimeBusPublishPayload =
  | {
      scope: 'topic';
      topic: string;
      event: string;
      data: RealtimeJsonValue;
    }
  | {
      scope: 'user';
      userId: number;
      event: string;
      data: RealtimeJsonValue;
    }
  | {
      scope: 'session';
      sessionId: string;
      event: string;
      data: RealtimeJsonValue;
    };

const setActiveRealtimeService = (service: RealtimeService | null) => {
  activeRealtimeService = service;
};

const getActiveRealtimeService = () => activeRealtimeService;
const resolveRealtimeChannel = (event: string) => {
  const [channel] = event.trim().split('.', 1);
  return channel && channel.length > 0 ? channel : 'unknown';
};

const isRealtimeBusRedisEnvelope = (
  payload: RealtimeBusEnvelope,
): payload is RealtimeBusRedisEnvelope =>
  'storage' in payload && payload.storage === 'redis';

const buildRealtimeBusInlineEnvelope = (
  payload: RealtimeBusPublishPayload,
): RealtimeBusInlineEnvelope => ({
  originId: realtimeProcessId,
  ...payload,
});

const serializeRealtimeBusEnvelope = (payload: RealtimeBusEnvelope) =>
  JSON.stringify(payload);

const buildRealtimeBusRedisKey = () =>
  `${REALTIME_PG_NOTIFY_REDIS_PREFIX}:${randomUUID()}`;

const storeRealtimeBusEnvelopeInRedis = async (
  payload: RealtimeBusInlineEnvelope,
): Promise<RealtimeBusRedisEnvelope | null> => {
  const redis = getRedis();
  if (!redis) {
    logger.warning('skipping oversized realtime bus payload because redis is unavailable', {
      channel: REALTIME_PG_NOTIFY_CHANNEL,
      scope: payload.scope,
      event: payload.event,
    });
    return null;
  }

  const redisKey = buildRealtimeBusRedisKey();
  try {
    await redis.set(
      redisKey,
      serializeRealtimeBusEnvelope(payload),
      'EX',
      REALTIME_PG_NOTIFY_REFERENCE_TTL_SECONDS,
    );
    return {
      originId: payload.originId,
      storage: 'redis',
      redisKey,
    };
  } catch (error) {
    logger.warning('failed to store oversized realtime bus payload in redis', {
      channel: REALTIME_PG_NOTIFY_CHANNEL,
      scope: payload.scope,
      event: payload.event,
      redisKey,
      err: error,
    });
    captureException(error, {
      tags: {
        source: 'realtime_bus_publish_store',
        scope: payload.scope,
      },
      extra: {
        channel: REALTIME_PG_NOTIFY_CHANNEL,
        redisKey,
      },
    });
    return null;
  }
};

const resolveRealtimeBusNotifyPayload = async (
  payload: RealtimeBusPublishPayload,
) => {
  const inlineEnvelope = buildRealtimeBusInlineEnvelope(payload);
  const inlineRawPayload = serializeRealtimeBusEnvelope(inlineEnvelope);
  if (
    Buffer.byteLength(inlineRawPayload, 'utf8') <=
    REALTIME_PG_NOTIFY_MAX_PAYLOAD_BYTES
  ) {
    return inlineRawPayload;
  }

  const redisEnvelope = await storeRealtimeBusEnvelopeInRedis(inlineEnvelope);
  if (!redisEnvelope) {
    return null;
  }

  return serializeRealtimeBusEnvelope(redisEnvelope);
};

const loadRealtimeBusEnvelopeFromRedis = async (
  payload: RealtimeBusRedisEnvelope,
): Promise<RealtimeBusInlineEnvelope | null> => {
  const redis = getRedis();
  if (!redis) {
    logger.warning('failed to resolve realtime bus payload because redis is unavailable', {
      channel: REALTIME_PG_NOTIFY_CHANNEL,
      redisKey: payload.redisKey,
    });
    return null;
  }

  try {
    const rawPayload = await redis.get(payload.redisKey);
    if (!rawPayload) {
      logger.warning('realtime bus payload reference expired before delivery', {
        channel: REALTIME_PG_NOTIFY_CHANNEL,
        redisKey: payload.redisKey,
      });
      return null;
    }

    const parsed = JSON.parse(rawPayload) as RealtimeBusInlineEnvelope;
    return parsed;
  } catch (error) {
    logger.warning('failed to load realtime bus payload reference from redis', {
      channel: REALTIME_PG_NOTIFY_CHANNEL,
      redisKey: payload.redisKey,
      err: error,
    });
    captureException(error, {
      tags: {
        source: 'realtime_bus_payload_load',
      },
      extra: {
        channel: REALTIME_PG_NOTIFY_CHANNEL,
        redisKey: payload.redisKey,
      },
    });
    return null;
  }
};

const resolveRealtimeBusEnvelope = async (
  rawPayload: string,
): Promise<RealtimeBusInlineEnvelope | null> => {
  const parsed = JSON.parse(rawPayload) as RealtimeBusEnvelope;
  if (parsed.originId === realtimeProcessId) {
    return null;
  }

  if (isRealtimeBusRedisEnvelope(parsed)) {
    return loadRealtimeBusEnvelopeFromRedis(parsed);
  }

  return parsed;
};

const applyRealtimeBusEnvelope = (
  service: RealtimeService,
  payload: RealtimeBusInlineEnvelope
) => {
  switch (payload.scope) {
    case 'topic':
      service.publishToTopic({
        topic: payload.topic,
        event: payload.event,
        data: payload.data,
      });
      return;
    case 'user':
      service.publishToUser({
        userId: payload.userId,
        event: payload.event,
        data: payload.data,
      });
      return;
    case 'session':
      service.publishToSession({
        sessionId: payload.sessionId,
        event: payload.event,
        data: payload.data,
      });
  }
};

const ensureRealtimeBus = async () => {
  if (realtimeBusReady) {
    return realtimeBusReady;
  }

  realtimeBusReady = (async () => {
    try {
      await client.listen(
        REALTIME_PG_NOTIFY_CHANNEL,
        (rawPayload) => {
          void (async () => {
            try {
              const parsed = await resolveRealtimeBusEnvelope(rawPayload);
              if (!parsed) {
                return;
              }

              const service = getActiveRealtimeService();
              if (!service) {
                return;
              }

              applyRealtimeBusEnvelope(service, parsed);
            } catch (error) {
              logger.warning('failed to process realtime bus payload', {
                channel: REALTIME_PG_NOTIFY_CHANNEL,
                err: error,
              });
              captureException(error, {
                tags: {
                  source: 'realtime_bus_payload',
                },
                extra: {
                  channel: REALTIME_PG_NOTIFY_CHANNEL,
                },
              });
            }
          })();
        },
        () => {
          logger.info('realtime bus listener ready', {
            channel: REALTIME_PG_NOTIFY_CHANNEL,
          });
        }
      );
    } catch (error) {
      logger.warning('realtime bus listener disabled', {
        channel: REALTIME_PG_NOTIFY_CHANNEL,
        err: error,
      });
      captureException(error, {
        tags: {
          source: 'realtime_bus_listener',
        },
        extra: {
          channel: REALTIME_PG_NOTIFY_CHANNEL,
        },
      });
    }
  })();

  return realtimeBusReady;
};

const publishRealtimeToBus = async (payload: RealtimeBusPublishPayload) => {
  const rawPayload = await resolveRealtimeBusNotifyPayload(payload);
  if (!rawPayload) {
    return;
  }

  try {
    await client.notify(REALTIME_PG_NOTIFY_CHANNEL, rawPayload);
  } catch (error) {
    logger.warning('failed to publish realtime bus payload', {
      channel: REALTIME_PG_NOTIFY_CHANNEL,
      scope: payload.scope,
      err: error,
    });
    captureException(error, {
      tags: {
        source: 'realtime_bus_publish',
        scope: payload.scope,
      },
      extra: {
        channel: REALTIME_PG_NOTIFY_CHANNEL,
      },
    });
    throw error;
  }
};

const publishWithTelemetry = (
  payload: RealtimeBusPublishPayload,
  publishLocal: () => number
) => {
  const startedAt = Date.now();
  const channel = resolveRealtimeChannel(payload.event);
  const span = realtimeTracer.startSpan('realtime.publish', {
    attributes: {
      'app.realtime.scope': payload.scope,
      'app.realtime.channel': channel,
      'app.realtime.event': payload.event,
      ...(payload.scope === 'topic'
        ? { 'app.realtime.topic': payload.topic }
        : payload.scope === 'user'
          ? { 'enduser.id': String(payload.userId) }
          : { 'app.realtime.session_id': payload.sessionId }),
    },
  });

  span.addEvent('realtime.publish.start', {
    'app.realtime.scope': payload.scope,
    'app.realtime.channel': channel,
    'app.realtime.event': payload.event,
  });

  let localDelivered = 0;
  try {
    localDelivered = publishLocal();
    span.setAttribute('app.realtime.local_delivered', localDelivered);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'realtime publish failed',
    });
    span.addEvent('realtime.publish.end', {
      'app.realtime.scope': payload.scope,
      'app.realtime.channel': channel,
      'app.realtime.event': payload.event,
      'app.realtime.duration_ms': durationMs,
      'app.realtime.local_delivered': localDelivered,
      'app.realtime.error': true,
    });
    recordRealtimePublishDuration({
      scope: payload.scope,
      channel,
      event: payload.event,
      durationMs,
    });
    span.end();
    throw error;
  }

  void publishRealtimeToBus(payload)
    .catch((error) => {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'realtime bus publish failed',
      });
    })
    .finally(() => {
      const durationMs = Date.now() - startedAt;
      span.addEvent('realtime.publish.end', {
        'app.realtime.scope': payload.scope,
        'app.realtime.channel': channel,
        'app.realtime.event': payload.event,
        'app.realtime.duration_ms': durationMs,
        'app.realtime.local_delivered': localDelivered,
      });
      recordRealtimePublishDuration({
        scope: payload.scope,
        channel,
        event: payload.event,
        durationMs,
      });
      span.end();
    });

  return localDelivered;
};

export async function registerRealtime(
  app: AppInstance,
  options: RealtimeTransportOptions = {}
) {
  const service = new RealtimeService(options);
  setActiveRealtimeService(service);
  await ensureRealtimeBus();
  for (const authorizer of pendingTopicAuthorizers) {
    service.registerTopicAuthorizer(authorizer);
  }
  app.decorate('realtime', service);
  await registerRealtimeRoutes(app, service);
  app.addHook('onClose', async () => {
    if (getActiveRealtimeService() === service) {
      setActiveRealtimeService(null);
    }
    realtimeBusReady = null;
    await service.close();
  });
}

export const publishRealtimeToTopic = (payload: {
  topic: string;
  event: string;
  data: RealtimeJsonValue;
}) => {
  return publishWithTelemetry(
    {
      scope: 'topic',
      topic: payload.topic,
      event: payload.event,
      data: payload.data,
    },
    () => getActiveRealtimeService()?.publishToTopic(payload) ?? 0
  );
};

export const publishRealtimeToUser = (payload: {
  userId: number;
  event: string;
  data: RealtimeJsonValue;
}) => {
  return publishWithTelemetry(
    {
      scope: 'user',
      userId: payload.userId,
      event: payload.event,
      data: payload.data,
    },
    () => getActiveRealtimeService()?.publishToUser(payload) ?? 0
  );
};

export const publishRealtimeToSession = (payload: {
  sessionId: string;
  event: string;
  data: RealtimeJsonValue;
}) => {
  return publishWithTelemetry(
    {
      scope: 'session',
      sessionId: payload.sessionId,
      event: payload.event,
      data: payload.data,
    },
    () => getActiveRealtimeService()?.publishToSession(payload) ?? 0
  );
};

export const registerRealtimeTopicAuthorizer = (
  authorizer: RealtimeTopicAuthorizer
) => {
  pendingTopicAuthorizers.add(authorizer);
  const unregisterFromActive =
    getActiveRealtimeService()?.registerTopicAuthorizer(authorizer) ?? null;

  return () => {
    pendingTopicAuthorizers.delete(authorizer);
    unregisterFromActive?.();
  };
};

export { RealtimeService } from './service';
