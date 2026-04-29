import {
  buildAdminCookieHeaders,
  buildUserAuthHeaders,
  describeIntegrationSuite,
  enrollAdminMfa,
  expect,
  getApp,
  getCreateUserSessionToken,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  SECURITY_ADMIN_PERMISSION_KEYS,
  seedAdminAccount,
  seedUserWithWallet,
  verifyUserContacts,
} from './integration-test-support';
import {
  adminActions,
  communityModerationActions,
  communityPosts,
  communityReports,
  communityThreads,
  freezeRecords,
} from '@reward/database';
import { eq } from '@reward/database/orm';

describeIntegrationSuite('backend community integration', () => {
  it(
    'allows unverified users to read but not create community content',
    { timeout: 15_000 },
    async () => {
      const author = await seedUserWithWallet({
        email: 'community-author@example.com',
      });
      await verifyUserContacts(author.id, { email: true });

      const { token: authorToken } = await getCreateUserSessionToken()({
        userId: author.id,
        email: author.email,
        role: 'user',
      });

      const createThreadResponse = await getApp().inject({
        method: 'POST',
        url: '/community/threads',
        headers: {
          authorization: `Bearer ${authorToken}`,
          'content-type': 'application/json',
        },
        payload: {
          title: 'First community thread',
          body: 'Opening post body',
        },
      });

      expect(createThreadResponse.statusCode).toBe(201);

      const reader = await seedUserWithWallet({
        email: 'community-reader@example.com',
      });
      const { token: readerToken } = await getCreateUserSessionToken()({
        userId: reader.id,
        email: reader.email,
        role: 'user',
      });

      const listResponse = await getApp().inject({
        method: 'GET',
        url: '/community/threads',
        headers: {
          authorization: `Bearer ${readerToken}`,
        },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data.items).toMatchObject([
        {
          title: 'First community thread',
          postCount: 1,
          status: 'visible',
          isLocked: false,
        },
      ]);

      const createForbiddenResponse = await getApp().inject({
        method: 'POST',
        url: '/community/threads',
        headers: {
          authorization: `Bearer ${readerToken}`,
          'content-type': 'application/json',
        },
        payload: {
          title: 'Blocked thread',
          body: 'Should not be created',
        },
      });

      expect(createForbiddenResponse.statusCode).toBe(403);
      expect(createForbiddenResponse.json().error.code).toBe(
        'KYC_TIER_REQUIRED'
      );
    }
  );

  it(
    'records admin audit entries for community moderation',
    { timeout: 15_000 },
    async () => {
      const author = await seedUserWithWallet({
        email: 'community-moderation-author@example.com',
      });
      await verifyUserContacts(author.id, { email: true });

      const { token: authorToken } = await getCreateUserSessionToken()({
        userId: author.id,
        email: author.email,
        role: 'user',
      });

      const createThreadResponse = await getApp().inject({
        method: 'POST',
        url: '/community/threads',
        headers: {
          authorization: `Bearer ${authorToken}`,
          'content-type': 'application/json',
        },
        payload: {
          title: 'Thread for moderation',
          body: 'Moderate this opening post',
        },
      });

      expect(createThreadResponse.statusCode).toBe(201);
      const createdPostId = createThreadResponse.json().data.post.id as number;

      const seededAdmin = await seedAdminAccount({
        email: 'community-admin@example.com',
      });
      await grantAdminPermissions(seededAdmin.admin.id);
      const adminSession = await loginAdmin(
        seededAdmin.user.email,
        seededAdmin.password
      );

      const moderationResponse = await getApp().inject({
        method: 'POST',
        url: `/admin/community/posts/${createdPostId}/moderate`,
        headers: buildAdminCookieHeaders(adminSession.token),
        payload: {
          action: 'hide',
          reason: 'spam',
        },
      });

      expect(moderationResponse.statusCode).toBe(200);
      expect(moderationResponse.json().data).toMatchObject({
        post: {
          id: createdPostId,
          status: 'hidden',
        },
        moderation: {
          action: 'hide_post',
          reason: 'spam',
        },
      });

      const [post] = await getDb()
        .select({
          status: communityPosts.status,
        })
        .from(communityPosts)
        .where(eq(communityPosts.id, createdPostId))
        .limit(1);

      expect(post?.status).toBe('hidden');

      const [moderation] = await getDb()
        .select()
        .from(communityModerationActions)
        .where(eq(communityModerationActions.postId, createdPostId))
        .limit(1);

      expect(moderation).toMatchObject({
        adminId: seededAdmin.admin.id,
        action: 'hide_post',
        reason: 'spam',
        targetType: 'post',
        targetId: createdPostId,
      });

      const [audit] = await getDb()
        .select()
        .from(adminActions)
        .where(eq(adminActions.action, 'community_post_moderated'))
        .limit(1);

      expect(audit).toMatchObject({
        adminId: seededAdmin.admin.id,
        action: 'community_post_moderated',
        targetType: 'community_post',
        targetId: createdPostId,
      });
    }
  );

  it(
    'auto-hides spammy thread submissions and pushes them into the forum moderation queue',
    { timeout: 15_000 },
    async () => {
      const author = await seedUserWithWallet({
        email: 'community-spam-author@example.com',
      });
      await verifyUserContacts(author.id, { email: true });

      const { token: authorToken } = await getCreateUserSessionToken()({
        userId: author.id,
        email: author.email,
        role: 'user',
      });

      const createThreadResponse = await getApp().inject({
        method: 'POST',
        url: '/community/threads',
        headers: buildUserAuthHeaders(authorToken),
        payload: {
          title: 'Telegram reward drop',
          body: 'Guaranteed bonus at https://t.me/reward-drop right now.',
        },
      });

      expect(createThreadResponse.statusCode).toBe(202);
      expect(createThreadResponse.json().data).toMatchObject({
        reviewRequired: true,
        autoHidden: true,
        moderationSource: 'automated_signal',
        thread: {
          status: 'hidden',
        },
        post: {
          status: 'hidden',
        },
      });

      const createdThreadId = createThreadResponse.json().data.thread.id as number;
      const createdPostId = createThreadResponse.json().data.post.id as number;

      const [thread] = await getDb()
        .select({
          status: communityThreads.status,
        })
        .from(communityThreads)
        .where(eq(communityThreads.id, createdThreadId))
        .limit(1);

      const [report] = await getDb()
        .select({
          source: communityReports.source,
          metadata: communityReports.metadata,
        })
        .from(communityReports)
        .where(eq(communityReports.postId, createdPostId))
        .limit(1);

      expect(thread?.status).toBe('hidden');
      expect(report).toMatchObject({
        source: 'automated_signal',
        metadata: expect.objectContaining({
          autoHidden: true,
          signalProviders: expect.arrayContaining(['link', 'contact']),
        }),
      });

      const listResponse = await getApp().inject({
        method: 'GET',
        url: '/community/threads',
        headers: buildUserAuthHeaders(authorToken),
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data.items).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: createdThreadId,
          }),
        ]),
      );

      const seededAdmin = await seedAdminAccount({
        email: 'community-spam-admin@example.com',
      });
      await grantAdminPermissions(
        seededAdmin.admin.id,
        SECURITY_ADMIN_PERMISSION_KEYS,
      );
      const adminSession = await enrollAdminMfa({
        email: seededAdmin.user.email,
        password: seededAdmin.password,
      });

      const overviewResponse = await getApp().inject({
        method: 'GET',
        url: '/admin/forum/moderation/overview',
        headers: buildAdminCookieHeaders(adminSession.token),
      });

      expect(overviewResponse.statusCode).toBe(200);
      expect(overviewResponse.json().data.queue).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            postId: createdPostId,
            source: 'automated_signal',
            autoHidden: true,
            signalProviders: expect.arrayContaining(['link', 'contact']),
          }),
        ]),
      );
    },
  );

  it(
    'enforces tighter community thread rate limits for tier_1 writers',
    { timeout: 15_000 },
    async () => {
      const author = await seedUserWithWallet({
        email: 'community-tier1-rate-limit@example.com',
      });
      await verifyUserContacts(author.id, { email: true });

      const { token: authorToken } = await getCreateUserSessionToken()({
        userId: author.id,
        email: author.email,
        role: 'user',
      });

      for (const title of ['Thread 1', 'Thread 2']) {
        const response = await getApp().inject({
          method: 'POST',
          url: '/community/threads',
          headers: buildUserAuthHeaders(authorToken),
          payload: {
            title,
            body: `${title} body`,
          },
        });

        expect(response.statusCode).toBe(201);
      }

      const limitedResponse = await getApp().inject({
        method: 'POST',
        url: '/community/threads',
        headers: buildUserAuthHeaders(authorToken),
        payload: {
          title: 'Thread 3',
          body: 'Thread 3 body',
        },
      });

      expect(limitedResponse.statusCode).toBe(429);
      expect(limitedResponse.json().error.code).toBe('TOO_MANY_REQUESTS');
    },
  );

  it(
    'supports forum moderation queue actions and gameplay-only forum mutes',
    { timeout: 15_000 },
    async () => {
      const author = await seedUserWithWallet({
        email: 'forum-moderation-author@example.com',
        withdrawableBalance: '25.00',
      });
      await verifyUserContacts(author.id, { email: true });

      const reporter = await seedUserWithWallet({
        email: 'forum-reporting-user@example.com',
      });

      const { token: authorToken } = await getCreateUserSessionToken()({
        userId: author.id,
        email: author.email,
        role: 'user',
      });

      const createThreadResponse = await getApp().inject({
        method: 'POST',
        url: '/community/threads',
        headers: buildUserAuthHeaders(authorToken),
        payload: {
          title: 'Thread for forum queue',
          body: 'This post should be reported and removed.',
        },
      });

      expect(createThreadResponse.statusCode).toBe(201);
      const createdPostId = createThreadResponse.json().data.post.id as number;

      await getDb().insert(communityReports).values([
        {
          postId: createdPostId,
          reporterUserId: reporter.id,
          reason: 'spam',
          detail: 'Repeated scam promotion.',
        },
        {
          postId: createdPostId,
          reporterUserId: reporter.id,
          reason: 'harassment',
          detail: 'Abusive language in the post body.',
        },
      ]);

      const seededAdmin = await seedAdminAccount({
        email: 'forum-moderation-admin@example.com',
      });
      await grantAdminPermissions(
        seededAdmin.admin.id,
        SECURITY_ADMIN_PERMISSION_KEYS
      );
      const adminSession = await enrollAdminMfa({
        email: seededAdmin.user.email,
        password: seededAdmin.password,
      });

      const overviewResponse = await getApp().inject({
        method: 'GET',
        url: '/admin/forum/moderation/overview',
        headers: buildAdminCookieHeaders(adminSession.token),
      });

      expect(overviewResponse.statusCode).toBe(200);
      expect(overviewResponse.json().data.queue).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            postId: createdPostId,
            authorUserId: author.id,
            reportCount: 2,
            threadTitle: 'Thread for forum queue',
          }),
        ])
      );

      const bulkDeleteResponse = await getApp().inject({
        method: 'POST',
        url: '/admin/forum/moderation/posts/bulk-delete',
        headers: buildAdminCookieHeaders(adminSession.token),
        payload: {
          postIds: [createdPostId],
          reason: 'confirmed policy violation',
        },
      });

      expect(bulkDeleteResponse.statusCode).toBe(200);
      expect(bulkDeleteResponse.json().data).toMatchObject({
        deletedPostIds: [createdPostId],
        resolvedReportCount: 2,
      });

      const [deletedPost] = await getDb()
        .select({
          status: communityPosts.status,
        })
        .from(communityPosts)
        .where(eq(communityPosts.id, createdPostId))
        .limit(1);

      expect(deletedPost?.status).toBe('deleted');

      const resolvedReports = await getDb()
        .select({
          status: communityReports.status,
          resolvedByAdminId: communityReports.resolvedByAdminId,
        })
        .from(communityReports)
        .where(eq(communityReports.postId, createdPostId));

      expect(resolvedReports).toEqual([
        { status: 'resolved', resolvedByAdminId: seededAdmin.admin.id },
        { status: 'resolved', resolvedByAdminId: seededAdmin.admin.id },
      ]);

      const muteResponse = await getApp().inject({
        method: 'POST',
        url: '/admin/forum/moderation/mutes',
        headers: buildAdminCookieHeaders(adminSession.token),
        payload: {
          userId: author.id,
          reason: 'forum_moderation',
          totpCode: adminSession.totpCode,
        },
      });

      expect(muteResponse.statusCode).toBe(201);
      expect(muteResponse.json().data).toMatchObject({
        userId: author.id,
        category: 'community',
        scope: 'gameplay_lock',
        status: 'active',
        reason: 'forum_moderation',
      });

      const freezeRecordId = muteResponse.json().data.id as number;

      const walletResponse = await getApp().inject({
        method: 'GET',
        url: '/wallet',
        headers: buildUserAuthHeaders(authorToken),
      });

      expect(walletResponse.statusCode).toBe(200);

      const drawResponse = await getApp().inject({
        method: 'POST',
        url: '/draw',
        headers: buildUserAuthHeaders(authorToken),
        payload: {},
      });

      expect(drawResponse.statusCode).toBe(423);
      expect(drawResponse.json().error.message).toBe('Gameplay locked.');

      const releaseResponse = await getApp().inject({
        method: 'POST',
        url: '/admin/forum/moderation/mutes/release',
        headers: buildAdminCookieHeaders(adminSession.token),
        payload: {
          freezeRecordId,
          reason: 'appeal accepted',
          totpCode: adminSession.totpCode,
        },
      });

      expect(releaseResponse.statusCode).toBe(200);
      expect(releaseResponse.json().data).toMatchObject({
        id: freezeRecordId,
        userId: author.id,
        status: 'released',
      });

      const [releasedFreeze] = await getDb()
        .select({
          status: freezeRecords.status,
        })
        .from(freezeRecords)
        .where(eq(freezeRecords.id, freezeRecordId))
        .limit(1);

      expect(releasedFreeze?.status).toBe('released');

      const [muteAudit] = await getDb()
        .select()
        .from(adminActions)
        .where(eq(adminActions.action, 'forum_user_muted'))
        .limit(1);

      expect(muteAudit).toMatchObject({
        adminId: seededAdmin.admin.id,
        action: 'forum_user_muted',
        targetType: 'user',
        targetId: author.id,
      });
    }
  );
});
