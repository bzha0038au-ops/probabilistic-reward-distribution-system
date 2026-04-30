import type { FormEventHandler } from "react";

import type { SaasTenantBillingInsights } from "@reward/shared-types/saas";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PortalSelection } from "@/modules/portal/lib/portal";

import { formatDate, formatPlainPercent } from "./shared";

type CurrentBudgetPolicy =
  Exclude<
    NonNullable<PortalSelection["currentTenant"]>["billing"],
    null | undefined
  >["budgetPolicy"] | null;

type BillingPageProps = {
  billingCurrency: string;
  billingInsights: SaasTenantBillingInsights | null;
  currentBudgetPolicy: CurrentBudgetPolicy;
  currentTenant: PortalSelection["currentTenant"];
  currentTenantBillingDisputes: PortalSelection["currentTenantBillingDisputes"];
  currentTenantBillingRuns: PortalSelection["currentTenantBillingRuns"];
  currentTenantId: number | null;
  currentTenantTopUps: PortalSelection["currentTenantTopUps"];
  handleBillingRedirect: (path: string, successMessage: string) => void;
  handleCreateBillingDispute: FormEventHandler<HTMLFormElement>;
  handleUpdateBudgetPolicy: FormEventHandler<HTMLFormElement>;
  isPending: boolean;
};

const defaultBillingCapabilities = {
  billingRunSync: false,
  customerPortal: false,
  localManualCredits: false,
  paymentMethodSetup: false,
  stripeEnabled: false,
  topUpExternalSync: false,
};

const getTopUpStatusTone = (status: string) => {
  if (status === "applied" || status === "synced") {
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  }

  if (status === "failed") {
    return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const getTopUpSourceLabel = (source: string) =>
  source === "local_manual_credit"
    ? "Local manual credit"
    : "Stripe balance top-up";

export function PortalDashboardBillingPage({
  billingCurrency,
  billingInsights,
  currentBudgetPolicy,
  currentTenant,
  currentTenantBillingDisputes,
  currentTenantBillingRuns,
  currentTenantId,
  currentTenantTopUps,
  handleBillingRedirect,
  handleCreateBillingDispute,
  handleUpdateBudgetPolicy,
  isPending,
}: BillingPageProps) {
  const billingCapabilities =
    currentTenant?.billing?.providerCapabilities ?? defaultBillingCapabilities;
  const hasStripeBillingActions =
    billingCapabilities.customerPortal ||
    billingCapabilities.paymentMethodSetup;
  const budgetComposition =
    billingInsights && billingInsights.summary.effectiveBudgetAmount !== null
      ? `Budget ${billingInsights.summary.monthlyBudget ?? "0.00"} + credits ${billingInsights.summary.availableCreditAmount}`
      : null;

  return (
    <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="border-slate-200 bg-white/90">
        <CardHeader className="gap-2">
          <CardTitle>Billing, forecast, and invoices</CardTitle>
          <CardDescription>
            {billingCapabilities.localManualCredits
              ? "Inspect daily spend, local credit balance, and invoice history. Stripe payment actions are disabled in this environment, so extra spend capacity is applied as manual credits from the internal admin console."
              : "Open the Stripe customer portal, attach a payment method, inspect the daily spend curve, and compare trailing 7/30 day month-end projections before usage turns into an invoice surprise."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {currentTenant ? (
            <>
              <div className="grid gap-3">
                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-medium text-slate-900">
                    Billing profile
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {currentTenant.billing
                      ? `${currentTenant.billing.planCode} · ${currentTenant.billing.currency} · base ${currentTenant.billing.baseMonthlyFee} · draw ${currentTenant.billing.drawFee}`
                      : "No billing profile is attached to this tenant yet."}
                  </p>
                </div>

                {billingInsights ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Current month
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {billingInsights.summary.currentTotalAmount}{" "}
                        {billingCurrency}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Base {billingInsights.summary.baseMonthlyFee} + usage{" "}
                        {billingInsights.summary.currentUsageAmount}
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        7d forecast
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {
                          billingInsights.forecasts.trailing7d
                            .projectedTotalAmount
                        }{" "}
                        {billingCurrency}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Run rate{" "}
                        {billingInsights.forecasts.trailing7d.dailyRunRate}/day
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        30d forecast
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {
                          billingInsights.forecasts.trailing30d
                            .projectedTotalAmount
                        }{" "}
                        {billingCurrency}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Run rate{" "}
                        {billingInsights.forecasts.trailing30d.dailyRunRate}/day
                      </p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Budget state
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {billingInsights.summary.effectiveBudgetAmount
                          ? `${billingInsights.summary.remainingBudgetAmount} left`
                          : "No target"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {budgetComposition
                          ? `${budgetComposition} · threshold ${billingInsights.summary.budgetThresholdAmount ?? "not configured"}`
                          : `Threshold ${billingInsights.summary.budgetThresholdAmount ?? "not configured"}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Budget forecasting becomes available as soon as the tenant
                    has a billing profile and usage history.
                  </div>
                )}

                {hasStripeBillingActions ? (
                  <div className="flex flex-wrap gap-3">
                    {billingCapabilities.customerPortal ? (
                      <Button
                        type="button"
                        disabled={!currentTenantId || isPending}
                        onClick={() => {
                          handleBillingRedirect(
                            `/portal/saas/tenants/${currentTenantId}/billing/portal`,
                            "Opening Stripe customer portal…",
                          );
                        }}
                      >
                        Open billing portal
                      </Button>
                    ) : null}
                    {billingCapabilities.paymentMethodSetup ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!currentTenantId || isPending}
                        onClick={() => {
                          handleBillingRedirect(
                            `/portal/saas/tenants/${currentTenantId}/billing/setup-session`,
                            "Opening payment setup session…",
                          );
                        }}
                      >
                        Add payment method
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Stripe payment actions are disabled in this environment.
                    Manual credit adjustments from the admin console will show
                    up below and increase the available budget automatically.
                  </div>
                )}
              </div>

              {billingInsights ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Daily spend report
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Trailing 14 days. Forecasts extrapolate the current
                        month using trailing 7/30 day slope.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={cn(
                          "rounded-full",
                          billingInsights.alerts.thresholdExceeded
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        threshold{" "}
                        {billingInsights.alerts.thresholdExceeded
                          ? "hit"
                          : "clear"}
                      </Badge>
                      <Badge
                        className={cn(
                          "rounded-full",
                          billingInsights.alerts.forecast7dExceeded ||
                            billingInsights.alerts.forecast30dExceeded
                            ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        forecast{" "}
                        {billingInsights.alerts.forecast7dExceeded ||
                        billingInsights.alerts.forecast30dExceeded
                          ? "over budget"
                          : "within budget"}
                      </Badge>
                      <Badge
                        className={cn(
                          "rounded-full",
                          billingInsights.alerts.hardCapReached
                            ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        hard cap{" "}
                        {billingInsights.alerts.hardCapReached
                          ? "active"
                          : "idle"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {billingInsights.dailyReport
                      .slice()
                      .reverse()
                      .map((point) => (
                        <div
                          key={String(point.date)}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {formatDate(point.date)}
                          </p>
                          <p className="text-sm text-slate-600">
                            usage {point.usageAmount} {billingCurrency}
                          </p>
                          <p className="text-sm font-medium text-slate-900">
                            total {point.totalAmount} {billingCurrency}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                {currentTenantBillingRuns.length > 0 ? (
                  currentTenantBillingRuns.slice(0, 6).map((run) => (
                    <div
                      key={run.id}
                      className="rounded-3xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                            {run.status}
                          </Badge>
                          <span className="text-sm font-medium text-slate-900">
                            {run.totalAmount} {run.currency}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDate(run.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Base {run.baseFeeAmount} · usage {run.usageFeeAmount} ·
                        draws {run.drawCount}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm">
                        {run.stripeHostedInvoiceUrl ? (
                          <a
                            className="font-medium text-sky-700 underline-offset-4 hover:underline"
                            href={run.stripeHostedInvoiceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Hosted invoice
                          </a>
                        ) : null}
                        {run.stripeInvoicePdf ? (
                          <a
                            className="font-medium text-sky-700 underline-offset-4 hover:underline"
                            href={run.stripeInvoicePdf}
                            rel="noreferrer"
                            target="_blank"
                          >
                            PDF
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No invoice runs are visible for the selected tenant yet.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Select a tenant to open billing portal links and inspect recent
              invoice runs.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-slate-200 bg-slate-950 text-slate-100">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">Budget controls</CardTitle>
            <CardDescription className="text-slate-400">
              Configure the tenant budget target, alert threshold, webhook
              destination, and the hard cap that flips the engine into a
              non-billable throttle instead of letting the invoice keep
              climbing.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {currentTenant?.billing ? (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Plan", currentTenant.billing.planCode],
                    ["Collection", currentTenant.billing.collectionMethod],
                    [
                      "Auto billing",
                      currentTenant.billing.autoBillingEnabled
                        ? "enabled"
                        : "disabled",
                    ],
                    ["Currency", currentTenant.billing.currency],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-white/10 text-slate-100 hover:bg-white/10">
                      alert email{" "}
                      {currentBudgetPolicy?.alertEmailEnabled ? "on" : "off"}
                    </Badge>
                    <Badge className="rounded-full bg-white/10 text-slate-100 hover:bg-white/10">
                      webhook{" "}
                      {currentBudgetPolicy?.alertWebhookConfigured
                        ? "configured"
                        : "off"}
                    </Badge>
                    <Badge className="rounded-full bg-white/10 text-slate-100 hover:bg-white/10">
                      threshold{" "}
                      {formatPlainPercent(
                        currentBudgetPolicy?.alertThresholdPct,
                      )}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Budget target{" "}
                    {currentBudgetPolicy?.monthlyBudget
                      ? `${currentBudgetPolicy.monthlyBudget} ${billingCurrency}`
                      : "not configured"}
                    {" · "}Hard cap{" "}
                    {currentBudgetPolicy?.hardCap
                      ? `${currentBudgetPolicy.hardCap} ${billingCurrency}`
                      : "not configured"}
                    {currentBudgetPolicy?.state.hardCapReachedAt
                      ? ` · cap reached ${formatDate(
                          currentBudgetPolicy.state.hardCapReachedAt,
                        )}`
                      : ""}
                  </p>
                </div>

                <form
                  className="grid gap-4"
                  onSubmit={handleUpdateBudgetPolicy}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="monthlyBudget" className="text-slate-200">
                        Monthly budget target
                      </Label>
                      <Input
                        id="monthlyBudget"
                        name="monthlyBudget"
                        defaultValue={currentBudgetPolicy?.monthlyBudget ?? ""}
                        placeholder="1500.00"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="alertThresholdPct"
                        className="text-slate-200"
                      >
                        Alert threshold %
                      </Label>
                      <Input
                        id="alertThresholdPct"
                        name="alertThresholdPct"
                        defaultValue={
                          currentBudgetPolicy?.alertThresholdPct ?? ""
                        }
                        placeholder="80"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="hardCap" className="text-slate-200">
                        Hard cap
                      </Label>
                      <Input
                        id="hardCap"
                        name="hardCap"
                        defaultValue={currentBudgetPolicy?.hardCap ?? ""}
                        placeholder="1800.00"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="alertWebhookUrl"
                        className="text-slate-200"
                      >
                        Alert webhook URL
                      </Label>
                      <Input
                        id="alertWebhookUrl"
                        name="alertWebhookUrl"
                        defaultValue={
                          currentBudgetPolicy?.alertWebhookUrl ?? ""
                        }
                        placeholder="https://example.com/reward/billing-alert"
                        className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label
                      htmlFor="alertWebhookSecret"
                      className="text-slate-200"
                    >
                      Webhook secret
                    </Label>
                    <Input
                      id="alertWebhookSecret"
                      name="alertWebhookSecret"
                      type="password"
                      placeholder={
                        currentBudgetPolicy?.alertWebhookConfigured
                          ? "Leave blank to keep the existing secret"
                          : "Required when configuring a webhook"
                      }
                      className="border-white/15 bg-white/[0.06] text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="grid gap-3 text-sm text-slate-300">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        name="alertEmailEnabled"
                        defaultChecked={
                          currentBudgetPolicy?.alertEmailEnabled ?? true
                        }
                      />
                      Send alert emails to{" "}
                      {currentTenant.tenant.billingEmail ??
                        "the billing contact once set"}
                    </label>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" name="clearAlertWebhook" />
                      Remove the alert webhook and stored signing secret
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={isPending}>
                      Save budget policy
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No billing account is currently visible for this tenant.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>
              {billingCapabilities.localManualCredits
                ? "Credit adjustments"
                : "Top-ups"}
            </CardTitle>
            <CardDescription>
              Recent credit adjustments already present in the overview payload.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {currentTenantTopUps.length > 0 ? (
              currentTenantTopUps.slice(0, 6).map((topUp) => (
                <div
                  key={topUp.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {topUp.amount} {topUp.currency}
                    </p>
                    <Badge
                      className={cn(
                        "rounded-full",
                        getTopUpStatusTone(topUp.status),
                      )}
                    >
                      {topUp.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {getTopUpSourceLabel(topUp.source)} ·{" "}
                    {topUp.note || "No note"} · {formatDate(topUp.createdAt)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No top-up records are visible for the selected tenant yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Billing disputes</CardTitle>
            <CardDescription>
              Submit a formal invoice dispute tied to a specific billing run and
              track the resolution state from the tenant portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {currentTenant ? (
              <>
                <form
                  className="grid gap-4"
                  onSubmit={handleCreateBillingDispute}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="billingRunId">Invoice run</Label>
                    <select
                      id="billingRunId"
                      name="billingRunId"
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        Select an invoice run
                      </option>
                      {currentTenantBillingRuns.map((run) => (
                        <option key={run.id} value={run.id}>
                          #{run.id} · {run.totalAmount} {run.currency} ·{" "}
                          {run.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason</Label>
                    <select
                      id="reason"
                      name="reason"
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      defaultValue="invoice_amount"
                    >
                      <option value="invoice_amount">Invoice amount</option>
                      <option value="duplicate_charge">Duplicate charge</option>
                      <option value="service_quality">Service quality</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                    <div className="grid gap-2">
                      <Label htmlFor="summary">Summary</Label>
                      <Input
                        id="summary"
                        name="summary"
                        maxLength={160}
                        placeholder="Brief statement of the billing concern"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="requestedRefundAmount">
                        Requested refund
                      </Label>
                      <Input
                        id="requestedRefundAmount"
                        name="requestedRefundAmount"
                        placeholder="25.00"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">Detail</Label>
                    <textarea
                      id="description"
                      name="description"
                      className="min-h-28 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                      placeholder="Describe the invoice line, period, or service issue behind this dispute."
                      required
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={!currentTenantBillingRuns.length || isPending}
                    >
                      Submit dispute
                    </Button>
                  </div>
                </form>

                <div className="flex flex-col gap-3">
                  {currentTenantBillingDisputes.length > 0 ? (
                    currentTenantBillingDisputes.slice(0, 6).map((dispute) => (
                      <div
                        key={dispute.id}
                        className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                              {dispute.status}
                            </Badge>
                            <span className="text-sm font-medium text-slate-900">
                              {dispute.requestedRefundAmount} {dispute.currency}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {formatDate(dispute.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {dispute.summary}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Run #{dispute.billingRunId} ·{" "}
                          {dispute.reason.replaceAll("_", " ")}
                          {dispute.approvedRefundAmount
                            ? ` · approved ${dispute.approvedRefundAmount} ${dispute.currency}`
                            : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      No billing disputes have been submitted for this tenant
                      yet.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Select a tenant before submitting or reviewing billing disputes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
