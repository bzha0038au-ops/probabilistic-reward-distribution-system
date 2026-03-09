export const parseLimit = (value?: string | string[]) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const limit = Number(raw ?? 50);
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(limit, 1), 200);
};

export const toAmountString = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed.toFixed(2);
};
