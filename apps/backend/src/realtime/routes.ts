import type { AppInstance } from '../http/routes/types';
import { logger } from '../shared';
import { requireRealtimeUserGuard } from './auth';
import { RealtimeService } from './service';

export async function registerRealtimeRoutes(
  app: AppInstance,
  realtime: RealtimeService
) {
  app.get(
    '/realtime',
    {
      websocket: true,
      preValidation: requireRealtimeUserGuard,
    },
    (connection, request) => {
      const user = request.user;
      if (!user) {
        connection.socket.close();
        return;
      }

      realtime.attachConnection({ socket: connection.socket, user });
      logger.info('realtime websocket upgraded', {
        userId: user.userId,
        sessionId: user.sessionId,
      });
    }
  );
}
