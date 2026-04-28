import type { BreakGlassActionPolicies } from "$lib/break-glass"

export const saasActionPolicies = {
  acceptInvite: { requireBreakGlass: false },
  createTenant: { requireBreakGlass: false },
  createProject: { requireBreakGlass: false },
  assignMembership: { requireBreakGlass: false },
  deleteMembership: { requireBreakGlass: false },
  createInvite: { requireBreakGlass: false },
  revokeInvite: { requireBreakGlass: false },
  linkTenant: { requireBreakGlass: false },
  unlinkTenant: { requireBreakGlass: false },
  issueKey: { requireBreakGlass: false },
  issueHelloRewardSnippet: { requireBreakGlass: false },
  rotateKey: { requireBreakGlass: false },
  revokeKey: { requireBreakGlass: false },
  saveBilling: {
    requireBreakGlass: true,
    title: "Save tenant billing budget",
    description:
      "This changes live tenant billing and fee configuration. Confirm the tenant, pricing, collection mode, and billable flags before saving.",
    confirmLabel: "Save billing",
  },
  openBillingPortal: { requireBreakGlass: false },
  openBillingSetup: { requireBreakGlass: false },
  createPrize: { requireBreakGlass: false },
  updatePrize: { requireBreakGlass: false },
  deletePrize: { requireBreakGlass: false },
  createOutboundWebhook: { requireBreakGlass: false },
  updateOutboundWebhook: { requireBreakGlass: false },
  deleteOutboundWebhook: { requireBreakGlass: false },
  createBillingRun: { requireBreakGlass: false },
  syncBillingRun: { requireBreakGlass: false },
  refreshBillingRun: { requireBreakGlass: false },
  settleBillingRun: { requireBreakGlass: false },
  createTopUp: {
    requireBreakGlass: true,
    title: "Create tenant top-up",
    description:
      "This directly changes tenant budget balance. Re-check the tenant, amount, currency, and operator note before issuing the credit.",
    confirmLabel: "Create top-up",
  },
  syncTopUp: { requireBreakGlass: false },
} satisfies BreakGlassActionPolicies
