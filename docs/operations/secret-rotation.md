# Secret Rotation

Production secrets are expected to arrive through a secret manager and be
materialized as files in `$DEPLOY_PATH/shared/<environment>/secrets`.

Run a secret-rotation drill at least once every 90 days, and immediately after
suspected exposure. The drill is manual by intent, but the repo now provides
an executable CLI so the rotation path is not "follow prose and hope".

## Secret Files

| Filename | Used by |
| --- | --- |
| `postgres_password` | `postgres` |
| `redis_password` | `redis`, backend Redis URL |
| `backend_database_url` | backend, migration job |
| `backend_redis_url` | backend, notification worker |
| `admin_jwt_secret` | backend, admin |
| `user_jwt_secret` | backend, frontend, saas-portal verifier |
| `admin_jwt_secret_previous` | backend, admin (optional drain window) |
| `user_jwt_secret_previous` | backend, frontend, saas-portal verifier (optional drain window) |
| `admin_mfa_encryption_secret` | backend |
| `admin_mfa_break_glass_secret` | backend |
| `frontend_auth_secret` | frontend / Auth.js |

Optional provider secret files:

- `auth_smtp_pass`
- `auth_twilio_auth_token`

## Executable CLI

Use the unified entrypoint from the repo root:

```bash
pnpm ops:rotate-secret jwt status --target admin
pnpm ops:rotate-secret jwt stage --target admin --generate --apply
pnpm ops:rotate-secret jwt smoke --target admin --require-previous
pnpm ops:rotate-secret jwt finalize --target admin --apply

pnpm ops:rotate-secret saas status --project-id 123
pnpm ops:rotate-secret saas rotate --project-id 123 --key-id 456 --reason scheduled-rotation
pnpm ops:rotate-secret saas drill --project-id 123 --key-id 456 --current-key-file /secure/canary-key.txt --overlap-seconds 300
```

`pnpm ops:rotate-jwt` remains available as the narrow legacy helper, but new
runbooks should use `pnpm ops:rotate-secret`.

## Quarterly Drill Standard

Every quarterly drill must prove three things in production:

1. `ADMIN_JWT_SECRET_PREVIOUS` really lets existing admin sessions survive one deploy.
2. `USER_JWT_SECRET_PREVIOUS` really lets existing user sessions survive one deploy.
3. SaaS project API key rotation really supports overlap, cutover, and old-key rejection.

Use a dedicated canary SaaS tenant/project for the API key drill. Do not use a
customer-owned live integration as the rehearsal target.

Record the drill in the change ticket or incident system with:

- date, operator, approver
- environment
- command transcript or pasted output
- current and new secret fingerprints
- deploy SHA / release id
- validation results for admin login, user session continuity, and SaaS canary

Commit a machine-readable summary to `docs/operations/evidence/` using the
filename pattern `secret-rotation-YYYY-MM-DD.summary.json`. The release gate and
daily freshness check read one of these timestamp fields:

- `completed_at_utc`
- `finished_at_utc`
- `performed_at_utc`
- `date`

Example:

```json
{
  "date": "2026-04-30",
  "environment": "production",
  "operator": "ops@example.com",
  "approver": "security@example.com",
  "completed_at_utc": "2026-04-30T02:10:00Z",
  "scope": ["admin_jwt", "user_jwt", "saas_api_key_canary"],
  "result": "passed",
  "evidence_ticket": "SEC-1234"
}
```

## JWT Rotation Procedure

This is for `USER_JWT_SECRET` and `ADMIN_JWT_SECRET`. The mechanism is:

- signers always use the current secret file
- verifiers accept both current and `*_PREVIOUS` during the drain window
- after one full session TTL, remove `*_PREVIOUS` and deploy again

### 1. Inspect current state

```bash
pnpm ops:rotate-secret jwt status --target admin
pnpm ops:rotate-secret jwt status --target user
```

Confirm the current files resolve under the production secret directory and
that no stale `*_PREVIOUS` file is already active unless you are finishing an
in-flight rotation.

### 2. Stage the new secret

```bash
pnpm ops:rotate-secret jwt stage --target admin --generate --apply
pnpm ops:rotate-secret jwt stage --target user --generate --apply
```

This writes:

- the old live value into `admin_jwt_secret_previous` / `user_jwt_secret_previous`
- the new live value into `admin_jwt_secret` / `user_jwt_secret`

If your secret manager owns file sync, generate the value there first and then
re-run with `--value-file`.

### 3. Deploy and prove the fallback path

Deploy the environment so backend + admin + frontend + saas-portal all restart
against the new files, then run:

```bash
pnpm ops:rotate-secret jwt smoke --target admin --require-previous
pnpm ops:rotate-secret jwt smoke --target user --require-previous
```

The smoke command signs synthetic tokens with both current and previous values
and runs the real verifier code paths:

- `admin`: backend + admin session verifier
- `user`: backend + frontend + saas-portal verifier

This is the required proof that the `*_PREVIOUS` placeholder mechanism is
actually wired on prod, not just documented.

### 4. Live validation

After the deploy, explicitly validate:

- existing admin session still works
- new admin login still works
- an existing user web session still works
- a fresh user login still works
- readiness probes stay healthy

`AUTH_SECRET` is not part of this dual-secret mechanism. Rotating it still
invalidates Auth.js sessions and should be scheduled separately.

### 5. Drain and finalize

Wait at least one full session TTL:

- `ADMIN_SESSION_TTL` for admin
- `USER_SESSION_TTL` for user

Then remove the fallback file and deploy again:

```bash
pnpm ops:rotate-secret jwt finalize --target admin --apply
pnpm ops:rotate-secret jwt finalize --target user --apply
```

Re-check login and readiness, then revoke the retired values in the secret
manager.

## SaaS API Key Rotation Procedure

This is for project API keys under `/v1/engine/*`. It is not file-based and it
does not use `*_PREVIOUS`. Instead, rotation creates a new key, keeps the old
key alive for an overlap window, then lets the predecessor expire.

### Canary requirements

Before the quarterly drill, prepare:

- one dedicated canary tenant/project in production
- a current plaintext canary API key stored in the secret manager
- one synthetic probe that can be repointed to the new key immediately

### Inspect key chain

```bash
pnpm ops:rotate-secret saas status --project-id <canary_project_id>
```

### Run the drill

```bash
pnpm ops:rotate-secret saas drill \
  --project-id <canary_project_id> \
  --key-id <current_key_id> \
  --current-key-file /secure/canary-key.txt \
  --overlap-seconds 300 \
  --reason quarterly-secret-rotation-drill
```

The drill performs a real rotation and verifies:

1. old key authenticates during the overlap window
2. new key authenticates during the overlap window
3. old key stops authenticating after overlap expiry
4. new key continues to authenticate after overlap expiry

The command prints the fresh plaintext key once. Update the canary secret
manager entry and the canary probe immediately.

### Non-drill rotation

For planned production cutovers outside the quarterly drill:

```bash
pnpm ops:rotate-secret saas rotate \
  --project-id <project_id> \
  --key-id <current_key_id> \
  --reason scheduled-rotation
```

Deliver the fresh key through the team's secret manager process, confirm the
integrator has cut over, and monitor request success during the overlap window.

## Special Cases

- `frontend_auth_secret`: rotate in a separate maintenance window because it
  invalidates Auth.js sessions immediately.
- `postgres_password`: coordinate with `backend_database_url`.
- `redis_password`: coordinate with `backend_redis_url`.
- `admin_mfa_break_glass_secret`: rotate after every use, not just on the
  normal cadence.
