import type { AppInstance } from './types';
import {
  buildLivenessReport,
  buildReadinessReport,
  getMetricsContentType,
  refreshOperationalMetrics,
  renderMetrics,
} from '../../shared/observability';

export async function registerObservabilityRoutes(app: AppInstance) {
  app.get(
    '/health',
    { config: { rateLimit: false } },
    async (_request, reply) => reply.send(buildLivenessReport())
  );

  app.get(
    '/health/live',
    { config: { rateLimit: false } },
    async (_request, reply) => reply.send(buildLivenessReport())
  );

  app.get(
    '/health/ready',
    { config: { rateLimit: false } },
    async (_request, reply) => {
      const report = await buildReadinessReport();
      return reply
        .status(report.status === 'not_ready' ? 503 : 200)
        .send(report);
    }
  );

  app.get(
    '/metrics',
    { config: { rateLimit: false } },
    async (_request, reply) => {
      await buildReadinessReport();
      await refreshOperationalMetrics();
      return reply
        .header('content-type', getMetricsContentType())
        .send(await renderMetrics());
    }
  );
}
