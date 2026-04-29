import { z } from 'zod';
import {
  LimitedPageSizeSchema,
  MoneyLikeSchema,
  OptionalPositiveIntSchema,
  PositiveIntSchema,
} from './common';

const MetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();
const DateLikeSchema = z.union([z.string(), z.date()]);

export const assetCodeValues = ['B_LUCK', 'IAP_VOUCHER'] as const;
export const AssetCodeSchema = z.enum(assetCodeValues);
export type AssetCode = z.infer<typeof AssetCodeSchema>;

export const giftTransferStatusValues = [
  'pending',
  'completed',
  'rejected',
  'reversed',
  'cancelled',
] as const;
export const GiftTransferStatusSchema = z.enum(giftTransferStatusValues);
export type GiftTransferStatus = z.infer<typeof GiftTransferStatusSchema>;

export const giftDirectionValues = ['all', 'sent', 'received'] as const;
export const GiftDirectionSchema = z.enum(giftDirectionValues);
export type GiftDirection = z.infer<typeof GiftDirectionSchema>;

export const storeChannelValues = ['ios', 'android'] as const;
export const StoreChannelSchema = z.enum(storeChannelValues);
export type StoreChannel = z.infer<typeof StoreChannelSchema>;

export const iapDeliveryTypeValues = ['voucher', 'gift_pack'] as const;
export const IapDeliveryTypeSchema = z.enum(iapDeliveryTypeValues);
export type IapDeliveryType = z.infer<typeof IapDeliveryTypeSchema>;

export const storePurchaseStatusValues = [
  'created',
  'verified',
  'fulfilled',
  'reversed',
  'refunded',
  'revoked',
] as const;
export const StorePurchaseStatusSchema = z.enum(storePurchaseStatusValues);
export type StorePurchaseStatus = z.infer<typeof StorePurchaseStatusSchema>;

export const WalletAssetBalanceRecordSchema = z.object({
  userId: z.number().int(),
  assetCode: AssetCodeSchema,
  availableBalance: z.string(),
  lockedBalance: z.string(),
  lifetimeEarned: z.string(),
  lifetimeSpent: z.string(),
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type WalletAssetBalanceRecord = z.infer<
  typeof WalletAssetBalanceRecordSchema
>;

export const EconomyLedgerEntryRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  assetCode: AssetCodeSchema,
  entryType: z.string().min(1).max(64),
  amount: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  referenceType: z.string().max(64).nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  actorType: z.string().max(32).nullable().optional(),
  actorId: z.number().int().nullable().optional(),
  sourceApp: z.string().max(64).nullable().optional(),
  deviceFingerprint: z.string().max(255).nullable().optional(),
  requestId: z.string().max(191).nullable().optional(),
  idempotencyKey: z.string().max(191).nullable().optional(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
});
export type EconomyLedgerEntryRecord = z.infer<
  typeof EconomyLedgerEntryRecordSchema
>;

export const GiftEnergyRefillPolicySchema = z.object({
  type: z.literal('daily_reset'),
  intervalHours: z.number().int().positive(),
  refillAmount: z.number().int().nonnegative(),
});
export type GiftEnergyRefillPolicy = z.infer<
  typeof GiftEnergyRefillPolicySchema
>;

export const GiftEnergyAccountRecordSchema = z.object({
  userId: z.number().int(),
  currentEnergy: z.number().int().nonnegative(),
  maxEnergy: z.number().int().nonnegative(),
  refillPolicy: GiftEnergyRefillPolicySchema,
  lastRefillAt: DateLikeSchema.nullable().optional(),
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type GiftEnergyAccountRecord = z.infer<
  typeof GiftEnergyAccountRecordSchema
>;

export const GiftTransferRecordSchema = z.object({
  id: z.number().int(),
  senderUserId: z.number().int(),
  receiverUserId: z.number().int(),
  assetCode: AssetCodeSchema,
  amount: z.string(),
  energyCost: z.number().int().nonnegative(),
  status: GiftTransferStatusSchema,
  idempotencyKey: z.string().min(1).max(191),
  sourceApp: z.string().max(64).nullable().optional(),
  deviceFingerprint: z.string().max(255).nullable().optional(),
  requestId: z.string().max(191).nullable().optional(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type GiftTransferRecord = z.infer<typeof GiftTransferRecordSchema>;

export const IapProductRecordSchema = z.object({
  id: z.number().int(),
  sku: z.string().min(1).max(128),
  storeChannel: StoreChannelSchema,
  deliveryType: IapDeliveryTypeSchema,
  assetCode: AssetCodeSchema.nullable().optional(),
  assetAmount: z.string().nullable().optional(),
  deliveryContent: MetadataSchema,
  isActive: z.boolean(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type IapProductRecord = z.infer<typeof IapProductRecordSchema>;

export const GiftPackCatalogRecordSchema = z.object({
  id: z.number().int(),
  code: z.string().min(1).max(128),
  iapProductId: z.number().int(),
  rewardAssetCode: AssetCodeSchema,
  rewardAmount: z.string(),
  deliveryContent: MetadataSchema,
  isActive: z.boolean(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type GiftPackCatalogRecord = z.infer<
  typeof GiftPackCatalogRecordSchema
>;

export const StorePurchaseOrderRecordSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  recipientUserId: z.number().int().nullable().optional(),
  iapProductId: z.number().int(),
  storeChannel: StoreChannelSchema,
  status: StorePurchaseStatusSchema,
  idempotencyKey: z.string().min(1).max(191),
  externalOrderId: z.string().max(191).nullable().optional(),
  sourceApp: z.string().max(64).nullable().optional(),
  deviceFingerprint: z.string().max(255).nullable().optional(),
  requestId: z.string().max(191).nullable().optional(),
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type StorePurchaseOrderRecord = z.infer<
  typeof StorePurchaseOrderRecordSchema
>;

export const StorePurchaseReceiptRecordSchema = z.object({
  id: z.number().int(),
  orderId: z.number().int(),
  storeChannel: StoreChannelSchema,
  externalTransactionId: z.string().max(191).nullable().optional(),
  purchaseToken: z.string().max(255).nullable().optional(),
  rawPayload: MetadataSchema,
  metadata: MetadataSchema,
  createdAt: DateLikeSchema.nullable().optional(),
  updatedAt: DateLikeSchema.nullable().optional(),
});
export type StorePurchaseReceiptRecord = z.infer<
  typeof StorePurchaseReceiptRecordSchema
>;

export const EconomyLedgerQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  assetCode: AssetCodeSchema.optional(),
});
export type EconomyLedgerQuery = z.infer<typeof EconomyLedgerQuerySchema>;

export const EconomyLedgerResponseSchema = z.array(EconomyLedgerEntryRecordSchema);
export type EconomyLedgerResponse = z.infer<typeof EconomyLedgerResponseSchema>;

export const GiftEnergyResponseSchema = GiftEnergyAccountRecordSchema;
export type GiftEnergyResponse = z.infer<typeof GiftEnergyResponseSchema>;

export const GiftListQuerySchema = z.object({
  limit: LimitedPageSizeSchema,
  direction: GiftDirectionSchema.optional(),
});
export type GiftListQuery = z.infer<typeof GiftListQuerySchema>;

export const GiftListResponseSchema = z.array(GiftTransferRecordSchema);
export type GiftListResponse = z.infer<typeof GiftListResponseSchema>;

export const CreateGiftRequestSchema = z.object({
  receiverUserId: PositiveIntSchema,
  amount: MoneyLikeSchema,
  idempotencyKey: z.string().trim().min(1).max(191),
});
export type CreateGiftRequest = z.infer<typeof CreateGiftRequestSchema>;

export const CreateGiftResponseSchema = GiftTransferRecordSchema;
export type CreateGiftResponse = z.infer<typeof CreateGiftResponseSchema>;

export const IapProductListQuerySchema = z.object({
  storeChannel: StoreChannelSchema.optional(),
  deliveryType: IapDeliveryTypeSchema.optional(),
});
export type IapProductListQuery = z.infer<typeof IapProductListQuerySchema>;

export const IapProductListResponseSchema = z.array(IapProductRecordSchema);
export type IapProductListResponse = z.infer<typeof IapProductListResponseSchema>;

export const GiftPackCatalogListQuerySchema = z.object({
  storeChannel: StoreChannelSchema.optional(),
});
export type GiftPackCatalogListQuery = z.infer<
  typeof GiftPackCatalogListQuerySchema
>;

export const GiftPackCatalogItemSchema = z.object({
  giftPack: GiftPackCatalogRecordSchema,
  product: IapProductRecordSchema,
});
export type GiftPackCatalogItem = z.infer<typeof GiftPackCatalogItemSchema>;

export const GiftPackCatalogListResponseSchema = z.array(
  GiftPackCatalogItemSchema
);
export type GiftPackCatalogListResponse = z.infer<
  typeof GiftPackCatalogListResponseSchema
>;

export const IosPurchaseReceiptPayloadSchema = z
  .object({
    externalTransactionId: z.string().trim().min(1).max(191).optional(),
    originalTransactionId: z.string().trim().min(1).max(191).optional(),
    signedTransactionInfo: z.string().trim().min(1).max(8192).optional(),
    rawPayload: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.externalTransactionId || value.signedTransactionInfo),
    {
      message:
        'iOS receipts require externalTransactionId or signedTransactionInfo.',
      path: ['externalTransactionId'],
    }
  );
export type IosPurchaseReceiptPayload = z.infer<
  typeof IosPurchaseReceiptPayloadSchema
>;

export const AndroidPurchaseReceiptPayloadSchema = z.object({
  purchaseToken: z.string().trim().min(1).max(255),
  externalTransactionId: z.string().trim().min(1).max(191).optional(),
  orderId: z.string().trim().min(1).max(191).optional(),
  packageName: z.string().trim().min(1).max(255).optional(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});
export type AndroidPurchaseReceiptPayload = z.infer<
  typeof AndroidPurchaseReceiptPayloadSchema
>;

export const VerifyIapPurchaseRequestSchema = z.discriminatedUnion(
  'storeChannel',
  [
    z.object({
      idempotencyKey: z.string().trim().min(1).max(191),
      storeChannel: z.literal('ios'),
      sku: z.string().trim().min(1).max(128),
      recipientUserId: OptionalPositiveIntSchema,
      receipt: IosPurchaseReceiptPayloadSchema,
    }),
    z.object({
      idempotencyKey: z.string().trim().min(1).max(191),
      storeChannel: z.literal('android'),
      sku: z.string().trim().min(1).max(128),
      recipientUserId: OptionalPositiveIntSchema,
      receipt: AndroidPurchaseReceiptPayloadSchema,
    }),
  ]
);
export type VerifyIapPurchaseRequest = z.infer<
  typeof VerifyIapPurchaseRequestSchema
>;

export const GiftPackPurchaseCompleteRequestSchema = z.discriminatedUnion(
  'storeChannel',
  [
    z.object({
      idempotencyKey: z.string().trim().min(1).max(191),
      storeChannel: z.literal('ios'),
      sku: z.string().trim().min(1).max(128),
      recipientUserId: PositiveIntSchema,
      receipt: IosPurchaseReceiptPayloadSchema,
    }),
    z.object({
      idempotencyKey: z.string().trim().min(1).max(191),
      storeChannel: z.literal('android'),
      sku: z.string().trim().min(1).max(128),
      recipientUserId: PositiveIntSchema,
      receipt: AndroidPurchaseReceiptPayloadSchema,
    }),
  ]
);
export type GiftPackPurchaseCompleteRequest = z.infer<
  typeof GiftPackPurchaseCompleteRequestSchema
>;

export const StorePurchaseFulfillmentRecordSchema = z.object({
  assetCode: AssetCodeSchema,
  amount: z.string(),
  replayed: z.boolean(),
});
export type StorePurchaseFulfillmentRecord = z.infer<
  typeof StorePurchaseFulfillmentRecordSchema
>;

export const VerifyIapPurchaseResponseSchema = z.object({
  order: StorePurchaseOrderRecordSchema,
  receipt: StorePurchaseReceiptRecordSchema,
  product: IapProductRecordSchema,
  fulfillment: StorePurchaseFulfillmentRecordSchema.nullable(),
  replayed: z.boolean(),
});
export type VerifyIapPurchaseResponse = z.infer<
  typeof VerifyIapPurchaseResponseSchema
>;

export const GiftPackPurchaseCompleteResponseSchema =
  VerifyIapPurchaseResponseSchema;
export type GiftPackPurchaseCompleteResponse = z.infer<
  typeof GiftPackPurchaseCompleteResponseSchema
>;
