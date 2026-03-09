import type {
  FastifyInstance,
  FastifyTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { Logger } from 'pino';

export type AppInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  Logger,
  FastifyTypeProviderDefault
>;
