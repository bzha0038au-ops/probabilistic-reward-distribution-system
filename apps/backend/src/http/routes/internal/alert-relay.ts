import { z } from 'zod';

import type { AppInstance } from '../types';
import { sendError, sendErrorForException, sendSuccess } from '../../respond';
import { parseSchema } from '../../../shared/validation';
import { sendTelegramMessage, type TelegramChatTarget } from '../../../shared/notify-telegram';

const MAX_RENDERED_ALERTS = 5;

const AlertRecordSchema = z.record(z.unknown());

const AlertmanagerAlertSchema = z
  .object({
    status: z.string().trim().optional(),
    labels: AlertRecordSchema.optional(),
    annotations: AlertRecordSchema.optional(),
    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
    generatorURL: z.string().trim().optional(),
    fingerprint: z.string().trim().optional(),
  })
  .passthrough();

const AlertmanagerWebhookSchema = z
  .object({
    status: z.string().trim().optional(),
    receiver: z.string().trim().optional(),
    commonLabels: AlertRecordSchema.optional(),
    commonAnnotations: AlertRecordSchema.optional(),
    externalURL: z.string().trim().optional(),
    groupKey: z.string().trim().optional(),
    truncatedAlerts: z.number().int().nonnegative().optional(),
    alerts: z.array(AlertmanagerAlertSchema).min(1),
  })
  .passthrough();

const OpsNotifyPayloadSchema = z
  .object({
    severity: z.string().trim().optional(),
    title: z.string().trim().optional(),
    body: z.string().trim().optional(),
    text: z.string().trim().optional(),
    runbook_url: z.string().trim().optional(),
    source: z.string().trim().optional(),
  })
  .passthrough()
  .refine(
    (payload) =>
      Boolean(
        payload.text ||
          payload.title ||
          payload.body
      ),
    {
      message: 'Expected at least one of text, title, or body.',
    }
  );

const AlertRelayPayloadSchema = z.union([
  AlertmanagerWebhookSchema,
  OpsNotifyPayloadSchema,
]);

type AlertmanagerWebhook = z.infer<typeof AlertmanagerWebhookSchema>;
type AlertmanagerAlert = AlertmanagerWebhook['alerts'][number];
type OpsNotifyPayload = z.infer<typeof OpsNotifyPayloadSchema>;
type AlertRelayPayload = z.infer<typeof AlertRelayPayloadSchema>;

const CRITICAL_SEVERITIES = new Set(['critical', 'fatal', 'emergency', 'page']);
const TICKET_SEVERITIES = new Set(['warning', 'warn', 'error', 'ticket']);

const readText = (record: Record<string, unknown> | undefined, key: string) => {
  if (!record) {
    return null;
  }

  const value = record[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
};

const compactText = (value: string, maxLength = 280) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const compactValue = (value: string) => compactText(value);

const formatLine = (label: string, value: string | null) =>
  value ? `${label}: ${compactValue(value)}` : null;

const pickFirstNonEmpty = (...values: Array<string | null | undefined>) =>
  values.find((value): value is string => Boolean(value && value.trim())) ?? null;

const isAlertmanagerWebhook = (
  payload: AlertRelayPayload
): payload is AlertmanagerWebhook => 'alerts' in payload;

const extractSeverityFromRenderedText = (text: string | undefined) => {
  if (!text) {
    return null;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      continue;
    }

    const match = trimmed.match(/^\[([^\]]+)\]\s+/);
    if (!match?.[1]) {
      return null;
    }

    return match[1].trim().toLowerCase() || null;
  }

  return null;
};

const resolveSeverity = (payload: AlertmanagerWebhook) => {
  const severities = [
    readText(payload.commonLabels, 'severity'),
    ...payload.alerts.map((alert) => readText(alert.labels, 'severity')),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  if (severities.some((value) => CRITICAL_SEVERITIES.has(value))) {
    return 'critical';
  }
  if (severities.some((value) => TICKET_SEVERITIES.has(value))) {
    return 'warning';
  }

  return severities[0] ?? 'info';
};

const resolveOpsNotifySeverity = (payload: OpsNotifyPayload) =>
  payload.severity?.trim().toLowerCase() ||
  extractSeverityFromRenderedText(payload.text) ||
  extractSeverityFromRenderedText(payload.body) ||
  'info';

const routeSeverityToChat = (severity: string): TelegramChatTarget => {
  const normalized = severity.trim().toLowerCase();
  if (CRITICAL_SEVERITIES.has(normalized)) {
    return 'page';
  }
  if (TICKET_SEVERITIES.has(normalized)) {
    return 'ticket';
  }

  return 'digest';
};

const resolvePrimaryRunbookUrl = (payload: AlertmanagerWebhook) =>
  pickFirstNonEmpty(
    readText(payload.commonAnnotations, 'runbook_url'),
    ...payload.alerts.map((alert) => readText(alert.annotations, 'runbook_url'))
  );

const buildAlertSection = (
  alert: AlertmanagerAlert,
  index: number,
  commonAnnotations: Record<string, unknown> | undefined,
  primaryRunbookUrl: string | null
) => {
  const alertName =
    readText(alert.labels, 'alertname') ??
    readText(alert.labels, 'name') ??
    `alert ${index + 1}`;
  const summary =
    readText(alert.annotations, 'summary') ??
    readText(alert.annotations, 'message') ??
    readText(commonAnnotations, 'summary');
  const description =
    readText(alert.annotations, 'description') ??
    readText(alert.annotations, 'details') ??
    readText(commonAnnotations, 'description');
  const runbookUrl =
    readText(alert.annotations, 'runbook_url') ??
    readText(commonAnnotations, 'runbook_url');
  const source =
    alert.generatorURL ??
    readText(alert.annotations, 'dashboard_url') ??
    readText(alert.annotations, 'panel_url');

  return [
    `Alert ${index + 1}`,
    `Name: ${compactValue(alertName)}`,
    formatLine('Status', alert.status ?? null),
    formatLine('Summary', summary),
    formatLine('Description', description),
    formatLine('Starts at', alert.startsAt ?? null),
    formatLine('Ends at', alert.endsAt ?? null),
    formatLine('Fingerprint', alert.fingerprint ?? null),
    runbookUrl && runbookUrl !== primaryRunbookUrl
      ? formatLine('Runbook', runbookUrl)
      : null,
    formatLine('Source', source ?? null),
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
};

const buildAlertRelayMessage = (payload: AlertmanagerWebhook, severity: string) => {
  const primaryRunbookUrl = resolvePrimaryRunbookUrl(payload);
  const renderedAlerts = payload.alerts
    .slice(0, MAX_RENDERED_ALERTS)
    .map((alert, index) =>
      buildAlertSection(alert, index, payload.commonAnnotations, primaryRunbookUrl)
    );
  const remainingAlerts = Math.max(payload.alerts.length - MAX_RENDERED_ALERTS, 0);

  return [
    primaryRunbookUrl,
    'Prometheus alert relay',
    `Status: ${compactValue(payload.status ?? 'unknown')}`,
    `Severity: ${compactValue(severity)}`,
    formatLine('Receiver', payload.receiver ?? null),
    `Alert count: ${String(payload.alerts.length)}`,
    formatLine('Group key', payload.groupKey ?? null),
    formatLine('Alertmanager', payload.externalURL ?? null),
    ...renderedAlerts.flatMap((section) => ['', section]),
    remainingAlerts > 0
      ? `Additional alerts: ${String(remainingAlerts)}`
      : null,
    payload.truncatedAlerts && payload.truncatedAlerts > 0
      ? `Truncated upstream alerts: ${String(payload.truncatedAlerts)}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
};

const stripDuplicateOpsNotifyLines = (
  body: string | undefined,
  runbookUrl: string | undefined,
  titleLine: string | null,
  sourceLine: string | null
) => {
  const lines = body?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];
  if (runbookUrl && lines[0] === runbookUrl) {
    lines.shift();
  }
  if (titleLine && lines[0] === titleLine) {
    lines.shift();
  }
  if (sourceLine && lines[lines.length - 1] === sourceLine) {
    lines.pop();
  }

  return lines.join('\n').trim() || null;
};

const buildOpsNotifyMessage = (payload: OpsNotifyPayload, severity: string) => {
  const runbookUrl = payload.runbook_url?.trim() || null;
  const title = payload.title?.trim() || null;
  const source = payload.source?.trim() || null;
  const sourceLine = source ? `source=${source}` : null;
  const titleLine = title ? `[${severity}] ${title}` : null;

  if (payload.text?.trim()) {
    const text = payload.text.trim();
    return [
      runbookUrl && !text.startsWith(runbookUrl) ? runbookUrl : null,
      text,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
  }

  const normalizedBody = stripDuplicateOpsNotifyLines(
    payload.body,
    runbookUrl ?? undefined,
    titleLine,
    sourceLine
  );

  return [
    runbookUrl,
    titleLine,
    normalizedBody,
    sourceLine,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
};

export async function registerAlertRelayRoutes(app: AppInstance) {
  app.post(
    '/internal/alert-relay',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const parsed = parseSchema(AlertRelayPayloadSchema, request.body);
      if (!parsed.isValid) {
        return sendError(reply, 400, 'Invalid request.', parsed.errors);
      }

      const severity = isAlertmanagerWebhook(parsed.data)
        ? resolveSeverity(parsed.data)
        : resolveOpsNotifySeverity(parsed.data);
      const chat = routeSeverityToChat(severity);
      const text = isAlertmanagerWebhook(parsed.data)
        ? buildAlertRelayMessage(parsed.data, severity)
        : buildOpsNotifyMessage(parsed.data, severity);

      try {
        const delivered = await sendTelegramMessage({
          chat,
          text,
        });

        return sendSuccess(
          reply,
          {
            accepted: true,
            chat,
            severity,
            alerts: isAlertmanagerWebhook(parsed.data) ? parsed.data.alerts.length : 1,
            messageId: delivered.messageId,
          },
          202
        );
      } catch (error) {
        return sendErrorForException(reply, error, 'Failed to relay alert.');
      }
    }
  );
}
