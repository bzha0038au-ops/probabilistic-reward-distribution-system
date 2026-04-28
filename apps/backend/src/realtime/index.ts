import type { AppInstance } from '../http/routes/types';
import type { RealtimeJsonValue } from '@reward/shared-types/realtime';

import { registerRealtimeRoutes } from './routes';
import {
  RealtimeService,
  type RealtimeTopicAuthorizer,
  type RealtimeTransportOptions,
} from './service';

let activeRealtimeService: RealtimeService | null = null;
const pendingTopicAuthorizers = new Set<RealtimeTopicAuthorizer>();

const setActiveRealtimeService = (service: RealtimeService | null) => {
  activeRealtimeService = service;
};

const getActiveRealtimeService = () => activeRealtimeService;

export async function registerRealtime(
  app: AppInstance,
  options: RealtimeTransportOptions = {}
) {
  const service = new RealtimeService(options);
  setActiveRealtimeService(service);
  for (const authorizer of pendingTopicAuthorizers) {
    service.registerTopicAuthorizer(authorizer);
  }
  app.decorate('realtime', service);
  await registerRealtimeRoutes(app, service);
  app.addHook('onClose', async () => {
    if (getActiveRealtimeService() === service) {
      setActiveRealtimeService(null);
    }
    await service.close();
  });
}

export const publishRealtimeToTopic = (payload: {
  topic: string;
  event: string;
  data: RealtimeJsonValue;
}) => getActiveRealtimeService()?.publishToTopic(payload) ?? 0;

export const publishRealtimeToUser = (payload: {
  userId: number;
  event: string;
  data: RealtimeJsonValue;
}) => getActiveRealtimeService()?.publishToUser(payload) ?? 0;

export const publishRealtimeToSession = (payload: {
  sessionId: string;
  event: string;
  data: RealtimeJsonValue;
}) => getActiveRealtimeService()?.publishToSession(payload) ?? 0;

export const registerRealtimeTopicAuthorizer = (
  authorizer: RealtimeTopicAuthorizer
) => {
  pendingTopicAuthorizers.add(authorizer);
  const unregisterFromActive =
    getActiveRealtimeService()?.registerTopicAuthorizer(authorizer) ?? null;

  return () => {
    pendingTopicAuthorizers.delete(authorizer);
    unregisterFromActive?.();
  };
};

export { RealtimeService } from './service';
