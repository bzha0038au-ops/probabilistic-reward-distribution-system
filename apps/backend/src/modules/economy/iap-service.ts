import { createHash } from 'node:crypto';

import {
  giftPackCatalog,
  freezeRecords,
  iapProducts,
  storePurchaseOrders,
  storePurchaseReceipts,
  users,
} from '@reward/database';
import { and, desc, eq, inArray, or } from '@reward/database/orm';
import { API_ERROR_CODES } from '@reward/shared-types/api';
import type {
  AssetCode,
  IapProductListQuery,
  StoreChannel,
  StorePurchaseStatus,
  VerifyIapPurchaseRequest,
  VerifyIapPurchaseResponse,
} from '@reward/shared-types/economy';

import { db, type DbClient, type DbTransaction } from '../../db';
import { context } from '../../shared/context';
import { getConfig } from '../../shared/config';
import {
  conflictError,
  notFoundError,
  persistenceError,
  serviceUnavailableError,
  toAppError,
  unauthorizedError,
  unprocessableEntityError,
} from '../../shared/errors';
import { toMoneyString } from '../../shared/money';
import {
  recordGiftPackDelivered,
  recordIapPurchaseFulfillmentFailed,
  recordIapPurchaseVerified,
} from '../../shared/observability';
import { ensureUserFreeze } from '../risk/service';
import {
  processAppleServerNotification,
  type AppleNotificationSnapshot,
  type VerifiedApplePurchase,
  isAppleIapVerificationConfigured,
  verifyAppleStorePurchase,
} from './iap-apple';
import {
  acknowledgeGooglePlayPurchase,
  assertGooglePlayNotificationAuthorized,
  processGooglePlayNotification as parseGooglePlayNotification,
  type GoogleNotificationSnapshot,
  type VerifiedGooglePurchase,
  isGooglePlayVerificationConfigured,
  verifyGooglePlayPurchase,
} from './iap-google';
import {
  creditAsset,
  debitAsset,
  ensureUserAssetBalances,
  type EconomyAuditContext,
} from './service';

type DbExecutor = DbClient | DbTransaction;

type IapProductRow = typeof iapProducts.$inferSelect;
type GiftPackCatalogRow = typeof giftPackCatalog.$inferSelect;
type StorePurchaseOrderRow = typeof storePurchaseOrders.$inferSelect;
type StorePurchaseReceiptRow = typeof storePurchaseReceipts.$inferSelect;

type VerifyPurchaseAuditContext = Omit<EconomyAuditContext, 'idempotencyKey'>;

type VerifiedReceiptSnapshot = {
  externalOrderId: string | null;
  externalTransactionId: string | null;
  purchaseToken: string | null;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  needsAcknowledgement: boolean;
  storeState: 'purchased' | 'pending' | 'cancelled' | 'refunded' | 'revoked';
};

type NotificationProcessResult = {
  accepted: true;
  eventType: string | null;
  ignored: boolean;
  matchedOrderId: number | null;
  orderStatus: StorePurchaseStatus | null;
  replayed: boolean;
};

const FINAL_STATUSES = new Set<StorePurchaseStatus>([
  'refunded',
  'revoked',
  'reversed',
]);
const LOCAL_STUB_VERIFICATION_MODE = 'local_stub';

const withExecutor = async <T>(
  executor: DbExecutor,
  callback: (tx: DbTransaction | DbExecutor) => Promise<T>
) => {
  if (executor === db) {
    return db.transaction(async (tx) => callback(tx));
  }

  return callback(executor);
};

const resolveAuditContext = (input?: EconomyAuditContext | null) => {
  const store = context().getStore();

  return {
    actorType: input?.actorType ?? store?.role ?? 'system',
    actorId: input?.actorId ?? store?.userId ?? null,
    sourceApp: input?.sourceApp ?? null,
    deviceFingerprint: input?.deviceFingerprint ?? null,
    requestId: input?.requestId ?? store?.requestId ?? null,
    idempotencyKey: input?.idempotencyKey ?? null,
    metadata: input?.metadata ?? null,
  };
};

const resolveValidDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
};

const toRecord = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const readTrimmedString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const mergeRecords = (
  base: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown> | null | undefined
) => ({
  ...(base ?? {}),
  ...(extra ?? {}),
});

const isManualApprovalRequiredMetadata = (
  value: Record<string, unknown> | null | undefined
) =>
  value?.manualApprovalRequired === true ||
  readTrimmedString(value?.verificationMode) === LOCAL_STUB_VERIFICATION_MODE;

const serializeIapProduct = (product: IapProductRow) => ({
  id: product.id,
  sku: product.sku,
  storeChannel: product.storeChannel,
  deliveryType: product.deliveryType,
  assetCode: (product.assetCode as AssetCode | null) ?? null,
  assetAmount: product.assetAmount ? toMoneyString(product.assetAmount) : null,
  deliveryContent: toRecord(product.deliveryContent),
  isActive: product.isActive,
  metadata: toRecord(product.metadata),
  createdAt: resolveValidDate(product.createdAt),
  updatedAt: resolveValidDate(product.updatedAt),
});

const serializeGiftPackCatalogRecord = (giftPack: GiftPackCatalogRow) => ({
  id: giftPack.id,
  code: giftPack.code,
  iapProductId: giftPack.iapProductId,
  rewardAssetCode: giftPack.rewardAssetCode as AssetCode,
  rewardAmount: toMoneyString(giftPack.rewardAmount ?? 0),
  deliveryContent: toRecord(giftPack.deliveryContent),
  isActive: giftPack.isActive,
  metadata: toRecord(giftPack.metadata),
  createdAt: resolveValidDate(giftPack.createdAt),
  updatedAt: resolveValidDate(giftPack.updatedAt),
});

const serializeGiftPackCatalogItem = (
  giftPack: GiftPackCatalogRow,
  product: IapProductRow
) => ({
  giftPack: serializeGiftPackCatalogRecord(giftPack),
  product: serializeIapProduct(product),
});

const serializeStorePurchaseOrder = (order: StorePurchaseOrderRow) => ({
  id: order.id,
  userId: order.userId,
  recipientUserId: order.recipientUserId ?? null,
  iapProductId: order.iapProductId,
  storeChannel: order.storeChannel,
  status: order.status,
  idempotencyKey: order.idempotencyKey,
  externalOrderId: order.externalOrderId ?? null,
  sourceApp: order.sourceApp ?? null,
  deviceFingerprint: order.deviceFingerprint ?? null,
  requestId: order.requestId ?? null,
  metadata: toRecord(order.metadata),
  createdAt: resolveValidDate(order.createdAt),
  updatedAt: resolveValidDate(order.updatedAt),
});

const serializeStorePurchaseReceipt = (receipt: StorePurchaseReceiptRow) => ({
  id: receipt.id,
  orderId: receipt.orderId,
  storeChannel: receipt.storeChannel,
  externalTransactionId: receipt.externalTransactionId ?? null,
  purchaseToken: receipt.purchaseToken ?? null,
  rawPayload: toRecord(receipt.rawPayload),
  metadata: toRecord(receipt.metadata),
  createdAt: resolveValidDate(receipt.createdAt),
  updatedAt: resolveValidDate(receipt.updatedAt),
});

const ensureStubVerificationAvailable = () => {
  const config = getConfig();

  if (config.nodeEnv === 'production') {
    throw serviceUnavailableError(
      'Store purchase verification is not configured for production.'
    );
  }

  if (!config.iapLocalStubVerificationEnabled) {
    throw serviceUnavailableError(
      'Store purchase verification is not configured. Local stub verification is disabled for this environment.'
    );
  }
};

const decodeJwtPayload = (value: string) => {
  const segments = value.split('.');
  if (segments.length < 2) {
    throw unprocessableEntityError('Invalid signedTransactionInfo.', {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }

  try {
    const decoded = Buffer.from(segments[1]!, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    const record = toRecord(parsed);
    if (!record) {
      throw new Error('Decoded payload was not an object.');
    }
    return record;
  } catch (error) {
    throw unprocessableEntityError('Invalid signedTransactionInfo.', {
      cause: error,
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }
};

const hashStablePayload = (payload: Record<string, unknown>) =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const buildRequestFingerprint = (params: {
  userId: number;
  recipientUserId: number | null;
  sku: string;
  storeChannel: StoreChannel;
  externalTransactionId: string | null;
  purchaseToken: string | null;
  externalOrderId: string | null;
}) =>
  hashStablePayload({
    userId: params.userId,
    recipientUserId: params.recipientUserId,
    sku: params.sku,
    storeChannel: params.storeChannel,
    externalTransactionId: params.externalTransactionId,
    purchaseTokenHash: params.purchaseToken
      ? hashStablePayload({ purchaseToken: params.purchaseToken })
      : null,
    externalOrderId: params.externalOrderId,
  });

const verifyApplePurchasePayloadLocally = (
  request: Extract<VerifyIapPurchaseRequest, { storeChannel: 'ios' }>
): VerifiedReceiptSnapshot => {
  const signedPayload = request.receipt.signedTransactionInfo
    ? decodeJwtPayload(request.receipt.signedTransactionInfo)
    : null;
  const signedProductId = readTrimmedString(signedPayload?.productId);
  if (signedProductId && signedProductId !== request.sku) {
    throw unprocessableEntityError('Receipt product SKU does not match.', {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }

  const externalTransactionId =
    readTrimmedString(request.receipt.externalTransactionId) ??
    readTrimmedString(signedPayload?.transactionId);
  if (!externalTransactionId) {
    throw unprocessableEntityError(
      'iOS receipts require an external transaction id.',
      {
        code: API_ERROR_CODES.FIELD_REQUIRED,
      }
    );
  }

  return {
    externalOrderId: null,
    externalTransactionId,
    purchaseToken: null,
    rawPayload: {
      ...(request.receipt.rawPayload ?? {}),
      ...(request.receipt.signedTransactionInfo
        ? { signedTransactionInfo: request.receipt.signedTransactionInfo }
        : {}),
    },
    metadata: {
      verificationMode: 'local_stub',
      storeChannel: request.storeChannel,
      originalTransactionId:
        readTrimmedString(request.receipt.originalTransactionId) ??
        readTrimmedString(signedPayload?.originalTransactionId),
      environment: readTrimmedString(signedPayload?.environment),
    },
    needsAcknowledgement: false,
    storeState: 'purchased',
  };
};

const verifyGooglePurchasePayloadLocally = (
  request: Extract<VerifyIapPurchaseRequest, { storeChannel: 'android' }>
): VerifiedReceiptSnapshot => {
  const rawProductId = readTrimmedString(request.receipt.rawPayload?.productId);
  if (rawProductId && rawProductId !== request.sku) {
    throw unprocessableEntityError('Receipt product SKU does not match.', {
      code: API_ERROR_CODES.FIELD_INVALID,
    });
  }

  return {
    externalOrderId:
      readTrimmedString(request.receipt.orderId) ??
      readTrimmedString(request.receipt.externalTransactionId),
    externalTransactionId: readTrimmedString(
      request.receipt.externalTransactionId
    ),
    purchaseToken: request.receipt.purchaseToken.trim(),
    rawPayload: {
      ...(request.receipt.rawPayload ?? {}),
      ...(request.receipt.packageName
        ? { packageName: request.receipt.packageName }
        : {}),
    },
    metadata: {
      verificationMode: 'local_stub',
      storeChannel: request.storeChannel,
      packageName: request.receipt.packageName ?? null,
    },
    needsAcknowledgement: false,
    storeState: 'purchased',
  };
};

const normalizeVerifiedApplePurchase = (
  verified: VerifiedApplePurchase
): VerifiedReceiptSnapshot => ({
  ...verified,
  needsAcknowledgement: false,
  storeState: verified.storeState,
});

const normalizeVerifiedGooglePurchase = (
  verified: VerifiedGooglePurchase
): VerifiedReceiptSnapshot => ({
  ...verified,
  needsAcknowledgement: verified.needsAcknowledgement,
  storeState: verified.storeState,
});

const verifyPurchasePayload = async (
  request: VerifyIapPurchaseRequest
): Promise<VerifiedReceiptSnapshot> => {
  if (request.storeChannel === 'ios') {
    if (isAppleIapVerificationConfigured()) {
      return normalizeVerifiedApplePurchase(await verifyAppleStorePurchase(request));
    }

    ensureStubVerificationAvailable();
    return verifyApplePurchasePayloadLocally(request);
  }

  if (isGooglePlayVerificationConfigured()) {
    return normalizeVerifiedGooglePurchase(await verifyGooglePlayPurchase(request));
  }

  ensureStubVerificationAvailable();
  return verifyGooglePurchasePayloadLocally(request);
};

const getLatestReceiptForOrder = async (executor: DbExecutor, orderId: number) => {
  const [receipt] = await executor
    .select()
    .from(storePurchaseReceipts)
    .where(eq(storePurchaseReceipts.orderId, orderId))
    .orderBy(
      desc(storePurchaseReceipts.createdAt),
      desc(storePurchaseReceipts.id)
    )
    .limit(1);

  return receipt ?? null;
};

const loadPurchaseSnapshot = async (
  executor: DbExecutor,
  order: StorePurchaseOrderRow,
  replayed: boolean
): Promise<VerifyIapPurchaseResponse> => {
  const [product] = await executor
    .select()
    .from(iapProducts)
    .where(eq(iapProducts.id, order.iapProductId))
    .limit(1);
  const receipt = await getLatestReceiptForOrder(executor, order.id);

  if (!product || !receipt) {
    throw persistenceError('Store purchase snapshot is incomplete.');
  }

  const giftPack =
    product.deliveryType === 'gift_pack'
      ? await getActiveGiftPackForProduct(executor, product.id)
      : null;

  const fulfillment =
    order.status === 'fulfilled' &&
    product.deliveryType === 'voucher' &&
    product.assetCode === 'IAP_VOUCHER' &&
    product.assetAmount
      ? {
          assetCode: 'IAP_VOUCHER' as const,
          amount: toMoneyString(product.assetAmount),
          replayed,
        }
      : order.status === 'fulfilled' &&
          product.deliveryType === 'gift_pack' &&
          giftPack
        ? {
            assetCode: giftPack.rewardAssetCode as AssetCode,
            amount: toMoneyString(giftPack.rewardAmount),
            replayed,
          }
        : null;

  return {
    order: serializeStorePurchaseOrder(order),
    receipt: serializeStorePurchaseReceipt(receipt),
    product: serializeIapProduct(product),
    fulfillment,
    replayed,
  };
};

const findExistingReceipt = async (
  executor: DbExecutor,
  params: {
    storeChannel: StoreChannel;
    externalTransactionId: string | null;
    purchaseToken: string | null;
  }
) => {
  const conditions = [];

  if (params.externalTransactionId) {
    conditions.push(
      and(
        eq(storePurchaseReceipts.storeChannel, params.storeChannel),
        eq(
          storePurchaseReceipts.externalTransactionId,
          params.externalTransactionId
        )
      )
    );
  }

  if (params.purchaseToken) {
    conditions.push(
      and(
        eq(storePurchaseReceipts.storeChannel, params.storeChannel),
        eq(storePurchaseReceipts.purchaseToken, params.purchaseToken)
      )
    );
  }

  if (conditions.length === 0) {
    return null;
  }

  const [receipt] = await executor
    .select()
    .from(storePurchaseReceipts)
    .where(conditions.length === 1 ? conditions[0]! : or(...conditions))
    .limit(1);

  return receipt ?? null;
};

const findOrderByStoreReference = async (
  executor: DbExecutor,
  params: {
    externalOrderId: string | null;
    externalTransactionId: string | null;
    purchaseToken: string | null;
    storeChannel: StoreChannel;
  }
) => {
  const receipt = await findExistingReceipt(executor, params);
  if (receipt) {
    const [order] = await executor
      .select()
      .from(storePurchaseOrders)
      .where(eq(storePurchaseOrders.id, receipt.orderId))
      .limit(1);

    return order ?? null;
  }

  if (!params.externalOrderId) {
    return null;
  }

  const [order] = await executor
    .select()
    .from(storePurchaseOrders)
    .where(
      and(
        eq(storePurchaseOrders.storeChannel, params.storeChannel),
        eq(storePurchaseOrders.externalOrderId, params.externalOrderId)
      )
    )
    .limit(1);

  return order ?? null;
};

const assertExistingOrderMatchesFingerprint = (
  order: StorePurchaseOrderRow,
  requestFingerprint: string
) => {
  const metadata = toRecord(order.metadata);
  const storedFingerprint = readTrimmedString(metadata?.requestFingerprint);

  if (storedFingerprint && storedFingerprint !== requestFingerprint) {
    throw conflictError('Idempotency key was reused with a different request.', {
      code: API_ERROR_CODES.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST,
    });
  }
};

const getStateConflictMessage = (
  storeState: VerifiedReceiptSnapshot['storeState']
) => {
  switch (storeState) {
    case 'pending':
      return 'Store purchase is still pending.';
    case 'cancelled':
      return 'Store purchase was cancelled.';
    case 'refunded':
      return 'Store purchase has already been refunded.';
    case 'revoked':
      return 'Store purchase has already been revoked.';
    default:
      return 'Store purchase is not fulfillable.';
  }
};

const updateLatestReceiptForOrder = async (
  executor: DbExecutor,
  orderId: number,
  payload: {
    rawPayload?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }
) => {
  const receipt = await getLatestReceiptForOrder(executor, orderId);
  if (!receipt) {
    throw persistenceError('Store purchase receipt not found.');
  }

  const [updated] = await executor
    .update(storePurchaseReceipts)
    .set({
      rawPayload: mergeRecords(toRecord(receipt.rawPayload), payload.rawPayload),
      metadata: mergeRecords(toRecord(receipt.metadata), payload.metadata),
      updatedAt: new Date(),
    })
    .where(eq(storePurchaseReceipts.id, receipt.id))
    .returning();

  return updated ?? receipt;
};

const updateStorePurchaseOrder = async (
  executor: DbExecutor,
  order: StorePurchaseOrderRow,
  update: {
    externalOrderId?: string | null;
    metadata?: Record<string, unknown> | null;
    status?: StorePurchaseStatus;
  }
) => {
  const [updated] = await executor
    .update(storePurchaseOrders)
    .set({
      ...(typeof update.status === 'string' ? { status: update.status } : {}),
      ...(update.externalOrderId !== undefined
        ? { externalOrderId: update.externalOrderId }
        : {}),
      metadata:
        update.metadata === undefined
          ? order.metadata
          : mergeRecords(toRecord(order.metadata), update.metadata),
      updatedAt: new Date(),
    })
    .where(eq(storePurchaseOrders.id, order.id))
    .returning();

  if (!updated) {
    throw persistenceError('Store purchase order update failed.');
  }

  return updated;
};

const getActiveGiftPackForProduct = async (
  executor: DbExecutor,
  iapProductId: number
) => {
  const [giftPack] = await executor
    .select()
    .from(giftPackCatalog)
    .where(
      and(
        eq(giftPackCatalog.iapProductId, iapProductId),
        eq(giftPackCatalog.isActive, true)
      )
    )
    .limit(1);

  return giftPack ?? null;
};

const assertGiftPackRecipientEligible = async (
  executor: DbExecutor,
  recipientUserId: number
) => {
  const [recipient] = await executor
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.id, recipientUserId))
    .limit(1);

  if (!recipient) {
    throw conflictError('Gift pack recipient does not exist.');
  }

  const [freeze] = await executor
    .select({ id: freezeRecords.id })
    .from(freezeRecords)
    .where(
      and(
        eq(freezeRecords.userId, recipientUserId),
        eq(freezeRecords.status, 'active'),
        inArray(freezeRecords.scope, [
          'account_lock',
          'gameplay_lock',
          'gift_lock',
        ])
      )
    )
    .limit(1);

  if (freeze) {
    throw conflictError(
      'Gift pack recipient is not eligible to receive store gifts.'
    );
  }
};

const fulfillStorePurchaseOrder = async (
  executor: DbExecutor,
  payload: {
    audit: ReturnType<typeof resolveAuditContext>;
    order: StorePurchaseOrderRow;
    product: IapProductRow;
    verifiedReceipt: VerifiedReceiptSnapshot;
  }
) => {
  const { audit, order, product, verifiedReceipt } = payload;

  const verifiedOrder = await updateStorePurchaseOrder(executor, order, {
    externalOrderId: verifiedReceipt.externalOrderId ?? order.externalOrderId,
    metadata: {
      verification: verifiedReceipt.metadata,
      verificationMode: readTrimmedString(verifiedReceipt.metadata.verificationMode),
    },
    status: 'verified',
  });
  await updateLatestReceiptForOrder(executor, order.id, {
    rawPayload: verifiedReceipt.rawPayload,
    metadata: verifiedReceipt.metadata,
  });

  if (product.deliveryType === 'gift_pack') {
    if (!order.recipientUserId) {
      throw unprocessableEntityError(
        'Gift pack purchases require a recipient user.'
      );
    }

    const giftPack = await getActiveGiftPackForProduct(executor, product.id);
    if (!giftPack) {
      throw persistenceError('Gift pack catalog item not found.');
    }

    await assertGiftPackRecipientEligible(executor, order.recipientUserId);

    const credited = await creditAsset(
      {
        userId: order.recipientUserId,
        assetCode: giftPack.rewardAssetCode as AssetCode,
        amount: toMoneyString(giftPack.rewardAmount),
        entryType: 'gift_pack_receive',
        referenceType: 'store_purchase_order',
        referenceId: order.id,
        audit: {
          actorType: audit.actorType,
          actorId: audit.actorId,
          sourceApp: audit.sourceApp,
          deviceFingerprint: audit.deviceFingerprint,
          requestId: audit.requestId,
          idempotencyKey: `store_purchase_order:${order.id}:gift_pack_fulfill`,
          metadata: {
            sku: product.sku,
            storeChannel: product.storeChannel,
            giftPackCode: giftPack.code,
            purchaserUserId: order.userId,
            recipientUserId: order.recipientUserId,
            externalTransactionId: verifiedReceipt.externalTransactionId,
            purchaseToken: verifiedReceipt.purchaseToken,
          },
        },
      },
      executor
    );

    if (
      product.storeChannel === 'android' &&
      verifiedReceipt.purchaseToken &&
      verifiedReceipt.needsAcknowledgement &&
      isGooglePlayVerificationConfigured()
    ) {
      await acknowledgeGooglePlayPurchase({
        developerPayload: `reward-order:${order.id}`,
        purchaseToken: verifiedReceipt.purchaseToken,
        sku: product.sku,
      });
    }

    return updateStorePurchaseOrder(executor, verifiedOrder, {
      metadata: {
        fulfillment: {
          assetCode: giftPack.rewardAssetCode,
          amount: toMoneyString(giftPack.rewardAmount),
          giftPackCode: giftPack.code,
          recipientUserId: order.recipientUserId,
        },
        acknowledgement:
          product.storeChannel === 'android' && verifiedReceipt.purchaseToken
            ? {
                purchaseToken: verifiedReceipt.purchaseToken,
                acknowledged:
                  verifiedReceipt.needsAcknowledgement &&
                  isGooglePlayVerificationConfigured(),
              }
            : undefined,
      },
      status: 'fulfilled',
    }).then((fulfilledOrder) => ({
      credited,
      order: fulfilledOrder,
    }));
  }

  if (product.assetCode !== 'IAP_VOUCHER' || !product.assetAmount) {
    throw persistenceError(
      'Voucher IAP products must deliver a positive IAP_VOUCHER amount.'
    );
  }

  const credited = await creditAsset(
    {
      userId: order.userId,
      assetCode: 'IAP_VOUCHER',
      amount: toMoneyString(product.assetAmount),
      entryType: 'iap_purchase_fulfill',
      referenceType: 'store_purchase_order',
      referenceId: order.id,
      audit: {
        actorType: audit.actorType,
        actorId: audit.actorId,
        sourceApp: audit.sourceApp,
        deviceFingerprint: audit.deviceFingerprint,
        requestId: audit.requestId,
        idempotencyKey: `store_purchase_order:${order.id}:fulfill`,
        metadata: {
          sku: product.sku,
          storeChannel: product.storeChannel,
          externalTransactionId: verifiedReceipt.externalTransactionId,
          purchaseToken: verifiedReceipt.purchaseToken,
        },
      },
    },
    executor
  );

  if (
    product.storeChannel === 'android' &&
    verifiedReceipt.purchaseToken &&
    verifiedReceipt.needsAcknowledgement &&
    isGooglePlayVerificationConfigured()
  ) {
    await acknowledgeGooglePlayPurchase({
      developerPayload: `reward-order:${order.id}`,
      purchaseToken: verifiedReceipt.purchaseToken,
      sku: product.sku,
    });
  }

  return updateStorePurchaseOrder(executor, verifiedOrder, {
    metadata: {
      fulfillment: {
        assetCode: 'IAP_VOUCHER',
        amount: toMoneyString(product.assetAmount),
      },
      acknowledgement:
        product.storeChannel === 'android' && verifiedReceipt.purchaseToken
          ? {
              purchaseToken: verifiedReceipt.purchaseToken,
              acknowledged:
                verifiedReceipt.needsAcknowledgement &&
                isGooglePlayVerificationConfigured(),
            }
          : undefined,
    },
    status: 'fulfilled',
  }).then((fulfilledOrder) => ({
    credited,
    order: fulfilledOrder,
  }));
};

const restoreStorePurchaseOrder = async (
  executor: DbExecutor,
  payload: {
    audit: ReturnType<typeof resolveAuditContext>;
    order: StorePurchaseOrderRow;
    product: IapProductRow;
    verifiedReceipt: VerifiedReceiptSnapshot;
  }
) => {
  const { audit, order, product, verifiedReceipt } = payload;

  if (order.status === 'fulfilled') {
    return order;
  }

  if (product.deliveryType === 'gift_pack') {
    if (!order.recipientUserId) {
      return updateStorePurchaseOrder(executor, order, {
        metadata: {
          restoration: {
            skipped: true,
            reason: 'recipient_missing',
          },
        },
        status: 'fulfilled',
      });
    }

    const giftPack = await getActiveGiftPackForProduct(executor, product.id);
    if (!giftPack) {
      return updateStorePurchaseOrder(executor, order, {
        metadata: {
          restoration: {
            skipped: true,
            reason: 'gift_pack_catalog_missing',
          },
        },
        status: 'fulfilled',
      });
    }

    await creditAsset(
      {
        userId: order.recipientUserId,
        assetCode: giftPack.rewardAssetCode as AssetCode,
        amount: toMoneyString(giftPack.rewardAmount),
        entryType: 'gift_pack_restore',
        referenceType: 'store_purchase_order',
        referenceId: order.id,
        audit: {
          actorType: audit.actorType,
          actorId: audit.actorId,
          sourceApp: audit.sourceApp,
          deviceFingerprint: audit.deviceFingerprint,
          requestId: audit.requestId,
          idempotencyKey: `store_purchase_order:${order.id}:gift_pack_restore`,
          metadata: {
            sku: product.sku,
            storeChannel: product.storeChannel,
            giftPackCode: giftPack.code,
            purchaserUserId: order.userId,
            recipientUserId: order.recipientUserId,
            externalTransactionId: verifiedReceipt.externalTransactionId,
            purchaseToken: verifiedReceipt.purchaseToken,
          },
        },
      },
      executor
    );

    if (
      product.storeChannel === 'android' &&
      verifiedReceipt.purchaseToken &&
      verifiedReceipt.needsAcknowledgement &&
      isGooglePlayVerificationConfigured()
    ) {
      await acknowledgeGooglePlayPurchase({
        developerPayload: `reward-order:${order.id}:gift_pack_restore`,
        purchaseToken: verifiedReceipt.purchaseToken,
        sku: product.sku,
      });
    }

    return updateStorePurchaseOrder(executor, order, {
      metadata: {
        restoration: {
          restoredAt: new Date().toISOString(),
          storeState: verifiedReceipt.storeState,
          recipientUserId: order.recipientUserId,
          giftPackCode: giftPack.code,
        },
        verification: verifiedReceipt.metadata,
      },
      status: 'fulfilled',
    });
  }

  if (product.assetCode !== 'IAP_VOUCHER' || !product.assetAmount) {
    return updateStorePurchaseOrder(executor, order, {
      metadata: {
        restoration: {
          skipped: true,
          reason: 'non_voucher_product',
        },
      },
      status: 'fulfilled',
    });
  }

  await creditAsset(
    {
      userId: order.userId,
      assetCode: 'IAP_VOUCHER',
      amount: toMoneyString(product.assetAmount),
      entryType: 'iap_purchase_restore',
      referenceType: 'store_purchase_order',
      referenceId: order.id,
      audit: {
        actorType: audit.actorType,
        actorId: audit.actorId,
        sourceApp: audit.sourceApp,
        deviceFingerprint: audit.deviceFingerprint,
        requestId: audit.requestId,
        idempotencyKey: `store_purchase_order:${order.id}:restore`,
        metadata: {
          sku: product.sku,
          storeChannel: product.storeChannel,
          externalTransactionId: verifiedReceipt.externalTransactionId,
          purchaseToken: verifiedReceipt.purchaseToken,
        },
      },
    },
    executor
  );

  if (
    product.storeChannel === 'android' &&
    verifiedReceipt.purchaseToken &&
    verifiedReceipt.needsAcknowledgement &&
    isGooglePlayVerificationConfigured()
  ) {
    await acknowledgeGooglePlayPurchase({
      developerPayload: `reward-order:${order.id}:restore`,
      purchaseToken: verifiedReceipt.purchaseToken,
      sku: product.sku,
    });
  }

  return updateStorePurchaseOrder(executor, order, {
    metadata: {
      restoration: {
        restoredAt: new Date().toISOString(),
        storeState: verifiedReceipt.storeState,
      },
      verification: verifiedReceipt.metadata,
    },
    status: 'fulfilled',
  });
};

const reverseStorePurchaseOrder = async (
  executor: DbExecutor,
  payload: {
    audit: ReturnType<typeof resolveAuditContext>;
    metadata?: Record<string, unknown> | null;
    order: StorePurchaseOrderRow;
    product: IapProductRow;
    targetStatus: Extract<StorePurchaseStatus, 'refunded' | 'revoked'>;
  }
) => {
  const { audit, metadata, order, product, targetStatus } = payload;

  if (
    FINAL_STATUSES.has(order.status) &&
    order.status === targetStatus
  ) {
    return order;
  }

  let recoveryMetadata: Record<string, unknown> = {
    action: 'none',
  };

  if (
    order.status === 'fulfilled' &&
    product.deliveryType === 'gift_pack' &&
    order.recipientUserId
  ) {
    const giftPack = await getActiveGiftPackForProduct(executor, product.id);
    if (giftPack) {
      try {
        await debitAsset(
          {
            userId: order.recipientUserId,
            assetCode: giftPack.rewardAssetCode as AssetCode,
            amount: toMoneyString(giftPack.rewardAmount),
            entryType:
              targetStatus === 'refunded'
                ? 'gift_pack_refund_reversal'
                : 'gift_pack_revoke_reversal',
            referenceType: 'store_purchase_order',
            referenceId: order.id,
            audit: {
              actorType: audit.actorType,
              actorId: audit.actorId,
              sourceApp: audit.sourceApp,
              deviceFingerprint: audit.deviceFingerprint,
              requestId: audit.requestId,
              idempotencyKey: `store_purchase_order:${order.id}:gift_pack:${targetStatus}`,
              metadata: {
                sku: product.sku,
                storeChannel: product.storeChannel,
                giftPackCode: giftPack.code,
                purchaserUserId: order.userId,
                recipientUserId: order.recipientUserId,
              },
            },
          },
          executor
        );

        recoveryMetadata = {
          action: 'debited',
          amount: toMoneyString(giftPack.rewardAmount),
          recipientUserId: order.recipientUserId,
          giftPackCode: giftPack.code,
        };
      } catch (error) {
        const appError = toAppError(error);
        if (appError.code !== API_ERROR_CODES.INSUFFICIENT_BALANCE) {
          throw error;
        }

        await ensureUserFreeze(
          {
            userId: order.recipientUserId,
            reason: 'gameplay_lock',
            scope: 'gameplay_lock',
            metadata: {
              orderId: order.id,
              storeChannel: order.storeChannel,
              targetStatus,
              purchaserUserId: order.userId,
              giftPackCode: giftPack.code,
              unrecoveredAmount: toMoneyString(giftPack.rewardAmount),
              ...(metadata ?? {}),
            },
          },
          {
            executor,
          }
        );

        recoveryMetadata = {
          action: 'freeze',
          recipientUserId: order.recipientUserId,
          giftPackCode: giftPack.code,
          unrecoveredAmount: toMoneyString(giftPack.rewardAmount),
        };
      }
    } else {
      recoveryMetadata = {
        action: 'none',
        reason: 'gift_pack_catalog_missing',
      };
    }
  } else if (
    order.status === 'fulfilled' &&
    product.assetCode === 'IAP_VOUCHER' &&
    product.assetAmount
  ) {
    try {
      await debitAsset(
        {
          userId: order.userId,
          assetCode: 'IAP_VOUCHER',
          amount: toMoneyString(product.assetAmount),
          entryType:
            targetStatus === 'refunded'
              ? 'iap_purchase_refund_reversal'
              : 'iap_purchase_revoke_reversal',
          referenceType: 'store_purchase_order',
          referenceId: order.id,
          audit: {
            actorType: audit.actorType,
            actorId: audit.actorId,
            sourceApp: audit.sourceApp,
            deviceFingerprint: audit.deviceFingerprint,
            requestId: audit.requestId,
            idempotencyKey: `store_purchase_order:${order.id}:${targetStatus}`,
            metadata: {
              sku: product.sku,
              storeChannel: product.storeChannel,
            },
          },
        },
        executor
      );

      recoveryMetadata = {
        action: 'debited',
        amount: toMoneyString(product.assetAmount),
      };
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code !== API_ERROR_CODES.INSUFFICIENT_BALANCE) {
        throw error;
      }

      await ensureUserFreeze(
        {
          userId: order.userId,
          reason: 'gameplay_lock',
          scope: 'gameplay_lock',
          metadata: {
            orderId: order.id,
            storeChannel: order.storeChannel,
            targetStatus,
            unrecoveredAmount: toMoneyString(product.assetAmount),
            ...(metadata ?? {}),
          },
        },
        {
          executor,
        }
      );

      recoveryMetadata = {
        action: 'freeze',
        unrecoveredAmount: toMoneyString(product.assetAmount),
      };
    }
  }

  return updateStorePurchaseOrder(executor, order, {
    metadata: {
      reversal: {
        status: targetStatus,
        recovery: recoveryMetadata,
      },
      ...(metadata ?? {}),
    },
    status: targetStatus,
  });
};

const syncOrderWithVerifiedReceipt = async (
  executor: DbExecutor,
  payload: {
    audit: ReturnType<typeof resolveAuditContext>;
    order: StorePurchaseOrderRow;
    product: IapProductRow;
    verifiedReceipt: VerifiedReceiptSnapshot;
  }
) => {
  const { audit, order, product, verifiedReceipt } = payload;
  const orderMetadata = toRecord(order.metadata);
  const requiresManualApproval =
    isManualApprovalRequiredMetadata(orderMetadata) ||
    isManualApprovalRequiredMetadata(verifiedReceipt.metadata);

  await updateLatestReceiptForOrder(executor, order.id, {
    rawPayload: verifiedReceipt.rawPayload,
    metadata: verifiedReceipt.metadata,
  });

  if (verifiedReceipt.storeState === 'purchased') {
    if (order.status === 'fulfilled') {
      return updateStorePurchaseOrder(executor, order, {
        externalOrderId: verifiedReceipt.externalOrderId ?? order.externalOrderId,
        metadata: {
          verification: verifiedReceipt.metadata,
        },
      });
    }

    if (requiresManualApproval && !FINAL_STATUSES.has(order.status)) {
      return updateStorePurchaseOrder(executor, order, {
        externalOrderId: verifiedReceipt.externalOrderId ?? order.externalOrderId,
        metadata: {
          verification: verifiedReceipt.metadata,
          verificationMode: readTrimmedString(
            verifiedReceipt.metadata.verificationMode
          ),
          manualApprovalRequired: true,
          manualApprovalState: 'pending',
          manualApprovalReason: 'local_stub_verification',
        },
        status: 'verified',
      });
    }

    if (FINAL_STATUSES.has(order.status)) {
      return restoreStorePurchaseOrder(executor, payload);
    }

    const { order: fulfilledOrder } = await fulfillStorePurchaseOrder(
      executor,
      payload
    );
    return fulfilledOrder;
  }

  if (verifiedReceipt.storeState === 'pending') {
    throw conflictError(getStateConflictMessage(verifiedReceipt.storeState));
  }

  const targetStatus: Extract<StorePurchaseStatus, 'refunded' | 'revoked'> =
    verifiedReceipt.storeState === 'refunded' ? 'refunded' : 'revoked';

  return reverseStorePurchaseOrder(executor, {
    audit,
    metadata: {
      verification: verifiedReceipt.metadata,
      storeState: verifiedReceipt.storeState,
    },
    order,
    product,
    targetStatus,
  });
};

export async function listIapProducts(
  query: IapProductListQuery = {},
  executor: DbExecutor = db
) {
  const filters = [eq(iapProducts.isActive, true)];

  if (query.storeChannel) {
    filters.push(eq(iapProducts.storeChannel, query.storeChannel));
  }

  if (query.deliveryType) {
    filters.push(eq(iapProducts.deliveryType, query.deliveryType));
  }

  const rows = await executor
    .select()
    .from(iapProducts)
    .where(filters.length === 1 ? filters[0]! : and(...filters))
    .orderBy(iapProducts.storeChannel, iapProducts.sku, iapProducts.id);

  return rows.map(serializeIapProduct);
}

export async function listGiftPackCatalog(
  query: {
    storeChannel?: StoreChannel;
  } = {},
  executor: DbExecutor = db
) {
  const productFilters = [
    eq(iapProducts.isActive, true),
    eq(iapProducts.deliveryType, 'gift_pack'),
  ];

  if (query.storeChannel) {
    productFilters.push(eq(iapProducts.storeChannel, query.storeChannel));
  }

  const rows = await executor
    .select({
      product: iapProducts,
      giftPack: giftPackCatalog,
    })
    .from(giftPackCatalog)
    .innerJoin(iapProducts, eq(giftPackCatalog.iapProductId, iapProducts.id))
    .where(
      and(
        eq(giftPackCatalog.isActive, true),
        productFilters.length === 1 ? productFilters[0]! : and(...productFilters)
      )
    )
    .orderBy(iapProducts.storeChannel, giftPackCatalog.code, giftPackCatalog.id);

  return rows.map((row) => serializeGiftPackCatalogItem(row.giftPack, row.product));
}

export async function verifyIapPurchase(
  payload: {
    userId: number;
    request: VerifyIapPurchaseRequest;
    audit?: VerifyPurchaseAuditContext | null;
  },
  executor: DbExecutor = db
): Promise<VerifyIapPurchaseResponse> {
  const idempotencyKey = payload.request.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw unprocessableEntityError('Idempotency key is required.', {
      code: API_ERROR_CODES.FIELD_REQUIRED,
    });
  }

  let verifiedReceipt: VerifiedReceiptSnapshot;

  try {
    verifiedReceipt = await verifyPurchasePayload(payload.request);
  } catch (error) {
    recordIapPurchaseFulfillmentFailed({
      stage: 'verify',
      storeChannel: payload.request.storeChannel,
      deliveryType: 'unknown',
    });
    throw error;
  }

  try {
    const result: VerifyIapPurchaseResponse = await withExecutor(
      executor,
      async (tx) => {
      const [product] = await tx
        .select()
        .from(iapProducts)
        .where(
          and(
            eq(iapProducts.storeChannel, payload.request.storeChannel),
            eq(iapProducts.sku, payload.request.sku.trim())
          )
        )
        .limit(1);

      if (!product) {
        throw notFoundError('IAP product not found.');
      }

      if (!product.isActive) {
        throw conflictError('IAP product is not active.');
      }

      const requiresManualApproval = isManualApprovalRequiredMetadata(
        verifiedReceipt.metadata
      );

      if (product.deliveryType === 'voucher' && payload.request.recipientUserId) {
        throw unprocessableEntityError(
          'Voucher purchases cannot specify a recipient user.'
        );
      }

      if (
        product.deliveryType === 'gift_pack' &&
        !payload.request.recipientUserId
      ) {
        throw unprocessableEntityError(
          'Gift pack purchases require a recipient user.'
        );
      }

      if (
        product.deliveryType === 'gift_pack' &&
        payload.request.recipientUserId === payload.userId
      ) {
        throw conflictError('Gift pack recipient must be a different user.');
      }

      const requestFingerprint = buildRequestFingerprint({
        userId: payload.userId,
        recipientUserId: payload.request.recipientUserId ?? null,
        sku: payload.request.sku.trim(),
        storeChannel: payload.request.storeChannel,
        externalTransactionId: verifiedReceipt.externalTransactionId,
        purchaseToken: verifiedReceipt.purchaseToken,
        externalOrderId: verifiedReceipt.externalOrderId,
      });

      const [existingOrder] = await tx
        .select()
        .from(storePurchaseOrders)
        .where(eq(storePurchaseOrders.idempotencyKey, idempotencyKey))
        .limit(1);

      const audit = resolveAuditContext({
        ...payload.audit,
        idempotencyKey,
      });

      if (existingOrder) {
        assertExistingOrderMatchesFingerprint(existingOrder, requestFingerprint);
        const syncedOrder = await syncOrderWithVerifiedReceipt(tx, {
          audit,
          order: existingOrder,
          product,
          verifiedReceipt,
        });
        return loadPurchaseSnapshot(tx, syncedOrder, true);
      }

      const existingReceipt = await findExistingReceipt(tx, {
        storeChannel: payload.request.storeChannel,
        externalTransactionId: verifiedReceipt.externalTransactionId,
        purchaseToken: verifiedReceipt.purchaseToken,
      });
      if (existingReceipt) {
        const [receiptOrder] = await tx
          .select()
          .from(storePurchaseOrders)
          .where(eq(storePurchaseOrders.id, existingReceipt.orderId))
          .limit(1);

        if (!receiptOrder) {
          throw persistenceError('Store purchase order not found for receipt.');
        }

        if (
          receiptOrder.userId !== payload.userId ||
          receiptOrder.iapProductId !== product.id ||
          (receiptOrder.recipientUserId ?? null) !==
            (payload.request.recipientUserId ?? null)
        ) {
          throw conflictError('Store purchase receipt already processed.');
        }

        const syncedOrder = await syncOrderWithVerifiedReceipt(tx, {
          audit,
          order: receiptOrder,
          product,
          verifiedReceipt,
        });
        return loadPurchaseSnapshot(tx, syncedOrder, true);
      }

      if (verifiedReceipt.storeState !== 'purchased') {
        throw conflictError(getStateConflictMessage(verifiedReceipt.storeState));
      }

      await ensureUserAssetBalances(payload.userId, tx);

      const orderMetadata = {
        ...(audit.metadata ?? {}),
        requestFingerprint,
        requestSku: payload.request.sku.trim(),
        verificationMode: verifiedReceipt.metadata.verificationMode,
        ...(requiresManualApproval
          ? {
              manualApprovalRequired: true,
              manualApprovalState: 'pending',
              manualApprovalReason: 'local_stub_verification',
            }
          : {}),
      };

      const [createdOrder] = await tx
        .insert(storePurchaseOrders)
        .values({
          userId: payload.userId,
          recipientUserId: payload.request.recipientUserId ?? null,
          iapProductId: product.id,
          storeChannel: payload.request.storeChannel,
          status: requiresManualApproval ? 'verified' : 'created',
          idempotencyKey,
          externalOrderId: verifiedReceipt.externalOrderId,
          sourceApp: audit.sourceApp,
          deviceFingerprint: audit.deviceFingerprint,
          requestId: audit.requestId,
          metadata: orderMetadata,
        })
        .returning();

      await tx.insert(storePurchaseReceipts).values({
        orderId: createdOrder.id,
        storeChannel: payload.request.storeChannel,
        externalTransactionId: verifiedReceipt.externalTransactionId,
        purchaseToken: verifiedReceipt.purchaseToken,
        rawPayload: verifiedReceipt.rawPayload,
        metadata: requiresManualApproval
          ? mergeRecords(verifiedReceipt.metadata, {
              manualApprovalRequired: true,
              manualApprovalState: 'pending',
              manualApprovalReason: 'local_stub_verification',
            })
          : verifiedReceipt.metadata,
      });

      if (requiresManualApproval) {
        return loadPurchaseSnapshot(tx, createdOrder, false);
      }

      const { order: fulfilledOrder, credited: fulfillment } =
        await fulfillStorePurchaseOrder(tx, {
          audit,
          order: createdOrder,
          product,
          verifiedReceipt,
        });

    const receipt = await getLatestReceiptForOrder(tx, createdOrder.id);
    if (!receipt) {
      throw persistenceError('Store purchase receipt not found.');
    }

      return {
        order: serializeStorePurchaseOrder(fulfilledOrder),
        receipt: serializeStorePurchaseReceipt(receipt),
        product: serializeIapProduct(product),
        fulfillment:
          product.deliveryType === 'gift_pack'
            ? fulfilledOrder.recipientUserId
              ? await getActiveGiftPackForProduct(tx, product.id).then((giftPack) =>
                  giftPack
                    ? {
                        assetCode: giftPack.rewardAssetCode as AssetCode,
                        amount: toMoneyString(giftPack.rewardAmount),
                        replayed: fulfillment.replayed,
                      }
                    : null
                )
              : null
            : {
                assetCode: 'IAP_VOUCHER' as const,
                amount: toMoneyString(product.assetAmount ?? 0),
                replayed: fulfillment.replayed,
              },
        replayed: false,
      };
      }
    );

    recordIapPurchaseVerified({
      storeChannel: result.product.storeChannel,
      deliveryType: result.product.deliveryType,
    });

    if (
      result.product.deliveryType === 'gift_pack' &&
      result.fulfillment &&
      !result.replayed
    ) {
      recordGiftPackDelivered({
        storeChannel: result.product.storeChannel,
        mode: 'purchase',
      });
    }

    return result;
  } catch (error) {
    recordIapPurchaseFulfillmentFailed({
      stage: 'fulfill',
      storeChannel: payload.request.storeChannel,
      deliveryType:
        payload.request.recipientUserId === undefined ? 'voucher' : 'gift_pack',
    });
    throw error;
  }
}

export async function completeGiftPackPurchase(
  payload: {
    userId: number;
    request: Extract<VerifyIapPurchaseRequest, { recipientUserId?: number }>;
    audit?: VerifyPurchaseAuditContext | null;
  },
  executor: DbExecutor = db
) {
  const result = await verifyIapPurchase(payload, executor);
  if (result.product.deliveryType !== 'gift_pack') {
    throw unprocessableEntityError(
      'Gift pack completion requires a gift pack product SKU.'
    );
  }

  return result;
}

const getOrderAndProductForAdminAction = async (
  executor: DbExecutor,
  orderId: number
) => {
  const [order] = await executor
    .select()
    .from(storePurchaseOrders)
    .where(eq(storePurchaseOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw notFoundError('Store purchase order not found.');
  }

  const [product] = await executor
    .select()
    .from(iapProducts)
    .where(eq(iapProducts.id, order.iapProductId))
    .limit(1);

  if (!product) {
    throw notFoundError('IAP product not found.');
  }

  return { order, product };
};

export async function replayStorePurchaseOrderFulfillment(
  payload: {
    orderId: number;
    audit?: VerifyPurchaseAuditContext | null;
  },
  executor: DbExecutor = db
) {
  return withExecutor(executor, async (tx) => {
    const { order, product } = await getOrderAndProductForAdminAction(
      tx,
      payload.orderId
    );
    const receipt = await getLatestReceiptForOrder(tx, order.id);

    if (!receipt) {
      throw persistenceError('Store purchase receipt not found.');
    }

    const verifiedReceipt: VerifiedReceiptSnapshot = {
      externalOrderId: order.externalOrderId ?? null,
      externalTransactionId: receipt.externalTransactionId ?? null,
      purchaseToken: receipt.purchaseToken ?? null,
      rawPayload: toRecord(receipt.rawPayload),
      metadata: toRecord(receipt.metadata) ?? { verificationMode: 'admin_replay' },
      needsAcknowledgement: false,
      storeState: 'purchased',
    };
    const audit = resolveAuditContext({
      ...payload.audit,
      idempotencyKey: `admin_replay_store_purchase_order:${order.id}`,
    });
    const orderMetadata = toRecord(order.metadata);

    if (
      isManualApprovalRequiredMetadata(orderMetadata) &&
      order.status !== 'fulfilled' &&
      !FINAL_STATUSES.has(order.status)
    ) {
      const { order: fulfilledOrder } = await fulfillStorePurchaseOrder(tx, {
        audit,
        order,
        product,
        verifiedReceipt,
      });
      const approvedOrder = await updateStorePurchaseOrder(tx, fulfilledOrder, {
        metadata: {
          manualApprovalRequired: true,
          manualApprovalState: 'approved',
          manualApprovalApprovedAt: new Date().toISOString(),
          manualApprovalApprovedByActorType: audit.actorType,
          manualApprovalApprovedByActorId: audit.actorId,
        },
      });

      if (product.deliveryType === 'gift_pack') {
        recordGiftPackDelivered({
          storeChannel: product.storeChannel,
          mode: 'restore',
        });
      }

      return loadPurchaseSnapshot(tx, approvedOrder, false);
    }

    const restoredOrder = await restoreStorePurchaseOrder(tx, {
      audit,
      order,
      product,
      verifiedReceipt,
    });

    if (product.deliveryType === 'gift_pack' && order.status !== 'fulfilled') {
      recordGiftPackDelivered({
        storeChannel: product.storeChannel,
        mode: 'restore',
      });
    }

    return loadPurchaseSnapshot(tx, restoredOrder, order.status === 'fulfilled');
  });
}

export async function reverseStorePurchaseOrderByAdmin(
  payload: {
    orderId: number;
    targetStatus: Extract<StorePurchaseStatus, 'refunded' | 'revoked'>;
    reason?: string | null;
    audit?: VerifyPurchaseAuditContext | null;
  },
  executor: DbExecutor = db
) {
  return withExecutor(executor, async (tx) => {
    const { order, product } = await getOrderAndProductForAdminAction(
      tx,
      payload.orderId
    );
    const audit = resolveAuditContext({
      ...payload.audit,
      idempotencyKey: `admin_reverse_store_purchase_order:${order.id}:${payload.targetStatus}`,
      metadata: {
        ...(payload.audit?.metadata ?? {}),
        manualReason: payload.reason ?? null,
      },
    });

    const reversedOrder = await reverseStorePurchaseOrder(tx, {
      audit,
      metadata: {
        manualReason: payload.reason ?? null,
        manualAdminAction: true,
      },
      order,
      product,
      targetStatus: payload.targetStatus,
    });

    return loadPurchaseSnapshot(tx, reversedOrder, false);
  });
}

const syncNotificationSnapshot = async (
  payload: {
    audit?: VerifyPurchaseAuditContext | null;
    eventType: string | null;
    snapshot:
      | AppleNotificationSnapshot
      | GoogleNotificationSnapshot;
    storeChannel: StoreChannel;
  },
  executor: DbExecutor = db
): Promise<NotificationProcessResult> => {
  if (!payload.snapshot.storeState) {
    return {
      accepted: true,
      eventType: payload.eventType,
      ignored: true,
      matchedOrderId: null,
      orderStatus: null,
      replayed: false,
    };
  }

  return withExecutor(executor, async (tx) => {
    const storeState = payload.snapshot.storeState;
    if (!storeState) {
      return {
        accepted: true,
        eventType: payload.eventType,
        ignored: true,
        matchedOrderId: null,
        orderStatus: null,
        replayed: false,
      };
    }

    const order = await findOrderByStoreReference(tx, {
      externalOrderId: payload.snapshot.externalOrderId,
      externalTransactionId: payload.snapshot.externalTransactionId,
      purchaseToken: payload.snapshot.purchaseToken,
      storeChannel: payload.storeChannel,
    });

    if (!order) {
      return {
        accepted: true,
        eventType: payload.eventType,
        ignored: true,
        matchedOrderId: null,
        orderStatus: null,
        replayed: false,
      };
    }

    const [product] = await tx
      .select()
      .from(iapProducts)
      .where(eq(iapProducts.id, order.iapProductId))
      .limit(1);

    if (!product) {
      throw persistenceError('IAP product not found for store purchase order.');
    }

    const audit = resolveAuditContext({
      ...payload.audit,
      idempotencyKey: `store_notification:${payload.storeChannel}:${order.id}:${payload.eventType ?? 'unknown'}`,
      metadata: {
        ...(payload.audit?.metadata ?? {}),
        routeEventType: payload.eventType,
      },
    });
    const verifiedReceipt: VerifiedReceiptSnapshot = {
      externalOrderId: payload.snapshot.externalOrderId,
      externalTransactionId: payload.snapshot.externalTransactionId,
      purchaseToken: payload.snapshot.purchaseToken,
      rawPayload: payload.snapshot.rawPayload,
      metadata: payload.snapshot.metadata,
      needsAcknowledgement:
        'needsAcknowledgement' in payload.snapshot
          ? Boolean(payload.snapshot.needsAcknowledgement)
          : false,
      storeState,
    };
    const replayed =
      (verifiedReceipt.storeState === 'purchased' && order.status === 'fulfilled') ||
      (verifiedReceipt.storeState === 'refunded' && order.status === 'refunded') ||
      (verifiedReceipt.storeState === 'revoked' && order.status === 'revoked');

    const syncedOrder = await syncOrderWithVerifiedReceipt(tx, {
      audit,
      order,
      product,
      verifiedReceipt,
    });

    return {
      accepted: true,
      eventType: payload.eventType,
      ignored: false,
      matchedOrderId: syncedOrder.id,
      orderStatus: syncedOrder.status,
      replayed,
    };
  });
};

export async function processAppleIapNotification(
  payload: {
    signedPayload: string;
    audit?: VerifyPurchaseAuditContext | null;
  },
  executor: DbExecutor = db
) {
  const signedPayload = payload.signedPayload.trim();
  if (!signedPayload) {
    throw unprocessableEntityError('signedPayload is required.');
  }

  if (!isAppleIapVerificationConfigured()) {
    if (getConfig().nodeEnv === 'production') {
      throw serviceUnavailableError(
        'Apple IAP notifications are not configured for production.'
      );
    }

    throw serviceUnavailableError('Apple IAP notifications are not configured.');
  }

  const snapshot = await processAppleServerNotification(signedPayload);
  return syncNotificationSnapshot(
    {
      audit: payload.audit,
      eventType: snapshot.notificationType,
      snapshot,
      storeChannel: 'ios',
    },
    executor
  );
}

export async function processGooglePlayRtdnNotification(
  payload: {
    authorizationHeader?: string | null;
    body: unknown;
    audit?: VerifyPurchaseAuditContext | null;
  },
  executor: DbExecutor = db
) {
  assertGooglePlayNotificationAuthorized(payload.authorizationHeader);

  const snapshot = await parseGooglePlayNotification(payload.body);
  return syncNotificationSnapshot(
    {
      audit: payload.audit,
      eventType: snapshot.notificationType,
      snapshot,
      storeChannel: 'android',
    },
    executor
  );
}

export const assertIapNotificationAuthorized = (
  provider: 'google',
  authorizationHeader?: string | null
) => {
  if (provider !== 'google') {
    throw unauthorizedError('Unsupported notification provider.');
  }

  assertGooglePlayNotificationAuthorized(authorizationHeader);
};
