# Secret Rotation

Production secrets are expected to arrive through a secret manager and be
materialized as files in `$DEPLOY_PATH/shared/<environment>/secrets`.

## Secret Files

| Filename | Used by |
| --- | --- |
| `postgres_password` | `postgres` |
| `redis_password` | `redis`, backend Redis URL |
| `backend_database_url` | backend, migration job |
| `backend_redis_url` | backend, notification worker |
| `admin_jwt_secret` | backend, admin |
| `user_jwt_secret` | backend, frontend |
| `admin_jwt_secret_previous` | backend, admin (optional rotation window) |
| `user_jwt_secret_previous` | backend, frontend (optional rotation window) |
| `admin_mfa_encryption_secret` | backend |
| `admin_mfa_break_glass_secret` | backend |
| `frontend_auth_secret` | frontend |

Optional provider secret files:

- `auth_smtp_pass`
- `auth_twilio_auth_token`

## Rotation Rules

- Rotate on a fixed cadence and immediately after suspected exposure.
- Stage first, then production.
- Record who rotated the secret, when, why, and which deployment picked it up.
- Use different secret values per environment. Never promote the same value
  from staging into production.

## Rotation Procedure

1. Create the new value in the secret manager.
2. Sync the updated secret file into
   `$DEPLOY_PATH/shared/<environment>/secrets`.
3. If the rotated secret is `admin_jwt_secret` or `user_jwt_secret`, copy the
   old live value into `admin_jwt_secret_previous` or `user_jwt_secret_previous`
   before deploying. Keep the new value in the primary file; signers only use
   the primary file and verifiers accept both values during the drain window.
4. If the rotated secret changes a connection string, update the matching env
   file in `$DEPLOY_PATH/shared/<environment>/env`.
5. Deploy the target environment so containers restart against the new secret.
6. Validate login, write paths, and readiness probes.
7. Wait at least one full session TTL (`ADMIN_SESSION_TTL` for admin sessions,
   `USER_SESSION_TTL` for user sessions) so old cookies naturally age out.
8. Remove the `*_previous` file, deploy again, then revoke the old value.

## Session Rotation Notes

- `admin_jwt_secret` rotates without downtime when backend and admin both load
  the new current secret and the previous fallback secret in the same deploy.
- `user_jwt_secret` rotates without downtime when backend and frontend both load
  the new current secret and the previous fallback secret in the same deploy.
- `frontend_auth_secret` still invalidates Auth.js sessions. Schedule that
  rotation separately if you also need to preserve active web logins.
- Rotating `postgres_password` requires a coordinated update of
  `backend_database_url`.
- Rotating `redis_password` requires a coordinated update of
  `backend_redis_url`.
- Rotate `admin_mfa_break_glass_secret` after every use, not only on the normal
  cadence.
