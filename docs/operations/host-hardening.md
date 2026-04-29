# Host Hardening Baseline

This repo now assumes a three-layer single-host topology for staging and
production:

- `reverse-proxy` is the only public entry point and publishes `80/443`.
- `frontend`, `admin`, and `backend` live on the internal `app` network.
- `postgres` and `redis` live on the internal `data` network.

## Public Boundary

- Only expose `app`, `admin`, and `api` hostnames through the reverse proxy.
- Do not publish Docker `ports` for `backend`, `frontend`, `admin`, `postgres`,
  or `redis`.
- Keep `/metrics` and `/health*` off the public internet. Scrape or probe them
  from the host, a VPN, or an internal monitoring network.
- Put a CDN/WAF in front of the reverse proxy before go-live.
- Record the production edge in the deploy environment with
  `WAF_CDN_PROVIDER`, `WAF_CDN_DASHBOARD_URL`, and `ADMIN_EDGE_ACCESS_POLICY`
  so the release gate can block public exposure when those controls are absent.
- Protect the admin hostname with an additional access layer when possible,
  such as VPN, identity-aware proxy, or CDN access policy.

## Identity And Access

- Use a dedicated deployment account per environment.
- Limit the deploy account to the application path, Docker operations, and log
  access required for deployments and rollback.
- Do not reuse the same SSH key or secret-manager role across development,
  staging, and production.
- Keep secret-manager sync credentials separate from the GitHub Actions deploy
  SSH key.

## Host Baseline

- Enable automatic security updates or a documented patch window for the OS and
  Docker Engine.
- Track kernel and container runtime CVEs; patch critical issues on an
  emergency path.
- Alert on filesystem read-only remounts and inode exhaustion for the same
  mountpoints.
- Record the latest hardening review in `HOST_HARDENING_LAST_REVIEW_UTC` and the
  patch cadence in `HOST_PATCH_WINDOW`.
- Register the real scrape jobs in `NODE_EXPORTER_JOB`,
  `POSTGRES_EXPORTER_JOB`, and `REDIS_EXPORTER_JOB` before enabling deploys.
- Enable disk-capacity alerts for the root filesystem, Docker storage,
  `reward_postgres_data`, `reward_redis_data`, and
  `${DEPLOY_PATH}/shared/<environment>/proxy/logs`.
- Alert on filesystem errors, read-only remounts, and inode exhaustion.
- Retain access to system logs, Docker logs, and reverse-proxy access logs for
  incident analysis.

## Repeatable Runtime Layout

Each deployed environment should own a dedicated shared state tree:

```text
$DEPLOY_PATH/
  current -> releases/<sha>
  releases/<sha>/
  shared/
    staging/
      env/
      secrets/
      proxy/
        data/
        config/
        logs/
    production/
      env/
      secrets/
      proxy/
        data/
        config/
        logs/
```

The deploy workflow recreates release directories on every rollout and reuses
only the environment-specific shared state above.
