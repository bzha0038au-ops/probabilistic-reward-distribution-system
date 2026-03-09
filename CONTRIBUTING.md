# Contributing

## Workflow

1. Create a branch from `main`.
2. Keep changes scoped and include tests when touching core logic.
3. Run `pnpm check` and `pnpm test` before opening a PR.

## Code Style

- TypeScript strict mode is required.
- Avoid business logic in HTTP route handlers.
- Use shared response envelopes for API routes.

## Commits

- Use short, descriptive commit messages (e.g., `feat: add draw audit log`).
- Do not include secrets or `.env` files in commits.
