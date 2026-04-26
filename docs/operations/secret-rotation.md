# Secret Rotation

Production secrets are expected to arrive through a secret manager and be
materialized as files in `$DEPLOY_PATH/shared/<environment>/secrets`.

## Required Secret Files

| Filename | Used by |
| --- | --- |
| `postgres_password` | `postgres` |
| `redis_password` | `redis`, backend Redis URL |
| `backend_database_url` | backend, migration job |
| `backend_redis_url` | backend, notification worker |
| `admin_jwt_secret` | backend, admin |
| `user_jwt_secret` | backend |
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
3. If the rotated secret changes a connection string, update the matching env
   file in `$DEPLOY_PATH/shared/<environment>/env`.
4. Deploy the target environment so containers restart against the new secret.
5. Validate login, write paths, and readiness probes.
6. Revoke the old value after the new deployment is healthy.

## High-Impact Rotations

- Rotating `admin_jwt_secret`, `user_jwt_secret`, or `frontend_auth_secret`
  invalidates active sessions. Schedule this change and expect re-authentication.
- Rotating `postgres_password` requires a coordinated update of
  `backend_database_url`.
- Rotating `redis_password` requires a coordinated update of
  `backend_redis_url`.
- Rotate `admin_mfa_break_glass_secret` after every use, not only on the normal
  cadence.
