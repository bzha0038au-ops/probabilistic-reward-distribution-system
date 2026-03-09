import { type DbTransaction } from '../../db';
import { resolvePayoutPolicy } from './payout-policy';
import { persistWinningOutcome } from './reward-persistence';
import type {
  DebitedDrawState,
  DrawConfigBundle,
  DrawUserRow,
  PreparedDrawSelection,
  ResolvedDrawOutcome,
} from './types';

export const resolveDrawOutcome = async (params: {
  tx: DbTransaction;
  userId: number;
  user: DrawUserRow;
  drawState: Pick<DebitedDrawState, 'drawCost' | 'bonusBefore' | 'userPoolAfterDebit'>;
  selectionState: PreparedDrawSelection;
  economy: DrawConfigBundle['economy'];
  poolSystem: DrawConfigBundle['poolSystem'];
  payoutControl: DrawConfigBundle['payoutControl'];
  now: Date;
}): Promise<ResolvedDrawOutcome> => {
  const {
    tx,
    userId,
    user,
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
    user,
    plan: decision.plan,
    bonusBefore: drawState.bonusBefore,
    userPoolAfterDebit: drawState.userPoolAfterDebit,
    now,
  });
};
