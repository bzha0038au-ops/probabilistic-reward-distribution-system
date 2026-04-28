import autocannon from 'autocannon';
import { performance } from 'node:perf_hooks';

import {
  createBackendEnv,
  createSqlClient,
  findFreePort,
  startService,
  startTestDatabase,
  waitForNotificationPayload,
} from '../support/test-harness';

async function main() {
  const connections = Number(process.env.LOAD_CONNECTIONS ?? 20);
  const duration = Number(process.env.LOAD_DURATION ?? 10);
  const drawDuration = Number(process.env.LOAD_DRAW_DURATION ?? Math.max(5, Math.floor(duration / 2)));
  const drawRequestConcurrency = Number(process.env.LOAD_DRAW_REQUEST_CONCURRENCY ?? 1);
  const drawRequests = Number(
    process.env.LOAD_DRAW_REQUESTS ?? Math.max(drawDuration * 10, 20),
  );

  const database = await startTestDatabase('load');
  const backendPort = await findFreePort();
  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;

  let backend: Awaited<ReturnType<typeof startService>> | null = null;

  const postJson = async <T>(path: string, payload: unknown) => {
    const response = await fetch(`${backendBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
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

  const runScenario = async (payload: {
    name: string;
    url: string;
    method: 'GET' | 'POST';
    connections: number;
    duration: number;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    const result = await new Promise<autocannon.Result>((resolve, reject) => {
      const instance = autocannon(
        {
          url: payload.url,
          method: payload.method,
          connections: payload.connections,
          duration: payload.duration,
          headers: payload.headers,
          body: payload.body,
        },
        (error, summary) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(summary);
        },
      );

      autocannon.track(instance, {
        renderProgressBar: true,
        renderLatencyTable: true,
        renderResultsTable: true,
      });
    });

    return {
      scenario: payload.name,
      connections: payload.connections,
      durationSeconds: payload.duration,
      requestsPerSecondAvg: result.requests.average,
      requestsPerSecondP99: result.requests.p99,
      latencyP95Ms: result.latency.p95,
      latencyP99Ms: result.latency.p99,
      errors: result.errors,
      non2xx: result.non2xx,
      timeouts: result.timeouts,
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

  const runJsonPostScenario = async (payload: {
    name: string;
    path: string;
    connections: number;
    requestCount: number;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    const startedAt = performance.now();
    const requests = Array.from({ length: payload.requestCount }, (_, index) => index);

    const results = await runWithConcurrency(
      requests,
      payload.connections,
      async () => {
        const requestStartedAt = performance.now();

        try {
          const response = await fetch(`${backendBaseUrl}${payload.path}`, {
            method: 'POST',
            headers: payload.headers,
            body: payload.body,
          });
          const rawBody = await response.text();
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
            durationMs: performance.now() - requestStartedAt,
            ok: response.ok && apiOk,
            status: response.status,
          };
        } catch {
          return {
            durationMs: performance.now() - requestStartedAt,
            ok: false,
            status: null,
          };
        }
      },
    );

    const totalDurationMs = performance.now() - startedAt;
    const latencies = results.map((entry) => entry.durationMs);
    const non2xx = results.filter(
      (entry) => entry.status !== null && (entry.status < 200 || entry.status >= 300),
    ).length;
    const errors = results.filter((entry) => entry.status === null).length;

    return {
      scenario: payload.name,
      connections: payload.connections,
      durationSeconds: Number((totalDurationMs / 1000).toFixed(2)),
      requestCount: payload.requestCount,
      requestsPerSecondAvg:
        totalDurationMs > 0
          ? Number(((payload.requestCount * 1000) / totalDurationMs).toFixed(2))
          : 0,
      requestsPerSecondP99:
        totalDurationMs > 0
          ? Number(((payload.requestCount * 1000) / totalDurationMs).toFixed(2))
          : 0,
      latencyP95Ms: percentile(latencies, 0.95),
      latencyP99Ms: percentile(latencies, 0.99),
      errors,
      non2xx,
      timeouts: 0,
      successCount: results.filter((entry) => entry.ok).length,
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
          RATE_LIMIT_DRAW_MAX: '100000',
          RATE_LIMIT_DRAW_WINDOW_MS: '60000',
          RATE_LIMIT_FINANCE_MAX: '100000',
          RATE_LIMIT_FINANCE_WINDOW_MS: '60000',
        },
        healthUrl: `${backendBaseUrl}/health`,
      },
    );

    const email = `load-${Date.now()}@example.com`;
    const password = 'Password123!';

    await postJson('/auth/register', { email, password });

    const notification = await waitForNotificationPayload(database.databaseUrl, {
      kind: 'email_verification',
      recipient: email,
    });
    const verificationUrl = new URL(String(notification.verificationUrl ?? ''));
    const verificationToken = verificationUrl.searchParams.get('token');

    if (!verificationToken) {
      throw new Error('Missing email verification token in load-test setup.');
    }

    await postJson('/auth/email-verification/confirm', {
      token: verificationToken,
    });

    const session = await postJson<{
      token: string;
    }>('/auth/user/session', { email, password });

    const sql = createSqlClient(database.databaseUrl);
    try {
      const [user] = await sql<Array<{ id: number }>>`
        select id
        from users
        where email = ${email}
        limit 1
      `;
      if (!user) {
        throw new Error('Missing load-test user.');
      }

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

      await seedApprovedTierOneKyc(user.id);
      await seedWithdrawableFunding(user.id, '100000.00');

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
          ${`Load Smoke Prize ${Date.now()}`},
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

      const summaries = [
        await runScenario({
          name: 'wallet',
          url: `${backendBaseUrl}/wallet`,
          method: 'GET',
          connections,
          duration,
          headers: {
            authorization: `Bearer ${session.token}`,
          },
        }),
        await runJsonPostScenario({
          name: 'draw',
          path: '/draw',
          connections: drawRequestConcurrency,
          requestCount: drawRequests,
          headers: {
            authorization: `Bearer ${session.token}`,
            'content-type': 'application/json',
          },
          body: '{}',
        }),
      ];

      console.log('\nLoad summary');
      console.log(JSON.stringify(summaries, null, 2));

      for (const summary of summaries) {
        if (summary.errors > 0 || summary.non2xx > 0 || summary.timeouts > 0) {
          throw new Error(
            `Load smoke test observed request failures in ${summary.scenario}.`,
          );
        }
      }

      const rows = await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from auth_events
        where email = ${email}
          and event_type = 'user_login_success'
      `;
      console.log(`Recorded login success events: ${rows[0]?.count ?? '0'}`);

      const drawRows = await sql<Array<{ count: string }>>`
        select count(*)::text as count
        from draw_records
        where user_id = ${user.id}
      `;
      console.log(`Recorded draw rows: ${drawRows[0]?.count ?? '0'}`);

      const drawSummary = summaries.find(
        (summary) => summary.scenario === 'draw',
      );
      if (Number(drawRows[0]?.count ?? 0) !== Number(drawSummary?.successCount ?? 0)) {
        throw new Error('Draw record count did not match successful draw requests.');
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
