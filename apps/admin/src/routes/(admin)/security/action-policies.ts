import type { BreakGlassActionPolicies } from "$lib/break-glass"

export const securityActionPolicies = {
  releaseFreeze: { requireBreakGlass: false },
  createFreeze: {
    requireBreakGlass: true,
    title: "Freeze account",
    description:
      "Freezing an account blocks the user from normal access. Confirm the user id, reason, and incident context before continuing.",
    confirmLabel: "Freeze account",
  },
} satisfies BreakGlassActionPolicies
