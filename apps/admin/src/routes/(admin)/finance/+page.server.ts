import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { apiRequest } from '$lib/server/api';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  try {
    const [depositsRes, withdrawalsRes] = await Promise.all([
      apiRequest(fetch, cookies, '/admin/deposits'),
      apiRequest(fetch, cookies, '/admin/withdrawals'),
    ]);

    if (!depositsRes.ok || !withdrawalsRes.ok) {
      return {
        deposits: [],
        withdrawals: [],
        error: 'Failed to load finance data.',
      };
    }

    return {
      deposits: depositsRes.data ?? [],
      withdrawals: withdrawalsRes.data ?? [],
      error: null,
    };
  } catch (error) {
    return {
      deposits: [],
      withdrawals: [],
      error:
        error instanceof Error ? error.message : 'Failed to load finance data.',
    };
  }
};

const parseId = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const parseTotpCode = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export const actions: Actions = {
  approveDeposit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = parseId(formData.get('id'));
    const totpCode = parseTotpCode(formData.get('totpCode'));

    if (!id) {
      return fail(400, { error: 'Missing deposit id.' });
    }
    if (!totpCode) {
      return fail(400, { error: 'Admin TOTP code is required.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/approve`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode }),
      }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to approve deposit.',
      });
    }

    return { success: true };
  },
  failDeposit: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = parseId(formData.get('id'));
    const totpCode = parseTotpCode(formData.get('totpCode'));

    if (!id) {
      return fail(400, { error: 'Missing deposit id.' });
    }
    if (!totpCode) {
      return fail(400, { error: 'Admin TOTP code is required.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/deposits/${id}/fail`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode }),
      }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to fail deposit.',
      });
    }

    return { success: true };
  },
  approveWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = parseId(formData.get('id'));
    const totpCode = parseTotpCode(formData.get('totpCode'));

    if (!id) {
      return fail(400, { error: 'Missing withdrawal id.' });
    }
    if (!totpCode) {
      return fail(400, { error: 'Admin TOTP code is required.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/approve`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode }),
      }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to approve withdrawal.',
      });
    }

    return { success: true };
  },
  rejectWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = parseId(formData.get('id'));
    const totpCode = parseTotpCode(formData.get('totpCode'));

    if (!id) {
      return fail(400, { error: 'Missing withdrawal id.' });
    }
    if (!totpCode) {
      return fail(400, { error: 'Admin TOTP code is required.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/reject`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode }),
      }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to reject withdrawal.',
      });
    }

    return { success: true };
  },
  payWithdrawal: async ({ request, fetch, cookies }) => {
    const formData = await request.formData();
    const id = parseId(formData.get('id'));
    const totpCode = parseTotpCode(formData.get('totpCode'));

    if (!id) {
      return fail(400, { error: 'Missing withdrawal id.' });
    }
    if (!totpCode) {
      return fail(400, { error: 'Admin TOTP code is required.' });
    }

    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/withdrawals/${id}/pay`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode }),
      }
    );

    if (!response.ok) {
      return fail(response.status, {
        error: response.error?.message ?? 'Failed to pay withdrawal.',
      });
    }

    return { success: true };
  },
};
