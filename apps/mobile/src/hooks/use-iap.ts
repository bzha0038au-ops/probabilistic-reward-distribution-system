import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type {
  GiftPackCatalogItem,
  IapProductRecord,
  StoreChannel,
  GiftPackPurchaseCompleteRequest,
  VerifyIapPurchaseRequest,
} from "@reward/shared-types/economy";
import { createUserApiClient } from "@reward/user-core";
import {
  ErrorCode,
  endConnection,
  fetchProducts as fetchStoreProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type Purchase,
} from "expo-iap";

import { formatAmount, platform } from "../app-support";
import {
  clearPendingIapPurchaseContext,
  readPendingIapPurchaseContext,
  writePendingIapPurchaseContext,
} from "../iap-pending-storage";

type UnauthorizedHandler = (message: string) => Promise<boolean>;

type PurchaseSubmission =
  | {
      deliveryType: "voucher";
      request: VerifyIapPurchaseRequest;
    }
  | {
      deliveryType: "gift_pack";
      request: GiftPackPurchaseCompleteRequest;
    };

type IapApi = Pick<
  ReturnType<typeof createUserApiClient>,
  | "listGiftPackCatalog"
  | "listIapProducts"
  | "completeGiftPackPurchase"
  | "verifyIapPurchase"
>;

type UseIapOptions = {
  api: IapApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  refreshBalance: () => Promise<boolean>;
  resetFeedback: () => void;
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
  sessionToken: string | null;
  userId: number | null;
};

export type MobileIapCatalogItem = {
  kind: "voucher";
  catalogProduct: IapProductRecord;
  storeProduct: Product | null;
  title: string;
  description: string;
  displayPrice: string | null;
};

export type MobileGiftPackCatalogItem = {
  kind: "gift_pack";
  catalogItem: GiftPackCatalogItem;
  storeProduct: Product | null;
  title: string;
  description: string;
  displayPrice: string | null;
};

const supportedStoreChannel: StoreChannel | null =
  platform === "ios" ? "ios" : platform === "android" ? "android" : null;

const buildIdempotencyKey = (prefix: string, sku: string) =>
  `${prefix}:${platform}:${sku}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;

const trimString = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const nextValue = value.trim();
  return nextValue === "" ? null : nextValue;
};

const toMetadataRecord = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const toUnknownErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() !== ""
    ? error.message
    : fallback;

const toPurchaseSignature = (purchase: Purchase) =>
  trimString(purchase.purchaseToken) ??
  trimString(purchase.id) ??
  `${purchase.productId}:${purchase.transactionDate}`;

const isPurchasedState = (purchase: Purchase) =>
  purchase.purchaseState === "purchased";

const isManualApprovalPendingOrder = (value: {
  fulfillment: {
    amount: string;
    assetCode: string;
    replayed: boolean;
  } | null;
  order: {
    metadata?: Record<string, unknown> | null;
    status: string;
  };
}) => {
  const metadata = toMetadataRecord(value.order.metadata);

  return (
    value.order.status === "verified" &&
    value.fulfillment === null &&
    metadata?.manualApprovalRequired === true &&
    metadata?.manualApprovalState !== "approved"
  );
};

const buildCatalogItems = (
  catalogProducts: IapProductRecord[],
  storeProducts: Product[],
): MobileIapCatalogItem[] => {
  const storeProductsBySku = new Map(
    storeProducts.map((product) => [product.id, product] as const),
  );

  return catalogProducts.map((catalogProduct) => {
    const storeProduct = storeProductsBySku.get(catalogProduct.sku) ?? null;

    return {
      kind: "voucher",
      catalogProduct,
      storeProduct,
      title:
        trimString(storeProduct?.displayName ?? null) ??
        trimString(storeProduct?.title ?? null) ??
        catalogProduct.sku,
      description:
        trimString(storeProduct?.description ?? null) ??
        `SKU ${catalogProduct.sku}`,
      displayPrice: trimString(storeProduct?.displayPrice ?? null),
    };
  });
};

const buildGiftPackItems = (
  catalogItems: GiftPackCatalogItem[],
  storeProducts: Product[],
): MobileGiftPackCatalogItem[] => {
  const storeProductsBySku = new Map(
    storeProducts.map((product) => [product.id, product] as const),
  );

  return catalogItems.map((catalogItem) => {
    const storeProduct = storeProductsBySku.get(catalogItem.product.sku) ?? null;

    return {
      kind: "gift_pack",
      catalogItem,
      storeProduct,
      title:
        trimString(storeProduct?.displayName ?? null) ??
        trimString(storeProduct?.title ?? null) ??
        catalogItem.giftPack.code,
      description:
        trimString(storeProduct?.description ?? null) ??
        `Gift pack ${catalogItem.giftPack.code}`,
      displayPrice: trimString(storeProduct?.displayPrice ?? null),
    };
  });
};

export function useIap(options: UseIapOptions) {
  const {
    api,
    authTokenRef,
    handleUnauthorizedRef,
    refreshBalance,
    resetFeedback,
    setError,
    setMessage,
    sessionToken,
    userId,
  } = options;

  const [connected, setConnected] = useState(false);
  const [loadingIapProducts, setLoadingIapProducts] = useState(false);
  const [purchasingSku, setPurchasingSku] = useState<string | null>(null);
  const [syncingPendingPurchases, setSyncingPendingPurchases] = useState(false);
  const [iapProducts, setIapProducts] = useState<MobileIapCatalogItem[]>([]);
  const [giftPackProducts, setGiftPackProducts] = useState<
    MobileGiftPackCatalogItem[]
  >([]);

  const connectedRef = useRef(false);
  const processingPurchasesRef = useRef(new Set<string>());
  const pendingPurchaseRequestRef = useRef<{
    sku: string;
    idempotencyKey: string;
    deliveryType: "voucher" | "gift_pack";
    recipientUserId: number | null;
  } | null>(null);

  const resetIap = useCallback(() => {
    pendingPurchaseRequestRef.current = null;
    setPurchasingSku(null);
    setLoadingIapProducts(false);
    setSyncingPendingPurchases(false);
    setIapProducts([]);
    setGiftPackProducts([]);
    void clearPendingIapPurchaseContext();
  }, []);

  const handleUnauthorized = useCallback(async () => {
    const onUnauthorized = handleUnauthorizedRef.current;
    if (onUnauthorized) {
      await onUnauthorized("Session expired or was revoked. Sign in again.");
    }
  }, [handleUnauthorizedRef]);

  const refreshIapProducts = useCallback(async () => {
    if (!supportedStoreChannel || !sessionToken) {
      setIapProducts([]);
      setGiftPackProducts([]);
      return false;
    }

    setLoadingIapProducts(true);
    const [catalogResponse, giftPackCatalogResponse] = await Promise.all([
      api.listIapProducts({
        storeChannel: supportedStoreChannel,
        deliveryType: "voucher",
      }),
      api.listGiftPackCatalog({
        storeChannel: supportedStoreChannel,
      }),
    ]);

    if (!catalogResponse.ok || !giftPackCatalogResponse.ok) {
      setLoadingIapProducts(false);

      const unauthorizedResponse = [catalogResponse, giftPackCatalogResponse].find(
        (response) => response.status === 401,
      );
      if (unauthorizedResponse) {
        await handleUnauthorized();
        return false;
      }

      setError(
        !catalogResponse.ok
          ? catalogResponse.error.message
          : !giftPackCatalogResponse.ok
            ? giftPackCatalogResponse.error.message
            : "Failed to load store products.",
      );
      return false;
    }

    let storeProducts: Product[] = [];
    const skus = [
      ...catalogResponse.data.map((product) => product.sku),
      ...giftPackCatalogResponse.data.map((item) => item.product.sku),
    ];

    if (connectedRef.current && skus.length > 0) {
      try {
        const fetchedProducts = await fetchStoreProducts({
          skus,
          type: "in-app",
        });
        storeProducts = (fetchedProducts ?? []).filter(
          (product): product is Product => product.type === "in-app",
        );
      } catch (error) {
        setError(
          toUnknownErrorMessage(
            error,
            "Store connection is available, but product metadata could not be loaded.",
          ),
        );
      }
    }

    setIapProducts(buildCatalogItems(catalogResponse.data, storeProducts));
    setGiftPackProducts(
      buildGiftPackItems(giftPackCatalogResponse.data, storeProducts),
    );
    setLoadingIapProducts(false);
    return true;
  }, [api, handleUnauthorized, sessionToken, setError]);

  const buildVerifyPurchaseRequest = useCallback(
    (
      purchase: Purchase,
    ): PurchaseSubmission | null => {
      const requestContext = pendingPurchaseRequestRef.current;
      const idempotencyKey =
        requestContext?.sku === purchase.productId
          ? requestContext.idempotencyKey
          : buildIdempotencyKey("iap-verify", purchase.productId);
      const recipientUserId =
        requestContext?.sku === purchase.productId
          ? requestContext.recipientUserId
          : null;

      if (supportedStoreChannel === "ios") {
        const requestBase: Extract<
          VerifyIapPurchaseRequest,
          { storeChannel: "ios" }
        > = {
          idempotencyKey,
          storeChannel: "ios",
          sku: purchase.productId,
          receipt: {
            externalTransactionId: trimString(purchase.id) ?? undefined,
            originalTransactionId:
              "originalTransactionIdentifierIOS" in purchase
                ? trimString(purchase.originalTransactionIdentifierIOS) ??
                  undefined
                : undefined,
            signedTransactionInfo:
              trimString(purchase.purchaseToken) ?? undefined,
            rawPayload: {
              productId: purchase.productId,
              purchaseState: purchase.purchaseState,
              transactionDate: purchase.transactionDate,
              quantity: purchase.quantity,
              environmentIOS:
                "environmentIOS" in purchase
                  ? trimString(purchase.environmentIOS) ?? null
                  : null,
            },
          },
        };

        return requestContext?.deliveryType === "gift_pack"
          ? {
              deliveryType: "gift_pack",
              request: {
                ...requestBase,
                recipientUserId: recipientUserId ?? 0,
              },
            }
          : {
              deliveryType: "voucher",
              request: requestBase,
            };
      }

      const purchaseToken = trimString(purchase.purchaseToken);
      if (!purchaseToken) {
        setError("Google Play purchase token is missing.");
        return null;
      }

      const requestBase: Extract<
        VerifyIapPurchaseRequest,
        { storeChannel: "android" }
      > = {
        idempotencyKey,
        storeChannel: "android",
        sku: purchase.productId,
        receipt: {
          purchaseToken,
          externalTransactionId:
            "transactionId" in purchase
              ? trimString(purchase.transactionId) ?? undefined
              : undefined,
          orderId: trimString(purchase.id) ?? undefined,
          packageName:
            "packageNameAndroid" in purchase
              ? trimString(purchase.packageNameAndroid) ?? undefined
              : undefined,
          rawPayload: {
            productId: purchase.productId,
            purchaseState: purchase.purchaseState,
            transactionDate: purchase.transactionDate,
            quantity: purchase.quantity,
            dataAndroid:
              "dataAndroid" in purchase
                ? trimString(purchase.dataAndroid) ?? null
                : null,
            signatureAndroid:
              "signatureAndroid" in purchase
                ? trimString(purchase.signatureAndroid) ?? null
                : null,
          },
        },
      };

      return requestContext?.deliveryType === "gift_pack"
        ? {
            deliveryType: "gift_pack",
            request: {
              ...requestBase,
              recipientUserId: recipientUserId ?? 0,
            },
          }
        : {
            deliveryType: "voucher",
            request: requestBase,
          };
    },
    [setError],
  );

  const processPurchase = useCallback(
    async (purchase: Purchase) => {
      if (!isPurchasedState(purchase) || !supportedStoreChannel) {
        return false;
      }

      const purchaseSignature = toPurchaseSignature(purchase);
      if (processingPurchasesRef.current.has(purchaseSignature)) {
        return false;
      }

      if (!authTokenRef.current) {
        setError("Sign in before completing store purchases.");
        return false;
      }

      processingPurchasesRef.current.add(purchaseSignature);

      try {
        const submission = buildVerifyPurchaseRequest(purchase);
        if (!submission) {
          return false;
        }

        if (
          submission.deliveryType === "gift_pack" &&
          (!submission.request.recipientUserId ||
            submission.request.recipientUserId <= 0)
        ) {
          setError(
            "Pending gift pack purchase is missing the original recipient. Start the purchase again.",
          );
          return false;
        }

        const response =
          submission.deliveryType === "gift_pack"
            ? await api.completeGiftPackPurchase(submission.request)
            : await api.verifyIapPurchase(submission.request);
        if (!response.ok) {
          if (response.status === 401) {
            await handleUnauthorized();
            return false;
          }

          setError(
            response.error?.message ??
              "Purchase verification failed. Pending store transactions were kept for retry.",
          );
          return false;
        }

        let finishFailed = false;
        try {
          await finishTransaction({
            purchase,
            isConsumable: true,
          });
        } catch (error) {
          finishFailed = true;
          console.warn("[iap] finishTransaction failed", error);
        }

        if (pendingPurchaseRequestRef.current?.sku === purchase.productId) {
          pendingPurchaseRequestRef.current = null;
          await clearPendingIapPurchaseContext();
        }
        setPurchasingSku(null);
        await refreshBalance();

        const deliveredAmount =
          response.data.fulfillment?.amount ?? response.data.product.assetAmount;
        const awaitingManualApproval = isManualApprovalPendingOrder(
          response.data,
        );
        setMessage(
          awaitingManualApproval
            ? finishFailed
              ? response.data.product.deliveryType === "gift_pack"
                ? "Gift pack purchase submitted and is pending manual approval. Store acknowledgement is still pending; use sync pending purchases if the transaction reappears."
                : "Voucher purchase submitted and is pending manual approval. Store acknowledgement is still pending; use sync pending purchases if the transaction reappears."
              : response.data.product.deliveryType === "gift_pack"
                ? "Gift pack purchase submitted and is pending manual approval."
                : "Voucher purchase submitted and is pending manual approval."
            : finishFailed
              ? response.data.product.deliveryType === "gift_pack"
                ? "Gift pack delivered. Store acknowledgement is still pending; use sync pending purchases if the transaction reappears."
                : "Voucher delivered. Store acknowledgement is still pending; use sync pending purchases if the transaction reappears."
              : deliveredAmount
                ? response.data.product.deliveryType === "gift_pack"
                  ? `Gift pack delivered: +${formatAmount(deliveredAmount)}.`
                  : `Voucher delivered: +${formatAmount(deliveredAmount)}.`
                : "Store purchase delivered.",
        );
        return true;
      } finally {
        processingPurchasesRef.current.delete(purchaseSignature);
      }
    },
    [
      api,
      authTokenRef,
      buildVerifyPurchaseRequest,
      handleUnauthorized,
      refreshBalance,
      setError,
      setMessage,
    ],
  );

  const syncPendingStorePurchases = useCallback(async () => {
    if (!supportedStoreChannel || !connectedRef.current || !sessionToken) {
      return false;
    }

    setSyncingPendingPurchases(true);
    try {
      const pendingPurchases = await getAvailablePurchases({
        alsoPublishToEventListenerIOS: false,
        onlyIncludeActiveItemsIOS: false,
      });

      for (const purchase of pendingPurchases) {
        if (!isPurchasedState(purchase)) {
          continue;
        }

        await processPurchase(purchase);
      }

      return true;
    } catch (error) {
      setError(
        toUnknownErrorMessage(
          error,
          "Failed to sync pending store purchases.",
        ),
      );
      return false;
    } finally {
      setSyncingPendingPurchases(false);
    }
  }, [processPurchase, sessionToken, setError]);

  const purchaseVoucher = useCallback(
    async (sku: string) => {
      if (!supportedStoreChannel || !sessionToken) {
        return false;
      }

      if (!connectedRef.current) {
        setError("Store connection is not ready yet.");
        return false;
      }

      resetFeedback();
      const idempotencyKey = buildIdempotencyKey("iap-purchase", sku);
      pendingPurchaseRequestRef.current = {
        sku,
        idempotencyKey,
        deliveryType: "voucher",
        recipientUserId: null,
      };
      await writePendingIapPurchaseContext({
        sku,
        idempotencyKey,
        deliveryType: "voucher",
        recipientUserId: null,
      });
      setPurchasingSku(sku);

      try {
        await requestPurchase({
          request: {
            apple: {
              sku,
            },
            google: {
              skus: [sku],
              obfuscatedAccountId: userId ? String(userId) : undefined,
            },
          },
          type: "in-app",
        });
        return true;
      } catch (error) {
        pendingPurchaseRequestRef.current = null;
        await clearPendingIapPurchaseContext();
        setPurchasingSku(null);

        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === ErrorCode.UserCancelled
        ) {
          return false;
        }

        setError(
          toUnknownErrorMessage(error, "Failed to start the store purchase."),
        );
        return false;
      }
    },
    [resetFeedback, sessionToken, setError, userId],
  );

  const purchaseGiftPack = useCallback(
    async (sku: string, recipientUserId: number) => {
      if (!supportedStoreChannel || !sessionToken) {
        return false;
      }

      if (!connectedRef.current) {
        setError("Store connection is not ready yet.");
        return false;
      }

      if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
        setError("Enter a valid recipient user ID before purchasing a gift pack.");
        return false;
      }

      resetFeedback();
      const idempotencyKey = buildIdempotencyKey("gift-pack-purchase", sku);
      pendingPurchaseRequestRef.current = {
        sku,
        idempotencyKey,
        deliveryType: "gift_pack",
        recipientUserId,
      };
      await writePendingIapPurchaseContext({
        sku,
        idempotencyKey,
        deliveryType: "gift_pack",
        recipientUserId,
      });
      setPurchasingSku(sku);

      try {
        await requestPurchase({
          request: {
            apple: {
              sku,
            },
            google: {
              skus: [sku],
              obfuscatedAccountId: userId ? String(userId) : undefined,
            },
          },
          type: "in-app",
        });
        return true;
      } catch (error) {
        pendingPurchaseRequestRef.current = null;
        await clearPendingIapPurchaseContext();
        setPurchasingSku(null);

        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === ErrorCode.UserCancelled
        ) {
          return false;
        }

        setError(
          toUnknownErrorMessage(error, "Failed to start the gift pack purchase."),
        );
        return false;
      }
    },
    [resetFeedback, sessionToken, setError, userId],
  );

  useEffect(() => {
    if (!supportedStoreChannel) {
      return;
    }

    let mounted = true;
    const purchaseSubscription = purchaseUpdatedListener((purchase) => {
      void processPurchase(purchase);
    });
    const errorSubscription = purchaseErrorListener((error) => {
      if (pendingPurchaseRequestRef.current?.sku === error.productId) {
        pendingPurchaseRequestRef.current = null;
        void clearPendingIapPurchaseContext();
      }
      setPurchasingSku(null);

      if (error.code === ErrorCode.UserCancelled) {
        return;
      }

      setError(error.message || "Store purchase failed.");
    });

    void initConnection()
      .then(() => {
        if (!mounted) {
          return;
        }

        connectedRef.current = true;
        setConnected(true);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        connectedRef.current = false;
        setConnected(false);
        setError(
          toUnknownErrorMessage(error, "Store connection is unavailable."),
        );
      });

    return () => {
      mounted = false;
      purchaseSubscription.remove();
      errorSubscription.remove();
      connectedRef.current = false;
      setConnected(false);
      void endConnection().catch(() => undefined);
    };
  }, [processPurchase, setError]);

  useEffect(() => {
    if (!sessionToken) {
      pendingPurchaseRequestRef.current = null;
      void clearPendingIapPurchaseContext();
      return;
    }

    void readPendingIapPurchaseContext().then((stored) => {
      pendingPurchaseRequestRef.current = stored
        ? {
            sku: stored.sku,
            idempotencyKey: stored.idempotencyKey,
            deliveryType: stored.deliveryType,
            recipientUserId: stored.recipientUserId,
          }
        : null;
    });
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      resetIap();
      return;
    }

    if (!connected) {
      return;
    }

    void refreshIapProducts();
    void syncPendingStorePurchases();
  }, [
    connected,
    refreshIapProducts,
    resetIap,
    sessionToken,
    syncPendingStorePurchases,
  ]);

  return {
    connected,
    giftPackProducts,
    iapProducts,
    loadingIapProducts,
    purchaseGiftPack,
    purchasingSku,
    refreshIapProducts,
    resetIap,
    storeChannel: supportedStoreChannel,
    supported: supportedStoreChannel !== null,
    syncPendingStorePurchases,
    syncingPendingPurchases,
    purchaseVoucher,
  };
}
