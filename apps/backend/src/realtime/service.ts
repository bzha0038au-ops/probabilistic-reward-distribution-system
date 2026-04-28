import { randomUUID } from 'node:crypto';
import { setInterval } from 'node:timers';
import type { RawData, WebSocket } from 'ws';

import {
  REALTIME_CLOSE_CODES,
  REALTIME_ERROR_CODES,
  REALTIME_PROTOCOL_VERSION,
  RealtimeClientMessageSchema,
  RealtimeEventMessageSchema,
  RealtimeHelloMessageSchema,
  RealtimeResumedMessageSchema,
  RealtimeServerMessageSchema,
  RealtimeServerPingMessageSchema,
  RealtimeServerPongMessageSchema,
  RealtimeSubscribedMessageSchema,
  RealtimeTopicSchema,
  RealtimeUnsubscribedMessageSchema,
  type RealtimeErrorCode,
  type RealtimeEventMessage,
  type RealtimeJsonValue,
  type RealtimeServerMessage,
} from '@reward/shared-types/realtime';

import { validateAuthSession } from '../modules/session/service';
import { context } from '../shared/context';
import { logger } from '../shared/logger';
import { captureException } from '../shared/telemetry';
import type { UserSessionPayload } from '../shared/user-session';

const WS_OPEN = 1;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 10_000;
const DEFAULT_RECONNECT_WINDOW_MS = 60_000;
const DEFAULT_SESSION_VALIDATION_INTERVAL_MS = 60_000;

const toIsoNow = () => new Date().toISOString();
const uniqueTopics = (topics: Iterable<string>) => [...new Set(topics)];
const getUserScopeTopic = (userId: number) => `user:${userId}`;
const getSessionScopeTopic = (sessionId: string) => `session:${sessionId}`;
const isReservedTopic = (topic: string) =>
  topic.startsWith('user:') || topic.startsWith('session:');

type RealtimeConnectionState = {
  id: string;
  socket: WebSocket;
  user: UserSessionPayload;
  sessionId: string;
  resumeToken: string;
  subscriptions: Set<string>;
  heartbeatTimer: ReturnType<typeof setInterval>;
  pendingPingId: string | null;
  pendingPingSentAt: number | null;
  lastActivityAt: number;
  lastSessionValidationAt: number;
  sessionValidationInFlight: boolean;
  preserveResumeOnClose: boolean;
  closed: boolean;
};

type RealtimeResumeSnapshot = {
  connectionId: string;
  userId: number;
  sessionId: string;
  subscriptions: string[];
  expiresAt: number;
  lastEventSequence: number;
};

type BufferedRealtimeEvent = {
  sequence: number;
  createdAt: number;
  message: RealtimeEventMessage;
};

export type RealtimeTopicAuthorizer = (payload: {
  connectionId: string;
  userId: number;
  sessionId: string;
  topic: string;
}) => boolean | Promise<boolean>;

export type RealtimeTransportOptions = {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  reconnectWindowMs?: number;
  sessionValidationIntervalMs?: number;
};

export class RealtimeService {
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly reconnectWindowMs: number;
  private readonly sessionValidationIntervalMs: number;
  private readonly connections = new Map<string, RealtimeConnectionState>();
  private readonly topicConnections = new Map<string, Set<string>>();
  private readonly userConnections = new Map<number, Set<string>>();
  private readonly sessionConnections = new Map<string, Set<string>>();
  private readonly resumeSnapshots = new Map<string, RealtimeResumeSnapshot>();
  private readonly bufferedEvents: BufferedRealtimeEvent[] = [];
  private readonly topicAuthorizers = new Set<RealtimeTopicAuthorizer>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private nextEventSequence = 1;
  private shuttingDown = false;

  constructor(options: RealtimeTransportOptions = {}) {
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.reconnectWindowMs =
      options.reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS;
    this.sessionValidationIntervalMs =
      options.sessionValidationIntervalMs ??
      DEFAULT_SESSION_VALIDATION_INTERVAL_MS;

    const cleanupIntervalMs = Math.max(
      1_000,
      Math.min(this.reconnectWindowMs, this.sessionValidationIntervalMs)
    );
    this.cleanupTimer = setInterval(() => {
      this.pruneExpiredResumeSnapshots();
      this.pruneBufferedEvents();
    }, cleanupIntervalMs);
  }

  attachConnection(payload: { socket: WebSocket; user: UserSessionPayload }) {
    const now = Date.now();
    const state: RealtimeConnectionState = {
      id: randomUUID(),
      socket: payload.socket,
      user: payload.user,
      sessionId: payload.user.sessionId,
      resumeToken: randomUUID(),
      subscriptions: new Set<string>(),
      heartbeatTimer: undefined as unknown as ReturnType<typeof setInterval>,
      pendingPingId: null,
      pendingPingSentAt: null,
      lastActivityAt: now,
      lastSessionValidationAt: now,
      sessionValidationInFlight: false,
      preserveResumeOnClose: true,
      closed: false,
    };

    state.heartbeatTimer = setInterval(() => {
      void this.handleHeartbeat(state);
    }, this.heartbeatIntervalMs);

    this.connections.set(state.id, state);
    this.addIndexedConnection(this.userConnections, payload.user.userId, state.id);
    this.addIndexedConnection(this.sessionConnections, state.sessionId, state.id);

    payload.socket.on('message', (raw) => {
      void this.handleRawMessage(state, raw);
    });
    payload.socket.on('close', () => {
      this.handleClose(state);
    });
    payload.socket.on('error', (error) => {
      logger.warning('realtime socket error', {
        connectionId: state.id,
        userId: state.user.userId,
        sessionId: state.sessionId,
        err: error,
      });
    });

    this.sendServerMessage(
      state,
      RealtimeHelloMessageSchema.parse({
        type: 'transport.hello',
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        connectionId: state.id,
        sessionId: state.sessionId,
        userId: state.user.userId,
        resumeToken: state.resumeToken,
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        heartbeatTimeoutMs: this.heartbeatTimeoutMs,
        reconnectWindowMs: this.reconnectWindowMs,
        serverTime: toIsoNow(),
        subscriptions: [],
      })
    );

    logger.info('realtime connection opened', {
      connectionId: state.id,
      userId: state.user.userId,
      sessionId: state.sessionId,
    });

    return state.id;
  }

  registerTopicAuthorizer(authorizer: RealtimeTopicAuthorizer) {
    this.topicAuthorizers.add(authorizer);
    return () => {
      this.topicAuthorizers.delete(authorizer);
    };
  }

  publishToTopic(payload: {
    topic: string;
    event: string;
    data: RealtimeJsonValue;
  }) {
    const topic = RealtimeTopicSchema.parse(payload.topic);
    const message = this.createRealtimeEventMessage({
      topic,
      event: payload.event,
      data: payload.data,
    });
    this.bufferRealtimeEvent(message);
    const connectionIds = this.topicConnections.get(topic);
    if (!connectionIds || connectionIds.size === 0) {
      return 0;
    }

    return this.publishToConnections(connectionIds, message);
  }

  publishToUser(payload: {
    userId: number;
    event: string;
    data: RealtimeJsonValue;
  }) {
    const message = this.createRealtimeEventMessage({
      topic: getUserScopeTopic(payload.userId),
      event: payload.event,
      data: payload.data,
    });
    this.bufferRealtimeEvent(message);
    const connectionIds = this.userConnections.get(payload.userId);
    if (!connectionIds || connectionIds.size === 0) {
      return 0;
    }

    return this.publishToConnections(connectionIds, message);
  }

  publishToSession(payload: {
    sessionId: string;
    event: string;
    data: RealtimeJsonValue;
  }) {
    const message = this.createRealtimeEventMessage({
      topic: getSessionScopeTopic(payload.sessionId),
      event: payload.event,
      data: payload.data,
    });
    this.bufferRealtimeEvent(message);
    const connectionIds = this.sessionConnections.get(payload.sessionId);
    if (!connectionIds || connectionIds.size === 0) {
      return 0;
    }

    return this.publishToConnections(connectionIds, message);
  }

  async close() {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    clearInterval(this.cleanupTimer);

    const activeConnections = [...this.connections.values()];
    for (const connection of activeConnections) {
      this.forceCloseConnection(
        connection,
        REALTIME_CLOSE_CODES.SERVER_SHUTDOWN,
        'server_shutdown',
        false
      );
    }

    this.resumeSnapshots.clear();
    this.topicAuthorizers.clear();
  }

  private publishToConnections(
    connectionIds: Iterable<string>,
    message: RealtimeEventMessage
  ) {
    let delivered = 0;
    for (const connectionId of connectionIds) {
      const connection = this.connections.get(connectionId);
      if (!connection || connection.closed) {
        continue;
      }

      if (this.sendServerMessage(connection, message)) {
        delivered += 1;
      }
    }

    return delivered;
  }

  private async handleRawMessage(state: RealtimeConnectionState, raw: RawData) {
    if (state.closed) {
      return;
    }

    const parsed = this.parseClientMessage(raw);
    if (!parsed.ok) {
      this.sendTransportError(
        state,
        REALTIME_ERROR_CODES.INVALID_MESSAGE,
        'Invalid realtime message.',
        parsed.details
      );
      return;
    }

    state.lastActivityAt = Date.now();
    state.pendingPingId = null;
    state.pendingPingSentAt = null;

    switch (parsed.message.type) {
      case 'transport.ping': {
        this.sendServerMessage(
          state,
          RealtimeServerPongMessageSchema.parse({
            type: 'transport.pong',
            pingId: parsed.message.pingId,
            sentAt: toIsoNow(),
          })
        );
        return;
      }
      case 'transport.pong':
        return;
      case 'transport.subscribe':
        await this.handleSubscribe(state, parsed.message.topics);
        return;
      case 'transport.unsubscribe':
        this.handleUnsubscribe(state, parsed.message.topics);
        return;
      case 'transport.resume':
        this.handleResume(state, parsed.message.resumeToken);
        return;
    }
  }

  private parseClientMessage(raw: RawData) {
    const text =
      typeof raw === 'string'
        ? raw
        : Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
          : Buffer.from(raw).toString('utf8');

    try {
      const json = JSON.parse(text) as unknown;
      const result = RealtimeClientMessageSchema.safeParse(json);
      if (result.success) {
        return { ok: true as const, message: result.data };
      }

      return {
        ok: false as const,
        details: result.error.issues.map((issue) => issue.message),
      };
    } catch (error) {
      return {
        ok: false as const,
        details: [error instanceof Error ? error.message : 'Invalid JSON payload.'],
      };
    }
  }

  private async handleSubscribe(
    state: RealtimeConnectionState,
    requestedTopics: string[]
  ) {
    const accepted: string[] = [];
    const rejected: string[] = [];

    for (const topic of uniqueTopics(requestedTopics)) {
      const authorized = await this.canSubscribeToTopic(state, topic);
      if (!authorized) {
        rejected.push(topic);
        continue;
      }

      if (state.subscriptions.has(topic)) {
        accepted.push(topic);
        continue;
      }

      state.subscriptions.add(topic);
      this.addIndexedConnection(this.topicConnections, topic, state.id);
      accepted.push(topic);
    }

    if (accepted.length > 0) {
      this.sendServerMessage(
        state,
        RealtimeSubscribedMessageSchema.parse({
          type: 'transport.subscribed',
          topics: accepted,
        })
      );
    }

    if (rejected.length > 0) {
      this.sendTransportError(
        state,
        REALTIME_ERROR_CODES.FORBIDDEN_TOPIC,
        'One or more realtime topics are not allowed.',
        rejected.map((topic) => `forbidden topic: ${topic}`)
      );
    }
  }

  private handleUnsubscribe(
    state: RealtimeConnectionState,
    requestedTopics: string[]
  ) {
    const removed: string[] = [];
    for (const topic of uniqueTopics(requestedTopics)) {
      if (!state.subscriptions.delete(topic)) {
        continue;
      }

      this.deleteIndexedConnection(this.topicConnections, topic, state.id);
      removed.push(topic);
    }

    if (removed.length === 0) {
      return;
    }

    this.sendServerMessage(
      state,
      RealtimeUnsubscribedMessageSchema.parse({
        type: 'transport.unsubscribed',
        topics: removed,
      })
    );
  }

  private handleResume(state: RealtimeConnectionState, resumeToken: string) {
    const snapshot = this.resumeSnapshots.get(resumeToken);
    if (!snapshot || snapshot.expiresAt <= Date.now()) {
      this.resumeSnapshots.delete(resumeToken);
      this.sendTransportError(
        state,
        REALTIME_ERROR_CODES.RESUME_NOT_AVAILABLE,
        'Reconnect window expired. Please perform a fresh sync.',
        ['resume token not found or expired']
      );
      return;
    }

    if (
      snapshot.userId !== state.user.userId ||
      snapshot.sessionId !== state.sessionId
    ) {
      this.sendTransportError(
        state,
        REALTIME_ERROR_CODES.RESUME_SESSION_MISMATCH,
        'Reconnect token does not belong to the current session.',
        ['resume token session mismatch']
      );
      return;
    }

    const replayEvents = this.collectReplayableEvents(snapshot);
    if (replayEvents === null) {
      this.resumeSnapshots.delete(resumeToken);
      this.sendTransportError(
        state,
        REALTIME_ERROR_CODES.RESUME_NOT_AVAILABLE,
        'Reconnect window replay is no longer available. Please perform a fresh sync.',
        ['buffered realtime events expired before replay completed']
      );
      return;
    }

    this.resumeSnapshots.delete(resumeToken);
    for (const topic of snapshot.subscriptions) {
      if (state.subscriptions.has(topic)) {
        continue;
      }

      state.subscriptions.add(topic);
      this.addIndexedConnection(this.topicConnections, topic, state.id);
    }

    this.sendServerMessage(
      state,
      RealtimeResumedMessageSchema.parse({
        type: 'transport.resumed',
        previousConnectionId: snapshot.connectionId,
        resumedAt: toIsoNow(),
        subscriptions: [...state.subscriptions],
      })
    );

    for (const replayEvent of replayEvents) {
      this.sendServerMessage(state, replayEvent.message);
    }
  }

  private async canSubscribeToTopic(
    state: RealtimeConnectionState,
    topic: string
  ) {
    if (isReservedTopic(topic)) {
      return false;
    }

    if (topic.startsWith('public:')) {
      return true;
    }

    for (const authorizer of this.topicAuthorizers) {
      if (
        await authorizer({
          connectionId: state.id,
          userId: state.user.userId,
          sessionId: state.sessionId,
          topic,
        })
      ) {
        return true;
      }
    }

    return false;
  }

  private async handleHeartbeat(state: RealtimeConnectionState) {
    if (state.closed) {
      return;
    }

    await this.revalidateSessionIfNeeded(state);
    if (state.closed) {
      return;
    }

    const now = Date.now();
    if (
      state.pendingPingId &&
      state.pendingPingSentAt &&
      now - state.pendingPingSentAt >= this.heartbeatTimeoutMs
    ) {
      logger.warning('realtime heartbeat timed out', {
        connectionId: state.id,
        userId: state.user.userId,
        sessionId: state.sessionId,
      });
      this.forceCloseConnection(
        state,
        REALTIME_CLOSE_CODES.HEARTBEAT_TIMEOUT,
        'heartbeat_timeout',
        true
      );
      return;
    }

    const pingId = randomUUID();
    state.pendingPingId = pingId;
    state.pendingPingSentAt = now;
    this.sendServerMessage(
      state,
      RealtimeServerPingMessageSchema.parse({
        type: 'transport.ping',
        pingId,
        sentAt: toIsoNow(),
      })
    );
  }

  private async revalidateSessionIfNeeded(state: RealtimeConnectionState) {
    if (state.sessionValidationInFlight) {
      return;
    }

    const now = Date.now();
    if (now - state.lastSessionValidationAt < this.sessionValidationIntervalMs) {
      return;
    }

    state.sessionValidationInFlight = true;
    try {
      const session = await validateAuthSession({
        jti: state.sessionId,
        userId: state.user.userId,
        kind: 'user',
      });
      state.lastSessionValidationAt = Date.now();

      if (!session) {
        logger.info('realtime session no longer active', {
          connectionId: state.id,
          userId: state.user.userId,
          sessionId: state.sessionId,
        });
        this.forceCloseConnection(
          state,
          REALTIME_CLOSE_CODES.SESSION_REVOKED,
          'session_revoked',
          false
        );
      }
    } catch (error) {
      captureException(error, {
        tags: {
          source: 'realtime_session_revalidation',
        },
        extra: {
          connectionId: state.id,
          userId: state.user.userId,
          sessionId: state.sessionId,
        },
      });
      logger.warning('realtime session revalidation failed', {
        connectionId: state.id,
        userId: state.user.userId,
        sessionId: state.sessionId,
        err: error,
      });
    } finally {
      state.sessionValidationInFlight = false;
    }
  }

  private sendTransportError(
    state: RealtimeConnectionState,
    code: RealtimeErrorCode,
    message: string,
    details?: string[]
  ) {
    this.sendServerMessage(
      state,
      RealtimeServerMessageSchema.parse({
        type: 'transport.error',
        code,
        message,
        retryable:
          code === REALTIME_ERROR_CODES.RESUME_NOT_AVAILABLE ||
          code === REALTIME_ERROR_CODES.RESUME_SESSION_MISMATCH,
        details,
      })
    );
  }

  private sendServerMessage(
    state: RealtimeConnectionState,
    message: RealtimeServerMessage
  ) {
    if (state.socket.readyState !== WS_OPEN || state.closed) {
      return false;
    }

    try {
      state.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.warning('realtime send failed', {
        connectionId: state.id,
        userId: state.user.userId,
        sessionId: state.sessionId,
        err: error,
      });
      return false;
    }
  }

  private forceCloseConnection(
    state: RealtimeConnectionState,
    code: number,
    reason: string,
    preserveResume: boolean
  ) {
    if (state.closed) {
      return;
    }

    state.preserveResumeOnClose = preserveResume;
    state.pendingPingId = null;
    state.pendingPingSentAt = null;
    clearInterval(state.heartbeatTimer);
    if (state.socket.readyState === WS_OPEN) {
      state.socket.close(code, reason);
      return;
    }

    this.handleClose(state);
  }

  private handleClose(state: RealtimeConnectionState) {
    if (state.closed) {
      return;
    }

    state.closed = true;
    clearInterval(state.heartbeatTimer);
    this.connections.delete(state.id);
    this.deleteIndexedConnection(this.userConnections, state.user.userId, state.id);
    this.deleteIndexedConnection(this.sessionConnections, state.sessionId, state.id);
    for (const topic of state.subscriptions) {
      this.deleteIndexedConnection(this.topicConnections, topic, state.id);
    }

    if (state.preserveResumeOnClose && !this.shuttingDown) {
      this.resumeSnapshots.set(state.resumeToken, {
        connectionId: state.id,
        userId: state.user.userId,
        sessionId: state.sessionId,
        subscriptions: [...state.subscriptions],
        expiresAt: Date.now() + this.reconnectWindowMs,
        lastEventSequence: this.nextEventSequence - 1,
      });
    }

    logger.info('realtime connection closed', {
      connectionId: state.id,
      userId: state.user.userId,
      sessionId: state.sessionId,
      resumable: state.preserveResumeOnClose && !this.shuttingDown,
    });
  }

  private pruneExpiredResumeSnapshots() {
    const now = Date.now();
    for (const [resumeToken, snapshot] of this.resumeSnapshots.entries()) {
      if (snapshot.expiresAt <= now) {
        this.resumeSnapshots.delete(resumeToken);
      }
    }
  }

  private pruneBufferedEvents() {
    const cutoff = Date.now() - this.reconnectWindowMs;
    while (
      this.bufferedEvents.length > 0 &&
      (this.bufferedEvents[0]?.createdAt ?? 0) <= cutoff
    ) {
      this.bufferedEvents.shift();
    }
  }

  private createRealtimeEventMessage(payload: {
    topic: string;
    event: string;
    data: RealtimeJsonValue;
  }) {
    return RealtimeEventMessageSchema.parse({
      type: 'transport.event',
      topic: payload.topic,
      event: payload.event,
      data: payload.data,
      sentAt: toIsoNow(),
    });
  }

  private bufferRealtimeEvent(message: RealtimeEventMessage) {
    this.bufferedEvents.push({
      sequence: this.nextEventSequence,
      createdAt: Date.now(),
      message,
    });
    this.nextEventSequence += 1;
    this.pruneBufferedEvents();
  }

  private collectReplayableEvents(snapshot: RealtimeResumeSnapshot) {
    const currentLastSequence = this.nextEventSequence - 1;
    if (currentLastSequence <= snapshot.lastEventSequence) {
      return [] as BufferedRealtimeEvent[];
    }

    const oldestBufferedSequence = this.bufferedEvents[0]?.sequence ?? null;
    if (
      oldestBufferedSequence === null ||
      snapshot.lastEventSequence < oldestBufferedSequence - 1
    ) {
      return null;
    }

    const replayTopics = new Set([
      ...snapshot.subscriptions,
      getUserScopeTopic(snapshot.userId),
      getSessionScopeTopic(snapshot.sessionId),
    ]);

    return this.bufferedEvents.filter(
      (event) =>
        event.sequence > snapshot.lastEventSequence &&
        replayTopics.has(event.message.topic),
    );
  }

  private addIndexedConnection<Key extends string | number>(
    index: Map<Key, Set<string>>,
    key: Key,
    connectionId: string
  ) {
    const bucket = index.get(key);
    if (bucket) {
      bucket.add(connectionId);
      return;
    }

    index.set(key, new Set([connectionId]));
  }

  private deleteIndexedConnection<Key extends string | number>(
    index: Map<Key, Set<string>>,
    key: Key,
    connectionId: string
  ) {
    const bucket = index.get(key);
    if (!bucket) {
      return;
    }

    bucket.delete(connectionId);
    if (bucket.size === 0) {
      index.delete(key);
    }
  }
}

export const bindRealtimeActorContext = (payload: {
  userId: number;
  role: 'user' | 'admin';
}) => {
  const store = context().getStore();
  if (store) {
    store.userId = payload.userId;
    store.role = payload.role;
  }
};
