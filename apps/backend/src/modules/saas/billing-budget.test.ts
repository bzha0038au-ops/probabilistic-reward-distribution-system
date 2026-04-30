import { describe, expect, it } from 'vitest';

import { buildSaasTenantBillingInsights } from './billing-budget-service';
import {
  applySaasBillingBudgetPolicyPatch,
  isSaasBillingHardCapActive,
  markSaasBillingHardCapReached,
  readSaasBillingBudgetPolicy,
  redactBillingMetadata,
} from './billing-budget';

const makeUsageRows = (
  startDay: number,
  endDay: number,
  usageAmount: string,
) =>
  Array.from({ length: endDay - startDay + 1 }, (_, index) => ({
    usageDate: new Date(Date.UTC(2026, 3, startDay + index, 0, 0, 0, 0)),
    usageAmount,
  }));

describe('saas billing budget helpers', () => {
  it('normalizes budget policy money fields and redacts webhook secrets', () => {
    const metadata = applySaasBillingBudgetPolicyPatch(null, {
      monthlyBudget: 120,
      alertThresholdPct: 85,
      hardCap: '150.5',
      alertEmailEnabled: false,
      alertWebhookUrl: 'https://example.com/hooks/billing',
      alertWebhookSecret: 'super-secret-token',
      clearAlertWebhook: false,
    });

    expect(readSaasBillingBudgetPolicy(metadata)).toMatchObject({
      monthlyBudget: '120.00',
      alertThresholdPct: 85,
      hardCap: '150.50',
      alertEmailEnabled: false,
      alertWebhookUrl: 'https://example.com/hooks/billing',
      alertWebhookConfigured: true,
    });

    expect(redactBillingMetadata(metadata)).toEqual({
      budgetPolicy: {
        monthlyBudget: '120.00',
        alertThresholdPct: 85,
        hardCap: '150.50',
        alertEmailEnabled: false,
        alertWebhookUrl: 'https://example.com/hooks/billing',
      },
      budgetState: {
        month: null,
        thresholdAlertedAt: null,
        forecast7dAlertedAt: null,
        forecast30dAlertedAt: null,
        hardCapReachedAt: null,
        hardCapAlertedAt: null,
      },
    });

    const cleared = applySaasBillingBudgetPolicyPatch(metadata, {
      clearAlertWebhook: true,
    });

    expect(readSaasBillingBudgetPolicy(cleared)).toMatchObject({
      alertWebhookUrl: null,
      alertWebhookConfigured: false,
    });
  });

  it('keeps hard-cap state active only for the current billing month', () => {
    const metadata = applySaasBillingBudgetPolicyPatch(null, {
      hardCap: '150.00',
    });

    const reached = markSaasBillingHardCapReached(
      metadata,
      new Date('2026-04-18T08:30:00.000Z'),
    );

    expect(
      isSaasBillingHardCapActive(
        reached,
        new Date('2026-04-25T00:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isSaasBillingHardCapActive(
        reached,
        new Date('2026-05-01T00:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('builds daily billing reports and 7d/30d month-end forecasts from live usage history', () => {
    const insights = buildSaasTenantBillingInsights({
      tenantId: 42,
      currency: 'USD',
      baseMonthlyFee: '100.00',
      metadata: {
        budgetPolicy: {
          monthlyBudget: '130.00',
          alertThresholdPct: 80,
          hardCap: '150.00',
          alertEmailEnabled: true,
        },
      },
      usageRows: makeUsageRows(1, 10, '2.00'),
      now: new Date('2026-04-10T12:00:00.000Z'),
    });

    expect(insights.summary).toMatchObject({
      availableCreditAmount: '0.00',
      baseMonthlyFee: '100.00',
      effectiveBudgetAmount: '130.00',
      currentUsageAmount: '20.00',
      currentTotalAmount: '120.00',
      trailing7dUsageAmount: '14.00',
      trailing30dUsageAmount: '20.00',
      monthlyBudget: '130.00',
      budgetThresholdAmount: '104.00',
      hardCap: '150.00',
      remainingBudgetAmount: '10.00',
      remainingHardCapAmount: '30.00',
      thresholdBreached: true,
      hardCapReached: false,
    });

    expect(insights.forecasts.trailing7d).toMatchObject({
      trailingDays: 7,
      dailyRunRate: '2.00',
      projectedUsageAmount: '60.00',
      projectedTotalAmount: '160.00',
      exceedsBudget: true,
    });
    expect(insights.forecasts.trailing30d).toMatchObject({
      trailingDays: 30,
      dailyRunRate: '0.67',
      projectedUsageAmount: '33.33',
      projectedTotalAmount: '133.33',
      exceedsBudget: true,
    });
    expect(insights.alerts).toEqual({
      thresholdExceeded: true,
      forecast7dExceeded: true,
      forecast30dExceeded: true,
      hardCapReached: false,
    });

    const aprilFirst = insights.dailyReport.find(
      (point) => new Date(point.date).toISOString().slice(0, 10) === '2026-04-01',
    );

    expect(insights.dailyReport).toHaveLength(14);
    expect(aprilFirst).toMatchObject({
      usageAmount: '2.00',
      totalAmount: '102.00',
    });
  });

  it('extends the effective budget with available credits and reduces remaining budget after credit consumption', () => {
    const insights = buildSaasTenantBillingInsights({
      tenantId: 42,
      currency: 'USD',
      baseMonthlyFee: '0.00',
      metadata: {
        budgetPolicy: {
          monthlyBudget: '1500.00',
          alertThresholdPct: 80,
          hardCap: '1800.00',
          alertEmailEnabled: true,
        },
      },
      availableCreditAmount: '300.00',
      usageRows: makeUsageRows(1, 2, '110.00'),
      now: new Date('2026-04-02T12:00:00.000Z'),
    });

    expect(insights.summary).toMatchObject({
      availableCreditAmount: '300.00',
      currentTotalAmount: '220.00',
      effectiveBudgetAmount: '1800.00',
      monthlyBudget: '1500.00',
      budgetThresholdAmount: '1440.00',
      remainingBudgetAmount: '1580.00',
      remainingHardCapAmount: '1580.00',
    });

    expect(insights.forecasts.trailing7d.exceedsBudget).toBe(false);
    expect(insights.forecasts.trailing30d.exceedsBudget).toBe(false);
  });
});
