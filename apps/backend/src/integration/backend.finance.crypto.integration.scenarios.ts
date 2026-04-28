import {
  buildAdminBreakGlassHeaders,
  enrollAdminMfa,
  FINANCE_ADMIN_PERMISSION_KEYS,
  getApp,
  getCreateUserSessionToken,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  seedAdminAccount,
  seedUserWithWallet,
  verifyUserContacts,
} from './integration-test-support';
import { and, asc, desc, eq, inArray } from '@reward/database/orm';
import { expect } from 'vitest';
import {
  cryptoChainTransactions,
  cryptoDepositChannels,
  cryptoWithdrawAddresses,
  deposits,
  ledgerEntries,
  userWallets,
  withdrawals,
} from '@reward/database';

export function registerFinanceCryptoScenarios() {
  it('POST /crypto-deposits creates a requested crypto deposit and prevents duplicate tx claims', async () => {
    const [channel] = await getDb()
      .insert(cryptoDepositChannels)
      .values({
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        receiveAddress: '0xrewarddeposit000000000000000000000000000001',
        minConfirmations: 3,
        isActive: true,
      })
      .returning();

    const user = await seedUserWithWallet({
      email: 'crypto-deposit@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'POST',
      url: '/crypto-deposits',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        channelId: channel.id,
        amountClaimed: '25.75',
        txHash: '0xcryptoDeposit0001',
        fromAddress: '0xfrom0001',
      },
    });

    expect(response.statusCode).toBe(201);

    const [deposit] = await getDb()
      .select({
        id: deposits.id,
        status: deposits.status,
        channelType: deposits.channelType,
        assetType: deposits.assetType,
        assetCode: deposits.assetCode,
        network: deposits.network,
        submittedTxHash: deposits.submittedTxHash,
      })
      .from(deposits)
      .where(eq(deposits.userId, user.id))
      .orderBy(desc(deposits.id))
      .limit(1);

    expect(deposit).toMatchObject({
      status: 'requested',
      channelType: 'crypto',
      assetType: 'token',
      assetCode: 'USDT',
      network: 'ERC20',
      submittedTxHash: '0xcryptoDeposit0001',
    });

    const [chainTransaction] = await getDb()
      .select({
        txHash: cryptoChainTransactions.txHash,
        direction: cryptoChainTransactions.direction,
        amount: cryptoChainTransactions.amount,
        confirmations: cryptoChainTransactions.confirmations,
        consumedByDepositId: cryptoChainTransactions.consumedByDepositId,
      })
      .from(cryptoChainTransactions)
      .where(eq(cryptoChainTransactions.txHash, '0xcryptoDeposit0001'))
      .limit(1);

    expect(chainTransaction).toMatchObject({
      txHash: '0xcryptoDeposit0001',
      direction: 'deposit',
      amount: '25.750000000000000000',
      confirmations: 0,
      consumedByDepositId: deposit?.id,
    });

    const duplicate = await getApp().inject({
      method: 'POST',
      url: '/crypto-deposits',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        channelId: channel.id,
        amountClaimed: '25.75',
        txHash: '0xcryptoDeposit0001',
      },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error?.message).toContain('already been claimed');
  });

  it('crypto payout addresses and withdrawals reuse the common withdrawal order flow', async () => {
    const user = await seedUserWithWallet({
      email: 'crypto-withdrawal@example.com',
      withdrawableBalance: '100.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const createAddress = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdraw-addresses',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        address: '0xwithdrawaddress000000000000000000000000000001',
        label: 'Primary wallet',
        isDefault: true,
      },
    });

    expect(createAddress.statusCode).toBe(201);
    const payoutMethodId = createAddress.json().data?.payoutMethodId as number;
    expect(payoutMethodId).toBeTruthy();

    const createWithdrawalResponse = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdrawals',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: '40.00',
        payoutMethodId,
      },
    });

    expect(createWithdrawalResponse.statusCode).toBe(201);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '60.00',
      lockedBalance: '40.00',
    });

    const [storedAddress] = await getDb()
      .select({
        payoutMethodId: cryptoWithdrawAddresses.payoutMethodId,
        address: cryptoWithdrawAddresses.address,
      })
      .from(cryptoWithdrawAddresses)
      .where(eq(cryptoWithdrawAddresses.payoutMethodId, payoutMethodId))
      .limit(1);

    expect(storedAddress?.address).toBe(
      '0xwithdrawaddress000000000000000000000000000001'
    );

    const [storedWithdrawal] = await getDb()
      .select({
        status: withdrawals.status,
        channelType: withdrawals.channelType,
        assetType: withdrawals.assetType,
        assetCode: withdrawals.assetCode,
        network: withdrawals.network,
        payoutMethodId: withdrawals.payoutMethodId,
      })
      .from(withdrawals)
      .where(eq(withdrawals.userId, user.id))
      .orderBy(desc(withdrawals.id))
      .limit(1);

    expect(storedWithdrawal).toMatchObject({
      status: 'requested',
      channelType: 'crypto',
      assetType: 'token',
      assetCode: 'USDT',
      network: 'ERC20',
      payoutMethodId,
    });
  });

  it('admin crypto deposit confirmation credits the wallet after chain review', async () => {
    const [channel] = await getDb()
      .insert(cryptoDepositChannels)
      .values({
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        receiveAddress: '0xrewarddeposit000000000000000000000000000002',
        minConfirmations: 3,
        isActive: true,
      })
      .returning();

    const user = await seedUserWithWallet({
      email: 'crypto-admin-deposit@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const depositResponse = await getApp().inject({
      method: 'POST',
      url: '/crypto-deposits',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        channelId: channel.id,
        amountClaimed: '18.25',
        txHash: '0xcryptoDepositConfirm0001',
        fromAddress: '0xfromconfirm0001',
      },
    });

    expect(depositResponse.statusCode).toBe(201);
    const depositId = depositResponse.json().data?.id as number;

    const email = 'crypto-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });
    const headers = buildAdminBreakGlassHeaders(adminSession.token);

    const confirmResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/deposits/${depositId}/crypto-confirm`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        settlementReference: '0xcryptoDepositConfirm0001',
        processingChannel: 'manual_crypto',
        operatorNote: 'confirmed on chain',
        confirmations: 3,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet?.withdrawableBalance).toBe('18.25');

    const [deposit] = await getDb()
      .select({
        status: deposits.status,
      })
      .from(deposits)
      .where(eq(deposits.id, depositId))
      .limit(1);

    expect(deposit?.status).toBe('credited');

    const [chainTransaction] = await getDb()
      .select({
        confirmations: cryptoChainTransactions.confirmations,
      })
      .from(cryptoChainTransactions)
      .where(eq(cryptoChainTransactions.txHash, '0xcryptoDepositConfirm0001'))
      .limit(1);

    expect(chainTransaction?.confirmations).toBe(3);

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          eq(ledgerEntries.entryType, 'deposit_credit')
        )
      )
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([{ entryType: 'deposit_credit', amount: '18.25' }]);
  });

  it('admin crypto withdrawal submit and confirm flows settle through the common withdrawal FSM', async () => {
    const user = await seedUserWithWallet({
      email: 'crypto-admin-withdrawal@example.com',
      withdrawableBalance: '90.00',
    });
    await verifyUserContacts(user.id, { email: true, phone: true });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const createAddress = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdraw-addresses',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        chain: 'Ethereum',
        network: 'ERC20',
        token: 'USDT',
        address: '0xwithdrawaddress000000000000000000000000000002',
        label: 'Treasury wallet',
        isDefault: true,
      },
    });
    const payoutMethodId = createAddress.json().data?.payoutMethodId as number;

    const createWithdrawalResponse = await getApp().inject({
      method: 'POST',
      url: '/crypto-withdrawals',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        amount: '30.00',
        payoutMethodId,
      },
    });

    expect(createWithdrawalResponse.statusCode).toBe(201);
    const withdrawalId = createWithdrawalResponse.json().data?.id as number;

    const email = 'crypto-withdraw-admin@example.com';
    const { admin, password } = await seedAdminAccount({ email });
    await grantAdminPermissions(admin.id, FINANCE_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({ email, password });
    const headers = buildAdminBreakGlassHeaders(adminSession.token);

    const approveResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${withdrawalId}/approve`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        operatorNote: 'approved for payout',
      },
    });
    expect(approveResponse.statusCode).toBe(200);

    const submitResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${withdrawalId}/crypto-submit`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        settlementReference: '0xcryptoWithdrawal0001',
        processingChannel: 'manual_crypto',
        operatorNote: 'broadcasted tx',
      },
    });
    expect(submitResponse.statusCode).toBe(200);

    const confirmResponse = await getApp().inject({
      method: 'PATCH',
      url: `/admin/withdrawals/${withdrawalId}/crypto-confirm`,
      headers,
      payload: {
        totpCode: adminSession.totpCode,
        settlementReference: '0xcryptoWithdrawal0001',
        processingChannel: 'manual_crypto',
        operatorNote: 'confirmations reached',
        confirmations: 6,
      },
    });
    expect(confirmResponse.statusCode).toBe(200);

    const [wallet] = await getDb()
      .select({
        withdrawableBalance: userWallets.withdrawableBalance,
        lockedBalance: userWallets.lockedBalance,
      })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);

    expect(wallet).toEqual({
      withdrawableBalance: '60.00',
      lockedBalance: '0.00',
    });

    const [withdrawal] = await getDb()
      .select({
        status: withdrawals.status,
        submittedTxHash: withdrawals.submittedTxHash,
      })
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    expect(withdrawal).toMatchObject({
      status: 'paid',
      submittedTxHash: '0xcryptoWithdrawal0001',
    });

    const [chainTransaction] = await getDb()
      .select({
        txHash: cryptoChainTransactions.txHash,
        confirmations: cryptoChainTransactions.confirmations,
        consumedByWithdrawalId: cryptoChainTransactions.consumedByWithdrawalId,
      })
      .from(cryptoChainTransactions)
      .where(eq(cryptoChainTransactions.txHash, '0xcryptoWithdrawal0001'))
      .limit(1);

    expect(chainTransaction).toMatchObject({
      txHash: '0xcryptoWithdrawal0001',
      confirmations: 6,
      consumedByWithdrawalId: withdrawalId,
    });

    const entries = await getDb()
      .select({
        entryType: ledgerEntries.entryType,
        amount: ledgerEntries.amount,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          inArray(ledgerEntries.entryType, ['withdraw_request', 'withdraw_paid'])
        )
      )
      .orderBy(asc(ledgerEntries.id));

    expect(entries).toEqual([
      { entryType: 'withdraw_request', amount: '-30.00' },
      { entryType: 'withdraw_paid', amount: '-30.00' },
    ]);
  });
}
