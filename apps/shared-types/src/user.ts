import { z } from 'zod';

export const WalletBalanceResponseSchema = z.object({
  balance: z.string(),
});

export type WalletBalanceResponse = z.infer<typeof WalletBalanceResponseSchema>;
