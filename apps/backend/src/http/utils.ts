import { toDecimal, toMoneyString } from '../shared/money';

export const parseLimit = (value?: string | string[]) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const limit = Number(raw ?? 50);
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
};

export const toAmountString = (value: unknown) => {
  try {
    const normalized =
      typeof value === 'string' || typeof value === 'number' ? value : 0;
    const parsed = toDecimal(normalized);
    if (!parsed.isFinite() || parsed.lte(0)) return null;
    return toMoneyString(parsed);
  } catch {
    return null;
  }
};

export const toObject = (value: unknown) => {
  if (typeof value !== 'object' || value === null) {
    return {} as Record<string, unknown>;
  }

  return Object.fromEntries(Object.entries(value));
};

export const readStringValue = (source: unknown, key: string) => {
  const value = Reflect.get(toObject(source), key);
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return undefined;
  return String(value);
};

export const parsePositiveInt = (source: unknown, key: string) => {
  const raw = readStringValue(source, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const readHeaderValue = (
  headers: Record<string, unknown>,
  key: string
) => {
  const value = headers[key.toLowerCase()];
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

export const readRecordValue = (source: unknown, key: string) => {
  const value = Reflect.get(toObject(source), key);
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return Object.fromEntries(Object.entries(value));
};
