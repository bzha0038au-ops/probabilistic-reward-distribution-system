import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { apiRequest } from '$lib/server/api';

const toNumberString = (value: FormDataEntryValue | null, fallback = '0') => {
  if (typeof value !== 'string') return fallback;
  return value.trim() === '' ? fallback : value;
};

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  try {
    const [prizeRes, analyticsRes, configRes] = await Promise.all([
      apiRequest(fetch, cookies, '/admin/prizes'),
      apiRequest(fetch, cookies, '/admin/analytics/summary'),
      apiRequest(fetch, cookies, '/admin/config'),
    ]);

    if (!prizeRes.ok || !analyticsRes.ok || !configRes.ok) {
      return {
        prizes: [],
        analytics: null,
        config: null,
        error: 'Failed to load admin data.',
      };
    }

    return {
      prizes: prizeRes.data ?? [],
      analytics: analyticsRes.data ?? null,
      config: configRes.data ?? null,
      error: null,
    };
  } catch (error) {
    return {
      prizes: [],
      analytics: null,
      config: null,
      error: error instanceof Error ? error.message : 'Failed to load admin data.',
    };
  }
};

export const actions: Actions = {
  create: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();

    const payload = {
      name: formData.get('name')?.toString().trim() ?? '',
      stock: toNumberString(formData.get('stock')),
      weight: toNumberString(formData.get('weight'), '1'),
      poolThreshold: toNumberString(formData.get('poolThreshold')),
      userPoolThreshold: toNumberString(formData.get('userPoolThreshold')),
      rewardAmount: toNumberString(formData.get('rewardAmount')),
      payoutBudget: toNumberString(formData.get('payoutBudget')),
      payoutPeriodDays: toNumberString(formData.get('payoutPeriodDays'), '1'),
      isActive: formData.get('isActive') === 'on',
    };

    if (!payload.name) {
      return fail(400, { error: 'Prize name is required.' });
    }

    const response = await apiRequest(fetch, cookies, '/admin/prizes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to create prize.',
      });
    }

    return { success: true };
  },
  update: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = formData.get('id')?.toString();

    if (!id) {
      return fail(400, { error: 'Missing prize id.' });
    }

    const payload = {
      name: formData.get('name')?.toString().trim() ?? '',
      stock: toNumberString(formData.get('stock')),
      weight: toNumberString(formData.get('weight')),
      poolThreshold: toNumberString(formData.get('poolThreshold')),
      userPoolThreshold: toNumberString(formData.get('userPoolThreshold')),
      rewardAmount: toNumberString(formData.get('rewardAmount')),
      payoutBudget: toNumberString(formData.get('payoutBudget')),
      payoutPeriodDays: toNumberString(formData.get('payoutPeriodDays'), '1'),
    };

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/prizes/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to update prize.',
      });
    }

    return { success: true };
  },
  toggle: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = formData.get('id')?.toString();

    if (!id) {
      return fail(400, { error: 'Missing prize id.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/prizes/${id}/toggle`,
      { method: 'PATCH' }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to toggle prize.',
      });
    }

    return { success: true };
  },
  delete: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = formData.get('id')?.toString();

    if (!id) {
      return fail(400, { error: 'Missing prize id.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/prizes/${id}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to delete prize.',
      });
    }

    return { success: true };
  },
  config: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();

    const payload = {
      poolBalance: toNumberString(formData.get('poolBalance')),
      drawCost: toNumberString(formData.get('drawCost')),
      weightJitterEnabled: formData.get('weightJitterEnabled') === 'on',
      weightJitterPct: toNumberString(formData.get('weightJitterPct')),
      bonusAutoReleaseEnabled: formData.get('bonusAutoReleaseEnabled') === 'on',
      bonusUnlockWagerRatio: toNumberString(formData.get('bonusUnlockWagerRatio')),
      authFailureWindowMinutes: toNumberString(formData.get('authFailureWindowMinutes')),
      authFailureFreezeThreshold: toNumberString(formData.get('authFailureFreezeThreshold')),
      adminFailureFreezeThreshold: toNumberString(formData.get('adminFailureFreezeThreshold')),
    };

    const response = await apiRequest(fetch, cookies, '/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to update config.',
      });
    }

    return { success: true };
  },
  bonusRelease: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const userId = formData.get('userId')?.toString().trim();
    const amount = formData.get('amount')?.toString().trim();

    if (!userId) {
      return fail(400, { error: 'User id is required.' });
    }

    const payload = {
      userId: Number(userId),
      amount: amount ? amount : undefined,
    };

    const response = await apiRequest(fetch, cookies, '/admin/bonus-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to release bonus.',
      });
    }

    return { success: true };
  },
};
