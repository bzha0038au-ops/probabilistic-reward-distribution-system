import { type DbTransaction } from '../../db';
import { resolvePayoutPolicy } from './payout-policy';
import { persistWinningOutcome } from './reward-persistence';
import type {
  DebitedDrawState,
  DrawConfigBundle,
  PreparedDrawSelection,
  ResolvedDrawOutcome,
} from './types';

export const resolveDrawOutcome = async (params: {
  tx: DbTransaction;
  userId: number;
  drawState: Pick<DebitedDrawState, 'drawCost' | 'userPoolAfterDebit'>;
  selectionState: PreparedDrawSelection;
  economy: DrawConfigBundle['economy'];
  poolSystem: DrawConfigBundle['poolSystem'];
  payoutControl: DrawConfigBundle['payoutControl'];
  now: Date;
}): Promise<ResolvedDrawOutcome> => {
  const {
    tx,
    userId,
    drawState,
    selectionState,
    economy,
    poolSystem,
    payoutControl,
    now,
  } = params;

  const decision = await resolvePayoutPolicy({
    tx,
    userId,
    selectionState,
    drawState,
    economy,
    poolSystem,
    payoutControl,
    now,
  });

  if (decision.terminal) {
    return decision.outcome;
  }

  return persistWinningOutcome({
    tx,
    userId,
    plan: decision.plan,
    userPoolAfterDebit: drawState.userPoolAfterDebit,
    now,
  });
};
