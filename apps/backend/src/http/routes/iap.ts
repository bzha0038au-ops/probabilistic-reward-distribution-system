import type { AppInstance } from './types';

import {
  processAppleIapNotification,
  processGooglePlayRtdnNotification,
} from '../../modules/economy/iap-service';
import { sendError, sendErrorForException, sendSuccess } from '../respond';

const readTrimmedString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export async function registerIapRoutes(app: AppInstance) {
  app.post('/iap/notifications/apple', async (request, reply) => {
    const body =
      typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>)
        : null;
    const signedPayload = readTrimmedString(body?.signedPayload);
    if (!signedPayload) {
      return sendError(reply, 400, 'signedPayload is required.');
    }

    try {
      const result = await processAppleIapNotification({
        signedPayload,
        audit: {
          sourceApp: 'app_store_server_notification',
          metadata: {
            route: 'iap_notifications_apple',
          },
        },
      });
      return sendSuccess(reply, result);
    } catch (error) {
      return sendErrorForException(
        reply,
        error,
        'Failed to process Apple IAP notification.'
      );
    }
  });

  app.post('/iap/notifications/google', async (request, reply) => {
    try {
      const authorizationHeader = Array.isArray(request.headers.authorization)
        ? request.headers.authorization[0] ?? null
        : request.headers.authorization ?? null;
      const result = await processGooglePlayRtdnNotification({
        authorizationHeader,
        body: request.body,
        audit: {
          sourceApp: 'google_play_rtdn',
          metadata: {
            route: 'iap_notifications_google',
          },
        },
      });
      return sendSuccess(reply, result);
    } catch (error) {
      return sendErrorForException(
        reply,
        error,
        'Failed to process Google Play notification.'
      );
    }
  });
}
