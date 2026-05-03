import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  BankCardRecord,
  CryptoDepositChannelRecord,
  CryptoWithdrawAddressViewRecord,
  DepositRecord,
  WithdrawalRecord,
} from "@reward/shared-types/finance";

import type { MobileWalletCopy } from "../mobile-copy";
import {
  mobileChromeTheme,
  mobilePalette,
  mobileRadii,
  mobileSpacing,
  mobileTypeScale,
} from "../theme";
import { ActionButton, Field, SectionCard } from "../ui";
import { WalletHistoryEntryCard } from "./domain-ui";

type PaymentsOperationsSectionProps = {
  copy: MobileWalletCopy["payments"];
  bankCards: BankCardRecord[];
  cryptoChannels: CryptoDepositChannelRecord[];
  cryptoAddresses: CryptoWithdrawAddressViewRecord[];
  topUps: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  loadingPayments: boolean;
  activePaymentAction: string | null;
  formatAmount: (value: string) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  onRefreshPayments: () => void;
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

const pendingStatusSet = new Set([
  "requested",
  "provider_pending",
  "provider_succeeded",
  "approved",
  "provider_submitted",
  "provider_processing",
]);

const formatStatusLabel = (value: string) =>
  value
    .split("_")
    .map((segment) =>
      segment.length > 0
        ? `${segment[0]!.toUpperCase()}${segment.slice(1)}`
        : segment,
    )
    .join(" ");

const buildBankCardLabel = (entry: BankCardRecord) =>
  [
    entry.brand || entry.bankName || "Bank",
    entry.last4 ? `•••• ${entry.last4}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const buildChannelLabel = (entry: CryptoDepositChannelRecord) =>
  `${entry.chain} · ${entry.token}`;

const buildCryptoRouteLabel = (entry: CryptoWithdrawAddressViewRecord) =>
  `${entry.chain} · ${entry.token}`;

type PaymentPanelKey = "inflow" | "fiat" | "crypto" | "activity";

export function PaymentsOperationsSection(props: PaymentsOperationsSectionProps) {
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpReference, setTopUpReference] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [depositAmountClaimed, setDepositAmountClaimed] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [depositFromAddress, setDepositFromAddress] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [selectedBankCardId, setSelectedBankCardId] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [cryptoChain, setCryptoChain] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("");
  const [cryptoToken, setCryptoToken] = useState("");
  const [cryptoAddress, setCryptoAddress] = useState("");
  const [cryptoLabel, setCryptoLabel] = useState("");
  const [selectedCryptoAddressId, setSelectedCryptoAddressId] = useState("");
  const [cryptoWithdrawalAmount, setCryptoWithdrawalAmount] = useState("");
  const [expandedPanels, setExpandedPanels] = useState<Record<PaymentPanelKey, boolean>>({
    inflow: true,
    fiat: false,
    crypto: false,
    activity: false,
  });

  useEffect(() => {
    if (!selectedBankCardId) {
      const defaultBankCard = props.bankCards.find((entry) => entry.isDefault);
      if (defaultBankCard) {
        setSelectedBankCardId(String(defaultBankCard.id));
      } else if (props.bankCards[0]) {
        setSelectedBankCardId(String(props.bankCards[0].id));
      }
    }
  }, [props.bankCards, selectedBankCardId]);

  useEffect(() => {
    if (!selectedCryptoAddressId) {
      const defaultAddress = props.cryptoAddresses.find((entry) => entry.isDefault);
      if (defaultAddress) {
        setSelectedCryptoAddressId(String(defaultAddress.payoutMethodId));
      } else if (props.cryptoAddresses[0]) {
        setSelectedCryptoAddressId(String(props.cryptoAddresses[0].payoutMethodId));
      }
    }
  }, [props.cryptoAddresses, selectedCryptoAddressId]);

  useEffect(() => {
    if (!selectedChannelId && props.cryptoChannels[0]) {
      setSelectedChannelId(String(props.cryptoChannels[0].id));
    }
  }, [props.cryptoChannels, selectedChannelId]);

  const selectedBankCard = useMemo(
    () =>
      props.bankCards.find((entry) => entry.id === Number(selectedBankCardId)) ?? null,
    [props.bankCards, selectedBankCardId],
  );
  const selectedCryptoAddress = useMemo(
    () =>
      props.cryptoAddresses.find(
        (entry) => entry.payoutMethodId === Number(selectedCryptoAddressId),
      ) ?? null,
    [props.cryptoAddresses, selectedCryptoAddressId],
  );
  const selectedCryptoChannel = useMemo(
    () =>
      props.cryptoChannels.find((entry) => entry.id === Number(selectedChannelId)) ??
      null,
    [props.cryptoChannels, selectedChannelId],
  );
  const activityTimeline = useMemo(
    () =>
      [
        ...props.topUps.map((entry) => ({
          key: `deposit-${entry.id}`,
          title: props.copy.topUpEntryTitle(entry.channelType),
          accentValue: props.formatAmount(entry.amount),
          tone: pendingStatusSet.has(entry.status) ? ("blue" as const) : ("success" as const),
          detailLines: [
            `${props.copy.statusLabel}: ${formatStatusLabel(entry.status)}`,
            props.formatDateTime(entry.createdAt),
          ],
          createdAt: Date.parse(String(entry.createdAt)),
        })),
        ...props.withdrawals.map((entry) => ({
          key: `withdrawal-${entry.id}`,
          title: props.copy.withdrawalEntryTitle(entry.channelType),
          accentValue: props.formatAmount(entry.amount),
          tone:
            entry.status === "rejected" || entry.status === "provider_failed"
              ? ("danger" as const)
              : pendingStatusSet.has(entry.status)
                ? ("blue" as const)
                : ("success" as const),
          detailLines: [
            `${props.copy.statusLabel}: ${formatStatusLabel(entry.status)}`,
            props.formatDateTime(entry.createdAt),
          ],
          createdAt: Date.parse(String(entry.createdAt)),
        })),
      ].sort((left, right) => right.createdAt - left.createdAt),
    [
      props.copy,
      props.formatAmount,
      props.formatDateTime,
      props.topUps,
      props.withdrawals,
    ],
  );

  const togglePanel = (panel: PaymentPanelKey) => {
    setExpandedPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  };

  const handleCreateTopUp = async () => {
    const created = await props.onCreateTopUp({
      amount: topUpAmount.trim(),
      referenceId: topUpReference.trim() || null,
    });
    if (created) {
      setTopUpAmount("");
      setTopUpReference("");
    }
  };

  const handleCreateCryptoDeposit = async () => {
    const channelId = Number(selectedChannelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return;
    }

    const created = await props.onCreateCryptoDeposit({
      channelId,
      amountClaimed: depositAmountClaimed.trim(),
      txHash: depositTxHash.trim(),
      fromAddress: depositFromAddress.trim() || null,
    });
    if (created) {
      setDepositAmountClaimed("");
      setDepositTxHash("");
      setDepositFromAddress("");
    }
  };

  const handleCreateBankCard = async () => {
    const created = await props.onCreateBankCard({
      cardholderName: cardholderName.trim(),
      bankName: bankName.trim() || null,
      brand: cardBrand.trim() || null,
      last4: cardLast4.trim() || null,
      isDefault: props.bankCards.length === 0,
    });
    if (created) {
      setCardholderName("");
      setBankName("");
      setCardBrand("");
      setCardLast4("");
    }
  };

  const handleCreateWithdrawal = async () => {
    const bankCardId = Number(selectedBankCardId);
    if (!Number.isInteger(bankCardId) || bankCardId <= 0) {
      return;
    }

    const created = await props.onCreateWithdrawal({
      amount: withdrawalAmount.trim(),
      bankCardId,
    });
    if (created) {
      setWithdrawalAmount("");
    }
  };

  const handleCreateCryptoAddress = async () => {
    const created = await props.onCreateCryptoWithdrawAddress({
      chain: cryptoChain.trim() || null,
      network: cryptoNetwork.trim() || null,
      token: cryptoToken.trim() || null,
      address: cryptoAddress.trim(),
      label: cryptoLabel.trim() || null,
      isDefault: props.cryptoAddresses.length === 0,
    });
    if (created) {
      setCryptoChain("");
      setCryptoNetwork("");
      setCryptoToken("");
      setCryptoAddress("");
      setCryptoLabel("");
    }
  };

  const handleCreateCryptoWithdrawal = async () => {
    const payoutMethodId = Number(selectedCryptoAddressId);
    if (!Number.isInteger(payoutMethodId) || payoutMethodId <= 0) {
      return;
    }

    const created = await props.onCreateCryptoWithdrawal({
      amount: cryptoWithdrawalAmount.trim(),
      payoutMethodId,
    });
    if (created) {
      setCryptoWithdrawalAmount("");
    }
  };

  return (
    <SectionCard title={props.copy.title}>
      <View style={styles.actionRow}>
        <ActionButton
          label={props.loadingPayments ? props.copy.refreshing : props.copy.refresh}
          onPress={props.onRefreshPayments}
          disabled={props.loadingPayments}
          variant="secondary"
          compact
        />
      </View>

      <PaymentPanel
        title={props.copy.inflowTitle}
        countLabel={String(props.cryptoChannels.length)}
        expanded={expandedPanels.inflow}
        onToggle={() => togglePanel("inflow")}
      >
        <Field
          label={props.copy.topUpAmount}
          value={topUpAmount}
          onChangeText={setTopUpAmount}
          keyboardType="numeric"
          placeholder="100.00"
        />
        <Field
          label={props.copy.topUpReference}
          value={topUpReference}
          onChangeText={setTopUpReference}
          placeholder={props.copy.topUpReferencePlaceholder}
        />
        <ActionButton
          label={
            props.activePaymentAction === "top-up"
              ? props.copy.creatingTopUp
              : props.copy.createTopUp
          }
          onPress={() => {
            void handleCreateTopUp();
          }}
          disabled={topUpAmount.trim() === "" || props.activePaymentAction !== null}
          fullWidth
        />

        <Text style={styles.subsectionTitle}>{props.copy.depositChannelsTitle}</Text>
        {props.cryptoChannels.length === 0 ? (
          <Text style={styles.emptyText}>{props.copy.noCryptoChannels}</Text>
        ) : (
          <View style={styles.cardList}>
            {props.cryptoChannels.map((channel) => {
              const selected = String(channel.id) === selectedChannelId;
              return (
                <View key={channel.id} style={[styles.routeCard, selected ? styles.routeCardSelected : null]}>
                  <View style={styles.routeCardHeader}>
                    <Text style={styles.routeCardTitle}>{buildChannelLabel(channel)}</Text>
                    {selected ? <Text style={styles.routeBadge}>{props.copy.selected}</Text> : null}
                  </View>
                  <Text style={styles.routeCardMeta}>{channel.receiveAddress}</Text>
                  <ActionButton
                    label={selected ? props.copy.selected : props.copy.useChannel}
                    onPress={() => setSelectedChannelId(String(channel.id))}
                    disabled={selected}
                    compact
                    variant="secondary"
                  />
                </View>
              );
            })}
          </View>
        )}

        <Field
          label={props.copy.cryptoClaimAmount}
          value={depositAmountClaimed}
          onChangeText={setDepositAmountClaimed}
          keyboardType="numeric"
          placeholder="100.00"
        />
        <Field
          label={props.copy.cryptoClaimHash}
          value={depositTxHash}
          onChangeText={setDepositTxHash}
          placeholder="0x..."
        />
        <Field
          label={props.copy.cryptoClaimAddress}
          value={depositFromAddress}
          onChangeText={setDepositFromAddress}
          placeholder={props.copy.cryptoClaimAddressPlaceholder}
        />
        <ActionButton
          label={
            props.activePaymentAction === "crypto-deposit"
              ? props.copy.submittingCryptoDeposit
              : props.copy.submitCryptoDeposit
          }
          onPress={() => {
            void handleCreateCryptoDeposit();
          }}
          disabled={
            !selectedCryptoChannel ||
            depositAmountClaimed.trim() === "" ||
            depositTxHash.trim() === "" ||
            props.activePaymentAction !== null
          }
          fullWidth
        />
      </PaymentPanel>

      <PaymentPanel
        title={props.copy.payoutDeskTitle}
        countLabel={String(props.bankCards.length)}
        expanded={expandedPanels.fiat}
        onToggle={() => togglePanel("fiat")}
      >
        <Field
          label={props.copy.cardholderName}
          value={cardholderName}
          onChangeText={setCardholderName}
          placeholder={props.copy.cardholderNamePlaceholder}
        />
        <Field
          label={props.copy.bankName}
          value={bankName}
          onChangeText={setBankName}
          placeholder={props.copy.bankNamePlaceholder}
        />
        <Field
          label={props.copy.cardBrand}
          value={cardBrand}
          onChangeText={setCardBrand}
          placeholder={props.copy.cardBrandPlaceholder}
        />
        <Field
          label={props.copy.last4}
          value={cardLast4}
          onChangeText={setCardLast4}
          keyboardType="numeric"
          placeholder="1234"
        />
        <ActionButton
          label={
            props.activePaymentAction === "bank-card"
              ? props.copy.savingBankCard
              : props.copy.saveBankCard
          }
          onPress={() => {
            void handleCreateBankCard();
          }}
          disabled={cardholderName.trim() === "" || props.activePaymentAction !== null}
          fullWidth
        />

        <Text style={styles.subsectionTitle}>{props.copy.savedBankCardsTitle}</Text>
        {props.bankCards.length === 0 ? (
          <Text style={styles.emptyText}>{props.copy.noBankCards}</Text>
        ) : (
          <View style={styles.cardList}>
            {props.bankCards.map((entry) => (
              <View
                key={entry.id}
                style={[
                  styles.routeCard,
                  String(entry.id) === selectedBankCardId ? styles.routeCardSelected : null,
                ]}
              >
                <View style={styles.routeCardHeader}>
                  <Text style={styles.routeCardTitle}>{buildBankCardLabel(entry)}</Text>
                  {entry.isDefault ? <Text style={styles.routeBadge}>{props.copy.defaultBadge}</Text> : null}
                </View>
                <Text style={styles.routeCardMeta}>
                  {props.copy.methodStatusLabel}: {formatStatusLabel(entry.status)}
                </Text>
                <View style={styles.inlineButtonRow}>
                  <ActionButton
                    label={
                      String(entry.id) === selectedBankCardId
                        ? props.copy.selected
                        : props.copy.selectBankCard
                    }
                    onPress={() => setSelectedBankCardId(String(entry.id))}
                    disabled={String(entry.id) === selectedBankCardId}
                    compact
                    variant="secondary"
                  />
                  {!entry.isDefault ? (
                    <ActionButton
                      label={props.copy.setDefault}
                      onPress={() => {
                        void props.onSetDefaultBankCard(entry.id);
                      }}
                      disabled={props.activePaymentAction !== null}
                      compact
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <Field
          label={props.copy.withdrawalAmount}
          value={withdrawalAmount}
          onChangeText={setWithdrawalAmount}
          keyboardType="numeric"
          placeholder="50.00"
        />
        <ActionButton
          label={
            props.activePaymentAction === "bank-withdrawal"
              ? props.copy.requestingWithdrawal
              : props.copy.requestWithdrawal
          }
          onPress={() => {
            void handleCreateWithdrawal();
          }}
          disabled={
            !selectedBankCard ||
            withdrawalAmount.trim() === "" ||
            props.activePaymentAction !== null
          }
          fullWidth
        />
      </PaymentPanel>

      <PaymentPanel
        title={props.copy.cryptoDeskTitle}
        countLabel={String(props.cryptoAddresses.length)}
        expanded={expandedPanels.crypto}
        onToggle={() => togglePanel("crypto")}
      >
        <Field
          label={props.copy.cryptoChain}
          value={cryptoChain}
          onChangeText={setCryptoChain}
          placeholder="Ethereum"
        />
        <Field
          label={props.copy.cryptoNetwork}
          value={cryptoNetwork}
          onChangeText={setCryptoNetwork}
          placeholder="ERC-20"
        />
        <Field
          label={props.copy.cryptoToken}
          value={cryptoToken}
          onChangeText={setCryptoToken}
          placeholder="USDT"
        />
        <Field
          label={props.copy.cryptoAddress}
          value={cryptoAddress}
          onChangeText={setCryptoAddress}
          placeholder="0x..."
        />
        <Field
          label={props.copy.cryptoLabel}
          value={cryptoLabel}
          onChangeText={setCryptoLabel}
          placeholder={props.copy.cryptoLabelPlaceholder}
        />
        <ActionButton
          label={
            props.activePaymentAction === "crypto-address"
              ? props.copy.savingCryptoRoute
              : props.copy.saveCryptoRoute
          }
          onPress={() => {
            void handleCreateCryptoAddress();
          }}
          disabled={cryptoAddress.trim() === "" || props.activePaymentAction !== null}
          fullWidth
        />

        <Text style={styles.subsectionTitle}>{props.copy.savedCryptoRoutesTitle}</Text>
        {props.cryptoAddresses.length === 0 ? (
          <Text style={styles.emptyText}>{props.copy.noCryptoRoutes}</Text>
        ) : (
          <View style={styles.cardList}>
            {props.cryptoAddresses.map((entry) => (
              <View
                key={entry.payoutMethodId}
                style={[
                  styles.routeCard,
                  String(entry.payoutMethodId) === selectedCryptoAddressId
                    ? styles.routeCardSelected
                    : null,
                ]}
              >
                <View style={styles.routeCardHeader}>
                  <Text style={styles.routeCardTitle}>
                    {buildCryptoRouteLabel(entry)}
                  </Text>
                  {entry.isDefault ? (
                    <Text style={styles.routeBadge}>{props.copy.defaultBadge}</Text>
                  ) : null}
                </View>
                <Text style={styles.routeCardMeta}>{entry.address}</Text>
                <View style={styles.inlineButtonRow}>
                  <ActionButton
                    label={
                      String(entry.payoutMethodId) === selectedCryptoAddressId
                        ? props.copy.selected
                        : props.copy.selectCryptoRoute
                    }
                    onPress={() => setSelectedCryptoAddressId(String(entry.payoutMethodId))}
                    disabled={String(entry.payoutMethodId) === selectedCryptoAddressId}
                    compact
                    variant="secondary"
                  />
                  {!entry.isDefault ? (
                    <ActionButton
                      label={props.copy.setDefault}
                      onPress={() => {
                        void props.onSetDefaultCryptoAddress(entry.payoutMethodId);
                      }}
                      disabled={props.activePaymentAction !== null}
                      compact
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <Field
          label={props.copy.cryptoWithdrawalAmount}
          value={cryptoWithdrawalAmount}
          onChangeText={setCryptoWithdrawalAmount}
          keyboardType="numeric"
          placeholder="50.00"
        />
        <ActionButton
          label={
            props.activePaymentAction === "crypto-withdrawal"
              ? props.copy.requestingCryptoWithdrawal
              : props.copy.requestCryptoWithdrawal
          }
          onPress={() => {
            void handleCreateCryptoWithdrawal();
          }}
          disabled={
            !selectedCryptoAddress ||
            cryptoWithdrawalAmount.trim() === "" ||
            props.activePaymentAction !== null
          }
          fullWidth
        />
      </PaymentPanel>

      <PaymentPanel
        title={props.copy.activityTitle}
        countLabel={String(props.topUps.length + props.withdrawals.length)}
        expanded={expandedPanels.activity}
        onToggle={() => togglePanel("activity")}
      >
        {activityTimeline.length === 0 ? (
          <Text style={styles.emptyText}>{props.copy.noTopUps}</Text>
        ) : (
          <View style={styles.cardList}>
            {activityTimeline.map((entry) => (
              <WalletHistoryEntryCard
                key={entry.key}
                title={entry.title}
                accentValue={entry.accentValue}
                tone={entry.tone}
                detailLines={entry.detailLines}
              />
            ))}
          </View>
        )}
      </PaymentPanel>
    </SectionCard>
  );
}

function PaymentPanel(props: {
  title: string;
  countLabel: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.panelCard}>
      <Pressable
        onPress={props.onToggle}
        accessibilityRole="button"
        accessibilityLabel={props.title}
        accessibilityHint={props.expanded ? "Collapse section" : "Expand section"}
        style={({ pressed }) => [
          styles.panelHeaderButton,
          pressed ? styles.panelHeaderButtonPressed : null,
        ]}
      >
        <View style={styles.panelHeaderRow}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelTitle}>{props.title}</Text>
          </View>
          <View style={styles.panelHeaderMeta}>
            <View style={styles.panelCountBadge}>
              <Text style={styles.panelCountBadgeText}>{props.countLabel}</Text>
            </View>
            <Text style={styles.panelToggleGlyph}>{props.expanded ? "−" : "+"}</Text>
          </View>
        </View>
      </Pressable>

      {props.expanded ? <View style={styles.panelBody}>{props.children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: "flex-start",
  },
  panelCard: {
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panel,
    padding: mobileSpacing.xl,
    ...mobileChromeTheme.cardShadow,
  },
  panelHeaderButton: {
    borderRadius: mobileRadii.lg,
  },
  panelHeaderButtonPressed: {
    opacity: 0.88,
  },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: mobileSpacing.md,
  },
  panelHeaderCopy: {
    flex: 1,
    gap: mobileSpacing.xs,
  },
  panelHeaderMeta: {
    alignItems: "center",
    gap: mobileSpacing.sm,
  },
  panelCountBadge: {
    minWidth: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    paddingHorizontal: mobileSpacing.md,
    paddingVertical: mobileSpacing.xs,
  },
  panelCountBadgeText: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "800",
  },
  panelToggleGlyph: {
    color: mobilePalette.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 20,
  },
  panelBody: {
    gap: mobileSpacing.md,
    marginTop: mobileSpacing.md,
  },
  panelTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  subsectionTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
  },
  emptyText: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.body,
    lineHeight: mobileTypeScale.lineHeight.body,
  },
  cardList: {
    gap: mobileSpacing.md,
  },
  routeCard: {
    gap: mobileSpacing.xs,
    borderRadius: mobileRadii.xl,
    borderWidth: mobileChromeTheme.borderWidth,
    borderColor: mobilePalette.border,
    backgroundColor: mobilePalette.panelMuted,
    padding: mobileSpacing.md,
    ...mobileChromeTheme.cardShadowSm,
  },
  routeCardSelected: {
    backgroundColor: "#201830",
  },
  routeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpacing.md,
  },
  routeCardTitle: {
    color: mobilePalette.text,
    fontSize: mobileTypeScale.fontSize.bodyLg,
    fontWeight: "800",
    flex: 1,
  },
  routeCardMeta: {
    color: mobilePalette.textMuted,
    fontSize: mobileTypeScale.fontSize.labelSm,
    lineHeight: mobileTypeScale.lineHeight.label,
  },
  routeBadge: {
    color: mobilePalette.accent,
    fontSize: mobileTypeScale.fontSize.labelXs,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  inlineButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileSpacing.sm,
  },
});
