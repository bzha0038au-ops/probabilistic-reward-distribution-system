import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  assetCodeValues,
  type AssetCode,
  type EconomyLedgerEntryRecord,
  type GiftEnergyAccountRecord,
  type GiftTransferRecord,
} from "@reward/shared-types/economy";
import type { WalletBalanceResponse } from "@reward/shared-types/user";

import type {
  MobileGiftPackCatalogItem,
  MobileIapCatalogItem,
} from "../hooks/use-iap";
import type { MobileWalletCopy } from "../mobile-copy";
import type { MobileStyles } from "../screens/types";
import { mobilePalette } from "../theme";
import { WalletAssetCard, WalletHistoryEntryCard } from "./domain-ui";
import { ActionButton, Field, SectionCard } from "../ui";

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
  formatAmount: (value: string) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  onRefreshBalance: () => void;
  onRefreshEconomy: () => void;
  onRefreshIapProducts: () => void;
  onSyncPendingPurchases: () => void;
  onSendGift: (receiverUserId: number, amount: string) => Promise<boolean>;
  onPurchaseVoucher: (sku: string) => void | Promise<boolean>;
  onPurchaseGiftPack: (
    sku: string,
    recipientUserId: number,
  ) => void | Promise<boolean>;
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
    <SectionCard title={props.copy.title} subtitle={props.copy.subtitle}>
      <View style={props.styles.inlineActions}>
        <View style={styles.balanceBlock}>
          <Text style={props.styles.balanceLabel}>
            {props.copy.currentBalance}
          </Text>
          <Text style={props.styles.balanceValue}>{props.formattedBalance}</Text>
        </View>
        <ActionButton
          label={
            props.refreshingBalance
              ? props.copy.refreshing
              : props.copy.refresh
          }
          onPress={props.onRefreshBalance}
          disabled={props.refreshingBalance}
          variant="secondary"
          compact
        />
      </View>

      <View style={styles.assetSection}>
        <Text style={styles.sectionTitle}>{props.copy.assetsTitle}</Text>
          <View style={styles.assetGrid}>
            {assets.map((asset) => (
              <WalletAssetCard
                key={asset.assetCode}
                label={renderAssetLabel(asset.assetCode)}
                value={props.formatAmount(asset.availableBalance)}
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
      </View>

      <View style={styles.giftSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{props.copy.giftTitle}</Text>
            <Text style={styles.sectionSubtitle}>{props.copy.giftSubtitle}</Text>
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

        <View style={styles.energyCard}>
          <Text style={styles.energyLabel}>{props.copy.giftEnergy}</Text>
          <Text style={styles.energyValue}>
            {props.giftEnergy
              ? `${props.giftEnergy.currentEnergy}/${props.giftEnergy.maxEnergy}`
              : props.copy.economyLoading}
          </Text>
        </View>

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
          compact
        />

        <View style={styles.historySection}>
          <Text style={styles.subsectionTitle}>{props.copy.giftHistory}</Text>
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
                  detailLines={[
                    props.copy.giftEnergyCost(gift.energyCost),
                    props.formatDateTime(gift.createdAt),
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.historySection}>
          <Text style={styles.subsectionTitle}>{props.copy.ledgerTitle}</Text>
          {ledgerEntries.length === 0 ? (
            <Text style={styles.emptyText}>{props.copy.ledgerEmpty}</Text>
          ) : (
            <View style={styles.timelineList}>
              {ledgerEntries.map((entry) => (
                <WalletHistoryEntryCard
                  key={entry.id}
                  title={renderLedgerLabel(entry)}
                  accentValue={props.formatAmount(entry.amount)}
                  detailLines={[
                    renderAssetLabel(entry.assetCode),
                    props.formatDateTime(entry.createdAt),
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.storeSection}>
        <View style={styles.storeHeader}>
          <View style={styles.storeHeading}>
            <Text style={styles.sectionTitle}>{props.copy.purchaseTitle}</Text>
            <Text style={styles.storeSubtitle}>{props.copy.purchaseSubtitle}</Text>
          </View>
          <View
            style={[
              props.styles.badge,
              props.connectedStore
                ? props.styles.badgeSuccess
                : props.styles.badgeMuted,
            ]}
          >
            <Text style={props.styles.badgeText}>
              {props.connectedStore
                ? props.copy.storeReady
                : props.copy.storeUnavailable}
            </Text>
          </View>
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

        <View style={styles.productList}>
          {props.iapProducts.map((product) => (
            <View key={product.catalogProduct.sku} style={styles.productCard}>
              <View style={styles.productContent}>
                <Text style={styles.productTitle}>
                  {product.title || props.copy.productTitleFallback}
                </Text>
                <Text style={styles.productDescription}>{product.description}</Text>
                <View style={styles.productMetaRow}>
                  <Text style={styles.productMetaLabel}>
                    {props.copy.amountLabel}
                  </Text>
                  <Text style={styles.productMetaValue}>
                    {props.formatAmount(product.catalogProduct.assetAmount ?? "0")}
                  </Text>
                </View>
                <Text style={styles.productPrice}>
                  {product.displayPrice ?? props.copy.priceFallback}
                </Text>
              </View>
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
      </View>

      <View style={styles.storeSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{props.copy.giftPackTitle}</Text>
          <Text style={styles.sectionSubtitle}>{props.copy.giftPackSubtitle}</Text>
        </View>

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

        <View style={styles.productList}>
          {props.giftPackProducts.map((product) => (
            <View key={product.catalogItem.product.sku} style={styles.productCard}>
              <View style={styles.productContent}>
                <Text style={styles.productTitle}>
                  {product.title || props.copy.giftPackTitleFallback}
                </Text>
                <Text style={styles.productDescription}>{product.description}</Text>
                <View style={styles.productMetaRow}>
                  <Text style={styles.productMetaLabel}>
                    {props.copy.giftPackRewardLabel}
                  </Text>
                  <Text style={styles.productMetaValue}>
                    {props.formatAmount(product.catalogItem.giftPack.rewardAmount)}
                  </Text>
                </View>
                <Text style={styles.productPrice}>
                  {product.displayPrice ?? props.copy.priceFallback}
                </Text>
              </View>
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
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  balanceBlock: {
    flex: 1,
    gap: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeading: {
    flex: 1,
    gap: 6,
  },
  sectionTitle: {
    color: mobilePalette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  assetSection: {
    gap: 12,
  },
  giftSection: {
    gap: 12,
  },
  energyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  energyLabel: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  energyValue: {
    color: mobilePalette.text,
    fontSize: 18,
    fontWeight: "700",
  },
  formGrid: {
    gap: 12,
  },
  historySection: {
    gap: 10,
  },
  subsectionTitle: {
    color: mobilePalette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  emptyText: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  timelineList: {
    gap: 10,
  },
  assetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  storeSection: {
    gap: 12,
  },
  storeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  storeHeading: {
    flex: 1,
    gap: 6,
  },
  storeSubtitle: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  productList: {
    gap: 12,
  },
  productCard: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: 14,
  },
  productContent: {
    gap: 6,
  },
  productTitle: {
    color: mobilePalette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  productDescription: {
    color: mobilePalette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  productMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  productMetaLabel: {
    color: mobilePalette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  productMetaValue: {
    color: mobilePalette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  productPrice: {
    color: mobilePalette.accent,
    fontSize: 14,
    fontWeight: "700",
  },
});
