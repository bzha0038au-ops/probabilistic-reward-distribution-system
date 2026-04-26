import autocannon from 'autocannon';

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
  const drawConnections = Number(process.env.LOAD_DRAW_CONNECTIONS ?? Math.max(4, Math.floor(connections / 2)));
  const drawDuration = Number(process.env.LOAD_DRAW_DURATION ?? Math.max(5, Math.floor(duration / 2)));

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

      await sql`
        update user_wallets
        set withdrawable_balance = '100000.00',
            locked_balance = '0.00',
            bonus_balance = '0.00',
            wagered_amount = '0.00',
            updated_at = now()
        where user_id = ${user.id}
      `;

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
        await runScenario({
          name: 'draw',
          url: `${backendBaseUrl}/draw`,
          method: 'POST',
          connections: drawConnections,
          duration: drawDuration,
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
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    await backend?.stop().catch(() => undefined);
    await database.stop();
  }
}

void main();
