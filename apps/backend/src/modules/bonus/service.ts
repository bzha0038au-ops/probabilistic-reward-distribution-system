import { API_ERROR_CODES } from '@reward/shared-types/api';
import type { AssetCode } from '@reward/shared-types/economy';

import { db } from '../../db';
import type { DbClient, DbTransaction } from '../../db';
import { conflictError } from '../../shared/errors';
import { creditAsset } from '../economy/service';

type DbExecutor = DbClient | DbTransaction;
const EARNED_ASSET_CODE: AssetCode = 'B_LUCK';

export async function grantBonus(
  payload: {
    userId: number;
    amount: string | number;
    entryType: string;
    referenceType?: string | null;
    referenceId?: number | null;
    metadata?: Record<string, unknown> | null;
  },
  executor: DbExecutor = db
) {
  return creditAsset(
    {
      userId: payload.userId,
      assetCode: EARNED_ASSET_CODE,
      amount: payload.amount,
      entryType: payload.entryType,
      referenceType: payload.referenceType ?? null,
      referenceId: payload.referenceId ?? null,
      audit: {
        sourceApp: 'backend.legacy_bonus',
        metadata: {
          ...(payload.metadata ?? {}),
          legacyBridge: 'grantBonus',
        },
      },
    },
    executor,
  );
}

export async function releaseBonusManual(payload: {
  userId: number;
  amount?: string | number | null;
}) {
  void payload;
  throw conflictError(
    'Legacy bonus release is disabled under the B luck economy model.',
    {
      code: API_ERROR_CODES.LEGACY_BONUS_RELEASE_DISABLED,
    },
  );
}
