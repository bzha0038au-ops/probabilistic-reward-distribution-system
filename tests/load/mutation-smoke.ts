import {
  createBackendEnv,
  createSqlClient,
  findFreePort,
  startService,
  startTestDatabase,
} from '../support/test-harness';

type LoginResponse = {
  token: string;
  user: {
    id: number;
    email: string;
  };
};

type ScenarioRequest = {
  body?: unknown;
  label: string;
  method: 'POST';
  path: string;
  token: string;
};

type ScenarioResult = {
  errors: number;
  failureSamples: Array<{
    bodySnippet: string;
    label: string;
    message: string;
    status: number | null;
  }>;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  non2xx: number;
  requestCount: number;
  requestsPerSecondAvg: number;
  scenario: string;
  successCount: number;
  totalDurationMs: number;
};

type RequestOutcome = {
  bodySnippet: string;
  durationMs: number;
  errorMessage: string | null;
  ok: boolean;
  status: number | null;
};

const password = 'Password123!';
const TEST_BIRTH_DATE = '1990-01-01';

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

async function main() {
  const userCount = Number(process.env.LOAD_USER_COUNT ?? 10);
  const setupConcurrency = Number(process.env.LOAD_SETUP_CONCURRENCY ?? 5);
  const drawConcurrency = Number(process.env.LOAD_DRAW_CONNECTIONS ?? 6);
  const claimConcurrency = Number(process.env.LOAD_CLAIM_CONNECTIONS ?? 5);
  const drawsPerUser = Number(process.env.LOAD_DRAWS_PER_USER ?? 3);

  const database = await startTestDatabase('load-mutations');
  const backendPort = await findFreePort();
  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;

  let backend: Awaited<ReturnType<typeof startService>> | null = null;

  const postJson = async <T>(path: string, payload: unknown, token?: string) => {
    const response = await fetch(`${backendBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    if (!response.ok || !body?.ok) {
      throw new Error(
        `Request to ${path} failed with ${response.status}: ${JSON.stringify(body)}`,
      );
    }

    return body.data as T;
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

  const runScenario = async (
    name: string,
    requests: ScenarioRequest[],
    concurrency: number,
  ): Promise<ScenarioResult> => {
    const startedAt = performance.now();

    const results = await runWithConcurrency(
      requests,
      concurrency,
      async (request) => {
        const requestStartedAt = performance.now();

        try {
          const response = await fetch(`${backendBaseUrl}${request.path}`, {
            method: request.method,
            headers: {
              authorization: `Bearer ${request.token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(request.body ?? {}),
          });

          const rawBody = await response.text();
          const durationMs = performance.now() - requestStartedAt;
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

          return {
            bodySnippet: rawBody.slice(0, 240),
            durationMs,
            errorMessage:
              response.ok && apiOk
                ? null
                : typeof Reflect.get(parsedBody ?? {}, 'error') === 'object'
                  ? String(
                      Reflect.get(
                        Reflect.get(parsedBody ?? {}, 'error') ?? {},
                        'message',
                      ) ?? `HTTP ${response.status}`,
                    )
                  : `HTTP ${response.status}`,
            ok: response.ok && apiOk,
            status: response.status,
          } satisfies RequestOutcome;
        } catch (error) {
          return {
            bodySnippet: '',
            durationMs: performance.now() - requestStartedAt,
            errorMessage:
              error instanceof Error ? error.message : 'Unknown request failure.',
            ok: false,
            status: null,
          } satisfies RequestOutcome;
        }
      },
    );

    const totalDurationMs = performance.now() - startedAt;
    const latencies = results.map((entry) => entry.durationMs);
    const non2xx = results.filter(
      (entry) => entry.status !== null && (entry.status < 200 || entry.status >= 300),
    ).length;
    const errors = results.filter((entry) => entry.status === null).length;
    const successCount = results.filter((entry) => entry.ok).length;
    const failureSamples = results
      .map((entry, index) => ({ entry, label: requests[index]!.label }))
      .filter(({ entry }) => !entry.ok)
      .slice(0, 5)
      .map(({ entry, label }) => ({
        bodySnippet: entry.bodySnippet,
        label,
        message: entry.errorMessage ?? 'Request failed.',
        status: entry.status,
      }));

    return {
      errors,
      failureSamples,
      latencyP50Ms: percentile(latencies, 0.5),
      latencyP95Ms: percentile(latencies, 0.95),
      latencyP99Ms: percentile(latencies, 0.99),
      non2xx,
      requestCount: requests.length,
      requestsPerSecondAvg:
        totalDurationMs > 0 ? Number(((requests.length * 1000) / totalDurationMs).toFixed(2)) : 0,
      scenario: name,
      successCount,
      totalDurationMs: Number(totalDurationMs.toFixed(2)),
    };
  };

  try {
    backend = await startService(
      'pnpm',
      ['--dir', 'apps/backend', 'exec', 'tsx', 'src/server.ts'],
      {
        env: {
          ...createBackendEnv({
            databaseUrl: database.databaseUrl,
            port: backendPort,
            webBaseUrl: 'http://127.0.0.1:3000',
          }),
          NODE_OPTIONS: '--experimental-specifier-resolution=node',
          LOG_LEVEL: 'error',
          DRAW_POOL_CACHE_TTL_SECONDS: '0',
          RATE_LIMIT_GLOBAL_MAX: '100000',
          RATE_LIMIT_GLOBAL_WINDOW_MS: '60000',
          RATE_LIMIT_AUTH_MAX: '100000',
          RATE_LIMIT_AUTH_WINDOW_MS: '60000',
          RATE_LIMIT_DRAW_MAX: '100000',
          RATE_LIMIT_DRAW_WINDOW_MS: '60000',
          RATE_LIMIT_FINANCE_MAX: '100000',
          RATE_LIMIT_FINANCE_WINDOW_MS: '60000',
        },
        healthUrl: `${backendBaseUrl}/health`,
      },
    );

    const sql = createSqlClient(database.databaseUrl);

    try {
      const seedApprovedTierOneKyc = async (userId: number) => {
        const now = new Date();
        await sql`
          with updated as (
            update kyc_profiles
            set current_tier = 'tier_1',
                requested_tier = null,
                status = 'approved',
                rejection_reason = null,
                freeze_record_id = null,
                reviewed_by_admin_id = null,
                submitted_at = ${now},
                reviewed_at = ${now},
                updated_at = ${now}
            where user_id = ${userId}
            returning id
          )
          insert into kyc_profiles (
            user_id,
            current_tier,
            status,
            submitted_at,
            reviewed_at,
            updated_at
          )
          select
            ${userId},
            'tier_1',
            'approved',
            ${now},
            ${now},
            ${now}
          where not exists (select 1 from updated)
        `;
      };

      const seedWithdrawableFunding = async (userId: number, amount: string) => {
        await sql`
          update user_wallets
          set withdrawable_balance = ${amount},
              locked_balance = '0.00',
              bonus_balance = '0.00',
              wagered_amount = '0.00',
              updated_at = now()
          where user_id = ${userId}
        `;

        await sql`
          insert into ledger_entries (
            user_id,
            type,
            amount,
            balance_before,
            balance_after,
            reference_type,
            metadata
          )
          values (
            ${userId},
            'deposit_credit',
            ${amount},
            '0.00',
            ${amount},
            'load_test_seed',
            jsonb_build_object('reason', 'load_test_seed')
          )
        `;
      };

      await sql`
        insert into prizes (
          name,
          stock,
          weight,
          pool_threshold,
          user_pool_threshold,
          reward_amount,
          payout_budget,
          payout_spent,
          payout_period_days,
          is_active
        )
        values (
          ${`Mutation Smoke Prize ${Date.now()}`},
          100000,
          100,
          '0.00',
          '0.00',
          '5.00',
          '0.00',
          '0.00',
          1,
          true
        )
      `;

      const emails = Array.from({ length: userCount }, (_, index) =>
        `mutation-load-${Date.now()}-${index}@example.com`,
      );

      await runWithConcurrency(emails, setupConcurrency, async (email) => {
        await postJson('/auth/register', {
          email,
          password,
          birthDate: TEST_BIRTH_DATE,
        });
      });

      await runWithConcurrency(emails, setupConcurrency, async (email) => {
        await sql`
          update users
          set email_verified_at = now()
          where email = ${email}
        `;
      });

      const sessions = await runWithConcurrency(
        emails,
        setupConcurrency,
        async (email) =>
          postJson<LoginResponse>('/auth/user/session', { email, password }),
      );

      await runWithConcurrency(sessions, setupConcurrency, async (session) => {
        await seedApprovedTierOneKyc(session.user.id);
        await seedWithdrawableFunding(session.user.id, '100000.00');
      });

      const drawRequests = Array.from({ length: drawsPerUser }, (_, drawIndex) =>
        sessions.map((session, sessionIndex) => ({
          body: {},
          label: `draw-user-${sessionIndex + 1}-attempt-${drawIndex + 1}`,
          method: 'POST' as const,
          path: '/draw',
          token: session.token,
        })),
      ).flat();

      const drawSummary = await runScenario(
        'draw',
        drawRequests,
        drawConcurrency,
      );

      const claimRequests = sessions.map((session, index) => ({
        body: { missionId: 'first_draw' },
        label: `claim-user-${index + 1}-first-draw`,
        method: 'POST' as const,
        path: '/rewards/claim',
        token: session.token,
      }));

      const claimSummary = await runScenario(
        'rewards_claim_first_draw',
        claimRequests,
        claimConcurrency,
      );

      const drawRows = await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from draw_records
        where user_id in ${sql(sessions.map((session) => session.user.id))}
      `;

      const claimRows = await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from (
          select user_id
          from ledger_entries
          where user_id in ${sql(sessions.map((session) => session.user.id))}
            and type = 'gamification_reward'

          union all

          select user_id
          from economy_ledger_entries
          where user_id in ${sql(sessions.map((session) => session.user.id))}
            and asset_code = 'B_LUCK'
            and entry_type = 'gamification_reward'
        ) reward_claim_entries
      `;

      const summaries = [drawSummary, claimSummary];

      console.log('\nMutation load summary');
      console.log(JSON.stringify(summaries, null, 2));
      console.log(
        `Recorded draw rows: ${drawRows[0]?.count ?? '0'} (expected ${drawSummary.successCount})`,
      );
      console.log(
        `Recorded reward claim ledger rows: ${claimRows[0]?.count ?? '0'} (expected ${claimSummary.successCount})`,
      );

      for (const summary of summaries) {
        if (summary.errors > 0 || summary.non2xx > 0) {
          throw new Error(
            `Mutation smoke test observed failures in ${summary.scenario}: ${JSON.stringify(
              summary.failureSamples,
            )}`,
          );
        }
      }

      if (Number(drawRows[0]?.count ?? 0) !== drawSummary.successCount) {
        throw new Error('Draw record count did not match successful draw requests.');
      }

      if (Number(claimRows[0]?.count ?? 0) !== claimSummary.successCount) {
        throw new Error(
          'Reward claim ledger count did not match successful reward claim requests.',
        );
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    await backend?.stop().catch(() => undefined);
    await database.stop();
  }
}

void main();
