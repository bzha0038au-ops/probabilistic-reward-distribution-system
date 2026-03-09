import convict from 'convict';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppConfig = {
  databaseUrl: string;
  drawCost: number;
  logLevel: LogLevel;
  nodeEnv: 'development' | 'production' | 'test';
  webBaseUrl: string;
  adminBaseUrl: string;
  port: number;
};

let cachedConfig: AppConfig | null = null;

const schema = {
  databaseUrl: {
    doc: 'Primary database connection string',
    format: String,
    default: '',
    env: 'DATABASE_URL',
  },
  drawCost: {
    doc: 'Default draw cost (used to seed system_config)',
    format: 'int',
    default: 10,
    env: 'DRAW_COST',
  },
  logLevel: {
    doc: 'Application log level',
    format: ['debug', 'info', 'warn', 'error'],
    default: 'info',
    env: 'LOG_LEVEL',
  },
  nodeEnv: {
    doc: 'Runtime environment',
    format: ['development', 'production', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  webBaseUrl: {
    doc: 'Web frontend base URL',
    format: String,
    default: 'http://localhost:3000',
    env: 'WEB_BASE_URL',
  },
  adminBaseUrl: {
    doc: 'Admin frontend base URL',
    format: String,
    default: 'http://localhost:5173',
    env: 'ADMIN_BASE_URL',
  },
  port: {
    doc: 'Backend listening port',
    format: 'port',
    default: 4000,
    env: 'PORT',
  },
};

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const config = convict(schema);
  if (!config.get('databaseUrl') && process.env.POSTGRES_URL) {
    config.set('databaseUrl', process.env.POSTGRES_URL);
  }

  config.validate({ allowed: 'strict' });

  const properties = config.getProperties() as AppConfig;
  if (!properties.databaseUrl) {
    throw new Error('DATABASE_URL or POSTGRES_URL is not set');
  }

  cachedConfig = properties;

  return cachedConfig;
}

export function resetConfig() {
  cachedConfig = null;
}
