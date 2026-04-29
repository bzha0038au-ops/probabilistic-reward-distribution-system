import { createHash, randomUUID } from 'node:crypto';
import * as http from 'node:http';
import { performance } from 'node:perf_hooks';

import {
  createBackendEnv,
  createSqlClient,
  findFreePort,
  startService,
  startTestDatabase,
} from '../support/test-harness';

type SeededProject = {
  apiKey: string;
  apiKeyId: number;
  label: string;
  projectId: number;
  tenantId: number;
};

type ScenarioActor = {
  actorId: string;
  project: SeededProject;
};

type ScenarioMode = 'payout' | 'mute';

type FailureSample = {
  bodySnippet: string;
  status: number;
};

type RequestOutcome = {
  bodySnippet: string;
  durationMs: number;
  dropped: boolean;
  ok: boolean;
  status: number | null;
  timedOut: boolean;
};

type ScenarioConfig = {
  actors: ScenarioActor[];
  actorPoolSize: number;
  connections: number;
  durationSeconds: number;
  expectedMode: ScenarioMode;
  id: string;
  name: string;
  projects: SeededProject[];
  sampleProject: SeededProject;
  targetQps: number;
};

type ScenarioSummary = {
  actualDurationSeconds: number;
  actualQpsAverage: number;
  actorPoolSize: number;
  connections: number;
  degradedAgainstTarget: boolean;
  droppedRequestCount: number;
  errors: number;
  expectedMode: ScenarioMode;
  failureSamples: FailureSample[];
  httpSuccessCount: number;
  id: string;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  name: string;
  non2xx: number;
  payoutRecordCount: number;
  requestCount: number;
  sentRequestCount: number;
  statusCodeStats: Record<string, number>;
  targetQps: number;
  timeouts: number;
  totalRecordCount: number;
  zeroRewardRecordCount: number;
  mutedEnvelopeRecordCount?: number;
  preflightSample: unknown;
};

type AutocannonLikeResult = {
  droppedRequestCount: number;
  errors: number;
  httpSuccessCount: number;
  latencySamples: number[];
  non2xx: number;
  requestCount: number;
  sentRequestCount: number;
  statusCodeStats: Record<string, number>;
  timeouts: number;
  totalDurationSeconds: number;
};

let fixtureCounter = 1;

const PRIZE_ENGINE_SCOPES = [
  'catalog:read',
  'fairness:read',
  'reward:write',
  'ledger:read',
] as const;

const normalizePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${value ?? String(fallback)}.`);
  }

  return Math.floor(parsed);
};

const hashApiKey = (value: string) =>
  createHash('sha256').update(value.trim()).digest('hex');

const createRewardPayload = (payload: {
  agentId: string;
  includeAgentMetadata?: boolean;
  label: string;
  runner: string;
}) => {
  const uniqueId = randomUUID();

  return {
    environment: 'sandbox',
    agent: {
      agentId: payload.agentId,
      ...(payload.includeAgentMetadata
        ? {
            metadata: {
              owner: 'load-test',
              scenario: payload.label,
            },
          }
        : {}),
    },
    behavior: {
      actionType: `${payload.label}.reward.${uniqueId}`,
      score: 0.82,
      novelty: 0.14,
      risk: 0.08,
      context: {
        region: 'apac',
        surface: 'load_test',
      },
      signals: {
        runner: payload.runner,
        source: 'prize_engine_smoke',
      },
    },
    idempotencyKey: `${payload.label}-idem-${uniqueId}`,
    clientNonce: `${payload.label}-nonce-${uniqueId}`,
  };
};

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index] ?? 0;
};

const sleep = async (delayMs: number) => {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const buildScenarioActors = (payload: {
  connections: number;
  actorPoolMinPerProject: number;
  actorPoolMultiplier: number;
  projects: SeededProject[];
  scenarioId: string;
}) => {
  const actorsPerProject = Math.max(
    payload.actorPoolMinPerProject,
    Math.ceil(
      (payload.connections * payload.actorPoolMultiplier) /
        Math.max(payload.projects.length, 1),
    ),
  );

  return payload.projects.flatMap((project, projectIndex) =>
    Array.from({ length: actorsPerProject }, (_, actorIndex) => ({
      actorId: `${payload.scenarioId}-project-${projectIndex + 1}-actor-${actorIndex + 1}`,
      project,
    })),
  );
};

const runWithConcurrency = async <TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
) => {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    async () => {
      while (true) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= items.length) {
          return;
        }

        results[current] = await worker(items[current]!, current);
      }
    },
  );

  await Promise.all(runners);
  return results;
};

const isTimeoutError = (error: unknown) =>
  error instanceof Error &&
  ((typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code?: string }).code === 'ETIMEDOUT') ||
    /timeout/i.test(error.message));

const postRewardRequest = async (payload: {
  apiKey: string;
  body: string;
  timeoutMs: number;
  url: string;
}) =>
  await new Promise<{ rawBody: string; status: number }>((resolve, reject) => {
    const target = new URL(payload.url);
    const request = http.request(
      {
        headers: {
          authorization: `Bearer ${payload.apiKey}`,
          'content-length': Buffer.byteLength(payload.body),
          'content-type': 'application/json',
        },
        host: target.hostname,
        method: 'POST',
        path: `${target.pathname}${target.search}`,
        port: target.port,
      },
      (response) => {
        const chunks: string[] = [];
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            rawBody: chunks.join(''),
            status: response.statusCode ?? 0,
          });
        });
      },
    );

    request.setTimeout(payload.timeoutMs, () => {
      request.destroy(new Error('Request timeout'));
    });
    request.on('error', reject);
    request.write(payload.body);
    request.end();
  });

const runRateLimitedScenario = async (payload: {
  actors: ScenarioActor[];
  connections: number;
  durationSeconds: number;
  failureSamples: FailureSample[];
  phase: 'run' | 'warmup';
  projects: SeededProject[];
  scenarioId: string;
  targetQps: number;
  timeoutSeconds: number;
  url: string;
}) => {
  const scheduledRequestCount = payload.targetQps * payload.durationSeconds;
  const intervalMs = 1000 / payload.targetQps;
  const dispatchDeadlineMs = payload.durationSeconds * 1000;
  const completionDeadlineMs =
    dispatchDeadlineMs + payload.timeoutSeconds * 1000;
  const schedule = Array.from({ length: scheduledRequestCount }, (_, index) => ({
    actor: payload.actors[index % payload.actors.length]!,
    requestLabel: `${payload.scenarioId}-${payload.phase}-${index + 1}`,
    scheduledOffsetMs: index * intervalMs,
  }));
  const startedAt = performance.now();

  const outcomes = await runWithConcurrency(schedule, payload.connections, async (request) => {
    if (performance.now() - startedAt > dispatchDeadlineMs) {
      if (payload.failureSamples.length < 5) {
        payload.failureSamples.push({
          bodySnippet: 'Client-side dispatch deadline exceeded before request start.',
          status: 0,
        });
      }

      return {
        bodySnippet: '',
        dropped: true,
        durationMs: 0,
        ok: false,
        status: null,
        timedOut: false,
      } satisfies RequestOutcome;
    }

    const waitMs = request.scheduledOffsetMs - (performance.now() - startedAt);
    await sleep(waitMs);

    if (performance.now() - startedAt > dispatchDeadlineMs) {
      if (payload.failureSamples.length < 5) {
        payload.failureSamples.push({
          bodySnippet: 'Client-side dispatch deadline exceeded after wait window.',
          status: 0,
        });
      }

      return {
        bodySnippet: '',
        dropped: true,
        durationMs: 0,
        ok: false,
        status: null,
        timedOut: false,
      } satisfies RequestOutcome;
    }

    const requestStartedAt = performance.now();
    const requestTimeoutMs = Math.max(
      1,
      Math.min(
        payload.timeoutSeconds * 1000,
        completionDeadlineMs - (requestStartedAt - startedAt),
      ),
    );

    try {
      const body = JSON.stringify(
        createRewardPayload({
          agentId: request.actor.actorId,
          label: request.requestLabel,
          runner: 'load-runner',
        }),
      );
      const response = await postRewardRequest({
        apiKey: request.actor.project.apiKey,
        body,
        timeoutMs: requestTimeoutMs,
        url: payload.url,
      });
      const rawBody = response.rawBody;
      let parsedBody: unknown = null;

      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = null;
      }

      const apiOk =
        parsedBody &&
        typeof parsedBody === 'object' &&
        Reflect.get(parsedBody, 'ok') === true;
      const ok =
        response.status >= 200 &&
        response.status < 300 &&
        apiOk;

      if (!ok && payload.failureSamples.length < 5) {
        payload.failureSamples.push({
          bodySnippet: rawBody.slice(0, 240),
          status: response.status,
        });
      }

      return {
        bodySnippet: rawBody.slice(0, 240),
        durationMs: performance.now() - requestStartedAt,
        dropped: false,
        ok,
        status: response.status,
        timedOut: false,
      } satisfies RequestOutcome;
    } catch (error) {
      const timedOut = isTimeoutError(error);

      if (payload.failureSamples.length < 5) {
        payload.failureSamples.push({
          bodySnippet:
            error instanceof Error ? error.message.slice(0, 240) : 'Unknown error',
          status: 0,
        });
      }

      return {
        bodySnippet: '',
        durationMs: performance.now() - requestStartedAt,
        dropped: false,
        ok: false,
        status: null,
        timedOut,
      } satisfies RequestOutcome;
    }
  });

  const totalDurationSeconds = Number(
    ((performance.now() - startedAt) / 1000).toFixed(2),
  );
  const statusCodeStats = outcomes.reduce<Record<string, number>>((stats, outcome) => {
    if (outcome.status !== null) {
      const key = String(outcome.status);
      stats[key] = (stats[key] ?? 0) + 1;
    }

    return stats;
  }, {});

  return {
    droppedRequestCount: outcomes.filter((outcome) => outcome.dropped).length,
    errors: outcomes.filter(
      (outcome) => !outcome.dropped && outcome.status === null && !outcome.timedOut,
    ).length,
    httpSuccessCount: outcomes.filter((outcome) => !outcome.dropped && outcome.ok)
      .length,
    latencySamples: outcomes
      .filter((outcome) => !outcome.dropped)
      .map((outcome) => outcome.durationMs),
    non2xx: outcomes.filter(
      (outcome) =>
        !outcome.dropped &&
        outcome.status !== null &&
        (outcome.status < 200 || outcome.status >= 300),
    ).length,
    requestCount: outcomes.filter((outcome) => !outcome.dropped).length,
    sentRequestCount: scheduledRequestCount,
    statusCodeStats,
    timeouts: outcomes.filter((outcome) => !outcome.dropped && outcome.timedOut).length,
    totalDurationSeconds,
  } satisfies AutocannonLikeResult;
};

const seedScenarioActors = async (payload: {
  actors: ScenarioActor[];
  sql: ReturnType<typeof createSqlClient>;
}) => {
  const actorsByProject = new Map<number, ScenarioActor[]>();
  const seededAt = new Date();

  for (const actor of payload.actors) {
    const projectActors = actorsByProject.get(actor.project.projectId);
    if (projectActors) {
      projectActors.push(actor);
      continue;
    }

    actorsByProject.set(actor.project.projectId, [actor]);
  }

  for (const projectActors of actorsByProject.values()) {
    const project = projectActors[0]!.project;

    await payload.sql`
      insert into saas_agents ${
        payload.sql(
          projectActors.map((actor) => ({
            created_at: seededAt,
            external_id: actor.actorId,
            fingerprint: null,
            group_id: null,
            owner_metadata: null,
            project_id: project.projectId,
            status: 'active',
          })),
          'project_id',
          'external_id',
          'group_id',
          'owner_metadata',
          'fingerprint',
          'status',
          'created_at',
        )
      }
      on conflict (project_id, external_id) do nothing
    `;

    await payload.sql`
      insert into saas_players ${
        payload.sql(
          projectActors.map((actor) => ({
            balance: '0.00',
            created_at: seededAt,
            display_name: null,
            external_player_id: actor.actorId,
            metadata: null,
            pity_streak: 0,
            project_id: project.projectId,
            updated_at: seededAt,
          })),
          'project_id',
          'external_player_id',
          'display_name',
          'balance',
          'pity_streak',
          'metadata',
          'created_at',
          'updated_at',
        )
      }
      on conflict (project_id, external_player_id) do nothing
    `;
  }
};

const readScenarioRecordStats = async (
  sql: ReturnType<typeof createSqlClient>,
  projectIds: number[],
  afterId: number,
) => {
  const [row] = await sql<
    Array<{
      maxId: number | null;
      muteModeCount: string;
      payoutRecordCount: string;
      totalRecordCount: string;
      zeroRewardRecordCount: string;
    }>
  >`
    select
      coalesce(max(id), 0)::int as "maxId",
      count(*)::text as "totalRecordCount",
      count(*) filter (where reward_amount > 0)::text as "payoutRecordCount",
      count(*) filter (where reward_amount = 0)::text as "zeroRewardRecordCount",
      count(*) filter (
        where coalesce(metadata->'envelope'->>'mode', '') = 'mute'
      )::text as "muteModeCount"
    from saas_draw_records
    where project_id in ${sql(projectIds)}
      and id > ${afterId}
  `;

  return {
    maxId: row?.maxId ?? 0,
    muteModeCount: Number(row?.muteModeCount ?? 0),
    payoutRecordCount: Number(row?.payoutRecordCount ?? 0),
    totalRecordCount: Number(row?.totalRecordCount ?? 0),
    zeroRewardRecordCount: Number(row?.zeroRewardRecordCount ?? 0),
  };
};

const createScenarioSummary = (
  scenario: ScenarioConfig,
  result: AutocannonLikeResult,
  recordStats: Awaited<ReturnType<typeof readScenarioRecordStats>>,
  failureSamples: FailureSample[],
  preflightSample: unknown,
): ScenarioSummary => {
  return {
    actualDurationSeconds: result.totalDurationSeconds,
    actualQpsAverage:
      result.totalDurationSeconds > 0
        ? Number((result.httpSuccessCount / result.totalDurationSeconds).toFixed(2))
        : 0,
    actorPoolSize: scenario.actorPoolSize,
    connections: scenario.connections,
    degradedAgainstTarget:
      result.totalDurationSeconds > 0
        ? result.httpSuccessCount / result.totalDurationSeconds < scenario.targetQps
        : true,
    droppedRequestCount: result.droppedRequestCount,
    errors: result.errors,
    expectedMode: scenario.expectedMode,
    failureSamples: [...failureSamples],
    httpSuccessCount: result.httpSuccessCount,
    id: scenario.id,
    latencyP50Ms: Number(
      percentile(result.latencySamples, 0.5).toFixed(2),
    ),
    latencyP95Ms: Number(
      percentile(result.latencySamples, 0.95).toFixed(2),
    ),
    latencyP99Ms: Number(
      percentile(result.latencySamples, 0.99).toFixed(2),
    ),
    name: scenario.name,
    non2xx: result.non2xx,
    payoutRecordCount: recordStats.payoutRecordCount,
    preflightSample,
    requestCount: result.requestCount,
    sentRequestCount: result.sentRequestCount,
    statusCodeStats: result.statusCodeStats,
    targetQps: scenario.targetQps,
    timeouts: result.timeouts,
    totalRecordCount: recordStats.totalRecordCount,
    ...(scenario.expectedMode === 'mute'
      ? { mutedEnvelopeRecordCount: recordStats.muteModeCount }
      : {}),
    zeroRewardRecordCount: recordStats.zeroRewardRecordCount,
  };
};

const assertScenarioInvariants = (summary: ScenarioSummary) => {
  if (summary.expectedMode === 'payout') {
    if (summary.zeroRewardRecordCount !== 0) {
      throw new Error(
        `Scenario ${summary.id} produced ${summary.zeroRewardRecordCount} muted rewards during a payout-only run.`,
      );
    }

    if (summary.payoutRecordCount !== summary.totalRecordCount) {
      throw new Error(
        `Scenario ${summary.id} recorded ${summary.payoutRecordCount} payout rows for ${summary.totalRecordCount} persisted draw rows.`,
      );
    }

    return;
  }

  if (summary.payoutRecordCount !== 0) {
    throw new Error(
      `Scenario ${summary.id} recorded ${summary.payoutRecordCount} positive payouts while mute fallback was expected.`,
    );
  }

  if (summary.zeroRewardRecordCount !== summary.totalRecordCount) {
    throw new Error(
      `Scenario ${summary.id} recorded ${summary.zeroRewardRecordCount} zero-reward rows for ${summary.totalRecordCount} persisted draw rows.`,
    );
  }

  if (summary.mutedEnvelopeRecordCount !== summary.totalRecordCount) {
    throw new Error(
      `Scenario ${summary.id} recorded ${summary.mutedEnvelopeRecordCount ?? 0} muted envelope rows for ${summary.totalRecordCount} persisted draw rows.`,
    );
  }
};

const verifyPreflight = async (payload: {
  baseUrl: string;
  project: SeededProject;
  scenarioId: string;
  expectedMode: ScenarioMode;
}) => {
  const response = await fetch(`${payload.baseUrl}/v1/engine/rewards`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${payload.project.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(
      createRewardPayload({
        agentId: `${payload.scenarioId}-preflight-${randomUUID()}`,
        includeAgentMetadata: true,
        label: `${payload.scenarioId}-preflight`,
        runner: 'manual-preflight',
      }),
    ),
  });
  const body = await response.json();

  if (!response.ok || !body?.ok) {
    throw new Error(
      `Preflight failed for ${payload.scenarioId} with ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  const result = Reflect.get(Reflect.get(body, 'data') ?? {}, 'result');
  const rewardAmount = String(Reflect.get(result ?? {}, 'rewardAmount') ?? '');
  const status = String(Reflect.get(result ?? {}, 'status') ?? '');
  const envelope = Reflect.get(result ?? {}, 'envelope');
  const envelopeMode = String(Reflect.get(envelope ?? {}, 'mode') ?? '');

  if (payload.expectedMode === 'payout') {
    if (rewardAmount === '0.00') {
      throw new Error(
        `Preflight for ${payload.scenarioId} unexpectedly muted the reward response.`,
      );
    }
  } else if (
    rewardAmount !== '0.00' ||
    status !== 'miss' ||
    envelopeMode !== 'mute'
  ) {
    throw new Error(
      `Preflight for ${payload.scenarioId} did not return the expected mute fallback: ${JSON.stringify(body)}`,
    );
  }

  return body;
};

const seedProject = async (payload: {
  sql: ReturnType<typeof createSqlClient>;
  label: string;
  prizeRewardAmount: string;
  rewardEnvelope?: {
    budgetCap: string;
    expectedPayoutPerCall: string;
    onCapHitStrategy: 'mute' | 'reject';
    varianceCap: string;
    window: 'minute' | 'hour' | 'day';
  };
}) => {
  const suffix = fixtureCounter++;
  const slugBase = `${payload.label}-${suffix}`;
  const tenantSlug = `${slugBase}-tenant`.slice(0, 64);
  const projectSlug = `${slugBase}-project`.slice(0, 64);
  const tenantName = `${payload.label} Tenant ${suffix}`;
  const projectName = `${payload.label} Project ${suffix}`;

  const [tenant] = await payload.sql<Array<{ id: number }>>`
    insert into saas_tenants (
      slug,
      name,
      status,
      created_at,
      updated_at
    )
    values (
      ${tenantSlug},
      ${tenantName},
      'active',
      now(),
      now()
    )
    returning id
  `;

  const [project] = await payload.sql<Array<{ id: number }>>`
    insert into saas_projects (
      tenant_id,
      slug,
      name,
      environment,
      status,
      currency,
      draw_cost,
      prize_pool_balance,
      strategy,
      strategy_params,
      fairness_epoch_seconds,
      max_draw_count,
      miss_weight,
      api_rate_limit_burst,
      api_rate_limit_hourly,
      api_rate_limit_daily,
      created_at,
      updated_at
    )
    values (
      ${tenant.id},
      ${projectSlug},
      ${projectName},
      'sandbox',
      'active',
      'USD',
      '0.00',
      '1000000.00',
      'weighted_gacha',
      ${JSON.stringify({})}::jsonb,
      3600,
      1,
      0,
      1000000,
      1000000,
      1000000,
      now(),
      now()
    )
    returning id
  `;

  await payload.sql`
    insert into saas_project_prizes (
      project_id,
      name,
      stock,
      weight,
      reward_amount,
      is_active,
      created_at,
      updated_at
    )
    values (
      ${project.id},
      ${`${payload.label} Prize ${suffix}`},
      1000000,
      1,
      ${payload.prizeRewardAmount},
      true,
      now(),
      now()
    )
  `;

  const keyPrefix = `pe_test_${slugBase}`.slice(0, 64);
  const apiKey = `${keyPrefix}_secret`;

  const [apiKeyRow] = await payload.sql<Array<{ id: number }>>`
    insert into saas_api_keys (
      project_id,
      label,
      key_prefix,
      key_hash,
      scopes,
      expires_at,
      created_at
    )
    values (
      ${project.id},
      ${`${payload.label} key ${suffix}`},
      ${keyPrefix},
      ${hashApiKey(apiKey)},
      ${JSON.stringify([...PRIZE_ENGINE_SCOPES])}::jsonb,
      ${new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)},
      now()
    )
    returning id
  `;

  if (payload.rewardEnvelope) {
    await payload.sql`
      insert into saas_reward_envelopes (
        tenant_id,
        project_id,
        "window",
        on_cap_hit_strategy,
        budget_cap,
        expected_payout_per_call,
        variance_cap,
        current_consumed,
        current_call_count,
        current_window_started_at,
        created_at,
        updated_at
      )
      values (
        ${tenant.id},
        ${project.id},
        ${payload.rewardEnvelope.window},
        ${payload.rewardEnvelope.onCapHitStrategy},
        ${payload.rewardEnvelope.budgetCap},
        ${payload.rewardEnvelope.expectedPayoutPerCall},
        ${payload.rewardEnvelope.varianceCap},
        '0.0000',
        0,
        now(),
        now(),
        now()
      )
    `;
  }

  return {
    apiKey,
    apiKeyId: apiKeyRow.id,
    label: payload.label,
    projectId: project.id,
    tenantId: tenant.id,
  } satisfies SeededProject;
};

async function main() {
  const singleTenantQps = normalizePositiveInteger(
    process.env.LOAD_SINGLE_TENANT_QPS,
    20,
  );
  const multiTenantQps = normalizePositiveInteger(
    process.env.LOAD_MULTI_TENANT_QPS,
    50,
  );
  const capFallbackQps = normalizePositiveInteger(
    process.env.LOAD_CAP_FALLBACK_QPS,
    20,
  );
  const durationSeconds = normalizePositiveInteger(process.env.LOAD_DURATION_SECONDS, 10);
  const requestTimeoutSeconds = normalizePositiveInteger(
    process.env.LOAD_REQUEST_TIMEOUT_SECONDS,
    5,
  );
  const postRunDrainSeconds = normalizePositiveInteger(
    process.env.LOAD_POST_RUN_DRAIN_SECONDS,
    requestTimeoutSeconds,
  );
  const warmupSeconds = Number(process.env.LOAD_WARMUP_SECONDS ?? 2);
  const singleTenantConnections = normalizePositiveInteger(
    process.env.LOAD_SINGLE_TENANT_CONNECTIONS,
    8,
  );
  const multiTenantConnections = normalizePositiveInteger(
    process.env.LOAD_MULTI_TENANT_CONNECTIONS,
    16,
  );
  const capFallbackConnections = normalizePositiveInteger(
    process.env.LOAD_CAP_FALLBACK_CONNECTIONS,
    8,
  );
  const actorPoolMultiplier = normalizePositiveInteger(
    process.env.LOAD_ACTOR_POOL_MULTIPLIER,
    2,
  );
  const actorPoolMinPerProject = normalizePositiveInteger(
    process.env.LOAD_ACTOR_POOL_MIN_PER_PROJECT,
    16,
  );
  const multiTenantProjectCount = normalizePositiveInteger(
    process.env.LOAD_MULTI_TENANT_PROJECTS,
    5,
  );
  const backendDbPoolMax = normalizePositiveInteger(
    process.env.DB_POOL_MAX,
    30,
  );
  const backendDbPoolIdleTimeoutSeconds = normalizePositiveInteger(
    process.env.DB_POOL_IDLE_TIMEOUT_SECONDS,
    20,
  );
  const backendDbPoolConnectTimeoutSeconds = normalizePositiveInteger(
    process.env.DB_POOL_CONNECT_TIMEOUT_SECONDS,
    30,
  );
  const backendDbPoolMaxLifetimeSeconds = normalizePositiveInteger(
    process.env.DB_POOL_MAX_LIFETIME_SECONDS,
    1800,
  );
  const selectedScenarioIds = new Set(
    String(process.env.LOAD_SCENARIO_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  const database = await startTestDatabase('load-prize-engine');
  const backendPort = await findFreePort();
  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;
  const rewardUrl = `${backendBaseUrl}/v1/engine/rewards`;
  const backendShutdownTimeoutMs = Math.max(
    30_000,
    (requestTimeoutSeconds + postRunDrainSeconds + 10) * 1000,
  );

  let backend: Awaited<ReturnType<typeof startService>> | null = null;

  try {
    backend = await startService(
      'pnpm',
      ['--dir', 'apps/backend', 'exec', 'tsx', 'src/prize-engine-load-server.ts'],
      {
        env: {
          ...createBackendEnv({
            databaseUrl: database.databaseUrl,
            port: backendPort,
            webBaseUrl: 'http://127.0.0.1:3000',
          }),
          DRAW_POOL_CACHE_TTL_SECONDS: '0',
          LOG_LEVEL: 'error',
          PRIZE_ENGINE_LOAD_SERVER_DEBUG:
            process.env.PRIZE_ENGINE_LOAD_SERVER_DEBUG ?? '',
          RATE_LIMIT_AUTH_MAX: '100000',
          RATE_LIMIT_AUTH_WINDOW_MS: '60000',
          RATE_LIMIT_DRAW_MAX: '100000',
          RATE_LIMIT_DRAW_WINDOW_MS: '60000',
          RATE_LIMIT_FINANCE_MAX: '100000',
          RATE_LIMIT_FINANCE_WINDOW_MS: '60000',
          RATE_LIMIT_GLOBAL_MAX: '100000',
          RATE_LIMIT_GLOBAL_WINDOW_MS: '60000',
          DB_POOL_MAX: String(backendDbPoolMax),
          DB_POOL_IDLE_TIMEOUT_SECONDS: String(
            backendDbPoolIdleTimeoutSeconds,
          ),
          DB_POOL_CONNECT_TIMEOUT_SECONDS: String(
            backendDbPoolConnectTimeoutSeconds,
          ),
          DB_POOL_MAX_LIFETIME_SECONDS: String(
            backendDbPoolMaxLifetimeSeconds,
          ),
        },
        healthUrl: `${backendBaseUrl}/health`,
        shutdownTimeoutMs: backendShutdownTimeoutMs,
      },
    );

    const sql = createSqlClient(database.databaseUrl);

    try {
      const singleTenantProject = await seedProject({
        sql,
        label: 'single-tenant',
        prizeRewardAmount: '1.00',
      });

      const multiTenantProjects = await Promise.all(
        Array.from({ length: multiTenantProjectCount }, (_, index) =>
          seedProject({
            sql,
            label: `multi-tenant-${index + 1}`,
            prizeRewardAmount: '1.00',
          }),
        ),
      );

      const capFallbackProject = await seedProject({
        sql,
        label: 'cap-fallback',
        prizeRewardAmount: '5.00',
        rewardEnvelope: {
          budgetCap: '3.0000',
          expectedPayoutPerCall: '5.0000',
          onCapHitStrategy: 'mute',
          varianceCap: '999.0000',
          window: 'minute',
        },
      });

      const scenarios: ScenarioConfig[] = [
        {
          actors: buildScenarioActors({
            actorPoolMinPerProject,
            actorPoolMultiplier,
            connections: singleTenantConnections,
            projects: [singleTenantProject],
            scenarioId: 'single_tenant_1k_qps',
          }),
          actorPoolSize: 0,
          connections: singleTenantConnections,
          durationSeconds,
          expectedMode: 'payout',
          id: 'single_tenant_1k_qps',
          name: 'Single tenant steady-state reward writes',
          projects: [singleTenantProject],
          sampleProject: singleTenantProject,
          targetQps: singleTenantQps,
        },
        {
          actors: buildScenarioActors({
            actorPoolMinPerProject,
            actorPoolMultiplier,
            connections: multiTenantConnections,
            projects: multiTenantProjects,
            scenarioId: 'multi_tenant_5k_qps',
          }),
          actorPoolSize: 0,
          connections: multiTenantConnections,
          durationSeconds,
          expectedMode: 'payout',
          id: 'multi_tenant_5k_qps',
          name: 'Multi-tenant mixed reward writes',
          projects: multiTenantProjects,
          sampleProject: multiTenantProjects[0]!,
          targetQps: multiTenantQps,
        },
        {
          actors: buildScenarioActors({
            actorPoolMinPerProject,
            actorPoolMultiplier,
            connections: capFallbackConnections,
            projects: [capFallbackProject],
            scenarioId: 'envelope_cap_mute_fallback',
          }),
          actorPoolSize: 0,
          connections: capFallbackConnections,
          durationSeconds,
          expectedMode: 'mute',
          id: 'envelope_cap_mute_fallback',
          name: 'Envelope-cap mute fallback',
          projects: [capFallbackProject],
          sampleProject: capFallbackProject,
          targetQps: capFallbackQps,
        },
      ]
        .map((scenario) => ({
          ...scenario,
          actorPoolSize: scenario.actors.length,
        }))
        .filter(
        (scenario) =>
          selectedScenarioIds.size === 0 || selectedScenarioIds.has(scenario.id),
      );

      if (scenarios.length === 0) {
        throw new Error('No load scenarios selected. Check LOAD_SCENARIO_IDS.');
      }

      const summaries: ScenarioSummary[] = [];

      for (const scenario of scenarios) {
        const failureSamples: FailureSample[] = [];

        const preflightSample = await verifyPreflight({
          baseUrl: backendBaseUrl,
          expectedMode: scenario.expectedMode,
          project: scenario.sampleProject,
          scenarioId: scenario.id,
        });

        await seedScenarioActors({
          actors: scenario.actors,
          sql,
        });

        if (warmupSeconds > 0) {
          await runRateLimitedScenario({
            actors: scenario.actors,
            connections: scenario.connections,
            durationSeconds: Math.floor(warmupSeconds),
            failureSamples,
            phase: 'warmup',
            scenarioId: scenario.id,
            targetQps: Math.max(1, Math.min(scenario.targetQps, 100)),
            timeoutSeconds: requestTimeoutSeconds,
            url: rewardUrl,
          });
          failureSamples.length = 0;
        }

        const baselineStats = await readScenarioRecordStats(
          sql,
          scenario.projects.map((project) => project.projectId),
          0,
        );

        console.log(
          `Running ${scenario.id} at ${scenario.targetQps} QPS for ${scenario.durationSeconds}s with ${scenario.connections} connections...`,
        );

        const result = await runRateLimitedScenario({
          actors: scenario.actors,
          connections: scenario.connections,
          durationSeconds: scenario.durationSeconds,
          failureSamples,
          phase: 'run',
          scenarioId: scenario.id,
          targetQps: scenario.targetQps,
          timeoutSeconds: requestTimeoutSeconds,
          url: rewardUrl,
        });

        const recordStats = await readScenarioRecordStats(
          sql,
          scenario.projects.map((project) => project.projectId),
          baselineStats.maxId,
        );

        const summary = createScenarioSummary(
          scenario,
          result,
          recordStats,
          failureSamples,
          preflightSample,
        );

        assertScenarioInvariants(summary);
        summaries.push(summary);
      }

      console.log('\nPrize engine load summary');
      console.log(
        JSON.stringify(
          {
            databasePool: {
              connectTimeoutSeconds: backendDbPoolConnectTimeoutSeconds,
              idleTimeoutSeconds: backendDbPoolIdleTimeoutSeconds,
              max: backendDbPoolMax,
              maxLifetimeSeconds: backendDbPoolMaxLifetimeSeconds,
            },
            generatedAt: new Date().toISOString(),
            scenarios: summaries,
          },
          null,
          2,
        ),
      );

      await sleep(postRunDrainSeconds * 1000);
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    await backend?.stop().catch(() => undefined);
    await database.stop();
  }
}

void main();
