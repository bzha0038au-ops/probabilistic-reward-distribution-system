import 'dotenv/config';

import { giftPackCatalog, iapProducts } from '@reward/database';
import { eq } from '@reward/database/orm';
import { client, db } from '../src/db';

const TEST_IAP_PRODUCTS = [
  {
    sku: 'reward.ios.voucher.small',
    storeChannel: 'ios',
    deliveryType: 'voucher',
    assetCode: 'IAP_VOUCHER',
    assetAmount: '6.00',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'small',
      title: 'Voucher Small',
      description: 'Test voucher pack for iOS sandbox QA.',
    },
  },
  {
    sku: 'reward.ios.voucher.medium',
    storeChannel: 'ios',
    deliveryType: 'voucher',
    assetCode: 'IAP_VOUCHER',
    assetAmount: '12.50',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'medium',
      title: 'Voucher Medium',
      description: 'Test voucher pack for iOS sandbox QA.',
    },
  },
  {
    sku: 'reward.ios.voucher.large',
    storeChannel: 'ios',
    deliveryType: 'voucher',
    assetCode: 'IAP_VOUCHER',
    assetAmount: '30.00',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'large',
      title: 'Voucher Large',
      description: 'Test voucher pack for iOS sandbox QA.',
    },
  },
  {
    sku: 'reward.android.voucher.small',
    storeChannel: 'android',
    deliveryType: 'voucher',
    assetCode: 'IAP_VOUCHER',
    assetAmount: '6.00',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'small',
      title: 'Voucher Small',
      description: 'Test voucher pack for Android sandbox QA.',
    },
  },
  {
    sku: 'reward.android.voucher.medium',
    storeChannel: 'android',
    deliveryType: 'voucher',
    assetCode: 'IAP_VOUCHER',
    assetAmount: '12.50',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'medium',
      title: 'Voucher Medium',
      description: 'Test voucher pack for Android sandbox QA.',
    },
  },
  {
    sku: 'reward.android.voucher.large',
    storeChannel: 'android',
    deliveryType: 'voucher',
    assetCode: 'IAP_VOUCHER',
    assetAmount: '30.00',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'large',
      title: 'Voucher Large',
      description: 'Test voucher pack for Android sandbox QA.',
    },
  },
  {
    sku: 'reward.ios.gift-pack.rose',
    storeChannel: 'ios',
    deliveryType: 'gift_pack',
    assetCode: null,
    assetAmount: null,
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'gift_pack',
      title: 'Rose gift pack',
      description: 'Direct iOS gift pack that sends B luck to a recipient.',
    },
  },
  {
    sku: 'reward.android.gift-pack.rose',
    storeChannel: 'android',
    deliveryType: 'gift_pack',
    assetCode: null,
    assetAmount: null,
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      tier: 'gift_pack',
      title: 'Rose gift pack',
      description: 'Direct Android gift pack that sends B luck to a recipient.',
    },
  },
] as const;

const TEST_GIFT_PACKS = [
  {
    code: 'rose_small_ios',
    sku: 'reward.ios.gift-pack.rose',
    rewardAssetCode: 'B_LUCK',
    rewardAmount: '18.00',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      title: 'Rose small',
    },
  },
  {
    code: 'rose_small_android',
    sku: 'reward.android.gift-pack.rose',
    rewardAssetCode: 'B_LUCK',
    rewardAmount: '18.00',
    metadata: {
      seedSource: 'manual_iap_catalog',
      sandbox: true,
      title: 'Rose small',
    },
  },
] as const;

const main = async () => {
  const upserted = [] as Array<{
    sku: string;
    storeChannel: string;
    assetAmount: string | null;
  }>;

  for (const product of TEST_IAP_PRODUCTS) {
    const [row] = await db
      .insert(iapProducts)
      .values({
        sku: product.sku,
        storeChannel: product.storeChannel,
        deliveryType: product.deliveryType,
        assetCode: product.assetCode,
        assetAmount: product.assetAmount,
        isActive: true,
        metadata: product.metadata,
      })
      .onConflictDoUpdate({
        target: [iapProducts.sku, iapProducts.storeChannel],
        set: {
          deliveryType: product.deliveryType,
          assetCode: product.assetCode,
          assetAmount: product.assetAmount,
          isActive: true,
          metadata: product.metadata,
          updatedAt: new Date(),
        },
      })
      .returning({
        sku: iapProducts.sku,
        storeChannel: iapProducts.storeChannel,
        assetAmount: iapProducts.assetAmount,
      });

    upserted.push({
      sku: row.sku,
      storeChannel: row.storeChannel,
      assetAmount: row.assetAmount,
    });
  }

  const upsertedGiftPacks = [] as Array<{
    code: string;
    sku: string;
    rewardAmount: string | null;
  }>;

  for (const giftPack of TEST_GIFT_PACKS) {
    const [product] = await db
      .select({
        id: iapProducts.id,
      })
      .from(iapProducts)
      .where(eq(iapProducts.sku, giftPack.sku))
      .limit(1);

    if (!product) {
      throw new Error(`IAP product not found for gift pack seed: ${giftPack.sku}`);
    }

    const [row] = await db
      .insert(giftPackCatalog)
      .values({
        code: giftPack.code,
        iapProductId: product.id,
        rewardAssetCode: giftPack.rewardAssetCode,
        rewardAmount: giftPack.rewardAmount,
        isActive: true,
        metadata: giftPack.metadata,
      })
      .onConflictDoUpdate({
        target: giftPackCatalog.code,
        set: {
          iapProductId: product.id,
          rewardAssetCode: giftPack.rewardAssetCode,
          rewardAmount: giftPack.rewardAmount,
          isActive: true,
          metadata: giftPack.metadata,
          updatedAt: new Date(),
        },
      })
      .returning({
        code: giftPackCatalog.code,
        rewardAmount: giftPackCatalog.rewardAmount,
      });

    upsertedGiftPacks.push({
      code: row.code,
      sku: giftPack.sku,
      rewardAmount: row.rewardAmount,
    });
  }

  console.log('IAP product seed ensured.');
  console.log(
    JSON.stringify(
      {
        products: upserted,
        giftPacks: upsertedGiftPacks,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
