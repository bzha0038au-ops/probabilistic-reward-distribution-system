import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from './schema';

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error('POSTGRES_URL is not set');
}

const client = postgres(connectionString, {
  ssl: process.env.POSTGRES_SSL === 'true' ? 'require' : undefined,
  max: 10,
});

export const db = drizzle(client, { schema });
export { client };
