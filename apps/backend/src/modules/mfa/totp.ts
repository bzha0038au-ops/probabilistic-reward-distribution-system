import { createHmac, randomBytes } from "node:crypto";

import { internalInvariantError } from "../../shared/errors";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;
const TOTP_ALLOWED_WINDOW = 1;

const encodeBase32 = (value: Uint8Array) => {
  let bits = 0;
  let accumulator = 0;
  let encoded = "";

  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(accumulator >> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  }

  return encoded;
};

const decodeBase32 = (value: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw internalInvariantError("Invalid base32 secret.");
    }

    accumulator = (accumulator << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((accumulator >> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const generateHotpCode = (secret: string, counter: bigint) => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
};

export const normalizeTotpCode = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, "").trim() ?? "";
  return /^\d{6}$/.test(normalized) ? normalized : null;
};

export const createTotpSecret = (byteLength = 20) =>
  encodeBase32(randomBytes(byteLength));

export const generateTotpCode = (secret: string, now = Date.now()) => {
  const counter = BigInt(Math.floor(now / TOTP_PERIOD_MS));
  return generateHotpCode(secret, counter);
};

export const verifyTotpCode = (
  secret: string,
  code: string,
  now = Date.now(),
) => {
  const normalizedCode = normalizeTotpCode(code);
  if (!normalizedCode) {
    return false;
  }

  const counter = BigInt(Math.floor(now / TOTP_PERIOD_MS));
  for (
    let offset = -TOTP_ALLOWED_WINDOW;
    offset <= TOTP_ALLOWED_WINDOW;
    offset += 1
  ) {
    const currentCounter = counter + BigInt(offset);
    if (currentCounter < 0) {
      continue;
    }

    if (generateHotpCode(secret, currentCounter) === normalizedCode) {
      return true;
    }
  }

  return false;
};

export const buildTotpOtpAuthUrl = (payload: {
  issuer: string;
  accountName: string;
  secret: string;
}) => {
  const label = `${payload.issuer}:${payload.accountName}`;
  const params = new URLSearchParams({
    secret: payload.secret,
    issuer: payload.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
};
