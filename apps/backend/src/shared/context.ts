import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId?: string;
  userId?: number;
  role?: 'user' | 'admin';
  locale?: 'en' | 'zh-CN';
};

let currentContext: AsyncLocalStorage<RequestContext> | undefined;

export function context() {
  if (!currentContext) {
    currentContext = new AsyncLocalStorage<RequestContext>();
  }

  return currentContext;
}
