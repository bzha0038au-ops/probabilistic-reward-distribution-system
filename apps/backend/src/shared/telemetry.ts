import * as Sentry from '@sentry/node';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

import { getConfig } from './config';
import { getRuntimeMetadata } from './runtime-metadata';

type ObservabilityCaptureContext = {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
};

let telemetryInitialized = false;
let tracerProvider: NodeTracerProvider | null = null;

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const normalizeTraceSampleRatio = (value: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;

const parseOtlpHeaders = (value: string) =>
  Object.fromEntries(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=');
        if (separator <= 0) return null;
        const key = entry.slice(0, separator).trim();
        const headerValue = entry.slice(separator + 1).trim();
        if (!key || !headerValue) return null;
        return [key, headerValue] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null)
  );

const normalizeOtlpEndpoint = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }

  return trimmed.endsWith('/v1/traces') ? trimmed : `${trimmed}/v1/traces`;
};

const setSentryScopeTags = (metadata = getRuntimeMetadata()) => {
  Sentry.setTags({
    service: metadata.serviceName,
    environment: metadata.environment,
    release: metadata.release,
    commit_sha: metadata.commitSha,
  });
};

export const initializeObservability = () => {
  if (telemetryInitialized) {
    return;
  }

  telemetryInitialized = true;

  const config = getConfig();
  const metadata = getRuntimeMetadata(config);
  const spanProcessors = [];

  Sentry.init({
    dsn: config.sentryDsn || undefined,
    enabled: config.sentryDsn.trim() !== '',
    environment: metadata.environment,
    release: metadata.release,
    tracesSampleRate:
      config.sentryTracesSampleRate > 0
        ? normalizeTraceSampleRatio(config.sentryTracesSampleRate)
        : undefined,
    initialScope: {
      tags: {
        service: metadata.serviceName,
        environment: metadata.environment,
        release: metadata.release,
        commit_sha: metadata.commitSha,
      },
    },
  });

  const exporterEndpoint = normalizeOtlpEndpoint(config.otelExporterOtlpEndpoint);
  if (exporterEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: exporterEndpoint,
          headers: parseOtlpHeaders(config.otelExporterOtlpHeaders),
        })
      )
    );
  }

  tracerProvider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: metadata.serviceName,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: metadata.environment,
      [SEMRESATTRS_SERVICE_VERSION]: metadata.release,
      'vcs.revision': metadata.commitSha,
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(
        normalizeTraceSampleRatio(config.otelTraceSampleRatio)
      ),
    }),
    spanProcessors,
  });

  tracerProvider.register();

  registerInstrumentations({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });
};

export const getActiveTraceId = () =>
  trace.getActiveSpan()?.spanContext().traceId;

export const bindRequestObservability = (payload: {
  requestId: string;
  traceId: string;
  locale?: string;
  method?: string;
  route?: string;
}) => {
  setSentryScopeTags();
  Sentry.setTags({
    request_id: payload.requestId,
    trace_id: payload.traceId,
    locale: payload.locale ?? 'unknown',
  });
  Sentry.setContext('request', {
    requestId: payload.requestId,
    traceId: payload.traceId,
    locale: payload.locale ?? null,
    method: payload.method ?? null,
    route: payload.route ?? null,
  });

  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  span.setAttributes({
    'app.request_id': payload.requestId,
    'app.trace_id': payload.traceId,
    'app.locale': payload.locale ?? 'unknown',
    ...(payload.method ? { 'http.request.method': payload.method } : {}),
    ...(payload.route ? { 'http.route': payload.route } : {}),
  });
};

export const bindActorObservability = (payload: {
  userId: number;
  role: 'user' | 'admin';
}) => {
  Sentry.setUser({
    id: String(payload.userId),
  });
  Sentry.setTag('actor_role', payload.role);

  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  span.setAttributes({
    'enduser.id': String(payload.userId),
    'app.actor_role': payload.role,
  });
};

export const recordActiveSpanError = (error: unknown) => {
  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }

  const normalized = normalizeError(error);
  span.recordException(normalized);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: normalized.message,
  });
};

export const captureException = (
  error: unknown,
  captureContext: ObservabilityCaptureContext = {}
) => {
  recordActiveSpanError(error);

  Sentry.withScope((scope) => {
    setSentryScopeTags();

    for (const [key, value] of Object.entries(captureContext.tags ?? {})) {
      if (value !== undefined && value !== null) {
        scope.setTag(key, String(value));
      }
    }

    if (captureContext.extra) {
      for (const [key, value] of Object.entries(captureContext.extra)) {
        scope.setExtra(key, value);
      }
    }

    Sentry.captureException(normalizeError(error));
  });
};

export const captureMessage = (
  message: string,
  captureContext: ObservabilityCaptureContext = {}
) => {
  Sentry.withScope((scope) => {
    setSentryScopeTags();

    for (const [key, value] of Object.entries(captureContext.tags ?? {})) {
      if (value !== undefined && value !== null) {
        scope.setTag(key, String(value));
      }
    }

    if (captureContext.extra) {
      for (const [key, value] of Object.entries(captureContext.extra)) {
        scope.setExtra(key, value);
      }
    }

    Sentry.captureMessage(message);
  });
};

export const shutdownObservability = async () => {
  await Promise.allSettled([
    tracerProvider?.shutdown(),
    Sentry.close(2_000),
  ]);
};
