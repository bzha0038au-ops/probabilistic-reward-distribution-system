import { Buffer } from 'node:buffer';

import type { VerifyIapPurchaseRequest } from '@reward/shared-types/economy';
import { SignJWT, importPKCS8 } from 'jose';

import { getConfig } from '../../shared/config';
import {
  serviceUnavailableError,
  unauthorizedError,
  unprocessableEntityError,
} from '../../shared/errors';

type GooglePurchaseRequest = Extract<
  VerifyIapPurchaseRequest,
  { storeChannel: 'android' }
>;

type GoogleProductPurchase = {
  acknowledgementState?: number;
  consumptionState?: number;
  developerPayload?: string;
  kind?: string;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
  orderId?: string;
  productId?: string;
  purchaseState?: number;
  purchaseTimeMillis?: string;
  purchaseToken?: string;
  purchaseType?: number;
  quantity?: number;
  refundableQuantity?: number;
  regionCode?: string;
};

type GooglePubSubEnvelope = {
  message?: {
    attributes?: Record<string, string>;
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

type GoogleRtdnPayload = {
  eventTimeMillis?: string;
  oneTimeProductNotification?: {
    notificationType?: number;
    purchaseToken?: string;
    sku?: string;
    version?: string;
  };
  packageName?: string;
  subscriptionNotification?: Record<string, unknown>;
  testNotification?: Record<string, unknown>;
  version?: string;
  voidedPurchaseNotification?: {
    orderId?: string;
    productType?: number;
    purchaseToken?: string;
    refundType?: number;
  };
};

export type VerifiedGooglePurchase = {
  externalOrderId: string | null;
  externalTransactionId: string | null;
  purchaseToken: string;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  storeState: 'purchased' | 'pending' | 'cancelled';
  needsAcknowledgement: boolean;
};

export type GoogleNotificationSnapshot = {
  notificationType: string | null;
  externalOrderId: string | null;
  externalTransactionId: string | null;
  purchaseToken: string | null;
  sku: string | null;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  storeState: 'purchased' | 'cancelled' | 'refunded' | null;
  needsAcknowledgement: boolean;
};

const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';
const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 60_000;

let cachedGoogleAccessToken:
  | {
      expiresAt: number;
      token: string;
    }
  | null = null;
let cachedGooglePrivateKeyPromise: Promise<CryptoKey> | null = null;

const readTrimmedString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const toRecord = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const normalizePem = (value: string) => value.replace(/\\n/g, '\n').trim();

const resolveGooglePlayPackageName = (override: string | null | undefined) =>
  readTrimmedString(override) ?? getConfig().googlePlayPackageName;

export const isGooglePlayVerificationConfigured = () => {
  const config = getConfig();

  return Boolean(
    readTrimmedString(config.googlePlayPackageName) &&
      readTrimmedString(config.googlePlayServiceAccountEmail) &&
      readTrimmedString(config.googlePlayServiceAccountPrivateKey)
  );
};

const ensureGooglePlayVerificationConfigured = () => {
  if (!isGooglePlayVerificationConfigured()) {
    throw serviceUnavailableError(
      'Google Play purchase verification is not configured.'
    );
  }
};

const importGooglePrivateKey = async () => {
  if (!cachedGooglePrivateKeyPromise) {
    const config = getConfig();
    cachedGooglePrivateKeyPromise = importPKCS8(
      normalizePem(config.googlePlayServiceAccountPrivateKey),
      'RS256'
    );
  }

  return cachedGooglePrivateKeyPromise;
};

const fetchJson = async <T>(
  input: string,
  init: RequestInit,
  options: {
    emptyResponse?: boolean;
  } = {}
): Promise<T> => {
  const response = await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw serviceUnavailableError('Google Play API request failed.', {
      details: bodyText ? [bodyText.slice(0, 500)] : undefined,
    });
  }

  if (options.emptyResponse) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

const getGoogleApiAccessToken = async () => {
  ensureGooglePlayVerificationConfigured();

  if (
    cachedGoogleAccessToken &&
    cachedGoogleAccessToken.expiresAt - ACCESS_TOKEN_REFRESH_LEEWAY_MS >
      Date.now()
  ) {
    return cachedGoogleAccessToken.token;
  }

  const config = getConfig();
  const privateKey = await importGooglePrivateKey();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: ANDROID_PUBLISHER_SCOPE,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(config.googlePlayServiceAccountEmail)
    .setSubject(config.googlePlayServiceAccountEmail)
    .setAudience(config.googlePlayOauthTokenUrl)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 3600)
    .sign(privateKey);

  const body = new URLSearchParams({
    assertion,
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
  });
  const tokenResponse = await fetchJson<{
    access_token: string;
    expires_in: number;
  }>(config.googlePlayOauthTokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  cachedGoogleAccessToken = {
    token: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };

  return cachedGoogleAccessToken.token;
};

const fetchGoogleProductPurchase = async (params: {
  packageName: string;
  purchaseToken: string;
  sku: string;
}) => {
  const config = getConfig();
  const accessToken = await getGoogleApiAccessToken();
  const url = new URL(
    `/androidpublisher/v3/applications/${encodeURIComponent(
      params.packageName
    )}/purchases/products/${encodeURIComponent(
      params.sku
    )}/tokens/${encodeURIComponent(params.purchaseToken)}`,
    config.googlePlayApiBaseUrl
  );

  return fetchJson<GoogleProductPurchase>(url.toString(), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
};

export async function acknowledgeGooglePlayPurchase(params: {
  developerPayload: string;
  packageName?: string | null;
  purchaseToken: string;
  sku: string;
}) {
  ensureGooglePlayVerificationConfigured();

  const config = getConfig();
  const accessToken = await getGoogleApiAccessToken();
  const packageName = resolveGooglePlayPackageName(params.packageName);
  const url = new URL(
    `/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/purchases/products/${encodeURIComponent(
      params.sku
    )}/tokens/${encodeURIComponent(params.purchaseToken)}:acknowledge`,
    config.googlePlayApiBaseUrl
  );

  await fetchJson<void>(
    url.toString(),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        developerPayload: params.developerPayload,
      }),
    },
    { emptyResponse: true }
  );
}

const serializeVerifiedGooglePurchase = (
  purchase: GoogleProductPurchase,
  request: GooglePurchaseRequest
): VerifiedGooglePurchase => {
  const purchaseState = purchase.purchaseState ?? 0;
  let storeState: VerifiedGooglePurchase['storeState'] = 'purchased';

  if (purchaseState === 1) {
    storeState = 'cancelled';
  } else if (purchaseState === 2) {
    storeState = 'pending';
  }

  return {
    externalOrderId:
      readTrimmedString(purchase.orderId) ??
      readTrimmedString(request.receipt.orderId),
    externalTransactionId:
      readTrimmedString(request.receipt.externalTransactionId) ??
      readTrimmedString(purchase.orderId),
    purchaseToken: request.receipt.purchaseToken.trim(),
    rawPayload: {
      ...(request.receipt.rawPayload ?? {}),
      ...purchase,
      packageName:
        readTrimmedString(request.receipt.packageName) ??
        resolveGooglePlayPackageName(null),
    },
    metadata: {
      verificationMode: 'google_play_api',
      packageName:
        readTrimmedString(request.receipt.packageName) ??
        resolveGooglePlayPackageName(null),
      acknowledgementState:
        typeof purchase.acknowledgementState === 'number'
          ? purchase.acknowledgementState
          : null,
      purchaseState,
      purchaseType:
        typeof purchase.purchaseType === 'number' ? purchase.purchaseType : null,
      purchaseTimeMillis: readTrimmedString(purchase.purchaseTimeMillis),
      quantity: typeof purchase.quantity === 'number' ? purchase.quantity : null,
      refundableQuantity:
        typeof purchase.refundableQuantity === 'number'
          ? purchase.refundableQuantity
          : null,
      regionCode: readTrimmedString(purchase.regionCode),
      obfuscatedExternalAccountId: readTrimmedString(
        purchase.obfuscatedExternalAccountId
      ),
      obfuscatedExternalProfileId: readTrimmedString(
        purchase.obfuscatedExternalProfileId
      ),
    },
    storeState,
    needsAcknowledgement: purchase.acknowledgementState === 0,
  };
};

export async function verifyGooglePlayPurchase(
  request: GooglePurchaseRequest
): Promise<VerifiedGooglePurchase> {
  ensureGooglePlayVerificationConfigured();

  const packageName = resolveGooglePlayPackageName(request.receipt.packageName);
  const purchase = await fetchGoogleProductPurchase({
    packageName,
    purchaseToken: request.receipt.purchaseToken.trim(),
    sku: request.sku,
  });

  const productId = readTrimmedString(purchase.productId);
  if (productId && productId !== request.sku) {
    throw unprocessableEntityError('Receipt product SKU does not match.');
  }

  const token = readTrimmedString(purchase.purchaseToken);
  if (token && token !== request.receipt.purchaseToken.trim()) {
    throw unprocessableEntityError(
      'Receipt purchase token does not match Google Play payload.'
    );
  }

  return serializeVerifiedGooglePurchase(purchase, request);
}

export const assertGooglePlayNotificationAuthorized = (
  authorizationHeader: string | null | undefined
) => {
  const expected = readTrimmedString(getConfig().googlePlayRtdnBearerToken);
  if (!expected) {
    return;
  }

  if (authorizationHeader !== `Bearer ${expected}`) {
    throw unauthorizedError('Unauthorized Google Play notification.');
  }
};

const parseGooglePubSubEnvelope = (
  body: unknown
): { envelope: GooglePubSubEnvelope; payload: GoogleRtdnPayload } => {
  const envelope = toRecord(body) as GooglePubSubEnvelope | null;
  const encodedData = readTrimmedString(envelope?.message?.data);
  if (!envelope || !encodedData) {
    throw unprocessableEntityError('Invalid Google Play RTDN payload.');
  }

  let payload: GoogleRtdnPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedData, 'base64').toString('utf8')
    ) as GoogleRtdnPayload;
  } catch (error) {
    throw unprocessableEntityError('Invalid Google Play RTDN payload.', {
      cause: error,
    });
  }

  return { envelope, payload };
};

export async function processGooglePlayNotification(
  body: unknown
): Promise<GoogleNotificationSnapshot> {
  const { envelope, payload } = parseGooglePubSubEnvelope(body);

  if (payload.testNotification) {
    return {
      notificationType: 'TEST',
      externalOrderId: null,
      externalTransactionId: null,
      purchaseToken: null,
      sku: null,
      rawPayload: {
        envelope,
        payload,
      },
      metadata: {
        verificationMode: 'google_rtdn',
        packageName: readTrimmedString(payload.packageName),
        ignored: true,
      },
      storeState: null,
      needsAcknowledgement: false,
    };
  }

  if (payload.voidedPurchaseNotification) {
    const purchaseToken = readTrimmedString(
      payload.voidedPurchaseNotification.purchaseToken
    );

    return {
      notificationType: 'VOIDED_PURCHASE',
      externalOrderId: readTrimmedString(payload.voidedPurchaseNotification.orderId),
      externalTransactionId: readTrimmedString(
        payload.voidedPurchaseNotification.orderId
      ),
      purchaseToken,
      sku: null,
      rawPayload: {
        envelope,
        payload,
      },
      metadata: {
        verificationMode: 'google_rtdn',
        packageName: readTrimmedString(payload.packageName),
        refundType:
          typeof payload.voidedPurchaseNotification.refundType === 'number'
            ? payload.voidedPurchaseNotification.refundType
            : null,
        productType:
          typeof payload.voidedPurchaseNotification.productType === 'number'
            ? payload.voidedPurchaseNotification.productType
            : null,
      },
      storeState: 'refunded',
      needsAcknowledgement: false,
    };
  }

  const oneTime = payload.oneTimeProductNotification;
  if (!oneTime) {
    return {
      notificationType: null,
      externalOrderId: null,
      externalTransactionId: null,
      purchaseToken: null,
      sku: null,
      rawPayload: {
        envelope,
        payload,
      },
      metadata: {
        verificationMode: 'google_rtdn',
        packageName: readTrimmedString(payload.packageName),
        ignored: true,
      },
      storeState: null,
      needsAcknowledgement: false,
    };
  }

  const purchaseToken = readTrimmedString(oneTime.purchaseToken);
  const sku = readTrimmedString(oneTime.sku);
  if (!purchaseToken || !sku) {
    throw unprocessableEntityError('Invalid Google one-time product notification.');
  }

  const notificationType = oneTime.notificationType;
  if (notificationType === 2) {
    return {
      notificationType: 'ONE_TIME_PRODUCT_CANCELED',
      externalOrderId: null,
      externalTransactionId: null,
      purchaseToken,
      sku,
      rawPayload: {
        envelope,
        payload,
      },
      metadata: {
        verificationMode: 'google_rtdn',
        packageName: readTrimmedString(payload.packageName),
        notificationType,
      },
      storeState: 'cancelled',
      needsAcknowledgement: false,
    };
  }

  if (!isGooglePlayVerificationConfigured()) {
    return {
      notificationType: 'ONE_TIME_PRODUCT_PURCHASED',
      externalOrderId: null,
      externalTransactionId: null,
      purchaseToken,
      sku,
      rawPayload: {
        envelope,
        payload,
      },
      metadata: {
        verificationMode: 'google_rtdn',
        packageName: readTrimmedString(payload.packageName),
        notificationType,
      },
      storeState: 'purchased',
      needsAcknowledgement: false,
    };
  }

  const purchase = await fetchGoogleProductPurchase({
    packageName: resolveGooglePlayPackageName(payload.packageName),
    purchaseToken,
    sku,
  });
  const serialized = serializeVerifiedGooglePurchase(purchase, {
    idempotencyKey: 'google-rtdn',
    receipt: {
      packageName: readTrimmedString(payload.packageName) ?? undefined,
      purchaseToken,
    },
    sku,
    storeChannel: 'android',
  });

  return {
    notificationType: 'ONE_TIME_PRODUCT_PURCHASED',
    externalOrderId: serialized.externalOrderId,
    externalTransactionId: serialized.externalTransactionId,
    purchaseToken: serialized.purchaseToken,
    sku,
    rawPayload: {
      envelope,
      payload,
      purchase,
    },
    metadata: {
      ...serialized.metadata,
      verificationMode: 'google_rtdn',
      notificationType,
    },
    storeState:
      serialized.storeState === 'pending'
        ? 'cancelled'
        : serialized.storeState === 'cancelled'
          ? 'cancelled'
          : 'purchased',
    needsAcknowledgement: serialized.needsAcknowledgement,
  };
}
