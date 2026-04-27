import { z } from 'zod';

import type { AppInstance } from '../types';
import { sendError, sendErrorForException, sendSuccess } from '../../respond';
import { parseSchema } from '../../../shared/validation';
import {
  escapeTelegramMarkdown,
  sendTelegramMessage,
} from '../../../shared/notify-telegram';

const StringOrNumberSchema = z.union([z.string(), z.number()]);

const BillingAnomalyObjectSchema = z
  .object({
    title: z.string().trim().optional(),
    name: z.string().trim().optional(),
    summary: z.string().trim().optional(),
    message: z.string().trim().optional(),
    description: z.string().trim().optional(),
    details: z.string().trim().optional(),
    severity: z.string().trim().optional(),
    provider: z.string().trim().optional(),
    cloud: z.string().trim().optional(),
    accountName: z.string().trim().optional(),
    accountId: z.string().trim().optional(),
    projectName: z.string().trim().optional(),
    projectId: z.string().trim().optional(),
    service: z.string().trim().optional(),
    currency: z.string().trim().optional(),
    cost: StringOrNumberSchema.optional(),
    amount: StringOrNumberSchema.optional(),
    currentSpend: StringOrNumberSchema.optional(),
    expectedSpend: StringOrNumberSchema.optional(),
    threshold: StringOrNumberSchema.optional(),
    delta: StringOrNumberSchema.optional(),
    periodStart: z.string().trim().optional(),
    periodEnd: z.string().trim().optional(),
    detectedAt: z.string().trim().optional(),
    dashboardUrl: z.string().trim().optional(),
    consoleUrl: z.string().trim().optional(),
    url: z.string().trim().optional(),
  })
  .passthrough();

const BillingAnomalySchema = z.union([z.string().trim().min(1), BillingAnomalyObjectSchema]);

type BillingAnomalyPayload = z.infer<typeof BillingAnomalySchema>;

const compactText = (value: string, maxLength = 320) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const escapeValue = (value: string) => escapeTelegramMarkdown(compactText(value));

const formatLine = (label: string, value: string | null) =>
  value ? `${label}: ${escapeValue(value)}` : null;

const pickFirst = (...values: Array<string | null | undefined>) =>
  values.find((value): value is string => Boolean(value && value.trim())) ?? null;

const formatMoneyish = (value: string | number | undefined, currency?: string) => {
  if (value === undefined) {
    return null;
  }

  const amount = typeof value === 'number' ? String(value) : value.trim();
  if (!amount) {
    return null;
  }

  const unit = currency?.trim();
  return unit ? `${amount} ${unit}` : amount;
};

const buildBillingAnomalyMessage = (payload: BillingAnomalyPayload) => {
  if (typeof payload === 'string') {
    return ['*Cloud billing anomaly*', '', escapeValue(payload)].join('\n');
  }

  const title = pickFirst(payload.title, payload.name, payload.summary) ?? 'Cloud billing anomaly';
  const summary = pickFirst(
    payload.message,
    payload.description,
    payload.details,
    payload.summary
  );
  const provider = pickFirst(payload.provider, payload.cloud);
  const scope = pickFirst(
    payload.projectName,
    payload.projectId,
    payload.accountName,
    payload.accountId
  );
  const spendNow = formatMoneyish(
    payload.currentSpend ?? payload.cost ?? payload.amount,
    payload.currency
  );
  const spendExpected = formatMoneyish(
    payload.expectedSpend ?? payload.threshold,
    payload.currency
  );
  const spendDelta = formatMoneyish(payload.delta, payload.currency);
  const window =
    payload.periodStart && payload.periodEnd
      ? `${payload.periodStart} to ${payload.periodEnd}`
      : pickFirst(payload.periodStart, payload.periodEnd, payload.detectedAt);
  const source = pickFirst(payload.dashboardUrl, payload.consoleUrl, payload.url);

  const lines = [
    '*Cloud billing anomaly*',
    `Title: ${escapeValue(title)}`,
    formatLine('Severity', payload.severity ?? null),
    formatLine('Provider', provider),
    formatLine('Scope', scope),
    formatLine('Service', payload.service ?? null),
    formatLine('Current spend', spendNow),
    formatLine('Expected spend', spendExpected),
    formatLine('Delta', spendDelta),
    formatLine('Window', window),
    formatLine('Summary', summary),
    formatLine('Source', source),
  ].filter((line): line is string => Boolean(line));

  if (lines.length === 2) {
    lines.push(
      formatLine('Payload', JSON.stringify(payload)) ?? 'Payload: unavailable'
    );
  }

  return lines.join('\n');
};

export async function registerBillingAnomalyRoutes(app: AppInstance) {
  app.post(
    '/internal/billing-anomaly',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const parsed = parseSchema(BillingAnomalySchema, request.body);
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      try {
        const delivered = await sendTelegramMessage({
          chat: 'page',
          text: buildBillingAnomalyMessage(parsed.data),
          markdown: true,
        });

        return sendSuccess(
          reply,
          {
            accepted: true,
            chat: 'page',
            messageId: delivered.messageId,
          },
          202
        );
      } catch (error) {
        return sendErrorForException(
          reply,
          error,
          'Failed to relay billing anomaly.'
        );
      }
    }
  );
}
