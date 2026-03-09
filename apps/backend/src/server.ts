import 'dotenv/config';

import fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

import {
  RequestContextPlugin,
  fastifyErrorHandler,
  getConfig,
  getPinoLogger,
  installProcessHandlers,
} from './shared';
import { registerRoutes } from './http/routes';

const config = getConfig();
const app = fastify({ logger: getPinoLogger() });
installProcessHandlers(app.server);
app.setErrorHandler(fastifyErrorHandler);

await app.register(cookie);
await app.register(RequestContextPlugin);
await app.register(cors, {
  origin: [config.webBaseUrl, config.adminBaseUrl],
  credentials: true,
});

await registerRoutes(app);

const port = config.port;

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`backend listening on ${port}`))
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
