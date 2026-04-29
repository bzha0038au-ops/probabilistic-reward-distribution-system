import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '@reward/database';
import { getConfig } from './shared/config';

type SqlClient = ReturnType<typeof postgres>;

let cachedClient: SqlClient | null = null;
let cachedDb: ReturnType<typeof createDb> | null = null;

const createClient = () => {
  const config = getConfig();

  return postgres(config.databaseUrl, {
    ssl: process.env.POSTGRES_SSL === 'true' ? 'require' : undefined,
    max: config.databasePoolMax,
    idle_timeout: config.databasePoolIdleTimeoutSeconds,
    connect_timeout: config.databasePoolConnectTimeoutSeconds,
    max_lifetime: config.databasePoolMaxLifetimeSeconds,
  });
};

const getClientInstance = () => {
  if (!cachedClient) {
    cachedClient = createClient();
  }

  return cachedClient;
};

const createDb = () => drizzle(getClientInstance(), { schema });

const getDbInstance = () => {
  if (!cachedDb) {
    cachedDb = createDb();
  }

  return cachedDb;
};

const clientTarget = (() => undefined) as unknown as SqlClient;

export const client = new Proxy(clientTarget, {
  apply(_target, thisArg, args) {
    return Reflect.apply(
      getClientInstance() as unknown as (...input: unknown[]) => unknown,
      thisArg,
      args
    );
  },
  get(_target, property) {
    const value = Reflect.get(getClientInstance(), property);
    return typeof value === 'function' ? value.bind(getClientInstance()) : value;
  },
}) as SqlClient;

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, property) {
    const value = Reflect.get(getDbInstance(), property);
    return typeof value === 'function' ? value.bind(getDbInstance()) : value;
  },
}) as ReturnType<typeof createDb>;

export const resetDb = async () => {
  if (cachedClient) {
    await cachedClient.end();
    cachedClient = null;
  }

  cachedDb = null;
};

export type DbClient = ReturnType<typeof createDb>;
export type DbTransaction = Parameters<
  Parameters<DbClient['transaction']>[0]
>[0];
