# Database Package

Holds the Drizzle schema and migrations for the reward system.

## Scripts

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm check
pnpm lint
pnpm build
```

## Structure

- `src/modules` for domain tables
- `drizzle/` for migrations and snapshots
