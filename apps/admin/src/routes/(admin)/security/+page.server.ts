import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  CursorAdminActionPageSchema,
  CursorAuthEventPageSchema,
  FreezeRecordPageSchema,
} from '@reward/shared-types';

import { apiRequest } from '$lib/server/api';

const fallbackAuthEvents = {
  items: [],
  limit: 50,
  hasNext: false,
  hasPrevious: false,
  nextCursor: null,
  prevCursor: null,
  direction: 'next' as const,
  sort: 'desc' as const,
};

const fallbackAdminActions = {
  items: [],
  limit: 50,
  hasNext: false,
  hasPrevious: false,
  nextCursor: null,
  prevCursor: null,
  direction: 'next' as const,
  sort: 'desc' as const,
};

const fallbackFreezeRecords = {
  items: [],
  page: 1,
  limit: 50,
  hasNext: false,
};

const parseTotpCode = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
  const params = new URLSearchParams();
  const email = url.searchParams.get('email');
  const eventType = url.searchParams.get('eventType');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = url.searchParams.get('authLimit');
  const cursor = url.searchParams.get('authCursor');
  const direction = url.searchParams.get('authDirection');
  const sort = url.searchParams.get('authSort');

  if (email) params.set('email', email);
  if (eventType) params.set('eventType', eventType);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (limit) params.set('limit', limit);
  if (cursor) params.set('cursor', cursor);
  if (direction === 'next' || direction === 'prev') params.set('direction', direction);
  if (sort === 'asc' || sort === 'desc') params.set('sort', sort);

  try {
    const adminParams = new URLSearchParams();
    const adminId = url.searchParams.get('adminId');
    const adminAction = url.searchParams.get('adminAction');
    const adminFrom = url.searchParams.get('adminFrom');
    const adminTo = url.searchParams.get('adminTo');
    const adminLimit = url.searchParams.get('adminLimit');
    const adminCursor = url.searchParams.get('adminCursor');
    const adminDirection = url.searchParams.get('adminDirection');
    const adminSort = url.searchParams.get('adminSort');

    if (adminId) adminParams.set('adminId', adminId);
    if (adminAction) adminParams.set('action', adminAction);
    if (adminFrom) adminParams.set('from', adminFrom);
    if (adminTo) adminParams.set('to', adminTo);
    if (adminLimit) adminParams.set('limit', adminLimit);
    if (adminCursor) adminParams.set('cursor', adminCursor);
    if (adminDirection === 'next' || adminDirection === 'prev') {
      adminParams.set('direction', adminDirection);
    }
    if (adminSort === 'asc' || adminSort === 'desc') {
      adminParams.set('sort', adminSort);
    }

    const freezeParams = new URLSearchParams();
    const freezeLimit = url.searchParams.get('freezeLimit');
    const freezePage = url.searchParams.get('freezePage');
    const freezeSort = url.searchParams.get('freezeSort');
    if (freezeLimit) freezeParams.set('limit', freezeLimit);
    if (freezePage) freezeParams.set('page', freezePage);
    if (freezeSort === 'asc' || freezeSort === 'desc') {
      freezeParams.set('sort', freezeSort);
    }

    const [eventsRes, freezeRes, actionsRes] = await Promise.all([
      apiRequest(fetch, cookies, `/admin/auth-events?${params.toString()}`),
      apiRequest(fetch, cookies, `/admin/freeze-records?${freezeParams.toString()}`),
      apiRequest(fetch, cookies, `/admin/admin-actions?${adminParams.toString()}`),
    ]);

    if (!eventsRes.ok || !freezeRes.ok || !actionsRes.ok) {
      const errorMessage = !eventsRes.ok
        ? eventsRes.error?.message
        : !freezeRes.ok
          ? freezeRes.error?.message
          : !actionsRes.ok
            ? actionsRes.error?.message
            : 'Failed to load security data.';

      return {
        authEvents: fallbackAuthEvents,
        freezeRecords: fallbackFreezeRecords,
        adminActions: fallbackAdminActions,
        error: errorMessage ?? 'Failed to load security data.',
      };
    }

    const authEvents = CursorAuthEventPageSchema.safeParse(eventsRes.data);
    const freezeRecords = FreezeRecordPageSchema.safeParse(freezeRes.data);
    const adminActions = CursorAdminActionPageSchema.safeParse(actionsRes.data);

    return {
      authEvents: authEvents.success ? authEvents.data : fallbackAuthEvents,
      freezeRecords: freezeRecords.success ? freezeRecords.data : fallbackFreezeRecords,
      adminActions: adminActions.success ? adminActions.data : fallbackAdminActions,
      error:
        authEvents.success && freezeRecords.success && adminActions.success
          ? null
          : 'Security API returned an unexpected response.',
    };
  } catch (error) {
    return {
      authEvents: fallbackAuthEvents,
      freezeRecords: fallbackFreezeRecords,
      adminActions: fallbackAdminActions,
      error:
        error instanceof Error ? error.message : 'Failed to load auth events.',
    };
  }
};

export const actions: Actions = {
  releaseFreeze: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const userId = formData.get('userId')?.toString().trim();
    const totpCode = parseTotpCode(formData.get('totpCode'));

    if (!userId) {
      return fail(400, { error: 'Missing user id.' });
    }
    if (!totpCode) {
      return fail(400, { error: 'Admin TOTP code is required.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/freeze-records/${userId}/release`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode }),
      }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to release freeze.',
      });
    }

    return { success: true };
  },
  createFreeze: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const userId = formData.get('userId')?.toString().trim();
    const reason = formData.get('reason')?.toString().trim();
    const totpCode = parseTotpCode(formData.get('totpCode'));

    if (!userId) {
      return fail(400, { error: 'Missing user id.' });
    }
    if (!totpCode) {
      return fail(400, { error: 'Admin TOTP code is required.' });
    }

    const response = await apiRequest(fetch, cookies, '/admin/freeze-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: Number(userId),
        reason: reason || undefined,
        totpCode,
      }),
    });

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to freeze account.',
      });
    }

    return { success: true };
  },
};
