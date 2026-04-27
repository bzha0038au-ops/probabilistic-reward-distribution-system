'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserDashboardCopy } from './user-dashboard-copy';
import type { UserDashboardController } from './use-user-dashboard';
import {
  bankCardLabel,
  cryptoAddressViewLabel,
  readVisibleFinanceStatus,
  resolveUserDashboardBadgeVariant as badgeVariant,
} from './user-dashboard-utils';

type Translate = (key: string) => string;

type PaymentsSectionController = Pick<
  UserDashboardController,
  | 'bankCards'
  | 'cardholderName'
  | 'setCardholderName'
  | 'bankName'
  | 'setBankName'
  | 'cardBrand'
  | 'setCardBrand'
  | 'cardLast4'
  | 'setCardLast4'
  | 'cardSubmitting'
  | 'withdrawalAmount'
  | 'setWithdrawalAmount'
  | 'selectedBankCardId'
  | 'setSelectedBankCardId'
  | 'withdrawalSubmitting'
  | 'cryptoChain'
  | 'setCryptoChain'
  | 'cryptoNetwork'
  | 'setCryptoNetwork'
  | 'cryptoToken'
  | 'setCryptoToken'
  | 'cryptoAddressValue'
  | 'setCryptoAddressValue'
  | 'cryptoAddressLabel'
  | 'setCryptoAddressLabel'
  | 'cryptoAddressSubmitting'
  | 'cryptoWithdrawAddresses'
  | 'cryptoWithdrawalAmount'
  | 'setCryptoWithdrawalAmount'
  | 'selectedCryptoWithdrawAddressId'
  | 'setSelectedCryptoWithdrawAddressId'
  | 'cryptoWithdrawalSubmitting'
  | 'fiatWithdrawals'
  | 'cryptoWithdrawals'
  | 'handleCreateBankCard'
  | 'handleSetDefaultCard'
  | 'handleCreateWithdrawal'
  | 'handleCreateCryptoWithdrawAddress'
  | 'handleSetDefaultCryptoAddress'
  | 'handleCreateCryptoWithdrawal'
>;

type UserDashboardPaymentsSectionProps = {
  controller: PaymentsSectionController;
  copy: UserDashboardCopy;
  financeUnlocked: boolean;
  formatAmount: (value: string | number | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  formatStatus: (value: string | null | undefined) => string;
  t: Translate;
};

export function UserDashboardPaymentsSection({
  controller,
  copy: c,
  financeUnlocked,
  formatAmount,
  formatDateTime,
  formatStatus,
  t,
}: UserDashboardPaymentsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.paymentsTitle}</CardTitle>
        <CardDescription>{c.paymentsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!financeUnlocked ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {c.financeLocked}
          </div>
        ) : null}

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-950">{c.addCard}</h3>
          <form className="space-y-4" onSubmit={controller.handleCreateBankCard}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cardholder-name">{c.cardholderName}</Label>
                <Input
                  id="cardholder-name"
                  value={controller.cardholderName}
                  onChange={(event) => controller.setCardholderName(event.target.value)}
                  placeholder={c.cardholderName}
                  disabled={!financeUnlocked || controller.cardSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-name">{c.bankName}</Label>
                <Input
                  id="bank-name"
                  value={controller.bankName}
                  onChange={(event) => controller.setBankName(event.target.value)}
                  placeholder={c.bankName}
                  disabled={!financeUnlocked || controller.cardSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-brand">{c.cardBrand}</Label>
                <Input
                  id="card-brand"
                  value={controller.cardBrand}
                  onChange={(event) => controller.setCardBrand(event.target.value)}
                  placeholder={c.cardBrand}
                  disabled={!financeUnlocked || controller.cardSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-last4">{c.last4}</Label>
                <Input
                  id="card-last4"
                  value={controller.cardLast4}
                  onChange={(event) =>
                    controller.setCardLast4(
                      event.target.value.replace(/\D/g, '').slice(0, 4)
                    )
                  }
                  inputMode="numeric"
                  placeholder="1234"
                  disabled={!financeUnlocked || controller.cardSubmitting}
                />
              </div>
            </div>
            <Button type="submit" disabled={!financeUnlocked || controller.cardSubmitting}>
              {controller.cardSubmitting ? t('common.loading') : c.saveCard}
            </Button>
          </form>

          {controller.bankCards.length === 0 ? (
            <p className="text-sm text-slate-500">{c.noCards}</p>
          ) : (
            <div className="space-y-3">
              {controller.bankCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">{card.cardholderName}</p>
                      <p className="mt-1 text-slate-500">{bankCardLabel(card)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {card.isDefault ? (
                        <Badge>{c.defaultCard}</Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void controller.handleSetDefaultCard(card.id)}
                          disabled={!financeUnlocked}
                        >
                          {c.setDefault}
                        </Button>
                      )}
                      <Badge variant={badgeVariant(card.status)}>
                        {formatStatus(card.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-slate-200 pt-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">{c.requestWithdrawal}</h3>
            <p className="mt-1 text-sm text-slate-500">{c.withdrawalSectionLabel}</p>
          </div>

          <form className="space-y-4" onSubmit={controller.handleCreateWithdrawal}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="withdrawal-amount">{c.withdrawalAmount}</Label>
                <Input
                  id="withdrawal-amount"
                  value={controller.withdrawalAmount}
                  onChange={(event) =>
                    controller.setWithdrawalAmount(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="50.00"
                  disabled={!financeUnlocked || controller.withdrawalSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payout-card">{c.payoutCard}</Label>
                <select
                  id="payout-card"
                  value={controller.selectedBankCardId}
                  onChange={(event) =>
                    controller.setSelectedBankCardId(event.target.value)
                  }
                  disabled={
                    !financeUnlocked ||
                    controller.bankCards.length === 0 ||
                    controller.withdrawalSubmitting
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{c.payoutCardPlaceholder}</option>
                  {controller.bankCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {bankCardLabel(card)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!controller.selectedBankCardId && controller.bankCards.length > 0 ? (
              <p className="text-sm text-slate-500">{c.noSelection}</p>
            ) : null}
            <Button
              type="submit"
              disabled={
                !financeUnlocked ||
                controller.bankCards.length === 0 ||
                controller.withdrawalSubmitting
              }
            >
              {controller.withdrawalSubmitting
                ? t('common.loading')
                : c.requestWithdrawal}
            </Button>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-950">{c.recentWithdrawals}</h3>
            {controller.fiatWithdrawals.length === 0 ? (
              <p className="text-sm text-slate-500">{c.noWithdrawals}</p>
            ) : (
              <div className="space-y-3">
                {controller.fiatWithdrawals.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium">{formatAmount(entry.amount)}</span>
                      <Badge
                        variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}
                      >
                        {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                      <span>
                        {c.createdAt}: {formatDateTime(entry.createdAt)}
                      </span>
                      <span>
                        {c.reference}:{' '}
                        {entry.payoutMethodId ?? entry.bankCardId
                          ? `Method #${entry.payoutMethodId ?? entry.bankCardId}`
                          : c.unknown}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-200 pt-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {c.cryptoAddressTitle}
            </h3>
            <p className="mt-1 text-sm text-slate-500">{c.cryptoAddressDescription}</p>
          </div>

          <form
            className="space-y-4"
            onSubmit={controller.handleCreateCryptoWithdrawAddress}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crypto-chain">{c.cryptoChain}</Label>
                <Input
                  id="crypto-chain"
                  value={controller.cryptoChain}
                  onChange={(event) => controller.setCryptoChain(event.target.value)}
                  placeholder="Ethereum"
                  disabled={!financeUnlocked || controller.cryptoAddressSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-network">{c.cryptoNetwork}</Label>
                <Input
                  id="crypto-network"
                  value={controller.cryptoNetwork}
                  onChange={(event) => controller.setCryptoNetwork(event.target.value)}
                  placeholder="ERC20"
                  disabled={!financeUnlocked || controller.cryptoAddressSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-token">{c.cryptoToken}</Label>
                <Input
                  id="crypto-token"
                  value={controller.cryptoToken}
                  onChange={(event) => controller.setCryptoToken(event.target.value)}
                  placeholder="USDT"
                  disabled={!financeUnlocked || controller.cryptoAddressSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-address">{c.cryptoAddress}</Label>
                <Input
                  id="crypto-address"
                  value={controller.cryptoAddressValue}
                  onChange={(event) =>
                    controller.setCryptoAddressValue(event.target.value)
                  }
                  placeholder="0x..."
                  disabled={!financeUnlocked || controller.cryptoAddressSubmitting}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="crypto-address-label">{c.cryptoLabel}</Label>
                <Input
                  id="crypto-address-label"
                  value={controller.cryptoAddressLabel}
                  onChange={(event) =>
                    controller.setCryptoAddressLabel(event.target.value)
                  }
                  placeholder={c.cryptoLabel}
                  disabled={!financeUnlocked || controller.cryptoAddressSubmitting}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={!financeUnlocked || controller.cryptoAddressSubmitting}
            >
              {controller.cryptoAddressSubmitting
                ? t('common.loading')
                : c.saveCryptoAddress}
            </Button>
          </form>

          {controller.cryptoWithdrawAddresses.length === 0 ? (
            <p className="text-sm text-slate-500">{c.noCryptoAddresses}</p>
          ) : (
            <div className="space-y-3">
              {controller.cryptoWithdrawAddresses.map((address) => (
                <div
                  key={address.payoutMethodId}
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">
                        {cryptoAddressViewLabel(address)}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {address.chain} · {address.network} · {address.token}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {address.isDefault ? (
                        <Badge>{c.defaultCard}</Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void controller.handleSetDefaultCryptoAddress(
                              address.payoutMethodId
                            )
                          }
                          disabled={!financeUnlocked}
                        >
                          {c.setDefaultAddress}
                        </Button>
                      )}
                      <Badge variant={badgeVariant(address.status)}>
                        {formatStatus(address.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-slate-200 pt-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {c.requestCryptoWithdrawal}
            </h3>
            <p className="mt-1 text-sm text-slate-500">{c.withdrawalSectionLabel}</p>
          </div>

          <form
            className="space-y-4"
            onSubmit={controller.handleCreateCryptoWithdrawal}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crypto-withdrawal-amount">
                  {c.cryptoWithdrawalAmount}
                </Label>
                <Input
                  id="crypto-withdrawal-amount"
                  value={controller.cryptoWithdrawalAmount}
                  onChange={(event) =>
                    controller.setCryptoWithdrawalAmount(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="50.00"
                  disabled={!financeUnlocked || controller.cryptoWithdrawalSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crypto-withdrawal-address">
                  {c.cryptoWithdrawalAddress}
                </Label>
                <select
                  id="crypto-withdrawal-address"
                  value={controller.selectedCryptoWithdrawAddressId}
                  onChange={(event) =>
                    controller.setSelectedCryptoWithdrawAddressId(event.target.value)
                  }
                  disabled={
                    !financeUnlocked ||
                    controller.cryptoWithdrawAddresses.length === 0 ||
                    controller.cryptoWithdrawalSubmitting
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{c.cryptoWithdrawalAddressPlaceholder}</option>
                  {controller.cryptoWithdrawAddresses.map((address) => (
                    <option key={address.payoutMethodId} value={address.payoutMethodId}>
                      {cryptoAddressViewLabel(address)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              type="submit"
              disabled={
                !financeUnlocked ||
                controller.cryptoWithdrawAddresses.length === 0 ||
                controller.cryptoWithdrawalSubmitting
              }
            >
              {controller.cryptoWithdrawalSubmitting
                ? t('common.loading')
                : c.requestCryptoWithdrawal}
            </Button>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {c.recentCryptoWithdrawals}
            </h3>
            {controller.cryptoWithdrawals.length === 0 ? (
              <p className="text-sm text-slate-500">{c.noCryptoWithdrawals}</p>
            ) : (
              <div className="space-y-3">
                {controller.cryptoWithdrawals.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium">
                        {formatAmount(entry.amount)} {entry.assetCode ?? ''}
                      </span>
                      <Badge
                        variant={badgeVariant(readVisibleFinanceStatus(entry) ?? entry.status)}
                      >
                        {formatStatus(readVisibleFinanceStatus(entry) ?? entry.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                      <span>
                        {c.createdAt}: {formatDateTime(entry.createdAt)}
                      </span>
                      <span>
                        {c.reference}: {entry.submittedTxHash ?? c.unknown}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
