import type { FastifyInstance } from 'fastify';

import { getTransactionHistory, getWalletBalance } from '../../modules/wallet/service';
import { executeDraw } from '../../modules/draw/service';
import { listBankCards, createBankCard, setDefaultBankCard } from '../../modules/bank-card/service';
import { listTopUps, createTopUp } from '../../modules/top-up/service';
import { listWithdrawals, createWithdrawal } from '../../modules/withdraw/service';
import { requireUser } from '../guards';
import { sendError, sendSuccess } from '../respond';
import { parseLimit, toAmountString } from '../utils';
import {
  validateBankCardCreate,
  validateTopUpCreate,
  validateWithdrawalCreate,
} from '../validators';

export async function registerUserRoutes(app: FastifyInstance) {
  app.get('/wallet', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const balance = await getWalletBalance(user.userId);
    return sendSuccess(reply, { balance });
  });

  app.get('/transactions', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const query = request.query as { limit?: string } | undefined;
    const limit = parseLimit(query?.limit);
    const history = await getTransactionHistory(user.userId, limit);
    return sendSuccess(reply, history);
  });

  app.post('/draw', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    try {
      const record = await executeDraw(user.userId);
      return sendSuccess(reply, record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Draw failed';
      return sendError(reply, 422, message);
    }
  });

  app.get('/bank-cards', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const cards = await listBankCards(user.userId);
    return sendSuccess(reply, cards);
  });

  app.post('/bank-cards', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const payload = request.body as {
      cardholderName?: string;
      bankName?: string;
      brand?: string;
      last4?: string;
      isDefault?: boolean;
    };
    const validation = validateBankCardCreate(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const created = await createBankCard({
      userId: user.userId,
      cardholderName: String(payload.cardholderName ?? ''),
      bankName: payload.bankName ?? null,
      brand: payload.brand ?? null,
      last4: payload.last4 ?? null,
      isDefault: Boolean(payload.isDefault),
    });

    return sendSuccess(reply, created, 201);
  });

  app.patch('/bank-cards/:bankCardId/default', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const { bankCardId } = request.params as { bankCardId: string };
    const parsedId = Number(bankCardId);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      return sendError(reply, 400, 'Invalid bank card id.');
    }

    const updated = await setDefaultBankCard(user.userId, parsedId);
    if (!updated) {
      return sendError(reply, 404, 'Bank card not found.');
    }

    return sendSuccess(reply, updated);
  });

  app.get('/top-ups', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const query = request.query as { limit?: string } | undefined;
    const limit = parseLimit(query?.limit);
    const items = await listTopUps(user.userId, limit);
    return sendSuccess(reply, items);
  });

  app.post('/top-ups', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const payload = request.body as {
      amount?: number | string;
      referenceId?: string | null;
      metadata?: Record<string, unknown> | null;
    };
    const validation = validateTopUpCreate(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const amount = toAmountString(payload.amount);
    if (!amount) {
      return sendError(reply, 400, 'Amount must be greater than 0.');
    }

    const created = await createTopUp({
      userId: user.userId,
      amount,
      referenceId: payload.referenceId ?? null,
      metadata: payload.metadata ?? null,
    });

    return sendSuccess(reply, created, 201);
  });

  app.get('/withdrawals', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const query = request.query as { limit?: string } | undefined;
    const limit = parseLimit(query?.limit);
    const items = await listWithdrawals(user.userId, limit);
    return sendSuccess(reply, items);
  });

  app.post('/withdrawals', async (request, reply) => {
    const user = await requireUser(request);
    if (!user) {
      return sendError(reply, 401, 'Unauthorized');
    }

    const payload = request.body as {
      amount?: number | string;
      bankCardId?: number | string | null;
      metadata?: Record<string, unknown> | null;
    };
    const validation = validateWithdrawalCreate(payload);
    if (!validation.isValid) {
      return sendError(reply, 400, 'Invalid request.', validation.errors);
    }

    const amount = toAmountString(payload.amount);
    if (!amount) {
      return sendError(reply, 400, 'Amount must be greater than 0.');
    }

    const bankCardId =
      payload.bankCardId !== null && payload.bankCardId !== undefined
        ? Number(payload.bankCardId)
        : null;
    if (bankCardId !== null && (!Number.isFinite(bankCardId) || bankCardId <= 0)) {
      return sendError(reply, 400, 'Invalid bank card id.');
    }

    const created = await createWithdrawal({
      userId: user.userId,
      amount,
      bankCardId,
      metadata: payload.metadata ?? null,
    });

    return sendSuccess(reply, created, 201);
  });
}
