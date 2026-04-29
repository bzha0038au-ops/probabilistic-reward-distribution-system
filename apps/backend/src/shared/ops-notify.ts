import { domainError } from './errors';

export type OpsAlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type OpsAlertAction = 'trigger' | 'resolve';

export type DispatchOpsAlertInput = {
  summary: string;
  text: string;
  severity: OpsAlertSeverity;
  source: string;
  component?: string;
  dedupKey?: string;
  action?: OpsAlertAction;
  slackWebhookUrl?: string | null;
  pagerDutyRoutingKey?: string | null;
  timeoutMs?: number;
  customDetails?: Record<string, unknown>;
};

type PagerDutyEventResponse = {
  status?: string;
  message?: string;
  dedup_key?: string;
  errors?: string[];
};

type DeliveryChannel = 'slack' | 'pagerduty';

const PAGER_DUTY_EVENTS_V2_URL = 'https://events.pagerduty.com/v2/enqueue';

const normalizeConfiguredValue = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const withTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 10_000
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const parseJsonResponse = async <T>(response: Response) => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const dispatchSlackWebhook = async (
  webhookUrl: string,
  input: DispatchOpsAlertInput
) => {
  const response = await withTimeout(
    (signal) =>
      fetch(webhookUrl, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: `${input.summary}\n${input.text}`.trim(),
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: input.summary,
                emoji: true,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: input.text,
              },
            },
          ],
        }),
      }),
    input.timeoutMs
  );

  const body = await response.text();
  if (!response.ok) {
    throw domainError(
      502,
      `Slack webhook failed with status ${response.status}`,
      {
        details: body.trim() ? [body.trim()] : undefined,
      }
    );
  }

  return {
    channel: 'slack' as const,
    status: response.status,
  };
};

const dispatchPagerDutyEvent = async (
  routingKey: string,
  input: DispatchOpsAlertInput
) => {
  const dedupKey =
    normalizeConfiguredValue(input.dedupKey) ??
    `${input.source}:${input.summary}`.slice(0, 255);
  const action = input.action ?? 'trigger';

  const response = await withTimeout(
    (signal) =>
      fetch(PAGER_DUTY_EVENTS_V2_URL, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          routing_key: routingKey,
          event_action: action,
          dedup_key: dedupKey,
          ...(action === 'trigger'
            ? {
                payload: {
                  summary: input.summary,
                  severity: input.severity,
                  source: input.source,
                  component: input.component,
                  custom_details: {
                    text: input.text,
                    ...(input.customDetails ?? {}),
                  },
                },
              }
            : {}),
        }),
      }),
    input.timeoutMs
  );

  const parsed = await parseJsonResponse<PagerDutyEventResponse>(response);
  if (!response.ok || parsed?.status !== 'success') {
    throw domainError(
      502,
      `PagerDuty Events API failed with status ${response.status}`,
      {
        details: parsed?.errors?.length
          ? parsed.errors
          : parsed?.message
            ? [parsed.message]
            : undefined,
      }
    );
  }

  return {
    channel: 'pagerduty' as const,
    status: response.status,
    dedupKey: parsed.dedup_key ?? dedupKey,
  };
};

export const dispatchOpsAlert = async (input: DispatchOpsAlertInput) => {
  const summary = input.summary.trim();
  const text = input.text.trim();
  if (!summary) {
    throw domainError(400, 'Ops alert summary is required.');
  }
  if (!text) {
    throw domainError(400, 'Ops alert text is required.');
  }

  const slackWebhookUrl = normalizeConfiguredValue(input.slackWebhookUrl);
  const pagerDutyRoutingKey = normalizeConfiguredValue(
    input.pagerDutyRoutingKey
  );
  const deliveries: Array<
    | Awaited<ReturnType<typeof dispatchSlackWebhook>>
    | Awaited<ReturnType<typeof dispatchPagerDutyEvent>>
  > = [];

  if (slackWebhookUrl) {
    deliveries.push(await dispatchSlackWebhook(slackWebhookUrl, input));
  }

  if (pagerDutyRoutingKey) {
    deliveries.push(await dispatchPagerDutyEvent(pagerDutyRoutingKey, input));
  }

  return {
    delivered: deliveries.length > 0,
    channels: deliveries.map((delivery) => delivery.channel as DeliveryChannel),
    pagerDutyDedupKey:
      deliveries.find(
        (
          delivery
        ): delivery is Awaited<ReturnType<typeof dispatchPagerDutyEvent>> =>
          delivery.channel === 'pagerduty'
      )?.dedupKey ?? null,
  };
};
