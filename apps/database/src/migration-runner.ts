import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const legacyMigrationsFolder = path.join(packageRoot, "drizzle");
const compactedMigrationsFolder = path.join(packageRoot, "drizzle-baseline");

const resolveDatabaseUrl = (databaseUrl?: string) => {
  const value = databaseUrl ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (!value) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required to run migrations.");
  }

  return value;
};

const getNoticeField = (notice: unknown, key: "code" | "message") => {
  if (typeof notice !== "object" || notice === null || !(key in notice)) {
    return null;
  }

  const value = (notice as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
};

const isDrizzleBookkeepingNotice = (notice: unknown) => {
  const code = getNoticeField(notice, "code");
  const message = getNoticeField(notice, "message");

  return (
    (code === "42P06" && message === 'schema "drizzle" already exists, skipping') ||
    (code === "42P07" &&
      message === 'relation "__drizzle_migrations" already exists, skipping')
  );
};

const hasPublicTables = async (sql: Sql) => {
  const rows = await sql<Array<{ hasPublicTables: boolean }>>`
    select exists(
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename not like '__drizzle%'
    ) as "hasPublicTables"
  `;

  return rows[0]?.hasPublicTables ?? false;
};

const hasMigrationRows = async (sql: Sql) => {
  const tableRows = await sql<Array<{ migrationTable: string | null }>>`
    select to_regclass('drizzle.__drizzle_migrations')::text as "migrationTable"
  `;

  const migrationTable = tableRows[0]?.migrationTable ?? null;
  if (!migrationTable) {
    return {
      migrationTableExists: false,
      migrationRowsExist: false,
    };
  }

  const rowCount = await sql<Array<{ migrationRowsExist: boolean }>>`
    select exists(select 1 from drizzle.__drizzle_migrations) as "migrationRowsExist"
  `;

  return {
    migrationTableExists: true,
    migrationRowsExist: rowCount[0]?.migrationRowsExist ?? false,
  };
};

const shouldUseCompactedBaseline = async (sql: Sql) => {
  const [publicTablesExist, migrationState] = await Promise.all([
    hasPublicTables(sql),
    hasMigrationRows(sql),
  ]);

  if (!publicTablesExist && !migrationState.migrationRowsExist) {
    return true;
  }

  if (publicTablesExist && !migrationState.migrationTableExists) {
    throw new Error(
      "Database contains public tables but no drizzle migration table. Refusing compact baseline migration.",
    );
  }

  if (publicTablesExist && migrationState.migrationTableExists && !migrationState.migrationRowsExist) {
    throw new Error(
      "Database contains public tables but drizzle migration history is empty. Refusing compact baseline migration.",
    );
  }

  return false;
};

export async function runDatabaseMigrations(options: {
  databaseUrl?: string;
  verbose?: boolean;
} = {}) {
  const databaseUrl = resolveDatabaseUrl(options.databaseUrl);
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
    onnotice: (notice) => {
      if (isDrizzleBookkeepingNotice(notice)) {
        return;
      }

      const code = getNoticeField(notice, "code") ?? "unknown";
      const message = getNoticeField(notice, "message") ?? "unknown postgres notice";

      console.error("[db:migrate] postgres notice", {
        code,
        message,
      });
    },
  });

  try {
    const db = drizzle(sql);
    const useCompactedBaseline = await shouldUseCompactedBaseline(sql);

    if (useCompactedBaseline) {
      if (options.verbose) {
        console.error("[db:migrate] applying compacted baseline");
      }

      await migrate(db, { migrationsFolder: compactedMigrationsFolder });
    } else if (options.verbose) {
      console.error("[db:migrate] applying legacy incremental migrations");
    }

    await migrate(db, { migrationsFolder: legacyMigrationsFolder });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
