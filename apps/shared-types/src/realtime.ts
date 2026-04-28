import { z } from 'zod';

export const REALTIME_PROTOCOL_VERSION = 1 as const;

export const REALTIME_ERROR_CODES = {
  FORBIDDEN_TOPIC: 'FORBIDDEN_TOPIC',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  RESUME_NOT_AVAILABLE: 'RESUME_NOT_AVAILABLE',
  RESUME_SESSION_MISMATCH: 'RESUME_SESSION_MISMATCH',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type RealtimeErrorCode =
  (typeof REALTIME_ERROR_CODES)[keyof typeof REALTIME_ERROR_CODES];

export const REALTIME_CLOSE_CODES = {
  HEARTBEAT_TIMEOUT: 4001,
  SESSION_REVOKED: 4002,
  SERVER_SHUTDOWN: 4003,
} as const;

export type RealtimeJsonValue =
  | string
  | number
  | boolean
  | null
  | RealtimeJsonValue[]
  | { [key: string]: RealtimeJsonValue };

export const RealtimeJsonValueSchema: z.ZodType<RealtimeJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(RealtimeJsonValueSchema),
    z.record(RealtimeJsonValueSchema),
  ])
);

export const RealtimeMessageIdSchema = z.string().trim().min(1).max(128);
export const RealtimeTopicSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9:_-]*$/i, 'Invalid realtime topic.');
export const RealtimeEventNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/i, 'Invalid realtime event name.');

const RealtimeMessageBaseSchema = z.object({
  id: RealtimeMessageIdSchema.optional(),
});

export const RealtimeClientPingMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.ping'),
  pingId: z.string().trim().min(1).max(128).optional(),
  sentAt: z.string().datetime().optional(),
});

export const RealtimeClientPongMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.pong'),
  pingId: z.string().trim().min(1).max(128).optional(),
  sentAt: z.string().datetime().optional(),
});

export const RealtimeSubscribeMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.subscribe'),
  topics: z.array(RealtimeTopicSchema).min(1).max(50),
});

export const RealtimeUnsubscribeMessageSchema = RealtimeMessageBaseSchema.extend(
  {
    type: z.literal('transport.unsubscribe'),
    topics: z.array(RealtimeTopicSchema).min(1).max(50),
  }
);

export const RealtimeResumeMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.resume'),
  resumeToken: z.string().trim().min(1).max(256),
});

export const RealtimeClientMessageSchema = z.discriminatedUnion('type', [
  RealtimeClientPingMessageSchema,
  RealtimeClientPongMessageSchema,
  RealtimeSubscribeMessageSchema,
  RealtimeUnsubscribeMessageSchema,
  RealtimeResumeMessageSchema,
]);

export type RealtimeClientMessage = z.infer<typeof RealtimeClientMessageSchema>;

export const RealtimeHelloMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.hello'),
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  connectionId: z.string(),
  sessionId: z.string(),
  userId: z.number().int().positive(),
  resumeToken: z.string(),
  heartbeatIntervalMs: z.number().int().positive(),
  heartbeatTimeoutMs: z.number().int().positive(),
  reconnectWindowMs: z.number().int().positive(),
  serverTime: z.string().datetime(),
  subscriptions: z.array(RealtimeTopicSchema),
});

export const RealtimeServerPingMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.ping'),
  pingId: z.string().trim().min(1).max(128),
  sentAt: z.string().datetime(),
});

export const RealtimeServerPongMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.pong'),
  pingId: z.string().trim().min(1).max(128).optional(),
  sentAt: z.string().datetime(),
});

export const RealtimeSubscribedMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.subscribed'),
  topics: z.array(RealtimeTopicSchema).min(1),
});

export const RealtimeUnsubscribedMessageSchema =
  RealtimeMessageBaseSchema.extend({
    type: z.literal('transport.unsubscribed'),
    topics: z.array(RealtimeTopicSchema).min(1),
  });

export const RealtimeResumedMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.resumed'),
  previousConnectionId: z.string(),
  resumedAt: z.string().datetime(),
  subscriptions: z.array(RealtimeTopicSchema),
});

export const RealtimeEventMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.event'),
  topic: RealtimeTopicSchema,
  event: RealtimeEventNameSchema,
  data: RealtimeJsonValueSchema,
  sentAt: z.string().datetime(),
});

export const RealtimeErrorMessageSchema = RealtimeMessageBaseSchema.extend({
  type: z.literal('transport.error'),
  code: z.string().trim().min(1).max(128),
  message: z.string().trim().min(1).max(500),
  retryable: z.boolean().default(false),
  details: z.array(z.string().trim().min(1).max(500)).optional(),
});

export const RealtimeServerMessageSchema = z.discriminatedUnion('type', [
  RealtimeHelloMessageSchema,
  RealtimeServerPingMessageSchema,
  RealtimeServerPongMessageSchema,
  RealtimeSubscribedMessageSchema,
  RealtimeUnsubscribedMessageSchema,
  RealtimeResumedMessageSchema,
  RealtimeEventMessageSchema,
  RealtimeErrorMessageSchema,
]);

export type RealtimeHelloMessage = z.infer<typeof RealtimeHelloMessageSchema>;
export type RealtimeServerMessage = z.infer<typeof RealtimeServerMessageSchema>;
export type RealtimeEventMessage = z.infer<typeof RealtimeEventMessageSchema>;
