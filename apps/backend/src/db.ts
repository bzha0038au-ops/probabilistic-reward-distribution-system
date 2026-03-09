import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '@reward/database';
import { getConfig } from './shared/config';

const { databaseUrl } = getConfig();

const client = postgres(databaseUrl, {
  ssl: process.env.POSTGRES_SSL === 'true' ? 'require' : undefined,
  max: 10,
});

export const db = drizzle(client, { schema });
export { client };
