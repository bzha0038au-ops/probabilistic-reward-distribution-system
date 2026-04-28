# Realtime Transport

This directory owns the backend WebSocket transport layer. It is intentionally
generic so turn-based games, lobby broadcasts, and other realtime features can
reuse one authenticated connection instead of introducing per-domain socket
stacks.

## Handshake

- Route: `GET /realtime`
- Transport: `@fastify/websocket`
- Auth sources, in priority order:
  - `Authorization: Bearer <backend-user-jwt>`
  - `reward_user_session` cookie
  - `?token=<backend-user-jwt>` query param
- The JWT is verified with `USER_JWT_SECRET` and then matched against the
  persisted `auth_sessions` row so the socket is bound to a concrete `sessionId`.

## Messages

- Server hello: `transport.hello`
- Heartbeat: `transport.ping` / `transport.pong`
- Subscription flow: `transport.subscribe` / `transport.subscribed`
- Reconnect flow: `transport.resume` / `transport.resumed`
- Broadcast delivery: `transport.event`
- Recoverable protocol errors: `transport.error`

The authoritative schemas live in `@reward/shared-types/realtime`.

## Topic rules

- `public:*` topics are open subscription channels for fan-out broadcasts.
- `user:*` and `session:*` are reserved internal scopes. They are delivered by
  targeted publish helpers and are not client-subscribable.
- Domain modules that need private rooms should register a topic authorizer
  rather than widening the default transport policy.
