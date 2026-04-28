import { describe, expect, it } from 'vitest';

import { toDecimal } from '../../shared/money';
import {
  LIVE_DEALER_TABLE_DEFINITION,
  TEXAS_HOLDEM_TABLE_DEFINITION,
  buildRoundSettlementPlan,
  defineTableDefinition,
  getInitialTablePhase,
  getNextTablePhase,
  resolveTableBuyIn,
  resolveTableCashOut,
} from './service';

describe('table engine helpers', () => {
  it('validates duplicate phase keys in table definitions', () => {
    expect(() =>
      defineTableDefinition({
        key: 'broken_table',
        gameType: 'broken_table',
        settlementModel: 'peer_to_peer',
        minSeats: 2,
        maxSeats: 6,
        timeBankMs: 10000,
        phases: [
          { key: 'lobby', usesTimeBank: false },
          { key: 'lobby', usesTimeBank: false },
        ],
      }),
    ).toThrow('Invalid table definition.');
  });

  it('resolves the configured phase order', () => {
    expect(getInitialTablePhase(TEXAS_HOLDEM_TABLE_DEFINITION)).toBe('lobby');
    expect(getNextTablePhase(TEXAS_HOLDEM_TABLE_DEFINITION, 'preflop')).toBe(
      'flop',
    );
    expect(getNextTablePhase(TEXAS_HOLDEM_TABLE_DEFINITION, 'settlement')).toBe(
      null,
    );
  });

  it('builds buy-in and cash-out wallet transitions', () => {
    const buyIn = resolveTableBuyIn({
      withdrawableBefore: toDecimal('125.00'),
      lockedBefore: toDecimal('10.00'),
      amount: toDecimal('25.00'),
    });
    expect(buyIn.withdrawableAfter.toFixed(2)).toBe('100.00');
    expect(buyIn.lockedAfter.toFixed(2)).toBe('35.00');

    const cashOut = resolveTableCashOut({
      withdrawableBefore: toDecimal('100.00'),
      lockedBefore: toDecimal('35.00'),
      amount: toDecimal('18.50'),
    });
    expect(cashOut.withdrawableAfter.toFixed(2)).toBe('118.50');
    expect(cashOut.lockedAfter.toFixed(2)).toBe('16.50');
  });

  it('keeps peer-to-peer settlements zero-sum', () => {
    const settlement = buildRoundSettlementPlan({
      settlementModel: TEXAS_HOLDEM_TABLE_DEFINITION.settlementModel,
      seatStates: [
        {
          seatId: 1,
          userId: 101,
          currentStackAmount: '50.00',
          resultingStackAmount: '80.00',
        },
        {
          seatId: 2,
          userId: 102,
          currentStackAmount: '50.00',
          resultingStackAmount: '20.00',
        },
      ],
    });

    expect(settlement.houseDelta.toFixed(2)).toBe('0.00');
    expect(settlement.seatPlans.map((seat) => seat.delta.toFixed(2))).toEqual([
      '30.00',
      '-30.00',
    ]);
  });

  it('computes house exposure for bankrolled settlements', () => {
    const settlement = buildRoundSettlementPlan({
      settlementModel: LIVE_DEALER_TABLE_DEFINITION.settlementModel,
      seatStates: [
        {
          seatId: 4,
          userId: 201,
          currentStackAmount: '10.00',
          resultingStackAmount: '18.00',
        },
      ],
    });

    expect(settlement.seatPlans[0]?.delta.toFixed(2)).toBe('8.00');
    expect(settlement.houseDelta.toFixed(2)).toBe('-8.00');
  });

  it('rejects peer-to-peer settlements that create value', () => {
    expect(() =>
      buildRoundSettlementPlan({
        settlementModel: TEXAS_HOLDEM_TABLE_DEFINITION.settlementModel,
        seatStates: [
          {
            seatId: 1,
            userId: 101,
            currentStackAmount: '10.00',
            resultingStackAmount: '20.00',
          },
        ],
      }),
    ).toThrow('Peer-to-peer round settlement must preserve the total locked seat stack.');
  });
});
