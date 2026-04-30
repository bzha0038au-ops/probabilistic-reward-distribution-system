import type { AssetCode } from "@reward/shared-types/economy";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

export const readWalletTotalBalance = (
  wallet: WalletBalanceResponse | null | undefined,
  fallback = "0",
) => wallet?.balance.totalBalance ?? wallet?.legacy.totalBalance ?? fallback;

export const readWalletAssetAvailableBalance = (
  wallet: WalletBalanceResponse | null | undefined,
  assetCode: AssetCode,
  fallback = "0",
) =>
  wallet?.assets.find((asset) => asset.assetCode === assetCode)
    ?.availableBalance ?? fallback;

export const readBluckAvailableBalance = (
  wallet: WalletBalanceResponse | null | undefined,
) =>
  readWalletAssetAvailableBalance(
    wallet,
    "B_LUCK",
    readWalletTotalBalance(wallet),
  );
