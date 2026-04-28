import { ledgerEntries, userWallets } from '@reward/database';
import { sql } from '@reward/database/orm';

import type { DbClient, DbTransaction } from '../../db';
import { getConfig } from '../../shared/config';
import { internalInvariantError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { toDecimal, toMoneyString } from '../../shared/money';
import { readSqlRows } from '../../shared/sql-result';

type DbExecutor = DbClient | DbTransaction;

type WalletLedgerBalanceKind =
  | 'withdrawable'
  | 'bonus'
  | 'locked'
  | 'wagered'
  | 'total';

type WalletLedgerEntrySnapshot = {
  entryType: string;
  amount: string | number;
  metadata: unknown;
};

type WalletInvariantRow = {
  user_id: number;
  actual_withdrawable_balance: string | number;
  expected_withdrawable_balance: string | number;
  actual_bonus_balance: string | number;
  expected_bonus_balance: string | number;
  actual_locked_balance: string | number;
  expected_locked_balance: string | number;
  actual_wagered_amount: string | number;
  expected_wagered_amount: string | number;
  actual_total: string | number;
  expected_total: string | number;
  unknown_entry_types: string[] | null;
};

export type WalletInvariantMismatch = {
  userId: number;
  actualWithdrawableBalance: string;
  expectedWithdrawableBalance: string;
  actualBonusBalance: string;
  expectedBonusBalance: string;
  actualLockedBalance: string;
  expectedLockedBalance: string;
  actualWageredAmount: string;
  expectedWageredAmount: string;
  actualTotal: string;
  expectedTotal: string;
  unknownEntryTypes: string[];
};

const readDecimalLike = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? value : 0;

export const KNOWN_USER_LEDGER_ENTRY_TYPES = [
  'deposit_credit',
  'deposit_reversed',
  'draw_cost',
  'draw_reward',
  'bonus_release_auto',
  'bonus_release_manual',
  'gamification_reward',
  'withdraw_request',
  'withdraw_rejected_refund',
  'withdraw_reversed_refund',
  'withdraw_paid',
  'quick_eight_stake',
  'quick_eight_payout',
  'blackjack_stake',
  'blackjack_double_down',
  'blackjack_split',
  'blackjack_payout',
  'holdem_buy_in',
  'holdem_cash_out',
  'holdem_hand_result',
  'holdem_rake',
] as const;

const KNOWN_USER_LEDGER_ENTRY_TYPE_SET = new Set<string>(
  KNOWN_USER_LEDGER_ENTRY_TYPES
);

const WITHDRAWABLE_DIRECT_ENTRY_TYPES = [
  'deposit_credit',
  'deposit_reversed',
  'draw_cost',
  'withdraw_request',
  'withdraw_rejected_refund',
  'withdraw_reversed_refund',
  'quick_eight_stake',
  'quick_eight_payout',
  'blackjack_stake',
  'blackjack_double_down',
  'blackjack_split',
  'blackjack_payout',
  'holdem_buy_in',
  'holdem_cash_out',
] as const;

const BONUS_CREDIT_ENTRY_TYPES = ['draw_reward', 'gamification_reward'] as const;

const STAKE_ENTRY_TYPES = [
  'draw_cost',
  'quick_eight_stake',
  'blackjack_stake',
  'blackjack_double_down',
  'blackjack_split',
] as const;

const RELEASE_ENTRY_TYPES = ['bonus_release_auto', 'bonus_release_manual'] as const;

const REFUND_ENTRY_TYPES = [
  'withdraw_rejected_refund',
  'withdraw_reversed_refund',
] as const;

const toNumericLiteral = (entryTypes: readonly string[]) =>
  entryTypes.map((entryType) => sql`${entryType}`);

const normalizeUnknownEntryTypes = (value: string[] | null | undefined) =>
  (value ?? []).filter((entryType) => !KNOWN_USER_LEDGER_ENTRY_TYPE_SET.has(entryType));

const normalizeInvariantRow = (row: WalletInvariantRow): WalletInvariantMismatch => ({
  userId: row.user_id,
  actualWithdrawableBalance: toMoneyString(row.actual_withdrawable_balance ?? 0),
  expectedWithdrawableBalance: toMoneyString(row.expected_withdrawable_balance ?? 0),
  actualBonusBalance: toMoneyString(row.actual_bonus_balance ?? 0),
  expectedBonusBalance: toMoneyString(row.expected_bonus_balance ?? 0),
  actualLockedBalance: toMoneyString(row.actual_locked_balance ?? 0),
  expectedLockedBalance: toMoneyString(row.expected_locked_balance ?? 0),
  actualWageredAmount: toMoneyString(row.actual_wagered_amount ?? 0),
  expectedWageredAmount: toMoneyString(row.expected_wagered_amount ?? 0),
  actualTotal: toMoneyString(row.actual_total ?? 0),
  expectedTotal: toMoneyString(row.expected_total ?? 0),
  unknownEntryTypes: normalizeUnknownEntryTypes(row.unknown_entry_types),
});

const buildWalletInvariantMismatchDetail = (
  label: WalletLedgerBalanceKind,
  actual: string,
  expected: string
) => `${label}:${actual}->${expected}`;

const isStrictWalletInvariantMode = () => {
  const config = getConfig();
  if (config.nodeEnv !== 'production') {
    return true;
  }

  return config.observabilityEnvironment.toLowerCase().includes('staging');
};

const loadWalletInvariantRows = async (
  executor: DbExecutor,
  params: { userId?: number } = {}
) => {
  const { userId } = params;
  const candidateUsersCte =
    userId === undefined
      ? sql`
          SELECT ${userWallets.userId} AS user_id
          FROM ${userWallets}
          UNION
          SELECT ${ledgerEntries.userId} AS user_id
          FROM ${ledgerEntries}
          WHERE ${ledgerEntries.userId} IS NOT NULL
        `
      : sql`SELECT ${userId}::integer AS user_id`;

  const result = await executor.execute(sql`
    WITH candidate_users AS (
      ${candidateUsersCte}
    ),
    ledger_totals AS (
      SELECT
        le.user_id,
        COALESCE(
          SUM(
            CASE
              WHEN le.type IN (${sql.join(toNumericLiteral(WITHDRAWABLE_DIRECT_ENTRY_TYPES), sql`, `)})
                THEN le.amount
              WHEN le.type IN (${sql.join(toNumericLiteral(RELEASE_ENTRY_TYPES), sql`, `)})
                THEN le.amount
              ELSE 0
            END
          ),
          0
        )::numeric(14, 2) AS expected_withdrawable_balance,
        COALESCE(
          SUM(
            CASE
              WHEN le.type IN (${sql.join(toNumericLiteral(BONUS_CREDIT_ENTRY_TYPES), sql`, `)})
                THEN le.amount
              WHEN le.type IN (${sql.join(toNumericLiteral(RELEASE_ENTRY_TYPES), sql`, `)})
                THEN -le.amount
              ELSE 0
            END
          ),
          0
        )::numeric(14, 2) AS expected_bonus_balance,
        COALESCE(
          SUM(
            CASE
              WHEN le.type = 'withdraw_request'
                THEN -le.amount
              WHEN le.type IN (${sql.join(toNumericLiteral(REFUND_ENTRY_TYPES), sql`, `)})
                THEN -le.amount
              WHEN le.type = 'withdraw_paid'
                THEN le.amount
              WHEN le.type = 'holdem_buy_in'
                THEN -le.amount
              WHEN le.type IN ('holdem_cash_out', 'holdem_hand_result', 'holdem_rake')
                THEN le.amount
              ELSE 0
            END
          ),
          0
        )::numeric(14, 2) AS expected_locked_balance,
        COALESCE(
          SUM(
            CASE
              WHEN le.type IN (${sql.join(toNumericLiteral(STAKE_ENTRY_TYPES), sql`, `)})
                THEN -le.amount
              WHEN le.type = 'bonus_release_auto'
                THEN ROUND(
                  -1 * le.amount * COALESCE(NULLIF(le.metadata->>'unlockRatio', '')::numeric, 0),
                  2
                )
              ELSE 0
            END
          ),
          0
        )::numeric(14, 2) AS expected_wagered_amount,
        ARRAY_REMOVE(
          ARRAY_AGG(
            DISTINCT CASE
              WHEN le.type NOT IN (${sql.join(toNumericLiteral(KNOWN_USER_LEDGER_ENTRY_TYPES), sql`, `)})
                THEN le.type
              ELSE NULL
            END
          ),
          NULL
        ) AS unknown_entry_types
      FROM ${ledgerEntries} le
      WHERE le.user_id IS NOT NULL
        ${userId === undefined ? sql`` : sql`AND le.user_id = ${userId}`}
      GROUP BY le.user_id
    )
    SELECT
      cu.user_id,
      COALESCE(w.withdrawable_balance, 0)::numeric(14, 2) AS actual_withdrawable_balance,
      COALESCE(lt.expected_withdrawable_balance, 0)::numeric(14, 2) AS expected_withdrawable_balance,
      COALESCE(w.bonus_balance, 0)::numeric(14, 2) AS actual_bonus_balance,
      COALESCE(lt.expected_bonus_balance, 0)::numeric(14, 2) AS expected_bonus_balance,
      COALESCE(w.locked_balance, 0)::numeric(14, 2) AS actual_locked_balance,
      COALESCE(lt.expected_locked_balance, 0)::numeric(14, 2) AS expected_locked_balance,
      COALESCE(w.wagered_amount, 0)::numeric(14, 2) AS actual_wagered_amount,
      COALESCE(lt.expected_wagered_amount, 0)::numeric(14, 2) AS expected_wagered_amount,
      (
        COALESCE(w.withdrawable_balance, 0)
        + COALESCE(w.bonus_balance, 0)
        + COALESCE(w.locked_balance, 0)
        + COALESCE(w.wagered_amount, 0)
      )::numeric(14, 2) AS actual_total,
      (
        COALESCE(lt.expected_withdrawable_balance, 0)
        + COALESCE(lt.expected_bonus_balance, 0)
        + COALESCE(lt.expected_locked_balance, 0)
        + COALESCE(lt.expected_wagered_amount, 0)
      )::numeric(14, 2) AS expected_total,
      COALESCE(lt.unknown_entry_types, ARRAY[]::text[]) AS unknown_entry_types
    FROM candidate_users cu
    LEFT JOIN ${userWallets} w ON w.user_id = cu.user_id
    LEFT JOIN ledger_totals lt ON lt.user_id = cu.user_id
    WHERE cu.user_id IS NOT NULL
      AND (
        COALESCE(w.withdrawable_balance, 0)::numeric(14, 2) <> COALESCE(lt.expected_withdrawable_balance, 0)::numeric(14, 2)
        OR COALESCE(w.bonus_balance, 0)::numeric(14, 2) <> COALESCE(lt.expected_bonus_balance, 0)::numeric(14, 2)
        OR COALESCE(w.locked_balance, 0)::numeric(14, 2) <> COALESCE(lt.expected_locked_balance, 0)::numeric(14, 2)
        OR COALESCE(w.wagered_amount, 0)::numeric(14, 2) <> COALESCE(lt.expected_wagered_amount, 0)::numeric(14, 2)
        OR CARDINALITY(COALESCE(lt.unknown_entry_types, ARRAY[]::text[])) > 0
      )
    ORDER BY cu.user_id ASC
  `);

  return readSqlRows<WalletInvariantRow>(result).map(normalizeInvariantRow);
};

export const countWalletInvariantSubjects = async (executor: DbExecutor) => {
  const result = await executor.execute(sql`
    WITH candidate_users AS (
      SELECT ${userWallets.userId} AS user_id
      FROM ${userWallets}
      UNION
      SELECT ${ledgerEntries.userId} AS user_id
      FROM ${ledgerEntries}
      WHERE ${ledgerEntries.userId} IS NOT NULL
    )
    SELECT COUNT(*)::integer AS count
    FROM candidate_users
    WHERE user_id IS NOT NULL
  `);

  const [row] = readSqlRows<{ count: number }>(result);
  return Number(row?.count ?? 0);
};

export const deriveWalletLedgerEffects = (entry: WalletLedgerEntrySnapshot) => {
  const amount = toDecimal(entry.amount ?? 0);
  const metadata =
    typeof entry.metadata === 'object' && entry.metadata !== null
      ? (entry.metadata as Record<string, unknown>)
      : {};
  const unlockRatio = toDecimal(readDecimalLike(Reflect.get(metadata, 'unlockRatio')));

  switch (entry.entryType) {
    case 'deposit_credit':
    case 'deposit_reversed':
    case 'quick_eight_payout':
    case 'blackjack_payout':
      return {
        withdrawable: amount,
        bonus: toDecimal(0),
        locked: toDecimal(0),
        wagered: toDecimal(0),
      };
    case 'draw_cost':
    case 'quick_eight_stake':
    case 'blackjack_stake':
    case 'blackjack_double_down':
    case 'blackjack_split':
      return {
        withdrawable: amount,
        bonus: toDecimal(0),
        locked: toDecimal(0),
        wagered: amount.negated(),
      };
    case 'draw_reward':
    case 'gamification_reward':
      return {
        withdrawable: toDecimal(0),
        bonus: amount,
        locked: toDecimal(0),
        wagered: toDecimal(0),
      };
    case 'bonus_release_manual':
      return {
        withdrawable: amount,
        bonus: amount.negated(),
        locked: toDecimal(0),
        wagered: toDecimal(0),
      };
    case 'bonus_release_auto':
      return {
        withdrawable: amount,
        bonus: amount.negated(),
        locked: toDecimal(0),
        wagered: amount.mul(unlockRatio).negated().toDecimalPlaces(2),
      };
    case 'withdraw_request':
      return {
        withdrawable: amount,
        bonus: toDecimal(0),
        locked: amount.negated(),
        wagered: toDecimal(0),
      };
    case 'withdraw_rejected_refund':
    case 'withdraw_reversed_refund':
      return {
        withdrawable: amount,
        bonus: toDecimal(0),
        locked: amount.negated(),
        wagered: toDecimal(0),
      };
    case 'withdraw_paid':
      return {
        withdrawable: toDecimal(0),
        bonus: toDecimal(0),
        locked: amount,
        wagered: toDecimal(0),
      };
    default:
      return {
        withdrawable: toDecimal(0),
        bonus: toDecimal(0),
        locked: toDecimal(0),
        wagered: toDecimal(0),
      };
  }
};

export const listWalletInvariantMismatches = (executor: DbExecutor) =>
  loadWalletInvariantRows(executor);

export async function assertWalletLedgerInvariant(
  executor: DbExecutor,
  userId: number,
  context: {
    service: string;
    operation: string;
  }
) {
  const [mismatch] = await loadWalletInvariantRows(executor, { userId });
  if (!mismatch) {
    return;
  }

  const detailParts = [
    buildWalletInvariantMismatchDetail(
      'withdrawable',
      mismatch.actualWithdrawableBalance,
      mismatch.expectedWithdrawableBalance
    ),
    buildWalletInvariantMismatchDetail(
      'bonus',
      mismatch.actualBonusBalance,
      mismatch.expectedBonusBalance
    ),
    buildWalletInvariantMismatchDetail(
      'locked',
      mismatch.actualLockedBalance,
      mismatch.expectedLockedBalance
    ),
    buildWalletInvariantMismatchDetail(
      'wagered',
      mismatch.actualWageredAmount,
      mismatch.expectedWageredAmount
    ),
    buildWalletInvariantMismatchDetail(
      'total',
      mismatch.actualTotal,
      mismatch.expectedTotal
    ),
  ];

  if (mismatch.unknownEntryTypes.length > 0) {
    detailParts.push(`unknown:${mismatch.unknownEntryTypes.join(',')}`);
  }

  logger.error('wallet ledger invariant drift detected', {
    ...mismatch,
    service: context.service,
    operation: context.operation,
  });

  if (!isStrictWalletInvariantMode()) {
    return;
  }

  throw internalInvariantError('Wallet ledger invariant failed.', {
    details: detailParts,
  });
}
