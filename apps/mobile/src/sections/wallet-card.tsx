import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  assetCodeValues,
  type AssetCode,
  type EconomyLedgerEntryRecord,
  type GiftEnergyAccountRecord,
  type GiftTransferRecord,
} from "@reward/shared-types/economy";
import type {
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  DepositRecord,
  WithdrawalRecord,
} from "@reward/shared-types/finance";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

import type {
  MobileGiftPackCatalogItem,
  MobileIapCatalogItem,
} from "../hooks/use-iap";
import type { MobileWalletCopy } from "../mobile-copy";
import type { MobileStyles } from "../screens/types";
import {
  mobileChromeTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";
import { WalletAssetCard, WalletHistoryEntryCard } from "./domain-ui";
import { ActionButton, Field, SectionCard } from "../ui";
import { PaymentsOperationsSection } from "./payments-operations-section";

type WalletCardProps = {
  styles: MobileStyles;
  copy: MobileWalletCopy;
  formattedBalance: string;
  wallet: WalletBalanceResponse | null;
  refreshingBalance: boolean;
  giftEnergy: GiftEnergyAccountRecord | null;
  giftTransfers: GiftTransferRecord[];
  ledgerEntries: EconomyLedgerEntryRecord[];
  loadingEconomy: boolean;
  sendingGift: boolean;
  loadingIapProducts: boolean;
  purchasingSku: string | null;
  syncingPendingPurchases: boolean;
  iapProducts: MobileIapCatalogItem[];
  giftPackProducts: MobileGiftPackCatalogItem[];
  supportedIap: boolean;
  connectedStore: boolean;
  bankCards: BankCardRecord[];
  cryptoChannels: CryptoDepositChannelRecord[];
  cryptoAddresses: CryptoWithdrawAddressViewRecord[];
  topUps: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  loadingPayments: boolean;
  activePaymentAction: string | null;
  formatAmount: (value: string) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  onRefreshBalance: () => void;
  onRefreshEconomy: () => void;
  onRefreshIapProducts: () => void;
  onSyncPendingPurchases: () => void;
  onRefreshPayments: () => void;
  onSendGift: (receiverUserId: number, amount: string) => Promise<boolean>;
  onPurchaseVoucher: (sku: string) => void | Promise<boolean>;
  onPurchaseGiftPack: (
    sku: string,
    recipientUserId: number,
  ) => void | Promise<boolean>;
  onCreateTopUp: (payload: {
    amount: string;
    referenceId?: string | null;
  }) => Promise<boolean>;
  onCreateCryptoDeposit: (payload: {
    channelId: number;
    amountClaimed: string;
    txHash: string;
    fromAddress?: string | null;
  }) => Promise<boolean>;
  onCreateBankCard: (payload: {
    cardholderName: string;
    bankName?: string | null;
    brand?: string | null;
    last4?: string | null;
    isDefault?: boolean;
  }) => Promise<boolean>;
  onSetDefaultBankCard: (bankCardId: number) => Promise<boolean>;
  onCreateWithdrawal: (payload: {
    amount: string;
    bankCardId?: number | null;
  }) => Promise<boolean>;
  onCreateCryptoWithdrawAddress: (payload: {
    chain?: string | null;
    network?: string | null;
    token?: string | null;
    address: string;
    label?: string | null;
    isDefault?: boolean;
  }) => Promise<boolean>;
  onSetDefaultCryptoAddress: (payoutMethodId: number) => Promise<boolean>;
  onCreateCryptoWithdrawal: (payload: {
    amount: string;
    payoutMethodId?: number | null;
  }) => Promise<boolean>;
};

export function WalletCard(props: WalletCardProps) {
  const [giftReceiverUserId, setGiftReceiverUserId] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftPackRecipientUserId, setGiftPackRecipientUserId] = useState("");

  const assets = assetCodeValues.map((assetCode) => {
    const record =
      props.wallet?.assets.find((entry) => entry.assetCode === assetCode) ??
      null;

    return {
      assetCode,
      availableBalance: record?.availableBalance ?? "0.00",
      lockedBalance: record?.lockedBalance ?? "0.00",
    };
  });

  const renderAssetLabel = (assetCode: AssetCode) =>
    props.copy.assetLabels[assetCode];
  const bonusAsset =
    assets.find((asset) => asset.assetCode === "B_LUCK") ?? assets[0] ?? null;
  const voucherAsset =
    assets.find((asset) => asset.assetCode === "IAP_VOUCHER") ?? null;
  const giftEnergyRatio =
    props.giftEnergy && props.giftEnergy.maxEnergy > 0
      ? Math.max(
          0,
          Math.min(1, props.giftEnergy.currentEnergy / props.giftEnergy.maxEnergy),
        )
      : 0;

  const parsedGiftReceiverUserId = Number(giftReceiverUserId);
  const parsedGiftPackRecipientUserId = Number(giftPackRecipientUserId);
  const canSendGift =
    Number.isInteger(parsedGiftReceiverUserId) &&
    parsedGiftReceiverUserId > 0 &&
    giftAmount.trim() !== "" &&
    !props.sendingGift;
  const canPurchaseGiftPack =
    Number.isInteger(parsedGiftPackRecipientUserId) &&
    parsedGiftPackRecipientUserId > 0;

  const giftHistory = useMemo(
    () => props.giftTransfers.slice(0, 6),
    [props.giftTransfers],
  );
  const ledgerEntries = useMemo(
    () => props.ledgerEntries.slice(0, 8),
    [props.ledgerEntries],
  );
  const renderLedgerLabel = (entry: EconomyLedgerEntryRecord) => {
    if (
      entry.entryType.includes("refund") ||
      entry.entryType.includes("revoke") ||
      entry.entryType.includes("reversal")
    ) {
      return props.copy.ledgerLabels.refundRollback;
    }
    if (entry.entryType.includes("gift_send")) {
      return props.copy.ledgerLabels.giftSent;
    }
    if (
      entry.entryType.includes("gift_receive") ||
      entry.entryType.includes("gift_pack")
    ) {
      return props.copy.ledgerLabels.giftReceived;
    }
    if (entry.entryType.includes("purchase")) {
      return props.copy.ledgerLabels.purchase;
    }
    if (entry.entryType.includes("spend") || entry.entryType.includes("debit")) {
      return props.copy.ledgerLabels.spend;
    }
    return props.copy.ledgerLabels.earned;
  };

  const handleSendGift = async () => {
    if (!canSendGift) {
      return;
    }

    const sent = await props.onSendGift(parsedGiftReceiverUserId, giftAmount.trim());
    if (sent) {
      setGiftReceiverUserId("");
      setGiftAmount("");
    }
  };

  const handlePurchaseGiftPack = async (sku: string) => {
    if (!canPurchaseGiftPack) {
      return;
    }

    const purchased = await props.onPurchaseGiftPack(
      sku,
      parsedGiftPackRecipientUserId,
    );
    if (purchased) {
      setGiftPackRecipientUserId("");
    }
  };

  return (
    <View style={styles.walletStack}>
      <View style={styles.heroGrid}>
        <View style={styles.balanceHeroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroEyebrow}>{props.copy.currentBalance}</Text>
            <View
              style={[
                props.styles.badge,
                props.connectedStore
                  ? props.styles.badgeSuccess
                  : props.styles.badgeWarning,
              ]}
            >
              <Text style={props.styles.badgeText}>
                {props.connectedStore
                  ? props.copy.storeReady
                  : props.copy.storeUnavailable}
              </Text>
            </View>
          </View>

          <Text style={styles.balanceHeroValue}>{props.formattedBalance}</Text>
          <Text style={styles.balanceHeroMeta}>
            {renderAssetLabel("B_LUCK")}:{" "}
            {props.formatAmount(props.wallet?.balance.bonusBalance ?? "0.00")} ·{" "}
            {props.copy.locked}:{" "}
            {props.formatAmount(props.wallet?.balance.lockedBalance ?? "0.00")}
          </Text>

          <View style={styles.heroActionRow}>
            <ActionButton
              label={
                props.refreshingBalance
                  ? props.copy.refreshing
                  : props.copy.refresh
              }
              onPress={props.onRefreshBalance}
              disabled={props.refreshingBalance}
              compact
            />
            <ActionButton
              label={
                props.syncingPendingPurchases
                  ? props.copy.syncingPending
                  : props.copy.syncPending
              }
              onPress={props.onSyncPendingPurchases}
              disabled={!props.connectedStore || props.syncingPendingPurchases}
              variant="secondary"
              compact
            />
          </View>
        </View>

        <View style={styles.creditsHeroCard}>
          <Text style={styles.heroEyebrow}>{props.copy.assetsTitle}</Text>
          <Text style={styles.creditsHeroValue}>
            {props.formatAmount(bonusAsset?.availableBalance ?? "0.00")}
          </Text>
          <Text style={styles.creditsHeroMeta}>
            {renderAssetLabel(bonusAsset?.assetCode ?? "B_LUCK")}
            {voucherAsset
              ? ` · ${renderAssetLabel(voucherAsset.assetCode)} ${props.formatAmount(
                  voucherAsset.availableBalance,
                )}`
              : ""}
          </Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(8, giftEnergyRatio * 100)}%` },
              ]}
            />
          </View>

          <View style={styles.creditsFooter}>
            <View>
              <Text style={styles.creditsFooterLabel}>{props.copy.giftEnergy}</Text>
              <Text style={styles.creditsFooterValue}>
                {props.giftEnergy
                  ? `${props.giftEnergy.currentEnergy}/${props.giftEnergy.maxEnergy}`
                  : props.copy.economyLoading}
              </Text>
            </View>
            <ActionButton
              label={
                props.loadingEconomy
                  ? props.copy.refreshingEconomy
                  : props.copy.refreshEconomy
              }
              onPress={props.onRefreshEconomy}
              disabled={props.loadingEconomy}
              variant="secondary"
              compact
            />
          </View>
        </View>
      </View>

      <PaymentsOperationsSection
        copy={props.copy.payments}
        bankCards={props.bankCards}
        cryptoChannels={props.cryptoChannels}
        cryptoAddresses={props.cryptoAddresses}
        topUps={props.topUps}
        withdrawals={props.withdrawals}
        loadingPayments={props.loadingPayments}
        activePaymentAction={props.activePaymentAction}
        formatAmount={props.formatAmount}
        formatDateTime={props.formatDateTime}
        onRefreshPayments={props.onRefreshPayments}
        onCreateTopUp={props.onCreateTopUp}
        onCreateCryptoDeposit={props.onCreateCryptoDeposit}
        onCreateBankCard={props.onCreateBankCard}
        onSetDefaultBankCard={props.onSetDefaultBankCard}
        onCreateWithdrawal={props.onCreateWithdrawal}
        onCreateCryptoWithdrawAddress={props.onCreateCryptoWithdrawAddress}
        onSetDefaultCryptoAddress={props.onSetDefaultCryptoAddress}
        onCreateCryptoWithdrawal={props.onCreateCryptoWithdrawal}
      />

      <SectionCard title={props.copy.purchaseTitle}>
        <View style={styles.assetGrid}>
          {assets.map((asset) => (
            <WalletAssetCard
              key={asset.assetCode}
              label={renderAssetLabel(asset.assetCode)}
              value={props.formatAmount(asset.availableBalance)}
              tone={
                asset.assetCode === "B_LUCK"
                  ? "gold"
                  : asset.assetCode === "IAP_VOUCHER"
                    ? "blue"
                    : "panel"
              }
              detailRows={[
                {
                  label: props.copy.available,
                  value: props.formatAmount(asset.availableBalance),
                },
                {
                  label: props.copy.locked,
                  value: props.formatAmount(asset.lockedBalance),
                },
              ]}
            />
          ))}
        </View>

        <View style={props.styles.inlineActions}>
          <ActionButton
            label={props.copy.refreshProducts}
            onPress={props.onRefreshIapProducts}
            disabled={props.loadingIapProducts}
            variant="secondary"
            compact
          />
          <ActionButton
            label={
              props.syncingPendingPurchases
                ? props.copy.syncingPending
                : props.copy.syncPending
            }
            onPress={props.onSyncPendingPurchases}
            disabled={!props.connectedStore || props.syncingPendingPurchases}
            variant="secondary"
            compact
          />
        </View>

        {props.loadingIapProducts ? (
          <Text style={props.styles.gachaHint}>{props.copy.productsLoading}</Text>
        ) : null}

        {!props.supportedIap ? (
          <Text style={props.styles.gachaHint}>
            {props.copy.productsUnavailable}
          </Text>
        ) : null}

        {props.supportedIap &&
        !props.loadingIapProducts &&
        props.iapProducts.length === 0 ? (
          <Text style={props.styles.gachaHint}>
            {props.connectedStore
              ? props.copy.productsEmpty
              : props.copy.productsUnavailable}
          </Text>
        ) : null}

        <View style={styles.storeGrid}>
          {props.iapProducts.map((product) => (
            <View key={product.catalogProduct.sku} style={styles.storeTile}>
              <View style={[styles.storeIconBubble, styles.storeIconVoucher]}>
                <Text style={styles.storeIconText}>V</Text>
              </View>
              <Text style={styles.storeTileTitle}>
                {product.title || props.copy.productTitleFallback}
              </Text>
              <Text style={styles.storeTileValue}>
                {props.formatAmount(product.catalogProduct.assetAmount ?? "0")}
              </Text>
              <Text style={styles.storeTileMeta}>
                {product.displayPrice ?? props.copy.priceFallback}
              </Text>
              <ActionButton
                label={
                  props.purchasingSku === product.catalogProduct.sku
                    ? props.copy.buying
                    : props.copy.buy
                }
                onPress={() => {
                  void props.onPurchaseVoucher(product.catalogProduct.sku);
                }}
                disabled={
                  !props.connectedStore ||
                  props.loadingIapProducts ||
                  props.syncingPendingPurchases ||
                  props.purchasingSku !== null
                }
                compact
              />
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title={props.copy.giftPackTitle}>
        <Field
          label={props.copy.giftPackRecipientUserId}
          value={giftPackRecipientUserId}
          onChangeText={setGiftPackRecipientUserId}
          keyboardType="numeric"
          placeholder={props.copy.giftPackRecipientPlaceholder}
        />

        {props.supportedIap &&
        !props.loadingIapProducts &&
        props.giftPackProducts.length === 0 ? (
          <Text style={props.styles.gachaHint}>{props.copy.giftPackEmpty}</Text>
        ) : null}

        <View style={styles.storeGrid}>
          {props.giftPackProducts.map((product) => (
            <View key={product.catalogItem.product.sku} style={styles.storeTile}>
              <View style={[styles.storeIconBubble, styles.storeIconGift]}>
                <Text style={styles.storeIconText}>P</Text>
              </View>
              <Text style={styles.storeTileTitle}>
                {product.title || props.copy.giftPackTitleFallback}
              </Text>
              <Text style={styles.storeTileValue}>
                {props.formatAmount(product.catalogItem.giftPack.rewardAmount)}
              </Text>
              <Text style={styles.storeTileMeta}>
                {product.displayPrice ?? props.copy.priceFallback}
              </Text>
              <ActionButton
                label={
                  props.purchasingSku === product.catalogItem.product.sku
                    ? props.copy.buyingGiftPack
                    : props.copy.buyGiftPack
                }
                onPress={() => {
                  void handlePurchaseGiftPack(product.catalogItem.product.sku);
                }}
                disabled={
                  !props.connectedStore ||
                  !canPurchaseGiftPack ||
                  props.loadingIapProducts ||
                  props.syncingPendingPurchases ||
                  props.purchasingSku !== null
                }
                compact
              />
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title={props.copy.ledgerTitle}>
        {ledgerEntries.length === 0 ? (
          <Text style={styles.emptyText}>{props.copy.ledgerEmpty}</Text>
        ) : (
          <View style={styles.timelineList}>
            {ledgerEntries.map((entry) => (
              <WalletHistoryEntryCard
                key={entry.id}
                title={renderLedgerLabel(entry)}
                accentValue={props.formatAmount(entry.amount)}
                tone={
                  entry.entryType.includes("refund") ||
                  entry.entryType.includes("revoke") ||
                  entry.entryType.includes("reversal")
                    ? "panel"
                    : entry.entryType.includes("gift_send") ||
                  entry.entryType.includes("spend") ||
                  entry.entryType.includes("debit")
                    ? "danger"
                    : entry.entryType.includes("gift_receive") ||
                        entry.entryType.includes("gift_pack")
                      ? "blue"
                      : "success"
                }
                detailLines={[
                  renderAssetLabel(entry.assetCode),
                  props.formatDateTime(entry.createdAt),
                ]}
              />
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard title={props.copy.giftTitle}>
        <View style={styles.formGrid}>
          <Field
            label={props.copy.receiverUserId}
            value={giftReceiverUserId}
            onChangeText={setGiftReceiverUserId}
            keyboardType="numeric"
            placeholder={props.copy.receiverUserIdPlaceholder}
          />
          <Field
            label={props.copy.giftAmount}
            value={giftAmount}
            onChangeText={setGiftAmount}
            keyboardType="numeric"
            placeholder={props.copy.giftAmountPlaceholder}
          />
        </View>

        <ActionButton
          label={props.sendingGift ? props.copy.sendingGift : props.copy.sendGift}
          onPress={() => {
            void handleSendGift();
          }}
          disabled={!canSendGift}
          fullWidth
        />

        {giftHistory.length === 0 ? (
          <Text style={styles.emptyText}>{props.copy.historyEmpty}</Text>
        ) : (
          <View style={styles.timelineList}>
            {giftHistory.map((gift) => (
              <WalletHistoryEntryCard
                key={gift.id}
                title={props.copy.giftTransferLabel(
                  gift.senderUserId,
                  gift.receiverUserId,
                )}
                accentValue={props.formatAmount(gift.amount)}
                tone="blue"
                detailLines={[
                  props.copy.giftEnergyCost(gift.energyCost),
                  props.formatDateTime(gift.createdAt),
                ]}
              />
            ))}
          </View>
        )}
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  walletStack: {
    gap: mobileSpacing["3xl"],
  },
  heroGrid: {
    gap: mobileSpacing.lg,
  },
  balanceHeroCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#261b0e",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  creditsHeroCard: {
    gap: mobileSpacing.md,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#171f31",
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroEyebrow: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
    textTransform: "uppercase",
  },
  balanceHeroValue: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.metric + 6,
    lineHeight: mobileTypeScale.fontSize.metric + 10,
    fontWeight: "800",
  },
  balanceHeroMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  heroActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.md,
  },
  creditsHeroValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.hero,
    lineHeight: mobileTypeScale.lineHeight.hero,
    fontWeight: "800",
  },
  creditsHeroMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  progressTrack: {
    height: 14,
    overflow: "hidden",
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: "#0b1119",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: mobilePalette.accent,
  },
  creditsFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  creditsFooterLabel: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
    letterSpacing: mobileTypeScale.letterSpacing.subtle,
    textTransform: "uppercase",
  },
  creditsFooterValue: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "700",
  },
  assetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  storeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  storeTile: {
    flexGrow: 1,
    minWidth: 160,
    gap: mobileSpacing.sm,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.lg,
    ...mobileChromeTheme.cardShadowSm,
  },
  storeIconBubble: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
  },
  storeIconVoucher: {
    backgroundColor: "#2d220f",
  },
  storeIconGift: {
    backgroundColor: "#2d1719",
  },
  storeIconText: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.titleBase,
    fontWeight: "800",
  },
  storeTileTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  storeTileValue: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.body,
    fontWeight: "800",
  },
  storeTileMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "700",
  },
  formGrid: {
    gap: mobileSpacing.md,
  },
  emptyText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  timelineList: {
    gap: mobileSpacing.md,
  },
});
