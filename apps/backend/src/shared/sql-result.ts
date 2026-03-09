export const readSqlRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (typeof result !== 'object' || result === null) {
    return [];
  }

  const rows = Reflect.get(result, 'rows');
  return Array.isArray(rows) ? (rows as T[]) : [];
};
