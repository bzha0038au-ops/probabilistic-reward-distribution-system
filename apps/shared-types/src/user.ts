import { z } from 'zod';
import { WalletAssetBalanceRecordSchema } from './economy';

export const WalletBalanceSchema = z.object({
  withdrawableBalance: z.string(),
  bonusBalance: z.string(),
  lockedBalance: z.string(),
  totalBalance: z.string(),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

export const LegacyWalletBalanceSchema = WalletBalanceSchema;
export type LegacyWalletBalance = z.infer<typeof LegacyWalletBalanceSchema>;

export const WalletBalanceResponseSchema = z.object({
  balance: WalletBalanceSchema,
  assets: z.array(WalletAssetBalanceRecordSchema),
  legacy: LegacyWalletBalanceSchema,
});

export type WalletBalanceResponse = z.infer<typeof WalletBalanceResponseSchema>;
export const WalletResponseSchema = WalletBalanceResponseSchema;
export type WalletResponse = WalletBalanceResponse;
