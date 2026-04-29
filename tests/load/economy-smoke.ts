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

type LoginResponse = {
  token: string;
  user: {
    id: number;
    email: string;
  };
};

type ScenarioResult = {
  errors: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  non2xx: number;
  requestCount?: number;
  requestsPerSecondAvg: number;
  scenario: string;
  successCount?: number;
  totalDurationMs?: number;
};

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
  const readConnections = Number(process.env.LOAD_ECONOMY_READ_CONNECTIONS ?? 15);
  const readDuration = Number(process.env.LOAD_ECONOMY_READ_DURATION ?? 8);
  const giftConcurrency = Number(process.env.LOAD_ECONOMY_GIFT_CONCURRENCY ?? 5);
  const giftRequests = Number(process.env.LOAD_ECONOMY_GIFT_REQUESTS ?? 40);

  const database = await startTestDatabase('load-economy');
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

  const runReadScenario = async (payload: {
    name: string;
    path: string;
    headers: Record<string, string>;
  }): Promise<ScenarioResult> => {
    const result = await new Promise<autocannon.Result>((resolve, reject) => {
      const instance = autocannon(
        {
          url: `${backendBaseUrl}${payload.path}`,
          method: 'GET',
          connections: readConnections,
          duration: readDuration,
          headers: payload.headers,
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
      requestsPerSecondAvg: result.requests.average,
      latencyP50Ms: result.latency.p50,
      latencyP95Ms: result.latency.p95,
      latencyP99Ms: result.latency.p99,
      errors: result.errors,
      non2xx: result.non2xx,
    };
  };

  const runGiftMutationScenario = async (payload: {
    senderToken: string;
    receiverUserId: number;
  }): Promise<ScenarioResult> => {
    const startedAt = performance.now();
    const requestIndexes = Array.from({ length: giftRequests }, (_, index) => index);
    let nextIndex = 0;

    const runWorker = async () => {
      const results: Array<{
        durationMs: number;
        ok: boolean;
        status: number | null;
      }> = [];

      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= requestIndexes.length) {
          return results;
        }

        const requestStartedAt = performance.now();

        try {
          const response = await fetch(`${backendBaseUrl}/gifts`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${payload.senderToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              receiverUserId: payload.receiverUserId,
              amount: '1.00',
              idempotencyKey: `load-gift:${currentIndex}:${Date.now()}`,
            }),
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

          results.push({
            durationMs: performance.now() - requestStartedAt,
            ok: response.ok && apiOk,
            status: response.status,
          });
        } catch {
          results.push({
            durationMs: performance.now() - requestStartedAt,
            ok: false,
            status: null,
          });
        }
      }
    };

    const allResults = (await Promise.all(
      Array.from(
        { length: Math.max(1, Math.min(giftConcurrency, giftRequests)) },
        () => runWorker(),
      ),
    )).flat();
    const totalDurationMs = performance.now() - startedAt;
    const latencies = allResults.map((entry) => entry.durationMs);
    const non2xx = allResults.filter(
      (entry) => entry.status !== null && (entry.status < 200 || entry.status >= 300),
    ).length;
    const errors = allResults.filter((entry) => entry.status === null).length;
    const successCount = allResults.filter((entry) => entry.ok).length;

    return {
      scenario: 'gift-send-mutations',
      requestsPerSecondAvg:
        totalDurationMs > 0
          ? Number(((giftRequests * 1000) / totalDurationMs).toFixed(2))
          : 0,
      latencyP50Ms: percentile(latencies, 0.5),
      latencyP95Ms: percentile(latencies, 0.95),
      latencyP99Ms: percentile(latencies, 0.99),
      errors,
      non2xx,
      requestCount: giftRequests,
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
      const senderEmail = `economy-load-sender-${Date.now()}@example.com`;
      const receiverEmail = `economy-load-receiver-${Date.now()}@example.com`;
      const password = 'Password123!';

      await postJson('/auth/register', {
        email: senderEmail,
        password,
        birthDate: TEST_BIRTH_DATE,
      });
      await postJson('/auth/register', {
        email: receiverEmail,
        password,
        birthDate: TEST_BIRTH_DATE,
      });

      for (const email of [senderEmail, receiverEmail]) {
        const notification = await waitForNotificationPayload(database.databaseUrl, {
          kind: 'email_verification',
          recipient: email,
        });
        const verificationUrl = new URL(String(notification.verificationUrl ?? ''));
        const verificationToken = verificationUrl.searchParams.get('token');

        if (!verificationToken) {
          throw new Error(`Verification token missing for ${email}.`);
        }

        await postJson('/auth/email-verification/confirm', {
          token: verificationToken,
        });
      }

      const senderSession = await postJson<LoginResponse>('/auth/user/session', {
        email: senderEmail,
        password,
      });
      const receiverSession = await postJson<LoginResponse>('/auth/user/session', {
        email: receiverEmail,
        password,
      });

      await sql`
        insert into user_asset_balances (
          user_id,
          asset_code,
          available_balance,
          locked_balance,
          lifetime_earned,
          lifetime_spent
        )
        values
          (${senderSession.user.id}, 'B_LUCK', '500.00', '0.00', '500.00', '0.00'),
          (${senderSession.user.id}, 'IAP_VOUCHER', '0.00', '0.00', '0.00', '0.00'),
          (${receiverSession.user.id}, 'B_LUCK', '0.00', '0.00', '0.00', '0.00'),
          (${receiverSession.user.id}, 'IAP_VOUCHER', '0.00', '0.00', '0.00', '0.00')
        on conflict (user_id, asset_code)
        do update
        set
          available_balance = excluded.available_balance,
          locked_balance = excluded.locked_balance,
          lifetime_earned = excluded.lifetime_earned,
          lifetime_spent = excluded.lifetime_spent,
          updated_at = now()
      `;

      await sql`
        insert into gift_energy_accounts (
          user_id,
          current_energy,
          max_energy,
          refill_policy,
          last_refill_at
        )
        values (
          ${senderSession.user.id},
          500,
          500,
          ${{
            type: 'daily_reset',
            intervalHours: 24,
            refillAmount: 500,
          }},
          now()
        )
        on conflict (user_id)
        do update
        set
          current_energy = excluded.current_energy,
          max_energy = excluded.max_energy,
          refill_policy = excluded.refill_policy,
          last_refill_at = excluded.last_refill_at,
          updated_at = now()
      `;

      await sql`
        with seeded_product as (
          insert into iap_products (
            sku,
            store_channel,
            delivery_type,
            asset_code,
            asset_amount,
            delivery_content,
            is_active,
            metadata
          )
          values (
            'reward.ios.gift-pack.rose',
            'ios',
            'gift_pack',
            null,
            null,
            '{}'::jsonb,
            true,
            ${{
              seedSource: 'economy_load_smoke',
              title: 'Rose gift pack',
            }}
          )
          on conflict (sku, store_channel)
          do update
          set
            is_active = true,
            metadata = excluded.metadata,
            updated_at = now()
          returning id
        )
        insert into gift_pack_catalog (
          code,
          iap_product_id,
          reward_asset_code,
          reward_amount,
          delivery_content,
          is_active,
          metadata
        )
        select
          'rose_small_ios',
          id,
          'B_LUCK',
          '18.00',
          '{}'::jsonb,
          true,
          ${{
            seedSource: 'economy_load_smoke',
          }}
        from seeded_product
        on conflict (code)
        do update
        set
          iap_product_id = excluded.iap_product_id,
          reward_asset_code = excluded.reward_asset_code,
          reward_amount = excluded.reward_amount,
          is_active = true,
          metadata = excluded.metadata,
          updated_at = now()
      `;

      const authHeaders = {
        authorization: `Bearer ${senderSession.token}`,
      };

      const results = await Promise.all([
        runReadScenario({
          name: 'wallet-read',
          path: '/wallet',
          headers: authHeaders,
        }),
        runReadScenario({
          name: 'gift-energy-read',
          path: '/gift-energy',
          headers: authHeaders,
        }),
        runReadScenario({
          name: 'economy-ledger-read',
          path: '/economy/ledger?limit=20',
          headers: authHeaders,
        }),
        runReadScenario({
          name: 'gifts-read',
          path: '/gifts?limit=20',
          headers: authHeaders,
        }),
        runReadScenario({
          name: 'gift-pack-catalog-read',
          path: '/gift-packs/catalog',
          headers: authHeaders,
        }),
      ]);

      const giftMutationResult = await runGiftMutationScenario({
        senderToken: senderSession.token,
        receiverUserId: receiverSession.user.id,
      });

      const [senderBalanceRow] = await sql<Array<{ available_balance: string }>>`
        select available_balance
        from user_asset_balances
        where user_id = ${senderSession.user.id}
          and asset_code = 'B_LUCK'
        limit 1
      `;
      const [receiverBalanceRow] = await sql<Array<{ available_balance: string }>>`
        select available_balance
        from user_asset_balances
        where user_id = ${receiverSession.user.id}
          and asset_code = 'B_LUCK'
        limit 1
      `;
      const [giftCountRow] = await sql<Array<{ count: number }>>`
        select count(*)::int as count
        from gift_transfers
        where sender_user_id = ${senderSession.user.id}
          and receiver_user_id = ${receiverSession.user.id}
      `;

      console.log(
        JSON.stringify(
          {
            results: [...results, giftMutationResult],
            balances: {
              senderBLuck: senderBalanceRow?.available_balance ?? null,
              receiverBLuck: receiverBalanceRow?.available_balance ?? null,
            },
            giftsCreated: giftCountRow?.count ?? 0,
          },
          null,
          2,
        ),
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    await backend?.stop().catch(() => undefined);
    await database.stop().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
