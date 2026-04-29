import { Buffer } from 'node:buffer';

import {
  AppStoreServerAPIClient,
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import type { VerifyIapPurchaseRequest } from '@reward/shared-types/economy';

import { getConfig } from '../../shared/config';
import { serviceUnavailableError, unprocessableEntityError } from '../../shared/errors';

type AppleStoreEnvironment = 'sandbox' | 'production';
type ApplePurchaseRequest = Extract<
  VerifyIapPurchaseRequest,
  { storeChannel: 'ios' }
>;

export type VerifiedApplePurchase = {
  externalOrderId: string | null;
  externalTransactionId: string | null;
  purchaseToken: null;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  storeState: 'purchased' | 'revoked';
};

export type AppleNotificationSnapshot = {
  notificationType: string | null;
  notificationSubtype: string | null;
  externalOrderId: string | null;
  externalTransactionId: string | null;
  purchaseToken: null;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  storeState: 'purchased' | 'refunded' | 'revoked' | null;
};

let productionClient: AppStoreServerAPIClient | null = null;
let sandboxClient: AppStoreServerAPIClient | null = null;
let productionVerifier: SignedDataVerifier | null = null;
let sandboxVerifier: SignedDataVerifier | null = null;

const PEM_BLOCK_PATTERN =
  /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

const readTrimmedString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const toRecord = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

const normalizePem = (value: string) => value.replace(/\\n/g, '\n').trim();

const decodeJwtPayload = (value: string) => {
  const segments = value.split('.');
  if (segments.length < 2) {
    return null;
  }

  try {
    const decoded = Buffer.from(segments[1]!, 'base64url').toString('utf8');
    return toRecord(JSON.parse(decoded) as unknown);
  } catch {
    return null;
  }
};

const normalizeAppleEnvironment = (
  value: string | null | undefined,
  fallback: AppleStoreEnvironment
): AppleStoreEnvironment => {
  if (value === Environment.SANDBOX) {
    return 'sandbox';
  }

  if (value === Environment.PRODUCTION) {
    return 'production';
  }

  return fallback;
};

const toAppleLibraryEnvironment = (value: AppleStoreEnvironment) =>
  value === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;

const parseRootCertificates = () => {
  const config = getConfig();
  const pemBundle = normalizePem(config.appleIapRootCertificatesPem);
  const blocks = pemBundle.match(PEM_BLOCK_PATTERN) ?? [];

  if (blocks.length === 0) {
    throw serviceUnavailableError(
      'Apple IAP root certificates are not configured.'
    );
  }

  return blocks.map((block) =>
    Buffer.from(
      block
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s+/g, ''),
      'base64'
    )
  );
};

export const isAppleIapVerificationConfigured = () => {
  const config = getConfig();

  return Boolean(
    readTrimmedString(config.appleIapBundleId) &&
      readTrimmedString(config.appleIapIssuerId) &&
      readTrimmedString(config.appleIapKeyId) &&
      readTrimmedString(config.appleIapPrivateKey) &&
      readTrimmedString(config.appleIapRootCertificatesPem)
  );
};

const getAppleApiClient = (environment: AppleStoreEnvironment) => {
  const config = getConfig();

  if (!isAppleIapVerificationConfigured()) {
    throw serviceUnavailableError('Apple IAP verification is not configured.');
  }

  const sharedArgs = [
    normalizePem(config.appleIapPrivateKey),
    config.appleIapKeyId,
    config.appleIapIssuerId,
    config.appleIapBundleId,
  ] as const;

  if (environment === 'sandbox') {
    sandboxClient ??= new AppStoreServerAPIClient(
      ...sharedArgs,
      Environment.SANDBOX
    );
    return sandboxClient;
  }

  productionClient ??= new AppStoreServerAPIClient(
    ...sharedArgs,
    Environment.PRODUCTION
  );
  return productionClient;
};

const getAppleSignedDataVerifier = (environment: AppleStoreEnvironment) => {
  const config = getConfig();

  if (!isAppleIapVerificationConfigured()) {
    throw serviceUnavailableError('Apple IAP verification is not configured.');
  }

  const verifierArgs = [
    parseRootCertificates(),
    config.appleIapEnableOnlineChecks,
    toAppleLibraryEnvironment(environment),
    config.appleIapBundleId,
    environment === 'production' && config.appleIapAppAppleId > 0
      ? config.appleIapAppAppleId
      : undefined,
  ] as const;

  if (environment === 'sandbox') {
    sandboxVerifier ??= new SignedDataVerifier(...verifierArgs);
    return sandboxVerifier;
  }

  productionVerifier ??= new SignedDataVerifier(...verifierArgs);
  return productionVerifier;
};

const resolveRequestEnvironment = (
  request: ApplePurchaseRequest
): AppleStoreEnvironment => {
  const config = getConfig();
  const defaultEnvironment = config.appleIapDefaultEnvironment;
  const unverifiedPayload = request.receipt.signedTransactionInfo
    ? decodeJwtPayload(request.receipt.signedTransactionInfo)
    : null;

  return normalizeAppleEnvironment(
    readTrimmedString(unverifiedPayload?.environment) ??
      readTrimmedString(request.receipt.rawPayload?.environment),
    defaultEnvironment
  );
};

const resolveNotificationEnvironment = (signedPayload: string) => {
  const config = getConfig();
  const unverifiedPayload = decodeJwtPayload(signedPayload);
  const data = toRecord(unverifiedPayload?.data);

  return normalizeAppleEnvironment(
    readTrimmedString(data?.environment),
    config.appleIapDefaultEnvironment
  );
};

const verifyAppleTransaction = async (
  request: ApplePurchaseRequest
): Promise<{
  signedTransactionInfo: string;
  transaction: JWSTransactionDecodedPayload;
  environment: AppleStoreEnvironment;
}> => {
  const environment = resolveRequestEnvironment(request);
  const verifier = getAppleSignedDataVerifier(environment);

  if (request.receipt.signedTransactionInfo) {
    const transaction = await verifier.verifyAndDecodeTransaction(
      request.receipt.signedTransactionInfo
    );

    return {
      signedTransactionInfo: request.receipt.signedTransactionInfo,
      transaction,
      environment,
    };
  }

  const transactionId = readTrimmedString(request.receipt.externalTransactionId);
  if (!transactionId) {
    throw unprocessableEntityError(
      'iOS receipts require externalTransactionId or signedTransactionInfo.'
    );
  }

  const client = getAppleApiClient(environment);
  const response = await client.getTransactionInfo(transactionId);
  const signedTransactionInfo = readTrimmedString(response.signedTransactionInfo);
  if (!signedTransactionInfo) {
    throw serviceUnavailableError(
      'Apple transaction lookup returned no signed transaction payload.'
    );
  }

  const transaction = await verifier.verifyAndDecodeTransaction(
    signedTransactionInfo
  );

  return {
    signedTransactionInfo,
    transaction,
    environment,
  };
};

const serializeVerifiedAppleTransaction = (
  transaction: JWSTransactionDecodedPayload,
  environment: AppleStoreEnvironment,
  signedTransactionInfo: string,
  rawPayload: Record<string, unknown> | undefined
): VerifiedApplePurchase => ({
  externalOrderId: null,
  externalTransactionId: readTrimmedString(transaction.transactionId),
  purchaseToken: null,
  rawPayload: {
    ...(rawPayload ?? {}),
    signedTransactionInfo,
  },
  metadata: {
    verificationMode: 'apple_app_store_api',
    environment,
    originalTransactionId:
      readTrimmedString(transaction.originalTransactionId) ?? null,
    transactionReason: readTrimmedString(transaction.transactionReason),
    transactionType: readTrimmedString(transaction.type),
    appAccountToken: readTrimmedString(transaction.appAccountToken),
    appTransactionId: readTrimmedString(transaction.appTransactionId),
    revocationReason:
      typeof transaction.revocationReason === 'number'
        ? transaction.revocationReason
        : null,
    revocationType: readTrimmedString(transaction.revocationType),
  },
  storeState: transaction.revocationDate ? 'revoked' : 'purchased',
});

export async function verifyAppleStorePurchase(
  request: ApplePurchaseRequest
): Promise<VerifiedApplePurchase> {
  const verified = await verifyAppleTransaction(request);

  const productId = readTrimmedString(verified.transaction.productId);
  if (productId && productId !== request.sku) {
    throw unprocessableEntityError('Receipt product SKU does not match.');
  }

  if (
    request.receipt.externalTransactionId &&
    verified.transaction.transactionId &&
    request.receipt.externalTransactionId !== verified.transaction.transactionId
  ) {
    throw unprocessableEntityError(
      'Receipt external transaction id does not match Apple transaction payload.'
    );
  }

  return serializeVerifiedAppleTransaction(
    verified.transaction,
    verified.environment,
    verified.signedTransactionInfo,
    request.receipt.rawPayload
  );
}

export async function processAppleServerNotification(
  signedPayload: string
): Promise<AppleNotificationSnapshot> {
  const environment = resolveNotificationEnvironment(signedPayload);
  const verifier = getAppleSignedDataVerifier(environment);
  const notification = await verifier.verifyAndDecodeNotification(signedPayload);
  const transactionInfo = readTrimmedString(notification.data?.signedTransactionInfo);
  const notificationType = readTrimmedString(notification.notificationType);
  const notificationSubtype = readTrimmedString(notification.subtype);

  if (!transactionInfo) {
    return {
      notificationType,
      notificationSubtype,
      externalOrderId: null,
      externalTransactionId: null,
      purchaseToken: null,
      rawPayload: { signedPayload },
      metadata: {
        verificationMode: 'apple_server_notification',
        environment,
        notificationUUID: readTrimmedString(notification.notificationUUID),
        signedDate:
          typeof notification.signedDate === 'number'
            ? notification.signedDate
            : null,
        ignored: true,
      },
      storeState: notificationType === NotificationTypeV2.TEST ? null : null,
    };
  }

  const transaction = await verifier.verifyAndDecodeTransaction(transactionInfo);
  const base = serializeVerifiedAppleTransaction(
    transaction,
    environment,
    transactionInfo,
    {
      signedPayload,
    }
  );

  let storeState: AppleNotificationSnapshot['storeState'] = base.storeState;
  if (notificationType === NotificationTypeV2.REFUND) {
    storeState = 'refunded';
  } else if (notificationType === NotificationTypeV2.REVOKE) {
    storeState = 'revoked';
  }

  return {
    notificationType,
    notificationSubtype,
    externalOrderId: base.externalOrderId,
    externalTransactionId: base.externalTransactionId,
    purchaseToken: null,
    rawPayload: base.rawPayload,
    metadata: {
      ...base.metadata,
      verificationMode: 'apple_server_notification',
      notificationUUID: readTrimmedString(notification.notificationUUID),
      notificationType,
      notificationSubtype,
      signedDate:
        typeof notification.signedDate === 'number' ? notification.signedDate : null,
    },
    storeState,
  };
}
