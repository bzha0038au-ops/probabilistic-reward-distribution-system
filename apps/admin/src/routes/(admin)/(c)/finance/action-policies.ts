import type { BreakGlassActionPolicies } from "$lib/break-glass"

export const financeActionPolicies = {
  createCryptoDepositChannel: { requireBreakGlass: false },
  markDepositProviderPending: { requireBreakGlass: false },
  markDepositProviderSucceeded: { requireBreakGlass: false },
  creditDeposit: { requireBreakGlass: false },
  markDepositProviderFailed: { requireBreakGlass: false },
  reverseDeposit: { requireBreakGlass: false },
  confirmCryptoDeposit: { requireBreakGlass: false },
  rejectCryptoDeposit: { requireBreakGlass: false },
  approveWithdrawal: {
    requireBreakGlass: true,
    title: "Approve withdrawal",
    description:
      "This advances a requested withdrawal into the approval path. Re-check the user, amount, operator note, and downstream settlement plan before continuing.",
    confirmLabel: "Approve withdrawal",
  },
  rejectWithdrawal: { requireBreakGlass: false },
  markWithdrawalProviderSubmitted: { requireBreakGlass: false },
  markWithdrawalProviderProcessing: { requireBreakGlass: false },
  markWithdrawalProviderFailed: { requireBreakGlass: false },
  payWithdrawal: { requireBreakGlass: false },
  reverseWithdrawal: { requireBreakGlass: false },
  submitCryptoWithdrawal: { requireBreakGlass: false },
  confirmCryptoWithdrawal: { requireBreakGlass: false },
} satisfies BreakGlassActionPolicies
