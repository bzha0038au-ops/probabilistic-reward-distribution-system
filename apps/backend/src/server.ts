import 'dotenv/config';

import { buildApp } from './app';
import { getConfig, initializeObservability } from './shared';

initializeObservability();
const config = getConfig();
const app = await buildApp();
const port = config.port;

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`backend listening on ${port}`))
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
