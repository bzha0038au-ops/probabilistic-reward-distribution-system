import type { AppInstance } from './types';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import {
  CommunityPostListQuerySchema,
  CommunityThreadListQuerySchema,
  CreateCommunityPostRequestSchema,
  CreateCommunityThreadRequestSchema,
} from '@reward/shared-types/community';

import {
  createCommunityPost,
  createCommunityThread,
  getCommunityThreadDetail,
  listCommunityThreads,
  serializeCommunityPost,
  serializeCommunityThread,
} from '../../modules/community/service';
import { parseSchema } from '../../shared/validation';
import { requireUserGuard, requireUserKycTier } from '../guards';
import { sendError, sendErrorForException, sendSuccess } from '../respond';
import { parsePositiveInt, toObject } from '../utils';

const requireCommunityWriter = requireUserKycTier({ minimum: 'tier_1' });

export async function registerCommunityRoutes(app: AppInstance) {
  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', requireUserGuard);

    protectedRoutes.get('/community/threads', async (request, reply) => {
      const parsed = parseSchema(
        CommunityThreadListQuerySchema,
        toObject(request.query)
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const limit = parsed.data.limit ?? 20;
      const page = parsed.data.page ?? 1;
      const rows = await listCommunityThreads({ limit, page });
      const hasNext = rows.length > limit;
      const items = hasNext ? rows.slice(0, limit) : rows;

      return sendSuccess(reply, {
        items: items.map(serializeCommunityThread),
        page,
        limit,
        hasNext,
      });
    });

    protectedRoutes.get('/community/threads/:threadId', async (request, reply) => {
      const threadId = parsePositiveInt(request.params, 'threadId');
      if (!threadId) {
        return sendError(
          reply,
          400,
          'Invalid community thread id.',
          undefined,
          API_ERROR_CODES.INVALID_COMMUNITY_THREAD_ID
        );
      }

      const parsed = parseSchema(
        CommunityPostListQuerySchema,
        toObject(request.query)
      );
      if (!parsed.isValid) {
        return sendError(
          reply,
          400,
          'Invalid request.',
          parsed.errors,
          API_ERROR_CODES.INVALID_REQUEST
        );
      }

      const limit = parsed.data.limit ?? 50;
      const page = parsed.data.page ?? 1;
      const detail = await getCommunityThreadDetail({ threadId, limit, page });
      if (!detail) {
        return sendError(
          reply,
          404,
          'Community thread not found.',
          undefined,
          API_ERROR_CODES.COMMUNITY_THREAD_NOT_FOUND
        );
      }

      const hasNext = detail.posts.length > limit;
      const posts = hasNext ? detail.posts.slice(0, limit) : detail.posts;

      return sendSuccess(reply, {
        thread: serializeCommunityThread(detail.thread),
        posts: {
          items: posts.map(serializeCommunityPost),
          page,
          limit,
          hasNext,
        },
      });
    });

    protectedRoutes.post(
      '/community/threads',
      { preHandler: [requireCommunityWriter] },
      async (request, reply) => {
        const parsed = parseSchema(
          CreateCommunityThreadRequestSchema,
          toObject(request.body)
        );
        if (!parsed.isValid) {
          return sendError(
            reply,
            400,
            'Invalid request.',
            parsed.errors,
            API_ERROR_CODES.INVALID_REQUEST
          );
        }

        try {
          const result = await createCommunityThread({
            userId: request.user!.userId,
            title: parsed.data.title,
            body: parsed.data.body,
          });

          return sendSuccess(
            reply,
            {
              thread: serializeCommunityThread(result.thread),
              post: serializeCommunityPost(result.post),
            },
            201
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            'Community thread creation failed.'
          );
        }
      }
    );

    protectedRoutes.post(
      '/community/threads/:threadId/posts',
      { preHandler: [requireCommunityWriter] },
      async (request, reply) => {
        const threadId = parsePositiveInt(request.params, 'threadId');
        if (!threadId) {
          return sendError(
            reply,
            400,
            'Invalid community thread id.',
            undefined,
            API_ERROR_CODES.INVALID_COMMUNITY_THREAD_ID
          );
        }

        const parsed = parseSchema(
          CreateCommunityPostRequestSchema,
          toObject(request.body)
        );
        if (!parsed.isValid) {
          return sendError(
            reply,
            400,
            'Invalid request.',
            parsed.errors,
            API_ERROR_CODES.INVALID_REQUEST
          );
        }

        try {
          const result = await createCommunityPost({
            userId: request.user!.userId,
            threadId,
            body: parsed.data.body,
          });

          return sendSuccess(
            reply,
            {
              thread: serializeCommunityThread(result.thread),
              post: serializeCommunityPost(result.post),
            },
            201
          );
        } catch (error) {
          return sendErrorForException(
            reply,
            error,
            'Community post creation failed.'
          );
        }
      }
    );
  });
}
