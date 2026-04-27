import { startApp } from './app';

try {
  const { app, port } = await startApp();
  app.log.info(`backend listening on ${port}`);
} catch (error) {
  console.error('failed to start backend', error);
  process.exit(1);
}
