import { randomUUID } from 'node:crypto';

import { context } from './context';

export const TRACE_ID_HEADER = 'x-trace-id';

export const getTraceId = () => context().getStore()?.traceId;

export const setTraceId = (traceId: string) => {
  const store = context().getStore();
  if (store) {
    store.traceId = traceId;
  }
};

export const ensureTraceId = (incoming?: string | null) => {
  const traceId = incoming && incoming.length > 0 ? incoming : randomUUID();
  setTraceId(traceId);
  return traceId;
};
