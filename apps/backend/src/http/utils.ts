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
