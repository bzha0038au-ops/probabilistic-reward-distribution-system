import {
  economyLedgerEntries,
  freezeRecords,
  giftPackCatalog,
  iapProducts,
  storePurchaseOrders,
  storePurchaseReceipts,
  userAssetBalances,
} from '@reward/database';
import { and, asc, eq } from '@reward/database/orm';
import { debitAsset } from '../modules/economy/service';

import {
  buildUserAuthHeaders,
  describeIntegrationSuite,
  expect,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  seedUserWithWallet,
} from './integration-test-support';

describeIntegrationSuite('backend economy iap integration', () => {
  it('lists active iap products by store channel and delivery type', async () => {
    await getDb().insert(iapProducts).values([
      {
        sku: 'reward.ios.voucher.small',
        storeChannel: 'ios',
        deliveryType: 'voucher',
        assetCode: 'IAP_VOUCHER',
        assetAmount: '6.00',
        isActive: true,
      },
      {
        sku: 'reward.ios.gift-pack.flower',
        storeChannel: 'ios',
        deliveryType: 'gift_pack',
        isActive: true,
      },
      {
        sku: 'reward.android.voucher.small',
        storeChannel: 'android',
        deliveryType: 'voucher',
        assetCode: 'IAP_VOUCHER',
        assetAmount: '6.00',
        isActive: true,
      },
      {
        sku: 'reward.ios.voucher.retired',
        storeChannel: 'ios',
        deliveryType: 'voucher',
        assetCode: 'IAP_VOUCHER',
        assetAmount: '3.00',
        isActive: false,
      },
    ]);

    const user = await seedUserWithWallet({
      email: 'iap-products-user@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'GET',
      url: '/iap/products?storeChannel=ios&deliveryType=voucher',
      headers: buildUserAuthHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({
        sku: 'reward.ios.voucher.small',
        storeChannel: 'ios',
        deliveryType: 'voucher',
        assetCode: 'IAP_VOUCHER',
        assetAmount: '6.00',
      }),
    ]);
  });

  it('lists active gift pack catalog items by store channel', async () => {
    const [product] = await getDb()
      .insert(iapProducts)
      .values({
        sku: 'reward.ios.gift-pack.rose',
        storeChannel: 'ios',
        deliveryType: 'gift_pack',
        isActive: true,
      })
      .returning({
        id: iapProducts.id,
      });

    await getDb().insert(giftPackCatalog).values({
      code: 'rose_small_ios',
      iapProductId: product!.id,
      rewardAssetCode: 'B_LUCK',
      rewardAmount: '18.00',
      isActive: true,
    });

    const user = await seedUserWithWallet({
      email: 'gift-pack-products-user@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const response = await getApp().inject({
      method: 'GET',
      url: '/gift-packs/catalog?storeChannel=ios',
      headers: buildUserAuthHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({
        giftPack: expect.objectContaining({
          code: 'rose_small_ios',
          rewardAssetCode: 'B_LUCK',
          rewardAmount: '18.00',
        }),
        product: expect.objectContaining({
          sku: 'reward.ios.gift-pack.rose',
          storeChannel: 'ios',
          deliveryType: 'gift_pack',
        }),
      }),
    ]);
  });

  it('verifies an ios voucher purchase and fulfills IAP_VOUCHER exactly once', async () => {
    await getDb().insert(iapProducts).values({
      sku: 'reward.ios.voucher.medium',
      storeChannel: 'ios',
      deliveryType: 'voucher',
      assetCode: 'IAP_VOUCHER',
      assetAmount: '12.50',
      isActive: true,
      metadata: {
        bucket: 'medium',
      },
    });

    const user = await seedUserWithWallet({
      email: 'iap-verify-ios@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const requestPayload = {
      idempotencyKey: 'iap-ios-verify-1',
      storeChannel: 'ios' as const,
      sku: 'reward.ios.voucher.medium',
      receipt: {
        externalTransactionId: 'ios-transaction-001',
        rawPayload: {
          environment: 'Sandbox',
        },
      },
    };

    const firstResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/purchases/verify',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: requestPayload,
    });
    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json().data).toMatchObject({
      replayed: false,
      fulfillment: {
        assetCode: 'IAP_VOUCHER',
        amount: '12.50',
        replayed: false,
      },
      order: expect.objectContaining({
        status: 'fulfilled',
        storeChannel: 'ios',
      }),
      receipt: expect.objectContaining({
        externalTransactionId: 'ios-transaction-001',
      }),
    });

    const replayResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/purchases/verify',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: requestPayload,
    });
    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json().data).toMatchObject({
      replayed: true,
      fulfillment: {
        assetCode: 'IAP_VOUCHER',
        amount: '12.50',
        replayed: true,
      },
    });

    const [voucherBalance] = await getDb()
      .select({
        availableBalance: userAssetBalances.availableBalance,
        lifetimeEarned: userAssetBalances.lifetimeEarned,
      })
      .from(userAssetBalances)
      .where(
        and(
          eq(userAssetBalances.userId, user.id),
          eq(userAssetBalances.assetCode, 'IAP_VOUCHER'),
        ),
      )
      .limit(1);

    expect(voucherBalance).toEqual({
      availableBalance: '12.50',
      lifetimeEarned: '12.50',
    });

    const ledgerRows = await getDb()
      .select({
        entryType: economyLedgerEntries.entryType,
        amount: economyLedgerEntries.amount,
      })
      .from(economyLedgerEntries)
      .where(eq(economyLedgerEntries.userId, user.id))
      .orderBy(asc(economyLedgerEntries.id));

    expect(ledgerRows).toEqual([
      {
        entryType: 'iap_purchase_fulfill',
        amount: '12.50',
      },
    ]);

    const orders = await getDb()
      .select({
        id: storePurchaseOrders.id,
        status: storePurchaseOrders.status,
      })
      .from(storePurchaseOrders)
      .where(eq(storePurchaseOrders.userId, user.id))
      .orderBy(asc(storePurchaseOrders.id));

    const receipts = await getDb()
      .select({
        orderId: storePurchaseReceipts.orderId,
        externalTransactionId: storePurchaseReceipts.externalTransactionId,
      })
      .from(storePurchaseReceipts)
      .orderBy(asc(storePurchaseReceipts.id));

    expect(orders).toEqual([
      {
        id: orders[0]!.id,
        status: 'fulfilled',
      },
    ]);
    expect(receipts).toEqual([
      {
        orderId: orders[0]!.id,
        externalTransactionId: 'ios-transaction-001',
      },
    ]);
  });

  it('completes a gift pack purchase and delivers B_LUCK to the recipient exactly once', async () => {
    const [product] = await getDb()
      .insert(iapProducts)
      .values({
        sku: 'reward.ios.gift-pack.rose',
        storeChannel: 'ios',
        deliveryType: 'gift_pack',
        isActive: true,
      })
      .returning({
        id: iapProducts.id,
      });

    await getDb().insert(giftPackCatalog).values({
      code: 'rose_small_ios',
      iapProductId: product!.id,
      rewardAssetCode: 'B_LUCK',
      rewardAmount: '18.00',
      isActive: true,
    });

    const purchaser = await seedUserWithWallet({
      email: 'gift-pack-purchaser@example.com',
    });
    const recipient = await seedUserWithWallet({
      email: 'gift-pack-recipient@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: purchaser.id,
      email: purchaser.email,
      role: 'user',
    });

    const requestPayload = {
      idempotencyKey: 'gift-pack-ios-complete-1',
      storeChannel: 'ios' as const,
      sku: 'reward.ios.gift-pack.rose',
      recipientUserId: recipient.id,
      receipt: {
        externalTransactionId: 'ios-gift-pack-transaction-001',
        rawPayload: {
          environment: 'Sandbox',
        },
      },
    };

    const firstResponse = await getApp().inject({
      method: 'POST',
      url: '/gift-packs/purchase/complete',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: requestPayload,
    });
    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json().data).toMatchObject({
      replayed: false,
      fulfillment: {
        assetCode: 'B_LUCK',
        amount: '18.00',
        replayed: false,
      },
      order: expect.objectContaining({
        userId: purchaser.id,
        recipientUserId: recipient.id,
        status: 'fulfilled',
      }),
      product: expect.objectContaining({
        deliveryType: 'gift_pack',
      }),
    });

    const replayResponse = await getApp().inject({
      method: 'POST',
      url: '/gift-packs/purchase/complete',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: requestPayload,
    });
    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json().data).toMatchObject({
      replayed: true,
      fulfillment: {
        assetCode: 'B_LUCK',
        amount: '18.00',
        replayed: true,
      },
    });

    const [recipientBalance] = await getDb()
      .select({
        availableBalance: userAssetBalances.availableBalance,
        lifetimeEarned: userAssetBalances.lifetimeEarned,
      })
      .from(userAssetBalances)
      .where(
        and(
          eq(userAssetBalances.userId, recipient.id),
          eq(userAssetBalances.assetCode, 'B_LUCK'),
        ),
      )
      .limit(1);

    expect(recipientBalance).toEqual({
      availableBalance: '18.00',
      lifetimeEarned: '18.00',
    });

    const ledgerRows = await getDb()
      .select({
        entryType: economyLedgerEntries.entryType,
        amount: economyLedgerEntries.amount,
      })
      .from(economyLedgerEntries)
      .where(eq(economyLedgerEntries.userId, recipient.id))
      .orderBy(asc(economyLedgerEntries.id));

    expect(ledgerRows).toEqual([
      {
        entryType: 'gift_pack_receive',
        amount: '18.00',
      },
    ]);
  });

  it('treats a repeated android purchase token as a replay even with a new idempotency key', async () => {
    await getDb().insert(iapProducts).values({
      sku: 'reward.android.voucher.large',
      storeChannel: 'android',
      deliveryType: 'voucher',
      assetCode: 'IAP_VOUCHER',
      assetAmount: '25.00',
      isActive: true,
    });

    const user = await seedUserWithWallet({
      email: 'iap-verify-android@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const firstResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/purchases/verify',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: 'iap-android-verify-1',
        storeChannel: 'android',
        sku: 'reward.android.voucher.large',
        receipt: {
          purchaseToken: 'purchase-token-001',
          orderId: 'GPA.1111-2222-3333-44444',
          rawPayload: {
            productId: 'reward.android.voucher.large',
          },
        },
      },
    });
    expect(firstResponse.statusCode).toBe(201);

    const replayedReceiptResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/purchases/verify',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: 'iap-android-verify-2',
        storeChannel: 'android',
        sku: 'reward.android.voucher.large',
        receipt: {
          purchaseToken: 'purchase-token-001',
          orderId: 'GPA.1111-2222-3333-44444',
          rawPayload: {
            productId: 'reward.android.voucher.large',
          },
        },
      },
    });

    expect(replayedReceiptResponse.statusCode).toBe(200);
    expect(replayedReceiptResponse.json().data).toMatchObject({
      replayed: true,
      fulfillment: {
        assetCode: 'IAP_VOUCHER',
        amount: '25.00',
        replayed: true,
      },
    });

    const assetRows = await getDb()
      .select({
        assetCode: userAssetBalances.assetCode,
        availableBalance: userAssetBalances.availableBalance,
      })
      .from(userAssetBalances)
      .where(eq(userAssetBalances.userId, user.id))
      .orderBy(asc(userAssetBalances.id));

    expect(assetRows).toEqual([
      {
        assetCode: 'B_LUCK',
        availableBalance: '0.00',
      },
      {
        assetCode: 'IAP_VOUCHER',
        availableBalance: '25.00',
      },
    ]);

    const orders = await getDb()
      .select({
        id: storePurchaseOrders.id,
        status: storePurchaseOrders.status,
        idempotencyKey: storePurchaseOrders.idempotencyKey,
      })
      .from(storePurchaseOrders)
      .where(eq(storePurchaseOrders.userId, user.id))
      .orderBy(asc(storePurchaseOrders.id));

    expect(orders).toEqual([
      expect.objectContaining({
        status: 'fulfilled',
        idempotencyKey: 'iap-android-verify-1',
      }),
    ]);
  });

  it('reverses a fulfilled android voucher purchase when Google sends a voided purchase notification', async () => {
    await getDb().insert(iapProducts).values({
      sku: 'reward.android.voucher.refundable',
      storeChannel: 'android',
      deliveryType: 'voucher',
      assetCode: 'IAP_VOUCHER',
      assetAmount: '18.00',
      isActive: true,
    });

    const user = await seedUserWithWallet({
      email: 'iap-google-refund@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const verifyResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/purchases/verify',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: 'iap-android-refund-1',
        storeChannel: 'android',
        sku: 'reward.android.voucher.refundable',
        receipt: {
          purchaseToken: 'purchase-token-refund-001',
          orderId: 'GPA.5555-6666-7777-88888',
          rawPayload: {
            productId: 'reward.android.voucher.refundable',
          },
        },
      },
    });
    expect(verifyResponse.statusCode).toBe(201);

    const notificationPayload = Buffer.from(
      JSON.stringify({
        version: '1.0',
        packageName: 'com.reward.app',
        eventTimeMillis: '1714464000000',
        voidedPurchaseNotification: {
          orderId: 'GPA.5555-6666-7777-88888',
          productType: 2,
          purchaseToken: 'purchase-token-refund-001',
          refundType: 1,
        },
      })
    ).toString('base64');

    const notificationResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/notifications/google',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        message: {
          data: notificationPayload,
          messageId: 'google-rtdn-message-1',
        },
        subscription: 'projects/test/subscriptions/reward-google-rtdn',
      },
    });

    expect(notificationResponse.statusCode).toBe(200);
    expect(notificationResponse.json().data).toMatchObject({
      accepted: true,
      ignored: false,
      orderStatus: 'refunded',
      replayed: false,
    });

    const [voucherBalance] = await getDb()
      .select({
        availableBalance: userAssetBalances.availableBalance,
      })
      .from(userAssetBalances)
      .where(
        and(
          eq(userAssetBalances.userId, user.id),
          eq(userAssetBalances.assetCode, 'IAP_VOUCHER')
        )
      )
      .limit(1);

    expect(voucherBalance).toEqual({
      availableBalance: '0.00',
    });

    const ledgerRows = await getDb()
      .select({
        entryType: economyLedgerEntries.entryType,
        amount: economyLedgerEntries.amount,
      })
      .from(economyLedgerEntries)
      .where(eq(economyLedgerEntries.userId, user.id))
      .orderBy(asc(economyLedgerEntries.id));

    expect(ledgerRows).toEqual([
      {
        entryType: 'iap_purchase_fulfill',
        amount: '18.00',
      },
      {
        entryType: 'iap_purchase_refund_reversal',
        amount: '-18.00',
      },
    ]);
  });

  it('freezes gameplay when a refunded android voucher cannot be fully reversed', async () => {
    await getDb().insert(iapProducts).values({
      sku: 'reward.android.voucher.freeze',
      storeChannel: 'android',
      deliveryType: 'voucher',
      assetCode: 'IAP_VOUCHER',
      assetAmount: '9.00',
      isActive: true,
    });

    const user = await seedUserWithWallet({
      email: 'iap-google-freeze@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: 'user',
    });

    const verifyResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/purchases/verify',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: 'iap-android-freeze-1',
        storeChannel: 'android',
        sku: 'reward.android.voucher.freeze',
        receipt: {
          purchaseToken: 'purchase-token-freeze-001',
          orderId: 'GPA.9999-0000-1111-22222',
          rawPayload: {
            productId: 'reward.android.voucher.freeze',
          },
        },
      },
    });
    expect(verifyResponse.statusCode).toBe(201);

    await debitAsset({
      userId: user.id,
      assetCode: 'IAP_VOUCHER',
      amount: '9.00',
      entryType: 'iap_voucher_spend_test',
      referenceType: 'integration_test',
      referenceId: 1,
      audit: {
        actorType: 'system',
        idempotencyKey: 'iap-voucher-spend-test-1',
      },
    });

    const notificationPayload = Buffer.from(
      JSON.stringify({
        version: '1.0',
        packageName: 'com.reward.app',
        eventTimeMillis: '1714464000001',
        voidedPurchaseNotification: {
          orderId: 'GPA.9999-0000-1111-22222',
          productType: 2,
          purchaseToken: 'purchase-token-freeze-001',
          refundType: 1,
        },
      })
    ).toString('base64');

    const notificationResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/notifications/google',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        message: {
          data: notificationPayload,
          messageId: 'google-rtdn-message-2',
        },
      },
    });

    expect(notificationResponse.statusCode).toBe(200);
    expect(notificationResponse.json().data).toMatchObject({
      accepted: true,
      ignored: false,
      orderStatus: 'refunded',
    });

    const freezes = await getDb()
      .select({
        scope: freezeRecords.scope,
        reason: freezeRecords.reason,
      })
      .from(freezeRecords)
      .where(eq(freezeRecords.userId, user.id))
      .orderBy(asc(freezeRecords.id));

    expect(freezes).toContainEqual({
      scope: 'gameplay_lock',
      reason: 'gameplay_lock',
    });
  });

  it('reverses a fulfilled android gift pack when Google sends a voided purchase notification', async () => {
    const [product] = await getDb()
      .insert(iapProducts)
      .values({
        sku: 'reward.android.gift-pack.rose',
        storeChannel: 'android',
        deliveryType: 'gift_pack',
        isActive: true,
      })
      .returning({
        id: iapProducts.id,
      });

    await getDb().insert(giftPackCatalog).values({
      code: 'rose_small_android',
      iapProductId: product!.id,
      rewardAssetCode: 'B_LUCK',
      rewardAmount: '18.00',
      isActive: true,
    });

    const purchaser = await seedUserWithWallet({
      email: 'gift-pack-android-purchaser@example.com',
    });
    const recipient = await seedUserWithWallet({
      email: 'gift-pack-android-recipient@example.com',
    });
    const { token } = await getCreateUserSessionToken()({
      userId: purchaser.id,
      email: purchaser.email,
      role: 'user',
    });

    const verifyResponse = await getApp().inject({
      method: 'POST',
      url: '/gift-packs/purchase/complete',
      headers: {
        ...buildUserAuthHeaders(token),
        'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: 'gift-pack-android-refund-1',
        storeChannel: 'android',
        sku: 'reward.android.gift-pack.rose',
        recipientUserId: recipient.id,
        receipt: {
          purchaseToken: 'gift-pack-purchase-token-001',
          orderId: 'GPA.1111-0000-2222-33333',
          rawPayload: {
            productId: 'reward.android.gift-pack.rose',
          },
        },
      },
    });
    expect(verifyResponse.statusCode).toBe(201);

    const notificationPayload = Buffer.from(
      JSON.stringify({
        version: '1.0',
        packageName: 'com.reward.app',
        eventTimeMillis: '1714464000002',
        voidedPurchaseNotification: {
          orderId: 'GPA.1111-0000-2222-33333',
          productType: 2,
          purchaseToken: 'gift-pack-purchase-token-001',
          refundType: 1,
        },
      })
    ).toString('base64');

    const notificationResponse = await getApp().inject({
      method: 'POST',
      url: '/iap/notifications/google',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        message: {
          data: notificationPayload,
          messageId: 'google-rtdn-gift-pack-1',
        },
      },
    });

    expect(notificationResponse.statusCode).toBe(200);
    expect(notificationResponse.json().data).toMatchObject({
      accepted: true,
      ignored: false,
      orderStatus: 'refunded',
      replayed: false,
    });

    const [recipientBalance] = await getDb()
      .select({
        availableBalance: userAssetBalances.availableBalance,
      })
      .from(userAssetBalances)
      .where(
        and(
          eq(userAssetBalances.userId, recipient.id),
          eq(userAssetBalances.assetCode, 'B_LUCK'),
        ),
      )
      .limit(1);

    expect(recipientBalance).toEqual({
      availableBalance: '0.00',
    });

    const ledgerRows = await getDb()
      .select({
        entryType: economyLedgerEntries.entryType,
        amount: economyLedgerEntries.amount,
      })
      .from(economyLedgerEntries)
      .where(eq(economyLedgerEntries.userId, recipient.id))
      .orderBy(asc(economyLedgerEntries.id));

    expect(ledgerRows).toEqual([
      {
        entryType: 'gift_pack_receive',
        amount: '18.00',
      },
      {
        entryType: 'gift_pack_refund_reversal',
        amount: '-18.00',
      },
    ]);
  });
});
